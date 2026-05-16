-- ════════════════════════════════════════════════════════════
-- F-11 / G9 · wallet_transactions partial-unique guard for order_payment
-- ════════════════════════════════════════════════════════════
-- Per [docs/runbook/poom-handoff-2026-05-16.md] §F-11 (เดฟ → ภูม,
-- T-D1 re-audit 2026-05-17 finding G9).
--
-- Problem: `payServiceOrderFromWallet` + `adminMarkServiceOrderPaid`
-- use check-then-act idempotency (SELECT existing completed tx →
-- INSERT if none). Under concurrent submits (2 tabs / back-button /
-- API replay), both can pass the SELECT and both INSERT, causing a
-- double-debit. Pay button's `disabled={pending}` client-side guard
-- blocks the common case but cannot stop the residual race.
--
-- This migration adds a DB-level partial-unique index keyed on
-- (reference_id) for the completed-order_payment slice of
-- wallet_transactions — so the second concurrent INSERT raises
-- 23505 and the actions can catch + re-SELECT idempotently.
--
-- Why partial:
-- - `wallet_transactions` carries many kinds (deposit, withdraw, etc).
--   The uniqueness rule is "≤1 COMPLETED order_payment per service
--   order" — specifically the (reference_type='order_header', kind=
--   'order_payment', status='completed') slice.
-- - Forwarder payments use `reference_type='forwarder'` — separate
--   slice, no collision risk.
-- - Yuan/wallet-deposit/etc. payments use other reference_types
--   and/or other kinds — also unaffected.
-- - reference_id repeats per kind/type globally — the partial WHERE
--   constrains the uniqueness to the order_payment slice only.
--
-- After this migration:
-- - actions/service-order.ts::payServiceOrderFromWallet
-- - actions/admin/service-orders.ts::adminMarkServiceOrderPaid
-- both wrap their wallet INSERT in a try-catch — on Postgres error
-- code '23505' (unique_violation) they re-SELECT the existing tx and
-- return { ok: true, data: { tx_id, already_paid: true } }. Existing
-- check-then-act SELECT stays as the fast path; the catch is the
-- atomic backstop.
--
-- Idempotent. Zero data migration. Safe to apply on prod live.
-- ════════════════════════════════════════════════════════════

create unique index if not exists wallet_tx_order_payment_uniq
  on public.wallet_transactions (reference_id)
  where reference_type = 'order_header'
    and kind           = 'order_payment'
    and status         = 'completed';

comment on index public.wallet_tx_order_payment_uniq is
  'F-11/G9 — DB-level guard against double-debit on pay-from-wallet. Partial unique on completed order_payment per service-order h_no. Actions catch 23505 + re-SELECT for idempotent retry.';
