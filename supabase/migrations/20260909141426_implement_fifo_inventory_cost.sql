-- FIFO valuation keeps each receipt as a cost layer and consumes the oldest
-- available layer first. The former moving-average table is intentionally kept
-- during the transition, but is no longer used by the stock valuation RPC.

alter table public.inventory_receipt_costs
  add column if not exists remaining_qty numeric(18, 4);

-- Reconstruct open FIFO layers from the current physical balance. Under FIFO,
-- the newest receipts are the layers that remain after historical consumption.
with layers as (
  select
    cost.inventory_transaction_id,
    cost.received_qty,
    greatest(coalesce(balance.on_hand_qty, 0), 0) as on_hand_qty,
    coalesce(sum(cost.received_qty) over (
      partition by cost.item_master_id, cost.warehouse_id
      order by cost.created_at desc, cost.inventory_transaction_id desc
      rows between unbounded preceding and 1 preceding
    ), 0) as newer_received_qty
  from public.inventory_receipt_costs cost
  left join public.item_inventory_balances balance
    on balance.item_master_id = cost.item_master_id
   and balance.warehouse_id = cost.warehouse_id
)
update public.inventory_receipt_costs cost
set remaining_qty = least(
  layer.received_qty,
  greatest(layer.on_hand_qty - layer.newer_received_qty, 0)
)
from layers layer
where layer.inventory_transaction_id = cost.inventory_transaction_id
  and cost.remaining_qty is null;

alter table public.inventory_receipt_costs
  alter column remaining_qty set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_receipt_costs_remaining_qty_check'
      and conrelid = 'public.inventory_receipt_costs'::regclass
  ) then
    alter table public.inventory_receipt_costs
      add constraint inventory_receipt_costs_remaining_qty_check
      check (remaining_qty >= 0 and remaining_qty <= received_qty);
  end if;
end $$;

create index if not exists inventory_receipt_costs_fifo_idx
  on public.inventory_receipt_costs (
    item_master_id, warehouse_id, created_at, inventory_transaction_id
  )
  where remaining_qty > 0;

create table if not exists public.inventory_issue_cost_allocations (
  inventory_transaction_id bigint not null
    references public.inventory_transactions(id) on delete restrict,
  receipt_cost_transaction_id bigint not null
    references public.inventory_receipt_costs(inventory_transaction_id) on delete restrict,
  quantity numeric(18, 4) not null check (quantity > 0),
  unit_cost numeric(18, 4) not null check (unit_cost >= 0),
  cost_amount numeric(18, 2) generated always as (round(quantity * unit_cost, 2)) stored,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (inventory_transaction_id, receipt_cost_transaction_id)
);

create index if not exists inventory_issue_cost_allocations_receipt_idx
  on public.inventory_issue_cost_allocations (receipt_cost_transaction_id);

alter table public.inventory_issue_cost_allocations enable row level security;

drop policy if exists "Cost viewers can read FIFO issue allocations"
  on public.inventory_issue_cost_allocations;
create policy "Cost viewers can read FIFO issue allocations"
on public.inventory_issue_cost_allocations for select to authenticated
using ((select public.authorize('inventory_cost.view')));

grant select on public.inventory_issue_cost_allocations to authenticated;
revoke insert, update, delete on public.inventory_issue_cost_allocations from authenticated;

-- Keep the existing receipt trigger, but stop maintaining moving-average cost.
create or replace function public.sync_raw_material_inventory_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form_template text;
  v_gr_item_id bigint;
  v_unit_cost numeric(18, 4);
begin
  if new.item_master_id is null or new.warehouse_id is null then return new; end if;

  select item_type.form_template into v_form_template
  from public.item_master item
  join public.item_types item_type on item_type.id = item.item_type_id
  where item.id = new.item_master_id;

  if v_form_template <> 'raw_material'
    or new.transaction_type <> 'receipt'
    or new.reference_doc_type <> 'goods_receipt'
    or new.quantity_change <= 0 then
    return new;
  end if;

  select coalesce(lot.goods_receipt_item_id, receipt_item.id)
  into v_gr_item_id
  from public.goods_receipts receipt
  join public.goods_receipt_items receipt_item
    on receipt_item.goods_receipt_id = receipt.id
   and receipt_item.item_master_id = new.item_master_id
   and receipt_item.warehouse_id = new.warehouse_id
  left join public.inventory_lots lot
    on lot.id = new.lot_id and lot.goods_receipt_item_id = receipt_item.id
  where receipt.gr_number = new.reference_doc_number
    and (new.lot_id is null or lot.id is not null)
  order by receipt_item.id desc
  limit 1;

  select round(greatest(
    (po_item.quantity * po_item.unit_price - coalesce(po_item.discount_amount, 0))
    / nullif(po_item.quantity, 0), 0
  ), 4)
  into v_unit_cost
  from public.goods_receipt_items receipt_item
  join public.purchase_order_items po_item
    on po_item.id = receipt_item.purchase_order_item_id
  where receipt_item.id = v_gr_item_id;

  if v_gr_item_id is not null and v_unit_cost is not null then
    insert into public.inventory_receipt_costs (
      inventory_transaction_id, goods_receipt_item_id, inventory_lot_id,
      item_master_id, warehouse_id, received_qty, remaining_qty, unit_cost, created_at
    ) values (
      new.id, v_gr_item_id, new.lot_id, new.item_master_id, new.warehouse_id,
      new.quantity_change, new.quantity_change, v_unit_cost, new.created_at
    ) on conflict (inventory_transaction_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_raw_material_inventory_cost() from public, anon, authenticated;

create or replace function public.consume_raw_material_fifo_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form_template text;
  v_required_qty numeric(18, 4);
  v_take_qty numeric(18, 4);
  v_layer record;
begin
  if new.item_master_id is null or new.warehouse_id is null
    or new.transaction_type <> 'issue' or new.quantity_change >= 0 then
    return new;
  end if;

  select item_type.form_template into v_form_template
  from public.item_master item
  join public.item_types item_type on item_type.id = item.item_type_id
  where item.id = new.item_master_id;

  if v_form_template <> 'raw_material' then return new; end if;

  v_required_qty := abs(new.quantity_change);

  for v_layer in
    select cost.inventory_transaction_id, cost.remaining_qty, cost.unit_cost
    from public.inventory_receipt_costs cost
    where cost.item_master_id = new.item_master_id
      and cost.warehouse_id = new.warehouse_id
      and cost.remaining_qty > 0
      and (new.lot_id is null or cost.inventory_lot_id = new.lot_id)
    order by cost.created_at, cost.inventory_transaction_id
    for update
  loop
    exit when v_required_qty = 0;
    v_take_qty := least(v_required_qty, v_layer.remaining_qty);

    update public.inventory_receipt_costs
    set remaining_qty = remaining_qty - v_take_qty
    where inventory_transaction_id = v_layer.inventory_transaction_id;

    insert into public.inventory_issue_cost_allocations (
      inventory_transaction_id, receipt_cost_transaction_id, quantity, unit_cost
    ) values (
      new.id, v_layer.inventory_transaction_id, v_take_qty, v_layer.unit_cost
    );

    v_required_qty := v_required_qty - v_take_qty;
  end loop;

  if v_required_qty > 0 then
    raise exception 'insufficient_fifo_cost_layers' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.consume_raw_material_fifo_cost() from public, anon, authenticated;

drop trigger if exists z_consume_raw_material_fifo_cost on public.inventory_transactions;
create trigger z_consume_raw_material_fifo_cost
after insert on public.inventory_transactions
for each row execute function public.consume_raw_material_fifo_cost();

create or replace function public.get_central_inventory_stock(
  p_search text default null,
  p_item_type_id bigint default null,
  p_warehouse_id bigint default null,
  p_tracking_method text default null,
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
  v_can_view_cost boolean := public.authorize('inventory_cost.view');
  v_can_export_cost boolean := public.authorize('inventory_cost.export');
begin
  if not (public.authorize('inventory.view') or public.authorize('inventory.create_gr')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_state is not null and p_state not in ('available', 'low_stock', 'out_of_stock', 'stale') then
    raise exception 'invalid_stock_state' using errcode = '22023';
  end if;
  if p_tracking_method is not null and p_tracking_method not in ('none', 'lot', 'serial') then
    raise exception 'invalid_tracking_method' using errcode = '22023';
  end if;

  with fifo_costs as materialized (
    select cost.item_master_id, cost.warehouse_id,
      round(sum(cost.remaining_qty * cost.unit_cost), 2) as inventory_value
    from public.inventory_receipt_costs cost
    where v_can_view_cost and cost.remaining_qty > 0
    group by cost.item_master_id, cost.warehouse_id
  ), base as materialized (
    select
      master.id as item_id, master.item_code, master.item_name,
      coalesce(master.item_name_en, '') as item_name_en,
      coalesce(master.description, '') as description,
      master.reorder_point, master.tracking_method, master.attributes,
      item_type.id as item_type_id, item_type.type_code, item_type.type_name,
      item_type.form_template, item_type.expiry_controlled,
      item_type.is_purchasable, item_type.form_field_config,
      balance.warehouse_id, warehouse.warehouse_name,
      balance.on_hand_qty, balance.allocated_qty, balance.available_qty, balance.updated_at,
      coalesce(unit.unit_name, '') as unit_name, coalesce(unit.symbol, '') as unit_symbol,
      case when v_can_view_cost then fifo.inventory_value else null end as inventory_value,
      case
        when balance.available_qty <= 0 then 'out_of_stock'
        when coalesce(master.reorder_point, 0) > 0 and balance.available_qty <= master.reorder_point then 'low_stock'
        when balance.updated_at < timezone('utc', now()) - interval '90 days' then 'stale'
        else 'available'
      end as stock_state
    from public.item_inventory_balances balance
    join public.item_master master on master.id = balance.item_master_id
    join public.item_types item_type on item_type.id = master.item_type_id
    join public.raw_material_warehouses warehouse on warehouse.id = balance.warehouse_id
    left join public.raw_material_units unit on unit.id = master.unit_id
    left join fifo_costs fifo
      on fifo.item_master_id = master.id and fifo.warehouse_id = balance.warehouse_id
    where master.status = 'active' and item_type.status = 'active' and item_type.is_stocked = true
      and (p_item_type_id is null or item_type.id = p_item_type_id)
      and (p_warehouse_id is null or balance.warehouse_id = p_warehouse_id)
      and (p_tracking_method is null or master.tracking_method = p_tracking_method)
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
    select * from filtered order by item_code, warehouse_name, item_id
    limit least(greatest(coalesce(p_limit, 25), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'canViewCost', v_can_view_cost,
    'canExportCost', v_can_export_cost,
    'summary', jsonb_build_object(
      'total', (select count(*) from base),
      'available', (select count(*) from base where stock_state = 'available'),
      'reserved', (select count(*) from base where allocated_qty > 0),
      'lowStock', (select count(*) from base where stock_state = 'low_stock'),
      'stale', (select count(*) from base where stock_state = 'stale'),
      'inventoryValue', case when v_can_view_cost then (select coalesce(sum(inventory_value), 0) from base) else null end,
      'rawMaterialValue', case when v_can_view_cost then (select coalesce(sum(inventory_value), 0) from base where form_template = 'raw_material') else null end
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_central_inventory_stock(text, bigint, bigint, text, text, integer, integer)
  from public, anon;
grant execute on function public.get_central_inventory_stock(text, bigint, bigint, text, text, integer, integer)
  to authenticated;
