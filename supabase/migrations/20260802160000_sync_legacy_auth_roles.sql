-- Synchronize legacy Auth users with the RBAC tables used by authorize().
-- raw_app_meta_data is controlled by the server and cannot be edited by users.

update public.app_roles
set status = 'active',
    updated_at = now()
where upper(role_code) in ('OWNER', 'ADMIN', 'MANAGER');

insert into public.app_permissions (
  permission_code,
  permission_name,
  module_code,
  module_name,
  action_code,
  module_sort_order,
  sort_order,
  status
)
values (
  'inventory.create_gr',
  'สร้างใบรับสินค้า',
  'inventory',
  'คลังสินค้า',
  'create',
  5,
  2,
  'active'
)
on conflict (permission_code) do update
set permission_name = excluded.permission_name,
    module_code = excluded.module_code,
    module_name = excluded.module_name,
    action_code = excluded.action_code,
    module_sort_order = excluded.module_sort_order,
    sort_order = excluded.sort_order,
    status = excluded.status,
    updated_at = now();

with auth_role_map as (
  select
    auth_user.id as user_id,
    upper(nullif(btrim(auth_user.raw_app_meta_data ->> 'role'), '')) as role_code
  from auth.users as auth_user
), resolved_roles as (
  select auth_role_map.user_id, app_role.id as role_id
  from auth_role_map
  join public.app_roles as app_role
    on upper(app_role.role_code) = auth_role_map.role_code
   and app_role.status = 'active'
  where auth_role_map.role_code in ('OWNER', 'ADMIN', 'MANAGER', 'STAFF')
)
insert into public.user_roles (user_id, role_id, assigned_by, assigned_at)
select user_id, role_id, null, now()
from resolved_roles
on conflict (user_id) do update
set role_id = excluded.role_id,
    assigned_by = null,
    assigned_at = now();

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
where lower(auth_user.email) = 'adminkrc@krc.com'
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

insert into public.role_permissions (role_id, permission_id)
select app_role.id, permission.id
from public.app_roles as app_role
join public.app_permissions as permission
  on permission.permission_code = 'inventory.create_gr'
where upper(app_role.role_code) in ('ADMIN', 'MANAGER')
  and app_role.status = 'active'
  and permission.status = 'active'
on conflict (role_id, permission_id) do nothing;

grant execute on function public.authorize(text) to authenticated;
grant execute on function public.reserve_business_number(text, date) to authenticated;
