-- =========================================================
-- Phase 14b: Move RLS SECURITY DEFINER helpers into unexposed `private` schema
-- Resolves Supabase advisor 0029 (no authenticated SECURITY DEFINER RPCs in `public`)
-- =========================================================

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_admin_role()
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

create or replace function private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select private.current_admin_role() = 'owner';
$$;

create or replace function private.is_staff_or_owner()
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select private.current_admin_role() in ('owner', 'staff');
$$;

revoke all on function private.current_admin_role() from public, anon;
revoke all on function private.is_owner() from public, anon;
revoke all on function private.is_staff_or_owner() from public, anon;

grant execute on function private.current_admin_role() to authenticated, service_role;
grant execute on function private.is_owner() to authenticated, service_role;
grant execute on function private.is_staff_or_owner() to authenticated, service_role;

-- Repoint all Phase 14 RLS policies to private schema helpers
alter policy "Owner can view admin users" on public.admin_users using ((select private.is_owner()));
alter policy "Owner can view audit log" on public.audit_log using ((select private.is_owner()));
alter policy "Owner can view discount codes" on public.discount_codes using ((select private.is_owner()));
alter policy "Owner can view discount redemptions" on public.discount_redemptions using ((select private.is_owner()));
alter policy "Owner can view analytics events" on public.events using ((select private.is_owner()));
alter policy "Owner can view push subscriptions" on public.admin_push_subscriptions using ((select private.is_owner()));

alter policy "Staff and owner can view orders" on public.orders using ((select private.is_staff_or_owner()));
alter policy "Staff and owner can view order items" on public.order_items using ((select private.is_staff_or_owner()));
alter policy "Staff and owner can view order status history" on public.order_status_history using ((select private.is_staff_or_owner()));
alter policy "Staff and owner can view order returns" on public.order_returns using ((select private.is_staff_or_owner()));
alter policy "Staff and owner can view customers" on public.customers using ((select private.is_staff_or_owner()));
alter policy "Staff and owner can view invoices" on public.invoices using ((select private.is_staff_or_owner()));
alter policy "Staff and owner can view payments" on public.payments using ((select private.is_staff_or_owner()));
alter policy "Staff and owner can view credit notes" on public.credit_notes using ((select private.is_staff_or_owner()));
alter policy "Staff and owner can view stock movements" on public.stock_movements using ((select private.is_staff_or_owner()));
alter policy "Staff and owner can view riders" on public.riders using ((select private.is_staff_or_owner()));
alter policy "Staff and owner can view back in stock alerts" on public.back_in_stock_alerts using ((select private.is_staff_or_owner()));
alter policy "Staff and owner can view reviews" on public.reviews using ((select private.is_staff_or_owner()));

-- Lock down the public wrappers so authenticated users cannot invoke SECURITY DEFINER RPCs over PostgREST
revoke execute on function public.current_admin_role() from public, anon, authenticated;
revoke execute on function public.is_owner() from public, anon, authenticated;
revoke execute on function public.is_staff_or_owner() from public, anon, authenticated;

