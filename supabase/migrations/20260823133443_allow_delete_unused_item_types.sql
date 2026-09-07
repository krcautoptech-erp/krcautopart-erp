insert into public.app_permissions (
  permission_code, permission_name, module_code, module_name,
  action_code, module_sort_order, sort_order, status
)
values (
  'item_types.delete', 'ลบประเภทสินค้าที่ยังไม่ถูกใช้งาน',
  'item_types', 'ตั้งค่าประเภทสินค้า', 'delete', 81, 50, 'active'
)
on conflict (permission_code) do update
set permission_name = excluded.permission_name,
    module_name = excluded.module_name,
    action_code = excluded.action_code,
    module_sort_order = excluded.module_sort_order,
    sort_order = excluded.sort_order,
    status = excluded.status;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
cross join public.app_permissions permission
where role.is_owner
  and permission.permission_code = 'item_types.delete'
on conflict (role_id, permission_id) do nothing;

drop policy if exists item_types_delete on public.item_types;
create policy item_types_delete on public.item_types
for delete to authenticated
using (public.authorize('item_types.delete'));

grant delete on public.item_types to authenticated;
