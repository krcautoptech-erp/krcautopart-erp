"use server";

import { revalidatePath } from "next/cache";
import { validateStockIssueDraft, type StockIssueDraft, type IssueLot } from "@/lib/stock-issues";
import { validateCancellationReason } from "@/lib/purchase-document-cancellation";
import { createClient } from "@/utils/supabase/server";

export type StockIssueRecord = {
  id: number;
  issueNumber: string;
  documentDate: string;
  requesterName: string;
  departmentId: number;
  departmentName: string;
  workPoint: string;
  warehouseId: number;
  warehouseName: string;
  reason: string;
  status: "posted" | "cancelled";
  itemCount: number;
  createdAt: string;
  cancellationReason: string;
  cancelledAt: string | null;
  cancelledByName: string;
  reversalNumber: string;
};

export type StockIssueItem = {
  id: number;
  lineNo: number;
  itemMasterId: number;
  itemCode: string;
  itemName: string;
  quantity: number;
  unitName: string;
  lotNumber: string;
  unitCost: number | null;
  amount: number | null;
};

export type StockIssueFormOptions = {
  requesterName: string;
  canViewCost: boolean;
  departments: Array<{ id: number; name: string }>;
  warehouses: Array<{ id: number; name: string }>;
  items: Array<{
    id: number;
    code: string;
    name: string;
    warehouseId: number;
    onHandQty: number;
    unitName: string;
    trackingMethod: string;
    lots: IssueLot[];
  }>;
};

const PAGE_PATH = "/inventory/issues";
type AllocationRow = { id: number; stock_issue_item_id: number; inventory_lot_id: number | null; inventory_transaction_id: number; quantity: number };
type CostRow = { inventory_transaction_id: number; quantity: number; unit_cost: number; cost_amount: number };

function friendlyError(message: string) {
  if (message.includes("invalid_or_expired_number_reservation")) return "เลขที่ใบเบิกนี้ถูกใช้แล้วหรือการจองหมดอายุ กรุณาปิดและเปิดใบเบิกใหม่";
  if (message.includes("Could not find the function") || message.includes("schema cache")) return "ฐานข้อมูลยังไม่ตรงกับรุ่นใบเบิก กรุณารัน migration ใบเบิกล่าสุด";
  if (message.includes("ambiguous")) return "คำสั่งบันทึกในฐานข้อมูลมีชื่อคอลัมน์กำกวม กรุณาตรวจ SQL ของใบเบิก";
  if (message.includes("fifo_override_reason_required")) return "กรุณาระบุเหตุผลข้าม FIFO ยอด Lot อาจเปลี่ยนแล้ว กรุณาตรวจสอบอีกครั้ง";
  if (message.includes("lot_allocation_required") || message.includes("invalid_lot_allocation")) return "กรุณาจัดสรร Lot ให้ครบและตรงกับจำนวนเบิก";
  if (message.includes("permission_denied")) return "คุณไม่มีสิทธิ์ทำรายการใบเบิก";
  if (message.includes("insufficient_stock")) return "ยอดคงเหลือไม่พอ กรุณาโหลดข้อมูลใหม่";
  if (message.includes("insufficient_fifo_lots")) return "ยอด Lot สำหรับตัด FIFO ไม่เพียงพอ";
  if (message.includes("insufficient_fifo_cost_layers")) return "ข้อมูลต้นทุน FIFO ไม่ครบ กรุณาตรวจสอบรายการรับเข้า";
  if (message.includes("serial_stock_issue_not_supported")) return "สินค้าที่ควบคุม Serial ยังไม่รองรับในใบเบิกแบบนี้";
  if (message.includes("duplicate_stock_issue_item")) return "พบสินค้าซ้ำในใบเบิก";
  if (message.includes("stock_issue_not_found")) return "ไม่พบใบเบิกที่ต้องการ";
  if (message.includes("stock_issue_cannot_be_cancelled")) return "ใบเบิกนี้ไม่สามารถยกเลิกได้";
  if (message.includes("invalid_cancellation_reason")) return "กรุณาระบุเหตุผลการยกเลิกอย่างน้อย 10 ตัวอักษร";
  if (message.includes("invalid_stock_issue_ledger") || message.includes("invalid_stock_issue_cost_reversal")) return "ข้อมูลสต็อกเดิมไม่ครบ จึงไม่สามารถคืนสต็อกได้ กรุณาให้ผู้ดูแลตรวจสอบ";
  return "ไม่สามารถบันทึกใบเบิกได้";
}

export async function getStockIssuesAction(search = "") {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("stock_issues")
      .select("id,issue_number,document_date,requester_name,department_id,department_name,work_point,warehouse_id,warehouse_name,reason,status,created_at,stock_issue_items(count)")
      .order("document_date", { ascending: false })
      .order("id", { ascending: false })
      .limit(500);
    if (search.trim()) query = query.eq("issue_number", search.trim().slice(0, 100));
    const { data, error } = await query;
    if (error) return { error: error.message };

    return {
      data: (data ?? []).map((row) => ({
        id: Number(row.id),
        issueNumber: String(row.issue_number),
        documentDate: String(row.document_date),
        requesterName: String(row.requester_name),
        departmentId: Number(row.department_id),
        departmentName: String(row.department_name),
        workPoint: String(row.work_point),
        warehouseId: Number(row.warehouse_id),
        warehouseName: String(row.warehouse_name),
        reason: String(row.reason),
        status: row.status === "cancelled" ? "cancelled" : "posted",
        itemCount: Number(row.stock_issue_items?.[0]?.count ?? 0),
        createdAt: String(row.created_at),
        cancellationReason: "",
        cancelledAt: null,
        cancelledByName: "",
        reversalNumber: "",
      })) satisfies StockIssueRecord[],
    };
  } catch (error) {
    console.error("getStockIssuesAction error:", error);
    return { error: "ไม่สามารถโหลดรายการใบเบิกได้" };
  }
}

export async function getStockIssueFormOptionsAction(warehouseId?: number, search?: string) {
  try {
    const supabase = await createClient();
    const [{ data, error }, costPermissionRes] = await Promise.all([
      supabase.rpc("get_stock_issue_form_options", {
        p_search: search?.trim().slice(0, 100) || null,
        p_warehouse_id: warehouseId || null,
      }),
      supabase.rpc("authorize", { requested_permission: "inventory_cost.view" }),
    ]);
    if (error) { console.error("get_stock_issue_form_options failed", { code: error.code, message: error.message }); return { error: friendlyError(error.message) }; }
    const value = (data ?? {}) as Record<string, unknown>;
    const departments = Array.isArray(value.departments) ? value.departments : [];
    const warehouses = Array.isArray(value.warehouses) ? value.warehouses : [];
    const items = Array.isArray(value.items) ? value.items : [];
    if (items.some((item) => typeof item.trackingMethod !== "string" || !Array.isArray(item.lots))) {
      return { error: "ฐานข้อมูลยังไม่ได้อัปเดตการจัดสรร Lot กรุณารัน migration stock_issue_lot_selection ก่อน" };
    }
    const canViewCost = Boolean(costPermissionRes.data);
    const itemIds = items.map((item) => Number(item.id)).filter(Number.isSafeInteger);
    const costByLot = new Map<number, Array<{ quantity: number; unitCost: number }>>();
    if (canViewCost && itemIds.length > 0) {
      const { data: costs, error: costsError } = await supabase
        .from("inventory_receipt_costs")
        .select("inventory_lot_id,remaining_qty,unit_cost,created_at,inventory_transaction_id")
        .in("item_master_id", itemIds)
        .gt("remaining_qty", 0)
        .not("inventory_lot_id", "is", null)
        .order("created_at")
        .order("inventory_transaction_id");
      if (costsError) console.error("stock issue lot costs failed", { code: costsError.code, message: costsError.message });
      for (const cost of costs ?? []) {
        const lotId = Number(cost.inventory_lot_id);
        const layers = costByLot.get(lotId) ?? [];
        layers.push({ quantity: Number(cost.remaining_qty), unitCost: Number(cost.unit_cost) });
        costByLot.set(lotId, layers);
      }
    }
    return {
      data: {
        requesterName: String(value.requesterName ?? ""),
        canViewCost,
        departments: departments.map((item) => ({ id: Number(item.id), name: String(item.name) })),
        warehouses: warehouses.map((item) => ({ id: Number(item.id), name: String(item.name) })),
        items: items.map((item) => ({
          id: Number(item.id), code: String(item.code), name: String(item.name),
          warehouseId: Number(item.warehouseId), onHandQty: Number(item.onHandQty),
          unitName: String(item.unitName),
          trackingMethod: String(item.trackingMethod ?? "none"),
          lots: (Array.isArray(item.lots) ? item.lots : []).map((lot: Record<string, unknown>) => ({ id: Number(lot.id), lotNumber: String(lot.lotNumber), receivedAt: String(lot.receivedAt), onHandQty: Number(lot.onHandQty), costLayers: costByLot.get(Number(lot.id)) ?? [] })),
        })),
      } satisfies StockIssueFormOptions,
    };
  } catch (error) {
    console.error("getStockIssueFormOptionsAction error:", error);
    return { error: "ไม่สามารถโหลดข้อมูลสำหรับสร้างใบเบิกได้" };
  }
}

export async function postStockIssueAction(draft: StockIssueDraft) {
  if (!draft.issueNumber?.trim()) return { error: "กรุณารอการจองเลขที่ใบเบิกให้สำเร็จก่อนบันทึก" };
  const validationError = validateStockIssueDraft(draft);
  if (validationError) return { error: validationError };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("post_stock_issue", {
      p_department_id: draft.departmentId,
      p_issue_number: draft.issueNumber,
      p_document_date: draft.documentDate,
      p_items: draft.items.map((item) => ({ item_master_id: item.itemMasterId, quantity: item.quantity, allocations: item.allocations?.map((allocation) => ({ lot_id: allocation.lotId, quantity: allocation.quantity })), fifo_override_reason: item.fifoOverrideReason?.trim() || null })),
      p_reason: draft.reason.trim(),
      p_requester_name: draft.requesterName.trim(),
      p_warehouse_id: draft.warehouseId,
      p_work_point: draft.workPoint.trim(),
    });
    if (error) { console.error("post_stock_issue failed", { code: error.code, message: error.message, details: error.details, hint: error.hint }); return { error: `${friendlyError(error.message)}${error.code ? ` (รหัส ${error.code})` : ""}` }; }
    const row = Array.isArray(data) ? data[0] : data;
    revalidatePath(PAGE_PATH);
    revalidatePath("/inventory/stock");
    return {
      success: true as const,
      id: Number(row?.stock_issue_id),
      issueNumber: String(row?.issue_number ?? ""),
    };
  } catch (error) {
    console.error("postStockIssueAction error:", error);
    return { error: "ไม่สามารถบันทึกใบเบิกได้" };
  }
}

export async function getStockIssueDetailAction(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return { error: "ข้อมูลใบเบิกไม่ถูกต้อง" };
  try {
    const supabase = await createClient();
    const [{ data: header, error: headerError }, { data: items, error: itemsError }, costPermissionRes, cancelPermissionRes] = await Promise.all([
      supabase.from("stock_issues").select("*").eq("id", id).single(),
      supabase.from("stock_issue_items").select("*").eq("stock_issue_id", id).order("line_no"),
      supabase.rpc("authorize", { requested_permission: "inventory_cost.view" }),
      supabase.rpc("authorize", { requested_permission: "inventory_issue.cancel" }),
    ]);
    if (headerError || itemsError || !header) return { error: "ไม่พบข้อมูลใบเบิก" };
    const itemIds = (items ?? []).map((item) => Number(item.id));
    const allocationResult = itemIds.length
      ? await supabase.from("stock_issue_allocations").select("id,stock_issue_item_id,inventory_lot_id,inventory_transaction_id,quantity").in("stock_issue_item_id", itemIds)
      : { data: [], error: null };
    const allocations = (allocationResult.data ?? []) as AllocationRow[];
    const allocationError = allocationResult.error;
    if (allocationError) return { error: "ไม่สามารถโหลด Lot ที่จ่ายได้" };
    const lotIds = (allocations ?? []).map((row) => Number(row.inventory_lot_id)).filter(Number.isSafeInteger);
    const transactionIds = (allocations ?? []).map((row) => Number(row.inventory_transaction_id));
    const [{ data: lots }, costResult] = await Promise.all([
      lotIds.length ? supabase.from("inventory_lots").select("id,lot_number").in("id", lotIds) : Promise.resolve({ data: [] }),
      Boolean(costPermissionRes.data) && transactionIds.length
        ? supabase.from("inventory_issue_cost_allocations").select("inventory_transaction_id,quantity,unit_cost,cost_amount").in("inventory_transaction_id", transactionIds)
        : Promise.resolve({ data: [] }),
    ]);
    const costs = (costResult.data ?? []) as CostRow[];
    const lotNumberById = new Map((lots ?? []).map((lot) => [Number(lot.id), String(lot.lot_number)]));
    const allocationsByItem = new Map<number, AllocationRow[]>();
    for (const allocation of allocations ?? []) {
      const key = Number(allocation.stock_issue_item_id);
      const rows = allocationsByItem.get(key) ?? [];
      rows.push(allocation);
      allocationsByItem.set(key, rows);
    }
    const costsByTransaction = new Map<number, CostRow[]>();
    for (const cost of costs ?? []) {
      const key = Number(cost.inventory_transaction_id);
      const rows = costsByTransaction.get(key) ?? [];
      rows.push(cost);
      costsByTransaction.set(key, rows);
    }
    let displayLine = 0;
    const detailItems: StockIssueItem[] = [];
    for (const item of items ?? []) {
      const itemAllocations = allocationsByItem.get(Number(item.id)) ?? [];
      const base = { itemMasterId: Number(item.item_master_id), itemCode: String(item.item_code), itemName: String(item.item_name), unitName: String(item.unit_name) };
      if (itemAllocations.length === 0) {
        detailItems.push({ id: Number(item.id), lineNo: ++displayLine, ...base, quantity: Number(item.quantity), lotNumber: "—", unitCost: null, amount: null });
        continue;
      }
      for (const allocation of itemAllocations) {
        const allocationCosts = costsByTransaction.get(Number(allocation.inventory_transaction_id)) ?? [];
        if (allocationCosts.length === 0) {
          detailItems.push({ id: Number(allocation.id), lineNo: ++displayLine, ...base, quantity: Number(allocation.quantity), lotNumber: lotNumberById.get(Number(allocation.inventory_lot_id)) ?? "—", unitCost: null, amount: null });
          continue;
        }
        allocationCosts.forEach((cost, index) => detailItems.push({ id: Number(allocation.id) * 1000 + index, lineNo: ++displayLine, ...base, quantity: Number(cost.quantity), lotNumber: lotNumberById.get(Number(allocation.inventory_lot_id)) ?? "—", unitCost: Number(cost.unit_cost), amount: Number(cost.cost_amount) }));
      }
    }
    return {
      data: {
        canViewCost: Boolean(costPermissionRes.data),
        header: {
          id: Number(header.id), issueNumber: String(header.issue_number), documentDate: String(header.document_date),
          requesterName: String(header.requester_name), departmentId: Number(header.department_id),
          departmentName: String(header.department_name), workPoint: String(header.work_point),
          warehouseId: Number(header.warehouse_id), warehouseName: String(header.warehouse_name),
          reason: String(header.reason), status: header.status === "cancelled" ? "cancelled" as const : "posted" as const,
          createdAt: String(header.created_at), itemCount: items?.length ?? 0,
          cancellationReason: String(header.cancellation_reason ?? ""),
          cancelledAt: header.cancelled_at ? String(header.cancelled_at) : null,
          cancelledByName: String(header.cancelled_by_name ?? ""),
          reversalNumber: String(header.reversal_number ?? ""),
        } satisfies StockIssueRecord,
        items: detailItems,
        canCancel: Boolean(cancelPermissionRes.data),
      },
    };
  } catch (error) {
    console.error("getStockIssueDetailAction error:", error);
    return { error: "ไม่สามารถโหลดรายละเอียดใบเบิกได้" };
  }
}

export async function cancelStockIssueAction(id: number, reasonValue: string) {
  if (!Number.isSafeInteger(id) || id <= 0) return { error: "ข้อมูลใบเบิกไม่ถูกต้อง" };
  const validation = validateCancellationReason(reasonValue);
  if (!validation.success) return { error: validation.error };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("cancel_stock_issue", {
      p_stock_issue_id: id,
      p_reason: validation.reason,
    });
    if (error) {
      console.error("cancel_stock_issue failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
      return { error: friendlyError(error.message) };
    }
    const row = Array.isArray(data) ? data[0] : data;
    revalidatePath(PAGE_PATH);
    revalidatePath("/inventory/stock");
    return { success: true as const, reversalNumber: String(row?.reversal_number ?? "") };
  } catch (error) {
    console.error("cancelStockIssueAction error:", error);
    return { error: "ไม่สามารถยกเลิกและคืนสต็อกได้" };
  }
}
