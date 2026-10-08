-- This RPC is called directly by the OWNER-only user administration actions.
-- The function rate-limits the current authenticated actor and does not mutate
-- business data, so authenticated EXECUTE is intentional.
revoke all on function public.assert_user_admin_rate_limit(text, integer)
  from public, anon;
grant execute on function public.assert_user_admin_rate_limit(text, integer)
  to authenticated;
