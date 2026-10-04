-- Use the same reserve/claim flow as PR, PO, GR, and IS without depending on
-- the previous function body's formatting.
create or replace function public.reserve_business_number(
  p_series_key text,
  p_effective_date date default current_date
)
returns table (allocation_id bigint, business_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing erp_private.number_allocations%rowtype;
  v_is_owner boolean := false;
  v_period_key text;
  v_required_permission text;
  v_series erp_private.number_series%rowtype;
  v_series_key text := pg_catalog.upper(pg_catalog.btrim(p_series_key));
  v_user_can_reserve boolean := false;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  v_required_permission := case v_series_key
    when 'PR' then 'pr.create'
    when 'PO' then 'po.create'
    when 'GR' then 'inventory.create_gr'
    when 'IS' then 'inventory_issue.create'
    when 'AD' then 'inventory_adjustment.create'
    when 'RM' then 'mdm.create'
    when 'VG' then 'mdm.create'
    when 'CT' then 'mdm.create'
    else null
  end;

  select exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = v_user_id
      and pg_catalog.lower(coalesce(auth_user.raw_app_meta_data ->> 'role', '')) = 'owner'
  ) into v_is_owner;

  select exists (
    select 1
    from public.user_roles as user_role
    join public.app_roles as app_role
      on app_role.id = user_role.role_id and app_role.status = 'active'
    join public.role_permissions as role_permission
      on role_permission.role_id = app_role.id
    join public.app_permissions as permission
      on permission.id = role_permission.permission_id and permission.status = 'active'
    where user_role.user_id = v_user_id
      and permission.permission_code = v_required_permission
  ) into v_user_can_reserve;

  if not (coalesce(v_is_owner, false) or coalesce(v_user_can_reserve, false)) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select series.* into v_series
  from erp_private.number_series as series
  where series.series_key = v_series_key and series.is_active;
  if not found then
    raise exception 'number_series_not_found:%', p_series_key using errcode = 'P0002';
  end if;

  v_period_key := erp_private.series_period_key(v_series.reset_policy, p_effective_date);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_series_key || ':' || v_period_key || ':' || v_user_id::text, 0)
  );

  select allocation.* into v_existing
  from erp_private.number_allocations as allocation
  where allocation.series_id = v_series.id
    and allocation.period_key = v_period_key
    and allocation.status = 'reserved'
    and allocation.reserved_by = v_user_id
  order by allocation.id
  limit 1
  for update;

  if found then
    return query select v_existing.id, v_existing.formatted_number;
    return;
  end if;

  return query
  select allocated.allocation_id, allocated.business_number
  from erp_private.allocate_business_number(v_series_key, p_effective_date, 'reserved') as allocated;
end;
$$;

revoke all on function public.reserve_business_number(text, date) from public, anon;
grant execute on function public.reserve_business_number(text, date) to authenticated;

create or replace function public.post_stock_adjustment(
  p_document_date date,
  p_warehouse_id bigint,
  p_reason text,
  p_notes text,
  p_items jsonb,
  p_adjustment_number text
)
returns table (stock_adjustment_id bigint, adjustment_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_actor_name text;
  v_warehouse_name text;
  v_adjustment_id bigint;
  v_adjustment_number text;
  v_allocation_id bigint;
  v_item jsonb;
  v_item_row record;
  v_system_qty numeric(18,4);
  v_counted_qty numeric(18,4);
  v_difference numeric(18,4);
  v_unit_cost numeric(18,4);
  v_item_id bigint;
  v_transaction_id bigint;
  v_lot_id bigint;
  v_lot record;
  v_take numeric(18,4);
  v_remaining numeric(18,4);
  v_line integer := 0;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.authorize('inventory_adjustment.create') then raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_document_date is null or p_warehouse_id is null or length(btrim(coalesce(p_reason, ''))) not between 1 and 500
    or length(coalesce(p_notes, '')) > 1000 then raise exception 'invalid_stock_adjustment_header' using errcode = '22023'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid_stock_adjustment_items' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) item group by (item->>'item_master_id')::bigint having count(*) > 1) then
    raise exception 'duplicate_stock_adjustment_item' using errcode = '22023';
  end if;

  select warehouse.warehouse_name into v_warehouse_name
  from public.raw_material_warehouses warehouse
  where warehouse.id = p_warehouse_id and warehouse.status = 'active';
  if not found then raise exception 'warehouse_not_found' using errcode = 'P0002'; end if;

  select coalesce(nullif(concat_ws(' ', profile.first_name, profile.last_name), ''), app_user.email, 'ผู้ใช้งาน')
  into v_actor_name
  from auth.users app_user left join public.user_profiles profile on profile.user_id = app_user.id
  where app_user.id = v_user_id;

  if nullif(btrim(p_adjustment_number), '') is null then
    raise exception 'invalid_or_expired_number_reservation' using errcode = '22023';
  end if;
  select claimed.allocation_id, claimed.business_number
  into v_allocation_id, v_adjustment_number
  from erp_private.claim_business_number(
    'AD', p_document_date, p_adjustment_number, 'stock_adjustment', null
  ) claimed;

  insert into public.stock_adjustments (
    adjustment_number, document_date, warehouse_id, warehouse_name, reason, notes, created_by, created_by_name
  ) values (
    v_adjustment_number, p_document_date, p_warehouse_id, v_warehouse_name,
    btrim(p_reason), nullif(btrim(coalesce(p_notes, '')), ''), v_user_id, coalesce(v_actor_name, 'ผู้ใช้งาน')
  ) returning id into v_adjustment_id;

  update erp_private.number_allocations
  set entity_id = v_adjustment_id::text
  where id = v_allocation_id;

  for v_item in select item from jsonb_array_elements(p_items) item order by (item->>'item_master_id')::bigint loop
    v_counted_qty := nullif(v_item->>'counted_qty', '')::numeric;
    if v_counted_qty is null or v_counted_qty < 0 or v_counted_qty <> round(v_counted_qty, 4) then
      raise exception 'invalid_counted_quantity' using errcode = '22023';
    end if;
    select master.id, master.item_code, master.item_name, master.tracking_method,
      coalesce(nullif(unit.symbol, ''), unit.unit_name, 'หน่วย') as unit_name,
      case when master.attributes->>'legacySource' = 'raw_material' and master.attributes->>'legacySourceId' ~ '^\d+$'
        then (master.attributes->>'legacySourceId')::bigint else null end as raw_material_id
    into v_item_row
    from public.item_master master
    join public.item_types item_type on item_type.id = master.item_type_id and item_type.status = 'active' and item_type.is_stocked
    left join public.raw_material_units unit on unit.id = master.unit_id
    where master.id = (v_item->>'item_master_id')::bigint and master.status = 'active';
    if not found then raise exception 'stock_item_not_found' using errcode = 'P0002'; end if;
    if v_item_row.tracking_method = 'serial' then raise exception 'serial_stock_adjustment_not_supported' using errcode = '0A000'; end if;

    select balance.on_hand_qty into v_system_qty
    from public.item_inventory_balances balance
    where balance.item_master_id = v_item_row.id and balance.warehouse_id = p_warehouse_id
    for update;
    v_system_qty := coalesce(v_system_qty, 0);
    if v_system_qty <> coalesce(nullif(v_item->>'system_qty', '')::numeric, v_system_qty) then
      raise exception 'stale_stock_balance:%', v_item_row.item_code using errcode = '40001';
    end if;
    v_difference := v_counted_qty - v_system_qty;
    if v_difference = 0 then continue; end if;
    v_unit_cost := nullif(v_item->>'positive_unit_cost', '')::numeric;
    if v_difference > 0 and (v_unit_cost is null or v_unit_cost < 0) then
      raise exception 'positive_unit_cost_required' using errcode = '22023';
    end if;

    v_line := v_line + 1;
    insert into public.stock_adjustment_items (
      stock_adjustment_id, line_no, item_master_id, item_code, item_name, unit_name,
      system_qty, counted_qty, positive_unit_cost
    ) values (
      v_adjustment_id, v_line, v_item_row.id, v_item_row.item_code, v_item_row.item_name,
      v_item_row.unit_name, v_system_qty, v_counted_qty, case when v_difference > 0 then v_unit_cost end
    ) returning id into v_item_id;

    if v_difference > 0 then
      v_lot_id := null;
      if v_item_row.tracking_method = 'lot' then
        insert into public.inventory_lots (
          lot_number, raw_material_id, item_master_id, warehouse_id, received_qty,
          received_at, remarks, created_by
        ) values (
          v_adjustment_number || '-' || lpad(v_line::text, 2, '0'), v_item_row.raw_material_id,
          v_item_row.id, p_warehouse_id, v_difference, timezone('utc', now()),
          'สร้างจากใบปรับปรุงสต็อก ' || v_adjustment_number, v_user_id
        ) returning id into v_lot_id;
      end if;
      insert into public.inventory_transactions (
        raw_material_id, item_master_id, warehouse_id, lot_id, transaction_type,
        reference_doc_type, reference_doc_number, quantity_change, created_by
      ) values (
        v_item_row.raw_material_id, v_item_row.id, p_warehouse_id, v_lot_id, 'adjustment',
        'stock_adjustment', v_adjustment_number, v_difference, v_user_id
      ) returning id into v_transaction_id;
      insert into public.inventory_receipt_costs (
        inventory_transaction_id, goods_receipt_item_id, inventory_lot_id, item_master_id,
        warehouse_id, received_qty, remaining_qty, unit_cost, created_at
      ) values (
        v_transaction_id, null, v_lot_id, v_item_row.id, p_warehouse_id,
        v_difference, v_difference, v_unit_cost, timezone('utc', now())
      );
      insert into public.stock_adjustment_allocations (stock_adjustment_item_id, inventory_lot_id, inventory_transaction_id, quantity_change)
      values (v_item_id, v_lot_id, v_transaction_id, v_difference);
    else
      v_remaining := abs(v_difference);
      if v_item_row.tracking_method = 'lot' then
        for v_lot in
          select lot.id, lot.on_hand_qty from public.inventory_lots lot
          where lot.item_master_id = v_item_row.id and lot.warehouse_id = p_warehouse_id and lot.on_hand_qty > 0
          order by lot.received_at, lot.id for update
        loop
          exit when v_remaining = 0;
          v_take := least(v_remaining, v_lot.on_hand_qty);
          insert into public.inventory_transactions (
            raw_material_id, item_master_id, warehouse_id, lot_id, transaction_type,
            reference_doc_type, reference_doc_number, quantity_change, created_by
          ) values (
            v_item_row.raw_material_id, v_item_row.id, p_warehouse_id, v_lot.id, 'issue',
            'stock_adjustment', v_adjustment_number, -v_take, v_user_id
          ) returning id into v_transaction_id;
          insert into public.stock_adjustment_allocations (stock_adjustment_item_id, inventory_lot_id, inventory_transaction_id, quantity_change)
          values (v_item_id, v_lot.id, v_transaction_id, -v_take);
          v_remaining := v_remaining - v_take;
        end loop;
      else
        insert into public.inventory_transactions (
          raw_material_id, item_master_id, warehouse_id, lot_id, transaction_type,
          reference_doc_type, reference_doc_number, quantity_change, created_by
        ) values (
          v_item_row.raw_material_id, v_item_row.id, p_warehouse_id, null, 'issue',
          'stock_adjustment', v_adjustment_number, v_difference, v_user_id
        ) returning id into v_transaction_id;
        insert into public.stock_adjustment_allocations (stock_adjustment_item_id, inventory_lot_id, inventory_transaction_id, quantity_change)
        values (v_item_id, null, v_transaction_id, v_difference);
        v_remaining := 0;
      end if;
      if v_remaining > 0 then raise exception 'insufficient_stock:%', v_item_row.item_code using errcode = '23514'; end if;
    end if;
  end loop;
  if v_line = 0 then raise exception 'stock_adjustment_has_no_changes' using errcode = '22023'; end if;
  return query select v_adjustment_id, v_adjustment_number;
end;
$$;

revoke all on function public.post_stock_adjustment(date, bigint, text, text, jsonb, text) from public, anon;
grant execute on function public.post_stock_adjustment(date, bigint, text, text, jsonb, text) to authenticated;
