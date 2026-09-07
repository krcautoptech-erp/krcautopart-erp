import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260901150852_migrate_legacy_items_to_item_master.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

test("migrates legacy raw materials and finished goods into item_master without dropping legacy tables", () => {
  assert.match(migration, /insert\s+into\s+public\.item_master/);
  assert.match(migration, /'legacysource',\s*'raw_material'/);
  assert.match(migration, /'legacysource',\s*'product'/);
  assert.doesNotMatch(migration, /drop\s+table\s+(if\s+exists\s+)?public\.raw_materials/);
  assert.doesNotMatch(migration, /drop\s+table\s+(if\s+exists\s+)?public\.products/);
});

test("does not rely on optional legacy product updated_at column", () => {
  assert.doesNotMatch(migration, /product\.updated_at/);
  assert.match(migration, /coalesce\(product\.created_at,\s*now\(\)\)/);
});

test("temporarily disables item-code claim triggers only during legacy backfill", () => {
  assert.match(migration, /drop\s+trigger\s+if\s+exists\s+item_master_claim_code_before_insert/);
  assert.match(migration, /drop\s+trigger\s+if\s+exists\s+item_master_mark_code_claimed_after_insert/);
  assert.match(migration, /create\s+trigger\s+item_master_claim_code_before_insert\s+before\s+insert/);
  assert.match(migration, /create\s+trigger\s+item_master_mark_code_claimed_after_insert\s+after\s+insert/);
});

test("purchase requisition catalog prefers item_master over migrated legacy rows", () => {
  assert.match(migration, /select\s+'item_master'::text/);
  assert.match(migration, /not\s+exists\s*\(/);
  assert.match(migration, /master\.attributes\s*->>\s*'legacysource'\s*=\s*'raw_material'/);
});
