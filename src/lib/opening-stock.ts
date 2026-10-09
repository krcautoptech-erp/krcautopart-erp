import { normalizeSpreadsheetHeader, type SpreadsheetData } from "./spreadsheet-import.ts";

export type OpeningRow = { itemCode: string; lotNumber: string; expiryDate: string; quantity: string; unitCost: string; notes: string };
export type OpeningItem = { id: number; code: string; name: string; unitName: string; trackingMethod: string; expiryControlled: boolean; allowsDecimal: boolean };
export type OpeningStatus = "draft" | "review" | "posted" | "reversed" | "cancelled";
export const OPENING_STATUS: Record<OpeningStatus, string> = { draft: "ฉบับร่าง", review: "รอตรวจสอบ", posted: "ลงยอดแล้ว", reversed: "กลับรายการแล้ว", cancelled: "ยกเลิก" };
export const emptyOpeningRow = (itemCode = ""): OpeningRow => ({ itemCode, lotNumber: "", expiryDate: "", quantity: "", unitCost: "", notes: "" });

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function decimal(value: string, positive: boolean) {
  return /^\d+(\.\d{1,4})?$/.test(value.trim()) && Number.isFinite(Number(value)) && Number(value) < 1e9 && (positive ? Number(value) > 0 : Number(value) >= 0);
}
export function validateOpeningHeader(warehouseId: number, date: string, reference: string, notes: string, today: string) {
  if (!Number.isSafeInteger(warehouseId) || warehouseId <= 0) return "กรุณาเลือกคลังสินค้า";
  if (!validDate(date) || date > today || date < "2000-01-01") return "วันที่ตัดยอดไม่ถูกต้องหรือล่วงหน้า";
  if (!reference.trim() || reference.trim().length > 100) return "กรุณาระบุเอกสารอ้างอิงไม่เกิน 100 ตัวอักษร";
  if (notes.length > 1000) return "หมายเหตุยาวเกิน 1,000 ตัวอักษร";
  return null;
}
export function validateOpeningRows(rows: OpeningRow[], catalog: OpeningItem[], date: string) {
  const items = new Map(catalog.map((item) => [item.code.toUpperCase(), item]));
  const keys = rows.map((row) => `${row.itemCode.trim().toUpperCase()}\u0000${row.lotNumber.trim()}`);
  const counts = new Map<string, number>();
  keys.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1));
  const excessiveValue = openingTotals(rows).value > 1e12;
  return rows.map((row, index) => {
    const errors: string[] = [];
    const item = items.get(row.itemCode.trim().toUpperCase());
    if (!item) errors.push("ไม่พบสินค้าที่ใช้งานและเก็บสต็อก");
    if (item?.trackingMethod === "serial") errors.push("ยังไม่รองรับสินค้าควบคุม Serial");
    if (item?.trackingMethod === "lot" && !row.lotNumber.trim()) errors.push("กรุณาระบุ Lot");
    if (item?.trackingMethod === "none" && row.lotNumber.trim()) errors.push("สินค้านี้ไม่ควบคุม Lot");
    if (row.lotNumber.trim().length > 100 || row.notes.length > 500) errors.push("Lot หรือหมายเหตุยาวเกินกำหนด");
    if ((counts.get(keys[index]) ?? 0) > 1) errors.push("สินค้าและ Lot ซ้ำ");
    if (!decimal(row.quantity, true)) errors.push("จำนวนต้องมากกว่า 0 และทศนิยมไม่เกิน 4 ตำแหน่ง");
    else if (item && !item.allowsDecimal && !Number.isInteger(Number(row.quantity))) errors.push("หน่วยนี้ต้องเป็นจำนวนเต็ม");
    if (!decimal(row.unitCost, false)) errors.push("ระบุต้นทุนตั้งแต่ 0 และทศนิยมไม่เกิน 4 ตำแหน่ง");
    if (excessiveValue) errors.push("มูลค่ารวมเกินวงเงินที่ระบบรองรับ");
    if (item?.expiryControlled && !row.expiryDate) errors.push("กรุณาระบุวันหมดอายุ");
    if (row.expiryDate && (!validDate(row.expiryDate) || row.expiryDate < date)) errors.push("วันหมดอายุไม่ถูกต้องหรือก่อนวันตัดยอด");
    return errors;
  });
}
export function openingLineValue(row: OpeningRow) {
  if (!decimal(row.quantity, true) || !decimal(row.unitCost, false)) return 0;
  const scaled = (value: string) => { const [whole, fraction = ""] = value.trim().split("."); return BigInt(whole) * BigInt(10000) + BigInt(fraction.padEnd(4, "0")); };
  return Number((scaled(row.quantity) * scaled(row.unitCost) + BigInt(500000)) / BigInt(1000000)) / 100;
}
export function openingTotals(rows: OpeningRow[]) {
  return { lines: rows.length, items: new Set(rows.map((row) => row.itemCode.trim().toUpperCase()).filter(Boolean)).size,
    value: rows.reduce((sum, row) => sum + Math.round(openingLineValue(row) * 100), 0) / 100 };
}
export function openingRowsFromSpreadsheet(data: SpreadsheetData): OpeningRow[] {
  if (data.rows.length > 500) throw new Error("นำเข้าได้ไม่เกิน 500 รายการต่อชุด");
  const headers = data.headers.map(normalizeSpreadsheetHeader);
  const fields = { itemCode: "รหัสสินค้า", lotNumber: "lot", expiryDate: "วันหมดอายุ", quantity: "จำนวน", unitCost: "ต้นทุนต่อหน่วย", notes: "หมายเหตุ" };
  for (const required of ["รหัสสินค้า", "จำนวน", "ต้นทุนต่อหน่วย"]) {
    if (headers.filter((header) => header === required).length !== 1) throw new Error(`หัวตารางไม่ถูกต้อง: ${required} กรุณาใช้ Template ของระบบ`);
  }
  return data.rows.map((values) => Object.fromEntries(Object.entries(fields).map(([key, header]) => [key, (values[headers.indexOf(header)] ?? "").trim()])) as OpeningRow);
}
