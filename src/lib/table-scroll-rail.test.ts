import assert from "node:assert/strict";
import test from "node:test";
import { tableRailGeometry } from "./table-scroll-rail.ts";

const rect = { left: 240, right: 1040, top: 200, bottom: 1200, width: 800 };
test("rail is pinned within visible viewport and tracks overflow ratio", () => {
  assert.deepEqual(tableRailGeometry(rect, 1080, 780, 800, 1600), { left: 240, width: 800, top: 744, max: 800, thumb: 400 });
});
test("vertical scrolling never moves rail from viewport bottom to table bottom", () => {
  for (const bottom of [1200, 800, 780, 600, 500, 110]) {
    assert.equal(tableRailGeometry({ ...rect, top: 50, bottom }, 1080, 780, 800, 900)?.top, 744);
  }
});
test("no rail for nonoverflowing, hidden, offscreen or clipped tables", () => {
  assert.equal(tableRailGeometry(rect, 1080, 780, 800, 800), null);
  assert.equal(tableRailGeometry({ ...rect, width: 0 }, 1080, 780, 800, 900), null);
  assert.equal(tableRailGeometry({ ...rect, top: 800 }, 1080, 780, 800, 900), null);
  assert.equal(tableRailGeometry({ ...rect, bottom: 90 }, 1080, 780, 800, 900), null);
  assert.equal(tableRailGeometry(rect, 260, 780, 800, 900), null);
});
