revoke execute on function public.save_purchase_requisition(
  bigint,
  date,
  date,
  text,
  text,
  text,
  text,
  jsonb
) from anon;

revoke execute on function public.delete_purchase_requisition_draft(bigint)
  from anon;

grant execute on function public.save_purchase_requisition(
  bigint,
  date,
  date,
  text,
  text,
  text,
  text,
  jsonb
) to authenticated;

grant execute on function public.delete_purchase_requisition_draft(bigint)
  to authenticated;
