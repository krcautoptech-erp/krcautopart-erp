-- Function to set goods receipt number using centralized erp_private number series
create or replace function erp_private.set_goods_receipt_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
begin
  select claimed.business_number
  into v_number
  from erp_private.claim_business_number(
    'GR',
    coalesce(new.document_date, current_date),
    new.gr_number,
    'goods_receipt',
    new.id::text
  ) claimed;
  new.gr_number := v_number;
  return new;
end;
$$;

-- Trigger to run before insert on goods_receipts
drop trigger if exists goods_receipts_set_number on public.goods_receipts;
create trigger goods_receipts_set_number
before insert on public.goods_receipts
for each row execute function erp_private.set_goods_receipt_number();
