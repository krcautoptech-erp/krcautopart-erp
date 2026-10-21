import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import * as exporter from "./spreadsheet-export.ts";
import { readSpreadsheet } from "./spreadsheet-import.ts";

test("real XLSX round-trips Thai, leading zeros, numeric cells and literal formula-like text", async () => {
  assert.equal(typeof exporter.createExcelBlob, "function");
  const matrix = [["รหัส", "ชื่อ", "จำนวน", "หมายเหตุ"], ["00042", "วัสดุ & <ไทย>\nบรรทัดสอง", 12.5, '=HYPERLINK("https://example.com")'], ["001", "", 0, "+123"]];
  const blob = await exporter.createExcelBlob(matrix, "รายการสินค้า");
  assert.equal(blob.type, exporter.XLSX_MIME);
  const bytes = await blob.arrayBuffer();
  assert.deepEqual(Array.from(new Uint8Array(bytes).slice(0, 4)), [80, 75, 3, 4]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.getWorksheet("รายการสินค้า")!;
  assert.equal(sheet.rowCount, 3);
  assert.equal(sheet.getCell("A2").value, "00042");
  assert.equal(sheet.getCell("B2").value, "วัสดุ & <ไทย>\nบรรทัดสอง");
  assert.equal(sheet.getCell("C2").value, 12.5);
  assert.equal(sheet.getCell("C3").value, 0);
  assert.equal(sheet.getCell("D2").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("D2").value, matrix[1][3]);
  assert.equal(sheet.getCell("A1").font.bold, true);
  const imported = await readSpreadsheet(new File([blob], "items.xlsx"));
  assert.equal(imported.rows[0][0], "00042");
  assert.equal(imported.rows[0][2], "12.5");
});

test("XLSX supports header-only empty exports and rejects non-finite numbers", async () => {
  assert.equal(typeof exporter.createExcelBlob, "function");
  const blob = await exporter.createExcelBlob([["รหัส", "ชื่อ"]], "ข้อมูล");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  assert.equal(workbook.worksheets[0].rowCount, 1);
  await assert.rejects(exporter.createExcelBlob([["จำนวน"], [Number.NaN]], "ข้อมูล"), /finite/);
});
