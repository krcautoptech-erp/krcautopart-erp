import assert from "node:assert/strict";
import test from "node:test";
import { getPurchaseRequisitionHistoryLabel } from "./purchase-requisition-print.ts";

test("labels a submitted PR as sent to Purchasing", () => {
  assert.equal(
    getPurchaseRequisitionHistoryLabel("submitted"),
    "ส่งให้ฝ่ายจัดซื้อตรวจสอบ",
  );
});

test("labels operational review outcomes correctly", () => {
  assert.equal(getPurchaseRequisitionHistoryLabel("approved"), "พร้อมออก PO");
  assert.equal(getPurchaseRequisitionHistoryLabel("rejected"), "ส่งกลับแก้ไข");
});

test("uses a neutral fallback for an unknown history action", () => {
  assert.equal(getPurchaseRequisitionHistoryLabel("future_action"), "อัปเดตเอกสาร");
});
