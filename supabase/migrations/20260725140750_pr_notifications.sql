create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  notification_type text not null,
  title text not null,
  message text not null,
  entity_type text null,
  entity_id bigint null,
  action_url text null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint notifications_type_check
    check (notification_type in ('purchase_requisition')),
  constraint notifications_title_check
    check (char_length(btrim(title)) between 1 and 160),
  constraint notifications_message_check
    check (char_length(btrim(message)) between 1 and 500),
  constraint notifications_action_url_check
    check (action_url is null or action_url like '/%')
);

create table if not exists public.notification_recipients (
  notification_id bigint not null
    references public.notifications (id) on delete cascade,
  recipient_user_id uuid not null
    references auth.users (id) on delete cascade,
  read_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (notification_id, recipient_user_id)
);

create index if not exists notification_recipients_user_feed_idx
  on public.notification_recipients (
    recipient_user_id,
    created_at desc,
    notification_id desc
  );

create index if not exists notification_recipients_user_unread_idx
  on public.notification_recipients (
    recipient_user_id,
    created_at desc
  )
  where read_at is null;

create unique index if not exists notifications_purchase_requisition_once_idx
  on public.notifications (notification_type, entity_id)
  where notification_type = 'purchase_requisition'
    and entity_id is not null;

alter table public.notifications enable row level security;
alter table public.notification_recipients enable row level security;

drop policy if exists "Recipients can view notifications" on public.notifications;
create policy "Recipients can view notifications"
on public.notifications
for select
to authenticated
using (
  exists (
    select 1
    from public.notification_recipients recipient
    where recipient.notification_id = notifications.id
      and recipient.recipient_user_id = (select auth.uid())
  )
);

drop policy if exists "Users can view their notification recipients"
  on public.notification_recipients;
create policy "Users can view their notification recipients"
on public.notification_recipients
for select
to authenticated
using (recipient_user_id = (select auth.uid()));

drop policy if exists "Users can mark their notifications as read"
  on public.notification_recipients;
create policy "Users can mark their notifications as read"
on public.notification_recipients
for update
to authenticated
using (recipient_user_id = (select auth.uid()))
with check (recipient_user_id = (select auth.uid()));

grant select on public.notifications to authenticated;
grant select on public.notification_recipients to authenticated;
grant update (read_at) on public.notification_recipients to authenticated;

create schema if not exists private;
revoke all on schema private from public;

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
    title,
    message,
    entity_type,
    entity_id,
    action_url,
    created_by
  )
  values (
    'purchase_requisition',
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
  on conflict (notification_type, entity_id)
    where notification_type = 'purchase_requisition'
      and entity_id is not null
  do nothing
  returning id into v_notification_id;

  if v_notification_id is null then
    return new;
  end if;

  if v_requisition.created_by is not null then
    insert into public.notification_recipients (
      notification_id,
      recipient_user_id
    )
    values (v_notification_id, v_requisition.created_by)
    on conflict do nothing;
  end if;

  insert into public.notification_recipients (
    notification_id,
    recipient_user_id
  )
  select
    v_notification_id,
    app_user.id
  from auth.users app_user
  where app_user.id is distinct from v_requisition.created_by
    and (
      lower(coalesce(app_user.raw_app_meta_data ->> 'role', '')) in (
        'admin',
        'approver',
        'purchase_approver'
      )
      or lower(
        coalesce(app_user.raw_app_meta_data ->> 'can_approve_pr', 'false')
      ) in ('true', '1', 'yes')
    )
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function private.notify_purchase_requisition_created() from public;

drop trigger if exists purchase_requisition_created_notification
  on public.purchase_requisition_approval_logs;
create trigger purchase_requisition_created_notification
after insert on public.purchase_requisition_approval_logs
for each row
when (new.action = 'submitted')
execute function private.notify_purchase_requisition_created();

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notification_recipients'
  ) then
    alter publication supabase_realtime
      add table public.notification_recipients;
  end if;
end;
$$;
