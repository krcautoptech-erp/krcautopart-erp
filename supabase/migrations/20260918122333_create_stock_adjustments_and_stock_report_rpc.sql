insert into public.app_permissions (
  permission_code, permission_name, module_code, module_name,
  action_code, module_sort_order, sort_order, status
)
values
  ('inventory_adjustment.view', 'ดูใบปรับปรุงสต็อก', 'inventory_adjustment', 'ปรับปรุงสต็อก', 'view', 62, 10, 'active'),
  ('inventory_adjustment.create', 'สร้างใบปรับปรุงสต็อก', 'inventory_adjustment', 'ปรับปรุงสต็อก', 'create', 62, 20, 'active'),
  ('inventory_adjustment.cancel', 'ยกเลิกใบปรับปรุงสต็อก', 'inventory_adjustment', 'ปรับปรุงสต็อก', 'cancel', 62, 30, 'active'),
  ('inventory_adjustment.export', 'ส่งออกใบปรับปรุงสต็อก', 'inventory_adjustment', 'ปรับปรุงสต็อก', 'export', 62, 40, 'active')
on conflict (permission_code) do update set
  permission_name = excluded.permission_name,
  module_code = excluded.module_code,
  module_name = excluded.module_name,
  action_code = excluded.action_code,
  module_sort_order = excluded.module_sort_order,
  sort_order = excluded.sort_order,
  status = 'active',
  updated_at = now();

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
join public.app_permissions permission
  on permission.permission_code like 'inventory_adjustment.%'
where role.is_owner
on conflict (role_id, permission_id) do nothing;

insert into erp_private.number_series (series_key, prefix, padding, reset_policy)
values ('AD', 'AD', 4, 'monthly')
on conflict (series_key) do update set
  prefix = excluded.prefix,
  padding = excluded.padding,
  reset_policy = excluded.reset_policy,
  is_active = true,
  updated_at = now();

alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_doc_type_check;
alter table public.inventory_transactions
  add constraint inventory_transactions_doc_type_check check (
    reference_doc_type in (
      'goods_receipt', 'purchase_return', 'production_issue', 'stock_issue',
      'stock_issue_reversal', 'stock_adjustment', 'stock_adjustment_reversal'
    )
  );

-- Adjustment-created lots and cost layers have no purchasing document.
alter table public.inventory_lots
  alter column goods_receipt_id drop not null,
  alter column goods_receipt_item_id drop not null,
  alter column purchase_order_id drop not null;
alter table public.inventory_receipt_costs
  alter column goods_receipt_item_id drop not null;

create table public.stock_adjustments (
  id bigint generated always as identity primary key,
  adjustment_number text not null unique,
  document_date date not null,
  warehouse_id bigint not null references public.raw_material_warehouses(id) on delete restrict,
  warehouse_name text not null,
  reason text not null,
  notes text,
  status text not null default 'posted' check (status in ('posted', 'cancelled')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_by_name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  cancellation_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_by_name text,
  reversal_number text unique,
  constraint stock_adjustments_number_not_blank check (length(btrim(adjustment_number)) > 0),
  constraint stock_adjustments_reason_length check (length(btrim(reason)) between 1 and 500),
  constraint stock_adjustments_notes_length check (notes is null or length(notes) <= 1000),
  constraint stock_adjustments_cancel_reason check (cancellation_reason is null or length(cancellation_reason) between 10 and 500)
);

create table public.stock_adjustment_items (
  id bigint generated always as identity primary key,
  stock_adjustment_id bigint not null references public.stock_adjustments(id) on delete restrict,
  line_no integer not null check (line_no > 0),
  item_master_id bigint not null references public.item_master(id) on delete restrict,
  item_code text not null,
  item_name text not null,
  unit_name text not null,
  system_qty numeric(18,4) not null check (system_qty >= 0),
  counted_qty numeric(18,4) not null check (counted_qty >= 0),
  difference_qty numeric(18,4) generated always as (counted_qty - system_qty) stored,
  positive_unit_cost numeric(18,4) check (positive_unit_cost is null or positive_unit_cost >= 0),
  constraint stock_adjustment_items_unique_item unique (stock_adjustment_id, item_master_id),
  constraint stock_adjustment_items_changed check (counted_qty <> system_qty),
  constraint stock_adjustment_items_positive_cost check (counted_qty <= system_qty or positive_unit_cost is not null)
);

create table public.stock_adjustment_allocations (
  id bigint generated always as identity primary key,
  stock_adjustment_item_id bigint not null references public.stock_adjustment_items(id) on delete restrict,
  inventory_lot_id bigint references public.inventory_lots(id) on delete restrict,
  inventory_transaction_id bigint not null unique references public.inventory_transactions(id) on delete restrict,
  quantity_change numeric(18,4) not null check (quantity_change <> 0)
);

create index stock_adjustments_date_idx on public.stock_adjustments (document_date desc, id desc);
create index stock_adjustment_items_document_idx on public.stock_adjustment_items (stock_adjustment_id, line_no);
create index stock_adjustment_allocations_item_idx on public.stock_adjustment_allocations (stock_adjustment_item_id);
create index inventory_transactions_report_idx on public.inventory_transactions (created_at, item_master_id, warehouse_id, id)
  where item_master_id is not null;

alter table public.stock_adjustments enable row level security;
alter table public.stock_adjustment_items enable row level security;
alter table public.stock_adjustment_allocations enable row level security;

create policy "Adjustment viewers can read headers"
on public.stock_adjustments for select to authenticated
using ((select public.authorize('inventory_adjustment.view')));
create policy "Adjustment viewers can read items"
on public.stock_adjustment_items for select to authenticated
using ((select public.authorize('inventory_adjustment.view')));
create policy "Adjustment viewers can read allocations"
on public.stock_adjustment_allocations for select to authenticated
using ((select public.authorize('inventory_adjustment.view')));

grant select on public.stock_adjustments, public.stock_adjustment_items, public.stock_adjustment_allocations to authenticated;
revoke insert, update, delete on public.stock_adjustments, public.stock_adjustment_items, public.stock_adjustment_allocations from authenticated;

create or replace function public.get_stock_adjustment_form_options(
  p_warehouse_id bigint default null,
  p_search text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case when not public.authorize('inventory_adjustment.create') then
    jsonb_build_object('permissionDenied', true)
  else jsonb_build_object(
    'warehouses', coalesce((
      select jsonb_agg(jsonb_build_object('id', warehouse.id, 'name', warehouse.warehouse_name) order by warehouse.warehouse_name)
      from public.raw_material_warehouses warehouse where warehouse.status = 'active'
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', master.id, 'code', master.item_code, 'name', master.item_name,
        'warehouseId', balance.warehouse_id, 'onHandQty', balance.on_hand_qty,
        'unitName', coalesce(nullif(unit.symbol, ''), unit.unit_name, 'หน่วย'),
        'trackingMethod', master.tracking_method
      ) order by master.item_code)
      from (
        select inventory_balance.*
        from public.item_inventory_balances inventory_balance
        join public.item_master inventory_master on inventory_master.id = inventory_balance.item_master_id
        where (p_warehouse_id is null or inventory_balance.warehouse_id = p_warehouse_id)
          and (nullif(btrim(coalesce(p_search, '')), '') is null
            or inventory_master.item_code ilike '%' || btrim(p_search) || '%'
            or inventory_master.item_name ilike '%' || btrim(p_search) || '%')
        order by inventory_master.item_code
        limit 200
      ) balance
      join public.item_master master on master.id = balance.item_master_id and master.status = 'active'
      join public.item_types item_type on item_type.id = master.item_type_id and item_type.status = 'active' and item_type.is_stocked
      left join public.raw_material_units unit on unit.id = master.unit_id
    ), '[]'::jsonb)
  ) end;
$$;
revoke all on function public.get_stock_adjustment_form_options(bigint, text) from public, anon;
grant execute on function public.get_stock_adjustment_form_options(bigint, text) to authenticated;

create or replace function public.post_stock_adjustment(
  p_document_date date,
  p_warehouse_id bigint,
  p_reason text,
  p_notes text,
  p_items jsonb,
  p_adjustment_number text
)
returns table (stock_adjustment_id bigint, adjustment_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_actor_name text;
  v_warehouse_name text;
  v_adjustment_id bigint;
  v_adjustment_number text;
  v_item jsonb;
  v_item_row record;
  v_system_qty numeric(18,4);
  v_counted_qty numeric(18,4);
  v_difference numeric(18,4);
  v_unit_cost numeric(18,4);
  v_item_id bigint;
  v_transaction_id bigint;
  v_lot_id bigint;
  v_lot record;
  v_take numeric(18,4);
  v_remaining numeric(18,4);
  v_line integer := 0;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.authorize('inventory_adjustment.create') then raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_document_date is null or p_warehouse_id is null or length(btrim(coalesce(p_reason, ''))) not between 1 and 500
    or length(coalesce(p_notes, '')) > 1000 then raise exception 'invalid_stock_adjustment_header' using errcode = '22023'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid_stock_adjustment_items' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) item group by (item->>'item_master_id')::bigint having count(*) > 1) then
    raise exception 'duplicate_stock_adjustment_item' using errcode = '22023';
  end if;

  select warehouse.warehouse_name into v_warehouse_name
  from public.raw_material_warehouses warehouse
  where warehouse.id = p_warehouse_id and warehouse.status = 'active';
  if not found then raise exception 'warehouse_not_found' using errcode = 'P0002'; end if;

  select coalesce(nullif(concat_ws(' ', profile.first_name, profile.last_name), ''), app_user.email, 'ผู้ใช้งาน')
  into v_actor_name
  from auth.users app_user left join public.user_profiles profile on profile.user_id = app_user.id
  where app_user.id = v_user_id;

  select allocated.business_number into v_adjustment_number
  from erp_private.allocate_business_number('AD', p_document_date, 'used', 'stock_adjustment', null) allocated;

  insert into public.stock_adjustments (
    adjustment_number, document_date, warehouse_id, warehouse_name, reason, notes, created_by, created_by_name
  ) values (
    v_adjustment_number, p_document_date, p_warehouse_id, v_warehouse_name,
    btrim(p_reason), nullif(btrim(coalesce(p_notes, '')), ''), v_user_id, coalesce(v_actor_name, 'ผู้ใช้งาน')
  ) returning id into v_adjustment_id;

  for v_item in select item from jsonb_array_elements(p_items) item order by (item->>'item_master_id')::bigint loop
    v_counted_qty := nullif(v_item->>'counted_qty', '')::numeric;
    if v_counted_qty is null or v_counted_qty < 0 or v_counted_qty <> round(v_counted_qty, 4) then
      raise exception 'invalid_counted_quantity' using errcode = '22023';
    end if;
    select master.id, master.item_code, master.item_name, master.tracking_method,
      coalesce(nullif(unit.symbol, ''), unit.unit_name, 'หน่วย') as unit_name,
      case when master.attributes->>'legacySource' = 'raw_material' and master.attributes->>'legacySourceId' ~ '^\d+$'
        then (master.attributes->>'legacySourceId')::bigint else null end as raw_material_id
    into v_item_row
    from public.item_master master
    join public.item_types item_type on item_type.id = master.item_type_id and item_type.status = 'active' and item_type.is_stocked
    left join public.raw_material_units unit on unit.id = master.unit_id
    where master.id = (v_item->>'item_master_id')::bigint and master.status = 'active';
    if not found then raise exception 'stock_item_not_found' using errcode = 'P0002'; end if;
    if v_item_row.tracking_method = 'serial' then raise exception 'serial_stock_adjustment_not_supported' using errcode = '0A000'; end if;

    select balance.on_hand_qty into v_system_qty
    from public.item_inventory_balances balance
    where balance.item_master_id = v_item_row.id and balance.warehouse_id = p_warehouse_id
    for update;
    v_system_qty := coalesce(v_system_qty, 0);
    if v_system_qty <> coalesce(nullif(v_item->>'system_qty', '')::numeric, v_system_qty) then
      raise exception 'stale_stock_balance:%', v_item_row.item_code using errcode = '40001';
    end if;
    v_difference := v_counted_qty - v_system_qty;
    if v_difference = 0 then continue; end if;
    v_unit_cost := nullif(v_item->>'positive_unit_cost', '')::numeric;
    if v_difference > 0 and (v_unit_cost is null or v_unit_cost < 0) then
      raise exception 'positive_unit_cost_required' using errcode = '22023';
    end if;

    v_line := v_line + 1;
    insert into public.stock_adjustment_items (
      stock_adjustment_id, line_no, item_master_id, item_code, item_name, unit_name,
      system_qty, counted_qty, positive_unit_cost
    ) values (
      v_adjustment_id, v_line, v_item_row.id, v_item_row.item_code, v_item_row.item_name,
      v_item_row.unit_name, v_system_qty, v_counted_qty, case when v_difference > 0 then v_unit_cost end
    ) returning id into v_item_id;

    if v_difference > 0 then
      v_lot_id := null;
      if v_item_row.tracking_method = 'lot' then
        insert into public.inventory_lots (
          lot_number, raw_material_id, item_master_id, warehouse_id, received_qty,
          received_at, remarks, created_by
        ) values (
          v_adjustment_number || '-' || lpad(v_line::text, 2, '0'), v_item_row.raw_material_id,
          v_item_row.id, p_warehouse_id, v_difference, timezone('utc', now()),
          'สร้างจากใบปรับปรุงสต็อก ' || v_adjustment_number, v_user_id
        ) returning id into v_lot_id;
      end if;
      insert into public.inventory_transactions (
        raw_material_id, item_master_id, warehouse_id, lot_id, transaction_type,
        reference_doc_type, reference_doc_number, quantity_change, created_by
      ) values (
        v_item_row.raw_material_id, v_item_row.id, p_warehouse_id, v_lot_id, 'adjustment',
        'stock_adjustment', v_adjustment_number, v_difference, v_user_id
      ) returning id into v_transaction_id;
      insert into public.inventory_receipt_costs (
        inventory_transaction_id, goods_receipt_item_id, inventory_lot_id, item_master_id,
        warehouse_id, received_qty, remaining_qty, unit_cost, created_at
      ) values (
        v_transaction_id, null, v_lot_id, v_item_row.id, p_warehouse_id,
        v_difference, v_difference, v_unit_cost, timezone('utc', now())
      );
      insert into public.stock_adjustment_allocations (stock_adjustment_item_id, inventory_lot_id, inventory_transaction_id, quantity_change)
      values (v_item_id, v_lot_id, v_transaction_id, v_difference);
    else
      v_remaining := abs(v_difference);
      if v_item_row.tracking_method = 'lot' then
        for v_lot in
          select lot.id, lot.on_hand_qty from public.inventory_lots lot
          where lot.item_master_id = v_item_row.id and lot.warehouse_id = p_warehouse_id and lot.on_hand_qty > 0
          order by lot.received_at, lot.id for update
        loop
          exit when v_remaining = 0;
          v_take := least(v_remaining, v_lot.on_hand_qty);
          insert into public.inventory_transactions (
            raw_material_id, item_master_id, warehouse_id, lot_id, transaction_type,
            reference_doc_type, reference_doc_number, quantity_change, created_by
          ) values (
            v_item_row.raw_material_id, v_item_row.id, p_warehouse_id, v_lot.id, 'issue',
            'stock_adjustment', v_adjustment_number, -v_take, v_user_id
          ) returning id into v_transaction_id;
          insert into public.stock_adjustment_allocations (stock_adjustment_item_id, inventory_lot_id, inventory_transaction_id, quantity_change)
          values (v_item_id, v_lot.id, v_transaction_id, -v_take);
          v_remaining := v_remaining - v_take;
        end loop;
      else
        insert into public.inventory_transactions (
          raw_material_id, item_master_id, warehouse_id, lot_id, transaction_type,
          reference_doc_type, reference_doc_number, quantity_change, created_by
        ) values (
          v_item_row.raw_material_id, v_item_row.id, p_warehouse_id, null, 'issue',
          'stock_adjustment', v_adjustment_number, v_difference, v_user_id
        ) returning id into v_transaction_id;
        insert into public.stock_adjustment_allocations (stock_adjustment_item_id, inventory_lot_id, inventory_transaction_id, quantity_change)
        values (v_item_id, null, v_transaction_id, v_difference);
        v_remaining := 0;
      end if;
      if v_remaining > 0 then raise exception 'insufficient_stock:%', v_item_row.item_code using errcode = '23514'; end if;
    end if;
  end loop;
  if v_line = 0 then raise exception 'stock_adjustment_has_no_changes' using errcode = '22023'; end if;
  return query select v_adjustment_id, v_adjustment_number;
end;
$$;
revoke all on function public.post_stock_adjustment(date, bigint, text, text, jsonb, text) from public, anon;
grant execute on function public.post_stock_adjustment(date, bigint, text, text, jsonb, text) to authenticated;

create or replace function public.cancel_stock_adjustment(p_stock_adjustment_id bigint, p_reason text)
returns table (reversal_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_adjustment public.stock_adjustments%rowtype;
  v_reason text := regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g');
  v_reversal text;
  v_actor text;
  v_row record;
  v_reversal_tx bigint;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.authorize('inventory_adjustment.cancel') then raise exception 'permission_denied' using errcode = '42501'; end if;
  if length(v_reason) < 10 or length(v_reason) > 500 then raise exception 'invalid_cancellation_reason' using errcode = '22023'; end if;
  select * into v_adjustment from public.stock_adjustments where id = p_stock_adjustment_id for update;
  if not found then raise exception 'stock_adjustment_not_found' using errcode = 'P0002'; end if;
  if v_adjustment.status = 'cancelled' and v_adjustment.reversal_number is not null then
    return query select v_adjustment.reversal_number; return;
  end if;
  if v_adjustment.status <> 'posted' then raise exception 'stock_adjustment_cannot_be_cancelled' using errcode = '55000'; end if;
  perform cost.inventory_transaction_id
  from public.inventory_receipt_costs cost
  join public.stock_adjustment_allocations allocation on allocation.inventory_transaction_id = cost.inventory_transaction_id
  join public.stock_adjustment_items item on item.id = allocation.stock_adjustment_item_id
  where item.stock_adjustment_id = v_adjustment.id and allocation.quantity_change > 0
  order by cost.inventory_transaction_id
  for update;
  if exists (
    select 1 from public.stock_adjustment_allocations allocation
    join public.stock_adjustment_items item on item.id = allocation.stock_adjustment_item_id
    join public.inventory_transactions tx on tx.id = allocation.inventory_transaction_id
    left join public.inventory_receipt_costs cost on cost.inventory_transaction_id = tx.id
    where item.stock_adjustment_id = v_adjustment.id and allocation.quantity_change > 0
      and (cost.inventory_transaction_id is null or cost.remaining_qty <> cost.received_qty)
  ) then raise exception 'positive_adjustment_already_consumed' using errcode = '55000'; end if;

  select allocated.business_number into v_reversal
  from erp_private.allocate_business_number('RV', current_date, 'used', 'stock_adjustment_reversal', v_adjustment.id::text) allocated;
  select coalesce(nullif(concat_ws(' ', profile.first_name, profile.last_name), ''), app_user.email, 'ผู้ใช้งาน') into v_actor
  from auth.users app_user left join public.user_profiles profile on profile.user_id = app_user.id where app_user.id = v_user_id;

  for v_row in
    select allocation.quantity_change, allocation.inventory_transaction_id,
      tx.raw_material_id, tx.item_master_id, tx.warehouse_id, tx.lot_id
    from public.stock_adjustment_allocations allocation
    join public.stock_adjustment_items item on item.id = allocation.stock_adjustment_item_id
    join public.inventory_transactions tx on tx.id = allocation.inventory_transaction_id
    where item.stock_adjustment_id = v_adjustment.id order by allocation.id
  loop
    insert into public.inventory_transactions (
      raw_material_id, item_master_id, warehouse_id, lot_id, transaction_type,
      reference_doc_type, reference_doc_number, quantity_change, created_by, reversal_of_transaction_id
    ) values (
      v_row.raw_material_id, v_row.item_master_id, v_row.warehouse_id, v_row.lot_id, 'adjustment',
      'stock_adjustment_reversal', v_reversal, -v_row.quantity_change, v_user_id, v_row.inventory_transaction_id
    ) returning id into v_reversal_tx;
    if v_row.quantity_change > 0 then
      update public.inventory_receipt_costs set remaining_qty = 0 where inventory_transaction_id = v_row.inventory_transaction_id;
    else
      update public.inventory_receipt_costs cost set remaining_qty = cost.remaining_qty + restored.quantity
      from (
        select allocation.receipt_cost_transaction_id, sum(allocation.quantity) quantity
        from public.inventory_issue_cost_allocations allocation
        where allocation.inventory_transaction_id = v_row.inventory_transaction_id
        group by allocation.receipt_cost_transaction_id
      ) restored where cost.inventory_transaction_id = restored.receipt_cost_transaction_id;
    end if;
  end loop;

  update public.stock_adjustments set status = 'cancelled', cancellation_reason = v_reason,
    cancelled_at = timezone('utc', now()), cancelled_by = v_user_id,
    cancelled_by_name = coalesce(v_actor, 'ผู้ใช้งาน'), reversal_number = v_reversal
  where id = v_adjustment.id;
  return query select v_reversal;
end;
$$;
revoke all on function public.cancel_stock_adjustment(bigint, text) from public, anon;
grant execute on function public.cancel_stock_adjustment(bigint, text) to authenticated;

create or replace function public.get_stock_movement_report(
  p_view text,
  p_start_date date,
  p_end_date date,
  p_warehouse_id bigint default null,
  p_item_type_id bigint default null,
  p_movement_kind text default null,
  p_search text default null,
  p_item_master_id bigint default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result jsonb;
  v_offset integer;
  v_from timestamptz;
  v_until timestamptz;
begin
  if not public.authorize('inventory.view') then raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_view not in ('summary', 'journal', 'card') or p_start_date is null or p_end_date is null
    or p_start_date > p_end_date or p_page < 1 or p_page_size not between 1 and 500 then
    raise exception 'invalid_stock_report_filter' using errcode = '22023';
  end if;
  v_offset := (p_page - 1) * p_page_size;
  v_from := p_start_date::timestamp at time zone 'Asia/Bangkok';
  v_until := (p_end_date + 1)::timestamp at time zone 'Asia/Bangkok';

  with base as materialized (
    select tx.id, tx.item_master_id, master.item_code, master.item_name,
      tx.warehouse_id, warehouse.warehouse_name,
      coalesce(nullif(unit.symbol, ''), unit.unit_name, 'หน่วย') unit_name,
      master.item_type_id, item_type.type_name group_name,
      tx.created_at, tx.transaction_type, tx.reference_doc_type,
      tx.reference_doc_number, coalesce(lot.lot_number, '-') lot_number,
      tx.quantity_change,
      coalesce(nullif(concat_ws(' ', profile.first_name, profile.last_name), ''), 'ระบบ') actor_name,
      case
        when tx.reference_doc_type in ('stock_issue_reversal', 'stock_adjustment_reversal') then 'reversal'
        when tx.reference_doc_type = 'stock_adjustment' then 'adjustment'
        when tx.reference_doc_type = 'stock_issue' or tx.quantity_change < 0 then 'issue'
        else 'receipt'
      end movement_kind
    from public.inventory_transactions tx
    join public.item_master master on master.id = tx.item_master_id
    join public.item_types item_type on item_type.id = master.item_type_id
    join public.raw_material_warehouses warehouse on warehouse.id = tx.warehouse_id
    left join public.raw_material_units unit on unit.id = master.unit_id
    left join public.inventory_lots lot on lot.id = tx.lot_id
    left join public.user_profiles profile on profile.user_id = tx.created_by
    where tx.item_master_id is not null and tx.created_at < v_until
      and tx.reference_doc_type in ('goods_receipt', 'stock_issue', 'stock_issue_reversal', 'stock_adjustment', 'stock_adjustment_reversal')
      and (p_warehouse_id is null or tx.warehouse_id = p_warehouse_id)
      and (p_item_type_id is null or master.item_type_id = p_item_type_id)
      and (p_item_master_id is null or tx.item_master_id = p_item_master_id)
      and (nullif(btrim(coalesce(p_search, '')), '') is null
        or master.item_code ilike '%' || btrim(p_search) || '%'
        or master.item_name ilike '%' || btrim(p_search) || '%'
        or tx.reference_doc_number ilike '%' || btrim(p_search) || '%')
  ), summary as materialized (
    select item_master_id, item_code, item_name, warehouse_id, warehouse_name, unit_name,
      item_type_id, group_name,
      sum(quantity_change) filter (where created_at < v_from) opening,
      sum(quantity_change) filter (where created_at >= v_from and movement_kind = 'receipt') received,
      -sum(quantity_change) filter (where created_at >= v_from and movement_kind = 'issue') issued,
      sum(quantity_change) filter (where created_at >= v_from and movement_kind in ('adjustment', 'reversal')) adjustment,
      sum(quantity_change) closing
    from base group by item_master_id, item_code, item_name, warehouse_id, warehouse_name,
      unit_name, item_type_id, group_name
  ), journal as materialized (
    select base.*,
      sum(quantity_change) over (partition by item_master_id, warehouse_id order by created_at, id) balance
    from base
  ), filtered_journal as materialized (
    select * from journal where created_at >= v_from
      and (p_movement_kind is null or movement_kind = p_movement_kind)
  ), selected as materialized (
    select to_jsonb(summary) row_data, item_code sort_code, warehouse_name sort_warehouse,
      null::timestamptz sort_time, item_master_id sort_item, 0::bigint sort_id
    from summary where p_view = 'summary'
    union all
    select to_jsonb(filtered_journal), item_code, warehouse_name, created_at, item_master_id, id
    from filtered_journal where p_view in ('journal', 'card')
  ), page_rows as (
    select row_data from selected
    order by case when p_view = 'summary' then sort_code end,
      case when p_view = 'summary' then sort_warehouse end,
      case when p_view <> 'summary' then sort_time end,
      sort_id
    limit p_page_size offset v_offset
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(row_data) from page_rows), '[]'::jsonb),
    'total', (select count(*) from selected),
    'options', jsonb_build_object(
      'warehouses', coalesce((select jsonb_agg(distinct jsonb_build_object('id', warehouse_id, 'name', warehouse_name)) from base), '[]'::jsonb),
      'groups', coalesce((select jsonb_agg(distinct jsonb_build_object('id', item_type_id, 'name', group_name)) from base), '[]'::jsonb)
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.get_stock_movement_report(text, date, date, bigint, bigint, text, text, bigint, integer, integer) from public, anon;
grant execute on function public.get_stock_movement_report(text, date, date, bigint, bigint, text, text, bigint, integer, integer) to authenticated;
