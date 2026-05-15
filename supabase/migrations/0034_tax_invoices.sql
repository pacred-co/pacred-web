-- ════════════════════════════════════════════════════════════
-- T-P4 G2a · tax_invoices + serial generator (RD Code 86)
-- ════════════════════════════════════════════════════════════
-- Per ADR-0006 (design contract locked 2026-05-16) + ADR-0005 K-6
-- (numbering format INV-YYYYMM-NNNN with monthly counter reset) +
-- ADR-0005 K-7 (issuance approver = super OR accounting).
--
-- Customer (juristic OR personal-with-tax-ID) requests a tax invoice
-- from the receipt page. Admin issues from /admin/tax-invoices/[id].
-- Once issued, the header is immutable (Thai Revenue Department
-- Code 86 compliance). Cancellation does not delete — flip status to
-- 'cancelled' + watermark PDF. Issue a credit note (ใบลดหนี้) as a
-- NEW row pointing back via credit_note_id.
--
-- This migration introduces:
--   1. tax_invoice_seq         — monthly serial counter (one row/month)
--   2. tax_invoices            — header (immutable buyer + financial snapshot)
--   3. tax_invoice_lines       — line items snapshot
--   4. next_tax_invoice_serial() — atomic serial generator (security definer)
--   5. RLS: customer reads own; super/accounting reads + writes all
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Monthly serial counter ----------------------------------------
create table if not exists public.tax_invoice_seq (
  period_yyyymm text primary key,
  next_seq      int  not null default 1,
  updated_at    timestamptz not null default now()
);

-- 2) Tax invoice header --------------------------------------------
create table if not exists public.tax_invoices (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles(id) on delete restrict,
  -- Source order pointer — exactly one of these must be set.
  order_h_no          text references public.service_orders(h_no),
  forwarder_f_no      text references public.forwarders(f_no),

  -- Buyer snapshot at issuance (RD Code 86 — immutable; do NOT join to profiles)
  buyer_name          text not null,
  buyer_address       text not null,
  buyer_tax_id        text not null,
  buyer_branch        text not null default 'สำนักงานใหญ่',

  -- Issuance state
  status              text not null check (status in ('pending','issued','cancelled')) default 'pending',
  serial_no           text unique,                  -- INV-YYYYMM-NNNN (null while pending)
  issued_at           timestamptz,
  issued_by_admin     uuid references public.admins(profile_id),

  -- Financial snapshot (frozen at issuance; not refreshed when order updates)
  subtotal_thb        numeric(12,2) not null,
  vat_thb             numeric(12,2) not null,
  total_thb           numeric(12,2) not null,
  vat_mode            text not null check (vat_mode in ('inclusive','exclusive')) default 'inclusive',
  payment_method      text not null,

  -- Storage
  pdf_storage_path    text,                          -- "{profile_id}/{INV-...}.pdf"

  -- Cancellation
  cancelled_at        timestamptz,
  cancelled_by_admin  uuid references public.admins(profile_id),
  cancellation_reason text,
  credit_note_id      uuid references public.tax_invoices(id),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- A tax invoice MUST point to exactly one source order — not both, not neither.
  constraint tax_invoices_one_parent_order check (
    (order_h_no is not null and forwarder_f_no is null) or
    (order_h_no is null     and forwarder_f_no is not null)
  ),
  -- When status='issued', the serial + issued metadata must all be set.
  constraint tax_invoices_issued_has_serial check (
    status <> 'issued' or (
      serial_no       is not null and
      issued_at       is not null and
      issued_by_admin is not null
    )
  )
);

create index if not exists tax_invoices_profile_status_idx
  on public.tax_invoices(profile_id, status);
create index if not exists tax_invoices_serial_idx
  on public.tax_invoices(serial_no) where serial_no is not null;
create index if not exists tax_invoices_issued_at_idx
  on public.tax_invoices(issued_at desc) where status = 'issued';
create index if not exists tax_invoices_order_idx
  on public.tax_invoices(order_h_no) where order_h_no is not null;
create index if not exists tax_invoices_forwarder_idx
  on public.tax_invoices(forwarder_f_no) where forwarder_f_no is not null;

drop trigger if exists tax_invoices_updated_at_trigger on public.tax_invoices;
create trigger tax_invoices_updated_at_trigger
  before update on public.tax_invoices
  for each row execute function public.set_updated_at();

-- 3) Tax invoice line items ----------------------------------------
create table if not exists public.tax_invoice_lines (
  id              uuid primary key default gen_random_uuid(),
  tax_invoice_id  uuid not null references public.tax_invoices(id) on delete cascade,
  position        int  not null,
  description     text not null,
  qty             numeric(12,2) not null,
  unit_price_thb  numeric(12,2) not null,
  amount_thb      numeric(12,2) not null,
  vat_thb         numeric(12,2) not null,
  created_at      timestamptz not null default now()
);

create unique index if not exists tax_invoice_lines_invoice_position_uidx
  on public.tax_invoice_lines(tax_invoice_id, position);

-- 4) Atomic serial generator ---------------------------------------
-- INV-YYYYMM-NNNN with monthly counter reset (Bangkok timezone).
-- Concurrent calls serialise on the upsert lock (Postgres handles
-- the conflict path under SERIALIZABLE or read-committed both).
create or replace function public.next_tax_invoice_serial()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yyyymm text := to_char(now() at time zone 'Asia/Bangkok', 'YYYYMM');
  seq    int;
begin
  insert into public.tax_invoice_seq (period_yyyymm, next_seq)
    values (yyyymm, 2)
    on conflict (period_yyyymm) do update
      set next_seq   = tax_invoice_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'INV-' || yyyymm || '-' || lpad(seq::text, 4, '0');
end;
$$;

-- Lock function access: only service_role (server actions) calls this.
-- App-layer adminMarkTaxInvoiceIssued already gates by withAdmin.
revoke all      on function public.next_tax_invoice_serial() from public, authenticated, anon;
grant  execute  on function public.next_tax_invoice_serial() to service_role;

-- 5) RLS -----------------------------------------------------------
alter table public.tax_invoice_seq   enable row level security;
alter table public.tax_invoices      enable row level security;
alter table public.tax_invoice_lines enable row level security;

-- tax_invoices: customer reads own; super/accounting full access
drop policy if exists tax_invoices_self_read on public.tax_invoices;
create policy tax_invoices_self_read
  on public.tax_invoices for select
  using (profile_id = auth.uid());

drop policy if exists tax_invoices_admin_all on public.tax_invoices;
create policy tax_invoices_admin_all
  on public.tax_invoices for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- tax_invoice_lines: customer reads via parent invoice ownership
drop policy if exists tax_invoice_lines_via_parent_read on public.tax_invoice_lines;
create policy tax_invoice_lines_via_parent_read
  on public.tax_invoice_lines for select
  using (
    exists (
      select 1 from public.tax_invoices ti
       where ti.id          = tax_invoice_lines.tax_invoice_id
         and (ti.profile_id = auth.uid()
              or public.is_admin(array['super','accounting']))
    )
  );

drop policy if exists tax_invoice_lines_admin_write on public.tax_invoice_lines;
create policy tax_invoice_lines_admin_write
  on public.tax_invoice_lines for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- tax_invoice_seq: admin-only (the serial generator function bypasses RLS
-- via security definer, but the table itself stays locked down).
drop policy if exists tax_invoice_seq_admin_all on public.tax_invoice_seq;
create policy tax_invoice_seq_admin_all
  on public.tax_invoice_seq for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- 6) Comments ------------------------------------------------------
comment on table  public.tax_invoices is
  'Tax invoices issued to customers per Thai Revenue Department Code 86. Once status=issued, the header is immutable (no row updates from app layer). See ADR-0006.';
comment on column public.tax_invoices.serial_no is
  'Format INV-YYYYMM-NNNN (Bangkok timezone monthly reset). Set ONLY via next_tax_invoice_serial() at issuance.';
comment on column public.tax_invoices.credit_note_id is
  'When this row is itself a credit note (ใบลดหนี้), points back to the cancelled original tax invoice.';
comment on constraint tax_invoices_one_parent_order on public.tax_invoices is
  'Each tax invoice must point to exactly one parent order (cargo-import OR China-shop), not both, not neither.';
comment on constraint tax_invoices_issued_has_serial on public.tax_invoices is
  'Defensive: when status=issued, the serial_no + issued_at + issued_by_admin must all be populated.';

comment on table  public.tax_invoice_lines is
  'Line items snapshot at issuance. Position-ordered for stable rendering.';

comment on function public.next_tax_invoice_serial is
  'Atomic serial generator for tax invoices. INV-YYYYMM-NNNN with monthly counter reset (Bangkok timezone). Concurrent calls serialise on the upsert lock.';
