-- ════════════════════════════════════════════════════════════════
-- 0126 — Tax rate seeds (WHT + VAT) for the new per-line tax engine.
-- เดฟ · 2026-05-30 · P0 of the tax-billing-flow rebuild.
-- ════════════════════════════════════════════════════════════════
-- Replaces the legacy flat "priceFull × 0.01 for juristic" with per-line
-- WHT rates loaded from `business_config`. Rates change by law (e-WHT
-- 3%↔1% expired end-2568, VAT 7%↔10% reduced rate to 30 Sep 2026) so we
-- store them as config rows, not hard-coded constants.
--
-- Owner directive 2026-05-30:
--   - transport (ค่าขนส่ง)     = 1%
--   - service (ค่าบริการ)      = 3%  (default; accountant can lower to 1%
--                                   if Pacred uses e-Withholding)
--   - goods (ค่าสินค้า)        = 3%  (owner: include goods in WHT base)
--   - VAT                       = 7%  (reduced rate to 30 Sep 2026)
--
-- Idempotent — ON CONFLICT (key) DO NOTHING preserves any later admin edits.
-- The lib/tax/rates.ts loader falls back to DEFAULT_TAX_RATES if a row is
-- missing, so applying this migration is OPTIONAL but recommended.
-- ════════════════════════════════════════════════════════════════

insert into public.business_config (key, value, value_type, category, description)
values
  ('tax.wht.transport_pct', '1'::jsonb, 'number', 'tax', 'WHT % สำหรับค่าขนส่ง/ค่าระวาง (transport · กฎปกติ 1%)'),
  ('tax.wht.service_pct',   '3'::jsonb, 'number', 'tax', 'WHT % สำหรับค่าบริการ/ค่าจ้างทำของ/ค่าดำเนินการ (service · กฎปกติ 3% · e-WHT ลด 1% หมดอายุ 31 ธ.ค. 2568)'),
  ('tax.wht.goods_pct',     '3'::jsonb, 'number', 'tax', 'WHT % สำหรับค่าสินค้า (goods · owner directive 2026-05-30: include in WHT base · ตั้งเป็น 0 ถ้าบัญชีตัดสินใจไม่คิด)'),
  ('tax.vat.pct',           '7'::jsonb, 'number', 'tax', 'VAT % (อัตราลดเหลือ 7% ถึง 30 ก.ย. 2026)')
on conflict (key) do nothing;
