create sequence if not exists public.raw_material_code_seq;

do $$
declare
  current_sequence_called boolean;
  current_sequence_value bigint;
  highest_existing_code bigint;
  synchronized_value bigint;
begin
  select last_value, is_called
  into current_sequence_value, current_sequence_called
  from public.raw_material_code_seq;

  select coalesce(
    max(substring(upper(material_code) from '^RM([0-9]+)$')::bigint),
    0
  )
  into highest_existing_code
  from public.raw_materials
  where upper(material_code) ~ '^RM[0-9]+$';

  synchronized_value := greatest(highest_existing_code, 1);
  perform setval(
    'public.raw_material_code_seq',
    synchronized_value,
    highest_existing_code > 0
  );
end $$;

grant usage, select on sequence public.raw_material_code_seq to authenticated;

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

revoke all on function public.reserve_raw_material_code() from public, anon;
grant execute on function public.reserve_raw_material_code() to authenticated;

create or replace function public.assign_raw_material_code()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.material_code is null or length(btrim(new.material_code)) = 0 then
    new.material_code := public.reserve_raw_material_code();
  end if;

  return new;
end;
$$;

drop trigger if exists assign_raw_material_code_before_insert on public.raw_materials;
create trigger assign_raw_material_code_before_insert
before insert on public.raw_materials
for each row execute function public.assign_raw_material_code();

notify pgrst, 'reload schema';
