-- Existing installs need a forward migration so document numbers are captured
-- before generic row IDs when a new audit event is written.
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
