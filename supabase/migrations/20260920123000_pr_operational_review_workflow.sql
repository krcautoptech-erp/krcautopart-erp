-- PR is an operational request reviewed by Purchasing. Financial approval remains on PO.
update public.app_permissions
set
  permission_name = case permission_code
    when 'pr.approve' then 'ตรวจสอบใบขอซื้อให้พร้อมออก PO'
    when 'pr.reject' then 'ส่งใบขอซื้อกลับแก้ไข'
  end,
  updated_at = timezone('utc', now())
where permission_code in ('pr.approve', 'pr.reject');

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
join public.app_permissions permission
  on permission.permission_code in ('pr.approve', 'pr.reject')
where role.role_code in ('ADMIN', 'MANAGER')
on conflict do nothing;

create or replace function private.notify_purchase_requisition_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notification_id bigint;
  v_requisition public.purchase_requisitions%rowtype;
begin
  select requisition.*
  into v_requisition
  from public.purchase_requisitions requisition
  where requisition.id = new.requisition_id;

  if not found then return new; end if;

  insert into public.notifications (
    notification_type, event_key, title, message, entity_type,
    entity_id, action_url, created_by
  )
  values (
    'purchase_requisition',
    'submitted',
    concat('ใบขอซื้อ ', v_requisition.pr_number),
    concat(
      'สร้างโดย ', v_requisition.requester_name,
      ' จำนวน ', v_requisition.requested_item_count,
      ' รายการ และกำลังรอฝ่ายจัดซื้อตรวจสอบ'
    ),
    'purchase_requisition',
    v_requisition.id,
    concat('/purchase/pr?pr=', v_requisition.id),
    v_requisition.created_by
  )
  on conflict (notification_type, entity_id, event_key)
    where notification_type = 'purchase_requisition' and entity_id is not null
  do update set
    title = excluded.title,
    message = excluded.message,
    action_url = excluded.action_url,
    created_by = excluded.created_by,
    created_at = timezone('utc', now())
  returning id into v_notification_id;

  insert into public.notification_recipients (notification_id, recipient_user_id)
  select v_notification_id, recipient.user_id
  from (
    select v_requisition.created_by as user_id
    union
    select user_role.user_id
    from public.user_roles user_role
    join public.app_roles role
      on role.id = user_role.role_id
     and role.status = 'active'
     and not role.is_owner
    join public.role_permissions role_permission
      on role_permission.role_id = role.id
    join public.app_permissions permission
      on permission.id = role_permission.permission_id
     and permission.permission_code = 'pr.approve'
     and permission.status = 'active'
    left join public.user_profiles profile
      on profile.user_id = user_role.user_id
    where coalesce(profile.status, 'active') = 'active'
  ) recipient
  where recipient.user_id is not null
  on conflict (notification_id, recipient_user_id)
  do update set read_at = null, created_at = timezone('utc', now());

  return new;
end;
$$;

revoke all on function private.notify_purchase_requisition_created() from public;

create or replace function public.save_purchase_requisition_operational(
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
  v_status text;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_requisition_id is not null then
    select requisition.status
    into v_status
    from public.purchase_requisitions requisition
    where requisition.id = p_requisition_id
    for update;

    if not found then
      raise exception 'purchase_requisition_not_found' using errcode = 'P0002';
    end if;

    if v_status = 'rejected' then
      if not public.authorize('pr.edit') then
        raise exception 'permission_denied' using errcode = '42501';
      end if;
      perform set_config('app.purchase_requisition_decision', 'allowed', true);
      update public.purchase_requisitions
      set status = 'draft', rejected_at = null, updated_by = v_user_id,
          updated_at = timezone('utc', now())
      where id = p_requisition_id;
    end if;
  end if;

  return query
  select saved.requisition_id, saved.requisition_number, saved.requisition_status
  from public.save_purchase_requisition(
    p_requisition_id, p_document_date, p_needed_by_date, p_requester_name,
    p_department_name, p_remarks, p_status, p_items
  ) saved;
end;
$$;

revoke all on function public.save_purchase_requisition_operational(
  bigint, date, date, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.save_purchase_requisition_operational(
  bigint, date, date, text, text, text, text, jsonb
) to authenticated;

create or replace function public.review_purchase_requisition(
  p_requisition_id bigint,
  p_outcome text,
  p_note text default null
)
returns table (review_outcome text, requisition_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outcome text := lower(btrim(p_outcome));
  v_internal_decision text;
begin
  if v_outcome not in ('ready_for_po', 'returned') then
    raise exception 'invalid_review_outcome' using errcode = '22023';
  end if;

  v_internal_decision := case
    when v_outcome = 'ready_for_po' then 'approved'
    else 'rejected'
  end;

  return query
  select v_outcome, decided.requisition_number
  from public.decide_purchase_requisition(
    p_requisition_id, v_internal_decision, p_note
  ) decided;

  update public.notifications notification
  set
    title = case v_outcome
      when 'ready_for_po' then replace(notification.title, 'อนุมัติใบขอซื้อ', 'ใบขอซื้อพร้อมออก PO')
      else replace(notification.title, 'ปฏิเสธใบขอซื้อ', 'ส่งกลับแก้ไขใบขอซื้อ')
    end,
    message = case v_outcome
      when 'ready_for_po' then replace(notification.message, 'ใบขอซื้อได้รับการอนุมัติโดย', 'ฝ่ายจัดซื้อตรวจสอบแล้ว พร้อมออก PO โดย')
      else replace(notification.message, 'ใบขอซื้อถูกปฏิเสธโดย', 'ใบขอซื้อถูกส่งกลับแก้ไขโดย')
    end
  where notification.notification_type = 'purchase_requisition'
    and notification.entity_id = p_requisition_id
    and notification.event_key = v_internal_decision;
end;
$$;

revoke all on function public.review_purchase_requisition(bigint, text, text)
  from public, anon;
grant execute on function public.review_purchase_requisition(bigint, text, text)
  to authenticated;
