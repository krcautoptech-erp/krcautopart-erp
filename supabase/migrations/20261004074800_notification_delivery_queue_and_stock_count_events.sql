-- Reliable Web Push delivery queue and the first operational notification
-- workflow outside purchasing: stock-count assignments and decisions.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (notification_type in (
    'purchase_requisition', 'purchase_order', 'goods_receipt', 'stock_count'
  ));

alter table public.notifications drop constraint if exists notifications_event_key_check;
alter table public.notifications add constraint notifications_event_key_check
  check (event_key in (
    'assigned', 'submitted', 'approved', 'rejected', 'cancelled'
  ));

create unique index if not exists notifications_stock_count_event_idx
  on public.notifications (notification_type, entity_id, event_key)
  where notification_type = 'stock_count' and entity_id is not null;

create table if not exists public.notification_push_deliveries (
  id bigint generated always as identity primary key,
  notification_id bigint not null references public.notifications (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  subscription_id bigint not null references public.web_push_subscriptions (id) on delete cascade,
  status text not null default 'queued',
  attempts smallint not null default 0,
  available_at timestamptz not null default timezone('utc', now()),
  last_attempt_at timestamptz null,
  delivered_at timestamptz null,
  last_status_code integer null,
  last_error text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint notification_push_deliveries_status_check
    check (status in ('queued', 'sending', 'retry', 'delivered', 'failed')),
  constraint notification_push_deliveries_attempts_check
    check (attempts between 0 and 20),
  constraint notification_push_deliveries_error_check
    check (last_error is null or char_length(last_error) <= 500),
  unique (notification_id, subscription_id)
);

create index if not exists notification_push_deliveries_ready_idx
  on public.notification_push_deliveries (available_at, id)
  where status in ('queued', 'retry');

create index if not exists notification_push_deliveries_recipient_idx
  on public.notification_push_deliveries (recipient_user_id, created_at desc);

alter table public.notification_push_deliveries enable row level security;
revoke all on public.notification_push_deliveries from anon, authenticated;

create or replace function private.queue_notification_push_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.read_at is not null then return new; end if;

  insert into public.notification_push_deliveries (
    notification_id, recipient_user_id, subscription_id, status,
    attempts, available_at, delivered_at, last_status_code, last_error, updated_at
  )
  select new.notification_id, new.recipient_user_id, subscription.id,
    'queued', 0, timezone('utc', now()), null, null, null, timezone('utc', now())
  from public.web_push_subscriptions subscription
  where subscription.user_id = new.recipient_user_id
    and subscription.status = 'active'
  on conflict (notification_id, subscription_id) do update set
    recipient_user_id = excluded.recipient_user_id,
    status = 'queued', attempts = 0, available_at = timezone('utc', now()),
    last_attempt_at = null, delivered_at = null, last_status_code = null,
    last_error = null, updated_at = timezone('utc', now());
  return new;
end;
$$;

revoke all on function private.queue_notification_push_delivery()
  from public, anon, authenticated;

drop trigger if exists notification_recipients_queue_push
  on public.notification_recipients;
create trigger notification_recipients_queue_push
after insert or update of read_at, created_at on public.notification_recipients
for each row
when (new.read_at is null)
execute function private.queue_notification_push_delivery();

create or replace function public.claim_own_web_push_deliveries(
  p_notification_type text,
  p_entity_id bigint,
  p_event_key text,
  p_limit integer default 50
)
returns table (
  delivery_id bigint,
  notification_id bigint,
  subscription_id bigint,
  title text,
  message text,
  action_url text,
  endpoint text,
  p256dh_key text,
  auth_key text,
  event_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  return query
  with candidates as (
    select delivery.id
    from public.notification_push_deliveries delivery
    join public.notifications notification on notification.id = delivery.notification_id
    join public.web_push_subscriptions subscription
      on subscription.id = delivery.subscription_id and subscription.status = 'active'
    where notification.notification_type = lower(btrim(p_notification_type))
      and notification.entity_id = p_entity_id
      and notification.event_key = lower(btrim(p_event_key))
      and notification.created_by = v_user_id
      and (
        (delivery.status in ('queued', 'retry') and delivery.available_at <= timezone('utc', now()))
        or (delivery.status = 'sending' and delivery.last_attempt_at < timezone('utc', now()) - interval '10 minutes')
      )
    order by delivery.id
    for update of delivery skip locked
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ), claimed as (
    update public.notification_push_deliveries delivery
    set status = 'sending', attempts = delivery.attempts + 1,
      last_attempt_at = timezone('utc', now()), updated_at = timezone('utc', now())
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  )
  select claimed.id, notification.id, subscription.id,
    notification.title, notification.message, notification.action_url,
    subscription.endpoint, subscription.p256dh_key, subscription.auth_key,
    notification.event_key
  from claimed
  join public.notifications notification on notification.id = claimed.notification_id
  join public.web_push_subscriptions subscription on subscription.id = claimed.subscription_id
  where subscription.status = 'active';
end;
$$;

create or replace function public.complete_own_web_push_delivery(
  p_delivery_id bigint,
  p_success boolean,
  p_status_code integer default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_attempts integer;
  v_subscription_id bigint;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select delivery.attempts, delivery.subscription_id
  into v_attempts, v_subscription_id
  from public.notification_push_deliveries delivery
  join public.notifications notification on notification.id = delivery.notification_id
  where delivery.id = p_delivery_id and notification.created_by = v_user_id
  for update of delivery;
  if not found then raise exception 'push_delivery_not_found' using errcode = 'P0002'; end if;

  if p_status_code in (404, 410) then
    update public.web_push_subscriptions
    set status = 'inactive', updated_at = timezone('utc', now())
    where id = v_subscription_id;
    update public.notification_push_deliveries
    set status = 'failed', last_status_code = p_status_code,
      last_error = 'push_subscription_expired', updated_at = timezone('utc', now())
    where subscription_id = v_subscription_id and status in ('queued', 'retry', 'sending');
  end if;

  update public.notification_push_deliveries
  set status = case
      when p_success then 'delivered'
      when p_status_code in (404, 410) or v_attempts >= 5 then 'failed'
      else 'retry'
    end,
    available_at = case
      when p_success or p_status_code in (404, 410) or v_attempts >= 5 then available_at
      else timezone('utc', now()) + case v_attempts
        when 1 then interval '1 minute'
        when 2 then interval '5 minutes'
        when 3 then interval '15 minutes'
        else interval '1 hour'
      end
    end,
    delivered_at = case when p_success then timezone('utc', now()) else null end,
    last_status_code = p_status_code,
    last_error = case when p_success then null else left(coalesce(p_error, 'push_delivery_failed'), 500) end,
    updated_at = timezone('utc', now())
  where id = p_delivery_id;
end;
$$;

revoke all on function public.claim_own_web_push_deliveries(text, bigint, text, integer)
  from public, anon, authenticated;
revoke all on function public.complete_own_web_push_delivery(bigint, boolean, integer, text)
  from public, anon, authenticated;

-- Retire the earlier browser-callable target lookup. Push endpoints and keys
-- are server credentials and must never be returned to authenticated clients.
revoke all on function public.get_document_push_targets(text, bigint, text)
  from public, anon, authenticated;
revoke all on function public.report_invalid_document_push_subscription(
  text, bigint, bigint, text, integer
) from public, anon, authenticated;

-- The scheduled worker uses the service role. These functions are not exposed
-- to browser sessions, even though the tables live in the public schema.
create or replace function public.claim_web_push_deliveries(p_limit integer default 50)
returns table (
  delivery_id bigint,
  notification_id bigint,
  subscription_id bigint,
  title text,
  message text,
  action_url text,
  endpoint text,
  p256dh_key text,
  auth_key text,
  event_key text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with candidates as (
    select delivery.id
    from public.notification_push_deliveries delivery
    join public.web_push_subscriptions subscription
      on subscription.id = delivery.subscription_id and subscription.status = 'active'
    where (
      (delivery.status in ('queued', 'retry') and delivery.available_at <= timezone('utc', now()))
      or (delivery.status = 'sending' and delivery.last_attempt_at < timezone('utc', now()) - interval '10 minutes')
    )
    order by delivery.available_at, delivery.id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ), claimed as (
    update public.notification_push_deliveries delivery
    set status = 'sending', attempts = delivery.attempts + 1,
      last_attempt_at = timezone('utc', now()), updated_at = timezone('utc', now())
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  )
  select claimed.id, notification.id, subscription.id,
    notification.title, notification.message, notification.action_url,
    subscription.endpoint, subscription.p256dh_key, subscription.auth_key,
    notification.event_key
  from claimed
  join public.notifications notification on notification.id = claimed.notification_id
  join public.web_push_subscriptions subscription on subscription.id = claimed.subscription_id
  where subscription.status = 'active';
end;
$$;

create or replace function public.complete_web_push_delivery(
  p_delivery_id bigint,
  p_success boolean,
  p_status_code integer default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_subscription_id bigint;
begin
  select attempts, subscription_id into v_attempts, v_subscription_id
  from public.notification_push_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'push_delivery_not_found' using errcode = 'P0002'; end if;

  if p_status_code in (404, 410) then
    update public.web_push_subscriptions
    set status = 'inactive', updated_at = timezone('utc', now())
    where id = v_subscription_id;
    update public.notification_push_deliveries
    set status = 'failed', last_status_code = p_status_code,
      last_error = 'push_subscription_expired', updated_at = timezone('utc', now())
    where subscription_id = v_subscription_id and status in ('queued', 'retry', 'sending');
  end if;

  update public.notification_push_deliveries
  set status = case
      when p_success then 'delivered'
      when p_status_code in (404, 410) or v_attempts >= 5 then 'failed'
      else 'retry'
    end,
    available_at = case
      when p_success or p_status_code in (404, 410) or v_attempts >= 5 then available_at
      else timezone('utc', now()) + case v_attempts
        when 1 then interval '1 minute'
        when 2 then interval '5 minutes'
        when 3 then interval '15 minutes'
        else interval '1 hour'
      end
    end,
    delivered_at = case when p_success then timezone('utc', now()) else null end,
    last_status_code = p_status_code,
    last_error = case when p_success then null else left(coalesce(p_error, 'push_delivery_failed'), 500) end,
    updated_at = timezone('utc', now())
  where id = p_delivery_id;
end;
$$;

revoke all on function public.claim_web_push_deliveries(integer)
  from public, anon, authenticated;
revoke all on function public.complete_web_push_delivery(bigint, boolean, integer, text)
  from public, anon, authenticated;
grant execute on function public.claim_web_push_deliveries(integer) to service_role;
grant execute on function public.complete_web_push_delivery(bigint, boolean, integer, text)
  to service_role;

create index if not exists notifications_created_at_retention_idx
  on public.notifications (created_at, id);

create or replace function public.prune_notification_delivery_history()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notification_push_deliveries
  where status in ('delivered', 'failed')
    and updated_at < timezone('utc', now()) - interval '30 days';

  delete from public.notifications
  where created_at < timezone('utc', now()) - interval '90 days';
end;
$$;

revoke all on function public.prune_notification_delivery_history()
  from public, anon, authenticated;
grant execute on function public.prune_notification_delivery_history() to service_role;

create or replace function private.notify_stock_count_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_event_key text;
  v_notification_id bigint;
  v_title text;
  v_message text;
begin
  if tg_op = 'INSERT' then
    v_event_key := 'assigned';
    v_actor_id := new.created_by;
    v_title := 'ได้รับมอบหมายรอบตรวจนับ ' || new.count_number;
    v_message := 'คลัง ' || new.warehouse_name || ' วันที่ ' || to_char(new.document_date, 'DD/MM/YYYY');
  elsif old.status is not distinct from new.status then
    return new;
  elsif new.status = 'review' then
    v_event_key := 'submitted';
    v_actor_id := new.submitted_by;
    v_title := 'รอบตรวจนับรอตรวจสอบ ' || new.count_number;
    v_message := 'ผู้ตรวจนับส่งผลของคลัง ' || new.warehouse_name || ' แล้ว';
  elsif new.status = 'recount' then
    v_event_key := 'rejected';
    v_actor_id := new.returned_by;
    v_title := 'รอบตรวจนับถูกส่งกลับ ' || new.count_number;
    v_message := coalesce(nullif(new.return_reason, ''), 'กรุณาตรวจนับและส่งผลใหม่');
  elsif new.status = 'approved' then
    v_event_key := 'approved';
    v_actor_id := new.approved_by;
    v_title := 'อนุมัติรอบตรวจนับ ' || new.count_number;
    v_message := 'ผลตรวจนับคลัง ' || new.warehouse_name || ' ได้รับการอนุมัติแล้ว';
  elsif new.status = 'cancelled' then
    v_event_key := 'cancelled';
    v_actor_id := new.cancelled_by;
    v_title := 'ยกเลิกรอบตรวจนับ ' || new.count_number;
    v_message := coalesce(nullif(new.cancellation_reason, ''), 'รอบตรวจนับถูกยกเลิก');
  else
    return new;
  end if;

  insert into public.notifications (
    notification_type, event_key, title, message, entity_type,
    entity_id, action_url, created_by
  ) values (
    'stock_count', v_event_key, v_title, v_message, 'stock_count',
    new.id, '/inventory/stock-counts/' || new.id, v_actor_id
  )
  on conflict (notification_type, entity_id, event_key)
    where notification_type = 'stock_count' and entity_id is not null
  do update set title = excluded.title, message = excluded.message,
    action_url = excluded.action_url, created_by = excluded.created_by,
    created_at = timezone('utc', now())
  returning id into v_notification_id;

  if v_event_key = 'submitted' then
    insert into public.notification_recipients (notification_id, recipient_user_id)
    select distinct v_notification_id, app_user.id
    from auth.users app_user
    left join public.user_profiles profile on profile.user_id = app_user.id
    left join public.user_roles user_role on user_role.user_id = app_user.id
    left join public.app_roles role on role.id = user_role.role_id and role.status = 'active'
    left join public.app_permissions permission
      on permission.permission_code = 'stock_count.review' and permission.status = 'active'
    left join public.role_permissions role_permission
      on role_permission.role_id = role.id and role_permission.permission_id = permission.id
    where coalesce(profile.status, 'active') = 'active'
      and app_user.id is distinct from v_actor_id
      and (lower(app_user.raw_app_meta_data ->> 'role') = 'owner'
        or role_permission.permission_id is not null)
    on conflict (notification_id, recipient_user_id) do update
      set read_at = null, created_at = timezone('utc', now());
  else
    insert into public.notification_recipients (notification_id, recipient_user_id)
    select v_notification_id, recipient_id
    from (
      values (new.assigned_to),
        (case when v_event_key in ('approved', 'cancelled') then new.created_by end)
    ) recipient(recipient_id)
    where recipient_id is not null and recipient_id is distinct from v_actor_id
    on conflict (notification_id, recipient_user_id) do update
      set read_at = null, created_at = timezone('utc', now());
  end if;
  return new;
end;
$$;

revoke all on function private.notify_stock_count_workflow()
  from public, anon, authenticated;

drop trigger if exists stock_count_workflow_notification on public.stock_counts;
create trigger stock_count_workflow_notification
after insert or update of status on public.stock_counts
for each row execute function private.notify_stock_count_workflow();

drop policy if exists "Recipients can view notifications" on public.notifications;
create policy "Recipients can view notifications" on public.notifications
for select to authenticated using (
  exists (
    select 1 from public.notification_recipients recipient
    where recipient.notification_id = notifications.id
      and recipient.recipient_user_id = (select auth.uid())
  ) and case notification_type
    when 'purchase_requisition' then (select public.authorize('pr.view'))
      and (event_key <> 'submitted' or (select public.authorize('pr.approve')))
    when 'purchase_order' then (select public.authorize('po.view'))
      and (event_key <> 'submitted' or (select public.authorize('po.approve')))
    when 'goods_receipt' then (select public.authorize('po.view'))
    when 'stock_count' then (select public.authorize('stock_count.view'))
      and (event_key <> 'submitted' or (select public.authorize('stock_count.review')))
    else false
  end
);

notify pgrst, 'reload schema';
