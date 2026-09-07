-- Phase 2/3: make purchase, receipt, and stock flows point to item_master.
-- Legacy raw_material/product references are kept as compatibility fallbacks.

create sequence if not exists public.inventory_lot_number_seq;

alter table public.purchase_order_items
  add column if not exists item_master_id bigint;

alter table public.purchase_order_items
  drop constraint if exists purchase_order_items_item_master_id_fkey,
  add constraint purchase_order_items_item_master_id_fkey
    foreign key (item_master_id) references public.item_master(id) on delete restrict;

create index if not exists purchase_order_items_item_master_id_idx
  on public.purchase_order_items (item_master_id, purchase_order_id)
  where item_master_id is not null;

update public.purchase_order_items po_item
set item_master_id = pr_item.item_master_id
from public.purchase_requisition_items pr_item
where po_item.requisition_item_id = pr_item.id
  and po_item.item_master_id is null
  and pr_item.item_master_id is not null;

update public.purchase_order_items po_item
set item_master_id = master.id
from public.item_master master
where po_item.item_master_id is null
  and po_item.raw_material_id is not null
  and master.attributes ->> 'legacySource' = 'raw_material'
  and (master.attributes ->> 'legacySourceId')::bigint = po_item.raw_material_id;

create or replace function public.set_purchase_order_item_master_ref()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.item_master_id is null and new.requisition_item_id is not null then
    select item.item_master_id
    into new.item_master_id
    from public.purchase_requisition_items item
    where item.id = new.requisition_item_id;
  end if;

  if new.item_master_id is null and new.raw_material_id is not null then
    select master.id
    into new.item_master_id
    from public.item_master master
    where master.attributes ->> 'legacySource' = 'raw_material'
      and (master.attributes ->> 'legacySourceId')::bigint = new.raw_material_id
    limit 1;
  end if;

  return new;
end;
$$;

drop trigger if exists purchase_order_items_set_item_master_ref on public.purchase_order_items;
create trigger purchase_order_items_set_item_master_ref
before insert or update of requisition_item_id, raw_material_id, item_master_id
on public.purchase_order_items
for each row execute function public.set_purchase_order_item_master_ref();

alter table public.goods_receipt_items
  add column if not exists item_master_id bigint;

alter table public.goods_receipt_items
  alter column raw_material_id drop not null;

alter table public.goods_receipt_items
  drop constraint if exists goods_receipt_items_item_master_id_fkey,
  add constraint goods_receipt_items_item_master_id_fkey
    foreign key (item_master_id) references public.item_master(id) on delete restrict;

alter table public.goods_receipt_items
  drop constraint if exists goods_receipt_items_item_source_check,
  add constraint goods_receipt_items_item_source_check
    check (raw_material_id is not null or item_master_id is not null);

create index if not exists goods_receipt_items_item_master_id_idx
  on public.goods_receipt_items (item_master_id, goods_receipt_id)
  where item_master_id is not null;

update public.goods_receipt_items receipt_item
set item_master_id = po_item.item_master_id
from public.purchase_order_items po_item
where receipt_item.purchase_order_item_id = po_item.id
  and receipt_item.item_master_id is null
  and po_item.item_master_id is not null;

alter table public.inventory_lots
  add column if not exists item_master_id bigint;

alter table public.inventory_lots
  alter column raw_material_id drop not null;

alter table public.inventory_lots
  drop constraint if exists inventory_lots_item_master_id_fkey,
  add constraint inventory_lots_item_master_id_fkey
    foreign key (item_master_id) references public.item_master(id) on delete restrict;

alter table public.inventory_lots
  drop constraint if exists inventory_lots_item_source_check,
  add constraint inventory_lots_item_source_check
    check (raw_material_id is not null or item_master_id is not null);

create index if not exists inventory_lots_item_master_warehouse_idx
  on public.inventory_lots (item_master_id, warehouse_id, received_at desc)
  where item_master_id is not null;

update public.inventory_lots lot
set item_master_id = master.id
from public.item_master master
where lot.item_master_id is null
  and lot.raw_material_id is not null
  and master.attributes ->> 'legacySource' = 'raw_material'
  and (master.attributes ->> 'legacySourceId')::bigint = lot.raw_material_id;

alter table public.inventory_transactions
  add column if not exists item_master_id bigint;

alter table public.inventory_transactions
  alter column raw_material_id drop not null;

alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_item_master_id_fkey,
  add constraint inventory_transactions_item_master_id_fkey
    foreign key (item_master_id) references public.item_master(id) on delete restrict;

alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_item_source_check,
  add constraint inventory_transactions_item_source_check
    check (raw_material_id is not null or item_master_id is not null);

create index if not exists inventory_transactions_item_master_wh_created_idx
  on public.inventory_transactions (item_master_id, warehouse_id, created_at desc)
  where item_master_id is not null;

update public.inventory_transactions tx
set item_master_id = lot.item_master_id
from public.inventory_lots lot
where tx.lot_id = lot.id
  and tx.item_master_id is null
  and lot.item_master_id is not null;

update public.inventory_transactions tx
set item_master_id = master.id
from public.item_master master
where tx.item_master_id is null
  and tx.raw_material_id is not null
  and master.attributes ->> 'legacySource' = 'raw_material'
  and (master.attributes ->> 'legacySourceId')::bigint = tx.raw_material_id;

alter table public.product_transactions
  add column if not exists item_master_id bigint;

alter table public.product_transactions
  drop constraint if exists product_transactions_item_master_id_fkey,
  add constraint product_transactions_item_master_id_fkey
    foreign key (item_master_id) references public.item_master(id) on delete restrict;

create index if not exists product_transactions_item_master_wh_created_idx
  on public.product_transactions (item_master_id, warehouse_id, created_at desc)
  where item_master_id is not null;

update public.product_transactions tx
set item_master_id = master.id
from public.item_master master
where tx.item_master_id is null
  and master.attributes ->> 'legacySource' = 'product'
  and master.attributes ->> 'legacySourceId' = tx.product_id::text;

create table if not exists public.item_inventory_balances (
  item_master_id bigint not null references public.item_master(id) on delete restrict,
  warehouse_id bigint not null references public.raw_material_warehouses(id) on delete restrict,
  on_hand_qty numeric(18, 4) not null default 0,
  allocated_qty numeric(18, 4) not null default 0,
  available_qty numeric(18, 4) generated always as (on_hand_qty - allocated_qty) stored,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (item_master_id, warehouse_id),
  constraint item_inventory_balances_on_hand_check check (on_hand_qty >= 0)
);

alter table public.item_inventory_balances enable row level security;

drop policy if exists "Authorized users can read item inventory balances"
  on public.item_inventory_balances;
create policy "Authorized users can read item inventory balances"
on public.item_inventory_balances
for select
to authenticated
using (
  public.authorize('inventory.view')
  or public.authorize('inventory.create_gr')
);

grant select on public.item_inventory_balances to authenticated;
revoke insert, update, delete on public.item_inventory_balances from authenticated;

insert into public.item_inventory_balances (
  item_master_id,
  warehouse_id,
  on_hand_qty,
  allocated_qty,
  updated_at
)
select
  tx.item_master_id,
  tx.warehouse_id,
  sum(tx.quantity_change),
  0,
  timezone('utc', now())
from public.inventory_transactions tx
where tx.item_master_id is not null
group by tx.item_master_id, tx.warehouse_id
on conflict (item_master_id, warehouse_id) do update
set on_hand_qty = excluded.on_hand_qty,
    updated_at = excluded.updated_at;

insert into public.item_inventory_balances (
  item_master_id,
  warehouse_id,
  on_hand_qty,
  allocated_qty,
  updated_at
)
select
  tx.item_master_id,
  tx.warehouse_id,
  sum(tx.quantity_change),
  0,
  timezone('utc', now())
from public.product_transactions tx
where tx.item_master_id is not null
group by tx.item_master_id, tx.warehouse_id
on conflict (item_master_id, warehouse_id) do update
set on_hand_qty = public.item_inventory_balances.on_hand_qty + excluded.on_hand_qty,
    updated_at = excluded.updated_at;

create or replace function public.sync_inventory_balances()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_item_master_id bigint;
  v_old_item_master_id bigint;
begin
  if tg_op = 'INSERT' then
    v_new_item_master_id := new.item_master_id;
    if v_new_item_master_id is null and new.raw_material_id is not null then
      select master.id
      into v_new_item_master_id
      from public.item_master master
      where master.attributes ->> 'legacySource' = 'raw_material'
        and (master.attributes ->> 'legacySourceId')::bigint = new.raw_material_id
      limit 1;
    end if;

    if new.raw_material_id is not null then
      insert into public.inventory_balances (raw_material_id, warehouse_id, on_hand_qty, updated_at)
      values (new.raw_material_id, new.warehouse_id, new.quantity_change, now())
      on conflict (raw_material_id, warehouse_id) do update
      set on_hand_qty = public.inventory_balances.on_hand_qty + excluded.on_hand_qty,
          updated_at = now();
    end if;

    if v_new_item_master_id is not null then
      insert into public.item_inventory_balances (item_master_id, warehouse_id, on_hand_qty, updated_at)
      values (v_new_item_master_id, new.warehouse_id, new.quantity_change, now())
      on conflict (item_master_id, warehouse_id) do update
      set on_hand_qty = public.item_inventory_balances.on_hand_qty + excluded.on_hand_qty,
          updated_at = now();
    end if;

    return new;
  elsif tg_op = 'UPDATE' then
    v_old_item_master_id := old.item_master_id;
    if v_old_item_master_id is null and old.raw_material_id is not null then
      select master.id
      into v_old_item_master_id
      from public.item_master master
      where master.attributes ->> 'legacySource' = 'raw_material'
        and (master.attributes ->> 'legacySourceId')::bigint = old.raw_material_id
      limit 1;
    end if;

    v_new_item_master_id := new.item_master_id;
    if v_new_item_master_id is null and new.raw_material_id is not null then
      select master.id
      into v_new_item_master_id
      from public.item_master master
      where master.attributes ->> 'legacySource' = 'raw_material'
        and (master.attributes ->> 'legacySourceId')::bigint = new.raw_material_id
      limit 1;
    end if;

    if old.raw_material_id is not null then
      update public.inventory_balances
      set on_hand_qty = on_hand_qty - old.quantity_change,
          updated_at = now()
      where raw_material_id = old.raw_material_id and warehouse_id = old.warehouse_id;
    end if;

    if v_old_item_master_id is not null then
      update public.item_inventory_balances
      set on_hand_qty = on_hand_qty - old.quantity_change,
          updated_at = now()
      where item_master_id = v_old_item_master_id and warehouse_id = old.warehouse_id;
    end if;

    if new.raw_material_id is not null then
      insert into public.inventory_balances (raw_material_id, warehouse_id, on_hand_qty, updated_at)
      values (new.raw_material_id, new.warehouse_id, new.quantity_change, now())
      on conflict (raw_material_id, warehouse_id) do update
      set on_hand_qty = public.inventory_balances.on_hand_qty + excluded.on_hand_qty,
          updated_at = now();
    end if;

    if v_new_item_master_id is not null then
      insert into public.item_inventory_balances (item_master_id, warehouse_id, on_hand_qty, updated_at)
      values (v_new_item_master_id, new.warehouse_id, new.quantity_change, now())
      on conflict (item_master_id, warehouse_id) do update
      set on_hand_qty = public.item_inventory_balances.on_hand_qty + excluded.on_hand_qty,
          updated_at = now();
    end if;

    return new;
  elsif tg_op = 'DELETE' then
    v_old_item_master_id := old.item_master_id;
    if v_old_item_master_id is null and old.raw_material_id is not null then
      select master.id
      into v_old_item_master_id
      from public.item_master master
      where master.attributes ->> 'legacySource' = 'raw_material'
        and (master.attributes ->> 'legacySourceId')::bigint = old.raw_material_id
      limit 1;
    end if;

    if old.raw_material_id is not null then
      update public.inventory_balances
      set on_hand_qty = on_hand_qty - old.quantity_change,
          updated_at = now()
      where raw_material_id = old.raw_material_id and warehouse_id = old.warehouse_id;
    end if;

    if v_old_item_master_id is not null then
      update public.item_inventory_balances
      set on_hand_qty = on_hand_qty - old.quantity_change,
          updated_at = now()
      where item_master_id = v_old_item_master_id and warehouse_id = old.warehouse_id;
    end if;

    return old;
  end if;

  return null;
end;
$$;

create or replace function public.sync_product_balances()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_item_master_id bigint;
  v_old_item_master_id bigint;
begin
  if tg_op = 'INSERT' then
    v_new_item_master_id := new.item_master_id;
    if v_new_item_master_id is null then
      select master.id
      into v_new_item_master_id
      from public.item_master master
      where master.attributes ->> 'legacySource' = 'product'
        and master.attributes ->> 'legacySourceId' = new.product_id::text
      limit 1;
    end if;

    insert into public.product_balances (product_id, warehouse_id, on_hand_qty, updated_at)
    values (new.product_id, new.warehouse_id, new.quantity_change, now())
    on conflict (product_id, warehouse_id) do update
    set on_hand_qty = public.product_balances.on_hand_qty + excluded.on_hand_qty,
        updated_at = now();

    if v_new_item_master_id is not null then
      insert into public.item_inventory_balances (item_master_id, warehouse_id, on_hand_qty, updated_at)
      values (v_new_item_master_id, new.warehouse_id, new.quantity_change, now())
      on conflict (item_master_id, warehouse_id) do update
      set on_hand_qty = public.item_inventory_balances.on_hand_qty + excluded.on_hand_qty,
          updated_at = now();
    end if;

    return new;
  elsif tg_op = 'UPDATE' then
    v_old_item_master_id := old.item_master_id;
    if v_old_item_master_id is null then
      select master.id
      into v_old_item_master_id
      from public.item_master master
      where master.attributes ->> 'legacySource' = 'product'
        and master.attributes ->> 'legacySourceId' = old.product_id::text
      limit 1;
    end if;

    v_new_item_master_id := new.item_master_id;
    if v_new_item_master_id is null then
      select master.id
      into v_new_item_master_id
      from public.item_master master
      where master.attributes ->> 'legacySource' = 'product'
        and master.attributes ->> 'legacySourceId' = new.product_id::text
      limit 1;
    end if;

    update public.product_balances
    set on_hand_qty = on_hand_qty - old.quantity_change,
        updated_at = now()
    where product_id = old.product_id and warehouse_id = old.warehouse_id;

    if v_old_item_master_id is not null then
      update public.item_inventory_balances
      set on_hand_qty = on_hand_qty - old.quantity_change,
          updated_at = now()
      where item_master_id = v_old_item_master_id and warehouse_id = old.warehouse_id;
    end if;

    insert into public.product_balances (product_id, warehouse_id, on_hand_qty, updated_at)
    values (new.product_id, new.warehouse_id, new.quantity_change, now())
    on conflict (product_id, warehouse_id) do update
    set on_hand_qty = public.product_balances.on_hand_qty + excluded.on_hand_qty,
        updated_at = now();

    if v_new_item_master_id is not null then
      insert into public.item_inventory_balances (item_master_id, warehouse_id, on_hand_qty, updated_at)
      values (v_new_item_master_id, new.warehouse_id, new.quantity_change, now())
      on conflict (item_master_id, warehouse_id) do update
      set on_hand_qty = public.item_inventory_balances.on_hand_qty + excluded.on_hand_qty,
          updated_at = now();
    end if;

    return new;
  elsif tg_op = 'DELETE' then
    v_old_item_master_id := old.item_master_id;
    if v_old_item_master_id is null then
      select master.id
      into v_old_item_master_id
      from public.item_master master
      where master.attributes ->> 'legacySource' = 'product'
        and master.attributes ->> 'legacySourceId' = old.product_id::text
      limit 1;
    end if;

    update public.product_balances
    set on_hand_qty = on_hand_qty - old.quantity_change,
        updated_at = now()
    where product_id = old.product_id and warehouse_id = old.warehouse_id;

    if v_old_item_master_id is not null then
      update public.item_inventory_balances
      set on_hand_qty = on_hand_qty - old.quantity_change,
          updated_at = now()
      where item_master_id = v_old_item_master_id and warehouse_id = old.warehouse_id;
    end if;

    return old;
  end if;

  return null;
end;
$$;

create or replace view public.item_stock_balances
with (security_invoker = true)
as
select
  balance.item_master_id,
  master.item_code,
  master.item_name,
  item_type.type_code as item_type_code,
  item_type.type_name as item_type_name,
  balance.warehouse_id,
  warehouse.warehouse_name,
  balance.on_hand_qty,
  balance.allocated_qty,
  balance.available_qty,
  balance.updated_at
from public.item_inventory_balances balance
join public.item_master master on master.id = balance.item_master_id
left join public.item_types item_type on item_type.id = master.item_type_id
left join public.raw_material_warehouses warehouse on warehouse.id = balance.warehouse_id;

grant select on public.item_stock_balances to authenticated;

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
  v_period_key text;
  v_item_digits text;
  v_today_seq integer;
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

  v_number_seed := regexp_replace(coalesce(v_gr.gr_number, v_gr.id::text), '[^0-9]', '', 'g');

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
    if v_po_item.item_master_id is null and v_po_item.raw_material_id is null then
      raise exception 'purchase_order_item_missing_item_reference' using errcode = '23503';
    end if;
    if v_po_item.received_qty + v_item_qty > v_po_item.quantity then
      raise exception 'received_qty_exceeded_ordered:%', v_po_item.item_name using errcode = '23514';
    end if;

    update public.purchase_order_items
    set received_qty = received_qty + v_item_qty
    where id = v_po_item.id;

    insert into public.goods_receipt_items (
      goods_receipt_id, line_no, purchase_order_item_id, raw_material_id, item_master_id,
      item_code, item_name, quantity_ordered, quantity_received, unit_name,
      warehouse_id, remarks
    ) values (
      v_gr.id, v_line_no, v_po_item.id, v_po_item.raw_material_id, v_po_item.item_master_id,
      v_po_item.item_code, v_po_item.item_name, v_po_item.quantity,
      v_item_qty, v_po_item.unit_name, v_warehouse_id,
      nullif(btrim(v_item ->> 'remarks'), '')
    ) returning id into v_gr_item_id;

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
      received_qty, received_at, remarks, created_by
    ) values (
      v_lot_number, v_po_item.raw_material_id, v_po_item.item_master_id, v_warehouse_id, v_gr.id,
      v_gr_item_id, v_po.id,
      v_item_qty, now(), nullif(btrim(v_item ->> 'remarks'), ''), v_user_id
    ) returning id into v_inventory_lot_id;

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
