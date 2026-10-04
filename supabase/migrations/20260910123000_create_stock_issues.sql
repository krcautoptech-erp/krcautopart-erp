-- Simple posted stock issues. FIFO allocation and the stock ledger are committed atomically.

insert into public.app_permissions (
  permission_code, permission_name, module_code, module_name,
  action_code, module_sort_order, sort_order, status
)
values
  ('inventory_issue.view', 'ดูใบเบิกใช้สินค้า', 'inventory_issue', 'ใบเบิกใช้สินค้า', 'view', 61, 10, 'active'),
  ('inventory_issue.create', 'สร้างใบเบิกใช้สินค้า', 'inventory_issue', 'ใบเบิกใช้สินค้า', 'create', 61, 20, 'active'),
  ('inventory_issue.export', 'ส่งออกใบเบิกใช้สินค้า', 'inventory_issue', 'ใบเบิกใช้สินค้า', 'export', 61, 30, 'active')
on conflict (permission_code) do update set
  permission_name = excluded.permission_name,
  module_code = excluded.module_code,
  module_name = excluded.module_name,
  action_code = excluded.action_code,
  module_sort_order = excluded.module_sort_order,
  sort_order = excluded.sort_order,
  status = 'active';

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
cross join public.app_permissions permission
where role.is_owner
  and permission.permission_code like 'inventory_issue.%'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct source.role_id, target.id
from public.role_permissions source
join public.app_permissions source_permission on source_permission.id = source.permission_id
join public.app_permissions target on target.permission_code = case
  when source_permission.permission_code = 'inventory.create_gr' then 'inventory_issue.create'
  when source_permission.permission_code = 'inventory.view' then 'inventory_issue.view'
  else null
end
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct source.role_id, target.id
from public.role_permissions source
join public.app_permissions source_permission on source_permission.id = source.permission_id
join public.app_permissions target on target.permission_code = 'inventory_issue.export'
where source_permission.permission_code = 'inventory.view'
on conflict (role_id, permission_id) do nothing;

insert into erp_private.number_series (series_key, prefix, padding, reset_policy)
values ('IS', 'IS', 4, 'monthly')
on conflict (series_key) do update set
  prefix = excluded.prefix,
  padding = excluded.padding,
  reset_policy = excluded.reset_policy,
  is_active = true,
  updated_at = now();

create table public.stock_issues (
  id bigint generated always as identity primary key,
  issue_number text not null unique,
  document_date date not null,
  requester_name text not null,
  department_id bigint not null references public.departments(id) on delete restrict,
  department_name text not null,
  work_point text not null,
  warehouse_id bigint not null references public.raw_material_warehouses(id) on delete restrict,
  warehouse_name text not null,
  reason text not null,
  status text not null default 'posted',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint stock_issues_number_not_blank check (length(btrim(issue_number)) > 0),
  constraint stock_issues_requester_not_blank check (length(btrim(requester_name)) between 1 and 150),
  constraint stock_issues_department_not_blank check (length(btrim(department_name)) between 1 and 100),
  constraint stock_issues_work_point_not_blank check (length(btrim(work_point)) between 1 and 200),
  constraint stock_issues_warehouse_not_blank check (length(btrim(warehouse_name)) between 1 and 150),
  constraint stock_issues_reason_not_blank check (length(btrim(reason)) between 1 and 500),
  constraint stock_issues_status_check check (status in ('posted', 'cancelled'))
);

create table public.stock_issue_items (
  id bigint generated always as identity primary key,
  stock_issue_id bigint not null references public.stock_issues(id) on delete restrict,
  line_no integer not null,
  item_master_id bigint not null references public.item_master(id) on delete restrict,
  item_code text not null,
  item_name text not null,
  quantity numeric(18, 4) not null,
  unit_name text not null,
  constraint stock_issue_items_line_unique unique (stock_issue_id, line_no),
  constraint stock_issue_items_item_unique unique (stock_issue_id, item_master_id),
  constraint stock_issue_items_line_check check (line_no > 0),
  constraint stock_issue_items_quantity_check check (quantity > 0)
);

create table public.stock_issue_allocations (
  id bigint generated always as identity primary key,
  stock_issue_item_id bigint not null references public.stock_issue_items(id) on delete restrict,
  inventory_lot_id bigint references public.inventory_lots(id) on delete restrict,
  inventory_transaction_id bigint not null unique references public.inventory_transactions(id) on delete restrict,
  quantity numeric(18, 4) not null check (quantity > 0)
);

create index stock_issues_date_idx on public.stock_issues (document_date desc, id desc);
create index stock_issues_department_idx on public.stock_issues (department_id, document_date desc);
create index stock_issues_warehouse_idx on public.stock_issues (warehouse_id, document_date desc);
create index stock_issue_items_issue_idx on public.stock_issue_items (stock_issue_id, line_no);
create index stock_issue_items_item_idx on public.stock_issue_items (item_master_id, stock_issue_id);
create index stock_issue_allocations_item_idx on public.stock_issue_allocations (stock_issue_item_id);
create index stock_issue_allocations_lot_idx on public.stock_issue_allocations (inventory_lot_id)
where inventory_lot_id is not null;

alter table public.stock_issues enable row level security;
alter table public.stock_issue_items enable row level security;
alter table public.stock_issue_allocations enable row level security;

create policy "Authorized users can read stock issues"
on public.stock_issues for select to authenticated
using ((select public.authorize('inventory_issue.view')));

create policy "Authorized users can read stock issue items"
on public.stock_issue_items for select to authenticated
using ((select public.authorize('inventory_issue.view')));

create policy "Authorized users can read stock issue allocations"
on public.stock_issue_allocations for select to authenticated
using ((select public.authorize('inventory_issue.view')));

grant select on public.stock_issues, public.stock_issue_items, public.stock_issue_allocations to authenticated;
revoke insert, update, delete on public.stock_issues, public.stock_issue_items, public.stock_issue_allocations from authenticated;

alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_doc_type_check,
  add constraint inventory_transactions_doc_type_check check (
    reference_doc_type in ('goods_receipt', 'purchase_return', 'production_issue', 'stock_issue', 'stock_adjustment')
  );

create or replace function public.get_stock_issue_form_options(
  p_warehouse_id bigint default null,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.authorize('inventory_issue.create') then raise exception 'permission_denied' using errcode = '42501'; end if;

  select jsonb_build_object(
    'requesterName', coalesce(nullif(concat_ws(' ', profile.first_name, profile.last_name), ''), auth_user.email, ''),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.department_name) order by d.department_name)
      from public.departments d where d.status = 'active'
    ), '[]'::jsonb),
    'warehouses', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.warehouse_name) order by w.sort_order, w.warehouse_name)
      from public.raw_material_warehouses w where w.status = 'active'
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(to_jsonb(stock_item) order by stock_item.code)
      from (
        select item.id, item.item_code as code, item.item_name as name,
          balance.warehouse_id as "warehouseId", balance.on_hand_qty as "onHandQty",
          coalesce(nullif(unit.symbol, ''), unit.unit_name, 'หน่วย') as "unitName"
        from public.item_inventory_balances balance
        join public.item_master item on item.id = balance.item_master_id
        join public.item_types item_type on item_type.id = item.item_type_id
        left join public.raw_material_units unit on unit.id = item.unit_id
        where balance.on_hand_qty > 0
          and item.status = 'active'
          and item_type.status = 'active'
          and item_type.is_stocked
          and item.tracking_method <> 'serial'
          and (p_warehouse_id is null or balance.warehouse_id = p_warehouse_id)
          and (
            nullif(btrim(coalesce(p_search, '')), '') is null
            or item.item_code ilike '%' || btrim(p_search) || '%'
            or item.item_name ilike '%' || btrim(p_search) || '%'
          )
        order by item.item_code
        limit 100
      ) stock_item
    ), '[]'::jsonb)
  ) into v_result
  from auth.users auth_user
  left join public.user_profiles profile on profile.user_id = auth_user.id
  where auth_user.id = v_user_id;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_stock_issue_form_options(bigint, text) from public, anon;
grant execute on function public.get_stock_issue_form_options(bigint, text) to authenticated;

create or replace function public.post_stock_issue(
  p_document_date date,
  p_requester_name text,
  p_department_id bigint,
  p_work_point text,
  p_warehouse_id bigint,
  p_reason text,
  p_items jsonb
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
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.authorize('inventory_issue.create') then raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_document_date is null or nullif(btrim(p_requester_name), '') is null
    or p_department_id is null or nullif(btrim(p_work_point), '') is null
    or p_warehouse_id is null or nullif(btrim(p_reason), '') is null then
    raise exception 'invalid_stock_issue_header' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
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

  select allocation_id, business_number into v_allocation_id, v_issue_number
  from erp_private.allocate_business_number('IS', p_document_date, 'used', 'stock_issue', null);

  insert into public.stock_issues (
    issue_number, document_date, requester_name, department_id, department_name,
    work_point, warehouse_id, warehouse_name, reason, created_by
  ) values (
    v_issue_number, p_document_date, btrim(p_requester_name), p_department_id, v_department_name,
    btrim(p_work_point), p_warehouse_id, v_warehouse_name, btrim(p_reason), v_user_id
  ) returning id into v_issue_id;

  update erp_private.number_allocations
  set entity_id = v_issue_id::text
  where id = v_allocation_id;

  for v_item in
    select item from jsonb_array_elements(p_items) item
    order by (item ->> 'item_master_id')::bigint
  loop
    v_required_qty := nullif(v_item ->> 'quantity', '')::numeric;
    if v_required_qty is null or v_required_qty <= 0 then
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
      for v_lot in
        select lot.id, lot.on_hand_qty
        from public.inventory_lots lot
        where lot.item_master_id = v_item_row.id
          and lot.warehouse_id = p_warehouse_id and lot.on_hand_qty > 0
        order by lot.received_at, lot.id
        for update
      loop
        exit when v_required_qty = 0;
        v_take_qty := least(v_required_qty, v_lot.on_hand_qty);
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

revoke all on function public.post_stock_issue(date, text, bigint, text, bigint, text, jsonb) from public, anon;
grant execute on function public.post_stock_issue(date, text, bigint, text, bigint, text, jsonb) to authenticated;
