-- Authentication failures are not retryable for the same endpoint. They most
-- commonly mean the browser subscription was created with an older VAPID key.
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
  v_terminal boolean;
begin
  select attempts, subscription_id into v_attempts, v_subscription_id
  from public.notification_push_deliveries where id = p_delivery_id for update;
  if not found then raise exception 'push_delivery_not_found' using errcode = 'P0002'; end if;

  v_terminal := p_status_code in (401, 403, 404, 410);

  if v_terminal then
    update public.web_push_subscriptions
    set status = 'inactive', updated_at = timezone('utc', now())
    where id = v_subscription_id;

    update public.notification_push_deliveries
    set status = 'failed', last_status_code = p_status_code,
      last_error = case
        when p_status_code in (401, 403) then 'push_subscription_vapid_rejected'
        else 'push_subscription_expired'
      end,
      updated_at = timezone('utc', now())
    where subscription_id = v_subscription_id and status in ('queued', 'retry', 'sending');
  end if;

  update public.notification_push_deliveries
  set status = case
      when p_success then 'delivered'
      when v_terminal or v_attempts >= 5 then 'failed'
      else 'retry'
    end,
    available_at = case
      when p_success or v_terminal or v_attempts >= 5 then available_at
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

revoke all on function public.complete_web_push_delivery(bigint, boolean, integer, text)
  from public, anon, authenticated;
grant execute on function public.complete_web_push_delivery(bigint, boolean, integer, text)
  to service_role;

-- Stop burning retries for failures that already proved the endpoint cannot
-- authenticate with the currently deployed VAPID identity.
update public.web_push_subscriptions subscription
set status = 'inactive', updated_at = timezone('utc', now())
where exists (
  select 1
  from public.notification_push_deliveries delivery
  where delivery.subscription_id = subscription.id
    and delivery.last_status_code in (401, 403)
);

update public.notification_push_deliveries
set status = 'failed', last_error = 'push_subscription_vapid_rejected',
  updated_at = timezone('utc', now())
where last_status_code in (401, 403)
  and status in ('queued', 'retry', 'sending');
