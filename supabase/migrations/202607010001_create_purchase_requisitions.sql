create table if not exists public.purchase_requisitions (
  id bigint generated always as identity primary key,
  pr_number text not null unique,
  document_date date not null default current_date,
  requester_name text not null,
  department_name text not null,
  needed_by_date date null,
  status text not null default 'draft',
  requested_item_count integer not null default 0,
  requested_total_qty numeric(14, 2) not null default 0,
  remarks text null,
  created_by uuid null references auth.users (id) on delete set null,
  updated_by uuid null references auth.users (id) on delete set null,
  submitted_at timestamptz null,
  approved_at timestamptz null,
  rejected_at timestamptz null,
  closed_at timestamptz null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint purchase_requisitions_status_check check (
    status in (
      'draft',
      'pending_approval',
      'approved',
      'in_progress',
      'closed',
      'cancelled',
      'rejected'
    )
  ),
  constraint purchase_requisitions_requester_name_check check (char_length(trim(requester_name)) > 0),
  constraint purchase_requisitions_department_name_check check (char_length(trim(department_name)) > 0),
  constraint purchase_requisitions_item_count_check check (requested_item_count >= 0),
  constraint purchase_requisitions_total_qty_check check (requested_total_qty >= 0)
);

create table if not exists public.purchase_requisition_items (
  id bigint generated always as identity primary key,
  requisition_id bigint not null references public.purchase_requisitions (id) on delete cascade,
  line_no integer not null,
  item_code text null,
  item_name text not null,
  item_description text null,
  quantity numeric(14, 2) not null,
  unit_name text not null,
  needed_by_date date null,
  remarks text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint purchase_requisition_items_line_no_check check (line_no > 0),
  constraint purchase_requisition_items_quantity_check check (quantity > 0),
  constraint purchase_requisition_items_item_name_check check (char_length(trim(item_name)) > 0),
  constraint purchase_requisition_items_unit_name_check check (char_length(trim(unit_name)) > 0),
  constraint purchase_requisition_items_requisition_line_unique unique (requisition_id, line_no)
);

create table if not exists public.purchase_requisition_approval_logs (
  id bigint generated always as identity primary key,
  requisition_id bigint not null references public.purchase_requisitions (id) on delete cascade,
  action text not null,
  actor_name text null,
  actor_user_id uuid null references auth.users (id) on delete set null,
  note text null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint purchase_requisition_approval_logs_action_check check (
    action in (
      'created',
      'submitted',
      'approved',
      'rejected',
      'returned',
      'cancelled',
      'edited',
      'printed'
    )
  )
);

create sequence if not exists public.purchase_requisition_number_seq;

create or replace function public.set_purchase_requisition_number()
returns trigger
language plpgsql
as $$
begin
  if new.pr_number is null or btrim(new.pr_number) = '' then
    new.pr_number := format(
      'PR-%s-%05s',
      to_char(coalesce(new.document_date, current_date), 'YYYYMM'),
      nextval('public.purchase_requisition_number_seq')
    );
  end if;

  return new;
end;
$$;

create or replace function public.recompute_purchase_requisition_totals()
returns trigger
language plpgsql
as $$
declare
  target_requisition_id bigint;
begin
  target_requisition_id := coalesce(new.requisition_id, old.requisition_id);

  update public.purchase_requisitions
  set
    requested_item_count = (
      select count(*)
      from public.purchase_requisition_items
      where requisition_id = target_requisition_id
    ),
    requested_total_qty = coalesce((
      select sum(quantity)
      from public.purchase_requisition_items
      where requisition_id = target_requisition_id
    ), 0),
    updated_at = timezone('utc', now())
  where id = target_requisition_id;

  return null;
end;
$$;

drop trigger if exists set_purchase_requisition_number_before_insert on public.purchase_requisitions;
create trigger set_purchase_requisition_number_before_insert
before insert on public.purchase_requisitions
for each row
execute function public.set_purchase_requisition_number();

drop trigger if exists purchase_requisitions_set_updated_at on public.purchase_requisitions;
create trigger purchase_requisitions_set_updated_at
before update on public.purchase_requisitions
for each row
execute function public.set_updated_at();

drop trigger if exists purchase_requisition_items_set_updated_at on public.purchase_requisition_items;
create trigger purchase_requisition_items_set_updated_at
before update on public.purchase_requisition_items
for each row
execute function public.set_updated_at();

drop trigger if exists purchase_requisition_items_recompute_after_insert on public.purchase_requisition_items;
create trigger purchase_requisition_items_recompute_after_insert
after insert on public.purchase_requisition_items
for each row
execute function public.recompute_purchase_requisition_totals();

drop trigger if exists purchase_requisition_items_recompute_after_update on public.purchase_requisition_items;
create trigger purchase_requisition_items_recompute_after_update
after update on public.purchase_requisition_items
for each row
execute function public.recompute_purchase_requisition_totals();

drop trigger if exists purchase_requisition_items_recompute_after_delete on public.purchase_requisition_items;
create trigger purchase_requisition_items_recompute_after_delete
after delete on public.purchase_requisition_items
for each row
execute function public.recompute_purchase_requisition_totals();

create index if not exists purchase_requisitions_status_document_date_idx
  on public.purchase_requisitions (status, document_date desc, id desc);

create index if not exists purchase_requisitions_department_status_date_idx
  on public.purchase_requisitions (department_name, status, document_date desc, id desc);

create index if not exists purchase_requisitions_needed_by_date_idx
  on public.purchase_requisitions (needed_by_date, id desc);

create index if not exists purchase_requisitions_pending_work_idx
  on public.purchase_requisitions (document_date desc, id desc)
  where status in ('pending_approval', 'approved', 'in_progress');

create index if not exists purchase_requisition_items_requisition_id_idx
  on public.purchase_requisition_items (requisition_id, line_no);

create index if not exists purchase_requisition_approval_logs_requisition_id_idx
  on public.purchase_requisition_approval_logs (requisition_id, created_at desc);

alter table public.purchase_requisitions enable row level security;
alter table public.purchase_requisition_items enable row level security;
alter table public.purchase_requisition_approval_logs enable row level security;

drop policy if exists "Authenticated users can manage purchase requisitions" on public.purchase_requisitions;
create policy "Authenticated users can manage purchase requisitions"
on public.purchase_requisitions
for all
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

drop policy if exists "Authenticated users can manage purchase requisition items" on public.purchase_requisition_items;
create policy "Authenticated users can manage purchase requisition items"
on public.purchase_requisition_items
for all
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

drop policy if exists "Authenticated users can manage purchase requisition approval logs" on public.purchase_requisition_approval_logs;
create policy "Authenticated users can manage purchase requisition approval logs"
on public.purchase_requisition_approval_logs
for all
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);
