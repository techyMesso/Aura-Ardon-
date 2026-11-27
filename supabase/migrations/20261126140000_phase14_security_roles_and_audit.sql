-- =========================================================
-- Phase 14: Security, Roles (owner vs staff), RLS Hardening & Audit Log
-- - public.admin_users role registry (owner | staff)
-- - Role helper functions: current_admin_role(), is_owner(), is_staff_or_owner()
-- - Immutable public.audit_log table for all admin writes
-- - Full anon lockdown & role-enforced RLS policies across all tables
-- - Storage bucket hardening (product-images, review-photos, invoice-pdfs)
-- =========================================================

-- ─── 1. TABLE: admin_users (owner vs staff role registry) ──
create table if not exists public.admin_users (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  email       text        not null unique check (char_length(btrim(email)) > 3),
  full_name   text,
  role        text        not null check (role in ('owner', 'staff')),
  active      boolean     not null default true,
  created_by  text,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now())
);

create index if not exists admin_users_role_active_idx
  on public.admin_users (role, active);

create index if not exists admin_users_email_lower_idx
  on public.admin_users (lower(email));

alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

create or replace function public.set_admin_users_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke all on function public.set_admin_users_updated_at() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'admin_users_set_updated_at'
  ) then
    create trigger admin_users_set_updated_at
      before update on public.admin_users
      for each row
      execute function public.set_admin_users_updated_at();
  end if;
end
$$;

-- Backfill existing owner account if present in auth.users
insert into public.admin_users (user_id, email, full_name, role, active, created_by)
select
  u.id,
  lower(u.email),
  coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), 'Store Owner'),
  'owner',
  true,
  'phase14_migration'
from auth.users u
where lower(u.email) = 'aura.ardoncompany@gmail.com'
on conflict (user_id) do nothing;

-- ─── 2. ROLE HELPER FUNCTIONS FOR RLS ─────────────────────
-- Strictly reads public.admin_users or signed JWT app_metadata.role (never editable user_metadata).
create or replace function public.current_admin_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_db_role    text;
  v_jwt_role   text;
begin
  if v_uid is null then
    return null;
  end if;

  select au.role
  into v_db_role
  from public.admin_users au
  where au.user_id = v_uid
    and au.active = true
  limit 1;

  if v_db_role in ('owner', 'staff') then
    return v_db_role;
  end if;

  -- If user exists in admin_users as inactive, explicitly deny access even if JWT has old claim
  if exists (
    select 1 from public.admin_users au where au.user_id = v_uid and au.active = false
  ) then
    return null;
  end if;

  v_jwt_role := lower(coalesce(auth.jwt()->'app_metadata'->>'role', ''));
  if v_jwt_role in ('owner', 'staff') then
    return v_jwt_role;
  end if;

  return null;
end;
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_admin_role() = 'owner';
$$;

create or replace function public.is_staff_or_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_admin_role() in ('owner', 'staff');
$$;

revoke all on function public.current_admin_role() from public, anon;
revoke all on function public.is_owner() from public, anon;
revoke all on function public.is_staff_or_owner() from public, anon;

grant execute on function public.current_admin_role() to authenticated, service_role;
grant execute on function public.is_owner() to authenticated, service_role;
grant execute on function public.is_staff_or_owner() to authenticated, service_role;

-- ─── 3. TABLE: audit_log (append-only, owner-only) ────────
create table if not exists public.audit_log (
  id           uuid        primary key default gen_random_uuid(),
  actor_id     uuid,
  actor_email  text        not null check (char_length(btrim(actor_email)) > 0),
  actor_role   text        not null default 'owner'
                           check (actor_role in ('owner', 'staff', 'system')),
  action       text        not null check (char_length(btrim(action)) > 0),
  entity       text        not null check (char_length(btrim(entity)) > 0),
  entity_id    text,
  before_data  jsonb,
  after_data   jsonb,
  metadata     jsonb       not null default '{}'::jsonb,
  created_at   timestamptz not null default timezone('utc', now())
);

create index if not exists audit_log_created_at_idx
  on public.audit_log (created_at desc);

create index if not exists audit_log_entity_created_at_idx
  on public.audit_log (entity, created_at desc);

create index if not exists audit_log_actor_created_at_idx
  on public.audit_log (actor_email, created_at desc);

create index if not exists audit_log_action_created_at_idx
  on public.audit_log (action, created_at desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;

-- Immutability guard: audit logs can never be edited or deleted
create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Audit log entries are immutable and cannot be modified or removed.';
end;
$$;

revoke all on function public.prevent_audit_log_mutation() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'audit_log_immutable_guard'
  ) then
    create trigger audit_log_immutable_guard
      before update or delete on public.audit_log
      for each row
      execute function public.prevent_audit_log_mutation();
  end if;
end
$$;

-- ─── 4. HARDEN TABLE GRANTS (ZERO ANON ACCESS TO SENSITIVE TABLES) ──
-- Revoke ALL privileges from anon on every sensitive / operational table
revoke all on public.orders from anon;
revoke all on public.order_items from anon;
revoke all on public.order_status_history from anon;
revoke all on public.order_returns from anon;
revoke all on public.customers from anon;
revoke all on public.invoices from anon;
revoke all on public.payments from anon;
revoke all on public.credit_notes from anon;
revoke all on public.stock_movements from anon;
revoke all on public.events from anon;
revoke all on public.discount_codes from anon;
revoke all on public.discount_redemptions from anon;
revoke all on public.document_counters from anon;
revoke all on public.admin_push_subscriptions from anon;
revoke all on public.back_in_stock_alerts from anon;
revoke all on public.reviews from anon;
revoke all on public.riders from anon;
revoke all on public.audit_log from anon;
revoke all on public.admin_users from anon;

-- Strip excess DDL/write grants from anon on public catalog/config read tables
revoke insert, update, delete, truncate, references, trigger on public.products from anon;
revoke insert, update, delete, truncate, references, trigger on public.product_variants from anon;
revoke insert, update, delete, truncate, references, trigger on public.categories from anon;
revoke insert, update, delete, truncate, references, trigger on public.delivery_zones from anon;
revoke insert, update, delete, truncate, references, trigger on public.store_settings from anon;
revoke insert, update, delete, truncate, references, trigger on public.redirects from anon;

-- Ensure authenticated role has NO direct write privileges (writes go strictly through validated service_role server routes/RPCs)
revoke all on public.orders from authenticated;
revoke all on public.order_items from authenticated;
revoke all on public.order_status_history from authenticated;
revoke all on public.order_returns from authenticated;
revoke all on public.customers from authenticated;
revoke all on public.invoices from authenticated;
revoke all on public.payments from authenticated;
revoke all on public.credit_notes from authenticated;
revoke all on public.stock_movements from authenticated;
revoke all on public.events from authenticated;
revoke all on public.discount_codes from authenticated;
revoke all on public.discount_redemptions from authenticated;
revoke all on public.document_counters from authenticated;
revoke all on public.admin_push_subscriptions from authenticated;
revoke all on public.back_in_stock_alerts from authenticated;
revoke all on public.reviews from authenticated;
revoke all on public.riders from authenticated;
revoke all on public.audit_log from authenticated;
revoke all on public.admin_users from authenticated;

revoke insert, update, delete, truncate, references, trigger on public.products from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.product_variants from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.categories from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.delivery_zones from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.store_settings from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.redirects from authenticated;

-- ─── 5. ROLE-ENFORCED RLS POLICIES FOR AUTHENTICATED ──────
-- Owner-only SELECT grants + RLS policies (staff gets 0 rows)
grant select on public.admin_users to authenticated;
grant select on public.audit_log to authenticated;
grant select on public.discount_codes to authenticated;
grant select on public.discount_redemptions to authenticated;
grant select on public.events to authenticated;
grant select on public.admin_push_subscriptions to authenticated;

-- Staff + Owner operational SELECT grants + RLS policies
grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;
grant select on public.order_status_history to authenticated;
grant select on public.order_returns to authenticated;
grant select on public.customers to authenticated;
grant select on public.invoices to authenticated;
grant select on public.payments to authenticated;
grant select on public.credit_notes to authenticated;
grant select on public.stock_movements to authenticated;
grant select on public.riders to authenticated;
grant select on public.back_in_stock_alerts to authenticated;
grant select on public.reviews to authenticated;

do $$
begin
  -- Owner-only RLS SELECT policies
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_users' and policyname = 'Owner can view admin users') then
    create policy "Owner can view admin users" on public.admin_users for select to authenticated using ((select public.is_owner()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'Owner can view audit log') then
    create policy "Owner can view audit log" on public.audit_log for select to authenticated using ((select public.is_owner()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'discount_codes' and policyname = 'Owner can view discount codes') then
    create policy "Owner can view discount codes" on public.discount_codes for select to authenticated using ((select public.is_owner()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'discount_redemptions' and policyname = 'Owner can view discount redemptions') then
    create policy "Owner can view discount redemptions" on public.discount_redemptions for select to authenticated using ((select public.is_owner()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events' and policyname = 'Owner can view analytics events') then
    create policy "Owner can view analytics events" on public.events for select to authenticated using ((select public.is_owner()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_push_subscriptions' and policyname = 'Owner can view push subscriptions') then
    create policy "Owner can view push subscriptions" on public.admin_push_subscriptions for select to authenticated using ((select public.is_owner()));
  end if;

  -- Staff + Owner operational RLS SELECT policies
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'orders' and policyname = 'Staff and owner can view orders') then
    create policy "Staff and owner can view orders" on public.orders for select to authenticated using ((select public.is_staff_or_owner()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'order_items' and policyname = 'Staff and owner can view order items') then
    create policy "Staff and owner can view order items" on public.order_items for select to authenticated using ((select public.is_staff_or_owner()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'order_status_history' and policyname = 'Staff and owner can view order status history') then
    create policy "Staff and owner can view order status history" on public.order_status_history for select to authenticated using ((select public.is_staff_or_owner()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'order_returns' and policyname = 'Staff and owner can view order returns') then
    create policy "Staff and owner can view order returns" on public.order_returns for select to authenticated using ((select public.is_staff_or_owner()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'Staff and owner can view customers') then
    create policy "Staff and owner can view customers" on public.customers for select to authenticated using ((select public.is_staff_or_owner()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoices' and policyname = 'Staff and owner can view invoices') then
    create policy "Staff and owner can view invoices" on public.invoices for select to authenticated using ((select public.is_staff_or_owner()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payments' and policyname = 'Staff and owner can view payments') then
    create policy "Staff and owner can view payments" on public.payments for select to authenticated using ((select public.is_staff_or_owner()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'credit_notes' and policyname = 'Staff and owner can view credit notes') then
    create policy "Staff and owner can view credit notes" on public.credit_notes for select to authenticated using ((select public.is_staff_or_owner()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stock_movements' and policyname = 'Staff and owner can view stock movements') then
    create policy "Staff and owner can view stock movements" on public.stock_movements for select to authenticated using ((select public.is_staff_or_owner()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'riders' and policyname = 'Staff and owner can view riders') then
    create policy "Staff and owner can view riders" on public.riders for select to authenticated using ((select public.is_staff_or_owner()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'back_in_stock_alerts' and policyname = 'Staff and owner can view back in stock alerts') then
    create policy "Staff and owner can view back in stock alerts" on public.back_in_stock_alerts for select to authenticated using ((select public.is_staff_or_owner()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reviews' and policyname = 'Staff and owner can view reviews') then
    create policy "Staff and owner can view reviews" on public.reviews for select to authenticated using ((select public.is_staff_or_owner()));
  end if;
end
$$;

-- ─── 6. STORAGE BUCKET HARDENING ──────────────────────────
-- Enforce size & MIME caps on product-images, public read-only on review-photos, and private invoice-pdfs
update storage.buckets
set
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
where id = 'product-images';

update storage.buckets
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf']
where id = 'invoice-pdfs';

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public can read review photos'
  ) then
    create policy "Public can read review photos"
      on storage.objects
      for select
      to public
      using (bucket_id = 'review-photos');
  end if;
end
$$;

