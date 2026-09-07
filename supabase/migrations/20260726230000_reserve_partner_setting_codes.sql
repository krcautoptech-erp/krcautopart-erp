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
  v_period_key text;
  v_series erp_private.number_series%rowtype;
  v_series_key text := upper(btrim(p_series_key));
  v_user_id uuid := (select auth.uid());
  v_user_can_reserve boolean := false;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  v_user_can_reserve := case v_series_key
    when 'PR' then public.authorize('pr.create')
    when 'PO' then public.authorize('po.create')
    when 'RM' then public.authorize('mdm.create')
    when 'VG' then public.authorize('mdm.create')
    when 'CT' then public.authorize('mdm.create')
    else false
  end;

  if not coalesce(v_user_can_reserve, false) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select series.*
  into v_series
  from erp_private.number_series series
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
  from erp_private.number_allocations allocation
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
  from erp_private.allocate_business_number(
    v_series_key,
    p_effective_date,
    'reserved'
  ) allocated;
end;
$$;

revoke all on function public.reserve_business_number(text, date)
  from public, anon;
grant execute on function public.reserve_business_number(text, date)
  to authenticated;

create or replace function erp_private.set_vendor_group_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select claimed.business_number
  into new.code
  from erp_private.claim_business_number(
    'VG',
    current_date,
    new.code,
    'vendor_group',
    new.id::text
  ) claimed;
  return new;
end;
$$;

create or replace function erp_private.set_customer_type_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select claimed.business_number
  into new.code
  from erp_private.claim_business_number(
    'CT',
    current_date,
    new.code,
    'customer_type',
    new.id::text
  ) claimed;
  return new;
end;
$$;
