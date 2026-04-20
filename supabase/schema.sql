-- =========================================================
-- Auro Ardon – Pragmatic Production Schema
-- Keeps all existing field names + adds only NEW fields
-- =========================================================

-- Enable pgcrypto
create extension if not exists "pgcrypto";

-- ─── ENUM: order_status ──────────────────────────────────
-- NEW VALUES: new, confirmed, delivered, cancelled
-- Legacy: pending, processing, completed, failed, cancelled will be migrated
do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum (
      'new', 'confirmed', 'delivered', 'cancelled'
    );
  end if;
end
$$;

-- ─── ENUM: payment_method ────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum (
      'mpesa', 'cash_on_delivery'
    );
  end if;
end
$$;

-- ─── HELPER: is_admin() ──────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) =
    lower(coalesce(current_setting('app.settings.admin_email', true), ''));
$$;

-- ─── TABLE: categories ───────────────────────────────────
create table if not exists public.categories (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  slug          text        not null unique,
  parent_id     uuid        references public.categories(id) on delete cascade,
  description   text,
  image_url     text,
  display_order integer     not null default 0,
  created_at    timestamptz not null default timezone('utc', now())
);

create index if not exists categories_slug_idx   on public.categories (slug);
create index if not exists categories_parent_idx on public.categories (parent_id);
create index if not exists categories_order_idx  on public.categories (display_order);

-- ─── TABLE: products ─────────────────────────────────────
-- KEEP ALL EXISTING FIELD NAMES to avoid breaking code
-- ADD: active (boolean) for activate/deactivate
create table if not exists public.products (
  id             uuid        primary key default gen_random_uuid(),
  title          text        not null,              -- EXISTING
  slug           text        unique,
  description    text        not null,
  category       text        not null,              -- EXISTING (human-readable)
  category_id    uuid        references public.categories(id) on delete set null,
  price          numeric(12,2) not null check (price > 0),
  stock_quantity integer      not null default 0 check (stock_quantity >= 0), -- EXISTING
  material       text,
  images         text[]      not null default '{}',
  is_featured    boolean     not null default false, -- EXISTING
  active         boolean     not null default true,  -- NEW
  created_at     timestamptz not null default timezone('utc', now())
);

create index if not exists products_created_at_idx   on public.products (created_at desc);
create index if not exists products_category_id_idx  on public.products (category_id);
create index if not exists products_featured_idx    on public.products (is_featured) where is_featured = true;
create index if not exists products_active_idx      on public.products (active) where active = true;

-- ─── TABLE: orders ───────────────────────────────────────
-- NEW FIELDS: customer_email, notes, payment_status, order_status, subtotal, shipping_fee, total
-- RENAME: total_amount → total, status → order_status
-- Keep: customer_name, customer_phone, customer_location, payment_method, mpesa_receipt_number, checkout_request_id
create table if not exists public.orders (
  id                    uuid              primary key default gen_random_uuid(),
  customer_name         text              not null,
  customer_email        text,                            -- NEW optional
  customer_phone        text              not null,
  customer_location     text              not null,
  notes                 text,                            -- NEW
  payment_method        public.payment_method not null default 'mpesa',
  payment_status        text              default 'pending', -- NEW
  order_status          public.order_status not null default 'new', -- NEW enum values
  subtotal              numeric(12,2)     default 0,    -- NEW
  shipping_fee          numeric(12,2)     default 0,    -- NEW
  total                 numeric(12,2)     not null,   -- RENAMED from total_amount
  mpesa_receipt_number  text,                            -- EXISTING
  checkout_request_id   text              unique,
  created_at            timestamptz       not null default timezone('utc', now())
);

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_status_idx     on public.orders (order_status);
create index if not exists orders_phone_idx      on public.orders (customer_phone);

-- ─── TABLE: order_items ──────────────────────────────────
-- KEEP: product_title (existing field name)
create table if not exists public.order_items (
  id            uuid        primary key default gen_random_uuid(),
  order_id      uuid        not null references public.orders(id) on delete cascade,
  product_id    uuid        references public.products(id) on delete set null,
  product_title text        not null,          -- EXISTING (keep this name)
  quantity      integer     not null default 1 check (quantity > 0),
  unit_price    numeric(12,2) not null check (unit_price >= 0),
  created_at    timestamptz not null default timezone('utc', now())
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);

-- ─── TABLE: admin_users ──────────────────────────────────
create table if not exists public.admin_users (
  id        uuid        primary key default gen_random_uuid(),
  email     text        not null unique,
  role      text        default 'admin',
  active    boolean     not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

-- ─── ROW LEVEL SECURITY ──────────────────────────────────
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.admin_users enable row level security;

-- CATEGORIES
drop policy if exists "Public can view categories" on public.categories;
create policy "Public can view categories"
  on public.categories for select using (true);

drop policy if exists "Admins can manage categories" on public.categories;
create policy "Admins can manage categories"
  on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- PRODUCTS: Public sees only active products
drop policy if exists "Public can view active products" on public.products;
create policy "Public can view active products"
  on public.products for select using (active = true);

drop policy if exists "Admins can manage products" on public.products;
create policy "Admins can manage products"
  on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ORDERS
drop policy if exists "Anyone can create orders" on public.orders;
create policy "Anyone can create orders"
  on public.orders for insert with check (true);

drop policy if exists "Admins can view orders" on public.orders;
create policy "Admins can view orders"
  on public.orders for select to authenticated
  using (public.is_admin());

drop policy if exists "Admins can update orders" on public.orders;
create policy "Admins can update orders"
  on public.orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ORDER ITEMS
drop policy if exists "Anyone can insert order items" on public.order_items;
create policy "Anyone can insert order items"
  on public.order_items for insert with check (true);

drop policy if exists "Admins can view order items" on public.order_items;
create policy "Admins can view order items"
  on public.order_items for select to authenticated
  using (public.is_admin());

-- ADMIN_USERS
drop policy if exists "Admins can view admin_users" on public.admin_users;
create policy "Admins can view admin_users"
  on public.admin_users for select to authenticated
  using (public.is_admin());

-- ─── STORAGE ──────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "Public can read product images" on storage.objects;
create policy "Public can read product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images"
  on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- ─── DATABASE SETTINGS ───────────────────────────────────
alter database postgres set "app.settings.admin_email" = 'admin@example.com';

-- ─── SEED: default categories ────────────────────────────
insert into public.categories (name, slug, description, display_order) values
  ('Jewelry',          'jewelry',          'Handcrafted stainless steel and African beaded jewelry', 1),
  ('Lip Care',         'lip-care',         'Nourishing lip glosses, oils and balms',               2),
  ('Hair Accessories', 'hair-accessories', 'Stylish pushbacks, hair bands, clips and flower clips', 3)
on conflict (slug) do nothing;