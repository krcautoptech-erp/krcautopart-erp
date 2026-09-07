-- Draft purchase orders are working copies and must not reserve approved PR
-- quantities. The reservation starts when a PO is submitted for approval.
do $migration$
declare
  v_create_function text;
  v_old_predicate constant text :=
    'purchase_order.status not in (''cancelled'', ''rejected'')';
  v_new_predicate constant text :=
    'purchase_order.status in (''pending_approval'', ''approved'', ''sent'', ''partially_received'', ''received'')';
begin
  select pg_get_functiondef(proc.oid)
  into v_create_function
  from pg_proc proc
  join pg_namespace namespace
    on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'create_purchase_order'
    and pg_get_function_identity_arguments(proc.oid) =
      'p_document_date date, p_vendor_id bigint, p_delivery_date date, p_delivery_address text, p_supplier_note text, p_terms_and_conditions text, p_status text, p_items jsonb';

  if v_create_function is null then
    raise exception 'create_purchase_order_function_not_found';
  end if;

  if strpos(v_create_function, v_old_predicate) > 0 then
    execute replace(v_create_function, v_old_predicate, v_new_predicate);
  elsif strpos(v_create_function, v_new_predicate) = 0 then
    raise exception 'create_purchase_order_allocation_predicate_not_found';
  end if;
end;
$migration$;

create or replace function public.search_purchase_order_source_items(
  p_search text default null,
  p_limit integer default 80
)
returns table (
  requisition_item_id bigint,
  requisition_id bigint,
  pr_number text,
  item_code text,
  item_name text,
  item_description text,
  requested_quantity numeric,
  available_quantity numeric,
  unit_name text,
  needed_by_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    item.id,
    item.requisition_id,
    requisition.pr_number,
    item.item_code,
    item.item_name,
    item.item_description,
    item.quantity,
    item.quantity - coalesce(allocated.quantity, 0),
    item.unit_name,
    item.needed_by_date
  from public.purchase_requisition_items item
  join public.purchase_requisitions requisition
    on requisition.id = item.requisition_id
    and requisition.status = 'approved'
  left join lateral (
    select sum(po_item.quantity) as quantity
    from public.purchase_order_items po_item
    join public.purchase_orders purchase_order
      on purchase_order.id = po_item.purchase_order_id
    where po_item.requisition_item_id = item.id
      and purchase_order.status in (
        'pending_approval',
        'approved',
        'sent',
        'partially_received',
        'received'
      )
  ) allocated on true
  where public.authorize('po.create')
    and item.quantity - coalesce(allocated.quantity, 0) > 0
    and (
      nullif(btrim(p_search), '') is null
      or requisition.pr_number ilike '%' || btrim(p_search) || '%'
      or coalesce(item.item_code, '') ilike '%' || btrim(p_search) || '%'
      or item.item_name ilike '%' || btrim(p_search) || '%'
      or coalesce(item.item_description, '') ilike '%' || btrim(p_search) || '%'
    )
  order by requisition.document_date desc, requisition.id desc, item.line_no
  limit least(greatest(coalesce(p_limit, 80), 1), 200);
$$;

revoke all on function public.search_purchase_order_source_items(text, integer)
  from public, anon;
grant execute on function public.search_purchase_order_source_items(text, integer)
  to authenticated;
