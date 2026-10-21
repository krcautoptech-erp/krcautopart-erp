export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type SpreadsheetCell = string | number | boolean | Date | null | undefined;

export async function createExcelBlob(rows: readonly (readonly SpreadsheetCell[])[], sheetName: string): Promise<Blob> {
  const excelModule = await import("exceljs");
  const ExcelJS = excelModule.default ?? excelModule;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  for (const row of rows) {
    if (row.some((value) => typeof value === "number" && !Number.isFinite(value))) {
      throw new Error("Spreadsheet numbers must be finite");
    }
    // Plain string cells preserve IDs and cannot become executable Excel formulas.
    sheet.addRow([...row]);
  }
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  sheet.columns.forEach((column, index) => {
    column.width = Math.min(45, Math.max(12, ...rows.slice(0, 100).map((row) => String(row[index] ?? "").length + 2)));
    column.alignment = { vertical: "top", wrapText: true };
  });
  const bytes = await workbook.xlsx.writeBuffer();
  return new Blob([new Uint8Array(bytes)], { type: XLSX_MIME });
}
