import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { purchaseAnalysisDeliveryLabel, purchaseAnalysisExportUrl, purchaseAnalysisShareRows, uniquePurchaseAnalysisOptions, validatePurchaseAnalysisFilters } from "./purchase-analysis.ts";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260919124523_create_purchase_analysis_report.sql", import.meta.url),
  "utf8",
).toLowerCase();
const detailMigration = readFileSync(
  new URL("../../supabase/migrations/20260919173323_purchase_analysis_vendor_detail.sql", import.meta.url),
  "utf8",
).toLowerCase();
const vendorDrawer = readFileSync(
  new URL("../app/(dashboard)/reports/purchase/purchase-analysis/purchase-analysis-vendor-detail.tsx", import.meta.url),
  "utf8",
);
const migrationsUrl = new URL("../../supabase/migrations/", import.meta.url);
const productMigrationName = readdirSync(migrationsUrl).find((name) => name.endsWith("_purchase_analysis_product_detail.sql"));
const productMigration = productMigrationName ? readFileSync(new URL(productMigrationName, migrationsUrl), "utf8").toLowerCase() : "";
const productDrawerUrl = new URL("../app/(dashboard)/reports/purchase/purchase-analysis/purchase-analysis-product-detail.tsx", import.meta.url);
const productDrawer = existsSync(productDrawerUrl) ? readFileSync(productDrawerUrl, "utf8") : "";
const report = readFileSync(
  new URL("../app/(dashboard)/reports/purchase/purchase-analysis/purchase-analysis-report.tsx", import.meta.url),
  "utf8",
);
const reportStyles = readFileSync(
  new URL("../app/(dashboard)/reports/purchase/purchase-analysis/purchase-analysis-report.module.css", import.meta.url),
  "utf8",
);
const documentHeaderStyles = readFileSync(
  new URL("../components/company-document-header.module.css", import.meta.url),
  "utf8",
);

test("purchase analysis accepts only bounded report filters", () => {
  assert.equal(validatePurchaseAnalysisFilters({ view: "vendor", startDate: "2026-09-01", endDate: "2026-09-19", page: 1, pageSize: 20 }), null);
  assert.equal(validatePurchaseAnalysisFilters({ view: "product", startDate: "2026-09-19", endDate: "2026-09-01", page: 1, pageSize: 20 }), "ตัวกรองรายงานไม่ถูกต้อง");
  assert.equal(validatePurchaseAnalysisFilters({ view: "vendor", startDate: "2026-09-01", endDate: "2026-09-19", page: 1, pageSize: 10 }), "ตัวกรองรายงานไม่ถูกต้อง");
});

test("export URL carries every applied filter", () => {
  assert.equal(
    purchaseAnalysisExportUrl({ view: "product", startDate: "2026-09-01", endDate: "2026-09-19", vendorId: 12, itemTypeId: 3, search: " RM 001 " }),
    "/reports/purchase/purchase-analysis/export?view=product&start=2026-09-01&end=2026-09-19&vendor=12&group=3&q=RM+001",
  );
});

test("PO delivery label preserves item-level delivery dates", () => {
  assert.equal(purchaseAnalysisDeliveryLabel(["2026-09-10", "2026-09-10"]), "10/09/2026");
  assert.equal(purchaseAnalysisDeliveryLabel(["2026-09-10", "2026-09-15"]), "10/09/2026 – 15/09/2026");
  assert.equal(purchaseAnalysisDeliveryLabel([]), "-");
});

test("report filter options keep one entry per database id", () => {
  assert.deepEqual(
    uniquePurchaseAnalysisOptions([
      { id: 2, code: "SUP002", name: "ชื่อจากเอกสารเก่า" },
      { id: 2, code: "SUP002", name: "ชื่อปัจจุบัน" },
      { id: 3, code: "SUP003", name: "ผู้ขายรายอื่น" },
    ]),
    [
      { id: 2, code: "SUP002", name: "ชื่อจากเอกสารเก่า" },
      { id: 3, code: "SUP003", name: "ผู้ขายรายอื่น" },
    ],
  );
});

test("purchase share chart keeps the largest categories and combines the remainder", () => {
  assert.deepEqual(
    purchaseAnalysisShareRows([
      { name: "A", total_value: 50 },
      { name: "B", total_value: 30 },
      { name: "C", total_value: 10 },
      { name: "D", total_value: 5 },
      { name: "E", total_value: 5 },
    ], 3),
    [
      { name: "A", value: 50 },
      { name: "B", value: 30 },
      { name: "C", value: 10 },
      { name: "อื่น ๆ", value: 10 },
    ],
  );
});

test("purchase analysis uses top-ten ranking, a value-share donut, and line icons", () => {
  assert.match(report, /slice\(0, 10\)/);
  assert.match(report, /10 \{view === "vendor" \? "ผู้ขาย" : "สินค้า"\}ยอดซื้อสูงสุด/);
  assert.match(report, /สัดส่วนมูลค่า PO ตาม\{view === "vendor" \? "ผู้ขาย" : "สินค้า"\}/);
  assert.match(report, /<PieChart/);
  assert.doesNotMatch(report, /<h2>ผลการรับสินค้า<\/h2>/);
  assert.match(reportStyles, /\.kpis article>svg\{/);
  assert.doesNotMatch(reportStyles, /\.kpis article>span\{[^}]*border-radius:50%/);
  assert.match(reportStyles, /max-height:calc\(2 \* 1\.45em\)/);
  assert.doesNotMatch(reportStyles, /\.ranking li>span\{[^}]*text-overflow:ellipsis/);
});

test("purchase analysis switches to the non-overflowing tablet layout on iPad portrait", () => {
  assert.match(reportStyles, /@media\(max-width:900px\)\{\.report\{/);
  assert.match(reportStyles, /\.dates\{grid-column:1\/11\}/);
  assert.match(reportStyles, /\.kpis\{grid-template-columns:1fr 1fr/);
  assert.match(reportStyles, /\.insights\{display:block\}/);
  assert.match(reportStyles, /\.desktop\{display:none\}\.mobile\{display:block\}/);
});

test("purchase analysis keeps KPI values and ranking columns inside a 320px viewport", () => {
  assert.match(reportStyles, /@media\(max-width:380px\)/);
  assert.match(reportStyles, /\.kpis article\{[^}]*padding:9px 8px/);
  assert.match(reportStyles, /\.kpis strong\{[^}]*font-size:13px/);
  assert.match(
    reportStyles,
    /\.ranking li\{[^}]*grid-template-columns:minmax\(0,1\.2fr\) minmax\(52px,\.8fr\) 72px/,
  );
  assert.match(reportStyles, /\.ranking li>strong\{[^}]*font-size:10px/);
});

test("report RPC is permission-checked, paginated, and excludes non-operational orders", () => {
  assert.match(migration, /public\.authorize\('po\.view'\)/);
  assert.match(migration, /status\s+in\s*\('approved',\s*'sent',\s*'partially_received',\s*'received'\)/);
  assert.match(migration, /limit\s+p_page_size\s+offset\s+v_offset/);
  assert.match(migration, /revoke all on function public\.get_purchase_analysis_report/);
  assert.match(migration, /grant execute on function public\.get_purchase_analysis_report[\s\S]+to authenticated/);
});

test("vendor detail RPC is permission-checked and evaluates receipts against each item delivery date", () => {
  assert.match(detailMigration, /public\.authorize\('po\.view'\)/);
  assert.match(detailMigration, /receipt\.document_date\s*<=\s*coalesce\(po_item\.delivery_date,\s*purchase_order\.delivery_date\)/);
  assert.match(detailMigration, /revoke all on function public\.get_purchase_analysis_vendor_detail/);
  assert.match(detailMigration, /grant execute on function public\.get_purchase_analysis_vendor_detail[\s\S]+to authenticated/);
});

test("desktop vendor detail reuses the shared ERP data table", () => {
  assert.match(vendorDrawer, /import \{ DataTable, DataTableFrame \} from "@\/components\/data-table"/);
  assert.match(vendorDrawer, /<DataTableFrame className=\{styles\.drawerTableFrame\}>/);
  assert.match(vendorDrawer, /<DataTable className=\{styles\.drawerTable\}>/);
});

test("vendor profile groups registration and contact information", () => {
  assert.match(vendorDrawer, /ข้อมูลจดทะเบียน/);
  assert.match(vendorDrawer, /ข้อมูลติดต่อ/);
  assert.match(vendorDrawer, /className=\{styles\.vendorAddress\}/);
});

test("product detail RPC is permission-checked and evaluates each item delivery date", () => {
  assert.match(productMigration, /public\.authorize\('po\.view'\)/);
  assert.match(productMigration, /receipt\.document_date\s*<=\s*coalesce\(po_item\.delivery_date,\s*purchase_order\.delivery_date\)/);
  assert.match(productMigration, /revoke all on function public\.get_purchase_analysis_product_detail/);
  assert.match(productMigration, /grant execute on function public\.get_purchase_analysis_product_detail[\s\S]+to authenticated/);
});

test("product detail mirrors the vendor drawer and reuses the shared data table", () => {
  assert.match(productDrawer, /import \{ DataTable, DataTableFrame \} from "@\/components\/data-table"/);
  assert.match(productDrawer, /รายละเอียดสินค้า/);
  assert.match(productDrawer, /กำหนดส่งสินค้า/);
  assert.match(productDrawer, /className=\{styles\.productVendorName\}/);
});

test("product rows open the shared detail drawer on desktop and mobile", () => {
  assert.match(report, /PurchaseAnalysisProductDrawer/);
  assert.match(report, /view === "vendor" \? <PurchaseAnalysisVendorDrawer[\s\S]+<PurchaseAnalysisProductDrawer/);
  assert.doesNotMatch(report, /view === "product" \? <a className=\{styles\.card\}/);
});

test("web and print tables omit the nonessential average price column", () => {
  assert.doesNotMatch(report, /ราคาเฉลี่ย/);
  assert.doesNotMatch(report, /row\.average_price/);
  assert.match(report, /\[3\.5, 8, 29, 7, 8, 8, 7\.5, 15, 14\]/);
  assert.match(report, /\[3\.5, 7, 26\.5, 6\.5, 7, 7\.5, 7\.5, 7\.5, 15, 12\]/);
});

test("print view hides the application shell and uses the shared document layout", () => {
  assert.match(report, /printElement\(printRoot\.current/);
  assert.match(report, /orientation: "portrait"/);
  assert.match(report, /<CompanyDocumentHeader/);
  assert.match(report, /meta=\{\[\{ label: "พิมพ์เมื่อ"/);
  assert.match(report, /ref=\{printRoot\}/);
  assert.match(report, /className=\{styles\.printFooter\}/);
  assert.match(reportStyles, /size:A4 portrait/);
  assert.match(reportStyles, /--document-logo-width:42mm!important/);
  assert.match(reportStyles, /min-height:29mm!important/);
  assert.match(reportStyles, /font-size:16\.5pt!important/);
  assert.match(reportStyles, /font-size:8pt!important/);
  assert.match(reportStyles, /\.printRoot \.printTable thead th[^}]+white-space:normal!important/);
  assert.match(reportStyles, /tbody td:nth-child\(n\+4\)[^}]+white-space:nowrap!important/);
  assert.match(report, /printable && <colgroup>/);
  assert.doesNotMatch(documentHeaderStyles, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(documentHeaderStyles, /-webkit-line-clamp:\s*[12]/);
});
