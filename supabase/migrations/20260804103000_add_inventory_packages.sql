alter table public.inventory_lots
  drop constraint if exists inventory_lots_goods_receipt_item_id_key;

create index if not exists inventory_lots_goods_receipt_item_idx
  on public.inventory_lots (goods_receipt_item_id);

create table if not exists public.inventory_packages (
  id bigint generated always as identity primary key,
  package_number text not null unique,
  barcode_value text not null unique,
  inventory_lot_id bigint not null references public.inventory_lots(id) on delete restrict,
  quantity numeric(18, 4) not null check (quantity > 0),
  weight_kg numeric(18, 3) check (weight_kg is null or weight_kg >= 0),
  status text not null default 'active' check (status in ('active', 'consumed', 'cancelled')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_packages_number_not_blank check (length(btrim(package_number)) > 0),
  constraint inventory_packages_barcode_not_blank check (length(btrim(barcode_value)) > 0)
);

create index if not exists inventory_packages_lot_status_idx
  on public.inventory_packages (inventory_lot_id, status);

alter table public.inventory_packages enable row level security;

drop policy if exists "Authorized users can read inventory packages" on public.inventory_packages;
create policy "Authorized users can read inventory packages"
on public.inventory_packages for select to authenticated
using (public.authorize('inventory.view'));

grant select on public.inventory_packages to authenticated;
revoke insert, update, delete on public.inventory_packages from authenticated;
revoke all on sequence public.inventory_packages_id_seq from public, anon, authenticated;

insert into public.inventory_packages (
  package_number, barcode_value, inventory_lot_id, quantity, weight_kg, created_by
)
select
  'PKG-LEGACY-' || lot.id,
  'PKG-LEGACY-' || lot.id,
  lot.id,
  lot.received_qty,
  lot.received_weight_kg,
  lot.created_by
from public.inventory_lots lot
where not exists (
  select 1 from public.inventory_packages package
  where package.inventory_lot_id = lot.id
);

create or replace function public.post_goods_receipt(
  p_purchase_order_id bigint,
  p_document_date date,
  p_delivery_note_no text,
  p_remarks text,
  p_items jsonb
)
returns table (goods_receipt_id bigint, goods_receipt_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_actor_name text;
  v_po public.purchase_orders%rowtype;
  v_po_item public.purchase_order_items%rowtype;
  v_gr public.goods_receipts%rowtype;
  v_item jsonb;
  v_lot jsonb;
  v_package jsonb;
  v_gr_item_id bigint;
  v_inventory_lot_id bigint;
  v_line_no integer := 0;
  v_lot_index integer;
  v_package_index integer;
  v_warehouse_id bigint;
  v_item_qty numeric(18, 4);
  v_lot_qty numeric(18, 4);
  v_item_package_qty numeric(18, 4);
  v_package_qty numeric(18, 4);
  v_package_weight numeric(18, 3);
  v_lot_weight numeric(18, 3);
  v_lot_number text;
  v_package_number text;
  v_number_seed text;
  v_total_ordered numeric(18, 4);
  v_total_received numeric(18, 4);
  v_po_status text;
begin
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
    if jsonb_typeof(v_item -> 'lots') <> 'array' or jsonb_array_length(v_item -> 'lots') = 0 then
      raise exception 'lot_required' using errcode = '22023';
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

    select coalesce(sum((package.value ->> 'quantity_received')::numeric), 0)
      into v_item_package_qty
    from jsonb_array_elements(v_item -> 'lots') lot(value)
    cross join lateral jsonb_array_elements(lot.value -> 'packages') package(value);

    if abs(v_item_package_qty - v_item_qty) > 0.0001 then
      raise exception 'package_quantity_mismatch:%', v_po_item.item_code using errcode = '23514';
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

    v_lot_index := 0;
    for v_lot in select value from jsonb_array_elements(v_item -> 'lots')
    loop
      v_lot_index := v_lot_index + 1;
      if jsonb_typeof(v_lot -> 'packages') <> 'array' or jsonb_array_length(v_lot -> 'packages') = 0 then
        raise exception 'package_required' using errcode = '22023';
      end if;

      select
        coalesce(sum((package.value ->> 'quantity_received')::numeric), 0),
        nullif(sum(nullif(package.value ->> 'weight_kg', '')::numeric), 0)
      into v_lot_qty, v_lot_weight
      from jsonb_array_elements(v_lot -> 'packages') package(value);

      if v_lot_qty <= 0 then
        raise exception 'invalid_lot_quantity' using errcode = '22023';
      end if;

      v_lot_number := coalesce(
        nullif(upper(btrim(v_lot ->> 'lot_number')), ''),
        'LOT' || v_number_seed || lpad(v_line_no::text, 2, '0') || lpad(v_lot_index::text, 2, '0')
      );

      insert into public.inventory_lots (
        lot_number, raw_material_id, warehouse_id, goods_receipt_id,
        goods_receipt_item_id, purchase_order_id, supplier_coil_no,
        received_qty, received_weight_kg, received_at, remarks, created_by
      ) values (
        v_lot_number, v_po_item.raw_material_id, v_warehouse_id, v_gr.id,
        v_gr_item_id, v_po.id, nullif(upper(btrim(v_lot ->> 'supplier_coil_no')), ''),
        v_lot_qty, v_lot_weight, now(), nullif(btrim(v_item ->> 'remarks'), ''), v_user_id
      ) returning id into v_inventory_lot_id;

      v_package_index := 0;
      for v_package in select value from jsonb_array_elements(v_lot -> 'packages')
      loop
        v_package_index := v_package_index + 1;
        v_package_qty := coalesce(nullif(v_package ->> 'quantity_received', '')::numeric, 0);
        v_package_weight := nullif(v_package ->> 'weight_kg', '')::numeric;
        if v_package_qty <= 0 or (v_package_weight is not null and v_package_weight < 0) then
          raise exception 'invalid_package_values' using errcode = '22023';
        end if;

        v_package_number := coalesce(
          nullif(upper(btrim(v_package ->> 'package_number')), ''),
          'PKG' || v_number_seed || lpad(v_line_no::text, 2, '0') ||
            lpad(v_lot_index::text, 2, '0') || lpad(v_package_index::text, 2, '0')
        );

        insert into public.inventory_packages (
          package_number, barcode_value, inventory_lot_id,
          quantity, weight_kg, created_by
        ) values (
          v_package_number, v_package_number, v_inventory_lot_id,
          v_package_qty, v_package_weight, v_user_id
        );
      end loop;

      insert into public.inventory_transactions (
        raw_material_id, warehouse_id, lot_id, transaction_type,
        reference_doc_type, reference_doc_number, quantity_change, created_by
      ) values (
        v_po_item.raw_material_id, v_warehouse_id, v_inventory_lot_id, 'receipt',
        'goods_receipt', v_gr.gr_number, v_lot_qty, v_user_id
      );
    end loop;
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
