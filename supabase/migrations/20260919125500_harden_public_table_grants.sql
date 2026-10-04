-- RLS does not protect TRUNCATE, so browser-facing roles must never hold it.
revoke truncate, references, trigger on all tables in schema public
  from anon, authenticated;
revoke insert, update, delete on all tables in schema public
  from anon;

-- Anonymous clients do not create public-schema rows or consume identity sequences.
revoke all on all sequences in schema public from anon;

-- Only the login-page branding RPC is intentionally public.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.get_public_company_branding()
  to anon, authenticated;

-- Keep future migrations least-privileged by default. Individual migrations
-- must explicitly grant the operations exposed to authenticated users.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke insert, update, delete on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;
