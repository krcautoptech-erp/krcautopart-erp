import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("latest PO prices are scoped to vendor, item, unit, and approved history", () => {
  const sql = readFileSync(
    path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "20260927101139_add_vendor_item_latest_price_lookup.sql",
    ),
    "utf8",
  );

  assert.match(sql, /get_latest_purchase_prices/);
  assert.match(sql, /public\.authorize\('po\.create'\)/);
  assert.match(sql, /purchase_order\.vendor_id = p_vendor_id/);
  assert.match(sql, /old_item\.item_master_id = source_item\.item_master_id/);
  assert.match(sql, /old_item\.unit_name = source_item\.unit_name/);
  assert.match(sql, /status in \('approved', 'sent', 'partially_received', 'received'\)/);
  assert.match(sql, /order by purchase_order\.document_date desc[\s\S]*limit 1/);
  assert.match(sql, /check \(unit_price > 0\) not valid/);
  assert.match(sql, /revoke all[\s\S]*from public, anon/);
  assert.match(sql, /grant execute[\s\S]*to authenticated/);
});
