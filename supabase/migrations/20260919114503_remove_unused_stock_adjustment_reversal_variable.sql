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
    );
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
