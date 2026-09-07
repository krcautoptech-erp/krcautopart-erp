create or replace function erp_private.prepare_item_code_claim()
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

  new.item_code := v_reservation.item_code;
  return new;
end;
$$;

create or replace function erp_private.mark_item_code_claimed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code_mode text;
  v_user_id uuid := (select auth.uid());
begin
  select item_type.code_mode
  into v_code_mode
  from public.item_types item_type
  where item_type.id = new.item_type_id;

  if v_code_mode <> 'auto' then
    return new;
  end if;

  update erp_private.item_code_allocations allocation
  set
    status = 'used',
    used_at = now(),
    item_id = new.id
  where allocation.id = (
    select reserved_allocation.id
    from erp_private.item_code_allocations reserved_allocation
    where reserved_allocation.item_type_id = new.item_type_id
      and reserved_allocation.status = 'reserved'
      and reserved_allocation.reserved_by = v_user_id
      and reserved_allocation.item_code = upper(btrim(new.item_code))
    order by reserved_allocation.id
    limit 1
  );

  if not found then
    raise exception 'invalid_or_expired_item_code_reservation'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists item_master_claim_code_before_insert
  on public.item_master;
drop trigger if exists item_master_mark_code_claimed_after_insert
  on public.item_master;

create trigger item_master_claim_code_before_insert
before insert on public.item_master
for each row execute function erp_private.prepare_item_code_claim();

create trigger item_master_mark_code_claimed_after_insert
after insert on public.item_master
for each row execute function erp_private.mark_item_code_claimed();

revoke all on function erp_private.prepare_item_code_claim() from public, anon, authenticated;
revoke all on function erp_private.mark_item_code_claimed() from public, anon, authenticated;

notify pgrst, 'reload schema';
