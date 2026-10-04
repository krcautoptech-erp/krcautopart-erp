insert into public.app_permissions (
  permission_code, permission_name, module_code, module_name,
  action_code, module_sort_order, sort_order, status
)
values ('inventory_issue.cancel', 'ยกเลิกใบเบิกใช้สินค้า', 'inventory_issue', 'ใบเบิกใช้สินค้า', 'cancel', 61, 40, 'active')
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
join public.app_permissions permission on permission.permission_code = 'inventory_issue.cancel'
where role.is_owner
on conflict (role_id, permission_id) do nothing;

insert into erp_private.number_series (series_key, prefix, padding, reset_policy)
values ('RV', 'RV', 4, 'monthly')
on conflict (series_key) do update set
  prefix = excluded.prefix,
  padding = excluded.padding,
  reset_policy = excluded.reset_policy,
  is_active = true,
  updated_at = now();

alter table public.stock_issues
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancelled_by_name text,
  add column if not exists reversal_number text unique;

alter table public.stock_issues
  drop constraint if exists stock_issues_cancellation_reason_check;
alter table public.stock_issues
  add constraint stock_issues_cancellation_reason_check
  check (cancellation_reason is null or length(cancellation_reason) between 10 and 500);

alter table public.inventory_transactions
  add column if not exists reversal_of_transaction_id bigint
    references public.inventory_transactions(id) on delete restrict;

create unique index if not exists inventory_transactions_one_reversal_idx
  on public.inventory_transactions (reversal_of_transaction_id)
  where reversal_of_transaction_id is not null;

alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_doc_type_check;
alter table public.inventory_transactions
  add constraint inventory_transactions_doc_type_check check (
    reference_doc_type in (
      'goods_receipt', 'purchase_return', 'production_issue', 'stock_issue',
      'stock_issue_reversal', 'stock_adjustment'
    )
  );

create or replace function public.cancel_stock_issue(
  p_stock_issue_id bigint,
  p_reason text
)
returns table (reversal_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_name text;
  v_allocation record;
  v_issue public.stock_issues%rowtype;
  v_reason text := regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g');
  v_reversal_number text;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not public.authorize('inventory_issue.cancel') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_stock_issue_id is null then
    raise exception 'stock_issue_not_found' using errcode = 'P0002';
  end if;
  if length(v_reason) < 10 or length(v_reason) > 500 then
    raise exception 'invalid_cancellation_reason' using errcode = '22023';
  end if;

  select issue.* into v_issue
  from public.stock_issues issue
  where issue.id = p_stock_issue_id
  for update;

  if not found then
    raise exception 'stock_issue_not_found' using errcode = 'P0002';
  end if;
  if v_issue.status = 'cancelled' and v_issue.reversal_number is not null then
    return query select v_issue.reversal_number;
    return;
  end if;
  if v_issue.status <> 'posted' then
    raise exception 'stock_issue_cannot_be_cancelled' using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.stock_issue_allocations allocation
    join public.stock_issue_items item on item.id = allocation.stock_issue_item_id
    left join public.inventory_transactions original_tx on original_tx.id = allocation.inventory_transaction_id
    where item.stock_issue_id = v_issue.id
      and (
        original_tx.id is null
        or original_tx.reference_doc_type <> 'stock_issue'
        or original_tx.reference_doc_number <> v_issue.issue_number
        or original_tx.quantity_change <> -allocation.quantity
        or exists (
          select 1 from public.inventory_transactions reversal
          where reversal.reversal_of_transaction_id = original_tx.id
        )
      )
  ) then
    raise exception 'invalid_stock_issue_ledger' using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.inventory_receipt_costs cost
    join (
      select cost_allocation.receipt_cost_transaction_id, sum(cost_allocation.quantity) as quantity
      from public.stock_issue_allocations allocation
      join public.stock_issue_items item on item.id = allocation.stock_issue_item_id
      join public.inventory_issue_cost_allocations cost_allocation
        on cost_allocation.inventory_transaction_id = allocation.inventory_transaction_id
      where item.stock_issue_id = v_issue.id
      group by cost_allocation.receipt_cost_transaction_id
    ) restored on restored.receipt_cost_transaction_id = cost.inventory_transaction_id
    where cost.remaining_qty + restored.quantity > cost.received_qty
  ) then
    raise exception 'invalid_stock_issue_cost_reversal' using errcode = '23514';
  end if;

  select allocated.business_number into v_reversal_number
  from erp_private.allocate_business_number(
    'RV', current_date, 'used', 'stock_issue_reversal', v_issue.id::text
  ) allocated;

  select coalesce(
    nullif(concat_ws(' ', profile.first_name, profile.last_name), ''),
    auth_user.email,
    'ผู้ใช้งาน'
  ) into v_actor_name
  from auth.users auth_user
  left join public.user_profiles profile on profile.user_id = auth_user.id
  where auth_user.id = v_user_id;

  for v_allocation in
    select allocation.inventory_transaction_id, allocation.quantity,
      original_tx.raw_material_id, original_tx.item_master_id,
      original_tx.warehouse_id, original_tx.lot_id
    from public.stock_issue_allocations allocation
    join public.stock_issue_items item on item.id = allocation.stock_issue_item_id
    join public.inventory_transactions original_tx on original_tx.id = allocation.inventory_transaction_id
    where item.stock_issue_id = v_issue.id
    order by allocation.id
  loop
    insert into public.inventory_transactions (
      raw_material_id, item_master_id, warehouse_id, lot_id, transaction_type,
      reference_doc_type, reference_doc_number, quantity_change, created_by,
      reversal_of_transaction_id
    ) values (
      v_allocation.raw_material_id, v_allocation.item_master_id,
      v_allocation.warehouse_id, v_allocation.lot_id, 'return',
      'stock_issue_reversal', v_reversal_number, v_allocation.quantity,
      v_user_id, v_allocation.inventory_transaction_id
    );
  end loop;

  update public.inventory_receipt_costs cost
  set remaining_qty = cost.remaining_qty + restored.quantity
  from (
    select cost_allocation.receipt_cost_transaction_id, sum(cost_allocation.quantity) as quantity
    from public.stock_issue_allocations allocation
    join public.stock_issue_items item on item.id = allocation.stock_issue_item_id
    join public.inventory_issue_cost_allocations cost_allocation
      on cost_allocation.inventory_transaction_id = allocation.inventory_transaction_id
    where item.stock_issue_id = v_issue.id
    group by cost_allocation.receipt_cost_transaction_id
  ) restored
  where cost.inventory_transaction_id = restored.receipt_cost_transaction_id;

  update public.stock_issues
  set status = 'cancelled',
      cancellation_reason = v_reason,
      cancelled_at = timezone('utc', now()),
      cancelled_by = v_user_id,
      cancelled_by_name = coalesce(v_actor_name, 'ผู้ใช้งาน'),
      reversal_number = v_reversal_number
  where id = v_issue.id;

  return query select v_reversal_number;
end;
$$;

revoke all on function public.cancel_stock_issue(bigint, text) from public, anon;
grant execute on function public.cancel_stock_issue(bigint, text) to authenticated;
