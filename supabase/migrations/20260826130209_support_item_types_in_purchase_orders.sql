drop function if exists public.search_purchase_order_source_items(text, integer);

create function public.search_purchase_order_source_items(p_search text default null, p_limit integer default 80)
returns table (requisition_item_id bigint, requisition_id bigint, pr_number text, item_type_code text, item_code text, item_name text, item_description text, requested_quantity numeric, available_quantity numeric, unit_name text, needed_by_date date)
language sql stable security definer set search_path = ''
as $$
  select item.id, item.requisition_id, requisition.pr_number,
    case
      when item.item_type = 'raw_material' then 'RM'
      when item.item_type = 'legacy' then 'ITEM'
      else coalesce(nullif(upper(btrim(item.item_type)), ''), 'ITEM')
    end,
    item.item_code,
    item.item_name, item.item_description, item.quantity,
    item.quantity - coalesce(allocated.quantity, 0), item.unit_name,
    item.needed_by_date
  from public.purchase_requisition_items item
  join public.purchase_requisitions requisition on requisition.id = item.requisition_id and requisition.status = 'approved'
  left join lateral (
    select sum(po_item.quantity) as quantity
    from public.purchase_order_items po_item
    join public.purchase_orders purchase_order on purchase_order.id = po_item.purchase_order_id
    where po_item.requisition_item_id = item.id
      and purchase_order.status in ('pending_approval', 'approved', 'sent', 'partially_received', 'received')
  ) allocated on true
  where public.authorize('po.create')
    and item.quantity - coalesce(allocated.quantity, 0) > 0
    and (nullif(btrim(p_search), '') is null
      or requisition.pr_number ilike '%' || btrim(p_search) || '%'
      or coalesce(item.item_type, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(item.item_code, '') ilike '%' || btrim(p_search) || '%'
      or item.item_name ilike '%' || btrim(p_search) || '%'
      or coalesce(item.item_description, '') ilike '%' || btrim(p_search) || '%')
  order by requisition.document_date desc, requisition.id desc, item.line_no
  limit least(greatest(coalesce(p_limit, 80), 1), 200);
$$;

revoke all on function public.search_purchase_order_source_items(text, integer) from public, anon;
grant execute on function public.search_purchase_order_source_items(text, integer) to authenticated;
