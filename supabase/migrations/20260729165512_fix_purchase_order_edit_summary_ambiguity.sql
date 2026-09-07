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
    'where purchase_order_id = p_purchase_order_id',
    'where purchase_order_items.purchase_order_id = p_purchase_order_id'
  );

  if fixed_definition <> current_definition then
    execute fixed_definition;
  end if;
end;
$migration$;
