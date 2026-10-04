export type StockAdjustmentDraft = {
  adjustmentNumber: string;
  documentDate: string;
  warehouseId: number;
  reason: string;
  notes: string;
  items: Array<{
    itemMasterId: number;
    systemQty: number;
    countedQty: number;
    positiveUnitCost: number | null;
  }>;
};

const quantityScale = 10_000;

export function adjustmentDifference(systemQty: number, countedQty: number) {
  return Math.round((countedQty - systemQty) * quantityScale) / quantityScale;
}

function hasFourDecimals(value: number) {
  return Number.isFinite(value) && Math.abs(value * quantityScale - Math.round(value * quantityScale)) < 1e-7;
}

export function validateStockAdjustmentDraft(draft: StockAdjustmentDraft) {
  if (!draft.adjustmentNumber.trim()) return "ระบบยังไม่สามารถสร้างเลขใบปรับปรุงได้";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.documentDate)) return "กรุณาระบุวันที่ปรับปรุง";
  if (!Number.isSafeInteger(draft.warehouseId) || draft.warehouseId <= 0) return "กรุณาระบุคลังสินค้า";
  if (!draft.reason.trim()) return "กรุณาระบุเหตุผลการปรับปรุง";
  if (draft.reason.trim().length > 500 || draft.notes.trim().length > 1000) return "เหตุผลหรือหมายเหตุยาวเกินกำหนด";
  if (draft.items.length === 0) return "กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ";

  const ids = new Set<number>();
  let changed = false;
  for (const item of draft.items) {
    if (!Number.isSafeInteger(item.itemMasterId) || item.itemMasterId <= 0) return "ข้อมูลสินค้าไม่ถูกต้อง";
    if (ids.has(item.itemMasterId)) return "ไม่สามารถเพิ่มสินค้าซ้ำในใบปรับปรุงเดียวกันได้";
    ids.add(item.itemMasterId);
    if (!Number.isFinite(item.countedQty) || item.countedQty < 0) return "จำนวนตรวจนับต้องไม่น้อยกว่า 0";
    if (!hasFourDecimals(item.countedQty)) return "จำนวนตรวจนับต้องมีทศนิยมไม่เกิน 4 ตำแหน่ง";
    const difference = adjustmentDifference(item.systemQty, item.countedQty);
    changed ||= difference !== 0;
    if (difference > 0 && (!Number.isFinite(item.positiveUnitCost) || Number(item.positiveUnitCost) < 0)) return "กรุณาระบุต้นทุนต่อหน่วยสำหรับยอดปรับเพิ่ม";
  }
  return changed ? null : "ต้องมีอย่างน้อยหนึ่งรายการที่ยอดตรวจนับต่างจากยอดในระบบ";
}
