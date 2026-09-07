begin;

-- Prevent new public-schema functions from inheriting broad API execution.
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- Trigger helpers are internal database implementation details.
alter function public.set_updated_at() set search_path = '';
alter function public.recompute_purchase_requisition_totals()
  set search_path = '';

revoke all on function public.set_updated_at()
  from public, anon, authenticated;
revoke all on function public.recompute_purchase_requisition_totals()
  from public, anon, authenticated;

-- These functions only existed for local experiments and are not application APIs.
drop function if exists public.test_ordinality_fn(jsonb);

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'alter function public.rls_auto_enable() set search_path = ''''';
    execute
      'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;

-- SECURITY DEFINER RPCs must never inherit EXECUTE from PUBLIC or anon.
-- Authenticated execution remains explicit; each function performs its own RBAC check.
revoke all on function public.assert_user_admin_rate_limit(text, integer)
  from public, anon, authenticated;
revoke all on function public.authorize(text)
  from public, anon, authenticated;
revoke all on function public.create_app_role(text, text, text)
  from public, anon, authenticated;
revoke all on function public.create_department(text, text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.create_purchase_order(
  date, bigint, date, text, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.create_user_profile(
  uuid, text, text, text, text, bigint, bigint, uuid
) from public, anon, authenticated;
revoke all on function public.decide_purchase_requisition(bigint, text, text)
  from public, anon, authenticated;
revoke all on function public.delete_department(bigint)
  from public, anon, authenticated;
revoke all on function public.get_department_manager_candidates()
  from public, anon, authenticated;
revoke all on function public.get_department_settings()
  from public, anon, authenticated;
revoke all on function public.get_user_management_options()
  from public, anon, authenticated;
revoke all on function public.get_user_management_page(
  text, bigint, bigint, text, integer, integer
) from public, anon, authenticated;
revoke all on function public.is_current_user_active()
  from public, anon, authenticated;
revoke all on function public.is_current_user_owner()
  from public, anon, authenticated;
revoke all on function public.record_user_password_reset(uuid)
  from public, anon, authenticated;
revoke all on function public.replace_role_permissions(bigint, bigint[])
  from public, anon, authenticated;
revoke all on function public.reserve_business_number(text, date)
  from public, anon, authenticated;
revoke all on function public.reserve_raw_material_code()
  from public, anon, authenticated;
revoke all on function public.search_purchase_order_source_items(text, integer)
  from public, anon, authenticated;
revoke all on function public.set_department_status(bigint, text)
  from public, anon, authenticated;
revoke all on function public.set_user_profile_status(uuid, text)
  from public, anon, authenticated;
revoke all on function public.update_department(
  bigint, text, text, uuid, text, text
) from public, anon, authenticated;
revoke all on function public.update_user_profile(
  uuid, text, text, text, bigint, bigint, uuid
) from public, anon, authenticated;

grant execute on function public.assert_user_admin_rate_limit(text, integer)
  to authenticated;
grant execute on function public.authorize(text)
  to authenticated;
grant execute on function public.create_app_role(text, text, text)
  to authenticated;
grant execute on function public.create_department(text, text, uuid, text, text)
  to authenticated;
grant execute on function public.create_purchase_order(
  date, bigint, date, text, text, text, text, jsonb
) to authenticated;
grant execute on function public.create_user_profile(
  uuid, text, text, text, text, bigint, bigint, uuid
) to authenticated;
grant execute on function public.decide_purchase_requisition(bigint, text, text)
  to authenticated;
grant execute on function public.delete_department(bigint)
  to authenticated;
grant execute on function public.get_department_manager_candidates()
  to authenticated;
grant execute on function public.get_department_settings()
  to authenticated;
grant execute on function public.get_user_management_options()
  to authenticated;
grant execute on function public.get_user_management_page(
  text, bigint, bigint, text, integer, integer
) to authenticated;
grant execute on function public.is_current_user_active()
  to authenticated;
grant execute on function public.is_current_user_owner()
  to authenticated;
grant execute on function public.record_user_password_reset(uuid)
  to authenticated;
grant execute on function public.replace_role_permissions(bigint, bigint[])
  to authenticated;
grant execute on function public.reserve_business_number(text, date)
  to authenticated;
grant execute on function public.reserve_raw_material_code()
  to authenticated;
grant execute on function public.search_purchase_order_source_items(text, integer)
  to authenticated;
grant execute on function public.set_department_status(bigint, text)
  to authenticated;
grant execute on function public.set_user_profile_status(uuid, text)
  to authenticated;
grant execute on function public.update_department(
  bigint, text, text, uuid, text, text
) to authenticated;
grant execute on function public.update_user_profile(
  uuid, text, text, text, bigint, bigint, uuid
) to authenticated;

-- Replace broad write access on master data with permission-based policies.
do $$
declare
  existing_policy record;
  target record;
begin
  for target in
    select table_name
    from (
      values
        ('customer_addresses'),
        ('customers'),
        ('partner_customer_types'),
        ('products'),
        ('raw_material_grades'),
        ('raw_material_groups'),
        ('raw_material_units'),
        ('raw_material_warehouses'),
        ('raw_materials'),
        ('vendor_addresses'),
        ('vendor_credit_terms'),
        ('vendor_groups'),
        ('vendor_payment_methods'),
        ('vendor_tax_types'),
        ('vendors')
    ) as tables(table_name)
  loop
    for existing_policy in
      select policy.policyname
      from pg_catalog.pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = target.table_name
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        existing_policy.policyname,
        target.table_name
      );
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.authorize(''mdm.view'')))',
      'RBAC can view master data',
      target.table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.authorize(''mdm.create'')))',
      'RBAC can create master data',
      target.table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.authorize(''mdm.edit''))) with check ((select public.authorize(''mdm.edit'')))',
      'RBAC can edit master data',
      target.table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.authorize(''mdm.delete'')))',
      'RBAC can delete master data',
      target.table_name
    );
  end loop;
end
$$;

commit;
