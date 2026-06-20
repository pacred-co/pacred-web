-- 0196_widen_order_money_cols.sql
--
-- ⚠️⚠️ DRAFT · NOT APPLIED ⚠️⚠️  (owner ปอน 2026-06-20 · drafted by Claude for เดฟ to money-review + apply)
--
-- WHY: the customer wants to place very large "ฝากสั่งซื้อ" orders. The cart
-- item caps (50/submit · 151/cart) were lifted in code, which exposed the
-- REAL ceiling: every baht/yuan TOTAL + payment AMOUNT in the legacy schema
-- (migration 0081) is `numeric(10,2)` → physically caps at 99,999,999.99.
-- An order whose grand total exceeds that:
--   (1) silently records a wrong/฿0 header total — the rollup UPDATE throws
--       Postgres 22003 which the submit actions swallow as non-fatal, and
--   (2) cannot be paid — tb_payment.payyuan/paythb also numeric(10,2) → 22003.
-- Interim code guards (actions/cart.ts + actions/admin/cart.ts · const
-- MONEY_COL_MAX = 99_999_999.99) now REJECT an over-cap order with a clear
-- message instead of corrupting. This migration LIFTS the ceiling so big
-- orders actually go through. After it is applied to prod, bump the two code
-- MONEY_COL_MAX consts → 999_999_999_999.99.
--
-- WHAT: widen the accumulating money columns numeric(10,2) → numeric(14,2)
-- (max ~999,999,999,999.99 ≈ 1 trillion) — the SAME widening migration 0158
-- already did for the cargo cost/declared columns. RATE columns (hrate,
-- hratecost, payrate, payratecost, crate) are intentionally LEFT numeric(10,2)
-- — a FX rate never needs more. Per-unit price columns (tb_cart.cprice,
-- tb_order.cprice) are also left as-is (a single-unit price > 100M is
-- implausible; only the SUMs overflow).
--
-- SAFETY: widening precision is non-destructive + backward-compatible for
-- reads (existing values are preserved exactly). The risk is a downstream
-- NARROW sink — every money column a widened value flows INTO must also be
-- wide. This migration widens the whole order→payment chain together so no
-- narrow sink remains within it.
--
-- 🔴 เดฟ — BEFORE APPLYING:
--   1. Money-review the column set below. Verify NO other numeric(10,2) money
--      column receives a value from these (esp. tb_wallet / tb_wallet_hs
--      balances, tb_cnt*, tb_user_sales*, receipts tb_receipt.ramount,
--      withdrawal tables) — widen those too if a large order total can reach
--      them via wallet-pay / commission / receipt.
--   2. Check consumers that FORMAT these (CSV exports, PDF/ใบกำกับ, reports)
--      handle 12-digit values without truncation.
--   3. Apply dev FIRST then prod via the standing reconcile flow:
--        SUPABASE_DB_PASSWORD=<pw> node scripts/reconcile-migrations.mjs \
--          --ref <ref> --from 0196 --to 0196
--      (dev lozntlidlqqzzcaathnm · prod yzljakczhwrpbxflnmco — DEV-SYNC rule)
--   4. After prod-applied: bump MONEY_COL_MAX in actions/cart.ts +
--      actions/admin/cart.ts to 999_999_999_999.99.
--
-- NEXT FREE migration after this = 0197.

BEGIN;

-- ── tb_header_order — order grand totals + cost rollups ────────────────
ALTER TABLE public.tb_header_order
  ALTER COLUMN htotalpricechn   TYPE numeric(14,2),  -- ¥ grand total (rollup)
  ALTER COLUMN htotalpriceuser  TYPE numeric(14,2),  -- ฿ grand total
  ALTER COLUMN hshippingservice TYPE numeric(14,2),  -- service/เหมาๆ fee
  ALTER COLUMN hshippingchn     TYPE numeric(14,2),  -- china shipping total
  ALTER COLUMN hpriceupdate     TYPE numeric(14,2),  -- admin-updated total
  ALTER COLUMN hcostall         TYPE numeric(14,2),  -- ¥ cost total
  ALTER COLUMN hcostallth       TYPE numeric(14,2);  -- ฿ cost total
  -- NOTE: hrate / hratecost left numeric(10,2) (FX rate, never large).

-- ── tb_order — per-line totals that scale with qty ─────────────────────
ALTER TABLE public.tb_order
  ALTER COLUMN cshippingchn TYPE numeric(14,2),  -- per-line china shipping
  ALTER COLUMN cpriceupdate TYPE numeric(14,2);  -- per-line updated total
  -- NOTE: cprice (per-unit) left numeric(10,2) — a single-unit price > 100M
  -- is implausible; the overflow is on the SUM, not the unit price.

-- ── tb_payment — amounts paid / cost / profit ──────────────────────────
ALTER TABLE public.tb_payment
  ALTER COLUMN payyuan      TYPE numeric(14,2),  -- ¥ paid
  ALTER COLUMN paythb       TYPE numeric(14,2),  -- ฿ paid
  ALTER COLUMN paythbcost   TYPE numeric(14,2),  -- ฿ cost
  ALTER COLUMN payprofitthb TYPE numeric(14,2);  -- ฿ profit
  -- NOTE: payrate / payratecost left numeric(10,2) (FX rate).

COMMIT;
