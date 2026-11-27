-- =========================================================
-- Round 2 — Phase 3: Order & Admin Polish
-- 1. Owner MFA skip counter (max 3 skips) on public.admin_users + atomic RPC
-- 2. legal_reviewed_at timestamp on public.store_settings (feeds Setup Checklist + Phase 4)
-- 3. Order payment / credit-note summary helper RPC + supporting indexes
-- =========================================================

-- ─── 1. OWNER MFA SKIP TRACKING ON admin_users ───────────
alter table public.admin_users
  add column if not exists mfa_skip_count integer not null default 0,
  add column if not exists mfa_last_skipped_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_mfa_skip_count_non_negative'
      and conrelid = 'public.admin_users'::regclass
  ) then
    alter table public.admin_users
      add constraint admin_users_mfa_skip_count_non_negative
      check (mfa_skip_count >= 0);
  end if;
end
$$;

create or replace function public.increment_owner_mfa_skip(
  p_user_id   uuid,
  p_email     text,
  p_max_skips integer default 3
)
returns table (
  previous_count integer,
  new_count      integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row       public.admin_users%rowtype;
  v_max       integer := greatest(1, coalesce(p_max_skips, 3));
  v_email     text := lower(btrim(coalesce(p_email, '')));
  v_prev      integer;
  v_next      integer;
begin
  if p_user_id is null then
    raise exception 'User ID is required.';
  end if;

  select *
  into v_row
  from public.admin_users au
  where au.user_id = p_user_id
  for update;

  if not found then
    if char_length(v_email) <= 3 then
      raise exception 'Owner account record not found.';
    end if;

    insert into public.admin_users (
      user_id,
      email,
      full_name,
      role,
      active,
      created_by,
      mfa_skip_count,
      mfa_last_skipped_at
    )
    values (
      p_user_id,
      v_email,
      'Store Owner',
      'owner',
      true,
      'mfa_skip_bootstrap',
      1,
      timezone('utc', now())
    )
    returning 0, mfa_skip_count
    into v_prev, v_next;

    return query select v_prev, v_next;
    return;
  end if;

  if v_row.role <> 'owner' or v_row.active = false then
    raise exception 'FORBIDDEN';
  end if;

  v_prev := coalesce(v_row.mfa_skip_count, 0);
  if v_prev >= v_max then
    raise exception 'MFA_SKIP_LIMIT_REACHED';
  end if;

  v_next := v_prev + 1;

  update public.admin_users au
  set
    mfa_skip_count = v_next,
    mfa_last_skipped_at = timezone('utc', now())
  where au.user_id = p_user_id;

  return query select v_prev, v_next;
end;
$$;

revoke all on function public.increment_owner_mfa_skip(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.increment_owner_mfa_skip(uuid, text, integer) to service_role;

-- ─── 2. STORE SETTINGS LEGAL REVIEW TIMESTAMP ────────────
alter table public.store_settings
  add column if not exists legal_reviewed_at timestamptz;

-- ─── 3. ORDER PAYMENT / CREDIT-NOTE SUMMARIES & INDEXES ──
create index if not exists payments_order_id_idx
  on public.payments (order_id);

create index if not exists credit_notes_order_id_idx
  on public.credit_notes (order_id);

create index if not exists audit_log_entity_idx
  on public.audit_log (entity);

create or replace function public.get_order_payment_summaries(
  p_order_ids uuid[]
)
returns table (
  order_id          uuid,
  amount_paid       numeric(14,2),
  credited_amount   numeric(14,2),
  credit_note_count integer,
  invoice_status    text
)
language sql
stable
security definer
set search_path = public
as $$
  with ids as (
    select distinct unnest(coalesce(p_order_ids, array[]::uuid[])) as order_id
  ),
  pay_agg as (
    select
      p.order_id,
      coalesce(sum(p.amount), 0)::numeric(14,2) as paid_sum
    from public.payments p
    join ids on ids.order_id = p.order_id
    group by p.order_id
  ),
  cn_agg as (
    select
      cn.order_id,
      coalesce(sum(cn.amount), 0)::numeric(14,2) as credited_sum,
      count(*)::integer as cn_count
    from public.credit_notes cn
    join ids on ids.order_id = cn.order_id
    group by cn.order_id
  )
  select
    ids.order_id,
    greatest(coalesce(i.amount_paid, 0), coalesce(pa.paid_sum, 0))::numeric(14,2) as amount_paid,
    greatest(coalesce(i.credited_amount, 0), coalesce(ca.credited_sum, 0))::numeric(14,2) as credited_amount,
    coalesce(ca.cn_count, 0)::integer as credit_note_count,
    i.status::text as invoice_status
  from ids
  left join public.invoices i on i.order_id = ids.order_id
  left join pay_agg pa on pa.order_id = ids.order_id
  left join cn_agg ca on ca.order_id = ids.order_id;
$$;

revoke all on function public.get_order_payment_summaries(uuid[]) from public, anon, authenticated;
grant execute on function public.get_order_payment_summaries(uuid[]) to service_role;

