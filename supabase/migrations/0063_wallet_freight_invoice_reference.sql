-- ════════════════════════════════════════════════════════════
-- 0063 · Wallet ↔ freight-invoice bridge — W-3 (gap-schema-security G-3)
-- ════════════════════════════════════════════════════════════
-- Per [docs/research/PACRED-MASTER-STRATEGY.md] §2 (the wallet-leak chain)
-- + [docs/research/gap-schema-security.md] G-3.
--
-- ── The hole ────────────────────────────────────────────────────────
-- freight_invoice_payments.method (migration 0052) accepts 'wallet', but
-- wallet_transactions.reference_type (migration 0007) is a closed 4-value
-- enum — ('order_header','forwarder','yuan_payment','manual') — with NO
-- 'freight_invoice' value. So recordFreightPayment, on method='wallet',
-- COULD NOT insert a wallet debit even if it wanted to: the CHECK would
-- reject it. The action therefore skipped the debit entirely (documented
-- in-code as "follow-up V-E7.1"). Net effect: recording a freight payment
-- as 'wallet' flipped the invoice to paid WITHOUT ever reducing the
-- customer's wallet balance — a free shipment. Same bug class as the
-- already-fixed money-audit P0-2 (yuan wallet debit), but for freight.
--
-- ── The fix (two idempotent, RLS-neutral, zero-data changes) ────────
-- (a) Extend wallet_transactions.reference_type CHECK with
--     'freight_invoice' so a freight wallet debit has a legitimate way in.
-- (b) Add a partial-unique guard on the freight-payment wallet slice,
--     mirroring wallet_tx_order_payment_uniq (0049) and
--     wallet_tx_import_payment_uniq (0061) — so a double-submit of one
--     freight payment cannot double-debit the wallet. The bridge is
--     keyed PER PAYMENT ROW: reference_id = freight_invoice_payments.id
--     (a freight invoice receives many partial payments — each is its own
--     debit; the unique key is therefore the payment row, not the invoice).
--
-- The matching code change lives in
-- actions/admin/freight-invoice-payments.ts::recordFreightPayment — on
-- method='wallet' it now inserts a completed wallet_transactions debit
-- (kind='import_payment', reference_type='freight_invoice') and checks the
-- insert error (a failed money insert fails the whole action). It mirrors
-- the cargo order_payment debit in payServiceOrderFromWallet.
--
-- Idempotent: drop-if-exists + the new CHECK is a strict superset of the
-- 0007 enum, so re-applying never rejects an existing row. The index uses
-- `if not exists`. Zero data migration. Safe to apply on prod live.
-- ════════════════════════════════════════════════════════════

-- ── (a) extend wallet_transactions.reference_type CHECK ──────────────
-- The CHECK was created inline in 0007 → Postgres auto-named it
-- `wallet_transactions_reference_type_check`. Drop + recreate with the
-- extra value. Strict superset → re-applying never rejects existing rows.
alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_reference_type_check;

alter table public.wallet_transactions
  add constraint wallet_transactions_reference_type_check check (
    reference_type in (
      'order_header','forwarder','yuan_payment','freight_invoice','manual'
    )
  );

comment on constraint wallet_transactions_reference_type_check on public.wallet_transactions is
  '0063 — extends 0007 with freight_invoice (W-3 / gap-schema-security G-3: a freight invoice paid via wallet now writes a real wallet_transactions debit instead of flipping the invoice to paid with no debit — closing the free-shipment leak). reference_id for this type = the freight_invoice_payments row id (1 debit per partial payment).';

-- ── (b) partial-unique guard against freight-payment wallet double-debit ──
-- Mirrors wallet_tx_order_payment_uniq (0049) + wallet_tx_import_payment_uniq
-- (0061). The freight wallet debit is keyed on the PAYMENT row id
-- (reference_id = freight_invoice_payments.id) — so the slice
-- (reference_type='freight_invoice', kind='import_payment',
--  status='completed') is unique per payment row. A double-submit of the
-- same freight payment (admin double-click / form re-POST) raises 23505;
-- recordFreightPayment catches it + re-SELECTs the canonical debit.
create unique index if not exists wallet_tx_freight_payment_uniq
  on public.wallet_transactions (reference_id)
  where reference_type = 'freight_invoice'
    and kind           = 'import_payment'
    and status         = 'completed';

comment on index public.wallet_tx_freight_payment_uniq is
  '0063/W-3 — DB guard against double-debit on freight invoice pay-from-wallet. Partial unique on completed import_payment per freight_invoice_payments row id. recordFreightPayment catches 23505 + re-SELECTs for idempotent retry.';
