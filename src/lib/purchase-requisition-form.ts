export type PurchaseRequisitionItemSource = "raw_material" | "item_master";

export type PurchaseRequisitionItem = {
  allowsDecimal: boolean;
  code: string;
  defaultWarehouseId?: number | null;
  description: string;
  formTemplate?: string;
  gradeName: string;
  id: number;
  isStocked?: boolean;
  lengthMm: number;
  name: string;
  source: PurchaseRequisitionItemSource;
  thicknessMm: number;
  trackingMethod?: "none" | "lot" | "serial";
  typeCode: string;
  typeName: string;
  unitId: number;
  unitName: string;
  unitSymbol: string;
  widthMm: number;
};

export type PurchaseRequisitionMaterial = PurchaseRequisitionItem;

export type PurchaseRequisitionLineInput = {
  quantity: number;
  source: PurchaseRequisitionItemSource;
  sourceId: number;
  remarks: string;
  neededByDate: string;
};

export type PurchaseRequisitionEditableRow = {
  id?: number;
  neededByDate?: string;
  note: string;
  quantity: string;
  itemKey: string;
};

export type NormalizedPurchaseRequisitionRow = Required<Pick<PurchaseRequisitionEditableRow, "id" | "neededByDate">> & Omit<PurchaseRequisitionEditableRow, "id" | "neededByDate">;
export type PurchaseRequisitionSubmission = { items: PurchaseRequisitionLineInput[]; neededByDate: string; remarks: string };
export type PurchaseRequisitionValidationResult = { success: true } | { error: string; success: false };

export function getPurchaseRequisitionItemKey(item: Pick<PurchaseRequisitionItem, "id" | "source">) {
  return `${item.source}:${item.id}`;
}

export function parsePurchaseRequisitionItemKey(value: string): { source: PurchaseRequisitionItemSource; sourceId: number } | null {
  const match = /^(raw_material|item_master):(\d+)$/.exec(value);
  if (!match) return null;
  const sourceId = Number(match[2]);
  return Number.isSafeInteger(sourceId) && sourceId > 0 ? { source: match[1] as PurchaseRequisitionItemSource, sourceId } : null;
}

export function normalizePurchaseRequisitionRows(rows: PurchaseRequisitionEditableRow[], fallbackNeededByDate: string): NormalizedPurchaseRequisitionRow[] {
  return rows.map((row, index) => ({ ...row, id: index + 1, neededByDate: row.neededByDate || fallbackNeededByDate }));
}

export function formatPurchaseRequisitionItemDescription(item: PurchaseRequisitionItem) {
  return item.description.trim() || item.name;
}

export const formatRawMaterialDescription = formatPurchaseRequisitionItemDescription;

export function getLocalTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function validatePurchaseRequisitionSubmission(input: PurchaseRequisitionSubmission, availableItems: PurchaseRequisitionItem[]): PurchaseRequisitionValidationResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.neededByDate)) return { error: "กรุณาระบุวันที่ต้องการใช้", success: false };
  if (input.neededByDate < getLocalTodayString()) return { error: "วันที่ต้องการใช้ต้องไม่เป็นวันในอดีต", success: false };
  if (input.remarks.trim().length > 300) return { error: "วัตถุประสงค์ต้องไม่เกิน 300 ตัวอักษร", success: false };
  if (input.items.length === 0) return { error: "กรุณาเพิ่มสินค้า/บริการอย่างน้อย 1 รายการ", success: false };

  const itemByKey = new Map(availableItems.map((item) => [getPurchaseRequisitionItemKey(item), item]));
  const selectedKeys = new Set<string>();
  for (const [index, line] of input.items.entries()) {
    const key = `${line.source}:${line.sourceId}`;
    if (selectedKeys.has(key)) return { error: "ไม่สามารถเพิ่มสินค้า/บริการซ้ำในใบขอซื้อได้", success: false };
    selectedKeys.add(key);
    const item = itemByKey.get(key);
    if (!item) return { error: "พบสินค้า/บริการที่ไม่มีอยู่ ไม่ได้เปิดให้ซื้อ หรือถูกปิดใช้งาน", success: false };
    if (!line.neededByDate || !/^\d{4}-\d{2}-\d{2}$/.test(line.neededByDate)) return { error: `กรุณาระบุวันที่ต้องการใช้สำหรับรายการที่ ${index + 1}`, success: false };
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) return { error: `จำนวนของ ${item.code} ต้องมากกว่า 0`, success: false };
    if (!item.allowsDecimal && !Number.isInteger(line.quantity)) return { error: `จำนวนของ ${item.code} ต้องเป็นจำนวนเต็ม`, success: false };
    if (line.remarks.trim().length > 255) return { error: `หมายเหตุของ ${item.code} ต้องไม่เกิน 255 ตัวอักษร`, success: false };
  }
  return { success: true };
}
