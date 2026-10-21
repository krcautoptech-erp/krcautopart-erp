import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

test("the final inventory document constraint keeps receipt reversals and opening balances", () => {
  let allowed: string[] = [];
  for (const file of readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
    for (const match of sql.matchAll(/add constraint inventory_transactions_doc_type_check check\s*\(\s*reference_doc_type in\s*\(([^)]+)\)/gi)) {
      allowed = Array.from(match[1].matchAll(/'([^']+)'/g), (value) => value[1]);
    }
  }
  for (const type of ["goods_receipt", "goods_receipt_reversal", "purchase_return", "production_issue", "stock_issue", "stock_issue_reversal", "stock_adjustment", "stock_adjustment_reversal", "opening_balance", "opening_balance_reversal"]) {
    assert.ok(allowed.includes(type), `final constraint rejects ${type}`);
  }
});
