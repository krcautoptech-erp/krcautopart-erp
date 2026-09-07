create or replace function erp_private.allocate_business_number(
  p_series_key text,
  p_effective_date date,
  p_status text,
  p_entity_type text default null,
  p_entity_id text default null
)
returns table (
  allocation_id bigint,
  business_number text,
  sequence_value bigint,
  period_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
  v_period_key text;
  v_sequence_value bigint;
  v_series erp_private.number_series%rowtype;
  v_allocation_id bigint;
  v_user_id uuid := (select auth.uid());
begin
  if p_status not in ('reserved', 'used') then
    raise exception 'invalid_number_allocation_status' using errcode = '22023';
  end if;

  select series.*
  into v_series
  from erp_private.number_series series
  where series.series_key = upper(btrim(p_series_key))
    and series.is_active;

  if not found then
    raise exception 'number_series_not_found:%', p_series_key using errcode = 'P0002';
  end if;

  v_period_key := erp_private.series_period_key(
    v_series.reset_policy,
    p_effective_date
  );

  insert into erp_private.number_series_counters (
    series_id,
    period_key,
    last_value
  )
  values (v_series.id, v_period_key, 1)
  on conflict on constraint number_series_counters_pkey do update
  set
    last_value = erp_private.number_series_counters.last_value + 1,
    updated_at = now()
  returning erp_private.number_series_counters.last_value
  into v_sequence_value;

  v_number := erp_private.format_business_number(
    v_series.prefix,
    v_series.reset_policy,
    v_period_key,
    v_series.padding,
    v_sequence_value
  );

  insert into erp_private.number_allocations (
    series_id,
    period_key,
    sequence_value,
    formatted_number,
    status,
    reserved_by,
    reserved_at,
    used_at,
    entity_type,
    entity_id
  )
  values (
    v_series.id,
    v_period_key,
    v_sequence_value,
    v_number,
    p_status,
    v_user_id,
    case when p_status = 'reserved' then now() end,
    case when p_status = 'used' then now() end,
    nullif(btrim(p_entity_type), ''),
    p_entity_id
  )
  returning erp_private.number_allocations.id into v_allocation_id;

  return query
  select v_allocation_id, v_number, v_sequence_value, v_period_key;
end;
$$;

revoke all on function erp_private.allocate_business_number(
  text,
  date,
  text,
  text,
  text
) from public, anon, authenticated;
