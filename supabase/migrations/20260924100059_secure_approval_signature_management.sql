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
values (
  'approval_signature.manage',
  'จัดการลายเซ็นและการยืนยันตัวตน',
  'approval_signature',
  'ลายเซ็นและการอนุมัติ',
  'manage',
  82,
  10,
  'active'
)
on conflict (permission_code) do update set
  permission_name = excluded.permission_name,
  module_code = excluded.module_code,
  module_name = excluded.module_name,
  action_code = excluded.action_code,
  module_sort_order = excluded.module_sort_order,
  sort_order = excluded.sort_order,
  status = 'active',
  updated_at = now();

-- Keep existing document approvers working while making this capability explicit.
insert into public.role_permissions (role_id, permission_id)
select distinct existing.role_id, signature_permission.id
from public.role_permissions existing
join public.app_permissions approval_permission
  on approval_permission.id = existing.permission_id
 and approval_permission.permission_code in ('pr.approve', 'po.approve')
cross join public.app_permissions signature_permission
where signature_permission.permission_code = 'approval_signature.manage'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
join public.app_permissions permission
  on permission.permission_code = 'approval_signature.manage'
where role.is_owner
on conflict (role_id, permission_id) do nothing;

drop policy if exists "Users read their own approval signatures"
  on public.user_approval_signatures;
drop policy if exists "Users create their own approval signatures"
  on public.user_approval_signatures;
drop policy if exists "Users revoke their own approval signatures"
  on public.user_approval_signatures;

create policy "Authorized users read their own approval signature history"
  on public.user_approval_signatures for select to authenticated
  using (
    (select auth.uid()) = user_id
    and public.authorize('approval_signature.manage')
  );

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

  select coalesce(max(signature.version), 0) + 1
    into next_version
    from public.user_approval_signatures signature
    where signature.user_id = current_user_id;

  update public.user_approval_signatures
    set revoked_at = now()
    where user_id = current_user_id and revoked_at is null;

  return query
  insert into public.user_approval_signatures (user_id, version, storage_path, sha256)
  values (current_user_id, next_version, p_storage_path, p_sha256)
  returning user_approval_signatures.id,
    user_approval_signatures.version,
    user_approval_signatures.created_at;
end;
$$;

revoke all on function public.save_current_user_approval_signature(text, text)
  from public, anon;
grant execute on function public.save_current_user_approval_signature(text, text)
  to authenticated;

drop policy if exists "Users read their own approval signature files"
  on storage.objects;
drop policy if exists "Users upload their own approval signature files"
  on storage.objects;
drop policy if exists "Users delete their own approval signature files"
  on storage.objects;

create policy "Authorized users read their own approval signature files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'approval-signatures'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and public.authorize('approval_signature.manage')
  );

create policy "Authorized users upload their own approval signature files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'approval-signatures'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and public.authorize('approval_signature.manage')
  );

-- Only orphaned uploads may be cleaned up. Referenced historical evidence is immutable.
create policy "Authorized users delete only unreferenced signature uploads"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'approval-signatures'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and public.authorize('approval_signature.manage')
    and not exists (
      select 1
      from public.user_approval_signatures signature
      where signature.storage_path = storage.objects.name
    )
  );
