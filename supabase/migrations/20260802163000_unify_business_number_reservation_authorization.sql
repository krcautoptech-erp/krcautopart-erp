-- Keep every business-number series on one allocator and one authorization path.
-- OWNER is read from auth.users.raw_app_meta_data because app metadata is
-- controlled by the server, unlike user-editable profile metadata.

insert into erp_private.number_series (
  series_key,
  prefix,
  padding,
  reset_policy,
  is_active
)
values ('GR', 'GR', 4, 'monthly', true)
on conflict (series_key) do update
set prefix = excluded.prefix,
    padding = excluded.padding,
    reset_policy = excluded.reset_policy,
    is_active = true,
    updated_at = now();

create or replace function public.reserve_business_number(
  p_series_key text,
  p_effective_date date default current_date
)
returns table (
  allocation_id bigint,
  business_number text
)
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
    when 'RM' then 'mdm.create'
    when 'VG' then 'mdm.create'
    when 'CT' then 'mdm.create'
    else null
  end;

  select exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = v_user_id
      and pg_catalog.lower(
        coalesce(auth_user.raw_app_meta_data ->> 'role', '')
      ) = 'owner'
  )
  into v_is_owner;

  select exists (
    select 1
    from public.user_roles as user_role
    join public.app_roles as app_role
      on app_role.id = user_role.role_id
     and app_role.status = 'active'
    join public.role_permissions as role_permission
      on role_permission.role_id = app_role.id
    join public.app_permissions as permission
      on permission.id = role_permission.permission_id
     and permission.status = 'active'
    where user_role.user_id = v_user_id
      and permission.permission_code = v_required_permission
  )
  into v_user_can_reserve;

  if not (coalesce(v_is_owner, false)
          or coalesce(v_user_can_reserve, false)) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select series.*
  into v_series
  from erp_private.number_series as series
  where series.series_key = v_series_key
    and series.is_active;

  if not found then
    raise exception 'number_series_not_found:%', p_series_key using errcode = 'P0002';
  end if;

  v_period_key := erp_private.series_period_key(
    v_series.reset_policy,
    p_effective_date
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_series_key || ':' || v_period_key || ':' || v_user_id::text,
      0
    )
  );

  select allocation.*
  into v_existing
  from erp_private.number_allocations as allocation
  where allocation.series_id = v_series.id
    and allocation.period_key = v_period_key
    and allocation.status = 'reserved'
    and allocation.reserved_by = v_user_id
  order by allocation.id
  limit 1
  for update;

  if found then
    return query
    select v_existing.id, v_existing.formatted_number;
    return;
  end if;

  return query
  select allocated.allocation_id, allocated.business_number
  from erp_private.allocate_business_number(
    v_series_key,
    p_effective_date,
    'reserved'
  ) as allocated;
end;
$$;

revoke all on function public.reserve_business_number(text, date)
  from public, anon;
grant execute on function public.reserve_business_number(text, date)
  to authenticated;
