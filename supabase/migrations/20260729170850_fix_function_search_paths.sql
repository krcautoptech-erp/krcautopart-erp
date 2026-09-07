begin;

-- This trigger function references application relations with schema-qualified
-- names, so an empty search_path prevents object-shadowing without changing
-- its behavior.
alter function public.recompute_purchase_requisition_totals()
  set search_path = '';

-- This was an ad-hoc test helper and is not part of the application API.
drop function if exists public.test_ordinality_fn(jsonb);

commit;
