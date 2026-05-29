-- ════════════════════════════════════════════════════════════════
-- 0128 — Tax-rate corrections (rental + goods) after owner answers 2026-05-30.
-- เดฟ · refines 0126 once the 5 accountant questions were answered.
-- ════════════════════════════════════════════════════════════════
-- The 5 answers (owner, 2026-05-30):
--   WHT by charge type:  transport 1% · service 3% · ค่าเช่า(rental) 5% ·
--                        goods 0% (สินค้าไม่ใช่บริการ → ไม่หัก · ยังอยู่ในฐาน VAT)
--   VAT 7% · international transport leg = VAT 0% (zero-rated · STRUCTURAL in
--     lib/tax/wht.ts — excluded from the VAT base, not a config row)
--   e-Withholding tax = in use (service WHT may drop to 1% at remit time — a
--     P2 remittance concern, not baked into the nominal rate here)
--
-- This migration:
--   1. ADDS tax.wht.rental_pct = 5  (new bucket)
--   2. CORRECTS tax.wht.goods_pct 3 → 0  (0126 seeded 3 on the earlier
--      "include goods" reading; the considered answer is goods = not withheld)
-- Idempotent.
-- ════════════════════════════════════════════════════════════════

insert into public.business_config (key, value, value_type, category, description)
values
  ('tax.wht.rental_pct', '5'::jsonb, 'number', 'tax', 'WHT % สำหรับค่าเช่า (rental · กฎปกติ 5%)')
on conflict (key) do nothing;

-- Correct the goods rate from 0126 (3 → 0). Guarded to the seeded default so a
-- later deliberate admin edit isn't clobbered.
update public.business_config
   set value = '0'::jsonb,
       description = 'WHT % สำหรับค่าสินค้า (goods · owner 2026-05-30: ไม่หัก ณ ที่จ่าย — สินค้าไม่ใช่บริการ · แต่ยังอยู่ในฐาน VAT)'
 where key = 'tax.wht.goods_pct'
   and value = '3'::jsonb;
