alter table public.vendor_addresses
  add column if not exists country text,
  add column if not exists house_no text,
  add column if not exists floor text,
  add column if not exists building text,
  add column if not exists road text,
  add column if not exists province text,
  add column if not exists district text,
  add column if not exists subdistrict text,
  add column if not exists postal_code text;
