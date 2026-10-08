import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const roleEditor = readFileSync(
  new URL("../app/(dashboard)/settings/roles/_components/role-permission-management.tsx", import.meta.url),
  "utf8",
);
const userModal = readFileSync(
  new URL("../app/(dashboard)/settings/users/_components/user-modal.tsx", import.meta.url),
  "utf8",
);

test("mobile role editor exposes the same final save action as desktop", () => {
  assert.equal(roleEditor.match(/onClick=\{handleSave\}/g)?.length, 2);
});

test("user form explains position usage and omits the unused fixed approver field", () => {
  assert.match(userModal, /ตำแหน่ง \(ใช้ในลายเซ็นอนุมัติ\)/);
  assert.doesNotMatch(userModal, /ผู้อนุมัติประจำ/);
});
