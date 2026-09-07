create table if not exists public.app_roles (
  id bigint generated always as identity primary key,
  role_code text not null,
  role_name text not null,
  description text,
  is_system boolean not null default false,
  is_owner boolean not null default false,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_roles_code_unique unique (role_code),
  constraint app_roles_code_format check (role_code ~ '^[A-Z][A-Z0-9_]{1,29}$'),
  constraint app_roles_name_not_blank check (length(btrim(role_name)) > 0),
  constraint app_roles_status_check check (status in ('active', 'inactive')),
  constraint app_roles_sort_order_check check (sort_order >= 0)
);

create unique index if not exists app_roles_single_owner_idx
  on public.app_roles (is_owner)
  where is_owner;

create index if not exists app_roles_display_idx
  on public.app_roles (status, sort_order, role_name);

create table if not exists public.app_permissions (
  id bigint generated always as identity primary key,
  permission_code text not null,
  permission_name text not null,
  module_code text not null,
  module_name text not null,
  action_code text not null,
  module_sort_order integer not null default 0,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_permissions_code_unique unique (permission_code),
  constraint app_permissions_code_format
    check (permission_code ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  constraint app_permissions_name_not_blank check (length(btrim(permission_name)) > 0),
  constraint app_permissions_module_code_not_blank check (length(btrim(module_code)) > 0),
  constraint app_permissions_module_name_not_blank check (length(btrim(module_name)) > 0),
  constraint app_permissions_action_check
    check (action_code in ('view', 'create', 'edit', 'delete', 'approve', 'reject', 'manage')),
  constraint app_permissions_status_check check (status in ('active', 'inactive')),
  constraint app_permissions_sort_order_check
    check (module_sort_order >= 0 and sort_order >= 0)
);

create index if not exists app_permissions_display_idx
  on public.app_permissions (status, module_sort_order, sort_order, permission_code);

create table if not exists public.role_permissions (
  role_id bigint not null references public.app_roles (id) on delete cascade,
  permission_id bigint not null references public.app_permissions (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  primary key (role_id, permission_id)
);

create index if not exists role_permissions_permission_id_idx
  on public.role_permissions (permission_id, role_id);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role_id bigint not null references public.app_roles (id),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users (id) on delete set null
);

create index if not exists user_roles_role_id_idx
  on public.user_roles (role_id, user_id);

drop trigger if exists app_roles_set_updated_at on public.app_roles;
create trigger app_roles_set_updated_at
before update on public.app_roles
for each row execute function public.set_updated_at();

drop trigger if exists app_permissions_set_updated_at on public.app_permissions;
create trigger app_permissions_set_updated_at
before update on public.app_permissions
for each row execute function public.set_updated_at();

insert into public.app_roles (
  role_code,
  role_name,
  description,
  is_system,
  is_owner,
  sort_order
)
values
  ('OWNER', 'เจ้าของระบบ', 'สิทธิ์สูงสุดสำหรับเจ้าของระบบ', true, true, 1),
  ('ADMIN', 'ผู้ดูแลระบบ', 'ดูแลข้อมูลและการตั้งค่าระบบทั่วไป', true, false, 2),
  ('MANAGER', 'ผู้จัดการ', 'ตรวจสอบและบริหารงานภายในแผนก', true, false, 3),
  ('STAFF', 'พนักงาน', 'ใช้งานเอกสารและข้อมูลตามหน้าที่', true, false, 4)
on conflict (role_code) do update
set
  role_name = excluded.role_name,
  description = excluded.description,
  is_system = excluded.is_system,
  is_owner = excluded.is_owner,
  sort_order = excluded.sort_order;

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
  ('pr.view', 'ดูใบขอซื้อ', 'pr', 'ใบขอซื้อ (PR)', 'view', 1, 1),
  ('pr.create', 'สร้างใบขอซื้อ', 'pr', 'ใบขอซื้อ (PR)', 'create', 1, 2),
  ('pr.edit', 'แก้ไขใบขอซื้อ', 'pr', 'ใบขอซื้อ (PR)', 'edit', 1, 3),
  ('pr.delete', 'ลบใบขอซื้อ', 'pr', 'ใบขอซื้อ (PR)', 'delete', 1, 4),
  ('pr.approve', 'อนุมัติใบขอซื้อ', 'pr', 'ใบขอซื้อ (PR)', 'approve', 1, 5),
  ('pr.reject', 'ปฏิเสธใบขอซื้อ', 'pr', 'ใบขอซื้อ (PR)', 'reject', 1, 6),
  ('mdm.view', 'ดูข้อมูลกลาง', 'mdm', 'ข้อมูลกลาง', 'view', 2, 1),
  ('mdm.create', 'สร้างข้อมูลกลาง', 'mdm', 'ข้อมูลกลาง', 'create', 2, 2),
  ('mdm.edit', 'แก้ไขข้อมูลกลาง', 'mdm', 'ข้อมูลกลาง', 'edit', 2, 3),
  ('mdm.delete', 'ลบข้อมูลกลาง', 'mdm', 'ข้อมูลกลาง', 'delete', 2, 4),
  ('users.view', 'ดูผู้ใช้งานและสิทธิ์', 'users', 'ผู้ใช้งานและสิทธิ์', 'view', 3, 1),
  ('users.create', 'สร้างผู้ใช้งาน', 'users', 'ผู้ใช้งานและสิทธิ์', 'create', 3, 2),
  ('users.edit', 'แก้ไขผู้ใช้งานและสิทธิ์', 'users', 'ผู้ใช้งานและสิทธิ์', 'edit', 3, 3),
  ('users.delete', 'ลบผู้ใช้งาน', 'users', 'ผู้ใช้งานและสิทธิ์', 'delete', 3, 4),
  ('roles.view', 'ดู Role และสิทธิ์', 'roles', 'Role และสิทธิ์', 'view', 4, 1),
  ('roles.manage', 'จัดการ Role และสิทธิ์', 'roles', 'Role และสิทธิ์', 'manage', 4, 2)
on conflict (permission_code) do update
set
  permission_name = excluded.permission_name,
  module_code = excluded.module_code,
  module_name = excluded.module_name,
  action_code = excluded.action_code,
  module_sort_order = excluded.module_sort_order,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
cross join public.app_permissions permission
where role.role_code = 'OWNER'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
join public.app_permissions permission
  on permission.permission_code in (
    'pr.view',
    'pr.create',
    'pr.edit',
    'pr.delete',
    'mdm.view',
    'mdm.create',
    'mdm.edit',
    'mdm.delete',
    'users.view',
    'users.create',
    'users.edit',
    'users.delete',
    'roles.view'
  )
where role.role_code = 'ADMIN'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
join public.app_permissions permission
  on permission.permission_code in (
    'pr.view',
    'pr.create',
    'pr.edit',
    'pr.approve',
    'pr.reject',
    'mdm.view'
  )
where role.role_code = 'MANAGER'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
join public.app_permissions permission
  on permission.permission_code in ('pr.view', 'pr.create', 'pr.edit', 'mdm.view')
where role.role_code = 'STAFF'
on conflict do nothing;

insert into public.user_roles (user_id, role_id)
select app_user.id, owner_role.id
from auth.users app_user
cross join public.app_roles owner_role
where lower(app_user.email) = 'adminkrc@krc.com'
  and owner_role.role_code = 'OWNER'
on conflict (user_id) do update
set role_id = excluded.role_id;

update auth.users app_user
set raw_app_meta_data =
  coalesce(app_user.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'owner', 'can_approve_pr', true)
where lower(app_user.email) = 'adminkrc@krc.com';

create or replace function public.authorize(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles user_role
    join public.app_roles role
      on role.id = user_role.role_id
      and role.status = 'active'
    join public.role_permissions role_permission
      on role_permission.role_id = role.id
    join public.app_permissions permission
      on permission.id = role_permission.permission_id
      and permission.status = 'active'
    where user_role.user_id = (select auth.uid())
      and permission.permission_code = requested_permission
  );
$$;

revoke all on function public.authorize(text) from public;
grant execute on function public.authorize(text) to authenticated;

create or replace function public.create_app_role(
  p_role_code text,
  p_role_name text,
  p_description text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id bigint;
  v_role_code text := upper(btrim(p_role_code));
  v_role_name text := btrim(p_role_name);
begin
  if not public.authorize('roles.manage') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if v_role_code !~ '^[A-Z][A-Z0-9_]{1,29}$' then
    raise exception 'invalid_role_code' using errcode = '22023';
  end if;

  if length(v_role_name) = 0 or length(v_role_name) > 100 then
    raise exception 'invalid_role_name' using errcode = '22023';
  end if;

  insert into public.app_roles (
    role_code,
    role_name,
    description,
    sort_order
  )
  values (
    v_role_code,
    v_role_name,
    nullif(btrim(p_description), ''),
    coalesce((select max(sort_order) + 1 from public.app_roles), 1)
  )
  returning id into v_role_id;

  return v_role_id;
end;
$$;

revoke all on function public.create_app_role(text, text, text) from public;
grant execute on function public.create_app_role(text, text, text) to authenticated;

create or replace function public.replace_role_permissions(
  p_role_id bigint,
  p_permission_ids bigint[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_owner boolean;
  v_requested_count integer;
  v_valid_count integer;
begin
  if not public.authorize('roles.manage') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  select role.is_owner
  into v_is_owner
  from public.app_roles role
  where role.id = p_role_id
  for update;

  if not found then
    raise exception 'role_not_found' using errcode = 'P0002';
  end if;

  if v_is_owner then
    raise exception 'owner_role_is_locked' using errcode = '42501';
  end if;

  select count(distinct permission_id)
  into v_requested_count
  from unnest(coalesce(p_permission_ids, '{}'::bigint[]))
    as requested(permission_id);

  select count(*)
  into v_valid_count
  from public.app_permissions permission
  where permission.id = any(coalesce(p_permission_ids, '{}'::bigint[]))
    and permission.status = 'active';

  if v_requested_count <> v_valid_count then
    raise exception 'invalid_permission_selection' using errcode = '22023';
  end if;

  delete from public.role_permissions
  where role_id = p_role_id;

  insert into public.role_permissions (
    role_id,
    permission_id,
    granted_by
  )
  select
    p_role_id,
    requested.permission_id,
    (select auth.uid())
  from unnest(coalesce(p_permission_ids, '{}'::bigint[]))
    as requested(permission_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.replace_role_permissions(bigint, bigint[]) from public;
grant execute on function public.replace_role_permissions(bigint, bigint[]) to authenticated;

alter table public.app_roles enable row level security;
alter table public.app_permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;

drop policy if exists "Role managers can read roles" on public.app_roles;
create policy "Role managers can read roles"
on public.app_roles for select
to authenticated
using ((select public.authorize('roles.view')));

drop policy if exists "Role managers can read permissions" on public.app_permissions;
create policy "Role managers can read permissions"
on public.app_permissions for select
to authenticated
using ((select public.authorize('roles.view')));

drop policy if exists "Role managers can read role permissions" on public.role_permissions;
create policy "Role managers can read role permissions"
on public.role_permissions for select
to authenticated
using ((select public.authorize('roles.view')));

drop policy if exists "Users can read their role or role managers can read all"
  on public.user_roles;
create policy "Users can read their role or role managers can read all"
on public.user_roles for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.authorize('roles.view'))
);

grant select on public.app_roles to authenticated;
grant select on public.app_permissions to authenticated;
grant select on public.role_permissions to authenticated;
grant select on public.user_roles to authenticated;
