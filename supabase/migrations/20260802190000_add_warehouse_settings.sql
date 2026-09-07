create table if not exists public.warehouse_types (
  id bigint generated always as identity primary key,
  type_code text not null,
  type_name text not null,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouse_types_code_unique unique (type_code),
  constraint warehouse_types_name_unique unique (type_name),
  constraint warehouse_types_code_check check (type_code ~ '^[A-Z][A-Z0-9_-]{1,19}$'),
  constraint warehouse_types_name_check check (length(btrim(type_name)) between 1 and 100),
  constraint warehouse_types_status_check check (status in ('active', 'inactive'))
);

drop trigger if exists warehouse_types_set_updated_at on public.warehouse_types;
create trigger warehouse_types_set_updated_at
before update on public.warehouse_types
for each row execute function public.set_updated_at();

insert into public.warehouse_types (type_code, type_name, sort_order)
values
  ('RAW', 'คลังวัตถุดิบ', 10),
  ('FG', 'คลังสินค้าสำเร็จรูป', 20),
  ('WIP', 'คลังระหว่างผลิต', 30),
  ('RETURN', 'คลังสินค้ารับคืน', 40),
  ('MAINT', 'คลังซ่อมบำรุง', 50)
on conflict (type_code) do nothing;

alter table public.raw_material_warehouses
  add column if not exists warehouse_type_id bigint references public.warehouse_types (id) on delete restrict,
  add column if not exists location_name text,
  add column if not exists responsible_user_id uuid references auth.users (id) on delete set null,
  add column if not exists remarks text;

update public.raw_material_warehouses warehouse
set warehouse_type_id = warehouse_type.id
from public.warehouse_types warehouse_type
where warehouse.warehouse_type_id is null
  and warehouse_type.type_code = 'RAW';

alter table public.raw_material_warehouses
  alter column warehouse_type_id set not null;

alter table public.raw_material_warehouses
  drop constraint if exists raw_material_warehouses_location_name_check,
  add constraint raw_material_warehouses_location_name_check
    check (location_name is null or length(btrim(location_name)) between 1 and 150),
  drop constraint if exists raw_material_warehouses_remarks_check,
  add constraint raw_material_warehouses_remarks_check
    check (remarks is null or length(remarks) <= 500);

create index if not exists warehouse_types_status_sort_idx
  on public.warehouse_types (status, sort_order, type_name);
create index if not exists raw_material_warehouses_type_status_idx
  on public.raw_material_warehouses (warehouse_type_id, status, sort_order, warehouse_name);
create index if not exists raw_material_warehouses_responsible_user_idx
  on public.raw_material_warehouses (responsible_user_id)
  where responsible_user_id is not null;

alter table public.warehouse_types enable row level security;

drop policy if exists "Authenticated users can manage raw material warehouses"
  on public.raw_material_warehouses;
drop policy if exists "Authenticated users can view warehouses"
  on public.raw_material_warehouses;
create policy "Authenticated users can view warehouses"
on public.raw_material_warehouses for select
to authenticated
using (true);

drop policy if exists "Owners can manage warehouses"
  on public.raw_material_warehouses;
create policy "Owners can manage warehouses"
on public.raw_material_warehouses for all
to authenticated
using ((select public.is_current_user_owner()))
with check ((select public.is_current_user_owner()));

drop policy if exists "Authenticated users can view warehouse types"
  on public.warehouse_types;
create policy "Authenticated users can view warehouse types"
on public.warehouse_types for select
to authenticated
using (true);

drop policy if exists "Owners can manage warehouse types"
  on public.warehouse_types;
create policy "Owners can manage warehouse types"
on public.warehouse_types for all
to authenticated
using ((select public.is_current_user_owner()))
with check ((select public.is_current_user_owner()));

grant select on public.warehouse_types to authenticated;
grant insert, update, delete on public.warehouse_types to authenticated;
grant usage, select on sequence public.warehouse_types_id_seq to authenticated;
grant insert, update, delete on public.raw_material_warehouses to authenticated;
