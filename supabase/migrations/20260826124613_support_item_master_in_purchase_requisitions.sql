alter table public.purchase_requisition_items
  add column if not exists item_master_id bigint;

alter table public.purchase_requisition_items
  drop constraint if exists purchase_requisition_items_item_master_id_fkey,
  add constraint purchase_requisition_items_item_master_id_fkey
    foreign key (item_master_id) references public.item_master(id) on delete restrict,
  drop constraint if exists purchase_requisition_items_item_type_check,
  add constraint purchase_requisition_items_item_type_check
    check (char_length(btrim(item_type)) between 1 and 20),
  drop constraint if exists purchase_requisition_items_raw_material_reference_check,
  add constraint purchase_requisition_items_source_reference_check
    check (
      item_type = 'legacy'
      or (raw_material_id is not null and item_master_id is null)
      or (raw_material_id is null and item_master_id is not null)
    );

create index if not exists purchase_requisition_items_item_master_id_idx
  on public.purchase_requisition_items(item_master_id)
  where item_master_id is not null;

create or replace function public.get_purchase_requisition_catalog()
returns table (
  source text, source_id bigint, item_code text, item_name text,
  item_description text, type_code text, type_name text,
  unit_id bigint, unit_name text, unit_symbol text, allows_decimal boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not (public.authorize('pr.view') or public.authorize('pr.create') or public.authorize('pr.edit')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  return query
  select 'raw_material'::text, raw.id, raw.material_code, raw.material_name,
    concat(raw.material_name, ' ', grade.grade_name, ' ', trim(to_char(raw.thickness_mm, 'FM999999990.00')), ' × ', trim(to_char(raw.width_mm, 'FM999999990')), ' × ', trim(to_char(raw.length_mm, 'FM999999990')), ' มม.'),
    item_type.type_code, item_type.type_name, unit.id, unit.unit_name, unit.symbol, unit.allows_decimal
  from public.raw_materials raw
  join public.raw_material_grades grade on grade.id = raw.grade_id
  join public.raw_material_units unit on unit.id = raw.unit_id and unit.status = 'active'
  join public.item_types item_type on item_type.type_code = 'RM' and item_type.status = 'active' and item_type.is_purchasable
  where raw.status = 'active'
  union all
  select 'item_master'::text, master.id, master.item_code, master.item_name,
    coalesce(nullif(btrim(master.description), ''), master.item_name),
    item_type.type_code, item_type.type_name, unit.id, unit.unit_name, unit.symbol, unit.allows_decimal
  from public.item_master master
  join public.item_types item_type on item_type.id = master.item_type_id and item_type.status = 'active' and item_type.is_purchasable
  join public.raw_material_units unit on unit.id = master.unit_id and unit.status = 'active'
  where master.status = 'active'
  order by 6, 3;
end;
$$;

revoke all on function public.get_purchase_requisition_catalog() from public;
grant execute on function public.get_purchase_requisition_catalog() to authenticated;

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
returns table (requisition_id bigint, requisition_number text, requisition_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_name text;
  v_current public.purchase_requisitions%rowtype;
  v_item jsonb;
  v_item_count integer;
  v_item_key text;
  v_line_no integer := 0;
  v_requisition public.purchase_requisitions%rowtype;
  v_seen_keys text[] := array[]::text[];
  v_source text;
  v_source_id bigint;
  v_quantity numeric;
  v_needed_by date;
  v_user_id uuid := (select auth.uid());
  v_raw record;
  v_master record;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_requisition_id is null then
    if not public.authorize('pr.create') then raise exception 'permission_denied' using errcode = '42501'; end if;
  elsif not public.authorize('pr.edit') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_status not in ('draft', 'pending_approval') then raise exception 'invalid_purchase_requisition_status' using errcode = '22023'; end if;
  if p_document_date is null then raise exception 'document_date_required' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_requester_name, ''))) = 0 or length(btrim(coalesce(p_department_name, ''))) = 0 then
    raise exception 'requester_and_department_required' using errcode = '22023';
  end if;
  if char_length(coalesce(p_remarks, '')) > 300 then raise exception 'remarks_too_long' using errcode = '22001'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then
    raise exception 'invalid_purchase_requisition_items' using errcode = '22023';
  end if;
  v_item_count := jsonb_array_length(p_items);
  if p_status = 'pending_approval' and (p_needed_by_date is null or p_needed_by_date < current_date) then
    raise exception 'invalid_needed_by_date' using errcode = '22023';
  end if;
  if p_status = 'pending_approval' and v_item_count = 0 then
    raise exception 'purchase_requisition_items_required' using errcode = '22023';
  end if;

  select coalesce(nullif(concat_ws(' ', profile.first_name, profile.last_name), ''), nullif(app_user.raw_app_meta_data ->> 'full_name', ''), nullif(app_user.email, ''), 'ผู้ใช้งาน ERP')
  into v_actor_name
  from auth.users app_user
  left join public.user_profiles profile on profile.user_id = app_user.id
  where app_user.id = v_user_id;

  if p_requisition_id is null then
    insert into public.purchase_requisitions (pr_number, document_date, requester_name, department_name, needed_by_date, status, remarks, created_by, updated_by)
    values ('', p_document_date, btrim(p_requester_name), btrim(p_department_name), p_needed_by_date, 'draft', nullif(btrim(coalesce(p_remarks, '')), ''), v_user_id, v_user_id)
    returning * into v_requisition;
  else
    select requisition.* into v_current from public.purchase_requisitions requisition where requisition.id = p_requisition_id for update;
    if not found then raise exception 'purchase_requisition_not_found' using errcode = 'P0002'; end if;
    if v_current.status <> 'draft' then raise exception 'purchase_requisition_not_draft:%', v_current.status using errcode = '55000'; end if;
    update public.purchase_requisitions requisition set document_date = p_document_date, requester_name = btrim(p_requester_name), department_name = btrim(p_department_name), needed_by_date = p_needed_by_date, remarks = nullif(btrim(coalesce(p_remarks, '')), ''), updated_by = v_user_id, updated_at = timezone('utc', now()) where requisition.id = p_requisition_id returning * into v_requisition;
    delete from public.purchase_requisition_items where requisition_id = p_requisition_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_line_no := v_line_no + 1;
    v_source := v_item ->> 'source';
    v_source_id := nullif(v_item ->> 'source_id', '')::bigint;
    v_quantity := nullif(v_item ->> 'quantity', '')::numeric;
    v_needed_by := coalesce(nullif(v_item ->> 'needed_by_date', '')::date, p_needed_by_date);
    v_item_key := v_source || ':' || coalesce(v_source_id::text, '');
    if v_source not in ('raw_material', 'item_master') or v_source_id is null or v_source_id <= 0 or v_quantity is null or v_quantity <= 0 or char_length(coalesce(v_item ->> 'remarks', '')) > 255 or (p_status = 'pending_approval' and (v_needed_by is null or v_needed_by < current_date)) then
      raise exception 'invalid_purchase_requisition_item' using errcode = '22023';
    end if;
    if v_item_key = any(v_seen_keys) then raise exception 'duplicate_items_not_allowed' using errcode = '23505'; end if;
    v_seen_keys := array_append(v_seen_keys, v_item_key);

    if v_source = 'raw_material' then
      select raw_material.id, raw_material.material_code, raw_material.material_name, unit.id as unit_id, unit.unit_name, unit.allows_decimal, grade.grade_name, raw_material.thickness_mm, raw_material.width_mm, raw_material.length_mm
      into v_raw
      from public.raw_materials raw_material
      join public.raw_material_units unit on unit.id = raw_material.unit_id and unit.status = 'active'
      join public.raw_material_grades grade on grade.id = raw_material.grade_id
      join public.item_types item_type on item_type.type_code = 'RM' and item_type.status = 'active' and item_type.is_purchasable
      where raw_material.id = v_source_id and raw_material.status = 'active';
      if not found or (not v_raw.allows_decimal and v_quantity <> trunc(v_quantity)) then raise exception 'invalid_purchase_requisition_item' using errcode = '22023'; end if;
      insert into public.purchase_requisition_items (requisition_id, line_no, item_type, raw_material_id, item_master_id, unit_id, item_code, item_name, item_description, quantity, unit_name, needed_by_date, remarks)
      values (v_requisition.id, v_line_no, 'RM', v_raw.id, null, v_raw.unit_id, v_raw.material_code, v_raw.material_name, concat(v_raw.material_name, ' ', v_raw.grade_name, ' ', trim(to_char(v_raw.thickness_mm, 'FM999999990.00')), ' × ', trim(to_char(v_raw.width_mm, 'FM999999990')), ' × ', trim(to_char(v_raw.length_mm, 'FM999999990')), ' มม.'), v_quantity, v_raw.unit_name, v_needed_by, nullif(btrim(coalesce(v_item ->> 'remarks', '')), ''));
    else
      select master.id, master.item_code, master.item_name, master.description, master.unit_id, unit.unit_name, unit.allows_decimal, item_type.type_code
      into v_master
      from public.item_master master
      join public.item_types item_type on item_type.id = master.item_type_id and item_type.status = 'active' and item_type.is_purchasable
      join public.raw_material_units unit on unit.id = master.unit_id and unit.status = 'active'
      where master.id = v_source_id and master.status = 'active';
      if not found or (not v_master.allows_decimal and v_quantity <> trunc(v_quantity)) then raise exception 'invalid_purchase_requisition_item' using errcode = '22023'; end if;
      insert into public.purchase_requisition_items (requisition_id, line_no, item_type, raw_material_id, item_master_id, unit_id, item_code, item_name, item_description, quantity, unit_name, needed_by_date, remarks)
      values (v_requisition.id, v_line_no, v_master.type_code, null, v_master.id, v_master.unit_id, v_master.item_code, v_master.item_name, coalesce(nullif(btrim(v_master.description), ''), v_master.item_name), v_quantity, v_master.unit_name, v_needed_by, nullif(btrim(coalesce(v_item ->> 'remarks', '')), ''));
    end if;
  end loop;

  if p_status = 'pending_approval' then
    perform set_config('app.purchase_requisition_decision', 'allowed', true);
    update public.purchase_requisitions set status = 'pending_approval', submitted_at = timezone('utc', now()), updated_by = v_user_id, updated_at = timezone('utc', now()) where id = v_requisition.id returning * into v_requisition;
    insert into public.purchase_requisition_approval_logs (requisition_id, action, actor_name, actor_user_id) values (v_requisition.id, 'submitted', coalesce(v_actor_name, btrim(p_requester_name)), v_user_id);
  end if;
  return query select v_requisition.id, v_requisition.pr_number, v_requisition.status;
end;
$$;

revoke all on function public.save_purchase_requisition(bigint, date, date, text, text, text, text, jsonb) from public;
grant execute on function public.save_purchase_requisition(bigint, date, date, text, text, text, text, jsonb) to authenticated;
