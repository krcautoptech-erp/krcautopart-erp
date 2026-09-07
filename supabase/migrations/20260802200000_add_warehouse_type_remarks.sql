alter table public.warehouse_types
  add column if not exists remarks text;

alter table public.warehouse_types
  drop constraint if exists warehouse_types_remarks_check,
  add constraint warehouse_types_remarks_check
    check (remarks is null or length(remarks) <= 255);
