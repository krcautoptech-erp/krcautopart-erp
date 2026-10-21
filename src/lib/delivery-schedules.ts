import type { CellValue } from "exceljs";

export type ScheduleRow = {
  sourceRow: number;
  section: "parts" | "cu";
  erpCode: string;
  partNumber: string;
  name: string;
  unit: string;
  bag: number | null;
  box: number | null;
  job: string | number | null;
  direction: string;
  deliveries: Record<string, number>;
  forecasts: Record<string, number | null>;
};
export type DeliverySchedule = {
  period: string;
  revision: number;
  supplierCode: string;
  supplierName: string;
  sheetName: string;
  dates: string[];
  forecastMonths: string[];
  rows: ScheduleRow[];
  warnings: string[];
};
export type ScheduleArchive = {
  id: string;
  customer_id: number;
  customer_name: string;
  period: string;
  revision: number;
  supplier_code: string;
  filename: string;
  file_size: number;
  row_count: number;
  imported_by_name: string;
  created_at: string;
};

export const SCHEDULE_FILE_LIMIT = 5 * 1024 * 1024;
export function scheduleTotal(row: Pick<ScheduleRow, "deliveries">, period: string) {
  return Object.entries(row.deliveries).reduce((sum, [date, quantity]) => sum + (date.startsWith(`${period}-`) ? quantity : 0), 0);
}

function cached(value: CellValue): CellValue {
  if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value)) return value.result ?? null;
  return value;
}
function text(value: CellValue) {
  const result = cached(value);
  if (result && typeof result === "object" && "richText" in result) return result.richText.map((r) => r.text).join("").trim();
  return typeof result === "string" || typeof result === "number" ? String(result).trim() : "";
}
function quantity(value: CellValue, coordinate: string, optional = false) {
  const result = cached(value);
  if (result === null || result === undefined || result === "") {
    if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value) && !optional) throw new Error(`ไม่มีค่าที่บันทึกไว้ในสูตร ${coordinate} กรุณาบันทึกไฟล์จาก Excel ใหม่`);
    return null;
  }
  const number = typeof result === "number" ? result : typeof result === "string" && result.trim() ? Number(result.replaceAll(",", "")) : NaN;
  if (!Number.isFinite(number) || number < 0 || number > 1e12) {
    if (optional) return null;
    throw new Error(`จำนวนไม่ถูกต้องที่ ${coordinate}`);
  }
  return number;
}
function dateValue(value: CellValue): string | null {
  const result = cached(value);
  const date = result instanceof Date ? result : typeof result === "number" ? new Date(Date.UTC(1899, 11, 30) + result * 86400000) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

// shortcut: imports the supplied KRC schedule layout, add a mapped importer when another customer layout is needed.
export async function parseDeliverySchedule(bytes: Uint8Array): Promise<DeliverySchedule> {
  if (!bytes.length || bytes.length > SCHEDULE_FILE_LIMIT) throw new Error("ไฟล์ต้องเป็น .xlsx ขนาดไม่เกิน 5 MB");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(bytes as never); } catch { throw new Error("อ่านไฟล์ Excel ไม่สำเร็จ กรุณาตรวจสอบไฟล์ .xlsx"); }
  const sheet = workbook.getWorksheet("KRC");
  if (!sheet || text(sheet.getCell("B9").value) !== "STOCK CODE ERP" || text(sheet.getCell("D9").value) !== "PART NO.") throw new Error("รูปแบบไฟล์ไม่ตรงกับตารางแผนส่งมอบ KRC");
  if (sheet.rowCount > 5000 || sheet.columnCount > 300) throw new Error("ไฟล์มีขนาดตารางเกินที่รองรับ");
  const firstDate = dateValue(sheet.getCell("H10").value);
  if (!firstDate || !/^20\d{2}-\d{2}-01$/.test(firstDate)) throw new Error("วันที่เริ่มต้นในไฟล์ไม่ถูกต้อง");
  const period = firstDate.slice(0, 7);
  const dates: string[] = [];
  for (let col = 8; col <= 38; col++) {
    const date = dateValue(sheet.getCell(10, col).value);
    if (!date) throw new Error(`วันที่ในคอลัมน์ ${col} ไม่ถูกต้องหรือไม่มีค่าที่บันทึกไว้`);
    if (dates.includes(date)) throw new Error("ไฟล์มีคอลัมน์วันที่ซ้ำ");
    dates.push(date);
  }
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const forecastMonths = [41, 42, 43].map((col) => {
    const header = text(sheet.getCell(10, col).value).toLowerCase().match(/^([a-z]{3})['’ ](\d{2}|\d{4})$/);
    if (!header || !months.includes(header[1])) throw new Error("หัวเดือน Forecast ไม่ถูกต้อง");
    return `${header[2].length === 2 ? `20${header[2]}` : header[2]}-${String(months.indexOf(header[1]) + 1).padStart(2, "0")}`;
  });
  const warnings = new Set<string>();
  if (dates.some((d) => !d.startsWith(period))) warnings.add("มีวันที่นอกเดือนในไฟล์ แสดงไว้ตามต้นฉบับ แต่ไม่นับในยอดรวมเดือน");
  const rows: ScheduleRow[] = [];
  let section: ScheduleRow["section"] = "parts";
  for (let index = 13; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    const item = text(row.getCell(1).value);
    if (/FOR\s+CU/i.test(item)) section = "cu";
    const erpCode = text(row.getCell(2).value);
    if (!erpCode || !(/^\d+$/.test(item) || (section === "cu" && item === "PR"))) continue;
    const partNumber = text(row.getCell(4).value);
    if (!partNumber) throw new Error(`ไม่พบ Part No. ที่แถว ${index}`);
    const deliveries: Record<string, number> = {};
    dates.forEach((date, offset) => {
      const cell = row.getCell(8 + offset);
      const value = quantity(cell.value, cell.address);
      if (value !== null) deliveries[date] = value;
    });
    const forecasts: Record<string, number | null> = {};
    forecastMonths.forEach((month, offset) => {
      const cell = row.getCell(41 + offset);
      const value = quantity(cell.value, cell.address, true);
      const formula = cell.formula ?? "";
      // Broken lookups can have cached zero: do not present that as a reliable forecast.
      forecasts[month] = formula.includes("#REF!") ? null : value;
      if (formula || value === null) warnings.add("Forecast เป็นค่าที่บันทึกไว้จาก Excel ไม่คำนวณหรืออัปเดตลิงก์ภายนอกในระบบ");
      if (formula.includes("#REF!")) warnings.add("สูตร Forecast บางรายการอ้างอิง #REF! แสดงเป็นไม่มีข้อมูล กรุณาดูไฟล์ต้นฉบับ");
    });
    const result: ScheduleRow = {
      sourceRow: index, section, erpCode, partNumber,
      name: section === "cu" ? partNumber : text(row.getCell(3).value), unit: "ชิ้น",
      direction: section === "cu" ? text(row.getCell(3).value) : "",
      bag: section === "cu" ? null : quantity(row.getCell(5).value, `E${index}`),
      box: quantity(row.getCell(6).value, `F${index}`), job: text(row.getCell(7).value) || null, deliveries, forecasts,
    };
    const sourceTotal = quantity(row.getCell(40).value, `AN${index}`, true);
    if (sourceTotal !== null && Math.abs(sourceTotal - scheduleTotal(result, period)) > 0.0001) warnings.add("ยอดรวมบางรายการใน Excel ต่างจากผลรวมรายวันของเดือน ระบบรวมใหม่จากจำนวนรายวัน");
    rows.push(result);
  }
  const revision = quantity(sheet.getCell("AO4").value, "AO4");
  const supplierCode = text(sheet.getCell("I4").value);
  if (!rows.length || revision === null || !Number.isInteger(revision) || !supplierCode) throw new Error("ข้อมูลรายการ รหัสผู้ส่งมอบ หรือ Revision ในไฟล์ไม่ครบ");
  return { period, revision, supplierCode, supplierName: text(sheet.getCell("I3").value), sheetName: sheet.name, dates, forecastMonths, rows, warnings: [...warnings] };
}
