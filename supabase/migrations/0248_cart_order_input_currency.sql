-- 0248 — persist the ORIGINAL currency + amount on the cart/order rows.
--
-- The currency selector (lib/forwarder/currency-convert.ts) converts a
-- non-CNY entry to a ¥-equivalent `cprice` for all downstream money math.
-- Until now the original (currency, amount) went ONLY to the admin audit log
-- and was lost on the row — so the cart could only ever DISPLAY the ¥-equiv.
--
-- These 2 columns keep the original so the cart/order can show it as the
-- PRIMARY price ("$3,683.40 USD") with the ¥/฿ as a small secondary line.
-- DISPLAY/reference ONLY — pricing still runs on `cprice` (the ¥-equiv).
--
--   input_currency = the original currency code (USD/EUR/THB/…).
--   input_price    = the original amount ENTERED (in that currency).
--   empty '' / 0   = a plain ¥/CNY row (no selector / marketplace) — the
--                    cart renders exactly as today (¥ primary, zero regression).
--
-- Additive + idempotent + NOT NULL DEFAULT so every existing row (which has
-- no original) reads '' / 0 and renders unchanged.
--
-- ⚠️ APPLY to dev+prod BEFORE deploying the code that SELECTs/INSERTs these
--    columns (the cart page throws on a cart-read error). Authored, not applied.

ALTER TABLE tb_cart  ADD COLUMN IF NOT EXISTS input_currency varchar(8)    NOT NULL DEFAULT '';
ALTER TABLE tb_cart  ADD COLUMN IF NOT EXISTS input_price    numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE tb_order ADD COLUMN IF NOT EXISTS input_currency varchar(8)    NOT NULL DEFAULT '';
ALTER TABLE tb_order ADD COLUMN IF NOT EXISTS input_price    numeric(14,2) NOT NULL DEFAULT 0;
