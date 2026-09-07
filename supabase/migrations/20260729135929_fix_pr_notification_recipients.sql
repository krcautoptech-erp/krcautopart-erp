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

  if not found then
    return new;
  end if;

  insert into public.notifications (
    notification_type,
    event_key,
    title,
    message,
    entity_type,
    entity_id,
    action_url,
    created_by
  )
  values (
    'purchase_requisition',
    'submitted',
    concat('ใบขอซื้อ ', v_requisition.pr_number),
    concat(
      'สร้างโดย ',
      v_requisition.requester_name,
      ' จำนวน ',
      v_requisition.requested_item_count,
      ' รายการ และกำลังรออนุมัติ'
    ),
    'purchase_requisition',
    v_requisition.id,
    concat('/purchase/pr?pr=', v_requisition.id),
    v_requisition.created_by
  )
  on conflict (notification_type, entity_id, event_key)
    where notification_type = 'purchase_requisition'
      and entity_id is not null
  do update set
    title = excluded.title,
    message = excluded.message,
    action_url = excluded.action_url,
    created_by = excluded.created_by,
    created_at = timezone('utc', now())
  returning id into v_notification_id;

  insert into public.notification_recipients (
    notification_id,
    recipient_user_id
  )
  select
    v_notification_id,
    recipient.user_id
  from (
    select v_requisition.created_by as user_id
    union
    select user_role.user_id
    from public.user_roles user_role
    join public.app_roles role
      on role.id = user_role.role_id
      and role.is_owner
      and role.status = 'active'
    left join public.user_profiles profile
      on profile.user_id = user_role.user_id
    where coalesce(profile.status, 'active') = 'active'
  ) recipient
  where recipient.user_id is not null
  on conflict (notification_id, recipient_user_id)
  do update set
    read_at = null,
    created_at = timezone('utc', now());

  return new;
end;
$$;

revoke all on function private.notify_purchase_requisition_created()
  from public;

insert into public.notification_recipients (
  notification_id,
  recipient_user_id
)
select
  notification.id,
  requisition.created_by
from public.notifications notification
join public.purchase_requisitions requisition
  on requisition.id = notification.entity_id
where notification.notification_type = 'purchase_requisition'
  and notification.event_key = 'submitted'
  and requisition.created_by is not null
on conflict (notification_id, recipient_user_id) do nothing;

insert into public.notification_recipients (
  notification_id,
  recipient_user_id
)
select
  notification.id,
  user_role.user_id
from public.notifications notification
join public.purchase_requisitions requisition
  on requisition.id = notification.entity_id
cross join public.user_roles user_role
join public.app_roles role
  on role.id = user_role.role_id
  and role.is_owner
  and role.status = 'active'
left join public.user_profiles profile
  on profile.user_id = user_role.user_id
where notification.notification_type = 'purchase_requisition'
  and notification.event_key = 'submitted'
  and requisition.status = 'pending_approval'
  and coalesce(profile.status, 'active') = 'active'
on conflict (notification_id, recipient_user_id) do nothing;
