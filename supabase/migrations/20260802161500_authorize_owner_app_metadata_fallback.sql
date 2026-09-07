-- OWNER is the break-glass system role. Auth app_metadata is signed by
-- Supabase and cannot be edited by the user, so it is safe as a fallback when
-- a legacy account is missing its public.user_roles mapping.

create or replace function public.authorize(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(
      pg_catalog.lower(auth.jwt() -> 'app_metadata' ->> 'role') = 'owner',
      false
    )
    or exists (
      select 1
      from public.user_roles as user_role
      join public.app_roles as app_role
        on app_role.id = user_role.role_id
       and app_role.status = 'active'
      join public.role_permissions as role_permission
        on role_permission.role_id = app_role.id
      join public.app_permissions as permission
        on permission.id = role_permission.permission_id
       and permission.status = 'active'
      where user_role.user_id = (select auth.uid())
        and permission.permission_code = requested_permission
    );
$$;

revoke all on function public.authorize(text) from public, anon;
grant execute on function public.authorize(text) to authenticated;

-- Keep the canonical RBAC row repaired for the bootstrap owner as well.
insert into public.user_roles (user_id, role_id, assigned_by, assigned_at)
select auth_user.id, owner_role.id, null, now()
from auth.users as auth_user
cross join lateral (
  select app_role.id
  from public.app_roles as app_role
  where (app_role.is_owner = true or upper(app_role.role_code) = 'OWNER')
    and app_role.status = 'active'
  order by app_role.is_owner desc, app_role.created_at asc
  limit 1
) as owner_role
where auth_user.id = '8e42ec85-9cc0-4c79-b30d-b9fa1a0932c7'::uuid
  and lower(auth_user.email) = 'adminkrc@krc.com'
on conflict (user_id) do update
set role_id = excluded.role_id,
    assigned_by = null,
    assigned_at = now();

insert into public.role_permissions (role_id, permission_id)
select app_role.id, permission.id
from public.app_roles as app_role
cross join public.app_permissions as permission
where (app_role.is_owner = true or upper(app_role.role_code) = 'OWNER')
  and app_role.status = 'active'
  and permission.status = 'active'
on conflict (role_id, permission_id) do nothing;
