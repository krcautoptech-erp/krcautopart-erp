create table if not exists public.inventory_lots (
  id bigint generated always as identity primary key,
  lot_number text not null unique,
  raw_material_id bigint not null references public.raw_materials(id) on delete restrict,
  warehouse_id bigint not null references public.raw_material_warehouses(id) on delete restrict,
  goods_receipt_id bigint not null references public.goods_receipts(id) on delete restrict,
  goods_receipt_item_id bigint not null unique references public.goods_receipt_items(id) on delete restrict,
  purchase_order_id bigint not null references public.purchase_orders(id) on delete restrict,
  supplier_coil_no text,
  received_qty numeric(18, 4) not null check (received_qty > 0),
  received_weight_kg numeric(18, 3) check (received_weight_kg is null or received_weight_kg >= 0),
  on_hand_qty numeric(18, 4) not null default 0,
  reserved_qty numeric(18, 4) not null default 0,
  available_qty numeric(18, 4) generated always as (on_hand_qty - reserved_qty) stored,
  received_at timestamptz not null default now(),
  remarks text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_lots_lot_number_not_blank check (length(btrim(lot_number)) > 0),
  constraint inventory_lots_reserved_qty_check check (reserved_qty >= 0),
  constraint inventory_lots_available_qty_check check (on_hand_qty >= reserved_qty)
);

alter table public.inventory_transactions
  add column if not exists lot_id bigint references public.inventory_lots(id) on delete restrict;

create index if not exists inventory_lots_material_warehouse_received_idx
  on public.inventory_lots (raw_material_id, warehouse_id, received_at desc);
create index if not exists inventory_lots_supplier_coil_idx
  on public.inventory_lots (supplier_coil_no)
  where supplier_coil_no is not null;
create index if not exists inventory_lots_available_idx
  on public.inventory_lots (warehouse_id, raw_material_id)
  where available_qty > 0;
create index if not exists inventory_transactions_lot_created_idx
  on public.inventory_transactions (lot_id, created_at desc)
  where lot_id is not null;

alter table public.inventory_lots enable row level security;

drop policy if exists "Authorized users can read inventory lots" on public.inventory_lots;
create policy "Authorized users can read inventory lots"
on public.inventory_lots for select to authenticated
using (public.authorize('inventory.view'));

grant select on public.inventory_lots to authenticated;
revoke insert, update, delete on public.inventory_lots from authenticated;

create or replace function public.sync_inventory_lot_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot_id bigint := coalesce(new.lot_id, old.lot_id);
begin
  if v_lot_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  update public.inventory_lots lot
  set on_hand_qty = coalesce((
        select sum(tx.quantity_change)
        from public.inventory_transactions tx
        where tx.lot_id = v_lot_id
      ), 0),
      updated_at = now()
  where lot.id = v_lot_id;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_transactions_sync_lot_balance on public.inventory_transactions;
create trigger inventory_transactions_sync_lot_balance
after insert or update or delete on public.inventory_transactions
for each row execute function public.sync_inventory_lot_balance();

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
  v_actor_name text;
  v_gr public.goods_receipts%rowtype;
  v_gr_item_id bigint;
  v_inventory_lot_id bigint;
  v_item jsonb;
  v_line_no integer := 0;
  v_po public.purchase_orders%rowtype;
  v_po_item public.purchase_order_items%rowtype;
  v_qty_received numeric(18, 4);
  v_weight_kg numeric(18, 3);
  v_warehouse_id bigint;
  v_lot_number text;
  v_total_ordered numeric(18, 4);
  v_total_received numeric(18, 4);
  v_po_status text;
  v_user_id uuid := (select auth.uid());
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

  select coalesce(nullif(concat_ws(' ', profile.first_name, profile.last_name), ''),
                  nullif(app_user.raw_app_meta_data ->> 'full_name', ''),
                  nullif(app_user.email, ''), 'เจ้าหน้าที่คลังสินค้า')
  into v_actor_name
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

  perform po_item.id
  from public.purchase_order_items po_item
  where po_item.purchase_order_id = v_po.id
  order by po_item.id
  for update;

  for v_item in
    select item from jsonb_array_elements(p_items) item
    order by (item ->> 'line_no')::integer
  loop
    v_line_no := v_line_no + 1;
    v_qty_received := coalesce(nullif(v_item ->> 'quantity_received', '')::numeric, 0);
    if v_qty_received = 0 then continue; end if;
    if v_qty_received < 0 then
      raise exception 'invalid_quantity_received' using errcode = '22023';
    end if;

    v_warehouse_id := nullif(v_item ->> 'warehouse_id', '')::bigint;
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
    if v_po_item.received_qty + v_qty_received > v_po_item.quantity then
      raise exception 'received_qty_exceeded_ordered:%', v_po_item.item_name using errcode = '23514';
    end if;

    update public.purchase_order_items
    set received_qty = received_qty + v_qty_received
    where id = v_po_item.id;

    insert into public.goods_receipt_items (
      goods_receipt_id, line_no, purchase_order_item_id, raw_material_id,
      item_code, item_name, quantity_ordered, quantity_received, unit_name,
      warehouse_id, remarks
    ) values (
      v_gr.id, v_line_no, v_po_item.id, v_po_item.raw_material_id,
      v_po_item.item_code, v_po_item.item_name, v_po_item.quantity,
      v_qty_received, v_po_item.unit_name, v_warehouse_id,
      nullif(btrim(v_item ->> 'remarks'), '')
    ) returning id into v_gr_item_id;

    v_lot_number := coalesce(
      nullif(upper(btrim(v_item ->> 'lot_number')), ''),
      'LOT' || regexp_replace(v_gr.gr_number, '[^0-9]', '', 'g') || lpad(v_line_no::text, 2, '0')
    );
    v_weight_kg := nullif(v_item ->> 'weight_kg', '')::numeric;

    insert into public.inventory_lots (
      lot_number, raw_material_id, warehouse_id, goods_receipt_id,
      goods_receipt_item_id, purchase_order_id, supplier_coil_no,
      received_qty, received_weight_kg, received_at, remarks, created_by
    ) values (
      v_lot_number, v_po_item.raw_material_id, v_warehouse_id, v_gr.id,
      v_gr_item_id, v_po.id, nullif(upper(btrim(v_item ->> 'supplier_coil_no')), ''),
      v_qty_received, v_weight_kg, now(), nullif(btrim(v_item ->> 'remarks'), ''), v_user_id
    ) returning id into v_inventory_lot_id;

    insert into public.inventory_transactions (
      raw_material_id, warehouse_id, lot_id, transaction_type,
      reference_doc_type, reference_doc_number, quantity_change, created_by
    ) values (
      v_po_item.raw_material_id, v_warehouse_id, v_inventory_lot_id, 'receipt',
      'goods_receipt', v_gr.gr_number, v_qty_received, v_user_id
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

revoke all on function public.post_goods_receipt(bigint, date, text, text, jsonb) from public;
grant execute on function public.post_goods_receipt(bigint, date, text, text, jsonb) to authenticated;
