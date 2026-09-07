do $migration$
declare
  current_definition text;
  fixed_definition text;
begin
  select pg_get_functiondef(proc.oid)
  into current_definition
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'update_purchase_order'
    and pg_get_function_identity_arguments(proc.oid) =
      'p_purchase_order_id bigint, p_document_date date, p_vendor_id bigint, p_delivery_date date, p_delivery_address text, p_supplier_note text, p_terms_and_conditions text, p_status text, p_items jsonb';

  if current_definition is null then
    raise exception 'update_purchase_order function not found';
  end if;

  fixed_definition := replace(
    current_definition,
    'where purchase_order_id = p_purchase_order_id;',
    'where purchase_order_items.purchase_order_id = p_purchase_order_id;'
  );
  fixed_definition := replace(
    fixed_definition,
    'where purchase_order_id = p_purchase_order_id',
    'where purchase_order_items.purchase_order_id = p_purchase_order_id'
  );

  if fixed_definition <> current_definition then
    execute fixed_definition;
  end if;
end;
$migration$;

create or replace function public.get_purchase_order_edit_capacities(
  p_purchase_order_id bigint
)
returns table (
  requisition_item_id bigint,
  max_quantity numeric
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if not public.authorize('po.edit') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.purchase_orders purchase_order
    where purchase_order.id = p_purchase_order_id
      and purchase_order.status in ('draft', 'pending_approval')
  ) then
    raise exception 'purchase_order_cannot_be_edited' using errcode = '55000';
  end if;

  return query
  select
    current_item.requisition_item_id,
    greatest(
      requisition_item.quantity -
        coalesce(
          sum(
            case
              when other_order.id is not null then other_item.quantity
              else 0
            end
          ),
          0
        ),
      0
    ) as max_quantity
  from public.purchase_order_items current_item
  join public.purchase_requisition_items requisition_item
    on requisition_item.id = current_item.requisition_item_id
  left join public.purchase_order_items other_item
    on other_item.requisition_item_id = current_item.requisition_item_id
    and other_item.purchase_order_id <> p_purchase_order_id
  left join public.purchase_orders other_order
    on other_order.id = other_item.purchase_order_id
    and other_order.status not in ('cancelled', 'rejected')
  where current_item.purchase_order_id = p_purchase_order_id
  group by current_item.requisition_item_id, requisition_item.quantity;
end;
$function$;

revoke all on function public.get_purchase_order_edit_capacities(bigint)
from public, anon;
grant execute on function public.get_purchase_order_edit_capacities(bigint)
to authenticated;
