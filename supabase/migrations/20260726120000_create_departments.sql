create table if not exists public.departments (
  id bigint generated always as identity primary key,
  department_code text not null,
  department_name text not null,
  manager_user_id uuid null references auth.users (id) on delete set null,
  status text not null default 'active',
  remarks text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references auth.users (id) on delete set null,
  updated_by uuid null references auth.users (id) on delete set null,
  constraint departments_code_unique unique (department_code),
  constraint departments_code_format
    check (department_code ~ '^[A-Z][A-Z0-9]{1,11}$'),
  constraint departments_name_not_blank
    check (length(btrim(department_name)) between 1 and 100),
  constraint departments_status_check
    check (status in ('active', 'inactive')),
  constraint departments_remarks_length
    check (remarks is null or length(remarks) <= 500)
);

create unique index if not exists departments_name_unique_idx
  on public.departments (lower(btrim(department_name)));

create index if not exists departments_display_idx
  on public.departments (status, department_name, id);

create index if not exists departments_manager_user_id_idx
  on public.departments (manager_user_id)
  where manager_user_id is not null;

create index if not exists departments_created_by_idx
  on public.departments (created_by)
  where created_by is not null;

create index if not exists departments_updated_by_idx
  on public.departments (updated_by)
  where updated_by is not null;

create table if not exists public.user_departments (
  user_id uuid primary key references auth.users (id) on delete cascade,
  department_id bigint not null references public.departments (id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid null references auth.users (id) on delete set null
);

create index if not exists user_departments_department_id_idx
  on public.user_departments (department_id, user_id);

create index if not exists user_departments_assigned_by_idx
  on public.user_departments (assigned_by)
  where assigned_by is not null;

drop trigger if exists departments_set_updated_at on public.departments;
create trigger departments_set_updated_at
before update on public.departments
for each row execute function public.set_updated_at();

insert into public.app_permissions (
  permission_code,
  permission_name,
  module_code,
  module_name,
  action_code,
  module_sort_order,
  sort_order
)
values
  (
    'departments.view',
    'ดูข้อมูลแผนก',
    'departments',
    'ตั้งค่าแผนก',
    'view',
    5,
    1
  ),
  (
    'departments.manage',
    'จัดการข้อมูลแผนก',
    'departments',
    'ตั้งค่าแผนก',
    'manage',
    5,
    2
  )
on conflict (permission_code) do update
set
  permission_name = excluded.permission_name,
  module_code = excluded.module_code,
  module_name = excluded.module_name,
  action_code = excluded.action_code,
  module_sort_order = excluded.module_sort_order,
  sort_order = excluded.sort_order,
  status = 'active';

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
join public.app_permissions permission
  on permission.permission_code in ('departments.view', 'departments.manage')
where role.role_code in ('OWNER', 'ADMIN')
on conflict do nothing;

insert into public.departments (
  department_code,
  department_name,
  status
)
values
  ('PUR', 'จัดซื้อ', 'active'),
  ('PROD', 'ผลิต', 'active'),
  ('WH', 'คลังสินค้า', 'active'),
  ('QC', 'ควบคุมคุณภาพ', 'active'),
  ('HR', 'ทรัพยากรบุคคล', 'active'),
  ('AC', 'บัญชี', 'active')
on conflict do nothing;

create or replace function public.get_department_settings()
returns table (
  id bigint,
  department_code text,
  department_name text,
  manager_user_id uuid,
  manager_name text,
  user_count bigint,
  status text,
  remarks text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.authorize('departments.view') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  return query
  select
    department.id,
    department.department_code,
    department.department_name,
    department.manager_user_id,
    case
      when manager.id is null then null
      else coalesce(
        nullif(btrim(manager.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(manager.raw_user_meta_data ->> 'display_name'), ''),
        nullif(btrim(manager.raw_user_meta_data ->> 'name'), ''),
        manager.email,
        'ผู้ใช้งาน'
      )
    end as manager_name,
    count(member.user_id)::bigint as user_count,
    department.status,
    department.remarks
  from public.departments department
  left join auth.users manager
    on manager.id = department.manager_user_id
  left join public.user_departments member
    on member.department_id = department.id
  group by department.id, manager.id
  order by department.department_name, department.id;
end;
$$;

create or replace function public.get_department_manager_candidates()
returns table (
  user_id uuid,
  display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.authorize('departments.view') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  return query
  select
    app_user.id,
    coalesce(
      nullif(btrim(app_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(app_user.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(app_user.raw_user_meta_data ->> 'name'), ''),
      app_user.email,
      'ผู้ใช้งาน'
    ) as display_name
  from auth.users app_user
  order by 2, app_user.id;
end;
$$;

create or replace function public.create_department(
  p_department_code text,
  p_department_name text,
  p_manager_user_id uuid default null,
  p_status text default 'active',
  p_remarks text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department_code text := upper(btrim(p_department_code));
  v_department_name text := btrim(p_department_name);
  v_department_id bigint;
begin
  if not public.authorize('departments.manage') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if v_department_code !~ '^[A-Z][A-Z0-9]{1,11}$' then
    raise exception 'invalid_department_code' using errcode = '22023';
  end if;
  if length(v_department_name) = 0 or length(v_department_name) > 100 then
    raise exception 'invalid_department_name' using errcode = '22023';
  end if;
  if p_status not in ('active', 'inactive') then
    raise exception 'invalid_department_status' using errcode = '22023';
  end if;
  if length(coalesce(p_remarks, '')) > 500 then
    raise exception 'invalid_department_remarks' using errcode = '22023';
  end if;
  if p_manager_user_id is not null
    and not exists (
      select 1 from auth.users app_user where app_user.id = p_manager_user_id
    )
  then
    raise exception 'manager_not_found' using errcode = 'P0002';
  end if;

  insert into public.departments (
    department_code,
    department_name,
    manager_user_id,
    status,
    remarks,
    created_by,
    updated_by
  )
  values (
    v_department_code,
    v_department_name,
    p_manager_user_id,
    p_status,
    nullif(btrim(p_remarks), ''),
    (select auth.uid()),
    (select auth.uid())
  )
  returning departments.id into v_department_id;

  return v_department_id;
end;
$$;

create or replace function public.update_department(
  p_department_id bigint,
  p_department_code text,
  p_department_name text,
  p_manager_user_id uuid default null,
  p_status text default 'active',
  p_remarks text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_department_code text := upper(btrim(p_department_code));
  v_department_name text := btrim(p_department_name);
begin
  if not public.authorize('departments.manage') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if p_department_id is null or p_department_id <= 0 then
    raise exception 'department_not_found' using errcode = 'P0002';
  end if;
  if v_department_code !~ '^[A-Z][A-Z0-9]{1,11}$' then
    raise exception 'invalid_department_code' using errcode = '22023';
  end if;
  if length(v_department_name) = 0 or length(v_department_name) > 100 then
    raise exception 'invalid_department_name' using errcode = '22023';
  end if;
  if p_status not in ('active', 'inactive') then
    raise exception 'invalid_department_status' using errcode = '22023';
  end if;
  if length(coalesce(p_remarks, '')) > 500 then
    raise exception 'invalid_department_remarks' using errcode = '22023';
  end if;
  if p_manager_user_id is not null
    and not exists (
      select 1 from auth.users app_user where app_user.id = p_manager_user_id
    )
  then
    raise exception 'manager_not_found' using errcode = 'P0002';
  end if;

  update public.departments
  set
    department_code = v_department_code,
    department_name = v_department_name,
    manager_user_id = p_manager_user_id,
    status = p_status,
    remarks = nullif(btrim(p_remarks), ''),
    updated_by = (select auth.uid())
  where departments.id = p_department_id;

  if not found then
    raise exception 'department_not_found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.set_department_status(
  p_department_id bigint,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.authorize('departments.manage') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if p_status not in ('active', 'inactive') then
    raise exception 'invalid_department_status' using errcode = '22023';
  end if;

  update public.departments
  set
    status = p_status,
    updated_by = (select auth.uid())
  where departments.id = p_department_id;

  if not found then
    raise exception 'department_not_found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.delete_department(p_department_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.authorize('departments.manage') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.user_departments member
    where member.department_id = p_department_id
  ) then
    raise exception 'department_has_users' using errcode = '23503';
  end if;

  delete from public.departments
  where departments.id = p_department_id;

  if not found then
    raise exception 'department_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.get_department_settings() from public;
revoke all on function public.get_department_manager_candidates() from public;
revoke all on function public.create_department(text, text, uuid, text, text) from public;
revoke all on function public.update_department(bigint, text, text, uuid, text, text) from public;
revoke all on function public.set_department_status(bigint, text) from public;
revoke all on function public.delete_department(bigint) from public;

grant execute on function public.get_department_settings() to authenticated;
grant execute on function public.get_department_manager_candidates() to authenticated;
grant execute on function public.create_department(text, text, uuid, text, text) to authenticated;
grant execute on function public.update_department(bigint, text, text, uuid, text, text) to authenticated;
grant execute on function public.set_department_status(bigint, text) to authenticated;
grant execute on function public.delete_department(bigint) to authenticated;

alter table public.departments enable row level security;
alter table public.user_departments enable row level security;

drop policy if exists "Department viewers can read departments"
  on public.departments;
create policy "Department viewers can read departments"
on public.departments for select
to authenticated
using ((select public.authorize('departments.view')));

drop policy if exists "Users can read their department or department viewers can read all"
  on public.user_departments;
create policy "Users can read their department or department viewers can read all"
on public.user_departments for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.authorize('departments.view'))
);

grant select on public.departments to authenticated;
grant select on public.user_departments to authenticated;
