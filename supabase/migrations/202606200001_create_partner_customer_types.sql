create table if not exists public.partner_customer_types (
  id bigint generated always as identity primary key,
  code text not null,
  name text not null,
  description text,
  status text not null default 'ใช้งาน',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_customer_types_code_unique unique (code),
  constraint partner_customer_types_code_not_blank check (length(btrim(code)) > 0),
  constraint partner_customer_types_name_not_blank check (length(btrim(name)) > 0),
  constraint partner_customer_types_status_check check (status in ('ใช้งาน', 'ระงับการใช้งาน'))
);

create index if not exists partner_customer_types_status_idx
  on public.partner_customer_types (status);

create index if not exists partner_customer_types_updated_at_idx
  on public.partner_customer_types (updated_at desc);

drop trigger if exists set_partner_customer_types_updated_at on public.partner_customer_types;
create trigger set_partner_customer_types_updated_at
before update on public.partner_customer_types
for each row execute function public.set_updated_at();

alter table public.partner_customer_types enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'partner_customer_types'
      and policyname = 'Authenticated users can manage partner customer types'
  ) then
    create policy "Authenticated users can manage partner customer types"
      on public.partner_customer_types for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

insert into public.partner_customer_types (code, name, description)
values
  ('COMPANY', 'บริษัท', 'ลูกค้าประเภทนิติบุคคลสำหรับออกใบเสนอราคา ใบแจ้งหนี้ และใบกำกับภาษี'),
  ('PERSON', 'บุคคลธรรมดา', 'ลูกค้าประเภทบุคคลธรรมดา'),
  ('PROJECT', 'ลูกค้าโครงการ', 'ลูกค้าที่บริหารเป็นรายโครงการหรือสัญญา')
on conflict (code) do nothing;
