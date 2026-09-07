alter table public.app_permissions
  drop constraint if exists app_permissions_action_check;

alter table public.app_permissions
  add constraint app_permissions_action_check
  check (
    action_code in (
      'view',
      'create',
      'edit',
      'delete',
      'approve',
      'reject',
      'cancel',
      'manage'
    )
  );

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
  ('pr.cancel', 'ยกเลิกใบขอซื้อ', 'pr', 'ใบขอซื้อ (PR)', 'cancel', 1, 7),
  ('po.cancel', 'ยกเลิกใบสั่งซื้อ', 'po', 'ใบสั่งซื้อ (PO)', 'cancel', 2, 7)
on conflict (permission_code) do update
set
  permission_name = excluded.permission_name,
  module_code = excluded.module_code,
  module_name = excluded.module_name,
  action_code = excluded.action_code,
  module_sort_order = excluded.module_sort_order,
  sort_order = excluded.sort_order,
  status = 'active',
  updated_at = now();

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
join public.app_permissions permission
  on permission.permission_code in ('pr.cancel', 'po.cancel')
where role.is_owner
on conflict do nothing;

create or replace function public.cancel_purchase_requisition(
  p_requisition_id bigint,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_name text;
  v_reason text := regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g');
  v_requisition public.purchase_requisitions%rowtype;
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not public.authorize('pr.cancel') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if char_length(v_reason) < 10 then
    raise exception 'cancellation_reason_too_short' using errcode = '22023';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'cancellation_reason_too_long' using errcode = '22001';
  end if;

  select requisition.*
  into v_requisition
  from public.purchase_requisitions requisition
  where requisition.id = p_requisition_id
  for update;

  if not found then
    raise exception 'purchase_requisition_not_found' using errcode = 'P0002';
  end if;
  if v_requisition.status not in ('pending_approval', 'approved') then
    raise exception 'purchase_requisition_cannot_be_cancelled:%',
      v_requisition.status using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.purchase_order_items po_item
    join public.purchase_orders purchase_order
      on purchase_order.id = po_item.purchase_order_id
    where po_item.requisition_id = p_requisition_id
      and purchase_order.status not in ('cancelled', 'rejected')
  ) then
    raise exception 'purchase_requisition_has_active_purchase_order'
      using errcode = '55000';
  end if;

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

  update public.purchase_requisitions
  set
    status = 'cancelled',
    cancelled_at = timezone('utc', now()),
    updated_at = timezone('utc', now()),
    updated_by = v_user_id
  where id = p_requisition_id;

  insert into public.purchase_requisition_approval_logs (
    requisition_id,
    action,
    actor_name,
    actor_user_id,
    note
  )
  values (
    p_requisition_id,
    'cancelled',
    v_actor_name,
    v_user_id,
    v_reason
  );
end;
$$;

create or replace function public.cancel_purchase_order(
  p_purchase_order_id bigint,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_name text;
  v_order public.purchase_orders%rowtype;
  v_reason text := regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g');
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not public.authorize('po.cancel') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if char_length(v_reason) < 10 then
    raise exception 'cancellation_reason_too_short' using errcode = '22023';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'cancellation_reason_too_long' using errcode = '22001';
  end if;

  select purchase_order.*
  into v_order
  from public.purchase_orders purchase_order
  where purchase_order.id = p_purchase_order_id
  for update;

  if not found then
    raise exception 'purchase_order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('pending_approval', 'approved', 'sent') then
    raise exception 'purchase_order_cannot_be_cancelled:%',
      v_order.status using errcode = '55000';
  end if;

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

  update public.purchase_orders
  set
    status = 'cancelled',
    cancelled_at = timezone('utc', now()),
    updated_at = timezone('utc', now()),
    updated_by = v_user_id
  where id = p_purchase_order_id;

  insert into public.purchase_order_status_logs (
    purchase_order_id,
    from_status,
    to_status,
    actor_user_id,
    actor_name,
    note
  )
  values (
    p_purchase_order_id,
    v_order.status,
    'cancelled',
    v_user_id,
    v_actor_name,
    v_reason
  );
end;
$$;

revoke all on function public.cancel_purchase_requisition(bigint, text)
  from public, anon;
grant execute on function public.cancel_purchase_requisition(bigint, text)
  to authenticated;

revoke all on function public.cancel_purchase_order(bigint, text)
  from public, anon;
grant execute on function public.cancel_purchase_order(bigint, text)
  to authenticated;

create or replace function public.update_purchase_order(
  p_purchase_order_id bigint,
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
  v_order public.purchase_orders%rowtype;
  v_payment_method public.vendor_payment_methods%rowtype;
  v_pr_item record;
  v_requested_qty numeric(18, 4);
  v_tax_type public.vendor_tax_types%rowtype;
  v_user_id uuid := (select auth.uid());
  v_vendor public.vendors%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '28000';
  end if;
  if not public.authorize('po.edit') then
    raise exception 'permission_denied' using errcode = '42501';
  end if;
  if p_status not in ('draft', 'pending_approval') then
    raise exception 'invalid_purchase_order_status' using errcode = '22023';
  end if;
  if p_document_date is null or p_delivery_date is null
    or p_delivery_date < p_document_date
  then
    raise exception 'delivery_date_before_document_date' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) = 0
    or jsonb_array_length(p_items) > 200
  then
    raise exception 'invalid_purchase_order_items' using errcode = '22023';
  end if;

  select purchase_order.*
  into v_order
  from public.purchase_orders purchase_order
  where purchase_order.id = p_purchase_order_id
  for update;

  if not found then
    raise exception 'purchase_order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status not in ('draft', 'pending_approval') then
    raise exception 'purchase_order_cannot_be_edited:%',
      v_order.status using errcode = '55000';
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

  perform pr_item.id
  from public.purchase_requisition_items pr_item
  where pr_item.id in (
    select distinct (item ->> 'requisition_item_id')::bigint
    from jsonb_array_elements(p_items) item
    union
    select existing.requisition_item_id
    from public.purchase_order_items existing
    where existing.purchase_order_id = p_purchase_order_id
  )
  order by pr_item.id
  for update;

  delete from public.purchase_order_items order_item
  where order_item.purchase_order_id = p_purchase_order_id;

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
      and purchase_order.id <> p_purchase_order_id
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
      p_purchase_order_id,
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
      coalesce(nullif(v_item ->> 'delivery_date', '')::date, p_delivery_date),
      nullif(btrim(v_item ->> 'remarks'), '')
    );
  end loop;

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

  update public.purchase_orders purchase_order
  set
    document_date = p_document_date,
    vendor_id = v_vendor.id,
    vendor_code = v_vendor.vendor_code,
    vendor_name = v_vendor.vendor_name,
    credit_term_id = v_credit_term.id,
    credit_term_name = v_credit_term.name,
    payment_method_id = v_payment_method.id,
    payment_method_name = v_payment_method.name,
    tax_type_id = v_tax_type.id,
    tax_type_name = v_tax_type.name,
    delivery_date = p_delivery_date,
    delivery_address = nullif(btrim(p_delivery_address), ''),
    supplier_note = nullif(btrim(p_supplier_note), ''),
    terms_and_conditions = nullif(btrim(p_terms_and_conditions), ''),
    status = p_status,
    submitted_at = case
      when p_status = 'pending_approval'
        then coalesce(purchase_order.submitted_at, timezone('utc', now()))
      else null
    end,
    updated_by = v_user_id,
    updated_at = timezone('utc', now()),
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
    from public.purchase_order_items order_item
    where order_item.purchase_order_id = p_purchase_order_id
  ) summary
  where purchase_order.id = p_purchase_order_id;

  insert into public.purchase_order_status_logs (
    purchase_order_id,
    from_status,
    to_status,
    actor_user_id,
    actor_name,
    note
  )
  values (
    p_purchase_order_id,
    v_order.status,
    p_status,
    v_user_id,
    v_actor_name,
    'แก้ไขใบสั่งซื้อ'
  );

  return query
  select p_purchase_order_id, v_order.po_number;
end;
$$;

revoke all on function public.update_purchase_order(
  bigint, date, bigint, date, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.update_purchase_order(
  bigint, date, bigint, date, text, text, text, text, jsonb
) to authenticated;
