import assert from "node:assert/strict";
import test from "node:test";
import {
  filterPermissionGroups,
  getPermissionSelectionState,
  groupPermissionsByModule,
  toggleActionPermissions,
  toggleModulePermissions,
  togglePermissionIds,
} from "./permission-matrix.ts";

const permissions = [
  {
    action: "view",
    code: "pr.view",
    id: 1,
    moduleCode: "pr",
    moduleName: "ใบขอซื้อ (PR)",
    name: "ดูใบขอซื้อ",
  },
  {
    action: "create",
    code: "pr.create",
    id: 2,
    moduleCode: "pr",
    moduleName: "ใบขอซื้อ (PR)",
    name: "สร้างใบขอซื้อ",
  },
  {
    action: "manage",
    code: "roles.manage",
    id: 3,
    moduleCode: "roles",
    moduleName: "Role และสิทธิ์",
    name: "จัดการ Role และสิทธิ์",
  },
  {
    action: "cancel",
    code: "pr.cancel",
    id: 4,
    moduleCode: "pr",
    moduleName: "ใบขอซื้อ (PR)",
    name: "ยกเลิกใบขอซื้อ",
  },
];

test("groups permissions into one row per module", () => {
  const groups = groupPermissionsByModule(permissions);

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups[0]?.permissions.map((permission) => permission.id),
    [1, 2, 4],
  );
  assert.equal(groups[1]?.permissionsByAction.edit?.id, 3);
});

test("toggles every supported permission in one module", () => {
  const [purchaseGroup] = groupPermissionsByModule(permissions);
  assert.ok(purchaseGroup);

  const selected = toggleModulePermissions(new Set([1]), purchaseGroup);
  assert.deepEqual([...selected].sort(), [1, 2, 4]);

  const cleared = toggleModulePermissions(selected, purchaseGroup);
  assert.deepEqual([...cleared], []);
});

test("keeps cancellation separate from edit and delete", () => {
  const [purchaseGroup] = groupPermissionsByModule(permissions);
  assert.equal(purchaseGroup?.permissionsByAction.cancel?.code, "pr.cancel");
  assert.equal(purchaseGroup?.permissionsByAction.edit, undefined);
  assert.equal(purchaseGroup?.permissionsByAction.delete, undefined);
});

test("keeps deactivation separate from edit and hard delete", () => {
  const [itemsGroup] = groupPermissionsByModule([
    {
      action: "deactivate",
      code: "items.deactivate",
      id: 5,
      moduleCode: "items",
      moduleName: "ข้อมูลสินค้าและรายการกลาง",
      name: "ระงับสินค้า",
    },
  ]);

  assert.equal(
    itemsGroup?.permissionsByAction.deactivate?.code,
    "items.deactivate",
  );
  assert.equal(itemsGroup?.permissionsByAction.edit, undefined);
  assert.equal(itemsGroup?.permissionsByAction.delete, undefined);
});

test("toggles one action across modules without creating unsupported permissions", () => {
  const groups = groupPermissionsByModule(permissions);

  const selected = toggleActionPermissions(new Set(), groups, "view");
  assert.deepEqual([...selected], [1]);

  const cleared = toggleActionPermissions(selected, groups, "view");
  assert.deepEqual([...cleared], []);
});

test("filters module rows by module or permission text", () => {
  const groups = groupPermissionsByModule(permissions);

  assert.deepEqual(
    filterPermissionGroups(groups, "ใบขอซื้อ").map((group) => group.moduleCode),
    ["pr"],
  );
  assert.deepEqual(
    filterPermissionGroups(groups, "roles.manage").map(
      (group) => group.moduleCode,
    ),
    ["roles"],
  );
});

test("reports checked and indeterminate selection states", () => {
  assert.deepEqual(getPermissionSelectionState(new Set([1, 2]), [1, 2]), {
    checked: true,
    indeterminate: false,
  });
  assert.deepEqual(getPermissionSelectionState(new Set([1]), [1, 2]), {
    checked: false,
    indeterminate: true,
  });
});

test("toggles a supplied set of permissions as one selection", () => {
  assert.deepEqual([...togglePermissionIds(new Set([1]), [1, 2])].sort(), [1, 2]);
  assert.deepEqual([...togglePermissionIds(new Set([1, 2]), [1, 2])], []);
});
