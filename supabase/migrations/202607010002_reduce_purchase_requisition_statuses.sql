update public.purchase_requisitions
set status = case
  when status in ('approved', 'in_progress', 'closed') then 'approved'
  when status = 'cancelled' then 'cancelled'
  when status = 'rejected' then 'rejected'
  else 'pending_approval'
end
where status not in ('pending_approval', 'approved', 'cancelled', 'rejected');

alter table public.purchase_requisitions
  alter column status set default 'pending_approval';

alter table public.purchase_requisitions
  drop constraint if exists purchase_requisitions_status_check;

alter table public.purchase_requisitions
  add constraint purchase_requisitions_status_check
  check (status in ('pending_approval', 'approved', 'cancelled', 'rejected'));

drop index if exists public.purchase_requisitions_pending_work_idx;

create index if not exists purchase_requisitions_pending_work_idx
  on public.purchase_requisitions (document_date desc, id desc)
  where status in ('pending_approval', 'approved');
