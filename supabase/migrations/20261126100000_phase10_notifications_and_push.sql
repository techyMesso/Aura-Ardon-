-- =========================================================
-- Phase 10: Notifications, Message Templates & Admin Web Push
-- - admin_push_subscriptions table (stored per admin user)
-- - store_settings.sms_notifications_enabled feature flag (default false)
-- =========================================================

-- ─── 1. STORE SETTINGS: SMS FEATURE FLAG (OFF BY DEFAULT) ─
alter table public.store_settings
  add column if not exists sms_notifications_enabled boolean not null default false;

-- ─── 2. TABLE: admin_push_subscriptions ──────────────────
create table if not exists public.admin_push_subscriptions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null,
  user_email   text        not null check (char_length(btrim(user_email)) > 0),
  endpoint     text        not null unique check (char_length(btrim(endpoint)) > 0),
  p256dh       text        not null check (char_length(btrim(p256dh)) > 0),
  auth         text        not null check (char_length(btrim(auth)) > 0),
  user_agent   text,
  active       boolean     not null default true,
  last_used_at timestamptz,
  created_at   timestamptz not null default timezone('utc', now()),
  updated_at   timestamptz not null default timezone('utc', now())
);

create index if not exists admin_push_subscriptions_user_active_idx
  on public.admin_push_subscriptions (user_id, active)
  where active = true;

create index if not exists admin_push_subscriptions_active_idx
  on public.admin_push_subscriptions (active)
  where active = true;

alter table public.admin_push_subscriptions enable row level security;
revoke all on public.admin_push_subscriptions from anon, authenticated;

create or replace function public.set_admin_push_subscriptions_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

revoke all on function public.set_admin_push_subscriptions_updated_at() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'admin_push_subscriptions_set_updated_at'
  ) then
    create trigger admin_push_subscriptions_set_updated_at
      before update on public.admin_push_subscriptions
      for each row
      execute function public.set_admin_push_subscriptions_updated_at();
  end if;
end
$$;

