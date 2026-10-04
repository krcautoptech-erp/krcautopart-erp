-- Cost access is deliberately separate from operational stock access.
alter table public.app_permissions drop constraint if exists app_permissions_action_check;
alter table public.app_permissions drop constraint if exists app_permissions_action_code_check;
alter table public.app_permissions add constraint app_permissions_action_code_check
check (action_code in (
  'view', 'create', 'edit', 'delete', 'deactivate',
  'cancel', 'approve', 'reject', 'manage', 'export'
));

insert into public.app_permissions (
  permission_code, permission_name, module_code, module_name, action_code,
  module_sort_order, sort_order, status
) values
  ('inventory_cost.view', 'ดูต้นทุนสินค้าคงคลัง', 'inventory_cost', 'ต้นทุนสินค้าคงคลัง', 'view', 61, 10, 'active'),
  ('inventory_cost.export', 'ส่งออกต้นทุนสินค้าคงคลัง', 'inventory_cost', 'ต้นทุนสินค้าคงคลัง', 'export', 61, 20, 'active')
on conflict (permission_code) do update set
  permission_name = excluded.permission_name,
  module_code = excluded.module_code,
  module_name = excluded.module_name,
  action_code = excluded.action_code,
  module_sort_order = excluded.module_sort_order,
  sort_order = excluded.sort_order,
  status = excluded.status;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
cross join public.app_permissions permission
where role.is_owner = true
  and permission.permission_code in ('inventory_cost.view', 'inventory_cost.export')
on conflict (role_id, permission_id) do nothing;

create table public.inventory_cost_balances (
  item_master_id bigint not null references public.item_master(id) on delete restrict,
  warehouse_id bigint not null references public.raw_material_warehouses(id) on delete restrict,
  average_unit_cost numeric(18, 4) not null default 0 check (average_unit_cost >= 0),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (item_master_id, warehouse_id)
);

create table public.inventory_receipt_costs (
  inventory_transaction_id bigint primary key references public.inventory_transactions(id) on delete restrict,
  goods_receipt_item_id bigint not null references public.goods_receipt_items(id) on delete restrict,
  inventory_lot_id bigint references public.inventory_lots(id) on delete restrict,
  item_master_id bigint not null references public.item_master(id) on delete restrict,
  warehouse_id bigint not null references public.raw_material_warehouses(id) on delete restrict,
  received_qty numeric(18, 4) not null check (received_qty > 0),
  unit_cost numeric(18, 4) not null check (unit_cost >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index inventory_receipt_costs_item_warehouse_idx
  on public.inventory_receipt_costs (item_master_id, warehouse_id, created_at desc);
create index inventory_receipt_costs_lot_idx
  on public.inventory_receipt_costs (inventory_lot_id)
  where inventory_lot_id is not null;

alter table public.inventory_cost_balances enable row level security;
alter table public.inventory_receipt_costs enable row level security;

create policy "Cost viewers can read average inventory costs"
on public.inventory_cost_balances for select to authenticated
using ((select public.authorize('inventory_cost.view')));

create policy "Cost viewers can read receipt costs"
on public.inventory_receipt_costs for select to authenticated
using ((select public.authorize('inventory_cost.view')));

grant select on public.inventory_cost_balances, public.inventory_receipt_costs to authenticated;
revoke insert, update, delete on public.inventory_cost_balances, public.inventory_receipt_costs from authenticated;

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
  v_post_qty numeric(18, 4);
  v_old_qty numeric(18, 4);
  v_old_average numeric(18, 4);
  v_new_average numeric(18, 4);
begin
  if new.item_master_id is null or new.warehouse_id is null then return new; end if;

  select item_type.form_template into v_form_template
  from public.item_master item
  join public.item_types item_type on item_type.id = item.item_type_id
  where item.id = new.item_master_id;

  if v_form_template <> 'raw_material' then return new; end if;

  if new.transaction_type = 'receipt'
    and new.reference_doc_type = 'goods_receipt'
    and new.quantity_change > 0 then
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
    join public.purchase_order_items po_item on po_item.id = receipt_item.purchase_order_item_id
    where receipt_item.id = v_gr_item_id;

    if v_gr_item_id is not null and v_unit_cost is not null then
      insert into public.inventory_receipt_costs (
        inventory_transaction_id, goods_receipt_item_id, inventory_lot_id,
        item_master_id, warehouse_id, received_qty, unit_cost, created_at
      ) values (
        new.id, v_gr_item_id, new.lot_id, new.item_master_id, new.warehouse_id,
        new.quantity_change, v_unit_cost, new.created_at
      ) on conflict (inventory_transaction_id) do nothing;

      select coalesce(balance.on_hand_qty, new.quantity_change)
      into v_post_qty
      from public.item_inventory_balances balance
      where balance.item_master_id = new.item_master_id
        and balance.warehouse_id = new.warehouse_id;
      v_old_qty := greatest(coalesce(v_post_qty, new.quantity_change) - new.quantity_change, 0);

      select coalesce(cost.average_unit_cost, 0) into v_old_average
      from public.inventory_cost_balances cost
      where cost.item_master_id = new.item_master_id and cost.warehouse_id = new.warehouse_id;
      v_old_average := coalesce(v_old_average, 0);
      v_new_average := round(
        ((v_old_qty * v_old_average) + (new.quantity_change * v_unit_cost))
        / nullif(v_old_qty + new.quantity_change, 0), 4
      );

      insert into public.inventory_cost_balances (item_master_id, warehouse_id, average_unit_cost, updated_at)
      values (new.item_master_id, new.warehouse_id, v_new_average, timezone('utc', now()))
      on conflict (item_master_id, warehouse_id) do update
      set average_unit_cost = excluded.average_unit_cost, updated_at = excluded.updated_at;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_raw_material_inventory_cost() from public, anon, authenticated;
drop trigger if exists z_sync_raw_material_inventory_cost on public.inventory_transactions;
create trigger z_sync_raw_material_inventory_cost
after insert on public.inventory_transactions
for each row execute function public.sync_raw_material_inventory_cost();

-- Rebuild historical receipt layers and moving averages in transaction order.
do $$
declare
  tx record;
  v_gr_item_id bigint;
  v_unit_cost numeric(18, 4);
  v_old_qty numeric(18, 4);
  v_old_average numeric(18, 4);
  v_new_qty numeric(18, 4);
begin
  create temporary table cost_replay (
    item_master_id bigint,
    warehouse_id bigint,
    running_qty numeric(18, 4) not null default 0,
    average_unit_cost numeric(18, 4) not null default 0,
    primary key (item_master_id, warehouse_id)
  ) on commit drop;

  for tx in
    select tx_row.*
    from public.inventory_transactions tx_row
    join public.item_master item on item.id = tx_row.item_master_id
    join public.item_types item_type on item_type.id = item.item_type_id
    where item_type.form_template = 'raw_material'
      and tx_row.item_master_id is not null
      and tx_row.warehouse_id is not null
    order by tx_row.created_at, tx_row.id
  loop
    insert into cost_replay (item_master_id, warehouse_id)
    values (tx.item_master_id, tx.warehouse_id)
    on conflict do nothing;

    select running_qty, average_unit_cost into v_old_qty, v_old_average
    from cost_replay where item_master_id = tx.item_master_id and warehouse_id = tx.warehouse_id;
    v_new_qty := greatest(v_old_qty + tx.quantity_change, 0);

    if tx.transaction_type = 'receipt' and tx.reference_doc_type = 'goods_receipt' and tx.quantity_change > 0 then
      select coalesce(lot.goods_receipt_item_id, receipt_item.id)
      into v_gr_item_id
      from public.goods_receipts receipt
      join public.goods_receipt_items receipt_item on receipt_item.goods_receipt_id = receipt.id
        and receipt_item.item_master_id = tx.item_master_id and receipt_item.warehouse_id = tx.warehouse_id
      left join public.inventory_lots lot on lot.id = tx.lot_id and lot.goods_receipt_item_id = receipt_item.id
      where receipt.gr_number = tx.reference_doc_number and (tx.lot_id is null or lot.id is not null)
      order by receipt_item.id desc limit 1;

      select round(greatest((po_item.quantity * po_item.unit_price - coalesce(po_item.discount_amount, 0)) / nullif(po_item.quantity, 0), 0), 4)
      into v_unit_cost
      from public.goods_receipt_items receipt_item
      join public.purchase_order_items po_item on po_item.id = receipt_item.purchase_order_item_id
      where receipt_item.id = v_gr_item_id;

      if v_gr_item_id is not null and v_unit_cost is not null then
        insert into public.inventory_receipt_costs (
          inventory_transaction_id, goods_receipt_item_id, inventory_lot_id,
          item_master_id, warehouse_id, received_qty, unit_cost, created_at
        ) values (tx.id, v_gr_item_id, tx.lot_id, tx.item_master_id, tx.warehouse_id, tx.quantity_change, v_unit_cost, tx.created_at)
        on conflict (inventory_transaction_id) do nothing;
        v_old_average := round(((greatest(v_old_qty, 0) * v_old_average) + (tx.quantity_change * v_unit_cost)) / nullif(greatest(v_old_qty, 0) + tx.quantity_change, 0), 4);
      end if;
    elsif v_new_qty = 0 then
      v_old_average := 0;
    end if;

    update cost_replay set running_qty = v_new_qty, average_unit_cost = v_old_average
    where item_master_id = tx.item_master_id and warehouse_id = tx.warehouse_id;
  end loop;

  insert into public.inventory_cost_balances (item_master_id, warehouse_id, average_unit_cost, updated_at)
  select item_master_id, warehouse_id, average_unit_cost, timezone('utc', now()) from cost_replay
  on conflict (item_master_id, warehouse_id) do update
  set average_unit_cost = excluded.average_unit_cost, updated_at = excluded.updated_at;
end;
$$;

drop function if exists public.get_central_inventory_stock(text, bigint, bigint, text, integer, integer);

create function public.get_central_inventory_stock(
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

  with base as materialized (
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
      case when v_can_view_cost then cost.average_unit_cost else null end as average_unit_cost,
      case when v_can_view_cost then round(balance.on_hand_qty * coalesce(cost.average_unit_cost, 0), 2) else null end as inventory_value,
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
    left join public.inventory_cost_balances cost
      on v_can_view_cost and cost.item_master_id = master.id and cost.warehouse_id = balance.warehouse_id
    where master.status = 'active' and item_type.status = 'active' and item_type.is_stocked = true
      and (p_item_type_id is null or item_type.id = p_item_type_id)
      and (p_warehouse_id is null or balance.warehouse_id = p_warehouse_id)
      and (p_tracking_method is null or master.tracking_method = p_tracking_method)
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or master.item_code ilike '%' || btrim(p_search) || '%'
        or master.item_name ilike '%' || btrim(p_search) || '%'
        or coalesce(master.item_name_en, '') ilike '%' || btrim(p_search) || '%'
        or exists (select 1 from public.inventory_lots lot where lot.item_master_id = master.id and (lot.lot_number ilike '%' || btrim(p_search) || '%' or coalesce(lot.vendor_lot_no, '') ilike '%' || btrim(p_search) || '%'))
        or exists (select 1 from public.inventory_serials serial where serial.item_master_id = master.id and serial.serial_number ilike '%' || btrim(p_search) || '%')
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

revoke all on function public.get_central_inventory_stock(text, bigint, bigint, text, text, integer, integer) from public, anon;
grant execute on function public.get_central_inventory_stock(text, bigint, bigint, text, text, integer, integer) to authenticated;
