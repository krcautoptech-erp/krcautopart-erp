create or replace function public.submit_purchase_requisition(
  p_needed_by_date date,
  p_requester_name text,
  p_department_name text,
  p_remarks text,
  p_items jsonb
)
returns table (requisition_id bigint, requisition_number text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_requisition_id bigint;
  v_requisition_number text;
  v_item_count integer;
  v_valid_item_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if p_needed_by_date is null or p_needed_by_date < current_date then
    raise exception 'Needed-by date must be today or later';
  end if;

  if length(btrim(coalesce(p_requester_name, ''))) = 0 then
    raise exception 'Requester is required';
  end if;

  if length(btrim(coalesce(p_department_name, ''))) = 0 then
    raise exception 'Department is required';
  end if;

  if length(coalesce(p_remarks, '')) > 300 then
    raise exception 'Remarks exceed 300 characters';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Items must be a JSON array';
  end if;

  select count(*)
  into v_item_count
  from jsonb_to_recordset(p_items) as item(
    raw_material_id bigint,
    quantity numeric,
    remarks text,
    needed_by_date date
  );

  if v_item_count = 0 then
    raise exception 'At least one item is required';
  end if;

  if (
    select count(distinct item.raw_material_id)
    from jsonb_to_recordset(p_items) as item(
      raw_material_id bigint,
      quantity numeric,
      remarks text,
      needed_by_date date
    )
  ) <> v_item_count then
    raise exception 'Duplicate raw materials are not allowed';
  end if;

  select count(*)
  into v_valid_item_count
  from jsonb_to_recordset(p_items) as item(
    raw_material_id bigint,
    quantity numeric,
    remarks text,
    needed_by_date date
  )
  join public.raw_materials raw_material
    on raw_material.id = item.raw_material_id
   and raw_material.status = 'active'
  join public.raw_material_units unit
    on unit.id = raw_material.unit_id
   and unit.status = 'active'
  where item.quantity > 0
    and length(coalesce(item.remarks, '')) <= 255
    and (unit.allows_decimal or item.quantity = trunc(item.quantity));

  if v_valid_item_count <> v_item_count then
    raise exception 'One or more raw-material items are invalid';
  end if;

  insert into public.purchase_requisitions (
    pr_number,
    document_date,
    requester_name,
    department_name,
    needed_by_date,
    status,
    remarks,
    created_by,
    updated_by,
    submitted_at
  )
  values (
    '',
    current_date,
    btrim(p_requester_name),
    btrim(p_department_name),
    p_needed_by_date,
    'pending_approval',
    nullif(btrim(coalesce(p_remarks, '')), ''),
    (select auth.uid()),
    (select auth.uid()),
    timezone('utc', now())
  )
  returning id, pr_number
  into v_requisition_id, v_requisition_number;

  insert into public.purchase_requisition_items (
    requisition_id,
    line_no,
    item_type,
    raw_material_id,
    unit_id,
    item_code,
    item_name,
    item_description,
    quantity,
    unit_name,
    needed_by_date,
    remarks
  )
  select
    v_requisition_id,
    row_number() over (order by item.ordinality)::integer,
    'raw_material',
    raw_material.id,
    unit.id,
    raw_material.material_code,
    raw_material.material_name,
    concat(
      grade.grade_name,
      ' | ',
      raw_material.thickness_mm,
      ' x ',
      raw_material.width_mm,
      ' x ',
      raw_material.length_mm,
      ' mm.'
    ),
    item.quantity,
    unit.unit_name,
    coalesce(item.needed_by_date, p_needed_by_date),
    nullif(btrim(coalesce(item.remarks, '')), '')
  from rows from(
    jsonb_to_recordset(p_items) as (
      raw_material_id bigint,
      quantity numeric,
      remarks text,
      needed_by_date date
    )
  ) with ordinality as item(
    raw_material_id,
    quantity,
    remarks,
    needed_by_date,
    ordinality
  )
  join public.raw_materials raw_material
    on raw_material.id = item.raw_material_id
  join public.raw_material_grades grade
    on grade.id = raw_material.grade_id
  join public.raw_material_units unit
    on unit.id = raw_material.unit_id;

  insert into public.purchase_requisition_approval_logs (
    requisition_id,
    action,
    actor_name,
    actor_user_id
  )
  values (
    v_requisition_id,
    'submitted',
    btrim(p_requester_name),
    (select auth.uid())
  );

  return query
  select v_requisition_id, v_requisition_number;
end;
$$;
