import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./item-create-modal.tsx", import.meta.url), "utf8");

test("item form initially opens only main and keeps collapsed fields mounted", () => {
  assert.match(source, /main: true,\s+details: false,\s+production: false,\s+stock: false,\s+files: false/);
  assert.match(source, /open \? "block" : "hidden"/);
  assert.match(source, /\.\.\.openSections,\s+\[section.id\]: !openSections\[section.id\]/);
});

test("missing required fields reveal their sections and focus the first field", () => {
  assert.match(source, /const next: Record<string, boolean> = \{ \.\.\.current, main: true \}/);
  assert.match(source, /section.keys.some\(\(key\) => keys.includes\(key\)\)/);
  assert.match(source, /scrollIntoView/);
  assert.match(source, /focus\(\{ preventScroll: true \}\)/);
  for (const key of ["code", "name", "unitId"]) assert.ok(source.includes(`fieldKey="${key}"`));
  assert.match(source, /data-item-field=\{key\}/);
});

test("compact item fields keep long values full width and group dimensions only when all three exist", () => {
  const css = readFileSync(new URL("../../../globals.css", import.meta.url), "utf8");
  assert.match(source, /item-form-main-fields/);
  assert.match(css, /\.item-form-fields\{grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.ok(css.includes('[data-item-field="nameEn"]'));
  assert.ok(css.includes('[data-item-field="description"]'));
  assert.ok(css.includes(':has(>[data-item-field="thickness"]):has(>[data-item-field="width"]):has(>[data-item-field="length"])'));
});
