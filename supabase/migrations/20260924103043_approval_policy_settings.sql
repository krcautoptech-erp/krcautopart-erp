insert into public.app_permissions (
  permission_code,
  permission_name,
  module_code,
  module_name,
  action_code,
  module_sort_order,
  sort_order,
  status
)
values
  ('approval_policy.view', 'ดูนโยบายการอนุมัติ', 'approval_policy', 'นโยบายการอนุมัติ', 'view', 83, 10, 'active'),
  ('approval_policy.manage', 'แก้ไขนโยบายการอนุมัติ', 'approval_policy', 'นโยบายการอนุมัติ', 'manage', 83, 20, 'active')
on conflict (permission_code) do update set
  permission_name = excluded.permission_name,
  module_code = excluded.module_code,
  module_name = excluded.module_name,
  action_code = excluded.action_code,
  module_sort_order = excluded.module_sort_order,
  sort_order = excluded.sort_order,
  status = 'active',
  updated_at = now();

insert into public.role_permissions (role_id, permission_id)
select distinct existing.role_id, policy_permission.id
from public.role_permissions existing
join public.app_permissions existing_permission
  on existing_permission.id = existing.permission_id
 and existing_permission.permission_code = 'approval_signature.manage'
cross join public.app_permissions policy_permission
where policy_permission.permission_code in ('approval_policy.view', 'approval_policy.manage')
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
join public.app_permissions permission
  on permission.permission_code in ('approval_policy.view', 'approval_policy.manage')
where role.is_owner
on conflict (role_id, permission_id) do nothing;

create table public.approval_policies (
  policy_code text primary key,
  document_label text not null,
  action_label text not null,
  permission_code text not null,
  verification_method text not null check (verification_method in ('single', 'mfa', 'conditional')),
  threshold_amount numeric(16, 2),
  is_active boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid references auth.users (id) on delete set null,
  check (
    (verification_method = 'conditional' and threshold_amount is not null and threshold_amount >= 0)
    or (verification_method <> 'conditional' and threshold_amount is null)
  )
);

create table public.approval_policy_audit_logs (
  id bigint generated always as identity primary key,
  policy_code text not null,
  before_value jsonb,
  after_value jsonb not null,
  actor_user_id uuid not null references auth.users (id),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.approval_policies enable row level security;
alter table public.approval_policy_audit_logs enable row level security;

insert into public.approval_policies (
  policy_code, document_label, action_label, permission_code,
  verification_method, threshold_amount
)
values
  ('po.approve', 'ใบสั่งซื้อ (PO)', 'อนุมัติ', 'po.approve', 'mfa', null),
  ('pr.review', 'ใบขอซื้อ (PR)', 'ตรวจสอบพร้อมออก PO', 'pr.approve', 'single', null),
  ('inventory_adjustment.approve', 'ปรับยอดสต็อก', 'อนุมัติ', 'inventory_adjustment.approve', 'conditional', 100000),
  ('document.cancel', 'ยกเลิกเอกสารลงบัญชีแล้ว', 'ยกเลิก', 'document.cancel', 'mfa', null),
  ('approval_signature.change', 'เปลี่ยนลายเซ็น', 'จัดการ', 'approval_signature.manage', 'mfa', null)
on conflict (policy_code) do nothing;

create policy "Authorized users read approval policies"
  on public.approval_policies for select to authenticated
  using (
    (select public.authorize('approval_policy.view'))
    or (select public.authorize('approval_policy.manage'))
  );

create policy "Authorized users read approval policy audit logs"
  on public.approval_policy_audit_logs for select to authenticated
  using (
    (select public.authorize('approval_policy.view'))
    or (select public.authorize('approval_policy.manage'))
  );

grant select on public.approval_policies to authenticated;
grant select on public.approval_policy_audit_logs to authenticated;

create or replace function public.save_approval_policies(p_policies jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_policy jsonb;
  v_current public.approval_policies%rowtype;
  v_method text;
  v_threshold numeric(16, 2);
begin
  if v_user_id is null or not public.authorize('approval_policy.manage') then
    raise exception 'approval_policy_manage_required' using errcode = '42501';
  end if;

  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'aal2_required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_policies) <> 'array' or jsonb_array_length(p_policies) = 0 then
    raise exception 'invalid_approval_policies' using errcode = '22023';
  end if;

  for v_policy in select value from jsonb_array_elements(p_policies)
  loop
    select * into v_current
    from public.approval_policies
    where policy_code = v_policy ->> 'policyCode'
    for update;

    if not found then
      raise exception 'approval_policy_not_found' using errcode = 'P0002';
    end if;

    v_method := v_policy ->> 'verificationMethod';
    if v_method not in ('single', 'mfa', 'conditional') then
      raise exception 'invalid_verification_method' using errcode = '22023';
    end if;

    v_threshold := case
      when v_method = 'conditional' then (v_policy ->> 'thresholdAmount')::numeric
      else null
    end;
    if v_method = 'conditional' and (v_threshold is null or v_threshold < 0) then
      raise exception 'invalid_threshold_amount' using errcode = '22023';
    end if;

    insert into public.approval_policy_audit_logs (
      policy_code, before_value, after_value, actor_user_id
    ) values (
      v_current.policy_code,
      to_jsonb(v_current),
      jsonb_build_object(
        'verification_method', v_method,
        'threshold_amount', v_threshold,
        'is_active', coalesce((v_policy ->> 'isActive')::boolean, true)
      ),
      v_user_id
    );

    update public.approval_policies
    set verification_method = v_method,
        threshold_amount = v_threshold,
        is_active = coalesce((v_policy ->> 'isActive')::boolean, true),
        updated_at = timezone('utc', now()),
        updated_by = v_user_id
    where policy_code = v_current.policy_code;
  end loop;
end;
$$;

revoke all on function public.save_approval_policies(jsonb) from public, anon;
grant execute on function public.save_approval_policies(jsonb) to authenticated;
