import assert from "node:assert/strict";
import test from "node:test";
import {
  getInternalAuthEmail,
  normalizeUsername,
  validateCreateUserInput,
  validateManagedPassword,
  validateUsername,
} from "./user-management.ts";

test("normalizes usernames and creates an internal auth email", () => {
  assert.equal(normalizeUsername("  Purchase01  "), "purchase01");
  assert.equal(getInternalAuthEmail("Purchase01"), "purchase01@krc.com");
});

test("requires an eight-character safe username", () => {
  assert.ok(validateUsername("short"));
  assert.ok(validateUsername("ชื่อผู้ใช้01"));
  assert.equal(validateUsername("purchase01"), null);
  assert.equal(validateUsername("somchai.krc"), null);
});

test("requires a managed password with upper, lower, and numeric characters", () => {
  assert.ok(validateManagedPassword("password"));
  assert.ok(validateManagedPassword("PASSWORD1"));
  assert.ok(validateManagedPassword("Password"));
  assert.equal(validateManagedPassword("Password1"), null);
});

test("validates the complete create-user input", () => {
  assert.equal(
    validateCreateUserInput({
      approverUserId: null,
      departmentId: 1,
      firstName: "สมชาย",
      lastName: "ใจดี",
      password: "Password1",
      positionName: "เจ้าหน้าที่จัดซื้อ",
      roleId: 4,
      username: "somchai.krc",
    }),
    null,
  );
});
