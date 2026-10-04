-- Returned PRs keep the same document number and append a new submission audit event.
-- Row locking and status validation in save_purchase_requisition prevent concurrent duplicates.
drop index if exists public.purchase_requisition_approval_logs_one_submission_idx;
