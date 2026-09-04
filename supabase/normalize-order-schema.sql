-- =========================================================
-- Order schema normalization
-- 1. Adds normalized enums
-- 2. Migrates legacy order rows
-- 3. Removes fake payment fields
-- 4. Rebuilds the checkout RPC against the normalized schema
-- =========================================================

create extension if not exists "pgcrypto";

drop function if exists public.create_checkout_order(text, text, text, text, text, public.payment_method, jsonb);
drop function if exists public.create_checkout_order(text, text, text, text, text, public.payment_method, text, jsonb);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status_v2') then
    create type public.order_status_v2 as enum (
      'PENDING_CONFIRMATION',
      'CONFIRMED',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_method_v2') then
    create type public.payment_method_v2 as enum (
      'CASH_ON_DELIVERY',
      'WHATSAPP'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('PENDING', 'PAID');
  end if;
end
$$;

alter table public.orders
  add column if not exists payment_status_v2 public.payment_status,
  add column if not exists order_status_v2 public.order_status_v2,
  add column if not exists payment_method_v2 public.payment_method_v2,
  add column if not exists idempotency_key text;

update public.orders
set idempotency_key = gen_random_uuid()::text
where idempotency_key is null;

update public.orders
set payment_status_v2 = case upper(coalesce(payment_status, 'PENDING'))
  when 'COMPLETED' then 'PAID'::public.payment_status
  when 'PAID' then 'PAID'::public.payment_status
  else 'PENDING'::public.payment_status
end
where payment_status_v2 is null;

update public.orders
set order_status_v2 = case upper(coalesce(order_status::text, 'PENDING_CONFIRMATION'))
  when 'NEW' then 'PENDING_CONFIRMATION'::public.order_status_v2
  when 'PENDING_CONFIRMATION' then 'PENDING_CONFIRMATION'::public.order_status_v2
  when 'CONFIRMED' then 'CONFIRMED'::public.order_status_v2
  when 'OUT_FOR_DELIVERY' then 'OUT_FOR_DELIVERY'::public.order_status_v2
  when 'DELIVERED' then 'DELIVERED'::public.order_status_v2
  when 'CANCELLED' then 'CANCELLED'::public.order_status_v2
  else 'PENDING_CONFIRMATION'::public.order_status_v2
end
where order_status_v2 is null;

update public.orders
set payment_method_v2 = case upper(coalesce(payment_method::text, 'CASH_ON_DELIVERY'))
  when 'CASH_ON_DELIVERY' then 'CASH_ON_DELIVERY'::public.payment_method_v2
  when 'WHATSAPP' then 'WHATSAPP'::public.payment_method_v2
  when 'WHATSAPP_CONFIRMATION' then 'WHATSAPP'::public.payment_method_v2
  else 'CASH_ON_DELIVERY'::public.payment_method_v2
end
where payment_method_v2 is null;

alter table public.orders
  drop column if exists payment_status,
  drop column if exists order_status,
  drop column if exists payment_method,
  drop column if exists mpesa_receipt_number,
  drop column if exists checkout_request_id;

drop type if exists public.order_status;
drop type if exists public.payment_method;

alter type public.order_status_v2 rename to order_status;
alter type public.payment_method_v2 rename to payment_method;

alter table public.orders
  rename column payment_status_v2 to payment_status;

alter table public.orders
  rename column order_status_v2 to order_status;

alter table public.orders
  rename column payment_method_v2 to payment_method;

alter table public.orders
  alter column payment_status set not null,
  alter column order_status set not null,
  alter column payment_method set not null,
  alter column idempotency_key set not null,
  alter column payment_status set default 'PENDING',
  alter column order_status set default 'PENDING_CONFIRMATION',
  alter column payment_method set default 'CASH_ON_DELIVERY';

create unique index if not exists orders_idempotency_key_idx
  on public.orders (idempotency_key);

-- Final step:
-- Run supabase/add-safe-checkout-rpc.sql after this migration to recreate the
-- transactional checkout RPC against the normalized enum types.
