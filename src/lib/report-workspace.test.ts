import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../app/(dashboard)/reports/", import.meta.url);

test("reports open a real report inside the shared collapsible workspace", async () => {
  const [page, layout, workspace] = await Promise.all([
    readFile(new URL("page.tsx", root), "utf8"),
    readFile(new URL("layout.tsx", root), "utf8"),
    readFile(new URL("report-workspace.tsx", root), "utf8"),
  ]);

  assert.match(page, /redirect\("\/reports\/purchase\/purchase-analysis"\)/);
  assert.match(layout, /<ReportWorkspace>\{children\}<\/ReportWorkspace>/);
  assert.match(workspace, /AVAILABLE_REPORT_CATALOG/);
  assert.match(workspace, /aria-expanded=\{!collapsed\}/);
  assert.match(workspace, /report-workspace-collapsed/);
  assert.match(workspace, /role="dialog"/);
  assert.match(workspace, /เลือก report|เลือกรายงาน/);
});

test("report workspace preserves complete table values without ellipsis", async () => {
  const styles = await readFile(new URL("report-workspace.module.css", root), "utf8");

  assert.match(styles, /width:\s*max-content/);
  assert.match(styles, /white-space:\s*nowrap/);
  assert.match(styles, /max-height:\s*calc\(2\s*\*/);
  assert.match(styles, /text-overflow:\s*clip/);
  assert.doesNotMatch(styles, /text-overflow:\s*ellipsis/);
  assert.match(styles, /@media\s*\(max-width:\s*900px\)/);
  assert.match(styles, /\.collapsed\s+\.mobileList\s+\.reportLink>span:nth-child\(2\)[^{]+\{display:inline\}/);
  assert.match(styles, /\.mobileList \.reportLink>span:nth-child\(2\)[^{]+\{display:inline!important\}/);
}
);

test("purchase analysis rows use collision-safe React keys", async () => {
  const report = await readFile(new URL("purchase/purchase-analysis/purchase-analysis-report.tsx", root), "utf8");
  assert.doesNotMatch(report, /key=\{row\.group_id\}/);
  assert.match(report, /key=\{`\$\{row\.group_id\}:\$\{row\.code\}:\$\{index\}`\}/);
});

test("desktop report navigation is a full-height secondary rail flush with the app shell", async () => {
  const styles = await readFile(new URL("report-workspace.module.css", root), "utf8");

  assert.match(styles, /\.workspace\{[^}]*margin:-16px[^}]*min-height:calc\(100dvh - 92px\)[^}]*gap:0/);
  assert.match(styles, /\.rail\{[^}]*height:calc\(100dvh - 92px\)[^}]*border-radius:0/);
  assert.match(styles, /\.content\{[^}]*padding:16px/);
  assert.match(styles, /@media\(max-width:900px\)\{\.workspace\{[^}]*margin:0[^}]*min-height:0/);
  assert.match(styles, /\.mobileSheet\{/);
});

test("purchase analysis filters stay compact inside the report workspace", async () => {
  const styles = await readFile(new URL("purchase/purchase-analysis/purchase-analysis-report.module.css", root), "utf8");
  assert.match(styles, /grid-template-columns:minmax\(220px,1\.2fr\) minmax\(120px,\.65fr\) minmax\(120px,\.65fr\) minmax\(160px,\.9fr\) 90px 120px 100px/);
  assert.match(styles, /container-type:inline-size/);
  assert.match(styles, /@container\(max-width:1050px\)/);
});

test("iPad portrait uses the compact report workspace without horizontal overflow", async () => {
  const [workspaceStyles, reportStyles] = await Promise.all([
    readFile(new URL("report-workspace.module.css", root), "utf8"),
    readFile(new URL("purchase/purchase-analysis/purchase-analysis-report.module.css", root), "utf8"),
  ]);

  assert.match(workspaceStyles, /@media\(max-width:900px\)\{\.workspace\{/);
  assert.match(reportStyles, /@media\(max-width:900px\)\{\.report\{/);
  assert.match(reportStyles, /\.kpis\{grid-template-columns:1fr 1fr/);
  assert.match(reportStyles, /\.insights\{display:block\}/);
  assert.match(reportStyles, /\.desktop\{display:none\}\.mobile\{display:block\}/);
});

test("every operational report uses the shared mobile filter sheet", async () => {
  const reports = await Promise.all([
    readFile(new URL("purchase/purchase-analysis/purchase-analysis-report.tsx", root), "utf8"),
    readFile(new URL("purchase/pending-receipts/pending-receipts-report.tsx", root), "utf8"),
    readFile(new URL("inventory/stock-movements/stock-movement-report.tsx", root), "utf8"),
    readFile(new URL("inventory/stock-issues/stock-issue-report.tsx", root), "utf8"),
  ]);

  for (const report of reports) {
    assert.match(report, /MobileListFilters/);
    assert.match(report, /activeCount=/);
    assert.match(report, /onClear=/);
  }
});

test("pending receipts uses the shared mobile document cards instead of its desktop table", async () => {
  const [report, mobileList] = await Promise.all([
    readFile(new URL("purchase/pending-receipts/pending-receipts-report.tsx", root), "utf8"),
    readFile(new URL("../../../components/mobile-document-list.tsx", root), "utf8"),
  ]);

  assert.match(report, /MobileDocumentList/);
  assert.match(report, /className="min-\[901px\]:hidden"/);
  assert.match(report, /className="hidden min-\[901px\]:block/);
  assert.match(report, /purchaseOrderSearchHref\(row\.poNumber, row\.documentDate\)/);
  assert.match(mobileList, /className\?: string/);
});

test("every operational report uses one shared mobile export menu", async () => {
  const [component, ...reports] = await Promise.all([
    readFile(new URL("../../../components/mobile-report-actions.tsx", root), "utf8"),
    readFile(new URL("purchase/purchase-analysis/purchase-analysis-report.tsx", root), "utf8"),
    readFile(new URL("purchase/pending-receipts/pending-receipts-report.tsx", root), "utf8"),
    readFile(new URL("inventory/stock-movements/stock-movement-report.tsx", root), "utf8"),
    readFile(new URL("inventory/stock-issues/stock-issue-report.tsx", root), "utf8"),
  ]);

  assert.match(component, /aria-label="เมนูส่งออก"/);
  assert.match(component, /role="dialog"/);
  for (const report of reports) assert.match(report, /MobileReportActions/);
});

test("desktop-only report filters are isolated from mobile CSS module overrides", async () => {
  const reports = await Promise.all([
    readFile(new URL("purchase/purchase-analysis/purchase-analysis-report.tsx", root), "utf8"),
    readFile(new URL("inventory/stock-movements/stock-movement-report.tsx", root), "utf8"),
    readFile(new URL("inventory/stock-issues/stock-issue-report.tsx", root), "utf8"),
  ]);

  for (const report of reports) {
    assert.match(report, /<div className="hidden min-\[901px\]:block">\s*<form className=/);
    assert.doesNotMatch(report, /className=\{`\$\{styles\.filters\}[^`]*hidden/);
  }
});
