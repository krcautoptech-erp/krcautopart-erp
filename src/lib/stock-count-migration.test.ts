import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("../../supabase/migrations/20261001133120_create_stock_counts.sql", import.meta.url), "utf8");
const repairSql = readFileSync(new URL("../../supabase/migrations/20261002145218_repair_stock_count_scope_and_audit.sql", import.meta.url), "utf8");
const body = (name: string) => {
  const match = sql.match(new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`, "i"));
  assert.ok(match, `missing ${name}`);
  return match[0];
};

test("permission catalog accepts stock count workflow actions", () => {
  assert.match(sql, /app_permissions_action_code_check[\s\S]*'count'[\s\S]*'review'/i);
});

test("repair stores selection scope and makes count numbers searchable in audit", () => {
  assert.match(repairSql, /add column selection_scope text not null default 'all'/i);
  assert.match(repairSql, /p_selection_scope text/i);
  assert.match(repairSql, /v_after ->> 'count_number', v_before ->> 'count_number'/i);
  assert.match(repairSql, /update public\.system_audit_logs audit[\s\S]*count\.count_number/i);
  assert.match(repairSql, /revoke all on function public\.create_stock_count\(date, bigint, uuid, text, jsonb\)[\s\S]*authenticated/i);
});

test("count tables use permission-scoped reads, RPC-only writes and audit triggers", () => {
  for (const table of ["stock_counts", "stock_count_lines", "stock_count_lots"]) {
    assert.match(sql, new RegExp(`create table public\\.${table} \\(`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`on public\\.${table} for select to authenticated\\s+using \\(\\(select public\\.authorize\\('stock_count\\.view'\\)\\)\\)`, "i"));
    assert.match(sql, new RegExp(`revoke insert, update, delete on public\\.${table} from authenticated`, "i"));
    assert.match(sql, new RegExp(`grant select on public\\.${table} to authenticated`, "i"));
    assert.match(sql, new RegExp(`create trigger capture_system_audit_log after insert or update or delete on public\\.${table}\\s+for each row execute function public\\.capture_system_audit_log\\(\\)`, "i"));
  }
});

test("every command authenticates and authorizes with a fixed search path and restricted execute", () => {
  for (const [name, permission] of Object.entries({
    get_stock_count_form_options: "create", create_stock_count: "create", start_stock_count: "count",
    save_stock_count_entries: "count", submit_stock_count: "count", return_stock_count: "review",
    approve_stock_count: "approve", cancel_stock_count: "create",
  })) {
    const fn = body(name);
    assert.match(fn, /security definer\s+set search_path = ''/i);
    assert.match(fn, /auth\.uid\(\)/i);
    assert.match(fn, /if v_user_id is null then raise exception 'authentication_required'/i);
    assert.ok(fn.includes(`public.authorize('stock_count.${permission}')`));
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([^;]+from public, anon`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\([^;]+to authenticated`, "i"));
  }
});

test("snapshots include every existing Lot and a single null-Lot entry for untracked items", () => {
  const create = body("create_stock_count");
  assert.match(sql, /values \('SC', 'SC', 4, 'monthly'\)/i);
  assert.match(sql, /unique index stock_count_lots_line_lot_idx[\s\S]*coalesce\(inventory_lot_id, 0\)/i);
  assert.match(create, /serial_stock_count_not_supported/);
  assert.match(create, /tracking_method = 'none'/);
  assert.match(create, /insert into public\.stock_count_lots[\s\S]*lot\.on_hand_qty/);
  assert.match(create, /invalid_stock_count_assignee/);
  assert.match(body("get_stock_count_form_options"), /permission\.permission_code = 'stock_count\.count'/);
  assert.match(create, /permission\.permission_code = 'stock_count\.count'/);
});

test("count updates check ownership, scale, duplicate IDs and round membership before writing", () => {
  const save = body("save_stock_count_entries");
  for (const marker of ["assigned_to", "duplicate_stock_count_entry", "stock_count_entry_not_found", "round(v_quantity, 4)", "invalid_counted_quantity"]) assert.ok(save.includes(marker), marker);
  assert.match(save, /v_quantity numeric;/);
  assert.match(save, /status <> 'counting'/);
  assert.match(save, /stock_count_id = v_count\.id/);
});

test("approval locks, detects stale snapshots, separates duties and is idempotent", () => {
  const approve = body("approve_stock_count");
  assert.match(sql, /stock_adjustment_id bigint unique references public\.stock_adjustments/);
  assert.match(approve, /if v_count\.status = 'approved' then[\s\S]*return query[\s\S]*v_count\.stock_adjustment_id[\s\S]*return;/);
  assert.match(approve, /order by balance\.item_master_id[\s\S]*for update of balance/);
  assert.match(approve, /order by lot\.id for update of lot/);
  assert.match(approve, /order by cost\.inventory_transaction_id for update of cost/);
  for (const marker of ["stale_stock_count_snapshot", "uncounted_stock_count_entries", "stock_count_variance_reason_required", "stock_count_separation_of_duties", "owner_approval_override"]) assert.ok(approve.includes(marker), marker);
});

test("approval posts exact Lot differences through the existing ledger and auditable cost layers", () => {
  const approve = body("approve_stock_count");
  assert.match(sql, /add column inventory_lot_id bigint references public\.inventory_lots/);
  assert.match(sql, /unique nulls not distinct \(stock_adjustment_id, item_master_id, inventory_lot_id\)/);
  assert.match(sql, /source text not null default 'manual'/);
  assert.match(approve, /'stock_count', v_count\.count_number/);
  assert.match(approve, /lot_unit_cost_unavailable/);
  assert.match(approve, /cost\.inventory_lot_id is not distinct from v_entry\.inventory_lot_id/);
  assert.match(approve, /case when v_entry\.difference_qty > 0 then 'adjustment' else 'issue' end/);
  assert.match(approve, /v_count\.warehouse_id, v_entry\.inventory_lot_id,/);
  assert.match(approve, /insert into public\.stock_adjustment_allocations[\s\S]*v_entry\.inventory_lot_id/);
  assert.match(approve, /insert into public\.inventory_receipt_costs/);
  assert.doesNotMatch(approve, /insert into public\.inventory_lots/);
  assert.doesNotMatch(sql, /create or replace function public\.(post_stock_adjustment|cancel_stock_adjustment)/);
  assert.match(sql, /on public\.stock_adjustments for select to authenticated\s+using \(\(select public\.authorize\('stock_count\.view'\)\) and source = 'stock_count'/);
  assert.match(sql, /where count\.stock_adjustment_id = stock_adjustments\.id/);
});
