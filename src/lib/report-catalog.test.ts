import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const reportCenter = readFileSync(new URL("../app/(dashboard)/reports/report-center.tsx", import.meta.url), "utf8");

test("unfinished reports are labelled as coming soon instead of open", () => {
  assert.match(reportCenter, /report\.href === "#"[\s\S]*?เร็ว ๆ นี้/);
  assert.doesNotMatch(reportCenter, /report\.href === "#"[\s\S]*?disabled[^>]*>[\s\S]*?เปิด<\/button>/);
});
