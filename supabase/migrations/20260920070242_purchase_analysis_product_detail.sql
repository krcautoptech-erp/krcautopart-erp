create or replace function public.get_purchase_analysis_product_detail(
  p_product_key text,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not public.authorize('po.view') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if nullif(btrim(p_product_key), '') is null
    or length(p_product_key) > 160
    or p_start_date is null or p_end_date is null or p_start_date > p_end_date
  then
    raise exception 'invalid_purchase_analysis_product_detail_filter' using errcode = '22023';
  end if;

  with items as materialized (
    select
      purchase_order.id po_id,
      purchase_order.po_number,
      purchase_order.document_date,
      purchase_order.vendor_id,
      purchase_order.vendor_code,
      purchase_order.vendor_name,
      po_item.id po_item_id,
      po_item.item_master_id,
      coalesce(nullif(po_item.item_code, ''), '-') item_code,
      po_item.item_name,
      po_item.unit_name,
      item_type.type_name item_type_name,
      po_item.quantity ordered_qty,
      po_item.unit_price,
      greatest(po_item.line_subtotal - po_item.discount_amount, 0) net_value,
      least(coalesce(receipt.received_qty, po_item.received_qty), po_item.quantity) received_qty,
      greatest(po_item.quantity - least(coalesce(receipt.received_qty, po_item.received_qty), po_item.quantity), 0) pending_qty,
      coalesce(po_item.delivery_date, purchase_order.delivery_date) delivery_date,
      least(coalesce(receipt.on_time_qty, 0), least(coalesce(receipt.received_qty, po_item.received_qty), po_item.quantity)) on_time_qty
    from public.purchase_orders purchase_order
    join public.purchase_order_items po_item on po_item.purchase_order_id = purchase_order.id
    left join public.item_master master on master.id = po_item.item_master_id
    left join public.item_types item_type on item_type.id = master.item_type_id
    left join lateral (
      select
        coalesce(sum(receipt_item.quantity_received), 0) received_qty,
        coalesce(sum(receipt_item.quantity_received) filter (
          where receipt.document_date <= coalesce(po_item.delivery_date, purchase_order.delivery_date)
        ), 0) on_time_qty
      from public.goods_receipt_items receipt_item
      join public.goods_receipts receipt on receipt.id = receipt_item.goods_receipt_id
      where receipt_item.purchase_order_item_id = po_item.id
        and receipt.status = 'posted'
    ) receipt on true
    where purchase_order.status in ('approved', 'sent', 'partially_received', 'received')
      and purchase_order.document_date between p_start_date and p_end_date
      and coalesce(
        po_item.item_master_id::text,
        concat('legacy:', coalesce(nullif(po_item.item_code, ''), '-'), ':', po_item.unit_name)
      ) = p_product_key
  ), po_summary as materialized (
    select
      po_id,
      po_number,
      document_date,
      vendor_id,
      vendor_code,
      vendor_name,
      min(delivery_date) delivery_date,
      sum(ordered_qty) ordered_qty,
      round(sum(net_value) / nullif(sum(ordered_qty), 0), 2) unit_price,
      sum(net_value) total_value,
      sum(received_qty) received_qty,
      sum(pending_qty) pending_qty,
      coalesce(100 * sum(received_qty) / nullif(sum(ordered_qty), 0), 0) received_rate,
      coalesce(100 * sum(on_time_qty) / nullif(sum(received_qty), 0), 0) on_time_rate
    from items
    group by po_id, po_number, document_date, vendor_id, vendor_code, vendor_name
  ), purchase_orders as (
    select document_date sort_date, po_number sort_number, jsonb_build_object(
      'id', po_id,
      'po_number', po_number,
      'vendor_id', vendor_id,
      'vendor_code', vendor_code,
      'vendor_name', vendor_name,
      'document_date', document_date,
      'delivery_date', delivery_date,
      'status', case when received_qty <= 0 then 'not_received' when pending_qty <= 0 then 'received' else 'partial' end,
      'ordered_qty', ordered_qty,
      'unit_price', unit_price,
      'total_value', total_value,
      'received_qty', received_qty,
      'pending_qty', pending_qty,
      'received_rate', received_rate,
      'on_time_rate', on_time_rate
    ) data
    from po_summary
  ), summary as (
    select
      count(distinct po_id)::integer po_count,
      count(distinct vendor_id)::integer vendor_count,
      coalesce(sum(ordered_qty), 0) ordered_qty,
      coalesce(sum(received_qty), 0) received_qty,
      coalesce(sum(pending_qty), 0) pending_qty,
      coalesce(sum(net_value), 0) total_value,
      coalesce(100 * sum(received_qty) / nullif(sum(ordered_qty), 0), 0) received_rate,
      coalesce(100 * sum(on_time_qty) / nullif(sum(received_qty), 0), 0) on_time_rate
    from items
  ), product as (
    select jsonb_build_object(
      'key', p_product_key,
      'code', item_code,
      'name', item_name,
      'item_type_name', item_type_name,
      'unit_name', unit_name
    ) data
    from items
    order by po_id, po_item_id
    limit 1
  )
  select jsonb_build_object(
    'product', (select data from product),
    'summary', (select to_jsonb(summary) from summary),
    'purchase_orders', coalesce((select jsonb_agg(data order by sort_date, sort_number) from purchase_orders), '[]'::jsonb)
  ) into v_result;

  if v_result -> 'product' is null or v_result -> 'product' = 'null'::jsonb then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

revoke all on function public.get_purchase_analysis_product_detail(text, date, date) from public, anon;
grant execute on function public.get_purchase_analysis_product_detail(text, date, date) to authenticated;
