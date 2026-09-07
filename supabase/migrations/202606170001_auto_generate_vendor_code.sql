create sequence if not exists public.vendor_code_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1;

do $$
declare
  max_code bigint;
begin
  select coalesce(max(substring(vendor_code from '^VEN([0-9]+)$')::bigint), 0)
    into max_code
  from public.vendors
  where vendor_code ~ '^VEN[0-9]+$';

  perform setval('public.vendor_code_seq', greatest(max_code, 1), max_code > 0);
end $$;

create or replace function public.generate_vendor_code()
returns text
language plpgsql
as $$
begin
  return 'VEN' || lpad(nextval('public.vendor_code_seq')::text, 3, '0');
end;
$$;

create or replace function public.set_vendor_code()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and (new.vendor_code is null or length(btrim(new.vendor_code)) = 0) then
    new.vendor_code := public.generate_vendor_code();
  end if;

  return new;
end;
$$;

drop trigger if exists set_vendor_code_before_insert on public.vendors;
create trigger set_vendor_code_before_insert
before insert on public.vendors
for each row execute function public.set_vendor_code();
