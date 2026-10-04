-- Seed missing balances at zero, then apply the signed movement atomically.
-- UPDATE locks the balance row; existing CHECK constraints reject actual overdrafts.
create or replace function public.sync_inventory_balances()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_item_master_id bigint;
  v_old_item_master_id bigint;
begin
  if tg_op = 'INSERT' then
    v_new_item_master_id := new.item_master_id;
    if v_new_item_master_id is null and new.raw_material_id is not null then
      select master.id
      into v_new_item_master_id
      from public.item_master master
      where master.attributes ->> 'legacySource' = 'raw_material'
        and (master.attributes ->> 'legacySourceId')::bigint = new.raw_material_id
      limit 1;
    end if;

    if new.raw_material_id is not null then
      insert into public.inventory_balances (raw_material_id, warehouse_id, on_hand_qty, updated_at)
      values (new.raw_material_id, new.warehouse_id, 0, now())
      on conflict (raw_material_id, warehouse_id) do nothing;
      update public.inventory_balances
      set on_hand_qty = on_hand_qty + new.quantity_change, updated_at = now()
      where raw_material_id = new.raw_material_id and warehouse_id = new.warehouse_id;
    end if;

    if v_new_item_master_id is not null then
      insert into public.item_inventory_balances (item_master_id, warehouse_id, on_hand_qty, updated_at)
      values (v_new_item_master_id, new.warehouse_id, 0, now())
      on conflict (item_master_id, warehouse_id) do nothing;
      update public.item_inventory_balances
      set on_hand_qty = on_hand_qty + new.quantity_change, updated_at = now()
      where item_master_id = v_new_item_master_id and warehouse_id = new.warehouse_id;
    end if;

    return new;
  elsif tg_op = 'UPDATE' then
    v_old_item_master_id := old.item_master_id;
    if v_old_item_master_id is null and old.raw_material_id is not null then
      select master.id
      into v_old_item_master_id
      from public.item_master master
      where master.attributes ->> 'legacySource' = 'raw_material'
        and (master.attributes ->> 'legacySourceId')::bigint = old.raw_material_id
      limit 1;
    end if;

    v_new_item_master_id := new.item_master_id;
    if v_new_item_master_id is null and new.raw_material_id is not null then
      select master.id
      into v_new_item_master_id
      from public.item_master master
      where master.attributes ->> 'legacySource' = 'raw_material'
        and (master.attributes ->> 'legacySourceId')::bigint = new.raw_material_id
      limit 1;
    end if;

    if old.raw_material_id is not null then
      update public.inventory_balances
      set on_hand_qty = on_hand_qty - old.quantity_change,
          updated_at = now()
      where raw_material_id = old.raw_material_id and warehouse_id = old.warehouse_id;
    end if;

    if v_old_item_master_id is not null then
      update public.item_inventory_balances
      set on_hand_qty = on_hand_qty - old.quantity_change,
          updated_at = now()
      where item_master_id = v_old_item_master_id and warehouse_id = old.warehouse_id;
    end if;

    if new.raw_material_id is not null then
      insert into public.inventory_balances (raw_material_id, warehouse_id, on_hand_qty, updated_at)
      values (new.raw_material_id, new.warehouse_id, 0, now())
      on conflict (raw_material_id, warehouse_id) do nothing;
      update public.inventory_balances
      set on_hand_qty = on_hand_qty + new.quantity_change, updated_at = now()
      where raw_material_id = new.raw_material_id and warehouse_id = new.warehouse_id;
    end if;

    if v_new_item_master_id is not null then
      insert into public.item_inventory_balances (item_master_id, warehouse_id, on_hand_qty, updated_at)
      values (v_new_item_master_id, new.warehouse_id, 0, now())
      on conflict (item_master_id, warehouse_id) do nothing;
      update public.item_inventory_balances
      set on_hand_qty = on_hand_qty + new.quantity_change, updated_at = now()
      where item_master_id = v_new_item_master_id and warehouse_id = new.warehouse_id;
    end if;

    return new;
  elsif tg_op = 'DELETE' then
    v_old_item_master_id := old.item_master_id;
    if v_old_item_master_id is null and old.raw_material_id is not null then
      select master.id
      into v_old_item_master_id
      from public.item_master master
      where master.attributes ->> 'legacySource' = 'raw_material'
        and (master.attributes ->> 'legacySourceId')::bigint = old.raw_material_id
      limit 1;
    end if;

    if old.raw_material_id is not null then
      update public.inventory_balances
      set on_hand_qty = on_hand_qty - old.quantity_change,
          updated_at = now()
      where raw_material_id = old.raw_material_id and warehouse_id = old.warehouse_id;
    end if;

    if v_old_item_master_id is not null then
      update public.item_inventory_balances
      set on_hand_qty = on_hand_qty - old.quantity_change,
          updated_at = now()
      where item_master_id = v_old_item_master_id and warehouse_id = old.warehouse_id;
    end if;

    return old;
  end if;

  return null;
end;
$$;
