import assert from "node:assert/strict";
import test from "node:test";
import {
  validatePurchaseRequisitionDecision,
} from "./purchase-requisition-approval.ts";

test("accepts a ready-for-PO review without a note", () => {
  assert.deepEqual(
    validatePurchaseRequisitionDecision({
      decision: "ready_for_po",
      note: "",
      requisitionId: 10,
    }),
    { success: true },
  );
});

test("requires a return reason", () => {
  assert.deepEqual(
    validatePurchaseRequisitionDecision({
      decision: "returned",
      note: "   ",
      requisitionId: 10,
    }),
    {
      error: "กรุณาระบุเหตุผลที่ส่งใบขอซื้อกลับแก้ไข",
      success: false,
    },
  );
});

test("rejects invalid requisition identifiers", () => {
  assert.deepEqual(
    validatePurchaseRequisitionDecision({
      decision: "ready_for_po",
      note: "",
      requisitionId: Number.NaN,
    }),
    {
      error: "ไม่พบใบขอซื้อที่ต้องการดำเนินการ",
      success: false,
    },
  );
});

test("limits decision notes to 500 characters", () => {
  assert.deepEqual(
    validatePurchaseRequisitionDecision({
      decision: "ready_for_po",
      note: "x".repeat(501),
      requisitionId: 10,
    }),
    {
      error: "หมายเหตุต้องไม่เกิน 500 ตัวอักษร",
      success: false,
    },
  );
});
