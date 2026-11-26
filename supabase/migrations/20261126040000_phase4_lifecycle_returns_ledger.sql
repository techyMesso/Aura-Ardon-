-- =========================================================
-- Phase 4: Order Lifecycle, Cancellations, Returns & Stock Ledger
-- =========================================================

-- ─── 1. CANCEL REASON ENUM ───────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'order_cancel_reason'
  ) then
    create type public.order_cancel_reason as enum (
      'customer_no_response',
      'customer_cancelled',
      'out_of_stock',
      'fake_order',
      'delivery_failed',
      'other'
    );
  end if;
end
$$;

-- ─── 2. LIFECYCLE COLUMNS & INDEXES ON orders ────────────
alter table public.orders
  add column if not exists cancel_reason public.order_cancel_reason,
  add column if not exists cancel_note   text,
  add column if not exists cancelled_at  timestamptz,
  add column if not exists restocked_at  timestamptz,
  add column if not exists returned_at   timestamptz;

create index if not exists orders_status_created_at_idx
  on public.orders (status, created_at desc);

create index if not exists orders_pending_created_at_idx
  on public.orders (created_at asc)
  where status = 'pending';

-- Never allow hard deletion of orders
create or replace function public.prevent_order_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Orders cannot be deleted. Cancel the order instead.';
end;
$$;

revoke all on function public.prevent_order_delete() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'orders_prevent_delete'
  ) then
    create trigger orders_prevent_delete
      before delete on public.orders
      for each row
      execute function public.prevent_order_delete();
  end if;
end
$$;

-- ─── 3. TABLE: order_status_history ──────────────────────
create table if not exists public.order_status_history (
  id          uuid        primary key default gen_random_uuid(),
  order_id    uuid        not null references public.orders(id) on delete restrict,
  from_status text        check (
                            from_status is null or from_status in (
                              'pending', 'confirmed', 'dispatched', 'delivered', 'cancelled', 'returned'
                            )
                          ),
  to_status   text        not null check (
                            to_status in (
                              'pending', 'confirmed', 'dispatched', 'delivered', 'cancelled', 'returned'
                            )
                          ),
  changed_by  text        not null default 'system',
  reason      text,
  created_at  timestamptz not null default timezone('utc', now())
);

create index if not exists order_status_history_order_id_idx
  on public.order_status_history (order_id, created_at asc);

alter table public.order_status_history enable row level security;
revoke all on public.order_status_history from anon, authenticated;

-- Backfill initial status history for any existing orders without history
insert into public.order_status_history (order_id, from_status, to_status, changed_by, reason, created_at)
select
  o.id,
  null,
  coalesce(
    o.status,
    case o.order_status
      when 'PENDING_CONFIRMATION' then 'pending'
      when 'CONFIRMED' then 'confirmed'
      when 'OUT_FOR_DELIVERY' then 'dispatched'
      when 'DELIVERED' then 'delivered'
      when 'CANCELLED' then 'cancelled'
      else 'pending'
    end
  ),
  'system',
  'Order created',
  o.created_at
from public.orders o
where not exists (
  select 1 from public.order_status_history h where h.order_id = o.id
);

-- Automatically log initial status history when a new order is inserted
create or replace function public.log_order_initial_status_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.order_status_history where order_id = new.id
  ) then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by, reason)
    values (
      new.id,
      null,
      coalesce(new.status, 'pending'),
      case when coalesce(new.channel, '') = 'whatsapp' then 'checkout' else 'system' end,
      'Order created'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.log_order_initial_status_history() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'orders_log_initial_history'
  ) then
    create trigger orders_log_initial_history
      after insert on public.orders
      for each row
      execute function public.log_order_initial_status_history();
  end if;
end
$$;

-- ─── 4. TABLE: order_returns ─────────────────────────────
create table if not exists public.order_returns (
  id             uuid          primary key default gen_random_uuid(),
  order_id       uuid          not null references public.orders(id) on delete restrict,
  order_item_id  uuid          references public.order_items(id) on delete set null,
  product_id     uuid          references public.products(id) on delete set null,
  product_title  text          not null,
  quantity       integer       not null check (quantity > 0),
  unit_price     numeric(12,2) not null check (unit_price >= 0),
  refund_amount  numeric(12,2) generated always as ((unit_price * quantity)::numeric(12,2)) stored,
  condition      text          not null check (condition in ('resellable', 'damaged')),
  note           text,
  created_by     text          not null default 'system',
  created_at     timestamptz   not null default timezone('utc', now())
);

create index if not exists order_returns_order_id_idx
  on public.order_returns (order_id, created_at asc);

create index if not exists order_returns_order_item_id_idx
  on public.order_returns (order_item_id);

create index if not exists order_returns_product_id_idx
  on public.order_returns (product_id);

create index if not exists order_returns_created_at_idx
  on public.order_returns (created_at desc);

alter table public.order_returns enable row level security;
revoke all on public.order_returns from anon, authenticated;

-- ─── 5. STOCK LEDGER EXTENSIONS & INITIAL STOCK TRIGGER ──
alter table public.stock_movements
  add column if not exists variant_id uuid;

create index if not exists stock_movements_variant_id_idx
  on public.stock_movements (variant_id)
  where variant_id is not null;

-- Ensure every existing product has an initial_stock movement baseline
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

-- Automatically log initial_stock whenever a new product is inserted
create or replace function public.log_product_initial_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.stock_movements where product_id = new.id
  ) then
    insert into public.stock_movements (product_id, change, type, note, created_by)
    values (
      new.id,
      coalesce(new.stock_quantity, 0),
      'initial_stock',
      'Initial stock on product creation',
      'admin'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.log_product_initial_stock() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'products_log_initial_stock'
  ) then
    create trigger products_log_initial_stock
      after insert on public.products
      for each row
      execute function public.log_product_initial_stock();
  end if;
end
$$;

-- ─── 6. FUNCTION: set_order_status(...) ──────────────────
-- Enforces forward lifecycle transitions:
--   pending -> confirmed -> dispatched -> delivered
-- Cancellations and returns must use cancel_order(...) and return_order(...).
create or replace function public.set_order_status(
  p_order_id   uuid,
  p_to_status  text,
  p_changed_by text default 'admin',
  p_reason     text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order         public.orders%rowtype;
  v_from_status   text;
  v_to_status     text := lower(btrim(coalesce(p_to_status, '')));
  v_legacy_status public.order_status;
  v_actor         text := coalesce(nullif(btrim(coalesce(p_changed_by, '')), ''), 'admin');
  v_clean_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_updated       public.orders%rowtype;
begin
  if v_to_status not in ('pending', 'confirmed', 'dispatched', 'delivered', 'cancelled', 'returned') then
    raise exception 'Invalid target status: %', p_to_status;
  end if;

  if v_to_status = 'cancelled' then
    raise exception 'Use cancel_order() to cancel an order with a reason and restock items.';
  end if;

  if v_to_status = 'returned' then
    raise exception 'Use return_order() to record returned items and condition.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  v_from_status := coalesce(
    v_order.status,
    case v_order.order_status
      when 'PENDING_CONFIRMATION' then 'pending'
      when 'CONFIRMED' then 'confirmed'
      when 'OUT_FOR_DELIVERY' then 'dispatched'
      when 'DELIVERED' then 'delivered'
      when 'CANCELLED' then 'cancelled'
      else 'pending'
    end
  );

  if not (
    (v_from_status = 'pending' and v_to_status = 'confirmed') or
    (v_from_status = 'confirmed' and v_to_status = 'dispatched') or
    (v_from_status = 'dispatched' and v_to_status = 'delivered')
  ) then
    raise exception 'Invalid status transition from % to %.', v_from_status, v_to_status;
  end if;

  v_legacy_status := case v_to_status
    when 'confirmed' then 'CONFIRMED'::public.order_status
    when 'dispatched' then 'OUT_FOR_DELIVERY'::public.order_status
    when 'delivered' then 'DELIVERED'::public.order_status
    else 'PENDING_CONFIRMATION'::public.order_status
  end;

  update public.orders
  set
    status = v_to_status,
    order_status = v_legacy_status
  where id = p_order_id
  returning *
  into v_updated;

  insert into public.order_status_history (
    order_id,
    from_status,
    to_status,
    changed_by,
    reason
  )
  values (
    p_order_id,
    v_from_status,
    v_to_status,
    v_actor,
    v_clean_reason
  );

  return v_updated;
end;
$$;

revoke all on function public.set_order_status(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.set_order_status(uuid, text, text, text) to service_role;

-- ─── 7. FUNCTION: cancel_order(...) ──────────────────────
-- Allowed from pending, confirmed, or dispatched.
-- Idempotent: if restocked_at is already set, never restocks twice.
create or replace function public.cancel_order(
  p_order_id   uuid,
  p_reason     public.order_cancel_reason,
  p_note       text default null,
  p_changed_by text default 'admin'
)
returns table (
  order_id              uuid,
  order_number          text,
  status                text,
  restocked_items_count integer,
  already_restocked     boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order           public.orders%rowtype;
  v_from_status     text;
  v_actor           text := coalesce(nullif(btrim(coalesce(p_changed_by, '')), ''), 'admin');
  v_clean_note      text := nullif(btrim(coalesce(p_note, '')), '');
  v_now             timestamptz := timezone('utc', now());
  v_item            record;
  v_restocked_units integer := 0;
  v_history_reason  text;
  v_order_code      text;
begin
  if p_reason is null then
    raise exception 'A cancellation reason is required.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  v_order_code := coalesce(v_order.order_number, upper(left(v_order.id::text, 8)));
  v_from_status := coalesce(
    v_order.status,
    case v_order.order_status
      when 'PENDING_CONFIRMATION' then 'pending'
      when 'CONFIRMED' then 'confirmed'
      when 'OUT_FOR_DELIVERY' then 'dispatched'
      when 'DELIVERED' then 'delivered'
      when 'CANCELLED' then 'cancelled'
      else 'pending'
    end
  );

  -- Idempotency guard: already cancelled and restocked -> do not restock twice
  if v_from_status = 'cancelled' and v_order.restocked_at is not null then
    return query
    select
      v_order.id,
      v_order_code,
      'cancelled'::text,
      0,
      true;
    return;
  end if;

  if v_from_status not in ('pending', 'confirmed', 'dispatched', 'cancelled') then
    raise exception 'Invalid status transition: delivered or returned orders cannot be cancelled.';
  end if;

  -- Restock all order items atomically if restocked_at is not set
  if v_order.restocked_at is null then
    for v_item in
      select
        oi.product_id,
        sum(oi.quantity)::integer as total_qty
      from public.order_items oi
      where oi.order_id = p_order_id
        and oi.product_id is not null
        and oi.quantity > 0
      group by oi.product_id
      order by oi.product_id asc
    loop
      perform 1
      from public.products
      where id = v_item.product_id
      for update;

      if found then
        update public.products
        set stock_quantity = stock_quantity + v_item.total_qty
        where id = v_item.product_id;

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
          p_order_id,
          v_item.total_qty,
          'cancel_restock',
          'Cancelled order ' || v_order_code || ' (' || p_reason::text || ')' ||
            case when v_clean_note is not null then ': ' || v_clean_note else '' end,
          v_actor
        );

        v_restocked_units := v_restocked_units + v_item.total_qty;
      end if;
    end loop;
  end if;

  update public.orders
  set
    status = 'cancelled',
    order_status = 'CANCELLED',
    cancel_reason = coalesce(cancel_reason, p_reason),
    cancel_note = coalesce(cancel_note, v_clean_note),
    cancelled_at = coalesce(cancelled_at, v_now),
    restocked_at = coalesce(restocked_at, v_now)
  where id = p_order_id;

  if v_from_status <> 'cancelled' then
    if v_order.customer_id is not null then
      update public.customers
      set cancelled_count = cancelled_count + 1
      where id = v_order.customer_id;
    end if;

    v_history_reason := p_reason::text ||
      case when v_clean_note is not null then ': ' || v_clean_note else '' end;

    insert into public.order_status_history (
      order_id,
      from_status,
      to_status,
      changed_by,
      reason
    )
    values (
      p_order_id,
      v_from_status,
      'cancelled',
      v_actor,
      v_history_reason
    );
  end if;

  return query
  select
    v_order.id,
    v_order_code,
    'cancelled'::text,
    v_restocked_units,
    false;
end;
$$;

revoke all on function public.cancel_order(uuid, public.order_cancel_reason, text, text) from public, anon, authenticated;
grant execute on function public.cancel_order(uuid, public.order_cancel_reason, text, text) to service_role;

-- ─── 8. FUNCTION: return_order(...) ──────────────────────
-- Allowed only from delivered (or partially returned) orders.
-- resellable -> restocks product + logs return_restock (+qty)
-- damaged    -> does NOT restock + logs damaged_writeoff (0 change, notes qty)
create or replace function public.return_order(
  p_order_id   uuid,
  p_items      jsonb,
  p_condition  text,
  p_note       text default null,
  p_changed_by text default 'admin'
)
returns table (
  order_id        uuid,
  order_number    text,
  status          text,
  returned_units  integer,
  restocked_units integer,
  returned_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order            public.orders%rowtype;
  v_from_status      text;
  v_condition        text := lower(btrim(coalesce(p_condition, '')));
  v_actor            text := coalesce(nullif(btrim(coalesce(p_changed_by, '')), ''), 'admin');
  v_clean_note       text := nullif(btrim(coalesce(p_note, '')), '');
  v_now              timestamptz := timezone('utc', now());
  v_order_code       text;
  v_req              record;
  v_oi               public.order_items%rowtype;
  v_already_returned integer;
  v_returned_units   integer := 0;
  v_restocked_units  integer := 0;
  v_returned_amount  numeric(12,2) := 0;
begin
  if v_condition not in ('resellable', 'damaged') then
    raise exception 'Return condition must be resellable or damaged.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Select at least one item to return.';
  end if;

  select *
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  v_order_code := coalesce(v_order.order_number, upper(left(v_order.id::text, 8)));
  v_from_status := coalesce(
    v_order.status,
    case v_order.order_status
      when 'PENDING_CONFIRMATION' then 'pending'
      when 'CONFIRMED' then 'confirmed'
      when 'OUT_FOR_DELIVERY' then 'dispatched'
      when 'DELIVERED' then 'delivered'
      when 'CANCELLED' then 'cancelled'
      else 'pending'
    end
  );

  if v_from_status not in ('delivered', 'returned') then
    raise exception 'Only delivered orders can be marked as returned.';
  end if;

  -- Process requested items deterministically by order_item_id
  for v_req in
    select
      (entry->>'order_item_id')::uuid as order_item_id,
      sum((entry->>'quantity')::integer)::integer as qty
    from jsonb_array_elements(p_items) as entry
    group by (entry->>'order_item_id')::uuid
    order by (entry->>'order_item_id')::uuid asc
  loop
    if v_req.order_item_id is null or v_req.qty is null or v_req.qty <= 0 then
      raise exception 'Each returned item must include a valid order_item_id and positive quantity.';
    end if;

    select *
    into v_oi
    from public.order_items oi
    where oi.id = v_req.order_item_id
      and oi.order_id = p_order_id;

    if not found then
      raise exception 'Order item % does not belong to order %.', v_req.order_item_id, v_order_code;
    end if;

    select coalesce(sum(r.quantity), 0)::integer
    into v_already_returned
    from public.order_returns r
    where r.order_id = p_order_id
      and r.order_item_id = v_oi.id;

    if v_already_returned + v_req.qty > v_oi.quantity then
      raise exception 'Cannot return % unit(s) of % (only % remaining returnable).',
        v_req.qty, v_oi.product_title, greatest(0, v_oi.quantity - v_already_returned);
    end if;

    insert into public.order_returns (
      order_id,
      order_item_id,
      product_id,
      product_title,
      quantity,
      unit_price,
      condition,
      note,
      created_by
    )
    values (
      p_order_id,
      v_oi.id,
      v_oi.product_id,
      v_oi.product_title,
      v_req.qty,
      v_oi.unit_price,
      v_condition,
      v_clean_note,
      v_actor
    );

    v_returned_units := v_returned_units + v_req.qty;
    v_returned_amount := v_returned_amount + (v_oi.unit_price * v_req.qty)::numeric(12,2);

    if v_oi.product_id is not null then
      perform 1
      from public.products
      where id = v_oi.product_id
      for update;

      if found then
        if v_condition = 'resellable' then
          update public.products
          set stock_quantity = stock_quantity + v_req.qty
          where id = v_oi.product_id;

          insert into public.stock_movements (
            product_id,
            order_id,
            change,
            type,
            note,
            created_by
          )
          values (
            v_oi.product_id,
            p_order_id,
            v_req.qty,
            'return_restock',
            'Returned (resellable) from order ' || v_order_code ||
              case when v_clean_note is not null then ': ' || v_clean_note else '' end,
            v_actor
          );

          v_restocked_units := v_restocked_units + v_req.qty;
        else
          -- Damaged return: no restock; record damaged_writeoff with 0 change so ledger sum matches sellable stock
          insert into public.stock_movements (
            product_id,
            order_id,
            change,
            type,
            note,
            created_by
          )
          values (
            v_oi.product_id,
            p_order_id,
            0,
            'damaged_writeoff',
            'Damaged return write-off (' || v_req.qty || ' unit(s) not restocked) from order ' || v_order_code ||
              case when v_clean_note is not null then ': ' || v_clean_note else '' end,
            v_actor
          );
        end if;
      end if;
    end if;
  end loop;

  update public.orders
  set
    status = 'returned',
    returned_at = coalesce(returned_at, v_now)
  where id = p_order_id;

  insert into public.order_status_history (
    order_id,
    from_status,
    to_status,
    changed_by,
    reason
  )
  values (
    p_order_id,
    v_from_status,
    'returned',
    v_actor,
    'Returned ' || v_returned_units || ' unit(s) (' || v_condition || ')' ||
      case when v_clean_note is not null then ': ' || v_clean_note else '' end
  );

  return query
  select
    v_order.id,
    v_order_code,
    'returned'::text,
    v_returned_units,
    v_restocked_units,
    v_returned_amount;
end;
$$;

revoke all on function public.return_order(uuid, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.return_order(uuid, jsonb, text, text, text) to service_role;

-- ─── 9. FUNCTION: adjust_product_stock(...) ──────────────
-- Manual stock adjustments ALWAYS require a non-empty note and write through stock_movements.
create or replace function public.adjust_product_stock(
  p_product_id uuid,
  p_change     integer,
  p_note       text,
  p_changed_by text default 'admin',
  p_type       text default 'manual_adjustment'
)
returns table (
  product_id         uuid,
  new_stock_quantity integer,
  movement_id        uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_actor       text := coalesce(nullif(btrim(coalesce(p_changed_by, '')), ''), 'admin');
  v_type        text := lower(btrim(coalesce(p_type, 'manual_adjustment')));
  v_product     public.products%rowtype;
  v_next_stock  integer;
  v_movement_id uuid;
begin
  if v_clean_note is null then
    raise exception 'A note is required for manual stock adjustments.';
  end if;

  if p_change is null or p_change = 0 then
    raise exception 'Stock adjustment quantity must be non-zero.';
  end if;

  if v_type not in ('manual_adjustment', 'damaged_writeoff') then
    raise exception 'Adjustment type must be manual_adjustment or damaged_writeoff.';
  end if;

  if v_type = 'damaged_writeoff' and p_change > 0 then
    raise exception 'Damaged write-off adjustment must be negative.';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found.';
  end if;

  v_next_stock := v_product.stock_quantity + p_change;
  if v_next_stock < 0 then
    raise exception 'Stock cannot drop below zero (current stock: %).', v_product.stock_quantity;
  end if;

  update public.products
  set stock_quantity = v_next_stock
  where id = p_product_id;

  insert into public.stock_movements (
    product_id,
    order_id,
    change,
    type,
    note,
    created_by
  )
  values (
    p_product_id,
    null,
    p_change,
    v_type,
    v_clean_note,
    v_actor
  )
  returning id
  into v_movement_id;

  return query
  select
    p_product_id,
    v_next_stock,
    v_movement_id;
end;
$$;

revoke all on function public.adjust_product_stock(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.adjust_product_stock(uuid, integer, text, text, text) to service_role;

-- ─── 10. FUNCTION: check_stock_integrity() ───────────────
-- Returns any products whose current stock_quantity != sum(stock_movements.change).
-- Empty result means 100% ledger integrity.
create or replace function public.check_stock_integrity()
returns table (
  product_id     uuid,
  product_title  text,
  recorded_stock integer,
  ledger_sum     integer,
  discrepancy    integer
)
language sql
security definer
set search_path = public
as $$
  select
    p.id as product_id,
    p.title as product_title,
    p.stock_quantity as recorded_stock,
    coalesce(sum(sm.change), 0)::integer as ledger_sum,
    (p.stock_quantity - coalesce(sum(sm.change), 0))::integer as discrepancy
  from public.products p
  left join public.stock_movements sm on sm.product_id = p.id
  group by p.id, p.title, p.stock_quantity
  having p.stock_quantity <> coalesce(sum(sm.change), 0)
  order by p.title asc;
$$;

revoke all on function public.check_stock_integrity() from public, anon, authenticated;
grant execute on function public.check_stock_integrity() to service_role;

-- ─── 11. FUNCTION: auto_cancel_stale_pending_orders() ────
-- Cancels pending orders older than store_settings.pending_auto_cancel_hours
-- with reason customer_no_response and actor 'system', restoring stock idempotently.
create or replace function public.auto_cancel_stale_pending_orders()
returns table (
  cancelled_count         integer,
  restocked_units         integer,
  cancelled_order_numbers text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hours       integer := 48;
  v_cutoff      timestamptz;
  v_order_row   record;
  v_res         record;
  v_count       integer := 0;
  v_units       integer := 0;
  v_numbers     text[] := '{}';
begin
  select coalesce(pending_auto_cancel_hours, 48)
  into v_hours
  from public.store_settings
  where id = true;

  if v_hours is null or v_hours <= 0 then
    v_hours := 48;
  end if;

  v_cutoff := timezone('utc', now()) - make_interval(hours => v_hours);

  for v_order_row in
    select id
    from public.orders
    where status = 'pending'
      and created_at <= v_cutoff
    order by created_at asc
  loop
    select *
    into v_res
    from public.cancel_order(
      v_order_row.id,
      'customer_no_response'::public.order_cancel_reason,
      'Auto-cancelled after ' || v_hours || ' hours without confirmation',
      'system'
    );

    if not coalesce(v_res.already_restocked, false) then
      v_count := v_count + 1;
      v_units := v_units + coalesce(v_res.restocked_items_count, 0);
      v_numbers := array_append(v_numbers, v_res.order_number);
    end if;
  end loop;

  return query
  select v_count, v_units, v_numbers;
end;
$$;

revoke all on function public.auto_cancel_stale_pending_orders() from public, anon, authenticated;
grant execute on function public.auto_cancel_stale_pending_orders() to service_role;

-- ─── 12. KEEP LEGACY update_admin_order IN SYNC ──────────
-- Preserves compatibility for legacy PATCH /api/admin/orders/[id] calls
-- while delegating status transitions and cancellation to Phase 4 functions.
create or replace function public.update_admin_order(
  target_order_id     uuid,
  next_order_status   public.order_status default null,
  next_payment_status public.payment_status default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order         public.orders%rowtype;
  v_target_canon  text;
begin
  select *
  into v_order
  from public.orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  if next_order_status is not null and next_order_status <> v_order.order_status then
    v_target_canon := case next_order_status
      when 'PENDING_CONFIRMATION' then 'pending'
      when 'CONFIRMED' then 'confirmed'
      when 'OUT_FOR_DELIVERY' then 'dispatched'
      when 'DELIVERED' then 'delivered'
      when 'CANCELLED' then 'cancelled'
    end;

    if v_target_canon = 'cancelled' then
      perform public.cancel_order(
        target_order_id,
        'other'::public.order_cancel_reason,
        'Cancelled via legacy order update',
        'admin'
      );
    else
      perform public.set_order_status(
        target_order_id,
        v_target_canon,
        'admin',
        null
      );
    end if;
  end if;

  if next_payment_status is not null then
    update public.orders
    set payment_status = next_payment_status
    where id = target_order_id;
  end if;

  select *
  into v_order
  from public.orders
  where id = target_order_id;

  return v_order;
end;
$$;

revoke all on function public.update_admin_order(uuid, public.order_status, public.payment_status) from public, anon, authenticated;
grant execute on function public.update_admin_order(uuid, public.order_status, public.payment_status) to service_role;
