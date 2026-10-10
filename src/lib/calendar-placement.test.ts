import assert from "node:assert/strict";
import test from "node:test";
import { calendarPlacement } from "./calendar-placement.ts";

test("calendar stays inside viewport when trigger is near the left edge", () => {
  assert.deepEqual(calendarPlacement({ left: 280, bottom: 240, top: 200 }, 680, 380, 1024, 768), { left: 280, top: 246, maxHeight: 744 });
});

test("calendar shifts left and opens upward when right and bottom space are limited", () => {
  assert.deepEqual(calendarPlacement({ left: 900, bottom: 700, top: 660 }, 680, 380, 1024, 768), { left: 332, top: 274, maxHeight: 744 });
});

test("oversized calendar is constrained within a short viewport", () => {
  assert.deepEqual(calendarPlacement({ left: 20, bottom: 160, top: 120 }, 680, 600, 800, 400), { left: 20, top: 12, maxHeight: 376 });
});
