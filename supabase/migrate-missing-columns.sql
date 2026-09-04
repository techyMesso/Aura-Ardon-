-- Deprecated migration.
-- Use:
-- 1. supabase/normalize-order-schema.sql
-- 2. supabase/add-safe-checkout-rpc.sql

-- ─── CATEGORIES ──────────────────────────────────────────
-- Add parent_id (for nested categories), description, image_url, display_order
alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete cascade,
  add column if not exists description text,
  add column if not exists image_url text,
  add column if not exists display_order integer not null default 0;

create index if not exists categories_parent_idx on public.categories (parent_id);
create index if not exists categories_order_idx on public.categories (display_order);

-- ─── PRODUCTS ────────────────────────────────────────────
-- Add active, is_featured, slug, category_id, material
alter table public.products
  add column if not exists active boolean not null default true,
  add column if not exists is_featured boolean not null default false,
  add column if not exists slug text unique,
  add column if not exists category_id uuid references public.categories(id) on delete set null,
  add column if not exists material text;

create index if not exists products_active_idx on public.products (active) where active = true;
create index if not exists products_featured_idx on public.products (is_featured) where is_featured = true;
create index if not exists products_category_id_idx on public.products (category_id);

-- ─── ORDERS ──────────────────────────────────────────────
-- Add the new order schema fields
alter table public.orders
  add column if not exists customer_email text,
  add column if not exists customer_location text,
  add column if not exists notes text,
  add column if not exists payment_status text default 'pending',
  add column if not exists subtotal numeric(12,2) default 0,
  add column if not exists shipping_fee numeric(12,2) default 0;

-- Rename total_amount → total if needed
do $$
begin
  if exists (select 1 from information_schema.columns 
             where table_name = 'orders' and column_name = 'total_amount')
     and not exists (select 1 from information_schema.columns 
                     where table_name = 'orders' and column_name = 'total') then
    alter table public.orders rename column total_amount to total;
  end if;
end $$;

-- Add total column if still missing
alter table public.orders
  add column if not exists total numeric(12,2);

-- Backfill customer_location for legacy rows that have it as NULL
update public.orders set customer_location = 'Unknown' where customer_location is null;

-- Make customer_location required going forward
alter table public.orders alter column customer_location set not null;

-- Rename status → order_status if needed
do $$
begin
  if exists (select 1 from information_schema.columns 
             where table_name = 'orders' and column_name = 'status')
     and not exists (select 1 from information_schema.columns 
                     where table_name = 'orders' and column_name = 'order_status') then
    alter table public.orders rename column status to order_status;
  end if;
end $$;

-- ─── Seed default categories ─────────────────────────────
insert into public.categories (name, slug, description, display_order) values
  ('Jewelry',          'jewelry',          'Handcrafted stainless steel and African beaded jewelry', 1),
  ('Lip Care',         'lip-care',         'Nourishing lip glosses, oils and balms',               2),
  ('Hair Accessories', 'hair-accessories', 'Stylish pushbacks, hair bands, clips and flower clips', 3)
on conflict (slug) do nothing;

-- ─── STORAGE: product-images bucket + public read policy ─
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Make the bucket publicly readable so <img src> / next/image works
drop policy if exists "Public can read product images" on storage.objects;
create policy "Public can read product images"
  on storage.objects for select
  using (bucket_id = 'product-images');
