import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv, spreadsheetRecords } from "./spreadsheet-import.ts";

test("parses quoted commas, escaped quotes and line breaks", () => {
  assert.deepEqual(parseCsv('code,name,note\nRM01,"Steel, sheet","say ""ok"""\n'), [
    ["code", "name", "note"],
    ["RM01", "Steel, sheet", 'say "ok"'],
  ]);
});

test("normalizes spreadsheet headers into records", () => {
  assert.deepEqual(spreadsheetRecords({ headers: ["รหัสสินค้า", "Item Code"], rows: [["RM01", "A-1"]] }), [{ รหัสสินค้า: "RM01", itemcode: "A-1" }]);
});
