-- =========================================================
-- Phase 16: Production Hardening, FK Index & Backup Bucket
-- - Tightens any pre-roadmap legacy RLS policies in-place so
--   inactive categories/products and legacy admin policies cannot
--   bypass Phase 8 / Phase 14 access rules
-- - Adds covering index for back_in_stock_alerts(variant_id) FK
-- - Ensures private db-backups Storage bucket exists for nightly pg_dump
-- =========================================================

-- ─── 1. TIGHTEN SUPERSEDED PRE-ROADMAP LEGACY POLICIES ───
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'categories' and policyname = 'Categories are publicly readable'
  ) then
    alter policy "Categories are publicly readable" on public.categories using (active = true);
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'categories' and policyname = 'Admins can manage categories'
  ) then
    alter policy "Admins can manage categories" on public.categories using (false) with check (false);
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'products' and policyname = 'Products are publicly readable'
  ) then
    alter policy "Products are publicly readable" on public.products using (status = 'active' and active = true);
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'products' and policyname = 'Admins can insert products'
  ) then
    alter policy "Admins can insert products" on public.products with check (false);
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'products' and policyname = 'Admins can update products'
  ) then
    alter policy "Admins can update products" on public.products using (false) with check (false);
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'products' and policyname = 'Admins can delete products'
  ) then
    alter policy "Admins can delete products" on public.products using (false);
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'Admins can view orders'
  ) then
    alter policy "Admins can view orders" on public.orders using (false);
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'Admins can update orders'
  ) then
    alter policy "Admins can update orders" on public.orders using (false) with check (false);
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'orders' and policyname = 'Admins can delete orders'
  ) then
    alter policy "Admins can delete orders" on public.orders using (false);
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'order_items' and policyname = 'Admins can view order items'
  ) then
    alter policy "Admins can view order items" on public.order_items using (false);
  end if;
end
$$;

-- ─── 2. COVERING INDEX FOR back_in_stock_alerts(variant_id) FK ─
create index if not exists back_in_stock_alerts_variant_id_idx
  on public.back_in_stock_alerts (variant_id)
  where variant_id is not null;

-- ─── 3. PRIVATE STORAGE BUCKET FOR NIGHTLY DB BACKUPS ────
insert into storage.buckets (id, name, public)
values ('db-backups', 'db-backups', false)
on conflict (id) do update set public = false;
