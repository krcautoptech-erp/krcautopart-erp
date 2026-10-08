import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  addDays,
  classifyFulfillment,
  formatThaiDate,
  formatThaiRange,
  getCalendarMatrix,
  getLastMonthRange,
  monthKeys,
  normalizeAsOfDate,
  normalizeDateRange,
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
const dashboardAction = readFileSync(
  new URL("../app/actions/erp-dashboard.ts", import.meta.url),
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

test("dashboard stock issue tasks only query columns present in the schema", () => {
  assert.doesNotMatch(dashboardAction, /issued_to_name/);
  assert.match(dashboardAction, /requester_name/);
});

test("date range picker helpers compute accurate Bangkok boundaries and formatting", () => {
  const range = normalizeDateRange("2026-09-01", "2026-10-07", "2026-10-07");
  assert.equal(range.startDate, "2026-09-01");
  assert.equal(range.endDate, "2026-10-07");

  // Defaults to start of month when start is omitted
  const defaultRange = normalizeDateRange(undefined, "2026-10-07", "2026-10-07");
  assert.equal(defaultRange.startDate, "2026-10-01");
  assert.equal(defaultRange.endDate, "2026-10-07");

  // Clamps future end date to today
  const clampedRange = normalizeDateRange("2026-10-01", "2026-10-15", "2026-10-07");
  assert.equal(clampedRange.endDate, "2026-10-07");

  // addDays offsets
  assert.equal(addDays("2026-10-07", -1), "2026-10-06");
  assert.equal(addDays("2026-10-07", -6), "2026-10-01");
  assert.equal(addDays("2026-10-07", -29), "2026-09-08");

  // getLastMonthRange
  const lastMonth = getLastMonthRange("2026-10-07");
  assert.equal(lastMonth.startDate, "2026-09-01");
  assert.equal(lastMonth.endDate, "2026-09-30");

  // Formatting in Thai Buddhist Era
  assert.equal(formatThaiDate("2026-10-07"), "7 ต.ค. 2569");
  assert.equal(formatThaiRange("2026-10-01", "2026-10-07"), "1 – 7 ต.ค. 2569");
  assert.equal(formatThaiRange("2026-09-01", "2026-10-07"), "1 ก.ย. – 7 ต.ค. 2569");

  // Calendar matrix produces 42 days (6 full weeks) starting on Monday
  const septMatrix = getCalendarMatrix(2026, 9);
  assert.equal(septMatrix.length, 42);
  assert.equal(septMatrix[0].date, "2026-08-31"); // Monday overflow
  assert.equal(septMatrix[0].isCurrentMonth, false);
  assert.equal(septMatrix[1].date, "2026-09-01"); // Tuesday 1st
  assert.equal(septMatrix[1].isCurrentMonth, true);

  const octMatrix = getCalendarMatrix(2026, 10);
  assert.equal(octMatrix.length, 42);
  assert.equal(octMatrix[0].date, "2026-09-28"); // Monday overflow
});

test("dashboard integrates DateRangePicker and protects against icon overlap", () => {
  assert.match(dashboardView, /<DateRangePicker/);
  assert.doesNotMatch(dashboardView, /id="filter-preset"/);
  assert.doesNotMatch(dashboardView, /id="filter-date"/);

  // Control field uses flexbox layout with gap to prevent icon text collisions
  assert.match(dashboardStyles, /\.controlField\s*\{[\s\S]*?display:\s*flex/);
  assert.match(dashboardStyles, /\.controlField\s*\{[\s\S]*?gap:\s*8px/);
});

