-- =========================================================
-- Auro Ardon — RLS Hardening, Deadlock-Free Checkout,
-- Atomic Order Status/Payment Updates, Stock Restoration,
-- Missing Columns & Supabase Advisor Remediation
-- Safe, idempotent migration.
-- =========================================================

-- 1. Reconcile missing product columns & add missing FK / query indexes
alter table public.products
  add column if not exists blur_data_url text,
  add column if not exists finish text,
  add column if not exists size_label text,
  add column if not exists in_the_box text,
  add column if not exists care text;

create index if not exists products_category_active_idx
  on public.products (category_id, active);

create index if not exists order_items_product_id_idx
  on public.order_items (product_id);

create index if not exists orders_status_created_at_idx
  on public.orders (order_status, created_at desc);

-- Drop redundant duplicate indexes identified by Supabase advisors
drop index if exists public.products_is_featured_idx;
drop index if exists public.categories_slug_idx;

-- 2. Harden public.is_admin() (pin search_path and prevent empty-string equality bypass)
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    nullif(btrim(coalesce(current_setting('app.settings.admin_email', true), '')), '') is not null
    and lower(coalesce((select auth.jwt()) ->> 'email', '')) =
        lower(btrim(current_setting('app.settings.admin_email', true)));
$$;

-- 3. Tighten Row Level Security & remove duplicate / overbroad legacy policies
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Categories: single public SELECT policy; admin mutations via service_role / hardened non-SELECT policy
drop policy if exists "Categories are publicly readable" on public.categories;
drop policy if exists "Admins can manage categories" on public.categories;
drop policy if exists "Public can view categories" on public.categories;
create policy "Public can view categories"
  on public.categories for select
  using (true);

create policy "Admins can insert categories"
  on public.categories for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins can update categories"
  on public.categories for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins can delete categories"
  on public.categories for delete
  to authenticated
  using ((select public.is_admin()));

-- Products: remove legacy policy that leaked inactive products
drop policy if exists "Products are publicly readable" on public.products;
drop policy if exists "Public can view active products" on public.products;
create policy "Public can view active products"
  on public.products for select
  using (active = true);

-- Orders & Order Items: remove all anonymous INSERT policies (writes go exclusively via service_role RPC)
drop policy if exists "Anyone can create orders" on public.orders;
drop policy if exists "Anyone can insert orders" on public.orders;
drop policy if exists "Anyone can insert order items" on public.order_items;

revoke insert, update, delete on public.orders from anon, authenticated;
revoke insert, update, delete on public.order_items from anon, authenticated;

-- Profiles (if present): optimize auth.uid() initplan evaluation
do $$
begin
  if to_regclass('public.profiles') is not null then
    execute 'drop policy if exists "Profiles are readable by owner" on public.profiles';
    execute 'create policy "Profiles are readable by owner" on public.profiles for select to authenticated using ((select auth.uid()) = user_id)';
  end if;
end
$$;

-- 4. Harden create_checkout_order with deterministic lock ordering (prevents 40P01 deadlocks)
create or replace function public.create_checkout_order(
  checkout_customer_name text,
  checkout_customer_email text,
  checkout_customer_phone text,
  checkout_customer_location text,
  checkout_notes text,
  checkout_payment_method public.payment_method,
  checkout_idempotency_key text,
  checkout_items jsonb
)
returns table (
  order_id uuid,
  subtotal numeric,
  shipping_fee numeric,
  total numeric,
  payment_method public.payment_method,
  payment_status public.payment_status,
  order_status public.order_status,
  replayed boolean,
  item_summary jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_order public.orders%rowtype;
  existing_order public.orders%rowtype;
  computed_subtotal numeric(12, 2);
  computed_shipping_fee numeric(12, 2) := 0;
  requested_product_count integer;
  locked_product_count integer;
  locked_products jsonb;
  computed_item_summary jsonb;
begin
  if checkout_idempotency_key is null or btrim(checkout_idempotency_key) = '' then
    raise exception 'Missing Idempotency-Key.';
  end if;

  if checkout_items is null or jsonb_typeof(checkout_items) <> 'array' or jsonb_array_length(checkout_items) = 0 then
    raise exception 'Your cart is empty.';
  end if;

  if exists (
    with requested_items as (
      select
        (item->>'product_id')::uuid as product_id,
        (item->>'quantity')::integer as quantity
      from jsonb_array_elements(checkout_items) as item
    )
    select 1
    from requested_items
    where product_id is null or quantity is null or quantity <= 0
  ) then
    raise exception 'Invalid quantity in cart.';
  end if;

  -- Serialize all attempts for the same logical checkout.
  perform pg_advisory_xact_lock(hashtextextended(checkout_idempotency_key, 0));

  select *
  into existing_order
  from public.orders
  where idempotency_key = checkout_idempotency_key;

  if found then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'title', oi.product_title,
          'quantity', oi.quantity
        )
        order by oi.created_at asc
      ),
      '[]'::jsonb
    )
    into computed_item_summary
    from public.order_items oi
    where oi.order_id = existing_order.id;

    return query
    select
      existing_order.id,
      existing_order.subtotal,
      existing_order.shipping_fee,
      existing_order.total,
      existing_order.payment_method,
      existing_order.payment_status,
      existing_order.order_status,
      true,
      computed_item_summary;
    return;
  end if;

  -- Lock all requested product rows in deterministic UUID order so concurrent
  -- multi-item checkouts cannot deadlock.
  with requested_items as (
    select
      (item->>'product_id')::uuid as product_id,
      (item->>'quantity')::integer as quantity
    from jsonb_array_elements(checkout_items) as item
  ),
  grouped_items as (
    select product_id, sum(quantity)::integer as quantity
    from requested_items
    group by product_id
  ),
  locked_rows as (
    select
      p.id,
      p.title,
      p.price,
      p.stock_quantity,
      p.active,
      gi.quantity
    from public.products p
    join grouped_items gi on gi.product_id = p.id
    order by p.id asc
    for update of p
  )
  select
    count(*)::integer,
    count(lr.id)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_id', lr.id,
          'title', lr.title,
          'price', lr.price,
          'stock_quantity', lr.stock_quantity,
          'active', lr.active,
          'quantity', lr.quantity
        )
      ) filter (where lr.id is not null),
      '[]'::jsonb
    )
  into requested_product_count, locked_product_count, locked_products
  from grouped_items gi
  left join locked_rows lr on lr.id = gi.product_id;

  if locked_product_count <> requested_product_count then
    raise exception 'One or more items are not available.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(locked_products) as lp(
      product_id uuid,
      title text,
      price numeric,
      stock_quantity integer,
      active boolean,
      quantity integer
    )
    where lp.active = false
       or lp.stock_quantity < lp.quantity
  ) then
    raise exception 'One or more items are not available in the requested quantity.';
  end if;

  select coalesce(sum(lp.price * lp.quantity), 0)::numeric(12, 2)
  into computed_subtotal
  from jsonb_to_recordset(locked_products) as lp(
    product_id uuid,
    title text,
    price numeric,
    stock_quantity integer,
    active boolean,
    quantity integer
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'title', lp.title,
        'quantity', lp.quantity
      )
      order by lp.title asc
    ),
    '[]'::jsonb
  )
  into computed_item_summary
  from jsonb_to_recordset(locked_products) as lp(
    product_id uuid,
    title text,
    price numeric,
    stock_quantity integer,
    active boolean,
    quantity integer
  );

  insert into public.orders (
    customer_name,
    customer_email,
    customer_phone,
    customer_location,
    notes,
    idempotency_key,
    payment_method,
    payment_status,
    order_status,
    subtotal,
    shipping_fee,
    total
  )
  values (
    checkout_customer_name,
    checkout_customer_email,
    checkout_customer_phone,
    checkout_customer_location,
    checkout_notes,
    checkout_idempotency_key,
    checkout_payment_method,
    'PENDING',
    'PENDING_CONFIRMATION',
    computed_subtotal,
    computed_shipping_fee,
    computed_subtotal + computed_shipping_fee
  )
  returning *
  into inserted_order;

  insert into public.order_items (
    order_id,
    product_id,
    product_title,
    quantity,
    unit_price
  )
  select
    inserted_order.id,
    lp.product_id,
    lp.title,
    lp.quantity,
    lp.price
  from jsonb_to_recordset(locked_products) as lp(
    product_id uuid,
    title text,
    price numeric,
    stock_quantity integer,
    active boolean,
    quantity integer
  );

  update public.products p
  set stock_quantity = p.stock_quantity - lp.quantity
  from jsonb_to_recordset(locked_products) as lp(
    product_id uuid,
    title text,
    price numeric,
    stock_quantity integer,
    active boolean,
    quantity integer
  )
  where p.id = lp.product_id;

  return query
  select
    inserted_order.id,
    inserted_order.subtotal,
    inserted_order.shipping_fee,
    inserted_order.total,
    inserted_order.payment_method,
    inserted_order.payment_status,
    inserted_order.order_status,
    false,
    computed_item_summary;
end;
$$;

revoke all on function public.create_checkout_order(
  text, text, text, text, text, public.payment_method, text, jsonb
) from public, anon, authenticated;

grant execute on function public.create_checkout_order(
  text, text, text, text, text, public.payment_method, text, jsonb
) to service_role;

-- 5. Atomic admin order update RPC (validates transitions + restores stock on CANCELLED)
create or replace function public.update_admin_order(
  target_order_id uuid,
  next_order_status public.order_status default null,
  next_payment_status public.payment_status default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders%rowtype;
  updated_order public.orders%rowtype;
  resolved_order_status public.order_status;
  resolved_payment_status public.payment_status;
begin
  select *
  into current_order
  from public.orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  resolved_order_status := coalesce(next_order_status, current_order.order_status);
  resolved_payment_status := coalesce(next_payment_status, current_order.payment_status);

  -- Enforce forward-only fulfillment transitions
  if resolved_order_status <> current_order.order_status then
    if not (
      (current_order.order_status = 'PENDING_CONFIRMATION' and resolved_order_status in ('CONFIRMED', 'CANCELLED')) or
      (current_order.order_status = 'CONFIRMED' and resolved_order_status in ('OUT_FOR_DELIVERY', 'CANCELLED')) or
      (current_order.order_status = 'OUT_FOR_DELIVERY' and resolved_order_status in ('DELIVERED', 'CANCELLED'))
    ) then
      raise exception 'Invalid status transition.';
    end if;
  end if;

  -- Restore stock atomically exactly once when transitioning into CANCELLED
  if current_order.order_status <> 'CANCELLED' and resolved_order_status = 'CANCELLED' then
    with grouped_restores as (
      select product_id, sum(quantity)::integer as quantity
      from public.order_items
      where order_id = target_order_id
        and product_id is not null
      group by product_id
    ),
    locked_products as (
      select p.id, gr.quantity
      from public.products p
      join grouped_restores gr on gr.product_id = p.id
      order by p.id asc
      for update of p
    )
    update public.products p
    set stock_quantity = p.stock_quantity + lp.quantity
    from locked_products lp
    where p.id = lp.id;
  end if;

  update public.orders
  set
    order_status = resolved_order_status,
    payment_status = resolved_payment_status
  where id = target_order_id
  returning *
  into updated_order;

  return updated_order;
end;
$$;

revoke all on function public.update_admin_order(
  uuid, public.order_status, public.payment_status
) from public, anon, authenticated;

grant execute on function public.update_admin_order(
  uuid, public.order_status, public.payment_status
) to service_role;
