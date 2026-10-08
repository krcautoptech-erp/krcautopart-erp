export type PermissionMatrixAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "deactivate"
  | "cancel"
  | "approve"
  | "reject"
  | "export"
  | "count"
  | "review";

export type PermissionMatrixPermission = {
  action: string;
  code: string;
  id: number;
  moduleCode: string;
  moduleName: string;
  name: string;
};

export type PermissionMatrixGroup<
  TPermission extends PermissionMatrixPermission = PermissionMatrixPermission,
> = {
  moduleCode: string;
  moduleName: string;
  permissions: TPermission[];
  permissionsByAction: Partial<
    Record<PermissionMatrixAction, TPermission>
  >;
};

export const PERMISSION_MODULE_CATEGORIES: { label: string; modules: string[] }[] = [
  { label: "ข้อมูลกลาง", modules: ["items", "assets", "partners"] },
  { label: "จัดซื้อและคลังสินค้า", modules: ["pr", "po", "inventory", "inventory_issue", "inventory_adjustment", "inventory_cost", "stock_count"] },
  { label: "ตั้งค่าระบบ", modules: ["company", "partner_settings", "material_settings", "item_types", "document_terms", "warehouses", "departments"] },
  { label: "ผู้ใช้งานและความปลอดภัย", modules: ["users", "roles", "approval_signature", "approval_policy", "audit_logs"] },
];

function normalizeAction(action: string): PermissionMatrixAction | null {
  if (action === "manage") return "edit";
  if (
    action === "view" ||
    action === "create" ||
    action === "edit" ||
    action === "delete" ||
    action === "deactivate" ||
    action === "cancel" ||
    action === "approve" ||
    action === "reject" ||
    action === "export" ||
    action === "count" ||
    action === "review"
  ) {
    return action;
  }
  return null;
}

export function groupPermissionsByModule<
  TPermission extends PermissionMatrixPermission,
>(permissions: TPermission[]): PermissionMatrixGroup<TPermission>[] {
  const groups = new Map<string, PermissionMatrixGroup<TPermission>>();

  for (const permission of permissions) {
    if (permission.moduleCode === "mdm") continue;
    const group = groups.get(permission.moduleCode) ?? {
      moduleCode: permission.moduleCode,
      moduleName: permission.moduleName,
      permissions: [],
      permissionsByAction: {},
    };
    const action = normalizeAction(permission.action);

    group.permissions.push(permission);
    if (action) group.permissionsByAction[action] = permission;
    groups.set(permission.moduleCode, group);
  }

  return [...groups.values()];
}

export function toggleModulePermissions(
  selectedPermissionIds: Set<number>,
  group: PermissionMatrixGroup,
) {
  return togglePermissionIds(
    selectedPermissionIds,
    group.permissions.map((permission) => permission.id),
  );
}

export function togglePermissionIds(
  selectedPermissionIds: Set<number>,
  permissionIds: number[],
) {
  const next = new Set(selectedPermissionIds);
  const isFullySelected = permissionIds.every((permissionId) =>
    next.has(permissionId),
  );

  for (const permissionId of permissionIds) {
    if (isFullySelected) next.delete(permissionId);
    else next.add(permissionId);
  }

  return next;
}

export function togglePermissionWithViewDependency(
  selectedPermissionIds: Set<number>,
  group: PermissionMatrixGroup,
  permissionId: number,
) {
  const next = new Set(selectedPermissionIds);
  const viewId = group.permissionsByAction.view?.id;

  if (next.has(permissionId)) {
    if (permissionId === viewId) {
      group.permissions.forEach((permission) => next.delete(permission.id));
    } else {
      next.delete(permissionId);
    }
  } else {
    next.add(permissionId);
    if (viewId) next.add(viewId);
  }

  return next;
}

export function toggleActionPermissions(
  selectedPermissionIds: Set<number>,
  groups: PermissionMatrixGroup[],
  action: PermissionMatrixAction,
) {
  const next = new Set(selectedPermissionIds);
  const permissions = groups
    .map((group) => group.permissionsByAction[action])
    .filter((permission) => permission !== undefined);
  const isFullySelected = permissions.every((permission) =>
    next.has(permission.id),
  );

  for (const permission of permissions) {
    if (isFullySelected) {
      if (action === "view") {
        groups
          .find((group) => group.moduleCode === permission.moduleCode)
          ?.permissions.forEach((item) => next.delete(item.id));
      } else {
        next.delete(permission.id);
      }
    } else {
      next.add(permission.id);
      const group = groups.find((item) => item.moduleCode === permission.moduleCode);
      const viewId = group?.permissionsByAction.view?.id;
      if (viewId) next.add(viewId);
    }
  }

  return next;
}

export function filterPermissionGroups(
  groups: PermissionMatrixGroup[],
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("th");
  if (!normalizedQuery) return groups;

  return groups.filter(
    (group) =>
      group.moduleName.toLocaleLowerCase("th").includes(normalizedQuery) ||
      group.moduleCode.toLocaleLowerCase("th").includes(normalizedQuery) ||
      group.permissions.some(
        (permission) =>
          permission.code.toLocaleLowerCase("th").includes(normalizedQuery) ||
          permission.name.toLocaleLowerCase("th").includes(normalizedQuery),
      ),
  );
}

export function getPermissionSelectionState(
  selectedPermissionIds: Set<number>,
  permissionIds: number[],
) {
  const selectedCount = permissionIds.filter((permissionId) =>
    selectedPermissionIds.has(permissionId),
  ).length;

  return {
    checked: permissionIds.length > 0 && selectedCount === permissionIds.length,
    indeterminate: selectedCount > 0 && selectedCount < permissionIds.length,
  };
}
