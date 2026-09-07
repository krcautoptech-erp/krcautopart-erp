import test from "node:test";
import assert from "node:assert/strict";

import {
  configuredStockFields,
  getStockState,
  resolveInventoryActorName,
  stockDetailTabs,
} from "./central-stock.ts";

test("stock state prioritizes empty and reorder thresholds", () => {
  assert.equal(getStockState(0, 10, "2026-09-06T00:00:00Z", new Date("2026-09-06T00:00:00Z")).code, "out_of_stock");
  assert.equal(getStockState(8, 10, "2026-09-06T00:00:00Z", new Date("2026-09-06T00:00:00Z")).code, "low_stock");
  assert.equal(getStockState(20, 10, "2026-01-01T00:00:00Z", new Date("2026-09-06T00:00:00Z")).code, "stale");
  assert.equal(getStockState(20, 10, "2026-09-06T00:00:00Z", new Date("2026-09-06T00:00:00Z")).code, "available");
});

test("detail tabs follow the configured tracking method", () => {
  assert.deepEqual(stockDetailTabs("lot"), ["overview", "lot", "history"]);
  assert.deepEqual(stockDetailTabs("serial"), ["overview", "serial", "history"]);
  assert.deepEqual(stockDetailTabs("none"), ["overview", "history"]);
});

test("configured fields hide disabled and empty item attributes", () => {
  const fields = configuredStockFields(
    { materialGrade: "required", width: "optional", brand: "hidden", model: "optional" },
    { gradeName: "SPCC", width: 1219, brand: "KRC", model: "" },
  );

  assert.deepEqual(fields, [
    { key: "materialGrade", label: "เกรดวัสดุ", value: "SPCC" },
    { key: "width", label: "ความกว้าง", value: "1,219" },
  ]);
});

test("inventory actor name respects profile visibility without a database relationship", () => {
  assert.equal(resolveInventoryActorName("user-1", "user-1", "admin@krc.local"), "admin@krc.local");
  assert.equal(resolveInventoryActorName("user-2", "user-1", "admin@krc.local"), "ผู้ใช้ระบบ");
  assert.equal(resolveInventoryActorName(null, "user-1", "admin@krc.local"), "ระบบอัตโนมัติ");
});
