-- Repair GR permissions for databases where role mappings were saved before
-- the inventory module permissions were introduced.
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
values
  (
    'inventory.view',
    'ดูคลังสินค้าและรับเข้า',
    'inventory',
    'คลังสินค้า',
    'view',
    5,
    1,
    'active'
  ),
  (
    'inventory.create_gr',
    'สร้างใบรับสินค้า',
    'inventory',
    'คลังสินค้า',
    'create',
    5,
    2,
    'active'
  ),
  (
    'inventory.cancel_gr',
    'ยกเลิกใบรับสินค้า',
    'inventory',
    'คลังสินค้า',
    'cancel',
    5,
    3,
    'active'
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
from public.app_roles as role
cross join public.app_permissions as permission
where upper(role.role_code) in ('OWNER', 'ADMIN', 'MANAGER')
  and permission.permission_code in (
    'inventory.view',
    'inventory.create_gr',
    'inventory.cancel_gr'
  )
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles as role
join public.app_permissions as permission
  on permission.permission_code = 'inventory.view'
where upper(role.role_code) = 'STAFF'
on conflict (role_id, permission_id) do nothing;
