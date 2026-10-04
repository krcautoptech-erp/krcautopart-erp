-- Keep future policy rows for audit/history, but do not present them as live yet.
update public.approval_policies
set is_active = false,
    updated_at = timezone('utc', now())
where policy_code not in ('po.approve', 'pr.review');

update public.approval_policies
set document_label = 'ใบสั่งซื้อ (PO)',
    action_label = 'อนุมัติเอกสารและลงลายเซ็น',
    permission_code = 'po.approve'
where policy_code = 'po.approve';

update public.approval_policies
set document_label = 'ใบขอซื้อ (PR)',
    action_label = 'ตรวจสอบความพร้อมก่อนออก PO (ไม่ใช้ลายเซ็น)',
    permission_code = 'pr.approve',
    verification_method = 'single',
    threshold_amount = null
where policy_code = 'pr.review';

alter table public.approval_policies
  add constraint approval_policies_pr_review_is_single_step
  check (policy_code <> 'pr.review' or verification_method = 'single');

create or replace function public.enforce_approval_policy(
  p_policy_code text,
  p_amount numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy public.approval_policies%rowtype;
  v_requires_mfa boolean := false;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;

  select * into v_policy
  from public.approval_policies
  where policy_code = p_policy_code;

  if not found then
    raise exception 'approval_policy_not_found' using errcode = 'P0002';
  end if;

  if not v_policy.is_active then return; end if;

  v_requires_mfa := v_policy.verification_method = 'mfa'
    or (
      v_policy.verification_method = 'conditional'
      and p_amount is not null
      and p_amount >= v_policy.threshold_amount
    );

  if v_requires_mfa and coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'approval_mfa_required' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.enforce_approval_policy(text, numeric)
  from public, anon, authenticated;

alter function public.decide_purchase_order(bigint, text, text)
  rename to decide_purchase_order_without_policy;
revoke all on function public.decide_purchase_order_without_policy(bigint, text, text)
  from public, anon, authenticated;

create function public.decide_purchase_order(
  p_purchase_order_id bigint,
  p_decision text,
  p_note text default null
)
returns table (decision_status text, purchase_order_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount numeric;
begin
  if lower(btrim(p_decision)) = 'approved' then
    select grand_total into v_amount
    from public.purchase_orders
    where id = p_purchase_order_id;
    if not found then
      raise exception 'purchase_order_not_found' using errcode = 'P0002';
    end if;
    perform public.enforce_approval_policy('po.approve', v_amount);
  end if;

  return query
  select result.decision_status, result.purchase_order_number
  from public.decide_purchase_order_without_policy(
    p_purchase_order_id, p_decision, p_note
  ) result;
end;
$$;

revoke all on function public.decide_purchase_order(bigint, text, text)
  from public, anon;
grant execute on function public.decide_purchase_order(bigint, text, text)
  to authenticated;

alter function public.decide_purchase_requisition(bigint, text, text)
  rename to decide_purchase_requisition_without_policy;
revoke all on function public.decide_purchase_requisition_without_policy(bigint, text, text)
  from public, anon, authenticated;

create function public.decide_purchase_requisition(
  p_requisition_id bigint,
  p_decision text,
  p_note text default null
)
returns table (decision_status text, requisition_number text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(btrim(p_decision)) = 'approved' then
    perform public.enforce_approval_policy('pr.review', null);
  end if;

  return query
  select result.decision_status, result.requisition_number
  from public.decide_purchase_requisition_without_policy(
    p_requisition_id, p_decision, p_note
  ) result;
end;
$$;

revoke all on function public.decide_purchase_requisition(bigint, text, text)
  from public, anon;
grant execute on function public.decide_purchase_requisition(bigint, text, text)
  to authenticated;
