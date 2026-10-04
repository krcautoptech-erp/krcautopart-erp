export type PermissionCode = `${string}.${string}`;

export const PAGE_PERMISSIONS = [
  ["/items", "items.view"],
  ["/assets", "assets.view"],
  ["/partners", "partners.view"],
  ["/purchase/pr", "pr.view"],
  ["/purchase/po", "po.view"],
  ["/purchase/receipts", "inventory.view"],
  ["/inventory/stock", "inventory.view"],
  ["/inventory/stock-counts", "stock_count.view"],
  ["/inventory/issues", "inventory_issue.view"],
  ["/inventory/adjustments", "inventory_adjustment.view"],
  ["/reports/inventory/stock-issues", "inventory_issue.view"],
  ["/reports/purchase", "po.view"],
  ["/reports/inventory", "inventory.view"],
  ["/settings/company", "company.view"],
  ["/settings/signature-approval", "approval_signature.manage"],
  ["/partner-settings", "partner_settings.view"],
  ["/settings/materials", "material_settings.view"],
  ["/settings/item-types", "item_types.view"],
  ["/settings/document-terms", "document_terms.view"],
  ["/settings/warehouses", "warehouses.view"],
  ["/settings/departments", "departments.view"],
  ["/settings/audit-logs", "audit_logs.view"],
] as const satisfies ReadonlyArray<readonly [string, PermissionCode]>;

const EXPORT_PERMISSIONS = [
  ["/items", "items.export"],
  ["/assets", "assets.export"],
  ["/partners", "partners.export"],
  ["/purchase/pr", "pr.export"],
  ["/purchase/po", "po.export"],
  ["/purchase/receipts", "inventory.export"],
  ["/inventory/stock", "inventory.export"],
  ["/inventory/stock-counts", "stock_count.export"],
  ["/inventory/issues", "inventory_issue.export"],
  ["/inventory/adjustments", "inventory_adjustment.export"],
  ["/reports/inventory/stock-issues", "inventory_issue.export"],
  ["/reports/purchase", "po.export"],
  ["/reports/inventory", "inventory.export"],
  ["/partner-settings", "partner_settings.export"],
  ["/settings/warehouses", "warehouses.export"],
  ["/settings/departments", "departments.export"],
  ["/settings/users", "users.export"],
  ["/settings/audit-logs", "audit_logs.export"],
] as const satisfies ReadonlyArray<readonly [string, PermissionCode]>;

export function getRequiredPermission(pathname: string, search = "") {
  if (pathname === "/settings/roles" || (pathname === "/settings/users" && new URLSearchParams(search).get("tab") === "roles")) {
    return "roles.view";
  }
  if (pathname === "/settings/users") return "users.view";

  return PAGE_PERMISSIONS.find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[1] ?? null;
}

export function canAccessPath(pathname: string, search: string, permissions: readonly string[]) {
  const requiredPermission = getRequiredPermission(pathname, search);
  return requiredPermission === null || permissions.includes(requiredPermission);
}

export function getNavigationHref(href: string, permissions: readonly string[]) {
  return href === "/settings/users" && !permissions.includes("users.view") && permissions.includes("roles.view")
    ? "/settings/users?tab=roles"
    : href;
}

export function getExportPermission(pathname: string) {
  return EXPORT_PERMISSIONS.find(([path]) => pathname === path || pathname.startsWith(`${path}/`))?.[1] ?? null;
}
