import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCancellationReason,
  validateCancellationReason,
} from "./purchase-document-cancellation.ts";

test("normalizeCancellationReason trims and collapses whitespace", () => {
  assert.equal(
    normalizeCancellationReason("  ยกเลิก   เนื่องจาก\nเปลี่ยนแผน  "),
    "ยกเลิก เนื่องจาก เปลี่ยนแผน",
  );
});

test("validateCancellationReason requires at least 10 characters", () => {
  assert.deepEqual(validateCancellationReason("สั้น"), {
    error: "กรุณาระบุเหตุผลการยกเลิกอย่างน้อย 10 ตัวอักษร",
    success: false,
  });
});

test("validateCancellationReason accepts a meaningful reason", () => {
  assert.deepEqual(
    validateCancellationReason("ยกเลิกเนื่องจากเปลี่ยนแผนการจัดซื้อ"),
    {
      reason: "ยกเลิกเนื่องจากเปลี่ยนแผนการจัดซื้อ",
      success: true,
    },
  );
});

test("validateCancellationReason rejects more than 500 characters", () => {
  assert.deepEqual(validateCancellationReason("ก".repeat(501)), {
    error: "เหตุผลการยกเลิกต้องไม่เกิน 500 ตัวอักษร",
    success: false,
  });
});
