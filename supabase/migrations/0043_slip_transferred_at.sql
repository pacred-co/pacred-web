-- ════════════════════════════════════════════════════════════
-- V-A1 · slip_transferred_at — record the customer's actual transfer
-- time (from the slip), not the admin's approval-click time.
-- ════════════════════════════════════════════════════════════
-- Per PORT_PLAN Part V row V-A1 + cargo-ops-forensics audit. Today
-- wallet_transactions.created_at gets stamped when the customer
-- submits the deposit request, and admin approvals (status flip
-- to 'completed') happen later — neither matches the bank slip's
-- timestamp. Accounting reports want to bucket by actual transfer
-- date to reconcile against bank statements.
--
-- Add slip_transferred_at to:
--   - public.wallet_transactions (covers all deposits/refunds/etc.)
--   - public.yuan_payments       (Alipay payouts)
--
-- Customer-side flow can capture this at slip upload (V2);
-- admin-side flow exposes inline editor + audits changes
-- via the new adminSet*SlipTransferredAt actions (this batch).
--
-- Additive + idempotent. (ภูม — V-A1 ภูม-lane.)
-- ════════════════════════════════════════════════════════════

alter table public.wallet_transactions
  add column if not exists slip_transferred_at timestamptz;

create index if not exists wallet_transactions_slip_transferred_at_idx
  on public.wallet_transactions(slip_transferred_at) where slip_transferred_at is not null;

comment on column public.wallet_transactions.slip_transferred_at is
  'V-A1: actual bank-transfer time as printed on the customer slip. Distinct from created_at (request time) and the implicit approval-time (when status flips to completed). NULL = not yet recorded. Editable by super/accounting via adminSetWalletTxSlipTransferredAt; audited.';

alter table public.yuan_payments
  add column if not exists slip_transferred_at timestamptz;

create index if not exists yuan_payments_slip_transferred_at_idx
  on public.yuan_payments(slip_transferred_at) where slip_transferred_at is not null;

comment on column public.yuan_payments.slip_transferred_at is
  'V-A1: actual bank-transfer time as printed on the customer slip. Same purpose as on wallet_transactions.';
