create table if not exists public.customers (
  id bigint generated always as identity primary key,
  customer_code text not null,
  customer_name text not null,
  customer_type_id bigint not null references public.partner_customer_types(id),
  tax_no text not null,
  branch text,
  contact_name text,
  phone text,
  email text,
  credit_term_id bigint not null references public.vendor_credit_terms(id),
  tax_type_id bigint not null references public.vendor_tax_types(id),
  status text not null default 'ใช้งาน',
  remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_customer_code_unique unique (customer_code),
  constraint customers_customer_code_not_blank check (length(btrim(customer_code)) > 0),
  constraint customers_customer_name_not_blank check (length(btrim(customer_name)) > 0),
  constraint customers_tax_no_not_blank check (length(btrim(tax_no)) > 0),
  constraint customers_status_check check (status in ('ใช้งาน', 'ระงับการใช้งาน'))
);

create table if not exists public.customer_addresses (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  address_name text not null,
  address_line text not null,
  contact_name text,
  phone text,
  country text,
  house_no text,
  floor text,
  building text,
  road text,
  province text,
  district text,
  subdistrict text,
  postal_code text,
  is_default boolean not null default false,
  status text not null default 'ใช้งาน',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_addresses_name_not_blank check (length(btrim(address_name)) > 0),
  constraint customer_addresses_line_not_blank check (length(btrim(address_line)) > 0),
  constraint customer_addresses_status_check check (status in ('ใช้งาน', 'ระงับการใช้งาน'))
);

create sequence if not exists public.customer_code_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1;

do $$
declare
  max_code bigint;
begin
  select coalesce(max(substring(customer_code from '^CUS([0-9]+)$')::bigint), 0)
    into max_code
  from public.customers
  where customer_code ~ '^CUS[0-9]+$';

  perform setval('public.customer_code_seq', greatest(max_code, 1), max_code > 0);
end $$;

create or replace function public.generate_customer_code()
returns text
language plpgsql
as $$
begin
  return 'CUS' || lpad(nextval('public.customer_code_seq')::text, 3, '0');
end;
$$;

create or replace function public.set_customer_code()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and (new.customer_code is null or length(btrim(new.customer_code)) = 0) then
    new.customer_code := public.generate_customer_code();
  end if;

  return new;
end;
$$;

drop trigger if exists set_customers_updated_at on public.customers;
create trigger set_customers_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists set_customer_addresses_updated_at on public.customer_addresses;
create trigger set_customer_addresses_updated_at
before update on public.customer_addresses
for each row execute function public.set_updated_at();

drop trigger if exists set_customer_code_before_insert on public.customers;
create trigger set_customer_code_before_insert
before insert on public.customers
for each row execute function public.set_customer_code();

create index if not exists customers_customer_type_id_idx on public.customers (customer_type_id);
create index if not exists customers_credit_term_id_idx on public.customers (credit_term_id);
create index if not exists customers_tax_type_id_idx on public.customers (tax_type_id);
create index if not exists customers_status_idx on public.customers (status);
create index if not exists customers_updated_at_idx on public.customers (updated_at desc);
create index if not exists customer_addresses_customer_id_idx on public.customer_addresses (customer_id);
create index if not exists customer_addresses_status_idx on public.customer_addresses (status);
create unique index if not exists customer_addresses_one_default_idx
  on public.customer_addresses (customer_id)
  where is_default;

alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customers'
      and policyname = 'Authenticated users can manage customers'
  ) then
    create policy "Authenticated users can manage customers"
      on public.customers for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_addresses'
      and policyname = 'Authenticated users can manage customer addresses'
  ) then
    create policy "Authenticated users can manage customer addresses"
      on public.customer_addresses for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;
