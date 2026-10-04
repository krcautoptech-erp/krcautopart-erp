import assert from "node:assert/strict";
import test from "node:test";

import { calculateAnchoredScroll } from "./document-preview-zoom.ts";

test("preview zoom keeps the same document point under the gesture anchor", () => {
  assert.deepEqual(
    calculateAnchoredScroll({
      anchorClientX: 180,
      anchorClientY: 420,
      currentScale: 0.5,
      stageLeft: 40,
      stageTop: -280,
    }),
    { logicalX: 280, logicalY: 1400 },
  );
});

