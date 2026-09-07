alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (notification_type in ('purchase_requisition', 'purchase_order'));

create unique index if not exists notifications_purchase_order_event_idx
  on public.notifications (notification_type, entity_id, event_key)
  where notification_type = 'purchase_order'
    and entity_id is not null;

create or replace function private.notify_purchase_order_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notification_id bigint;
  v_order public.purchase_orders%rowtype;
begin
  if new.to_status <> 'pending_approval' then
    return new;
  end if;

  select purchase_order.*
  into v_order
  from public.purchase_orders purchase_order
  where purchase_order.id = new.purchase_order_id;

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
    'purchase_order',
    'submitted',
    concat('ใบสั่งซื้อ ', v_order.po_number),
    concat(
      'สร้างโดย ',
      v_order.buyer_name,
      ' จำนวน ',
      v_order.item_count,
      ' รายการ และกำลังรออนุมัติ'
    ),
    'purchase_order',
    v_order.id,
    concat('/purchase/po?po=', v_order.id),
    v_order.created_by
  )
  on conflict (notification_type, entity_id, event_key)
    where notification_type = 'purchase_order'
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
    user_role.user_id
  from public.user_roles user_role
  join public.app_roles role
    on role.id = user_role.role_id
    and role.is_owner
    and role.status = 'active'
  left join public.user_profiles profile
    on profile.user_id = user_role.user_id
  where user_role.user_id is distinct from v_order.created_by
    and coalesce(profile.status, 'active') = 'active'
  on conflict (notification_id, recipient_user_id)
  do update set
    read_at = null,
    created_at = timezone('utc', now());

  return new;
end;
$$;

revoke all on function private.notify_purchase_order_submitted() from public;

drop trigger if exists purchase_order_submitted_notification
  on public.purchase_order_status_logs;
create trigger purchase_order_submitted_notification
after insert on public.purchase_order_status_logs
for each row
when (new.to_status = 'pending_approval')
execute function private.notify_purchase_order_submitted();

create or replace function public.decide_purchase_order(
  p_purchase_order_id bigint,
  p_decision text,
  p_note text default null
)
returns table (
  decision_status text,
  purchase_order_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_name text;
  v_decision text := lower(btrim(p_decision));
  v_note text := nullif(btrim(p_note), '');
  v_notification_id bigint;
  v_order public.purchase_orders%rowtype;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if v_decision not in ('approved', 'rejected') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  if v_decision = 'rejected' and v_note is null then
    raise exception 'rejection_note_required' using errcode = '22023';
  end if;

  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'decision_note_too_long' using errcode = '22001';
  end if;

  if not exists (
    select 1
    from public.user_roles user_role
    join public.app_roles role
      on role.id = user_role.role_id
      and role.is_owner
      and role.status = 'active'
    left join public.user_profiles profile
      on profile.user_id = user_role.user_id
    where user_role.user_id = v_user_id
      and coalesce(profile.status, 'active') = 'active'
  ) then
    raise exception 'owner_approval_required' using errcode = '42501';
  end if;

  if not public.authorize(
    case
      when v_decision = 'approved' then 'po.approve'
      else 'po.reject'
    end
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select purchase_order.*
  into v_order
  from public.purchase_orders purchase_order
  where purchase_order.id = p_purchase_order_id
  for update;

  if not found then
    raise exception 'purchase_order_not_found' using errcode = 'P0002';
  end if;

  if v_order.status <> 'pending_approval' then
    raise exception 'purchase_order_already_decided' using errcode = '55000';
  end if;

  select nullif(
    concat_ws(' ', profile.first_name, profile.last_name),
    ''
  )
  into v_actor_name
  from public.user_profiles profile
  where profile.user_id = v_user_id;

  if v_actor_name is null then
    select coalesce(
      nullif(app_user.raw_app_meta_data ->> 'full_name', ''),
      nullif(app_user.raw_user_meta_data ->> 'full_name', ''),
      nullif(app_user.email, ''),
      'OWNER'
    )
    into v_actor_name
    from auth.users app_user
    where app_user.id = v_user_id;
  end if;

  update public.purchase_orders
  set
    status = v_decision,
    approved_at = case
      when v_decision = 'approved' then timezone('utc', now())
      else null
    end,
    updated_by = v_user_id,
    updated_at = timezone('utc', now())
  where id = v_order.id;

  insert into public.purchase_order_status_logs (
    purchase_order_id,
    from_status,
    to_status,
    actor_user_id,
    actor_name,
    note
  )
  values (
    v_order.id,
    v_order.status,
    v_decision,
    v_user_id,
    v_actor_name,
    v_note
  );

  if v_order.created_by is not null then
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
      'purchase_order',
      v_decision,
      concat(
        case
          when v_decision = 'approved' then 'อนุมัติใบสั่งซื้อ '
          else 'ปฏิเสธใบสั่งซื้อ '
        end,
        v_order.po_number
      ),
      concat(
        case
          when v_decision = 'approved' then 'ใบสั่งซื้อได้รับการอนุมัติโดย '
          else 'ใบสั่งซื้อถูกปฏิเสธโดย '
        end,
        v_actor_name,
        case
          when v_note is not null then concat(' หมายเหตุ: ', v_note)
          else ''
        end
      ),
      'purchase_order',
      v_order.id,
      concat('/purchase/po?po=', v_order.id),
      v_user_id
    )
    on conflict (notification_type, entity_id, event_key)
      where notification_type = 'purchase_order'
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
    values (v_notification_id, v_order.created_by)
    on conflict (notification_id, recipient_user_id)
    do update set
      read_at = null,
      created_at = timezone('utc', now());
  end if;

  update public.notification_recipients recipient
  set read_at = coalesce(recipient.read_at, timezone('utc', now()))
  from public.notifications notification
  where recipient.notification_id = notification.id
    and recipient.recipient_user_id = v_user_id
    and notification.notification_type = 'purchase_order'
    and notification.entity_id = v_order.id
    and notification.event_key = 'submitted';

  return query
  select v_decision, v_order.po_number;
end;
$$;

revoke all on function public.decide_purchase_order(bigint, text, text)
  from public;
grant execute on function public.decide_purchase_order(bigint, text, text)
  to authenticated;

create or replace function public.get_document_push_targets(
  p_notification_type text,
  p_entity_id bigint,
  p_event_key text
)
returns table (
  notification_id bigint,
  subscription_id bigint,
  title text,
  message text,
  action_url text,
  endpoint text,
  p256dh_key text,
  auth_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := lower(btrim(p_notification_type));
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if v_type not in ('purchase_requisition', 'purchase_order') then
    raise exception 'invalid_notification_type' using errcode = '22023';
  end if;

  return query
  select
    notification.id,
    subscription.id,
    notification.title,
    notification.message,
    notification.action_url,
    subscription.endpoint,
    subscription.p256dh_key,
    subscription.auth_key
  from public.notifications notification
  join public.notification_recipients recipient
    on recipient.notification_id = notification.id
  join public.web_push_subscriptions subscription
    on subscription.user_id = recipient.recipient_user_id
    and subscription.status = 'active'
  where notification.notification_type = v_type
    and notification.entity_id = p_entity_id
    and notification.event_key = lower(btrim(p_event_key))
    and notification.created_by = v_user_id;
end;
$$;

create or replace function public.report_invalid_document_push_subscription(
  p_notification_type text,
  p_subscription_id bigint,
  p_entity_id bigint,
  p_event_key text,
  p_status_code integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := lower(btrim(p_notification_type));
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if v_type not in ('purchase_requisition', 'purchase_order') then
    raise exception 'invalid_notification_type' using errcode = '22023';
  end if;

  if p_status_code not in (404, 410) then
    raise exception 'invalid_push_status_code' using errcode = '22023';
  end if;

  update public.web_push_subscriptions subscription
  set
    status = 'inactive',
    updated_at = timezone('utc', now())
  where subscription.id = p_subscription_id
    and exists (
      select 1
      from public.notifications notification
      join public.notification_recipients recipient
        on recipient.notification_id = notification.id
      where notification.notification_type = v_type
        and notification.entity_id = p_entity_id
        and notification.event_key = lower(btrim(p_event_key))
        and notification.created_by = (select auth.uid())
        and recipient.recipient_user_id = subscription.user_id
    );
end;
$$;

revoke all on function public.get_document_push_targets(text, bigint, text)
  from public;
revoke all on function public.report_invalid_document_push_subscription(
  text, bigint, bigint, text, integer
) from public;

grant execute on function public.get_document_push_targets(text, bigint, text)
  to authenticated;
grant execute on function public.report_invalid_document_push_subscription(
  text, bigint, bigint, text, integer
) to authenticated;
