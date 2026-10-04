begin;

-- Remove legacy policies that made UI permissions bypassable through PostgREST.
drop policy if exists "Authenticated users can manage customer addresses" on public.customer_addresses;
drop policy if exists "Authenticated users can manage customers" on public.customers;
drop policy if exists "Authenticated users can manage partner customer types" on public.partner_customer_types;
drop policy if exists "Enable delete for authenticated users" on public.products;
drop policy if exists "Enable insert for authenticated users" on public.products;
drop policy if exists "Enable update for authenticated users" on public.products;
drop policy if exists "Authenticated users can manage raw material grades" on public.raw_material_grades;
drop policy if exists "Authenticated users can manage raw material groups" on public.raw_material_groups;
drop policy if exists "Authenticated users can manage raw material units" on public.raw_material_units;
drop policy if exists "Authenticated users can manage raw materials" on public.raw_materials;
drop policy if exists "Authenticated users can manage vendor addresses" on public.vendor_addresses;
drop policy if exists "Authenticated users can manage vendor credit terms" on public.vendor_credit_terms;
drop policy if exists "Authenticated users can manage vendor groups" on public.vendor_groups;
drop policy if exists "Authenticated users can manage vendor payment methods" on public.vendor_payment_methods;
drop policy if exists "Authenticated users can manage vendor tax types" on public.vendor_tax_types;
drop policy if exists "Authenticated users can manage vendors" on public.vendors;

alter table public.vendors
  add column if not exists created_by uuid default auth.uid();
alter table public.customers
  add column if not exists created_by uuid default auth.uid();

-- Creation ownership lets a create-only user add addresses only to the partner
-- row they just created. Existing rows remain editable through partners.edit.
drop policy if exists "RBAC can create partner data" on public.vendors;
create policy "RBAC can create partner data"
on public.vendors for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (select public.authorize('partners.create'))
    or (select public.authorize('mdm.create'))
  )
);

drop policy if exists "RBAC can create partner data" on public.customers;
create policy "RBAC can create partner data"
on public.customers for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (select public.authorize('partners.create'))
    or (select public.authorize('mdm.create'))
  )
);

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
    execute format('drop policy if exists %I on public.%I', 'RBAC can edit partner data', target_table);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.authorize(''partners.edit'')) or (select public.authorize(''mdm.edit''))) with check ((select public.authorize(''partners.edit'')) or (select public.authorize(''mdm.edit'')))',
      'RBAC can edit partner data',
      target_table
    );
  end loop;
end
$$;

-- Partner edits replace the address rows. Preserve that existing workflow while
-- still denying address writes to users without create/edit permissions.
drop policy if exists "RBAC can create partner data" on public.vendor_addresses;
create policy "RBAC can create partner data"
on public.vendor_addresses for insert to authenticated
with check (
  (select public.authorize('partners.edit'))
  or (select public.authorize('mdm.edit'))
  or (
    (
      (select public.authorize('partners.create'))
      or (select public.authorize('mdm.create'))
    )
    and exists (
      select 1
      from public.vendors parent
      where parent.id = vendor_id
        and parent.created_by = (select auth.uid())
    )
  )
);

drop policy if exists "RBAC can delete partner data" on public.vendor_addresses;
create policy "RBAC can delete partner data"
on public.vendor_addresses for delete to authenticated
using (
  (select public.authorize('partners.edit'))
  or (select public.authorize('mdm.edit'))
  or (select public.authorize('mdm.delete'))
);

drop policy if exists "RBAC can create partner data" on public.customer_addresses;
create policy "RBAC can create partner data"
on public.customer_addresses for insert to authenticated
with check (
  (select public.authorize('partners.edit'))
  or (select public.authorize('mdm.edit'))
  or (
    (
      (select public.authorize('partners.create'))
      or (select public.authorize('mdm.create'))
    )
    and exists (
      select 1
      from public.customers parent
      where parent.id = customer_id
        and parent.created_by = (select auth.uid())
    )
  )
);

drop policy if exists "RBAC can delete partner data" on public.customer_addresses;
create policy "RBAC can delete partner data"
on public.customer_addresses for delete to authenticated
using (
  (select public.authorize('partners.edit'))
  or (select public.authorize('mdm.edit'))
  or (select public.authorize('mdm.delete'))
);

-- Legacy item tables are read-only; active workflows use item_master.
revoke insert, update, delete on public.products from authenticated;
revoke insert, update, delete on public.raw_materials from authenticated;

-- A deactivate-only role may change only the status, never arbitrary vendor data.
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
    or public.authorize('mdm.edit')
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

-- Trigger and helper functions execute only through their owning trigger/RPC.
revoke all on function public.assert_user_admin_rate_limit(text, integer)
  from public, anon, authenticated;
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;
revoke all on function public.set_purchase_order_item_behavior()
  from public, anon, authenticated;
revoke all on function public.set_purchase_order_item_master_ref()
  from public, anon, authenticated;
revoke all on function public.sync_inventory_balances()
  from public, anon, authenticated;
revoke all on function public.sync_inventory_lot_balance()
  from public, anon, authenticated;
revoke all on function public.sync_product_balances()
  from public, anon, authenticated;

commit;
