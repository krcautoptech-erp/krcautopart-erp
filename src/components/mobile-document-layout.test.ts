import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("mobile PO cards preserve selection, outstanding quantities and delivery dates", () => {
  const source = readFileSync(new URL("../app/(dashboard)/purchase/receipts/_components/receipt-create-modal.tsx", import.meta.url), "utf8");
  const cards = source.slice(source.indexOf('className="receipt-po-cards"'), source.indexOf('<table className="document-entry-table document-gr-picker-table'));
  assert.match(cards, /aria-pressed=\{selectedPoId === String\(item.id\)\}/);
  assert.match(cards, /onClick=\{\(\) => setSelectedPoId\(String\(item.id\)\)\}/);
  assert.match(cards, /item.outstanding_label/);
  assert.match(cards, /formatDate\(item.delivery_date\)/);
  assert.match(cards, /filteredPOs.length === 0/);
});

test("mobile PO picker uses one scrolling workspace and hides the desktop table", () => {
  const css = readFileSync(new URL("./document-form.css", import.meta.url), "utf8");
  assert.match(css, /\.receipt-po-workspace\{[^}]*overflow-y:auto/);
  assert.match(css, /\.receipt-po-list>table,\.receipt-po-selected\{display:none\}/);
  assert.match(css, /\.receipt-po-footer button\{[^}]*min-height:44px/);
});

test("compact GR reuses quantity and lot controls without duplicating inputs", () => {
  const source = readFileSync(new URL("../app/(dashboard)/purchase/receipts/_components/receipt-create-modal.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./document-form.css", import.meta.url), "utf8");
  assert.match(source, /step === 2 \? "document-gr-compact"/);
  assert.match(source, /className="receipt-mobile-reference"/);
  assert.equal((source.match(/aria-label=\{`จำนวนรับ \$\{line.itemCode\}`\}/g) || []).length, 1);
  assert.match(css, /\.document-gr-compact \.document-gr-table td:nth-child\(7\)[^{]*\{[^}]*grid-row:3/);
  assert.match(css, /\.document-gr-compact \.document-gr-table td:last-child button\{[^}]*background:transparent/);
});

test("PR PO and GR use the central mobile entry table", () => {
  for (const file of ["pr/_components/pr-create-modal.tsx", "po/_components/po-create-modal.tsx", "receipts/_components/receipt-create-modal.tsx"]) {
    const source = readFileSync(new URL(`../app/(dashboard)/purchase/${file}`, import.meta.url), "utf8");
    assert.match(source, /<DocumentEntryTable className=/);
    assert.match(source, /<\/DocumentEntryTable>/);
  }
  const shared = readFileSync(new URL("./document-form.tsx", import.meta.url), "utf8");
  assert.match(shared, /export function DocumentEntryTable/);
  assert.match(shared, /document-entry-table document-mobile-entry/);
});

test("calendar surfaces define theme-aware fallback colors for both trigger and popover", () => {
  const css = readFileSync(new URL("./date-range-picker.module.css", import.meta.url), "utf8");
  for (const selector of ["wrapper", "popover"]) {
    assert.match(css, new RegExp(`\\.${selector} \\{[^}]*--card: var\\(--surface-container-lowest-color`, "s"));
  }
});

test("mobile purchase rows pair short fields while keeping product names full width", () => {
  const css = readFileSync(new URL("./document-form.css", import.meta.url), "utf8");
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:8px 12px/);
  assert.match(css, /td:nth-child\(5\)\{grid-column:1;display:flex/);
  assert.match(css, /td:nth-child\(6\)\{grid-column:2;display:flex/);
  assert.match(css, /document-po-table td:nth-child\(8\)\{grid-column:1\}/);
  assert.match(css, /document-po-table td:nth-child\(9\)\{grid-column:2\}/);
});

test("document callers use shared mounted mobile tabs instead of losing field values", () => {
  const shared = readFileSync(new URL("./document-form.tsx", import.meta.url), "utf8");
  assert.match(shared, /export function DocumentMobileWorkspace/);
  assert.match(shared, /aria-pressed=\{tab === "document"\}/);
  assert.match(shared, /aria-pressed=\{tab === "items"\}/);
  assert.match(shared, /document-mobile-workspace-content">\{children\}/);
  for (const file of ["purchase/pr/_components/pr-create-modal.tsx", "purchase/po/_components/po-create-modal.tsx", "purchase/receipts/_components/receipt-create-modal.tsx", "inventory/issues/_components/stock-issue-page-client.tsx", "inventory/adjustments/_components/stock-adjustment-page-client.tsx"]) {
    const source = readFileSync(new URL(`../app/(dashboard)/${file}`, import.meta.url), "utf8");
    assert.match(source, /<DocumentMobileWorkspace/);
    assert.match(source, /document-metadata-section/);
    assert.match(source, /document-items-section/);
  }
});

test("selected mobile reference keeps note labels above inputs and tools off the main toolbar", () => {
  const css = readFileSync(new URL("./document-form.css", import.meta.url), "utf8");
  assert.match(css, /document-pr-table td:nth-child\(7\)\{[^}]*flex-direction:column/);
  assert.match(css, /document-mobile-entry tbody\{gap:10px!important\}/);
  assert.match(css, /document-mobile-entry td\{height:auto!important\}/);
  const shared = readFileSync(new URL("./document-form.tsx", import.meta.url), "utf8");
  assert.match(shared, /summary aria-label="เครื่องมือรายการเพิ่มเติม"/);
  assert.match(shared, /searchOpen && <div className="document-mobile-search"/);
});
