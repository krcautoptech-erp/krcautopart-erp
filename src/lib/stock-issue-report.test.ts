import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  stockIssueReportExportUrl,
  stockIssueReportFileName,
  validateStockIssueReportFilters,
} from "./stock-issue-report.ts";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260920130606_create_stock_issue_report.sql", import.meta.url),
  "utf8",
).toLowerCase();
const report = readFileSync(new URL("../app/(dashboard)/reports/inventory/stock-issues/stock-issue-report.tsx", import.meta.url), "utf8");
const reportStyles = readFileSync(new URL("../app/(dashboard)/reports/inventory/stock-issues/stock-issue-report.module.css", import.meta.url), "utf8");

test("stock issue report accepts only bounded filters", () => {
  assert.equal(validateStockIssueReportFilters({ view: "document", startDate: "2026-09-01", endDate: "2026-09-30", page: 1, pageSize: 20 }), null);
  assert.equal(validateStockIssueReportFilters({ view: "product", startDate: "2026-09-30", endDate: "2026-09-01", page: 1, pageSize: 20 }), "ตัวกรองรายงานไม่ถูกต้อง");
  assert.equal(validateStockIssueReportFilters({ view: "department", startDate: "2026-09-01", endDate: "2026-09-30", page: 0, pageSize: 20 }), "ตัวกรองรายงานไม่ถูกต้อง");
});

test("export URL carries every applied filter", () => {
  assert.equal(
    stockIssueReportExportUrl({ view: "product", startDate: "2026-09-01", endDate: "2026-09-30", warehouseId: 2, departmentId: 4, status: "posted", search: " RM001 " }),
    "/reports/inventory/stock-issues/export?view=product&start=2026-09-01&end=2026-09-30&warehouse=2&department=4&status=posted&q=RM001",
  );
  assert.equal(stockIssueReportFileName("department", "2026-09-01", "2026-09-30"), "stock-issue-department-2026-09-01-2026-09-30.xlsx");
});

test("report RPC is authorized, paginated, cost-protected, and indexed", () => {
  assert.match(migration, /public\.authorize\('inventory_issue\.view'\)/);
  assert.match(migration, /public\.authorize\('inventory_cost\.view'\)/);
  assert.match(migration, /limit\s+p_page_size\s+offset\s+v_offset/);
  assert.match(migration, /create index if not exists stock_issues_report_idx/);
  assert.match(migration, /revoke all on function public\.get_stock_issue_report/);
  assert.match(migration, /grant execute on function public\.get_stock_issue_report[\s\S]+to authenticated/);
});

test("all stock issue print views use the full A4 canvas and balanced columns", () => {
  assert.match(reportStyles, /width:\s*210mm\s*!important/);
  assert.match(reportStyles, /min-height:\s*297mm\s*!important/);
  assert.doesNotMatch(reportStyles, /width:\s*194mm/);
  assert.match(report, /\[3, 10, 13, 10, 17, 10, 7, 8, 12, 10\]/);
  assert.match(report, /\[3, 11, 30, 7, 9, 9, 10, 11, 10\]/);
  assert.match(report, /\[3, 29, 10, 10, 12, 14, 12, 10\]/);
  assert.match(reportStyles, /--document-logo-width:42mm!important/);
  assert.match(reportStyles, /min-height:29mm!important/);
  assert.match(reportStyles, /font-size:16\.5pt!important/);
  assert.match(reportStyles, /documentTable col:nth-child\(2\)\{width:10%!important\}/);
  assert.match(reportStyles, /documentTable col:nth-child\(3\)\{width:13%!important\}/);
  assert.match(reportStyles, /documentTable td:nth-child\(2\)[^}]+white-space:nowrap!important/);
  assert.match(report, /พิมพ์เมื่อ/);
  assert.match(report, /className=\{styles\.printMeta\}/);
  assert.match(report, /rows\.length > 0 && <tfoot>/);
});
