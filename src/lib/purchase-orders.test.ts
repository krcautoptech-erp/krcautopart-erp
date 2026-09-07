import assert from "node:assert/strict";
import test from "node:test";
import { normalizePurchaseOrderItemType } from "./purchase-orders.ts";

test("normalizes legacy raw-material type to RM", () => {
  assert.equal(normalizePurchaseOrderItemType("raw_material", "RM001"), "RM");
});

test("preserves configured Item Master type codes", () => {
  assert.equal(normalizePurchaseOrderItemType("office", "OFF0001"), "OFFICE");
});

test("infers RM for the legacy PO source RPC", () => {
  assert.equal(normalizePurchaseOrderItemType(null, "RM009"), "RM");
});
