-- =========================================================
-- Round 2, Phase 1: Delivery Zones Hardening & Owner-Only RLS
-- - Case-insensitive unique trimmed names
-- - Integer KES fee check (0..10,000)
-- - Trigger preventing hard deletion of zones referenced by orders
-- - Foreign key lookup index on orders(delivery_zone_id)
-- - Owner-only RLS policies for insert, update, delete, and viewing inactive zones
-- =========================================================

-- 1. Index orders(delivery_zone_id) so referenced-zone checks & counts stay fast
create index if not exists orders_delivery_zone_id_idx
  on public.orders (delivery_zone_id)
  where delivery_zone_id is not null;

-- 2. Normalize any accidental leading/trailing whitespace before adding constraints
update public.delivery_zones
set name = btrim(name)
where name <> btrim(name);

-- 3. Case-insensitive unique index on trimmed zone name
create unique index if not exists delivery_zones_name_lower_uidx
  on public.delivery_zones (lower(btrim(name)));

-- 4. Validation constraints: trimmed non-empty name + integer KES fee between 0 and 10,000
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.delivery_zones'::regclass
      and conname = 'delivery_zones_name_not_blank_check'
  ) then
    alter table public.delivery_zones
      add constraint delivery_zones_name_not_blank_check
      check (char_length(btrim(name)) between 1 and 80 and name = btrim(name));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.delivery_zones'::regclass
      and conname = 'delivery_zones_fee_integer_range_check'
  ) then
    alter table public.delivery_zones
      add constraint delivery_zones_fee_integer_range_check
      check (fee >= 0 and fee <= 10000 and fee = trunc(fee));
  end if;
end
$$;

-- 5. Never hard-delete a delivery zone referenced by orders; deactivate it instead
create or replace function public.prevent_referenced_delivery_zone_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.orders o
    where o.delivery_zone_id = old.id
  ) then
    raise exception 'Delivery zone "%" is referenced by existing orders and cannot be deleted. Deactivate it instead.', old.name
      using errcode = '23503';
  end if;

  return old;
end;
$$;

revoke all on function public.prevent_referenced_delivery_zone_delete() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'delivery_zones_prevent_referenced_delete'
  ) then
    create trigger delivery_zones_prevent_referenced_delete
      before delete on public.delivery_zones
      for each row
      execute function public.prevent_referenced_delivery_zone_delete();
  end if;
end
$$;

-- 6. Owner-only RLS enforcement on delivery_zones (anon remains read-only on active rows; staff cannot write)
alter table public.delivery_zones enable row level security;

revoke insert, update, delete, truncate, references, trigger
  on public.delivery_zones from anon;

grant select, insert, update, delete
  on public.delivery_zones to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'delivery_zones'
      and policyname = 'Public can view active delivery zones'
  ) then
    alter policy "Public can view active delivery zones"
      on public.delivery_zones
      to anon
      using (active = true);
  else
    create policy "Public can view active delivery zones"
      on public.delivery_zones
      for select
      to anon
      using (active = true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'delivery_zones'
      and policyname = 'Authenticated can view active or owner all delivery zones'
  ) then
    create policy "Authenticated can view active or owner all delivery zones"
      on public.delivery_zones
      for select
      to authenticated
      using (active = true or (select private.is_owner()));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'delivery_zones'
      and policyname = 'Owner can insert delivery zones'
  ) then
    create policy "Owner can insert delivery zones"
      on public.delivery_zones
      for insert
      to authenticated
      with check ((select private.is_owner()));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'delivery_zones'
      and policyname = 'Owner can update delivery zones'
  ) then
    create policy "Owner can update delivery zones"
      on public.delivery_zones
      for update
      to authenticated
      using ((select private.is_owner()))
      with check ((select private.is_owner()));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'delivery_zones'
      and policyname = 'Owner can delete delivery zones'
  ) then
    create policy "Owner can delete delivery zones"
      on public.delivery_zones
      for delete
      to authenticated
      using ((select private.is_owner()));
  end if;
end
$$;

