import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ExcelJS from "exceljs";
import { filterScheduleRows, parseDeliverySchedule, scheduleTotal, type ScheduleRow } from "./delivery-schedules.ts";

test("schedule filters distinguish monthly deliveries and forecasts without mutating source rows", () => {
  const make = (sourceRow: number, deliveries: Record<string, number>, forecasts: Record<string, number | null> = {}): ScheduleRow => ({ sourceRow, section: "parts", partNumber: `P${sourceRow}`, name: "BRKT", erpCode: "ERP", direction: "", unit: "ชิ้น", bag: null, box: null, job: null, deliveries, forecasts });
  const rows = [make(1, { "2026-11-01": 99 }, { "2026-11": 20 }), make(2, { "2026-10-02": 10 }), make(3, { "2026-10-20": 30 }, { "2026-11": 0 }), make(4, { "2026-10-02": 0 }, { "2026-11": null })];
  const filters = { period: "2026-10", section: "parts", search: "", withDeliveries: true, withForecast: false, sort: "source" };
  const ids = (options = {}) => filterScheduleRows(rows, { ...filters, ...options }).map((row) => row.sourceRow);
  assert.deepEqual(ids(), [2, 3]);
  assert.deepEqual(ids({ sort: "quantity" }), [3, 2]);
  assert.deepEqual(ids({ withDeliveries: false, withForecast: true }), [1]);
  assert.deepEqual(ids({ withForecast: true }), []);
  assert.deepEqual(ids({ withDeliveries: false, search: " p3 " }), [3]);
  assert.deepEqual(ids({ withDeliveries: false }), [1, 2, 3, 4]);
  assert.deepEqual(rows.map((row) => row.sourceRow), [1, 2, 3, 4]);
});

test("archives the actual KRC workbook without treating forecasts or CU as sales", async () => {
  const bytes = await readFile(new URL("../../docs/KRCA001_Apr 2026 Rev.2.xlsx", import.meta.url));
  const plan = await parseDeliverySchedule(bytes);
  assert.equal(plan.period, "2026-04");
  assert.equal(plan.revision, 2);
  assert.equal(plan.supplierCode, "KRCA001");
  assert.equal(plan.rows.filter((r) => r.section === "parts").length, 156);
  assert.equal(plan.rows.filter((r) => r.section === "cu").length, 4);
  const flange = plan.rows.find((r) => r.partNumber === "14075-3XN0B-01")!;
  assert.equal(flange.deliveries["2026-04-02"], 450);
  assert.equal(flange.deliveries["2026-04-04"], 900);
  assert.equal(flange.deliveries["2026-04-24"], 450);
  assert.equal(scheduleTotal(flange, plan.period), 1800);
  assert.equal(flange.forecasts["2026-05"], 2873.2000000000003);
  assert.ok(plan.warnings.some((w) => w.includes("นอกเดือน")));
  assert.ok(plan.warnings.some((w) => w.includes("Forecast")));
});

test("totals exclude other months and preserve zero vs missing", () => {
  assert.equal(scheduleTotal({ deliveries: { "2026-04-01": 0, "2026-04-02": 10, "2026-05-01": 99 } }, "2026-04"), 10);
});

test("reads inline supplier metadata used by the October revision", async () => {
  const bytes = await readFile(new URL("../../docs/KRCA001_October 2026 Rev.5.xlsx", import.meta.url));
  const plan = await parseDeliverySchedule(bytes);
  assert.equal(plan.supplierCode, "KRCA001");
  assert.equal(plan.supplierName, "K.R.C. AUTO PART CO.,LTD.");
  assert.equal(plan.revision, 5);
  assert.equal(plan.period, "2026-10");
  assert.equal(plan.rows.filter((r) => r.section === "parts").length, 169);
  assert.equal(plan.rows.filter((r) => r.section === "cu").length, 4);
  assert.equal(plan.dates.length, 31);
  assert.deepEqual(plan.forecastMonths, ["2026-11", "2026-12", "2027-01"]);
  assert.equal(plan.rows.filter((r) => r.section === "parts").reduce((sum, row) => sum + scheduleTotal(row, plan.period), 0), 812610);
  assert.ok(plan.warnings.some((w) => w.includes("ต่างจากผลรวมรายวัน")));
});

test("rejects empty files and unsupported layouts", async () => {
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Other").getCell("A1").value = "Wrong file";
  await assert.rejects(() => parseDeliverySchedule(Buffer.from([])), /ไฟล์/);
  const invalid = new Uint8Array(await book.xlsx.writeBuffer());
  await assert.rejects(() => parseDeliverySchedule(invalid), /รูปแบบ/);
});

test("rejects negative quantities and formulas without saved daily values", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("KRC");
  sheet.getCell("B9").value = "STOCK CODE ERP";
  sheet.getCell("D9").value = "PART NO.";
  for (let offset = 0; offset < 31; offset++) sheet.getCell(10, 8 + offset).value = new Date(Date.UTC(2026, 3, 1 + offset));
  ["May'26", "Jun'26", "Jul'26"].forEach((value, offset) => { sheet.getCell(10, 41 + offset).value = value; });
  sheet.getCell("A13").value = 1;
  sheet.getCell("B13").value = "ERP001";
  sheet.getCell("D13").value = "PART001";
  sheet.getCell("H13").value = -1;
  await assert.rejects(() => book.xlsx.writeBuffer().then((bytes) => parseDeliverySchedule(new Uint8Array(bytes))), /จำนวนไม่ถูกต้องที่ H13/);
  sheet.getCell("H13").value = { formula: "1+1" };
  await assert.rejects(() => book.xlsx.writeBuffer().then((bytes) => parseDeliverySchedule(new Uint8Array(bytes))), /ไม่มีค่าที่บันทึกไว้ในสูตร H13/);
});
