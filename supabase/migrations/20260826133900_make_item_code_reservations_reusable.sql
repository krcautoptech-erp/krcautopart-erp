create table if not exists erp_private.item_code_allocations (
  id bigint generated always as identity primary key,
  item_type_id bigint not null references public.item_types (id) on delete cascade,
  sequence_value bigint not null,
  item_code text not null unique,
  status text not null default 'reserved'
    check (status in ('reserved', 'used')),
  reserved_by uuid not null references auth.users (id) on delete cascade,
  reserved_at timestamptz not null default now(),
  used_at timestamptz,
  item_id bigint references public.item_master (id) on delete set null
);

create unique index if not exists item_code_allocations_one_open_per_user_type
  on erp_private.item_code_allocations (item_type_id, reserved_by)
  where status = 'reserved';

-- The old implementation advanced the counter whenever the modal opened.
-- Rebase it to the highest code that was actually saved so abandoned previews
-- do not permanently consume numbers.
insert into public.item_type_counters (item_type_id, last_value)
select
  item_type.id,
  coalesce(max(
    case
      when item.item_code ~ ('^' || upper(item_type.code_prefix) || '[0-9]+$')
        then substring(
          item.item_code
          from length(item_type.code_prefix) + 1
        )::bigint
      else null
    end
  ), 0)
from public.item_types item_type
left join public.item_master item
  on item.item_type_id = item_type.id
where item_type.code_mode = 'auto'
group by item_type.id
on conflict (item_type_id) do update
set
  last_value = excluded.last_value,
  updated_at = now();

create or replace function public.reserve_item_code(p_item_type_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_existing erp_private.item_code_allocations%rowtype;
  v_prefix text;
  v_user_id uuid := (select auth.uid());
  v_value bigint;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if not public.authorize('items.create') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select upper(btrim(item_type.code_prefix))
  into v_prefix
  from public.item_types item_type
  where item_type.id = p_item_type_id
    and item_type.status = 'active'
    and item_type.code_mode = 'auto';

  if not found then
    raise exception 'item_type_not_auto_numbered' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'ITEM:' || p_item_type_id::text || ':' || v_user_id::text,
      0
    )
  );

  select allocation.*
  into v_existing
  from erp_private.item_code_allocations allocation
  where allocation.item_type_id = p_item_type_id
    and allocation.status = 'reserved'
    and allocation.reserved_by = v_user_id
  order by allocation.id
  limit 1
  for update;

  if found then
    return v_existing.item_code;
  end if;

  loop
    insert into public.item_type_counters (item_type_id, last_value)
    values (p_item_type_id, 1)
    on conflict (item_type_id) do update
      set
        last_value = public.item_type_counters.last_value + 1,
        updated_at = now()
    returning last_value into v_value;

    v_code := v_prefix || lpad(v_value::text, 4, '0');

    exit when not exists (
      select 1 from public.item_master item where upper(item.item_code) = v_code
    ) and not exists (
      select 1
      from erp_private.item_code_allocations allocation
      where upper(allocation.item_code) = v_code
    );
  end loop;

  insert into erp_private.item_code_allocations (
    item_type_id,
    sequence_value,
    item_code,
    status,
    reserved_by
  )
  values (
    p_item_type_id,
    v_value,
    v_code,
    'reserved',
    v_user_id
  );

  return v_code;
end;
$$;

create or replace function erp_private.claim_item_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code_mode text;
  v_reservation erp_private.item_code_allocations%rowtype;
  v_user_id uuid := (select auth.uid());
begin
  select item_type.code_mode
  into v_code_mode
  from public.item_types item_type
  where item_type.id = new.item_type_id;

  if v_code_mode <> 'auto' then
    return new;
  end if;

  select allocation.*
  into v_reservation
  from erp_private.item_code_allocations allocation
  where allocation.item_type_id = new.item_type_id
    and allocation.status = 'reserved'
    and allocation.reserved_by = v_user_id
    and (
      nullif(btrim(new.item_code), '') is null
      or allocation.item_code = upper(btrim(new.item_code))
    )
  order by allocation.id
  limit 1
  for update;

  if not found then
    raise exception 'invalid_or_expired_item_code_reservation'
      using errcode = '22023';
  end if;

  update erp_private.item_code_allocations allocation
  set
    status = 'used',
    used_at = now(),
    item_id = new.id
  where allocation.id = v_reservation.id;

  new.item_code := v_reservation.item_code;
  return new;
end;
$$;

drop trigger if exists item_master_claim_code_before_insert
  on public.item_master;
create trigger item_master_claim_code_before_insert
before insert on public.item_master
for each row execute function erp_private.claim_item_code();

revoke all on function public.reserve_item_code(bigint) from public, anon;
grant execute on function public.reserve_item_code(bigint) to authenticated;
revoke all on function erp_private.claim_item_code() from public, anon, authenticated;

notify pgrst, 'reload schema';
