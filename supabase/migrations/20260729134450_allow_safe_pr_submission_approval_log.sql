alter table public.purchase_requisition_approval_logs
  enable row level security;

create unique index if not exists
  purchase_requisition_approval_logs_one_submission_idx
  on public.purchase_requisition_approval_logs (requisition_id)
  where action = 'submitted';

drop policy if exists
  "PR submitters can create their submission approval log"
  on public.purchase_requisition_approval_logs;

create policy "PR submitters can create their submission approval log"
on public.purchase_requisition_approval_logs
for insert
to authenticated
with check (
  action = 'submitted'
  and actor_user_id = (select auth.uid())
  and exists (
    select 1
    from public.purchase_requisitions requisition
    where requisition.id =
      purchase_requisition_approval_logs.requisition_id
      and requisition.created_by = (select auth.uid())
      and requisition.status = 'pending_approval'
  )
);

grant insert on public.purchase_requisition_approval_logs
  to authenticated;
