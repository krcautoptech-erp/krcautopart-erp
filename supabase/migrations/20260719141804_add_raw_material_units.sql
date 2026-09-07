create table if not exists public.raw_material_units (
  id bigint generated always as identity primary key,
  unit_code text not null,
  unit_name text not null,
  symbol text not null,
  allows_decimal boolean not null default false,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raw_material_units_code_unique unique (unit_code),
  constraint raw_material_units_name_unique unique (unit_name),
  constraint raw_material_units_symbol_unique unique (symbol),
  constraint raw_material_units_code_not_blank check (length(btrim(unit_code)) > 0),
  constraint raw_material_units_name_not_blank check (length(btrim(unit_name)) > 0),
  constraint raw_material_units_symbol_not_blank check (length(btrim(symbol)) > 0),
  constraint raw_material_units_sort_order_check check (sort_order >= 0),
  constraint raw_material_units_status_check check (status in ('active', 'inactive'))
);

drop trigger if exists set_raw_material_units_updated_at on public.raw_material_units;
create trigger set_raw_material_units_updated_at
before update on public.raw_material_units
for each row execute function public.set_updated_at();

create index if not exists raw_material_units_status_idx
  on public.raw_material_units (status, sort_order, unit_name);

insert into public.raw_material_units (
  unit_code,
  unit_name,
  symbol,
  allows_decimal,
  sort_order
)
values
  ('SHEET', 'แผ่น', 'แผ่น', false, 1),
  ('ROLL', 'ม้วน', 'ม้วน', false, 2),
  ('KG', 'กิโลกรัม', 'กก.', true, 3),
  ('PCS', 'ชิ้น', 'ชิ้น', false, 4),
  ('MM', 'มิลลิเมตร', 'มม.', true, 5)
on conflict (unit_code) do nothing;

insert into public.raw_material_units (
  unit_code,
  unit_name,
  symbol,
  allows_decimal,
  sort_order
)
select
  'LEGACY-' || upper(substr(md5(btrim(unit)), 1, 8)),
  btrim(unit),
  btrim(unit),
  true,
  100
from (
  select distinct unit
  from public.raw_materials
  where length(btrim(unit)) > 0
) existing_units
where not exists (
  select 1
  from public.raw_material_units configured_units
  where configured_units.symbol = btrim(existing_units.unit)
)
on conflict do nothing;

alter table public.raw_materials
  add column if not exists unit_id bigint;

update public.raw_materials raw_material
set unit_id = configured_unit.id
from public.raw_material_units configured_unit
where raw_material.unit_id is null
  and configured_unit.symbol = btrim(raw_material.unit);

alter table public.raw_materials
  alter column unit_id set not null,
  drop constraint if exists raw_materials_unit_id_fkey,
  add constraint raw_materials_unit_id_fkey
    foreign key (unit_id) references public.raw_material_units(id),
  drop constraint if exists raw_materials_unit_not_blank,
  drop column if exists unit;

create index if not exists raw_materials_unit_id_idx
  on public.raw_materials (unit_id);

alter table public.raw_material_units enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'raw_material_units'
      and policyname = 'Authenticated users can manage raw material units'
  ) then
    create policy "Authenticated users can manage raw material units"
      on public.raw_material_units for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;
