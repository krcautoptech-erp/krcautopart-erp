create or replace function public.post_goods_receipt(
  p_purchase_order_id bigint,
  p_document_date date,
  p_delivery_note_no text,
  p_remarks text,
  p_items jsonb
)
returns table (
  goods_receipt_id bigint,
  goods_receipt_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_name text;
  v_gr public.goods_receipts%rowtype;
  v_item jsonb;
  v_line_no integer := 0;
  v_po public.purchase_orders%rowtype;
  v_po_item public.purchase_order_items%rowtype;
  v_qty_received numeric(18, 4);
  v_total_ordered numeric(18, 4);
  v_total_received numeric(18, 4);
  v_po_status text;
  v_user_id uuid := (select auth.uid());
begin
  -- 1. Check Auth & Permissions
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not public.authorize('inventory.create_gr') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  -- 2. Validate parameters
  if p_purchase_order_id is null then
    raise exception 'purchase_order_required' using errcode = '22023';
  end if;
  if p_document_date is null then
    raise exception 'document_date_required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid_goods_receipt_items' using errcode = '22023';
  end if;

  -- 3. Fetch and lock PO
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

  -- Get actor name
  select coalesce(
    nullif(concat_ws(' ', profile.first_name, profile.last_name), ''),
    nullif(app_user.raw_app_meta_data ->> 'full_name', ''),
    nullif(app_user.email, ''),
    'เจ้าหน้าที่คลังสินค้า'
  )
  into v_actor_name
  from auth.users app_user
  left join public.user_profiles profile on profile.user_id = app_user.id
  where app_user.id = v_user_id;

  -- 4. Create Goods Receipt Header (gr_number will be set by trigger!)
  insert into public.goods_receipts (
    gr_number,
    document_date,
    purchase_order_id,
    vendor_id,
    vendor_code,
    vendor_name,
    delivery_note_no,
    status,
    remarks,
    created_by,
    updated_by
  )
  values (
    NULL, -- replaced by set_goods_receipt_number trigger
    p_document_date,
    v_po.id,
    v_po.vendor_id,
    v_po.vendor_code,
    v_po.vendor_name,
    nullif(btrim(p_delivery_note_no), ''),
    'posted',
    nullif(btrim(p_remarks), ''),
    v_user_id,
    v_user_id
  )
  returning * into v_gr;

  -- 5. Lock and check PO items in a stable order
  perform item.id
  from public.purchase_order_items item
  where item.purchase_order_id = v_po.id
  order by item.id
  for update;

  -- 6. Insert items & update PO items received_qty
  for v_item in
    select item from jsonb_array_elements(p_items) item
    order by (item ->> 'line_no')::integer
  loop
    v_line_no := v_line_no + 1;
    v_qty_received := coalesce(nullif(v_item ->> 'quantity_received', '')::numeric, 0);

    -- Skip if quantity is zero (allows receiving subset of items)
    if v_qty_received = 0 then
      continue;
    end if;

    if v_qty_received < 0 then
      raise exception 'invalid_quantity_received' using errcode = '22023';
    end if;

    -- Fetch corresponding PO line item
    select po_item.* into v_po_item
    from public.purchase_order_items po_item
    where po_item.id = (v_item ->> 'purchase_order_item_id')::bigint
      and po_item.purchase_order_id = v_po.id;

    if not found then
      raise exception 'purchase_order_item_not_found' using errcode = 'P0002';
    end if;

    -- Check if receiving too much
    if v_po_item.received_qty + v_qty_received > v_po_item.quantity then
      raise exception 'received_qty_exceeded_ordered:%', v_po_item.item_name using errcode = '23514';
    end if;

    -- Update received_qty in PO item
    update public.purchase_order_items
    set received_qty = received_qty + v_qty_received
    where id = v_po_item.id;

    -- Insert Goods Receipt item detail
    insert into public.goods_receipt_items (
      goods_receipt_id,
      line_no,
      purchase_order_item_id,
      raw_material_id,
      item_code,
      item_name,
      quantity_ordered,
      quantity_received,
      unit_name,
      warehouse_id,
      remarks
    )
    values (
      v_gr.id,
      v_line_no,
      v_po_item.id,
      v_po_item.raw_material_id,
      v_po_item.item_code,
      v_po_item.item_name,
      v_po_item.quantity,
      v_qty_received,
      v_po_item.unit_name,
      (v_item ->> 'warehouse_id')::bigint,
      nullif(btrim(v_item ->> 'remarks'), '')
    );

    -- Record inventory stock card transaction
    insert into public.inventory_transactions (
      raw_material_id,
      warehouse_id,
      transaction_type,
      reference_doc_type,
      reference_doc_number,
      quantity_change,
      created_by
    )
    values (
      v_po_item.raw_material_id,
      (v_item ->> 'warehouse_id')::bigint,
      'receipt',
      'goods_receipt',
      v_gr.gr_number,
      v_qty_received,
      v_user_id
    );
  end loop;

  -- 7. Update PO Status
  select
    coalesce(sum(quantity), 0),
    coalesce(sum(received_qty), 0)
  into v_total_ordered, v_total_received
  from public.purchase_order_items
  where purchase_order_id = v_po.id;

  if v_total_received = 0 then
    v_po_status := 'sent';
  elsif v_total_received >= v_total_ordered then
    v_po_status := 'received';
  else
    v_po_status := 'partially_received';
  end if;

  if v_po_status <> v_po.status then
    update public.purchase_orders
    set status = v_po_status,
        updated_at = now()
    where id = v_po.id;

    -- Add status log
    insert into public.purchase_order_status_logs (
      purchase_order_id,
      to_status,
      actor_user_id,
      actor_name
    )
    values (v_po.id, v_po_status, v_user_id, v_actor_name);
  end if;

  return query select v_gr.id, v_gr.gr_number;
end;
$$;

-- Revoke and Grant Execute permissions
revoke all on function public.post_goods_receipt(
  bigint, date, text, text, jsonb
) from public;

grant execute on function public.post_goods_receipt(
  bigint, date, text, text, jsonb
) to authenticated;
