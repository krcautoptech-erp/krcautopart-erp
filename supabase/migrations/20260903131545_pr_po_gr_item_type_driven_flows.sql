-- ==============================================================================
-- PR / PO / GR: Item Type Driven ERP Flows
-- ==============================================================================
-- Goal:
-- - Keep item_master as the single item reference.
-- - Snapshot item behavior on documents so historical PR/PO/GR lines remain stable.
-- - Support stocked/non-stock and tracking none/lot/serial in Goods Receipt.

-- ------------------------------------------------------------------------------
-- 1. Schema: PR/PO/GR behavior metadata
-- ------------------------------------------------------------------------------

alter table public.purchase_requisition_items
  add column if not exists is_stocked boolean not null default true,
  add column if not exists target_warehouse_id bigint;

alter table public.purchase_requisition_items
  drop constraint if exists purchase_requisition_items_target_warehouse_id_fkey,
  add constraint purchase_requisition_items_target_warehouse_id_fkey
    foreign key (target_warehouse_id)
    references public.raw_material_warehouses(id)
    on delete restrict;

create index if not exists purchase_requisition_items_target_warehouse_id_idx
  on public.purchase_requisition_items(target_warehouse_id)
  where target_warehouse_id is not null;

alter table public.purchase_order_items
  add column if not exists is_stocked boolean not null default true,
  add column if not exists tracking_method text not null default 'none',
  add column if not exists warehouse_id bigint;

alter table public.purchase_order_items
  drop constraint if exists purchase_order_items_tracking_method_check,
  add constraint purchase_order_items_tracking_method_check
    check (tracking_method in ('none', 'lot', 'serial')),
  drop constraint if exists purchase_order_items_warehouse_id_fkey,
  add constraint purchase_order_items_warehouse_id_fkey
    foreign key (warehouse_id)
    references public.raw_material_warehouses(id)
    on delete restrict,
  drop constraint if exists purchase_order_items_stocked_warehouse_check,
  add constraint purchase_order_items_stocked_warehouse_check
    check ((is_stocked = false) or (warehouse_id is not null)) not valid;

create index if not exists purchase_order_items_warehouse_id_idx
  on public.purchase_order_items(warehouse_id)
  where warehouse_id is not null;

create index if not exists purchase_order_items_behavior_idx
  on public.purchase_order_items(is_stocked, tracking_method, purchase_order_id);

alter table public.goods_receipt_items
  add column if not exists vendor_lot_no text,
  add column if not exists mfg_date date,
  add column if not exists expiry_date date,
  add column if not exists is_stocked boolean not null default true,
  add column if not exists tracking_method text not null default 'none';

alter table public.goods_receipt_items
  alter column warehouse_id drop not null,
  drop constraint if exists goods_receipt_items_tracking_method_check,
  add constraint goods_receipt_items_tracking_method_check
    check (tracking_method in ('none', 'lot', 'serial')),
  drop constraint if exists goods_receipt_items_stocked_warehouse_check,
  add constraint goods_receipt_items_stocked_warehouse_check
    check ((is_stocked = false) or (warehouse_id is not null)) not valid;

create index if not exists goods_receipt_items_behavior_idx
  on public.goods_receipt_items(is_stocked, tracking_method, goods_receipt_id);

alter table public.inventory_lots
  add column if not exists vendor_lot_no text,
  add column if not exists mfg_date date,
  add column if not exists expiry_date date;

create table if not exists public.inventory_serials (
  id bigint generated always as identity primary key,
  item_master_id bigint not null references public.item_master(id) on delete restrict,
  serial_number text not null,
  warehouse_id bigint not null references public.raw_material_warehouses(id) on delete restrict,
  goods_receipt_id bigint references public.goods_receipts(id) on delete restrict,
  goods_receipt_item_id bigint references public.goods_receipt_items(id) on delete restrict,
  purchase_order_id bigint references public.purchase_orders(id) on delete restrict,
  purchase_order_item_id bigint references public.purchase_order_items(id) on delete restrict,
  status text not null default 'in_stock',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint inventory_serials_number_not_blank check (length(btrim(serial_number)) > 0),
  constraint inventory_serials_status_check check (status in ('in_stock', 'allocated', 'consumed', 'scrapped')),
  constraint inventory_serials_item_serial_unique unique (item_master_id, serial_number)
);

create index if not exists inventory_serials_item_status_idx
  on public.inventory_serials(item_master_id, status);

create index if not exists inventory_serials_warehouse_idx
  on public.inventory_serials(warehouse_id, status);

alter table public.inventory_serials enable row level security;

drop policy if exists "Authorized users can read inventory serials" on public.inventory_serials;
create policy "Authorized users can read inventory serials"
on public.inventory_serials
for select
to authenticated
using ((select public.authorize('inventory.view')));

grant select on public.inventory_serials to authenticated;
revoke insert, update, delete on public.inventory_serials from authenticated;

-- ------------------------------------------------------------------------------
-- 2. Backfill document behavior from current item type settings
-- ------------------------------------------------------------------------------

update public.purchase_requisition_items pr_item
set
  is_stocked = coalesce(item_type.is_stocked, true),
  target_warehouse_id = case
    when coalesce(item_type.is_stocked, true) then
      coalesce(
        pr_item.target_warehouse_id,
        case when (master.attributes ->> 'warehouseId') ~ '^\d+$' then (master.attributes ->> 'warehouseId')::bigint else null end,
        (select warehouse.id from public.raw_material_warehouses warehouse where warehouse.status = 'active' order by warehouse.sort_order, warehouse.id limit 1)
      )
    else null
  end
from public.item_master master
join public.item_types item_type on item_type.id = master.item_type_id
where pr_item.item_master_id = master.id;

update public.purchase_order_items po_item
set
  is_stocked = coalesce(pr_item.is_stocked, item_type.is_stocked, true),
  tracking_method = coalesce(nullif(master.tracking_method, ''), 'none'),
  warehouse_id = case
    when coalesce(pr_item.is_stocked, item_type.is_stocked, true) then
      coalesce(
        po_item.warehouse_id,
        pr_item.target_warehouse_id,
        case when (master.attributes ->> 'warehouseId') ~ '^\d+$' then (master.attributes ->> 'warehouseId')::bigint else null end,
        (select warehouse.id from public.raw_material_warehouses warehouse where warehouse.status = 'active' order by warehouse.sort_order, warehouse.id limit 1)
      )
    else null
  end
from public.purchase_requisition_items pr_item,
     public.item_master master,
     public.item_types item_type
where po_item.requisition_item_id = pr_item.id
  and master.id = coalesce(pr_item.item_master_id, po_item.item_master_id)
  and item_type.id = master.item_type_id;

update public.purchase_order_items po_item
set warehouse_id = (
  select warehouse.id
  from public.raw_material_warehouses warehouse
  where warehouse.status = 'active'
  order by warehouse.sort_order, warehouse.id
  limit 1
)
where po_item.is_stocked = true
  and po_item.warehouse_id is null;

update public.goods_receipt_items gr_item
set
  is_stocked = coalesce(po_item.is_stocked, true),
  tracking_method = coalesce(nullif(po_item.tracking_method, ''), 'lot'),
  warehouse_id = case when coalesce(po_item.is_stocked, true) then gr_item.warehouse_id else null end
from public.purchase_order_items po_item
where gr_item.purchase_order_item_id = po_item.id;

alter table public.purchase_order_items
  validate constraint purchase_order_items_stocked_warehouse_check;

alter table public.goods_receipt_items
  validate constraint goods_receipt_items_stocked_warehouse_check;

-- ------------------------------------------------------------------------------
-- 3. Triggers: snapshot behavior into PR and PO lines
-- ------------------------------------------------------------------------------

create or replace function public.set_purchase_requisition_item_behavior()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attrs jsonb;
  v_is_stocked boolean;
begin
  if new.item_master_id is not null then
    select item_type.is_stocked, coalesce(master.attributes, '{}'::jsonb)
    into v_is_stocked, v_attrs
    from public.item_master master
    join public.item_types item_type on item_type.id = master.item_type_id
    where master.id = new.item_master_id;

    new.is_stocked := coalesce(v_is_stocked, true);
    if new.is_stocked then
      new.target_warehouse_id := coalesce(
        new.target_warehouse_id,
        case when (v_attrs ->> 'warehouseId') ~ '^\d+$' then (v_attrs ->> 'warehouseId')::bigint else null end,
        (select warehouse.id from public.raw_material_warehouses warehouse where warehouse.status = 'active' order by warehouse.sort_order, warehouse.id limit 1)
      );
    else
      new.target_warehouse_id := null;
    end if;
  else
    new.is_stocked := true;
  end if;

  return new;
end;
$$;

drop trigger if exists purchase_requisition_items_set_behavior on public.purchase_requisition_items;
create trigger purchase_requisition_items_set_behavior
before insert or update of item_master_id, target_warehouse_id
on public.purchase_requisition_items
for each row execute function public.set_purchase_requisition_item_behavior();

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
      coalesce(pr_item.is_stocked, item_type.is_stocked, true),
      coalesce(nullif(master.tracking_method, ''), 'none'),
      coalesce(master.attributes, '{}'::jsonb),
      pr_item.target_warehouse_id
    into v_is_stocked, v_tracking_method, v_attrs, v_target_warehouse_id
    from public.item_master master
    join public.item_types item_type on item_type.id = master.item_type_id
    left join public.purchase_requisition_items pr_item on pr_item.id = new.requisition_item_id
    where master.id = v_item_master_id;

    new.is_stocked := coalesce(v_is_stocked, true);
    new.tracking_method := coalesce(v_tracking_method, 'none');

    if new.is_stocked then
      new.warehouse_id := coalesce(
        new.warehouse_id,
        v_target_warehouse_id,
        case when (v_attrs ->> 'warehouseId') ~ '^\d+$' then (v_attrs ->> 'warehouseId')::bigint else null end,
        (select warehouse.id from public.raw_material_warehouses warehouse where warehouse.status = 'active' order by warehouse.sort_order, warehouse.id limit 1)
      );
    else
      new.warehouse_id := null;
      new.tracking_method := 'none';
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

drop trigger if exists purchase_order_items_set_behavior on public.purchase_order_items;
create trigger purchase_order_items_set_behavior
before insert or update of requisition_item_id, item_master_id, warehouse_id
on public.purchase_order_items
for each row execute function public.set_purchase_order_item_behavior();

-- ------------------------------------------------------------------------------
-- 4. PR Catalog: expose behavior to UI
-- ------------------------------------------------------------------------------

drop function if exists public.get_purchase_requisition_catalog();

create or replace function public.get_purchase_requisition_catalog()
returns table (
  source text,
  source_id bigint,
  item_code text,
  item_name text,
  item_description text,
  type_code text,
  type_name text,
  unit_id bigint,
  unit_name text,
  unit_symbol text,
  allows_decimal boolean,
  is_stocked boolean,
  tracking_method text,
  form_template text,
  default_warehouse_id bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if not (public.authorize('pr.view') or public.authorize('pr.create') or public.authorize('pr.edit')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  return query
  select
    'item_master'::text,
    master.id,
    master.item_code,
    master.item_name,
    coalesce(nullif(btrim(master.description), ''), master.item_name),
    item_type.type_code,
    item_type.type_name,
    unit.id,
    unit.unit_name,
    unit.symbol,
    unit.allows_decimal,
    item_type.is_stocked,
    case when item_type.is_stocked then master.tracking_method else 'none' end,
    item_type.form_template,
    case
      when item_type.is_stocked and (master.attributes ->> 'warehouseId') ~ '^\d+$' then (master.attributes ->> 'warehouseId')::bigint
      else null
    end
  from public.item_master master
  join public.item_types item_type
    on item_type.id = master.item_type_id
   and item_type.status = 'active'
   and item_type.is_purchasable = true
  join public.raw_material_units unit
    on unit.id = master.unit_id
   and unit.status = 'active'
  where master.status = 'active'
  order by item_type.sort_order asc, master.item_code asc;
end;
$$;

revoke all on function public.get_purchase_requisition_catalog() from public, anon;
grant execute on function public.get_purchase_requisition_catalog() to authenticated;

drop function if exists public.search_purchase_order_source_items(text, integer);

create function public.search_purchase_order_source_items(p_search text default null, p_limit integer default 80)
returns table (
  requisition_item_id bigint,
  requisition_id bigint,
  pr_number text,
  item_type_code text,
  item_code text,
  item_name text,
  item_description text,
  requested_quantity numeric,
  available_quantity numeric,
  unit_name text,
  needed_by_date date,
  is_stocked boolean,
  tracking_method text,
  warehouse_id bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    item.id,
    item.requisition_id,
    requisition.pr_number,
    case
      when item.item_type = 'raw_material' then 'RM'
      when item.item_type = 'legacy' then 'ITEM'
      else coalesce(nullif(upper(btrim(item.item_type)), ''), 'ITEM')
    end,
    item.item_code,
    item.item_name,
    item.item_description,
    item.quantity,
    item.quantity - coalesce(allocated.quantity, 0),
    item.unit_name,
    item.needed_by_date,
    item.is_stocked,
    coalesce(nullif(master.tracking_method, ''), 'none'),
    item.target_warehouse_id
  from public.purchase_requisition_items item
  join public.purchase_requisitions requisition
    on requisition.id = item.requisition_id
   and requisition.status = 'approved'
  left join public.item_master master on master.id = item.item_master_id
  left join lateral (
    select sum(po_item.quantity) as quantity
    from public.purchase_order_items po_item
    join public.purchase_orders purchase_order
      on purchase_order.id = po_item.purchase_order_id
    where po_item.requisition_item_id = item.id
      and purchase_order.status in ('pending_approval', 'approved', 'sent', 'partially_received', 'received')
  ) allocated on true
  where public.authorize('po.create')
    and item.quantity - coalesce(allocated.quantity, 0) > 0
    and (nullif(btrim(p_search), '') is null
      or requisition.pr_number ilike '%' || btrim(p_search) || '%'
      or coalesce(item.item_type, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(item.item_code, '') ilike '%' || btrim(p_search) || '%'
      or item.item_name ilike '%' || btrim(p_search) || '%'
      or coalesce(item.item_description, '') ilike '%' || btrim(p_search) || '%')
  order by requisition.document_date desc, requisition.id desc, item.line_no
  limit least(greatest(coalesce(p_limit, 80), 1), 200);
$$;

revoke all on function public.search_purchase_order_source_items(text, integer) from public, anon;
grant execute on function public.search_purchase_order_source_items(text, integer) to authenticated;

-- ------------------------------------------------------------------------------
-- 5. Goods Receipt RPC: stocked/non-stock + none/lot/serial flows
-- ------------------------------------------------------------------------------

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
  v_po_item record;
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
  v_serials jsonb;
  v_serial jsonb;
  v_serial_text text;
  v_serial_count integer;
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

    if v_item_qty <= 0 then
      raise exception 'invalid_quantity_received' using errcode = '22023';
    end if;

    select
      po_item.*,
      coalesce(po_item.is_stocked, item_type.is_stocked, true) as behavior_is_stocked,
      case
        when coalesce(po_item.is_stocked, item_type.is_stocked, true) = false then 'none'
        else coalesce(nullif(po_item.tracking_method, ''), nullif(master.tracking_method, ''), 'none')
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
            v_po_item.item_master_id, v_serial_text, v_warehouse_id, v_gr.id,
            v_gr_item_id, v_po.id, v_po_item.id,
            'in_stock', v_user_id
          );
        end if;
      end loop;
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

notify pgrst, 'reload schema';
