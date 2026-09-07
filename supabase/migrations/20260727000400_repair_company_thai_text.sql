set search_path = '';

update public.company_profiles
set legal_name_th = 'บริษัท เค.อาร์.ซี. ออโต้พาร์ท จำกัด'
where company_code = 'KRC'
  and is_default = true;
