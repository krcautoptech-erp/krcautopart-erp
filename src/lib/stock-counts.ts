export type StockCountStatus = "draft" | "counting" | "review" | "recount" | "approved" | "cancelled";
export type StockCountTrackingMethod = "none" | "lot";

export type CountEntry = {
  systemQty: number;
  countedQty: number | null;
};

const quantityScale = 10_000;

export function stockCountDifference(systemQty: number, countedQty: number) {
  return Math.round((countedQty - systemQty) * quantityScale) / quantityScale;
}

export function validateCountEntry(entry: CountEntry) {
  const quantity = entry.countedQty;
  if (quantity === null) return null;
  if (!Number.isFinite(quantity) || quantity < 0) return "จำนวนตรวจนับต้องไม่น้อยกว่า 0";
  if (Math.abs(quantity * quantityScale - Math.round(quantity * quantityScale)) >= 1e-7) {
    return "จำนวนตรวจนับต้องมีทศนิยมไม่เกิน 4 ตำแหน่ง";
  }
  return null;
}

const transitions: Record<StockCountStatus, readonly StockCountStatus[]> = {
  draft: ["counting", "cancelled"],
  counting: ["review", "cancelled"],
  review: ["approved", "recount", "cancelled"],
  recount: ["counting", "cancelled"],
  approved: [],
  cancelled: [],
};

export function canTransitionStockCount(from: StockCountStatus, to: StockCountStatus) {
  return transitions[from].includes(to);
}

export function stockCountProgress(entries: readonly CountEntry[]) {
  return { completed: entries.filter((entry) => entry.countedQty !== null).length, total: entries.length };
}
