"use server";

import { revalidatePath } from "next/cache";
import { validateCancellationReason } from "@/lib/purchase-document-cancellation";
import { validateStockAdjustmentDraft, type StockAdjustmentDraft } from "@/lib/stock-adjustments";
import { createClient } from "@/utils/supabase/server";

export type StockAdjustmentRecord = {
  id: number; adjustmentNumber: string; documentDate: string; warehouseId: number;
  warehouseName: string; reason: string; notes: string; status: "posted" | "cancelled";
  itemCount: number; createdByName: string; createdAt: string; cancellationReason: string;
  cancelledAt: string | null; cancelledByName: string; reversalNumber: string;
};

export type StockAdjustmentOption = {
  id: number; code: string; name: string; warehouseId: number; onHandQty: number;
  unitName: string; trackingMethod: string;
};

export type StockAdjustmentDetail = {
  header: StockAdjustmentRecord;
  sourceCountNumber: string;
  items: Array<{ id: number; lineNo: number; itemCode: string; itemName: string; unitName: string; systemQty: number; countedQty: number; differenceQty: number; positiveUnitCost: number | null; lotNumber: string }>;
  canCancel: boolean;
};

const PAGE_PATH = "/inventory/adjustments";

function friendly(message: string) {
  if (message.includes("permission_denied")) return "คุณไม่มีสิทธิ์ทำรายการนี้";
  if (message.includes("stale_stock_balance")) return "ยอดคงเหลือเปลี่ยนระหว่างทำรายการ กรุณาโหลดข้อมูลใหม่";
  if (message.includes("positive_unit_cost_required")) return "กรุณาระบุต้นทุนต่อหน่วยสำหรับยอดปรับเพิ่ม";
  if (message.includes("positive_adjustment_already_consumed")) return "ยอดที่ปรับเพิ่มถูกนำไปใช้แล้ว จึงไม่สามารถยกเลิกเอกสารนี้ได้";
  if (message.includes("insufficient_stock") || message.includes("insufficient_fifo")) return "ยอดสต็อกหรือต้นทุน FIFO ไม่เพียงพอ";
  if (message.includes("serial_stock_adjustment_not_supported")) return "สินค้าที่ควบคุม Serial ต้องปรับผ่านงาน Serial โดยเฉพาะ";
  if (message.includes("invalid_cancellation_reason")) return "กรุณาระบุเหตุผลยกเลิกอย่างน้อย 10 ตัวอักษร";
  if (message.includes("invalid_or_expired_number_reservation")) return "เลขที่ใบปรับปรุงหมดอายุ กรุณาปิดแล้วเปิดฟอร์มใหม่";
  return "ไม่สามารถบันทึกรายการได้";
}

export async function getStockAdjustmentsAction(search = "") {
  const supabase = await createClient();
  let query = supabase.from("stock_adjustments")
    .select("id,adjustment_number,document_date,warehouse_id,warehouse_name,reason,notes,status,created_by_name,created_at,cancellation_reason,cancelled_at,cancelled_by_name,reversal_number,stock_adjustment_items(count)")
    .order("document_date", { ascending: false }).order("id", { ascending: false }).limit(500);
  if (search.trim()) query = query.ilike("adjustment_number", `%${search.trim().slice(0, 100)}%`);
  const { data, error } = await query;
  if (error) return { error: error.message };
  return { data: (data ?? []).map((row) => ({
    id: Number(row.id), adjustmentNumber: String(row.adjustment_number), documentDate: String(row.document_date),
    warehouseId: Number(row.warehouse_id), warehouseName: String(row.warehouse_name), reason: String(row.reason),
    notes: String(row.notes ?? ""), status: row.status === "cancelled" ? "cancelled" as const : "posted" as const,
    itemCount: Number(row.stock_adjustment_items?.[0]?.count ?? 0), createdByName: String(row.created_by_name),
    createdAt: String(row.created_at), cancellationReason: String(row.cancellation_reason ?? ""),
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
    cancelledByName: String(row.cancelled_by_name ?? ""), reversalNumber: String(row.reversal_number ?? ""),
  })) satisfies StockAdjustmentRecord[] };
}

export async function getStockAdjustmentOptionsAction(warehouseId?: number, search?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_stock_adjustment_form_options", {
    p_warehouse_id: warehouseId || null, p_search: search?.trim().slice(0, 100) || null,
  });
  if (error) return { error: friendly(error.message) };
  const value = (data ?? {}) as Record<string, unknown>;
  if (value.permissionDenied) return { error: "คุณไม่มีสิทธิ์สร้างใบปรับปรุงสต็อก" };
  const rows = Array.isArray(value.items) ? value.items as Array<Record<string, unknown>> : [];
  const warehouses = Array.isArray(value.warehouses) ? value.warehouses as Array<Record<string, unknown>> : [];
  return { data: {
    warehouses: warehouses.map((row) => ({ id: Number(row.id), name: String(row.name) })),
    items: rows.map((row) => ({ id: Number(row.id), code: String(row.code), name: String(row.name), warehouseId: Number(row.warehouseId), onHandQty: Number(row.onHandQty), unitName: String(row.unitName), trackingMethod: String(row.trackingMethod) })) satisfies StockAdjustmentOption[],
  } };
}

export async function postStockAdjustmentAction(draft: StockAdjustmentDraft) {
  const validation = validateStockAdjustmentDraft(draft);
  if (validation) return { error: validation };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_stock_adjustment", {
    p_adjustment_number: draft.adjustmentNumber,
    p_document_date: draft.documentDate, p_warehouse_id: draft.warehouseId,
    p_reason: draft.reason.trim(), p_notes: draft.notes.trim() || null,
    p_items: draft.items.map((item) => ({ item_master_id: item.itemMasterId, system_qty: item.systemQty, counted_qty: item.countedQty, positive_unit_cost: item.positiveUnitCost })),
  });
  if (error) return { error: friendly(error.message) };
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath(PAGE_PATH); revalidatePath("/inventory/stock"); revalidatePath("/reports/inventory/stock-movements");
  return { success: true as const, id: Number(row?.stock_adjustment_id), adjustmentNumber: String(row?.adjustment_number ?? "") };
}

export async function getStockAdjustmentDetailAction(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return { error: "ข้อมูลเอกสารไม่ถูกต้อง" };
  const supabase = await createClient();
  const [{ data: header, error: headerError }, { data: items, error: itemsError }, permission] = await Promise.all([
    supabase.from("stock_adjustments").select("*").eq("id", id).single(),
    supabase.from("stock_adjustment_items").select("*,inventory_lots(lot_number)").eq("stock_adjustment_id", id).order("line_no"),
    supabase.rpc("authorize", { requested_permission: "inventory_adjustment.cancel" }),
  ]);
  if (headerError || itemsError || !header) return { error: "ไม่พบใบปรับปรุงสต็อก" };
  const record: StockAdjustmentRecord = {
    id: Number(header.id), adjustmentNumber: String(header.adjustment_number), documentDate: String(header.document_date),
    warehouseId: Number(header.warehouse_id), warehouseName: String(header.warehouse_name), reason: String(header.reason),
    notes: String(header.notes ?? ""), status: header.status === "cancelled" ? "cancelled" : "posted", itemCount: items?.length ?? 0,
    createdByName: String(header.created_by_name), createdAt: String(header.created_at), cancellationReason: String(header.cancellation_reason ?? ""),
    cancelledAt: header.cancelled_at ? String(header.cancelled_at) : null, cancelledByName: String(header.cancelled_by_name ?? ""), reversalNumber: String(header.reversal_number ?? ""),
  };
  return { data: { header: record, sourceCountNumber: String(header.source_count_number ?? ""), items: (items ?? []).map((item) => ({ id: Number(item.id), lineNo: Number(item.line_no), itemCode: String(item.item_code), itemName: String(item.item_name), unitName: String(item.unit_name), systemQty: Number(item.system_qty), countedQty: Number(item.counted_qty), differenceQty: Number(item.difference_qty), positiveUnitCost: item.positive_unit_cost === null ? null : Number(item.positive_unit_cost), lotNumber: String(item.inventory_lots?.lot_number ?? "") })), canCancel: Boolean(permission.data) } satisfies StockAdjustmentDetail };
}

export async function cancelStockAdjustmentAction(id: number, reason: string) {
  const validation = validateCancellationReason(reason);
  if (!validation.success) return { error: validation.error };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_stock_adjustment", { p_stock_adjustment_id: id, p_reason: validation.reason });
  if (error) return { error: friendly(error.message) };
  const row = Array.isArray(data) ? data[0] : data;
  revalidatePath(PAGE_PATH); revalidatePath("/inventory/stock"); revalidatePath("/reports/inventory/stock-movements");
  return { success: true as const, reversalNumber: String(row?.reversal_number ?? "") };
}
