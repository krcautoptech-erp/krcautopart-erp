import assert from "node:assert/strict";
import test from "node:test";
import * as receipts from "./goods-receipts.ts";

test("receipt totals keep different units separate, including zero and fractional quantities", () => {
  assert.equal(typeof receipts.getGoodsReceiptQuantityTotals, "function");
  assert.deepEqual(receipts.getGoodsReceiptQuantityTotals([
    { quantity_received: 11, unit_name: "แผ่น" },
    { quantity_received: 20, unit_name: "แผ่น" },
    { quantity_received: 1.5, unit_name: "กิโลกรัม" },
    { quantity_received: 0, unit_name: "ชิ้น" },
  ]), [{ unit: "แผ่น", quantity: 31 }, { unit: "กิโลกรัม", quantity: 1.5 }, { unit: "ชิ้น", quantity: 0 }]);
  assert.deepEqual(receipts.getGoodsReceiptQuantityTotals([]), []);
});

test("overflowing A5 pages reduce row capacity, never below one or above eight", () => {
  assert.equal(typeof receipts.getGoodsReceiptPrintRowLimit, "function");
  assert.equal(receipts.getGoodsReceiptPrintRowLimit(8, 140, 142), 7);
  assert.equal(receipts.getGoodsReceiptPrintRowLimit(8, 140, 139), 8);
  assert.equal(receipts.getGoodsReceiptPrintRowLimit(1, 140, 200), 1);
});
