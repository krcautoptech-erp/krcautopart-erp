with desired_permissions (
  permission_code,
  permission_name,
  module_code,
  module_name,
  action_code,
  module_sort_order,
  sort_order
) as (
  values
    ('assets.view', 'ดูทะเบียนสินทรัพย์', 'assets', 'สินทรัพย์และอุปกรณ์', 'view', 20, 10),
    ('assets.manage', 'จัดการทะเบียนสินทรัพย์', 'assets', 'สินทรัพย์และอุปกรณ์', 'manage', 20, 20),
    ('partners.view', 'ดูข้อมูลคู่ค้า', 'partners', 'คู่ค้า', 'view', 30, 10),
    ('partners.create', 'เพิ่มคู่ค้า', 'partners', 'คู่ค้า', 'create', 30, 20),
    ('partners.edit', 'แก้ไขคู่ค้า', 'partners', 'คู่ค้า', 'edit', 30, 30),
    ('partners.deactivate', 'ระงับคู่ค้า', 'partners', 'คู่ค้า', 'deactivate', 30, 40),
    ('partner_settings.view', 'ดูตั้งค่าคู่ค้า', 'partner_settings', 'ตั้งค่าคู่ค้า', 'view', 71, 10),
    ('partner_settings.manage', 'จัดการตั้งค่าคู่ค้า', 'partner_settings', 'ตั้งค่าคู่ค้า', 'manage', 71, 20),
    ('material_settings.view', 'ดูตั้งค่าวัตถุดิบ', 'material_settings', 'ตั้งค่าวัตถุดิบ', 'view', 72, 10),
    ('material_settings.manage', 'จัดการตั้งค่าวัตถุดิบ', 'material_settings', 'ตั้งค่าวัตถุดิบ', 'manage', 72, 20),
    ('document_terms.view', 'ดูเงื่อนไขเอกสาร', 'document_terms', 'เงื่อนไขเอกสาร', 'view', 74, 10),
    ('document_terms.manage', 'จัดการเงื่อนไขเอกสาร', 'document_terms', 'เงื่อนไขเอกสาร', 'manage', 74, 20),
    ('warehouses.view', 'ดูคลังสินค้า', 'warehouses', 'คลังสินค้า', 'view', 75, 10),
    ('warehouses.manage', 'จัดการคลังสินค้า', 'warehouses', 'คลังสินค้า', 'manage', 75, 20)
)
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
select
  permission_code,
  permission_name,
  module_code,
  module_name,
  action_code,
  module_sort_order,
  sort_order,
  'active'
from desired_permissions
on conflict (permission_code) do update
set
  permission_name = excluded.permission_name,
  module_code = excluded.module_code,
  module_name = excluded.module_name,
  action_code = excluded.action_code,
  module_sort_order = excluded.module_sort_order,
  sort_order = excluded.sort_order,
  status = 'active';

with module_order (module_code, module_name, module_sort_order) as (
  values
    ('items', 'รายการสินค้า', 10),
    ('assets', 'สินทรัพย์และอุปกรณ์', 20),
    ('partners', 'คู่ค้า', 30),
    ('pr', 'ใบขอซื้อ (PR)', 40),
    ('po', 'ใบสั่งซื้อ (PO)', 50),
    ('inventory', 'รับสินค้าและสต็อก', 60),
    ('company', 'ข้อมูลองค์กร', 70),
    ('partner_settings', 'ตั้งค่าคู่ค้า', 71),
    ('material_settings', 'ตั้งค่าวัตถุดิบ', 72),
    ('item_types', 'ประเภทสินค้า', 73),
    ('document_terms', 'เงื่อนไขเอกสาร', 74),
    ('warehouses', 'คลังสินค้า', 75),
    ('departments', 'แผนก', 76),
    ('users', 'ผู้ใช้งาน', 80),
    ('roles', 'Role และสิทธิ์', 81),
    ('mdm', 'ข้อมูลหลัก (เดิม)', 90)
)
update public.app_permissions permission
set
  module_name = module_order.module_name,
  module_sort_order = module_order.module_sort_order
from module_order
where permission.module_code = module_order.module_code;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
cross join public.app_permissions permission
where role.is_owner = true
  and permission.status = 'active'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select source_grant.role_id, target_permission.id
from public.role_permissions source_grant
join public.app_permissions source_permission
  on source_permission.id = source_grant.permission_id
join public.app_permissions target_permission
  on target_permission.permission_code = case source_permission.permission_code
    when 'mdm.view' then 'partners.view'
    when 'mdm.create' then 'partners.create'
    when 'mdm.edit' then 'partners.edit'
    when 'mdm.delete' then 'partners.deactivate'
    when 'inventory.view' then 'assets.view'
    when 'inventory.create_gr' then 'assets.manage'
    when 'company.view' then 'document_terms.view'
    when 'company.manage' then 'document_terms.manage'
    else null
  end
where target_permission.status = 'active'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select source_grant.role_id, target_permission.id
from public.role_permissions source_grant
join public.app_permissions source_permission
  on source_permission.id = source_grant.permission_id
join public.app_permissions target_permission
  on target_permission.permission_code in (
    case source_permission.permission_code
      when 'mdm.view' then 'partner_settings.view'
      when 'mdm.edit' then 'partner_settings.manage'
      else null
    end,
    case source_permission.permission_code
      when 'mdm.view' then 'material_settings.view'
      when 'mdm.edit' then 'material_settings.manage'
      else null
    end
  )
where target_permission.status = 'active'
on conflict (role_id, permission_id) do nothing;

drop policy if exists "Authorized users can read inventory serials" on public.inventory_serials;
create policy "Authorized users can read inventory serials"
on public.inventory_serials
for select
to authenticated
using (
  (select public.authorize('inventory.view'))
  or (select public.authorize('assets.view'))
);

drop policy if exists "Asset managers can update inventory serials" on public.inventory_serials;
create policy "Asset managers can update inventory serials"
on public.inventory_serials
for update
to authenticated
using ((select public.authorize('assets.manage')))
with check ((select public.authorize('assets.manage')));

grant update on public.inventory_serials to authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'vendors',
    'vendor_addresses',
    'customers',
    'customer_addresses'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'RBAC can view master data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can create master data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can edit master data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can delete master data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can view partner data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can create partner data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can edit partner data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can delete partner data', target_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.authorize(''partners.view'')) or (select public.authorize(''mdm.view'')))',
      'RBAC can view partner data',
      target_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.authorize(''partners.create'')) or (select public.authorize(''mdm.create'')))',
      'RBAC can create partner data',
      target_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.authorize(''partners.edit'')) or (select public.authorize(''partners.deactivate'')) or (select public.authorize(''mdm.edit''))) with check ((select public.authorize(''partners.edit'')) or (select public.authorize(''partners.deactivate'')) or (select public.authorize(''mdm.edit'')))',
      'RBAC can edit partner data',
      target_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.authorize(''mdm.delete'')))',
      'RBAC can delete partner data',
      target_table
    );
  end loop;

  foreach target_table in array array[
    'vendor_groups',
    'vendor_credit_terms',
    'vendor_payment_methods',
    'vendor_tax_types',
    'partner_customer_types'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'RBAC can view master data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can create master data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can edit master data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can delete master data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can view partner settings', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can create partner settings', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can edit partner settings', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can delete partner settings', target_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.authorize(''partner_settings.view'')) or (select public.authorize(''mdm.view'')))',
      'RBAC can view partner settings',
      target_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.authorize(''partner_settings.manage'')) or (select public.authorize(''mdm.create'')))',
      'RBAC can create partner settings',
      target_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.authorize(''partner_settings.manage'')) or (select public.authorize(''mdm.edit''))) with check ((select public.authorize(''partner_settings.manage'')) or (select public.authorize(''mdm.edit'')))',
      'RBAC can edit partner settings',
      target_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.authorize(''partner_settings.manage'')) or (select public.authorize(''mdm.delete'')))',
      'RBAC can delete partner settings',
      target_table
    );
  end loop;

  foreach target_table in array array[
    'raw_material_groups',
    'raw_material_grades',
    'raw_material_units'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'RBAC can view master data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can create master data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can edit master data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can delete master data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can view material settings', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can create material settings', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can edit material settings', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can delete material settings', target_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.authorize(''material_settings.view'')) or (select public.authorize(''mdm.view'')))',
      'RBAC can view material settings',
      target_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.authorize(''material_settings.manage'')) or (select public.authorize(''mdm.create'')))',
      'RBAC can create material settings',
      target_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.authorize(''material_settings.manage'')) or (select public.authorize(''mdm.edit''))) with check ((select public.authorize(''material_settings.manage'')) or (select public.authorize(''mdm.edit'')))',
      'RBAC can edit material settings',
      target_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.authorize(''material_settings.manage'')) or (select public.authorize(''mdm.delete'')))',
      'RBAC can delete material settings',
      target_table
    );
  end loop;
end $$;

drop policy if exists "Authenticated users can view warehouses" on public.raw_material_warehouses;
create policy "Authenticated users can view warehouses"
on public.raw_material_warehouses
for select
to authenticated
using ((select public.authorize('warehouses.view')) or (select public.authorize('inventory.view')));

drop policy if exists "Owners can manage warehouses" on public.raw_material_warehouses;
create policy "Owners can manage warehouses"
on public.raw_material_warehouses
for all
to authenticated
using ((select public.authorize('warehouses.manage')))
with check ((select public.authorize('warehouses.manage')));

drop policy if exists "Authenticated users can view warehouse types" on public.warehouse_types;
create policy "Authenticated users can view warehouse types"
on public.warehouse_types
for select
to authenticated
using ((select public.authorize('warehouses.view')) or (select public.authorize('inventory.view')));

drop policy if exists "Owners can manage warehouse types" on public.warehouse_types;
create policy "Owners can manage warehouse types"
on public.warehouse_types
for all
to authenticated
using ((select public.authorize('warehouses.manage')))
with check ((select public.authorize('warehouses.manage')));

drop policy if exists "Authenticated users can read document term templates" on public.document_term_templates;
create policy "Authenticated users can read document term templates"
on public.document_term_templates
for select
to authenticated
using ((select public.authorize('document_terms.view')) or (select public.authorize('company.view')));

drop policy if exists "Owners can insert document term templates" on public.document_term_templates;
create policy "Owners can insert document term templates"
on public.document_term_templates
for insert
to authenticated
with check ((select public.authorize('document_terms.manage')));

drop policy if exists "Owners can update document term templates" on public.document_term_templates;
create policy "Owners can update document term templates"
on public.document_term_templates
for update
to authenticated
using ((select public.authorize('document_terms.manage')))
with check ((select public.authorize('document_terms.manage')));

drop policy if exists "Owners can delete document term templates" on public.document_term_templates;
create policy "Owners can delete document term templates"
on public.document_term_templates
for delete
to authenticated
using ((select public.authorize('document_terms.manage')));

drop policy if exists "Authenticated users can read document term items" on public.document_term_items;
create policy "Authenticated users can read document term items"
on public.document_term_items
for select
to authenticated
using ((select public.authorize('document_terms.view')) or (select public.authorize('company.view')));

drop policy if exists "Owners can insert document term items" on public.document_term_items;
create policy "Owners can insert document term items"
on public.document_term_items
for insert
to authenticated
with check ((select public.authorize('document_terms.manage')));

drop policy if exists "Owners can update document term items" on public.document_term_items;
create policy "Owners can update document term items"
on public.document_term_items
for update
to authenticated
using ((select public.authorize('document_terms.manage')))
with check ((select public.authorize('document_terms.manage')));

drop policy if exists "Owners can delete document term items" on public.document_term_items;
create policy "Owners can delete document term items"
on public.document_term_items
for delete
to authenticated
using ((select public.authorize('document_terms.manage')));

do $$
declare
  v_missing_modules text;
  v_owner_missing integer;
begin
  select string_agg(module_code, ', ' order by module_code)
  into v_missing_modules
  from (
    values
      ('assets'),
      ('partners'),
      ('partner_settings'),
      ('material_settings'),
      ('document_terms'),
      ('warehouses')
  ) expected(module_code)
  where not exists (
    select 1
    from public.app_permissions permission
    where permission.module_code = expected.module_code
      and permission.status = 'active'
  );

  if v_missing_modules is not null then
    raise exception 'missing_permission_modules:%', v_missing_modules;
  end if;

  select count(*)
  into v_owner_missing
  from public.app_roles role
  cross join public.app_permissions permission
  where role.is_owner = true
    and permission.status = 'active'
    and not exists (
      select 1
      from public.role_permissions role_permission
      where role_permission.role_id = role.id
        and role_permission.permission_id = permission.id
    );

  if v_owner_missing > 0 then
    raise exception 'owner_permissions_incomplete:%', v_owner_missing;
  end if;
end $$;

notify pgrst, 'reload schema';
