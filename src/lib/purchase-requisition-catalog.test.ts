import assert from "node:assert/strict";
import test from "node:test";
import { isMissingPurchaseCatalogRpc } from "./purchase-requisition-catalog.ts";

test("falls back when PostgREST has not discovered the purchase catalog RPC", () => {
  assert.equal(isMissingPurchaseCatalogRpc({ code: "PGRST202", message: "Could not find the function public.get_purchase_requisition_catalog" }), true);
});

test("does not hide permission or database failures", () => {
  assert.equal(isMissingPurchaseCatalogRpc({ code: "42501", message: "permission denied" }), false);
});
