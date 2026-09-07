create schema if not exists erp_private;

revoke all on schema erp_private from public, anon, authenticated;

create table if not exists erp_private.number_series (
  id bigint generated always as identity primary key,
  series_key text not null,
  prefix text not null,
  padding smallint not null,
  reset_policy text not null default 'none',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint number_series_key_unique unique (series_key),
  constraint number_series_key_format check (series_key ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  constraint number_series_prefix_format check (prefix ~ '^[A-Z][A-Z0-9-]{0,15}$'),
  constraint number_series_padding_check check (padding between 1 and 12),
  constraint number_series_reset_policy_check check (
    reset_policy in ('none', 'yearly', 'monthly')
  )
);

create table if not exists erp_private.number_series_counters (
  series_id bigint not null
    references erp_private.number_series (id) on delete cascade,
  period_key text not null,
  last_value bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (series_id, period_key),
  constraint number_series_counter_period_check
    check (period_key ~ '^(GLOBAL|[0-9]{4}|[0-9]{6})$'),
  constraint number_series_counter_value_check check (last_value >= 0)
);

create table if not exists erp_private.number_allocations (
  id bigint generated always as identity primary key,
  series_id bigint not null
    references erp_private.number_series (id) on delete restrict,
  period_key text not null,
  sequence_value bigint not null,
  formatted_number text not null,
  status text not null,
  reserved_by uuid references auth.users (id) on delete set null,
  reserved_at timestamptz,
  used_at timestamptz,
  entity_type text,
  entity_id text,
  created_at timestamptz not null default now(),
  constraint number_allocations_status_check
    check (status in ('reserved', 'used', 'cancelled')),
  constraint number_allocations_value_check check (sequence_value > 0),
  constraint number_allocations_series_value_unique
    unique (series_id, period_key, sequence_value),
  constraint number_allocations_formatted_unique
    unique (series_id, formatted_number)
);

create unique index if not exists number_allocations_active_reservation_idx
  on erp_private.number_allocations (series_id, period_key, reserved_by)
  where status = 'reserved' and reserved_by is not null;

create index if not exists number_allocations_entity_idx
  on erp_private.number_allocations (entity_type, entity_id)
  where entity_type is not null and entity_id is not null;

create index if not exists number_allocations_created_at_brin_idx
  on erp_private.number_allocations using brin (created_at);

alter table erp_private.number_series enable row level security;
alter table erp_private.number_series_counters enable row level security;
alter table erp_private.number_allocations enable row level security;

revoke all on all tables in schema erp_private from public, anon, authenticated;
revoke all on all sequences in schema erp_private from public, anon, authenticated;

insert into erp_private.number_series (
  series_key,
  prefix,
  padding,
  reset_policy
)
values
  ('PR', 'PR', 4, 'monthly'),
  ('PO', 'PO', 4, 'monthly'),
  ('RM', 'RM', 3, 'none'),
  ('SUP', 'SUP', 3, 'none'),
  ('CUS', 'CUS', 3, 'none'),
  ('EMP', 'KRC', 3, 'none'),
  ('VG', 'VG', 3, 'none'),
  ('CT', 'CT', 3, 'none')
on conflict (series_key) do update
set
  prefix = excluded.prefix,
  padding = excluded.padding,
  reset_policy = excluded.reset_policy,
  is_active = true,
  updated_at = now();

create or replace function erp_private.series_period_key(
  p_reset_policy text,
  p_effective_date date
)
returns text
language sql
stable
set search_path = ''
as $$
  select case p_reset_policy
    when 'monthly' then to_char(coalesce(p_effective_date, current_date), 'YYYYMM')
    when 'yearly' then to_char(coalesce(p_effective_date, current_date), 'YYYY')
    else 'GLOBAL'
  end;
$$;

create or replace function erp_private.format_business_number(
  p_prefix text,
  p_reset_policy text,
  p_period_key text,
  p_padding smallint,
  p_sequence_value bigint
)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_prefix
    || case
      when p_reset_policy = 'monthly' then right(p_period_key, 4)
      when p_reset_policy = 'yearly' then right(p_period_key, 2)
      else ''
    end
    || lpad(
      p_sequence_value::text,
      greatest(p_padding::integer, length(p_sequence_value::text)),
      '0'
    );
$$;

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
  returning last_value into v_sequence_value;

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
  returning id into v_allocation_id;

  return query
  select v_allocation_id, v_number, v_sequence_value, v_period_key;
end;
$$;

create or replace function erp_private.claim_business_number(
  p_series_key text,
  p_effective_date date,
  p_provided_number text,
  p_entity_type text,
  p_entity_id text
)
returns table (
  allocation_id bigint,
  business_number text,
  sequence_value bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allocation erp_private.number_allocations%rowtype;
  v_period_key text;
  v_series erp_private.number_series%rowtype;
  v_user_id uuid := (select auth.uid());
begin
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

  select allocation.*
  into v_allocation
  from erp_private.number_allocations allocation
  where allocation.series_id = v_series.id
    and allocation.period_key = v_period_key
    and allocation.status = 'reserved'
    and allocation.reserved_by = v_user_id
    and (
      nullif(btrim(p_provided_number), '') is null
      or allocation.formatted_number = upper(btrim(p_provided_number))
    )
  order by allocation.id
  limit 1
  for update;

  if found then
    update erp_private.number_allocations allocation
    set
      status = 'used',
      used_at = now(),
      entity_type = nullif(btrim(p_entity_type), ''),
      entity_id = p_entity_id
    where allocation.id = v_allocation.id;

    return query
    select
      v_allocation.id,
      v_allocation.formatted_number,
      v_allocation.sequence_value;
    return;
  end if;

  if nullif(btrim(p_provided_number), '') is not null then
    raise exception 'invalid_or_expired_number_reservation'
      using errcode = '22023';
  end if;

  return query
  select
    allocated.allocation_id,
    allocated.business_number,
    allocated.sequence_value
  from erp_private.allocate_business_number(
    v_series.series_key,
    p_effective_date,
    'used',
    p_entity_type,
    p_entity_id
  ) allocated;
end;
$$;

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

revoke all on function public.reserve_business_number(text, date) from public, anon;
grant execute on function public.reserve_business_number(text, date) to authenticated;

insert into erp_private.number_series_counters (
  series_id,
  period_key,
  last_value
)
select
  series.id,
  to_char(requisition.document_date, 'YYYYMM'),
  max(right(regexp_replace(requisition.pr_number, '[^0-9]', '', 'g'), 4)::bigint)
from public.purchase_requisitions requisition
join erp_private.number_series series on series.series_key = 'PR'
where requisition.pr_number ~ '[0-9]{4}$'
group by series.id, to_char(requisition.document_date, 'YYYYMM')
on conflict (series_id, period_key) do update
set last_value = greatest(
  erp_private.number_series_counters.last_value,
  excluded.last_value
);

insert into erp_private.number_series_counters (
  series_id,
  period_key,
  last_value
)
select
  series.id,
  to_char(purchase_order.document_date, 'YYYYMM'),
  max(right(regexp_replace(purchase_order.po_number, '[^0-9]', '', 'g'), 4)::bigint)
from public.purchase_orders purchase_order
join erp_private.number_series series on series.series_key = 'PO'
where purchase_order.po_number ~ '[0-9]{4}$'
group by series.id, to_char(purchase_order.document_date, 'YYYYMM')
on conflict (series_id, period_key) do update
set last_value = greatest(
  erp_private.number_series_counters.last_value,
  excluded.last_value
);

insert into erp_private.number_series_counters (
  series_id,
  period_key,
  last_value
)
select series.id, 'GLOBAL', coalesce(max(code_value), 0)
from erp_private.number_series series
cross join lateral (
  select substring(upper(material.material_code) from '^RM([0-9]+)$')::bigint
    as code_value
  from public.raw_materials material
  where upper(material.material_code) ~ '^RM[0-9]+$'
) existing
where series.series_key = 'RM'
group by series.id
on conflict (series_id, period_key) do update
set last_value = greatest(
  erp_private.number_series_counters.last_value,
  excluded.last_value
);

insert into erp_private.number_series_counters (
  series_id,
  period_key,
  last_value
)
select series.id, 'GLOBAL', coalesce(max(code_value), 0)
from erp_private.number_series series
cross join lateral (
  select substring(upper(vendor.vendor_code) from '^SUP([0-9]+)$')::bigint
    as code_value
  from public.vendors vendor
  where upper(vendor.vendor_code) ~ '^SUP[0-9]+$'
) existing
where series.series_key = 'SUP'
group by series.id
on conflict (series_id, period_key) do update
set last_value = greatest(
  erp_private.number_series_counters.last_value,
  excluded.last_value
);

insert into erp_private.number_series_counters (
  series_id,
  period_key,
  last_value
)
select series.id, 'GLOBAL', coalesce(max(code_value), 0)
from erp_private.number_series series
cross join lateral (
  select substring(upper(customer.customer_code) from '^CUS([0-9]+)$')::bigint
    as code_value
  from public.customers customer
  where upper(customer.customer_code) ~ '^CUS[0-9]+$'
) existing
where series.series_key = 'CUS'
group by series.id
on conflict (series_id, period_key) do update
set last_value = greatest(
  erp_private.number_series_counters.last_value,
  excluded.last_value
);

insert into erp_private.number_series_counters (
  series_id,
  period_key,
  last_value
)
select series.id, 'GLOBAL', coalesce(max(profile.employee_number), 0)
from erp_private.number_series series
cross join public.user_profiles profile
where series.series_key = 'EMP'
group by series.id
on conflict (series_id, period_key) do update
set last_value = greatest(
  erp_private.number_series_counters.last_value,
  excluded.last_value
);

insert into erp_private.number_series_counters (
  series_id,
  period_key,
  last_value
)
select series.id, 'GLOBAL', coalesce(max(code_value), 0)
from erp_private.number_series series
cross join lateral (
  select substring(upper(vendor_group.code) from '^VG([0-9]+)$')::bigint
    as code_value
  from public.vendor_groups vendor_group
  where upper(vendor_group.code) ~ '^VG[0-9]+$'
) existing
where series.series_key = 'VG'
group by series.id
on conflict (series_id, period_key) do update
set last_value = greatest(
  erp_private.number_series_counters.last_value,
  excluded.last_value
);

insert into erp_private.number_series_counters (
  series_id,
  period_key,
  last_value
)
select series.id, 'GLOBAL', coalesce(max(code_value), 0)
from erp_private.number_series series
cross join lateral (
  select substring(upper(customer_type.code) from '^CT([0-9]+)$')::bigint
    as code_value
  from public.partner_customer_types customer_type
  where upper(customer_type.code) ~ '^CT[0-9]+$'
) existing
where series.series_key = 'CT'
group by series.id
on conflict (series_id, period_key) do update
set last_value = greatest(
  erp_private.number_series_counters.last_value,
  excluded.last_value
);

create or replace function erp_private.set_purchase_requisition_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
begin
  select claimed.business_number
  into v_number
  from erp_private.claim_business_number(
    'PR',
    coalesce(new.document_date, current_date),
    new.pr_number,
    'purchase_requisition',
    new.id::text
  ) claimed;
  new.pr_number := v_number;
  return new;
end;
$$;

create or replace function erp_private.set_purchase_order_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
begin
  select claimed.business_number
  into v_number
  from erp_private.claim_business_number(
    'PO',
    coalesce(new.document_date, current_date),
    new.po_number,
    'purchase_order',
    new.id::text
  ) claimed;
  new.po_number := v_number;
  return new;
end;
$$;

create or replace function erp_private.set_raw_material_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
begin
  select claimed.business_number
  into v_number
  from erp_private.claim_business_number(
    'RM',
    current_date,
    new.material_code,
    'raw_material',
    new.id::text
  ) claimed;
  new.material_code := v_number;
  return new;
end;
$$;

create or replace function erp_private.set_vendor_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.vendor_code is null or btrim(new.vendor_code) = '' then
    select claimed.business_number
    into new.vendor_code
    from erp_private.claim_business_number(
      'SUP',
      current_date,
      null,
      'vendor',
      new.id::text
    ) claimed;
  end if;
  return new;
end;
$$;

create or replace function erp_private.set_customer_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_code is null or btrim(new.customer_code) = '' then
    select claimed.business_number
    into new.customer_code
    from erp_private.claim_business_number(
      'CUS',
      current_date,
      null,
      'customer',
      new.id::text
    ) claimed;
  end if;
  return new;
end;
$$;

create or replace function erp_private.set_vendor_group_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    select claimed.business_number
    into new.code
    from erp_private.claim_business_number(
      'VG',
      current_date,
      null,
      'vendor_group',
      new.id::text
    ) claimed;
  end if;
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
  if new.code is null or btrim(new.code) = '' then
    select claimed.business_number
    into new.code
    from erp_private.claim_business_number(
      'CT',
      current_date,
      null,
      'customer_type',
      new.id::text
    ) claimed;
  end if;
  return new;
end;
$$;

create or replace function erp_private.set_employee_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.employee_number is null then
    select claimed.sequence_value
    into new.employee_number
    from erp_private.claim_business_number(
      'EMP',
      current_date,
      null,
      'user_profile',
      new.id::text
    ) claimed;
  end if;
  return new;
end;
$$;

drop trigger if exists set_purchase_requisition_number_before_insert
  on public.purchase_requisitions;
create trigger set_purchase_requisition_number_before_insert
before insert on public.purchase_requisitions
for each row execute function erp_private.set_purchase_requisition_number();

drop trigger if exists purchase_orders_set_number on public.purchase_orders;
create trigger purchase_orders_set_number
before insert on public.purchase_orders
for each row execute function erp_private.set_purchase_order_number();

drop trigger if exists assign_raw_material_code_before_insert
  on public.raw_materials;
create trigger assign_raw_material_code_before_insert
before insert on public.raw_materials
for each row execute function erp_private.set_raw_material_code();

drop trigger if exists set_vendor_code_before_insert on public.vendors;
create trigger set_vendor_code_before_insert
before insert on public.vendors
for each row execute function erp_private.set_vendor_code();

drop trigger if exists set_customer_code_before_insert on public.customers;
create trigger set_customer_code_before_insert
before insert on public.customers
for each row execute function erp_private.set_customer_code();

drop trigger if exists set_vendor_group_code_before_insert
  on public.vendor_groups;
create trigger set_vendor_group_code_before_insert
before insert on public.vendor_groups
for each row execute function erp_private.set_vendor_group_code();

drop trigger if exists set_customer_type_code_before_insert
  on public.partner_customer_types;
create trigger set_customer_type_code_before_insert
before insert on public.partner_customer_types
for each row execute function erp_private.set_customer_type_code();

alter table public.user_profiles
  alter column employee_number drop default;

drop trigger if exists set_employee_number_before_insert
  on public.user_profiles;
create trigger set_employee_number_before_insert
before insert on public.user_profiles
for each row execute function erp_private.set_employee_number();

create or replace function public.reserve_raw_material_code()
returns text
language sql
security definer
set search_path = ''
as $$
  select reservation.business_number
  from public.reserve_business_number('RM', current_date) reservation;
$$;

revoke all on function public.reserve_raw_material_code() from public, anon;
grant execute on function public.reserve_raw_material_code() to authenticated;

drop function if exists public.set_purchase_requisition_number();
drop function if exists public.set_purchase_order_number();
drop function if exists public.assign_raw_material_code();
drop function if exists public.set_vendor_code();
drop function if exists public.generate_vendor_code();
drop function if exists public.set_customer_code();
drop function if exists public.generate_customer_code();

drop sequence if exists public.purchase_requisition_number_seq;
drop sequence if exists public.purchase_order_number_seq;
drop sequence if exists public.raw_material_code_seq;
drop sequence if exists public.vendor_code_seq;
drop sequence if exists public.customer_code_seq;
drop sequence if exists public.employee_number_seq;

revoke all on all functions in schema erp_private from public, anon, authenticated;

notify pgrst, 'reload schema';
