do $migration$
declare
  v_function_definition text;
  v_ambiguous_clause constant text :=
    'where purchase_order_id = v_po.id';
  v_qualified_clause constant text :=
    'where purchase_order_items.purchase_order_id = v_po.id';
begin
  select pg_get_functiondef(proc.oid)
  into v_function_definition
  from pg_proc proc
  join pg_namespace namespace
    on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.proname = 'create_purchase_order'
    and pg_get_function_identity_arguments(proc.oid) =
      'p_document_date date, p_vendor_id bigint, p_delivery_date date, p_delivery_address text, p_supplier_note text, p_terms_and_conditions text, p_status text, p_items jsonb';

  if v_function_definition is null then
    raise exception 'create_purchase_order_function_not_found';
  end if;

  if strpos(v_function_definition, v_ambiguous_clause) = 0 then
    if strpos(v_function_definition, v_qualified_clause) > 0 then
      return;
    end if;

    raise exception 'create_purchase_order_ambiguous_clause_not_found';
  end if;

  execute replace(
    v_function_definition,
    v_ambiguous_clause,
    v_qualified_clause
  );
end;
$migration$;
