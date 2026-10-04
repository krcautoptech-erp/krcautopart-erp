import type { CellValue } from "exceljs";

export type SpreadsheetData = { headers: string[]; rows: string[][] };

export const normalizeSpreadsheetHeader = (value: string) => value.trim().toLowerCase().replace(/[\s._()\-/]/g, "");

export function spreadsheetRecords({ headers, rows }: SpreadsheetData) {
  const keys = headers.map(normalizeSpreadsheetHeader);
  return rows.map((row) => Object.fromEntries(keys.map((key, index) => [key, row[index]?.trim() ?? ""])));
}

export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (char === '"' && quoted && content[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && content[index + 1] === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }

  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseSpreadsheetXml(content: string): string[][] {
  const xml = new DOMParser().parseFromString(content, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("ไฟล์ Excel ไม่ถูกต้อง");

  return Array.from(xml.getElementsByTagName("Row")).map((rowNode) => {
    const row: string[] = [];
    let column = 0;
    for (const cell of Array.from(rowNode.getElementsByTagName("Cell"))) {
      const index = cell.getAttribute("ss:Index") || cell.getAttribute("Index");
      if (index) column = Number(index) - 1;
      row[column] = cell.getElementsByTagName("Data")[0]?.textContent?.trim() ?? "";
      column += 1;
    }
    return Array.from({ length: row.length }, (_, index) => row[index] ?? "");
  });
}

export async function readSpreadsheet(file: File): Promise<SpreadsheetData> {
  const extension = file.name.toLowerCase().split(".").pop();
  let matrix: string[][];

  if (extension === "csv") matrix = parseCsv((await file.text()).replace(/^\uFEFF/, ""));
  else if (extension === "xlsx") {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    matrix = [];
    sheet?.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as CellValue[];
      matrix.push(values.slice(1).map((value) => String(value ?? "").trim()));
    });
  } else if (extension === "xls" || extension === "xml") {
    matrix = parseSpreadsheetXml(await file.text());
  } else throw new Error("รองรับเฉพาะไฟล์ .xlsx และ .csv (.xls เดิมของระบบยังรองรับ)");

  const [headers = [], ...rows] = matrix.filter((row) => row.some((cell) => cell.trim()));
  if (!headers.length || !rows.length) throw new Error("ไฟล์ไม่มีหัวตารางหรือข้อมูลสำหรับนำเข้า");
  return { headers, rows };
}

export function downloadCsvTemplate(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
