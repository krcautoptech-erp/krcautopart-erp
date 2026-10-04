import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../../supabase/migrations/20260918122333_create_stock_adjustments_and_stock_report_rpc.sql", import.meta.url), "utf8");
const reservationSql = readFileSync(new URL("../../supabase/migrations/20260919091015_use_reserved_stock_adjustment_number.sql", import.meta.url), "utf8");
const productionRepairSql = readFileSync(new URL("../../supabase/migrations/20260919104709_repair_production_stock_adjustments.sql", import.meta.url), "utf8");
const lintCleanupSql = readFileSync(new URL("../../supabase/migrations/20260919114503_remove_unused_stock_adjustment_reversal_variable.sql", import.meta.url), "utf8");
const inventoryRlsSql = readFileSync(new URL("../../supabase/migrations/20260919122500_optimize_inventory_rls_policies.sql", import.meta.url), "utf8");
const publicGrantHardeningSql = readFileSync(new URL("../../supabase/migrations/20260919125500_harden_public_table_grants.sql", import.meta.url), "utf8");

test("stock adjustment migration enforces atomic RPC-only writes and reversal audit", () => {
  assert.match(sql, /alter table public\.stock_adjustments enable row level security/i);
  assert.match(sql, /revoke insert, update, delete on public\.stock_adjustments/i);
  assert.match(sql, /security definer\s+set search_path = ''/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /reversal_of_transaction_id/i);
  assert.match(sql, /positive_adjustment_already_consumed/i);
});

test("stock report is database-paginated with Bangkok boundaries and only current document types", () => {
  assert.match(sql, /at time zone 'Asia\/Bangkok'/i);
  assert.match(sql, /limit p_page_size offset v_offset/i);
  assert.match(sql, /'goods_receipt', 'stock_issue', 'stock_issue_reversal', 'stock_adjustment', 'stock_adjustment_reversal'/i);
  assert.doesNotMatch(sql, /reference_doc_type in \([^)]*production_receipt/i);
});

test("stock adjustment claims its displayed reserved number", () => {
  assert.doesNotMatch(reservationSql, /pg_get_functiondef/i);
  assert.match(reservationSql, /create or replace function public\.reserve_business_number/i);
  assert.match(reservationSql, /create or replace function public\.post_stock_adjustment/i);
  assert.match(reservationSql, /when 'AD' then 'inventory_adjustment\.create'/i);
  assert.match(reservationSql, /claim_business_number\([\s\S]*?'AD'/i);
  assert.match(reservationSql, /invalid_or_expired_number_reservation/i);
  assert.match(reservationSql, /set entity_id = v_adjustment_id::text/i);
});

test("production repair restores the complete stock adjustment dependency chain", () => {
  assert.match(productionRepairSql, /values \('RV', 'RV', 4, 'monthly'/i);
  assert.match(productionRepairSql, /add column if not exists reversal_of_transaction_id bigint/i);
  assert.match(productionRepairSql, /foreign key \(reversal_of_transaction_id\)[\s\S]*inventory_transactions\(id\)/i);
  assert.match(productionRepairSql, /when 'AD' then 'inventory_adjustment\.create'/i);
  assert.match(productionRepairSql, /claim_business_number\([\s\S]*?'AD'/i);
  assert.match(productionRepairSql, /revoke all on function public\.post_stock_adjustment[\s\S]*from public, anon/i);
});

test("stock adjustment cancellation compiles without unused variables", () => {
  assert.match(lintCleanupSql, /create or replace function public\.cancel_stock_adjustment/i);
  assert.doesNotMatch(lintCleanupSql, /v_reversal_tx/i);
  assert.doesNotMatch(lintCleanupSql, /returning id into/i);
});

test("production repair removes the ambiguous PR item delete", () => {
  assert.match(productionRepairSql, /delete from public\.purchase_requisition_items as requisition_item\s+where requisition_item\.requisition_id = p_requisition_id/i);
  assert.doesNotMatch(productionRepairSql, /delete from public\.purchase_requisition_items\s+where requisition_id = p_requisition_id/i);
});

test("high-volume inventory reads evaluate permission checks once per statement", () => {
  assert.match(inventoryRlsSql, /on public\.inventory_lots[\s\S]*using \(\(select public\.authorize\('inventory\.view'\)\)\)/i);
  assert.match(inventoryRlsSql, /on public\.item_inventory_balances[\s\S]*select public\.authorize\('inventory\.view'\)[\s\S]*select public\.authorize\('inventory\.create_gr'\)/i);
});

test("public table grants cannot bypass RLS with truncate or anonymous writes", () => {
  assert.match(publicGrantHardeningSql, /revoke truncate, references, trigger on all tables in schema public\s+from anon, authenticated/i);
  assert.match(publicGrantHardeningSql, /revoke insert, update, delete on all tables in schema public\s+from anon/i);
  assert.match(publicGrantHardeningSql, /revoke all on all sequences in schema public from anon/i);
  assert.match(publicGrantHardeningSql, /revoke execute on all functions in schema public from public, anon/i);
  assert.match(publicGrantHardeningSql, /grant execute on function public\.get_public_company_branding\(\)\s+to anon, authenticated/i);
  assert.match(publicGrantHardeningSql, /alter default privileges for role postgres in schema public[\s\S]*revoke truncate, references, trigger on tables from anon, authenticated/i);
});
