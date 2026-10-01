-- Stock counts reuse adjustment transactions, Lot balances and FIFO cost layers.
insert into public.app_permissions (
  permission_code, permission_name, module_code, module_name,
  action_code, module_sort_order, sort_order, status
)
select 'stock_count.' || action.code, action.name, 'stock_count', 'ตรวจนับสต็อก',
  action.code, 63, action.sort_order, 'active'
from (values
  ('view', 'ดูรอบตรวจนับ', 10), ('create', 'สร้างและยกเลิกรอบตรวจนับ', 20),
  ('count', 'บันทึกผลตรวจนับ', 30), ('review', 'ตรวจสอบผลตรวจนับ', 40),
  ('approve', 'อนุมัติผลตรวจนับ', 50), ('export', 'ส่งออกผลตรวจนับ', 60)
) action(code, name, sort_order)
on conflict (permission_code) do update set
  permission_name = excluded.permission_name, module_code = excluded.module_code,
  module_name = excluded.module_name, action_code = excluded.action_code,
  module_sort_order = excluded.module_sort_order, sort_order = excluded.sort_order,
  status = 'active', updated_at = now();

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.app_roles role
join public.app_permissions permission on permission.permission_code like 'stock_count.%'
where role.is_owner on conflict (role_id, permission_id) do nothing;

insert into erp_private.number_series (series_key, prefix, padding, reset_policy)
values ('SC', 'SC', 4, 'monthly')
on conflict (series_key) do update set prefix = excluded.prefix, padding = excluded.padding,
  reset_policy = excluded.reset_policy, is_active = true, updated_at = now();

alter table public.stock_adjustments
  add column source text not null default 'manual' check (source in ('manual', 'stock_count')),
  add column source_count_number text,
  add constraint stock_adjustments_count_source_check
    check ((source = 'stock_count') = (source_count_number is not null));

alter table public.stock_adjustment_items
  add column inventory_lot_id bigint references public.inventory_lots(id) on delete restrict,
  drop constraint stock_adjustment_items_unique_item,
  add constraint stock_adjustment_items_unique_item_lot
    unique nulls not distinct (stock_adjustment_id, item_master_id, inventory_lot_id);
create index stock_adjustment_items_lot_idx on public.stock_adjustment_items (inventory_lot_id)
  where inventory_lot_id is not null;

create table public.stock_counts (
  id bigint generated always as identity primary key,
  count_number text not null unique,
  document_date date not null,
  warehouse_id bigint not null references public.raw_material_warehouses(id) on delete restrict,
  warehouse_name text not null,
  assigned_to uuid not null references auth.users(id) on delete restrict,
  assigned_to_name text not null,
  status text not null default 'draft' check (status in ('draft', 'counting', 'review', 'recount', 'approved', 'cancelled')),
  notes text check (length(notes) <= 1000),
  snapshot_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id) on delete restrict,
  returned_at timestamptz,
  returned_by uuid references auth.users(id) on delete restrict,
  return_reason text check (length(btrim(return_reason)) between 1 and 500),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete restrict,
  approval_reason text check (length(btrim(approval_reason)) between 1 and 500),
  owner_approval_override boolean not null default false,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete restrict,
  cancellation_reason text check (length(btrim(cancellation_reason)) between 1 and 500),
  stock_adjustment_id bigint unique references public.stock_adjustments(id) on delete restrict,
  constraint stock_counts_approved_link check ((status = 'approved') = (stock_adjustment_id is not null))
);

create table public.stock_count_lines (
  id bigint generated always as identity primary key,
  stock_count_id bigint not null references public.stock_counts(id) on delete restrict,
  line_no integer not null check (line_no > 0),
  item_master_id bigint not null references public.item_master(id) on delete restrict,
  item_code text not null,
  item_name text not null,
  unit_name text not null,
  tracking_method text not null check (tracking_method in ('none', 'lot')),
  system_qty numeric(18,4) not null check (system_qty >= 0),
  unique (stock_count_id, item_master_id),
  unique (stock_count_id, line_no)
);

create table public.stock_count_lots (
  id bigint generated always as identity primary key,
  stock_count_line_id bigint not null references public.stock_count_lines(id) on delete restrict,
  inventory_lot_id bigint references public.inventory_lots(id) on delete restrict,
  lot_number text,
  received_at timestamptz,
  expiry_date date,
  system_qty numeric(18,4) not null check (system_qty >= 0),
  counted_qty numeric(18,4) check (counted_qty >= 0),
  difference_qty numeric(18,4) generated always as (counted_qty - system_qty) stored,
  reason text check (length(reason) <= 500),
  counted_by uuid references auth.users(id) on delete restrict,
  counted_at timestamptz
);

create index stock_counts_date_idx on public.stock_counts (document_date desc, id desc);
create index stock_counts_warehouse_status_idx on public.stock_counts (warehouse_id, status, id desc);
create index stock_counts_assigned_idx on public.stock_counts (assigned_to, status, id desc);
create unique index stock_count_lots_line_lot_idx
  on public.stock_count_lots (stock_count_line_id, coalesce(inventory_lot_id, 0));
create index stock_count_lots_lot_idx on public.stock_count_lots (inventory_lot_id)
  where inventory_lot_id is not null;

alter table public.stock_counts enable row level security;
alter table public.stock_count_lines enable row level security;
alter table public.stock_count_lots enable row level security;
create policy "Count viewers can read rounds" on public.stock_counts for select to authenticated
using ((select public.authorize('stock_count.view')));
create policy "Count viewers can read lines" on public.stock_count_lines for select to authenticated
using ((select public.authorize('stock_count.view')));
create policy "Count viewers can read lots" on public.stock_count_lots for select to authenticated
using ((select public.authorize('stock_count.view')));
revoke all on public.stock_counts, public.stock_count_lines, public.stock_count_lots from public, anon, authenticated;
revoke insert, update, delete on public.stock_counts from authenticated;
revoke insert, update, delete on public.stock_count_lines from authenticated;
revoke insert, update, delete on public.stock_count_lots from authenticated;
grant select on public.stock_counts to authenticated;
grant select on public.stock_count_lines to authenticated;
grant select on public.stock_count_lots to authenticated;
revoke all on sequence public.stock_counts_id_seq, public.stock_count_lines_id_seq,
  public.stock_count_lots_id_seq from public, anon, authenticated;

-- Count detail needs the generated header's reversal state even without adjustment access.
create policy "Count viewers can read their linked adjustment headers"
on public.stock_adjustments for select to authenticated
using ((select public.authorize('stock_count.view')) and source = 'stock_count'
  and exists (select 1 from public.stock_counts count
    where count.stock_adjustment_id = stock_adjustments.id));

create trigger capture_system_audit_log after insert or update or delete on public.stock_counts
for each row execute function public.capture_system_audit_log();
create trigger capture_system_audit_log after insert or update or delete on public.stock_count_lines
for each row execute function public.capture_system_audit_log();
create trigger capture_system_audit_log after insert or update or delete on public.stock_count_lots
for each row execute function public.capture_system_audit_log();

create or replace function public.get_stock_count_form_options(p_warehouse_id bigint default null, p_search text default null)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.authorize('stock_count.create') then raise exception 'permission_denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'warehouses', coalesce((select jsonb_agg(jsonb_build_object('id', warehouse.id, 'name', warehouse.warehouse_name) order by warehouse.warehouse_name)
      from public.raw_material_warehouses warehouse where warehouse.status = 'active'), '[]'::jsonb),
    'assignees', coalesce((select jsonb_agg(jsonb_build_object('id', profile.user_id,
      'name', concat_ws(' ', profile.first_name, profile.last_name)) order by profile.first_name, profile.user_id)
      from public.user_profiles profile where profile.status = 'active'
        and (profile.user_id = v_user_id or public.is_current_user_owner())), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', master.id, 'code', master.item_code, 'name', master.item_name,
      'unitName', coalesce(nullif(unit.symbol, ''), unit.unit_name, 'หน่วย'),
      'trackingMethod', master.tracking_method, 'onHandQty', balance.on_hand_qty,
      'lotCount', (select count(*) from public.inventory_lots lot
        where lot.item_master_id = master.id and lot.warehouse_id = balance.warehouse_id)
      ) order by master.item_code, master.id)
      from public.item_inventory_balances balance
      join public.item_master master on master.id = balance.item_master_id and master.status = 'active'
      join public.item_types item_type on item_type.id = master.item_type_id and item_type.status = 'active' and item_type.is_stocked
      left join public.raw_material_units unit on unit.id = master.unit_id
      where balance.warehouse_id = p_warehouse_id and master.tracking_method in ('none', 'lot')
        and (master.tracking_method = 'none' or exists (select 1 from public.inventory_lots lot
          where lot.item_master_id = master.id and lot.warehouse_id = balance.warehouse_id))
        and (nullif(btrim(p_search), '') is null or master.item_code ilike '%' || btrim(p_search) || '%'
          or master.item_name ilike '%' || btrim(p_search) || '%')), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_stock_count_form_options(bigint, text) from public, anon;
grant execute on function public.get_stock_count_form_options(bigint, text) to authenticated;

create or replace function public.create_stock_count(
  p_document_date date, p_warehouse_id bigint, p_assigned_to uuid, p_notes text, p_item_ids jsonb
)
returns table (stock_count_id bigint, count_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_warehouse_name text;
  v_assignee_name text;
  v_actor_name text;
  v_ids bigint[];
  v_count_id bigint;
  v_number text;
  v_line_id bigint;
  v_line integer := 0;
  v_item record;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.authorize('stock_count.create') then raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_document_date is null or p_warehouse_id is null or p_assigned_to is null or length(coalesce(p_notes, '')) > 1000 then
    raise exception 'invalid_stock_count_header' using errcode = '22023';
  end if;
  select warehouse.warehouse_name into v_warehouse_name from public.raw_material_warehouses warehouse
    where warehouse.id = p_warehouse_id and warehouse.status = 'active' for share;
  if not found then raise exception 'warehouse_not_found' using errcode = 'P0002'; end if;
  select concat_ws(' ', profile.first_name, profile.last_name) into v_assignee_name
    from public.user_profiles profile where profile.user_id = p_assigned_to and profile.status = 'active'
      and (profile.user_id = v_user_id or public.is_current_user_owner()) for share;
  if not found then raise exception 'invalid_stock_count_assignee' using errcode = '22023'; end if;
  select concat_ws(' ', profile.first_name, profile.last_name) into v_actor_name
    from public.user_profiles profile where profile.user_id = v_user_id;

  -- Null means all countable items in this warehouse; an empty selection is invalid.
  if p_item_ids is null then
    select array_agg(master.id order by master.id) into v_ids
    from public.item_inventory_balances balance
    join public.item_master master on master.id = balance.item_master_id and master.status = 'active'
    join public.item_types item_type on item_type.id = master.item_type_id and item_type.status = 'active' and item_type.is_stocked
    where balance.warehouse_id = p_warehouse_id and master.tracking_method in ('none', 'lot')
      and (master.tracking_method = 'none' or exists (select 1 from public.inventory_lots lot
        where lot.item_master_id = master.id and lot.warehouse_id = p_warehouse_id));
  else
    if jsonb_typeof(p_item_ids) <> 'array' then raise exception 'invalid_stock_count_items' using errcode = '22023'; end if;
    if exists (select 1 from jsonb_array_elements(p_item_ids) value
      where jsonb_typeof(value) <> 'number' or value::text !~ '^[1-9][0-9]*$') then
      raise exception 'invalid_stock_count_items' using errcode = '22023';
    end if;
    select array_agg(value::bigint order by value::bigint) into v_ids from jsonb_array_elements_text(p_item_ids) value;
    if cardinality(v_ids) <> (select count(distinct id) from unnest(v_ids) id) then
      raise exception 'duplicate_stock_count_item' using errcode = '22023';
    end if;
  end if;
  if coalesce(cardinality(v_ids), 0) = 0 then raise exception 'invalid_stock_count_items' using errcode = '22023'; end if;
  if exists (select 1 from public.item_master master where master.id = any(v_ids) and master.tracking_method = 'serial') then
    raise exception 'serial_stock_count_not_supported' using errcode = '0A000';
  end if;
  if cardinality(v_ids) <> (select count(*) from public.item_master master
    join public.item_types item_type on item_type.id = master.item_type_id and item_type.status = 'active' and item_type.is_stocked
    join public.item_inventory_balances balance on balance.item_master_id = master.id and balance.warehouse_id = p_warehouse_id
    where master.id = any(v_ids) and master.status = 'active' and master.tracking_method in ('none', 'lot')) then
    raise exception 'stock_item_not_found' using errcode = 'P0002';
  end if;
  perform balance.item_master_id from public.item_inventory_balances balance
    where balance.warehouse_id = p_warehouse_id and balance.item_master_id = any(v_ids)
    order by balance.item_master_id for update of balance;
  perform lot.id from public.inventory_lots lot
    where lot.warehouse_id = p_warehouse_id and lot.item_master_id = any(v_ids)
    order by lot.id for update of lot;

  select allocated.business_number into v_number
    from erp_private.allocate_business_number('SC', p_document_date, 'used', 'stock_count', null) allocated;
  insert into public.stock_counts (count_number, document_date, warehouse_id, warehouse_name,
    assigned_to, assigned_to_name, notes, created_by, created_by_name)
  values (v_number, p_document_date, p_warehouse_id, v_warehouse_name, p_assigned_to, v_assignee_name,
    nullif(btrim(p_notes), ''), v_user_id, coalesce(v_actor_name, 'ผู้ใช้งาน')) returning id into v_count_id;
  update erp_private.number_allocations set entity_id = v_count_id::text
    where formatted_number = v_number and entity_type = 'stock_count';

  for v_item in
    select master.id, master.item_code, master.item_name, master.tracking_method, balance.on_hand_qty,
      coalesce(nullif(unit.symbol, ''), unit.unit_name, 'หน่วย') unit_name
    from public.item_master master
    join public.item_inventory_balances balance on balance.item_master_id = master.id and balance.warehouse_id = p_warehouse_id
    left join public.raw_material_units unit on unit.id = master.unit_id
    where master.id = any(v_ids) order by master.id
  loop
    v_line := v_line + 1;
    insert into public.stock_count_lines (stock_count_id, line_no, item_master_id, item_code, item_name, unit_name, tracking_method, system_qty)
    values (v_count_id, v_line, v_item.id, v_item.item_code, v_item.item_name, v_item.unit_name, v_item.tracking_method, v_item.on_hand_qty)
    returning id into v_line_id;
    if v_item.tracking_method = 'none' then
      insert into public.stock_count_lots (stock_count_line_id, system_qty) values (v_line_id, v_item.on_hand_qty);
    else
      insert into public.stock_count_lots (stock_count_line_id, inventory_lot_id, lot_number, received_at, expiry_date, system_qty)
      select v_line_id, lot.id, lot.lot_number, lot.received_at, lot.expiry_date, lot.on_hand_qty
      from public.inventory_lots lot where lot.item_master_id = v_item.id and lot.warehouse_id = p_warehouse_id order by lot.id;
      if not found then raise exception 'stock_count_lots_unavailable' using errcode = '22023'; end if;
      if v_item.on_hand_qty <> (select sum(entry.system_qty) from public.stock_count_lots entry where entry.stock_count_line_id = v_line_id) then
        raise exception 'stock_count_lot_balance_mismatch' using errcode = '23514';
      end if;
    end if;
  end loop;
  return query select v_count_id, v_number;
end;
$$;
revoke all on function public.create_stock_count(date, bigint, uuid, text, jsonb) from public, anon;
grant execute on function public.create_stock_count(date, bigint, uuid, text, jsonb) to authenticated;

create or replace function public.start_stock_count(p_stock_count_id bigint)
returns text language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count public.stock_counts%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.authorize('stock_count.count') then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into v_count from public.stock_counts where id = p_stock_count_id for update;
  if not found then raise exception 'stock_count_not_found' using errcode = 'P0002'; end if;
  if v_count.assigned_to <> v_user_id and not public.is_current_user_owner() then raise exception 'stock_count_not_assigned' using errcode = '42501'; end if;
  if v_count.status = 'counting' then return 'counting'; end if;
  if v_count.status not in ('draft', 'recount') then raise exception 'invalid_stock_count_transition' using errcode = '55000'; end if;
  update public.stock_counts set status = 'counting', started_at = now(), updated_at = now() where id = v_count.id;
  return 'counting';
end;
$$;
revoke all on function public.start_stock_count(bigint) from public, anon;
grant execute on function public.start_stock_count(bigint) to authenticated;

create or replace function public.save_stock_count_entries(p_stock_count_id bigint, p_entries jsonb)
returns jsonb language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count public.stock_counts%rowtype;
  v_entry jsonb;
  v_quantity numeric;
  v_id bigint;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.authorize('stock_count.count') then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into v_count from public.stock_counts where id = p_stock_count_id for update;
  if not found then raise exception 'stock_count_not_found' using errcode = 'P0002'; end if;
  if v_count.assigned_to <> v_user_id and not public.is_current_user_owner() then raise exception 'stock_count_not_assigned' using errcode = '42501'; end if;
  if v_count.status <> 'counting' then raise exception 'invalid_stock_count_transition' using errcode = '55000'; end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' then raise exception 'invalid_stock_count_entries' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(p_entries) entry
    where jsonb_typeof(entry) <> 'object' or not (entry ? 'id' and entry ? 'counted_qty')
      or jsonb_typeof(entry->'id') <> 'number' or (entry->>'id') !~ '^[1-9][0-9]*$') then
    raise exception 'invalid_stock_count_entries' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_entries) entry group by (entry->>'id')::bigint having count(*) > 1) then
    raise exception 'duplicate_stock_count_entry' using errcode = '22023';
  end if;
  for v_entry in select entry from jsonb_array_elements(p_entries) entry order by (entry->>'id')::bigint loop
    v_id := (v_entry->>'id')::bigint;
    if jsonb_typeof(v_entry->'counted_qty') not in ('number', 'null') then raise exception 'invalid_counted_quantity' using errcode = '22023'; end if;
    v_quantity := (v_entry->>'counted_qty')::numeric;
    if v_quantity < 0 or v_quantity >= 100000000000000 or v_quantity <> round(v_quantity, 4) then
      raise exception 'invalid_counted_quantity' using errcode = '22023';
    end if;
    if (v_entry ? 'reason' and jsonb_typeof(v_entry->'reason') not in ('string', 'null')) or length(coalesce(v_entry->>'reason', '')) > 500 then
      raise exception 'invalid_stock_count_reason' using errcode = '22023';
    end if;
    update public.stock_count_lots entry set counted_qty = v_quantity,
      reason = nullif(btrim(v_entry->>'reason'), ''),
      counted_by = case when v_quantity is not null then v_user_id end,
      counted_at = case when v_quantity is not null then now() end
    from public.stock_count_lines line
    where entry.id = v_id and line.id = entry.stock_count_line_id and line.stock_count_id = v_count.id;
    if not found then raise exception 'stock_count_entry_not_found' using errcode = '22023'; end if;
  end loop;
  update public.stock_counts set updated_at = now() where id = v_count.id;
  return (select jsonb_build_object('completed', count(*) filter (where entry.counted_qty is not null), 'total', count(*))
    from public.stock_count_lots entry join public.stock_count_lines line on line.id = entry.stock_count_line_id where line.stock_count_id = v_count.id);
end;
$$;
revoke all on function public.save_stock_count_entries(bigint, jsonb) from public, anon;
grant execute on function public.save_stock_count_entries(bigint, jsonb) to authenticated;

create or replace function public.submit_stock_count(p_stock_count_id bigint)
returns text language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count public.stock_counts%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.authorize('stock_count.count') then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into v_count from public.stock_counts where id = p_stock_count_id for update;
  if not found then raise exception 'stock_count_not_found' using errcode = 'P0002'; end if;
  if v_count.assigned_to <> v_user_id and not public.is_current_user_owner() then raise exception 'stock_count_not_assigned' using errcode = '42501'; end if;
  if v_count.status = 'review' then return 'review'; end if;
  if v_count.status <> 'counting' then raise exception 'invalid_stock_count_transition' using errcode = '55000'; end if;
  if exists (select 1 from public.stock_count_lots entry join public.stock_count_lines line on line.id = entry.stock_count_line_id
    where line.stock_count_id = v_count.id and entry.counted_qty is null) then raise exception 'uncounted_stock_count_entries' using errcode = '22023'; end if;
  if exists (select 1 from public.stock_count_lots entry join public.stock_count_lines line on line.id = entry.stock_count_line_id
    where line.stock_count_id = v_count.id and entry.difference_qty <> 0 and nullif(btrim(entry.reason), '') is null) then
    raise exception 'stock_count_variance_reason_required' using errcode = '22023';
  end if;
  update public.stock_counts set status = 'review', submitted_at = now(), submitted_by = v_user_id, updated_at = now() where id = v_count.id;
  return 'review';
end;
$$;
revoke all on function public.submit_stock_count(bigint) from public, anon;
grant execute on function public.submit_stock_count(bigint) to authenticated;

create or replace function public.return_stock_count(p_stock_count_id bigint, p_reason text)
returns text language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count public.stock_counts%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.authorize('stock_count.review') then raise exception 'permission_denied' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then raise exception 'invalid_stock_count_reason' using errcode = '22023'; end if;
  select * into v_count from public.stock_counts where id = p_stock_count_id for update;
  if not found then raise exception 'stock_count_not_found' using errcode = 'P0002'; end if;
  if v_count.status = 'recount' then return 'recount'; end if;
  if v_count.status <> 'review' then raise exception 'invalid_stock_count_transition' using errcode = '55000'; end if;
  update public.stock_counts set status = 'recount', returned_at = now(), returned_by = v_user_id,
    return_reason = btrim(p_reason), updated_at = now() where id = v_count.id;
  return 'recount';
end;
$$;
revoke all on function public.return_stock_count(bigint, text) from public, anon;
grant execute on function public.return_stock_count(bigint, text) to authenticated;

create or replace function public.cancel_stock_count(p_stock_count_id bigint, p_reason text)
returns text language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count public.stock_counts%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.authorize('stock_count.create') then raise exception 'permission_denied' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then raise exception 'invalid_stock_count_reason' using errcode = '22023'; end if;
  select * into v_count from public.stock_counts where id = p_stock_count_id for update;
  if not found then raise exception 'stock_count_not_found' using errcode = 'P0002'; end if;
  if v_count.status = 'cancelled' then return 'cancelled'; end if;
  if v_count.status = 'approved' then raise exception 'invalid_stock_count_transition' using errcode = '55000'; end if;
  if v_count.created_by <> v_user_id and not public.authorize('stock_count.review') then raise exception 'permission_denied' using errcode = '42501'; end if;
  update public.stock_counts set status = 'cancelled', cancelled_at = now(), cancelled_by = v_user_id,
    cancellation_reason = btrim(p_reason), updated_at = now() where id = v_count.id;
  return 'cancelled';
end;
$$;
revoke all on function public.cancel_stock_count(bigint, text) from public, anon;
grant execute on function public.cancel_stock_count(bigint, text) to authenticated;

create or replace function public.approve_stock_count(p_stock_count_id bigint, p_reason text)
returns table (stock_adjustment_id bigint, adjustment_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count public.stock_counts%rowtype;
  v_adjustment_id bigint;
  v_number text;
  v_actor_name text;
  v_item_id bigint;
  v_tx_id bigint;
  v_unit_cost numeric(18,4);
  v_owner_override boolean;
  v_entry record;
  v_line integer := 0;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.authorize('stock_count.approve') then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into v_count from public.stock_counts where id = p_stock_count_id for update;
  if not found then raise exception 'stock_count_not_found' using errcode = 'P0002'; end if;
  if v_count.status = 'approved' then
    return query select adjustment.id, adjustment.adjustment_number from public.stock_adjustments adjustment where adjustment.id = v_count.stock_adjustment_id;
    return;
  end if;
  if v_count.status <> 'review' then raise exception 'invalid_stock_count_transition' using errcode = '55000'; end if;
  if length(btrim(coalesce(p_reason, ''))) not between 1 and 500 then raise exception 'invalid_stock_count_reason' using errcode = '22023'; end if;
  if exists (select 1 from public.stock_count_lots entry join public.stock_count_lines line on line.id = entry.stock_count_line_id
    where line.stock_count_id = v_count.id and entry.counted_qty is null) then raise exception 'uncounted_stock_count_entries' using errcode = '22023'; end if;
  if exists (select 1 from public.stock_count_lots entry join public.stock_count_lines line on line.id = entry.stock_count_line_id
    where line.stock_count_id = v_count.id and entry.difference_qty <> 0 and nullif(btrim(entry.reason), '') is null) then
    raise exception 'stock_count_variance_reason_required' using errcode = '22023';
  end if;
  v_owner_override := v_count.assigned_to = v_user_id or v_count.submitted_by = v_user_id or exists (
    select 1 from public.stock_count_lots entry join public.stock_count_lines line on line.id = entry.stock_count_line_id
    where line.stock_count_id = v_count.id and entry.counted_by = v_user_id);
  if v_owner_override and not public.is_current_user_owner() then raise exception 'stock_count_separation_of_duties' using errcode = '42501'; end if;

  -- Balance locks serialize ledger writes, including receipts that create a new Lot.
  perform balance.item_master_id from public.item_inventory_balances balance
    join public.stock_count_lines line on line.item_master_id = balance.item_master_id and line.stock_count_id = v_count.id
    where balance.warehouse_id = v_count.warehouse_id order by balance.item_master_id for update of balance;
  perform lot.id from public.inventory_lots lot
    join public.stock_count_lines line on line.item_master_id = lot.item_master_id and line.stock_count_id = v_count.id
    where lot.warehouse_id = v_count.warehouse_id order by lot.id for update of lot;
  perform cost.inventory_transaction_id from public.inventory_receipt_costs cost
    join public.stock_count_lines line on line.item_master_id = cost.item_master_id and line.stock_count_id = v_count.id
    where cost.warehouse_id = v_count.warehouse_id order by cost.inventory_transaction_id for update of cost;

  if exists (select 1 from public.stock_count_lines line
    left join public.item_inventory_balances balance on balance.item_master_id = line.item_master_id and balance.warehouse_id = v_count.warehouse_id
    join public.item_master master on master.id = line.item_master_id
    where line.stock_count_id = v_count.id and (balance.on_hand_qty is distinct from line.system_qty or master.tracking_method <> line.tracking_method))
    or exists (select 1 from public.stock_count_lots entry
      join public.stock_count_lines line on line.id = entry.stock_count_line_id
      left join public.inventory_lots lot on lot.id = entry.inventory_lot_id
      where line.stock_count_id = v_count.id and entry.inventory_lot_id is not null
        and (lot.on_hand_qty is distinct from entry.system_qty or lot.item_master_id <> line.item_master_id or lot.warehouse_id <> v_count.warehouse_id))
    or exists (select 1 from public.inventory_lots lot
      join public.stock_count_lines line on line.item_master_id = lot.item_master_id and line.stock_count_id = v_count.id and line.tracking_method = 'lot'
      where lot.warehouse_id = v_count.warehouse_id and not exists (select 1 from public.stock_count_lots entry
        where entry.stock_count_line_id = line.id and entry.inventory_lot_id = lot.id)) then
    raise exception 'stale_stock_count_snapshot' using errcode = '40001';
  end if;

  select concat_ws(' ', profile.first_name, profile.last_name) into v_actor_name from public.user_profiles profile where profile.user_id = v_user_id;
  select allocated.business_number into v_number
    from erp_private.allocate_business_number('AD', v_count.document_date, 'used', 'stock_adjustment', null) allocated;
  insert into public.stock_adjustments (adjustment_number, document_date, warehouse_id, warehouse_name,
    reason, notes, created_by, created_by_name, source, source_count_number)
  values (v_number, v_count.document_date, v_count.warehouse_id, v_count.warehouse_name, btrim(p_reason),
    v_count.notes, v_user_id, coalesce(v_actor_name, 'ผู้ใช้งาน'), 'stock_count', v_count.count_number)
  returning id into v_adjustment_id;
  update erp_private.number_allocations set entity_id = v_adjustment_id::text
    where formatted_number = v_number and entity_type = 'stock_adjustment';

  for v_entry in
    select entry.*, line.item_master_id, line.item_code, line.item_name, line.unit_name,
      case when master.attributes->>'legacySource' = 'raw_material' and master.attributes->>'legacySourceId' ~ '^\d+$'
        then (master.attributes->>'legacySourceId')::bigint end raw_material_id
    from public.stock_count_lots entry
    join public.stock_count_lines line on line.id = entry.stock_count_line_id
    join public.item_master master on master.id = line.item_master_id
    where line.stock_count_id = v_count.id and entry.difference_qty <> 0
    order by line.item_master_id, entry.inventory_lot_id nulls first, entry.id
  loop
    v_line := v_line + 1;
    v_unit_cost := null;
    if v_entry.difference_qty > 0 then
      -- Prefer an open layer, otherwise the latest unreversed receipt for this exact Lot.
      select cost.unit_cost into v_unit_cost from public.inventory_receipt_costs cost
      where cost.item_master_id = v_entry.item_master_id and cost.warehouse_id = v_count.warehouse_id
        and cost.inventory_lot_id is not distinct from v_entry.inventory_lot_id
        and not exists (select 1 from public.inventory_transactions reversal where reversal.reversal_of_transaction_id = cost.inventory_transaction_id)
      order by (cost.remaining_qty > 0) desc, cost.created_at desc, cost.inventory_transaction_id desc limit 1;
      if v_unit_cost is null then raise exception 'lot_unit_cost_unavailable' using errcode = '23514'; end if;
    end if;
    insert into public.stock_adjustment_items (stock_adjustment_id, line_no, item_master_id, inventory_lot_id,
      item_code, item_name, unit_name, system_qty, counted_qty, positive_unit_cost)
    values (v_adjustment_id, v_line, v_entry.item_master_id, v_entry.inventory_lot_id,
      v_entry.item_code, v_entry.item_name, v_entry.unit_name, v_entry.system_qty, v_entry.counted_qty, v_unit_cost)
    returning id into v_item_id;
    insert into public.inventory_transactions (raw_material_id, item_master_id, warehouse_id, lot_id,
      transaction_type, reference_doc_type, reference_doc_number, quantity_change, created_by)
    values (v_entry.raw_material_id, v_entry.item_master_id, v_count.warehouse_id, v_entry.inventory_lot_id,
      case when v_entry.difference_qty > 0 then 'adjustment' else 'issue' end,
      'stock_adjustment', v_number, v_entry.difference_qty, v_user_id) returning id into v_tx_id;
    if v_entry.difference_qty > 0 then
      insert into public.inventory_receipt_costs (inventory_transaction_id, goods_receipt_item_id, inventory_lot_id,
        item_master_id, warehouse_id, received_qty, remaining_qty, unit_cost, created_at)
      values (v_tx_id, null, v_entry.inventory_lot_id, v_entry.item_master_id, v_count.warehouse_id,
        v_entry.difference_qty, v_entry.difference_qty, v_unit_cost, now());
    end if;
    insert into public.stock_adjustment_allocations (stock_adjustment_item_id, inventory_lot_id, inventory_transaction_id, quantity_change)
    values (v_item_id, v_entry.inventory_lot_id, v_tx_id, v_entry.difference_qty);
  end loop;
  -- A zero-variance round still receives one immutable adjustment header and no ledger rows.
  update public.stock_counts set status = 'approved', stock_adjustment_id = v_adjustment_id,
    approved_at = now(), approved_by = v_user_id, approval_reason = btrim(p_reason),
    owner_approval_override = v_owner_override, updated_at = now() where id = v_count.id;
  return query select v_adjustment_id, v_number;
end;
$$;
revoke all on function public.approve_stock_count(bigint, text) from public, anon;
grant execute on function public.approve_stock_count(bigint, text) to authenticated;

-- Reversal remains on stock_adjustments.status/reversal_number. The count stays approved
-- with this foreign key, so its detail can display the reversal without rewriting history.
comment on column public.stock_counts.stock_adjustment_id is 'Approved adjustment; read status and reversal_number from the linked adjustment, including after reversal.';
