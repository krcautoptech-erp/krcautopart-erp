-- Seed permissions for inventory
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
  ('inventory.view', 'ดูคลังสินค้าและรับเข้า', 'inventory', 'คลังสินค้า', 'view', 5, 1),
  ('inventory.create_gr', 'สร้างใบรับสินค้า', 'inventory', 'คลังสินค้า', 'create', 5, 2),
  ('inventory.cancel_gr', 'ยกเลิกใบรับสินค้า', 'inventory', 'คลังสินค้า', 'cancel', 5, 3)
on conflict (permission_code) do update
set
  permission_name = excluded.permission_name,
  module_code = excluded.module_code,
  module_name = excluded.module_name,
  action_code = excluded.action_code,
  module_sort_order = excluded.module_sort_order,
  sort_order = excluded.sort_order;

-- Map permissions to roles
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
cross join public.app_permissions permission
where permission.permission_code in ('inventory.view', 'inventory.create_gr', 'inventory.cancel_gr')
  and role.role_code in ('OWNER', 'ADMIN', 'MANAGER')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.app_roles role
join public.app_permissions permission
  on permission.permission_code = 'inventory.view'
where role.role_code = 'STAFF'
on conflict do nothing;

-- Add received_qty to purchase_order_items if it does not exist
alter table public.purchase_order_items 
  add column if not exists received_qty numeric(18, 4) not null default 0;

-- 1. Create Goods Receipts Table (Header)
create table if not exists public.goods_receipts (
  id bigint generated always as identity primary key,
  gr_number text not null unique,
  document_date date not null default current_date,
  purchase_order_id bigint not null references public.purchase_orders (id) on delete restrict,
  vendor_id bigint not null references public.vendors (id) on delete restrict,
  vendor_code text not null,
  vendor_name text not null,
  delivery_note_no text, -- Delivery Note or Invoice Number from Supplier
  status text not null default 'draft',
  remarks text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  
  constraint goods_receipts_status_check check (status in ('draft', 'posted', 'cancelled')),
  constraint goods_receipts_gr_number_not_blank check (length(btrim(gr_number)) > 0),
  constraint goods_receipts_vendor_code_not_blank check (length(btrim(vendor_code)) > 0),
  constraint goods_receipts_vendor_name_not_blank check (length(btrim(vendor_name)) > 0)
);

-- 2. Create Goods Receipt Items Table (Detail)
create table if not exists public.goods_receipt_items (
  id bigint generated always as identity primary key,
  goods_receipt_id bigint not null references public.goods_receipts (id) on delete cascade,
  line_no integer not null,
  purchase_order_item_id bigint not null references public.purchase_order_items (id) on delete restrict,
  raw_material_id bigint not null references public.raw_materials (id) on delete restrict,
  item_code text not null,
  item_name text not null,
  quantity_ordered numeric(18, 4) not null,
  quantity_received numeric(18, 4) not null,
  unit_name text not null,
  warehouse_id bigint not null references public.raw_material_warehouses (id) on delete restrict,
  remarks text,
  
  constraint goods_receipt_items_qty_received_check check (quantity_received >= 0),
  constraint goods_receipt_items_line_no_check check (line_no > 0),
  constraint goods_receipt_items_item_code_not_blank check (length(btrim(item_code)) > 0),
  constraint goods_receipt_items_item_name_not_blank check (length(btrim(item_name)) > 0),
  constraint goods_receipt_items_unit_name_not_blank check (length(btrim(unit_name)) > 0)
);

-- 3. Create Raw Material Stock Tables (Inventory Ledger / Stock Card)
create table if not exists public.inventory_transactions (
  id bigint generated always as identity primary key,
  raw_material_id bigint not null references public.raw_materials (id) on delete restrict,
  warehouse_id bigint not null references public.raw_material_warehouses (id) on delete restrict,
  transaction_type text not null, -- 'receipt', 'issue', 'return', 'adjustment'
  reference_doc_type text not null, -- 'goods_receipt', 'purchase_return', 'stock_adjustment'
  reference_doc_number text not null, -- Document number e.g., GR-202607-0001
  quantity_change numeric(18, 4) not null, -- positive for receipts, negative for issues
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  
  constraint inventory_transactions_qty_check check (quantity_change <> 0),
  constraint inventory_transactions_type_check check (transaction_type in ('receipt', 'issue', 'return', 'adjustment')),
  constraint inventory_transactions_doc_type_check check (reference_doc_type in ('goods_receipt', 'purchase_return', 'production_issue', 'stock_adjustment')),
  constraint inventory_transactions_doc_number_not_blank check (length(btrim(reference_doc_number)) > 0)
);

create table if not exists public.inventory_balances (
  raw_material_id bigint not null references public.raw_materials (id) on delete restrict,
  warehouse_id bigint not null references public.raw_material_warehouses (id) on delete restrict,
  on_hand_qty numeric(18, 4) not null default 0,
  allocated_qty numeric(18, 4) not null default 0,
  available_qty numeric(18, 4) generated always as (on_hand_qty - allocated_qty) stored,
  updated_at timestamptz not null default timezone('utc', now()),
  
  primary key (raw_material_id, warehouse_id),
  constraint inventory_balances_on_hand_check check (on_hand_qty >= 0)
);

-- 4. Create Finished Goods (FG) Stock Tables
create table if not exists public.product_transactions (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id) on delete restrict, -- product_id is uuid!
  warehouse_id bigint not null references public.raw_material_warehouses (id) on delete restrict, -- uses same warehouse table
  transaction_type text not null, -- 'receipt', 'issue', 'return', 'adjustment'
  reference_doc_type text not null, -- 'production_receipt', 'sales_shipment', 'stock_adjustment'
  reference_doc_number text not null, -- Document number e.g., PRN-202607-0001
  quantity_change numeric(18, 4) not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  
  constraint product_transactions_qty_check check (quantity_change <> 0),
  constraint product_transactions_type_check check (transaction_type in ('receipt', 'issue', 'return', 'adjustment')),
  constraint product_transactions_doc_type_check check (reference_doc_type in ('production_receipt', 'sales_shipment', 'stock_adjustment')),
  constraint product_transactions_doc_number_not_blank check (length(btrim(reference_doc_number)) > 0)
);

create table if not exists public.product_balances (
  product_id uuid not null references public.products (id) on delete restrict, -- uuid!
  warehouse_id bigint not null references public.raw_material_warehouses (id) on delete restrict,
  on_hand_qty numeric(18, 4) not null default 0,
  allocated_qty numeric(18, 4) not null default 0,
  available_qty numeric(18, 4) generated always as (on_hand_qty - allocated_qty) stored,
  updated_at timestamptz not null default timezone('utc', now()),
  
  primary key (product_id, warehouse_id),
  constraint product_balances_on_hand_check check (on_hand_qty >= 0)
);

-- 5. Foreign Key Indexes for Query Performance
create index if not exists goods_receipts_po_id_idx on public.goods_receipts (purchase_order_id);
create index if not exists goods_receipts_vendor_id_idx on public.goods_receipts (vendor_id);
create index if not exists goods_receipt_items_gr_id_idx on public.goods_receipt_items (goods_receipt_id);
create index if not exists goods_receipt_items_po_item_id_idx on public.goods_receipt_items (purchase_order_item_id);
create index if not exists goods_receipt_items_material_id_idx on public.goods_receipt_items (raw_material_id);
create index if not exists goods_receipt_items_wh_id_idx on public.goods_receipt_items (warehouse_id);

create index if not exists inventory_transactions_material_idx on public.inventory_transactions (raw_material_id);
create index if not exists inventory_transactions_wh_idx on public.inventory_transactions (warehouse_id);
create index if not exists product_transactions_product_idx on public.product_transactions (product_id);
create index if not exists product_transactions_wh_idx on public.product_transactions (warehouse_id);

-- 6. Trigger Functions for Automatic Stock Balance Sync
create or replace function public.sync_inventory_balances()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.inventory_balances (raw_material_id, warehouse_id, on_hand_qty, updated_at)
    values (new.raw_material_id, new.warehouse_id, new.quantity_change, now())
    on conflict (raw_material_id, warehouse_id) do update
    set on_hand_qty = public.inventory_balances.on_hand_qty + excluded.on_hand_qty,
        updated_at = now();
    return new;
  elsif tg_op = 'UPDATE' then
    if old.raw_material_id <> new.raw_material_id or old.warehouse_id <> new.warehouse_id then
      update public.inventory_balances
      set on_hand_qty = on_hand_qty - old.quantity_change,
          updated_at = now()
      where raw_material_id = old.raw_material_id and warehouse_id = old.warehouse_id;

      insert into public.inventory_balances (raw_material_id, warehouse_id, on_hand_qty, updated_at)
      values (new.raw_material_id, new.warehouse_id, new.quantity_change, now())
      on conflict (raw_material_id, warehouse_id) do update
      set on_hand_qty = public.inventory_balances.on_hand_qty + excluded.on_hand_qty,
          updated_at = now();
    else
      update public.inventory_balances
      set on_hand_qty = on_hand_qty - old.quantity_change + new.quantity_change,
          updated_at = now()
      where raw_material_id = new.raw_material_id and warehouse_id = new.warehouse_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    update public.inventory_balances
    set on_hand_qty = on_hand_qty - old.quantity_change,
        updated_at = now()
    where raw_material_id = old.raw_material_id and warehouse_id = old.warehouse_id;
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.sync_product_balances()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.product_balances (product_id, warehouse_id, on_hand_qty, updated_at)
    values (new.product_id, new.warehouse_id, new.quantity_change, now())
    on conflict (product_id, warehouse_id) do update
    set on_hand_qty = public.product_balances.on_hand_qty + excluded.on_hand_qty,
        updated_at = now();
    return new;
  elsif tg_op = 'UPDATE' then
    if old.product_id <> new.product_id or old.warehouse_id <> new.warehouse_id then
      update public.product_balances
      set on_hand_qty = on_hand_qty - old.quantity_change,
          updated_at = now()
      where product_id = old.product_id and warehouse_id = old.warehouse_id;

      insert into public.product_balances (product_id, warehouse_id, on_hand_qty, updated_at)
      values (new.product_id, new.warehouse_id, new.quantity_change, now())
      on conflict (product_id, warehouse_id) do update
      set on_hand_qty = public.product_balances.on_hand_qty + excluded.on_hand_qty,
          updated_at = now();
    else
      update public.product_balances
      set on_hand_qty = on_hand_qty - old.quantity_change + new.quantity_change,
          updated_at = now()
      where product_id = new.product_id and warehouse_id = new.warehouse_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    update public.product_balances
    set on_hand_qty = on_hand_qty - old.quantity_change,
        updated_at = now()
    where product_id = old.product_id and warehouse_id = old.warehouse_id;
    return old;
  end if;
  return null;
end;
$$;

-- Create Triggers
drop trigger if exists trigger_sync_inventory_balances on public.inventory_transactions;
create trigger trigger_sync_inventory_balances
after insert or update or delete on public.inventory_transactions
for each row execute function public.sync_inventory_balances();

drop trigger if exists trigger_sync_product_balances on public.product_transactions;
create trigger trigger_sync_product_balances
after insert or update or delete on public.product_transactions
for each row execute function public.sync_product_balances();

-- Trigger for updated_at in goods_receipts
drop trigger if exists set_goods_receipts_updated_at on public.goods_receipts;
create trigger set_goods_receipts_updated_at
before update on public.goods_receipts
for each row execute function public.set_updated_at();

-- 7. RLS Configuration and Grants (Supabase Hardening)
alter table public.goods_receipts enable row level security;
alter table public.goods_receipt_items enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.product_transactions enable row level security;
alter table public.product_balances enable row level security;

-- SELECT Policies
drop policy if exists "Authorized users can read goods receipts" on public.goods_receipts;
create policy "Authorized users can read goods receipts"
on public.goods_receipts for select
to authenticated
using ((select public.authorize('inventory.view')));

drop policy if exists "Authorized users can read goods receipt items" on public.goods_receipt_items;
create policy "Authorized users can read goods receipt items"
on public.goods_receipt_items for select
to authenticated
using (
  (select public.authorize('inventory.view'))
  and exists (
    select 1
    from public.goods_receipts gr
    where gr.id = goods_receipt_items.goods_receipt_id
  )
);

drop policy if exists "Authorized users can read inventory transactions" on public.inventory_transactions;
create policy "Authorized users can read inventory transactions"
on public.inventory_transactions for select
to authenticated
using ((select public.authorize('inventory.view')));

drop policy if exists "Authorized users can read inventory balances" on public.inventory_balances;
create policy "Authorized users can read inventory balances"
on public.inventory_balances for select
to authenticated
using ((select public.authorize('inventory.view')));

drop policy if exists "Authorized users can read product transactions" on public.product_transactions;
create policy "Authorized users can read product transactions"
on public.product_transactions for select
to authenticated
using ((select public.authorize('inventory.view')));

drop policy if exists "Authorized users can read product balances" on public.product_balances;
create policy "Authorized users can read product balances"
on public.product_balances for select
to authenticated
using ((select public.authorize('inventory.view')));

-- GRANTS
grant select on public.goods_receipts to authenticated;
grant select on public.goods_receipt_items to authenticated;
grant select on public.inventory_transactions to authenticated;
grant select on public.inventory_balances to authenticated;
grant select on public.product_transactions to authenticated;
grant select on public.product_balances to authenticated;

-- Deny authenticated direct mutations (they should use SECURITY DEFINER RPC actions)
revoke insert, update, delete on public.goods_receipts from authenticated;
revoke insert, update, delete on public.goods_receipt_items from authenticated;
revoke insert, update, delete on public.inventory_transactions from authenticated;
revoke insert, update, delete on public.inventory_balances from authenticated;
revoke insert, update, delete on public.product_transactions from authenticated;
revoke insert, update, delete on public.product_balances from authenticated;
