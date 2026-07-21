-- ════════════════════════════════════════════════════════════
-- 0269 · customer_rate_history — ประวัติเรทขายต่อลูกค้า (แยกตามแพ็กเกจ + ช่วงวันที่)
-- ════════════════════════════════════════════════════════════
-- Owner (2026-07-21): *"เวลากดบันทึกเรท มันไม่ได้แยกเป็นแพ็กเกจ มันรวมไปจุดเดียว ...
-- ผมกลัวอะ เวลาออกราคาไปแล้ว ... อนาคตมาออกใบเสนอราคาอีกอัน เพราะเขาใช้แพ็กใหม่
-- ราคาใหม่ งานใหม่ ทีนี้ เรทเก่าที่เป็นประวัติอะ ผมอยากให้ช่วงวันที่ มันอ้างอิงกันด้วย"*
--
-- ปัญหาที่แก้: `tb_rate_custom_kg/cbm` มีแค่ (userid · โกดัง · รถ/เรือ · ประเภทสินค้า)
-- → **ราคาเดียวต่อช่อง ไม่มีมิติแพ็กเกจ ไม่มีวันที่ ไม่มีประวัติ**. กดบันทึกครั้งใหม่ =
-- UPDATE ทับของเดิมหายเกลี้ยง → ตอบไม่ได้เลยว่า "ตอนออกใบให้ลูกค้าเมื่อเดือนที่แล้ว
-- ตกลงเรทเท่าไร แพ็กไหน ใครตั้ง" นอกจากไปไล่เปิด payload ใบเสนอราคาทีละใบ.
--
-- WHAT THIS IS:
--   ประวัติแบบ APPEND-ONLY. 1 แถว = 1 ช่องเรท (โกดัง × ทาง × ประเภท) ที่ถูกตั้ง 1 ครั้ง
--   พร้อม **แพ็กเกจที่เลือกตอนนั้น** + **เลขที่ใบเสนอราคา** + **มีผลตั้งแต่เมื่อไร** + ใครตั้ง.
--   ผู้เขียนตัวเดียว = adminSaveCustomerRate (actions/admin/customer-rate.ts) ซึ่ง INSERT
--   ประวัติ **หลัง** เขียน tb_rate_custom_* สำเร็จแล้ว เป็น write แยก additive ล้วน.
--
-- WHAT THIS IS NOT:
--   - **ไม่ใช่ตารางเงิน และไม่มีอะไรอ่านไปคิดราคา.** เครื่องคิดเงิน (resolve-rate.ts)
--     ยังอ่าน `tb_rate_custom_*` ตัวเดิมเป๊ะ ไม่แตะบรรทัดเดียว → ลูกค้าทุกรายถูกคิดเงิน
--     เท่าเดิมทุกบาทหลัง migration นี้. ตารางนี้ให้ "อ่านย้อนหลัง" อย่างเดียว.
--   - ไม่มี FK ไป tb_users / tb_rate_custom_* / ตารางบิลใดๆ (isolation rule §0e) —
--     userid เป็น text snapshot เฉยๆ. ลูกค้าถูกลบ ประวัติก็ยังอ่านได้ ไม่ block อะไร.
--   - ไม่มี trigger. ไม่มี cascade. ไม่ย้อนไปแก้ข้อมูลเก่า.
--
-- ช่วงวันที่ทำงานยังไง (ไม่ต้องเก็บ effective_to):
--   แถวของลูกค้า+ช่องเดียวกัน เรียงตาม effective_from — แถวถัดไปคือจุดสิ้นสุดของแถวก่อน
--   โดยปริยาย (half-open range). เก็บ effective_to ไว้ด้วยจะเปิดช่องให้ 2 คอลัมน์ขัดกันเอง
--   ตอนแก้ย้อนหลัง → คำนวณเอาตอนอ่านปลอดภัยกว่า.
--
-- package_id ว่าง '' = ตั้งเรทโดยไม่ผ่านใบเสนอราคา (ของเดิม/สคริปต์) — ไม่ใช่ error.
-- ประวัติก่อน migration นี้ไม่มี (ข้อมูลถูกทับไปแล้ว กู้ไม่ได้) — เริ่มนับจากนี้ไป.
--
-- Additive + idempotent (create … if not exists). Safe to re-run. Next free = 0270.
-- DO NOT apply here — the integrator (เดฟ) applies migrations to prod+dev. แอปอ่านตารางนี้
-- แบบ FAIL-SOFT (ไม่มีตาราง → โชว์ "ยังไม่มีประวัติ") และการเขียนเป็น best-effort
-- (ประวัติล้ม ไม่ทำให้การบันทึกเรทล้ม) → deploy ก่อน migration ไม่ 500 และไม่กันคนทำงาน.
-- ════════════════════════════════════════════════════════════

create table if not exists public.customer_rate_history (
  id              bigserial primary key,
  userid          text        not null,
  -- แพ็กเกจที่เลือกตอนกดบันทึก ('' = ตั้งมือ ไม่ผ่านใบเสนอราคา)
  package_id      text        not null default '',
  package_label   text        not null default '',
  -- เลขที่ใบเสนอราคาที่ทำให้เรทนี้มีผล ('' = ไม่ผ่านใบ)
  quotation_ref   text        not null default '',
  -- ช่องเรท: โกดัง '1'กวางโจว|'2'อี้อู · ทาง '1'รถ|'2'เรือ · ประเภทสินค้า '1'-'4'
  sourcewarehouse text        not null,
  rtransporttype  text        not null,
  rproductstype   text        not null,
  rcbm            numeric(14,2),
  rkg             numeric(14,2),
  -- มีผลตั้งแต่ — แถวถัดไปของช่องเดียวกันคือจุดสิ้นสุดโดยปริยาย
  effective_from  timestamptz not null default now(),
  set_by          text        not null default '',
  created_at      timestamptz not null default now()
);

-- อ่านหลักคือ "ประวัติของลูกค้ารายนี้ ใหม่ก่อน"
create index if not exists customer_rate_history_user_idx
  on public.customer_rate_history (userid, effective_from desc);

-- อ่านรอง: "ช่องนี้ของลูกค้ารายนี้ เคยเป็นเท่าไรบ้าง" (ไล่ timeline ต่อช่อง)
create index if not exists customer_rate_history_cell_idx
  on public.customer_rate_history (userid, sourcewarehouse, rtransporttype, rproductstype, effective_from desc);

-- service-role เท่านั้น (ไม่มี policy = ไม่มีใครนอก service-role อ่าน/เขียนได้)
alter table public.customer_rate_history enable row level security;

comment on table public.customer_rate_history is
  'ประวัติเรทขายต่อลูกค้า (append-only · owner 2026-07-21). แยกตามแพ็กเกจ + ผูกใบเสนอราคา + มีผลตั้งแต่เมื่อไร. ไม่มีอะไรอ่านไปคิดเงิน — เครื่องคิดเงินยังอ่าน tb_rate_custom_* ตัวเดิม.';
