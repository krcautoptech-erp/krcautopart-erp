create extension if not exists pg_trgm with schema extensions;

create sequence if not exists public.purchase_order_number_seq;

create table if not exists public.purchase_orders (
  id bigint generated always as identity primary key,
  po_number text not null unique,
  document_date date not null default current_date,
  vendor_id bigint not null references public.vendors (id),
  vendor_code text not null,
  vendor_name text not null,
  buyer_user_id uuid references auth.users (id) on delete set null,
  buyer_name text not null,
  credit_term_id bigint references public.vendor_credit_terms (id),
  credit_term_name text,
  payment_method_id bigint references public.vendor_payment_methods (id),
  payment_method_name text,
  tax_type_id bigint references public.vendor_tax_types (id),
  tax_type_name text,
  delivery_date date not null,
  delivery_address text,
  supplier_note text,
  terms_and_conditions text,
  status text not null default 'draft',
  pr_references text[] not null default '{}'::text[],
  pr_reference_text text not null default '',
  item_count integer not null default 0,
  ordered_total_qty numeric(18, 4) not null default 0,
  subtotal numeric(18, 2) not null default 0,
  discount_amount numeric(18, 2) not null default 0,
  tax_amount numeric(18, 2) not null default 0,
  grand_total numeric(18, 2) not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  submitted_at timestamptz,
  approved_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint purchase_orders_status_check check (
    status in (
      'draft',
      'pending_approval',
      'approved',
      'sent',
      'partially_received',
      'received',
      'cancelled',
      'rejected'
    )
  ),
  constraint purchase_orders_vendor_code_check
    check (char_length(btrim(vendor_code)) > 0),
  constraint purchase_orders_vendor_name_check
    check (char_length(btrim(vendor_name)) > 0),
  constraint purchase_orders_buyer_name_check
    check (char_length(btrim(buyer_name)) > 0),
  constraint purchase_orders_item_count_check check (item_count >= 0),
  constraint purchase_orders_qty_check check (ordered_total_qty >= 0),
  constraint purchase_orders_amounts_check check (
    subtotal >= 0
    and discount_amount >= 0
    and tax_amount >= 0
    and grand_total >= 0
  )
);

create table if not exists public.purchase_order_items (
  id bigint generated always as identity primary key,
  purchase_order_id bigint not null
    references public.purchase_orders (id) on delete cascade,
  line_no integer not null,
  requisition_item_id bigint not null
    references public.purchase_requisition_items (id),
  requisition_id bigint not null
    references public.purchase_requisitions (id),
  raw_material_id bigint references public.raw_materials (id),
  pr_number text not null,
  item_code text,
  item_name text not null,
  item_description text,
  quantity numeric(18, 4) not null,
  unit_name text not null,
  unit_price numeric(18, 4) not null,
  discount_amount numeric(18, 2) not null default 0,
  tax_rate numeric(7, 4) not null default 0,
  line_subtotal numeric(18, 2) generated always as (
    round(quantity * unit_price, 2)
  ) stored,
  tax_amount numeric(18, 2) generated always as (
    round(
      greatest(round(quantity * unit_price, 2) - discount_amount, 0)
      * tax_rate / 100,
      2
    )
  ) stored,
  line_total numeric(18, 2) generated always as (
    greatest(round(quantity * unit_price, 2) - discount_amount, 0)
    + round(
      greatest(round(quantity * unit_price, 2) - discount_amount, 0)
      * tax_rate / 100,
      2
    )
  ) stored,
  delivery_date date,
  remarks text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint purchase_order_items_line_no_check check (line_no > 0),
  constraint purchase_order_items_quantity_check check (quantity > 0),
  constraint purchase_order_items_unit_price_check check (unit_price >= 0),
  constraint purchase_order_items_discount_check check (
    discount_amount >= 0
    and discount_amount <= round(quantity * unit_price, 2)
  ),
  constraint purchase_order_items_tax_rate_check
    check (tax_rate >= 0 and tax_rate <= 100),
  constraint purchase_order_items_name_check
    check (char_length(btrim(item_name)) > 0),
  constraint purchase_order_items_unit_check
    check (char_length(btrim(unit_name)) > 0),
  constraint purchase_order_items_po_line_unique
    unique (purchase_order_id, line_no),
  constraint purchase_order_items_po_pr_line_unique
    unique (purchase_order_id, requisition_item_id)
);

create table if not exists public.purchase_order_status_logs (
  id bigint generated always as identity primary key,
  purchase_order_id bigint not null
    references public.purchase_orders (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_name text,
  note text,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_purchase_order_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.po_number is null or btrim(new.po_number) = '' then
    new.po_number := format(
      'PO-%s-%s',
      to_char(coalesce(new.document_date, current_date), 'YYYYMM'),
      lpad(nextval('public.purchase_order_number_seq')::text, 5, '0')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_orders_set_number on public.purchase_orders;
create trigger purchase_orders_set_number
before insert on public.purchase_orders
for each row execute function public.set_purchase_order_number();

drop trigger if exists purchase_orders_set_updated_at on public.purchase_orders;
create trigger purchase_orders_set_updated_at
before update on public.purchase_orders
for each row execute function public.set_updated_at();

drop trigger if exists purchase_order_items_set_updated_at
  on public.purchase_order_items;
create trigger purchase_order_items_set_updated_at
before update on public.purchase_order_items
for each row execute function public.set_updated_at();

create index if not exists purchase_orders_status_date_id_idx
  on public.purchase_orders (status, document_date desc, id desc);
create index if not exists purchase_orders_vendor_date_id_idx
  on public.purchase_orders (vendor_id, document_date desc, id desc);
create index if not exists purchase_orders_delivery_date_idx
  on public.purchase_orders (delivery_date, id desc);
create index if not exists purchase_orders_created_by_date_idx
  on public.purchase_orders (created_by, document_date desc, id desc);
create index if not exists purchase_orders_pr_references_idx
  on public.purchase_orders using gin (pr_references);
create index if not exists purchase_orders_pr_reference_text_trgm_idx
  on public.purchase_orders using gin (
    pr_reference_text extensions.gin_trgm_ops
  );
create index if not exists purchase_orders_open_work_idx
  on public.purchase_orders (document_date desc, id desc)
  where status in ('draft', 'pending_approval', 'approved', 'sent', 'partially_received');
create index if not exists purchase_orders_po_number_trgm_idx
  on public.purchase_orders using gin (po_number extensions.gin_trgm_ops);
create index if not exists purchase_orders_vendor_name_trgm_idx
  on public.purchase_orders using gin (vendor_name extensions.gin_trgm_ops);

create index if not exists purchase_order_items_po_id_idx
  on public.purchase_order_items (purchase_order_id, line_no);
create index if not exists purchase_order_items_pr_item_idx
  on public.purchase_order_items (requisition_item_id, purchase_order_id);
create index if not exists purchase_order_items_pr_id_idx
  on public.purchase_order_items (requisition_id, purchase_order_id);
create index if not exists purchase_order_items_material_idx
  on public.purchase_order_items (raw_material_id, purchase_order_id)
  where raw_material_id is not null;
create index if not exists purchase_order_status_logs_po_idx
  on public.purchase_order_status_logs (purchase_order_id, created_at desc);
create index if not exists purchase_requisitions_pr_number_trgm_idx
  on public.purchase_requisitions using gin (pr_number extensions.gin_trgm_ops);
create index if not exists purchase_requisition_items_code_trgm_idx
  on public.purchase_requisition_items using gin (item_code extensions.gin_trgm_ops);
create index if not exists purchase_requisition_items_name_trgm_idx
  on public.purchase_requisition_items using gin (item_name extensions.gin_trgm_ops);

insert into public.app_permissions (
  permission_code,
  permission_name,
  module_code,
  module_name,
  action_code,
  module_sort_order,
  sort_order
)
values
  ('po.view', 'ดูใบสั่งซื้อ', 'po', 'ใบสั่งซื้อ (PO)', 'view', 2, 1),
  ('po.create', 'สร้างใบสั่งซื้อ', 'po', 'ใบสั่งซื้อ (PO)', 'create', 2, 2),
  ('po.edit', 'แก้ไขใบสั่งซื้อ', 'po', 'ใบสั่งซื้อ (PO)', 'edit', 2, 3),
  ('po.delete', 'ลบใบสั่งซื้อ', 'po', 'ใบสั่งซื้อ (PO)', 'delete', 2, 4),
  ('po.approve', 'อนุมัติใบสั่งซื้อ', 'po', 'ใบสั่งซื้อ (PO)', 'approve', 2, 5),
  ('po.reject', 'ปฏิเสธใบสั่งซื้อ', 'po', 'ใบสั่งซื้อ (PO)', 'reject', 2, 6)
on conflict (permission_code) do update
set
  permission_name = excluded.permission_name,
  module_code = excluded.module_code,
  module_name = excluded.module_name,
  action_code = excluded.action_code,
  module_sort_order = excluded.module_sort_order,
  sort_order = excluded.sort_order;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
join public.app_permissions permission
  on permission.module_code = 'po'
where role.role_code = 'OWNER'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
join public.app_permissions permission
  on permission.permission_code in ('po.view', 'po.create', 'po.edit', 'po.delete')
where role.role_code = 'ADMIN'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
join public.app_permissions permission
  on permission.permission_code in ('po.view', 'po.create', 'po.edit')
where role.role_code in ('MANAGER', 'STAFF')
on conflict do nothing;

create or replace function public.create_purchase_order(
  p_document_date date,
  p_vendor_id bigint,
  p_delivery_date date,
  p_delivery_address text,
  p_supplier_note text,
  p_terms_and_conditions text,
  p_status text,
  p_items jsonb
)
returns table (
  purchase_order_id bigint,
  purchase_order_number text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_name text;
  v_allocated_qty numeric(18, 4);
  v_credit_term public.vendor_credit_terms%rowtype;
  v_item jsonb;
  v_line_no integer := 0;
  v_payment_method public.vendor_payment_methods%rowtype;
  v_po public.purchase_orders%rowtype;
  v_pr_item record;
  v_requested_qty numeric(18, 4);
  v_tax_type public.vendor_tax_types%rowtype;
  v_user_id uuid := (select auth.uid());
  v_vendor public.vendors%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not public.authorize('po.create') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_status not in ('draft', 'pending_approval') then
    raise exception 'invalid_purchase_order_status' using errcode = '22023';
  end if;
  if p_document_date is null or p_delivery_date is null then
    raise exception 'document_and_delivery_dates_required' using errcode = '22023';
  end if;
  if p_delivery_date < p_document_date then
    raise exception 'delivery_date_before_document_date' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
    or jsonb_array_length(p_items) > 200
  then
    raise exception 'invalid_purchase_order_items' using errcode = '22023';
  end if;
  if char_length(coalesce(p_delivery_address, '')) > 1000
    or char_length(coalesce(p_supplier_note, '')) > 1000
    or char_length(coalesce(p_terms_and_conditions, '')) > 2000
  then
    raise exception 'purchase_order_text_too_long' using errcode = '22001';
  end if;

  select vendor.*
  into v_vendor
  from public.vendors vendor
  where vendor.id = p_vendor_id;
  if not found then
    raise exception 'vendor_not_found' using errcode = 'P0002';
  end if;

  select term.* into v_credit_term
  from public.vendor_credit_terms term
  where term.id = v_vendor.credit_term_id;
  select method.* into v_payment_method
  from public.vendor_payment_methods method
  where method.id = v_vendor.payment_method_id;
  select tax.* into v_tax_type
  from public.vendor_tax_types tax
  where tax.id = v_vendor.tax_type_id;

  select coalesce(
    nullif(concat_ws(' ', profile.first_name, profile.last_name), ''),
    nullif(app_user.raw_app_meta_data ->> 'full_name', ''),
    nullif(app_user.email, ''),
    'ผู้ใช้งาน ERP'
  )
  into v_actor_name
  from auth.users app_user
  left join public.user_profiles profile on profile.user_id = app_user.id
  where app_user.id = v_user_id;

  -- A stable lock order prevents deadlocks when two POs contain overlapping PR lines.
  perform pr_item.id
  from public.purchase_requisition_items pr_item
  where pr_item.id in (
    select distinct (item ->> 'requisition_item_id')::bigint
    from jsonb_array_elements(p_items) item
  )
  order by pr_item.id
  for update;

  insert into public.purchase_orders (
    po_number,
    document_date,
    vendor_id,
    vendor_code,
    vendor_name,
    buyer_user_id,
    buyer_name,
    credit_term_id,
    credit_term_name,
    payment_method_id,
    payment_method_name,
    tax_type_id,
    tax_type_name,
    delivery_date,
    delivery_address,
    supplier_note,
    terms_and_conditions,
    status,
    created_by,
    updated_by,
    submitted_at
  )
  values (
    null,
    p_document_date,
    v_vendor.id,
    v_vendor.vendor_code,
    v_vendor.vendor_name,
    v_user_id,
    v_actor_name,
    v_credit_term.id,
    v_credit_term.name,
    v_payment_method.id,
    v_payment_method.name,
    v_tax_type.id,
    v_tax_type.name,
    p_delivery_date,
    nullif(btrim(p_delivery_address), ''),
    nullif(btrim(p_supplier_note), ''),
    nullif(btrim(p_terms_and_conditions), ''),
    p_status,
    v_user_id,
    v_user_id,
    case when p_status = 'pending_approval' then timezone('utc', now()) end
  )
  returning * into v_po;

  for v_item in
    select item
    from jsonb_array_elements(p_items) item
    order by (item ->> 'requisition_item_id')::bigint
  loop
    v_line_no := v_line_no + 1;
    v_requested_qty := nullif(v_item ->> 'quantity', '')::numeric;

    select
      item.id,
      item.requisition_id,
      item.raw_material_id,
      item.item_code,
      item.item_name,
      item.item_description,
      item.quantity,
      item.unit_name,
      item.needed_by_date,
      requisition.pr_number
    into v_pr_item
    from public.purchase_requisition_items item
    join public.purchase_requisitions requisition
      on requisition.id = item.requisition_id
    where item.id = (v_item ->> 'requisition_item_id')::bigint
      and requisition.status = 'approved';

    if not found then
      raise exception 'approved_pr_item_not_found' using errcode = 'P0002';
    end if;
    if v_requested_qty is null or v_requested_qty <= 0 then
      raise exception 'invalid_order_quantity' using errcode = '22023';
    end if;

    select coalesce(sum(po_item.quantity), 0)
    into v_allocated_qty
    from public.purchase_order_items po_item
    join public.purchase_orders purchase_order
      on purchase_order.id = po_item.purchase_order_id
    where po_item.requisition_item_id = v_pr_item.id
      and purchase_order.status not in ('cancelled', 'rejected');

    if v_allocated_qty + v_requested_qty > v_pr_item.quantity then
      raise exception 'pr_quantity_exceeded:%', v_pr_item.pr_number
        using errcode = '23514';
    end if;

    insert into public.purchase_order_items (
      purchase_order_id,
      line_no,
      requisition_item_id,
      requisition_id,
      raw_material_id,
      pr_number,
      item_code,
      item_name,
      item_description,
      quantity,
      unit_name,
      unit_price,
      discount_amount,
      tax_rate,
      delivery_date,
      remarks
    )
    values (
      v_po.id,
      v_line_no,
      v_pr_item.id,
      v_pr_item.requisition_id,
      v_pr_item.raw_material_id,
      v_pr_item.pr_number,
      v_pr_item.item_code,
      v_pr_item.item_name,
      v_pr_item.item_description,
      v_requested_qty,
      v_pr_item.unit_name,
      coalesce(nullif(v_item ->> 'unit_price', '')::numeric, 0),
      coalesce(nullif(v_item ->> 'discount_amount', '')::numeric, 0),
      coalesce(
        nullif(v_item ->> 'tax_rate', '')::numeric,
        v_tax_type.tax_rate,
        0
      ),
      coalesce(
        nullif(v_item ->> 'delivery_date', '')::date,
        p_delivery_date
      ),
      nullif(btrim(v_item ->> 'remarks'), '')
    );
  end loop;

  update public.purchase_orders purchase_order
  set
    pr_references = summary.pr_references,
    pr_reference_text = array_to_string(summary.pr_references, ', '),
    item_count = summary.item_count,
    ordered_total_qty = summary.total_qty,
    subtotal = summary.subtotal,
    discount_amount = summary.discount_amount,
    tax_amount = summary.tax_amount,
    grand_total = summary.grand_total
  from (
    select
      array_agg(distinct pr_number order by pr_number) as pr_references,
      count(*)::integer as item_count,
      sum(quantity) as total_qty,
      sum(line_subtotal) as subtotal,
      sum(discount_amount) as discount_amount,
      sum(tax_amount) as tax_amount,
      sum(line_total) as grand_total
    from public.purchase_order_items
    where purchase_order_id = v_po.id
  ) summary
  where purchase_order.id = v_po.id;

  insert into public.purchase_order_status_logs (
    purchase_order_id,
    to_status,
    actor_user_id,
    actor_name
  )
  values (v_po.id, p_status, v_user_id, v_actor_name);

  return query select v_po.id, v_po.po_number;
end;
$$;

revoke all on function public.create_purchase_order(
  date, bigint, date, text, text, text, text, jsonb
) from public;
grant execute on function public.create_purchase_order(
  date, bigint, date, text, text, text, text, jsonb
) to authenticated;

create or replace function public.search_purchase_order_source_items(
  p_search text default null,
  p_limit integer default 80
)
returns table (
  requisition_item_id bigint,
  requisition_id bigint,
  pr_number text,
  item_code text,
  item_name text,
  item_description text,
  requested_quantity numeric,
  available_quantity numeric,
  unit_name text,
  needed_by_date date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    item.id,
    item.requisition_id,
    requisition.pr_number,
    item.item_code,
    item.item_name,
    item.item_description,
    item.quantity,
    item.quantity - coalesce(allocated.quantity, 0),
    item.unit_name,
    item.needed_by_date
  from public.purchase_requisition_items item
  join public.purchase_requisitions requisition
    on requisition.id = item.requisition_id
    and requisition.status = 'approved'
  left join lateral (
    select sum(po_item.quantity) as quantity
    from public.purchase_order_items po_item
    join public.purchase_orders purchase_order
      on purchase_order.id = po_item.purchase_order_id
    where po_item.requisition_item_id = item.id
      and purchase_order.status not in ('cancelled', 'rejected')
  ) allocated on true
  where public.authorize('po.create')
    and item.quantity - coalesce(allocated.quantity, 0) > 0
    and (
      nullif(btrim(p_search), '') is null
      or requisition.pr_number ilike '%' || btrim(p_search) || '%'
      or coalesce(item.item_code, '') ilike '%' || btrim(p_search) || '%'
      or item.item_name ilike '%' || btrim(p_search) || '%'
      or coalesce(item.item_description, '') ilike '%' || btrim(p_search) || '%'
    )
  order by requisition.document_date desc, requisition.id desc, item.line_no
  limit least(greatest(coalesce(p_limit, 80), 1), 200);
$$;

revoke all on function public.search_purchase_order_source_items(text, integer)
  from public;
grant execute on function public.search_purchase_order_source_items(text, integer)
  to authenticated;

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.purchase_order_status_logs enable row level security;

create policy "Authorized users can read purchase orders"
on public.purchase_orders for select
to authenticated
using ((select public.authorize('po.view')));

create policy "Authorized users can read purchase order items"
on public.purchase_order_items for select
to authenticated
using (
  (select public.authorize('po.view'))
  and exists (
    select 1
    from public.purchase_orders purchase_order
    where purchase_order.id = purchase_order_items.purchase_order_id
  )
);

create policy "Authorized users can read purchase order status logs"
on public.purchase_order_status_logs for select
to authenticated
using (
  (select public.authorize('po.view'))
  and exists (
    select 1
    from public.purchase_orders purchase_order
    where purchase_order.id = purchase_order_status_logs.purchase_order_id
  )
);

grant select on public.purchase_orders to authenticated;
grant select on public.purchase_order_items to authenticated;
grant select on public.purchase_order_status_logs to authenticated;
revoke insert, update, delete on public.purchase_orders from authenticated;
revoke insert, update, delete on public.purchase_order_items from authenticated;
revoke insert, update, delete on public.purchase_order_status_logs
  from authenticated;
