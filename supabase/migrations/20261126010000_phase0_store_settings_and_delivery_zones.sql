-- =========================================================
-- Phase 0: Foundations — store_settings & delivery_zones
-- Single source of truth for store configuration and
-- Nairobi / Kenya courier delivery fees.
-- =========================================================

-- Reusable updated_at trigger function with pinned search_path
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ─── TABLE: store_settings (singleton) ───────────────────
create table if not exists public.store_settings (
  id                         boolean       primary key default true check (id = true),
  site_name                  text          not null default 'Auro Ardon',
  business_phone             text          not null default '254718038825',
  business_email             text,
  business_address           text          not null default 'Nairobi, Kenya',
  kra_pin                    text,
  logo_url                   text,
  whatsapp_number            text          not null default '254718038825',
  currency                   text          not null default 'KES',
  timezone                   text          not null default 'Africa/Nairobi',
  business_hours             text          not null default 'Mon–Sat, 9am–7pm EAT',
  same_day_cutoff            text          not null default '14:00'
                                           check (same_day_cutoff ~ '^\d{2}:\d{2}$'),
  pending_auto_cancel_hours  integer       not null default 48
                                           check (pending_auto_cancel_hours > 0),
  low_stock_default          integer       not null default 3
                                           check (low_stock_default >= 0),
  free_delivery_threshold    numeric(12,2) not null default 3000
                                           check (free_delivery_threshold >= 0),
  instagram_url              text          not null default '',
  tiktok_url                 text          not null default '',
  is_store_open              boolean       not null default true,
  holiday_banner_message     text          not null default '',
  invoice_footer             text          not null default 'Thank you for shopping with Auro Ardon. Payment is cash or M-Pesa on delivery.',
  payment_instructions       text          not null default 'Pay cash or M-Pesa on delivery.',
  message_templates          jsonb         not null default '{
    "confirmed": "Hi {name}, your Auro Ardon order {order} (KES {total}) is confirmed! Track your order here: {track_link}",
    "dispatched": "Hi {name}, your Auro Ardon order {order} is on the way with {rider} ({rider_phone}). Total payable on delivery: KES {total}. Track: {track_link}",
    "delivered": "Thank you for shopping with Auro Ardon, {name}! Your order {order} has been delivered. Invoice: {invoice_link} — We''d love your honest review: {review_link}",
    "cancelled": "Hi {name}, your Auro Ardon order {order} has been cancelled. Reply here anytime if you''d like to reorder.",
    "unpaid_reminder": "Hi {name}, friendly reminder that invoice {invoice_link} for order {order} (KES {total}) is still pending payment. Let us know if you need any help.",
    "back_in_stock": "Hi {name}, good news! An item you asked about at Auro Ardon is back in stock. Reply here or visit our shop to order."
  }'::jsonb,
  updated_at                 timestamptz   not null default timezone('utc', now())
);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'store_settings_set_updated_at'
  ) then
    create trigger store_settings_set_updated_at
      before update on public.store_settings
      for each row
      execute function public.set_updated_at();
  end if;
end
$$;

-- Seed singleton store settings row from CONFIG defaults
insert into public.store_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.store_settings enable row level security;
revoke insert, update, delete on public.store_settings from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_settings'
      and policyname = 'Public can view store settings'
  ) then
    create policy "Public can view store settings"
      on public.store_settings for select
      using (true);
  end if;
end
$$;

-- ─── TABLE: delivery_zones ───────────────────────────────
create table if not exists public.delivery_zones (
  id                  uuid          primary key default gen_random_uuid(),
  name                text          not null unique,
  fee                 numeric(12,2) not null check (fee >= 0),
  active              boolean       not null default true,
  sort_order          integer       not null default 0,
  is_outside_nairobi  boolean       not null default false,
  created_at          timestamptz   not null default timezone('utc', now()),
  updated_at          timestamptz   not null default timezone('utc', now())
);

create index if not exists delivery_zones_active_sort_idx
  on public.delivery_zones (active, sort_order, name);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'delivery_zones_set_updated_at'
  ) then
    create trigger delivery_zones_set_updated_at
      before update on public.delivery_zones
      for each row
      execute function public.set_updated_at();
  end if;
end
$$;

alter table public.delivery_zones enable row level security;
revoke insert, update, delete on public.delivery_zones from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'delivery_zones'
      and policyname = 'Public can view active delivery zones'
  ) then
    create policy "Public can view active delivery zones"
      on public.delivery_zones for select
      using (active = true);
  end if;
end
$$;

-- Seed default delivery zones from CONFIG (TODO(owner): adjust real fees in admin)
insert into public.delivery_zones (name, fee, active, sort_order, is_outside_nairobi) values
  ('Westlands',                 200, true,  1, false),
  ('Kilimani',                  200, true,  2, false),
  ('Lavington',                 200, true,  3, false),
  ('Kileleshwa',                200, true,  4, false),
  ('Parklands',                 200, true,  5, false),
  ('CBD',                       150, true,  6, false),
  ('Upper Hill',                200, true,  7, false),
  ('South B',                   250, true,  8, false),
  ('South C',                   250, true,  9, false),
  ('Lang''ata',                 300, true, 10, false),
  ('Karen',                     350, true, 11, false),
  ('Runda',                     350, true, 12, false),
  ('Kasarani',                  300, true, 13, false),
  ('Thika Road',                300, true, 14, false),
  ('Embakasi',                  300, true, 15, false),
  ('Outside Nairobi (courier)', 400, true, 16, true)
on conflict (name) do nothing;

