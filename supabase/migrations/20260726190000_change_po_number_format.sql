-- Keep PO document numbers consistent with the existing PR number convention.
-- Example: PO26070001 = PO + YYMM + four-digit running sequence.
create or replace function public.set_purchase_order_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.po_number is null or btrim(new.po_number) = '' then
    new.po_number := format(
      'PO%s%s',
      to_char(coalesce(new.document_date, current_date), 'YYMM'),
      lpad(nextval('public.purchase_order_number_seq')::text, 4, '0')
    );
  end if;

  return new;
end;
$$;
