import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionStockCount,
  stockCountDifference,
  stockCountProgress,
  validateCountEntry,
  type CountEntry,
} from "./stock-counts.ts";

test("calculates four-decimal lot differences without floating drift", () => {
  assert.equal(stockCountDifference(10.0001, 10.0002), 0.0001);
  assert.equal(stockCountDifference(10.0002, 10.0001), -0.0001);
});

test("rejects negative, non-finite, and more-than-four-decimal counts", () => {
  for (const countedQty of [-1, Infinity, -Infinity, NaN, 1.00001]) {
    assert.notEqual(validateCountEntry({ systemQty: 1, countedQty }), null);
  }
  assert.equal(validateCountEntry({ systemQty: 1, countedQty: 1.0001 }), null);
  assert.equal(validateCountEntry({ systemQty: 1, countedQty: null }), null);
});

test("allows draft -> counting -> review -> approved and review -> recount -> counting only", () => {
  const allowed = [
    ["draft", "counting"],
    ["counting", "review"],
    ["review", "approved"],
    ["review", "recount"],
    ["recount", "counting"],
  ] as const;
  for (const [from, to] of allowed) assert.equal(canTransitionStockCount(from, to), true);
  for (const [from, to] of [
    ["draft", "review"],
    ["counting", "approved"],
    ["recount", "review"],
    ["approved", "counting"],
    ["cancelled", "draft"],
    ["review", "counting"],
  ] as const) assert.equal(canTransitionStockCount(from, to), false);
  for (const from of ["draft", "counting", "review", "recount"] as const) {
    assert.equal(canTransitionStockCount(from, "cancelled"), true);
  }
});

test("counts zero as completed and null as pending", () => {
  const entries: CountEntry[] = [
    { systemQty: 5, countedQty: 0 },
    { systemQty: 7, countedQty: null },
  ];
  assert.deepEqual(stockCountProgress(entries), { completed: 1, total: 2 });
  assert.deepEqual(stockCountProgress([]), { completed: 0, total: 0 });
});

test("keeps opposite lot differences even when item net difference is zero", () => {
  const lots: CountEntry[] = [
    { systemQty: 10, countedQty: 9 },
    { systemQty: 10, countedQty: 11 },
  ];
  assert.deepEqual(lots.map(({ systemQty, countedQty }) => stockCountDifference(systemQty, countedQty!)), [-1, 1]);
});
