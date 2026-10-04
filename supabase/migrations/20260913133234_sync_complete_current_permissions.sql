-- Keep the permission catalog aligned with every export action exposed by a current page.
update public.app_permissions
set module_code = pg_catalog.lower(pg_catalog.btrim(module_code))
where module_code <> pg_catalog.lower(pg_catalog.btrim(module_code));

with desired_permissions (
  permission_code, permission_name, module_code, module_name,
  action_code, module_sort_order, sort_order
) as (
  values
    ('items.export', 'ส่งออกรายการสินค้า', 'items', 'รายการสินค้า', 'export', 10, 50),
    ('assets.export', 'ส่งออกทะเบียนสินทรัพย์', 'assets', 'สินทรัพย์และอุปกรณ์', 'export', 20, 30),
    ('partners.export', 'ส่งออกข้อมูลคู่ค้า', 'partners', 'คู่ค้า', 'export', 30, 50),
    ('pr.export', 'ส่งออกใบขอซื้อ', 'pr', 'ใบขอซื้อ (PR)', 'export', 40, 90),
    ('po.export', 'ส่งออกใบสั่งซื้อ', 'po', 'ใบสั่งซื้อ (PO)', 'export', 50, 90),
    ('inventory.export', 'ส่งออกข้อมูลรับสินค้าและสต็อก', 'inventory', 'รับสินค้าและสต็อก', 'export', 60, 40),
    ('partner_settings.export', 'ส่งออกการตั้งค่าคู่ค้า', 'partner_settings', 'ตั้งค่าคู่ค้า', 'export', 71, 30),
    ('warehouses.export', 'ส่งออกข้อมูลคลังสินค้า', 'warehouses', 'คลังสินค้า', 'export', 75, 30),
    ('departments.export', 'ส่งออกข้อมูลแผนก', 'departments', 'แผนก', 'export', 76, 30),
    ('users.export', 'ส่งออกข้อมูลผู้ใช้งาน', 'users', 'ผู้ใช้งานและสิทธิ์', 'export', 80, 50)
)
insert into public.app_permissions (
  permission_code, permission_name, module_code, module_name,
  action_code, module_sort_order, sort_order, status
)
select
  permission_code, permission_name, module_code, module_name,
  action_code, module_sort_order, sort_order, 'active'
from desired_permissions
on conflict (permission_code) do update set
  permission_name = excluded.permission_name,
  module_code = excluded.module_code,
  module_name = excluded.module_name,
  action_code = excluded.action_code,
  module_sort_order = excluded.module_sort_order,
  sort_order = excluded.sort_order,
  status = 'active';

-- Account mutations remain OWNER-only because they use the Auth admin API.
-- Do not expose misleading assignable permissions for operations a custom role cannot perform.
update public.app_permissions
set status = 'inactive'
where permission_code in (
  'users.create', 'users.edit', 'users.delete',
  'po.delete', 'inventory.cancel_gr'
);

-- Existing viewers keep the export capability they already had before it became explicit.
with export_permissions (source_code, target_code) as (
  values
    ('items.view', 'items.export'),
    ('assets.view', 'assets.export'),
    ('partners.view', 'partners.export'),
    ('pr.view', 'pr.export'),
    ('po.view', 'po.export'),
    ('inventory.view', 'inventory.export'),
    ('partner_settings.view', 'partner_settings.export'),
    ('warehouses.view', 'warehouses.export'),
    ('departments.view', 'departments.export'),
    ('users.view', 'users.export')
)
insert into public.role_permissions (role_id, permission_id)
select source_grant.role_id, target_permission.id
from export_permissions mapping
join public.app_permissions source_permission
  on source_permission.permission_code = mapping.source_code
join public.role_permissions source_grant
  on source_grant.permission_id = source_permission.id
join public.app_permissions target_permission
  on target_permission.permission_code = mapping.target_code
on conflict (role_id, permission_id) do nothing;

-- OWNER always receives newly introduced permissions.
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
cross join public.app_permissions permission
where role.is_owner and permission.status = 'active'
on conflict (role_id, permission_id) do nothing;

-- One later GR migration used retired permission names. Keep the public API compatible
-- while making inventory.create_gr the single permission managed by the role screen.
create or replace function public.authorize(requested_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select profile.status = 'active'
      from public.user_profiles profile
      where profile.user_id = (select auth.uid())
    ), true)
    and (
      coalesce(
        pg_catalog.lower(auth.jwt() -> 'app_metadata' ->> 'role') = 'owner',
        false
      )
      or exists (
      select 1
      from public.user_roles user_role
      join public.app_roles app_role
        on app_role.id = user_role.role_id
       and app_role.status = 'active'
      join public.role_permissions role_permission
        on role_permission.role_id = app_role.id
      join public.app_permissions permission
        on permission.id = role_permission.permission_id
       and permission.status = 'active'
      where user_role.user_id = (select auth.uid())
        and permission.permission_code = case requested_permission
          when 'inventory.receive' then 'inventory.create_gr'
          when 'inventory.manage' then 'inventory.create_gr'
          else requested_permission
        end
      )
    );
$$;

revoke all on function public.authorize(text) from public, anon;
grant execute on function public.authorize(text) to authenticated;

create or replace function public.get_current_user_permission_codes()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(pg_catalog.array_agg(permission.permission_code order by permission.permission_code), array[]::text[])
  from public.app_permissions permission
  where permission.status = 'active'
    and coalesce((
      select profile.status = 'active'
      from public.user_profiles profile
      where profile.user_id = (select auth.uid())
    ), true)
    and (
      coalesce(pg_catalog.lower(auth.jwt() -> 'app_metadata' ->> 'role') = 'owner', false)
      or exists (
        select 1
        from public.user_roles user_role
        join public.app_roles app_role
          on app_role.id = user_role.role_id
         and app_role.status = 'active'
        join public.role_permissions role_permission
          on role_permission.role_id = app_role.id
         and role_permission.permission_id = permission.id
        where user_role.user_id = (select auth.uid())
      )
    );
$$;

revoke all on function public.get_current_user_permission_codes() from public, anon;
grant execute on function public.get_current_user_permission_codes() to authenticated;

-- Approval permissions were present in the matrix but legacy RPCs still required OWNER.
-- Remove only that obsolete owner gate; their existing pr/po approve/reject checks remain.
do $$
declare
  function_signature regprocedure;
  original_definition text;
  updated_definition text;
  owner_gate text := $gate$
  if not exists (
    select 1
    from public.user_roles user_role
    join public.app_roles role
      on role.id = user_role.role_id
      and role.is_owner
      and role.status = 'active'
    left join public.user_profiles profile
      on profile.user_id = user_role.user_id
    where user_role.user_id = v_user_id
      and coalesce(profile.status, 'active') = 'active'
  ) then
    raise exception 'owner_approval_required' using errcode = '42501';
  end if;
$gate$;
begin
  foreach function_signature in array array[
    'public.decide_purchase_requisition(bigint,text,text)'::regprocedure,
    'public.decide_purchase_order(bigint,text,text)'::regprocedure
  ]
  loop
    original_definition := pg_catalog.pg_get_functiondef(function_signature);
    updated_definition := pg_catalog.replace(original_definition, owner_gate, pg_catalog.btrim(owner_gate));
    updated_definition := pg_catalog.replace(updated_definition, pg_catalog.btrim(owner_gate), '');
    if updated_definition = original_definition then
      raise exception 'approval_owner_gate_not_found:%', function_signature;
    end if;
    execute updated_definition;
  end loop;
end;
$$;

-- Read-only user administration is assignable; account mutations above remain OWNER-only.
do $$
declare
  function_signature regprocedure;
  original_definition text;
  updated_definition text;
  owner_check text := $gate$if not public.is_current_user_owner() then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;$gate$;
begin
  foreach function_signature in array array[
    'public.get_user_management_options()'::regprocedure,
    'public.get_user_management_page(text,bigint,bigint,text,integer,integer)'::regprocedure
  ]
  loop
    original_definition := pg_catalog.pg_get_functiondef(function_signature);
    updated_definition := pg_catalog.replace(
      original_definition,
      owner_check,
      'if not public.authorize(''users.view'') then' || chr(10) ||
      '    raise exception ''insufficient_privilege'' using errcode = ''42501'';' || chr(10) ||
      '  end if;'
    );
    if updated_definition = original_definition then
      raise exception 'user_view_owner_gate_not_found:%', function_signature;
    end if;
    execute updated_definition;
  end loop;
end;
$$;
