create table if not exists public.user_approval_signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null check (version > 0),
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, version)
);

create unique index if not exists user_approval_signatures_one_active_per_user
  on public.user_approval_signatures (user_id)
  where revoked_at is null;

alter table public.user_approval_signatures enable row level security;

create policy "Users read their own approval signatures"
  on public.user_approval_signatures for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create their own approval signatures"
  on public.user_approval_signatures for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users revoke their own approval signatures"
  on public.user_approval_signatures for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.save_current_user_approval_signature(
  p_storage_path text,
  p_sha256 text
)
returns table (id uuid, version integer, created_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  next_version integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select coalesce(max(s.version), 0) + 1
    into next_version
    from public.user_approval_signatures s
    where s.user_id = current_user_id;

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

grant execute on function public.save_current_user_approval_signature(text, text)
  to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'approval-signatures',
  'approval-signatures',
  false,
  2097152,
  array['image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users read their own approval signature files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'approval-signatures'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Users upload their own approval signature files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'approval-signatures'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Users delete their own approval signature files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'approval-signatures'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
