do $$
declare
  missing_grade_count bigint;
begin
  if to_regclass('public.materials') is not null then
    execute $migration$
      insert into public.raw_material_grades (
        grade_code,
        grade_name,
        sort_order,
        status
      )
      select
        upper(btrim(legacy.material_name)),
        upper(btrim(legacy.material_name)),
        coalesce((select max(configured.sort_order) from public.raw_material_grades configured), 0)
          + row_number() over (order by legacy.material_name),
        case
          when legacy.status in ('ระงับการใช้งาน', 'inactive') then 'inactive'
          else 'active'
        end
      from public.materials legacy
      where length(btrim(legacy.material_name)) > 0
      on conflict do nothing
    $migration$;

    execute $validation$
      select count(*)
      from public.materials legacy
      where length(btrim(legacy.material_name)) > 0
        and not exists (
          select 1
          from public.raw_material_grades configured
          where upper(btrim(configured.grade_name)) = upper(btrim(legacy.material_name))
        )
    $validation$
    into missing_grade_count;

    if missing_grade_count > 0 then
      raise exception 'Legacy material migration is incomplete: % grade(s) are missing', missing_grade_count;
    end if;

    drop table public.materials;
  end if;
end $$;
