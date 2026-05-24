-- ════════════════════════════════════════════════════════════
-- V-A5 · invoice_adjustments (manual ±amount line on any invoice)
-- ════════════════════════════════════════════════════════════
-- Per PORT_PLAN Part V row V-A5:
--   "Manual adjustment line on an invoice (±amount, reason, audited)
--    — ends the per-cent dev tickets"
--
-- LEGACY CONTEXT
-- Legacy PCS Cargo (`/Users/dev/Desktop/pcs-realshit/...pcs-admin/
-- include/pages/receipt.php` etc.) had no clean adjustment line — every
-- per-cent correction (over-collected 50 THB, late discount, manual
-- waive) required a developer to rewrite invoice totals by hand. The
-- chat audit (`docs/audit/chat-analysis-2026-05-16.md`) records this
-- as a recurring staff pain point.
--
-- V-A5 is a Pacred safety+productivity improvement on top of the
-- faithful port — ops staff get self-serve power to record a signed
-- adjustment on any invoice without touching the base line items.
--
-- DESIGN
-- One polymorphic adjustments table covering all 3 invoice kinds
-- Pacred currently issues:
--   - target_type = 'forwarder'       (imported cargo invoice)
--   - target_type = 'service_order'   (China-shop invoice)
--   - target_type = 'freight_invoice' (freight commercial invoice)
--
-- target_id stores the human-readable identifier:
--   - forwarder      → forwarders.f_no   (e.g. "F2024010001")
--   - service_order  → service_orders.h_no
--   - freight_invoice → freight_invoices.id (uuid as text)
--
-- amount_thb is SIGNED:
--   - positive → surcharge (extra fee added to invoice total)
--   - negative → discount (credit on invoice total)
--
-- An adjustment is *standalone* — it does NOT auto-debit the wallet
-- (that's forwarder_cost_adjustments' job for the W-4 post-delivery
-- rebill flow). V-A5 is for invoice-level corrections that flow into
-- the printable receipt total but don't move money on their own. If
-- ops needs to also move money, they pair the adjustment with an
-- existing /admin/refunds row OR a forwarder_cost_adjustments row.
--
-- STATUS
--   active     — included in invoice total
--   reversed   — admin reversed (still visible in history, excluded
--                from total)
--
-- AUDIT
-- Every create + reverse writes admin_audit_log via the action helper.
-- This table also stores added_by_admin + reversed_by_admin directly
-- so the receipt page can render the audit trail inline.
--
-- RLS
-- Customer reads own (via profile_id) so the receipt page shows the
-- adjustment line to them. Admin (super/accounting) full access.
-- Why not ops? V-A5 is money-touching — accounting boundary per
-- ADR-0005 K-7. Ops can request via the W-4 cost-adjustment path
-- instead.
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

create table if not exists public.invoice_adjustments (
  id                  uuid primary key default gen_random_uuid(),

  -- Polymorphic invoice reference. target_type+target_id together
  -- identify the parent invoice. No FK on target_id because it spans
  -- 3 different tables — validation happens at the action layer.
  target_type         text not null check (target_type in (
                        'forwarder',
                        'service_order',
                        'freight_invoice'
                      )),
  target_id           text not null,

  -- Customer this invoice belongs to (denormalized for RLS speed +
  -- so the customer's receipt page can SELECT WHERE profile_id =
  -- auth.uid() without joining the parent invoice every read).
  profile_id          uuid not null references public.profiles(id) on delete restrict,

  -- SIGNED amount — positive = surcharge, negative = discount.
  -- Constraint: must be non-zero (zero adjustment is meaningless).
  amount_thb          numeric(12,2) not null check (amount_thb <> 0),

  -- Reason is REQUIRED — the whole point of V-A5 vs a silent code
  -- patch is that the auditor can read WHY without paging a dev.
  reason              text not null check (length(trim(reason)) >= 3),

  -- Status — active rows count toward invoice total, reversed don't.
  status              text not null check (status in ('active','reversed')) default 'active',

  -- Bookkeeping. FK to profiles(id) NOT admins(profile_id) per the
  -- 0033/0034/0038 pattern (admins has composite PK).
  added_by_admin      uuid not null references public.profiles(id),
  reversed_at         timestamptz,
  reversed_by_admin   uuid references public.profiles(id),
  reversal_reason     text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Defensive: when status='reversed', the reversal metadata must
  -- all be populated.
  constraint inv_adj_reversed_has_meta check (
    status <> 'reversed' or (
      reversed_at        is not null and
      reversed_by_admin  is not null and
      reversal_reason    is not null and length(trim(reversal_reason)) >= 3
    )
  )
);

-- Fast lookup: invoice-detail page reads all adjustments for one
-- (target_type, target_id) — covered by the composite index.
create index if not exists invoice_adjustments_target_idx
  on public.invoice_adjustments(target_type, target_id, status, created_at desc);
create index if not exists invoice_adjustments_profile_idx
  on public.invoice_adjustments(profile_id, status);
create index if not exists invoice_adjustments_added_by_idx
  on public.invoice_adjustments(added_by_admin, created_at desc);

drop trigger if exists invoice_adjustments_updated_at_trigger on public.invoice_adjustments;
create trigger invoice_adjustments_updated_at_trigger
  before update on public.invoice_adjustments
  for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────
alter table public.invoice_adjustments enable row level security;

-- Customer reads own (receipt page shows the line + reason)
drop policy if exists invoice_adjustments_self_read on public.invoice_adjustments;
create policy invoice_adjustments_self_read
  on public.invoice_adjustments for select
  using (profile_id = auth.uid());

-- Admin (super OR accounting — money-touching gate per ADR-0005 K-7)
-- full access. ops is INTENTIONALLY excluded — see header comment.
drop policy if exists invoice_adjustments_admin_all on public.invoice_adjustments;
create policy invoice_adjustments_admin_all
  on public.invoice_adjustments for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- ── Helper view: per-invoice adjustment total ──────────────────────
-- A scoped sum (status='active' only) used by the action layer + by
-- the receipt page to compute the adjusted total. Defined as a view
-- so we don't recompute the SUM in every consumer.
create or replace view public.invoice_adjustment_totals
with (security_invoker = true) as
  select
    target_type,
    target_id,
    profile_id,
    sum(amount_thb)                                  as adjustment_total_thb,
    sum(amount_thb) filter (where amount_thb > 0)    as surcharge_total_thb,
    sum(amount_thb) filter (where amount_thb < 0)    as discount_total_thb,
    count(*)                                         as adjustment_count
  from public.invoice_adjustments
  where status = 'active'
  group by target_type, target_id, profile_id;

-- ── Comments ─────────────────────────────────────────────────────────
comment on table public.invoice_adjustments is
  'V-A5: manual ±amount adjustment line on any invoice (forwarder/service_order/freight_invoice). Pacred safety+productivity improvement over legacy PCS Cargo — ends the per-cent dev tickets that the legacy receipt.php flow required. amount_thb is SIGNED (+ surcharge / - discount). Reason required + every mutation writes admin_audit_log.';
comment on column public.invoice_adjustments.target_type is
  'Polymorphic invoice kind: forwarder | service_order | freight_invoice. target_id stores the human-readable identifier (f_no / h_no / uuid).';
comment on column public.invoice_adjustments.amount_thb is
  'Signed THB. Positive = surcharge added to invoice total. Negative = discount/credit.';
comment on column public.invoice_adjustments.reason is
  'WHY this adjustment exists — required for audit. Min 3 chars.';
comment on column public.invoice_adjustments.status is
  'active rows count toward the invoice total. reversed rows stay visible in history but are excluded from totals.';
comment on view public.invoice_adjustment_totals is
  'V-A5 helper: per-invoice (target_type, target_id) totals of active adjustments. surcharge_total_thb counts +amounts; discount_total_thb counts -amounts; adjustment_total_thb is the signed sum. SECURITY INVOKER so RLS on invoice_adjustments still applies.';
