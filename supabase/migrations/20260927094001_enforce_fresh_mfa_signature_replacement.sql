alter table public.user_approval_signatures
  add column if not exists mfa_verified_at timestamptz;

create or replace function public.save_current_user_approval_signature(
  p_storage_path text,
  p_sha256 text
)
returns table (id uuid, version integer, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  next_version integer;
  replacing_signature boolean := false;
  latest_auth_method jsonb;
  last_used_mfa_at timestamptz;
  latest_mfa_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not public.authorize('approval_signature.manage') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_storage_path !~ ('^' || current_user_id::text || '/[0-9a-f-]{36}[.]png$')
     or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_signature_metadata' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 0)
  );

  select true, signature.mfa_verified_at
    into replacing_signature, last_used_mfa_at
    from public.user_approval_signatures signature
    where signature.user_id = current_user_id
      and signature.revoked_at is null
    limit 1;

  if replacing_signature then
    latest_auth_method := jsonb_path_query_first(
      (select auth.jwt()),
      '$.amr[0]'
    );
    if latest_auth_method is null
       or latest_auth_method ->> 'method' <> 'totp'
       or not (coalesce(latest_auth_method ->> 'timestamp', '') ~ '^[0-9]+$')
       or (latest_auth_method ->> 'timestamp')::bigint
          < floor(extract(epoch from clock_timestamp()))::bigint - 300 then
      raise exception 'fresh_mfa_required' using errcode = '42501';
    end if;

    latest_mfa_at := pg_catalog.to_timestamp(
      (latest_auth_method ->> 'timestamp')::double precision
    );
    if latest_mfa_at <= coalesce(last_used_mfa_at, '-infinity'::timestamptz) then
      raise exception 'fresh_mfa_required' using errcode = '42501';
    end if;
  end if;

  select coalesce(max(signature.version), 0) + 1
    into next_version
    from public.user_approval_signatures signature
    where signature.user_id = current_user_id;

  update public.user_approval_signatures
    set revoked_at = now()
    where user_id = current_user_id and revoked_at is null;

  return query
  insert into public.user_approval_signatures (
    user_id,
    version,
    storage_path,
    sha256,
    mfa_verified_at
  )
  values (
    current_user_id,
    next_version,
    p_storage_path,
    p_sha256,
    case when replacing_signature then latest_mfa_at else null end
  )
  returning user_approval_signatures.id,
    user_approval_signatures.version,
    user_approval_signatures.created_at;
end;
$$;

revoke all on function public.save_current_user_approval_signature(text, text)
  from public, anon;
grant execute on function public.save_current_user_approval_signature(text, text)
  to authenticated;
