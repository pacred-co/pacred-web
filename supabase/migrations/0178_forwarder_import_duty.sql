-- 0178 · Import-duty (อากรขาเข้า) + VAT-inclusive total on the forwarder row
-- =============================================================================
-- Workstream D-G2 (cargo-acct-epic 2026-06-11). The owner's manual cost/profit
-- xlsx (`ลงข้อมูลฝากจ่าย_ต้นทุนกำไร`) carries an **อากรขาเข้า %/บาท** line and a
-- **ราคารวม Vat** (VAT-inclusive) total on the SELL side that the app never
-- computed — forcing the owner back into Excel. These two columns let staff
-- capture the import duty PER forwarder row (entered manually — the duty base is
-- HS-code/policy-sensitive per ADR-0016, so it is NEVER auto-guessed; the % is
-- informational, the baht is authoritative), and the app rolls up the
-- VAT-inclusive total mechanically (lib/forwarder/import-duty-vat.ts).
--
-- ISOLATION: like the cost_* columns added by mig 0158, these are
-- cost-sheet / declared-value fields surfaced ONLY in the Pricing/Docs editor —
-- they do NOT change `fTotalPrice` (the customer's binding charge), the
-- pay-on-arrival total, or any wallet/commission/receipt amount. Additive +
-- nullable defaulting to 0 → zero blast radius on existing rows + every
-- existing read path.
--
-- Owner-blocked downstream (NOT in this migration): wiring the VAT-inclusive
-- total into the actual ใบกำกับภาษี issuance (G1) needs the PEAK GL codes +
-- the VAT-base sign-off (still a standing OWNER ACTION ITEM).
-- =============================================================================

ALTER TABLE public.tb_forwarder
  ADD COLUMN IF NOT EXISTS import_duty_pct  numeric(8,4)  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS import_duty_thb  numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.tb_forwarder.import_duty_pct IS
  'อากรขาเข้า (%) — informational rate, staff-entered (HS/policy-sensitive, never auto-computed). D-G2 mig 0178.';
COMMENT ON COLUMN public.tb_forwarder.import_duty_thb IS
  'อากรขาเข้า (บาท) — authoritative duty amount, staff-entered. Folds into the pre-VAT + VAT-inclusive roll-up (lib/forwarder/import-duty-vat.ts). Cost-sheet only — does NOT change fTotalPrice. D-G2 mig 0178.';
