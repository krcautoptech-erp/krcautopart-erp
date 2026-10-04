import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260927104018_harden_supabase_advisor_findings.sql", import.meta.url),
  "utf8",
).toLowerCase();

test("advisor hardening removes permissive writes while preserving authorized ERP access", () => {
  for (const policy of [
    "authenticated users can manage customer addresses",
    "authenticated users can manage customers",
    "authenticated users can manage partner customer types",
    "enable delete for authenticated users",
    "enable insert for authenticated users",
    "enable update for authenticated users",
    "authenticated users can manage raw material grades",
    "authenticated users can manage raw material groups",
    "authenticated users can manage raw material units",
    "authenticated users can manage raw materials",
    "authenticated users can manage vendor addresses",
    "authenticated users can manage vendor credit terms",
    "authenticated users can manage vendor groups",
    "authenticated users can manage vendor payment methods",
    "authenticated users can manage vendor tax types",
    "authenticated users can manage vendors",
  ]) {
    assert.match(migration, new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+"${policy}"`));
  }

  assert.match(migration, /authorize\(''?partners\.create''?\)/);
  assert.match(migration, /authorize\(''?partners\.edit''?\)/);
  assert.match(migration, /authorize\(''?mdm\.edit''?\)/);
  assert.match(migration, /add\s+column\s+if\s+not\s+exists\s+created_by\s+uuid\s+default\s+auth\.uid\(\)/);
  assert.match(migration, /parent\.created_by\s*=\s*\(select\s+auth\.uid\(\)\)/);
  assert.equal(
    migration.match(/\(select public\.authorize\('partners\.create'\)\)\s*or\s*\(select public\.authorize\('mdm\.create'\)\)\s*\)\s*and exists/g)?.length,
    2,
  );
  assert.match(migration, /create\s+or\s+replace\s+function\s+public\.set_vendor_status\(/);
  assert.match(migration, /authorize\('partners\.deactivate'\)/);
  assert.match(migration, /revoke\s+insert,\s*update,\s*delete\s+on\s+public\.(products|raw_materials)/);
});

test("advisor hardening blocks direct execution of internal helpers only", () => {
  for (const helper of [
    "assert_user_admin_rate_limit",
    "set_purchase_order_item_behavior",
    "set_purchase_order_item_master_ref",
    "sync_inventory_balances",
    "sync_inventory_lot_balance",
    "sync_product_balances",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${helper}\\(`),
    );
  }

  assert.doesNotMatch(migration, /revoke\s+all\s+on\s+function\s+public\.get_latest_purchase_prices\(/);
  assert.doesNotMatch(migration, /revoke\s+all\s+on\s+function\s+public\.save_current_user_approval_signature\(/);
  assert.match(migration, /to_regprocedure\('public\.rls_auto_enable\(\)'\)/);
});

test("vendor status changes use the permission-checked RPC", () => {
  const action = readFileSync(
    new URL("../app/actions/vendors.ts", import.meta.url),
    "utf8",
  );

  assert.match(action, /\.rpc\("set_vendor_status"/);
});
