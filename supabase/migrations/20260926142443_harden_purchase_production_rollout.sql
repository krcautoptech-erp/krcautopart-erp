-- Production hardening for PR -> PO -> GR -> stock.

-- PR writes must pass through the permission-checked RPCs. RLS remains the
-- read boundary for browser clients; direct transactional DML is denied.
drop policy if exists "Authenticated users can manage purchase requisitions"
  on public.purchase_requisitions;
drop policy if exists "Authenticated users can manage purchase requisition items"
  on public.purchase_requisition_items;

drop policy if exists "Authorized users can read purchase requisitions"
  on public.purchase_requisitions;
create policy "Authorized users can read purchase requisitions"
  on public.purchase_requisitions for select to authenticated
  using ((select public.authorize('pr.view')));

drop policy if exists "Authorized users can read purchase requisition items"
  on public.purchase_requisition_items;
create policy "Authorized users can read purchase requisition items"
  on public.purchase_requisition_items for select to authenticated
  using (
    (select public.authorize('pr.view'))
    and exists (
      select 1 from public.purchase_requisitions requisition
      where requisition.id = purchase_requisition_items.requisition_id
    )
  );

drop policy if exists "Authenticated users can read purchase requisition approval logs"
  on public.purchase_requisition_approval_logs;
create policy "Authorized users can read purchase requisition approval logs"
  on public.purchase_requisition_approval_logs for select to authenticated
  using ((select public.authorize('pr.view')));

revoke insert, update, delete on public.purchase_requisitions from authenticated;
revoke insert, update, delete on public.purchase_requisition_items from authenticated;
revoke insert, update, delete on public.purchase_requisition_approval_logs from authenticated;

-- A client-generated key makes a retry return the original receipt instead of
-- posting stock twice after a lost HTTP response.
alter table public.goods_receipts
  add column if not exists request_key uuid;
alter table public.goods_receipts
  add constraint goods_receipts_request_key_unique unique (request_key);

alter table public.goods_receipts
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete restrict,
  add column if not exists cancellation_reason text,
  add column if not exists pre_receipt_po_status text;

create table if not exists public.goods_receipt_status_logs (
  id bigint generated always as identity primary key,
  goods_receipt_id bigint not null references public.goods_receipts(id) on delete restrict,
  from_status text,
  to_status text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_name text not null,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists goods_receipt_status_logs_receipt_idx
  on public.goods_receipt_status_logs(goods_receipt_id, created_at desc, id desc);

alter table public.goods_receipt_status_logs enable row level security;
create policy "Authorized users can read goods receipt status logs"
  on public.goods_receipt_status_logs for select to authenticated
  using ((select public.authorize('inventory.view')));
grant select on public.goods_receipt_status_logs to authenticated;
revoke insert, update, delete on public.goods_receipt_status_logs from authenticated;

alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_doc_type_check;
alter table public.inventory_transactions
  add constraint inventory_transactions_doc_type_check check (
    reference_doc_type in (
      'goods_receipt', 'goods_receipt_reversal', 'purchase_return',
      'production_issue', 'stock_issue', 'stock_issue_reversal',
      'stock_adjustment', 'stock_adjustment_reversal'
    )
  );

alter table public.inventory_serials
  drop constraint if exists inventory_serials_status_check;
alter table public.inventory_serials
  add constraint inventory_serials_status_check check (
    status in (
      'in_stock', 'in_use', 'under_repair', 'allocated', 'consumed',
      'scrapped', 'disposed', 'cancelled'
    )
  );

-- Retain cancelled serials for audit without blocking a corrected re-receipt.
alter table public.inventory_serials
  drop constraint if exists inventory_serials_item_serial_unique;
create unique index if not exists inventory_serials_active_item_serial_unique
  on public.inventory_serials(item_master_id, serial_number)
  where status <> 'cancelled';

alter function public.post_goods_receipt(bigint, date, text, text, jsonb)
  rename to post_goods_receipt_without_idempotency;
revoke all on function public.post_goods_receipt_without_idempotency(bigint, date, text, text, jsonb)
  from public, anon, authenticated;

create function public.post_goods_receipt(
  p_purchase_order_id bigint,
  p_document_date date,
  p_delivery_note_no text,
  p_remarks text,
  p_items jsonb,
  p_request_key uuid
)
returns table (goods_receipt_id bigint, goods_receipt_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.goods_receipts%rowtype;
  v_created record;
  v_previous_po_status text;
  v_current_po_status text;
  v_actor_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_request_key is null then
    raise exception 'request_key_required' using errcode = '22023';
  end if;
  if not (public.authorize('inventory.receive') or public.authorize('inventory.manage')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('goods_receipt:' || p_request_key::text, 0)
  );

  select receipt.* into v_existing
  from public.goods_receipts receipt
  where receipt.request_key = p_request_key;

  if found then
    if v_existing.created_by <> (select auth.uid())
      or v_existing.purchase_order_id <> p_purchase_order_id then
      raise exception 'request_key_conflict' using errcode = '23505';
    end if;
    if v_existing.status <> 'posted' then
      raise exception 'goods_receipt_not_posted' using errcode = '55000';
    end if;
    return query select v_existing.id, v_existing.gr_number;
    return;
  end if;

  select status into v_previous_po_status
  from public.purchase_orders where id = p_purchase_order_id for update;

  select * into v_created
  from public.post_goods_receipt_without_idempotency(
    p_purchase_order_id, p_document_date, p_delivery_note_no, p_remarks, p_items
  );

  update public.goods_receipts
  set request_key = p_request_key, pre_receipt_po_status = v_previous_po_status
  where id = v_created.goods_receipt_id;

  select status into v_current_po_status from public.purchase_orders
  where id = p_purchase_order_id;
  select coalesce(nullif(concat_ws(' ', profile.first_name, profile.last_name), ''), 'ผู้ใช้งาน')
  into v_actor_name from public.user_profiles profile where profile.user_id = (select auth.uid());
  v_actor_name := coalesce(v_actor_name, 'ผู้ใช้งาน');

  if v_previous_po_status is distinct from v_current_po_status then
    insert into public.purchase_order_status_logs (
      purchase_order_id, from_status, to_status, actor_user_id, actor_name, note
    ) values (
      p_purchase_order_id, v_previous_po_status, v_current_po_status,
      (select auth.uid()), v_actor_name, 'บันทึกรับสินค้า ' || v_created.goods_receipt_number
    );
  end if;

  insert into public.goods_receipt_status_logs (
    goods_receipt_id, from_status, to_status, actor_user_id, actor_name, note
  )
  select receipt.id, null, 'posted', (select auth.uid()),
    coalesce(nullif(concat_ws(' ', profile.first_name, profile.last_name), ''), 'ผู้ใช้งาน'),
    'บันทึกรับสินค้า'
  from public.goods_receipts receipt
  left join public.user_profiles profile on profile.user_id = (select auth.uid())
  where receipt.id = v_created.goods_receipt_id;

  return query select v_created.goods_receipt_id, v_created.goods_receipt_number;
end;
$$;

revoke all on function public.post_goods_receipt(bigint, date, text, text, jsonb, uuid)
  from public, anon;
grant execute on function public.post_goods_receipt(bigint, date, text, text, jsonb, uuid)
  to authenticated;

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
      and (serial.status not in ('in_stock', 'in_use')
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

notify pgrst, 'reload schema';
