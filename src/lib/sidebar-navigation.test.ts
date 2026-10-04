import assert from "node:assert/strict";
import test from "node:test";
import {
  findSidebarGroupForPath,
  SIDEBAR_NAV_GROUPS,
} from "./sidebar-navigation.ts";

test("keeps configuration pages out of the central-data accordion", () => {
  const central = SIDEBAR_NAV_GROUPS.find((group) => group.id === "master-data");
  const hrefs = central?.items.map((item) => item.href) ?? [];

  assert.ok(!hrefs.includes("/partner-settings"));
  assert.ok(!hrefs.includes("/settings/materials"));
  assert.ok(!hrefs.includes("/settings/item-types"));
});

test("opens the accordion that owns the current page", () => {
  assert.equal(findSidebarGroupForPath("/purchase/po"), "purchase");
  assert.equal(findSidebarGroupForPath("/inventory/issues"), "inventory");
  assert.equal(findSidebarGroupForPath("/inventory/stock-counts/12"), "inventory");
  assert.equal(findSidebarGroupForPath("/settings/materials"), null);
  assert.equal(findSidebarGroupForPath("/settings/company"), null);
});

test("places physical stock count before direct adjustments", () => {
  const items = SIDEBAR_NAV_GROUPS.find((group) => group.id === "inventory")?.items ?? [];
  assert.equal(items.find((item) => item.href === "/inventory/stock-counts")?.label, "ตรวจนับสต็อกจริง");
  assert.ok(items.findIndex((item) => item.href === "/inventory/stock-counts") < items.findIndex((item) => item.href === "/inventory/adjustments"));
});
