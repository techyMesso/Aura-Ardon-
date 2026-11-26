-- =========================================================
-- Phase 12: Real Verified Reviews Only
-- - public.reviews table (verified delivered order_id + product_id)
-- - review-photos public storage bucket (5MB, JPEG/PNG/WebP)
-- - submit_verified_review(...) RPC enforcing delivered order + phone + product match
-- - NO seeded or fake reviews
-- =========================================================

-- ─── 1. TABLE: reviews ───────────────────────────────────
create table if not exists public.reviews (
  id              uuid        primary key default gen_random_uuid(),
  product_id      uuid        not null references public.products(id) on delete cascade,
  order_id        uuid        not null references public.orders(id) on delete restrict,
  order_number    text        not null,
  customer_name   text        not null check (char_length(btrim(customer_name)) > 0),
  customer_phone  text        not null check (char_length(btrim(customer_phone)) > 0),
  rating          smallint    not null check (rating between 1 and 5),
  comment         text        not null check (char_length(btrim(comment)) between 5 and 1500),
  photo_url       text,
  status          text        not null default 'pending'
                              check (status in ('pending', 'approved', 'rejected')),
  moderated_by    text,
  moderated_at    timestamptz,
  moderation_note text,
  created_at      timestamptz not null default timezone('utc', now()),
  updated_at      timestamptz not null default timezone('utc', now()),
  unique (order_id, product_id)
);

create index if not exists reviews_product_status_idx
  on public.reviews (product_id, status, created_at desc);

create index if not exists reviews_status_created_at_idx
  on public.reviews (status, created_at desc);

create index if not exists reviews_order_id_idx
  on public.reviews (order_id);

alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;

create or replace function public.set_reviews_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke all on function public.set_reviews_updated_at() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'reviews_set_updated_at'
  ) then
    create trigger reviews_set_updated_at
      before update on public.reviews
      for each row
      execute function public.set_reviews_updated_at();
  end if;
end
$$;

-- ─── 2. STORAGE BUCKET: review-photos ────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'review-photos',
  'review-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ─── 3. RPC: submit_verified_review(...) ─────────────────
-- Strictly enforces:
-- 1. Valid order_number + customer_phone match
-- 2. Order status MUST be 'delivered'
-- 3. Product MUST be an item in that delivered order
-- 4. One review per (order_id, product_id)
-- 5. Always starts as status = 'pending' for admin moderation
create or replace function public.submit_verified_review(
  p_order_number text,
  p_phone        text,
  p_product_id   uuid,
  p_rating       smallint,
  p_comment      text,
  p_photo_url    text default null
)
returns public.reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order         public.orders%rowtype;
  v_clean_number  text := upper(btrim(coalesce(p_order_number, '')));
  v_clean_phone   text := btrim(coalesce(p_phone, ''));
  v_clean_comment text := btrim(coalesce(p_comment, ''));
  v_clean_photo   text := nullif(btrim(coalesce(p_photo_url, '')), '');
  v_status        text;
  v_created       public.reviews%rowtype;
begin
  if v_clean_number = '' or v_clean_phone = '' then
    raise exception 'Order number and phone number are required.';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5 stars.';
  end if;

  if char_length(v_clean_comment) < 5 or char_length(v_clean_comment) > 1500 then
    raise exception 'Review comment must be between 5 and 1500 characters.';
  end if;

  select *
  into v_order
  from public.orders o
  where upper(btrim(coalesce(o.order_number, ''))) = v_clean_number
    and btrim(o.customer_phone) = v_clean_phone
  limit 1;

  if not found then
    raise exception 'No order found matching that order number and phone number.';
  end if;

  v_status := coalesce(
    v_order.status,
    case v_order.order_status
      when 'DELIVERED' then 'delivered'
      else 'pending'
    end
  );

  if v_status <> 'delivered' then
    raise exception 'Only delivered orders can be reviewed.';
  end if;

  if not exists (
    select 1
    from public.order_items oi
    where oi.order_id = v_order.id
      and oi.product_id = p_product_id
  ) then
    raise exception 'That product was not part of this order.';
  end if;

  if exists (
    select 1
    from public.reviews r
    where r.order_id = v_order.id
      and r.product_id = p_product_id
  ) then
    raise exception 'You have already submitted a review for this item on this order.';
  end if;

  insert into public.reviews (
    product_id,
    order_id,
    order_number,
    customer_name,
    customer_phone,
    rating,
    comment,
    photo_url,
    status
  )
  values (
    p_product_id,
    v_order.id,
    coalesce(v_order.order_number, v_clean_number),
    v_order.customer_name,
    v_order.customer_phone,
    p_rating,
    v_clean_comment,
    v_clean_photo,
    'pending'
  )
  returning *
  into v_created;

  return v_created;
end;
$$;

revoke all on function public.submit_verified_review(text, text, uuid, smallint, text, text) from public, anon, authenticated;
grant execute on function public.submit_verified_review(text, text, uuid, smallint, text, text) to service_role;

