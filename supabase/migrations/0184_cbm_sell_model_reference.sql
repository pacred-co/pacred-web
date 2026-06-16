-- ════════════════════════════════════════════════════════════════════════
-- ⚠️  0184 — DRAFT · FOR พี่เดฟ (P'Dev) REVIEW · DO NOT APPLY UNTIL REVIEWED
-- ════════════════════════════════════════════════════════════════════════
-- Owner: ภูม (Poom-pacred) · 2026-06-16 · "เขียน migration ส่งให้พี่เดฟตรวจ"
--
-- PURPOSE — this is a REVIEW ARTIFACT, not a ship-ready change. It does two
-- things, both SAFE whether or not it is ever applied:
--   1. Captures the canonical Pacred CBM/KG pricing model Poom taught
--      (ค่าเทียบ = 250 · เรือ 2900 / รถ 4900 · cargo kg floor ≥ 11) as a
--      REFERENCE-ONLY business_config row so it surfaces in the
--      /admin/settings/business-config editor (amber "reference only" banner).
--   2. SURFACES a real semantic conflict between this model and the ALREADY-
--      SEEDED migration 0139 (pricing.min_sell_floor) — see ❗CONFLICT below.
--      P'Dev decides how to reconcile BEFORE any engine is wired to read this.
--
-- ❗ NO engine reads `pricing.cbm_sell_model`. It is documentation/reference
--    (pending:true). Applying it = one additive, idempotent, reference row.
--    NOT a §0e dead-write trap: it is honestly flagged reference-only and is
--    not wired to any quote/rate path. It does NOT touch tb_rate_* and does
--    NOT touch 0139's pricing.min_sell_floor.
--
-- ── THE MODEL (ภูม, source-grounded in lib/forwarder/resolve-rate.ts) ──────
--
-- ค่าเทียบ (comparison value) = tb_users.userComparisonValue, default 250.
--   It is the KG-per-CBM DENSITY break-even, applied per ORDER:
--       CBMProduct = (fAmountCount==1) ? fVolume : fVolume*fAmount   (legacy
--                    forwarder.php L1935-1941 · ported live-rate.ts L261-264)
--       KGPerCBM   = fWeight / CBMProduct
--       KGPerCBM >  ค่าเทียบ  → bill by KG   (dense goods · refPrice='1')
--       KGPerCBM <= ค่าเทียบ  → bill by CBM  (default · refPrice='2')
--   Stored PER-CUSTOMER (tb_users.userComparisonValue · camelCase batch-1).
--   ⚠️ A per-ORDER override (customComparisonSwitch) forces the threshold to
--      200 (fresh order) / 150 (linked refOrder) — NOT 250 (resolve-rate.ts
--      ResolveRateInput.customComparison · calPriceForwarder L2098-2106).
--   This logic is ALREADY faithfully ported + documented — see resolve-rate.ts
--   L40-71 (the authoritative code home). This migration does NOT change it.
--
-- WHY sell-by-CBM is the default ("เน้นขายเป็นคิว · คิวถูกกว่าคุ้มกว่า"):
--   MOMO charges Pacred per CBM (cheaper for Pacred), EXCEPT dense goods whose
--   weight exceeds the CBM equivalent → those bill by KG (the >ค่าเทียบ branch).
--
-- CBM SELL PRICE (Poom · THB per 1 CBM / 1 คิว):
--   เรือ (sea)   = 2900     รถ (truck) = 4900     (sea cheaper than truck)
--   These prices REQUIRE opening a ใบกำกับภาษี (tax invoice) with Pacred — i.e.
--   they are the quoted SELL price for tax-invoice CBM jobs, not a floor.
--
-- CARGO KG FLOOR: Cargo sold by KG must be ≥ 11 THB/kg.
--
-- THE 250 BRIDGE (why 250 is the break-even, not an arbitrary number):
--   CBM_sell / 250 ≈ KG_sell →
--       sea   2900 / 250 = 11.6  ≈ cargo kg floor 11
--       truck 4900 / 250 = 19.6  ≈ truck kg band
--   At density 250 kg/CBM, bill-by-CBM and bill-by-KG converge — exactly the
--   ค่าเทียบ threshold above. The three numbers (250 · 2900 · 4900 · 11) are
--   ONE coherent system, not independent knobs.
--
-- ── ❗ CONFLICT WITH MIGRATION 0139 (the reason this goes to P'Dev) ────────
--   0139 (pricing.min_sell_floor) ALSO encodes 2900 / 4900, but on DIFFERENT
--   axes and as a DIFFERENT KIND of number:
--     0139:  base = per WAREHOUSE  { "1":2900 (กวางโจว), "2":4900 (อี้อู) }
--            surcharge = per MODE   { "1":0 (รถ), "2":300 (เรือ), "3":0 (อากาศ) }
--            = the lowest a sales rep may QUOTE (a FLOOR / hard-warn guardrail)
--     Poom:  2900 = เรือ (sea) · 4900 = รถ (truck), per TRANSPORT MODE
--            = the actual CBM SELL price for tax-invoice jobs
--   Three distinct disagreements:
--     (a) AXIS  — 0139 keys 2900/4900 to WAREHOUSE; Poom keys them to MODE.
--     (b) SEA   — 0139 makes เรือ MORE expensive (+300 surcharge); Poom says
--                 เรือ is CHEAPER (sea 2900 < truck 4900). Opposite direction.
--     (c) KIND  — 0139 = a guardrail FLOOR (don't quote below); Poom = the
--                 quoted SELL price itself. Floor ≠ price.
--
-- ── OPEN QUESTIONS FOR P'DEV (เดฟ) ────────────────────────────────────────
--   Q1. Are 0139's 2900/4900 (warehouse floor) and Poom's 2900/4900 (per-mode
--       CBM sell) the SAME number wearing two hats, or two different numbers
--       that coincide? If different, which surface owns which?
--   Q2. Should the per-mode CBM SELL price live in its own config (this key,
--       once wired), separate from 0139's min-sell FLOOR? Or fold into 0139?
--   Q3. Sea direction: 0139 surcharges เรือ +300 (sea dearer); Poom says sea
--       cheaper. Which is canonical for the live quote?
--   Q4. ค่าเทียบ 250: keep purely per-customer (tb_users.userComparisonValue,
--       per-order override 200/150), or also expose a global default config?
--
-- ── NOTE (not part of this migration · context) ───────────────────────────
--   The CBM DISPLAY bug Poom reported (82.944 vs MOMO 1.7280) was a SEPARATE,
--   already-fixed issue — Pacred's totalCbm ignored fAmountCount and always
--   multiplied. Fixed + shipped in commit 5f035c28 (not this file).
-- ════════════════════════════════════════════════════════════════════════

insert into public.business_config (key, value, value_type, category, description)
values (
  'pricing.cbm_sell_model',
  '{
     "kg_per_cbm_default": 250,
     "cbm_sell_thb": { "sea": 2900, "truck": 4900 },
     "cargo_kg_floor_thb": 11,
     "requires_pacred_tax_invoice": true,
     "pending": true,
     "_status": "DRAFT 2026-06-16 — pending พี่เดฟ review · REFERENCE ONLY · no engine reads this key",
     "_conflict_0139": "migration 0139 pricing.min_sell_floor stores 2900/4900 as a per-WAREHOUSE FLOOR (1=กวางโจว 2=อี้อู) + เรือ +300; this models them as the per-MODE CBM SELL price (เรือ 2900 / รถ 4900). Reconcile axis + sea-direction + floor-vs-price before wiring any consumer."
   }'::jsonb,
  'json',
  'pricing',
  'อ้างอิง (reference) โมเดลราคา CBM/KG ที่ภูมิอธิบาย: ค่าเทียบ=250 (KG/CBM break-even ต่อลูกค้า · tb_users.userComparisonValue · ถ้า KG/CBM > 250 คิดกิโล มิฉะนั้นคิดคิว) · ขายคิว เรือ 2900 / รถ 4900 (ต้องเปิดใบกำกับกับ Pacred) · Cargo ขายกิโลไม่ต่ำกว่า 11 บาท. ⚠️ DRAFT — รอพี่เดฟตรวจ · ยังไม่มี engine อ่าน key นี้ · ชนกับ 0139 pricing.min_sell_floor (2900/4900 ที่นั่น = floor ต่อโกดัง + เรือ +300 · ที่นี่ = ราคาขายต่อโหมดขนส่ง) ต้องเคลียร์ก่อน wire.'
)
on conflict (key) do nothing;
