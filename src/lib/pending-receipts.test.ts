import test from "node:test";
import assert from "node:assert/strict";
import { pendingReceiptStatus, purchaseOrderSearchHref } from "./pending-receipts.ts";

test("classifies delivery follow-up status", () => {
  assert.equal(pendingReceiptStatus("2026-09-12", "2026-09-01", "2026-09-15").label, "เกินกำหนด 3 วัน");
  assert.equal(pendingReceiptStatus("2026-09-15", "2026-09-01", "2026-09-15").label, "ครบกำหนดวันนี้");
  assert.equal(pendingReceiptStatus("2026-09-20", "2026-09-01", "2026-09-15").label, "ใกล้ครบกำหนด");
  assert.equal(pendingReceiptStatus("2026-09-20", null, "2026-09-15").label, "รอส่ง PO");
});

test("PO link carries its document date into the PO filters", () => {
  assert.equal(purchaseOrderSearchHref("PO26070002", "2026-07-31"), "/purchase/po?q=PO26070002&start=2026-07-31&end=2026-07-31");
});
