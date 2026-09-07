create table if not exists public.company_profiles (
  id uuid primary key default gen_random_uuid(),
  company_code text not null,
  legal_name_th text not null,
  legal_name_en text,
  tax_id text,
  branch_type text not null default 'head_office',
  branch_code text not null default '00000',
  address_line text,
  subdistrict text,
  district text,
  province text,
  postal_code text,
  phone text,
  email text,
  website text,
  logo_light_path text,
  logo_dark_path text,
  dark_logo_mode text not null default 'auto',
  is_default boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  constraint company_profiles_code_unique unique (company_code),
  constraint company_profiles_code_not_blank
    check (length(btrim(company_code)) between 2 and 30),
  constraint company_profiles_legal_name_not_blank
    check (length(btrim(legal_name_th)) between 2 and 200),
  constraint company_profiles_tax_id_format
    check (tax_id is null or tax_id ~ '^[0-9]{13}$'),
  constraint company_profiles_branch_type_check
    check (branch_type in ('head_office', 'branch')),
  constraint company_profiles_branch_code_format
    check (branch_code ~ '^[0-9]{5}$'),
  constraint company_profiles_postal_code_format
    check (postal_code is null or postal_code ~ '^[0-9]{5}$'),
  constraint company_profiles_email_format
    check (
      email is null
      or email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    ),
  constraint company_profiles_dark_logo_mode_check
    check (dark_logo_mode in ('auto', 'custom')),
  constraint company_profiles_status_check
    check (status in ('active', 'inactive'))
);

create unique index if not exists company_profiles_one_default_idx
  on public.company_profiles (is_default)
  where is_default;

create index if not exists company_profiles_active_lookup_idx
  on public.company_profiles (status, is_default, company_code);

create table if not exists public.company_branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null
    references public.company_profiles (id) on delete cascade,
  branch_code text not null,
  branch_name text not null,
  address_line text not null,
  subdistrict text,
  district text,
  province text,
  postal_code text,
  phone text,
  email text,
  is_head_office boolean not null default false,
  is_registered_address boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  constraint company_branches_company_code_unique
    unique (company_id, branch_code),
  constraint company_branches_code_format
    check (branch_code ~ '^[0-9]{5}$'),
  constraint company_branches_name_not_blank
    check (length(btrim(branch_name)) between 2 and 120),
  constraint company_branches_address_not_blank
    check (length(btrim(address_line)) between 2 and 500),
  constraint company_branches_postal_code_format
    check (postal_code is null or postal_code ~ '^[0-9]{5}$'),
  constraint company_branches_email_format
    check (
      email is null
      or email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    ),
  constraint company_branches_status_check
    check (status in ('active', 'inactive'))
);

create unique index if not exists company_branches_one_head_office_idx
  on public.company_branches (company_id)
  where is_head_office;

create index if not exists company_branches_company_status_idx
  on public.company_branches (company_id, status, branch_code);

create table if not exists public.company_document_settings (
  company_id uuid primary key
    references public.company_profiles (id) on delete cascade,
  header_style text not null default 'compact',
  logo_width_mm numeric(6, 2) not null default 34,
  footer_text_th text,
  footer_text_en text,
  show_tax_id boolean not null default true,
  show_address boolean not null default true,
  show_phone boolean not null default true,
  show_email boolean not null default true,
  show_website boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint company_document_settings_header_style_check
    check (header_style in ('compact', 'standard')),
  constraint company_document_settings_logo_width_check
    check (logo_width_mm between 15 and 60)
);

drop trigger if exists company_profiles_set_updated_at
  on public.company_profiles;
create trigger company_profiles_set_updated_at
before update on public.company_profiles
for each row execute function public.set_updated_at();

drop trigger if exists company_branches_set_updated_at
  on public.company_branches;
create trigger company_branches_set_updated_at
before update on public.company_branches
for each row execute function public.set_updated_at();

drop trigger if exists company_document_settings_set_updated_at
  on public.company_document_settings;
create trigger company_document_settings_set_updated_at
before update on public.company_document_settings
for each row execute function public.set_updated_at();

insert into public.app_permissions (
  permission_code,
  permission_name,
  module_code,
  module_name,
  action_code,
  sort_order,
  module_sort_order
)
values
  (
    'company.view',
    'ดูข้อมูลบริษัท',
    'COMPANY',
    'ข้อมูลบริษัท',
    'view',
    10,
    40
  ),
  (
    'company.manage',
    'จัดการข้อมูลบริษัท',
    'COMPANY',
    'ข้อมูลบริษัท',
    'manage',
    20,
    40
  )
on conflict (permission_code) do update
set
  permission_name = excluded.permission_name,
  module_code = excluded.module_code,
  module_name = excluded.module_name,
  action_code = excluded.action_code,
  sort_order = excluded.sort_order,
  module_sort_order = excluded.module_sort_order,
  status = 'active';

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
cross join public.app_permissions permission
where role.role_code = 'OWNER'
  and permission.permission_code in ('company.view', 'company.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
cross join public.app_permissions permission
where role.role_code in ('ADMIN', 'MANAGER', 'STAFF')
  and permission.permission_code = 'company.view'
on conflict do nothing;

insert into public.company_profiles (
  company_code,
  legal_name_th,
  legal_name_en,
  branch_type,
  branch_code,
  is_default
)
values (
  'KRC',
  'บริษัท เค.อาร์.ซี. ออโต้พาร์ท จำกัด',
  'K.R.C. AUTOPART CO., LTD.',
  'head_office',
  '00000',
  true
)
on conflict (company_code) do nothing;

insert into public.company_document_settings (company_id)
select company.id
from public.company_profiles company
where company.company_code = 'KRC'
on conflict (company_id) do nothing;

create or replace function public.get_public_company_branding()
returns table (
  company_id uuid,
  legal_name_th text,
  legal_name_en text,
  logo_light_path text,
  logo_dark_path text,
  dark_logo_mode text,
  logo_updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    company.id,
    company.legal_name_th,
    company.legal_name_en,
    company.logo_light_path,
    company.logo_dark_path,
    company.dark_logo_mode,
    company.updated_at
  from public.company_profiles company
  where company.is_default
    and company.status = 'active'
  limit 1;
$$;

revoke all on function public.get_public_company_branding() from public;
grant execute on function public.get_public_company_branding()
  to anon, authenticated;

alter table public.company_profiles enable row level security;
alter table public.company_branches enable row level security;
alter table public.company_document_settings enable row level security;

drop policy if exists "Authorized users can view company profiles"
  on public.company_profiles;
create policy "Authorized users can view company profiles"
on public.company_profiles for select
to authenticated
using ((select public.authorize('company.view')));

drop policy if exists "Company managers can update company profiles"
  on public.company_profiles;
create policy "Company managers can update company profiles"
on public.company_profiles for update
to authenticated
using ((select public.authorize('company.manage')))
with check ((select public.authorize('company.manage')));

drop policy if exists "Authorized users can view company branches"
  on public.company_branches;
create policy "Authorized users can view company branches"
on public.company_branches for select
to authenticated
using ((select public.authorize('company.view')));

drop policy if exists "Company managers can insert company branches"
  on public.company_branches;
create policy "Company managers can insert company branches"
on public.company_branches for insert
to authenticated
with check ((select public.authorize('company.manage')));

drop policy if exists "Company managers can update company branches"
  on public.company_branches;
create policy "Company managers can update company branches"
on public.company_branches for update
to authenticated
using ((select public.authorize('company.manage')))
with check ((select public.authorize('company.manage')));

drop policy if exists "Company managers can delete company branches"
  on public.company_branches;
create policy "Company managers can delete company branches"
on public.company_branches for delete
to authenticated
using ((select public.authorize('company.manage')));

drop policy if exists "Authorized users can view document settings"
  on public.company_document_settings;
create policy "Authorized users can view document settings"
on public.company_document_settings for select
to authenticated
using ((select public.authorize('company.view')));

drop policy if exists "Company managers can insert document settings"
  on public.company_document_settings;
create policy "Company managers can insert document settings"
on public.company_document_settings for insert
to authenticated
with check ((select public.authorize('company.manage')));

drop policy if exists "Company managers can update document settings"
  on public.company_document_settings;
create policy "Company managers can update document settings"
on public.company_document_settings for update
to authenticated
using ((select public.authorize('company.manage')))
with check ((select public.authorize('company.manage')));

grant select, update on public.company_profiles to authenticated;
grant select, insert, update, delete on public.company_branches
  to authenticated;
grant select, insert, update on public.company_document_settings
  to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'company-assets',
  'company-assets',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Company logos are publicly readable"
  on storage.objects;
create policy "Company logos are publicly readable"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'company-assets');

drop policy if exists "Company managers can upload logos"
  on storage.objects;
create policy "Company managers can upload logos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'company-assets'
  and (select public.authorize('company.manage'))
);

drop policy if exists "Company managers can replace logos"
  on storage.objects;
create policy "Company managers can replace logos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'company-assets'
  and (select public.authorize('company.manage'))
)
with check (
  bucket_id = 'company-assets'
  and (select public.authorize('company.manage'))
);

drop policy if exists "Company managers can delete logos"
  on storage.objects;
create policy "Company managers can delete logos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'company-assets'
  and (select public.authorize('company.manage'))
);
