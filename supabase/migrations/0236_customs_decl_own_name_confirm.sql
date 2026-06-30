-- 0236_customs_decl_own_name_confirm.sql (2026-07-01)
-- Freight services tasks #16 + #17 — additive columns only. NO data backfill.
--
-- Two feature column-sets, created as ONE migration unit so #17 can build on it:
--
--   #16  ใบกำกับ + ใบขน from report-cnt — persist the destination bank account
--        on issuance (turns the display-only 3-account routing
--        [lib/payment/bank-accounts.ts resolvePaymentAccount] into an audited
--        FACT recorded on the issued invoice · §0e: WRITTEN at issue +
--        READ by the etax hub / reconcile, never cosmetic):
--          tb_forwarder_tax_invoice.bank_account_key
--          tb_shop_tax_invoice.bank_account_key
--        nullable text CHECK in ('service','logistics','trading').
--
--   #17  ใบขนพ่วง — ออกใบขนเป็น "ชื่อลูกค้าเอง" (customer's own name): draft →
--        customer confirms (LINE-tokenized) → charge service-fee + duty + VAT-in-
--        ใบขน → SERVICE account. REUSES customs_declarations (no new พ่วง table):
--          issue_in_customer_name   bool  — this decl is issued in the customer's name
--          consignee_name/tax_id/address  — the customer's own consignee snapshot
--          service_fee_thb          numeric(14,2) — our brokerage service fee
--          customer_confirm_status  text CHECK in ('none','sent','confirmed','rejected')
--          customer_confirmed_at    timestamptz
--          confirm_token            uuid  — the tokenized customer-confirm link
--
-- ADDITIVE + idempotent (IF NOT EXISTS guards · re-runnable). No FK, no RLS change,
-- no trigger. Money-safe: these columns CAPTURE a routing/consignee/confirm fact;
-- they never compute money (VAT base stays in lib/tax/tax-doc-mode.ts, account
-- routing stays in lib/payment/bank-accounts.ts).

-- ── #16 · bank_account_key on the two issued-tax-invoice stores ──────────────
ALTER TABLE tb_forwarder_tax_invoice
  ADD COLUMN IF NOT EXISTS bank_account_key text
    CHECK (bank_account_key IS NULL OR bank_account_key IN ('service','logistics','trading'));

ALTER TABLE tb_shop_tax_invoice
  ADD COLUMN IF NOT EXISTS bank_account_key text
    CHECK (bank_account_key IS NULL OR bank_account_key IN ('service','logistics','trading'));

COMMENT ON COLUMN tb_forwarder_tax_invoice.bank_account_key IS
  'Destination Pacred account at issuance (3-account SOT · lib/payment/bank-accounts.ts). service/logistics/trading. Recorded for reconcile — read by /admin/accounting/etax.';
COMMENT ON COLUMN tb_shop_tax_invoice.bank_account_key IS
  'Destination Pacred account at issuance (3-account SOT). service/logistics/trading.';

-- ── #17 · ใบขนพ่วง — own-name + service-fee + customer-confirm on the decl ────
ALTER TABLE customs_declarations
  ADD COLUMN IF NOT EXISTS issue_in_customer_name boolean NOT NULL DEFAULT false;

ALTER TABLE customs_declarations
  ADD COLUMN IF NOT EXISTS consignee_name text;

ALTER TABLE customs_declarations
  ADD COLUMN IF NOT EXISTS consignee_tax_id text;

ALTER TABLE customs_declarations
  ADD COLUMN IF NOT EXISTS consignee_address text;

ALTER TABLE customs_declarations
  ADD COLUMN IF NOT EXISTS service_fee_thb numeric(14,2);

ALTER TABLE customs_declarations
  ADD COLUMN IF NOT EXISTS customer_confirm_status text NOT NULL DEFAULT 'none'
    CHECK (customer_confirm_status IN ('none','sent','confirmed','rejected'));

ALTER TABLE customs_declarations
  ADD COLUMN IF NOT EXISTS customer_confirmed_at timestamptz;

ALTER TABLE customs_declarations
  ADD COLUMN IF NOT EXISTS confirm_token uuid;

-- The confirm_token is the (#17) public capability — unique when present so a
-- token resolves to exactly one declaration. Partial index (non-null only).
CREATE UNIQUE INDEX IF NOT EXISTS customs_declarations_confirm_token_key
  ON customs_declarations (confirm_token)
  WHERE confirm_token IS NOT NULL;

COMMENT ON COLUMN customs_declarations.issue_in_customer_name IS
  'ใบขนพ่วง (#17) — true = ออกใบขนในชื่อลูกค้าเอง (we are broker, not importer-of-record).';
COMMENT ON COLUMN customs_declarations.service_fee_thb IS
  'ใบขนพ่วง (#17) — our brokerage service fee (computeDeclarationFee). Collectable = service_fee + duty + VAT-in-ใบขน → SERVICE account.';
COMMENT ON COLUMN customs_declarations.customer_confirm_status IS
  'ใบขนพ่วง (#17) — none|sent|confirmed|rejected. Charge gated on confirmed.';
COMMENT ON COLUMN customs_declarations.confirm_token IS
  'ใบขนพ่วง (#17) — tokenized customer-confirm link (sent via LINE OA).';
