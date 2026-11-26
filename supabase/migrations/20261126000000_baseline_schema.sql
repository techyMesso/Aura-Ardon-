-- =========================================================
-- Auro Ardon — Baseline Schema Migration
-- Idempotent bootstrap for staging and fresh environments.
-- =========================================================

create extension if not exists "pgcrypto";

-- ─── ENUMS ───────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum (
      'PENDING_CONFIRMATION',
      'CONFIRMED',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum (
      'CASH_ON_DELIVERY',
      'WHATSAPP'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum (
      'PENDING',
      'PAID'
    );
  end if;
end
$$;

-- ─── TABLES ──────────────────────────────────────────────
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

create index if not exists categories_parent_idx on public.categories (parent_id);
create index if not exists categories_order_idx  on public.categories (display_order);

create table if not exists public.products (
  id             uuid          primary key default gen_random_uuid(),
  title          text          not null,
  slug           text          unique,
  description    text          not null,
  category       text          not null,
  category_id    uuid          references public.categories(id) on delete set null,
  price          numeric(12,2) not null check (price > 0),
  stock_quantity integer       not null default 0 check (stock_quantity >= 0),
  material       text,
  finish         text,
  size_label     text,
  in_the_box     text,
  care           text,
  images         text[]        not null default '{}',
  blur_data_url  text,
  is_featured    boolean       not null default false,
  active         boolean       not null default true,
  created_at     timestamptz   not null default timezone('utc', now())
);

create index if not exists products_created_at_idx       on public.products (created_at desc);
create index if not exists products_category_id_idx      on public.products (category_id);
create index if not exists products_category_active_idx  on public.products (category_id, active);
create unique index if not exists products_slug_unique_idx on public.products (slug) where slug is not null;
create index if not exists products_featured_idx         on public.products (is_featured) where is_featured = true;
create index if not exists products_active_idx           on public.products (active) where active = true;

create table if not exists public.orders (
  id                uuid                 primary key default gen_random_uuid(),
  customer_name     text                 not null,
  customer_email    text,
  customer_phone    text                 not null,
  customer_location text                 not null,
  notes             text,
  idempotency_key   text,
  payment_method    public.payment_method not null default 'CASH_ON_DELIVERY',
  payment_status    public.payment_status not null default 'PENDING',
  order_status      public.order_status   not null default 'PENDING_CONFIRMATION',
  subtotal          numeric(12,2)         not null check (subtotal >= 0),
  shipping_fee      numeric(12,2)         not null default 0 check (shipping_fee >= 0),
  total             numeric(12,2)         not null check (total >= 0),
  created_at        timestamptz           not null default timezone('utc', now())
);

create index if not exists orders_created_at_idx        on public.orders (created_at desc);
create index if not exists orders_status_idx            on public.orders (order_status);
create index if not exists orders_status_created_at_idx on public.orders (order_status, created_at desc);
create index if not exists orders_phone_idx             on public.orders (customer_phone);
create unique index if not exists orders_idempotency_key_unique_idx
  on public.orders (idempotency_key)
  where idempotency_key is not null;

create table if not exists public.order_items (
  id            uuid          primary key default gen_random_uuid(),
  order_id      uuid          not null references public.orders(id) on delete cascade,
  product_id    uuid          references public.products(id) on delete set null,
  product_title text          not null,
  quantity      integer       not null check (quantity > 0),
  unit_price    numeric(12,2) not null check (unit_price >= 0),
  created_at    timestamptz   not null default timezone('utc', now())
);

create index if not exists order_items_order_id_idx   on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);

-- ─── HELPER & TRANSACTIONAL RPCS ─────────────────────────
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

  if resolved_order_status <> current_order.order_status then
    if not (
      (current_order.order_status = 'PENDING_CONFIRMATION' and resolved_order_status in ('CONFIRMED', 'CANCELLED')) or
      (current_order.order_status = 'CONFIRMED' and resolved_order_status in ('OUT_FOR_DELIVERY', 'CANCELLED')) or
      (current_order.order_status = 'OUT_FOR_DELIVERY' and resolved_order_status in ('DELIVERED', 'CANCELLED'))
    ) then
      raise exception 'Invalid status transition.';
    end if;
  end if;

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

-- ─── ROW LEVEL SECURITY ──────────────────────────────────
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

revoke insert, update, delete on public.categories from anon, authenticated;
revoke insert, update, delete on public.products from anon, authenticated;
revoke insert, update, delete on public.orders from anon, authenticated;
revoke insert, update, delete on public.order_items from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'categories' and policyname = 'Public can view categories'
  ) then
    create policy "Public can view categories"
      on public.categories for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'products' and policyname = 'Public can view active products'
  ) then
    create policy "Public can view active products"
      on public.products for select using (active = true);
  end if;
end
$$;

-- ─── STORAGE BUCKET ──────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Public can read product images'
  ) then
    create policy "Public can read product images"
      on storage.objects for select
      using (bucket_id = 'product-images');
  end if;
end
$$;

