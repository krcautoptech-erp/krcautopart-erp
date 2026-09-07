alter table public.notifications
  add column if not exists event_key text not null default 'submitted';

alter table public.notifications
  drop constraint if exists notifications_event_key_check;

alter table public.notifications
  add constraint notifications_event_key_check
  check (event_key in ('submitted', 'approved', 'rejected'));

drop index if exists public.notifications_purchase_requisition_once_idx;

create unique index if not exists notifications_purchase_requisition_event_idx
  on public.notifications (notification_type, entity_id, event_key)
  where notification_type = 'purchase_requisition'
    and entity_id is not null;

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
    action_url = excluded.action_url
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
  where user_role.user_id is distinct from v_requisition.created_by
    and coalesce(profile.status, 'active') = 'active'
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function private.notify_purchase_requisition_created() from public;

create or replace function private.enforce_purchase_requisition_status_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
    and coalesce(
      current_setting('app.purchase_requisition_decision', true),
      ''
    ) <> 'allowed'
  then
    raise exception 'status_change_requires_decision_rpc'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_purchase_requisition_status_change()
  from public;

drop trigger if exists purchase_requisition_status_guard
  on public.purchase_requisitions;
create trigger purchase_requisition_status_guard
before update of status on public.purchase_requisitions
for each row
execute function private.enforce_purchase_requisition_status_change();

create or replace function public.decide_purchase_requisition(
  p_requisition_id bigint,
  p_decision text,
  p_note text default null
)
returns table (
  decision_status text,
  requisition_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_name text;
  v_event_key text := lower(btrim(p_decision));
  v_note text := nullif(btrim(p_note), '');
  v_notification_id bigint;
  v_requisition public.purchase_requisitions%rowtype;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  if v_event_key not in ('approved', 'rejected') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;

  if v_event_key = 'rejected' and v_note is null then
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
      when v_event_key = 'approved' then 'pr.approve'
      else 'pr.reject'
    end
  ) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select requisition.*
  into v_requisition
  from public.purchase_requisitions requisition
  where requisition.id = p_requisition_id
  for update;

  if not found then
    raise exception 'purchase_requisition_not_found' using errcode = 'P0002';
  end if;

  if v_requisition.status <> 'pending_approval' then
    raise exception 'purchase_requisition_already_decided'
      using errcode = '55000';
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

  perform set_config(
    'app.purchase_requisition_decision',
    'allowed',
    true
  );

  update public.purchase_requisitions
  set
    status = v_event_key,
    approved_at = case
      when v_event_key = 'approved' then timezone('utc', now())
      else null
    end,
    rejected_at = case
      when v_event_key = 'rejected' then timezone('utc', now())
      else null
    end,
    updated_by = v_user_id,
    updated_at = timezone('utc', now())
  where id = v_requisition.id;

  insert into public.purchase_requisition_approval_logs (
    requisition_id,
    action,
    actor_name,
    actor_user_id,
    note
  )
  values (
    v_requisition.id,
    v_event_key,
    v_actor_name,
    v_user_id,
    v_note
  );

  if v_requisition.created_by is not null then
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
      v_event_key,
      concat(
        case
          when v_event_key = 'approved' then 'อนุมัติใบขอซื้อ '
          else 'ปฏิเสธใบขอซื้อ '
        end,
        v_requisition.pr_number
      ),
      concat(
        case
          when v_event_key = 'approved' then 'ใบขอซื้อได้รับการอนุมัติโดย '
          else 'ใบขอซื้อถูกปฏิเสธโดย '
        end,
        v_actor_name,
        case
          when v_note is not null then concat(' หมายเหตุ: ', v_note)
          else ''
        end
      ),
      'purchase_requisition',
      v_requisition.id,
      concat('/purchase/pr?pr=', v_requisition.id),
      v_user_id
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
    values (
      v_notification_id,
      v_requisition.created_by
    )
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
    and notification.notification_type = 'purchase_requisition'
    and notification.entity_id = v_requisition.id
    and notification.event_key = 'submitted';

  return query
  select v_event_key, v_requisition.pr_number;
end;
$$;

revoke all on function public.decide_purchase_requisition(bigint, text, text)
  from public;
grant execute on function public.decide_purchase_requisition(bigint, text, text)
  to authenticated;

drop policy if exists
  "Authenticated users can manage purchase requisition approval logs"
  on public.purchase_requisition_approval_logs;

drop policy if exists "Authenticated users can read purchase requisition approval logs"
  on public.purchase_requisition_approval_logs;
create policy "Authenticated users can read purchase requisition approval logs"
on public.purchase_requisition_approval_logs
for select
to authenticated
using ((select auth.uid()) is not null);

revoke insert, update, delete
  on public.purchase_requisition_approval_logs
  from authenticated;
grant select on public.purchase_requisition_approval_logs to authenticated;
