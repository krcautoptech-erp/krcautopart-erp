create index if not exists purchase_orders_vendor_price_history_idx
  on public.purchase_orders (vendor_id, status, document_date desc, id desc);

create index if not exists purchase_order_items_price_history_idx
  on public.purchase_order_items (item_master_id, unit_name, purchase_order_id)
  where item_master_id is not null;

alter table public.purchase_order_items
  drop constraint if exists purchase_order_items_unit_price_check;
alter table public.purchase_order_items
  add constraint purchase_order_items_unit_price_check
  check (unit_price > 0) not valid;

create or replace function public.get_latest_purchase_prices(
  p_vendor_id bigint,
  p_requisition_item_ids bigint[]
)
returns table (
  requisition_item_id bigint,
  unit_price numeric,
  po_number text,
  document_date date
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not public.authorize('po.create') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_vendor_id is null or p_vendor_id <= 0
     or p_requisition_item_ids is null
     or cardinality(p_requisition_item_ids) = 0 then
    return;
  end if;
  if cardinality(p_requisition_item_ids) > 200 then
    raise exception 'too_many_items' using errcode = '22023';
  end if;

  return query
  select
    source_item.id,
    latest_price.unit_price,
    latest_price.po_number,
    latest_price.document_date
  from public.purchase_requisition_items source_item
  join lateral (
    select
      old_item.unit_price,
      purchase_order.po_number,
      purchase_order.document_date
    from public.purchase_order_items old_item
    join public.purchase_orders purchase_order
      on purchase_order.id = old_item.purchase_order_id
    where purchase_order.vendor_id = p_vendor_id
      and purchase_order.status in ('approved', 'sent', 'partially_received', 'received')
      and old_item.unit_name = source_item.unit_name
      and (
        (
          source_item.item_master_id is not null
          and old_item.item_master_id = source_item.item_master_id
        )
        or (
          source_item.item_master_id is null
          and nullif(btrim(source_item.item_code), '') is not null
          and old_item.item_code = source_item.item_code
        )
      )
    order by purchase_order.document_date desc,
      purchase_order.approved_at desc nulls last,
      purchase_order.id desc,
      old_item.line_no desc
    limit 1
  ) latest_price on true
  where source_item.id = any(p_requisition_item_ids)
  order by source_item.id;
end;
$$;

revoke all on function public.get_latest_purchase_prices(bigint, bigint[])
  from public, anon;
grant execute on function public.get_latest_purchase_prices(bigint, bigint[])
  to authenticated;
