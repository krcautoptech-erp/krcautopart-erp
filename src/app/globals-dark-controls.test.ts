import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

test("dark theme supplies a native dark palette for every form control", () => {
  assert.match(css, /\.dark\s*\{[^}]*color-scheme:\s*dark;/);
});

test("native select menus use the shared theme colors", () => {
  assert.match(
    css,
    /select option,\s*select optgroup\s*\{[^}]*background-color:\s*var\(--surface-container-lowest-color\);[^}]*color:\s*var\(--on-surface-color\);/,
  );
});
