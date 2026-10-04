drop policy if exists "Authorized users can read inventory lots"
  on public.inventory_lots;

create policy "Authorized users can read inventory lots"
on public.inventory_lots
for select
to authenticated
using ((select public.authorize('inventory.view')));

drop policy if exists "Authorized users can read item inventory balances"
  on public.item_inventory_balances;

create policy "Authorized users can read item inventory balances"
on public.item_inventory_balances
for select
to authenticated
using (
  (select public.authorize('inventory.view'))
  or (select public.authorize('inventory.create_gr'))
);
