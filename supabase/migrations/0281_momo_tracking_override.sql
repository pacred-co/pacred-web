-- 0281_momo_tracking_override.sql  (2026-07-25 · เดฟ)
--
-- owner (เคส 733 / PR594): MOMO คีย์เลขแทรคตกหล่น ("733" ทั้งที่ป้ายจริงคือ
-- TK 1784597733 — รูปยืนยัน) → ตารางนำเข้าต้องแก้เลขได้ก่อน commit.
--
-- ⚠️ ทำไมต้องเป็นคอลัมน์ใหม่ — ห้ามแก้ momo_tracking_no ตรงๆ:
--   momo_tracking_no = กุญแจตัวตนฝั่ง MOMO (upsert conflict key ของ sync).
--   ถ้า rename แล้วรอบ sync ถัดไป MOMO ยังส่ง "733" มา → ระบบ insert แถวใหม่
--   = เครื่องปั๊ม dup (คลาสเดียวกับ dangling_staging_ptr ที่เคยเจ็บ).
--   เก็บ "เลขที่ถูกต้อง" แยก → sync ยังไหลเข้าแถวเดิม · commit ใช้เลขที่แก้ ·
--   ตัวจับคู่บิล MOMO ตามหางานได้ทั้งเลขเก่า (ผ่าน staging pointer) และเลขใหม่.
--
-- additive · ไม่แตะข้อมูลเดิม · ไม่มี FK (กติกา §0e staging isolation เดิม)

ALTER TABLE momo_import_tracks
  ADD COLUMN IF NOT EXISTS tracking_override text;

COMMENT ON COLUMN momo_import_tracks.tracking_override IS
  'เลขแทรคที่ถูกต้อง (แอดมินแก้จากรูปป้าย เคสเลขสั้น/เลขเพี้ยน) — commit ใช้เลขนี้แทน momo_tracking_no · ห้ามแก้ momo_tracking_no (กุญแจ sync)';

-- หาแถวที่ effective tracking = เลขที่แก้ (ตัวจับคู่บิล/alias ใช้)
CREATE INDEX IF NOT EXISTS idx_momo_import_tracks_tracking_override
  ON momo_import_tracks (tracking_override)
  WHERE tracking_override IS NOT NULL;
