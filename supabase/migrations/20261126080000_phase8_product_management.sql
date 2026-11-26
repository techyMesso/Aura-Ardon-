-- =========================================================
-- Phase 8: Product Management
--   1. Product status (draft / active / archived) + prevent deleting ordered products
--   2. Optional product_variants (SKU, price_override, cost_price, ledger stock, image)
--   3. Owner-only cost_price protected at Postgres column-privilege level
--   4. Required image alt texts (image_alts)
--   5. Slug change 301 redirects table + automatic triggers
--   6. Featured & "New in" homepage pinning & display order
--   7. Back-in-stock WhatsApp alert waitlist
--   8. Categories active flag + slug redirects
-- =========================================================

-- ─── 1. PRODUCTS: STATUS, COST PRICE, IMAGE ALTS, PINNING ─

alter table public.products
  add column if not exists status         text          not null default 'active'
    check (status in ('draft', 'active', 'archived')),
  add column if not exists cost_price     numeric(12,2)
    check (cost_price is null or cost_price >= 0),
  add column if not exists image_alts     text[]        not null default '{}',
  add column if not exists featured_order integer       not null default 0,
  add column if not exists is_new_in      boolean       not null default false,
  add column if not exists new_in_order   integer       not null default 0;

-- Backfill status from legacy active boolean
update public.products
set status = case when active then 'active' else 'draft' end
where (active = false and status = 'active');

-- Backfill missing image_alts from product titles so existing catalog images remain valid
update public.products p
set image_alts = (
  select coalesce(
    array_agg(
      case
        when idx = 1 then p.title || ' — Auro Ardon Nairobi'
        else p.title || ' — photo ' || idx
      end
      order by idx
    ),
    '{}'::text[]
  )
  from generate_subscripts(p.images, 1) as idx
)
where coalesce(array_length(p.images, 1), 0) > 0
  and coalesce(array_length(p.image_alts, 1), 0) < coalesce(array_length(p.images, 1), 0);

create index if not exists products_status_created_at_idx
  on public.products (status, created_at desc);

create index if not exists products_featured_order_idx
  on public.products (featured_order asc, created_at desc)
  where is_featured = true and status = 'active';

create index if not exists products_new_in_order_idx
  on public.products (new_in_order asc, created_at desc)
  where is_new_in = true and status = 'active';

-- Keep products.status and legacy products.active synchronized
create or replace function public.sync_product_status_active()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status is null then
      new.status := case when coalesce(new.active, true) then 'active' else 'draft' end;
    elsif new.status = 'active' and new.active = false then
      -- Legacy caller inserted active = false without specifying status
      new.status := 'draft';
    end if;
    new.active := (new.status = 'active');
  else
    if new.status is distinct from old.status then
      new.active := (new.status = 'active');
    elsif new.active is distinct from old.active then
      new.status := case
        when new.active then 'active'
        when old.status = 'archived' then 'archived'
        else 'draft'
      end;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_product_status_active() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'products_sync_status_active'
  ) then
    create trigger products_sync_status_active
      before insert or update on public.products
      for each row
      execute function public.sync_product_status_active();
  end if;
end
$$;

-- Never hard-delete a product that has orders; archive it instead
create or replace function public.prevent_ordered_product_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.order_items oi
    where oi.product_id = old.id
  ) then
    raise exception 'Product has existing orders and cannot be deleted. Archive it instead.';
  end if;
  return old;
end;
$$;

revoke all on function public.prevent_ordered_product_delete() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'products_prevent_ordered_delete'
  ) then
    create trigger products_prevent_ordered_delete
      before delete on public.products
      for each row
      execute function public.prevent_ordered_product_delete();
  end if;
end
$$;

-- Tighten public RLS policy on products to require status = 'active'
alter policy "Public can view active products"
  on public.products
  using (status = 'active' and active = true);

-- Strictly isolate cost_price: anon and authenticated roles NEVER have SELECT on cost_price
revoke select on public.products from anon, authenticated;
grant select (
  id,
  title,
  slug,
  description,
  category,
  category_id,
  price,
  compare_at_price,
  stock_quantity,
  material,
  finish,
  size_label,
  water_resistance,
  warranty,
  ingredients,
  net_weight,
  expiry_info,
  in_the_box,
  care,
  images,
  image_alts,
  blur_data_url,
  is_featured,
  featured_order,
  is_new_in,
  new_in_order,
  active,
  status,
  search_tsv,
  created_at
) on public.products to anon, authenticated;

-- ─── 2. CATEGORIES: ACTIVE FLAG ──────────────────────────

alter table public.categories
  add column if not exists active boolean not null default true;

create index if not exists categories_active_display_order_idx
  on public.categories (active, display_order asc, name asc);

alter policy "Public can view categories"
  on public.categories
  using (active = true);

-- ─── 3. TABLE: product_variants ──────────────────────────

create table if not exists public.product_variants (
  id               uuid          primary key default gen_random_uuid(),
  product_id       uuid          not null references public.products(id) on delete cascade,
  name             text          not null,
  option_values    jsonb         not null default '{}'::jsonb,
  sku              text          not null,
  price_override   numeric(12,2) check (price_override is null or price_override > 0),
  compare_at_price numeric(12,2) check (compare_at_price is null or compare_at_price > 0),
  cost_price       numeric(12,2) check (cost_price is null or cost_price >= 0),
  stock_quantity   integer       not null default 0 check (stock_quantity >= 0),
  image_url        text,
  image_alt        text,
  sort_order       integer       not null default 0,
  active           boolean       not null default true,
  created_at       timestamptz   not null default timezone('utc', now()),
  updated_at       timestamptz   not null default timezone('utc', now())
);

create index if not exists product_variants_product_id_sort_idx
  on public.product_variants (product_id, sort_order asc, created_at asc);

create unique index if not exists product_variants_sku_lower_uidx
  on public.product_variants (lower(btrim(sku)));

alter table public.product_variants enable row level security;
revoke all on public.product_variants from anon, authenticated;

-- Public/authenticated SELECT excludes cost_price strictly
grant select (
  id,
  product_id,
  name,
  option_values,
  sku,
  price_override,
  compare_at_price,
  stock_quantity,
  image_url,
  image_alt,
  sort_order,
  active,
  created_at,
  updated_at
) on public.product_variants to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'product_variants'
      and policyname = 'Public can view active variants of active products'
  ) then
    create policy "Public can view active variants of active products"
      on public.product_variants
      for select
      to anon, authenticated
      using (
        active = true
        and exists (
          select 1
          from public.products p
          where p.id = product_variants.product_id
            and p.status = 'active'
            and p.active = true
        )
      );
  end if;
end
$$;

-- Touch updated_at on product_variants
create or replace function public.touch_product_variants_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke all on function public.touch_product_variants_updated_at() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'product_variants_touch_updated_at'
  ) then
    create trigger product_variants_touch_updated_at
      before update on public.product_variants
      for each row
      execute function public.touch_product_variants_updated_at();
  end if;
end
$$;

-- Link order_items and stock_movements to product_variants
alter table public.order_items
  add column if not exists variant_id   uuid references public.product_variants(id) on delete set null,
  add column if not exists variant_name text,
  add column if not exists variant_sku  text;

create index if not exists order_items_variant_id_idx
  on public.order_items (variant_id)
  where variant_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stock_movements_variant_id_fkey'
      and conrelid = 'public.stock_movements'::regclass
  ) then
    alter table public.stock_movements
      add constraint stock_movements_variant_id_fkey
      foreign key (variant_id)
      references public.product_variants(id)
      on delete set null;
  end if;
end
$$;

-- Prevent hard-deleting a variant referenced by orders
create or replace function public.prevent_ordered_variant_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.order_items oi
    where oi.variant_id = old.id
  ) then
    raise exception 'Variant has existing orders and cannot be deleted. Deactivate it instead.';
  end if;
  return old;
end;
$$;

revoke all on function public.prevent_ordered_variant_delete() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'product_variants_prevent_ordered_delete'
  ) then
    create trigger product_variants_prevent_ordered_delete
      before delete on public.product_variants
      for each row
      execute function public.prevent_ordered_variant_delete();
  end if;
end
$$;

-- Helper: sync aggregate products.stock_quantity from active variants when a product has variants
create or replace function public.sync_product_variant_stock(
  p_product_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_variants boolean;
  v_total_stock  integer;
begin
  select exists (
    select 1 from public.product_variants pv where pv.product_id = p_product_id
  )
  into v_has_variants;

  if not v_has_variants then
    select coalesce(p.stock_quantity, 0)
    into v_total_stock
    from public.products p
    where p.id = p_product_id;
    return coalesce(v_total_stock, 0);
  end if;

  select coalesce(sum(pv.stock_quantity), 0)::integer
  into v_total_stock
  from public.product_variants pv
  where pv.product_id = p_product_id
    and pv.active = true;

  update public.products p
  set stock_quantity = v_total_stock
  where p.id = p_product_id;

  return v_total_stock;
end;
$$;

revoke all on function public.sync_product_variant_stock(uuid) from public, anon, authenticated;
grant execute on function public.sync_product_variant_stock(uuid) to service_role;

-- Log initial_stock ledger entry whenever a new variant is created & sync product total
create or replace function public.log_variant_initial_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.stock_movements sm where sm.variant_id = new.id
  ) then
    insert into public.stock_movements (
      product_id,
      variant_id,
      change,
      type,
      note,
      created_by
    )
    values (
      new.product_id,
      new.id,
      coalesce(new.stock_quantity, 0),
      'initial_stock',
      'Initial stock for variant: ' || new.name,
      'admin'
    );
  end if;

  perform public.sync_product_variant_stock(new.product_id);
  return new;
end;
$$;

revoke all on function public.log_variant_initial_stock() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'product_variants_log_initial_stock'
  ) then
    create trigger product_variants_log_initial_stock
      after insert on public.product_variants
      for each row
      execute function public.log_variant_initial_stock();
  end if;
end
$$;

-- Sync product stock when variant active status changes or variant is removed
create or replace function public.sync_product_stock_on_variant_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pid uuid;
begin
  v_pid := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
  perform public.sync_product_variant_stock(v_pid);
  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_product_stock_on_variant_change() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'product_variants_sync_parent_stock'
  ) then
    create trigger product_variants_sync_parent_stock
      after update of active, stock_quantity or delete on public.product_variants
      for each row
      execute function public.sync_product_stock_on_variant_change();
  end if;
end
$$;

-- ─── 4. TABLE: redirects + SLUG CHANGE TRIGGERS ──────────

create table if not exists public.redirects (
  id          uuid        primary key default gen_random_uuid(),
  from_path   text        not null,
  to_path     text        not null,
  status_code integer     not null default 301 check (status_code in (301, 302, 307, 308)),
  entity_type text        not null default 'product' check (entity_type in ('product', 'category', 'custom')),
  entity_id   uuid,
  active      boolean     not null default true,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now()),
  check (lower(btrim(from_path)) <> lower(btrim(to_path)))
);

create unique index if not exists redirects_from_path_lower_uidx
  on public.redirects (lower(from_path));

create index if not exists redirects_entity_idx
  on public.redirects (entity_type, entity_id)
  where entity_id is not null;

alter table public.redirects enable row level security;
revoke all on public.redirects from anon, authenticated;
grant select on public.redirects to anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'redirects'
      and policyname = 'Public can read redirects'
  ) then
    create policy "Public can read redirects"
      on public.redirects
      for select
      to anon, authenticated
      using (active = true);
  end if;
end
$$;

create or replace function public.upsert_slug_redirect(
  p_old_path    text,
  p_new_path    text,
  p_entity_type text,
  p_entity_id   uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text := lower(btrim(coalesce(p_old_path, '')));
  v_new text := lower(btrim(coalesce(p_new_path, '')));
begin
  if v_old = '' or v_new = '' or v_old = v_new then
    return;
  end if;

  -- Deactivate any stale redirect whose from_path equals the newly reclaimed path
  update public.redirects r
  set
    active = false,
    updated_at = timezone('utc', now())
  where lower(r.from_path) = v_new
    and r.active = true;

  -- Collapse chains: any earlier active redirect pointing to v_old now points directly to v_new
  update public.redirects r
  set
    to_path = v_new,
    updated_at = timezone('utc', now())
  where lower(r.to_path) = v_old
    and lower(r.from_path) <> v_new
    and r.active = true;

  -- Insert or update the redirect from v_old -> v_new
  insert into public.redirects (
    from_path,
    to_path,
    status_code,
    entity_type,
    entity_id,
    active
  )
  values (
    v_old,
    v_new,
    301,
    p_entity_type,
    p_entity_id,
    true
  )
  on conflict (lower(from_path)) do update
  set
    to_path = excluded.to_path,
    status_code = 301,
    entity_type = excluded.entity_type,
    entity_id = excluded.entity_id,
    active = true,
    updated_at = timezone('utc', now());
end;
$$;

revoke all on function public.upsert_slug_redirect(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.upsert_slug_redirect(text, text, text, uuid) to service_role;

create or replace function public.record_product_slug_redirect()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.slug is not null
     and new.slug is not null
     and lower(btrim(old.slug)) <> lower(btrim(new.slug)) then
    perform public.upsert_slug_redirect(
      '/p/' || lower(btrim(old.slug)),
      '/p/' || lower(btrim(new.slug)),
      'product',
      new.id
    );
  end if;
  return new;
end;
$$;

revoke all on function public.record_product_slug_redirect() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'products_record_slug_redirect'
  ) then
    create trigger products_record_slug_redirect
      after update of slug on public.products
      for each row
      execute function public.record_product_slug_redirect();
  end if;
end
$$;

create or replace function public.record_category_slug_redirect()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.slug is not null
     and new.slug is not null
     and lower(btrim(old.slug)) <> lower(btrim(new.slug)) then
    perform public.upsert_slug_redirect(
      '/shop/' || lower(btrim(old.slug)),
      '/shop/' || lower(btrim(new.slug)),
      'category',
      new.id
    );
  end if;
  return new;
end;
$$;

revoke all on function public.record_category_slug_redirect() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'categories_record_slug_redirect'
  ) then
    create trigger categories_record_slug_redirect
      after update of slug on public.categories
      for each row
      execute function public.record_category_slug_redirect();
  end if;
end
$$;

-- ─── 5. TABLE: back_in_stock_alerts ──────────────────────

create table if not exists public.back_in_stock_alerts (
  id            uuid        primary key default gen_random_uuid(),
  product_id    uuid        not null references public.products(id) on delete cascade,
  variant_id    uuid        references public.product_variants(id) on delete cascade,
  phone         text        not null,
  customer_name text,
  status        text        not null default 'waiting' check (status in ('waiting', 'notified', 'cancelled')),
  notified_at   timestamptz,
  notified_by   text,
  created_at    timestamptz not null default timezone('utc', now())
);

create unique index if not exists back_in_stock_alerts_waiting_uidx
  on public.back_in_stock_alerts (
    product_id,
    coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    phone
  )
  where status = 'waiting';

create index if not exists back_in_stock_alerts_product_status_idx
  on public.back_in_stock_alerts (product_id, status, created_at asc);

create index if not exists back_in_stock_alerts_status_created_idx
  on public.back_in_stock_alerts (status, created_at desc);

alter table public.back_in_stock_alerts enable row level security;
revoke all on public.back_in_stock_alerts from anon, authenticated;

-- ─── 6. STOCK LEDGER RPCs FOR PRODUCTS & VARIANTS ────────

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
  from public.products p
  where p.id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found.';
  end if;

  if exists (
    select 1 from public.product_variants pv where pv.product_id = p_product_id
  ) then
    raise exception 'This product uses variants. Adjust stock on the individual variant instead.';
  end if;

  v_next_stock := v_product.stock_quantity + p_change;
  if v_next_stock < 0 then
    raise exception 'Stock cannot drop below zero (current stock: %).', v_product.stock_quantity;
  end if;

  update public.products p
  set stock_quantity = v_next_stock
  where p.id = p_product_id;

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
    p_product_id,
    null,
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

create or replace function public.adjust_variant_stock(
  p_variant_id uuid,
  p_change     integer,
  p_note       text,
  p_changed_by text default 'admin',
  p_type       text default 'manual_adjustment'
)
returns table (
  variant_id             uuid,
  product_id             uuid,
  new_variant_stock      integer,
  new_product_stock      integer,
  movement_id            uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_actor        text := coalesce(nullif(btrim(coalesce(p_changed_by, '')), ''), 'admin');
  v_type         text := lower(btrim(coalesce(p_type, 'manual_adjustment')));
  v_variant      public.product_variants%rowtype;
  v_next_stock   integer;
  v_parent_stock integer;
  v_movement_id  uuid;
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
  into v_variant
  from public.product_variants pv
  where pv.id = p_variant_id
  for update;

  if not found then
    raise exception 'Variant not found.';
  end if;

  v_next_stock := v_variant.stock_quantity + p_change;
  if v_next_stock < 0 then
    raise exception 'Variant stock cannot drop below zero (current stock: %).', v_variant.stock_quantity;
  end if;

  update public.product_variants pv
  set stock_quantity = v_next_stock
  where pv.id = p_variant_id;

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
    v_variant.product_id,
    v_variant.id,
    null,
    p_change,
    v_type,
    '[' || v_variant.name || '] ' || v_clean_note,
    v_actor
  )
  returning id
  into v_movement_id;

  v_parent_stock := public.sync_product_variant_stock(v_variant.product_id);

  return query
  select
    v_variant.id,
    v_variant.product_id,
    v_next_stock,
    v_parent_stock,
    v_movement_id;
end;
$$;

revoke all on function public.adjust_variant_stock(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.adjust_variant_stock(uuid, integer, text, text, text) to service_role;

-- Update check_stock_integrity() to audit both non-variant products and individual variants
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
  -- 1. Products without variants
  select
    p.id as product_id,
    p.title as product_title,
    p.stock_quantity as recorded_stock,
    coalesce(sum(sm.change), 0)::integer as ledger_sum,
    (p.stock_quantity - coalesce(sum(sm.change), 0))::integer as discrepancy
  from public.products p
  left join public.stock_movements sm
    on sm.product_id = p.id
   and sm.variant_id is null
  where not exists (
    select 1 from public.product_variants pv where pv.product_id = p.id
  )
  group by p.id, p.title, p.stock_quantity
  having p.stock_quantity <> coalesce(sum(sm.change), 0)

  union all

  -- 2. Individual product variants
  select
    pv.product_id as product_id,
    p.title || ' — ' || pv.name || ' (' || pv.sku || ')' as product_title,
    pv.stock_quantity as recorded_stock,
    coalesce(sum(sm.change), 0)::integer as ledger_sum,
    (pv.stock_quantity - coalesce(sum(sm.change), 0))::integer as discrepancy
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  left join public.stock_movements sm on sm.variant_id = pv.id
  group by pv.id, pv.product_id, p.title, pv.name, pv.sku, pv.stock_quantity
  having pv.stock_quantity <> coalesce(sum(sm.change), 0)

  order by product_title asc;
$$;

revoke all on function public.check_stock_integrity() from public, anon, authenticated;
grant execute on function public.check_stock_integrity() to service_role;

-- ─── 7. UPDATE place_order(...) FOR STATUS + VARIANTS ────

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

  -- Lock products and optional variants in deterministic order to prevent deadlocks & oversell
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

-- ─── 8. UPDATE cancel_order, return_order & issue_invoice_for_order ─

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
  v_invoice         public.invoices%rowtype;
  v_from_status     text;
  v_actor           text := coalesce(nullif(btrim(coalesce(p_changed_by, '')), ''), 'admin');
  v_clean_note      text := nullif(btrim(coalesce(p_note, '')), '');
  v_now             timestamptz := timezone('utc', now());
  v_item            record;
  v_restocked_units integer := 0;
  v_history_reason  text;
  v_order_code      text;
  v_uncredited      numeric(12,2);
begin
  if p_reason is null then
    raise exception 'A cancellation reason is required.';
  end if;

  select *
  into v_order
  from public.orders o
  where o.id = p_order_id
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

  if v_order.restocked_at is null then
    for v_item in
      select
        oi.product_id,
        oi.variant_id,
        sum(oi.quantity)::integer as total_qty
      from public.order_items oi
      where oi.order_id = p_order_id
        and oi.product_id is not null
        and oi.quantity > 0
      group by oi.product_id, oi.variant_id
      order by oi.product_id asc, oi.variant_id asc nulls first
    loop
      if v_item.variant_id is not null then
        perform 1
        from public.product_variants pv
        where pv.id = v_item.variant_id
        for update;

        if found then
          update public.product_variants pv
          set stock_quantity = pv.stock_quantity + v_item.total_qty
          where pv.id = v_item.variant_id;

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
            p_order_id,
            v_item.total_qty,
            'cancel_restock',
            'Cancelled order ' || v_order_code || ' (' || p_reason::text || ')' ||
              case when v_clean_note is not null then ': ' || v_clean_note else '' end,
            v_actor
          );

          perform public.sync_product_variant_stock(v_item.product_id);
          v_restocked_units := v_restocked_units + v_item.total_qty;
        end if;
      else
        perform 1
        from public.products p
        where p.id = v_item.product_id
        for update;

        if found then
          update public.products p
          set stock_quantity = p.stock_quantity + v_item.total_qty
          where p.id = v_item.product_id;

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
            p_order_id,
            v_item.total_qty,
            'cancel_restock',
            'Cancelled order ' || v_order_code || ' (' || p_reason::text || ')' ||
              case when v_clean_note is not null then ': ' || v_clean_note else '' end,
            v_actor
          );

          v_restocked_units := v_restocked_units + v_item.total_qty;
        end if;
      end if;
    end loop;
  end if;

  update public.orders o
  set
    status = 'cancelled',
    order_status = 'CANCELLED',
    cancel_reason = coalesce(o.cancel_reason, p_reason),
    cancel_note = coalesce(o.cancel_note, v_clean_note),
    cancelled_at = coalesce(o.cancelled_at, v_now),
    restocked_at = coalesce(o.restocked_at, v_now)
  where o.id = p_order_id;

  if v_from_status <> 'cancelled' then
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

    select *
    into v_invoice
    from public.invoices i
    where i.order_id = p_order_id
    for update;

    if found then
      v_uncredited := greatest(0, v_invoice.total - v_invoice.credited_amount)::numeric(12,2);
      if v_uncredited > 0 then
        perform public.issue_credit_note(
          v_invoice.id,
          'Order cancelled (' || p_reason::text || ')' ||
            case when v_clean_note is not null then ': ' || v_clean_note else '' end,
          v_invoice.lines_snapshot,
          v_uncredited,
          v_actor
        );
      end if;
    end if;
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
  v_invoice          public.invoices%rowtype;
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
  v_credit_lines     jsonb := '[]'::jsonb;
  v_uncredited       numeric(12,2);
begin
  if v_condition not in ('resellable', 'damaged') then
    raise exception 'Return condition must be resellable or damaged.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Select at least one item to return.';
  end if;

  select *
  into v_order
  from public.orders o
  where o.id = p_order_id
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
    v_credit_lines := v_credit_lines || jsonb_build_array(
      jsonb_build_object(
        'order_item_id', v_oi.id,
        'name', v_oi.product_title,
        'sku', v_oi.variant_sku,
        'qty', v_req.qty,
        'unit_price', v_oi.unit_price,
        'line_total', (v_oi.unit_price * v_req.qty)::numeric(12,2),
        'condition', v_condition
      )
    );

    if v_oi.variant_id is not null then
      perform 1
      from public.product_variants pv
      where pv.id = v_oi.variant_id
      for update;

      if found then
        if v_condition = 'resellable' then
          update public.product_variants pv
          set stock_quantity = pv.stock_quantity + v_req.qty
          where pv.id = v_oi.variant_id;

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
            v_oi.product_id,
            v_oi.variant_id,
            p_order_id,
            v_req.qty,
            'return_restock',
            'Returned (resellable) from order ' || v_order_code ||
              case when v_clean_note is not null then ': ' || v_clean_note else '' end,
            v_actor
          );

          perform public.sync_product_variant_stock(v_oi.product_id);
          v_restocked_units := v_restocked_units + v_req.qty;
        else
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
            v_oi.product_id,
            v_oi.variant_id,
            p_order_id,
            0,
            'damaged_writeoff',
            'Damaged return write-off (' || v_req.qty || ' unit(s) not restocked) from order ' || v_order_code ||
              case when v_clean_note is not null then ': ' || v_clean_note else '' end,
            v_actor
          );
        end if;
      end if;
    elsif v_oi.product_id is not null then
      perform 1
      from public.products p
      where p.id = v_oi.product_id
      for update;

      if found then
        if v_condition = 'resellable' then
          update public.products p
          set stock_quantity = p.stock_quantity + v_req.qty
          where p.id = v_oi.product_id;

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
            v_oi.product_id,
            null,
            p_order_id,
            v_req.qty,
            'return_restock',
            'Returned (resellable) from order ' || v_order_code ||
              case when v_clean_note is not null then ': ' || v_clean_note else '' end,
            v_actor
          );

          v_restocked_units := v_restocked_units + v_req.qty;
        else
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
            v_oi.product_id,
            null,
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

  update public.orders o
  set
    status = 'returned',
    returned_at = coalesce(o.returned_at, v_now)
  where o.id = p_order_id;

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

  select *
  into v_invoice
  from public.invoices i
  where i.order_id = p_order_id
  for update;

  if found and v_returned_amount > 0 then
    v_uncredited := greatest(0, v_invoice.total - v_invoice.credited_amount)::numeric(12,2);
    if v_uncredited > 0 then
      perform public.issue_credit_note(
        v_invoice.id,
        'Order return (' || v_condition || ')' ||
          case when v_clean_note is not null then ': ' || v_clean_note else '' end,
        v_credit_lines,
        least(v_returned_amount, v_uncredited),
        v_actor
      );
    end if;
  end if;

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

-- Update issue_invoice_for_order(...) to prefer variant_sku on invoice lines
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

  v_customer_snap := jsonb_build_object(
    'full_name', v_order.customer_name,
    'phone', v_order.customer_phone,
    'address', coalesce(v_order.delivery_address, v_order.customer_location),
    'delivery_zone_name', v_order.delivery_zone_name,
    'town_county', v_order.town_county,
    'location', v_order.customer_location,
    'order_number', coalesce(v_order.order_number, upper(left(v_order.id::text, 8))),
    'is_gift', coalesce(v_order.is_gift, false),
    'hide_prices', coalesce(v_order.hide_prices, false)
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

  v_inv_number := public.next_document_number('invoice');
  v_share_token := encode(gen_random_bytes(24), 'hex');

  insert into public.invoices (
    invoice_number,
    order_id,
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
