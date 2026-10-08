export type StockCountStatus = "draft" | "counting" | "review" | "recount" | "approved" | "cancelled";
export type StockCountTrackingMethod = "none" | "lot";

export type CountEntry = {
  systemQty: number;
  countedQty: number | null;
};

export type StockCountCreateInput = {
  documentDate: string;
  warehouseId: number;
  assignedTo: string;
  notes?: string;
  itemMasterIds: number[];
  selectionScope: "all" | "selected";
};

export type StockCountReviewEntry = CountEntry & { reason: string };

export function friendlyStockCountError(message: string) {
  if (message.includes("permission_denied") || message.includes("stock_count_not_assigned") || message.includes("stock_count_separation_of_duties")) return "คุณไม่มีสิทธิ์ทำรายการนี้";
  if (message.includes("stale_stock_count_snapshot")) return "ยอดสต็อกเปลี่ยนหลังสร้างรอบ กรุณายกเลิกรอบนี้แล้วสร้างใหม่";
  if (message.includes("lot_unit_cost_unavailable")) return "ไม่พบต้นทุนของ Lot ที่มียอดเพิ่ม กรุณาตรวจสอบต้นทุนก่อนอนุมัติ";
  if (message.includes("uncounted_stock_count_entries")) return "กรุณาตรวจนับให้ครบทุกรายการ";
  if (message.includes("stock_count_variance_reason_required")) return "กรุณาระบุเหตุผลของรายการที่มียอดต่าง";
  if (message.includes("invalid_stock_count_transition")) return "สถานะเอกสารเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่";
  if (message.includes("serial_stock_count_not_supported")) return "ยังไม่รองรับการตรวจนับสินค้าที่ควบคุม Serial";
  return "ไม่สามารถบันทึกรอบตรวจนับได้";
}

export function validateStockCountCreate(input: StockCountCreateInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.documentDate)) return "กรุณาระบุวันที่ตรวจนับ";
  if (!Number.isSafeInteger(input.warehouseId) || input.warehouseId <= 0) return "กรุณาเลือกคลังสินค้า";
  if (!input.assignedTo.trim()) return "กรุณาเลือกผู้ตรวจนับ";
  if (!input.itemMasterIds.length) return "กรุณาเลือกสินค้าอย่างน้อย 1 รายการ";
  if (new Set(input.itemMasterIds).size !== input.itemMasterIds.length) return "พบสินค้าซ้ำในรายการตรวจนับ";
  if (input.itemMasterIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) return "ข้อมูลสินค้าไม่ถูกต้อง";
  if (input.selectionScope !== "all" && input.selectionScope !== "selected") return "ขอบเขตรายการไม่ถูกต้อง";
  if ((input.notes?.length ?? 0) > 1000) return "หมายเหตุต้องไม่เกิน 1,000 ตัวอักษร";
  return null;
}

export function validateStockCountReview(entries: readonly StockCountReviewEntry[]) {
  if (entries.some((entry) => entry.countedQty === null)) return "กรุณาตรวจนับให้ครบทุกรายการ";
  if (entries.some((entry) => stockCountDifference(entry.systemQty, entry.countedQty!) !== 0 && !entry.reason.trim())) return "กรุณาระบุเหตุผลของรายการที่มียอดต่าง";
  return null;
}

const quantityScale = 10_000;

export function stockCountDifference(systemQty: number, countedQty: number) {
  return Math.round((countedQty - systemQty) * quantityScale) / quantityScale;
}

export function validateCountEntry(entry: CountEntry) {
  const quantity = entry.countedQty;
  if (quantity === null) return null;
  if (!Number.isFinite(quantity) || quantity < 0) return "จำนวนตรวจนับต้องไม่น้อยกว่า 0";
  if (Number(quantity.toFixed(4)) !== quantity) {
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

export function isStockCountDateInRange(date: string, startDate: string, endDate: string) {
  return (!startDate || date >= startDate) && (!endDate || date <= endDate);
}

export const stockCountStatusLabel: Record<StockCountStatus, string> = {
  draft: "ฉบับร่าง", counting: "กำลังตรวจนับ", review: "รอตรวจสอบ", recount: "ส่งกลับตรวจนับ", approved: "อนุมัติแล้ว", cancelled: "ยกเลิกแล้ว",
};

export function shouldRevealStockCountSystemQty(status: StockCountStatus) {
  return status === "review" || status === "approved" || status === "cancelled";
}

export function stockCountPrintMode(status: StockCountStatus) {
  return shouldRevealStockCountSystemQty(status) ? "result" : "blind";
}
