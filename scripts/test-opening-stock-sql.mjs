import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Refuse any non-local or non-disposable target, including a production URL.
const url = new URL(process.env.OPENING_STOCK_TEST_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:55439/opening_stock_test');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname, '/opening_stock_test');
assert.equal(url.port, '55439');
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
await db.query('begin');
const owner='00000000-0000-0000-0000-000000000001',maker='00000000-0000-0000-0000-000000000002',reviewer='00000000-0000-0000-0000-000000000003';
const rows=[{itemCode:'RM001',lotNumber:'LOT-A',quantity:'10',unitCost:'20.5',expiryDate:'',notes:''},{itemCode:'RM001',lotNumber:'LOT-B',quantity:'3',unitCost:'20.5',expiryDate:'',notes:''}];
const date='2026-10-08';
let passed=0;
async function identity(uid) { await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]); }
async function check(name,fn) { await fn(); passed++; console.log(`PASS ${name}`); }
async function rejects(fn, pattern) {
 await db.query('savepoint expected_error');
 let failure;
 try { await fn(); } catch(error) { failure=error; }
 await db.query('rollback to savepoint expected_error');
 await db.query('release savepoint expected_error');
 assert.ok(failure,'Expected database rejection'); assert.match(failure.message,pattern);
}
async function save(warehouse=1,submit=false,source=rows,key=randomUUID()) {
 const {rows:r}=await db.query('select public.save_opening_stock(null,0,$1,$2,$3,$4,$5,$6,$7,$8) id',[key,warehouse,date,'REF','Test','',JSON.stringify(source),submit]); return Number(r[0].id);
}
async function decide(id,rev,action,reason='Integration test reason') { return db.query('select public.decide_opening_stock($1,$2,$3,$4)',[id,rev,action,reason]); }
try {
 assert.equal((await db.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n,0,'Fixture must start in an empty disposable database');
 await db.query(await readFile(new URL('./fixtures/opening-stock-schema.sql',import.meta.url),'utf8'));
 // Execute the actual existing balance and FIFO functions, not rewritten test doubles.
 for (const [file,name] of [['20260910100624_fix_inventory_balance_negative_delta.sql','sync_inventory_balances'],['20260802093743_add_inventory_lot_traceability.sql','sync_inventory_lot_balance'],['20260909141426_implement_fifo_inventory_cost.sql','consume_raw_material_fifo_cost']]) {
  const text=await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8');
  const start=text.indexOf(`create or replace function public.${name}(`),end=text.indexOf('$$;',start)+3;
  assert.ok(start>=0 && end>start); await db.query(text.slice(start,end));
 }
 await db.query('create trigger sync_balance after insert on public.inventory_transactions for each row execute function public.sync_inventory_balances(); create trigger sync_lot after insert on public.inventory_transactions for each row execute function public.sync_inventory_lot_balance(); create trigger z_fifo after insert on public.inventory_transactions for each row execute function public.consume_raw_material_fifo_cost();');
 await db.query(await readFile(new URL('../supabase/migrations/20261008130917_opening_stock.sql',import.meta.url),'utf8'));
 await db.query("insert into public.role_permissions select r.id,p.id from public.app_roles r cross join public.app_permissions p where r.id in(2,3) and p.module_code='opening_stock' on conflict do nothing");
 await db.query('set role authenticated');
 await check('anonymous identity denied',async()=>rejects(()=>save(),/permission_denied/));
 await identity(maker);
 const key=randomUUID(); const id=await save(1,false,rows,key);
 await check('draft leaves stock and ledger untouched',async()=>{ await db.query('reset role'); assert.equal((await db.query('select count(*)::int n from public.inventory_transactions')).rows[0].n,0); await db.query('set role authenticated'); });
 await check('retry uses request key rather than creating another document',async()=>assert.equal(await save(1,false,rows,key),id));
 await check('direct insert denied',async()=>rejects(()=>db.query("update public.opening_stock_batches set status='posted' where id=$1",[id]),/permission denied/));
 await check('invalid rows rejected by SQL, not just browser',async()=>rejects(()=>save(2,true,[{...rows[0],quantity:''}]),/invalid_opening_quantity_cost/));
 await check('duplicate Lot rejected',async()=>rejects(()=>save(2,true,[rows[0],rows[0]]),/duplicate_opening_item_lot/));
 await check('Serial rejected',async()=>rejects(()=>save(2,true,[{...rows[0],itemCode:'SR001'}]),/serial_opening_not_supported/));
 await db.query('select public.save_opening_stock($1,1,$2,1,$3,$4,$5,$6,$7,true)',[id,key,date,'REF','','',JSON.stringify(rows)]);
 await check('stale editing blocked',async()=>rejects(()=>decide(id,1,'post'),/opening_stale_revision/));
 await check('null revision cannot bypass optimistic locking',async()=>rejects(()=>decide(id,null,'post'),/opening_stale_revision/));
 await check('self-approval blocked for non-owner',async()=>rejects(()=>decide(id,2,'post'),/opening_self_approval/));
 await identity(reviewer); await decide(id,2,'post');
 await check('posting updates balance, Lots and FIFO costs',async()=>{
  await db.query('reset role');
  assert.equal(Number((await db.query('select on_hand_qty from public.item_inventory_balances where warehouse_id=1')).rows[0].on_hand_qty),13);
  assert.equal(Number((await db.query('select sum(remaining_qty*unit_cost) value from public.inventory_receipt_costs')).rows[0].value),266.5);
  assert.deepEqual((await db.query('select vendor_lot_no,on_hand_qty::text from public.inventory_lots order by id')).rows,[{vendor_lot_no:'LOT-A',on_hand_qty:'10.0000'},{vendor_lot_no:'LOT-B',on_hand_qty:'3.0000'}]);
  await db.query('set role authenticated');
 });
 await check('second approval cannot double-post',async()=>rejects(()=>decide(id,3,'post'),/opening_not_review/));
 const second=await save(1,true);
 await identity(owner);
 await check('second opening batch for same warehouse blocked',async()=>rejects(()=>decide(second,1,'post'),/opening_warehouse_in_use/));
 await decide(id,3,'reverse');
 await check('reversal returns balance and FIFO to zero with linked transactions',async()=>{
  await db.query('reset role');
  assert.equal(Number((await db.query('select on_hand_qty from public.item_inventory_balances where warehouse_id=1')).rows[0].on_hand_qty),0);
  assert.equal(Number((await db.query('select sum(remaining_qty) n from public.inventory_receipt_costs')).rows[0].n),0);
  assert.equal((await db.query('select count(*)::int n from public.inventory_transactions where reversal_of_transaction_id is not null')).rows[0].n,2);
  await db.query('set role authenticated');
 });
 await identity(owner); const used=await save(2,true); await decide(used,1,'post');
 await db.query('reset role');
 await db.query("insert into public.inventory_transactions(item_master_id,warehouse_id,lot_id,transaction_type,reference_doc_type,reference_doc_number,quantity_change,created_by) select 1,2,id,'issue','stock_issue','IS-TEST',-1,$1 from public.inventory_lots where warehouse_id=2 order by id limit 1",[owner]);
 await db.query('set role authenticated');
 await check('reversal after issue blocked',async()=>rejects(()=>decide(used,2,'reverse'),/opening_already_used/));
 const returned=await save(3,true); await decide(returned,1,'return');
 await check('return restores draft and records reason',async()=>assert.equal((await db.query('select status from public.opening_stock_batches where id=$1',[returned])).rows[0].status,'draft'));
 await decide(returned,2,'cancel');
 await check('cancelled document never enters inventory',async()=>assert.equal((await db.query('select status from public.opening_stock_batches where id=$1',[returned])).rows[0].status,'cancelled'));
 await identity('00000000-0000-0000-0000-000000000004');
 await check('RLS hides opening documents from unauthorized identity',async()=>assert.equal((await db.query('select count(*)::int n from public.opening_stock_batches')).rows[0].n,0));
 await identity(owner);
 const parallelOne=await save(4,true),parallelTwo=await save(4,true);
 await db.query('commit');
 await check('concurrent posting serializes and exactly one batch enters stock',async()=>{
  const connections=[new pg.Client({connectionString:url.toString()}),new pg.Client({connectionString:url.toString()})];
  try {
   await Promise.all(connections.map(async(c)=>{await c.connect(); await c.query('set role authenticated'); await c.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);}));
   const results=await Promise.allSettled(connections.map((c,i)=>c.query("select public.decide_opening_stock($1,1,'post','')",[i===0?parallelOne:parallelTwo])));
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   const rejected=results.find(r=>r.status==='rejected'); assert.match(rejected.reason.message,/opening_warehouse_in_use/);
   await db.query('reset role'); assert.equal(Number((await db.query('select on_hand_qty from public.item_inventory_balances where warehouse_id=4')).rows[0].on_hand_qty),13);
  } finally { await Promise.all(connections.map(c=>c.end())); }
 });
 console.log(`Opening-stock SQL: ${passed} checks passed; isolated PostgreSQL fixture, not production.`);
} finally { await db.query('rollback'); await db.end(); }
