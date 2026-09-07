alter table public.purchase_requisitions
  alter column status set default 'draft';

alter table public.purchase_requisitions
  drop constraint if exists purchase_requisitions_status_check;

alter table public.purchase_requisitions
  add constraint purchase_requisitions_status_check
  check (
    status in (
      'draft',
      'pending_approval',
      'approved',
      'cancelled',
      'rejected'
    )
  );

create or replace function public.save_purchase_requisition(
  p_requisition_id bigint,
  p_document_date date,
  p_needed_by_date date,
  p_requester_name text,
  p_department_name text,
  p_remarks text,
  p_status text,
  p_items jsonb
)
returns table (
  requisition_id bigint,
  requisition_number text,
  requisition_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_name text;
  v_current public.purchase_requisitions%rowtype;
  v_item_count integer;
  v_requisition public.purchase_requisitions%rowtype;
  v_user_id uuid := (select auth.uid());
  v_valid_item_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_requisition_id is null then
    if not public.authorize('pr.create') then
      raise exception 'permission_denied' using errcode = '42501';
    end if;
  elsif not public.authorize('pr.edit') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_status not in ('draft', 'pending_approval') then
    raise exception 'invalid_purchase_requisition_status'
      using errcode = '22023';
  end if;

  if p_document_date is null then
    raise exception 'document_date_required' using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_requester_name, ''))) = 0
    or length(btrim(coalesce(p_department_name, ''))) = 0
  then
    raise exception 'requester_and_department_required'
      using errcode = '22023';
  end if;

  if char_length(coalesce(p_remarks, '')) > 300 then
    raise exception 'remarks_too_long' using errcode = '22001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) > 200
  then
    raise exception 'invalid_purchase_requisition_items'
      using errcode = '22023';
  end if;

  select count(*)
  into v_item_count
  from jsonb_to_recordset(p_items) as item(
    raw_material_id bigint,
    quantity numeric,
    remarks text,
    needed_by_date date
  );

  if p_status = 'pending_approval' then
    if p_needed_by_date is null or p_needed_by_date < current_date then
      raise exception 'invalid_needed_by_date' using errcode = '22023';
    end if;

    if v_item_count = 0 then
      raise exception 'purchase_requisition_items_required'
        using errcode = '22023';
    end if;
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
    raise exception 'duplicate_raw_materials_not_allowed'
      using errcode = '23505';
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
    and char_length(coalesce(item.remarks, '')) <= 255
    and (unit.allows_decimal or item.quantity = trunc(item.quantity))
    and (
      p_status = 'draft'
      or coalesce(item.needed_by_date, p_needed_by_date) >= current_date
    );

  if v_valid_item_count <> v_item_count then
    raise exception 'invalid_purchase_requisition_item'
      using errcode = '22023';
  end if;

  select coalesce(
    nullif(concat_ws(' ', profile.first_name, profile.last_name), ''),
    nullif(app_user.raw_app_meta_data ->> 'full_name', ''),
    nullif(app_user.email, ''),
    'ผู้ใช้งาน ERP'
  )
  into v_actor_name
  from auth.users app_user
  left join public.user_profiles profile
    on profile.user_id = app_user.id
  where app_user.id = v_user_id;

  if p_requisition_id is null then
    insert into public.purchase_requisitions (
      pr_number,
      document_date,
      requester_name,
      department_name,
      needed_by_date,
      status,
      remarks,
      created_by,
      updated_by
    )
    values (
      '',
      p_document_date,
      btrim(p_requester_name),
      btrim(p_department_name),
      p_needed_by_date,
      'draft',
      nullif(btrim(coalesce(p_remarks, '')), ''),
      v_user_id,
      v_user_id
    )
    returning * into v_requisition;
  else
    select requisition.*
    into v_current
    from public.purchase_requisitions requisition
    where requisition.id = p_requisition_id
    for update;

    if not found then
      raise exception 'purchase_requisition_not_found'
        using errcode = 'P0002';
    end if;

    if v_current.status <> 'draft' then
      raise exception 'purchase_requisition_not_draft:%', v_current.status
        using errcode = '55000';
    end if;

    update public.purchase_requisitions requisition
    set
      document_date = p_document_date,
      requester_name = btrim(p_requester_name),
      department_name = btrim(p_department_name),
      needed_by_date = p_needed_by_date,
      remarks = nullif(btrim(coalesce(p_remarks, '')), ''),
      updated_by = v_user_id,
      updated_at = timezone('utc', now())
    where requisition.id = p_requisition_id
    returning * into v_requisition;

    delete from public.purchase_requisition_items item
    where item.requisition_id = p_requisition_id;
  end if;

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
    v_requisition.id,
    row_number() over (order by item.ordinality)::integer,
    'raw_material',
    raw_material.id,
    unit.id,
    raw_material.material_code,
    raw_material.material_name,
    concat(
      raw_material.material_name,
      ' ',
      grade.grade_name,
      ' ',
      trim(to_char(raw_material.thickness_mm, 'FM999999990.00')),
      ' × ',
      trim(to_char(raw_material.width_mm, 'FM999999990')),
      ' × ',
      trim(to_char(raw_material.length_mm, 'FM999999990')),
      ' มม.'
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

  if p_status = 'pending_approval' then
    perform set_config(
      'app.purchase_requisition_decision',
      'allowed',
      true
    );

    update public.purchase_requisitions requisition
    set
      status = 'pending_approval',
      submitted_at = timezone('utc', now()),
      updated_by = v_user_id,
      updated_at = timezone('utc', now())
    where requisition.id = v_requisition.id
    returning * into v_requisition;

    insert into public.purchase_requisition_approval_logs (
      requisition_id,
      action,
      actor_name,
      actor_user_id
    )
    values (
      v_requisition.id,
      'submitted',
      coalesce(v_actor_name, btrim(p_requester_name)),
      v_user_id
    );
  end if;

  return query
  select
    v_requisition.id,
    v_requisition.pr_number,
    v_requisition.status;
end;
$$;

revoke all on function public.save_purchase_requisition(
  bigint,
  date,
  date,
  text,
  text,
  text,
  text,
  jsonb
) from public;

grant execute on function public.save_purchase_requisition(
  bigint,
  date,
  date,
  text,
  text,
  text,
  text,
  jsonb
) to authenticated;

create or replace function public.delete_purchase_requisition_draft(
  p_requisition_id bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requisition public.purchase_requisitions%rowtype;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if not public.authorize('pr.delete') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select requisition.*
  into v_requisition
  from public.purchase_requisitions requisition
  where requisition.id = p_requisition_id
  for update;

  if not found then
    raise exception 'purchase_requisition_not_found'
      using errcode = 'P0002';
  end if;

  if v_requisition.status <> 'draft' then
    raise exception 'purchase_requisition_not_draft:%', v_requisition.status
      using errcode = '55000';
  end if;

  delete from public.purchase_requisitions requisition
  where requisition.id = v_requisition.id;

  return v_requisition.pr_number;
end;
$$;

revoke all on function public.delete_purchase_requisition_draft(bigint)
  from public;
grant execute on function public.delete_purchase_requisition_draft(bigint)
  to authenticated;

-- Only a real submission should create the approval notification. Draft saves,
-- decisions and cancellations have their own event handling.
drop trigger if exists purchase_requisition_created_notification
  on public.purchase_requisition_approval_logs;
create trigger purchase_requisition_created_notification
after insert on public.purchase_requisition_approval_logs
for each row
when (new.action = 'submitted')
execute function private.notify_purchase_requisition_created();

-- Existing PO drafts may be edited and submitted, but a submitted PO must be
-- withdrawn or cancelled instead of being edited in place.
do $$
declare
  current_definition text;
  fixed_definition text;
  target_oid regprocedure := to_regprocedure(
    'public.update_purchase_order(bigint,date,bigint,date,text,text,text,text,jsonb)'
  );
begin
  if target_oid is null then
    return;
  end if;

  select pg_get_functiondef(target_oid)
  into current_definition;

  fixed_definition := replace(
    current_definition,
    'if v_order.status not in (''draft'', ''pending_approval'') then',
    'if v_order.status <> ''draft'' then'
  );

  if fixed_definition <> current_definition then
    execute fixed_definition;
  end if;
end;
$$;
