-- ════════════════════════════════════════════════════════════
-- 0224 · Seed hs_codes from the Doc-team LINE chats (พิกัด answers)
-- ════════════════════════════════════════════════════════════
-- Owner 2026-06-29 ("เอาข้อมูลลง database ให้หมด + ดึงไปใช้ประโยชน์"):
-- ingest every authoritative HS-code answer the Doc team gave in the two
-- พิกัด LINE chats into the hs_codes dictionary so the HS auto-search +
-- cost/ใบขน duty-hint use REAL data instead of the 9 seed rows.
--
-- Columns (mig 0030 + 0180 + 0181):
--   description / description_en  ชื่อไทย / อังกฤษ
--   default_duty_pct              อากรปกติ %
--   form_e_duty_pct               ฟอร์มอี (Form-E/ACFTA) %
--   default_stat_code             รหัสสถิติ (000/001/090…)
--   hs_note                       license/เลี่ยง intelligence (มอก/อย/ใบอนุญาต/
--                                 ทุ่มตลาด/เกษตร/DG + เลี่ยงพิกัด + ออกใบกำกับได้?)
--
-- ⚠️ REFERENCE / DICTIONARY DATA ONLY (AGENTS.md §0e) — never feeds the
--    selling price or a declaration's persisted duty.
--
-- IDEMPOTENT: ON CONFLICT (code) DO UPDATE only FILLS BLANKS / improves —
--   COALESCE/NULLIF guards so a richer existing row is never clobbered with a
--   blank. Re-runnable. DO NOT apply here — the integrator applies to prod+dev.
-- ════════════════════════════════════════════════════════════

insert into public.hs_codes
  (code, description, description_en, default_duty_pct, form_e_duty_pct, default_stat_code, hs_note, is_active)
values
  ('2508.10.00.00', 'เบนทอไนต์/ทรายแมว (Bentonite cat litter / ทรายแมวภูเขาไฟ)', 'Bentonite cat litter', 0, 0, '000', 'ไม่ติดใบอนุญาต (เข้าพิกัดนี้) · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('2712.90.90.00', 'วาสลีน (วาสลีนทางการแพทย์)', 'Vaseline / Petroleum jelly', 5, 0, '000', 'ฟรีอากร (FE) · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('2811.22.90.00', 'ซิลิกาเจล/สารดูดความชื้น (Silica Gel)', 'Silica Gel', 0, 0, NULL, 'ไม่ติดใบอนุญาต · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('2901.29.90.00', 'ตัวทำละลาย (อื่นๆ)', 'Solvent (other)', 0, 0, '000', 'ฟรีอากร / ฟรอมอีฟรี · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('2905.12.00.00', 'โพรพิลแอลกอฮอล (น้ำยาทำควัน — เลี่ยง)', 'Propyl alcohol', 0, 0, '000', 'เลี่ยงพิกัด: น้ำยาทำควันติดหมด → Doc เลี่ยงเป็น 2905.12 (โพรพิลแอลกอฮอล · ฟรีอากร). คำเตือน Win: พิกัดติดเกษตรไม่ทำไฟโต / สินค้าเสี่ยงลุกไหม้ไม่รับบุ๊คตู้ / เสี่ยง DG · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('3304.99.30.00', 'ครีมและโลชันอื่นๆ สำหรับหน้าหรือผิว (ครีมบำรุงผิวชาย)', 'Men''s Massage Gel / Skin cream', 30, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('3403.99.11.00', 'สเปรย์น้ำมันหล่อลื่น (ทันตกรรม)', 'Lubricant spray (dental)', 3, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('3405.90.90.00', 'สเปรย์สำหรับเคลือบเงา (Surface Coating Spray — เลี่ยง)', 'Surface Coating Spray', 10, 0, NULL, 'เลี่ยงพิกัด: ของเดิมติด อย. → Doc แนะนำเลี่ยงเป็นสเปรย์เคลือบเงา · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('3824.99.99.00', 'ทรายแมว (Tofu/เต้าหู้)', 'Tofu cat litter', 0, 0, '000', 'ไม่ติด · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('3916.20.20.00', 'PS พลาสติกเส้น', 'PS plastic strand/profile', 5, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('3917.32.92.00', 'ปลอกพลาสติก', 'Plastic Sleeves', 5, 0, NULL, 'ออกใบกำกับภาษีได้ · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('3918.10.11.00', 'กระเบื้องยาง PVC (PVC Floor coverings)', 'PVC Floor coverings', 10, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('3918.10.90.00', 'กระเบื้องยาง SPC / ระแนงไม้เทียม', 'SPC vinyl tile / composite batten', 10, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('3920.99.90.00', 'แผ่นพลาสติก (Plastic Sheet)', 'Plastic Sheet', 0, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('3923.10.20.00', 'พาเลท (Pallets)', 'Pallets', 10, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('3923.90.90.00', 'ถังเปล่า', 'Empty drum/tank', 10, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('3924.90.90.00', 'กล่องเก็บของ', 'Storage Box', 30, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('3926.90.00.00', 'บล็อกปลูกต้นหญ้า / แผ่นรองเมาส์', 'Plastic Planting Blocks / Mouse Pad', 10, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('3926.90.59.00', 'เส้นพลาสติก', 'Plastic strip', 10, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('4011.70.00.00', 'ยางรถเทรลเลอร์ (ชนิดที่ใช้กับยานบก/เครื่องจักรการเกษตร/ป่าไม้)', 'Trailer/agricultural tyre', 0, 0, '000', 'เลี่ยงพิกัด: ยางรถปกติติดใบอนุญาต/มอก → Doc เลี่ยงเป็น 4011.70 (ยางรถไถ/การเกษตร) · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('4202.29', 'กระเป๋า/หีบ (420229)', 'Case/bag (other)', 20, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('4202.99.90.00', 'แร็คกันกระแทก 16U (shockproof rack)', '16U shockproof rack', 20, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('4811.41.90.00', 'กระดาษสติ๊กเกอร์', 'Self-Adhesive Paper', 3, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('4817.30.00.00', 'กล่องกระดาษ', 'Paper box', 10, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('4823.90.00.00', 'แผ่นรองซับปัสสาวะสำหรับสัตว์เลี้ยง (Premium Pet Urine Pads)', 'Pet Urine Pads', 10, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('5208.59.90.00', 'ผ้าม้วน', 'Roll fabric', 5, 0, NULL, 'คิดกิโลละ 3.75 · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('5407.52.00.00', 'ที่นอนม้วน', 'Roll mattress', 5, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('6109.10.10.00', 'เสื้อผ้าทั่วไป (เสื้อแขนสั้น/ยาว ไม่มีลิขสิทธิ์)', 'General apparel (T-shirt)', 30, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('6303.92.00.00', 'ผ้าม่าน (curtain)', 'Curtain', 30, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('6804.22.00.00', 'ล้อเจียร', 'Grinding Wheel', 3, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('6805.30.00.00', 'สก๊อตไบร์ทม้วน', 'Scotch-Brite roll', 10, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('6806.10.00.00', 'เซรามิกไฟเบอร์ (ceramic fiber)', 'Ceramic fiber', 3, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('6806.20.00.00', 'เพอไลท์ วัสดุปลูกกระบองเพชร', 'Perlite (growing medium)', 3, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('6809.11.00.00', 'ผนังปูนปลาสเตอร์ (ไม้ MDF ตกแต่งผนัง — เลี่ยง)', 'Plaster wall board', 10, 0, '000', 'เลี่ยงพิกัด: ไม้ MDF ตกแต่งผนัง → Doc ใช้ชื่อผนังปูนปลาสเตอร์ · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('7009.91.00.00', 'กระจกเงา', 'Mirror', 10, 30, '000', 'ฟรอมอี 30 ไม่เอา · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('7010.90', 'แก้ว (701090)', 'Glassware', 0, 0, NULL, 'ภาษีประมาณ 18,385 (Doc Gring) · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('7010.90.40.00', 'ขวดแก้ว', 'Glass bottle', 10, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('7013.10.00.00', 'เครื่องใช้บนโต๊ะอาหารทำด้วยเซรามิก (ชุดกล่องของขวัญน้ำชา/ถ้วยชาฝาพร้อมรอง/กาน้ำชา)', 'Ceramic tableware', 20, 0, '000', 'ออกใบกำกับภาษีได้ · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('7308.30.10.00', 'บานประตู (Door Core)', 'Door Core', 10, 0, '000', 'อากร 10 (แก้จาก 0) · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('7310.29', 'แท็งก์/ถังแสตนเลส 304', 'Tanks', 10, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('7318.22.00.00', 'แหวนรอง', 'Washers', 10, 5, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('7318.29.90.00', 'น็อต', 'Nut', 10, 5, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('7323.93', 'กาน้ำ (Kettles)', 'Kettles', 10, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('7326.90.99.00', 'ขาตั้ง (Stand for THV)', 'Stand - Accessories', 10, 0, '090', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('7607.19.00.01', 'ผลิตบรรจุภัณฑ์อะลูมิเนียม', 'Aluminium packaging', 1, 0, '000', 'เลี่ยงพิกัด: ของเดิมติดใบอนุญาต → เลี่ยงเป็น 7607.19 (อากร 1). ทางเลือก ''อื่นๆ'' = 7607.190029 · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('7610.10.01.00', 'ประตูอลูมิเนียม', 'Aluminium door', 10, 0, '000', 'ติดทุ่มตลาด (anti-dumping) — เคลียร์เจ้าหน้าที่ · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8208.40.00.00', 'ใบมีดตัดหญ้า (ยี่ห้อ WORLD)', 'Grass cutting blade', 10, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8301.30.00.00', 'กุญแจล็อคตู้ (Cabinet Lock)', 'Cabinet Lock', 20, 0, NULL, 'ไม่ติดใบอนุญาต · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8301.40.90.29', 'ตัวล็อกกันคลาย (Tension Lock)', 'Tension Lock', 20, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8302.41.39.00', 'คานผลักประตูหนีไฟ (Panic Exit Bar)', 'Panic Exit Bar', 10, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8302.41.90.00', 'ราวพยุงตัว', 'Support handrail', 10, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8302.60.00.00', 'โช้คอัพประตู (Door Closer)', 'Door Closer', 20, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8405.10.00.00', 'เครื่องกำเนิดก๊าซไฮโดรเจนขนาดเล็ก (แล็บ — เลี่ยง)', 'Small hydrogen gas generator (lab)', 0, 0, '000', 'เลี่ยงพิกัด (Doc ระบุ ''เลียง'') · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8413.81.19.00', 'ปั๊มติ๊ก (Fuel Pump)', 'Fuel Pump', 0, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8414.10', 'เครื่องสูบลม (ปั๊มลม)', 'Air pump', 0, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8414.20.10.00', 'ที่สูบลม', 'Hand Pumps', 10, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8414.80.90.29', 'ปั๊มลมแรงดันสูง (Booster)', 'High pressure air pump (Booster)', 0, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8414.90.00.00', 'ส่วนประกอบพัดลม (พัดลมมีแบต — เลี่ยง)', 'Part of fan', 0, 0, NULL, 'เลี่ยงพิกัด: พัดลมมีแบตติดมอก → Doc เลี่ยงเป็นส่วนประกอบพัดลม (part of fan) · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8418.50.19.00', 'ตู้แช่ (Exhaust fan no motor — ตู้แช่)', 'Refrigerated cabinet', 30, 5, '000', 'ไม่ติดใบอนุญาต · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8418.69.50', 'เครื่องทำไอติมผัด (Fry Ice Cream Machine)', 'Fry Ice Cream Machine', 10, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8418.69.90.01', 'เครื่องทำน้ำเย็น (Water Chiller)', 'Water Chiller', 0, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8419.89.19.00', 'เครื่องทำความร้อนด้วยไฟฟ้า', 'Electric Heater', 0, 0, '000', 'Doc แนะนำใช้พิกัดนี้ · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8421.99.99.00', 'อะไหล่เครื่องบีบอัดตะกอน', 'Sludge press machine part', 5, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8422.11.00.00', 'เครื่องซีล (Manual Sealing machine)', 'Manual Sealing machine', 0, 0, NULL, 'ไม่ติดใบอนุญาต · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8422.90.10.00', 'อะไหล่เครื่องซีล', 'Manual Sealing machine part', 0, 0, NULL, 'ไม่ติดใบอนุญาต · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8425.19.00.00', 'รอกมือ (Manual hoist)', 'Manual hoist - Accessories', 5, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8433.90.20.00', 'สายคลัตช์ (ยี่ห้อ WORLD)', 'Clutch cable', 5, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8443.99', 'ส่วนประกอบปริ๊นเตอร์', 'Printer parts', 30, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8452.90', 'แป้นเหยียบควบคุมความเร็วเครื่องจักรเย็บผ้า', 'Sewing machine speed pedal', 0, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8477.30.00.00', 'เครื่องเป่าขวดอัตโนมัติ (LS-F9)', 'Automatic blow molding machine', 0, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8479.82', 'เครื่องทำเม็ดแกรนูลสแตนเลส', 'Granulator Machines', 5, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8480.79.90.00', 'แม่พิมพ์ขวด-9ช่อง (Bottle mold-9cavity)', 'Bottle mold-9cavity', 5, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8485.10.00.00', 'เครื่องพิมพ์ 3 มิติ (3D Printer)', '3D Printer', 0, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8485.20.00.00', 'เครื่องพิมพ์พลาสติก (Plastic injection machine)', 'Plastic injection machine', 10, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8501.32.25', 'มอเตอร์ (มอเตอร์รถไฟฟ้า)', 'Motor (EV)', 0, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8501.52', 'มอเตอร์ (PMSM Motor)', 'PMSM Motor', 10, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8502.12.10.00', 'เครื่องกำเนิดไฟฟ้าก๊าซชีวภาพ (200KW)', 'Biogas generator', 10, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8504.40', 'ชุดควบคุมมอเตอร์ (Motor Controller) / มอเตอร์ซิงโครนัสแม่เหล็กถาวร', 'Motor Controller / PMSM Motor', 10, 0, NULL, 'ออกใบกำกับภาษีได้ · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8504.90.90', 'ส่วนประกอบแผงวงจรควบคุม (BMS — อุปกรณ์คุมแบตเตอรี่)', 'Battery Management System parts', 0, 0, NULL, 'ยกเว้นอากร · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8505.11.00.00', 'แม่เหล็ก', 'Magnet', 0, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8511.30.41.00', 'คอยล์จุดระเบิด (ignition coil)', 'Ignition coil', 30, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8512.90.20', 'กรอบไฟท้าย', 'Car Tail Light Frame', 0, 0, NULL, 'ออกใบกำกับภาษีได้ · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8518.10.11.00', 'ไมโครโฟน (U-999HMKI)', 'Microphone', 10, 0, '090', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8518.29.90.00', 'ลำโพง Passive (Passive Line Array/Subwoofer/Full range)', 'Passive Speaker', 10, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8518.30.59.29', 'เครื่องขยายเสียง (ตู้ลำโพง JBL)', 'Speaker amplifier (JBL)', 10, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8518.40.20.00', 'เครื่องขยายเสียง Amplifier (T2-800)', 'Amplifier', 7, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8518.90.90.00', 'อะไหล่/เครื่องขยายเสียง Amplifier (X4-1500/X2-2800/Flying frame)', 'Amplifier / Speaker parts', 7, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8528.52.00.00', 'หน้าจอสัมผัส (touch screen)', 'Touch screen', 0, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8537.10', 'กล่องควบคุม (Controller)', 'Controller', 10, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8537.10.20.00', 'แผงจ่ายกระแสไฟฟ้า (PLC)', 'PLC', 10, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8537.10.99.00', 'DMX Isolated / Kingkong kk256ADNX (เครื่องเสียง/แผงควบคุม)', 'DMX Isolated / control board', 10, 5, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8537.20.19.00', 'สวิตช์คุมไฟ (DIMMER SWITCH — เลี่ยง)', 'Dimmer Switch', 10, 0, NULL, 'เลี่ยงพิกัด: ของเดิมเสี่ยง มอก. → Doc แนะนำเลี่ยงเป็นสวิตช์คุมไฟ · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8538.90.19', 'ส่วนประกอบอุปกรณ์วงจรไฟฟ้า (ขาปลั๊ก)', 'Electrical circuit apparatus parts', 0, 0, NULL, 'เลี่ยงพิกัด: ของเดิม=ขาปลั๊ก ติดใบอนุญาต/มอก ลูกค้าไม่มีใบอนุญาต → Doc เลี่ยงอากรเป็น 8538.90.19 (ส่วนประกอบอุปกรณ์วงจรไฟฟ้า) · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8541.42', 'โซล่าเซลเปล่าๆ ไม่มีแบต', 'Solar cell (no battery)', 0, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8541.43.00', 'แผงโซลาร์เซลล์ (Solar Panel)', 'Solar Panel', 0, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8543.70.90.00', 'เครื่องพ่นน้ำหอม / เครื่องพ่นอโรมาแบบตั้งพื้น / Digital Audio Processor (DPA48QII) / Behringer X32 / SP-801 / Vertical Fog machine / เครื่องอาบน้ำ/สูดไฮโดรเจน / เครื่องขยายเสียงกีตาร์ (GUITAR AMPLIFIER)', 'Floor-Standing Aroma Diffuser / Digital Audio Processor / Vertical Fog machine / Hydrogen bath/inhalation device / Guitar Amplifier', 10, 0, '090', '090 ไม่ติดใบอนุญาต | 000 ไม่ติด ที่เหลือติด · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8544.42.91.00', 'ลวดและเคเบิล', 'Wire and cable', 10, 5, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8708.10.10.00', 'กระจังหน้ากันชน', 'Front Bumper Grille', 30, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8708.29', 'ส่วนประกอบรถยนต์ (กันชน/แผงกันใต้ท้อง/สเกิร์ต)', 'Auto body parts (bumper/under guard/spoiler)', 30, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8708.29.11.00', 'สเกิร์ตข้างคาร์บอนเคฟล่า', 'Carbon Fiber Side Skirt', 30, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8708.29.15.00', 'ประตูหน้า-หลัง', 'Front & Rear Doors', 30, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8708.29.19.00', 'เสา AB', 'AB Pillar', 30, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8708.29.90.00', 'ชิ้นส่วน/ส่วนประกอบ ของม่านบังแดด', 'Auto parts (sunshade)', 0, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8708.29.93.00', 'ชุดตกแต่งติดตั้งภายใน รวมทั้งแผงบังโคลน', 'Fender / Mudguard', 30, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8708.29.95.00', 'การ์ดอาร์มยึดหลัง', 'Rear Arm Guard', 30, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8708.99', 'แป้นคันเร่ง', 'Accelerator Pedal', 30, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('8709.19.00.00', 'รถดั๊ม (นำเข้าทั้งคัน)', 'Dump truck (industrial)', 20, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('9026.10.50', 'มาตรวัด (GUAGE)', 'Gauge', 0, 0, NULL, 'เลี่ยงพิกัด: ของเดิมพิกัดติด → Doc เลี่ยงเป็น 9026.10.50 (มาตรวัด). หมายเหตุ: ใบขนจริงลง 9026.20.90 · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('9026.20.90.00', 'ตัวแปลงสัญญาณ (Transducer)', 'Transducer', 0, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('9029.20', 'หน้าจอแสดงผล (Display)', 'Display', 10, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('9209.30.00', 'สายกีตาร์', 'Guitar string', 0, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('9401.20.99.00', 'เก้าอี้พนักปรับความสูงได้', 'Height-adjustable chair', 10, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('9401.49.00.00', 'โซฟา', 'Sofa', 20, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('9401.79.90.00', 'เก้าอี้ทำฟัน', 'Dental chair', 20, 0, '000', 'เอาเข้าเก้าอี้ปกติ · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('9401.80.00.00', 'อ่างอาบน้ำ', 'Bathtub', 20, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('9402.10.30', 'เตียงไฟฟ้า', 'Electric bed', 20, 0, '999', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('9403.10.00.00', 'ตู้เหล็กเก็บของ / เฟอร์นิเจอร์โลหะ / โต๊ะ', 'Metal Furniture / Table', 20, 0, '000', 'ออกใบกำกับภาษีได้ · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('9403.20.90.00', 'เตียงเซรามิก / โต๊ะมีส่วนผสมหินอ่อน', 'Ceramic bed / marble table', 20, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('9403.70.90.00', 'โต๊ะพลาสติก / ตู้พลาสติก', 'Plastic table / cabinet', 20, 0, '000', 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('9404.21.10.00', 'ที่นอนโฟม (เลี่ยงจากเก้าอี้สปา)', 'Foam mattress', 20, 0, '000', 'เลี่ยงพิกัด: เก้าอี้/เตียงสปาไฟฟ้า → Doc เลี่ยงเป็นที่นอนโฟม · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('9405.50.19.00', 'ป้ายเรืองแสง / สปอตไลท์ (เลี่ยง)', 'Luminous sign / spotlight', 20, 0, '000', 'เลี่ยงพิกัด: Doc เลี่ยงเป็นป้ายเรืองแสง/สปอตไลท์ · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('9405.99.90.00', 'โครมไฟ (โคมไฟอลูมิเนียม)', 'Lamp / luminaire', 10, 0, '000', 'LED Flood light เข้าโคมไฟเฉยๆ · ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('9505.90', 'ของใช้งานเทศกาล', 'Festival entertainment goods', 10, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true),
  ('9506.91.00.00', 'ลูกบอลพิลาทิส / เสื่อโยคะ', 'Pilates Ball / Yoga Mats', 10, 0, NULL, 'ที่มา: Doc team LINE (HS.CODE-VAT-PCS-PACRED + ถามพิกัด Pacred · 2026-05/06)', true)
on conflict (code) do update set
  -- improve TH only if existing is blank
  description      = case when nullif(trim(public.hs_codes.description), '') is null
                          then excluded.description else public.hs_codes.description end,
  description_en   = coalesce(nullif(trim(public.hs_codes.description_en), ''), excluded.description_en),
  -- fill duty/form-e ONLY when the existing value is the default 0 (treated as 'unset')
  default_duty_pct = case when coalesce(public.hs_codes.default_duty_pct, 0) = 0
                          then excluded.default_duty_pct else public.hs_codes.default_duty_pct end,
  form_e_duty_pct  = case when coalesce(public.hs_codes.form_e_duty_pct, 0) = 0
                          then excluded.form_e_duty_pct else public.hs_codes.form_e_duty_pct end,
  default_stat_code = coalesce(nullif(public.hs_codes.default_stat_code, '000'),
                               nullif(public.hs_codes.default_stat_code, ''),
                               excluded.default_stat_code, public.hs_codes.default_stat_code),
  -- append the chat note when the row has none yet (don't clobber a curated note)
  hs_note          = coalesce(nullif(trim(public.hs_codes.hs_note), ''), excluded.hs_note),
  is_active        = true,
  updated_at       = now();
