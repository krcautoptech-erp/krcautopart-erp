set search_path = '';

create index if not exists company_profiles_created_by_idx
  on public.company_profiles (created_by)
  where created_by is not null;

create index if not exists company_profiles_updated_by_idx
  on public.company_profiles (updated_by)
  where updated_by is not null;

create index if not exists company_branches_created_by_idx
  on public.company_branches (created_by)
  where created_by is not null;

create index if not exists company_branches_updated_by_idx
  on public.company_branches (updated_by)
  where updated_by is not null;

create index if not exists company_document_settings_updated_by_idx
  on public.company_document_settings (updated_by)
  where updated_by is not null;

alter function public.set_updated_at() set search_path = '';

insert into public.company_branches (
  company_id,
  branch_code,
  branch_name,
  is_head_office,
  is_registered_address,
  address_line,
  subdistrict,
  district,
  province,
  postal_code,
  phone,
  email,
  status
)
select
  profile.id,
  profile.branch_code,
  case
    when profile.branch_type = 'head_office' then 'สำนักงานใหญ่'
    else 'สาขา ' || profile.branch_code
  end,
  profile.branch_type = 'head_office',
  true,
  coalesce(nullif(profile.address_line, ''), 'ยังไม่ระบุ'),
  profile.subdistrict,
  profile.district,
  profile.province,
  profile.postal_code,
  profile.phone,
  profile.email,
  profile.status
from public.company_profiles as profile
where profile.is_default = true
  and not exists (
    select 1
    from public.company_branches as branch
    where branch.company_id = profile.id
      and branch.is_registered_address = true
  );
