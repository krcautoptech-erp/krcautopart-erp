create or replace function public.set_purchase_requisition_number()
returns trigger
language plpgsql
as $$
begin
  if new.pr_number is null or btrim(new.pr_number) = '' then
    new.pr_number := format(
      'PR%s%s',
      to_char(coalesce(new.document_date, current_date), 'YYMM'),
      lpad(nextval('public.purchase_requisition_number_seq')::text, 4, '0')
    );
  end if;

  return new;
end;
$$;
