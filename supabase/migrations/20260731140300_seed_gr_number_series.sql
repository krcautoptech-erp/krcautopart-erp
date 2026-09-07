-- Seed GR number series key
insert into erp_private.number_series (series_key, prefix, padding, reset_policy)
values ('GR', 'GR', 4, 'monthly')
on conflict (series_key) do update
set 
  prefix = excluded.prefix, 
  padding = excluded.padding, 
  reset_policy = excluded.reset_policy, 
  is_active = true, 
  updated_at = now();
