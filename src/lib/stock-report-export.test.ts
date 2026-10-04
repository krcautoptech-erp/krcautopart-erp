import assert from "node:assert/strict";
import test from "node:test";
import { safeSpreadsheetText, stockReportFileName } from "./stock-report-export.ts";

test("neutralizes formula-like text without changing normal ERP values", () => {
  assert.equal(safeSpreadsheetText("=1+1"), "'=1+1");
  assert.equal(safeSpreadsheetText("+SUM(A1:A2)"), "'+SUM(A1:A2)");
  assert.equal(safeSpreadsheetText("RM-001"), "RM-001");
  assert.equal(safeSpreadsheetText("line\nnext"), "line next");
});

test("builds a stable xlsx filename", () => {
  assert.equal(stockReportFileName("summary", "2026-09-01", "2026-09-18"), "stock-movement-summary-2026-09-01_2026-09-18.xlsx");
});
