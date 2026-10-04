-- Keep the existing bell and recipient tables; route submitted work by the
-- permission used by the actual approval RPCs, including owner fallback.
create or replace function private.add_approval_notification_recipients()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_permission text;
begin
  if new.event_key <> 'submitted' then return new; end if;
  v_permission := case new.notification_type
    when 'purchase_requisition' then 'pr.approve'
    when 'purchase_order' then 'po.approve'
    else null
  end;
  if v_permission is null then return new; end if;

  insert into public.notification_recipients (notification_id, recipient_user_id)
  select new.id, app_user.id
  from auth.users app_user
  left join public.user_profiles profile on profile.user_id = app_user.id
  left join public.user_roles user_role on user_role.user_id = app_user.id
  left join public.app_roles role on role.id = user_role.role_id and role.status = 'active'
  left join public.app_permissions permission
    on permission.permission_code = v_permission and permission.status = 'active'
  left join public.role_permissions role_permission
    on role_permission.role_id = role.id and role_permission.permission_id = permission.id
  where coalesce(profile.status, 'active') = 'active'
    and (lower(app_user.raw_app_meta_data ->> 'role') = 'owner'
      or role_permission.permission_id is not null)
  on conflict (notification_id, recipient_user_id) do update
    set read_at = null, created_at = timezone('utc', now());
  return new;
end;
$$;
revoke all on function private.add_approval_notification_recipients() from public, anon, authenticated;

drop trigger if exists notifications_add_approval_recipients on public.notifications;
create trigger notifications_add_approval_recipients
after insert or update on public.notifications
for each row execute function private.add_approval_notification_recipients();

-- Repair already-pending documents without reviving completed work.
update public.notifications notification
set created_at = notification.created_at
where notification.event_key = 'submitted'
  and ((notification.notification_type = 'purchase_requisition' and exists (
    select 1 from public.purchase_requisitions pr
    where pr.id = notification.entity_id and pr.status = 'pending_approval'
  )) or (notification.notification_type = 'purchase_order' and exists (
    select 1 from public.purchase_orders po
    where po.id = notification.entity_id and po.status = 'pending_approval'
  )));

-- A submitted alert is a task, not a permanent unread message. Clear it for
-- every recipient when the document leaves the review queue.
create or replace function private.close_submitted_document_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'pending_approval' and new.status <> 'pending_approval' then
    update public.notification_recipients recipient
    set read_at = coalesce(recipient.read_at, timezone('utc', now()))
    from public.notifications notification
    where notification.id = recipient.notification_id
      and notification.notification_type = TG_ARGV[0]
      and notification.event_key = 'submitted'
      and notification.entity_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.close_submitted_document_notification() from public, anon, authenticated;
drop trigger if exists pr_close_submitted_notification on public.purchase_requisitions;
create trigger pr_close_submitted_notification
after update of status on public.purchase_requisitions
for each row execute function private.close_submitted_document_notification('purchase_requisition');
drop trigger if exists po_close_submitted_notification on public.purchase_orders;
create trigger po_close_submitted_notification
after update of status on public.purchase_orders
for each row execute function private.close_submitted_document_notification('purchase_order');

-- Keep the notification feed permission-aligned after a role is revoked.
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
    else false
  end
);

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (notification_type in ('purchase_requisition', 'purchase_order', 'goods_receipt'));
alter table public.notifications drop constraint if exists notifications_event_key_check;
alter table public.notifications add constraint notifications_event_key_check
  check (event_key in ('submitted', 'approved', 'rejected', 'cancelled'));
create unique index if not exists notifications_goods_receipt_event_idx
  on public.notifications(notification_type, entity_id, event_key)
  where notification_type = 'goods_receipt' and entity_id is not null;

-- GR cancellation changes the PO's remaining quantity. Tell its buyer, not
-- every warehouse user, and keep this in-app only (no unsolicited push).
create or replace function private.notify_goods_receipt_cancelled()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_po public.purchase_orders%rowtype;
  v_gr_number text;
  v_notification_id bigint;
begin
  if new.to_status <> 'cancelled' then return new; end if;
  select po.* into v_po from public.goods_receipts gr
    join public.purchase_orders po on po.id = gr.purchase_order_id
    where gr.id = new.goods_receipt_id;
  select gr_number into v_gr_number from public.goods_receipts where id = new.goods_receipt_id;
  if v_po.id is null or v_po.created_by is null or v_po.created_by = new.actor_user_id then
    return new;
  end if;

  insert into public.notifications (
    notification_type, event_key, title, message, entity_type, entity_id, action_url, created_by
  ) values (
    'goods_receipt', 'cancelled', 'ยกเลิกใบรับสินค้า ' || v_gr_number,
    'ใบรับสินค้าถูกยกเลิกและยอดรับของ ' || v_po.po_number || ' เปลี่ยนแล้ว',
    'goods_receipt', new.goods_receipt_id, '/purchase/po?po=' || v_po.id,
    new.actor_user_id
  ) on conflict (notification_type, entity_id, event_key)
    where notification_type = 'goods_receipt' and entity_id is not null
    do update set title = excluded.title, message = excluded.message,
      action_url = excluded.action_url, created_at = timezone('utc', now())
    returning id into v_notification_id;

  insert into public.notification_recipients(notification_id, recipient_user_id)
  values (v_notification_id, v_po.created_by)
  on conflict (notification_id, recipient_user_id) do update
    set read_at = null, created_at = timezone('utc', now());
  return new;
end;
$$;
revoke all on function private.notify_goods_receipt_cancelled() from public, anon, authenticated;
drop trigger if exists goods_receipt_cancelled_notification on public.goods_receipt_status_logs;
create trigger goods_receipt_cancelled_notification
after insert on public.goods_receipt_status_logs
for each row when (new.to_status = 'cancelled')
execute function private.notify_goods_receipt_cancelled();

notify pgrst, 'reload schema';
