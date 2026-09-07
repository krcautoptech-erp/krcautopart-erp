create or replace function public.save_company_settings(
  p_company_id uuid,
  p_profile jsonb,
  p_document_settings jsonb,
  p_logo_light_path text default null,
  p_logo_dark_path text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_address_line text := nullif(btrim(p_profile ->> 'addressLine'), '');
  v_branch_code text := coalesce(
    nullif(btrim(p_profile ->> 'branchCode'), ''),
    '00000'
  );
  v_branch_type text := coalesce(
    nullif(btrim(p_profile ->> 'branchType'), ''),
    'head_office'
  );
  v_dark_logo_mode text := coalesce(
    nullif(btrim(p_profile ->> 'darkLogoMode'), ''),
    'auto'
  );
  v_legal_name_th text := btrim(p_profile ->> 'legalNameTh');
  v_tax_id text := nullif(regexp_replace(
    coalesce(p_profile ->> 'taxId', ''),
    '[^0-9]',
    '',
    'g'
  ), '');
begin
  if not public.authorize('company.manage') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.company_profiles company
    where company.id = p_company_id
  ) then
    raise exception 'company_not_found' using errcode = 'P0002';
  end if;

  if length(v_legal_name_th) < 2 or length(v_legal_name_th) > 200 then
    raise exception 'invalid_company_name' using errcode = '22023';
  end if;

  if v_tax_id is not null and v_tax_id !~ '^[0-9]{13}$' then
    raise exception 'invalid_tax_id' using errcode = '22023';
  end if;

  if v_branch_type not in ('head_office', 'branch')
    or v_branch_code !~ '^[0-9]{5}$'
  then
    raise exception 'invalid_branch' using errcode = '22023';
  end if;

  if v_dark_logo_mode not in ('auto', 'custom') then
    raise exception 'invalid_dark_logo_mode' using errcode = '22023';
  end if;

  update public.company_profiles company
  set
    legal_name_th = v_legal_name_th,
    legal_name_en = nullif(btrim(p_profile ->> 'legalNameEn'), ''),
    tax_id = v_tax_id,
    branch_type = v_branch_type,
    branch_code = v_branch_code,
    address_line = v_address_line,
    subdistrict = nullif(btrim(p_profile ->> 'subdistrict'), ''),
    district = nullif(btrim(p_profile ->> 'district'), ''),
    province = nullif(btrim(p_profile ->> 'province'), ''),
    postal_code = nullif(regexp_replace(
      coalesce(p_profile ->> 'postalCode', ''),
      '[^0-9]',
      '',
      'g'
    ), ''),
    phone = nullif(btrim(p_profile ->> 'phone'), ''),
    email = nullif(lower(btrim(p_profile ->> 'email')), ''),
    website = nullif(btrim(p_profile ->> 'website'), ''),
    logo_light_path = coalesce(p_logo_light_path, company.logo_light_path),
    logo_dark_path = case
      when v_dark_logo_mode = 'auto' then null
      else coalesce(p_logo_dark_path, company.logo_dark_path)
    end,
    dark_logo_mode = v_dark_logo_mode,
    updated_by = (select auth.uid())
  where company.id = p_company_id;

  insert into public.company_document_settings (
    company_id,
    header_style,
    logo_width_mm,
    footer_text_th,
    footer_text_en,
    show_tax_id,
    show_address,
    show_phone,
    show_email,
    show_website,
    updated_by
  )
  values (
    p_company_id,
    coalesce(
      nullif(btrim(p_document_settings ->> 'headerStyle'), ''),
      'compact'
    ),
    coalesce(
      (p_document_settings ->> 'logoWidthMm')::numeric,
      34
    ),
    nullif(btrim(p_document_settings ->> 'footerTextTh'), ''),
    nullif(btrim(p_document_settings ->> 'footerTextEn'), ''),
    coalesce((p_document_settings ->> 'showTaxId')::boolean, true),
    coalesce((p_document_settings ->> 'showAddress')::boolean, true),
    coalesce((p_document_settings ->> 'showPhone')::boolean, true),
    coalesce((p_document_settings ->> 'showEmail')::boolean, true),
    coalesce((p_document_settings ->> 'showWebsite')::boolean, false),
    (select auth.uid())
  )
  on conflict (company_id) do update
  set
    header_style = excluded.header_style,
    logo_width_mm = excluded.logo_width_mm,
    footer_text_th = excluded.footer_text_th,
    footer_text_en = excluded.footer_text_en,
    show_tax_id = excluded.show_tax_id,
    show_address = excluded.show_address,
    show_phone = excluded.show_phone,
    show_email = excluded.show_email,
    show_website = excluded.show_website,
    updated_by = excluded.updated_by;

  if v_address_line is not null then
    insert into public.company_branches (
      company_id,
      branch_code,
      branch_name,
      address_line,
      subdistrict,
      district,
      province,
      postal_code,
      phone,
      email,
      is_head_office,
      is_registered_address,
      updated_by
    )
    values (
      p_company_id,
      v_branch_code,
      case
        when v_branch_type = 'head_office' then 'สำนักงานใหญ่'
        else 'สาขา ' || v_branch_code
      end,
      v_address_line,
      nullif(btrim(p_profile ->> 'subdistrict'), ''),
      nullif(btrim(p_profile ->> 'district'), ''),
      nullif(btrim(p_profile ->> 'province'), ''),
      nullif(regexp_replace(
        coalesce(p_profile ->> 'postalCode', ''),
        '[^0-9]',
        '',
        'g'
      ), ''),
      nullif(btrim(p_profile ->> 'phone'), ''),
      nullif(lower(btrim(p_profile ->> 'email')), ''),
      v_branch_type = 'head_office',
      true,
      (select auth.uid())
    )
    on conflict (company_id, branch_code) do update
    set
      branch_name = excluded.branch_name,
      address_line = excluded.address_line,
      subdistrict = excluded.subdistrict,
      district = excluded.district,
      province = excluded.province,
      postal_code = excluded.postal_code,
      phone = excluded.phone,
      email = excluded.email,
      is_head_office = excluded.is_head_office,
      is_registered_address = excluded.is_registered_address,
      status = 'active',
      updated_by = excluded.updated_by;
  end if;
end;
$$;

revoke all on function public.save_company_settings(
  uuid,
  jsonb,
  jsonb,
  text,
  text
) from public;

grant execute on function public.save_company_settings(
  uuid,
  jsonb,
  jsonb,
  text,
  text
) to authenticated;
