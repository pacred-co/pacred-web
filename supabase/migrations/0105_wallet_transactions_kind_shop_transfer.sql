-- ════════════════════════════════════════════════════════════
-- 0105 · Extend wallet_transactions.kind to include 'shop_transfer_out'
-- ════════════════════════════════════════════════════════════
-- Sprint-2 P1.2 — when a customer moves money from their personal
-- wallet (main bucket) to their shop wallet (tb_wallet_shop) we
-- record the debit side on `wallet_transactions` with a new kind:
-- `shop_transfer_out`. The credit side lands in tb_shop_transactions
-- as `transfer_in` (already in 0104's check constraint).
--
-- The default wallet_transactions.kind constraint (defined in 0007)
-- doesn't include `shop_transfer_out` so an INSERT would fail with
-- the existing CHECK. We rebuild the constraint here to add it; the
-- list is otherwise unchanged.
--
-- Idempotent — safe to re-run (constraint dropped + recreated).
-- ════════════════════════════════════════════════════════════

alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_kind_check;

-- Note: 'cost_adjustment' was added by 0061_money_idempotency_guards;
-- 'shop_transfer_out' is the new one for the shop-wallet transfer flow.
alter table public.wallet_transactions
  add constraint wallet_transactions_kind_check
  check (kind in (
    'deposit', 'withdraw', 'refund', 'adjustment',
    'order_payment', 'order_top_up',
    'import_payment', 'import_top_up',
    'yuan_payment',
    'cashback_earn', 'cashback_redeem',
    'cost_adjustment',
    'shop_transfer_out'
  ));

comment on constraint wallet_transactions_kind_check on public.wallet_transactions is
  'Allowed transaction kinds. Extended over time — current set: deposit/withdraw/refund/adjustment (0007), order_payment/order_top_up/import_payment/import_top_up/yuan_payment (0007), cashback_earn/cashback_redeem (0007), cost_adjustment (0061), shop_transfer_out (0105).';
