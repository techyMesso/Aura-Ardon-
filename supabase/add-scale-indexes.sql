-- =========================================================
-- Auro Ardon — Phase 1E Scale Indexes & RLS Verification
-- Safe, idempotent migration for production scale
-- =========================================================

alter table public.products
  add column if not exists blur_data_url text;

-- 1. Catalog & New Arrivals indexes
create index if not exists products_created_at_idx
  on public.products (created_at desc);

create index if not exists products_category_active_idx
  on public.products (category_id, active);

create unique index if not exists products_slug_unique_idx
  on public.products (slug)
  where slug is not null;

-- 2. Order lookup & fulfillment indexes
create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

create index if not exists orders_phone_idx
  on public.orders (customer_phone);

-- 3. Verify Row Level Security (public SELECT on catalog, INSERT-only on anonymous orders)
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Public can view categories" on public.categories;
create policy "Public can view categories"
  on public.categories for select using (true);

drop policy if exists "Public can view active products" on public.products;
create policy "Public can view active products"
  on public.products for select using (active = true);

drop policy if exists "Anyone can create orders" on public.orders;
create policy "Anyone can create orders"
  on public.orders for insert with check (true);

drop policy if exists "Anyone can insert order items" on public.order_items;
create policy "Anyone can insert order items"
  on public.order_items for insert with check (true);
