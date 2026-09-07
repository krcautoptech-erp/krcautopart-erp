-- 1. Drop index and table
DROP INDEX IF EXISTS public.inventory_lots_supplier_coil_idx;
DROP TABLE IF EXISTS public.inventory_packages CASCADE;

-- 2. Drop columns from inventory_lots
ALTER TABLE public.inventory_lots 
  DROP COLUMN IF EXISTS supplier_coil_no,
  DROP COLUMN IF EXISTS received_weight_kg;

-- 3. Create centralized lot sequence table in erp_private
CREATE TABLE IF NOT EXISTS erp_private.lot_counters (
  raw_material_id bigint NOT NULL REFERENCES public.raw_materials(id) ON DELETE CASCADE,
  period_key text NOT NULL, -- Format: YYMMDD
  last_value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (raw_material_id, period_key),
  CONSTRAINT lot_counters_period_check CHECK (period_key ~ '^[0-9]{6}$')
);

-- Enable RLS on erp_private.lot_counters
ALTER TABLE erp_private.lot_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.lot_counters FROM public, anon, authenticated;

-- 4. Recreate post_goods_receipt RPC function
CREATE OR REPLACE FUNCTION public.post_goods_receipt(
  p_purchase_order_id bigint,
  p_document_date date,
  p_delivery_note_no text,
  p_remarks text,
  p_items jsonb
)
RETURNS TABLE (goods_receipt_id bigint, goods_receipt_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (select auth.uid());
  v_actor_name text;
  v_po public.purchase_orders%rowtype;
  v_po_item public.purchase_order_items%rowtype;
  v_gr public.goods_receipts%rowtype;
  v_item jsonb;
  v_gr_item_id bigint;
  v_inventory_lot_id bigint;
  v_line_no integer := 0;
  v_warehouse_id bigint;
  v_item_qty numeric(18, 4);
  v_lot_number text;
  v_number_seed text;
  v_total_ordered numeric(18, 4);
  v_total_received numeric(18, 4);
  v_po_status text;
  -- variables for lot generation
  v_period_key text;
  v_material_digits text;
  v_today_seq integer;
BEGIN
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not public.authorize('inventory.create_gr') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_purchase_order_id is null or p_document_date is null then
    raise exception 'invalid_goods_receipt_header' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid_goods_receipt_items' using errcode = '22023';
  end if;

  select po.* into v_po
  from public.purchase_orders po
  where po.id = p_purchase_order_id
  for update;

  if not found then
    raise exception 'purchase_order_not_found' using errcode = 'P0002';
  end if;
  if v_po.status not in ('approved', 'sent', 'partially_received') then
    raise exception 'invalid_purchase_order_status_for_receipt' using errcode = '22023';
  end if;

  select coalesce(
    nullif(concat_ws(' ', profile.first_name, profile.last_name), ''),
    nullif(app_user.raw_app_meta_data ->> 'full_name', ''),
    nullif(app_user.email, ''),
    'เจ้าหน้าที่คลังสินค้า'
  ) into v_actor_name
  from auth.users app_user
  left join public.user_profiles profile on profile.user_id = app_user.id
  where app_user.id = v_user_id;

  insert into public.goods_receipts (
    gr_number, document_date, purchase_order_id, vendor_id, vendor_code,
    vendor_name, delivery_note_no, status, remarks, created_by, updated_by
  ) values (
    null, p_document_date, v_po.id, v_po.vendor_id, v_po.vendor_code,
    v_po.vendor_name, nullif(btrim(p_delivery_note_no), ''), 'posted',
    nullif(btrim(p_remarks), ''), v_user_id, v_user_id
  ) returning * into v_gr;

  v_number_seed := regexp_replace(v_gr.gr_number, '[^0-9]', '', 'g');

  perform po_item.id
  from public.purchase_order_items po_item
  where po_item.purchase_order_id = v_po.id
  order by po_item.id
  for update;

  for v_item in
    select value from jsonb_array_elements(p_items)
    order by (value ->> 'line_no')::integer
  loop
    v_line_no := v_line_no + 1;
    v_item_qty := coalesce(nullif(v_item ->> 'quantity_received', '')::numeric, 0);
    v_warehouse_id := nullif(v_item ->> 'warehouse_id', '')::bigint;

    if v_item_qty <= 0 then
      raise exception 'invalid_quantity_received' using errcode = '22023';
    end if;
    if v_warehouse_id is null then
      raise exception 'warehouse_required' using errcode = '22023';
    end if;

    select po_item.* into v_po_item
    from public.purchase_order_items po_item
    where po_item.id = (v_item ->> 'purchase_order_item_id')::bigint
      and po_item.purchase_order_id = v_po.id;

    if not found then
      raise exception 'purchase_order_item_not_found' using errcode = 'P0002';
    end if;
    if v_po_item.received_qty + v_item_qty > v_po_item.quantity then
      raise exception 'received_qty_exceeded_ordered:%', v_po_item.item_name using errcode = '23514';
    end if;

    update public.purchase_order_items
    set received_qty = received_qty + v_item_qty
    where id = v_po_item.id;

    insert into public.goods_receipt_items (
      goods_receipt_id, line_no, purchase_order_item_id, raw_material_id,
      item_code, item_name, quantity_ordered, quantity_received, unit_name,
      warehouse_id, remarks
    ) values (
      v_gr.id, v_line_no, v_po_item.id, v_po_item.raw_material_id,
      v_po_item.item_code, v_po_item.item_name, v_po_item.quantity,
      v_item_qty, v_po_item.unit_name, v_warehouse_id,
      nullif(btrim(v_item ->> 'remarks'), '')
    ) returning id into v_gr_item_id;

    -- Generate Lot Number: YYMMDD + raw_material_code digits + - + sequence of the day
    v_material_digits := regexp_replace(v_po_item.item_code, '[^0-9]', '', 'g');
    v_period_key := to_char(p_document_date, 'YYMMDD');

    -- Concurrency safety: acquire transaction-level advisory lock
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'lot_counter:' || v_po_item.raw_material_id::text || ':' || v_period_key,
        0
      )
    );

    -- Allocate sequence
    insert into erp_private.lot_counters (raw_material_id, period_key, last_value)
    values (v_po_item.raw_material_id, v_period_key, 1)
    on conflict (raw_material_id, period_key) do update
    set last_value = erp_private.lot_counters.last_value + 1,
        updated_at = now()
    returning last_value into v_today_seq;

    v_lot_number := v_period_key || v_material_digits || '-' || v_today_seq::text;

    insert into public.inventory_lots (
      lot_number, raw_material_id, warehouse_id, goods_receipt_id,
      goods_receipt_item_id, purchase_order_id,
      received_qty, received_at, remarks, created_by
    ) values (
      v_lot_number, v_po_item.raw_material_id, v_warehouse_id, v_gr.id,
      v_gr_item_id, v_po.id,
      v_item_qty, now(), nullif(btrim(v_item ->> 'remarks'), ''), v_user_id
    ) returning id into v_inventory_lot_id;

    insert into public.inventory_transactions (
      raw_material_id, warehouse_id, lot_id, transaction_type,
      reference_doc_type, reference_doc_number, quantity_change, created_by
    ) values (
      v_po_item.raw_material_id, v_warehouse_id, v_inventory_lot_id, 'receipt',
      'goods_receipt', v_gr.gr_number, v_item_qty, v_user_id
    );
  end loop;

  select coalesce(sum(quantity), 0), coalesce(sum(received_qty), 0)
  into v_total_ordered, v_total_received
  from public.purchase_order_items
  where purchase_order_id = v_po.id;

  v_po_status := case
    when v_total_received = 0 then 'sent'
    when v_total_received >= v_total_ordered then 'received'
    else 'partially_received'
  end;

  if v_po_status <> v_po.status then
    update public.purchase_orders set status = v_po_status, updated_at = now() where id = v_po.id;
    insert into public.purchase_order_status_logs (
      purchase_order_id, to_status, actor_user_id, actor_name
    ) values (v_po.id, v_po_status, v_user_id, v_actor_name);
  end if;

  return query select v_gr.id, v_gr.gr_number;
end;
$$;

revoke all on function public.post_goods_receipt(bigint, date, text, text, jsonb)
  from public, anon;
grant execute on function public.post_goods_receipt(bigint, date, text, text, jsonb)
  to authenticated;
