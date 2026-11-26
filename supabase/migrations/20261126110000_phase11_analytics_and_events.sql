-- =========================================================
-- Phase 11: Analytics Dashboard & Privacy-Friendly Events
-- - products.low_stock_threshold (per-product override, fallback to store_settings.low_stock_default)
-- - public.events table (privacy-friendly: no names, phones, or IP addresses)
-- - public.get_analytics_dashboard(p_from, p_to, p_include_owner_metrics)
--   Computes ALL KPIs, previous-period deltas, EAT-bucketed charts,
--   funnel, heatmap, inventory trackers, and Needs Attention in Postgres.
-- =========================================================

-- ─── 1. PER-PRODUCT LOW STOCK THRESHOLD ──────────────────
alter table public.products
  add column if not exists low_stock_threshold integer
    check (low_stock_threshold is null or low_stock_threshold >= 0);

-- ─── 2. PRIVACY-FRIENDLY EVENTS TABLE ────────────────────
create table if not exists public.events (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null check (
                           name in (
                             'product_view',
                             'add_to_bag',
                             'begin_checkout',
                             'whatsapp_order_sent',
                             'whatsapp_product_question'
                           )
                         ),
  product_id uuid        references public.products(id) on delete set null,
  session_id text        not null check (char_length(session_id) between 8 and 80),
  path       text        not null check (char_length(path) between 1 and 300),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists events_created_at_idx
  on public.events (created_at desc);

create index if not exists events_name_created_at_idx
  on public.events (name, created_at desc);

create index if not exists events_product_created_at_idx
  on public.events (product_id, created_at desc)
  where product_id is not null;

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;

-- ─── 3. HELPER: compute_period_kpis(...) ─────────────────
-- Computes all KPI metrics for an exact EAT date window [p_from, p_to] inclusive.
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
  v_aov                      numeric(14,2) := 0;
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
  -- Core order counts, booked revenue, AOV, discounts
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
      avg(o.total) filter (where coalesce(o.status, 'pending') <> 'cancelled'),
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
    v_aov,
    v_discounts_given
  from public.orders o
  where o.created_at >= v_from_ts
    and o.created_at < v_to_ts;

  -- Collected revenue (delivered & returned orders in period, minus returns) & delivery margin
  with delivered_orders as (
    select o.id, o.total, o.shipping_fee, coalesce(o.rider_cost, 0) as rider_cost
    from public.orders o
    where o.created_at >= v_from_ts
      and o.created_at < v_to_ts
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

  -- Confirmation, cancellation, and return rates
  select count(*)::integer
  into v_confirmed_reached_count
  from public.orders o
  where o.created_at >= v_from_ts
    and o.created_at < v_to_ts
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

  -- Average hours to confirm and average hours to deliver (from order_status_history)
  with history_bounds as (
    select
      h.order_id,
      min(h.created_at) filter (where h.to_status = 'confirmed') as confirmed_at,
      min(h.created_at) filter (where h.to_status = 'delivered') as delivered_at
    from public.order_status_history h
    join public.orders o on o.id = h.order_id
    where o.created_at >= v_from_ts
      and o.created_at < v_to_ts
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
    and o.created_at < v_to_ts;

  -- New vs returning customers (based on first non-cancelled order timestamp)
  with period_customers as (
    select distinct coalesce(o.customer_id::text, o.customer_phone) as cust_key
    from public.orders o
    where o.created_at >= v_from_ts
      and o.created_at < v_to_ts
      and coalesce(o.status, 'pending') <> 'cancelled'
  ),
  first_orders as (
    select
      coalesce(o.customer_id::text, o.customer_phone) as cust_key,
      min(o.created_at) as first_order_at
    from public.orders o
    where coalesce(o.status, 'pending') <> 'cancelled'
    group by 1
  )
  select
    count(*) filter (where fo.first_order_at >= v_from_ts and fo.first_order_at < v_to_ts)::integer,
    count(*) filter (where fo.first_order_at < v_from_ts)::integer
  into v_new_customers, v_returning_customers
  from period_customers pc
  join first_orders fo on fo.cust_key = pc.cust_key;

  -- Revenue by discount code
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
      and coalesce(o.status, 'pending') <> 'cancelled'
      and o.discount_code is not null
      and btrim(o.discount_code) <> ''
    group by 1
  ) t;

  -- Owner-only gross profit & margin from product/variant cost_price
  if p_include_owner_metrics then
    with eligible_orders as (
      select o.id, o.subtotal, coalesce(o.discount_amount, 0) as discount_amount
      from public.orders o
      where o.created_at >= v_from_ts
        and o.created_at < v_to_ts
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

-- ─── 4. MAIN RPC: get_analytics_dashboard(...) ───────────
create or replace function public.get_analytics_dashboard(
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

  -- 1. Revenue and orders over time (EAT daily <= 31d, weekly > 31d)
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

  -- 2. Conversion funnel
  with ev as (
    select
      count(*) filter (where e.name = 'product_view')::integer as product_views,
      count(*) filter (where e.name = 'add_to_bag')::integer as add_to_bag,
      count(*) filter (where e.name = 'begin_checkout')::integer as begin_checkout,
      count(*) filter (where e.name = 'whatsapp_order_sent')::integer as whatsapp_order_sent,
      count(*) filter (where e.name = 'whatsapp_product_question')::integer as whatsapp_questions
    from public.events e
    where e.created_at >= v_from_ts
      and e.created_at < v_to_ts
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
  )
  select jsonb_build_object(
    'product_views', ev.product_views,
    'add_to_bag', ev.add_to_bag,
    'begin_checkout', ev.begin_checkout,
    'whatsapp_order_sent', greatest(ev.whatsapp_order_sent, ord.orders_created),
    'confirmed', ord.confirmed,
    'delivered', ord.delivered,
    'whatsapp_questions', ev.whatsapp_questions
  )
  into v_funnel
  from ev cross join ord;

  -- 3. Top 10 products by units, revenue, and owner-only profit
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

  -- 4. Sales by category
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

  -- 5. Orders & revenue by delivery zone
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

  -- 6. Busiest times heatmap (day of week 0=Mon..6=Sun x hour 0..23 EAT)
  with heat as (
    select
      (extract(isodow from (o.created_at at time zone 'Africa/Nairobi'))::integer - 1) as dow,
      extract(hour from (o.created_at at time zone 'Africa/Nairobi'))::integer as hour,
      count(*)::integer as orders,
      coalesce(sum(o.total), 0)::numeric(14,2) as revenue
    from public.orders o
    where o.created_at >= v_from_ts
      and o.created_at < v_to_ts
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

  -- 7. Cancellations by reason
  with cancel_agg as (
    select
      coalesce(o.cancel_reason::text, 'unspecified') as reason,
      count(*)::integer as count,
      coalesce(sum(o.total), 0)::numeric(14,2) as lost_value
    from public.orders o
    where o.created_at >= v_from_ts
      and o.created_at < v_to_ts
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

  -- 8. Order status breakdown
  with st_agg as (
    select
      coalesce(o.status, 'pending') as status,
      count(*)::integer as count,
      coalesce(sum(o.total), 0)::numeric(14,2) as total
    from public.orders o
    where o.created_at >= v_from_ts
      and o.created_at < v_to_ts
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

  -- 9. Inventory trackers
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

  -- 10. Needs Attention box (live operational queue)
  if to_regclass('public.reviews') is not null then
    execute 'select count(*)::integer from public.reviews where status = ''pending'''
    into v_pending_reviews;
  end if;

  select jsonb_build_object(
    'pending_over_24h_count', (
      select count(*)::integer
      from public.orders o
      where coalesce(o.status, 'pending') = 'pending'
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
        where coalesce(o.status, 'pending') = 'pending'
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
      where coalesce(o.status, 'pending') = 'dispatched'
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
        where coalesce(o.status, 'pending') = 'dispatched'
          and coalesce(o.dispatched_at, o.created_at) <= (timezone('utc', now()) - interval '3 days')
        order by coalesce(o.dispatched_at, o.created_at) asc
        limit 5
      ) t
    ), '[]'::jsonb),
    'unpaid_delivered_invoices_count', (
      select count(*)::integer
      from public.invoices i
      join public.orders o on o.id = i.order_id
      where i.status in ('unpaid', 'partially_paid')
        and coalesce(o.status, 'pending') in ('delivered', 'returned')
    ),
    'unpaid_delivered_invoices_total', (
      select coalesce(sum(greatest(0, i.total - i.credited_amount - i.amount_paid)), 0)::numeric(14,2)
      from public.invoices i
      join public.orders o on o.id = i.order_id
      where i.status in ('unpaid', 'partially_paid')
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
        where i.status in ('unpaid', 'partially_paid')
          and coalesce(o.status, 'pending') in ('delivered', 'returned')
        order by i.issued_at asc
        limit 5
      ) t
    ), '[]'::jsonb),
    'reviews_pending_moderation_count', v_pending_reviews
  )
  into v_needs_attention;

  -- 11. Latest 8 orders for dashboard quick glance
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

revoke all on function public.get_analytics_dashboard(date, date, boolean) from public, anon, authenticated;
grant execute on function public.get_analytics_dashboard(date, date, boolean) to service_role;

