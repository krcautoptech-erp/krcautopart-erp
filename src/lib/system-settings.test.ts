import assert from "node:assert/strict";
import test from "node:test";
import {
  getSystemSettingsBreadcrumb,
  getSystemSettingsGroupForPath,
  getVisibleSystemSettings,
  isSystemSettingsPath,
} from "./system-settings.ts";

test("settings index filters by permission and search", () => {
  const groups = getVisibleSystemSettings(
    ["company.view", "roles.view"],
    false,
    "สิทธิ์",
  );

  assert.deepEqual(
    groups.flatMap((group) => group.items.map((item) => item.label)),
    ["บทบาทและสิทธิ์"],
  );
});

test("owner can see every system setting", () => {
  const groups = getVisibleSystemSettings([], true);
  assert.equal(groups.flatMap((group) => group.items).length, 11);
});

test("approval signature setting requires its dedicated permission", () => {
  const groups = getVisibleSystemSettings(["approval_signature.manage"], false);
  assert.deepEqual(
    groups.flatMap((group) => group.items.map((item) => item.label)),
    ["ลายเซ็นและการอนุมัติ"],
  );
  assert.deepEqual(
    getSystemSettingsBreadcrumb("/settings/signature-approval"),
    ["ตั้งค่าระบบ", "ลายเซ็นและการอนุมัติ"],
  );
  assert.equal(getVisibleSystemSettings(["po.approve"], false).length, 0);
});

test("treats every configuration route as part of the persistent settings workspace", () => {
  assert.equal(isSystemSettingsPath("/settings/company"), true);
  assert.equal(isSystemSettingsPath("/settings/users"), true);
  assert.equal(isSystemSettingsPath("/settings/materials"), true);
  assert.equal(isSystemSettingsPath("/settings/item-types"), true);
  assert.equal(isSystemSettingsPath("/partner-settings"), true);
  assert.equal(isSystemSettingsPath("/settings/audit-logs"), true);
});

test("builds breadcrumbs only for system-setting detail pages", () => {
  assert.deepEqual(getSystemSettingsBreadcrumb("/settings/company"), [
    "ตั้งค่าระบบ",
    "ข้อมูลบริษัท",
  ]);
  assert.equal(getSystemSettingsBreadcrumb("/settings"), null);
  assert.deepEqual(getSystemSettingsBreadcrumb("/settings/materials"), [
    "ตั้งค่าระบบ",
    "ตั้งค่าวัตถุดิบ",
  ]);
});

test("resolves one active accordion group for every settings detail route", () => {
  assert.equal(getSystemSettingsGroupForPath("/settings/departments"), "บริษัทและองค์กร");
  assert.equal(getSystemSettingsGroupForPath("/settings/users"), "ผู้ใช้และความปลอดภัย");
  assert.equal(getSystemSettingsGroupForPath("/settings/audit-logs"), "ผู้ใช้และความปลอดภัย");
  assert.equal(getSystemSettingsGroupForPath("/partner-settings"), "ข้อมูลจัดซื้อ");
});
