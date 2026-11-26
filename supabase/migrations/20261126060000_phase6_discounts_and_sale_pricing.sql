-- =========================================================
-- Phase 6: Discount Codes, Redemptions, Server-Only Promo
-- Evaluation & Product Sale Pricing (compare_at_price)
-- =========================================================

-- ─── 1. SALE PRICING ON products ─────────────────────────
alter table public.products
  add column if not exists compare_at_price numeric(12,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_compare_at_price_higher_check'
  ) then
    alter table public.products
      add constraint products_compare_at_price_higher_check
      check (compare_at_price is null or compare_at_price > price);
  end if;
end
$$;

-- ─── 2. TABLE: discount_codes ────────────────────────────
create table if not exists public.discount_codes (
  id               uuid          primary key default gen_random_uuid(),
  code             text          not null,
  description      text,
  type             text          not null check (type in ('percent', 'fixed', 'free_delivery')),
  value            numeric(12,2) not null default 0 check (value >= 0),
  min_order_amount numeric(12,2) not null default 0 check (min_order_amount >= 0),
  starts_at        timestamptz,
  ends_at          timestamptz,
  usage_limit      integer       check (usage_limit is null or usage_limit > 0),
  per_phone_limit  integer       check (per_phone_limit is null or per_phone_limit > 0),
  first_order_only boolean       not null default false,
  used_count       integer       not null default 0 check (used_count >= 0),
  active           boolean       not null default true,
  created_at       timestamptz   not null default timezone('utc', now()),
  updated_at       timestamptz   not null default timezone('utc', now()),
  constraint discount_codes_code_nonempty_check check (btrim(code) <> ''),
  constraint discount_codes_value_by_type_check check (
    (type = 'percent' and value > 0 and value <= 100)
    or (type = 'fixed' and value > 0)
    or (type = 'free_delivery' and value >= 0)
  ),
  constraint discount_codes_date_window_check check (
    ends_at is null or starts_at is null or ends_at >= starts_at
  )
);

-- Case-insensitive unique code
create unique index if not exists discount_codes_code_lower_idx
  on public.discount_codes (lower(btrim(code)));

create index if not exists discount_codes_active_idx
  on public.discount_codes (active, created_at desc);

alter table public.discount_codes enable row level security;
revoke all on public.discount_codes from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'discount_codes_set_updated_at'
  ) then
    create trigger discount_codes_set_updated_at
      before update on public.discount_codes
      for each row
      execute function public.set_updated_at();
  end if;
end
$$;

-- ─── 3. TABLE: discount_redemptions ──────────────────────
create table if not exists public.discount_redemptions (
  id                    uuid          primary key default gen_random_uuid(),
  discount_code_id      uuid          not null references public.discount_codes(id) on delete restrict,
  order_id              uuid          not null unique references public.orders(id) on delete restrict,
  customer_phone        text          not null,
  discount_amount       numeric(12,2) not null default 0 check (discount_amount >= 0),
  free_delivery_applied boolean       not null default false,
  created_at            timestamptz   not null default timezone('utc', now())
);

create index if not exists discount_redemptions_code_phone_idx
  on public.discount_redemptions (discount_code_id, customer_phone);

create index if not exists discount_redemptions_code_created_idx
  on public.discount_redemptions (discount_code_id, created_at desc);

alter table public.discount_redemptions enable row level security;
revoke all on public.discount_redemptions from anon, authenticated;

-- ─── 4. FUNCTION: evaluate_discount_code(...) ────────────
-- Pure server-side validation & calculation of a discount code against
-- server-computed subtotal, zone fee, threshold, and optional phone.
create or replace function public.evaluate_discount_code(
  p_code                    text,
  p_subtotal                numeric,
  p_zone_fee                numeric,
  p_free_delivery_threshold numeric,
  p_customer_phone          text default null
)
returns table (
  discount_code_id      uuid,
  normalized_code       text,
  discount_type         text,
  discount_value        numeric,
  discount_amount       numeric,
  free_delivery_applied boolean,
  delivery_fee          numeric,
  total                 numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dc               public.discount_codes%rowtype;
  v_now              timestamptz := timezone('utc', now());
  v_clean_code       text := upper(btrim(coalesce(p_code, '')));
  v_clean_phone      text := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_active_uses      integer := 0;
  v_phone_uses       integer := 0;
  v_prior_orders     integer := 0;
  v_disc_amt         numeric(12,2) := 0;
  v_free_deliv_code  boolean := false;
  v_delivery_fee     numeric(12,2) := 0;
  v_total            numeric(12,2) := 0;
begin
  if v_clean_code = '' then
    raise exception 'Enter a discount code.';
  end if;

  select *
  into v_dc
  from public.discount_codes dc
  where lower(btrim(dc.code)) = lower(v_clean_code);

  if not found or v_dc.active = false then
    raise exception 'Discount code "%" is not active or does not exist.', v_clean_code;
  end if;

  if v_dc.starts_at is not null and v_now < v_dc.starts_at then
    raise exception 'Discount code "%" is not active yet.', upper(v_dc.code);
  end if;

  if v_dc.ends_at is not null and v_now > v_dc.ends_at then
    raise exception 'Discount code "%" has expired.', upper(v_dc.code);
  end if;

  if p_subtotal < v_dc.min_order_amount then
    raise exception 'Minimum order of KES % is required to use "%".',
      trim(to_char(v_dc.min_order_amount, 'FM999,999,990.##')), upper(v_dc.code);
  end if;

  if v_dc.usage_limit is not null then
    select count(*)::integer
    into v_active_uses
    from public.discount_redemptions dr
    join public.orders o on o.id = dr.order_id
    where dr.discount_code_id = v_dc.id
      and coalesce(o.status, 'pending') <> 'cancelled';

    if v_active_uses >= v_dc.usage_limit then
      raise exception 'Discount code "%" has reached its usage limit.', upper(v_dc.code);
    end if;
  end if;

  if v_clean_phone is not null then
    if v_dc.per_phone_limit is not null then
      select count(*)::integer
      into v_phone_uses
      from public.discount_redemptions dr
      join public.orders o on o.id = dr.order_id
      where dr.discount_code_id = v_dc.id
        and dr.customer_phone = v_clean_phone
        and coalesce(o.status, 'pending') <> 'cancelled';

      if v_phone_uses >= v_dc.per_phone_limit then
        raise exception 'You have already used discount code "%" the maximum number of times.', upper(v_dc.code);
      end if;
    end if;

    if v_dc.first_order_only then
      select count(*)::integer
      into v_prior_orders
      from public.orders o
      where o.customer_phone = v_clean_phone
        and coalesce(o.status, 'pending') <> 'cancelled';

      if v_prior_orders > 0 then
        raise exception 'Discount code "%" is valid for first-time customers only.', upper(v_dc.code);
      end if;
    end if;
  end if;

  if v_dc.type = 'percent' then
    v_disc_amt := least(p_subtotal, round((p_subtotal * v_dc.value) / 100.0, 2))::numeric(12,2);
  elsif v_dc.type = 'fixed' then
    v_disc_amt := least(p_subtotal, v_dc.value)::numeric(12,2);
  elsif v_dc.type = 'free_delivery' then
    v_disc_amt := 0;
    v_free_deliv_code := true;
  end if;

  if v_free_deliv_code
     or (coalesce(p_free_delivery_threshold, 0) > 0 and p_subtotal >= p_free_delivery_threshold) then
    v_delivery_fee := 0;
  else
    v_delivery_fee := greatest(0, coalesce(p_zone_fee, 0))::numeric(12,2);
  end if;

  v_total := (greatest(0, p_subtotal - v_disc_amt) + v_delivery_fee)::numeric(12,2);

  return query
  select
    v_dc.id,
    upper(btrim(v_dc.code)),
    v_dc.type,
    v_dc.value,
    v_disc_amt,
    v_free_deliv_code,
    v_delivery_fee,
    v_total;
end;
$$;

revoke all on function public.evaluate_discount_code(text, numeric, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.evaluate_discount_code(text, numeric, numeric, numeric, text) to service_role;

-- ─── 5. UPGRADE place_order(...) FOR SERVER-ONLY DISCOUNTS ─
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
  v_discount_code_id   uuid := null;
  v_normalized_code    text := null;
  v_discount           numeric(12,2) := 0;
  v_free_deliv_code    boolean := false;
  v_delivery_fee       numeric(12,2) := 0;
  v_total              numeric(12,2) := 0;
  v_eval               record;
  v_combined_location  text;
  v_requested_count    integer;
  v_locked_count       integer;
  v_locked_products    jsonb;
  v_short_item         record;
  v_item               record;
  v_rows_updated       integer;
  v_item_summary       jsonb;
  v_clean_code         text := nullif(upper(btrim(coalesce(p_discount_code, ''))), '');
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
  from public.orders o
  where o.idempotency_key = p_idempotency_key;

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
  select * into v_customer from public.customers c where c.phone = p_customer_phone;
  if found and v_customer.is_blocked = true then
    raise exception 'Please contact us on WhatsApp.';
  end if;

  -- 3. Validate delivery zone on the server
  select *
  into v_zone
  from public.delivery_zones dz
  where dz.id = p_delivery_zone_id
    and dz.active = true;

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

  -- 5. Compute server-side subtotal, discount (locked in DB), free-delivery threshold, and total
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

  if v_clean_code is not null then
    -- Lock matching discount_code row to prevent concurrent over-redemption races
    perform 1
    from public.discount_codes dc
    where lower(btrim(dc.code)) = lower(v_clean_code)
    for update;

    select *
    into v_eval
    from public.evaluate_discount_code(
      v_clean_code,
      v_subtotal,
      v_zone.fee,
      coalesce(v_settings.free_delivery_threshold, 0),
      p_customer_phone
    );

    v_discount_code_id := v_eval.discount_code_id;
    v_normalized_code := v_eval.normalized_code;
    v_discount := v_eval.discount_amount;
    v_free_deliv_code := v_eval.free_delivery_applied;
    v_delivery_fee := v_eval.delivery_fee;
    v_total := v_eval.total;
  else
    v_discount := 0;
    if coalesce(v_settings.free_delivery_threshold, 0) > 0
       and v_subtotal >= v_settings.free_delivery_threshold then
      v_delivery_fee := 0;
    else
      v_delivery_fee := v_zone.fee;
    end if;
    v_total := (v_subtotal + v_delivery_fee)::numeric(12,2);
  end if;

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
    v_normalized_code,
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

  -- Record discount redemption atomically if a code was applied
  if v_discount_code_id is not null then
    insert into public.discount_redemptions (
      discount_code_id,
      order_id,
      customer_phone,
      discount_amount,
      free_delivery_applied
    )
    values (
      v_discount_code_id,
      v_inserted_order.id,
      p_customer_phone,
      v_discount,
      v_free_deliv_code
    );

    update public.discount_codes dc
    set used_count = dc.used_count + 1
    where dc.id = v_discount_code_id;
  end if;

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

    update public.products p
    set stock_quantity = p.stock_quantity - v_item.quantity
    where p.id = v_item.product_id
      and p.stock_quantity >= v_item.quantity;

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

