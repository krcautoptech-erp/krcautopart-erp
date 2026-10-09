import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { PAGE_PERMISSIONS } from "./access-control.ts";
import * as helpCenter from "./help-center.ts";

const { HELP_GUIDES, getHelpGuide } = helpCenter;
const helpCenterComponent = readFileSync(
  path.join(process.cwd(), "src/components/erp-help-center.tsx"),
  "utf8",
);
const appShell = readFileSync(
  path.join(process.cwd(), "src/components/app-shell.tsx"),
  "utf8",
);
const loginPage = readFileSync(
  path.join(process.cwd(), "src/app/(auth)/login/login-page-client.tsx"),
  "utf8",
);

function dashboardPages(directory = path.join(process.cwd(), "src/app/(dashboard)")): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return dashboardPages(fullPath);
    if (entry.name !== "page.tsx") return [];
    const relative = path.relative(path.join(process.cwd(), "src/app/(dashboard)"), directory);
    return [`/${relative.split(path.sep).filter((segment) => !segment.startsWith("(")).join("/")}`.replace(/\/$/, "") || "/"];
  });
}

test("assigns every dashboard page to an explicit help guide route", () => {
  const coveredRoutes = new Set(HELP_GUIDES.flatMap((guide) => guide.routes));
  for (const pathname of dashboardPages()) {
    assert.ok(coveredRoutes.has(pathname), `${pathname} has no page-specific help guide route`);
  }
});

test("provides a complete operational guide for every secured ERP page", () => {
  for (const [pathname] of PAGE_PERMISSIONS) {
    const guide = getHelpGuide(pathname);
    assert.notEqual(guide.id, "general", `${pathname} fell back to the general guide`);
    assert.ok(guide.prerequisites.length > 0, `${pathname} has no preparation guidance`);
    assert.ok(guide.steps.length >= 3, `${pathname} has fewer than three workflow steps`);
    assert.ok(guide.reference.length > 0, `${pathname} has no field or control reference`);
    assert.ok(guide.completion.length > 0, `${pathname} has no completion guidance`);
    assert.ok(guide.troubleshooting.length > 0, `${pathname} has no troubleshooting guidance`);
  }
});

test("maps user and role tabs to their own guides", () => {
  assert.equal(getHelpGuide("/settings").id, "settings-index");
  assert.equal(getHelpGuide("/settings/users").id, "users");
  assert.equal(getHelpGuide("/settings/users", "?tab=roles").id, "roles");
  assert.equal(getHelpGuide("/settings/roles").id, "roles");
});

test("uses page-specific guides for catalogs and operational reports", () => {
  const expected = new Map([
    ["/items/raw-materials", "raw-materials"],
    ["/items/finished-goods", "finished-goods"],
    ["/reports", "reports-center"],
    ["/reports/purchase/pending-receipts", "pending-receipts-report"],
    ["/reports/purchase/purchase-analysis", "purchase-analysis-report"],
    ["/reports/inventory/stock-movements", "stock-movements-report"],
    ["/reports/inventory/stock-issues", "stock-issues-report"],
  ]);

  for (const [pathname, guideId] of expected) {
    const guide = getHelpGuide(pathname);
    assert.equal(guide.id, guideId);
    assert.ok(guide.reference.length >= 6, `${pathname} needs complete field and column meanings`);
  }
});

test("uses unique guide ids and keeps a general fallback", () => {
  assert.equal(new Set(HELP_GUIDES.map((guide) => guide.id)).size, HELP_GUIDES.length);
  assert.equal(getHelpGuide("/unknown").id, "general");
});

test("keeps user-management and report-workspace guidance aligned with the live UI", () => {
  const users = HELP_GUIDES.find((guide) => guide.id === "users")!;
  const reports = HELP_GUIDES.find((guide) => guide.id === "reports-center")!;
  const userCopy = JSON.stringify(users);
  const reportCopy = JSON.stringify(reports);

  assert.match(userCopy, /Username/);
  assert.doesNotMatch(userCopy, /อีเมล/);
  assert.match(reportCopy, /เมนูรายงาน/);
  assert.doesNotMatch(reportCopy, /รายการโปรด|เปิดล่าสุด|ปรับปรุงล่าสุด/);
});

test("documents login recovery, PWA installation, offline limits, and Web Push", () => {
  const login = HELP_GUIDES.find((guide) => guide.id === "login")!;
  const pwa = HELP_GUIDES.find((guide) => guide.id === "pwa-mobile")!;
  const notifications = HELP_GUIDES.find((guide) => guide.id === "notifications")!;

  assert.ok(login.routes.includes("/login"));
  assert.match(JSON.stringify(login), /OWNER|รหัสผ่าน|บัญชี/);
  assert.match(JSON.stringify(pwa), /เพิ่มไปยังหน้าจอโฮม|ออฟไลน์|Service Worker/);
  assert.match(JSON.stringify(notifications), /Web Push|iPhone|ตรวจนับสต็อก|เบราว์เซอร์ปิดกั้น/);
});

test("full-text help search includes steps, field references, and troubleshooting", () => {
  assert.equal(typeof helpCenter.filterHelpGuides, "function");
  const filterHelpGuides = helpCenter.filterHelpGuides as unknown as (
    query: string,
    permissions?: readonly string[],
    isOwner?: boolean,
  ) => typeof HELP_GUIDES;

  assert.equal(filterHelpGuides("Request ID", ["audit_logs.view"])[0]?.id, "audit-logs");
  assert.equal(filterHelpGuides("เบราว์เซอร์ปิดกั้น", [])[0]?.id, "notifications");
  assert.equal(filterHelpGuides("ส่งกลับตรวจนับ", ["stock_count.view"])[0]?.id, "stock-counts");
});

test("help topics are permission scoped while owner can see every topic", () => {
  assert.equal(typeof helpCenter.filterHelpGuides, "function");
  const filterHelpGuides = helpCenter.filterHelpGuides as unknown as (
    query: string,
    permissions?: readonly string[],
    isOwner?: boolean,
  ) => typeof HELP_GUIDES;

  const purchaser = filterHelpGuides("", ["pr.view", "po.view"]);
  assert.ok(purchaser.some((guide) => guide.id === "pr"));
  assert.ok(purchaser.some((guide) => guide.id === "purchase-analysis-report"));
  assert.ok(!purchaser.some((guide) => guide.id === "users"));
  assert.ok(!purchaser.some((guide) => guide.id === "stock-counts"));
  assert.equal(filterHelpGuides("", [], true).length, HELP_GUIDES.length);
});

test("help dialog traps and restores focus, locks background scroll, and handles empty mobile search", () => {
  assert.match(helpCenterComponent, /previouslyFocused/);
  assert.match(helpCenterComponent, /lockBodyScroll\(\)/);
  assert.match(helpCenterComponent, /unlockBodyScroll\(\)/);
  assert.match(helpCenterComponent, /event\.key === "Tab"/);
  assert.match(helpCenterComponent, /previouslyFocused\?\.focus\(\)/);
  assert.match(helpCenterComponent, /ไม่พบคู่มือที่ค้นหา/);
  assert.match(helpCenterComponent, /HELP_CONTENT_VERSION/);
  assert.match(appShell, /permissionCodes=\{permissionCodes\}/);
  assert.match(appShell, /isOwner=\{isOwner\}/);
});

test("login page opens a restricted login help guide", () => {
  assert.match(loginPage, /ErpHelpCenter/);
  assert.match(loginPage, /pathname="\/login"/);
  assert.match(loginPage, /guideIds=\{\["login"\]\}/);
});
