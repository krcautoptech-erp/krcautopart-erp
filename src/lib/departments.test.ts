import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeDepartmentInput,
  validateDepartmentInput,
} from "./departments.ts";

test("normalizes department input before saving", () => {
  assert.deepEqual(
    normalizeDepartmentInput({
      code: " pur ",
      managerUserId: "",
      name: " จัดซื้อ ",
      remarks: " ดูแลงานจัดซื้อ ",
      status: "active",
    }),
    {
      code: "PUR",
      managerUserId: null,
      name: "จัดซื้อ",
      remarks: "ดูแลงานจัดซื้อ",
      status: "active",
    },
  );
});

test("accepts a valid department", () => {
  assert.equal(
    validateDepartmentInput({
      code: "QC",
      managerUserId: "64b6887b-c682-4b86-9cb7-e98e06265d73",
      name: "ควบคุมคุณภาพ",
      remarks: "",
      status: "active",
    }),
    null,
  );
});

test("rejects an invalid department code", () => {
  assert.equal(
    validateDepartmentInput({
      code: "แผนก1",
      managerUserId: null,
      name: "จัดซื้อ",
      remarks: "",
      status: "active",
    }),
    "รหัสแผนกต้องเป็นภาษาอังกฤษตัวพิมพ์ใหญ่หรือตัวเลข 2-12 ตัว",
  );
});

test("rejects blank names and oversized remarks", () => {
  assert.equal(
    validateDepartmentInput({
      code: "PUR",
      managerUserId: null,
      name: " ",
      remarks: "",
      status: "active",
    }),
    "กรุณากรอกชื่อแผนกไม่เกิน 100 ตัวอักษร",
  );

  assert.equal(
    validateDepartmentInput({
      code: "PUR",
      managerUserId: null,
      name: "จัดซื้อ",
      remarks: "x".repeat(501),
      status: "active",
    }),
    "หมายเหตุต้องไม่เกิน 500 ตัวอักษร",
  );
});

test("rejects an invalid manager user id", () => {
  assert.equal(
    validateDepartmentInput({
      code: "PUR",
      managerUserId: "not-a-uuid",
      name: "จัดซื้อ",
      remarks: "",
      status: "active",
    }),
    "หัวหน้าแผนกไม่ถูกต้อง",
  );
});
