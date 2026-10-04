drop policy if exists "Authorized users read their own approval signature history"
  on public.user_approval_signatures;

create policy "Authorized users read permitted approval signature history"
  on public.user_approval_signatures for select to authenticated
  using (
    (
      (select auth.uid()) = user_id
      and (select public.authorize('approval_signature.manage'))
    )
    or (
      (select public.authorize('po.view'))
      and exists (
        select 1
        from public.purchase_order_status_logs log
        where log.approval_signature_id = user_approval_signatures.id
          and log.to_status = 'approved'
      )
    )
  );

drop policy if exists "Authorized users read their own approval signature files"
  on storage.objects;

create policy "Authorized users read permitted approval signature files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'approval-signatures'
    and (
      (
        (storage.foldername(name))[1] = (select auth.uid()::text)
        and (select public.authorize('approval_signature.manage'))
      )
      or (
        (select public.authorize('po.view'))
        and exists (
          select 1
          from public.user_approval_signatures signature
          join public.purchase_order_status_logs log
            on log.approval_signature_id = signature.id
           and log.to_status = 'approved'
          where signature.storage_path = storage.objects.name
        )
      )
    )
  );
