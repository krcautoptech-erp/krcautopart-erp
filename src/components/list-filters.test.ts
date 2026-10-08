import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shared list filters own the standard date range and action button designs", async () => {
  const source = await readFile("src/components/list-filters.tsx", "utf8");

  assert.match(source, /export function ListDateRangeFilter/);
  assert.match(source, /export function ListFilterButton/);
  assert.match(source, /<DateRangePicker/);
  assert.match(source, /type="hidden"/);
  assert.match(source, /onRangeChange/);
});

test("shared date range picker keeps mobile changes pending until confirmation", async () => {
  const source = await readFile("src/components/date-range-picker.tsx", "utf8");
  const styles = await readFile("src/components/date-range-picker.module.css", "utf8");

  assert.match(source, /setDraftRange\(preset\.range\)/);
  assert.match(source, /เลือกช่วงวันที่/);
  assert.match(source, /maxDate/);
  assert.doesNotMatch(source, /onChange\(preset\.range\)/);
  assert.match(styles, /\.mobileHeader/);
  assert.match(styles, /height:\s*44px/);
  assert.match(styles, /position:\s*sticky/);
});

test("primary ERP list pages use the shared date range filter", async () => {
  const paths = [
    "src/app/(dashboard)/purchase/pr/_components/pr-list-page.tsx",
    "src/app/(dashboard)/purchase/po/_components/po-list-page.tsx",
    "src/app/(dashboard)/purchase/receipts/_components/receipt-list-page.tsx",
    "src/app/(dashboard)/inventory/issues/_components/stock-issue-page-client.tsx",
    "src/app/(dashboard)/inventory/stock-counts/_components/stock-count-list-page.tsx",
  ];

  for (const path of paths) {
    const source = await readFile(path, "utf8");
    assert.match(source, /ListDateRangeFilter/, path);
  }

  const center = await readFile("src/app/(dashboard)/reports/report-center.tsx", "utf8");
  assert.match(center, /ListSearchField/);
  assert.match(center, /ListFilterSelect/);
});

test("available operational reports use the shared ERP filter controls", async () => {
  const paths = [
    "src/app/(dashboard)/reports/inventory/stock-issues/stock-issue-report.tsx",
    "src/app/(dashboard)/reports/inventory/stock-movements/stock-movement-report.tsx",
    "src/app/(dashboard)/reports/purchase/purchase-analysis/purchase-analysis-report.tsx",
    "src/app/(dashboard)/reports/purchase/pending-receipts/pending-receipts-report.tsx",
  ];

  for (const path of paths) {
    const source = await readFile(path, "utf8");
    assert.match(source, /ListDateRangeFilter/, path);
    assert.match(source, /ListFilterButton/, path);
  }
});

test("mobile filter submits its linked report form before the sheet closes", async () => {
  const source = await readFile("src/components/list-filters.tsx", "utf8");

  assert.match(source, /instanceof HTMLFormElement/);
  assert.match(source, /requestSubmit\(\)/);
  assert.doesNotMatch(source, /onClick=\{close\} type=\{formId \? "submit"/);
});

test("central mobile filters fit phone and tablet viewports safely", async () => {
  const source = await readFile("src/components/list-filters.tsx", "utf8");

  assert.match(source, /h-\[calc\(100dvh-8px\)\]/);
  assert.match(source, /sm:max-h-\[88dvh\]/);
  assert.match(source, /env\(safe-area-inset-bottom\)/);
  assert.match(source, /document\.body\.style\.overflow = "hidden"/);
  assert.match(source, /mobile-filter-sheet/);
});

test("every operational list with shared filters uses the central mobile filter sheet", async () => {
  const paths = [
    "src/app/(dashboard)/inventory/adjustments/_components/stock-adjustment-page-client.tsx",
    "src/app/(dashboard)/inventory/issues/_components/stock-issue-page-client.tsx",
    "src/app/(dashboard)/inventory/stock-counts/_components/stock-count-list-page.tsx",
    "src/app/(dashboard)/reports/report-center.tsx",
    "src/app/(dashboard)/items/_components/item-catalog.tsx",
    "src/app/(dashboard)/products/_components/product-catalog.tsx",
    "src/app/(dashboard)/vendors/_components/vendor-management.tsx",
    "src/app/(dashboard)/partners/_components/customer-management.tsx",
    "src/app/(dashboard)/settings/users/_components/user-management.tsx",
    "src/app/(dashboard)/settings/warehouses/_components/warehouse-management.tsx",
    "src/app/(dashboard)/settings/departments/_components/department-management.tsx",
    "src/app/(dashboard)/settings/materials/_components/raw-material-settings.tsx",
    "src/app/(dashboard)/settings/document-terms/_components/document-term-settings.tsx",
    "src/app/(dashboard)/vendor-settings/_components/vendor-settings-panel.tsx",
  ];

  for (const path of paths) {
    const source = await readFile(path, "utf8");
    assert.match(source, /MobileListFilters/, path);
  }
});
