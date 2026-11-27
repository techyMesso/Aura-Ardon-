-- =========================================================
-- Round 2, Phase 2: Analytics Accuracy & Test Orders
-- - events.is_internal & events.order_number (+ dedupe indexes)
-- - orders.is_test & invoices.is_test
-- - Separate TEST-INV-NNNN counter (real INV-YYYY-NNNN stays gap-free)
-- - Auto-flag orders whose customer_name starts with TEST
-- - Exclude test orders from analytics, customer LTV, discount usage counts
-- - Owner toggle RPC set_order_is_test(order_id, is_test) for pending orders
-- - Updated AOV = booked_revenue / non-cancelled orders (null when 0)
-- - Funnel integrity: actual whatsapp_order_sent + orders_created, optional internal traffic toggle
-- =========================================================

-- ─── 1. EVENTS: INTERNAL FLAG & ORDER DEDUPLICATION ──────
alter table public.events
  add column if not exists is_internal  boolean not null default false,
  add column if not exists order_number text;

create index if not exists events_internal_created_at_idx
  on public.events (is_internal, created_at desc);

create index if not exists events_begin_checkout_dedupe_idx
  on public.events (session_id, created_at desc)
  where name = 'begin_checkout';

create unique index if not exists events_whatsapp_order_sent_order_number_uidx
  on public.events (order_number)
  where name = 'whatsapp_order_sent' and order_number is not null;

-- ─── 2. TEST ORDERS & SEPARATE TEST-INV-NNNN SEQUENCE ────
alter table public.orders
  add column if not exists is_test boolean not null default false;

create index if not exists orders_is_test_created_at_idx
  on public.orders (is_test, created_at desc);

alter table public.invoices
  add column if not exists is_test boolean not null default false;

create index if not exists invoices_is_test_issued_at_idx
  on public.invoices (is_test, issued_at desc);

create table if not exists public.test_document_counters (
  doc_type    text    primary key check (doc_type in ('test_invoice')),
  last_number integer not null default 0 check (last_number >= 0)
);

alter table public.test_document_counters enable row level security;
revoke all on public.test_document_counters from anon, authenticated;
grant select on public.test_document_counters to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'test_document_counters'
      and policyname = 'Owner can view test document counters'
  ) then
    create policy "Owner can view test document counters"
      on public.test_document_counters
      for select
      to authenticated
      using ((select private.is_owner()));
  end if;
end
$$;

create or replace function public.next_test_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  insert into public.test_document_counters (doc_type, last_number)
  values ('test_invoice', 0)
  on conflict (doc_type) do nothing;

  update public.test_document_counters
  set last_number = last_number + 1
  where doc_type = 'test_invoice'
  returning last_number
  into v_next;

  return 'TEST-INV-' || lpad(v_next::text, 4, '0');
end;
$$;

revoke all on function public.next_test_invoice_number() from public, anon, authenticated;
grant execute on function public.next_test_invoice_number() to service_role;

create or replace function public.is_test_order_customer_name(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    btrim(coalesce(p_name, '')) like 'TEST%'
    or btrim(coalesce(p_name, '')) ~* '^test($|[\s\-_:\d])';
$$;

revoke all on function public.is_test_order_customer_name(text) from public, anon, authenticated;
grant execute on function public.is_test_order_customer_name(text) to service_role;

-- ─── 3. EXCLUDE TEST ORDERS FROM CUSTOMER STATS & DISCOUNTS ─
create or replace function public.recompute_customer_stats(
  p_customer_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_count     integer := 0;
  v_cancelled_count integer := 0;
  v_gross_active    numeric(12,2) := 0;
  v_returns_total   numeric(12,2) := 0;
  v_ltv             numeric(12,2) := 0;
begin
  if p_customer_id is null then
    return;
  end if;

  select
    count(*)::integer,
    count(*) filter (where coalesce(o.status, 'pending') = 'cancelled')::integer,
    coalesce(
      sum(o.total) filter (where coalesce(o.status, 'pending') <> 'cancelled'),
      0
    )::numeric(12,2)
  into v_order_count, v_cancelled_count, v_gross_active
  from public.orders o
  where o.customer_id = p_customer_id
    and coalesce(o.is_test, false) = false;

  select coalesce(sum(r.refund_amount), 0)::numeric(12,2)
  into v_returns_total
  from public.order_returns r
  join public.orders o on o.id = r.order_id
  where o.customer_id = p_customer_id
    and coalesce(o.is_test, false) = false
    and coalesce(o.status, 'pending') <> 'cancelled';

  v_ltv := greatest(0, v_gross_active - v_returns_total)::numeric(12,2);

  update public.customers c
  set
    order_count = v_order_count,
    cancelled_count = v_cancelled_count,
    lifetime_value = v_ltv
  where c.id = p_customer_id;
end;
$$;

revoke all on function public.recompute_customer_stats(uuid) from public, anon, authenticated;
grant execute on function public.recompute_customer_stats(uuid) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'orders_sync_customer_stats_on_is_test'
  ) then
    create trigger orders_sync_customer_stats_on_is_test
      after update of is_test on public.orders
      for each row
      execute function public.sync_customer_stats_on_order_change();
  end if;
end
$$;

create or replace function public.recompute_discount_code_used_count(
  p_discount_code_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_discount_code_id is null then
    return;
  end if;

  select count(*)::integer
  into v_count
  from public.discount_redemptions dr
  join public.orders o on o.id = dr.order_id
  where dr.discount_code_id = p_discount_code_id
    and coalesce(o.is_test, false) = false;

  update public.discount_codes dc
  set used_count = v_count
  where dc.id = p_discount_code_id;
end;
$$;

revoke all on function public.recompute_discount_code_used_count(uuid) from public, anon, authenticated;
grant execute on function public.recompute_discount_code_used_count(uuid) to service_role;

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
      and coalesce(o.is_test, false) = false
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
        and coalesce(o.is_test, false) = false
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
        and coalesce(o.is_test, false) = false
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

-- ─── 4. UPDATE place_order(...) TO AUTO-FLAG TEST ORDERS ─
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
  v_customer_flagged   boolean := false;
  v_is_test            boolean := public.is_test_order_customer_name(p_customer_name);
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
  v_req                record;
  v_product            public.products%rowtype;
  v_variant            public.product_variants%rowtype;
  v_has_active_vars    boolean;
  v_unit_price         numeric(12,2);
  v_line_title         text;
  v_resolved_items     jsonb := '[]'::jsonb;
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

  select * into v_settings from public.store_settings where id = true;
  if found and v_settings.is_store_open = false then
    raise exception 'Store closed: %',
      coalesce(nullif(btrim(v_settings.holiday_banner_message), ''), 'Our Nairobi studio is temporarily closed for orders.');
  end if;

  select * into v_customer from public.customers c where c.phone = p_customer_phone;
  if found then
    if v_customer.is_blocked = true then
      raise exception 'Please contact us on WhatsApp.';
    end if;
    v_customer_flagged := coalesce(v_customer.is_flagged, false);
  end if;

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

  for v_req in
    with raw_items as (
      select
        (item->>'product_id')::uuid as product_id,
        nullif(btrim(coalesce(item->>'variant_id', '')), '')::uuid as variant_id,
        (item->>'quantity')::integer as quantity
      from jsonb_array_elements(p_items) as item
    )
    select
      ri.product_id,
      ri.variant_id,
      sum(ri.quantity)::integer as quantity
    from raw_items ri
    group by ri.product_id, ri.variant_id
    order by ri.product_id asc, ri.variant_id asc nulls first
  loop
    select *
    into v_product
    from public.products p
    where p.id = v_req.product_id
    for update;

    if not found then
      raise exception 'One or more items in your bag are no longer available.';
    end if;

    if v_product.status <> 'active' or v_product.active = false then
      raise exception 'Item just sold out: %', v_product.title;
    end if;

    select exists (
      select 1
      from public.product_variants pv
      where pv.product_id = v_product.id
        and pv.active = true
    )
    into v_has_active_vars;

    if v_req.variant_id is not null then
      select *
      into v_variant
      from public.product_variants pv
      where pv.id = v_req.variant_id
        and pv.product_id = v_product.id
      for update;

      if not found or v_variant.active = false then
        raise exception 'Item just sold out: %', v_product.title;
      end if;

      v_line_title := v_product.title || ' (' || v_variant.name || ')';

      if v_variant.stock_quantity < v_req.quantity then
        if v_variant.stock_quantity <= 0 then
          raise exception 'Item just sold out: %', v_line_title;
        else
          raise exception 'Insufficient stock for % (only % left).', v_line_title, v_variant.stock_quantity;
        end if;
      end if;

      v_unit_price := coalesce(v_variant.price_override, v_product.price)::numeric(12,2);

      v_resolved_items := v_resolved_items || jsonb_build_array(
        jsonb_build_object(
          'product_id', v_product.id,
          'variant_id', v_variant.id,
          'variant_name', v_variant.name,
          'variant_sku', v_variant.sku,
          'title', v_line_title,
          'price', v_unit_price,
          'quantity', v_req.quantity
        )
      );
    else
      if v_has_active_vars then
        raise exception 'Please select an option for % before ordering.', v_product.title;
      end if;

      if v_product.stock_quantity < v_req.quantity then
        if v_product.stock_quantity <= 0 then
          raise exception 'Item just sold out: %', v_product.title;
        else
          raise exception 'Insufficient stock for % (only % left).', v_product.title, v_product.stock_quantity;
        end if;
      end if;

      v_unit_price := v_product.price::numeric(12,2);

      v_resolved_items := v_resolved_items || jsonb_build_array(
        jsonb_build_object(
          'product_id', v_product.id,
          'variant_id', null,
          'variant_name', null,
          'variant_sku', null,
          'title', v_product.title,
          'price', v_unit_price,
          'quantity', v_req.quantity
        )
      );
    end if;

    v_subtotal := (v_subtotal + (v_unit_price * v_req.quantity))::numeric(12,2);
  end loop;

  if v_clean_code is not null then
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

  insert into public.customers (
    phone,
    full_name,
    names_used,
    last_zone,
    last_address,
    zones_used,
    addresses_used,
    order_count,
    lifetime_value,
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
    array[v_zone.name],
    array[v_combined_location],
    case when v_is_test then 0 else 1 end,
    case when v_is_test then 0 else v_total end,
    case when v_is_test then false else coalesce(p_marketing_opt_in, false) end,
    case when not v_is_test and coalesce(p_marketing_opt_in, false) then timezone('utc', now()) else null end,
    case when v_is_test then null else timezone('utc', now()) end,
    case when v_is_test then null else timezone('utc', now()) end
  )
  on conflict (phone) do update
  set
    full_name = case when v_is_test then public.customers.full_name else excluded.full_name end,
    names_used = case
      when v_is_test then public.customers.names_used
      when excluded.full_name = any(public.customers.names_used) then public.customers.names_used
      else array_append(public.customers.names_used, excluded.full_name)
    end,
    last_zone = case when v_is_test then public.customers.last_zone else excluded.last_zone end,
    last_address = case when v_is_test then public.customers.last_address else excluded.last_address end,
    zones_used = case
      when v_is_test then public.customers.zones_used
      when excluded.last_zone = any(public.customers.zones_used) then public.customers.zones_used
      else array_append(public.customers.zones_used, excluded.last_zone)
    end,
    addresses_used = case
      when v_is_test then public.customers.addresses_used
      when excluded.last_address = any(public.customers.addresses_used) then public.customers.addresses_used
      else array_append(public.customers.addresses_used, excluded.last_address)
    end,
    marketing_opt_in = case
      when not v_is_test and excluded.marketing_opt_in then true
      else public.customers.marketing_opt_in
    end,
    marketing_opt_in_at = case
      when not v_is_test and excluded.marketing_opt_in and public.customers.marketing_opt_in_at is null
        then timezone('utc', now())
      else public.customers.marketing_opt_in_at
    end,
    first_order_at = case
      when not v_is_test and public.customers.first_order_at is null then timezone('utc', now())
      else public.customers.first_order_at
    end,
    last_order_at = case
      when v_is_test then public.customers.last_order_at
      else timezone('utc', now())
    end
  returning id into v_customer_id;

  v_order_number := public.generate_order_number();

  insert into public.orders (
    order_number,
    channel,
    status,
    is_test,
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
    needs_review,
    review_reason,
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
    v_is_test,
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
    v_customer_flagged,
    case when v_customer_flagged then 'Flagged customer phone — review before confirming' else null end,
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

    perform public.recompute_discount_code_used_count(v_discount_code_id);
  end if;

  for v_item in
    select *
    from jsonb_to_recordset(v_resolved_items) as ri(
      product_id uuid,
      variant_id uuid,
      variant_name text,
      variant_sku text,
      title text,
      price numeric,
      quantity integer
    )
  loop
    insert into public.order_items (
      order_id,
      product_id,
      variant_id,
      variant_name,
      variant_sku,
      product_title,
      quantity,
      unit_price
    )
    values (
      v_inserted_order.id,
      v_item.product_id,
      v_item.variant_id,
      v_item.variant_name,
      v_item.variant_sku,
      v_item.title,
      v_item.quantity,
      v_item.price
    );

    if v_item.variant_id is not null then
      update public.product_variants pv
      set stock_quantity = pv.stock_quantity - v_item.quantity
      where pv.id = v_item.variant_id
        and pv.stock_quantity >= v_item.quantity;

      get diagnostics v_rows_updated = row_count;
      if v_rows_updated <> 1 then
        raise exception 'Item just sold out: %', v_item.title;
      end if;

      insert into public.stock_movements (
        product_id,
        variant_id,
        order_id,
        change,
        type,
        note,
        created_by
      )
      values (
        v_item.product_id,
        v_item.variant_id,
        v_inserted_order.id,
        -v_item.quantity,
        'order_reserved',
        'Reserved by order ' || v_order_number || ' (' || v_item.variant_name || ')',
        'checkout'
      );

      perform public.sync_product_variant_stock(v_item.product_id);
    else
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
        variant_id,
        order_id,
        change,
        type,
        note,
        created_by
      )
      values (
        v_item.product_id,
        null,
        v_inserted_order.id,
        -v_item.quantity,
        'order_reserved',
        'Reserved by order ' || v_order_number,
        'checkout'
      );
    end if;
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'title', ri.title,
        'quantity', ri.quantity,
        'unit_price', ri.price,
        'line_total', (ri.price * ri.quantity)::numeric(12,2)
      )
      order by ri.title asc
    ),
    '[]'::jsonb
  )
  into v_item_summary
  from jsonb_to_recordset(v_resolved_items) as ri(
    product_id uuid,
    variant_id uuid,
    variant_name text,
    variant_sku text,
    title text,
    price numeric,
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

-- ─── 5. OWNER RPC: set_order_is_test(...) FOR PENDING ORDERS ─
create or replace function public.set_order_is_test(
  p_order_id uuid,
  p_is_test  boolean
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order         public.orders%rowtype;
  v_updated       public.orders%rowtype;
  v_discount_id   uuid;
begin
  select *
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if coalesce(v_order.status, 'pending') <> 'pending' then
    raise exception 'Only pending orders can be marked or unmarked as test orders.';
  end if;

  update public.orders o
  set is_test = coalesce(p_is_test, false)
  where o.id = p_order_id
  returning *
  into v_updated;

  if v_updated.customer_id is not null then
    perform public.recompute_customer_stats(v_updated.customer_id);
  end if;

  for v_discount_id in
    select dr.discount_code_id
    from public.discount_redemptions dr
    where dr.order_id = p_order_id
  loop
    perform public.recompute_discount_code_used_count(v_discount_id);
  end loop;

  return v_updated;
end;
$$;

revoke all on function public.set_order_is_test(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_order_is_test(uuid, boolean) to service_role;

-- ─── 6. UPDATE issue_invoice_for_order(...) FOR TEST-INV-NNNN ─
create or replace function public.issue_invoice_for_order(
  p_order_id  uuid,
  p_issued_by text default 'system'
)
returns public.invoices
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_existing      public.invoices%rowtype;
  v_order         public.orders%rowtype;
  v_settings      public.store_settings%rowtype;
  v_is_test       boolean := false;
  v_inv_number    text;
  v_share_token   text;
  v_actor         text := coalesce(nullif(btrim(coalesce(p_issued_by, '')), ''), 'system');
  v_customer_snap jsonb;
  v_lines_snap    jsonb;
  v_business_snap jsonb;
  v_created       public.invoices%rowtype;
begin
  select *
  into v_existing
  from public.invoices i
  where i.order_id = p_order_id;

  if found then
    return v_existing;
  end if;

  select *
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  select *
  into v_existing
  from public.invoices i
  where i.order_id = p_order_id;

  if found then
    return v_existing;
  end if;

  select * into v_settings from public.store_settings where id = true;
  v_is_test := coalesce(v_order.is_test, false);

  v_customer_snap := jsonb_build_object(
    'full_name', v_order.customer_name,
    'phone', v_order.customer_phone,
    'address', coalesce(v_order.delivery_address, v_order.customer_location),
    'delivery_zone_name', v_order.delivery_zone_name,
    'town_county', v_order.town_county,
    'location', v_order.customer_location,
    'order_number', coalesce(v_order.order_number, upper(left(v_order.id::text, 8))),
    'is_gift', coalesce(v_order.is_gift, false),
    'hide_prices', coalesce(v_order.hide_prices, false),
    'is_test', v_is_test
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'order_item_id', oi.id,
        'product_id', oi.product_id,
        'name', oi.product_title,
        'sku', coalesce(
          nullif(btrim(coalesce(oi.variant_sku, '')), ''),
          upper(
            'AA-' ||
            coalesce(
              nullif(
                left(regexp_replace(coalesce(p.slug, oi.product_title), '[^a-zA-Z0-9]+', '', 'g'), 8),
                ''
              ),
              'ITEM'
            ) || '-' ||
            right(replace(coalesce(oi.product_id, oi.id)::text, '-', ''), 4)
          )
        ),
        'qty', oi.quantity,
        'unit_price', oi.unit_price,
        'line_total', (oi.unit_price * oi.quantity)::numeric(12,2)
      )
      order by oi.created_at asc
    ),
    '[]'::jsonb
  )
  into v_lines_snap
  from public.order_items oi
  left join public.products p on p.id = oi.product_id
  where oi.order_id = p_order_id;

  v_business_snap := jsonb_build_object(
    'site_name', coalesce(v_settings.site_name, 'Auro Ardon'),
    'business_phone', coalesce(v_settings.business_phone, '254718038825'),
    'business_email', v_settings.business_email,
    'business_address', coalesce(v_settings.business_address, 'Nairobi, Kenya'),
    'kra_pin', v_settings.kra_pin,
    'logo_url', v_settings.logo_url,
    'currency', coalesce(v_settings.currency, 'KES'),
    'business_hours', coalesce(v_settings.business_hours, 'Mon–Sat, 9am–7pm EAT'),
    'invoice_footer', coalesce(v_settings.invoice_footer, 'Thank you for shopping with Auro Ardon, Nairobi.'),
    'payment_instructions', coalesce(v_settings.payment_instructions, 'Pay via Cash or M-Pesa on delivery.')
  );

  if v_is_test then
    v_inv_number := public.next_test_invoice_number();
  else
    v_inv_number := public.next_document_number('invoice');
  end if;

  v_share_token := encode(gen_random_bytes(24), 'hex');

  insert into public.invoices (
    invoice_number,
    order_id,
    is_test,
    status,
    issued_at,
    due_at,
    share_token,
    share_expires_at,
    customer_snapshot,
    lines_snapshot,
    business_snapshot,
    subtotal,
    discount_code,
    discount_amount,
    delivery_fee,
    total,
    created_by
  )
  values (
    v_inv_number,
    p_order_id,
    v_is_test,
    'unpaid',
    timezone('utc', now()),
    timezone('utc', now()) + interval '7 days',
    v_share_token,
    timezone('utc', now()) + interval '90 days',
    v_customer_snap,
    v_lines_snap,
    v_business_snap,
    v_order.subtotal,
    v_order.discount_code,
    coalesce(v_order.discount_amount, 0),
    v_order.shipping_fee,
    v_order.total,
    v_actor
  )
  returning *
  into v_created;

  return v_created;
end;
$$;

revoke all on function public.issue_invoice_for_order(uuid, text) from public, anon, authenticated;
grant execute on function public.issue_invoice_for_order(uuid, text) to service_role;

-- ─── 7. UPDATE ANALYTICS RPCs: EXCLUDE TEST ORDERS & INTERNAL TRAFFIC, FIX AOV & FUNNEL ─
create or replace function public.get_analytics_period_kpis(
  p_from                  date,
  p_to                    date,
  p_include_owner_metrics boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from_ts                  timestamptz := (p_from::timestamp at time zone 'Africa/Nairobi');
  v_to_ts                    timestamptz := ((p_to + 1)::timestamp at time zone 'Africa/Nairobi');
  v_booked_revenue           numeric(14,2) := 0;
  v_collected_revenue        numeric(14,2) := 0;
  v_delivery_fees_collected  numeric(14,2) := 0;
  v_delivery_rider_costs     numeric(14,2) := 0;
  v_delivery_margin          numeric(14,2) := 0;
  v_gross_item_revenue       numeric(14,2) := 0;
  v_total_cogs               numeric(14,2) := 0;
  v_gross_profit             numeric(14,2);
  v_gross_margin_pct         numeric(6,1);
  v_items_missing_cost       integer := 0;
  v_orders_total             integer := 0;
  v_orders_active            integer := 0;
  v_status_pending           integer := 0;
  v_status_confirmed         integer := 0;
  v_status_dispatched        integer := 0;
  v_status_delivered         integer := 0;
  v_status_cancelled         integer := 0;
  v_status_returned          integer := 0;
  v_aov                      numeric(14,2) := null;
  v_confirmed_reached_count  integer := 0;
  v_confirmation_rate        numeric(6,1) := 0;
  v_cancellation_rate        numeric(6,1) := 0;
  v_return_rate              numeric(6,1) := 0;
  v_avg_hours_to_confirm     numeric(10,2);
  v_avg_hours_to_deliver     numeric(10,2);
  v_new_customers            integer := 0;
  v_returning_customers      integer := 0;
  v_discounts_given          numeric(14,2) := 0;
  v_discounts_by_code        jsonb := '[]'::jsonb;
begin
  select
    count(*)::integer,
    count(*) filter (where coalesce(o.status, 'pending') <> 'cancelled')::integer,
    count(*) filter (where coalesce(o.status, 'pending') = 'pending')::integer,
    count(*) filter (where coalesce(o.status, 'pending') = 'confirmed')::integer,
    count(*) filter (where coalesce(o.status, 'pending') = 'dispatched')::integer,
    count(*) filter (where coalesce(o.status, 'pending') = 'delivered')::integer,
    count(*) filter (where coalesce(o.status, 'pending') = 'cancelled')::integer,
    count(*) filter (where coalesce(o.status, 'pending') = 'returned')::integer,
    coalesce(
      sum(greatest(0, o.subtotal - coalesce(o.discount_amount, 0)))
        filter (where coalesce(o.status, 'pending') in ('confirmed', 'dispatched', 'delivered')),
      0
    )::numeric(14,2),
    coalesce(
      sum(coalesce(o.discount_amount, 0))
        filter (where coalesce(o.status, 'pending') <> 'cancelled'),
      0
    )::numeric(14,2)
  into
    v_orders_total,
    v_orders_active,
    v_status_pending,
    v_status_confirmed,
    v_status_dispatched,
    v_status_delivered,
    v_status_cancelled,
    v_status_returned,
    v_booked_revenue,
    v_discounts_given
  from public.orders o
  where o.created_at >= v_from_ts
    and o.created_at < v_to_ts
    and coalesce(o.is_test, false) = false;

  -- Round 2 Phase 2.4: AOV = booked revenue / non-cancelled orders; null when no non-cancelled orders
  if v_orders_active > 0 then
    v_aov := round((v_booked_revenue / v_orders_active::numeric), 2)::numeric(14,2);
  else
    v_aov := null;
  end if;

  with delivered_orders as (
    select o.id, o.total, o.shipping_fee, coalesce(o.rider_cost, 0) as rider_cost
    from public.orders o
    where o.created_at >= v_from_ts
      and o.created_at < v_to_ts
      and coalesce(o.is_test, false) = false
      and coalesce(o.status, 'pending') in ('delivered', 'returned')
  ),
  order_refunds as (
    select r.order_id, coalesce(sum(r.refund_amount), 0) as refunded
    from public.order_returns r
    join delivered_orders d on d.id = r.order_id
    group by r.order_id
  )
  select
    greatest(
      0,
      coalesce(sum(d.total - coalesce(rf.refunded, 0)), 0)
    )::numeric(14,2),
    coalesce(sum(d.shipping_fee), 0)::numeric(14,2),
    coalesce(sum(d.rider_cost), 0)::numeric(14,2)
  into
    v_collected_revenue,
    v_delivery_fees_collected,
    v_delivery_rider_costs
  from delivered_orders d
  left join order_refunds rf on rf.order_id = d.id;

  v_delivery_margin := round((v_delivery_fees_collected - v_delivery_rider_costs)::numeric, 2)::numeric(14,2);

  select count(*)::integer
  into v_confirmed_reached_count
  from public.orders o
  where o.created_at >= v_from_ts
    and o.created_at < v_to_ts
    and coalesce(o.is_test, false) = false
    and (
      coalesce(o.status, 'pending') in ('confirmed', 'dispatched', 'delivered', 'returned')
      or exists (
        select 1
        from public.order_status_history h
        where h.order_id = o.id
          and h.to_status = 'confirmed'
      )
    );

  if v_orders_total > 0 then
    v_confirmation_rate := round((v_confirmed_reached_count::numeric / v_orders_total::numeric) * 100, 1);
    v_cancellation_rate := round((v_status_cancelled::numeric / v_orders_total::numeric) * 100, 1);
  end if;

  if (v_status_delivered + v_status_returned) > 0 then
    v_return_rate := round(
      (v_status_returned::numeric / (v_status_delivered + v_status_returned)::numeric) * 100,
      1
    );
  end if;

  with history_bounds as (
    select
      h.order_id,
      min(h.created_at) filter (where h.to_status = 'confirmed') as confirmed_at,
      min(h.created_at) filter (where h.to_status = 'delivered') as delivered_at
    from public.order_status_history h
    join public.orders o on o.id = h.order_id
    where o.created_at >= v_from_ts
      and o.created_at < v_to_ts
      and coalesce(o.is_test, false) = false
    group by h.order_id
  )
  select
    round(
      avg(extract(epoch from (hb.confirmed_at - o.created_at)) / 3600.0)
        filter (where hb.confirmed_at is not null and hb.confirmed_at >= o.created_at),
      2
    )::numeric(10,2),
    round(
      avg(extract(epoch from (hb.delivered_at - o.created_at)) / 3600.0)
        filter (where hb.delivered_at is not null and hb.delivered_at >= o.created_at),
      2
    )::numeric(10,2)
  into v_avg_hours_to_confirm, v_avg_hours_to_deliver
  from public.orders o
  join history_bounds hb on hb.order_id = o.id
  where o.created_at >= v_from_ts
    and o.created_at < v_to_ts
    and coalesce(o.is_test, false) = false;

  with period_customers as (
    select distinct coalesce(o.customer_id::text, o.customer_phone) as cust_key
    from public.orders o
    where o.created_at >= v_from_ts
      and o.created_at < v_to_ts
      and coalesce(o.is_test, false) = false
      and coalesce(o.status, 'pending') <> 'cancelled'
  ),
  first_orders as (
    select
      coalesce(o.customer_id::text, o.customer_phone) as cust_key,
      min(o.created_at) as first_order_at
    from public.orders o
    where coalesce(o.is_test, false) = false
      and coalesce(o.status, 'pending') <> 'cancelled'
    group by 1
  )
  select
    count(*) filter (where fo.first_order_at >= v_from_ts and fo.first_order_at < v_to_ts)::integer,
    count(*) filter (where fo.first_order_at < v_from_ts)::integer
  into v_new_customers, v_returning_customers
  from period_customers pc
  join first_orders fo on fo.cust_key = pc.cust_key;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'code', t.code,
        'uses', t.uses,
        'discount_total', t.discount_total,
        'revenue_total', t.revenue_total
      )
      order by t.revenue_total desc, t.uses desc
    ),
    '[]'::jsonb
  )
  into v_discounts_by_code
  from (
    select
      upper(btrim(o.discount_code)) as code,
      count(*)::integer as uses,
      coalesce(sum(coalesce(o.discount_amount, 0)), 0)::numeric(14,2) as discount_total,
      coalesce(sum(o.total), 0)::numeric(14,2) as revenue_total
    from public.orders o
    where o.created_at >= v_from_ts
      and o.created_at < v_to_ts
      and coalesce(o.is_test, false) = false
      and coalesce(o.status, 'pending') <> 'cancelled'
      and o.discount_code is not null
      and btrim(o.discount_code) <> ''
    group by 1
  ) t;

  if p_include_owner_metrics then
    with eligible_orders as (
      select o.id, o.subtotal, coalesce(o.discount_amount, 0) as discount_amount
      from public.orders o
      where o.created_at >= v_from_ts
        and o.created_at < v_to_ts
        and coalesce(o.is_test, false) = false
        and coalesce(o.status, 'pending') in ('confirmed', 'dispatched', 'delivered', 'returned')
    ),
    returned_qty_by_item as (
      select r.order_item_id, coalesce(sum(r.quantity), 0)::integer as returned_qty
      from public.order_returns r
      where r.order_item_id is not null
      group by r.order_item_id
    ),
    item_calc as (
      select
        oi.id,
        greatest(0, oi.quantity - coalesce(rq.returned_qty, 0)) as net_qty,
        oi.unit_price,
        coalesce(pv.cost_price, p.cost_price) as unit_cost,
        eo.subtotal,
        eo.discount_amount
      from public.order_items oi
      join eligible_orders eo on eo.id = oi.order_id
      left join returned_qty_by_item rq on rq.order_item_id = oi.id
      left join public.products p on p.id = oi.product_id
      left join public.product_variants pv on pv.id = oi.variant_id
    )
    select
      greatest(
        0,
        coalesce(sum(ic.net_qty * ic.unit_price), 0) -
        coalesce((select sum(eo.discount_amount) from eligible_orders eo), 0)
      )::numeric(14,2),
      coalesce(sum(ic.net_qty * coalesce(ic.unit_cost, 0)), 0)::numeric(14,2),
      count(*) filter (where ic.net_qty > 0 and ic.unit_cost is null)::integer
    into v_gross_item_revenue, v_total_cogs, v_items_missing_cost
    from item_calc ic;

    v_gross_profit := round((v_gross_item_revenue - v_total_cogs)::numeric, 2)::numeric(14,2);
    if v_gross_item_revenue > 0 then
      v_gross_margin_pct := round((v_gross_profit / v_gross_item_revenue) * 100, 1);
    else
      v_gross_margin_pct := null;
    end if;
  end if;

  return jsonb_build_object(
    'booked_revenue', v_booked_revenue,
    'collected_revenue', v_collected_revenue,
    'delivery_fees_collected', v_delivery_fees_collected,
    'delivery_rider_costs', v_delivery_rider_costs,
    'delivery_margin', v_delivery_margin,
    'gross_profit', case when p_include_owner_metrics then v_gross_profit else null end,
    'gross_margin_pct', case when p_include_owner_metrics then v_gross_margin_pct else null end,
    'items_missing_cost', case when p_include_owner_metrics then v_items_missing_cost else null end,
    'orders_total', v_orders_total,
    'orders_active', v_orders_active,
    'orders_by_status', jsonb_build_object(
      'pending', v_status_pending,
      'confirmed', v_status_confirmed,
      'dispatched', v_status_dispatched,
      'delivered', v_status_delivered,
      'cancelled', v_status_cancelled,
      'returned', v_status_returned
    ),
    'aov', v_aov,
    'confirmation_rate', v_confirmation_rate,
    'cancellation_rate', v_cancellation_rate,
    'return_rate', v_return_rate,
    'avg_hours_to_confirm', v_avg_hours_to_confirm,
    'avg_hours_to_deliver', v_avg_hours_to_deliver,
    'new_customers', v_new_customers,
    'returning_customers', v_returning_customers,
    'discounts_given', v_discounts_given,
    'discounts_by_code', v_discounts_by_code
  );
end;
$$;

revoke all on function public.get_analytics_period_kpis(date, date, boolean) from public, anon, authenticated;
grant execute on function public.get_analytics_period_kpis(date, date, boolean) to service_role;

-- 4-argument main analytics RPC supporting p_include_internal (no default on 4th arg to keep 3-arg wrapper unambiguous)
create or replace function public.get_analytics_dashboard(
  p_from                  date,
  p_to                    date,
  p_include_owner_metrics boolean,
  p_include_internal      boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days               integer := greatest(1, (p_to - p_from) + 1);
  v_prev_from          date := p_from - v_days;
  v_prev_to            date := p_from - 1;
  v_from_ts            timestamptz := (p_from::timestamp at time zone 'Africa/Nairobi');
  v_to_ts              timestamptz := ((p_to + 1)::timestamp at time zone 'Africa/Nairobi');
  v_granularity        text := case when v_days <= 31 then 'day' else 'week' end;
  v_default_low_stock  integer := 3;
  v_current_kpis       jsonb;
  v_previous_kpis      jsonb;
  v_revenue_series     jsonb := '[]'::jsonb;
  v_funnel             jsonb := '{}'::jsonb;
  v_top_products       jsonb := '[]'::jsonb;
  v_sales_by_category  jsonb := '[]'::jsonb;
  v_sales_by_zone      jsonb := '[]'::jsonb;
  v_heatmap            jsonb := '[]'::jsonb;
  v_cancellations      jsonb := '[]'::jsonb;
  v_status_breakdown   jsonb := '[]'::jsonb;
  v_inventory          jsonb := '{}'::jsonb;
  v_needs_attention    jsonb := '{}'::jsonb;
  v_recent_orders      jsonb := '[]'::jsonb;
  v_pending_reviews    integer := 0;
begin
  select coalesce(s.low_stock_default, 3)
  into v_default_low_stock
  from public.store_settings s
  where s.id = true;

  v_current_kpis := public.get_analytics_period_kpis(p_from, p_to, p_include_owner_metrics);
  v_previous_kpis := public.get_analytics_period_kpis(v_prev_from, v_prev_to, p_include_owner_metrics);

  -- 1. Revenue and orders over time (excluding test orders)
  if v_granularity = 'day' then
    with buckets as (
      select gs::date as bucket_date
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') gs
    ),
    order_agg as (
      select
        (o.created_at at time zone 'Africa/Nairobi')::date as bucket_date,
        count(*) filter (where coalesce(o.status, 'pending') <> 'cancelled')::integer as orders,
        count(*) filter (where coalesce(o.status, 'pending') = 'cancelled')::integer as cancelled_orders,
        coalesce(
          sum(greatest(0, o.subtotal - coalesce(o.discount_amount, 0)))
            filter (where coalesce(o.status, 'pending') in ('confirmed', 'dispatched', 'delivered')),
          0
        )::numeric(14,2) as booked_revenue,
        coalesce(
          sum(o.total)
            filter (where coalesce(o.status, 'pending') in ('delivered', 'returned')),
          0
        )::numeric(14,2) as delivered_gross
      from public.orders o
      where o.created_at >= v_from_ts
        and o.created_at < v_to_ts
        and coalesce(o.is_test, false) = false
      group by 1
    ),
    return_agg as (
      select
        (o.created_at at time zone 'Africa/Nairobi')::date as bucket_date,
        coalesce(sum(r.refund_amount), 0)::numeric(14,2) as refunded
      from public.order_returns r
      join public.orders o on o.id = r.order_id
      where o.created_at >= v_from_ts
        and o.created_at < v_to_ts
        and coalesce(o.is_test, false) = false
      group by 1
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'bucket', to_char(b.bucket_date, 'YYYY-MM-DD'),
          'label', to_char(b.bucket_date, 'DD Mon'),
          'orders', coalesce(oa.orders, 0),
          'cancelled_orders', coalesce(oa.cancelled_orders, 0),
          'booked_revenue', coalesce(oa.booked_revenue, 0),
          'collected_revenue', greatest(0, coalesce(oa.delivered_gross, 0) - coalesce(ra.refunded, 0))
        )
        order by b.bucket_date asc
      ),
      '[]'::jsonb
    )
    into v_revenue_series
    from buckets b
    left join order_agg oa on oa.bucket_date = b.bucket_date
    left join return_agg ra on ra.bucket_date = b.bucket_date;
  else
    with buckets as (
      select date_trunc('week', gs)::date as bucket_week
      from generate_series(
        date_trunc('week', p_from::timestamp),
        date_trunc('week', p_to::timestamp),
        interval '1 week'
      ) gs
    ),
    order_agg as (
      select
        date_trunc('week', (o.created_at at time zone 'Africa/Nairobi'))::date as bucket_week,
        count(*) filter (where coalesce(o.status, 'pending') <> 'cancelled')::integer as orders,
        count(*) filter (where coalesce(o.status, 'pending') = 'cancelled')::integer as cancelled_orders,
        coalesce(
          sum(greatest(0, o.subtotal - coalesce(o.discount_amount, 0)))
            filter (where coalesce(o.status, 'pending') in ('confirmed', 'dispatched', 'delivered')),
          0
        )::numeric(14,2) as booked_revenue,
        coalesce(
          sum(o.total)
            filter (where coalesce(o.status, 'pending') in ('delivered', 'returned')),
          0
        )::numeric(14,2) as delivered_gross
      from public.orders o
      where o.created_at >= v_from_ts
        and o.created_at < v_to_ts
        and coalesce(o.is_test, false) = false
      group by 1
    ),
    return_agg as (
      select
        date_trunc('week', (o.created_at at time zone 'Africa/Nairobi'))::date as bucket_week,
        coalesce(sum(r.refund_amount), 0)::numeric(14,2) as refunded
      from public.order_returns r
      join public.orders o on o.id = r.order_id
      where o.created_at >= v_from_ts
        and o.created_at < v_to_ts
        and coalesce(o.is_test, false) = false
      group by 1
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'bucket', to_char(b.bucket_week, 'YYYY-MM-DD'),
          'label', 'Wk ' || to_char(b.bucket_week, 'DD Mon'),
          'orders', coalesce(oa.orders, 0),
          'cancelled_orders', coalesce(oa.cancelled_orders, 0),
          'booked_revenue', coalesce(oa.booked_revenue, 0),
          'collected_revenue', greatest(0, coalesce(oa.delivered_gross, 0) - coalesce(ra.refunded, 0))
        )
        order by b.bucket_week asc
      ),
      '[]'::jsonb
    )
    into v_revenue_series
    from buckets b
    left join order_agg oa on oa.bucket_week = b.bucket_week
    left join return_agg ra on ra.bucket_week = b.bucket_week;
  end if;

  -- 2. Conversion funnel (excludes internal events by default, exposes true whatsapp_order_sent + orders_created)
  with ev as (
    select
      count(*) filter (where e.name = 'product_view')::integer as product_views,
      count(*) filter (where e.name = 'add_to_bag')::integer as add_to_bag,
      count(*) filter (where e.name = 'begin_checkout')::integer as begin_checkout,
      count(*) filter (
        where e.name = 'whatsapp_order_sent'
          and (
            e.order_number is null
            or not exists (
              select 1 from public.orders to_ord
              where to_ord.order_number = e.order_number
                and coalesce(to_ord.is_test, false) = true
            )
          )
      )::integer as whatsapp_order_sent,
      count(*) filter (where e.name = 'whatsapp_product_question')::integer as whatsapp_questions
    from public.events e
    where e.created_at >= v_from_ts
      and e.created_at < v_to_ts
      and (coalesce(p_include_internal, false) = true or coalesce(e.is_internal, false) = false)
  ),
  ord as (
    select
      count(*)::integer as orders_created,
      count(*) filter (
        where coalesce(o.status, 'pending') in ('confirmed', 'dispatched', 'delivered', 'returned')
          or exists (
            select 1 from public.order_status_history h
            where h.order_id = o.id and h.to_status = 'confirmed'
          )
      )::integer as confirmed,
      count(*) filter (
        where coalesce(o.status, 'pending') in ('delivered', 'returned')
      )::integer as delivered
    from public.orders o
    where o.created_at >= v_from_ts
      and o.created_at < v_to_ts
      and coalesce(o.is_test, false) = false
  )
  select jsonb_build_object(
    'product_views', ev.product_views,
    'add_to_bag', ev.add_to_bag,
    'begin_checkout', ev.begin_checkout,
    'whatsapp_order_sent', ev.whatsapp_order_sent,
    'orders_created', ord.orders_created,
    'confirmed', ord.confirmed,
    'delivered', ord.delivered,
    'whatsapp_questions', ev.whatsapp_questions
  )
  into v_funnel
  from ev cross join ord;

  -- 3. Top 10 products (excluding test orders)
  with returned_qty as (
    select r.order_item_id, coalesce(sum(r.quantity), 0)::integer as qty
    from public.order_returns r
    where r.order_item_id is not null
    group by r.order_item_id
  ),
  prod_agg as (
    select
      coalesce(oi.product_id::text, oi.product_title) as product_key,
      max(oi.product_id::text) as product_id,
      max(oi.product_title) as title,
      max(coalesce(p.category, 'Uncategorized')) as category,
      sum(greatest(0, oi.quantity - coalesce(rq.qty, 0)))::integer as units,
      coalesce(
        sum(greatest(0, oi.quantity - coalesce(rq.qty, 0)) * oi.unit_price),
        0
      )::numeric(14,2) as revenue,
      coalesce(
        sum(greatest(0, oi.quantity - coalesce(rq.qty, 0)) * coalesce(pv.cost_price, p.cost_price, 0)),
        0
      )::numeric(14,2) as cogs
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join returned_qty rq on rq.order_item_id = oi.id
    left join public.products p on p.id = oi.product_id
    left join public.product_variants pv on pv.id = oi.variant_id
    where o.created_at >= v_from_ts
      and o.created_at < v_to_ts
      and coalesce(o.is_test, false) = false
      and coalesce(o.status, 'pending') <> 'cancelled'
    group by 1
    having sum(greatest(0, oi.quantity - coalesce(rq.qty, 0))) > 0
    order by revenue desc, units desc
    limit 10
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_id', pa.product_id,
        'title', pa.title,
        'category', pa.category,
        'units', pa.units,
        'revenue', pa.revenue,
        'profit', case when p_include_owner_metrics then round((pa.revenue - pa.cogs)::numeric, 2) else null end,
        'margin_pct', case
          when p_include_owner_metrics and pa.revenue > 0
            then round(((pa.revenue - pa.cogs) / pa.revenue) * 100, 1)
          else null
        end
      )
      order by pa.revenue desc, pa.units desc
    ),
    '[]'::jsonb
  )
  into v_top_products
  from prod_agg pa;

  -- 4. Sales by category (excluding test orders)
  with returned_qty as (
    select r.order_item_id, coalesce(sum(r.quantity), 0)::integer as qty
    from public.order_returns r
    where r.order_item_id is not null
    group by r.order_item_id
  ),
  cat_agg as (
    select
      coalesce(nullif(btrim(p.category), ''), 'Uncategorized') as category,
      count(distinct o.id)::integer as orders,
      sum(greatest(0, oi.quantity - coalesce(rq.qty, 0)))::integer as units,
      coalesce(
        sum(greatest(0, oi.quantity - coalesce(rq.qty, 0)) * oi.unit_price),
        0
      )::numeric(14,2) as revenue
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join returned_qty rq on rq.order_item_id = oi.id
    left join public.products p on p.id = oi.product_id
    where o.created_at >= v_from_ts
      and o.created_at < v_to_ts
      and coalesce(o.is_test, false) = false
      and coalesce(o.status, 'pending') <> 'cancelled'
    group by 1
    having sum(greatest(0, oi.quantity - coalesce(rq.qty, 0))) > 0
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'category', ca.category,
        'orders', ca.orders,
        'units', ca.units,
        'revenue', ca.revenue
      )
      order by ca.revenue desc, ca.units desc
    ),
    '[]'::jsonb
  )
  into v_sales_by_category
  from cat_agg ca;

  -- 5. Orders & revenue by delivery zone (excluding test orders)
  with zone_agg as (
    select
      coalesce(
        nullif(btrim(o.delivery_zone_name), ''),
        nullif(btrim(o.customer_location), ''),
        'Unspecified'
      ) as zone,
      count(*)::integer as orders,
      coalesce(sum(o.total), 0)::numeric(14,2) as revenue,
      coalesce(sum(o.shipping_fee), 0)::numeric(14,2) as delivery_fees,
      coalesce(sum(coalesce(o.rider_cost, 0)), 0)::numeric(14,2) as rider_costs
    from public.orders o
    where o.created_at >= v_from_ts
      and o.created_at < v_to_ts
      and coalesce(o.is_test, false) = false
      and coalesce(o.status, 'pending') <> 'cancelled'
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'zone', za.zone,
        'orders', za.orders,
        'revenue', za.revenue,
        'delivery_fees', za.delivery_fees,
        'rider_costs', za.rider_costs,
        'delivery_margin', round((za.delivery_fees - za.rider_costs)::numeric, 2)
      )
      order by za.orders desc, za.revenue desc
    ),
    '[]'::jsonb
  )
  into v_sales_by_zone
  from zone_agg za;

  -- 6. Busiest times heatmap (excluding test orders)
  with heat as (
    select
      (extract(isodow from (o.created_at at time zone 'Africa/Nairobi'))::integer - 1) as dow,
      extract(hour from (o.created_at at time zone 'Africa/Nairobi'))::integer as hour,
      count(*)::integer as orders,
      coalesce(sum(o.total), 0)::numeric(14,2) as revenue
    from public.orders o
    where o.created_at >= v_from_ts
      and o.created_at < v_to_ts
      and coalesce(o.is_test, false) = false
      and coalesce(o.status, 'pending') <> 'cancelled'
    group by 1, 2
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'dow', h.dow,
        'hour', h.hour,
        'orders', h.orders,
        'revenue', h.revenue
      )
      order by h.dow asc, h.hour asc
    ),
    '[]'::jsonb
  )
  into v_heatmap
  from heat h;

  -- 7. Cancellations by reason (excluding test orders)
  with cancel_agg as (
    select
      coalesce(o.cancel_reason::text, 'unspecified') as reason,
      count(*)::integer as count,
      coalesce(sum(o.total), 0)::numeric(14,2) as lost_value
    from public.orders o
    where o.created_at >= v_from_ts
      and o.created_at < v_to_ts
      and coalesce(o.is_test, false) = false
      and coalesce(o.status, 'pending') = 'cancelled'
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'reason', ca.reason,
        'count', ca.count,
        'lost_value', ca.lost_value
      )
      order by ca.count desc
    ),
    '[]'::jsonb
  )
  into v_cancellations
  from cancel_agg ca;

  -- 8. Order status breakdown (excluding test orders)
  with st_agg as (
    select
      coalesce(o.status, 'pending') as status,
      count(*)::integer as count,
      coalesce(sum(o.total), 0)::numeric(14,2) as total
    from public.orders o
    where o.created_at >= v_from_ts
      and o.created_at < v_to_ts
      and coalesce(o.is_test, false) = false
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'status', sa.status,
        'count', sa.count,
        'total', sa.total
      )
      order by sa.count desc
    ),
    '[]'::jsonb
  )
  into v_status_breakdown
  from st_agg sa;

  -- 9. Inventory trackers (excluding test orders)
  with active_prods as (
    select
      p.id,
      p.title,
      p.slug,
      p.category,
      p.price,
      p.cost_price,
      p.stock_quantity,
      coalesce(p.low_stock_threshold, v_default_low_stock) as threshold,
      p.created_at
    from public.products p
    where coalesce(p.status, case when p.active then 'active' else 'archived' end) = 'active'
  ),
  sales_30d as (
    select
      oi.product_id,
      sum(oi.quantity)::integer as units_30d,
      max(o.created_at) as last_sale_at
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.product_id is not null
      and coalesce(o.is_test, false) = false
      and coalesce(o.status, 'pending') <> 'cancelled'
      and o.created_at >= (timezone('utc', now()) - interval '30 days')
    group by oi.product_id
  ),
  last_sale_any as (
    select
      oi.product_id,
      max(o.created_at) as last_sale_at
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.product_id is not null
      and coalesce(o.is_test, false) = false
      and coalesce(o.status, 'pending') <> 'cancelled'
    group by oi.product_id
  ),
  sales_period as (
    select
      oi.product_id,
      sum(oi.quantity)::integer as units_sold,
      coalesce(sum(oi.quantity * oi.unit_price), 0)::numeric(14,2) as revenue
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.product_id is not null
      and coalesce(o.is_test, false) = false
      and coalesce(o.status, 'pending') <> 'cancelled'
      and o.created_at >= v_from_ts
      and o.created_at < v_to_ts
    group by oi.product_id
  )
  select jsonb_build_object(
    'default_low_stock_threshold', v_default_low_stock,
    'stock_value', (
      select jsonb_build_object(
        'total_units', coalesce(sum(ap.stock_quantity), 0)::integer,
        'active_products', count(*)::integer,
        'retail_value', coalesce(sum(ap.stock_quantity * ap.price), 0)::numeric(14,2),
        'cost_value', case
          when p_include_owner_metrics
            then coalesce(sum(ap.stock_quantity * coalesce(ap.cost_price, 0)), 0)::numeric(14,2)
          else null
        end,
        'products_missing_cost', case
          when p_include_owner_metrics
            then count(*) filter (where ap.cost_price is null)::integer
          else null
        end
      )
      from active_prods ap
    ),
    'out_of_stock', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ap.id,
          'title', ap.title,
          'category', ap.category,
          'stock_quantity', ap.stock_quantity,
          'threshold', ap.threshold,
          'price', ap.price,
          'units_30d', coalesce(s30.units_30d, 0)
        )
        order by coalesce(s30.units_30d, 0) desc, ap.title asc
      )
      from active_prods ap
      left join sales_30d s30 on s30.product_id = ap.id
      where ap.stock_quantity <= 0
    ), '[]'::jsonb),
    'low_stock', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ap.id,
          'title', ap.title,
          'category', ap.category,
          'stock_quantity', ap.stock_quantity,
          'threshold', ap.threshold,
          'price', ap.price,
          'units_30d', coalesce(s30.units_30d, 0)
        )
        order by ap.stock_quantity asc, coalesce(s30.units_30d, 0) desc, ap.title asc
      )
      from active_prods ap
      left join sales_30d s30 on s30.product_id = ap.id
      where ap.stock_quantity > 0
        and ap.stock_quantity <= ap.threshold
    ), '[]'::jsonb),
    'best_sellers_at_risk', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ap.id,
          'title', ap.title,
          'category', ap.category,
          'stock_quantity', ap.stock_quantity,
          'units_30d', s30.units_30d,
          'daily_rate', round((s30.units_30d::numeric / 30.0), 2),
          'days_of_stock', round((ap.stock_quantity::numeric / (s30.units_30d::numeric / 30.0)), 1)
        )
        order by (ap.stock_quantity::numeric / (s30.units_30d::numeric / 30.0)) asc, s30.units_30d desc
      )
      from active_prods ap
      join sales_30d s30 on s30.product_id = ap.id
      where s30.units_30d > 0
        and (ap.stock_quantity::numeric / (s30.units_30d::numeric / 30.0)) < 7.0
    ), '[]'::jsonb),
    'dead_stock', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ap.id,
          'title', ap.title,
          'category', ap.category,
          'stock_quantity', ap.stock_quantity,
          'retail_value', round((ap.stock_quantity * ap.price)::numeric, 2),
          'cost_value', case
            when p_include_owner_metrics and ap.cost_price is not null
              then round((ap.stock_quantity * ap.cost_price)::numeric, 2)
            else null
          end,
          'last_sale_at', lsa.last_sale_at
        )
        order by (ap.stock_quantity * ap.price) desc, ap.title asc
      )
      from active_prods ap
      left join sales_30d s30 on s30.product_id = ap.id
      left join last_sale_any lsa on lsa.product_id = ap.id
      where ap.stock_quantity > 0
        and coalesce(s30.units_30d, 0) = 0
    ), '[]'::jsonb),
    'sell_through', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', ap.id,
          'title', ap.title,
          'category', ap.category,
          'units_sold', coalesce(sp.units_sold, 0),
          'current_stock', ap.stock_quantity,
          'revenue', coalesce(sp.revenue, 0),
          'sell_through_pct', case
            when (coalesce(sp.units_sold, 0) + ap.stock_quantity) > 0
              then round(
                (coalesce(sp.units_sold, 0)::numeric / (coalesce(sp.units_sold, 0) + ap.stock_quantity)::numeric) * 100,
                1
              )
            else 0
          end
        )
        order by
          case
            when (coalesce(sp.units_sold, 0) + ap.stock_quantity) > 0
              then coalesce(sp.units_sold, 0)::numeric / (coalesce(sp.units_sold, 0) + ap.stock_quantity)::numeric
            else 0
          end desc,
          coalesce(sp.units_sold, 0) desc,
          ap.title asc
      )
      from active_prods ap
      left join sales_period sp on sp.product_id = ap.id
    ), '[]'::jsonb)
  )
  into v_inventory;

  -- 10. Needs Attention box (excluding test orders)
  if to_regclass('public.reviews') is not null then
    execute 'select count(*)::integer from public.reviews where status = ''pending'''
    into v_pending_reviews;
  end if;

  select jsonb_build_object(
    'pending_over_24h_count', (
      select count(*)::integer
      from public.orders o
      where coalesce(o.is_test, false) = false
        and coalesce(o.status, 'pending') = 'pending'
        and o.created_at <= (timezone('utc', now()) - interval '24 hours')
    ),
    'pending_over_24h', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'order_number', t.order_number,
          'customer_name', t.customer_name,
          'total', t.total,
          'created_at', t.created_at
        )
      )
      from (
        select o.id, coalesce(o.order_number, upper(left(o.id::text, 8))) as order_number, o.customer_name, o.total, o.created_at
        from public.orders o
        where coalesce(o.is_test, false) = false
          and coalesce(o.status, 'pending') = 'pending'
          and o.created_at <= (timezone('utc', now()) - interval '24 hours')
        order by o.created_at asc
        limit 5
      ) t
    ), '[]'::jsonb),
    'out_of_stock_best_sellers_count', (
      select count(*)::integer
      from public.products p
      where coalesce(p.status, case when p.active then 'active' else 'archived' end) = 'active'
        and p.stock_quantity <= 0
        and exists (
          select 1
          from public.order_items oi
          join public.orders o on o.id = oi.order_id
          where oi.product_id = p.id
            and coalesce(o.is_test, false) = false
            and coalesce(o.status, 'pending') <> 'cancelled'
            and o.created_at >= (timezone('utc', now()) - interval '30 days')
        )
    ),
    'out_of_stock_best_sellers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'title', t.title,
          'units_30d', t.units_30d
        )
      )
      from (
        select
          p.id,
          p.title,
          coalesce(sum(oi.quantity), 0)::integer as units_30d
        from public.products p
        join public.order_items oi on oi.product_id = p.id
        join public.orders o on o.id = oi.order_id
        where coalesce(p.status, case when p.active then 'active' else 'archived' end) = 'active'
          and p.stock_quantity <= 0
          and coalesce(o.is_test, false) = false
          and coalesce(o.status, 'pending') <> 'cancelled'
          and o.created_at >= (timezone('utc', now()) - interval '30 days')
        group by p.id, p.title
        order by units_30d desc
        limit 5
      ) t
    ), '[]'::jsonb),
    'dispatched_over_3d_count', (
      select count(*)::integer
      from public.orders o
      where coalesce(o.is_test, false) = false
        and coalesce(o.status, 'pending') = 'dispatched'
        and coalesce(o.dispatched_at, o.created_at) <= (timezone('utc', now()) - interval '3 days')
    ),
    'dispatched_over_3d', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'order_number', t.order_number,
          'customer_name', t.customer_name,
          'rider_name', t.rider_name,
          'dispatched_at', t.dispatched_at
        )
      )
      from (
        select
          o.id,
          coalesce(o.order_number, upper(left(o.id::text, 8))) as order_number,
          o.customer_name,
          o.rider_name,
          coalesce(o.dispatched_at, o.created_at) as dispatched_at
        from public.orders o
        where coalesce(o.is_test, false) = false
          and coalesce(o.status, 'pending') = 'dispatched'
          and coalesce(o.dispatched_at, o.created_at) <= (timezone('utc', now()) - interval '3 days')
        order by coalesce(o.dispatched_at, o.created_at) asc
        limit 5
      ) t
    ), '[]'::jsonb),
    'unpaid_delivered_invoices_count', (
      select count(*)::integer
      from public.invoices i
      join public.orders o on o.id = i.order_id
      where coalesce(o.is_test, false) = false
        and coalesce(i.is_test, false) = false
        and i.status in ('unpaid', 'partially_paid')
        and coalesce(o.status, 'pending') in ('delivered', 'returned')
    ),
    'unpaid_delivered_invoices_total', (
      select coalesce(sum(greatest(0, i.total - i.credited_amount - i.amount_paid)), 0)::numeric(14,2)
      from public.invoices i
      join public.orders o on o.id = i.order_id
      where coalesce(o.is_test, false) = false
        and coalesce(i.is_test, false) = false
        and i.status in ('unpaid', 'partially_paid')
        and coalesce(o.status, 'pending') in ('delivered', 'returned')
    ),
    'unpaid_delivered_invoices', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'invoice_number', t.invoice_number,
          'customer_name', t.customer_name,
          'balance_due', t.balance_due
        )
      )
      from (
        select
          i.id,
          i.invoice_number,
          coalesce(i.customer_snapshot ->> 'full_name', o.customer_name) as customer_name,
          greatest(0, i.total - i.credited_amount - i.amount_paid)::numeric(14,2) as balance_due
        from public.invoices i
        join public.orders o on o.id = i.order_id
        where coalesce(o.is_test, false) = false
          and coalesce(i.is_test, false) = false
          and i.status in ('unpaid', 'partially_paid')
          and coalesce(o.status, 'pending') in ('delivered', 'returned')
        order by i.issued_at asc
        limit 5
      ) t
    ), '[]'::jsonb),
    'reviews_pending_moderation_count', v_pending_reviews
  )
  into v_needs_attention;

  -- 11. Latest 8 non-test orders for dashboard quick glance
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'order_number', t.order_number,
        'customer_name', t.customer_name,
        'status', t.status,
        'payment_status', t.payment_status,
        'total', t.total,
        'delivery_zone_name', t.delivery_zone_name,
        'created_at', t.created_at
      )
    ),
    '[]'::jsonb
  )
  into v_recent_orders
  from (
    select
      o.id,
      coalesce(o.order_number, upper(left(o.id::text, 8))) as order_number,
      o.customer_name,
      coalesce(o.status, 'pending') as status,
      o.payment_status,
      o.total,
      coalesce(o.delivery_zone_name, o.customer_location) as delivery_zone_name,
      o.created_at
    from public.orders o
    where coalesce(o.is_test, false) = false
    order by o.created_at desc
    limit 8
  ) t;

  return jsonb_build_object(
    'range', jsonb_build_object(
      'from', to_char(p_from, 'YYYY-MM-DD'),
      'to', to_char(p_to, 'YYYY-MM-DD'),
      'previous_from', to_char(v_prev_from, 'YYYY-MM-DD'),
      'previous_to', to_char(v_prev_to, 'YYYY-MM-DD'),
      'days', v_days,
      'granularity', v_granularity
    ),
    'include_owner_metrics', p_include_owner_metrics,
    'include_internal', coalesce(p_include_internal, false),
    'kpis', v_current_kpis,
    'previous_kpis', v_previous_kpis,
    'revenue_series', v_revenue_series,
    'funnel', v_funnel,
    'top_products', v_top_products,
    'sales_by_category', v_sales_by_category,
    'sales_by_zone', v_sales_by_zone,
    'busiest_times_heatmap', v_heatmap,
    'cancellations_by_reason', v_cancellations,
    'status_breakdown', v_status_breakdown,
    'inventory', v_inventory,
    'needs_attention', v_needs_attention,
    'recent_orders', v_recent_orders
  );
end;
$$;

revoke all on function public.get_analytics_dashboard(date, date, boolean, boolean) from public, anon, authenticated;
grant execute on function public.get_analytics_dashboard(date, date, boolean, boolean) to service_role;

-- Keep backwards-compatible 3-argument wrapper
create or replace function public.get_analytics_dashboard(
  p_from                  date,
  p_to                    date,
  p_include_owner_metrics boolean default false
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.get_analytics_dashboard(p_from, p_to, p_include_owner_metrics, false);
$$;

revoke all on function public.get_analytics_dashboard(date, date, boolean) from public, anon, authenticated;
grant execute on function public.get_analytics_dashboard(date, date, boolean) to service_role;

