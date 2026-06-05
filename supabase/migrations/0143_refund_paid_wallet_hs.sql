-- 0143 — Refund money-path repoint: link the paid refund credit to the
-- LEGACY ledger (tb_wallet_hs), not the dead rebuilt wallet_transactions.
--
-- Why: `actions/admin/refunds.ts → adminMarkRefundPaid` used to write the
-- customer refund credit into `wallet_transactions` (the rebuilt 0-row twin
-- that nobody reads for balance) — a §0e "reachable dead-write trap": admin
-- marks a refund paid → green toast → the customer's real wallet
-- (`tb_wallet.wallettotal` / `tb_wallet_hs`) never moved. The repoint writes
-- a real `tb_wallet_hs` type='5' (รายการคืนเงิน / refund credit) row +
-- increments `tb_wallet.wallettotal`, exactly like every other live money path.
--
-- `tb_wallet_hs.id` is a bigint sequence — it CANNOT go into the existing
-- `paid_wallet_tx_id uuid references wallet_transactions(id)` column, and the
-- `refund_requests_paid_consistent` CHECK requires that column NOT NULL when
-- status='paid'. So:
--   (1) add a nullable `paid_wallet_hs_id bigint` (the real ledger link), and
--   (2) WIDEN the paid-consistency CHECK to accept EITHER linkage.
--
-- Both changes are purely additive / widening:
--   • ADD COLUMN nullable bigint  → no table rewrite, no existing-row impact.
--   • CHECK is loosened (OR-branch added) → every pre-existing paid row (which
--     has a non-null paid_wallet_tx_id) still satisfies it, so the re-add's
--     validation pass cannot fail. New rows satisfy it via paid_wallet_hs_id.
--
-- No data is migrated or deleted. Old paid refunds keep their
-- paid_wallet_tx_id; new ones use paid_wallet_hs_id.

alter table public.refund_requests
  add column if not exists paid_wallet_hs_id bigint;

comment on column public.refund_requests.paid_wallet_hs_id is
  'Legacy ledger link — tb_wallet_hs.id of the type=5 refund-credit row written at mark-paid (the live money path). Coexists with the deprecated paid_wallet_tx_id (rebuilt wallet_transactions, no longer written). Exactly one is set on a paid row.';

-- Re-state the paid-consistency CHECK to accept either linkage.
alter table public.refund_requests
  drop constraint if exists refund_requests_paid_consistent;

alter table public.refund_requests
  add constraint refund_requests_paid_consistent check (
    status <> 'paid'
    or (
      paid_at is not null
      and paid_by_admin_id is not null
      and (paid_wallet_tx_id is not null or paid_wallet_hs_id is not null)
    )
  );
