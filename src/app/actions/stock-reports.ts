"use server";

import { createClient } from "@/utils/supabase/server";

export type StockReportFilters = {
  view: "summary" | "journal" | "card"; startDate: string; endDate: string;
  warehouseId?: number | null; itemTypeId?: number | null; movementKind?: string | null;
  search?: string; itemMasterId?: number | null; page: number; pageSize: number;
};
export type StockReportOption = { id: number; name: string };
export type StockSummaryRow = {
  item_master_id: number; item_code: string; item_name: string; warehouse_id: number; warehouse_name: string;
  unit_name: string; item_type_id: number; group_name: string; opening: number; received: number;
  issued: number; adjustment: number; closing: number;
};
export type StockJournalRow = {
  id: number; item_master_id: number; item_code: string; item_name: string; warehouse_id: number; warehouse_name: string;
  unit_name: string; item_type_id: number; group_name: string; created_at: string; transaction_type: string;
  reference_doc_type: string; reference_doc_number: string; lot_number: string; quantity_change: number;
  actor_name: string; movement_kind: "receipt" | "issue" | "adjustment" | "reversal"; balance: number;
};
export type StockReportResult = { rows: Array<StockSummaryRow | StockJournalRow>; total: number; options: { warehouses: StockReportOption[]; groups: StockReportOption[] } };

function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value); }

export async function getStockMovementReportAction(filters: StockReportFilters): Promise<{ data?: StockReportResult; error?: string }> {
  if (!validDate(filters.startDate) || !validDate(filters.endDate) || filters.startDate > filters.endDate
    || !["summary", "journal", "card"].includes(filters.view) || !Number.isSafeInteger(filters.page)
    || ![20, 50, 100, 500].includes(filters.pageSize)) return { error: "ตัวกรองรายงานไม่ถูกต้อง" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_stock_movement_report", {
    p_view: filters.view, p_start_date: filters.startDate, p_end_date: filters.endDate,
    p_warehouse_id: filters.warehouseId || null, p_item_type_id: filters.itemTypeId || null,
    p_movement_kind: filters.movementKind || null, p_search: filters.search?.trim().slice(0, 100) || null,
    p_item_master_id: filters.itemMasterId || null, p_page: filters.page, p_page_size: filters.pageSize,
  });
  if (error) { console.error("get_stock_movement_report failed", { code: error.code, message: error.message }); return { error: error.code === "42501" ? "ไม่มีสิทธิ์ดูรายงานคลังสินค้า" : "ไม่สามารถโหลดรายงานได้" }; }
  const value = (data ?? {}) as Record<string, unknown>;
  const options = (value.options ?? {}) as Record<string, unknown>;
  return { data: {
    rows: Array.isArray(value.rows) ? value.rows as Array<StockSummaryRow | StockJournalRow> : [], total: Number(value.total ?? 0),
    options: { warehouses: Array.isArray(options.warehouses) ? options.warehouses as StockReportOption[] : [], groups: Array.isArray(options.groups) ? options.groups as StockReportOption[] : [] },
  } };
}

export async function getStockCardAction(filters: Omit<StockReportFilters, "view">): Promise<{ data?: StockReportResult & { summary: StockSummaryRow | undefined }; error?: string }> {
  const summary = await getStockMovementReportAction({ ...filters, view: "summary", page: 1, pageSize: 20 });
  if (!summary.data) return { error: summary.error };
  const card = await getStockMovementReportAction({ ...filters, view: "card" });
  if (!card.data) return { error: card.error };
  return { data: { ...card.data, summary: summary.data.rows[0] as StockSummaryRow | undefined } };
}
