create table if not exists public.vendors (
  id bigint generated always as identity primary key,
  vendor_code text not null,
  vendor_name text not null,
  vendor_group_id bigint not null references public.vendor_groups(id),
  tax_no text not null,
  branch text,
  contact_name text,
  phone text,
  email text,
  credit_term_id bigint not null references public.vendor_credit_terms(id),
  payment_method_id bigint not null references public.vendor_payment_methods(id),
  tax_type_id bigint not null references public.vendor_tax_types(id),
  status text not null default 'ใช้งาน',
  remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendors_vendor_code_unique unique (vendor_code),
  constraint vendors_vendor_code_not_blank check (length(btrim(vendor_code)) > 0),
  constraint vendors_vendor_name_not_blank check (length(btrim(vendor_name)) > 0),
  constraint vendors_tax_no_not_blank check (length(btrim(tax_no)) > 0),
  constraint vendors_status_check check (status in ('ใช้งาน', 'ระงับการใช้งาน'))
);

create table if not exists public.vendor_addresses (
  id bigint generated always as identity primary key,
  vendor_id bigint not null references public.vendors(id) on delete cascade,
  address_name text not null,
  address_line text not null,
  contact_name text,
  phone text,
  is_default boolean not null default false,
  status text not null default 'ใช้งาน',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_addresses_name_not_blank check (length(btrim(address_name)) > 0),
  constraint vendor_addresses_line_not_blank check (length(btrim(address_line)) > 0),
  constraint vendor_addresses_status_check check (status in ('ใช้งาน', 'ระงับการใช้งาน'))
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_vendors_updated_at on public.vendors;
create trigger set_vendors_updated_at
before update on public.vendors
for each row execute function public.set_updated_at();

drop trigger if exists set_vendor_addresses_updated_at on public.vendor_addresses;
create trigger set_vendor_addresses_updated_at
before update on public.vendor_addresses
for each row execute function public.set_updated_at();

create index if not exists vendors_vendor_group_id_idx on public.vendors (vendor_group_id);
create index if not exists vendors_credit_term_id_idx on public.vendors (credit_term_id);
create index if not exists vendors_payment_method_id_idx on public.vendors (payment_method_id);
create index if not exists vendors_tax_type_id_idx on public.vendors (tax_type_id);
create index if not exists vendors_status_idx on public.vendors (status);
create index if not exists vendors_updated_at_idx on public.vendors (updated_at desc);
create index if not exists vendor_addresses_vendor_id_idx on public.vendor_addresses (vendor_id);
create index if not exists vendor_addresses_status_idx on public.vendor_addresses (status);
create unique index if not exists vendor_addresses_one_default_idx
  on public.vendor_addresses (vendor_id)
  where is_default;

alter table public.vendors enable row level security;
alter table public.vendor_addresses enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'vendors'
      and policyname = 'Authenticated users can manage vendors'
  ) then
    create policy "Authenticated users can manage vendors"
      on public.vendors for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_addresses'
      and policyname = 'Authenticated users can manage vendor addresses'
  ) then
    create policy "Authenticated users can manage vendor addresses"
      on public.vendor_addresses for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;
