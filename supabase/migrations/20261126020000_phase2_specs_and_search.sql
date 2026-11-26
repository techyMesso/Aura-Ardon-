-- =========================================================
-- Phase 2: Structured Product Specs & Full-Text Search
-- Adds watch & beauty specification columns plus weighted
-- Postgres full-text search index across title, category,
-- material, and description.
-- =========================================================

alter table public.products
  add column if not exists water_resistance text,
  add column if not exists warranty text,
  add column if not exists ingredients text,
  add column if not exists net_weight text,
  add column if not exists expiry_info text;

-- Weighted generated tsvector for fast Postgres full-text search
alter table public.products
  add column if not exists search_tsv tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(category, '') || ' ' || coalesce(material, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored;

create index if not exists products_search_tsv_idx
  on public.products
  using gin (search_tsv);

