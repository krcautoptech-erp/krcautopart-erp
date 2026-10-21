-- Preserve existing authorization and reversal writes; reject every non-stock serial.
begin;
set local lock_timeout = '5s';


alter table public.inventory_transactions
  drop constraint inventory_transactions_doc_type_check;

alter table public.inventory_transactions
  add constraint inventory_transactions_doc_type_check check (
    reference_doc_type in (
      'goods_receipt', 'goods_receipt_reversal', 'purchase_return',
      'production_issue', 'stock_issue', 'stock_issue_reversal',
      'stock_adjustment', 'stock_adjustment_reversal',
      'opening_balance', 'opening_balance_reversal'
    )
  );


create or replace function public.cancel_goods_receipt(
  p_goods_receipt_id bigint,
  p_reason text
)
returns table (receipt_status text, goods_receipt_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_receipt public.goods_receipts%rowtype;
  v_actor_name text;
  v_tx record;
  v_total_ordered numeric(18, 4);
  v_total_received numeric(18, 4);
  v_po_status text;
  v_previous_po_status text;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not public.authorize('inventory.cancel_gr') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'invalid_cancellation_reason' using errcode = '22023';
  end if;

  select receipt.* into v_receipt
  from public.goods_receipts receipt
  where receipt.id = p_goods_receipt_id;

  if not found then
    raise exception 'goods_receipt_not_found' using errcode = 'P0002';
  end if;
  select status into v_previous_po_status from public.purchase_orders
  where id = v_receipt.purchase_order_id for update;
  select receipt.* into v_receipt from public.goods_receipts receipt
  where receipt.id = p_goods_receipt_id for update;
  if v_receipt.status = 'cancelled' then
    return query select v_receipt.status, v_receipt.gr_number;
    return;
  end if;
  if v_receipt.status <> 'posted' then
    raise exception 'goods_receipt_not_posted' using errcode = '55000';
  end if;

  perform item.id
  from public.purchase_order_items item
  where item.purchase_order_id = v_receipt.purchase_order_id
  order by item.id
  for update;

  perform serial.id
  from public.inventory_serials serial
  where serial.goods_receipt_id = v_receipt.id
  order by serial.id
  for update;

  if exists (
    select 1 from public.inventory_serials serial
    where serial.goods_receipt_id = v_receipt.id
      and (serial.status <> 'in_stock'
        or serial.updated_by is not null
        or serial.department_id is not null
        or serial.custodian_name is not null)
  ) then
    raise exception 'goods_receipt_stock_already_consumed' using errcode = '23514';
  end if;

  for v_tx in
    select transaction.*
    from public.inventory_transactions transaction
    where transaction.reference_doc_type = 'goods_receipt'
      and transaction.reference_doc_number = v_receipt.gr_number
      and transaction.quantity_change > 0
    order by transaction.id
    for update
  loop
    perform cost.inventory_transaction_id
    from public.inventory_receipt_costs cost
    where cost.inventory_transaction_id = v_tx.id for update;

    if exists (
      select 1 from public.inventory_transactions reversal
      where reversal.reversal_of_transaction_id = v_tx.id
    ) then
      raise exception 'goods_receipt_already_reversed' using errcode = '55000';
    end if;

    if exists (
      select 1 from public.inventory_receipt_costs cost
      where cost.inventory_transaction_id = v_tx.id
        and cost.remaining_qty <> cost.received_qty
    ) then
      raise exception 'goods_receipt_stock_already_consumed' using errcode = '23514';
    end if;

    -- Non-FIFO stock has no receipt allocation record. Conservatively reject
    -- cancellation once that item/lot has moved out after this receipt.
    if not exists (
      select 1 from public.inventory_receipt_costs cost
      where cost.inventory_transaction_id = v_tx.id
    ) and exists (
      select 1 from public.inventory_transactions movement
      where movement.id > v_tx.id and movement.quantity_change < 0
        and movement.item_master_id is not distinct from v_tx.item_master_id
        and movement.raw_material_id is not distinct from v_tx.raw_material_id
        and movement.warehouse_id = v_tx.warehouse_id
        and (v_tx.lot_id is null or movement.lot_id = v_tx.lot_id)
    ) then
      raise exception 'goods_receipt_stock_already_consumed' using errcode = '23514';
    end if;

    insert into public.inventory_transactions (
      raw_material_id, item_master_id, warehouse_id, lot_id,
      transaction_type, reference_doc_type, reference_doc_number,
      quantity_change, created_by, reversal_of_transaction_id
    ) values (
      v_tx.raw_material_id, v_tx.item_master_id, v_tx.warehouse_id, v_tx.lot_id,
      'return', 'goods_receipt_reversal', v_receipt.gr_number,
      -v_tx.quantity_change, v_user_id, v_tx.id
    );

    update public.inventory_receipt_costs
    set remaining_qty = 0
    where inventory_transaction_id = v_tx.id;
  end loop;

  update public.inventory_serials
  set status = 'cancelled', updated_at = timezone('utc', now())
  where goods_receipt_id = v_receipt.id;

  with received as (
    select item.purchase_order_item_id, sum(item.quantity_received) quantity
    from public.goods_receipt_items item
    where item.goods_receipt_id = v_receipt.id
    group by item.purchase_order_item_id
  )
  update public.purchase_order_items po_item
  set received_qty = greatest(po_item.received_qty - received.quantity, 0)
  from received
  where po_item.id = received.purchase_order_item_id;

  select coalesce(sum(quantity), 0), coalesce(sum(received_qty), 0)
  into v_total_ordered, v_total_received
  from public.purchase_order_items
  where purchase_order_id = v_receipt.purchase_order_id;

  v_po_status := case
    when v_total_received <= 0 then coalesce(
      case when v_receipt.pre_receipt_po_status in ('approved', 'sent')
        then v_receipt.pre_receipt_po_status end, 'approved')
    when v_total_received >= v_total_ordered then 'received'
    else 'partially_received'
  end;

  update public.purchase_orders
  set status = v_po_status, updated_by = v_user_id,
      updated_at = timezone('utc', now())
  where id = v_receipt.purchase_order_id;

  select coalesce(
    nullif(concat_ws(' ', profile.first_name, profile.last_name), ''),
    'ผู้ใช้งาน'
  ) into v_actor_name
  from public.user_profiles profile
  where profile.user_id = v_user_id;
  v_actor_name := coalesce(v_actor_name, 'ผู้ใช้งาน');

  update public.goods_receipts
  set status = 'cancelled', cancelled_at = timezone('utc', now()),
      cancelled_by = v_user_id, cancellation_reason = btrim(p_reason),
      updated_by = v_user_id, updated_at = timezone('utc', now())
  where id = v_receipt.id;

  insert into public.goods_receipt_status_logs (
    goods_receipt_id, from_status, to_status, actor_user_id, actor_name, note
  ) values (
    v_receipt.id, v_receipt.status, 'cancelled', v_user_id, v_actor_name, btrim(p_reason)
  );

  insert into public.purchase_order_status_logs (
    purchase_order_id, from_status, to_status, actor_user_id, actor_name, note
  ) values (
    v_receipt.purchase_order_id, v_previous_po_status, v_po_status,
    v_user_id, v_actor_name, 'ยกเลิกใบรับสินค้า ' || v_receipt.gr_number
  );

  return query select 'cancelled'::text, v_receipt.gr_number;
end;
$$;

revoke all on function public.cancel_goods_receipt(bigint, text)
  from public, anon;
grant execute on function public.cancel_goods_receipt(bigint, text)
  to authenticated;


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
        when tx.reference_doc_type in ('goods_receipt_reversal', 'stock_issue_reversal', 'stock_adjustment_reversal') then 'reversal'
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
      and tx.reference_doc_type in ('goods_receipt', 'goods_receipt_reversal', 'stock_issue', 'stock_issue_reversal', 'stock_adjustment', 'stock_adjustment_reversal')
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

notify pgrst, 'reload schema';
commit;

