set search_path = '';

drop policy if exists "Company logos are publicly readable"
  on storage.objects;

revoke execute on function public.save_company_settings(
  uuid,
  jsonb,
  jsonb,
  text,
  text
) from anon;

comment on function public.get_public_company_branding() is
  'Public, read-only branding endpoint. Returns only company name and logo paths required by the login page.';
