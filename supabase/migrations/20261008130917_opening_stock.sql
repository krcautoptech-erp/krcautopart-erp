-- Opening stock never writes balances directly: existing ledger triggers do that.
insert into public.app_permissions (permission_code, permission_name, module_code, module_name, action_code, module_sort_order, sort_order, status)
select 'opening_stock.' || action, label, 'opening_stock', 'สต็อกตั้งต้น', action, 60, ord, 'active'
from (values ('view','ดูสต็อกตั้งต้นและต้นทุน',10),('create','สร้างและนำเข้าสต็อกตั้งต้น',20),('approve','ตรวจสอบและอนุมัติสต็อกตั้งต้น',30),('cancel','ยกเลิกและกลับรายการสต็อกตั้งต้น',40)) p(action,label,ord)
on conflict (permission_code) do nothing;
insert into public.role_permissions (role_id,permission_id)
select r.id,p.id from public.app_roles r cross join public.app_permissions p
where r.is_owner and p.module_code='opening_stock' on conflict do nothing;
insert into erp_private.number_series (series_key,prefix,padding,reset_policy)
values ('OS','OS',4,'monthly') on conflict (series_key) do nothing;

create table public.opening_stock_batches (
 id bigint generated always as identity primary key,
 request_key uuid not null unique,
 opening_number text not null unique,
 warehouse_id bigint not null references public.raw_material_warehouses(id),
 warehouse_name text not null,
 cutoff_date date not null,
 reference text not null check (length(btrim(reference)) between 1 and 100),
 notes text not null default '' check (length(notes)<=1000),
 source_filename text not null default '' check (length(source_filename)<=255),
 rows jsonb not null default '[]' check (jsonb_typeof(rows)='array' and jsonb_array_length(rows)<=500),
 status text not null default 'draft' check (status in ('draft','review','posted','reversed','cancelled')),
 revision integer not null default 1,
 total_value numeric(24,2) not null default 0,
 created_by uuid not null references auth.users(id),
 created_by_name text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 posted_at timestamptz,
 posted_by uuid references auth.users(id)
);
create unique index opening_stock_one_posted_warehouse on public.opening_stock_batches(warehouse_id) where status='posted';
create index opening_stock_batches_status_date on public.opening_stock_batches(status,cutoff_date desc,id desc);
create table public.opening_stock_entries (
 id bigint generated always as identity primary key,
 batch_id bigint not null references public.opening_stock_batches(id),
 line_no integer not null,
 item_master_id bigint not null references public.item_master(id),
 inventory_transaction_id bigint not null unique references public.inventory_transactions(id),
 unique(batch_id,line_no)
);
create table public.opening_stock_events (
 id bigint generated always as identity primary key,
 batch_id bigint not null references public.opening_stock_batches(id),
 event text not null,
 reason text not null default '',
 actor_id uuid not null references auth.users(id),
 actor_name text not null,
 created_at timestamptz not null default now()
);
create index opening_stock_events_batch on public.opening_stock_events(batch_id,id);
alter table public.opening_stock_batches enable row level security;
alter table public.opening_stock_entries enable row level security;
alter table public.opening_stock_events enable row level security;
create policy opening_stock_read on public.opening_stock_batches for select to authenticated using ((select public.authorize('opening_stock.view')));
create policy opening_stock_entries_read on public.opening_stock_entries for select to authenticated using ((select public.authorize('opening_stock.view')));
create policy opening_stock_events_read on public.opening_stock_events for select to authenticated using ((select public.authorize('opening_stock.view')));
revoke all on public.opening_stock_batches,public.opening_stock_entries,public.opening_stock_events from anon,authenticated;
grant select on public.opening_stock_batches,public.opening_stock_entries,public.opening_stock_events to authenticated;
create trigger capture_system_audit_log after insert or update or delete on public.opening_stock_batches for each row execute function public.capture_system_audit_log();

alter table public.inventory_transactions drop constraint inventory_transactions_doc_type_check;
alter table public.inventory_transactions add constraint inventory_transactions_doc_type_check check (reference_doc_type in ('goods_receipt','purchase_return','production_issue','stock_issue','stock_issue_reversal','stock_adjustment','stock_adjustment_reversal','opening_balance','opening_balance_reversal'));

create function erp_private.validate_opening_stock_rows(p_rows jsonb,p_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; m record; result jsonb:='[]'; qty numeric; cost numeric; expiry date; seen text[]:='{}'; k text;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 500 then raise exception 'invalid_opening_rows'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  select i.id,i.item_code,i.item_name,i.tracking_method,t.expiry_controlled,
    coalesce(u.symbol,u.unit_name,'หน่วย') unit_name,coalesce(u.allows_decimal,true) allows_decimal,
    case when i.attributes->>'legacySource'='raw_material' and i.attributes->>'legacySourceId' ~ '^\d+$' then (i.attributes->>'legacySourceId')::bigint end raw_material_id
  into m from public.item_master i join public.item_types t on t.id=i.item_type_id
  left join public.raw_material_units u on u.id=i.unit_id
  where upper(i.item_code)=upper(btrim(r->>'itemCode')) and i.status='active' and t.status='active' and t.is_stocked;
  if not found then raise exception 'stock_item_not_found'; end if;
  if m.tracking_method='serial' then raise exception 'serial_opening_not_supported'; end if;
  if coalesce(r->>'quantity','') !~ '^\d+(\.\d{1,4})?$' or coalesce(r->>'unitCost','') !~ '^\d+(\.\d{1,4})?$' then raise exception 'invalid_opening_quantity_cost'; end if;
  qty:=(r->>'quantity')::numeric; cost:=(r->>'unitCost')::numeric;
  if qty<=0 or qty>=1e9 or cost<0 or cost>=1e9 or (not m.allows_decimal and qty<>trunc(qty)) then raise exception 'invalid_opening_quantity_cost'; end if;
  if m.tracking_method='lot' and nullif(btrim(r->>'lotNumber'),'') is null then raise exception 'opening_lot_required'; end if;
  if m.tracking_method='none' and nullif(btrim(r->>'lotNumber'),'') is not null then raise exception 'opening_lot_not_allowed'; end if;
  if length(coalesce(r->>'lotNumber',''))>100 or length(coalesce(r->>'notes',''))>500 then raise exception 'invalid_opening_rows'; end if;
  expiry:=nullif(r->>'expiryDate','')::date;
  if (m.expiry_controlled and expiry is null) or expiry<p_date then raise exception 'invalid_opening_expiry'; end if;
  k:=m.id::text || ':' || coalesce(btrim(r->>'lotNumber'),'');
  if k=any(seen) then raise exception 'duplicate_opening_item_lot'; end if;
  seen:=array_append(seen,k);
  result:=result || jsonb_build_array(r || jsonb_build_object('itemCode',m.item_code,'itemId',m.id,'itemName',m.item_name,'unitName',m.unit_name,'trackingMethod',m.tracking_method,'rawMaterialId',m.raw_material_id,'lotNumber',coalesce(btrim(r->>'lotNumber'),''),'quantity',qty::text,'unitCost',cost::text));
 end loop;
 if (select sum(round((v->>'quantity')::numeric*(v->>'unitCost')::numeric,2)) from jsonb_array_elements(result) v)>1e12 then raise exception 'opening_value_exceeded'; end if;
 return result;
end $$;
revoke all on function erp_private.validate_opening_stock_rows(jsonb,date) from public,anon,authenticated;

create function erp_private.opening_stock_options() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.authorize('opening_stock.view') then raise exception 'permission_denied'; end if;
 return jsonb_build_object(
  'warehouses',(select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'name',w.warehouse_name,'blocked',exists(select 1 from public.inventory_transactions tx where tx.warehouse_id=w.id and tx.reference_doc_type not in ('opening_balance','opening_balance_reversal')) or exists(select 1 from public.opening_stock_batches b where b.warehouse_id=w.id and b.status='posted')) order by w.sort_order,w.id),'[]') from public.raw_material_warehouses w where w.status='active'),
  'items',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'code',i.item_code,'name',i.item_name,'unitName',coalesce(nullif(u.symbol,''),u.unit_name,'หน่วย'),'trackingMethod',i.tracking_method,'expiryControlled',t.expiry_controlled,'allowsDecimal',coalesce(u.allows_decimal,true)) order by i.item_code),'[]') from public.item_master i join public.item_types t on t.id=i.item_type_id left join public.raw_material_units u on u.id=i.unit_id where i.status='active' and t.status='active' and t.is_stocked)
 );
end $$;

create function erp_private.save_opening_stock(p_id bigint,p_revision integer,p_request_key uuid,p_warehouse_id bigint,p_cutoff_date date,p_reference text,p_notes text,p_filename text,p_rows jsonb,p_submit boolean) returns bigint
language plpgsql security definer set search_path='' as $$
declare b public.opening_stock_batches%rowtype; uid uuid:=auth.uid(); actor text; wname text; num text; allocation bigint; rid bigint; resolved jsonb;
begin
 if uid is null or not (public.authorize('opening_stock.view') and public.authorize('opening_stock.create')) then raise exception 'permission_denied'; end if;
 if p_submit is null or p_cutoff_date is null or p_cutoff_date>(now() at time zone 'Asia/Bangkok')::date or p_cutoff_date<'2000-01-01' or length(btrim(coalesce(p_reference,''))) not between 1 and 100 or length(coalesce(p_notes,''))>1000 or length(coalesce(p_filename,''))>255 or p_request_key is null then raise exception 'invalid_opening_header'; end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>500 or octet_length(p_rows::text)>500000 then raise exception 'invalid_opening_rows'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r cross join unnest(array['itemCode','lotNumber','expiryDate','quantity','unitCost','notes']) f where jsonb_typeof(r->f) is distinct from 'string') then raise exception 'invalid_opening_rows'; end if;
 select warehouse_name into wname from public.raw_material_warehouses where id=p_warehouse_id and status='active';
 if not found then raise exception 'warehouse_not_found'; end if;
 select coalesce(nullif(concat_ws(' ',first_name,last_name),''),'ผู้ใช้งาน') into actor from public.user_profiles where user_id=uid;
 actor:=coalesce(actor,'ผู้ใช้งาน');
 resolved:=case when p_submit then erp_private.validate_opening_stock_rows(p_rows,p_cutoff_date) else p_rows end;
 if p_id is null then
  perform pg_advisory_xact_lock(hashtextextended(p_request_key::text,0));
  select * into b from public.opening_stock_batches where request_key=p_request_key;
  if found then
   if b.created_by<>uid then raise exception 'permission_denied'; end if;
   return b.id;
  end if;
  select allocated.business_number,allocated.allocation_id into num,allocation from erp_private.allocate_business_number('OS',p_cutoff_date,'used','opening_stock',null) allocated;
  insert into public.opening_stock_batches(request_key,opening_number,warehouse_id,warehouse_name,cutoff_date,reference,notes,source_filename,rows,status,total_value,created_by,created_by_name)
  values(p_request_key,num,p_warehouse_id,wname,p_cutoff_date,btrim(p_reference),coalesce(p_notes,''),coalesce(p_filename,''),resolved,case when p_submit then 'review' else 'draft' end,case when p_submit then (select sum(round((r->>'quantity')::numeric*(r->>'unitCost')::numeric,2)) from jsonb_array_elements(resolved) r) else 0 end,uid,actor) returning id into rid;
  update erp_private.number_allocations set entity_id=rid::text where id=allocation;
 else
  select * into b from public.opening_stock_batches where id=p_id for update;
  if not found or b.status<>'draft' then raise exception 'opening_not_draft'; end if;
  if b.created_by<>uid then raise exception 'permission_denied'; end if;
  if b.revision is distinct from p_revision then raise exception 'opening_stale_revision'; end if;
  update public.opening_stock_batches set warehouse_id=p_warehouse_id,warehouse_name=wname,cutoff_date=p_cutoff_date,reference=btrim(p_reference),notes=coalesce(p_notes,''),source_filename=coalesce(p_filename,''),rows=resolved,status=case when p_submit then 'review' else 'draft' end,total_value=case when p_submit then (select sum(round((r->>'quantity')::numeric*(r->>'unitCost')::numeric,2)) from jsonb_array_elements(resolved) r) else 0 end,revision=revision+1,updated_at=now() where id=p_id;
  rid:=p_id;
 end if;
 insert into public.opening_stock_events(batch_id,event,actor_id,actor_name) values(rid,case when p_submit then 'ส่งตรวจสอบ' else 'บันทึกร่าง' end,uid,actor);
 return rid;
end $$;

create function erp_private.decide_opening_stock(p_id bigint,p_revision integer,p_action text,p_reason text) returns bigint
language plpgsql security definer set search_path='' as $$
declare b public.opening_stock_batches%rowtype; uid uuid:=auth.uid(); actor text; owner boolean; r jsonb; tx record; tid bigint; lid bigint; line integer:=0; resolved jsonb; rv text;
begin
 if uid is null or not public.authorize('opening_stock.view') or p_action not in ('post','return','cancel','reverse') or p_action is null then raise exception 'permission_denied'; end if;
 if not public.authorize(case when p_action in ('post','return') then 'opening_stock.approve' else 'opening_stock.cancel' end) then raise exception 'permission_denied'; end if;
 if p_action<>'post' and length(btrim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'opening_reason_required'; end if;
 -- This short-lived lock serializes the empty-warehouse check against all ledger writers.
 lock table public.inventory_transactions,public.product_transactions in share row exclusive mode;
 select * into b from public.opening_stock_batches where id=p_id for update;
 if not found then raise exception 'opening_not_found'; end if;
 if b.revision is distinct from p_revision then raise exception 'opening_stale_revision'; end if;
 perform 1 from public.item_inventory_balances where warehouse_id=b.warehouse_id order by item_master_id for update;
 perform 1 from public.inventory_lots where warehouse_id=b.warehouse_id order by id for update;
 select coalesce(nullif(concat_ws(' ',first_name,last_name),''),'ผู้ใช้งาน') into actor from public.user_profiles where user_id=uid;
 actor:=coalesce(actor,'ผู้ใช้งาน');
 select exists(select 1 from auth.users u where u.id=uid and lower(u.raw_app_meta_data->>'role')='owner') or exists(select 1 from public.user_roles ur join public.app_roles ar on ar.id=ur.role_id where ur.user_id=uid and ar.is_owner and ar.status='active') into owner;
 if p_action='post' then
  if b.status<>'review' then raise exception 'opening_not_review'; end if;
  if b.created_by=uid and not owner then raise exception 'opening_self_approval'; end if;
  perform 1 from public.raw_material_warehouses where id=b.warehouse_id and status='active' for update;
  if not found then raise exception 'warehouse_not_found'; end if;
  if exists(select 1 from public.inventory_transactions where warehouse_id=b.warehouse_id and reference_doc_type not in ('opening_balance','opening_balance_reversal'))
    or exists(select 1 from public.product_transactions where warehouse_id=b.warehouse_id)
    or exists(select 1 from public.item_inventory_balances where warehouse_id=b.warehouse_id and (on_hand_qty<>0 or allocated_qty<>0))
    or exists(select 1 from public.opening_stock_batches where warehouse_id=b.warehouse_id and status='posted') then raise exception 'opening_warehouse_in_use'; end if;
  resolved:=erp_private.validate_opening_stock_rows(b.rows,b.cutoff_date);
  for r in select value from jsonb_array_elements(resolved) loop
   line:=line+1; lid:=null;
   if r->>'trackingMethod'='lot' then
    insert into public.inventory_lots(lot_number,vendor_lot_no,item_master_id,raw_material_id,warehouse_id,received_qty,received_at,expiry_date,remarks,created_by)
    values(b.opening_number || '-' || lpad(line::text,3,'0'),r->>'lotNumber',(r->>'itemId')::bigint,(r->>'rawMaterialId')::bigint,b.warehouse_id,(r->>'quantity')::numeric,b.cutoff_date::timestamp at time zone 'Asia/Bangkok',nullif(r->>'expiryDate','')::date,'สต็อกตั้งต้น ' || b.opening_number,uid) returning id into lid;
   end if;
   insert into public.inventory_transactions(item_master_id,raw_material_id,warehouse_id,lot_id,transaction_type,reference_doc_type,reference_doc_number,quantity_change,created_by,created_at)
   values((r->>'itemId')::bigint,(r->>'rawMaterialId')::bigint,b.warehouse_id,lid,'receipt','opening_balance',b.opening_number,(r->>'quantity')::numeric,uid,b.cutoff_date::timestamp at time zone 'Asia/Bangkok') returning id into tid;
   insert into public.inventory_receipt_costs(inventory_transaction_id,inventory_lot_id,item_master_id,warehouse_id,received_qty,remaining_qty,unit_cost,created_at)
   values(tid,lid,(r->>'itemId')::bigint,b.warehouse_id,(r->>'quantity')::numeric,(r->>'quantity')::numeric,(r->>'unitCost')::numeric,b.cutoff_date::timestamp at time zone 'Asia/Bangkok');
   insert into public.opening_stock_entries(batch_id,line_no,item_master_id,inventory_transaction_id) values(b.id,line,(r->>'itemId')::bigint,tid);
  end loop;
  update public.opening_stock_batches set rows=resolved,status='posted',posted_at=now(),posted_by=uid,total_value=(select sum(round((v->>'quantity')::numeric*(v->>'unitCost')::numeric,2)) from jsonb_array_elements(resolved) v),revision=revision+1,updated_at=now() where id=b.id;
 elsif p_action='reverse' then
  if b.status<>'posted' then raise exception 'opening_not_posted'; end if;
  if exists(select 1 from public.inventory_transactions t where t.warehouse_id=b.warehouse_id and not exists(select 1 from public.opening_stock_entries e where e.inventory_transaction_id=t.id and e.batch_id=b.id) and t.reference_doc_type not in ('opening_balance','opening_balance_reversal'))
   or exists(select 1 from public.product_transactions where warehouse_id=b.warehouse_id)
   or exists(select 1 from public.inventory_receipt_costs c join public.opening_stock_entries e on e.inventory_transaction_id=c.inventory_transaction_id where e.batch_id=b.id and c.remaining_qty<>c.received_qty)
   or exists(select 1 from public.item_inventory_balances where warehouse_id=b.warehouse_id and allocated_qty>0)
   or exists(select 1 from public.inventory_lots where warehouse_id=b.warehouse_id and reserved_qty>0) then raise exception 'opening_already_used'; end if;
  select business_number into rv from erp_private.allocate_business_number('RV',(now() at time zone 'Asia/Bangkok')::date,'used','opening_stock_reversal',b.id::text);
  for tx in select t.* from public.inventory_transactions t join public.opening_stock_entries e on e.inventory_transaction_id=t.id where e.batch_id=b.id order by t.id loop
   insert into public.inventory_transactions(item_master_id,raw_material_id,warehouse_id,lot_id,transaction_type,reference_doc_type,reference_doc_number,quantity_change,created_by,reversal_of_transaction_id)
   values(tx.item_master_id,tx.raw_material_id,tx.warehouse_id,tx.lot_id,'adjustment','opening_balance_reversal',rv,-tx.quantity_change,uid,tx.id);
   update public.inventory_receipt_costs set remaining_qty=0 where inventory_transaction_id=tx.id;
  end loop;
  update public.opening_stock_batches set status='reversed',revision=revision+1,updated_at=now() where id=b.id;
 elsif p_action='return' then
  if b.status<>'review' then raise exception 'opening_not_review'; end if;
  update public.opening_stock_batches set status='draft',revision=revision+1,updated_at=now() where id=b.id;
 else
  if b.status not in ('draft','review') then raise exception 'opening_cannot_cancel'; end if;
  update public.opening_stock_batches set status='cancelled',revision=revision+1,updated_at=now() where id=b.id;
 end if;
 insert into public.opening_stock_events(batch_id,event,reason,actor_id,actor_name) values(b.id,case p_action when 'post' then 'อนุมัติและลงยอด' when 'return' then 'ส่งกลับแก้ไข' when 'reverse' then 'กลับรายการ ' || rv else 'ยกเลิก' end,coalesce(btrim(p_reason),''),uid,actor);
 return b.id;
end $$;

create function public.get_opening_stock_options() returns jsonb language sql security invoker set search_path='' as $$ select erp_private.opening_stock_options() $$;
create function public.save_opening_stock(p_id bigint,p_revision integer,p_request_key uuid,p_warehouse_id bigint,p_cutoff_date date,p_reference text,p_notes text,p_filename text,p_rows jsonb,p_submit boolean) returns bigint language sql security invoker set search_path='' as $$ select erp_private.save_opening_stock(p_id,p_revision,p_request_key,p_warehouse_id,p_cutoff_date,p_reference,p_notes,p_filename,p_rows,p_submit) $$;
create function public.decide_opening_stock(p_id bigint,p_revision integer,p_action text,p_reason text) returns bigint language sql security invoker set search_path='' as $$ select erp_private.decide_opening_stock(p_id,p_revision,p_action,p_reason) $$;
grant usage on schema erp_private to authenticated;
revoke all on function erp_private.opening_stock_options(),erp_private.save_opening_stock(bigint,integer,uuid,bigint,date,text,text,text,jsonb,boolean),erp_private.decide_opening_stock(bigint,integer,text,text),public.get_opening_stock_options(),public.save_opening_stock(bigint,integer,uuid,bigint,date,text,text,text,jsonb,boolean),public.decide_opening_stock(bigint,integer,text,text) from public,anon;
grant execute on function erp_private.opening_stock_options(),erp_private.save_opening_stock(bigint,integer,uuid,bigint,date,text,text,text,jsonb,boolean),erp_private.decide_opening_stock(bigint,integer,text,text),public.get_opening_stock_options(),public.save_opening_stock(bigint,integer,uuid,bigint,date,text,text,text,jsonb,boolean),public.decide_opening_stock(bigint,integer,text,text) to authenticated;
notify pgrst,'reload schema';
