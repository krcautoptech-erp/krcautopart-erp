import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { parseDeliverySchedule } from '../src/lib/delivery-schedules.ts';

// This fixed endpoint is the disposable cluster created for this test, never the project's hosted database.
const db = new pg.Client({ connectionString: 'postgresql://postgres@127.0.0.1:15439/postgres' });
await db.connect();
await db.query('begin');
const uid = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const payload = await parseDeliverySchedule(await readFile(new URL('../docs/KRCA001_Apr 2026 Rev.2.xlsx', import.meta.url)));
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
async function identity(permissions = 'delivery_schedule.view,delivery_schedule.create,delivery_schedule.export') {
  await db.query("select set_config('test.uid',$1,false),set_config('test.permissions',$2,false)", [uid, permissions]);
}
async function rejects(fn, pattern) {
  await db.query('savepoint rejected');
  let error;
  try { await fn(); } catch (e) { error = e; }
  await db.query('rollback to savepoint rejected');
  await db.query('release savepoint rejected');
  assert.ok(error, 'Expected SQL rejection'); assert.match(error.message, pattern);
}
async function original(id) { await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['delivery-schedules', `${uid}/${id}.xlsx`]); }
async function publish(id, plan = payload, revision = 2, importer = uid) {
  const object = await db.query('select id from storage.objects where name=$1', [`${importer}/${id}.xlsx`]);
  return db.query(`insert into public.delivery_schedule_archives
    (id,customer_id,customer_name,period,revision,supplier_code,filename,file_path,file_size,file_sha256,row_count,payload,imported_by,imported_by_name,file_object_id)
    values($1,1,'Customer','2026-04',$2,'KRCA001','plan.xlsx',$3,100,$4,$5,$6,$7,'Importer',$8)`,
    [id, revision, `${importer}/${id}.xlsx`, '0'.repeat(64), payload.rows.length, JSON.stringify(plan), importer, object.rows[0]?.id ?? randomUUID()]);
}
try {
  assert.equal(Number((await db.query("select count(*) from information_schema.tables where table_schema='public'")).rows[0].count), 0, 'Refuse a database containing existing application tables');
  await db.query(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key); insert into auth.users values('${uid}'),('${other}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function public.authorize(requested_permission text) returns boolean language sql stable as $$select requested_permission = any(string_to_array(current_setting('test.permissions',true),','))$$;
    create table public.customers(id bigint primary key); insert into public.customers values(1);
    create table public.app_permissions(permission_code text primary key,permission_name text,module_code text,module_name text,action_code text,module_sort_order int,sort_order int,status text);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text unique);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
    create function storage.extension(name text) returns text language sql immutable as $$select split_part(name,'.',-1)$$;
    grant usage on schema auth,storage to authenticated,anon;
    grant select,insert,delete on storage.objects to authenticated;
  `);
  const migration = await readFile(new URL('../supabase/migrations/20261020173339_delivery_schedule_archive.sql', import.meta.url), 'utf8');
  await db.query(migration.replace(/^begin;\s*/i, '').replace(/commit;\s*$/i, ''));
  await db.query('set role authenticated'); await identity();
  const id = randomUUID(); await original(id); await publish(id);
  await check('actual XLSX snapshot is accepted', async () => assert.equal((await db.query('select count(*)::int n from public.delivery_schedule_archives')).rows[0].n, 1));
  await check('malformed payload cannot exploit nullable CHECK', async () => {
    for (const plan of [{}, { ...payload, rows: Array(payload.rows.length).fill({}) }, { ...payload, warnings: null }, { ...payload, dates: [123] }]) {
      const bad = randomUUID(); await original(bad); await rejects(() => publish(bad, plan, 3), /check constraint/);
    }
  });
  await check('publication requires an uploaded original', () => rejects(() => publish(randomUUID(), { ...payload, revision: 3 }, 3), /row-level security/));
  await check('cannot impersonate another importer', () => rejects(() => publish(randomUUID(), payload, 2, other), /row-level security/));
  await check('duplicate revision cannot replace a snapshot', async () => { const dup = randomUUID(); await original(dup); await rejects(() => publish(dup), /unique constraint/); });
  await check('published snapshots cannot be updated or deleted', async () => {
    await rejects(() => db.query('update public.delivery_schedule_archives set filename=$1 where id=$2', ['other.xlsx', id]), /permission denied/);
    await rejects(() => db.query('delete from public.delivery_schedule_archives where id=$1', [id]), /permission denied/);
    assert.equal((await db.query('delete from storage.objects where name=$1 returning id', [`${uid}/${id}.xlsx`])).rowCount, 0);
  });
  await check('foreign key protects the original even if cleanup bypasses RLS', async () => {
    await db.query('reset role');
    await rejects(() => db.query('delete from storage.objects where name=$1', [`${uid}/${id}.xlsx`]), /foreign key constraint/);
    await db.query('set role authenticated');
  });
  await check('failed own uploads can be cleaned without export permission', async () => {
    await identity('delivery_schedule.view,delivery_schedule.create'); const orphan = randomUUID(); await original(orphan);
    assert.equal((await db.query('delete from storage.objects where name=$1 returning id', [`${uid}/${orphan}.xlsx`])).rowCount, 1);
    assert.equal((await db.query('select * from storage.objects where name=$1', [`${uid}/${id}.xlsx`])).rowCount, 0);
  });
  await check('view permission alone cannot import or download originals', async () => {
    await identity('delivery_schedule.view'); await rejects(() => original(randomUUID()), /row-level security/);
    assert.equal((await db.query('select * from storage.objects where name=$1', [`${uid}/${id}.xlsx`])).rowCount, 0);
  });
  await check('view plus export can read the original', async () => {
    await identity('delivery_schedule.view,delivery_schedule.export');
    assert.equal((await db.query('select * from storage.objects where name=$1', [`${uid}/${id}.xlsx`])).rowCount, 1);
  });
  await check('missing view denies both archive and original', async () => {
    await identity('delivery_schedule.export');
    assert.equal((await db.query('select * from public.delivery_schedule_archives')).rowCount, 0);
    assert.equal((await db.query('select * from storage.objects')).rowCount, 0);
  });
  console.log(`${passed} SQL checks passed`);
} finally {
  await db.query('rollback'); await db.end();
}
