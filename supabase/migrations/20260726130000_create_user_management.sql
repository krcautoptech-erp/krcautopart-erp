create extension if not exists pg_trgm with schema extensions;

create sequence if not exists public.employee_number_seq
  as bigint
  start with 1
  increment by 1
  no cycle;

create table if not exists public.user_profiles (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  employee_number bigint not null default nextval('public.employee_number_seq'),
  employee_code text generated always as (
    'KRC' || lpad(employee_number::text, 3, '0')
  ) stored,
  username text not null,
  first_name text not null,
  last_name text not null,
  position_name text,
  approver_user_id uuid references auth.users (id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  constraint user_profiles_user_id_unique unique (user_id),
  constraint user_profiles_employee_number_unique unique (employee_number),
  constraint user_profiles_employee_code_unique unique (employee_code),
  constraint user_profiles_username_unique unique (username),
  constraint user_profiles_username_format check (
    username = lower(username)
    and username ~ '^[a-z][a-z0-9._-]{7,29}$'
  ),
  constraint user_profiles_first_name_check check (
    length(btrim(first_name)) between 1 and 100
  ),
  constraint user_profiles_last_name_check check (
    length(btrim(last_name)) between 1 and 100
  ),
  constraint user_profiles_position_name_check check (
    position_name is null or length(position_name) <= 120
  ),
  constraint user_profiles_status_check check (
    status in ('active', 'inactive')
  )
);

create index if not exists user_profiles_status_employee_idx
  on public.user_profiles (status, employee_number);

create index if not exists user_profiles_approver_idx
  on public.user_profiles (approver_user_id)
  where approver_user_id is not null;

create index if not exists user_profiles_username_trgm_idx
  on public.user_profiles
  using gin (username extensions.gin_trgm_ops);

create index if not exists user_profiles_first_name_trgm_idx
  on public.user_profiles
  using gin (lower(first_name) extensions.gin_trgm_ops);

create index if not exists user_profiles_last_name_trgm_idx
  on public.user_profiles
  using gin (lower(last_name) extensions.gin_trgm_ops);

create table if not exists public.user_admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users (id) on delete set null,
  target_user_id uuid references auth.users (id) on delete set null,
  action_code text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_admin_audit_action_check check (
    action_code in (
      'user.created',
      'user.updated',
      'user.password_reset',
      'user.activated',
      'user.suspended'
    )
  ),
  constraint user_admin_audit_details_object_check check (
    jsonb_typeof(details) = 'object'
  )
);

create index if not exists user_admin_audit_target_time_idx
  on public.user_admin_audit_logs (target_user_id, created_at desc);

create index if not exists user_admin_audit_actor_time_idx
  on public.user_admin_audit_logs (actor_user_id, created_at desc);

create index if not exists user_admin_audit_created_brin_idx
  on public.user_admin_audit_logs using brin (created_at);

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

create or replace function public.is_current_user_owner()
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
    where user_role.user_id = (select auth.uid())
      and role.is_owner
      and role.status = 'active'
  );
$$;

create or replace function public.is_current_user_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.user_profiles profile
    where profile.user_id = (select auth.uid())
      and profile.status = 'inactive'
  );
$$;

create or replace function public.assert_user_admin_rate_limit(
  p_action_code text,
  p_max_operations integer default 30
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation_count bigint;
begin
  if not public.is_current_user_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if p_max_operations < 1 or p_max_operations > 100 then
    raise exception 'invalid_rate_limit' using errcode = '22023';
  end if;

  select count(*)
  into v_operation_count
  from public.user_admin_audit_logs audit
  where audit.actor_user_id = (select auth.uid())
    and audit.action_code = p_action_code
    and audit.created_at >= now() - interval '1 minute';

  if v_operation_count >= p_max_operations then
    raise exception 'rate_limit_exceeded' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.create_user_profile(
  p_user_id uuid,
  p_username text,
  p_first_name text,
  p_last_name text,
  p_position_name text,
  p_department_id bigint,
  p_role_id bigint,
  p_approver_user_id uuid default null
)
returns table (
  profile_id bigint,
  employee_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id bigint;
  v_employee_code text;
  v_username text := lower(btrim(p_username));
  v_first_name text := btrim(p_first_name);
  v_last_name text := btrim(p_last_name);
  v_department_name text;
  v_role_code text;
begin
  if not public.is_current_user_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if not exists (select 1 from auth.users app_user where app_user.id = p_user_id) then
    raise exception 'auth_user_not_found' using errcode = 'P0002';
  end if;

  if v_username !~ '^[a-z][a-z0-9._-]{7,29}$' then
    raise exception 'invalid_username' using errcode = '22023';
  end if;

  if length(v_first_name) = 0 or length(v_first_name) > 100
    or length(v_last_name) = 0 or length(v_last_name) > 100
  then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  select department.department_name
  into v_department_name
  from public.departments department
  where department.id = p_department_id
    and department.status = 'active';

  if not found then
    raise exception 'department_not_found' using errcode = 'P0002';
  end if;

  select role.role_code
  into v_role_code
  from public.app_roles role
  where role.id = p_role_id
    and role.status = 'active';

  if not found then
    raise exception 'role_not_found' using errcode = 'P0002';
  end if;

  if p_approver_user_id is not null
    and p_approver_user_id = p_user_id
  then
    raise exception 'self_approver_not_allowed' using errcode = '22023';
  end if;

  if p_approver_user_id is not null
    and not exists (
      select 1
      from public.user_profiles approver
      where approver.user_id = p_approver_user_id
        and approver.status = 'active'
    )
  then
    raise exception 'approver_not_found' using errcode = 'P0002';
  end if;

  insert into public.user_profiles (
    user_id,
    username,
    first_name,
    last_name,
    position_name,
    approver_user_id,
    created_by,
    updated_by
  )
  values (
    p_user_id,
    v_username,
    v_first_name,
    v_last_name,
    nullif(btrim(p_position_name), ''),
    p_approver_user_id,
    (select auth.uid()),
    (select auth.uid())
  )
  returning id, user_profiles.employee_code
  into v_profile_id, v_employee_code;

  insert into public.user_roles (user_id, role_id, assigned_by)
  values (p_user_id, p_role_id, (select auth.uid()))
  on conflict (user_id) do update
  set
    role_id = excluded.role_id,
    assigned_at = now(),
    assigned_by = excluded.assigned_by;

  insert into public.user_departments (user_id, department_id, assigned_by)
  values (p_user_id, p_department_id, (select auth.uid()))
  on conflict (user_id) do update
  set
    department_id = excluded.department_id,
    assigned_at = now(),
    assigned_by = excluded.assigned_by;

  update auth.users app_user
  set
    raw_app_meta_data =
      coalesce(app_user.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'role', lower(v_role_code),
        'department_name', v_department_name,
        'full_name', v_first_name || ' ' || v_last_name
      ),
    raw_user_meta_data =
      coalesce(app_user.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'username', v_username,
        'full_name', v_first_name || ' ' || v_last_name
      )
  where app_user.id = p_user_id;

  insert into public.user_admin_audit_logs (
    actor_user_id,
    target_user_id,
    action_code,
    details
  )
  values (
    (select auth.uid()),
    p_user_id,
    'user.created',
    jsonb_build_object(
      'employee_code', v_employee_code,
      'username', v_username,
      'department_id', p_department_id,
      'role_id', p_role_id
    )
  );

  return query select v_profile_id, v_employee_code;
end;
$$;

create or replace function public.update_user_profile(
  p_user_id uuid,
  p_first_name text,
  p_last_name text,
  p_position_name text,
  p_department_id bigint,
  p_role_id bigint,
  p_approver_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_name text := btrim(p_first_name);
  v_last_name text := btrim(p_last_name);
  v_department_name text;
  v_role_code text;
begin
  if not public.is_current_user_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if length(v_first_name) = 0 or length(v_first_name) > 100
    or length(v_last_name) = 0 or length(v_last_name) > 100
  then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  select department.department_name
  into v_department_name
  from public.departments department
  where department.id = p_department_id
    and department.status = 'active';

  if not found then
    raise exception 'department_not_found' using errcode = 'P0002';
  end if;

  select role.role_code
  into v_role_code
  from public.app_roles role
  where role.id = p_role_id
    and role.status = 'active';

  if not found then
    raise exception 'role_not_found' using errcode = 'P0002';
  end if;

  if p_approver_user_id is not null
    and p_approver_user_id = p_user_id
  then
    raise exception 'self_approver_not_allowed' using errcode = '22023';
  end if;

  if p_approver_user_id is not null
    and not exists (
      select 1
      from public.user_profiles approver
      where approver.user_id = p_approver_user_id
        and approver.status = 'active'
    )
  then
    raise exception 'approver_not_found' using errcode = 'P0002';
  end if;

  update public.user_profiles profile
  set
    first_name = v_first_name,
    last_name = v_last_name,
    position_name = nullif(btrim(p_position_name), ''),
    approver_user_id = p_approver_user_id,
    updated_by = (select auth.uid())
  where profile.user_id = p_user_id;

  if not found then
    raise exception 'user_profile_not_found' using errcode = 'P0002';
  end if;

  insert into public.user_roles (user_id, role_id, assigned_by)
  values (p_user_id, p_role_id, (select auth.uid()))
  on conflict (user_id) do update
  set
    role_id = excluded.role_id,
    assigned_at = now(),
    assigned_by = excluded.assigned_by;

  insert into public.user_departments (user_id, department_id, assigned_by)
  values (p_user_id, p_department_id, (select auth.uid()))
  on conflict (user_id) do update
  set
    department_id = excluded.department_id,
    assigned_at = now(),
    assigned_by = excluded.assigned_by;

  update auth.users app_user
  set
    raw_app_meta_data =
      coalesce(app_user.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'role', lower(v_role_code),
        'department_name', v_department_name,
        'full_name', v_first_name || ' ' || v_last_name
      ),
    raw_user_meta_data =
      coalesce(app_user.raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('full_name', v_first_name || ' ' || v_last_name)
  where app_user.id = p_user_id;

  insert into public.user_admin_audit_logs (
    actor_user_id,
    target_user_id,
    action_code,
    details
  )
  values (
    (select auth.uid()),
    p_user_id,
    'user.updated',
    jsonb_build_object(
      'department_id', p_department_id,
      'role_id', p_role_id
    )
  );
end;
$$;

create or replace function public.set_user_profile_status(
  p_user_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if p_status not in ('active', 'inactive') then
    raise exception 'invalid_user_status' using errcode = '22023';
  end if;

  if p_user_id = (select auth.uid()) and p_status = 'inactive' then
    raise exception 'cannot_suspend_self' using errcode = '42501';
  end if;

  update public.user_profiles profile
  set
    status = p_status,
    updated_by = (select auth.uid())
  where profile.user_id = p_user_id;

  if not found then
    raise exception 'user_profile_not_found' using errcode = 'P0002';
  end if;

  insert into public.user_admin_audit_logs (
    actor_user_id,
    target_user_id,
    action_code,
    details
  )
  values (
    (select auth.uid()),
    p_user_id,
    case when p_status = 'active' then 'user.activated' else 'user.suspended' end,
    jsonb_build_object('status', p_status)
  );
end;
$$;

create or replace function public.record_user_password_reset(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.user_profiles profile where profile.user_id = p_user_id
  ) then
    raise exception 'user_profile_not_found' using errcode = 'P0002';
  end if;

  insert into public.user_admin_audit_logs (
    actor_user_id,
    target_user_id,
    action_code
  )
  values ((select auth.uid()), p_user_id, 'user.password_reset');
end;
$$;

create or replace function public.get_user_management_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'nextEmployeeCode',
    'KRC' || lpad(
      (coalesce((
        select max(profile.employee_number)
        from public.user_profiles profile
      ), 0) + 1)::text,
      3,
      '0'
    ),
    'departments',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', department.id,
          'code', department.department_code,
          'name', department.department_name
        )
        order by department.department_name
      )
      from public.departments department
      where department.status = 'active'
    ), '[]'::jsonb),
    'roles',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', role.id,
          'code', role.role_code,
          'name', role.role_name,
          'isOwner', role.is_owner
        )
        order by role.sort_order, role.role_name
      )
      from public.app_roles role
      where role.status = 'active'
    ), '[]'::jsonb),
    'approvers',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', profile.user_id,
          'employeeCode', profile.employee_code,
          'name', profile.first_name || ' ' || profile.last_name
        )
        order by profile.first_name, profile.last_name
      )
      from public.user_profiles profile
      where profile.status = 'active'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_user_management_page(
  p_search text default null,
  p_department_id bigint default null,
  p_role_id bigint default null,
  p_status text default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  user_id uuid,
  employee_code text,
  username text,
  first_name text,
  last_name text,
  position_name text,
  department_id bigint,
  department_code text,
  department_name text,
  role_id bigint,
  role_code text,
  role_name text,
  approver_user_id uuid,
  status text,
  last_sign_in_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_offset integer;
begin
  if not public.is_current_user_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if p_page < 1 or p_page_size < 1 or p_page_size > 100 then
    raise exception 'invalid_pagination' using errcode = '22023';
  end if;

  if p_status is not null and p_status not in ('active', 'inactive') then
    raise exception 'invalid_user_status' using errcode = '22023';
  end if;

  v_offset := (p_page - 1) * p_page_size;

  return query
  select
    profile.user_id,
    profile.employee_code,
    profile.username,
    profile.first_name,
    profile.last_name,
    profile.position_name,
    department.id,
    department.department_code,
    department.department_name,
    role.id,
    role.role_code,
    role.role_name,
    profile.approver_user_id,
    profile.status,
    app_user.last_sign_in_at,
    count(*) over() as total_count
  from public.user_profiles profile
  join public.user_departments user_department
    on user_department.user_id = profile.user_id
  join public.departments department
    on department.id = user_department.department_id
  join public.user_roles user_role
    on user_role.user_id = profile.user_id
  join public.app_roles role
    on role.id = user_role.role_id
  join auth.users app_user
    on app_user.id = profile.user_id
  where
    (
      v_search = ''
      or lower(profile.employee_code) like '%' || v_search || '%'
      or profile.username like '%' || v_search || '%'
      or lower(profile.first_name) like '%' || v_search || '%'
      or lower(profile.last_name) like '%' || v_search || '%'
    )
    and (p_department_id is null or department.id = p_department_id)
    and (p_role_id is null or role.id = p_role_id)
    and (p_status is null or profile.status = p_status)
  order by profile.employee_number
  limit p_page_size
  offset v_offset;
end;
$$;

revoke all on function public.is_current_user_owner() from public;
revoke all on function public.is_current_user_active() from public;
revoke all on function public.assert_user_admin_rate_limit(text, integer) from public;
revoke all on function public.create_user_profile(uuid, text, text, text, text, bigint, bigint, uuid) from public;
revoke all on function public.update_user_profile(uuid, text, text, text, bigint, bigint, uuid) from public;
revoke all on function public.set_user_profile_status(uuid, text) from public;
revoke all on function public.record_user_password_reset(uuid) from public;
revoke all on function public.get_user_management_options() from public;
revoke all on function public.get_user_management_page(text, bigint, bigint, text, integer, integer) from public;

grant execute on function public.is_current_user_owner() to authenticated;
grant execute on function public.is_current_user_active() to authenticated;
grant execute on function public.assert_user_admin_rate_limit(text, integer) to authenticated;
grant execute on function public.create_user_profile(uuid, text, text, text, text, bigint, bigint, uuid) to authenticated;
grant execute on function public.update_user_profile(uuid, text, text, text, bigint, bigint, uuid) to authenticated;
grant execute on function public.set_user_profile_status(uuid, text) to authenticated;
grant execute on function public.record_user_password_reset(uuid) to authenticated;
grant execute on function public.get_user_management_options() to authenticated;
grant execute on function public.get_user_management_page(text, bigint, bigint, text, integer, integer) to authenticated;

alter table public.user_profiles enable row level security;
alter table public.user_admin_audit_logs enable row level security;

drop policy if exists "Owner can read user profiles" on public.user_profiles;
create policy "Owner can read user profiles"
on public.user_profiles for select
to authenticated
using ((select public.is_current_user_owner()));

drop policy if exists "Owner can read user admin audit logs"
  on public.user_admin_audit_logs;
create policy "Owner can read user admin audit logs"
on public.user_admin_audit_logs for select
to authenticated
using ((select public.is_current_user_owner()));

grant select on public.user_profiles to authenticated;
grant select on public.user_admin_audit_logs to authenticated;

insert into public.departments (
  department_code,
  department_name,
  status
)
values ('SYS', 'บริหารระบบ', 'active')
on conflict (department_code) do nothing;

insert into public.user_profiles (
  user_id,
  username,
  first_name,
  last_name,
  position_name,
  created_by,
  updated_by
)
select
  app_user.id,
  lower(split_part(app_user.email, '@', 1)),
  coalesce(
    nullif(btrim(app_user.raw_user_meta_data ->> 'first_name'), ''),
    nullif(btrim(app_user.raw_user_meta_data ->> 'full_name'), ''),
    'ผู้ดูแล'
  ),
  coalesce(
    nullif(btrim(app_user.raw_user_meta_data ->> 'last_name'), ''),
    'ระบบ'
  ),
  'เจ้าของระบบ',
  app_user.id,
  app_user.id
from auth.users app_user
join public.user_roles user_role on user_role.user_id = app_user.id
join public.app_roles role on role.id = user_role.role_id and role.is_owner
where lower(split_part(app_user.email, '@', 1))
      ~ '^[a-z][a-z0-9._-]{7,29}$'
on conflict (user_id) do nothing;

insert into public.user_departments (user_id, department_id, assigned_by)
select profile.user_id, department.id, profile.user_id
from public.user_profiles profile
join public.user_roles user_role on user_role.user_id = profile.user_id
join public.app_roles role on role.id = user_role.role_id and role.is_owner
cross join public.departments department
where department.department_code = 'SYS'
on conflict (user_id) do nothing;

delete from public.role_permissions mapping
using public.app_roles role, public.app_permissions permission
where mapping.role_id = role.id
  and mapping.permission_id = permission.id
  and permission.module_code = 'users'
  and not role.is_owner;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
cross join public.app_permissions permission
where role.is_owner
  and permission.module_code = 'users'
on conflict do nothing;
