import assert from "node:assert/strict";
import test from "node:test";
import {
  filterPermissionGroups,
  getPermissionSelectionState,
  groupPermissionsByModule,
  PERMISSION_MODULE_CATEGORIES,
  toggleActionPermissions,
  toggleModulePermissions,
  togglePermissionIds,
  togglePermissionWithViewDependency,
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
  {
    action: "export",
    code: "inventory_cost.export",
    id: 5,
    moduleCode: "inventory_cost",
    moduleName: "ต้นทุนสินค้าคงคลัง",
    name: "ส่งออกต้นทุนสินค้าคงคลัง",
  },
];

test("groups permissions into one row per module", () => {
  const groups = groupPermissionsByModule(permissions);

  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups[0]?.permissions.map((permission) => permission.id),
    [1, 2, 4],
  );
  assert.equal(groups[1]?.permissionsByAction.edit?.id, 3);
});

test("keeps cost export separate from cost view", () => {
  const costGroup = groupPermissionsByModule(permissions).find(
    (group) => group.moduleCode === "inventory_cost",
  );
  assert.equal(costGroup?.permissionsByAction.export?.code, "inventory_cost.export");
  assert.equal(costGroup?.permissionsByAction.view, undefined);
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

test("categorizes every current inventory permission module", () => {
  const inventoryCategory = PERMISSION_MODULE_CATEGORIES.find(
    (category) => category.label === "จัดซื้อและคลังสินค้า",
  );
  assert.ok(inventoryCategory?.modules.includes("inventory"));
  assert.ok(inventoryCategory?.modules.includes("inventory_issue"));
  assert.ok(inventoryCategory?.modules.includes("inventory_adjustment"));
  assert.ok(inventoryCategory?.modules.includes("inventory_cost"));
  assert.ok(inventoryCategory?.modules.includes("stock_count"));
});

test("categorizes audit logs under users and security", () => {
  const securityCategory = PERMISSION_MODULE_CATEGORIES.find(
    (category) => category.label === "ผู้ใช้งานและความปลอดภัย",
  );
  assert.ok(securityCategory?.modules.includes("audit_logs"));
});

test("omits retired legacy permission modules from the role editor", () => {
  const groups = groupPermissionsByModule([
    {
      action: "view",
      code: "mdm.view",
      id: 99,
      moduleCode: "mdm",
      moduleName: "ข้อมูลหลัก (เดิม)",
      name: "ดูข้อมูลหลักเดิม",
    },
  ]);
  assert.deepEqual(groups, []);
});

test("keeps stock count execution and review as separate actions", () => {
  const [group] = groupPermissionsByModule([
    {
      action: "count",
      code: "stock_count.count",
      id: 6,
      moduleCode: "stock_count",
      moduleName: "ตรวจนับสต็อก",
      name: "บันทึกผลตรวจนับ",
    },
    {
      action: "review",
      code: "stock_count.review",
      id: 7,
      moduleCode: "stock_count",
      moduleName: "ตรวจนับสต็อก",
      name: "ตรวจสอบผลตรวจนับ",
    },
  ]);

  assert.equal(group?.permissionsByAction.count?.id, 6);
  assert.equal(group?.permissionsByAction.review?.id, 7);
});

test("granting an action also grants view and removing view clears dependent actions", () => {
  const [group] = groupPermissionsByModule(permissions);
  assert.ok(group);

  const withCreate = togglePermissionWithViewDependency(new Set(), group, 2);
  assert.deepEqual([...withCreate].sort(), [1, 2]);

  const withoutView = togglePermissionWithViewDependency(withCreate, group, 1);
  assert.deepEqual([...withoutView], []);
});

test("removing the view column clears dependent actions in every module", () => {
  const groups = groupPermissionsByModule(permissions);
  const selected = toggleActionPermissions(new Set([1, 2, 4]), groups, "view");
  assert.deepEqual([...selected], []);
});
