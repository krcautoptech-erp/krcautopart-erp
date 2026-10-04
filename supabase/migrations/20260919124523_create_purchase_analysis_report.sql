create or replace function public.get_purchase_analysis_report(
  p_view text,
  p_start_date date,
  p_end_date date,
  p_vendor_id bigint default null,
  p_item_type_id bigint default null,
  p_search text default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_offset integer;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not public.authorize('po.view') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_view not in ('vendor', 'product')
    or p_start_date is null or p_end_date is null or p_start_date > p_end_date
    or p_page < 1 or p_page_size not between 1 and 500
  then
    raise exception 'invalid_purchase_analysis_filter' using errcode = '22023';
  end if;

  v_offset := (p_page - 1) * p_page_size;

  with eligible as materialized (
    select
      purchase_order.id po_id,
      purchase_order.vendor_id,
      purchase_order.vendor_code,
      purchase_order.vendor_name,
      po_item.id po_item_id,
      po_item.item_master_id,
      coalesce(nullif(po_item.item_code, ''), '-') item_code,
      po_item.item_name,
      po_item.unit_name,
      master.item_type_id,
      item_type.type_name item_type_name,
      po_item.quantity ordered_qty,
      least(po_item.received_qty, po_item.quantity) received_qty,
      greatest(po_item.quantity - po_item.received_qty, 0) pending_qty,
      greatest(po_item.line_subtotal - po_item.discount_amount, 0) net_value,
      coalesce(po_item.delivery_date, purchase_order.delivery_date) due_date,
      least(coalesce(receipt.on_time_qty, 0), least(po_item.received_qty, po_item.quantity)) on_time_qty
    from public.purchase_orders purchase_order
    join public.purchase_order_items po_item on po_item.purchase_order_id = purchase_order.id
    left join public.item_master master on master.id = po_item.item_master_id
    left join public.item_types item_type on item_type.id = master.item_type_id
    left join lateral (
      select sum(receipt_item.quantity_received) filter (
        where receipt.document_date <= coalesce(po_item.delivery_date, purchase_order.delivery_date)
      ) on_time_qty
      from public.goods_receipt_items receipt_item
      join public.goods_receipts receipt on receipt.id = receipt_item.goods_receipt_id
      where receipt_item.purchase_order_item_id = po_item.id
        and receipt.status = 'posted'
    ) receipt on true
    where purchase_order.status in ('approved', 'sent', 'partially_received', 'received')
      and purchase_order.document_date between p_start_date and p_end_date
  ), base as materialized (
    select eligible.*,
      round(net_value * received_qty / nullif(ordered_qty, 0), 2) received_value,
      round(net_value * pending_qty / nullif(ordered_qty, 0), 2) pending_value
    from eligible
    where (p_vendor_id is null or vendor_id = p_vendor_id)
      and (p_item_type_id is null or item_type_id = p_item_type_id)
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or (p_view = 'vendor' and (vendor_code ilike '%' || btrim(p_search) || '%' or vendor_name ilike '%' || btrim(p_search) || '%'))
        or (p_view = 'product' and (item_code ilike '%' || btrim(p_search) || '%' or item_name ilike '%' || btrim(p_search) || '%'))
      )
  ), grouped as materialized (
    select
      vendor_id::text group_id,
      vendor_code code,
      vendor_name name,
      null::text meta,
      count(distinct po_id)::integer po_count,
      1::integer vendor_count,
      sum(ordered_qty) ordered_qty,
      sum(received_qty) received_qty,
      sum(pending_qty) pending_qty,
      sum(net_value) total_value,
      sum(received_value) received_value,
      sum(pending_value) pending_value,
      sum(net_value) / nullif(sum(ordered_qty), 0) average_price,
      100 * sum(received_qty) / nullif(sum(ordered_qty), 0) received_rate,
      100 * sum(on_time_qty) / nullif(sum(received_qty), 0) on_time_rate
    from base where p_view = 'vendor'
    group by vendor_id, vendor_code, vendor_name
    union all
    select
      coalesce(item_master_id::text, concat('legacy:', item_code, ':', unit_name)),
      item_code,
      item_name,
      concat_ws(' · ', nullif(item_type_name, ''), 'หน่วย: ' || unit_name),
      count(distinct po_id)::integer,
      count(distinct vendor_id)::integer,
      sum(ordered_qty), sum(received_qty), sum(pending_qty), sum(net_value),
      sum(received_value), sum(pending_value),
      sum(net_value) / nullif(sum(ordered_qty), 0),
      100 * sum(received_qty) / nullif(sum(ordered_qty), 0),
      100 * sum(on_time_qty) / nullif(sum(received_qty), 0)
    from base where p_view = 'product'
    group by item_master_id, item_code, item_name, item_type_name, unit_name
  ), page_rows as (
    select to_jsonb(grouped) row_data, name sort_name, code sort_code
    from grouped
    order by total_value desc, name, code
    limit p_page_size offset v_offset
  ), summary as (
    select
      count(distinct vendor_id)::integer vendor_count,
      count(distinct po_id)::integer po_count,
      coalesce(sum(ordered_qty), 0) ordered_qty,
      coalesce(sum(received_qty), 0) received_qty,
      coalesce(sum(pending_qty), 0) pending_qty,
      coalesce(sum(net_value), 0) total_value,
      coalesce(100 * sum(received_qty) / nullif(sum(ordered_qty), 0), 0) received_rate,
      coalesce(100 * sum(on_time_qty) / nullif(sum(received_qty), 0), 0) on_time_rate
    from base
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(row_data order by sort_name, sort_code) from page_rows), '[]'::jsonb),
    'total', (select count(*) from grouped),
    'summary', (select to_jsonb(summary) from summary),
    'options', jsonb_build_object(
      'vendors', coalesce((select jsonb_agg(option order by option ->> 'name') from (
        select distinct jsonb_build_object('id', vendor_id, 'code', vendor_code, 'name', vendor_name) option from eligible
      ) vendor_options), '[]'::jsonb),
      'groups', coalesce((select jsonb_agg(option order by option ->> 'name') from (
        select distinct jsonb_build_object('id', item_type_id, 'name', item_type_name) option
        from eligible where item_type_id is not null
      ) group_options), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_purchase_analysis_report(text, date, date, bigint, bigint, text, integer, integer) from public, anon;
grant execute on function public.get_purchase_analysis_report(text, date, date, bigint, bigint, text, integer, integer) to authenticated;
