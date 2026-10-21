begin;

insert into public.app_permissions (permission_code, permission_name, module_code, module_name, action_code, module_sort_order, sort_order, status)
values
  ('delivery_schedule.view', 'ดูแผนส่งมอบลูกค้าย้อนหลัง', 'delivery_schedule', 'แผนส่งมอบลูกค้า', 'view', 65, 10, 'active'),
  ('delivery_schedule.create', 'นำเข้าแผนส่งมอบลูกค้า', 'delivery_schedule', 'แผนส่งมอบลูกค้า', 'create', 65, 20, 'active'),
  ('delivery_schedule.export', 'ดาวน์โหลดไฟล์แผนส่งมอบต้นฉบับ', 'delivery_schedule', 'แผนส่งมอบลูกค้า', 'export', 65, 30, 'active')
on conflict (permission_code) do nothing;

create table public.delivery_schedule_archives (
  id uuid primary key,
  customer_id bigint not null references public.customers(id),
  customer_name text not null check (length(customer_name) between 1 and 300),
  period text not null check (period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  revision integer not null check (revision between 0 and 99999),
  supplier_code text not null check (length(supplier_code) between 1 and 100),
  filename text not null check (length(filename) between 1 and 255 and filename ~* '\.xlsx$'),
  file_path text not null unique,
  file_object_id uuid not null unique references storage.objects(id) on delete restrict,
  file_size integer not null check (file_size between 1 and 5242880),
  file_sha256 text not null check (file_sha256 ~ '^[a-f0-9]{64}$'),
  row_count integer not null check (row_count between 1 and 5000),
  payload jsonb not null check (coalesce(
    jsonb_typeof(payload) = 'object'
    and payload ?& array['period','revision','supplierCode','supplierName','sheetName','dates','forecastMonths','rows','warnings']
    and payload->>'period' = period and payload->'revision' = to_jsonb(revision) and payload->>'supplierCode' = supplier_code
    and jsonb_typeof(payload->'supplierName') = 'string' and jsonb_typeof(payload->'sheetName') = 'string'
    and jsonb_typeof(payload->'dates') = 'array' and jsonb_array_length(payload->'dates') between 1 and 31
    and jsonb_typeof(payload->'forecastMonths') = 'array' and jsonb_array_length(payload->'forecastMonths') = 3
    and jsonb_typeof(payload->'warnings') = 'array'
    and jsonb_typeof(payload->'rows') = 'array' and jsonb_array_length(payload->'rows') = row_count
    and not jsonb_path_exists(payload, '$.dates[*] ? (@.type() != "string" || !(@ like_regex "^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"))')
    and not jsonb_path_exists(payload, '$.forecastMonths[*] ? (@.type() != "string" || !(@ like_regex "^20[0-9]{2}-(0[1-9]|1[0-2])$"))')
    and not jsonb_path_exists(payload, '$.warnings[*] ? (@.type() != "string")')
    and not jsonb_path_exists(payload, '$.rows[*] ? (!(exists(@.sourceRow) && @.sourceRow.type() == "number" && @.sourceRow > 0 && exists(@.section) && (@.section == "parts" || @.section == "cu") && exists(@.erpCode) && @.erpCode.type() == "string" && exists(@.partNumber) && @.partNumber.type() == "string" && exists(@.name) && @.name.type() == "string" && exists(@.unit) && @.unit.type() == "string" && exists(@.direction) && @.direction.type() == "string" && exists(@.deliveries) && @.deliveries.type() == "object" && exists(@.forecasts) && @.forecasts.type() == "object" && exists(@.bag) && (@.bag.type() == "number" || @.bag.type() == "null") && exists(@.box) && (@.box.type() == "number" || @.box.type() == "null") && exists(@.job) && (@.job.type() == "string" || @.job.type() == "number" || @.job.type() == "null")))')
    and not jsonb_path_exists(payload, '$.rows[*].deliveries.* ? (@.type() != "number" || @ < 0 || @ > 1000000000000)')
    and not jsonb_path_exists(payload, '$.rows[*].forecasts.* ? (@.type() != "number" && @.type() != "null")'), false)),
  imported_by uuid not null default auth.uid() references auth.users(id),
  imported_by_name text not null check (length(imported_by_name) between 1 and 300),
  created_at timestamptz not null default now(),
  unique (customer_id, period, supplier_code, revision),
  check (file_path = imported_by::text || '/' || id::text || '.xlsx')
);
create index delivery_schedule_archive_period_idx on public.delivery_schedule_archives (period desc, created_at desc);
create index delivery_schedule_archive_imported_by_idx on public.delivery_schedule_archives (imported_by);
alter table public.delivery_schedule_archives enable row level security;
revoke all on public.delivery_schedule_archives from anon, authenticated;
grant select, insert on public.delivery_schedule_archives to authenticated;
grant all on public.delivery_schedule_archives to service_role;
-- Check publication against Storage without a circular archive <-> Storage RLS dependency.
create schema if not exists delivery_schedule_private;
revoke all on schema delivery_schedule_private from public;
grant usage on schema delivery_schedule_private to authenticated;
create function delivery_schedule_private.original_exists(original_id uuid, original_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and pg_catalog.split_part(original_path, '/', 1) = (select auth.uid())::text
    and (select public.authorize('delivery_schedule.view'))
    and (select public.authorize('delivery_schedule.create'))
    and exists (select 1 from storage.objects o where o.id = original_id and o.bucket_id = 'delivery-schedules' and o.name = original_path);
$$;
revoke all on function delivery_schedule_private.original_exists(uuid, text) from public, anon;
grant execute on function delivery_schedule_private.original_exists(uuid, text) to authenticated;
create policy "View delivery schedule archives" on public.delivery_schedule_archives for select to authenticated
using ((select public.authorize('delivery_schedule.view')));
create policy "Import delivery schedule archives" on public.delivery_schedule_archives for insert to authenticated
with check (imported_by = (select auth.uid()) and (select public.authorize('delivery_schedule.view')) and (select public.authorize('delivery_schedule.create'))
  and delivery_schedule_private.original_exists(file_object_id, file_path));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-schedules', 'delivery-schedules', false, 5242880, array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;
create policy "Upload delivery schedule originals" on storage.objects for insert to authenticated
with check (bucket_id = 'delivery-schedules' and (storage.foldername(name))[1] = (select auth.uid())::text
  and storage.extension(name) = 'xlsx' and (select public.authorize('delivery_schedule.view')) and (select public.authorize('delivery_schedule.create')));
create policy "Download delivery schedule originals" on storage.objects for select to authenticated
using (bucket_id = 'delivery-schedules' and (select public.authorize('delivery_schedule.view')) and (select public.authorize('delivery_schedule.export'))
  and exists (select 1 from public.delivery_schedule_archives a where a.file_path = name));
-- Only a failed, unpublished upload owned by the caller can be cleaned up. Archives are immutable.
create policy "Read own unpublished delivery uploads" on storage.objects for select to authenticated
using (bucket_id = 'delivery-schedules' and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.authorize('delivery_schedule.view')) and (select public.authorize('delivery_schedule.create'))
  and not exists (select 1 from public.delivery_schedule_archives a where a.file_path = name));
create policy "Clean failed delivery schedule uploads" on storage.objects for delete to authenticated
using (bucket_id = 'delivery-schedules' and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.authorize('delivery_schedule.create'))
  and not exists (select 1 from public.delivery_schedule_archives a where a.file_path = name));

comment on table public.delivery_schedule_archives is 'Immutable customer delivery plan snapshots for historical reference only; never creates sales or inventory transactions.';
commit;
