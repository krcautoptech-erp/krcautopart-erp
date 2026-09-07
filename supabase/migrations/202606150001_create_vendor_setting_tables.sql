create table if not exists public.vendor_groups (
  id bigint generated always as identity primary key,
  code text not null,
  name text not null,
  description text,
  status text not null default 'ใช้งาน',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_groups_code_unique unique (code),
  constraint vendor_groups_code_not_blank check (length(btrim(code)) > 0),
  constraint vendor_groups_name_not_blank check (length(btrim(name)) > 0),
  constraint vendor_groups_status_check check (status in ('ใช้งาน', 'ระงับการใช้งาน'))
);

create table if not exists public.vendor_credit_terms (
  id bigint generated always as identity primary key,
  code text not null,
  name text not null,
  credit_days integer not null default 0,
  description text,
  status text not null default 'ใช้งาน',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_credit_terms_code_unique unique (code),
  constraint vendor_credit_terms_code_not_blank check (length(btrim(code)) > 0),
  constraint vendor_credit_terms_name_not_blank check (length(btrim(name)) > 0),
  constraint vendor_credit_terms_days_check check (credit_days >= 0),
  constraint vendor_credit_terms_status_check check (status in ('ใช้งาน', 'ระงับการใช้งาน'))
);

create table if not exists public.vendor_payment_methods (
  id bigint generated always as identity primary key,
  code text not null,
  name text not null,
  description text,
  status text not null default 'ใช้งาน',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_payment_methods_code_unique unique (code),
  constraint vendor_payment_methods_code_not_blank check (length(btrim(code)) > 0),
  constraint vendor_payment_methods_name_not_blank check (length(btrim(name)) > 0),
  constraint vendor_payment_methods_status_check check (status in ('ใช้งาน', 'ระงับการใช้งาน'))
);

create table if not exists public.vendor_tax_types (
  id bigint generated always as identity primary key,
  code text not null,
  name text not null,
  tax_rate numeric(5,2) not null default 0,
  description text,
  status text not null default 'ใช้งาน',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_tax_types_code_unique unique (code),
  constraint vendor_tax_types_code_not_blank check (length(btrim(code)) > 0),
  constraint vendor_tax_types_name_not_blank check (length(btrim(name)) > 0),
  constraint vendor_tax_types_rate_check check (tax_rate >= 0 and tax_rate <= 100),
  constraint vendor_tax_types_status_check check (status in ('ใช้งาน', 'ระงับการใช้งาน'))
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

drop trigger if exists set_vendor_groups_updated_at on public.vendor_groups;
create trigger set_vendor_groups_updated_at
before update on public.vendor_groups
for each row execute function public.set_updated_at();

drop trigger if exists set_vendor_credit_terms_updated_at on public.vendor_credit_terms;
create trigger set_vendor_credit_terms_updated_at
before update on public.vendor_credit_terms
for each row execute function public.set_updated_at();

drop trigger if exists set_vendor_payment_methods_updated_at on public.vendor_payment_methods;
create trigger set_vendor_payment_methods_updated_at
before update on public.vendor_payment_methods
for each row execute function public.set_updated_at();

drop trigger if exists set_vendor_tax_types_updated_at on public.vendor_tax_types;
create trigger set_vendor_tax_types_updated_at
before update on public.vendor_tax_types
for each row execute function public.set_updated_at();

create index if not exists vendor_groups_status_idx on public.vendor_groups (status);
create index if not exists vendor_groups_updated_at_idx on public.vendor_groups (updated_at desc);
create index if not exists vendor_credit_terms_status_idx on public.vendor_credit_terms (status);
create index if not exists vendor_credit_terms_updated_at_idx on public.vendor_credit_terms (updated_at desc);
create index if not exists vendor_payment_methods_status_idx on public.vendor_payment_methods (status);
create index if not exists vendor_payment_methods_updated_at_idx on public.vendor_payment_methods (updated_at desc);
create index if not exists vendor_tax_types_status_idx on public.vendor_tax_types (status);
create index if not exists vendor_tax_types_updated_at_idx on public.vendor_tax_types (updated_at desc);

alter table public.vendor_groups enable row level security;
alter table public.vendor_credit_terms enable row level security;
alter table public.vendor_payment_methods enable row level security;
alter table public.vendor_tax_types enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_groups'
      and policyname = 'Authenticated users can manage vendor groups'
  ) then
    create policy "Authenticated users can manage vendor groups"
      on public.vendor_groups for all
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
      and tablename = 'vendor_credit_terms'
      and policyname = 'Authenticated users can manage vendor credit terms'
  ) then
    create policy "Authenticated users can manage vendor credit terms"
      on public.vendor_credit_terms for all
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
      and tablename = 'vendor_payment_methods'
      and policyname = 'Authenticated users can manage vendor payment methods'
  ) then
    create policy "Authenticated users can manage vendor payment methods"
      on public.vendor_payment_methods for all
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
      and tablename = 'vendor_tax_types'
      and policyname = 'Authenticated users can manage vendor tax types'
  ) then
    create policy "Authenticated users can manage vendor tax types"
      on public.vendor_tax_types for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

insert into public.vendor_groups (code, name, description)
values
  ('VG-RAW', 'วัตถุดิบ', 'ผู้ขายวัตถุดิบหลักสำหรับฝ่ายจัดซื้อ'),
  ('VG-SERVICE', 'งานบริการ', 'ผู้ให้บริการและงานจ้างเหมาภายนอก'),
  ('VG-TRANSPORT', 'ขนส่ง', 'ผู้ให้บริการขนส่งและโลจิสติกส์')
on conflict (code) do nothing;

insert into public.vendor_credit_terms (code, name, credit_days, description)
values
  ('COD', 'เงินสด', 0, 'ชำระทันทีเมื่อซื้อหรือรับสินค้า'),
  ('NET7', 'เครดิต 7 วัน', 7, 'ครบกำหนดจ่าย 7 วันหลังรับสินค้า'),
  ('NET30', 'เครดิต 30 วัน', 30, 'ครบกำหนดจ่าย 30 วันหลังรับสินค้า')
on conflict (code) do nothing;

insert into public.vendor_payment_methods (code, name, description)
values
  ('TRANSFER', 'โอนเงิน', 'ชำระผ่านบัญชีธนาคาร'),
  ('CASH', 'เงินสด', 'ชำระด้วยเงินสด'),
  ('CHEQUE', 'เช็ค', 'ชำระด้วยเช็ค')
on conflict (code) do nothing;

insert into public.vendor_tax_types (code, name, tax_rate, description)
values
  ('VAT7', 'VAT 7%', 7, 'ภาษีมูลค่าเพิ่ม 7%'),
  ('NOVAT', 'ไม่มี VAT', 0, 'ไม่มีภาษีมูลค่าเพิ่ม'),
  ('EXEMPT', 'ยกเว้น VAT', 0, 'ได้รับการยกเว้นภาษีมูลค่าเพิ่ม')
on conflict (code) do nothing;
