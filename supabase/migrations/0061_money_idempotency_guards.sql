-- ════════════════════════════════════════════════════════════
-- 0061 · Money idempotency guards — P0-1 + P1-2 + P1-4
-- ════════════════════════════════════════════════════════════
-- Pre-launch money audit [docs/research/audit-money-billing-2026-05-17.md].
-- Three independent, idempotent, RLS-neutral changes. Zero data
-- migration. Safe to apply on prod live.
--
-- ── P0-1 — cost-adjustment tx poisons the main-payment idempotency ──
-- `adminMarkCostAdjustmentPaid` (actions/admin/forwarder-cost-adjustments.ts)
-- wrote a wallet_transactions row with the tuple
--   (kind='import_payment', reference_type='forwarder', reference_id=f_no,
--    status='completed')
-- — IDENTICAL to the tuple `payForwarderFromWallet` + `adminMarkForwarderPaid`
-- query for their check-then-act idempotency. A paid cost adjustment made the
-- main forwarder payment conclude `already_paid` and SKIP the big debit →
-- Pacred ships the import having collected only the small fee.
--
-- Fix: give cost adjustments their own `kind` value ('cost_adjustment').
-- This migration extends the wallet_transactions.kind CHECK to allow it; the
-- action is updated to write kind='cost_adjustment'. The idempotency SELECTs
-- in both callers filter `.eq("kind","import_payment")` → they can no longer
-- match a cost-adjustment row.
--
-- Also adds a 0049-style partial-unique index on the forwarder main-payment
-- slice — once `kind` disambiguates it, ≤1 completed import_payment per
-- forwarder is enforced at the DB level (the actions catch 23505 + re-SELECT).
--
-- ── P1-2 — recordFreightPayment has no double-submit guard ──
-- An admin double-click / form re-POST inserts the same freight payment
-- twice → invoice flips to overpaid. Mirror of the F-11 fix (0049): add a
-- partial-unique index on (freight_invoice_id, bank_ref) for the recorded
-- slice; the action catches 23505.
--
-- ── P1-4 — requestTaxInvoice can create duplicate pending invoices ──
-- Concurrent requests both pass the check-then-act SELECT → two pending
-- tax_invoices for one order → RD Code 86 numbering risk if both issue.
-- Mirror of withholding_tax_entries (0044): one non-cancelled invoice per
-- order_h_no / forwarder_f_no, enforced via partial-unique index.
-- ════════════════════════════════════════════════════════════

-- ── P0-1 (a) — extend wallet_transactions.kind CHECK with 'cost_adjustment' ──
-- The CHECK was created inline in 0007 → Postgres auto-named it
-- `wallet_transactions_kind_check`. Drop + recreate with the extra value.
-- Idempotent: drop-if-exists, and the new constraint is a strict superset
-- so re-applying never rejects existing rows.
alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_kind_check;

alter table public.wallet_transactions
  add constraint wallet_transactions_kind_check check (kind in (
    'deposit','withdraw','refund','adjustment',
    'order_payment','order_top_up',
    'import_payment','import_top_up',
    'yuan_payment',
    'cashback_earn','cashback_redeem',
    'cost_adjustment'
  ));

comment on constraint wallet_transactions_kind_check on public.wallet_transactions is
  '0061 — extends 0007 with cost_adjustment (P0-1: forwarder post-delivery cost adjustments get their own kind so they no longer poison the main import_payment idempotency check).';

-- ── P0-1 (b) — partial-unique guard on the forwarder main-payment slice ──
-- Mirrors wallet_tx_order_payment_uniq (0049) but for the forwarder side.
-- After P0-1 (a), cost adjustments use kind='cost_adjustment' so they fall
-- OUTSIDE this slice — the index constrains only the genuine main payment.
create unique index if not exists wallet_tx_import_payment_uniq
  on public.wallet_transactions (reference_id)
  where reference_type = 'forwarder'
    and kind           = 'import_payment'
    and status         = 'completed';

comment on index public.wallet_tx_import_payment_uniq is
  '0061/P0-1 — DB guard against double-debit on forwarder pay-from-wallet. Partial unique on completed import_payment per forwarder f_no. payForwarderFromWallet + adminMarkForwarderPaid catch 23505 + re-SELECT for idempotent retry. Cost adjustments use kind=cost_adjustment so they are excluded.';

-- ── P1-2 — partial-unique guard against freight-payment double-submit ──
-- One bank_ref records a freight payment once. NULL bank_ref rows (cash /
-- wallet entries with no transfer ref) are excluded — the partial WHERE
-- skips them so they are never blocked.
create unique index if not exists freight_payment_bank_ref_uniq
  on public.freight_invoice_payments (freight_invoice_id, bank_ref)
  where status = 'recorded' and bank_ref is not null;

comment on index public.freight_payment_bank_ref_uniq is
  '0061/P1-2 — DB guard against double-recording a freight invoice payment. Partial unique on (freight_invoice_id, bank_ref) for the recorded slice. recordFreightPayment catches 23505. Cash/wallet rows with NULL bank_ref are excluded.';

-- ── P1-4 — one non-cancelled tax invoice per order / forwarder ──
-- Mirrors wht_one_per_order_uidx / wht_one_per_forwarder_uidx (0044).
-- Cancelled invoices are excluded so a customer can re-request after a
-- cancellation. requestTaxInvoice catches 23505 + re-SELECTs idempotently.
create unique index if not exists tax_invoice_one_per_order_uidx
  on public.tax_invoices (order_h_no)
  where order_h_no is not null and status <> 'cancelled';

create unique index if not exists tax_invoice_one_per_forwarder_uidx
  on public.tax_invoices (forwarder_f_no)
  where forwarder_f_no is not null and status <> 'cancelled';

comment on index public.tax_invoice_one_per_order_uidx is
  '0061/P1-4 — at most one non-cancelled tax invoice per service-order h_no (RD Code 86 numbering safety). requestTaxInvoice catches 23505 + re-SELECTs.';
comment on index public.tax_invoice_one_per_forwarder_uidx is
  '0061/P1-4 — at most one non-cancelled tax invoice per forwarder f_no (RD Code 86 numbering safety). requestTaxInvoice catches 23505 + re-SELECTs.';
