import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, spreadsheetRecords, readSpreadsheet } from "./spreadsheet-import.ts";

test("parses quoted commas, escaped quotes and line breaks", () => {
  assert.deepEqual(parseCsv('code,name,note\nRM01,"Steel, sheet","say ""ok"""\n'), [
    ["code", "name", "note"],
    ["RM01", "Steel, sheet", 'say "ok"'],
  ]);
});

test("normalizes spreadsheet headers into records", () => {
  assert.deepEqual(spreadsheetRecords({ headers: ["รหัสสินค้า", "Item Code"], rows: [["RM01", "A-1"]] }), [{ รหัสสินค้า: "RM01", itemcode: "A-1" }]);
});

test("reads Excel date cells as ISO dates for import validation", async () => {
  const excelModule = await import("exceljs");
  const ExcelJS = excelModule.default ?? excelModule;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Stock");
  sheet.addRow(["วันหมดอายุ"]);
  sheet.addRow([new Date("2027-01-02T00:00:00Z")]);
  const bytes = await workbook.xlsx.writeBuffer();
  const file = new File([new Uint8Array(bytes)], "stock.xlsx");
  assert.deepEqual(await readSpreadsheet(file), { headers: ["วันหมดอายุ"], rows: [["2027-01-02"]] });
});
