"use server";

import { getStockIssueDetailAction, type StockIssueItem, type StockIssueRecord } from "@/app/actions/stock-issues";
import { validateStockIssueReportFilters, type StockIssueReportFilters } from "@/lib/stock-issue-report";
import { createClient } from "@/utils/supabase/server";

export type StockIssueReportOption = { id: number; name: string };
export type StockIssueReportRow = {
  group_id: number;
  stock_issue_id?: number;
  code: string;
  name: string;
  department_name?: string;
  work_point?: string;
  warehouse_name?: string;
  document_date?: string;
  status?: "posted" | "cancelled";
  unit_name?: string;
  issue_count?: number;
  item_count: number;
  quantity_total: number;
  amount_total: number | null;
  latest_date?: string;
  latest_requester?: string;
};
export type StockIssueReportResult = {
  rows: StockIssueReportRow[];
  total: number;
  canViewCost: boolean;
  summary: { document_count: number; item_count: number; quantity_total: number; amount_total: number | null; group_count: number };
  options: { warehouses: StockIssueReportOption[]; departments: StockIssueReportOption[] };
};
export type StockIssueReportDetailEntry = {
  issue_id: number; issue_number: string; document_date: string; requester_name: string;
  department_name: string; work_point: string; warehouse_name: string; status: "posted" | "cancelled";
  item_code: string; item_name: string; unit_name: string; quantity: number; amount: number | null;
};
export type StockIssueGroupDetail = {
  view: "product" | "department";
  identity: { id: number; code: string; name: string; meta: string } | null;
  summary: { document_count: number; item_count: number; quantity_total: number; amount_total: number | null };
  entries: StockIssueReportDetailEntry[];
  can_view_cost: boolean;
};
export type StockIssueDocumentDetail = { header: StockIssueRecord; items: StockIssueItem[]; canViewCost: boolean };

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
const asRpc = (rpc: unknown) => rpc as (name: string, args: Record<string, unknown>) => Promise<RpcResult>;

export async function getStockIssueReportAction(filters: StockIssueReportFilters): Promise<{ data?: StockIssueReportResult; error?: string }> {
  const validationError = validateStockIssueReportFilters(filters);
  if (validationError) return { error: validationError };
  const supabase = await createClient();
  const { data, error } = await asRpc(supabase.rpc.bind(supabase))("get_stock_issue_report", {
    p_view: filters.view, p_start_date: filters.startDate, p_end_date: filters.endDate,
    p_warehouse_id: filters.warehouseId || null, p_department_id: filters.departmentId || null,
    p_status: filters.status && filters.status !== "all" ? filters.status : null,
    p_search: filters.search?.trim().slice(0, 100) || null, p_page: filters.page, p_page_size: filters.pageSize,
  });
  if (error) {
    console.error("get_stock_issue_report failed", { code: error.code, message: error.message });
    return { error: error.code === "42501" ? "ไม่มีสิทธิ์ดูรายงานการเบิกจ่ายสินค้า" : "ไม่สามารถโหลดรายงานได้" };
  }
  const value = (data ?? {}) as Record<string, unknown>;
  const summary = (value.summary ?? {}) as Record<string, unknown>;
  const options = (value.options ?? {}) as Record<string, unknown>;
  return { data: {
    rows: Array.isArray(value.rows) ? value.rows as StockIssueReportRow[] : [],
    total: Number(value.total ?? 0), canViewCost: Boolean(value.can_view_cost),
    summary: { document_count: Number(summary.document_count ?? 0), item_count: Number(summary.item_count ?? 0), quantity_total: Number(summary.quantity_total ?? 0), amount_total: summary.amount_total === null || summary.amount_total === undefined ? null : Number(summary.amount_total), group_count: Number(summary.group_count ?? 0) },
    options: { warehouses: Array.isArray(options.warehouses) ? options.warehouses as StockIssueReportOption[] : [], departments: Array.isArray(options.departments) ? options.departments as StockIssueReportOption[] : [] },
  } };
}

export async function getStockIssueReportDetailAction(input: StockIssueReportFilters & { groupId: number }): Promise<{ data?: StockIssueDocumentDetail | StockIssueGroupDetail; error?: string }> {
  if (!Number.isSafeInteger(input.groupId) || input.groupId <= 0 || validateStockIssueReportFilters(input)) return { error: "ข้อมูลรายละเอียดไม่ถูกต้อง" };
  if (input.view === "document") {
    const result = await getStockIssueDetailAction(input.groupId);
    return "data" in result && result.data ? { data: { header: result.data.header, items: result.data.items, canViewCost: result.data.canViewCost } } : { error: result.error };
  }
  const supabase = await createClient();
  const { data, error } = await asRpc(supabase.rpc.bind(supabase))("get_stock_issue_report_detail", {
    p_view: input.view, p_group_id: input.groupId, p_start_date: input.startDate, p_end_date: input.endDate,
    p_warehouse_id: input.warehouseId || null, p_department_id: input.departmentId || null,
    p_status: input.status && input.status !== "all" ? input.status : null,
    p_search: input.search?.trim().slice(0, 100) || null,
  });
  if (error) return { error: error.code === "42501" ? "ไม่มีสิทธิ์ดูรายละเอียดรายงาน" : "ไม่สามารถโหลดรายละเอียดได้" };
  return { data: data as StockIssueGroupDetail };
}
