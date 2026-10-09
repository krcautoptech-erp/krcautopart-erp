create or replace function public.delete_unused_item_master_record(p_item_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_id bigint;
  v_reference record;
  v_is_referenced boolean;
begin
  if (select auth.uid()) is null
    or (
      not public.authorize('items.deactivate')
      and not public.authorize('items.edit')
    )
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_item_id is null or p_item_id <= 0 then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;

  select item.id
  into v_item_id
  from public.item_master as item
  where item.id = p_item_id
  for update;

  if not found then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;

  for v_reference in
    select
      source_schema.nspname as schema_name,
      source_table.relname as table_name,
      source_column.attname as column_name
    from pg_catalog.pg_constraint as foreign_key
    join pg_catalog.pg_class as source_table
      on source_table.oid = foreign_key.conrelid
    join pg_catalog.pg_namespace as source_schema
      on source_schema.oid = source_table.relnamespace
    cross join lateral pg_catalog.unnest(foreign_key.conkey)
      with ordinality as source_key(attnum, ordinality)
    join lateral pg_catalog.unnest(foreign_key.confkey)
      with ordinality as target_key(attnum, ordinality)
      on target_key.ordinality = source_key.ordinality
    join pg_catalog.pg_attribute as source_column
      on source_column.attrelid = source_table.oid
      and source_column.attnum = source_key.attnum
    join pg_catalog.pg_attribute as target_column
      on target_column.attrelid = foreign_key.confrelid
      and target_column.attnum = target_key.attnum
    where foreign_key.contype = 'f'
      and foreign_key.confrelid = 'public.item_master'::regclass
      and foreign_key.confdeltype <> 'n'
      and target_column.attname = 'id'
  loop
    execute pg_catalog.format(
      'select exists (select 1 from %I.%I where %I = $1)',
      v_reference.schema_name,
      v_reference.table_name,
      v_reference.column_name
    )
    into v_is_referenced
    using v_item_id;

    if v_is_referenced then
      raise exception 'item_in_use' using errcode = 'P0001';
    end if;
  end loop;

  begin
    delete from public.item_master
    where id = v_item_id;
  exception
    when foreign_key_violation then
      raise exception 'item_in_use' using errcode = 'P0001';
  end;
end;
$$;

revoke all on function public.delete_unused_item_master_record(bigint)
  from public, anon, authenticated;
grant execute on function public.delete_unused_item_master_record(bigint)
  to authenticated;