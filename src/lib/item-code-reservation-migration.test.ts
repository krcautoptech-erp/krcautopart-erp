import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260826133900_make_item_code_reservations_reusable.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const claimFixMigration = readFileSync(
  new URL(
    "../../supabase/migrations/20260901145825_fix_item_code_allocation_claim_trigger.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();

test("reuses an open item-code reservation for the same user and type", () => {
  assert.match(migration, /status\s*=\s*'reserved'/);
  assert.match(migration, /reserved_by\s*=\s*v_user_id/);
  assert.match(migration, /item_type_id\s*=\s*p_item_type_id/);
  assert.match(migration, /return\s+v_existing\.item_code/);
});

test("claims the displayed item code only when item_master is inserted", () => {
  assert.match(migration, /create\s+trigger\s+item_master_claim_code_before_insert/);
  assert.match(migration, /status\s*=\s*'used'/);
  assert.match(migration, /new\.item_code\s*:=\s*v_reservation\.item_code/);
});

test("marks item-code allocation after item_master id exists", () => {
  assert.match(claimFixMigration, /create\s+trigger\s+item_master_claim_code_before_insert/);
  assert.match(claimFixMigration, /before\s+insert\s+on\s+public\.item_master/);
  assert.match(claimFixMigration, /create\s+trigger\s+item_master_mark_code_claimed_after_insert/);
  assert.match(claimFixMigration, /after\s+insert\s+on\s+public\.item_master/);
  assert.match(claimFixMigration, /item_id\s*=\s*new\.id/);
});
