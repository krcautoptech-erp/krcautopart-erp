export function canPerform(
  codes: readonly string[],
  isOwner: boolean,
  required: string | readonly string[] | null,
) {
  if (required === null || isOwner) return true;
  const permissions = typeof required === "string" ? [required] : required;
  return permissions.some((permission) => codes.includes(permission));
}

export function canManageCatalogLifecycle(
  codes: readonly string[],
  isOwner: boolean,
) {
  return canPerform(codes, isOwner, ["items.deactivate", "items.edit"]);
}

export function canManageUsers(isOwner: boolean) {
  return isOwner;
}
