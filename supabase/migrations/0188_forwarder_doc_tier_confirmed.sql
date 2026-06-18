-- 0188_forwarder_doc_tier_confirmed.sql
-- ────────────────────────────────────────────────────────────────────────
-- Per-order DOC-TIER-DISCOUNT confirmation flag — the admin ติ๊กยืนยัน.
--
-- WHY (ภูม 2026-06-18 · owner-locked design, see
--   docs/learnings/money-feature-dormant-and-data-model-fit.md):
--   The owner-locked cargo doc-tier discount (฿800/CBM off เรือ 3,700→2,900 /
--   รถ 5,700→4,900) requires ALL THREE: ฝากโอน AND ฝากนำเข้า AND (ใบกำกับ OR ใบขน).
--   Condition 1 (ฝากโอน / yuan-transfer) is NOT cleanly derivable from a
--   tb_forwarder row — it lives on tb_wallet_hs.typeservice='3' / tb_payment with
--   NO FK to the shipment, and ฝากโอน/ฝากสั่งซื้อ/ฝากนำเข้า are mutually-exclusive
--   origins. Back-deriving it via fuzzy temporal joins on a MONEY discount would
--   mis-grant/mis-deny. The owner chose the exact, auditable mechanism: a PER-ORDER
--   admin confirmation. A super/accounting/pricing admin ticks this flag when they
--   have verified the order meets all three conditions, and the pricing engine then
--   treats it as the C1 (ฝากโอน) signal — see lib/forwarder/doc-tier-discount.ts
--   (isDocTierEligible now ANDs docTierConfirmed).
--
-- MONEY-SAFETY (double dormant-safe):
--   · Additive only — no existing column/row touched · default FALSE → NO existing
--     order becomes eligible (fail-closed: the discount can never be granted to a
--     row no admin confirmed).
--   · The discount is ALSO still gated by business_config
--     `cargo.doc_tier_discount.enabled` (default FALSE · getDocTierDiscountCbm
--     returns 0 while dormant). So even a confirmed order gets ฿0 discount until the
--     owner explicitly flips the enable. This column ships the MECHANISM; the owner
--     flips the enable to go live.
--
--   doc_tier_confirmed  boolean  — TRUE = a role-gated admin verified this order
--                                  meets ฝากโอน + ฝากนำเข้า + (ใบกำกับ OR ใบขน) → it is
--                                  the C1 (ฝากโอน) signal for the doc-tier discount.
--                                  FALSE/NULL (default) = not confirmed = no discount.
-- ────────────────────────────────────────────────────────────────────────

ALTER TABLE tb_forwarder
  ADD COLUMN IF NOT EXISTS doc_tier_confirmed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tb_forwarder.doc_tier_confirmed IS
  'Per-order doc-tier-discount confirmation (admin ติ๊กยืนยัน) — TRUE = a super/accounting/pricing admin verified ฝากโอน + ฝากนำเข้า + (ใบกำกับ OR ใบขน) → the C1 ฝากโอน signal for the ฿800/CBM doc-tier discount. Default FALSE = no discount. Discount also gated by business_config cargo.doc_tier_discount.enabled. (0188 · ภูม 2026-06-18)';
