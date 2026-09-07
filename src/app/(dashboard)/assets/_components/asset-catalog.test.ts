import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("asset name column does not render the asset type as a second line", () => {
  const source = readFileSync(
    new URL("./asset-catalog.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /\{item\.itemTypeName\}<\/span>/);
});
