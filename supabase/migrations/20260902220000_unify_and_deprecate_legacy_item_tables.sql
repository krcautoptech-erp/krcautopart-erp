-- ==============================================================================
-- Phase 4: Finalize Item Master Unification & Deprecate Legacy Product/RM Tables
-- ==============================================================================

-- 1. Optimize get_purchase_requisition_catalog() to query exclusively from item_master
-- (Eliminating the legacy raw_materials UNION scan for 100% unified performance)
create or replace function public.get_purchase_requisition_catalog()
returns table (
  source text,
  source_id bigint,
  item_code text,
  item_name text,
  item_description text,
  type_code text,
  type_name text,
  unit_id bigint,
  unit_name text,
  unit_symbol text,
  allows_decimal boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if not (public.authorize('pr.view') or public.authorize('pr.create') or public.authorize('pr.edit')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  select
    'item_master'::text,
    master.id,
    master.item_code,
    master.item_name,
    coalesce(nullif(btrim(master.description), ''), master.item_name),
    item_type.type_code,
    item_type.type_name,
    unit.id,
    unit.unit_name,
    unit.symbol,
    unit.allows_decimal
  from public.item_master master
  join public.item_types item_type
    on item_type.id = master.item_type_id
   and item_type.status = 'active'
   and item_type.is_purchasable = true
  join public.raw_material_units unit
    on unit.id = master.unit_id
   and unit.status = 'active'
  where master.status = 'active'
  order by item_type.sort_order asc, master.item_code asc;
end;
$$;

revoke all on function public.get_purchase_requisition_catalog() from public, anon;
grant execute on function public.get_purchase_requisition_catalog() to authenticated;

-- 2. Mark legacy tables as DEPRECATED in PostgreSQL metadata
comment on table public.products is 'DEPRECATED [Phase 4]: All product catalog data is unified into public.item_master (item_types.type_code = FG). Do not query or modify this table directly.';
comment on table public.raw_materials is 'DEPRECATED [Phase 4]: All raw material catalog data is unified into public.item_master (item_types.type_code = RM). Do not query or modify this table directly.';

-- 3. Guard legacy tables against accidental direct writes
create or replace function public.prevent_legacy_table_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'This legacy table (%) is deprecated. Please perform all operations on public.item_master instead.', TG_TABLE_NAME
    using errcode = '55000';
end;
$$;

drop trigger if exists guard_products_mutation on public.products;
create trigger guard_products_mutation
before insert or update on public.products
for each statement execute function public.prevent_legacy_table_mutation();

drop trigger if exists guard_raw_materials_mutation on public.raw_materials;
create trigger guard_raw_materials_mutation
before insert or update on public.raw_materials
for each statement execute function public.prevent_legacy_table_mutation();

notify pgrst, 'reload schema';
