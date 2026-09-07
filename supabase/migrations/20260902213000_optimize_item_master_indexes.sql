-- Performance optimization for high-concurrency (100+ concurrent users) and large datasets (10,000+ items)

-- 1. Compound index for filtering by item_type_id and sorting by item_code ASC (used in tab-filtered catalog pagination)
create index if not exists item_master_type_code_idx on public.item_master(item_type_id, item_code);

-- 2. Index on item_name_en for bilingual search
create index if not exists item_master_name_en_idx on public.item_master(item_name_en);

-- 3. GIN index on attributes JSONB column for attribute lookups
create index if not exists item_master_attributes_gin_idx on public.item_master using gin (attributes);
