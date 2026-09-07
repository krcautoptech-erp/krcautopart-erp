drop trigger if exists item_master_claim_code_before_insert
  on public.item_master;
drop trigger if exists item_master_mark_code_claimed_after_insert
  on public.item_master;

do $$
declare
  v_default_unit_id bigint;
  v_fg_type_id bigint;
  v_product_id_type text;
  v_rm_type_id bigint;
begin
  select id into v_default_unit_id
  from public.raw_material_units
  where status = 'active'
  order by sort_order, id
  limit 1;

  select id into v_rm_type_id
  from public.item_types
  where type_code = 'RM'
  limit 1;

  select id into v_fg_type_id
  from public.item_types
  where type_code = 'FG'
  limit 1;

  if v_rm_type_id is not null then
    insert into public.item_master (
      item_type_id,
      item_code,
      item_name,
      item_name_en,
      description,
      unit_id,
      tracking_method,
      reorder_point,
      attributes,
      status,
      created_at,
      updated_at
    )
    select
      v_rm_type_id,
      raw.material_code,
      raw.material_name,
      null,
      nullif(btrim(coalesce(raw.remark, '')), ''),
      coalesce(raw.unit_id, v_default_unit_id),
      'lot',
      raw.reorder_point,
      jsonb_build_object(
        'legacySource', 'raw_material',
        'legacySourceId', raw.id,
        'groupId', raw.group_id,
        'gradeId', raw.grade_id,
        'warehouseId', raw.warehouse_id,
        'thickness', raw.thickness_mm,
        'width', raw.width_mm,
        'length', raw.length_mm,
        'dimensionUnit', 'มม.'
      ),
      case when raw.status = 'inactive' then 'inactive' else 'active' end,
      raw.created_at,
      raw.updated_at
    from public.raw_materials raw
    where raw.material_code is not null
      and coalesce(raw.unit_id, v_default_unit_id) is not null
      and not exists (
        select 1
        from public.item_master master
        where upper(master.item_code) = upper(raw.material_code)
           or (
            master.attributes ->> 'legacySource' = 'raw_material'
            and (master.attributes ->> 'legacySourceId')::bigint = raw.id
          )
      );
  end if;

  if v_fg_type_id is not null and to_regclass('public.products') is not null then
    select data_type
    into v_product_id_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'id';

    execute format($sql$
      insert into public.item_master (
        item_type_id,
        item_code,
        item_name,
        item_name_en,
        description,
        unit_id,
        tracking_method,
        reorder_point,
        attributes,
        status,
        created_at,
        updated_at
      )
      select
        %L::bigint,
        coalesce(nullif(btrim(product.erp_code), ''), nullif(btrim(product.part_number), '')),
        product.part_name,
        null,
        null,
        coalesce(unit_match.id, %L::bigint),
        'none',
        null,
        jsonb_build_object(
          'legacySource', 'product',
          'legacySourceId', product.id::text,
          'partNumber', product.part_number,
          'model', product.model,
          'gradeName', product.material,
          'standard', product.std_no,
          'plating', product.plating,
          'sheetsPerUnit', product.sheet_count,
          'piecesPerSheet', product.parts_per_sheet,
          'primaryImage', product.primary_image,
          'costPrice', product.cost_price,
          'sellingPrice', product.selling_price
        ),
        case when product.status in ('inactive', 'ระงับการใช้งาน') then 'inactive' else 'active' end,
        coalesce(product.created_at, now()),
        coalesce(product.created_at, now())
      from public.products product
      left join public.raw_material_units unit_match
        on unit_match.status = 'active'
       and (
          unit_match.symbol = product.unit
          or unit_match.unit_name = product.unit
          or concat(unit_match.unit_name, ' (', unit_match.symbol, ')') = product.unit
        )
      where coalesce(nullif(btrim(product.erp_code), ''), nullif(btrim(product.part_number), '')) is not null
        and coalesce(unit_match.id, %L::bigint) is not null
        and not exists (
          select 1
          from public.item_master master
          where upper(master.item_code) = upper(coalesce(nullif(btrim(product.erp_code), ''), nullif(btrim(product.part_number), '')))
             or (
              master.attributes ->> 'legacySource' = 'product'
              and master.attributes ->> 'legacySourceId' = product.id::text
            )
        )
    $sql$, v_fg_type_id, v_default_unit_id, v_default_unit_id);
  end if;
end $$;

create trigger item_master_claim_code_before_insert
before insert on public.item_master
for each row execute function erp_private.prepare_item_code_claim();

create trigger item_master_mark_code_claimed_after_insert
after insert on public.item_master
for each row execute function erp_private.mark_item_code_claimed();

create or replace function public.get_purchase_requisition_catalog()
returns table (
  source text, source_id bigint, item_code text, item_name text,
  item_description text, type_code text, type_name text,
  unit_id bigint, unit_name text, unit_symbol text, allows_decimal boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not (public.authorize('pr.view') or public.authorize('pr.create') or public.authorize('pr.edit')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return query
  select 'item_master'::text, master.id, master.item_code, master.item_name,
    coalesce(nullif(btrim(master.description), ''), master.item_name),
    item_type.type_code, item_type.type_name, unit.id, unit.unit_name, unit.symbol, unit.allows_decimal
  from public.item_master master
  join public.item_types item_type on item_type.id = master.item_type_id and item_type.status = 'active' and item_type.is_purchasable
  join public.raw_material_units unit on unit.id = master.unit_id and unit.status = 'active'
  where master.status = 'active'
  union all
  select 'raw_material'::text, raw.id, raw.material_code, raw.material_name,
    concat(raw.material_name, ' ', grade.grade_name, ' ', trim(to_char(raw.thickness_mm, 'FM999999990.00')), ' × ', trim(to_char(raw.width_mm, 'FM999999990')), ' × ', trim(to_char(raw.length_mm, 'FM999999990')), ' มม.'),
    item_type.type_code, item_type.type_name, unit.id, unit.unit_name, unit.symbol, unit.allows_decimal
  from public.raw_materials raw
  join public.raw_material_grades grade on grade.id = raw.grade_id
  join public.raw_material_units unit on unit.id = raw.unit_id and unit.status = 'active'
  join public.item_types item_type on item_type.type_code = 'RM' and item_type.status = 'active' and item_type.is_purchasable
  where raw.status = 'active'
    and not exists (
      select 1
      from public.item_master master
      where master.attributes ->> 'legacySource' = 'raw_material'
        and (master.attributes ->> 'legacySourceId')::bigint = raw.id
    )
  order by 6, 3;
end;
$$;

revoke all on function public.get_purchase_requisition_catalog() from public;
grant execute on function public.get_purchase_requisition_catalog() to authenticated;

notify pgrst, 'reload schema';
