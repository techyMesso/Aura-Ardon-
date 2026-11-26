-- =========================================================
-- Phase 5: Immutable Invoices, Payments, Credit Notes &
-- Gap-Free Yearly Document Numbering
-- =========================================================

-- ─── 1. GAP-FREE YEARLY DOCUMENT COUNTERS ────────────────
create table if not exists public.document_counters (
  doc_type    text    not null check (doc_type in ('invoice', 'credit_note')),
  year        integer not null check (year >= 2020 and year <= 2999),
  last_number integer not null default 0 check (last_number >= 0),
  primary key (doc_type, year)
);

alter table public.document_counters enable row level security;
revoke all on public.document_counters from anon, authenticated;

create or replace function public.next_document_number(
  p_doc_type text,
  p_year     integer default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year   integer := coalesce(p_year, extract(year from timezone('Africa/Nairobi', now()))::integer);
  v_next   integer;
  v_prefix text;
begin
  if p_doc_type not in ('invoice', 'credit_note') then
    raise exception 'Unsupported document type: %', p_doc_type;
  end if;

  insert into public.document_counters (doc_type, year, last_number)
  values (p_doc_type, v_year, 0)
  on conflict (doc_type, year) do nothing;

  update public.document_counters
  set last_number = last_number + 1
  where doc_type = p_doc_type
    and year = v_year
  returning last_number
  into v_next;

  v_prefix := case p_doc_type
    when 'invoice' then 'INV'
    else 'CN'
  end;

  return v_prefix || '-' || v_year::text || '-' || lpad(v_next::text, 4, '0');
end;
$$;

revoke all on function public.next_document_number(text, integer) from public, anon, authenticated;
grant execute on function public.next_document_number(text, integer) to service_role;

-- ─── 2. TABLE: invoices (IMMUTABLE SNAPSHOT) ─────────────
create table if not exists public.invoices (
  id                   uuid          primary key default gen_random_uuid(),
  invoice_number       text          not null unique,
  order_id             uuid          not null unique references public.orders(id) on delete restrict,
  status               text          not null default 'unpaid' check (
                                       status in ('unpaid', 'partially_paid', 'paid', 'void')
                                     ),
  issued_at            timestamptz   not null default timezone('utc', now()),
  due_at               timestamptz   not null default (timezone('utc', now()) + interval '7 days'),
  etims_invoice_number text,
  share_token          text          not null unique,
  share_expires_at     timestamptz   not null default (timezone('utc', now()) + interval '90 days'),
  share_revoked        boolean       not null default false,
  customer_snapshot    jsonb         not null,
  lines_snapshot       jsonb         not null,
  business_snapshot    jsonb         not null,
  subtotal             numeric(12,2) not null check (subtotal >= 0),
  discount_code        text,
  discount_amount      numeric(12,2) not null default 0 check (discount_amount >= 0),
  delivery_fee         numeric(12,2) not null default 0 check (delivery_fee >= 0),
  total                numeric(12,2) not null check (total >= 0),
  amount_paid          numeric(12,2) not null default 0 check (amount_paid >= 0),
  credited_amount      numeric(12,2) not null default 0 check (credited_amount >= 0),
  pdf_a4_path          text,
  pdf_receipt_path     text,
  created_by           text          not null default 'system',
  created_at           timestamptz   not null default timezone('utc', now()),
  updated_at           timestamptz   not null default timezone('utc', now())
);

create index if not exists invoices_status_issued_at_idx
  on public.invoices (status, issued_at desc);

create index if not exists invoices_issued_at_idx
  on public.invoices (issued_at desc);

alter table public.invoices enable row level security;
revoke all on public.invoices from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'invoices_set_updated_at'
  ) then
    create trigger invoices_set_updated_at
      before update on public.invoices
      for each row
      execute function public.set_updated_at();
  end if;
end
$$;

-- Issued invoices can never be deleted
create or replace function public.prevent_invoice_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Issued invoices cannot be deleted. Issue a credit note instead.';
end;
$$;

revoke all on function public.prevent_invoice_delete() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'invoices_prevent_delete'
  ) then
    create trigger invoices_prevent_delete
      before delete on public.invoices
      for each row
      execute function public.prevent_invoice_delete();
  end if;
end
$$;

-- Frozen snapshot & financial fields on issued invoices are strictly immutable
create or replace function public.enforce_invoice_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.invoice_number is distinct from old.invoice_number
     or new.order_id is distinct from old.order_id
     or new.issued_at is distinct from old.issued_at
     or new.customer_snapshot is distinct from old.customer_snapshot
     or new.lines_snapshot is distinct from old.lines_snapshot
     or new.business_snapshot is distinct from old.business_snapshot
     or new.subtotal is distinct from old.subtotal
     or new.discount_code is distinct from old.discount_code
     or new.discount_amount is distinct from old.discount_amount
     or new.delivery_fee is distinct from old.delivery_fee
     or new.total is distinct from old.total then
    raise exception 'Issued invoices are immutable. Corrections must be made with a credit note.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_invoice_immutability() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'invoices_enforce_immutability'
  ) then
    create trigger invoices_enforce_immutability
      before update on public.invoices
      for each row
      execute function public.enforce_invoice_immutability();
  end if;
end
$$;

-- ─── 3. TABLE: payments ──────────────────────────────────
create table if not exists public.payments (
  id          uuid          primary key default gen_random_uuid(),
  invoice_id  uuid          not null references public.invoices(id) on delete restrict,
  order_id    uuid          not null references public.orders(id) on delete restrict,
  amount      numeric(12,2) not null check (amount > 0),
  method      text          not null check (method in ('cash', 'mpesa')),
  mpesa_code  text,
  received_by text          not null,
  paid_at     timestamptz   not null default timezone('utc', now()),
  note        text,
  created_by  text          not null default 'admin',
  created_at  timestamptz   not null default timezone('utc', now()),
  constraint payments_mpesa_code_required_check check (
    (method = 'mpesa' and mpesa_code is not null and mpesa_code ~ '^[A-Z0-9]{10,12}$')
    or (method = 'cash' and mpesa_code is null)
  )
);

create unique index if not exists payments_mpesa_code_unique_idx
  on public.payments (upper(mpesa_code))
  where mpesa_code is not null;

create index if not exists payments_invoice_id_idx
  on public.payments (invoice_id, paid_at asc);

create index if not exists payments_order_id_idx
  on public.payments (order_id);

create index if not exists payments_paid_at_idx
  on public.payments (paid_at desc);

create index if not exists payments_method_paid_at_idx
  on public.payments (method, paid_at desc);

alter table public.payments enable row level security;
revoke all on public.payments from anon, authenticated;

create or replace function public.prevent_payment_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Recorded payments cannot be deleted.';
end;
$$;

revoke all on function public.prevent_payment_delete() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'payments_prevent_delete'
  ) then
    create trigger payments_prevent_delete
      before delete on public.payments
      for each row
      execute function public.prevent_payment_delete();
  end if;
end
$$;

-- ─── 4. TABLE: credit_notes ──────────────────────────────
create table if not exists public.credit_notes (
  id                 uuid          primary key default gen_random_uuid(),
  credit_note_number text          not null unique,
  invoice_id         uuid          not null references public.invoices(id) on delete restrict,
  order_id           uuid          not null references public.orders(id) on delete restrict,
  reason             text          not null,
  lines              jsonb         not null default '[]'::jsonb,
  amount             numeric(12,2) not null check (amount > 0),
  created_by         text          not null default 'system',
  created_at         timestamptz   not null default timezone('utc', now())
);

create index if not exists credit_notes_invoice_id_idx
  on public.credit_notes (invoice_id, created_at asc);

create index if not exists credit_notes_order_id_idx
  on public.credit_notes (order_id);

create index if not exists credit_notes_created_at_idx
  on public.credit_notes (created_at desc);

alter table public.credit_notes enable row level security;
revoke all on public.credit_notes from anon, authenticated;

create or replace function public.prevent_credit_note_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Issued credit notes cannot be deleted.';
end;
$$;

revoke all on function public.prevent_credit_note_delete() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'credit_notes_prevent_delete'
  ) then
    create trigger credit_notes_prevent_delete
      before delete on public.credit_notes
      for each row
      execute function public.prevent_credit_note_delete();
  end if;
end
$$;

-- ─── 5. PRIVATE STORAGE BUCKET FOR INVOICE PDFs ──────────
insert into storage.buckets (id, name, public)
values ('invoice-pdfs', 'invoice-pdfs', false)
on conflict (id) do nothing;

-- ─── 6. HELPER: recompute_invoice_status(...) ────────────
create or replace function public.recompute_invoice_status(
  p_invoice_id uuid
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv             public.invoices%rowtype;
  v_paid            numeric(12,2) := 0;
  v_credited        numeric(12,2) := 0;
  v_effective_total numeric(12,2) := 0;
  v_next_status     text;
  v_updated         public.invoices%rowtype;
begin
  select *
  into v_inv
  from public.invoices i
  where i.id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found.';
  end if;

  select coalesce(sum(p.amount), 0)::numeric(12,2)
  into v_paid
  from public.payments p
  where p.invoice_id = p_invoice_id;

  select coalesce(sum(cn.amount), 0)::numeric(12,2)
  into v_credited
  from public.credit_notes cn
  where cn.invoice_id = p_invoice_id;

  v_effective_total := greatest(0, v_inv.total - v_credited)::numeric(12,2);

  if v_credited >= v_inv.total and (v_inv.total > 0 or v_credited > 0) then
    v_next_status := 'void';
  elsif v_paid >= v_effective_total and v_effective_total > 0 then
    v_next_status := 'paid';
  elsif v_paid > 0 then
    v_next_status := 'partially_paid';
  else
    v_next_status := 'unpaid';
  end if;

  update public.invoices i
  set
    amount_paid = v_paid,
    credited_amount = v_credited,
    status = v_next_status,
    pdf_a4_path = case
      when i.status <> v_next_status or i.amount_paid <> v_paid or i.credited_amount <> v_credited
        then null
      else i.pdf_a4_path
    end,
    pdf_receipt_path = case
      when i.status <> v_next_status or i.amount_paid <> v_paid or i.credited_amount <> v_credited
        then null
      else i.pdf_receipt_path
    end
  where i.id = p_invoice_id
  returning *
  into v_updated;

  -- Sync legacy payment_status on orders for convenience
  update public.orders o
  set payment_status = case when v_next_status = 'paid' then 'PAID'::public.payment_status else 'PENDING'::public.payment_status end
  where o.id = v_inv.order_id;

  return v_updated;
end;
$$;

revoke all on function public.recompute_invoice_status(uuid) from public, anon, authenticated;
grant execute on function public.recompute_invoice_status(uuid) to service_role;

-- ─── 7. FUNCTION: issue_invoice_for_order(...) ───────────
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

  -- Re-check after locking order to prevent duplicate invoice races
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
        'sku', upper(
          'AA-' ||
          coalesce(
            nullif(
              left(regexp_replace(coalesce(p.slug, oi.product_title), '[^a-zA-Z0-9]+', '', 'g'), 8),
              ''
            ),
            'ITEM'
          ) || '-' ||
          right(replace(coalesce(oi.product_id, oi.id)::text, '-', ''), 4)
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

-- ─── 8. FUNCTION: record_invoice_payment(...) ────────────
create or replace function public.record_invoice_payment(
  p_invoice_id  uuid,
  p_amount      numeric,
  p_method      text,
  p_mpesa_code  text default null,
  p_received_by text default 'admin',
  p_paid_at     timestamptz default null,
  p_note        text default null,
  p_created_by  text default 'admin'
)
returns table (
  payment_id     uuid,
  invoice_id     uuid,
  invoice_number text,
  invoice_status text,
  amount_paid    numeric,
  balance_due    numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv             public.invoices%rowtype;
  v_method          text := lower(btrim(coalesce(p_method, '')));
  v_mpesa           text := nullif(upper(btrim(coalesce(p_mpesa_code, ''))), '');
  v_received_by     text := nullif(btrim(coalesce(p_received_by, '')), '');
  v_actor           text := coalesce(nullif(btrim(coalesce(p_created_by, '')), ''), 'admin');
  v_clean_note      text := nullif(btrim(coalesce(p_note, '')), '');
  v_paid_at         timestamptz := coalesce(p_paid_at, timezone('utc', now()));
  v_remaining       numeric(12,2);
  v_payment_id      uuid;
  v_updated_inv     public.invoices%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero.';
  end if;

  if v_method not in ('cash', 'mpesa') then
    raise exception 'Payment method must be cash or mpesa.';
  end if;

  if v_received_by is null then
    raise exception 'Received by (rider or admin) is required.';
  end if;

  if v_method = 'mpesa' then
    if v_mpesa is null then
      raise exception 'M-Pesa confirmation code is required for M-Pesa payments.';
    end if;
    if v_mpesa !~ '^[A-Z0-9]{10,12}$' then
      raise exception 'Invalid M-Pesa code format (expected 10–12 uppercase letters/digits, e.g. SHK4P9X2M1).';
    end if;
    if exists (select 1 from public.payments p where upper(p.mpesa_code) = v_mpesa) then
      raise exception 'M-Pesa code % has already been recorded.', v_mpesa;
    end if;
  else
    v_mpesa := null;
  end if;

  select *
  into v_inv
  from public.invoices i
  where i.id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found.';
  end if;

  if v_inv.status = 'void' then
    raise exception 'Cannot record payment against a void invoice.';
  end if;

  v_remaining := greatest(0, v_inv.total - v_inv.credited_amount - v_inv.amount_paid)::numeric(12,2);
  if v_remaining <= 0 then
    raise exception 'Invoice % is already fully paid.', v_inv.invoice_number;
  end if;

  if p_amount > v_remaining then
    raise exception 'Payment amount (KES %) exceeds remaining balance (KES %).', p_amount, v_remaining;
  end if;

  insert into public.payments (
    invoice_id,
    order_id,
    amount,
    method,
    mpesa_code,
    received_by,
    paid_at,
    note,
    created_by
  )
  values (
    p_invoice_id,
    v_inv.order_id,
    p_amount::numeric(12,2),
    v_method,
    v_mpesa,
    v_received_by,
    v_paid_at,
    v_clean_note,
    v_actor
  )
  returning id
  into v_payment_id;

  v_updated_inv := public.recompute_invoice_status(p_invoice_id);

  return query
  select
    v_payment_id,
    v_updated_inv.id,
    v_updated_inv.invoice_number,
    v_updated_inv.status,
    v_updated_inv.amount_paid,
    greatest(0, v_updated_inv.total - v_updated_inv.credited_amount - v_updated_inv.amount_paid)::numeric(12,2);
end;
$$;

revoke all on function public.record_invoice_payment(uuid, numeric, text, text, text, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.record_invoice_payment(uuid, numeric, text, text, text, timestamptz, text, text) to service_role;

-- ─── 9. FUNCTION: issue_credit_note(...) ─────────────────
create or replace function public.issue_credit_note(
  p_invoice_id uuid,
  p_reason     text,
  p_lines      jsonb,
  p_amount     numeric,
  p_created_by text default 'system'
)
returns public.credit_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv         public.invoices%rowtype;
  v_remaining   numeric(12,2);
  v_credit_amt  numeric(12,2);
  v_cn_number   text;
  v_clean_rsn   text := nullif(btrim(coalesce(p_reason, '')), '');
  v_actor       text := coalesce(nullif(btrim(coalesce(p_created_by, '')), ''), 'system');
  v_created     public.credit_notes%rowtype;
begin
  if v_clean_rsn is null then
    raise exception 'A reason is required to issue a credit note.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Credit note amount must be greater than zero.';
  end if;

  select *
  into v_inv
  from public.invoices i
  where i.id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found.';
  end if;

  v_remaining := greatest(0, v_inv.total - v_inv.credited_amount)::numeric(12,2);
  if v_remaining <= 0 then
    raise exception 'Invoice % is already fully credited.', v_inv.invoice_number;
  end if;

  v_credit_amt := least(p_amount::numeric(12,2), v_remaining);
  v_cn_number := public.next_document_number('credit_note');

  insert into public.credit_notes (
    credit_note_number,
    invoice_id,
    order_id,
    reason,
    lines,
    amount,
    created_by
  )
  values (
    v_cn_number,
    p_invoice_id,
    v_inv.order_id,
    v_clean_rsn,
    coalesce(p_lines, '[]'::jsonb),
    v_credit_amt,
    v_actor
  )
  returning *
  into v_created;

  perform public.recompute_invoice_status(p_invoice_id);

  return v_created;
end;
$$;

revoke all on function public.issue_credit_note(uuid, text, jsonb, numeric, text) from public, anon, authenticated;
grant execute on function public.issue_credit_note(uuid, text, jsonb, numeric, text) to service_role;

-- ─── 10. HOOK PHASE 4 LIFECYCLE FUNCTIONS TO INVOICES ────

-- 10a. set_order_status: auto-issue unpaid invoice on confirmation
create or replace function public.set_order_status(
  p_order_id   uuid,
  p_to_status  text,
  p_changed_by text default 'admin',
  p_reason     text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_order         public.orders%rowtype;
  v_from_status   text;
  v_to_status     text := lower(btrim(coalesce(p_to_status, '')));
  v_legacy_status public.order_status;
  v_actor         text := coalesce(nullif(btrim(coalesce(p_changed_by, '')), ''), 'admin');
  v_clean_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_updated       public.orders%rowtype;
begin
  if v_to_status not in ('pending', 'confirmed', 'dispatched', 'delivered', 'cancelled', 'returned') then
    raise exception 'Invalid target status: %', p_to_status;
  end if;

  if v_to_status = 'cancelled' then
    raise exception 'Use cancel_order() to cancel an order with a reason and restock items.';
  end if;

  if v_to_status = 'returned' then
    raise exception 'Use return_order() to record returned items and condition.';
  end if;

  select *
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;

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

  if not (
    (v_from_status = 'pending' and v_to_status = 'confirmed') or
    (v_from_status = 'confirmed' and v_to_status = 'dispatched') or
    (v_from_status = 'dispatched' and v_to_status = 'delivered')
  ) then
    raise exception 'Invalid status transition from % to %.', v_from_status, v_to_status;
  end if;

  v_legacy_status := case v_to_status
    when 'confirmed' then 'CONFIRMED'::public.order_status
    when 'dispatched' then 'OUT_FOR_DELIVERY'::public.order_status
    when 'delivered' then 'DELIVERED'::public.order_status
    else 'PENDING_CONFIRMATION'::public.order_status
  end;

  update public.orders o
  set
    status = v_to_status,
    order_status = v_legacy_status
  where o.id = p_order_id
  returning *
  into v_updated;

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
    v_to_status,
    v_actor,
    v_clean_reason
  );

  -- Phase 5: automatically issue unpaid invoice when confirmed
  if v_to_status = 'confirmed' then
    perform public.issue_invoice_for_order(p_order_id, v_actor);
  end if;

  return v_updated;
end;
$$;

revoke all on function public.set_order_status(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.set_order_status(uuid, text, text, text) to service_role;

-- 10b. cancel_order: auto-create credit note (and void invoice) if an invoice was already issued
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
        sum(oi.quantity)::integer as total_qty
      from public.order_items oi
      where oi.order_id = p_order_id
        and oi.product_id is not null
        and oi.quantity > 0
      group by oi.product_id
      order by oi.product_id asc
    loop
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
          order_id,
          change,
          type,
          note,
          created_by
        )
        values (
          v_item.product_id,
          p_order_id,
          v_item.total_qty,
          'cancel_restock',
          'Cancelled order ' || v_order_code || ' (' || p_reason::text || ')' ||
            case when v_clean_note is not null then ': ' || v_clean_note else '' end,
          v_actor
        );

        v_restocked_units := v_restocked_units + v_item.total_qty;
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
    if v_order.customer_id is not null then
      update public.customers c
      set cancelled_count = c.cancelled_count + 1
      where c.id = v_order.customer_id;
    end if;

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

    -- Phase 5: if an invoice was already issued, automatically issue a full credit note (voiding invoice)
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

-- 10c. return_order: auto-create credit note for returned items when invoice exists
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
        'qty', v_req.qty,
        'unit_price', v_oi.unit_price,
        'line_total', (v_oi.unit_price * v_req.qty)::numeric(12,2),
        'condition', v_condition
      )
    );

    if v_oi.product_id is not null then
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
            order_id,
            change,
            type,
            note,
            created_by
          )
          values (
            v_oi.product_id,
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
            order_id,
            change,
            type,
            note,
            created_by
          )
          values (
            v_oi.product_id,
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

  -- Phase 5: automatically create a credit note when an invoice exists
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

