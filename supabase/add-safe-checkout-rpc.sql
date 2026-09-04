-- =========================================================
-- Safe checkout transaction
-- Run this after the enum normalization migration.
-- =========================================================

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
    for update
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
