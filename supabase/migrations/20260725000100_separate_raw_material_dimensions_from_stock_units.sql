insert into public.raw_material_units (
  unit_code,
  unit_name,
  symbol,
  allows_decimal,
  sort_order,
  status
)
values ('SHEET', 'แผ่น', 'แผ่น', false, 1, 'active')
on conflict (unit_code) do update
set
  unit_name = excluded.unit_name,
  symbol = excluded.symbol,
  allows_decimal = excluded.allows_decimal,
  sort_order = excluded.sort_order,
  status = excluded.status;

do $$
declare
  sheet_unit_id bigint;
begin
  select id
  into sheet_unit_id
  from public.raw_material_units
  where unit_code = 'SHEET';

  update public.raw_materials
  set unit_id = sheet_unit_id
  where unit_id in (
    select id
    from public.raw_material_units
    where upper(btrim(unit_code)) in ('MM', 'MILLIMETER')
      or lower(btrim(symbol)) in ('mm', 'มม.')
      or lower(btrim(unit_name)) in ('millimeter', 'millimetre', 'มิลลิเมตร')
  );

  delete from public.raw_material_units
  where upper(btrim(unit_code)) in ('MM', 'MILLIMETER')
    or lower(btrim(symbol)) in ('mm', 'มม.')
    or lower(btrim(unit_name)) in ('millimeter', 'millimetre', 'มิลลิเมตร');
end
$$;

alter table public.raw_material_units
  drop constraint if exists raw_material_units_not_dimension_unit;

alter table public.raw_material_units
  add constraint raw_material_units_not_dimension_unit
  check (
    upper(btrim(unit_code)) not in ('MM', 'MILLIMETER')
    and lower(btrim(symbol)) not in ('mm', 'มม.')
    and lower(btrim(unit_name)) not in ('millimeter', 'millimetre', 'มิลลิเมตร')
  );
