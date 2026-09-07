alter table public.app_permissions
  drop constraint if exists app_permissions_action_check;

alter table public.app_permissions
  drop constraint if exists app_permissions_action_code_check;

alter table public.app_permissions
  add constraint app_permissions_action_code_check
  check (action_code in (
    'view', 'create', 'edit', 'delete', 'deactivate',
    'cancel', 'approve', 'reject', 'manage'
  ));

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
  ('items.view', 'ดูข้อมูลสินค้าและรายการกลาง', 'items', 'ข้อมูลสินค้าและรายการกลาง', 'view', 80, 10, 'active'),
  ('items.create', 'เพิ่มสินค้า', 'items', 'ข้อมูลสินค้าและรายการกลาง', 'create', 80, 20, 'active'),
  ('items.edit', 'แก้ไขสินค้า', 'items', 'ข้อมูลสินค้าและรายการกลาง', 'edit', 80, 30, 'active'),
  ('items.deactivate', 'ระงับสินค้า', 'items', 'ข้อมูลสินค้าและรายการกลาง', 'deactivate', 80, 40, 'active'),
  ('item_types.view', 'ดูการตั้งค่าประเภทสินค้า', 'item_types', 'ตั้งค่าประเภทสินค้า', 'view', 81, 10, 'active'),
  ('item_types.create', 'เพิ่มประเภทสินค้า', 'item_types', 'ตั้งค่าประเภทสินค้า', 'create', 81, 20, 'active'),
  ('item_types.edit', 'แก้ไขประเภทสินค้า', 'item_types', 'ตั้งค่าประเภทสินค้า', 'edit', 81, 30, 'active'),
  ('item_types.deactivate', 'ระงับประเภทสินค้า', 'item_types', 'ตั้งค่าประเภทสินค้า', 'deactivate', 81, 40, 'active')
on conflict (permission_code) do update
set permission_name = excluded.permission_name,
    module_code = excluded.module_code,
    module_name = excluded.module_name,
    action_code = excluded.action_code,
    module_sort_order = excluded.module_sort_order,
    sort_order = excluded.sort_order,
    status = excluded.status;

-- Preserve existing access while allowing the new modules to be managed separately.
insert into public.role_permissions (role_id, permission_id)
select source_grant.role_id, target_permission.id
from public.role_permissions source_grant
join public.app_permissions source_permission
  on source_permission.id = source_grant.permission_id
join public.app_permissions target_permission
  on target_permission.module_code in ('items', 'item_types')
 and target_permission.action_code = case source_permission.action_code
   when 'delete' then 'deactivate'
   else source_permission.action_code
 end
where source_permission.module_code = 'mdm'
  and source_permission.action_code in ('view', 'create', 'edit', 'delete')
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
cross join public.app_permissions permission
where role.is_owner
  and permission.module_code in ('items', 'item_types')
on conflict (role_id, permission_id) do nothing;

create or replace function public.reserve_item_code(p_item_type_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_mode text;
  v_value bigint;
begin
  if not public.authorize('items.create') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select code_mode, code_prefix into v_mode, v_prefix
  from public.item_types
  where id = p_item_type_id and status = 'active';

  if not found or v_mode <> 'auto' then
    raise exception 'item_type_not_auto_numbered';
  end if;

  insert into public.item_type_counters(item_type_id, last_value)
  values (p_item_type_id, 1)
  on conflict (item_type_id) do update
    set last_value = public.item_type_counters.last_value + 1,
        updated_at = now()
  returning last_value into v_value;

  return upper(v_prefix) || lpad(v_value::text, 4, '0');
end;
$$;

drop policy if exists item_types_select on public.item_types;
drop policy if exists item_types_insert on public.item_types;
drop policy if exists item_types_update on public.item_types;
drop policy if exists item_types_delete on public.item_types;
drop policy if exists item_master_select on public.item_master;
drop policy if exists item_master_insert on public.item_master;
drop policy if exists item_master_update on public.item_master;
drop policy if exists item_master_delete on public.item_master;

create policy item_types_select on public.item_types
for select to authenticated using (public.authorize('item_types.view'));
create policy item_types_insert on public.item_types
for insert to authenticated with check (public.authorize('item_types.create'));
create policy item_types_update on public.item_types
for update to authenticated
using (public.authorize('item_types.edit') or public.authorize('item_types.deactivate'))
with check (public.authorize('item_types.edit') or public.authorize('item_types.deactivate'));

create policy item_master_select on public.item_master
for select to authenticated using (public.authorize('items.view'));
create policy item_master_insert on public.item_master
for insert to authenticated with check (public.authorize('items.create'));
create policy item_master_update on public.item_master
for update to authenticated
using (public.authorize('items.edit') or public.authorize('items.deactivate'))
with check (public.authorize('items.edit') or public.authorize('items.deactivate'));

revoke delete on public.item_types, public.item_master from authenticated;
grant select, insert, update on public.item_types, public.item_master to authenticated;
grant execute on function public.reserve_item_code(bigint) to authenticated;
