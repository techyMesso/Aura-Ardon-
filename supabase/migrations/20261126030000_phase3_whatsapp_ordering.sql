-- =========================================================
-- Phase 3: WhatsApp Ordering, Customers Upsert, Stock Ledger
-- Reservation, Readable Order Numbers & Transactional
-- place_order(...) RPC
-- =========================================================

-- ─── TABLE: customers (foundational for Phase 3 + Phase 7) ─
create table if not exists public.customers (
  id                  uuid          primary key default gen_random_uuid(),
  phone               text          not null unique,
  full_name           text          not null,
  names_used          text[]        not null default '{}',
  last_zone           text,
  last_address        text,
  order_count         integer       not null default 0 check (order_count >= 0),
  lifetime_value      numeric(12,2) not null default 0 check (lifetime_value >= 0),
  cancelled_count     integer       not null default 0 check (cancelled_count >= 0),
  is_flagged          boolean       not null default false,
  is_blocked          boolean       not null default false,
  marketing_opt_in    boolean       not null default false,
  marketing_opt_in_at timestamptz,
  notes               text,
  tags                text[]        not null default '{}',
  first_order_at      timestamptz,
  last_order_at       timestamptz,
  created_at          timestamptz   not null default timezone('utc', now()),
  updated_at          timestamptz   not null default timezone('utc', now())
);

create index if not exists customers_phone_idx on public.customers (phone);
create index if not exists customers_last_order_idx on public.customers (last_order_at desc);

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'customers_set_updated_at'
  ) then
    create trigger customers_set_updated_at
      before update on public.customers
      for each row
      execute function public.set_updated_at();
  end if;
end
$$;

alter table public.customers enable row level security;
revoke all on public.customers from anon, authenticated;

-- ─── TABLE: stock_movements ledger (Phase 3 + Phase 4) ───
create table if not exists public.stock_movements (
  id          uuid        primary key default gen_random_uuid(),
  product_id  uuid        not null references public.products(id) on delete cascade,
  order_id    uuid        references public.orders(id) on delete set null,
  change      integer     not null,
  type        text        not null check (
                            type in (
                              'initial_stock',
                              'order_reserved',
                              'cancel_restock',
                              'return_restock',
                              'manual_adjustment',
                              'damaged_writeoff'
                            )
                          ),
  note        text,
  created_by  text        not null default 'system',
  created_at  timestamptz not null default timezone('utc', now())
);

create index if not exists stock_movements_product_id_idx on public.stock_movements (product_id, created_at desc);
create index if not exists stock_movements_order_id_idx   on public.stock_movements (order_id);

alter table public.stock_movements enable row level security;
revoke all on public.stock_movements from anon, authenticated;

-- Backfill initial_stock movements for existing products so ledger sum = current stock_quantity
insert into public.stock_movements (product_id, change, type, note, created_by)
select
  p.id,
  p.stock_quantity,
  'initial_stock',
  'Initial stock ledger baseline',
  'system'
from public.products p
where not exists (
  select 1 from public.stock_movements sm where sm.product_id = p.id
);

-- ─── EXTEND orders FOR WHATSAPP ORDERING ─────────────────
alter table public.orders
  add column if not exists order_number       text,
  add column if not exists channel            text not null default 'whatsapp',
  add column if not exists status             text not null default 'pending',
  add column if not exists delivery_zone_id   uuid references public.delivery_zones(id) on delete set null,
  add column if not exists delivery_zone_name text,
  add column if not exists delivery_address   text,
  add column if not exists town_county        text,
  add column if not exists discount_code      text,
  add column if not exists discount_amount    numeric(12,2) not null default 0,
  add column if not exists is_gift            boolean not null default false,
  add column if not exists gift_note          text,
  add column if not exists hide_prices        boolean not null default false,
  add column if not exists marketing_opt_in   boolean not null default false,
  add column if not exists customer_id        uuid references public.customers(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_status_valid_check'
  ) then
    alter table public.orders
      add constraint orders_status_valid_check
      check (status in ('pending', 'confirmed', 'dispatched', 'delivered', 'cancelled', 'returned'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_discount_amount_nonneg_check'
  ) then
    alter table public.orders
      add constraint orders_discount_amount_nonneg_check
      check (discount_amount >= 0);
  end if;
end
$$;

create unique index if not exists orders_order_number_unique_idx
  on public.orders (order_number)
  where order_number is not null;

create index if not exists orders_customer_id_idx on public.orders (customer_id);
create index if not exists orders_delivery_zone_id_idx on public.orders (delivery_zone_id);

-- ─── FUNCTION: generate_order_number() ───────────────────
-- Generates unique short readable code e.g. AA-7F3K2 (no ambiguous 0/O/1/I/L)
create or replace function public.generate_order_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidate text;
  attempt integer := 0;
  i integer;
  idx integer;
begin
  loop
    attempt := attempt + 1;
    candidate := 'AA-';
    for i in 1..5 loop
      idx := 1 + floor(random() * length(alphabet))::integer;
      candidate := candidate || substr(alphabet, idx, 1);
    end loop;

    if not exists (select 1 from public.orders where order_number = candidate) then
      return candidate;
    end if;

    if attempt >= 25 then
      raise exception 'Unable to generate unique order number.';
    end if;
  end loop;
end;
$$;

revoke all on function public.generate_order_number() from public, anon, authenticated;
grant execute on function public.generate_order_number() to service_role;

-- Backfill any pre-existing orders with order_number and normalized status
update public.orders
set
  order_number = coalesce(order_number, public.generate_order_number()),
  status = case order_status
    when 'PENDING_CONFIRMATION' then 'pending'
    when 'CONFIRMED' then 'confirmed'
    when 'OUT_FOR_DELIVERY' then 'dispatched'
    when 'DELIVERED' then 'delivered'
    when 'CANCELLED' then 'cancelled'
    else 'pending'
  end
where order_number is null;

-- ─── FUNCTION: place_order(...) ──────────────────────────
create or replace function public.place_order(
  p_customer_name      text,
  p_customer_phone     text,
  p_delivery_zone_id   uuid,
  p_delivery_address   text,
  p_town_county        text,
  p_notes              text,
  p_is_gift            boolean,
  p_gift_note          text,
  p_hide_prices        boolean,
  p_marketing_opt_in   boolean,
  p_discount_code      text,
  p_discount_amount    numeric,
  p_idempotency_key    text,
  p_items              jsonb
)
returns table (
  order_id           uuid,
  order_number       text,
  subtotal           numeric,
  discount_code      text,
  discount_amount    numeric,
  delivery_zone_name text,
  shipping_fee       numeric,
  total              numeric,
  status             text,
  replayed           boolean,
  item_summary       jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings           public.store_settings%rowtype;
  v_zone               public.delivery_zones%rowtype;
  v_existing_order     public.orders%rowtype;
  v_inserted_order     public.orders%rowtype;
  v_customer           public.customers%rowtype;
  v_customer_id        uuid;
  v_order_number       text;
  v_subtotal           numeric(12,2) := 0;
  v_discount           numeric(12,2) := 0;
  v_delivery_fee       numeric(12,2) := 0;
  v_total              numeric(12,2) := 0;
  v_combined_location  text;
  v_requested_count    integer;
  v_locked_count       integer;
  v_locked_products    jsonb;
  v_short_item         record;
  v_item               record;
  v_rows_updated       integer;
  v_item_summary       jsonb;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'Missing Idempotency-Key.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your bag is empty.';
  end if;

  if exists (
    with requested_items as (
      select
        (item->>'product_id')::uuid as product_id,
        (item->>'quantity')::integer as quantity
      from jsonb_array_elements(p_items) as item
    )
    select 1
    from requested_items
    where product_id is null or quantity is null or quantity <= 0
  ) then
    raise exception 'Invalid quantity in bag.';
  end if;

  -- Serialize retries for the same logical checkout
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  select *
  into v_existing_order
  from public.orders
  where idempotency_key = p_idempotency_key;

  if found then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'title', oi.product_title,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'line_total', (oi.unit_price * oi.quantity)::numeric(12,2)
        )
        order by oi.created_at asc
      ),
      '[]'::jsonb
    )
    into v_item_summary
    from public.order_items oi
    where oi.order_id = v_existing_order.id;

    return query
    select
      v_existing_order.id,
      coalesce(v_existing_order.order_number, upper(left(v_existing_order.id::text, 8))),
      v_existing_order.subtotal,
      v_existing_order.discount_code,
      v_existing_order.discount_amount,
      coalesce(v_existing_order.delivery_zone_name, ''),
      v_existing_order.shipping_fee,
      v_existing_order.total,
      v_existing_order.status,
      true,
      v_item_summary;
    return;
  end if;

  -- 1. Check store is open
  select * into v_settings from public.store_settings where id = true;
  if found and v_settings.is_store_open = false then
    raise exception 'Store closed: %',
      coalesce(nullif(btrim(v_settings.holiday_banner_message), ''), 'Our Nairobi studio is temporarily closed for orders.');
  end if;

  -- 2. Check customer isn't blocked (Phase 7)
  select * into v_customer from public.customers where phone = p_customer_phone;
  if found and v_customer.is_blocked = true then
    raise exception 'Please contact us on WhatsApp.';
  end if;

  -- 3. Validate delivery zone on the server
  select *
  into v_zone
  from public.delivery_zones
  where id = p_delivery_zone_id
    and active = true;

  if not found then
    raise exception 'Selected delivery zone is not available.';
  end if;

  if v_zone.is_outside_nairobi and nullif(btrim(coalesce(p_town_county, '')), '') is null then
    raise exception 'Town or county is required for deliveries outside Nairobi.';
  end if;

  -- 4. Lock requested products in deterministic UUID order (prevents deadlocks)
  with requested_items as (
    select
      (item->>'product_id')::uuid as product_id,
      (item->>'quantity')::integer as quantity
    from jsonb_array_elements(p_items) as item
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
        order by lr.title asc
      ) filter (where lr.id is not null),
      '[]'::jsonb
    )
  into v_requested_count, v_locked_count, v_locked_products
  from grouped_items gi
  left join locked_rows lr on lr.id = gi.product_id;

  if v_locked_count <> v_requested_count then
    raise exception 'One or more items in your bag are no longer available.';
  end if;

  -- Report the exact item that just sold out or ran short
  select lp.title, lp.stock_quantity, lp.active, lp.quantity
  into v_short_item
  from jsonb_to_recordset(v_locked_products) as lp(
    product_id uuid,
    title text,
    price numeric,
    stock_quantity integer,
    active boolean,
    quantity integer
  )
  where lp.active = false or lp.stock_quantity < lp.quantity
  limit 1;

  if found then
    if v_short_item.active = false or v_short_item.stock_quantity <= 0 then
      raise exception 'Item just sold out: %', v_short_item.title;
    else
      raise exception 'Insufficient stock for % (only % left).', v_short_item.title, v_short_item.stock_quantity;
    end if;
  end if;

  -- 5. Compute server-side subtotal, discount, free-delivery threshold, and total
  select coalesce(sum(lp.price * lp.quantity), 0)::numeric(12,2)
  into v_subtotal
  from jsonb_to_recordset(v_locked_products) as lp(
    product_id uuid,
    title text,
    price numeric,
    stock_quantity integer,
    active boolean,
    quantity integer
  );

  v_discount := least(v_subtotal, greatest(0, coalesce(p_discount_amount, 0)))::numeric(12,2);

  if coalesce(v_settings.free_delivery_threshold, 0) > 0
     and v_subtotal >= v_settings.free_delivery_threshold then
    v_delivery_fee := 0;
  else
    v_delivery_fee := v_zone.fee;
  end if;

  v_total := (greatest(0, v_subtotal - v_discount) + v_delivery_fee)::numeric(12,2);

  -- Build formatted address string for backward compatibility with existing admin screens
  v_combined_location := v_zone.name || ' — ' || btrim(p_delivery_address);
  if nullif(btrim(coalesce(p_town_county, '')), '') is not null then
    v_combined_location := v_combined_location || ' (' || btrim(p_town_county) || ')';
  end if;

  -- 6. Upsert customer by normalized phone
  insert into public.customers (
    phone,
    full_name,
    names_used,
    last_zone,
    last_address,
    order_count,
    marketing_opt_in,
    marketing_opt_in_at,
    first_order_at,
    last_order_at
  )
  values (
    p_customer_phone,
    btrim(p_customer_name),
    array[btrim(p_customer_name)],
    v_zone.name,
    v_combined_location,
    1,
    coalesce(p_marketing_opt_in, false),
    case when coalesce(p_marketing_opt_in, false) then timezone('utc', now()) else null end,
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (phone) do update
  set
    full_name = excluded.full_name,
    names_used = case
      when excluded.full_name = any(public.customers.names_used) then public.customers.names_used
      else array_append(public.customers.names_used, excluded.full_name)
    end,
    last_zone = excluded.last_zone,
    last_address = excluded.last_address,
    order_count = public.customers.order_count + 1,
    marketing_opt_in = case
      when excluded.marketing_opt_in then true
      else public.customers.marketing_opt_in
    end,
    marketing_opt_in_at = case
      when excluded.marketing_opt_in and public.customers.marketing_opt_in_at is null
        then timezone('utc', now())
      else public.customers.marketing_opt_in_at
    end,
    last_order_at = timezone('utc', now())
  returning id into v_customer_id;

  -- 7. Generate unique readable order number & insert order
  v_order_number := public.generate_order_number();

  insert into public.orders (
    order_number,
    channel,
    status,
    customer_id,
    customer_name,
    customer_email,
    customer_phone,
    customer_location,
    delivery_zone_id,
    delivery_zone_name,
    delivery_address,
    town_county,
    notes,
    is_gift,
    gift_note,
    hide_prices,
    marketing_opt_in,
    discount_code,
    discount_amount,
    idempotency_key,
    payment_method,
    payment_status,
    order_status,
    subtotal,
    shipping_fee,
    total
  )
  values (
    v_order_number,
    'whatsapp',
    'pending',
    v_customer_id,
    btrim(p_customer_name),
    null,
    p_customer_phone,
    v_combined_location,
    v_zone.id,
    v_zone.name,
    btrim(p_delivery_address),
    nullif(btrim(coalesce(p_town_county, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    coalesce(p_is_gift, false),
    case when coalesce(p_is_gift, false) then nullif(btrim(coalesce(p_gift_note, '')), '') else null end,
    case when coalesce(p_is_gift, false) then coalesce(p_hide_prices, true) else false end,
    coalesce(p_marketing_opt_in, false),
    nullif(upper(btrim(coalesce(p_discount_code, ''))), ''),
    v_discount,
    p_idempotency_key,
    'WHATSAPP',
    'PENDING',
    'PENDING_CONFIRMATION',
    v_subtotal,
    v_delivery_fee,
    v_total
  )
  returning *
  into v_inserted_order;

  -- 8. Insert order items, atomically reserve stock, and log stock_movements
  for v_item in
    select *
    from jsonb_to_recordset(v_locked_products) as lp(
      product_id uuid,
      title text,
      price numeric,
      stock_quantity integer,
      active boolean,
      quantity integer
    )
  loop
    insert into public.order_items (
      order_id,
      product_id,
      product_title,
      quantity,
      unit_price
    )
    values (
      v_inserted_order.id,
      v_item.product_id,
      v_item.title,
      v_item.quantity,
      v_item.price
    );

    update public.products
    set stock_quantity = stock_quantity - v_item.quantity
    where id = v_item.product_id
      and stock_quantity >= v_item.quantity;

    get diagnostics v_rows_updated = row_count;
    if v_rows_updated <> 1 then
      raise exception 'Item just sold out: %', v_item.title;
    end if;

    insert into public.stock_movements (
      product_id,
      order_id,
      change,
      type,
      note,
      created_by
    )
    values (
      v_item.product_id,
      v_inserted_order.id,
      -v_item.quantity,
      'order_reserved',
      'Reserved by order ' || v_order_number,
      'checkout'
    );
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'title', lp.title,
        'quantity', lp.quantity,
        'unit_price', lp.price,
        'line_total', (lp.price * lp.quantity)::numeric(12,2)
      )
      order by lp.title asc
    ),
    '[]'::jsonb
  )
  into v_item_summary
  from jsonb_to_recordset(v_locked_products) as lp(
    product_id uuid,
    title text,
    price numeric,
    stock_quantity integer,
    active boolean,
    quantity integer
  );

  return query
  select
    v_inserted_order.id,
    v_order_number,
    v_inserted_order.subtotal,
    v_inserted_order.discount_code,
    v_inserted_order.discount_amount,
    v_zone.name,
    v_inserted_order.shipping_fee,
    v_inserted_order.total,
    v_inserted_order.status,
    false,
    v_item_summary;
end;
$$;

revoke all on function public.place_order(
  text, text, uuid, text, text, text, boolean, text, boolean, boolean, text, numeric, text, jsonb
) from public, anon, authenticated;

grant execute on function public.place_order(
  text, text, uuid, text, text, text, boolean, text, boolean, boolean, text, numeric, text, jsonb
) to service_role;

