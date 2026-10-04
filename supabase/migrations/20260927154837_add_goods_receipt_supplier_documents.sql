begin;

alter table public.goods_receipts
  add column if not exists supplier_document_type text,
  add column if not exists supplier_document_date date;

alter table public.goods_receipts
  drop constraint if exists goods_receipts_supplier_document_type_check;
alter table public.goods_receipts
  add constraint goods_receipts_supplier_document_type_check
  check (
    supplier_document_type is null
    or supplier_document_type in (
      'delivery_note',
      'tax_invoice',
      'delivery_note_tax_invoice',
      'other'
    )
  );

create or replace function public.post_goods_receipt(
  p_purchase_order_id bigint,
  p_document_date date,
  p_delivery_note_no text,
  p_remarks text,
  p_items jsonb,
  p_request_key uuid,
  p_supplier_document_type text,
  p_supplier_document_date date,
  p_allow_duplicate boolean default false
)
returns table (goods_receipt_id bigint, goods_receipt_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_vendor_id bigint;
  v_document_no text := btrim(coalesce(p_delivery_note_no, ''));
  v_duplicate_gr text;
  v_created record;
  v_saved public.goods_receipts%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if p_supplier_document_type is null or p_supplier_document_type not in (
    'delivery_note',
    'tax_invoice',
    'delivery_note_tax_invoice',
    'other'
  ) or p_supplier_document_date is null or length(v_document_no) not between 1 and 100 then
    raise exception 'invalid_supplier_document' using errcode = '22023';
  end if;

  select purchase_order.vendor_id into v_vendor_id
  from public.purchase_orders purchase_order
  where purchase_order.id = p_purchase_order_id;
  if not found then
    raise exception 'purchase_order_not_found' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier_document:' || v_vendor_id::text || ':' ||
      p_supplier_document_type || ':' || lower(v_document_no),
      0
    )
  );

  select receipt.gr_number into v_duplicate_gr
  from public.goods_receipts receipt
  where receipt.vendor_id = v_vendor_id
    and receipt.supplier_document_type = p_supplier_document_type
    and lower(btrim(receipt.delivery_note_no)) = lower(v_document_no)
    and receipt.status <> 'cancelled'
    and receipt.request_key is distinct from p_request_key
  order by receipt.id desc
  limit 1;

  if found and not coalesce(p_allow_duplicate, false) then
    raise exception 'duplicate_supplier_document:%', v_duplicate_gr
      using errcode = '23505';
  end if;

  select * into v_created
  from public.post_goods_receipt(
    p_purchase_order_id,
    p_document_date,
    v_document_no,
    p_remarks,
    p_items,
    p_request_key
  );

  select receipt.* into v_saved
  from public.goods_receipts receipt
  where receipt.id = v_created.goods_receipt_id
  for update;

  if v_saved.supplier_document_type is not null
    and (
      v_saved.supplier_document_type <> p_supplier_document_type
      or v_saved.supplier_document_date is distinct from p_supplier_document_date
      or lower(btrim(v_saved.delivery_note_no)) <> lower(v_document_no)
    ) then
    raise exception 'request_key_conflict' using errcode = '23505';
  end if;

  update public.goods_receipts
  set supplier_document_type = p_supplier_document_type,
      supplier_document_date = p_supplier_document_date
  where id = v_created.goods_receipt_id
    and supplier_document_type is null;

  return query select v_created.goods_receipt_id, v_created.goods_receipt_number;
end;
$$;

-- New receipts must use the metadata-aware overload. The wrapper still calls
-- the six-argument function internally in the same database transaction.
revoke all on function public.post_goods_receipt(bigint, date, text, text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.post_goods_receipt(bigint, date, text, text, jsonb, uuid, text, date, boolean)
  from public, anon, authenticated;
grant execute on function public.post_goods_receipt(bigint, date, text, text, jsonb, uuid, text, date, boolean)
  to authenticated;

notify pgrst, 'reload schema';

commit;
