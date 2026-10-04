-- Repair the permission introduced with stock-issue cancellation. The original
-- migration may already be recorded while its catalog row was removed later.
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
  'inventory_issue.cancel',
  'ยกเลิกใบเบิกใช้สินค้า',
  'inventory_issue',
  'ใบเบิกใช้สินค้า',
  'cancel',
  61,
  40,
  'active'
)
on conflict (permission_code) do update set
  permission_name = excluded.permission_name,
  module_code = excluded.module_code,
  module_name = excluded.module_name,
  action_code = excluded.action_code,
  module_sort_order = excluded.module_sort_order,
  sort_order = excluded.sort_order,
  status = 'active',
  updated_at = now();

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
join public.app_permissions permission
  on permission.permission_code = 'inventory_issue.cancel'
where role.is_owner
on conflict (role_id, permission_id) do nothing;
