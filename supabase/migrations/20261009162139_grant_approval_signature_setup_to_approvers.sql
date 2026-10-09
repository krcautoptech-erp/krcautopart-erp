-- Approvers need to manage their own signature and authenticator setup.
insert into public.role_permissions (role_id, permission_id)
select distinct approver_grant.role_id, signature_permission.id
from public.role_permissions as approver_grant
join public.app_permissions as approver_permission
  on approver_permission.id = approver_grant.permission_id
 and approver_permission.status = 'active'
 and approver_permission.permission_code in ('po.approve', 'pr.approve')
join public.app_roles as approver_role
  on approver_role.id = approver_grant.role_id
 and approver_role.status = 'active'
join public.app_permissions as signature_permission
  on signature_permission.permission_code = 'approval_signature.manage'
 and signature_permission.status = 'active'
on conflict (role_id, permission_id) do nothing;

create or replace function public.replace_role_permissions(
  p_role_id bigint,
  p_permission_ids bigint[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_owner boolean;
  v_requested_count integer;
  v_valid_count integer;
  v_signature_permission_id bigint;
  v_effective_permission_ids bigint[] := coalesce(p_permission_ids, '{}'::bigint[]);
begin
  if not public.authorize('roles.manage') then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  select role.is_owner
  into v_is_owner
  from public.app_roles as role
  where role.id = p_role_id
  for update;

  if not found then
    raise exception 'role_not_found' using errcode = 'P0002';
  end if;

  if v_is_owner then
    raise exception 'owner_role_is_locked' using errcode = '42501';
  end if;

  select count(distinct requested.permission_id)
  into v_requested_count
  from unnest(coalesce(p_permission_ids, '{}'::bigint[]))
    as requested(permission_id);

  select count(*)
  into v_valid_count
  from public.app_permissions as permission
  where permission.id = any(coalesce(p_permission_ids, '{}'::bigint[]))
    and permission.status = 'active';

  if v_requested_count <> v_valid_count then
    raise exception 'invalid_permission_selection' using errcode = '22023';
  end if;

  select permission.id
  into v_signature_permission_id
  from public.app_permissions as permission
  where permission.permission_code = 'approval_signature.manage'
    and permission.status = 'active';

  if v_signature_permission_id is not null
    and not (v_signature_permission_id = any(v_effective_permission_ids))
    and exists (
      select 1
      from public.app_permissions as permission
      where permission.id = any(coalesce(p_permission_ids, '{}'::bigint[]))
        and permission.status = 'active'
        and permission.permission_code in ('po.approve', 'pr.approve')
    )
  then
    v_effective_permission_ids := pg_catalog.array_append(
      v_effective_permission_ids,
      v_signature_permission_id
    );
  end if;

  delete from public.role_permissions
  where role_id = p_role_id;

  insert into public.role_permissions (
    role_id,
    permission_id,
    granted_by
  )
  select
    p_role_id,
    requested.permission_id,
    (select auth.uid())
  from unnest(v_effective_permission_ids)
    as requested(permission_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.replace_role_permissions(bigint, bigint[])
  from public, anon, authenticated;
grant execute on function public.replace_role_permissions(bigint, bigint[])
  to authenticated;