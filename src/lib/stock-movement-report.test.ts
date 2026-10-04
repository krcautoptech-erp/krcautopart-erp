import test from "node:test";
import assert from "node:assert/strict";
import { stockPeriod, type StockMovement } from "./stock-movement-report.ts";

test("stock report includes opening history, Bangkok bounds, separate warehouses and reversals", () => {
  const base: StockMovement = { id: "1", itemId: 1, itemCode: "RM01", itemName: "Steel", warehouseId: 1, warehouseName: "A", unit: "sheet", groupId: 1, groupName: "RM", date: "2026-08-31T16:59:00Z", type: "receipt", referenceType: "goods_receipt", document: "GR1", lot: "L1", quantity: 100, actor: "buyer" };
  const result = stockPeriod([base, { ...base, id: "2", date: "2026-08-31T17:00:00Z", quantity: 50 }, { ...base, id: "3", date: "2026-09-02T00:00:00Z", type: "issue", quantity: -20 }, { ...base, id: "4", date: "2026-09-03T00:00:00Z", type: "return", referenceType: "stock_issue_reversal", quantity: 20 }, { ...base, id: "5", warehouseId: 2, quantity: 500 }, { ...base, id: "6", date: "2026-09-16T17:00:00Z", quantity: 999 }], "2026-09-01", "2026-09-16");
  assert.deepEqual(result.summaries.map(s => [s.opening, s.received, s.issued, s.adjustment, s.closing]), [[100, 50, 20, 20, 150], [500, 0, 0, 0, 500]]);
  assert.deepEqual(result.journal.map(r => r.balance), [150, 130, 150]);
});
