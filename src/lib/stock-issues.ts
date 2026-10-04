export type IssueCostLayer = { quantity: number; unitCost: number };
export type IssueLot = { id: number; lotNumber: string; receivedAt: string; onHandQty: number; costLayers?: IssueCostLayer[] };
export type IssueAllocation = { lotId: number; quantity: number };
export type IssueCostRow = { lotId: number; lotNumber: string; quantity: number; unitCost: number | null; amount: number | null };
export type StockIssueHistorySource = {
  createdAt: string;
  createdByName: string;
  cancelledAt?: string | null;
  cancelledByName?: string | null;
  cancellationReason?: string | null;
  reversalNumber?: string | null;
};

export function getStockRequestLineNumbers() {
  return Array.from({ length: 8 }, (_, index) => index + 1);
}

export function buildStockIssueHistory(source: StockIssueHistorySource) {
  const rows = [{ at: source.createdAt, event: "บันทึกตัดสต็อก", actor: source.createdByName, note: "—" }];
  if (source.cancelledAt) rows.push({
    at: source.cancelledAt,
    event: "ยกเลิกและคืนสต็อก",
    actor: source.cancelledByName || "—",
    note: [source.reversalNumber, source.cancellationReason].filter(Boolean).join(" · ") || "—",
  });
  return rows;
}

export function formatIssueLotNumber(value: string) {
  return value.replace(/^LOT(?=\d)/i, "");
}

export function projectIssueCostRows(lots: IssueLot[], allocations: IssueAllocation[], canViewCost: boolean): IssueCostRow[] {
  const result: IssueCostRow[] = [];
  for (const allocation of allocations) {
    const lot = lots.find((item) => item.id === allocation.lotId);
    if (!canViewCost || !lot?.costLayers?.length) {
      result.push({ lotId: allocation.lotId, lotNumber: lot?.lotNumber ?? "—", quantity: allocation.quantity, unitCost: null, amount: null });
      continue;
    }
    let remaining = allocation.quantity;
    for (const layer of lot.costLayers) {
      const quantity = Math.min(remaining, layer.quantity);
      remaining = Math.max(0, remaining - quantity);
      if (quantity > 0) result.push({ lotId: allocation.lotId, lotNumber: lot.lotNumber, quantity, unitCost: layer.unitCost, amount: quantity * layer.unitCost });
    }
    if (remaining > 0) result.push({ lotId: allocation.lotId, lotNumber: lot.lotNumber, quantity: remaining, unitCost: null, amount: null });
  }
  return result;
}

// A later Lot is a FIFO exception only when an earlier Lot is left unconsumed.
export function skipsIssueFifo(lots: IssueLot[], allocations: IssueAllocation[]) {
  let earlierRemaining = false;
  for (const lot of lots) {
    const taken = allocations.find((allocation) => allocation.lotId === lot.id)?.quantity ?? 0;
    if (taken > 0 && earlierRemaining) return true;
    if (taken < lot.onHandQty) earlierRemaining = true;
  }
  return false;
}

export function suggestIssueLots(lots: IssueLot[], quantity: number): IssueAllocation[] {
  let remaining = quantity;
  return lots.flatMap((lot) => {
    const take = Math.min(Math.max(remaining, 0), lot.onHandQty);
    remaining = Math.round((remaining - take) * 10000) / 10000;
    return take > 0 ? [{ lotId: lot.id, quantity: take }] : [];
  });
}

export type StockIssueDraft = {
  issueNumber?: string;
  documentDate: string;
  requesterName: string;
  departmentId: number;
  workPoint: string;
  warehouseId: number;
  reason: string;
  items: Array<{
    itemMasterId: number;
    quantity: number;
    onHandQty: number;
    allocations?: IssueAllocation[];
    fifoOverrideReason?: string;
  }>;
};

export function validateStockIssueDraft(draft: StockIssueDraft) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.documentDate)) return "กรุณาระบุวันที่เบิก";
  if (!draft.requesterName.trim()) return "กรุณาระบุผู้เบิก";
  if (!Number.isSafeInteger(draft.departmentId) || draft.departmentId <= 0) return "กรุณาระบุหน่วยงาน";
  if (!draft.workPoint.trim()) return "กรุณาระบุงานหรือจุดใช้งาน";
  if (!Number.isSafeInteger(draft.warehouseId) || draft.warehouseId <= 0) return "กรุณาระบุคลังจ่าย";
  if (draft.reason.trim().length > 500) return "เหตุผลการเบิกต้องไม่เกิน 500 ตัวอักษร";
  if (draft.items.length === 0) return "กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ";

  const itemIds = new Set<number>();
  for (const item of draft.items) {
    if (itemIds.has(item.itemMasterId)) return "ไม่สามารถเพิ่มสินค้าซ้ำในใบเบิกเดียวกันได้";
    itemIds.add(item.itemMasterId);
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) return "จำนวนเบิกต้องมากกว่า 0";
    if (item.quantity > item.onHandQty) return "จำนวนเบิกต้องไม่เกินยอดคงเหลือ";
    if (item.allocations) {
      const ids = new Set<number>();
      for (const allocation of item.allocations) {
        if (!Number.isSafeInteger(allocation.lotId) || allocation.lotId <= 0 || ids.has(allocation.lotId) || !Number.isFinite(allocation.quantity) || allocation.quantity <= 0) return "ข้อมูลจัดสรร Lot ไม่ถูกต้อง";
        ids.add(allocation.lotId);
      }
      if (Math.abs(item.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) - item.quantity) > 0.00001) return "ยอดจัดสรร Lot ต้องเท่ากับจำนวนเบิก";
    }
  }
  return null;
}

export function formatIssueQuantity(value: number) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 4 }).format(value);
}

export function getStockIssueCreateActions(savedIssueNumber: string | null) {
  const saved = Boolean(savedIssueNumber);
  return { canPrint: saved, canCreateNext: saved, canSave: !saved };
}
