insert into public.app_permissions (
  permission_code, permission_name, module_code, module_name,
  action_code, module_sort_order, sort_order, status
)
values
  ('audit_logs.view', 'ดูประวัติการใช้งานระบบ', 'audit_logs', 'ประวัติการใช้งานระบบ', 'view', 86, 10, 'active'),
  ('audit_logs.export', 'ส่งออกประวัติการใช้งานระบบ', 'audit_logs', 'ประวัติการใช้งานระบบ', 'export', 86, 20, 'active')
on conflict (permission_code) do update set
  permission_name = excluded.permission_name,
  module_code = excluded.module_code,
  module_name = excluded.module_name,
  action_code = excluded.action_code,
  module_sort_order = excluded.module_sort_order,
  sort_order = excluded.sort_order,
  status = 'active',
  updated_at = now();

-- Audit data is sensitive. New permissions are OWNER-only by default and can be
-- delegated explicitly from the existing role-permission screen.
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
cross join public.app_permissions permission
where role.is_owner
  and permission.permission_code in ('audit_logs.view', 'audit_logs.export')
on conflict (role_id, permission_id) do nothing;

create table public.system_audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default timezone('utc', now()),
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_name text not null default 'ระบบ',
  actor_role text,
  action_code text not null,
  action_label text not null,
  module_code text not null,
  module_name text not null,
  entity_type text,
  entity_id text,
  entity_number text,
  outcome text not null default 'success' check (outcome in ('success', 'failure', 'warning')),
  severity text not null default 'normal' check (severity in ('normal', 'important', 'security')),
  summary text not null,
  reason text,
  changed_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(changed_fields) = 'object'),
  source text not null default 'database',
  ip_address_masked text,
  device_summary text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);

create index system_audit_logs_occurred_at_idx on public.system_audit_logs (occurred_at desc, id desc);
create index system_audit_logs_actor_idx on public.system_audit_logs (actor_user_id, occurred_at desc);
create index system_audit_logs_module_idx on public.system_audit_logs (module_code, occurred_at desc);
create index system_audit_logs_entity_idx on public.system_audit_logs (entity_type, entity_id, occurred_at desc);
create index system_audit_logs_outcome_idx on public.system_audit_logs (outcome, occurred_at desc);

alter table public.system_audit_logs enable row level security;

create policy "Authorized users read system audit logs"
  on public.system_audit_logs for select to authenticated
  using ((select public.authorize('audit_logs.view')));

grant select on public.system_audit_logs to authenticated;
revoke insert, update, delete, truncate on public.system_audit_logs from public, anon, authenticated;

create or replace function public.mask_audit_ip(p_ip text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_ip is null or pg_catalog.btrim(p_ip) = '' then null
    when pg_catalog.strpos(p_ip, ':') > 0 then pg_catalog.regexp_replace(p_ip, ':[^:]+$', ':****')
    else pg_catalog.regexp_replace(p_ip, '\.[0-9]+$', '.xxx')
  end;
$$;

create or replace function public.audit_safe_json(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_value, '{}'::jsonb)
    - array[
      'password', 'password_hash', 'otp', 'totp_secret', 'mfa_secret',
      'access_token', 'refresh_token', 'token', 'session_cookie', 'cookie',
      'service_role_key', 'secret', 'signature_data', 'file_data'
    ]::text[];
$$;

create or replace function public.capture_system_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text := 'ระบบ';
  v_actor_role text;
  v_before jsonb := case when tg_op in ('UPDATE', 'DELETE') then public.audit_safe_json(to_jsonb(old)) else '{}'::jsonb end;
  v_after jsonb := case when tg_op in ('INSERT', 'UPDATE') then public.audit_safe_json(to_jsonb(new)) else '{}'::jsonb end;
  v_changed jsonb := '{}'::jsonb;
  v_key text;
  v_entity_id text;
  v_entity_number text;
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
begin
  if v_actor_id is not null then
    select
      coalesce(nullif(pg_catalog.btrim(profile.first_name || ' ' || profile.last_name), ''), profile.username, v_actor_id::text),
      role.role_name
    into v_actor_name, v_actor_role
    from public.user_profiles profile
    left join public.user_roles user_role on user_role.user_id = profile.user_id
    left join public.app_roles role on role.id = user_role.role_id
    where profile.user_id = v_actor_id
    order by role.is_owner desc nulls last, role.sort_order
    limit 1;
  end if;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_after)
    loop
      if v_key not in ('updated_at', 'updated_by') and v_before -> v_key is distinct from v_after -> v_key then
        v_changed := v_changed || jsonb_build_object(v_key, jsonb_build_object('before', v_before -> v_key, 'after', v_after -> v_key));
      end if;
    end loop;
  elsif tg_op = 'INSERT' then
    v_changed := jsonb_build_object('created', v_after - array['created_at', 'updated_at']::text[]);
  else
    v_changed := jsonb_build_object('deleted', v_before - array['created_at', 'updated_at']::text[]);
  end if;

  v_entity_id := coalesce(v_after ->> 'id', v_before ->> 'id', v_after ->> 'user_id', v_before ->> 'user_id');
  v_entity_number := coalesce(
    v_after ->> 'po_number', v_before ->> 'po_number',
    v_after ->> 'purchase_order_number', v_before ->> 'purchase_order_number',
    v_after ->> 'pr_number', v_before ->> 'pr_number',
    v_after ->> 'requisition_number', v_before ->> 'requisition_number',
    v_after ->> 'gr_number', v_before ->> 'gr_number',
    v_after ->> 'receipt_number', v_before ->> 'receipt_number',
    v_after ->> 'adjustment_number', v_before ->> 'adjustment_number',
    v_after ->> 'issue_number', v_before ->> 'issue_number',
    v_after ->> 'item_code', v_before ->> 'item_code',
    v_after ->> 'vendor_code', v_before ->> 'vendor_code',
    v_after ->> 'employee_code', v_before ->> 'employee_code',
    v_entity_id
  );

  insert into public.system_audit_logs (
    actor_user_id, actor_name, actor_role, action_code, action_label,
    module_code, module_name, entity_type, entity_id, entity_number,
    summary, changed_fields, source, ip_address_masked, device_summary, request_id
  ) values (
    v_actor_id, coalesce(v_actor_name, 'ระบบ'), v_actor_role,
    pg_catalog.lower(tg_op),
    case tg_op when 'INSERT' then 'สร้างข้อมูล' when 'UPDATE' then 'แก้ไขข้อมูล' else 'ลบข้อมูล' end,
    tg_table_name, tg_table_name, tg_table_name, v_entity_id, v_entity_number,
    (case tg_op when 'INSERT' then 'สร้าง' when 'UPDATE' then 'แก้ไข' else 'ลบ' end) || ' ' || tg_table_name || coalesce(' ' || v_entity_number, ''),
    v_changed, 'database', public.mask_audit_ip(v_headers ->> 'x-forwarded-for'),
    pg_catalog.left(coalesce(v_headers ->> 'user-agent', ''), 200),
    coalesce(v_headers ->> 'x-request-id', v_headers ->> 'cf-ray')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.capture_system_audit_log() from public, anon, authenticated;

-- Attach the same audited write path to current business-critical records.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'purchase_requisitions', 'purchase_orders', 'goods_receipts',
    'inventory_adjustments', 'inventory_issues', 'items', 'vendors', 'assets',
    'user_profiles', 'user_roles', 'role_permissions', 'app_roles',
    'company_profiles', 'company_document_settings', 'document_term_templates',
    'user_admin_audit_logs', 'approval_policy_audit_logs'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists capture_system_audit_log on public.%I', v_table);
      execute format(
        'create trigger capture_system_audit_log after insert or update or delete on public.%I for each row execute function public.capture_system_audit_log()',
        v_table
      );
    end if;
  end loop;
end;
$$;

-- Records viewing/exporting the audit trail itself without allowing callers to spoof events.
create or replace function public.record_audit_log_access(p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text;
  v_role text;
begin
  if p_action not in ('view', 'export')
    or not public.authorize(case when p_action = 'export' then 'audit_logs.export' else 'audit_logs.view' end)
  then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  select coalesce(nullif(pg_catalog.btrim(profile.first_name || ' ' || profile.last_name), ''), profile.username), role.role_name
  into v_name, v_role
  from public.user_profiles profile
  left join public.user_roles user_role on user_role.user_id = profile.user_id
  left join public.app_roles role on role.id = user_role.role_id
  where profile.user_id = v_user_id
  order by role.is_owner desc nulls last, role.sort_order
  limit 1;

  insert into public.system_audit_logs (
    actor_user_id, actor_name, actor_role, action_code, action_label,
    module_code, module_name, outcome, severity, summary, source
  ) values (
    v_user_id, coalesce(v_name, 'ผู้ใช้งาน'), v_role, p_action,
    case when p_action = 'export' then 'ส่งออกประวัติ' else 'เปิดดูประวัติ' end,
    'audit_logs', 'ประวัติการใช้งานระบบ', 'success', 'security',
    case when p_action = 'export' then 'ส่งออกประวัติการใช้งานระบบ' else 'เปิดดูประวัติการใช้งานระบบ' end,
    'application'
  );
end;
$$;

revoke all on function public.record_audit_log_access(text) from public, anon;
grant execute on function public.record_audit_log_access(text) to authenticated;
