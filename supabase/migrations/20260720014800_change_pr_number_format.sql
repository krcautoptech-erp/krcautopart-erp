-- Update set_purchase_requisition_number function to use new format PRYYMMNNNN (e.g., PR26070001)
create or replace function public.set_purchase_requisition_number()
returns trigger
language plpgsql
as $$
begin
  if new.pr_number is null or btrim(new.pr_number) = '' then
    new.pr_number := format(
      'PR%s%04s',
      to_char(coalesce(new.document_date, current_date), 'YYMM'),
      nextval('public.purchase_requisition_number_seq')
    );
  end if;

  return new;
end;
$$;
