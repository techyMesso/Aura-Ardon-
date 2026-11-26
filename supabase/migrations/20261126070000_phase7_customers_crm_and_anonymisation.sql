-- =========================================================
-- Phase 7: Customers CRM, Flagged Order Review, Accurate LTV
-- & Accounting-Safe Customer Anonymisation (Kenya DPA)
-- =========================================================

-- ─── 1. EXTEND customers & orders ────────────────────────
alter table public.customers
  add column if not exists addresses_used text[] not null default '{}',
  add column if not exists zones_used     text[] not null default '{}',
  add column if not exists anonymized_at  timestamptz;

create index if not exists customers_flagged_blocked_idx
  on public.customers (is_flagged, is_blocked)
  where is_flagged = true or is_blocked = true;

create index if not exists customers_opted_in_idx
  on public.customers (marketing_opt_in, last_order_at desc)
  where marketing_opt_in = true and anonymized_at is null;

-- Backfill addresses_used and zones_used from existing last_address/last_zone
update public.customers
set
  addresses_used = case
    when last_address is not null and not (last_address = any(addresses_used))
      then array_append(addresses_used, last_address)
    else addresses_used
  end,
  zones_used = case
    when last_zone is not null and not (last_zone = any(zones_used))
      then array_append(zones_used, last_zone)
    else zones_used
  end
where last_address is not null or last_zone is not null;

-- Flagged-customer order review markers on orders
alter table public.orders
  add column if not exists needs_review  boolean not null default false,
  add column if not exists review_reason text;

create index if not exists orders_needs_review_idx
  on public.orders (created_at desc)
  where needs_review = true;

-- ─── 2. ALLOW PII-ONLY SCRUB ON INVOICES DURING ANONYMISATION ─
-- Financial fields, totals, lines, invoice_number, and business_snapshot
-- remain 100% immutable even during a customer data deletion request.
create or replace function public.enforce_invoice_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_anonymizing boolean := current_setting('app.anonymizing_customer', true) = 'on';
begin
  if new.invoice_number is distinct from old.invoice_number
     or new.order_id is distinct from old.order_id
     or new.issued_at is distinct from old.issued_at
     or new.lines_snapshot is distinct from old.lines_snapshot
     or new.business_snapshot is distinct from old.business_snapshot
     or new.subtotal is distinct from old.subtotal
     or new.discount_code is distinct from old.discount_code
     or new.discount_amount is distinct from old.discount_amount
     or new.delivery_fee is distinct from old.delivery_fee
     or new.total is distinct from old.total then
    raise exception 'Issued invoices are immutable. Corrections must be made with a credit note.';
  end if;

  if not v_anonymizing and new.customer_snapshot is distinct from old.customer_snapshot then
    raise exception 'Issued invoices are immutable. Corrections must be made with a credit note.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_invoice_immutability() from public, anon, authenticated;

-- ─── 3. HELPER: recompute_customer_stats(...) ────────────
-- Keeps order_count, cancelled_count, and net lifetime_value in sync
-- with real orders & returns (cancelled excluded, returns subtracted).
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
  where o.customer_id = p_customer_id;

  select coalesce(sum(r.refund_amount), 0)::numeric(12,2)
  into v_returns_total
  from public.order_returns r
  join public.orders o on o.id = r.order_id
  where o.customer_id = p_customer_id
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

-- Trigger to keep customer stats accurate on every order status/return change
create or replace function public.sync_customer_stats_on_order_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_id is not null then
    perform public.recompute_customer_stats(new.customer_id);
  end if;
  return new;
end;
$$;

revoke all on function public.sync_customer_stats_on_order_change() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'orders_sync_customer_stats'
  ) then
    create trigger orders_sync_customer_stats
      after insert or update of status, total, customer_id on public.orders
      for each row
      execute function public.sync_customer_stats_on_order_change();
  end if;
end
$$;

create or replace function public.sync_customer_stats_on_return_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  select o.customer_id into v_customer_id from public.orders o where o.id = new.order_id;
  if v_customer_id is not null then
    perform public.recompute_customer_stats(v_customer_id);
  end if;
  return new;
end;
$$;

revoke all on function public.sync_customer_stats_on_return_insert() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'order_returns_sync_customer_stats'
  ) then
    create trigger order_returns_sync_customer_stats
      after insert on public.order_returns
      for each row
      execute function public.sync_customer_stats_on_return_insert();
  end if;
end
$$;

-- ─── 4. FUNCTION: anonymize_customer(...) ────────────────
-- Owner action for data deletion requests: replaces customer PII across
-- customers, orders, discount_redemptions, and invoice customer snapshots
-- while preserving all order/invoice/payment/credit-note financial totals.
create or replace function public.anonymize_customer(
  p_customer_id uuid,
  p_actor       text default 'owner'
)
returns table (
  customer_id         uuid,
  anonymized_ref      text,
  orders_anonymized   integer,
  invoices_anonymized integer,
  already_anonymized  boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer       public.customers%rowtype;
  v_actor          text := coalesce(nullif(btrim(coalesce(p_actor, '')), ''), 'owner');
  v_now            timestamptz := timezone('utc', now());
  v_anon_ref       text;
  v_orders_count   integer := 0;
  v_invoices_count integer := 0;
begin
  select *
  into v_customer
  from public.customers c
  where c.id = p_customer_id
  for update;

  if not found then
    raise exception 'Customer not found.';
  end if;

  if v_customer.anonymized_at is not null then
    return query
    select
      v_customer.id,
      v_customer.phone,
      0,
      0,
      true;
    return;
  end if;

  v_anon_ref := 'ANON-' || upper(left(replace(p_customer_id::text, '-', ''), 8));

  -- 1. Anonymize customer profile
  update public.customers c
  set
    phone = v_anon_ref,
    full_name = 'Deleted Customer',
    names_used = '{}',
    last_zone = null,
    last_address = 'Anonymized',
    addresses_used = '{}',
    zones_used = '{}',
    is_flagged = false,
    is_blocked = false,
    marketing_opt_in = false,
    marketing_opt_in_at = null,
    notes = 'Anonymized per customer data deletion request by ' || v_actor || ' on ' || to_char(v_now at time zone 'Africa/Nairobi', 'YYYY-MM-DD HH24:MI') || ' EAT.',
    tags = array['anonymized'],
    anonymized_at = v_now
  where c.id = p_customer_id;

  -- 2. Scrub PII on linked orders while preserving all financial amounts & items
  update public.orders o
  set
    customer_name = 'Deleted Customer',
    customer_email = null,
    customer_phone = v_anon_ref,
    customer_location = 'Anonymized',
    delivery_address = 'Anonymized',
    town_county = null,
    notes = null,
    gift_note = null,
    marketing_opt_in = false
  where o.customer_id = p_customer_id;

  get diagnostics v_orders_count = row_count;

  -- 3. Scrub phone on discount_redemptions for linked orders
  update public.discount_redemptions dr
  set customer_phone = v_anon_ref
  where dr.order_id in (
    select o.id from public.orders o where o.customer_id = p_customer_id
  );

  -- 4. Scrub ONLY customer_snapshot PII on linked invoices + revoke public links + clear cached PDFs
  perform set_config('app.anonymizing_customer', 'on', true);

  update public.invoices i
  set
    customer_snapshot = jsonb_build_object(
      'full_name', 'Deleted Customer',
      'phone', v_anon_ref,
      'address', 'Anonymized',
      'delivery_zone_name', null,
      'town_county', null,
      'location', 'Anonymized',
      'order_number', i.customer_snapshot->>'order_number',
      'is_gift', coalesce((i.customer_snapshot->>'is_gift')::boolean, false),
      'hide_prices', coalesce((i.customer_snapshot->>'hide_prices')::boolean, false)
    ),
    share_revoked = true,
    pdf_a4_path = null,
    pdf_receipt_path = null
  where i.order_id in (
    select o.id from public.orders o where o.customer_id = p_customer_id
  );

  get diagnostics v_invoices_count = row_count;

  return query
  select
    p_customer_id,
    v_anon_ref,
    v_orders_count,
    v_invoices_count,
    false;
end;
$$;

revoke all on function public.anonymize_customer(uuid, text) from public, anon, authenticated;
grant execute on function public.anonymize_customer(uuid, text) to service_role;

-- ─── 5. UPDATE place_order(...) FOR FLAGGED REVIEW + ARRAYS ─
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
    1,
    v_total,
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
    zones_used = case
      when excluded.last_zone = any(public.customers.zones_used) then public.customers.zones_used
      else array_append(public.customers.zones_used, excluded.last_zone)
    end,
    addresses_used = case
      when excluded.last_address = any(public.customers.addresses_used) then public.customers.addresses_used
      else array_append(public.customers.addresses_used, excluded.last_address)
    end,
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

    update public.discount_codes dc
    set used_count = dc.used_count + 1
    where dc.id = v_discount_code_id;
  end if;

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

