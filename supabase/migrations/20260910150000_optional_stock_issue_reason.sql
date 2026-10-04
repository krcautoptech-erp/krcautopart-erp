alter table public.stock_issues drop constraint if exists stock_issues_reason_not_blank;
alter table public.stock_issues add constraint stock_issues_reason_length check (length(reason) <= 500);

create or replace function public.post_stock_issue(
  p_document_date date,
  p_requester_name text,
  p_department_id bigint,
  p_work_point text,
  p_warehouse_id bigint,
  p_reason text,
  p_items jsonb,
  p_issue_number text
)
returns table (stock_issue_id bigint, issue_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_allocation_id bigint;
  v_issue_number text;
  v_issue_id bigint;
  v_department_name text;
  v_warehouse_name text;
  v_item jsonb;
  v_item_row record;
  v_balance_qty numeric(18, 4);
  v_required_qty numeric(18, 4);
  v_take_qty numeric(18, 4);
  v_line_no integer := 0;
  v_issue_item_id bigint;
  v_lot record;
  v_transaction_id bigint;
  v_raw_material_id bigint;
  v_selected jsonb;
  v_fifo_remaining numeric;
  v_fifo_take numeric;
  v_override boolean;
  v_reason text;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.authorize('inventory_issue.create') then raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_document_date is null or nullif(btrim(p_requester_name), '') is null
    or p_department_id is null or nullif(btrim(p_work_point), '') is null
    or p_warehouse_id is null then
    raise exception 'invalid_stock_issue_header' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'invalid_stock_issue_items' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item
    group by (item ->> 'item_master_id')::bigint having count(*) > 1
  ) then raise exception 'duplicate_stock_issue_item' using errcode = '22023'; end if;

  select department_name into v_department_name
  from public.departments where id = p_department_id and status = 'active';
  if not found then raise exception 'department_not_found' using errcode = 'P0002'; end if;

  select warehouse_name into v_warehouse_name
  from public.raw_material_warehouses where id = p_warehouse_id and status = 'active';
  if not found then raise exception 'warehouse_not_found' using errcode = 'P0002'; end if;

  if nullif(btrim(p_issue_number), '') is null then
    raise exception 'invalid_or_expired_number_reservation' using errcode = '22023';
  end if;
  select allocation_id, business_number into v_allocation_id, v_issue_number
  from erp_private.claim_business_number('IS', p_document_date, p_issue_number, 'stock_issue', null);

  insert into public.stock_issues (
    issue_number, document_date, requester_name, department_id, department_name,
    work_point, warehouse_id, warehouse_name, reason, created_by
  ) values (
    v_issue_number, p_document_date, btrim(p_requester_name), p_department_id, v_department_name,
    btrim(p_work_point), p_warehouse_id, v_warehouse_name, coalesce(btrim(p_reason), ''), v_user_id
  ) returning id into v_issue_id;

  update erp_private.number_allocations
  set entity_id = v_issue_id::text
  where id = v_allocation_id;

  for v_item in
    select item from jsonb_array_elements(p_items) item
    order by (item ->> 'item_master_id')::bigint
  loop
    v_required_qty := nullif(v_item ->> 'quantity', '')::numeric;
    if v_required_qty is null or v_required_qty <= 0 or v_required_qty::text in ('NaN', 'Infinity', '-Infinity') then
      raise exception 'invalid_stock_issue_quantity' using errcode = '22023';
    end if;

    select master.id, master.item_code, master.item_name, master.tracking_method,
      coalesce(nullif(unit.symbol, ''), unit.unit_name, 'หน่วย') as unit_name,
      case when master.attributes ->> 'legacySource' = 'raw_material'
        and master.attributes ->> 'legacySourceId' ~ '^\d+$'
        then (master.attributes ->> 'legacySourceId')::bigint else null end as raw_material_id
    into v_item_row
    from public.item_master master
    join public.item_types item_type on item_type.id = master.item_type_id
    left join public.raw_material_units unit on unit.id = master.unit_id
    where master.id = (v_item ->> 'item_master_id')::bigint
      and master.status = 'active' and item_type.status = 'active' and item_type.is_stocked;

    if not found then raise exception 'stock_item_not_found' using errcode = 'P0002'; end if;
    if v_item_row.tracking_method = 'serial' then
      raise exception 'serial_stock_issue_not_supported' using errcode = '0A000';
    end if;
    v_raw_material_id := v_item_row.raw_material_id;

    select balance.on_hand_qty into v_balance_qty
    from public.item_inventory_balances balance
    where balance.item_master_id = v_item_row.id and balance.warehouse_id = p_warehouse_id
    for update;
    if not found or v_balance_qty < v_required_qty then
      raise exception 'insufficient_stock:%', v_item_row.item_code using errcode = '23514';
    end if;

    v_line_no := v_line_no + 1;
    insert into public.stock_issue_items (
      stock_issue_id, line_no, item_master_id, item_code, item_name, quantity, unit_name
    ) values (
      v_issue_id, v_line_no, v_item_row.id, v_item_row.item_code,
      v_item_row.item_name, v_required_qty, v_item_row.unit_name
    ) returning id into v_issue_item_id;

    if v_item_row.tracking_method = 'lot' then
      v_selected := v_item -> 'allocations';
      v_reason := nullif(btrim(v_item ->> 'fifo_override_reason'), '');
      if v_selected is null or jsonb_typeof(v_selected) <> 'array' then
        raise exception 'lot_allocation_required' using errcode = '22023';
      end if;
      if jsonb_array_length(v_selected) = 0 or exists (
        select 1 from jsonb_array_elements(v_selected) a
        where (a->>'lot_id') is null or (a->>'quantity') is null
          or (a->>'quantity')::numeric <= 0
          or (a->>'quantity')::numeric::text in ('NaN', 'Infinity', '-Infinity')
          or (a->>'quantity')::numeric <> round((a->>'quantity')::numeric, 4)
      ) or exists (
        select 1 from jsonb_array_elements(v_selected) a group by a->>'lot_id' having count(*) > 1
      ) or (select sum((a->>'quantity')::numeric) from jsonb_array_elements(v_selected) a) <> v_required_qty then
        raise exception 'invalid_lot_allocation' using errcode = '22023';
      end if;
      if exists (
        select 1 from jsonb_array_elements(v_selected) a
        left join public.inventory_lots l on l.id = (a->>'lot_id')::bigint
          and l.item_master_id = v_item_row.id and l.warehouse_id = p_warehouse_id
        where l.id is null
      ) then raise exception 'invalid_lot_allocation' using errcode = '22023'; end if;
      v_fifo_remaining := v_required_qty;
      v_override := false;
      -- Lock in FIFO order, matching the existing posting flow; validate against current balances.
      for v_lot in
        select l.id, l.on_hand_qty from public.inventory_lots l
        where l.item_master_id = v_item_row.id and l.warehouse_id = p_warehouse_id
        order by l.received_at, l.id for update
      loop
        v_take_qty := coalesce((select (a->>'quantity')::numeric from jsonb_array_elements(v_selected) a where (a->>'lot_id')::bigint = v_lot.id), 0);
        if v_take_qty > v_lot.on_hand_qty then raise exception 'insufficient_stock' using errcode = '23514'; end if;
        v_fifo_take := least(v_fifo_remaining, greatest(v_lot.on_hand_qty, 0));
        if v_take_qty <> v_fifo_take then v_override := true; end if;
        v_fifo_remaining := v_fifo_remaining - v_fifo_take;
      end loop;
      if v_override and v_reason is null then raise exception 'fifo_override_reason_required' using errcode = '22023'; end if;
      if length(v_reason) > 500 then raise exception 'invalid_lot_allocation' using errcode = '22023'; end if;
      update public.stock_issue_items set fifo_override_reason = case when v_override then v_reason else null end where id = v_issue_item_id;
      for v_lot in
        select lot.id, lot.on_hand_qty
        from public.inventory_lots lot
        where lot.item_master_id = v_item_row.id
          and lot.warehouse_id = p_warehouse_id and lot.on_hand_qty > 0
        order by lot.received_at, lot.id
        for update
      loop
        v_take_qty := coalesce((select (a->>'quantity')::numeric from jsonb_array_elements(v_selected) a where (a->>'lot_id')::bigint = v_lot.id), 0);
        continue when v_take_qty = 0;
        insert into public.inventory_transactions (
          raw_material_id, item_master_id, warehouse_id, lot_id, transaction_type,
          reference_doc_type, reference_doc_number, quantity_change, created_by
        ) values (
          v_raw_material_id, v_item_row.id, p_warehouse_id, v_lot.id, 'issue',
          'stock_issue', v_issue_number, -v_take_qty, v_user_id
        ) returning id into v_transaction_id;
        insert into public.stock_issue_allocations (
          stock_issue_item_id, inventory_lot_id, inventory_transaction_id, quantity
        ) values (v_issue_item_id, v_lot.id, v_transaction_id, v_take_qty);
        v_required_qty := v_required_qty - v_take_qty;
      end loop;
      if v_required_qty > 0 then raise exception 'insufficient_fifo_lots:%', v_item_row.item_code using errcode = '23514'; end if;
    else
      insert into public.inventory_transactions (
        raw_material_id, item_master_id, warehouse_id, lot_id, transaction_type,
        reference_doc_type, reference_doc_number, quantity_change, created_by
      ) values (
        v_raw_material_id, v_item_row.id, p_warehouse_id, null, 'issue',
        'stock_issue', v_issue_number, -v_required_qty, v_user_id
      ) returning id into v_transaction_id;
      insert into public.stock_issue_allocations (
        stock_issue_item_id, inventory_lot_id, inventory_transaction_id, quantity
      ) values (v_issue_item_id, null, v_transaction_id, v_required_qty);
    end if;
  end loop;

  return query select v_issue_id, v_issue_number;
end;
$$;

revoke all on function public.post_stock_issue(date, text, bigint, text, bigint, text, jsonb, text) from public, anon;
grant execute on function public.post_stock_issue(date, text, bigint, text, bigint, text, jsonb, text) to authenticated;
