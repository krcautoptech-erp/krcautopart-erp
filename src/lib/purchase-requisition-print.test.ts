import assert from "node:assert/strict";
import test from "node:test";
import { getPurchaseRequisitionHistoryLabel } from "./purchase-requisition-print.ts";

test("labels a submitted PR as sent for approval, not rejected", () => {
  assert.equal(getPurchaseRequisitionHistoryLabel("submitted"), "ส่งอนุมัติ");
});

test("labels approval decisions correctly", () => {
  assert.equal(getPurchaseRequisitionHistoryLabel("approved"), "อนุมัติ");
  assert.equal(getPurchaseRequisitionHistoryLabel("rejected"), "ปฏิเสธ");
});

test("uses a neutral fallback for an unknown history action", () => {
  assert.equal(getPurchaseRequisitionHistoryLabel("future_action"), "อัปเดตเอกสาร");
});
