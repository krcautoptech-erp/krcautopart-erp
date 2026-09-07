create table if not exists public.raw_material_groups (
  id bigint generated always as identity primary key,
  group_code text not null,
  group_name text not null,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raw_material_groups_code_unique unique (group_code),
  constraint raw_material_groups_name_unique unique (group_name),
  constraint raw_material_groups_code_not_blank check (length(btrim(group_code)) > 0),
  constraint raw_material_groups_name_not_blank check (length(btrim(group_name)) > 0),
  constraint raw_material_groups_status_check check (status in ('active', 'inactive'))
);

create table if not exists public.raw_material_grades (
  id bigint generated always as identity primary key,
  grade_code text not null,
  grade_name text not null,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raw_material_grades_code_unique unique (grade_code),
  constraint raw_material_grades_name_unique unique (grade_name),
  constraint raw_material_grades_code_not_blank check (length(btrim(grade_code)) > 0),
  constraint raw_material_grades_name_not_blank check (length(btrim(grade_name)) > 0),
  constraint raw_material_grades_status_check check (status in ('active', 'inactive'))
);

create table if not exists public.raw_material_warehouses (
  id bigint generated always as identity primary key,
  warehouse_code text not null,
  warehouse_name text not null,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raw_material_warehouses_code_unique unique (warehouse_code),
  constraint raw_material_warehouses_name_unique unique (warehouse_name),
  constraint raw_material_warehouses_code_not_blank check (length(btrim(warehouse_code)) > 0),
  constraint raw_material_warehouses_name_not_blank check (length(btrim(warehouse_name)) > 0),
  constraint raw_material_warehouses_status_check check (status in ('active', 'inactive'))
);

create table if not exists public.raw_materials (
  id bigint generated always as identity primary key,
  material_code text not null,
  material_name text not null,
  group_id bigint not null references public.raw_material_groups(id),
  grade_id bigint not null references public.raw_material_grades(id),
  thickness_mm numeric(10,3) not null,
  width_mm numeric(10,3) not null,
  length_mm numeric(10,3) not null,
  unit text not null,
  primary_vendor_id bigint references public.vendors(id) on delete set null,
  last_price numeric(12,2),
  reorder_point numeric(12,2),
  warehouse_id bigint not null references public.raw_material_warehouses(id),
  remark text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint raw_materials_code_unique unique (material_code),
  constraint raw_materials_code_not_blank check (length(btrim(material_code)) > 0),
  constraint raw_materials_name_not_blank check (length(btrim(material_name)) > 0),
  constraint raw_materials_thickness_check check (thickness_mm >= 0),
  constraint raw_materials_width_check check (width_mm >= 0),
  constraint raw_materials_length_check check (length_mm >= 0),
  constraint raw_materials_last_price_check check (last_price is null or last_price >= 0),
  constraint raw_materials_reorder_point_check check (reorder_point is null or reorder_point >= 0),
  constraint raw_materials_unit_not_blank check (length(btrim(unit)) > 0),
  constraint raw_materials_status_check check (status in ('active', 'inactive'))
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_raw_material_groups_updated_at on public.raw_material_groups;
create trigger set_raw_material_groups_updated_at
before update on public.raw_material_groups
for each row execute function public.set_updated_at();

drop trigger if exists set_raw_material_grades_updated_at on public.raw_material_grades;
create trigger set_raw_material_grades_updated_at
before update on public.raw_material_grades
for each row execute function public.set_updated_at();

drop trigger if exists set_raw_material_warehouses_updated_at on public.raw_material_warehouses;
create trigger set_raw_material_warehouses_updated_at
before update on public.raw_material_warehouses
for each row execute function public.set_updated_at();

drop trigger if exists set_raw_materials_updated_at on public.raw_materials;
create trigger set_raw_materials_updated_at
before update on public.raw_materials
for each row execute function public.set_updated_at();

create index if not exists raw_material_groups_status_idx
  on public.raw_material_groups (status, sort_order, group_name);
create index if not exists raw_material_grades_status_idx
  on public.raw_material_grades (status, sort_order, grade_name);
create index if not exists raw_material_warehouses_status_idx
  on public.raw_material_warehouses (status, sort_order, warehouse_name);
create index if not exists raw_materials_group_id_idx
  on public.raw_materials (group_id);
create index if not exists raw_materials_grade_id_idx
  on public.raw_materials (grade_id);
create index if not exists raw_materials_vendor_id_idx
  on public.raw_materials (primary_vendor_id);
create index if not exists raw_materials_warehouse_id_idx
  on public.raw_materials (warehouse_id);
create index if not exists raw_materials_status_idx
  on public.raw_materials (status);
create index if not exists raw_materials_updated_at_idx
  on public.raw_materials (updated_at desc);
create index if not exists raw_materials_material_code_idx
  on public.raw_materials (material_code);
create index if not exists raw_materials_material_name_idx
  on public.raw_materials (material_name);

insert into public.raw_material_groups (group_code, group_name, sort_order)
values
  ('HRS', 'เหล็กแผ่นรีดร้อน', 1),
  ('CRS', 'เหล็กแผ่นรีดเย็น', 2),
  ('STS', 'สแตนเลสแผ่น', 3),
  ('AL', 'อลูมิเนียมแผ่น', 4),
  ('GI', 'เหล็กแผ่นชุบสังกะสี', 5)
on conflict (group_code) do nothing;

insert into public.raw_material_grades (grade_code, grade_name, sort_order)
values
  ('SPHC-P/O', 'SPHC-P/O', 1),
  ('SS400', 'SS400', 2),
  ('SPCC', 'SPCC', 3),
  ('SECC', 'SECC', 4),
  ('SUS304', 'SUS304', 5),
  ('A5052', 'A5052', 6),
  ('GI', 'GI', 7)
on conflict (grade_code) do nothing;

insert into public.raw_material_warehouses (warehouse_code, warehouse_name, sort_order)
values
  ('RM-MAIN', 'คลังวัตถุดิบ', 1),
  ('RM-INBOUND', 'คลังรอรับเข้า', 2)
on conflict (warehouse_code) do nothing;

alter table public.raw_material_groups enable row level security;
alter table public.raw_material_grades enable row level security;
alter table public.raw_material_warehouses enable row level security;
alter table public.raw_materials enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'raw_material_groups'
      and policyname = 'Authenticated users can manage raw material groups'
  ) then
    create policy "Authenticated users can manage raw material groups"
      on public.raw_material_groups for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'raw_material_grades'
      and policyname = 'Authenticated users can manage raw material grades'
  ) then
    create policy "Authenticated users can manage raw material grades"
      on public.raw_material_grades for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'raw_material_warehouses'
      and policyname = 'Authenticated users can manage raw material warehouses'
  ) then
    create policy "Authenticated users can manage raw material warehouses"
      on public.raw_material_warehouses for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'raw_materials'
      and policyname = 'Authenticated users can manage raw materials'
  ) then
    create policy "Authenticated users can manage raw materials"
      on public.raw_materials for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;
