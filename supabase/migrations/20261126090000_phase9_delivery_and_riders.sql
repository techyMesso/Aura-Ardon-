-- =========================================================
-- Phase 9: Delivery & Riders
-- - riders table (name, phone, active, default_cost, optional per-zone costs)
-- - orders rider assignment, rider_cost & dispatched_at tracking
-- - dispatch_order(...) and assign_order_rider(...) server RPCs
-- - set_order_status(...) stamps dispatched_at when dispatching
-- =========================================================

-- ─── 1. TABLE: riders ────────────────────────────────────
create table if not exists public.riders (
  id           uuid          primary key default gen_random_uuid(),
  name         text          not null check (char_length(btrim(name)) > 0),
  phone        text          not null check (char_length(btrim(phone)) > 0),
  active       boolean       not null default true,
  default_cost numeric(12,2) not null default 0 check (default_cost >= 0),
  zone_costs   jsonb         not null default '{}'::jsonb check (jsonb_typeof(zone_costs) = 'object'),
  notes        text,
  created_at   timestamptz   not null default timezone('utc', now()),
  updated_at   timestamptz   not null default timezone('utc', now())
);

create index if not exists riders_active_name_idx
  on public.riders (active desc, name asc);

create index if not exists riders_phone_idx
  on public.riders (phone);

alter table public.riders enable row level security;
revoke all on public.riders from anon, authenticated;

create or replace function public.set_riders_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke all on function public.set_riders_updated_at() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'riders_set_updated_at'
  ) then
    create trigger riders_set_updated_at
      before update on public.riders
      for each row
      execute function public.set_riders_updated_at();
  end if;
end
$$;

-- ─── 2. EXTEND orders WITH RIDER ASSIGNMENT & COST ───────
alter table public.orders
  add column if not exists rider_id      uuid references public.riders(id) on delete set null,
  add column if not exists rider_name    text,
  add column if not exists rider_phone   text,
  add column if not exists rider_cost    numeric(12,2) check (rider_cost is null or rider_cost >= 0),
  add column if not exists dispatched_at timestamptz;

create index if not exists orders_rider_id_idx
  on public.orders (rider_id)
  where rider_id is not null;

create index if not exists orders_dispatched_at_idx
  on public.orders (dispatched_at desc)
  where dispatched_at is not null;

-- Backfill dispatched_at for already-dispatched / delivered orders from status history
update public.orders o
set dispatched_at = h.first_dispatched_at
from (
  select
    osh.order_id,
    min(osh.created_at) as first_dispatched_at
  from public.order_status_history osh
  where osh.to_status = 'dispatched'
  group by osh.order_id
) h
where o.id = h.order_id
  and o.dispatched_at is null;

-- ─── 3. UPDATE set_order_status TO STAMP dispatched_at ───
create or replace function public.set_order_status(
  p_order_id   uuid,
  p_to_status  text,
  p_changed_by text default 'admin',
  p_reason     text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, extensions
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
  from public.orders o
  where o.id = p_order_id
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

  update public.orders o
  set
    status = v_to_status,
    order_status = v_legacy_status,
    dispatched_at = case
      when v_to_status = 'dispatched' then coalesce(o.dispatched_at, timezone('utc', now()))
      else o.dispatched_at
    end
  where o.id = p_order_id
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

  -- Phase 5: automatically issue unpaid invoice when confirmed
  if v_to_status = 'confirmed' then
    perform public.issue_invoice_for_order(p_order_id, v_actor);
  end if;

  return v_updated;
end;
$$;

revoke all on function public.set_order_status(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.set_order_status(uuid, text, text, text) to service_role;

-- ─── 4. HELPER: resolve_rider_cost_for_zone(...) ─────────
create or replace function public.resolve_rider_cost_for_zone(
  p_rider_default_cost numeric,
  p_rider_zone_costs   jsonb,
  p_delivery_zone_id   uuid
)
returns numeric(12,2)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_raw text;
  v_num numeric;
begin
  if p_delivery_zone_id is not null
     and p_rider_zone_costs is not null
     and jsonb_typeof(p_rider_zone_costs) = 'object'
     and (p_rider_zone_costs ? p_delivery_zone_id::text) then
    v_raw := nullif(btrim(p_rider_zone_costs ->> p_delivery_zone_id::text), '');
    if v_raw is not null and v_raw ~ '^[0-9]+(\.[0-9]+)?$' then
      v_num := round(v_raw::numeric, 2);
      if v_num >= 0 then
        return v_num::numeric(12,2);
      end if;
    end if;
  end if;

  return round(greatest(coalesce(p_rider_default_cost, 0), 0)::numeric, 2)::numeric(12,2);
end;
$$;

revoke all on function public.resolve_rider_cost_for_zone(numeric, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.resolve_rider_cost_for_zone(numeric, jsonb, uuid) to service_role;

-- ─── 5. RPC: dispatch_order(...) ─────────────────────────
-- Atomically transitions a confirmed order -> dispatched, assigns optional rider
-- snapshot (id, name, phone) and computes or overrides rider_cost per order.
create or replace function public.dispatch_order(
  p_order_id   uuid,
  p_rider_id   uuid    default null,
  p_rider_cost numeric default null,
  p_changed_by text    default 'admin',
  p_reason     text    default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_order         public.orders%rowtype;
  v_rider         public.riders%rowtype;
  v_has_rider     boolean := false;
  v_from_status   text;
  v_actor         text := coalesce(nullif(btrim(coalesce(p_changed_by, '')), ''), 'admin');
  v_clean_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_cost          numeric(12,2) := null;
  v_now           timestamptz := timezone('utc', now());
  v_updated       public.orders%rowtype;
begin
  if p_rider_cost is not null and p_rider_cost < 0 then
    raise exception 'Rider cost cannot be negative.';
  end if;

  select *
  into v_order
  from public.orders o
  where o.id = p_order_id
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

  if v_from_status <> 'confirmed' then
    raise exception 'Invalid status transition from % to dispatched.', v_from_status;
  end if;

  if p_rider_id is not null then
    select *
    into v_rider
    from public.riders r
    where r.id = p_rider_id;

    if not found then
      raise exception 'Rider not found.';
    end if;

    if not v_rider.active then
      raise exception 'Selected rider is inactive.';
    end if;

    v_has_rider := true;
    v_cost := case
      when p_rider_cost is not null then round(p_rider_cost::numeric, 2)::numeric(12,2)
      else public.resolve_rider_cost_for_zone(
        v_rider.default_cost,
        v_rider.zone_costs,
        v_order.delivery_zone_id
      )
    end;
  elsif p_rider_cost is not null then
    v_cost := round(p_rider_cost::numeric, 2)::numeric(12,2);
  end if;

  update public.orders o
  set
    status        = 'dispatched',
    order_status  = 'OUT_FOR_DELIVERY'::public.order_status,
    rider_id      = case when v_has_rider then v_rider.id else o.rider_id end,
    rider_name    = case when v_has_rider then v_rider.name else o.rider_name end,
    rider_phone   = case when v_has_rider then v_rider.phone else o.rider_phone end,
    rider_cost    = case when v_cost is not null then v_cost else o.rider_cost end,
    dispatched_at = coalesce(o.dispatched_at, v_now)
  where o.id = p_order_id
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
    'dispatched',
    v_actor,
    coalesce(
      v_clean_reason,
      case
        when v_has_rider then
          'Dispatched with ' || v_rider.name || ' (' || v_rider.phone || ') — rider cost KES ' || to_char(v_cost, 'FM999999990.00')
        when v_cost is not null then
          'Dispatched — delivery cost KES ' || to_char(v_cost, 'FM999999990.00')
        else null
      end
    )
  );

  return v_updated;
end;
$$;

revoke all on function public.dispatch_order(uuid, uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.dispatch_order(uuid, uuid, numeric, text, text) to service_role;

-- ─── 6. RPC: assign_order_rider(...) ─────────────────────
-- Assigns or updates the rider and/or rider_cost on a non-cancelled order.
create or replace function public.assign_order_rider(
  p_order_id   uuid,
  p_rider_id   uuid    default null,
  p_rider_cost numeric default null,
  p_changed_by text    default 'admin'
)
returns public.orders
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_order     public.orders%rowtype;
  v_rider     public.riders%rowtype;
  v_status    text;
  v_cost      numeric(12,2) := null;
  v_updated   public.orders%rowtype;
begin
  if p_rider_cost is not null and p_rider_cost < 0 then
    raise exception 'Rider cost cannot be negative.';
  end if;

  select *
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

  v_status := coalesce(v_order.status, 'pending');
  if v_status = 'cancelled' then
    raise exception 'Cannot assign a rider to a cancelled order.';
  end if;

  if p_rider_id is not null then
    select *
    into v_rider
    from public.riders r
    where r.id = p_rider_id;

    if not found then
      raise exception 'Rider not found.';
    end if;

    -- Allow updating cost for the already-assigned rider even if later deactivated
    if not v_rider.active and v_order.rider_id is distinct from v_rider.id then
      raise exception 'Selected rider is inactive.';
    end if;

    v_cost := case
      when p_rider_cost is not null then round(p_rider_cost::numeric, 2)::numeric(12,2)
      else public.resolve_rider_cost_for_zone(
        v_rider.default_cost,
        v_rider.zone_costs,
        v_order.delivery_zone_id
      )
    end;

    update public.orders o
    set
      rider_id    = v_rider.id,
      rider_name  = v_rider.name,
      rider_phone = v_rider.phone,
      rider_cost  = v_cost
    where o.id = p_order_id
    returning *
    into v_updated;
  else
    -- Clear rider assignment, optionally keeping an external courier delivery cost
    v_cost := case
      when p_rider_cost is not null then round(p_rider_cost::numeric, 2)::numeric(12,2)
      else null
    end;

    update public.orders o
    set
      rider_id    = null,
      rider_name  = null,
      rider_phone = null,
      rider_cost  = v_cost
    where o.id = p_order_id
    returning *
    into v_updated;
  end if;

  return v_updated;
end;
$$;

revoke all on function public.assign_order_rider(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.assign_order_rider(uuid, uuid, numeric, text) to service_role;

