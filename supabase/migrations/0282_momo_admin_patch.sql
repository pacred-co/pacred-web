-- 0282_momo_admin_patch.sql  (2026-07-25 · เดฟ)
--
-- owner: "ด่านนำเข้าแก้ได้ทุกคอลัมน์ — ข้อมูลที่กรอกต้องนำไปใช้จริง เชื่อมโยงถึงกันทั้งหมด"
--
-- ⚠️ ทำไมต้องมีคอลัมน์นี้: sync MOMO (ทุก ~5 นาที) upsert ทับ `raw` ทั้งก้อน + คอลัมน์
-- weight_kg/cbm/quantity/shipment_status/etd/eta ของแถวที่ยังอยู่ใน feed window
-- → ของที่แอดมินกรอกลง raw/คอลัมน์เหล่านั้นถูกลบเงียบๆ ทุกรอบ.
-- `admin_patch` = ที่เก็บของแอดมินโดยเฉพาะ — sync ไม่เขียนคอลัมน์นี้เด็ดขาด
-- → จอ + ตัวนำเข้า (commit) overlay ค่าใน patch ทับค่าที่ sync มาเสมอ.
--
-- คีย์ที่ใช้ (ทั้งหมด optional): weight_kg · cbm · quantity · width · length · height ·
-- user_group/user_code (PR) · sm_date · branch · product_name · remark · note · dum ·
-- cg_no · extra_cost · product_type ('1'..'4') · transport_mode ('1'|'2'|'3') ·
-- status_momo · sm_number · container · return_note · etd · eta · extra_images (text[])
--
-- additive · default '{}' · ไม่มี FK

ALTER TABLE momo_import_tracks
  ADD COLUMN IF NOT EXISTS admin_patch jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN momo_import_tracks.admin_patch IS
  'ค่าที่แอดมินกรอก/แก้บนด่านนำเข้า — sync ห้ามแตะ · จอ+commit overlay ทับค่าที่ sync มา (owner 2026-07-25)';
