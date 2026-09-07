-- Unified, server-paginated stock workbench for every stocked item type.
create index if not exists item_types_active_stocked_idx
  on public.item_types (sort_order, id)
  where status = 'active' and is_stocked = true;

create index if not exists item_inventory_balances_updated_idx
  on public.item_inventory_balances (updated_at desc, item_master_id, warehouse_id);

create or replace function public.get_central_inventory_stock(
  p_search text default null,
  p_item_type_id bigint default null,
  p_warehouse_id bigint default null,
  p_state text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not (public.authorize('inventory.view') or public.authorize('inventory.create_gr')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_state is not null and p_state not in ('available', 'low_stock', 'out_of_stock', 'stale') then
    raise exception 'invalid_stock_state' using errcode = '22023';
  end if;

  with base as materialized (
    select
      master.id as item_id,
      master.item_code,
      master.item_name,
      coalesce(master.item_name_en, '') as item_name_en,
      coalesce(master.description, '') as description,
      master.reorder_point,
      master.tracking_method,
      master.attributes,
      item_type.id as item_type_id,
      item_type.type_code,
      item_type.type_name,
      item_type.expiry_controlled,
      item_type.is_purchasable,
      item_type.form_field_config,
      balance.warehouse_id,
      warehouse.warehouse_name,
      balance.on_hand_qty,
      balance.allocated_qty,
      balance.available_qty,
      balance.updated_at,
      coalesce(unit.unit_name, '') as unit_name,
      coalesce(unit.symbol, '') as unit_symbol,
      case
        when balance.available_qty <= 0 then 'out_of_stock'
        when coalesce(master.reorder_point, 0) > 0
          and balance.available_qty <= master.reorder_point then 'low_stock'
        when balance.updated_at < timezone('utc', now()) - interval '90 days' then 'stale'
        else 'available'
      end as stock_state
    from public.item_inventory_balances balance
    join public.item_master master on master.id = balance.item_master_id
    join public.item_types item_type on item_type.id = master.item_type_id
    join public.raw_material_warehouses warehouse on warehouse.id = balance.warehouse_id
    left join public.raw_material_units unit on unit.id = master.unit_id
    where master.status = 'active'
      and item_type.status = 'active'
      and item_type.is_stocked = true
      and (p_item_type_id is null or item_type.id = p_item_type_id)
      and (p_warehouse_id is null or balance.warehouse_id = p_warehouse_id)
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or master.item_code ilike '%' || btrim(p_search) || '%'
        or master.item_name ilike '%' || btrim(p_search) || '%'
        or coalesce(master.item_name_en, '') ilike '%' || btrim(p_search) || '%'
        or exists (
          select 1 from public.inventory_lots lot
          where lot.item_master_id = master.id
            and (lot.lot_number ilike '%' || btrim(p_search) || '%'
              or coalesce(lot.vendor_lot_no, '') ilike '%' || btrim(p_search) || '%')
        )
        or exists (
          select 1 from public.inventory_serials serial
          where serial.item_master_id = master.id
            and serial.serial_number ilike '%' || btrim(p_search) || '%'
        )
      )
  ), filtered as materialized (
    select * from base where p_state is null or stock_state = p_state
  ), page_rows as (
    select * from filtered
    order by item_code, warehouse_name, item_id
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'summary', jsonb_build_object(
      'total', (select count(*) from base),
      'available', (select count(*) from base where stock_state = 'available'),
      'reserved', (select count(*) from base where allocated_qty > 0),
      'lowStock', (select count(*) from base where stock_state = 'low_stock'),
      'stale', (select count(*) from base where stock_state = 'stale')
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_central_inventory_stock(text, bigint, bigint, text, integer, integer) from public, anon;
grant execute on function public.get_central_inventory_stock(text, bigint, bigint, text, integer, integer) to authenticated;
