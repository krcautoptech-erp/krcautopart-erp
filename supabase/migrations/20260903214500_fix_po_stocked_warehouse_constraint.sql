-- Migration: 20260903214500_fix_po_stocked_warehouse_constraint.sql
-- Fix PO and GR item behavior for assets, serial items, and drop warehouse check constraints for non-stock items.

-- 1. Drop check constraint on purchase_order_items
alter table public.purchase_order_items
  drop constraint if exists purchase_order_items_stocked_warehouse_check;

-- 2. Allow inventory_serials to store serials for non-stock/assets (nullable warehouse_id & extended asset fields)
alter table public.inventory_serials
  alter column warehouse_id drop not null,
  add column if not exists department_id bigint references public.departments(id) on delete set null,
  add column if not exists custodian_name text,
  add column if not exists location_note text,
  add column if not exists warranty_expiry_date date,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.inventory_serials
  drop constraint if exists inventory_serials_status_check,
  add constraint inventory_serials_status_check check (status in ('in_stock', 'in_use', 'under_repair', 'allocated', 'consumed', 'scrapped', 'disposed'));

-- 3. Update existing PR and PO items for Asset type
update public.purchase_requisition_items pr_item
set
  is_stocked = coalesce(item_type.is_stocked, false)
from public.item_master master
join public.item_types item_type on item_type.id = master.item_type_id
where pr_item.item_master_id = master.id
  and (item_type.form_template = 'asset' or item_type.type_code = 'ASSET');

update public.purchase_order_items po_item
set
  is_stocked = coalesce(item_type.is_stocked, false),
  tracking_method = case
    when item_type.serial_controlled or master.tracking_method = 'serial' then 'serial'
    when item_type.lot_controlled or master.tracking_method = 'lot' then 'lot'
    else 'none'
  end
from public.item_master master
join public.item_types item_type on item_type.id = master.item_type_id
where po_item.item_master_id = master.id
  and (item_type.form_template = 'asset' or item_type.type_code = 'ASSET');

-- 4. Update set_purchase_order_item_behavior trigger function
create or replace function public.set_purchase_order_item_behavior()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attrs jsonb;
  v_item_master_id bigint;
  v_is_stocked boolean;
  v_target_warehouse_id bigint;
  v_tracking_method text;
  v_serial_ctrl boolean;
  v_lot_ctrl boolean;
begin
  v_item_master_id := new.item_master_id;

  if v_item_master_id is null and new.requisition_item_id is not null then
    select pr_item.item_master_id
    into v_item_master_id
    from public.purchase_requisition_items pr_item
    where pr_item.id = new.requisition_item_id;
    new.item_master_id := v_item_master_id;
  end if;

  if v_item_master_id is not null then
    select
      coalesce(item_type.is_stocked, pr_item.is_stocked, true),
      coalesce(nullif(master.tracking_method, ''), 'none'),
      coalesce(master.attributes, '{}'::jsonb),
      pr_item.target_warehouse_id,
      coalesce(item_type.serial_controlled, false),
      coalesce(item_type.lot_controlled, false)
    into v_is_stocked, v_tracking_method, v_attrs, v_target_warehouse_id, v_serial_ctrl, v_lot_ctrl
    from public.item_master master
    join public.item_types item_type on item_type.id = master.item_type_id
    left join public.purchase_requisition_items pr_item on pr_item.id = new.requisition_item_id
    where master.id = v_item_master_id;

    new.is_stocked := coalesce(v_is_stocked, true);

    if v_tracking_method in ('serial', 'lot') then
      new.tracking_method := v_tracking_method;
    elsif v_serial_ctrl then
      new.tracking_method := 'serial';
    elsif v_lot_ctrl then
      new.tracking_method := 'lot';
    else
      new.tracking_method := 'none';
    end if;

    if new.is_stocked then
      new.warehouse_id := coalesce(
        new.warehouse_id,
        v_target_warehouse_id,
        case when (v_attrs ->> 'warehouseId') ~ '^\d+$' then (v_attrs ->> 'warehouseId')::bigint else null end,
        (select warehouse.id from public.raw_material_warehouses warehouse where warehouse.status = 'active' order by warehouse.sort_order, warehouse.id limit 1)
      );
    else
      new.warehouse_id := null;
    end if;
  else
    new.is_stocked := true;
    new.tracking_method := 'lot';
    new.warehouse_id := coalesce(
      new.warehouse_id,
      (select warehouse.id from public.raw_material_warehouses warehouse where warehouse.status = 'active' order by warehouse.sort_order, warehouse.id limit 1)
    );
  end if;

  return new;
end;
$$;

-- 5. Update post_goods_receipt RPC to handle asset and non-stock items with serials seamlessly
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
  v_user_id uuid := (select auth.uid());
  v_po public.purchase_orders%rowtype;
  v_gr public.goods_receipts%rowtype;
  v_item jsonb;
  v_line_no integer := 0;
  v_po_item record;
  v_item_qty numeric(18, 4);
  v_gr_item_id bigint;
  v_warehouse_id bigint;
  v_lot_number text;
  v_period_key text;
  v_item_digits text;
  v_today_seq bigint;
  v_inventory_lot_id bigint;
  v_serials jsonb;
  v_serial jsonb;
  v_serial_text text;
  v_serial_count integer;
  v_total_ordered numeric(18, 4) := 0;
  v_total_received numeric(18, 4) := 0;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not (public.authorize('inventory.receive') or public.authorize('inventory.manage')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_purchase_order_id is null then
    raise exception 'purchase_order_required' using errcode = '22023';
  end if;
  if p_document_date is null then
    raise exception 'document_date_required' using errcode = '22023';
  end if;
  if nullif(btrim(p_delivery_note_no), '') is null then
    raise exception 'delivery_note_no_required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items_required' using errcode = '22023';
  end if;

  select po.*
  into v_po
  from public.purchase_orders po
  where po.id = p_purchase_order_id
  for update;

  if not found then
    raise exception 'purchase_order_not_found' using errcode = 'P0002';
  end if;

  if v_po.status not in ('approved', 'sent', 'partially_received') then
    raise exception 'invalid_po_status_for_receipt:%', v_po.status using errcode = '22023';
  end if;

  insert into public.goods_receipts (
    gr_number, document_date, purchase_order_id,
    vendor_id, vendor_code, vendor_name, delivery_note_no, remarks,
    status, created_by, updated_by
  ) values (
    null, p_document_date, v_po.id,
    v_po.vendor_id, v_po.vendor_code, v_po.vendor_name,
    btrim(p_delivery_note_no), nullif(btrim(p_remarks), ''),
    'posted', v_user_id, v_user_id
  ) returning * into v_gr;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_line_no := v_line_no + 1;
    v_item_qty := nullif(v_item ->> 'quantity_received', '')::numeric;

    if v_item_qty is null or v_item_qty <= 0 then
      raise exception 'invalid_received_quantity' using errcode = '22023';
    end if;

    select
      po_item.*,
      coalesce(item_type.is_stocked, po_item.is_stocked, true) as behavior_is_stocked,
      case
        when po_item.tracking_method in ('serial', 'lot') then po_item.tracking_method
        when coalesce(nullif(master.tracking_method, ''), '') in ('serial', 'lot') then master.tracking_method
        when coalesce(item_type.serial_controlled, false) then 'serial'
        when coalesce(item_type.lot_controlled, false) then 'lot'
        else 'none'
      end as behavior_tracking_method
    into v_po_item
    from public.purchase_order_items po_item
    left join public.item_master master on master.id = po_item.item_master_id
    left join public.item_types item_type on item_type.id = master.item_type_id
    where po_item.id = (v_item ->> 'purchase_order_item_id')::bigint
      and po_item.purchase_order_id = v_po.id;

    if not found then
      raise exception 'purchase_order_item_not_found' using errcode = 'P0002';
    end if;
    if v_po_item.item_master_id is null and v_po_item.raw_material_id is null then
      raise exception 'purchase_order_item_missing_item_reference' using errcode = '23503';
    end if;
    if v_po_item.received_qty + v_item_qty > v_po_item.quantity then
      raise exception 'received_qty_exceeded_ordered:%', v_po_item.item_name using errcode = '23514';
    end if;

    v_warehouse_id := coalesce(
      nullif(v_item ->> 'warehouse_id', '')::bigint,
      v_po_item.warehouse_id
    );

    if v_po_item.behavior_is_stocked and v_warehouse_id is null then
      raise exception 'warehouse_required' using errcode = '22023';
    end if;

    if v_po_item.behavior_tracking_method = 'serial' then
      if v_item_qty <> trunc(v_item_qty) then
        raise exception 'serial_quantity_must_be_integer' using errcode = '22023';
      end if;
      v_serials := coalesce(v_item -> 'serial_numbers', '[]'::jsonb);
      if jsonb_typeof(v_serials) <> 'array' then
        raise exception 'invalid_serial_numbers' using errcode = '22023';
      end if;
      select count(*) into v_serial_count
      from (
        select distinct btrim(value #>> '{}') as serial_number
        from jsonb_array_elements(v_serials)
        where btrim(value #>> '{}') <> ''
      ) serials;
      if v_serial_count <> v_item_qty::integer then
        raise exception 'serial_numbers_count_mismatch:%', v_po_item.item_name using errcode = '22023';
      end if;
    end if;

    update public.purchase_order_items
    set received_qty = received_qty + v_item_qty
    where id = v_po_item.id;

    insert into public.goods_receipt_items (
      goods_receipt_id, line_no, purchase_order_item_id, raw_material_id, item_master_id,
      item_code, item_name, quantity_ordered, quantity_received, unit_name,
      warehouse_id, remarks, vendor_lot_no, mfg_date, expiry_date, is_stocked, tracking_method
    ) values (
      v_gr.id, v_line_no, v_po_item.id, v_po_item.raw_material_id, v_po_item.item_master_id,
      v_po_item.item_code, v_po_item.item_name, v_po_item.quantity,
      v_item_qty, v_po_item.unit_name,
      case when v_po_item.behavior_is_stocked then v_warehouse_id else null end,
      nullif(btrim(v_item ->> 'remarks'), ''),
      nullif(btrim(v_item ->> 'vendor_lot_no'), ''),
      nullif(v_item ->> 'mfg_date', '')::date,
      nullif(v_item ->> 'expiry_date', '')::date,
      v_po_item.behavior_is_stocked,
      v_po_item.behavior_tracking_method
    ) returning id into v_gr_item_id;

    -- บันทึก Serial Numbers สำหรับสินทรัพย์ลง inventory_serials
    if v_po_item.behavior_tracking_method = 'serial' then
      for v_serial in select value from jsonb_array_elements(v_serials)
      loop
        v_serial_text := btrim(v_serial #>> '{}');
        if v_serial_text <> '' then
          insert into public.inventory_serials (
            item_master_id, serial_number, warehouse_id, goods_receipt_id,
            goods_receipt_item_id, purchase_order_id, purchase_order_item_id,
            status, created_by
          ) values (
            v_po_item.item_master_id, v_serial_text, case when v_po_item.behavior_is_stocked then v_warehouse_id else null end, v_gr.id,
            v_gr_item_id, v_po.id, v_po_item.id,
            case when v_po_item.behavior_is_stocked then 'in_stock' else 'in_use' end, v_user_id
          );
        end if;
      end loop;
    end if;

    if not v_po_item.behavior_is_stocked then
      continue;
    end if;

    if v_po_item.behavior_tracking_method = 'lot' then
      v_item_digits := regexp_replace(coalesce(v_po_item.item_code, v_po_item.item_master_id::text, v_po_item.raw_material_id::text), '[^0-9]', '', 'g');
      if v_item_digits = '' then
        v_item_digits := lpad(coalesce(v_po_item.item_master_id, v_po_item.raw_material_id)::text, 4, '0');
      end if;
      v_period_key := to_char(p_document_date, 'YYMMDD');

      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'lot_counter:item:' || coalesce(v_po_item.item_master_id::text, 'rm:' || v_po_item.raw_material_id::text) || ':' || v_period_key,
          0
        )
      );

      v_today_seq := nextval('public.inventory_lot_number_seq');
      v_lot_number := v_period_key || v_item_digits || '-' || v_today_seq::text;

      insert into public.inventory_lots (
        lot_number, raw_material_id, item_master_id, warehouse_id, goods_receipt_id,
        goods_receipt_item_id, purchase_order_id,
        received_qty, received_at, remarks, created_by,
        vendor_lot_no, mfg_date, expiry_date
      ) values (
        v_lot_number, v_po_item.raw_material_id, v_po_item.item_master_id, v_warehouse_id, v_gr.id,
        v_gr_item_id, v_po.id,
        v_item_qty, now(), nullif(btrim(v_item ->> 'remarks'), ''), v_user_id,
        nullif(btrim(v_item ->> 'vendor_lot_no'), ''),
        nullif(v_item ->> 'mfg_date', '')::date,
        nullif(v_item ->> 'expiry_date', '')::date
      ) returning id into v_inventory_lot_id;
    else
      v_inventory_lot_id := null;
    end if;

    insert into public.inventory_transactions (
      raw_material_id, item_master_id, warehouse_id, lot_id, transaction_type,
      reference_doc_type, reference_doc_number, quantity_change, created_by
    ) values (
      v_po_item.raw_material_id, v_po_item.item_master_id, v_warehouse_id, v_inventory_lot_id, 'receipt',
      'goods_receipt', v_gr.gr_number, v_item_qty, v_user_id
    );
  end loop;

  select coalesce(sum(quantity), 0), coalesce(sum(received_qty), 0)
  into v_total_ordered, v_total_received
  from public.purchase_order_items
  where purchase_order_id = v_po.id;

  if v_total_received >= v_total_ordered then
    update public.purchase_orders
    set status = 'received', updated_at = timezone('utc', now()), updated_by = v_user_id
    where id = v_po.id;
  elsif v_total_received > 0 then
    update public.purchase_orders
    set status = 'partially_received', updated_at = timezone('utc', now()), updated_by = v_user_id
    where id = v_po.id;
  end if;

  return query select v_gr.id, v_gr.gr_number;
end;
$$;
