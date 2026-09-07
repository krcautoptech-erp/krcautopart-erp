-- Restore the bootstrap owner and ensure privileged roles can reserve GR numbers.
-- This migration is idempotent and is safe to run after the RBAC migrations.

update public.app_roles
set status = 'active',
    updated_at = now()
where is_owner = true
   or upper(role_code) = 'OWNER';

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
    status = 'active',
    updated_at = now();

-- OWNER must always receive every active permission, including permissions
-- introduced after the initial OWNER role was created.
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles as role
cross join public.app_permissions as permission
where (role.is_owner = true or upper(role.role_code) = 'OWNER')
  and role.status = 'active'
  and permission.status = 'active'
on conflict (role_id, permission_id) do nothing;

-- ADMIN and MANAGER are allowed to create goods receipts in the current ERP
-- permission model. OWNER was covered by the complete grant above.
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles as role
join public.app_permissions as permission
  on permission.permission_code = 'inventory.create_gr'
where upper(role.role_code) in ('ADMIN', 'MANAGER')
  and role.status = 'active'
  and permission.status = 'active'
on conflict (role_id, permission_id) do nothing;

-- The bootstrap account is the system owner. The original RBAC seed only
-- assigned this role when the auth user already existed during that migration.
insert into public.user_roles (user_id, role_id, assigned_by, assigned_at)
select auth_user.id, owner_role.id, null, now()
from auth.users as auth_user
cross join lateral (
  select role.id
  from public.app_roles as role
  where (role.is_owner = true or upper(role.role_code) = 'OWNER')
    and role.status = 'active'
  order by role.is_owner desc, role.created_at asc
  limit 1
) as owner_role
where lower(auth_user.email) = 'adminkrc@krc.com'
on conflict (user_id) do update
set role_id = excluded.role_id,
    assigned_by = null,
    assigned_at = now();
