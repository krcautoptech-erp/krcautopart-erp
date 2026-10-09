"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { validateOpeningHeader, validateOpeningRows, type OpeningItem, type OpeningRow, type OpeningStatus } from "@/lib/opening-stock";

export type OpeningBatch = { id: number; opening_number: string; warehouse_id: number; warehouse_name: string; cutoff_date: string; reference: string; notes: string; source_filename: string; rows: OpeningRow[]; status: OpeningStatus; revision: number; total_value: number; created_by: string; created_by_name: string; created_at: string; request_key: string };
export type OpeningOptions = { warehouses: { id: number; name: string; blocked: boolean }[]; items: OpeningItem[] };
export type OpeningEvent = { id: number; event: string; reason: string; actor_name: string; created_at: string };
const path = "/inventory/opening-stock";

function friendly(message: string) {
  const errors: Record<string, string> = {
    permission_denied: "คุณไม่มีสิทธิ์ทำรายการนี้", opening_self_approval: "ผู้สร้างไม่สามารถอนุมัติเอกสารตนเองได้ กรุณาให้ผู้มีสิทธิ์อีกคนตรวจสอบ",
    opening_warehouse_in_use: "คลังนี้เริ่มใช้งานหรือมีสต็อกแล้ว ไม่สามารถลงยอดตั้งต้นซ้ำได้",
    opening_already_used: "คลังมีการเคลื่อนไหวหรือจองสินค้าแล้ว ไม่สามารถกลับรายการตั้งต้นได้",
    opening_stale_revision: "เอกสารถูกเปลี่ยนแปลงจากอีกหน้าจอ กรุณาโหลดใหม่ก่อนดำเนินการ",
    serial_opening_not_supported: "ยังไม่รองรับการตั้งต้นสินค้าควบคุม Serial",
    duplicate_opening_item_lot: "พบสินค้าและ Lot ซ้ำ กรุณาตรวจสอบรายการ",
    stock_item_not_found: "สินค้าบางรายการถูกปิดใช้งานหรือไม่เก็บสต็อกแล้ว",
    opening_reason_required: "กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร",
  };
  for (const [key, value] of Object.entries(errors)) if (message.includes(key)) return value;
  if (/opening_not_|opening_cannot_cancel/.test(message)) return "สถานะเอกสารเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่";
  if (/does not exist|schema cache/.test(message)) return "ยังไม่ได้รัน Migration สต็อกตั้งต้น จึงยังบันทึกหรือลงยอดไม่ได้";
  return "ไม่สามารถดำเนินการได้ กรุณาตรวจสอบข้อมูลแล้วลองใหม่";
}
async function authorize() {
  const client = await createClient();
  const { data, error } = await client.rpc("authorize", { requested_permission: "opening_stock.view" });
  return { client, allowed: !error && Boolean(data) };
}
export async function getOpeningStockOptionsAction(): Promise<{ data?: OpeningOptions; error?: string; migrationRequired?: boolean }> {
  const { client, allowed } = await authorize();
  if (!allowed) return { error: "คุณไม่มีสิทธิ์ดูสต็อกตั้งต้น" };
  const { data, error } = await client.rpc("get_opening_stock_options");
  if (!error) return { data: data as OpeningOptions };
  if (!/schema cache|does not exist/.test(error.message)) return { error: friendly(error.message) };
  // Read-only setup preview before the user applies the migration; writes remain disabled.
  const [warehouses, items] = await Promise.all([
    client.from("raw_material_warehouses").select("id,warehouse_name").eq("status", "active").order("id"),
    client.from("item_master").select("id,item_code,item_name,tracking_method,item_types!inner(is_stocked,expiry_controlled,status),raw_material_units(unit_name,symbol,allows_decimal)").eq("status", "active").eq("item_types.is_stocked", true).eq("item_types.status", "active").limit(1000),
  ]);
  if (warehouses.error || items.error) return { error: "โหลดรายการคลังหรือสินค้าไม่ได้", migrationRequired: true };
  return { migrationRequired: true, data: { warehouses: (warehouses.data ?? []).map((w) => ({ id: w.id, name: w.warehouse_name, blocked: false })), items: (items.data ?? []).map((i) => {
    const type = (Array.isArray(i.item_types) ? i.item_types[0] : i.item_types) as unknown as { expiry_controlled: boolean };
    const unit = (Array.isArray(i.raw_material_units) ? i.raw_material_units[0] : i.raw_material_units) as unknown as { unit_name: string; symbol: string; allows_decimal: boolean } | null;
    return { id: i.id, code: i.item_code, name: i.item_name, trackingMethod: i.tracking_method, expiryControlled: Boolean(type?.expiry_controlled), unitName: unit?.symbol || unit?.unit_name || "หน่วย", allowsDecimal: unit?.allows_decimal ?? true };
  }) } };
}
export async function getOpeningStockBatchesAction() {
  const { client, allowed } = await authorize();
  if (!allowed) return { error: "คุณไม่มีสิทธิ์ดูสต็อกตั้งต้น" };
  const { data, error } = await client.from("opening_stock_batches").select("*").order("id", { ascending: false }).limit(500);
  if (error) return { error: friendly(error.message) };
  return { data: (data ?? []) as OpeningBatch[] };
}
export async function getOpeningStockDetailAction(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return { error: "เลขเอกสารไม่ถูกต้อง" };
  const { client, allowed } = await authorize();
  if (!allowed) return { error: "คุณไม่มีสิทธิ์ดูสต็อกตั้งต้น" };
  const [batch, events] = await Promise.all([
    client.from("opening_stock_batches").select("*").eq("id", id).single(),
    client.from("opening_stock_events").select("id,event,reason,actor_name,created_at").eq("batch_id", id).order("id", { ascending: false }),
  ]);
  if (batch.error || events.error) return { error: friendly(batch.error?.message ?? events.error!.message) };
  const user = await client.auth.getUser();
  return { data: batch.data as OpeningBatch, events: (events.data ?? []) as OpeningEvent[], canEdit: user.data.user?.id === batch.data.created_by };
}
export async function saveOpeningStockAction(input: { id: number | null; revision: number; requestKey: string; warehouseId: number; cutoffDate: string; reference: string; notes: string; filename: string; rows: OpeningRow[]; submit: boolean }) {
  if (!input || [input.cutoffDate,input.reference,input.notes,input.filename,input.requestKey].some((field) => typeof field !== "string") || typeof input.submit !== "boolean" || !Number.isSafeInteger(input.revision) || (input.id !== null && (!Number.isSafeInteger(input.id) || input.id <= 0)) || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(input.requestKey) || input.filename.length > 255 || !Array.isArray(input.rows) || input.rows.length > 500 || input.rows.some((row) => !row || [row.itemCode,row.lotNumber,row.expiryDate,row.quantity,row.unitCost,row.notes].some((field) => typeof field !== "string"))) return { error: "รูปแบบรายการไม่ถูกต้อง" };
  const rows = input.rows.map((row) => ({ itemCode: row.itemCode.trim(), lotNumber: row.lotNumber.trim(), expiryDate: row.expiryDate.trim(), quantity: row.quantity.trim(), unitCost: row.unitCost.trim(), notes: row.notes.trim() }));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const headerError = validateOpeningHeader(input.warehouseId, input.cutoffDate, input.reference, input.notes, today);
  if (headerError) return { error: headerError };
  if (input.submit) {
    const options = await getOpeningStockOptionsAction();
    if (!options.data) return { error: options.error ?? "โหลดข้อมูลสินค้าไม่ได้" };
    if (!rows.length || validateOpeningRows(rows, options.data.items, input.cutoffDate).some((row) => row.length)) return { error: "กรุณาแก้รายการที่ไม่ถูกต้องก่อนส่งตรวจสอบ" };
  }
  const { client, allowed } = await authorize();
  if (!allowed) return { error: "คุณไม่มีสิทธิ์ทำรายการนี้" };
  const { data, error } = await client.rpc("save_opening_stock", { p_id: input.id, p_revision: input.revision, p_request_key: input.requestKey, p_warehouse_id: input.warehouseId, p_cutoff_date: input.cutoffDate, p_reference: input.reference, p_notes: input.notes, p_filename: input.filename, p_rows: rows, p_submit: input.submit });
  if (error) return { error: friendly(error.message) };
  revalidatePath(path);
  return { id: Number(data) };
}
export async function decideOpeningStockAction(id: number, revision: number, action: "post" | "return" | "cancel" | "reverse", reason = "") {
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(revision) || !["post","return","cancel","reverse"].includes(action)) return { error: "ข้อมูลเอกสารไม่ถูกต้อง" };
  const { client, allowed } = await authorize();
  if (!allowed) return { error: "คุณไม่มีสิทธิ์ทำรายการนี้" };
  const { error } = await client.rpc("decide_opening_stock", { p_id: id, p_revision: revision, p_action: action, p_reason: reason });
  if (error) return { error: friendly(error.message) };
  for (const url of [path, "/inventory/stock", "/workspace", "/reports/inventory"]) revalidatePath(url);
  return { success: true };
}
