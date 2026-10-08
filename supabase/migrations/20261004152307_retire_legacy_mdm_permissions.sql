begin;

-- Preserve every legacy role's effective access before retiring mdm.*.
insert into public.role_permissions (role_id, permission_id)
select source_grant.role_id, target_permission.id
from public.role_permissions source_grant
join public.app_permissions source_permission
  on source_permission.id = source_grant.permission_id
join public.app_permissions target_permission
  on target_permission.permission_code = any (
    case source_permission.permission_code
      when 'mdm.view' then array[
        'items.view', 'item_types.view', 'partners.view',
        'partner_settings.view', 'material_settings.view'
      ]::text[]
      when 'mdm.create' then array[
        'items.create', 'item_types.create', 'partners.create'
      ]::text[]
      when 'mdm.edit' then array[
        'items.edit', 'item_types.edit', 'partners.edit',
        'partner_settings.manage', 'material_settings.manage'
      ]::text[]
      when 'mdm.delete' then array[
        'items.deactivate', 'item_types.deactivate', 'partners.deactivate'
      ]::text[]
      else array[]::text[]
    end
  )
where source_permission.permission_code in (
  'mdm.view', 'mdm.create', 'mdm.edit', 'mdm.delete'
)
  and target_permission.status = 'active'
on conflict (role_id, permission_id) do nothing;

-- Partner master data now uses only the current partner permissions.
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
    execute format('drop policy if exists %I on public.%I', 'RBAC can view partner data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can create partner data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can edit partner data', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can delete partner data', target_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.authorize(''partners.view'')))',
      'RBAC can view partner data',
      target_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.authorize(''partners.edit''))) with check ((select public.authorize(''partners.edit'')))',
      'RBAC can edit partner data',
      target_table
    );
  end loop;
end
$$;

-- Partner creation retains the ownership boundary introduced by the hardening migration.
create policy "RBAC can create partner data"
on public.vendors for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select public.authorize('partners.create'))
);

create policy "RBAC can create partner data"
on public.customers for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select public.authorize('partners.create'))
);

create policy "RBAC can create partner data"
on public.vendor_addresses for insert to authenticated
with check (
  (select public.authorize('partners.edit'))
  or (
    (select public.authorize('partners.create'))
    and exists (
      select 1
      from public.vendors parent
      where parent.id = vendor_id
        and parent.created_by = (select auth.uid())
    )
  )
);

create policy "RBAC can create partner data"
on public.customer_addresses for insert to authenticated
with check (
  (select public.authorize('partners.edit'))
  or (
    (select public.authorize('partners.create'))
    and exists (
      select 1
      from public.customers parent
      where parent.id = customer_id
        and parent.created_by = (select auth.uid())
    )
  )
);

create policy "RBAC can delete partner data"
on public.vendor_addresses for delete to authenticated
using ((select public.authorize('partners.edit')));

create policy "RBAC can delete partner data"
on public.customer_addresses for delete to authenticated
using ((select public.authorize('partners.edit')));

-- Settings tables use their dedicated view/manage permissions only.
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'vendor_groups',
    'vendor_credit_terms',
    'vendor_payment_methods',
    'vendor_tax_types',
    'partner_customer_types'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'RBAC can view partner settings', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can create partner settings', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can edit partner settings', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can delete partner settings', target_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.authorize(''partner_settings.view'')))',
      'RBAC can view partner settings', target_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.authorize(''partner_settings.manage'')))',
      'RBAC can create partner settings', target_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.authorize(''partner_settings.manage''))) with check ((select public.authorize(''partner_settings.manage'')))',
      'RBAC can edit partner settings', target_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.authorize(''partner_settings.manage'')))',
      'RBAC can delete partner settings', target_table
    );
  end loop;

  foreach target_table in array array[
    'raw_material_groups',
    'raw_material_grades',
    'raw_material_units'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'RBAC can view material settings', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can create material settings', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can edit material settings', target_table);
    execute format('drop policy if exists %I on public.%I', 'RBAC can delete material settings', target_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.authorize(''material_settings.view'')))',
      'RBAC can view material settings', target_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.authorize(''material_settings.manage'')))',
      'RBAC can create material settings', target_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.authorize(''material_settings.manage''))) with check ((select public.authorize(''material_settings.manage'')))',
      'RBAC can edit material settings', target_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.authorize(''material_settings.manage'')))',
      'RBAC can delete material settings', target_table
    );
  end loop;
end
$$;

create or replace function public.set_vendor_status(
  p_vendor_id bigint,
  p_status text
)
returns public.vendors
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendor public.vendors;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  if not (
    public.authorize('partners.deactivate')
    or public.authorize('partners.edit')
  ) then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;

  if p_vendor_id <= 0 or p_status not in ('ใช้งาน', 'ระงับการใช้งาน') then
    raise exception 'INVALID_VENDOR_STATUS' using errcode = '22023';
  end if;

  update public.vendors
  set status = p_status
  where id = p_vendor_id
  returning * into v_vendor;

  if not found then
    raise exception 'VENDOR_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_vendor;
end;
$$;

revoke all on function public.set_vendor_status(bigint, text)
  from public, anon, authenticated;
grant execute on function public.set_vendor_status(bigint, text) to authenticated;

create or replace function public.reserve_business_number(
  p_series_key text,
  p_effective_date date default current_date
)
returns table (allocation_id bigint, business_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing erp_private.number_allocations%rowtype;
  v_is_owner boolean := false;
  v_period_key text;
  v_required_permission text;
  v_series erp_private.number_series%rowtype;
  v_series_key text := pg_catalog.upper(pg_catalog.btrim(p_series_key));
  v_user_can_reserve boolean := false;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  v_required_permission := case v_series_key
    when 'PR' then 'pr.create'
    when 'PO' then 'po.create'
    when 'GR' then 'inventory.create_gr'
    when 'IS' then 'inventory_issue.create'
    when 'AD' then 'inventory_adjustment.create'
    when 'RM' then 'items.create'
    when 'VG' then 'partner_settings.manage'
    when 'CT' then 'partner_settings.manage'
    else null
  end;

  select exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = v_user_id
      and pg_catalog.lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = 'owner'
  ) into v_is_owner;

  select exists (
    select 1
    from public.user_roles as user_role
    join public.app_roles as app_role
      on app_role.id = user_role.role_id and app_role.status = 'active'
    join public.role_permissions as role_permission
      on role_permission.role_id = app_role.id
    join public.app_permissions as permission
      on permission.id = role_permission.permission_id and permission.status = 'active'
    where user_role.user_id = v_user_id
      and permission.permission_code = v_required_permission
  ) into v_user_can_reserve;

  if not (coalesce(v_is_owner, false) or coalesce(v_user_can_reserve, false)) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select series.* into v_series
  from erp_private.number_series as series
  where series.series_key = v_series_key and series.is_active;
  if not found then
    raise exception 'number_series_not_found:%', p_series_key using errcode = 'P0002';
  end if;

  v_period_key := erp_private.series_period_key(v_series.reset_policy, p_effective_date);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_series_key || ':' || v_period_key || ':' || v_user_id::text, 0)
  );

  select allocation.* into v_existing
  from erp_private.number_allocations as allocation
  where allocation.series_id = v_series.id
    and allocation.period_key = v_period_key
    and allocation.status = 'reserved'
    and allocation.reserved_by = v_user_id
  order by allocation.id
  limit 1
  for update;

  if found then
    return query select v_existing.id, v_existing.formatted_number;
    return;
  end if;

  return query
  select allocated.allocation_id, allocated.business_number
  from erp_private.allocate_business_number(v_series_key, p_effective_date, 'reserved') as allocated;
end;
$$;

revoke all on function public.reserve_business_number(text, date) from public, anon;
grant execute on function public.reserve_business_number(text, date) to authenticated;

-- Inactive permissions cannot authorize, but removing stale grants also keeps
-- role data unambiguous for audits and future maintenance.
delete from public.role_permissions
where permission_id in (
  select id
  from public.app_permissions
  where permission_code in (
    'mdm.view', 'mdm.create', 'mdm.edit', 'mdm.delete',
    'users.create', 'users.edit', 'users.delete'
  )
);

update public.app_permissions
set status = 'inactive', updated_at = now()
where permission_code in (
  'mdm.view', 'mdm.create', 'mdm.edit', 'mdm.delete',
  'users.create', 'users.edit', 'users.delete'
);

commit;
