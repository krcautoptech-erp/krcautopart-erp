alter table public.purchase_order_status_logs
  add column if not exists approval_signature_id uuid
    references public.user_approval_signatures (id) on delete restrict,
  add column if not exists approval_signature_sha256 text
    check (
      approval_signature_sha256 is null
      or approval_signature_sha256 ~ '^[0-9a-f]{64}$'
    );

create or replace function public.decide_purchase_order(
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
  v_signature_id uuid;
  v_signature_sha256 text;
  v_decision_status text;
  v_purchase_order_number text;
begin
  if lower(btrim(p_decision)) = 'approved' then
    select grand_total into v_amount
    from public.purchase_orders
    where id = p_purchase_order_id;
    if not found then
      raise exception 'purchase_order_not_found' using errcode = 'P0002';
    end if;

    select signature.id, signature.sha256
      into v_signature_id, v_signature_sha256
    from public.user_approval_signatures signature
    where signature.user_id = (select auth.uid())
      and signature.revoked_at is null;
    if not found then
      raise exception 'approval_signature_required' using errcode = '42501';
    end if;

    perform public.enforce_approval_policy('po.approve', v_amount);
  end if;

  select result.decision_status, result.purchase_order_number
    into v_decision_status, v_purchase_order_number
  from public.decide_purchase_order_without_policy(
    p_purchase_order_id, p_decision, p_note
  ) result;

  if lower(btrim(p_decision)) = 'approved' then
    update public.purchase_order_status_logs
    set approval_signature_id = v_signature_id,
        approval_signature_sha256 = v_signature_sha256
    where id = (
      select log.id
      from public.purchase_order_status_logs log
      where log.purchase_order_id = p_purchase_order_id
        and log.actor_user_id = (select auth.uid())
        and log.to_status = 'approved'
      order by log.id desc
      limit 1
    );
  end if;

  return query select v_decision_status, v_purchase_order_number;
end;
$$;

revoke all on function public.decide_purchase_order(bigint, text, text)
  from public, anon;
grant execute on function public.decide_purchase_order(bigint, text, text)
  to authenticated;
