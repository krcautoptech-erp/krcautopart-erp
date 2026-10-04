// Run against a disposable PostgreSQL database only: node scripts/test-inventory-balance.cjs [migration]
const { Client } = require('pg');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const db = new Client({ host: '127.0.0.1', port: 55439, user: 'postgres', database: 'postgres' });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(`CREATE TABLE public.item_master(id bigint primary key, attributes jsonb);
      CREATE TABLE public.inventory_balances(raw_material_id bigint, warehouse_id bigint, on_hand_qty numeric CHECK(on_hand_qty>=0), updated_at timestamptz, PRIMARY KEY(raw_material_id,warehouse_id));
      CREATE TABLE public.item_inventory_balances(item_master_id bigint, warehouse_id bigint, on_hand_qty numeric CHECK(on_hand_qty>=0), updated_at timestamptz, PRIMARY KEY(item_master_id,warehouse_id));
      CREATE TABLE public.inventory_transactions(id bigint primary key, raw_material_id bigint, item_master_id bigint, warehouse_id bigint, quantity_change numeric);`);
    const source = readFileSync(process.argv[2] || 'supabase/migrations/20260901153115_unify_purchase_inventory_item_master_refs.sql', 'utf8');
    await db.query(source.match(/create or replace function public\.sync_inventory_balances\(\)[\s\S]*?\$\$;/i)[0]);
    await db.query(`CREATE TRIGGER test_sync AFTER INSERT OR UPDATE OR DELETE ON public.inventory_transactions FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_balances();
      INSERT INTO public.inventory_transactions VALUES(1,1,1,1,800);
      INSERT INTO public.inventory_transactions VALUES(2,1,1,1,-200);`);
    const balance = async () => (await db.query('SELECT on_hand_qty FROM public.inventory_balances UNION ALL SELECT on_hand_qty FROM public.item_inventory_balances')).rows.map(r => Number(r.on_hand_qty));
    assert.deepEqual(await balance(), [600,600]);
    await db.query('UPDATE public.inventory_transactions SET quantity_change=-300 WHERE id=2');
    assert.deepEqual(await balance(), [500,500]);
    await db.query('SAVEPOINT insufficient');
    await assert.rejects(db.query('INSERT INTO public.inventory_transactions VALUES(3,1,1,1,-501)'), e => e.code==='23514');
    await db.query('ROLLBACK TO insufficient');
    assert.deepEqual(await balance(), [500,500]);
    await db.query('DELETE FROM public.inventory_transactions WHERE id=2');
    assert.deepEqual(await balance(), [800,800]);
    console.log('PASS: receipt, issue, update, overdraw rollback, reversal; both balance tables');
  } finally { await db.query('ROLLBACK'); await db.end(); }
})().catch(e => { console.error(e.message); process.exitCode=1; });
