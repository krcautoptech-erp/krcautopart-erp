import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessPath,
  getExportPermission,
  getNavigationHref,
  getRequiredPermission,
  PAGE_PERMISSIONS,
} from "./access-control.ts";

test("covers every current secured page with its view permission", () => {
  assert.deepEqual(PAGE_PERMISSIONS, [
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
  ]);
});

test("uses the correct permission for each access-management tab", () => {
  assert.equal(getRequiredPermission("/settings/users", ""), "users.view");
  assert.equal(getRequiredPermission("/settings/users", "tab=roles"), "roles.view");
  assert.equal(getRequiredPermission("/settings/roles", ""), "roles.view");
});

test("protects signature settings with its dedicated permission", () => {
  assert.equal(
    getRequiredPermission("/settings/signature-approval", ""),
    "approval_signature.manage",
  );
  assert.equal(
    canAccessPath("/settings/signature-approval", "", ["po.approve"]),
    false,
  );
});

test("allows public dashboard pages and rejects missing page permissions", () => {
  assert.equal(canAccessPath("/workspace", "", []), true);
  assert.equal(canAccessPath("/purchase/po", "", ["po.view"]), true);
  assert.equal(canAccessPath("/purchase/po", "", ["pr.view"]), false);
});

test("routes roles-only users directly to the permission tab", () => {
  assert.equal(getNavigationHref("/settings/users", ["roles.view"]), "/settings/users?tab=roles");
  assert.equal(getNavigationHref("/settings/users", ["users.view"]), "/settings/users");
});

test("maps shared export buttons to the permission for their current page", () => {
  assert.equal(getExportPermission("/purchase/pr"), "pr.export");
  assert.equal(getExportPermission("/inventory/issues/123"), "inventory_issue.export");
  assert.equal(getExportPermission("/inventory/adjustments/123"), "inventory_adjustment.export");
  assert.equal(getExportPermission("/inventory/stock-counts/123"), "stock_count.export");
  assert.equal(getExportPermission("/reports/inventory/stock-issues"), "inventory_issue.export");
  assert.equal(getExportPermission("/settings/audit-logs"), "audit_logs.export");
  assert.equal(getExportPermission("/workspace"), null);
});
