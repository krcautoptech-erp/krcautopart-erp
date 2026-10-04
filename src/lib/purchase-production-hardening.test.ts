import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const migrationsDir = join(process.cwd(), "supabase", "migrations");

function hardeningMigration() {
  const file = readdirSync(migrationsDir).find((name) =>
    name.endsWith("_harden_purchase_production_rollout.sql"),
  );
  assert.ok(file, "production hardening migration must exist");
  return readFileSync(join(migrationsDir, file), "utf8");
}

test("PR mutations are RPC-only for authenticated clients", () => {
  const sql = hardeningMigration();
  assert.match(sql, /drop policy if exists "Authenticated users can manage purchase requisitions"/);
  assert.match(sql, /revoke insert, update, delete on public\.purchase_requisitions from authenticated/);
  assert.match(sql, /revoke insert, update, delete on public\.purchase_requisition_items from authenticated/);
  assert.match(sql, /create policy "Authorized users can read purchase requisitions"[\s\S]*authorize\('pr\.view'\)/);
});

test("goods receipt posting is idempotent and cancellation is an audited reversal", () => {
  const sql = hardeningMigration();
  assert.match(sql, /add column if not exists request_key uuid/);
  assert.match(sql, /unique \(request_key\)/);
  assert.match(sql, /p_request_key uuid/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /create or replace function public\.cancel_goods_receipt/);
  assert.match(sql, /inventory\.cancel_gr/);
  assert.match(sql, /goods_receipt_reversal/);
  assert.match(sql, /reversal_of_transaction_id/);
  assert.match(sql, /goods_receipt_status_logs/);
  assert.match(sql, /goods_receipt_stock_already_consumed/);
  assert.match(sql, /pre_receipt_po_status/);
  assert.match(sql, /v_receipt\.purchase_order_id, v_previous_po_status, v_po_status/);
  assert.match(sql, /movement\.id > v_tx\.id/);
  assert.match(sql, /cost\.inventory_transaction_id = v_tx\.id for update/);
});
