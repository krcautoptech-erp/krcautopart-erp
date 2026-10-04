"use server";

import { revalidatePath } from "next/cache";
import {
  friendlyStockCountError,
  validateCountEntry,
  validateStockCountCreate,
  type StockCountCreateInput,
  type StockCountStatus,
  type StockCountTrackingMethod,
} from "@/lib/stock-counts";
import { sendStockCountPush } from "@/lib/web-push.server";
import { createClient } from "@/utils/supabase/server";

export type StockCountListRecord = {
  id: number;
  countNumber: string;
  documentDate: string;
  warehouseName: string;
  assignedToName: string;
  status: StockCountStatus;
  itemCount: number;
  lotCount: number;
  completedCount: number;
  varianceCount: number;
  snapshotAt: string;
  notes: string;
  createdByName: string;
};
export type StockCountLotRecord = {
  id: number;
  inventoryLotId: number | null;
  lotNumber: string;
  receivedAt: string | null;
  expiryDate: string | null;
  systemQty: number;
  countedQty: number | null;
  differenceQty: number | null;
  reason: string;
};
export type StockCountItemGroup = {
  id: number;
  lineNo: number;
  itemMasterId: number;
  itemCode: string;
  itemName: string;
  unitName: string;
  trackingMethod: StockCountTrackingMethod;
  systemQty: number;
  lots: StockCountLotRecord[];
};
export type StockCountDetail = {
  header: StockCountListRecord & {
    notes: string;
    createdByName: string;
    createdAt: string;
    returnReason: string;
    approvalReason: string;
    cancellationReason: string;
    adjustmentNumber: string;
    adjustmentStatus: string;
    adjustmentReversalNumber: string;
    selectionScope: "all" | "selected";
  };
  items: StockCountItemGroup[];
};
export type StockCountOption = {
  id: number;
  code: string;
  name: string;
  unitName: string;
  trackingMethod: StockCountTrackingMethod;
  onHandQty: number;
  lotCount: number;
};
export type StockCountCreateOptions = {
  warehouses: Array<{ id: number; name: string }>;
  assignees: Array<{ id: string; name: string }>;
  items: StockCountOption[];
};
export type StockCountEntryInput = {
  id: number;
  countedQty: number | null;
  reason: string;
};

const PAGE_PATH = "/inventory/stock-counts";
const safeId = (id: number) => Number.isSafeInteger(id) && id > 0;
const refresh = (id?: number) => {
  revalidatePath(PAGE_PATH);
  if (id) revalidatePath(`${PAGE_PATH}/${id}`);
};

export async function getStockCountsAction(search = "") {
  const supabase = await createClient();
  let query = supabase
    .from("stock_counts")
    .select(
      "*,stock_count_lines(id,stock_count_lots(id,counted_qty,difference_qty))",
    )
    .order("document_date", { ascending: false })
    .order("id", { ascending: false })
    .limit(500);
  if (search.trim())
    query = query.or(
      `count_number.ilike.%${search.trim().slice(0, 100)}%,warehouse_name.ilike.%${search.trim().slice(0, 100)}%,assigned_to_name.ilike.%${search.trim().slice(0, 100)}%`,
    );
  const { data, error } = await query;
  if (error) return { error: friendlyStockCountError(error.message) };
  return {
    data: (data ?? []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const lines = (row.stock_count_lines ?? []) as Array<
        Record<string, unknown>
      >;
      const lots = lines.flatMap(
        (line) =>
          (line.stock_count_lots ?? []) as Array<Record<string, unknown>>,
      );
      return {
        id: Number(row.id),
        countNumber: String(row.count_number),
        documentDate: String(row.document_date),
        warehouseName: String(row.warehouse_name),
        assignedToName: String(row.assigned_to_name),
        status: row.status as StockCountStatus,
        itemCount: lines.length,
        lotCount: lots.length,
        completedCount: lots.filter((lot) => lot.counted_qty !== null).length,
        varianceCount: lots.filter(
          (lot) =>
            lot.difference_qty !== null && Number(lot.difference_qty) !== 0,
        ).length,
        snapshotAt: String(row.snapshot_at),
        notes: String(row.notes ?? ""),
        createdByName: String(row.created_by_name ?? "-"),
      };
    }) satisfies StockCountListRecord[],
  };
}

export async function getStockCountCreateOptionsAction(
  warehouseId?: number,
  search = "",
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_stock_count_form_options", {
    p_warehouse_id: warehouseId || null,
    p_search: search.trim().slice(0, 100) || null,
  });
  if (error) return { error: friendlyStockCountError(error.message) };
  const value = (data ?? {}) as Record<string, unknown>;
  const rows = (key: string) =>
    Array.isArray(value[key])
      ? (value[key] as Array<Record<string, unknown>>)
      : [];
  return {
    data: {
      warehouses: rows("warehouses").map((row) => ({
        id: Number(row.id),
        name: String(row.name),
      })),
      assignees: rows("assignees").map((row) => ({
        id: String(row.id),
        name: String(row.name),
      })),
      items: rows("items").map((row) => ({
        id: Number(row.id),
        code: String(row.code),
        name: String(row.name),
        unitName: String(row.unitName),
        trackingMethod: row.trackingMethod as StockCountTrackingMethod,
        onHandQty: Number(row.onHandQty),
        lotCount: Number(row.lotCount),
      })),
    } satisfies StockCountCreateOptions,
  };
}

export async function createStockCountAction(input: StockCountCreateInput) {
  const validation = validateStockCountCreate(input);
  if (validation) return { error: validation };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_stock_count", {
    p_document_date: input.documentDate,
    p_warehouse_id: input.warehouseId,
    p_assigned_to: input.assignedTo,
    p_notes: input.notes?.trim() || null,
    p_item_ids: input.itemMasterIds,
    p_selection_scope: input.selectionScope,
  });
  if (error) return { error: friendlyStockCountError(error.message) };
  const row = Array.isArray(data) ? data[0] : data;
  const id = Number(row?.stock_count_id);
  if (Number.isSafeInteger(id) && id > 0) {
    await sendStockCountPush(supabase, { entityId: id, eventKey: "assigned" });
  }
  refresh(id);
  return {
    success: true as const,
    id,
    countNumber: String(row?.count_number ?? ""),
  };
}

export async function getStockCountDetailAction(id: number) {
  if (!safeId(id)) return { error: "ข้อมูลรอบตรวจนับไม่ถูกต้อง" };
  const supabase = await createClient();
  const [
    { data: header, error: headerError },
    { data: lines, error: lineError },
  ] = await Promise.all([
    supabase
      .from("stock_counts")
      .select("*,stock_adjustments(adjustment_number,status,reversal_number)")
      .eq("id", id)
      .single(),
    supabase
      .from("stock_count_lines")
      .select("*,stock_count_lots(*)")
      .eq("stock_count_id", id)
      .order("line_no"),
  ]);
  if (headerError || lineError || !header) return { error: "ไม่พบรอบตรวจนับ" };
  const h = header as Record<string, unknown>;
  const rawLines = (lines ?? []) as Array<Record<string, unknown>>;
  const items = rawLines.map((line) => ({
    id: Number(line.id),
    lineNo: Number(line.line_no),
    itemMasterId: Number(line.item_master_id),
    itemCode: String(line.item_code),
    itemName: String(line.item_name),
    unitName: String(line.unit_name),
    trackingMethod: line.tracking_method as StockCountTrackingMethod,
    systemQty: Number(line.system_qty),
    lots: ((line.stock_count_lots ?? []) as Array<Record<string, unknown>>).map(
      (lot) => ({
        id: Number(lot.id),
        inventoryLotId:
          lot.inventory_lot_id === null ? null : Number(lot.inventory_lot_id),
        lotNumber: String(lot.lot_number ?? ""),
        receivedAt: lot.received_at ? String(lot.received_at) : null,
        expiryDate: lot.expiry_date ? String(lot.expiry_date) : null,
        systemQty: Number(lot.system_qty),
        countedQty: lot.counted_qty === null ? null : Number(lot.counted_qty),
        differenceQty:
          lot.difference_qty === null ? null : Number(lot.difference_qty),
        reason: String(lot.reason ?? ""),
      }),
    ),
  })) satisfies StockCountItemGroup[];
  const lots = items.flatMap((item) => item.lots);
  const adjustment = Array.isArray(h.stock_adjustments)
    ? h.stock_adjustments[0]
    : (h.stock_adjustments as Record<string, unknown> | null);
  const base: StockCountListRecord = {
    id: Number(h.id),
    countNumber: String(h.count_number),
    documentDate: String(h.document_date),
    warehouseName: String(h.warehouse_name),
    assignedToName: String(h.assigned_to_name),
    status: h.status as StockCountStatus,
    itemCount: items.length,
    lotCount: lots.length,
    completedCount: lots.filter((lot) => lot.countedQty !== null).length,
    varianceCount: lots.filter(
      (lot) => lot.differenceQty !== null && lot.differenceQty !== 0,
    ).length,
    snapshotAt: String(h.snapshot_at),
    notes: String(h.notes ?? ""),
    createdByName: String(h.created_by_name ?? "-"),
  };
  return {
    data: {
      header: {
        ...base,
        notes: String(h.notes ?? ""),
        createdByName: String(h.created_by_name),
        createdAt: String(h.created_at),
        returnReason: String(h.return_reason ?? ""),
        approvalReason: String(h.approval_reason ?? ""),
        cancellationReason: String(h.cancellation_reason ?? ""),
        adjustmentNumber: String(adjustment?.adjustment_number ?? ""),
        adjustmentStatus: String(adjustment?.status ?? ""),
        adjustmentReversalNumber: String(adjustment?.reversal_number ?? ""),
        selectionScope: h.selection_scope === "selected" ? "selected" : "all",
      },
      items,
    } satisfies StockCountDetail,
  };
}

async function statusAction(
  id: number,
  rpc: "start_stock_count" | "submit_stock_count",
  permissionError = "ไม่สามารถเปลี่ยนสถานะได้",
) {
  if (!safeId(id)) return { error: "ข้อมูลรอบตรวจนับไม่ถูกต้อง" };
  const supabase = await createClient();
  const { error } = await supabase.rpc(rpc, { p_stock_count_id: id });
  if (error)
    return { error: friendlyStockCountError(error.message) || permissionError };
  if (rpc === "submit_stock_count") {
    await sendStockCountPush(supabase, { entityId: id, eventKey: "submitted" });
  }
  refresh(id);
  return { success: true as const };
}
export async function startStockCountAction(id: number) {
  return statusAction(id, "start_stock_count");
}
export async function submitStockCountAction(id: number) {
  return statusAction(id, "submit_stock_count");
}

export async function saveStockCountEntriesAction(
  id: number,
  entries: StockCountEntryInput[],
) {
  if (
    !safeId(id) ||
    !Array.isArray(entries) ||
    entries.some(
      (entry) =>
        !safeId(entry.id) ||
        validateCountEntry({ systemQty: 0, countedQty: entry.countedQty }) ||
        entry.reason.length > 500,
    ) ||
    new Set(entries.map((entry) => entry.id)).size !== entries.length
  )
    return { error: "ข้อมูลตรวจนับไม่ถูกต้อง" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_stock_count_entries", {
    p_stock_count_id: id,
    p_entries: entries.map((entry) => ({
      id: entry.id,
      counted_qty: entry.countedQty,
      reason: entry.reason.trim() || null,
    })),
  });
  if (error) return { error: friendlyStockCountError(error.message) };
  refresh(id);
  return {
    success: true as const,
    progress: data as { completed: number; total: number },
  };
}

async function reasonAction(
  id: number,
  reason: string,
  rpc: "return_stock_count" | "cancel_stock_count" | "approve_stock_count",
) {
  if (!safeId(id) || !reason.trim() || reason.trim().length > 500)
    return { error: "กรุณาระบุเหตุผล" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(rpc, {
    p_stock_count_id: id,
    p_reason: reason.trim(),
  });
  if (error) return { error: friendlyStockCountError(error.message) };
  await sendStockCountPush(supabase, {
    entityId: id,
    eventKey:
      rpc === "approve_stock_count"
        ? "approved"
        : rpc === "cancel_stock_count"
          ? "cancelled"
          : "rejected",
  });
  refresh(id);
  if (rpc === "approve_stock_count") {
    revalidatePath("/inventory/stock");
    revalidatePath("/inventory/adjustments");
    revalidatePath("/reports/inventory");
  }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    success: true as const,
    adjustmentNumber: String(row?.adjustment_number ?? ""),
  };
}
export async function returnStockCountAction(id: number, reason: string) {
  return reasonAction(id, reason, "return_stock_count");
}
export async function cancelStockCountAction(id: number, reason: string) {
  return reasonAction(id, reason, "cancel_stock_count");
}
export async function approveStockCountAction(id: number, reason: string) {
  return reasonAction(id, reason, "approve_stock_count");
}
