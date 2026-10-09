import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const migrationDir = path.join(process.cwd(), "supabase", "migrations");
const migrationFilename = readdirSync(migrationDir).find((name) =>
  name.endsWith("_delete_unused_item_master_records.sql"),
);

assert.ok(migrationFilename, "safe item deletion migration is missing");

const migration = readFileSync(
  path.join(migrationDir, migrationFilename),
  "utf8",
).toLowerCase();
const itemActions = readFileSync(
  path.join(process.cwd(), "src", "app", "actions", "items.ts"),
  "utf8",
);
const productActions = readFileSync(
  path.join(process.cwd(), "src", "app", "actions", "products.ts"),
  "utf8",
);

test("safe item deletion remains authenticated, permission-gated, and history-protected", () => {
  assert.match(migration, /create or replace function public\.delete_unused_item_master_record\(p_item_id bigint\)/);
  assert.match(migration, /security definer/);
  assert.match(migration, /public\.authorize\('items\.deactivate'\)/);
  assert.match(migration, /public\.authorize\('items\.edit'\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /pg_catalog\.pg_constraint/);
  assert.match(migration, /item_in_use/);
  assert.match(migration, /when foreign_key_violation/);
  assert.match(migration, /revoke all on function public\.delete_unused_item_master_record\(bigint\)\s+from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.delete_unused_item_master_record\(bigint\)\s+to authenticated/);
  assert.doesNotMatch(migration, /grant delete on public\.item_master/);
});

test("both catalog delete actions use the guarded database function", () => {
  const genericDelete = itemActions.slice(
    itemActions.indexOf("export async function deleteGenericItemAction"),
  );
  const productDelete = productActions.slice(
    productActions.indexOf("export async function deleteProductAction"),
    productActions.indexOf("export async function bulkImportProductsAction"),
  );

  assert.match(genericDelete, /rpc\("delete_unused_item_master_record"/);
  assert.doesNotMatch(genericDelete, /\.from\("item_master"\)\.delete\(\)/);
  assert.match(productDelete, /rpc\("delete_unused_item_master_record"/);
  assert.doesNotMatch(productDelete, /\.from\("item_master"\)\.delete\(\)/);
});
