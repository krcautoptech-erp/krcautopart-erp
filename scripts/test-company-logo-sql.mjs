import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

// Only the disposable local cluster created for this integration check is allowed.
const db = new pg.Client({ connectionString: 'postgresql://postgres@127.0.0.1:55441/postgres' });
await db.connect();
await db.query('begin');
try {
  assert.equal((await db.query("select count(*)::int n from information_schema.tables where table_schema='public'")).rows[0].n, 0);
  await db.query(`create schema auth; create table auth.users(id uuid primary key);
    create schema storage; create table storage.objects(bucket_id text, name text);
    create role authenticated;
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create function public.authorize(text) returns boolean language sql as $$select coalesce(current_setting('test.company_manage', true), 'false')::boolean$$;
    select set_config('test.company_manage', 'true', false);`);
  const base = (await readFile(new URL('../supabase/migrations/20260727000100_create_company_settings.sql', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
  for (const table of ['company_profiles', 'company_branches', 'company_document_settings']) {
    const start = base.indexOf(`create table if not exists public.${table} (`);
    await db.query(base.slice(start, base.indexOf('\n);', start) + 3));
  }
  await db.query(await readFile(new URL('../supabase/migrations/20260728140154_add_company_header_field_order.sql', import.meta.url), 'utf8'));
  const company = (await db.query("insert into public.company_profiles(company_code, legal_name_th, logo_light_path) values ('TEST', 'Test Company', 'existing-logo.png') returning id")).rows[0].id;
  await db.query('insert into public.company_document_settings(company_id) values ($1)', [company]);
  await db.query(await readFile(new URL('../supabase/migrations/20261010063022_separate_document_logo.sql', import.meta.url), 'utf8'));
  const logos = async () => (await db.query('select profile.logo_light_path, settings.logo_path from public.company_profiles profile join public.company_document_settings settings on settings.company_id=profile.id where profile.id=$1', [company])).rows[0];
  assert.deepEqual(await logos(), { logo_light_path: 'existing-logo.png', logo_path: 'existing-logo.png' });
  console.log('PASS migration preserves existing document logo');
  const save = (document, light = null) => db.query('select public.save_company_settings($1,$2,$3,$4,null)', [company, { legalNameTh: 'Test Company' }, document, light]);
  await save({}, 'new-ui.png');
  assert.deepEqual(await logos(), { logo_light_path: 'new-ui.png', logo_path: 'existing-logo.png' });
  console.log('PASS system logo update does not change document logo');
  const path = `${company}/document-new.png`;
  await db.query("insert into storage.objects(bucket_id, name) values ('company-assets', $1)", [path]);
  await save({ documentLogoPath: path });
  assert.deepEqual(await logos(), { logo_light_path: 'new-ui.png', logo_path: path });
  await save({ documentLogoPath: null });
  assert.equal((await logos()).logo_path, path);
  console.log('PASS document upload changes only document logo and subsequent saves preserve it');
  async function rejects(input, code) {
    await db.query('savepoint expected_error');
    await assert.rejects(save(input), error => error.code === code);
    await db.query('rollback to savepoint expected_error');
  }
  await rejects({ documentLogoPath: 'other-company/document.png' }, '22023');
  console.log('PASS rejects missing or cross-company document assets');
  await db.query("select set_config('test.company_manage', 'false', false)");
  await rejects({ documentLogoPath: path }, '42501');
  console.log('PASS company.manage gate remains enforced');
  assert.equal((await db.query("select has_function_privilege('public','public.save_company_settings(uuid,jsonb,jsonb,text,text)','EXECUTE') ok")).rows[0].ok, false);
  console.log('PASS save RPC is not executable by PUBLIC');
} finally {
  await db.query('rollback');
  await db.end();
}
