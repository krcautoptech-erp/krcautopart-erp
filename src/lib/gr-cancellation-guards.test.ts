import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

function latestFunction(name: string) {
  let definition = "";
  for (const file of readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
    const start = sql.indexOf(`create or replace function public.${name}(`);
    if (start >= 0) definition = sql.slice(start, sql.indexOf("$$;", start) + 3);
  }
  assert.ok(definition, `missing ${name}`);
  return definition;
}

test("GR cancellation accepts only untouched in-stock serials", () => {
  const sql = latestFunction("cancel_goods_receipt");
  assert.match(sql, /serial\.status <> 'in_stock'/);
  for (const field of ["updated_by", "department_id", "custodian_name"]) {
    assert.ok(sql.includes(`serial.${field} is not null`));
  }
  assert.ok(sql.indexOf("goods_receipt_stock_already_consumed") < sql.indexOf("insert into public.inventory_transactions"));
  assert.match(sql, /if v_receipt\.status = 'cancelled' then\s+return query/);
});

test("stock report includes GR reversals and classifies them before negative issues", () => {
  const sql = latestFunction("get_stock_movement_report");
  const classification = sql.match(/when tx\.reference_doc_type in \(([^)]+)\) then 'reversal'/)![1];
  const included = sql.match(/and tx\.reference_doc_type in \(([^)]+)\)/)![1];
  assert.ok(classification.includes("'goods_receipt_reversal'"));
  assert.ok(included.includes("'goods_receipt_reversal'"));
  for (const type of ["goods_receipt", "stock_issue", "stock_issue_reversal", "stock_adjustment", "stock_adjustment_reversal"]) assert.ok(included.includes(`'${type}'`));
  assert.ok(sql.indexOf("then 'reversal'") < sql.indexOf("tx.quantity_change < 0"));
  assert.match(sql, /movement_kind in \('adjustment', 'reversal'\)/);
  assert.match(sql, /sum\(quantity_change\) closing/);
  assert.match(sql, /security invoker/);
});
