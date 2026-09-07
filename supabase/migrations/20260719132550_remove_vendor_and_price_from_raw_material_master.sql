drop index if exists public.raw_materials_vendor_id_idx;

alter table if exists public.raw_materials
  drop constraint if exists raw_materials_primary_vendor_id_fkey,
  drop constraint if exists raw_materials_last_price_check,
  drop column if exists primary_vendor_id,
  drop column if exists last_price;
