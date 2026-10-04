"use server";

import { uniquePurchaseAnalysisOptions, validatePurchaseAnalysisFilters, type PurchaseAnalysisFilters } from "@/lib/purchase-analysis";
import { createClient } from "@/utils/supabase/server";

export type PurchaseAnalysisOption = { id: number; code?: string; name: string };
export type PurchaseAnalysisRow = {
  group_id: string;
  code: string;
  name: string;
  meta: string | null;
  po_count: number;
  vendor_count: number;
  ordered_qty: number;
  received_qty: number;
  pending_qty: number;
  total_value: number;
  received_value: number;
  pending_value: number;
  average_price: number;
  received_rate: number;
  on_time_rate: number;
};
export type PurchaseAnalysisSummary = {
  vendor_count: number;
  po_count: number;
  ordered_qty: number;
  received_qty: number;
  pending_qty: number;
  total_value: number;
  received_rate: number;
  on_time_rate: number;
};
export type PurchaseAnalysisResult = {
  rows: PurchaseAnalysisRow[];
  total: number;
  summary: PurchaseAnalysisSummary;
  options: { vendors: PurchaseAnalysisOption[]; groups: PurchaseAnalysisOption[] };
};

export type PurchaseAnalysisVendorItem = {
  id: number; line_no: number; item_code: string; item_name: string;
  ordered_qty: number; unit_name: string; unit_price: number; net_value: number;
  received_qty: number; pending_qty: number; delivery_date: string;
};
export type PurchaseAnalysisVendorOrder = {
  id: number; po_number: string; document_date: string;
  delivery_date_from: string; delivery_date_to: string;
  status: "not_received" | "partial" | "received";
  ordered_qty: number; received_qty: number; pending_qty: number;
  total_value: number; received_value: number; pending_value: number;
  received_rate: number; on_time_rate: number; items: PurchaseAnalysisVendorItem[];
};
export type PurchaseAnalysisVendorDetail = {
  vendor: { id: number; code: string; name: string; tax_no: string; branch: string | null; contact_name: string | null; phone: string | null; email: string | null; address: string | null };
  summary: { po_count: number; total_value: number; received_value: number; pending_value: number; received_rate: number; on_time_rate: number };
  purchase_orders: PurchaseAnalysisVendorOrder[];
};

export type PurchaseAnalysisProductOrder = {
  id: number; po_number: string; vendor_id: number; vendor_code: string; vendor_name: string;
  document_date: string; delivery_date: string; status: "not_received" | "partial" | "received";
  ordered_qty: number; unit_price: number; total_value: number;
  received_qty: number; pending_qty: number; received_rate: number; on_time_rate: number;
};
export type PurchaseAnalysisProductDetail = {
  product: { key: string; code: string; name: string; item_type_name: string | null; unit_name: string };
  summary: {
    po_count: number; vendor_count: number; ordered_qty: number; received_qty: number;
    pending_qty: number; total_value: number; received_rate: number; on_time_rate: number;
  };
  purchase_orders: PurchaseAnalysisProductOrder[];
};

export async function getPurchaseAnalysisAction(filters: PurchaseAnalysisFilters): Promise<{ data?: PurchaseAnalysisResult; error?: string }> {
  const validationError = validatePurchaseAnalysisFilters(filters);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_purchase_analysis_report", {
    p_view: filters.view,
    p_start_date: filters.startDate,
    p_end_date: filters.endDate,
    p_vendor_id: filters.vendorId || null,
    p_item_type_id: filters.itemTypeId || null,
    p_search: filters.search?.trim().slice(0, 100) || null,
    p_page: filters.page,
    p_page_size: filters.pageSize,
  });
  if (error) {
    console.error("get_purchase_analysis_report failed", { code: error.code, message: error.message });
    return { error: error.code === "42501" ? "ไม่มีสิทธิ์ดูรายงานจัดซื้อ" : "ไม่สามารถโหลดรายงานได้" };
  }

  const value = (data ?? {}) as Record<string, unknown>;
  const options = (value.options ?? {}) as Record<string, unknown>;
  const summary = (value.summary ?? {}) as Record<string, unknown>;
  return { data: {
    rows: Array.isArray(value.rows) ? value.rows as PurchaseAnalysisRow[] : [],
    total: Number(value.total ?? 0),
    summary: {
      vendor_count: Number(summary.vendor_count ?? 0), po_count: Number(summary.po_count ?? 0),
      ordered_qty: Number(summary.ordered_qty ?? 0), received_qty: Number(summary.received_qty ?? 0),
      pending_qty: Number(summary.pending_qty ?? 0), total_value: Number(summary.total_value ?? 0),
      received_rate: Number(summary.received_rate ?? 0), on_time_rate: Number(summary.on_time_rate ?? 0),
    },
    options: {
      vendors: uniquePurchaseAnalysisOptions(Array.isArray(options.vendors) ? options.vendors as PurchaseAnalysisOption[] : []),
      groups: uniquePurchaseAnalysisOptions(Array.isArray(options.groups) ? options.groups as PurchaseAnalysisOption[] : []),
    },
  } };
}

export async function getPurchaseAnalysisVendorDetailAction(input: { vendorId: number; startDate: string; endDate: string }): Promise<{ data?: PurchaseAnalysisVendorDetail; error?: string }> {
  if (!Number.isSafeInteger(input.vendorId) || input.vendorId <= 0 || validatePurchaseAnalysisFilters({ view: "vendor", startDate: input.startDate, endDate: input.endDate, page: 1, pageSize: 20 })) {
    return { error: "ตัวกรองรายละเอียดผู้ขายไม่ถูกต้อง" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_purchase_analysis_vendor_detail", {
    p_vendor_id: input.vendorId,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
  });
  if (error) {
    console.error("get_purchase_analysis_vendor_detail failed", { code: error.code, message: error.message });
    return { error: error.code === "42501" ? "ไม่มีสิทธิ์ดูรายงานจัดซื้อ" : "ไม่สามารถโหลดรายละเอียดผู้ขายได้" };
  }
  return { data: data as PurchaseAnalysisVendorDetail };
}

export async function getPurchaseAnalysisProductDetailAction(input: { productKey: string; startDate: string; endDate: string }): Promise<{ data?: PurchaseAnalysisProductDetail; error?: string }> {
  const productKey = input.productKey.trim();
  if (!productKey || productKey.length > 160 || validatePurchaseAnalysisFilters({ view: "product", startDate: input.startDate, endDate: input.endDate, page: 1, pageSize: 20 })) {
    return { error: "ตัวกรองรายละเอียดสินค้าไม่ถูกต้อง" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_purchase_analysis_product_detail", {
    p_product_key: productKey,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
  });
  if (error) {
    console.error("get_purchase_analysis_product_detail failed", { code: error.code, message: error.message });
    return { error: error.code === "42501" ? "ไม่มีสิทธิ์ดูรายงานจัดซื้อ" : "ไม่สามารถโหลดรายละเอียดสินค้าได้" };
  }
  return { data: data as PurchaseAnalysisProductDetail };
}
