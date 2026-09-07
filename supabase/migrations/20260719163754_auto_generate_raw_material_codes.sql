create sequence if not exists public.raw_material_code_seq;
grant usage, select on sequence public.raw_material_code_seq to authenticated;

do $$
declare
  highest_existing_code bigint;
begin
  select coalesce(
    max(substring(upper(material_code) from '^RM([0-9]+)$')::bigint),
    0
  )
  into highest_existing_code
  from public.raw_materials
  where upper(material_code) ~ '^RM[0-9]+$';

  if highest_existing_code > 0 then
    perform setval('public.raw_material_code_seq', highest_existing_code, true);
  else
    perform setval('public.raw_material_code_seq', 1, false);
  end if;
end $$;

create or replace function public.assign_raw_material_code()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_code_number bigint;
begin
  if new.material_code is null or length(btrim(new.material_code)) = 0 then
    loop
      next_code_number := nextval('public.raw_material_code_seq');
      new.material_code := 'RM' || lpad(
        next_code_number::text,
        greatest(3, length(next_code_number::text)),
        '0'
      );

      exit when not exists (
        select 1
        from public.raw_materials existing
        where upper(existing.material_code) = new.material_code
      );
    end loop;
  end if;

  return new;
end;
$$;

create or replace function public.reserve_raw_material_code()
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_code text;
  next_code_number bigint;
begin
  loop
    next_code_number := nextval('public.raw_material_code_seq');
    next_code := 'RM' || lpad(
      next_code_number::text,
      greatest(3, length(next_code_number::text)),
      '0'
    );

    exit when not exists (
      select 1
      from public.raw_materials existing
      where upper(existing.material_code) = next_code
    );
  end loop;

  return next_code;
end;
$$;

grant execute on function public.reserve_raw_material_code() to authenticated;

drop trigger if exists assign_raw_material_code_before_insert on public.raw_materials;
create trigger assign_raw_material_code_before_insert
before insert on public.raw_materials
for each row execute function public.assign_raw_material_code();
