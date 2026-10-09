import assert from "node:assert/strict";
import test from "node:test";
import { validateOpeningRows, validateOpeningHeader, openingTotals, openingRowsFromSpreadsheet, openingLineValue } from "./opening-stock.ts";

const catalog = [{ id: 1, code: "RM001", name: "Steel", unitName: "แผ่น", trackingMethod: "lot", expiryControlled: false, allowsDecimal: false }];
const row = { itemCode: "RM001", lotNumber: "LOT001", expiryDate: "", quantity: "10", unitCost: "20.5", notes: "" };
test("multiple Lots of one item are valid and money rounds per line", () => {
  assert.deepEqual(validateOpeningRows([row, { ...row, lotNumber: "LOT002" }], catalog, "2026-10-08"), [[], []]);
  assert.deepEqual(openingTotals([row, { ...row, lotNumber: "LOT002", quantity: "3" }]), { lines: 2, items: 1, value: 266.5 });
});
test("duplicate item+Lot invalidates both rows", () => {
  assert.ok(validateOpeningRows([row, row], catalog, "2026-10-08").every((errors) => errors.some((error) => error.includes("ซ้ำ"))));
});
test("missing, zero, negative, excess precision and nonnumeric quantities rejected", () => {
  for (const quantity of ["", "0", "-1", "1.00001", "NaN", "1e2", "Infinity", "100000000000000"]) {
    assert.ok(validateOpeningRows([{ ...row, quantity }], catalog, "2026-10-08")[0].length, quantity);
  }
});
test("unknown and Serial items cannot silently post", () => {
  assert.ok(validateOpeningRows([{ ...row, itemCode: "UNKNOWN" }], catalog, "2026-10-08")[0].length);
  assert.ok(validateOpeningRows([row], [{ ...catalog[0], trackingMethod: "serial" }], "2026-10-08")[0].length);
});
test("blank cost is not zero, actual zero cost allowed", () => {
  assert.ok(validateOpeningRows([{ ...row, unitCost: "" }], catalog, "2026-10-08")[0].length);
  assert.deepEqual(validateOpeningRows([{ ...row, unitCost: "0" }], catalog, "2026-10-08"), [[]]);
});
test("whole-unit and controlled expiry validated", () => {
  assert.ok(validateOpeningRows([{ ...row, quantity: "1.5" }], catalog, "2026-10-08")[0].length);
  const expiring = [{ ...catalog[0], expiryControlled: true }];
  assert.ok(validateOpeningRows([row], expiring, "2026-10-08")[0].length);
  assert.ok(validateOpeningRows([{ ...row, expiryDate: "2026-02-30" }], expiring, "2026-10-08")[0].length);
  assert.deepEqual(validateOpeningRows([{ ...row, expiryDate: "2027-01-01" }], expiring, "2026-10-08"), [[]]);
});
test("header disallows future or impossible date and missing warehouse/reference", () => {
  for (const date of ["", "2026-02-30", "2026-10-09"]) assert.ok(validateOpeningHeader(1, date, "REF", "", "2026-10-08"));
  assert.equal(validateOpeningHeader(1, "2026-10-08", "REF", "", "2026-10-08"), null);
  assert.ok(validateOpeningHeader(0, "2026-10-08", "REF", "", "2026-10-08"));
});
test("spreadsheet maps explicit headers and rejects malformed shape", () => {
  assert.deepEqual(openingRowsFromSpreadsheet({ headers: ["รหัสสินค้า", "Lot", "จำนวน", "ต้นทุนต่อหน่วย", "วันหมดอายุ", "หมายเหตุ"], rows: [["RM001", "LOT001", "10", "20.5", "", ""]] }), [row]);
  assert.throws(() => openingRowsFromSpreadsheet({ headers: ["สินค้า"], rows: [["RM001"]] }));
});
test("money rounds each decimal line exactly, including half-cent", () => {
  assert.equal(openingLineValue({ ...row, quantity: "0.1", unitCost: "0.05" }), 0.01);
  assert.equal(openingLineValue({ ...row, quantity: "1", unitCost: "1.005" }), 1.01);
  assert.equal(openingLineValue({ ...row, quantity: "3", unitCost: "0.335" }), 1.01);
});
test("unrepresentable monetary totals are blocked before posting", () => {
  assert.ok(validateOpeningRows([{ ...row, quantity: "999999999", unitCost: "999999999" }], catalog, "2026-10-08")[0].length);
});
