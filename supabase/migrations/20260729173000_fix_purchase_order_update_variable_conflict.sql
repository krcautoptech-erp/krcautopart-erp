do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef(procedure.oid)
  into function_definition
  from pg_proc procedure
  join pg_namespace namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'update_purchase_order'
    and pg_get_function_identity_arguments(procedure.oid) =
      'p_purchase_order_id bigint, p_document_date date, p_vendor_id bigint, p_delivery_date date, p_delivery_address text, p_supplier_note text, p_terms_and_conditions text, p_status text, p_items jsonb';

  if function_definition is null then
    raise exception 'public.update_purchase_order was not found';
  end if;

  if position('#variable_conflict use_column' in function_definition) = 0 then
    function_definition := replace(
      function_definition,
      'AS $function$',
      E'AS $function$\n#variable_conflict use_column'
    );
    execute function_definition;
  end if;
end;
$migration$;
