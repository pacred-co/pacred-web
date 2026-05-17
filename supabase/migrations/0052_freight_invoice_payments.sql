-- ════════════════════════════════════════════════════════════
-- V-E7 · freight_invoice_payments — payment ledger + receipt layer
-- ════════════════════════════════════════════════════════════
-- Per [docs/port-specs/freight-receipt-and-payment.md].
--
-- V-E1 (migrations 0050 + 0051) shipped freight_shipments + freight_invoices
-- + freight_invoice_lines. V-E7 adds the PAYMENT side: one freight_invoices
-- row can receive many partial payments over weeks (ledger pattern, mirror
-- the F-11 forwarder-payment design). When sum(payments) >= total the
-- invoice's payment_status flips to paid; the receipt PDF re-renders with a
-- "ได้รับเงินแล้ว" stamp.
--
-- ── Two independent state axes on freight_invoices ──────────────────
-- freight_invoices.status        = DOCUMENT lifecycle  : draft → issued → cancelled
--                                  (migration 0051 — DO NOT repurpose)
-- freight_invoices.payment_status = PAYMENT settlement  : unpaid → partial
--                                                          → paid → overpaid
--                                  (this migration — recomputed from the
--                                   payments ledger by the server action)
-- The V-E7 spec (written 2026-05-16, before 0051) assumed status carried
-- BOTH meanings. It doesn't. We keep status as the document lifecycle and
-- add payment_status as a SEPARATE column so neither axis clobbers the
-- other. A cancelled invoice can still be 'paid' historically; an issued
-- invoice progresses unpaid → partial → paid as money arrives.
--
-- ── WHT gate (defensive) ────────────────────────────────────────────
-- The spec wants receipt issuance gated on withholding_tax_entries
-- cert_status (mirror tax_invoices). But that table (migration 0044) keys
-- its parent via order_h_no XOR forwarder_f_no ONLY — there is NO
-- freight_shipment_id / freight_invoice_id column. So freight WHT linkage
-- does not exist yet. V-E7 implements the gate DEFENSIVELY in the server
-- action: when no WHT row can be found for the freight job, issuance is
-- allowed freely. Wiring real freight↔WHT linkage = follow-up V-A6.1
-- (would add freight_invoice_id to withholding_tax_entries + relax its
-- XOR constraint). No schema change here for that — documented only.
--
-- This migration introduces:
--   1. freight_invoices.payment_status  — new column + CHECK + default
--   2. freight_invoices.fully_paid_at   — timestamp the ledger first cleared
--   3. freight_invoice_payments         — the partial-pay ledger table
--   4. Indexes
--   5. RLS — customer reads own (join to freight_invoices.profile_id);
--            admin super/ops/accounting full
--   6. Storage bucket 'freight-payment-slips' — private (mirror wht-certs)
--   7. Comments
--
-- Idempotent — safe to re-run. 0052 confirmed free per
-- docs/runbook/poom-phase-i2-prep.md migration map.
-- ════════════════════════════════════════════════════════════

-- 1) freight_invoices.payment_status — payment settlement axis ----------
-- Added separately from status (document lifecycle). Recomputed by
-- actions/admin/freight-invoice-payments.ts after every payment insert.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'freight_invoices'
       and column_name  = 'payment_status'
  ) then
    alter table public.freight_invoices
      add column payment_status text not null default 'unpaid'
        check (payment_status in ('unpaid', 'partial', 'paid', 'overpaid'));
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'freight_invoices'
       and column_name  = 'fully_paid_at'
  ) then
    alter table public.freight_invoices
      add column fully_paid_at timestamptz;
  end if;
end$$;

-- Lookup index for "outstanding invoices" admin queries.
create index if not exists freight_invoices_payment_status_idx
  on public.freight_invoices(payment_status);

-- 2) freight_invoice_payments — partial-pay ledger ----------------------
-- One row per payment received against an invoice. Append-only in spirit:
-- a mistaken payment is voided (status='voided' + reason), never deleted,
-- so the ledger stays a faithful audit trail.
create table if not exists public.freight_invoice_payments (
  id                    uuid primary key default gen_random_uuid(),

  freight_invoice_id    uuid not null references public.freight_invoices(id) on delete restrict,
  -- Denormalised for RLS query speed — must equal the invoice's profile_id
  -- (enforced by the server action; no live FK-pair CHECK since RLS reads
  -- this column directly and we trust the service-role insert path).
  profile_id            uuid not null references public.profiles(id) on delete restrict,

  -- Payment method — manual entry V1 (no external gateway until T+30d).
  method                text not null
                          check (method in ('cash', 'bank_transfer', 'wallet')),

  -- Amount received (THB only V1). Positive.
  amount_thb            numeric(14,2) not null
                          check (amount_thb > 0 and amount_thb <= 999999999.99),

  -- When the money actually moved (bank-print time for transfers — mirror
  -- wallet_transactions.slip_transferred_at per V-A1, NOT the record time).
  paid_at               timestamptz not null default now(),

  -- Bank-transfer evidence (optional). Path in 'freight-payment-slips'.
  slip_storage_path     text,
  bank_ref              text,

  -- Voiding metadata (mistaken entry — kept for audit, never hard-deleted).
  status                text not null default 'recorded'
                          check (status in ('recorded', 'voided')),
  voided_at             timestamptz,
  voided_by_admin_id    uuid references public.profiles(id),
  void_reason           text,

  -- Audit
  recorded_by_admin_id  uuid not null references public.profiles(id),
  notes                 text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- A voided payment must carry the void metadata (audit completeness —
  -- ADR-0014 pattern, mirror freight_invoices_cancelled_has_reason).
  constraint freight_invoice_payments_voided_has_reason check (
    status <> 'voided' or (voided_at is not null and void_reason is not null)
  )
);

-- Indexes ---------------------------------------------------------------
create index if not exists freight_invoice_payments_invoice_idx
  on public.freight_invoice_payments(freight_invoice_id);
create index if not exists freight_invoice_payments_profile_idx
  on public.freight_invoice_payments(profile_id);
create index if not exists freight_invoice_payments_invoice_status_idx
  on public.freight_invoice_payments(freight_invoice_id, status);
create index if not exists freight_invoice_payments_paid_at_idx
  on public.freight_invoice_payments(paid_at desc);

drop trigger if exists freight_invoice_payments_updated_at_trigger on public.freight_invoice_payments;
create trigger freight_invoice_payments_updated_at_trigger
  before update on public.freight_invoice_payments
  for each row execute function public.set_updated_at();

-- 3) RLS ----------------------------------------------------------------
alter table public.freight_invoice_payments enable row level security;

-- Customer reads payments on their OWN invoices. The denormalised
-- profile_id makes this a flat predicate (no join) — fast for the
-- customer portal payment-history list.
drop policy if exists freight_invoice_payments_customer_read on public.freight_invoice_payments;
create policy freight_invoice_payments_customer_read
  on public.freight_invoice_payments for select
  using (profile_id = auth.uid());

-- Admin (super + ops + accounting): full read+write. ops can see the
-- ledger to support customers; financial mutations all flow through the
-- server action which gates super/ops/accounting (matches 0051's
-- freight_invoices_admin_all role set so ops can operate the panel).
drop policy if exists freight_invoice_payments_admin_all on public.freight_invoice_payments;
create policy freight_invoice_payments_admin_all
  on public.freight_invoice_payments for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

-- 4) Storage bucket 'freight-payment-slips' -----------------------------
-- Private bucket for bank-transfer slips. Mirror 'wht-certs' (0044) +
-- 'tax-invoices' (0035): customer-folder read policy + admin read policy;
-- all writes flow through service_role inside the server action.
-- Path layout: freight-payment-slips/{profile_id}/{invoice_no}-{stamp}.{ext}
insert into storage.buckets (id, name, public)
values ('freight-payment-slips', 'freight-payment-slips', false)
on conflict (id) do nothing;

-- Customer-side read: authenticated user can read slips filed under their
-- own {profile_id}/ folder.
drop policy if exists "freight_payment_slips_user_read" on storage.objects;
create policy "freight_payment_slips_user_read"
  on storage.objects for select
  using (
    bucket_id = 'freight-payment-slips'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admin read: super + ops + accounting can read any slip (support, audit).
drop policy if exists "freight_payment_slips_admin_read" on storage.objects;
create policy "freight_payment_slips_admin_read"
  on storage.objects for select
  using (
    bucket_id = 'freight-payment-slips'
    and public.is_admin(array['super','ops','accounting'])
  );

-- No INSERT/UPDATE/DELETE policies — writes go through service_role inside
-- actions/admin/freight-invoice-payments.ts. Default-deny otherwise.

-- 5) Comments -----------------------------------------------------------
comment on column public.freight_invoices.payment_status is
  'PAYMENT settlement axis (V-E7) — unpaid → partial → paid → overpaid. Recomputed from the freight_invoice_payments ledger by the server action. Distinct from .status (DOCUMENT lifecycle: draft/issued/cancelled). Both axes are independent.';
comment on column public.freight_invoices.fully_paid_at is
  'Timestamp the ledger first reached paid/overpaid. Drives the "ได้รับเงินแล้ว" stamp + payment date on the freight receipt PDF.';

comment on table  public.freight_invoice_payments is
  'V-E7 — partial-payment ledger for freight_invoices. One invoice receives many payments over time; sum(recorded) drives freight_invoices.payment_status. Voided rows kept for audit (never hard-deleted).';
comment on column public.freight_invoice_payments.profile_id is
  'Denormalised from the parent invoice for flat RLS predicate. The server action enforces it equals freight_invoices.profile_id.';
comment on column public.freight_invoice_payments.method is
  'Manual-entry payment methods V1: cash / bank_transfer (optional slip) / wallet. External payment gateway = T+30d, out of V1 scope.';
comment on column public.freight_invoice_payments.paid_at is
  'When the money actually moved (bank-print time for transfers, mirror wallet_transactions.slip_transferred_at) — NOT the admin record time (created_at).';
comment on column public.freight_invoice_payments.status is
  'recorded (counts toward the invoice paid total) → voided (mistaken entry, excluded from the total, kept for audit with void_reason).';
comment on constraint freight_invoice_payments_voided_has_reason on public.freight_invoice_payments is
  'A voided payment MUST carry voided_at + void_reason — audit-trail completeness (ADR-0014 pattern).';
