import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/app-shell.tsx", import.meta.url), "utf8");
const report = readFileSync(
  new URL("../app/(dashboard)/reports/purchase/purchase-analysis/purchase-analysis-report.module.css", import.meta.url),
  "utf8",
);
const reportWorkspace = readFileSync(
  new URL("../app/(dashboard)/reports/report-workspace.module.css", import.meta.url),
  "utf8",
);

test("the application uses one self-hosted Thai-first font stack", () => {
  assert.doesNotMatch(layout, /next\/font\/local/);
  assert.doesNotMatch(layout, /localFont\(/);
  assert.match(layout, /<html lang="th" className="light">/);
  assert.doesNotMatch(layout, /<body className="[^"]*antialiased/);
  assert.match(globals, /--font-sarabun:\s*"Sarabun"/);
  assert.match(globals, /--font-inter:\s*"Sarabun"/);
  assert.match(globals, /src:\s*url\("\/fonts\/Sarabun-Regular\.ttf"\)/);
  assert.match(globals, /font-family:\s*var\(--font-sarabun\),\s*var\(--font-inter\)/);
  assert.match(globals, /font-synthesis:\s*none/);
  assert.match(globals, /text-rendering:\s*auto/);
  assert.doesNotMatch(globals, /-webkit-font-smoothing:\s*antialiased/);
});

test("Thai two-line labels reserve room for vowels and tone marks", () => {
  assert.match(report, /\.ranking li>span\{[^}]*max-height:calc\(2 \* 1\.55em \+ 4px\)!important[^}]*padding-block:2px!important[^}]*line-height:1\.55!important/);
  assert.match(report, /\.shareLegend span\{[^}]*max-height:calc\(2 \* 1\.55em \+ 4px\)!important[^}]*padding-block:2px!important[^}]*line-height:1\.55!important/);
});

test("small operational text stays readable on mobile and tablet", () => {
  assert.doesNotMatch(shell, /text-\[10px\][^>]*>ระบบ ERP ส่วนกลาง/);
  assert.match(report, /\.kpis small\{font-size:11px/);
  assert.match(report, /\.kpis em\{font-size:10\.5px/);
  assert.match(report, /\.ranking li\{[^}]*font-size:11\.5px/);
  assert.match(report, /\.shareLegend li\{[^}]*font-size:11\.5px/);
  assert.match(reportWorkspace, /\.mobileSwitcher small\{[^}]*font-size:11px/);
});
