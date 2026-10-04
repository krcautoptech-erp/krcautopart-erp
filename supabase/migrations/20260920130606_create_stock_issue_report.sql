create index if not exists stock_issues_report_idx
  on public.stock_issues (document_date desc, warehouse_id, department_id, status, id desc);

create or replace function public.get_stock_issue_report(
  p_view text,
  p_start_date date,
  p_end_date date,
  p_warehouse_id bigint default null,
  p_department_id bigint default null,
  p_status text default null,
  p_search text default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_offset integer := (p_page - 1) * p_page_size;
  v_can_view_cost boolean := false;
  v_rows jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_summary jsonb := '{}'::jsonb;
  v_options jsonb := '{}'::jsonb;
begin
  if (select auth.uid()) is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.authorize('inventory_issue.view') then raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_view not in ('document', 'product', 'department') or p_start_date is null or p_end_date is null
    or p_start_date > p_end_date or p_page < 1 or p_page_size not in (20, 50, 100, 500)
    or coalesce(p_status, 'all') not in ('all', 'posted', 'cancelled') then
    raise exception 'invalid_report_filters' using errcode = '22023';
  end if;

  v_can_view_cost := public.authorize('inventory_cost.view');

  with cost_by_item as materialized (
    select allocation.stock_issue_item_id, sum(cost.cost_amount) amount
    from public.stock_issue_allocations allocation
    join public.inventory_issue_cost_allocations cost
      on cost.inventory_transaction_id = allocation.inventory_transaction_id
    group by allocation.stock_issue_item_id
  ), base as materialized (
    select issue.id issue_id, issue.issue_number, issue.document_date, issue.requester_name,
      issue.department_id, issue.department_name, issue.work_point, issue.warehouse_id,
      issue.warehouse_name, issue.status, issue.created_at,
      item.id item_id, item.item_master_id, item.item_code, item.item_name, item.unit_name,
      item.quantity, coalesce(cost.amount, 0) amount
    from public.stock_issues issue
    join public.stock_issue_items item on item.stock_issue_id = issue.id
    left join cost_by_item cost on cost.stock_issue_item_id = item.id
    where issue.document_date between p_start_date and p_end_date
      and (p_warehouse_id is null or issue.warehouse_id = p_warehouse_id)
      and (p_department_id is null or issue.department_id = p_department_id)
      and (coalesce(p_status, 'all') = 'all' or issue.status = p_status)
      and (nullif(btrim(coalesce(p_search, '')), '') is null
        or issue.issue_number ilike '%' || btrim(p_search) || '%'
        or issue.requester_name ilike '%' || btrim(p_search) || '%'
        or issue.department_name ilike '%' || btrim(p_search) || '%'
        or issue.work_point ilike '%' || btrim(p_search) || '%'
        or item.item_code ilike '%' || btrim(p_search) || '%'
        or item.item_name ilike '%' || btrim(p_search) || '%')
  ), document_rows as materialized (
    select issue_id group_id, issue_id stock_issue_id, issue_number code, requester_name name,
      department_name, work_point, warehouse_name, document_date, status,
      count(*) item_count, sum(quantity) quantity_total,
      case when v_can_view_cost then sum(amount) else null end amount_total,
      max(created_at) created_at
    from base group by issue_id, issue_number, requester_name, department_name, work_point,
      warehouse_name, document_date, status
  ), product_rows as materialized (
    select item_master_id group_id, item_code code, item_name name, unit_name,
      count(distinct issue_id) filter (where status = 'posted') issue_count,
      count(*) filter (where status = 'posted') item_count,
      sum(case when status = 'posted' then quantity else 0 end) quantity_total,
      case when v_can_view_cost then sum(case when status = 'posted' then amount else 0 end) else null end amount_total,
      max(document_date) latest_date, (array_agg(requester_name order by document_date desc, issue_id desc))[1] latest_requester
    from base group by item_master_id, item_code, item_name, unit_name
  ), department_rows as materialized (
    select department_id group_id, department_name name,
      count(distinct issue_id) filter (where status = 'posted') issue_count,
      count(*) filter (where status = 'posted') item_count,
      sum(case when status = 'posted' then quantity else 0 end) quantity_total,
      case when v_can_view_cost then sum(case when status = 'posted' then amount else 0 end) else null end amount_total,
      max(document_date) latest_date, (array_agg(requester_name order by document_date desc, issue_id desc))[1] latest_requester
    from base group by department_id, department_name
  )
  select case p_view
    when 'document' then (select count(*) from document_rows)
    when 'product' then (select count(*) from product_rows)
    else (select count(*) from department_rows)
  end,
  case p_view
    when 'document' then coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.document_date desc, row_data.stock_issue_id desc) from (
      select * from document_rows order by document_date desc, stock_issue_id desc limit p_page_size offset v_offset
    ) row_data), '[]'::jsonb)
    when 'product' then coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.quantity_total desc, row_data.code) from (
      select * from product_rows order by quantity_total desc, code limit p_page_size offset v_offset
    ) row_data), '[]'::jsonb)
    else coalesce((select jsonb_agg(to_jsonb(row_data) order by row_data.quantity_total desc, row_data.name) from (
      select * from department_rows order by quantity_total desc, name limit p_page_size offset v_offset
    ) row_data), '[]'::jsonb)
  end,
  jsonb_build_object(
    'document_count', (select count(distinct issue_id) from base),
    'item_count', (select count(*) from base where status = 'posted'),
    'quantity_total', coalesce((select sum(quantity) from base where status = 'posted'), 0),
    'amount_total', case when v_can_view_cost then coalesce((select sum(amount) from base where status = 'posted'), 0) else null end,
    'group_count', case p_view when 'product' then (select count(*) from product_rows) when 'department' then (select count(*) from department_rows) else (select count(*) from document_rows) end
  )
  into v_total, v_rows, v_summary;

  select jsonb_build_object(
    'warehouses', coalesce((select jsonb_agg(jsonb_build_object('id', warehouse.id, 'name', warehouse.warehouse_name) order by warehouse.sort_order, warehouse.warehouse_name) from public.raw_material_warehouses warehouse where warehouse.status = 'active'), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id', department.id, 'name', department.department_name) order by department.department_name) from public.departments department where department.status = 'active'), '[]'::jsonb)
  ) into v_options;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'summary', v_summary, 'options', v_options, 'can_view_cost', v_can_view_cost);
end;
$$;

revoke all on function public.get_stock_issue_report(text, date, date, bigint, bigint, text, text, integer, integer) from public, anon;
grant execute on function public.get_stock_issue_report(text, date, date, bigint, bigint, text, text, integer, integer) to authenticated;

create or replace function public.get_stock_issue_report_detail(
  p_view text,
  p_group_id bigint,
  p_start_date date,
  p_end_date date,
  p_warehouse_id bigint default null,
  p_department_id bigint default null,
  p_status text default null,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_can_view_cost boolean := false;
  v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not public.authorize('inventory_issue.view') then raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_view not in ('product', 'department') or p_group_id <= 0 or p_start_date > p_end_date
    or coalesce(p_status, 'all') not in ('all', 'posted', 'cancelled') then
    raise exception 'invalid_report_filters' using errcode = '22023';
  end if;
  v_can_view_cost := public.authorize('inventory_cost.view');

  with cost_by_item as materialized (
    select allocation.stock_issue_item_id, sum(cost.cost_amount) amount
    from public.stock_issue_allocations allocation
    join public.inventory_issue_cost_allocations cost on cost.inventory_transaction_id = allocation.inventory_transaction_id
    group by allocation.stock_issue_item_id
  ), base as materialized (
    select issue.id issue_id, issue.issue_number, issue.document_date, issue.requester_name,
      issue.department_id, issue.department_name, issue.work_point, issue.warehouse_name, issue.status,
      item.item_master_id, item.item_code, item.item_name, item.unit_name, item.quantity,
      case when v_can_view_cost then coalesce(cost.amount, 0) else null end amount
    from public.stock_issues issue
    join public.stock_issue_items item on item.stock_issue_id = issue.id
    left join cost_by_item cost on cost.stock_issue_item_id = item.id
    where issue.document_date between p_start_date and p_end_date
      and (p_warehouse_id is null or issue.warehouse_id = p_warehouse_id)
      and (p_department_id is null or issue.department_id = p_department_id)
      and (coalesce(p_status, 'all') = 'all' or issue.status = p_status)
      and (nullif(btrim(coalesce(p_search, '')), '') is null
        or issue.issue_number ilike '%' || btrim(p_search) || '%'
        or issue.requester_name ilike '%' || btrim(p_search) || '%'
        or issue.department_name ilike '%' || btrim(p_search) || '%'
        or issue.work_point ilike '%' || btrim(p_search) || '%'
        or item.item_code ilike '%' || btrim(p_search) || '%'
        or item.item_name ilike '%' || btrim(p_search) || '%')
      and ((p_view = 'product' and item.item_master_id = p_group_id)
        or (p_view = 'department' and issue.department_id = p_group_id))
  )
  select jsonb_build_object(
    'view', p_view,
    'identity', case when p_view = 'product'
      then (select jsonb_build_object('id', item_master_id, 'code', item_code, 'name', item_name, 'meta', unit_name) from base limit 1)
      else (select jsonb_build_object('id', department_id, 'code', '', 'name', department_name, 'meta', '') from base limit 1) end,
    'summary', jsonb_build_object(
      'document_count', count(distinct issue_id) filter (where status = 'posted'),
      'item_count', count(*) filter (where status = 'posted'),
      'quantity_total', coalesce(sum(case when status = 'posted' then quantity else 0 end), 0),
      'amount_total', case when v_can_view_cost then coalesce(sum(case when status = 'posted' then amount else 0 end), 0) else null end
    ),
    'entries', coalesce(jsonb_agg(jsonb_build_object(
      'issue_id', issue_id, 'issue_number', issue_number, 'document_date', document_date,
      'requester_name', requester_name, 'department_name', department_name, 'work_point', work_point,
      'warehouse_name', warehouse_name, 'status', status, 'item_code', item_code,
      'item_name', item_name, 'unit_name', unit_name, 'quantity', quantity, 'amount', amount
    ) order by document_date desc, issue_id desc), '[]'::jsonb),
    'can_view_cost', v_can_view_cost
  ) into v_result from base;
  return coalesce(v_result, jsonb_build_object('view', p_view, 'identity', null, 'summary', '{}'::jsonb, 'entries', '[]'::jsonb, 'can_view_cost', v_can_view_cost));
end;
$$;

revoke all on function public.get_stock_issue_report_detail(text, bigint, date, date, bigint, bigint, text, text) from public, anon;
grant execute on function public.get_stock_issue_report_detail(text, bigint, date, date, bigint, bigint, text, text) to authenticated;
