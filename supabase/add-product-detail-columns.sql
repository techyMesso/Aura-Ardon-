-- =========================================================
-- Auro Ardon – Product Detail Columns Migration
-- Adds nullable finish, size_label, in_the_box, and care
-- columns to public.products while preserving RLS policies.
-- =========================================================

alter table public.products
  add column if not exists finish text,
  add column if not exists size_label text,
  add column if not exists in_the_box text,
  add column if not exists care text;

-- Ensure RLS remains enabled on public.products
alter table public.products enable row level security;
