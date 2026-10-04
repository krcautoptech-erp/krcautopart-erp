import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  classifyFulfillment,
  monthKeys,
  normalizeAsOfDate,
  normalizeReportedPercent,
  percent,
} from "./erp-dashboard.ts";

const dashboardStyles = readFileSync(
  new URL(
    "../app/(dashboard)/workspace/erp-dashboard.module.css",
    import.meta.url,
  ),
  "utf8",
);
const dashboardView = readFileSync(
  new URL(
    "../app/(dashboard)/workspace/erp-dashboard.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("dashboard fulfillment follows ERP receiving rules", () => {
  assert.equal(
    classifyFulfillment(10, 10, "2026-10-01", "2026-10-03"),
    "received",
  );
  assert.equal(
    classifyFulfillment(10, 2, "2026-10-05", "2026-10-03"),
    "partial",
  );
  assert.equal(
    classifyFulfillment(10, 0, "2026-10-01", "2026-10-03"),
    "overdue",
  );
  assert.deepEqual(monthKeys(new Date("2026-10-03T00:00:00Z"), 3), [
    "2026-08",
    "2026-09",
    "2026-10",
  ]);
  assert.equal(percent(1, 4), 25);
  assert.equal(normalizeAsOfDate("2026-09-30", "2026-10-03"), "2026-09-30");
  assert.equal(normalizeAsOfDate("2026-10-04", "2026-10-03"), "2026-10-03");
  assert.equal(normalizeAsOfDate("not-a-date", "2026-10-03"), "2026-10-03");
  assert.equal(normalizeReportedPercent(0.107), 11);
  assert.equal(normalizeReportedPercent(92), 92);
});

test("mobile dashboard fits charts and summary cards inside a 320px viewport", () => {
  const mobileRule = dashboardStyles.match(
    /@media \(max-width: 640px\) \{([\s\S]*?)\n\}/,
  )?.[1];

  assert.ok(mobileRule, "mobile dashboard breakpoint must exist");
  assert.doesNotMatch(mobileRule, /min-width:\s*(?:420|620|760)px/);
  assert.match(
    mobileRule,
    /\.kpiGrid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    mobileRule,
    /\.barChart,\s*\n?\s*\.movementChart\s*\{[\s\S]*?width:\s*100%/,
  );
  assert.match(mobileRule, /\.fulfillmentCards\s*\{[\s\S]*?display:\s*grid/);
});

test("mobile dashboard replaces wide operational tables with readable cards", () => {
  assert.match(dashboardView, /aria-label="รายการสถานะการรับสินค้าบนมือถือ"/);
  assert.match(dashboardView, /aria-label="รายการงานที่ต้องทำบนมือถือ"/);
  assert.match(dashboardView, /aria-label="รายการความเคลื่อนไหวล่าสุดบนมือถือ"/);
  assert.match(
    dashboardStyles,
    /@media \(max-width: 640px\)[\s\S]*?\.desktopTable\s*\{\s*display:\s*none/,
  );
  assert.match(
    dashboardStyles,
    /@media \(max-width: 640px\)[\s\S]*?\.mobileList\s*\{\s*display:\s*grid/,
  );
});
