create or replace function public.get_purchase_analysis_vendor_detail(
  p_vendor_id bigint,
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
  if p_vendor_id is null or p_vendor_id <= 0
    or p_start_date is null or p_end_date is null or p_start_date > p_end_date
  then
    raise exception 'invalid_purchase_analysis_vendor_detail_filter' using errcode = '22023';
  end if;

  with orders as materialized (
    select po.id, po.po_number, po.document_date, po.delivery_date
    from public.purchase_orders po
    where po.vendor_id = p_vendor_id
      and po.document_date between p_start_date and p_end_date
      and po.status in ('approved', 'sent', 'partially_received', 'received')
  ), receipt_totals as materialized (
    select
      receipt_item.purchase_order_item_id,
      coalesce(sum(receipt_item.quantity_received), 0) received_qty,
      coalesce(sum(receipt_item.quantity_received) filter (
        where receipt.document_date <= coalesce(po_item.delivery_date, purchase_order.delivery_date)
      ), 0) on_time_qty
    from public.goods_receipt_items receipt_item
    join public.goods_receipts receipt on receipt.id = receipt_item.goods_receipt_id and receipt.status = 'posted'
    join public.purchase_order_items po_item on po_item.id = receipt_item.purchase_order_item_id
    join orders purchase_order on purchase_order.id = po_item.purchase_order_id
    group by receipt_item.purchase_order_item_id
  ), items as materialized (
    select
      po.id po_id,
      po.po_number,
      po.document_date,
      po_item.id,
      po_item.line_no,
      coalesce(nullif(po_item.item_code, ''), '-') item_code,
      po_item.item_name,
      po_item.quantity ordered_qty,
      po_item.unit_name,
      po_item.unit_price,
      greatest(po_item.line_subtotal - po_item.discount_amount, 0) net_value,
      least(coalesce(receipt.received_qty, po_item.received_qty), po_item.quantity) received_qty,
      greatest(po_item.quantity - least(coalesce(receipt.received_qty, po_item.received_qty), po_item.quantity), 0) pending_qty,
      coalesce(po_item.delivery_date, po.delivery_date) delivery_date,
      least(coalesce(receipt.on_time_qty, 0), least(coalesce(receipt.received_qty, po_item.received_qty), po_item.quantity)) on_time_qty
    from orders po
    join public.purchase_order_items po_item on po_item.purchase_order_id = po.id
    left join receipt_totals receipt on receipt.purchase_order_item_id = po_item.id
  ), po_summary as materialized (
    select
      po_id,
      po_number,
      document_date,
      min(delivery_date) delivery_date_from,
      max(delivery_date) delivery_date_to,
      sum(ordered_qty) ordered_qty,
      sum(received_qty) received_qty,
      sum(pending_qty) pending_qty,
      sum(net_value) total_value,
      round(sum(net_value * received_qty / nullif(ordered_qty, 0)), 2) received_value,
      round(sum(net_value * pending_qty / nullif(ordered_qty, 0)), 2) pending_value,
      coalesce(100 * sum(received_qty) / nullif(sum(ordered_qty), 0), 0) received_rate,
      coalesce(100 * sum(on_time_qty) / nullif(sum(received_qty), 0), 0) on_time_rate
    from items
    group by po_id, po_number, document_date
  ), purchase_orders as (
    select po.document_date sort_date, po.po_number sort_number, jsonb_build_object(
      'id', po.po_id,
      'po_number', po.po_number,
      'document_date', po.document_date,
      'delivery_date_from', po.delivery_date_from,
      'delivery_date_to', po.delivery_date_to,
      'status', case when po.received_qty <= 0 then 'not_received' when po.pending_qty <= 0 then 'received' else 'partial' end,
      'ordered_qty', po.ordered_qty,
      'received_qty', po.received_qty,
      'pending_qty', po.pending_qty,
      'total_value', po.total_value,
      'received_value', po.received_value,
      'pending_value', po.pending_value,
      'received_rate', po.received_rate,
      'on_time_rate', po.on_time_rate,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', item.id,
          'line_no', item.line_no,
          'item_code', item.item_code,
          'item_name', item.item_name,
          'ordered_qty', item.ordered_qty,
          'unit_name', item.unit_name,
          'unit_price', item.unit_price,
          'net_value', item.net_value,
          'received_qty', item.received_qty,
          'pending_qty', item.pending_qty,
          'delivery_date', item.delivery_date
        ) order by item.line_no)
        from items item where item.po_id = po.po_id
      ), '[]'::jsonb)
    ) data
    from po_summary po
    order by po.document_date, po.po_number
  ), summary as (
    select
      count(distinct po_id)::integer po_count,
      coalesce(sum(net_value), 0) total_value,
      coalesce(round(sum(net_value * received_qty / nullif(ordered_qty, 0)), 2), 0) received_value,
      coalesce(round(sum(net_value * pending_qty / nullif(ordered_qty, 0)), 2), 0) pending_value,
      coalesce(100 * sum(received_qty) / nullif(sum(ordered_qty), 0), 0) received_rate,
      coalesce(100 * sum(on_time_qty) / nullif(sum(received_qty), 0), 0) on_time_rate
    from items
  )
  select jsonb_build_object(
    'vendor', jsonb_build_object(
      'id', vendor.id,
      'code', vendor.vendor_code,
      'name', vendor.vendor_name,
      'tax_no', vendor.tax_no,
      'branch', vendor.branch,
      'contact_name', vendor.contact_name,
      'phone', vendor.phone,
      'email', vendor.email,
      'address', address.address_line
    ),
    'summary', (select to_jsonb(summary) from summary),
    'purchase_orders', coalesce((select jsonb_agg(data order by sort_date, sort_number) from purchase_orders), '[]'::jsonb)
  ) into v_result
  from public.vendors vendor
  left join lateral (
    select vendor_address.address_line
    from public.vendor_addresses vendor_address
    where vendor_address.vendor_id = vendor.id and vendor_address.status = 'ใช้งาน'
    order by vendor_address.is_default desc, vendor_address.id
    limit 1
  ) address on true
  where vendor.id = p_vendor_id;

  if v_result is null then
    raise exception 'vendor_not_found' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

revoke all on function public.get_purchase_analysis_vendor_detail(bigint, date, date) from public, anon;
grant execute on function public.get_purchase_analysis_vendor_detail(bigint, date, date) to authenticated;
