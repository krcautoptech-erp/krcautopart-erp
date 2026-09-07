create table if not exists public.web_push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text null,
  status text not null default 'active',
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint web_push_subscriptions_endpoint_check
    check (endpoint like 'https://%' and char_length(endpoint) <= 2048),
  constraint web_push_subscriptions_p256dh_check
    check (char_length(p256dh_key) between 32 and 255),
  constraint web_push_subscriptions_auth_check
    check (char_length(auth_key) between 16 and 255),
  constraint web_push_subscriptions_status_check
    check (status in ('active', 'inactive'))
);

create index if not exists web_push_subscriptions_user_active_idx
  on public.web_push_subscriptions (user_id, updated_at desc)
  where status = 'active';

alter table public.web_push_subscriptions enable row level security;

drop policy if exists "Users can view their Web Push subscriptions"
  on public.web_push_subscriptions;
create policy "Users can view their Web Push subscriptions"
on public.web_push_subscriptions
for select
to authenticated
using (user_id = (select auth.uid()));

revoke all on public.web_push_subscriptions from anon, authenticated;
grant select on public.web_push_subscriptions to authenticated;

create or replace function public.register_web_push_subscription(
  p_endpoint text,
  p_p256dh_key text,
  p_auth_key text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_endpoint not like 'https://%'
    or char_length(p_endpoint) > 2048
    or char_length(p_p256dh_key) not between 32 and 255
    or char_length(p_auth_key) not between 16 and 255
  then
    raise exception 'invalid_web_push_subscription' using errcode = '22023';
  end if;

  insert into public.web_push_subscriptions (
    user_id,
    endpoint,
    p256dh_key,
    auth_key,
    user_agent,
    status,
    last_seen_at,
    updated_at
  )
  values (
    v_user_id,
    p_endpoint,
    p_p256dh_key,
    p_auth_key,
    nullif(left(p_user_agent, 500), ''),
    'active',
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (endpoint)
  do update set
    user_id = excluded.user_id,
    p256dh_key = excluded.p256dh_key,
    auth_key = excluded.auth_key,
    user_agent = excluded.user_agent,
    status = 'active',
    last_seen_at = timezone('utc', now()),
    updated_at = timezone('utc', now());
end;
$$;

create or replace function public.deactivate_web_push_subscription(
  p_endpoint text
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.web_push_subscriptions
  set
    status = 'inactive',
    updated_at = timezone('utc', now())
  where user_id = (select auth.uid())
    and endpoint = p_endpoint;
$$;

create or replace function public.get_purchase_requisition_push_targets(
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
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
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
  where notification.notification_type = 'purchase_requisition'
    and notification.entity_id = p_entity_id
    and notification.event_key = lower(btrim(p_event_key))
    and notification.created_by = v_user_id;
end;
$$;

create or replace function public.report_invalid_web_push_subscription(
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
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if p_status_code not in (404, 410) then
    raise exception 'invalid_push_status_code' using errcode = '22023';
  end if;

  update public.web_push_subscriptions
  set
    status = 'inactive',
    updated_at = timezone('utc', now())
  where id = p_subscription_id
    and exists (
      select 1
      from public.notifications notification
      join public.notification_recipients recipient
        on recipient.notification_id = notification.id
      where notification.notification_type = 'purchase_requisition'
        and notification.entity_id = p_entity_id
        and notification.event_key = lower(btrim(p_event_key))
        and notification.created_by = (select auth.uid())
        and recipient.recipient_user_id = web_push_subscriptions.user_id
    );
end;
$$;

revoke all on function public.register_web_push_subscription(text, text, text, text)
  from public;
revoke all on function public.deactivate_web_push_subscription(text)
  from public;
revoke all on function public.get_purchase_requisition_push_targets(bigint, text)
  from public;
revoke all on function public.report_invalid_web_push_subscription(bigint, bigint, text, integer)
  from public;

grant execute on function public.register_web_push_subscription(text, text, text, text)
  to authenticated;
grant execute on function public.deactivate_web_push_subscription(text)
  to authenticated;
grant execute on function public.get_purchase_requisition_push_targets(bigint, text)
  to authenticated;
grant execute on function public.report_invalid_web_push_subscription(bigint, bigint, text, integer)
  to authenticated;
