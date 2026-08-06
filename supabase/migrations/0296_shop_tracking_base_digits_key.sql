-- ════════════════════════════════════════════════════════════════════════
-- 0296_shop_tracking_base_digits_key.sql
-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-06 — owner (ต่อจาก 0295 · เคส P22375 ↔ #53237):
--   "เลขพัสดุจีน กับ เลขที่ทางโกดังคีย์ คนละเลข แต่เป็นงานเดียวกัน · งานตกหล่น ·
--    สถานะฝากสั่งไม่เชื่อมกับนำเข้า · เรื่องสถานะไหลทั้ง flow ย้ำหลายรอบแล้ว"
--
-- 0295 ปิดรูที่ trigger (rederive_shop_order_status + advance_..._arrival) แต่
-- **ตัวอ่านสายหลักคนละตัว**: `get_linked_shop_forwarders` (RPC ที่หน้าเว็บ/
-- loader/ปุ่ม ใช้จริง · 0268) + `derive_shop_order_status` ทั้งคู่ join ผ่าน
-- **`shop_tracking_base()`** ซึ่งตัดแค่ `-N/M` — ไม่ตัด prefix ตัวอักษรขนส่ง
-- (KY/SF/JD/YT…) → เลขดิบฝั่งลูกค้า "987498054" ยังไม่ match "KY987498054".
--
-- FIX ที่ราก (จุดเดียว ทุก consumer ได้ตาม · single-source):
--   `shop_tracking_base()` = เลขตัวเลขล้วน (digits-only) เมื่อ key ยาว ≥8 หลัก
--   → "KY987498054" · "987498054" · "KY987498054-1/2" ⇒ "987498054" เท่ากันหมด.
--   คุม false-positive: ใช้เฉพาะเมื่อ digits ≥ 8 (เลขสั้นเช่น "733" คงเดิม
--   ทั้งสตริง) และทุก consumer scope ด้วย `userid` เดียวกันอยู่แล้ว.
--
-- ⚠️ IMMUTABLE เดิม → ต้อง CREATE OR REPLACE ด้วย signature เดิมเป๊ะ (มี index/
--    view ใดอ้างอิงหรือไม่: 0268 ไม่ได้สร้าง index บนฟังก์ชันนี้ · ตรวจแล้ว).
-- Idempotent · READ-path only (ไม่เขียนข้อมูล · envelope สถานะไม่เปลี่ยน).
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.shop_tracking_base(p_tracking text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    -- เลขยาว ≥8 หลัก → ใช้ "ตัวเลขล้วน" เป็นคีย์ครอบครัว (ตัด prefix ขนส่ง + -N/M)
    WHEN length(regexp_replace(regexp_replace(btrim(COALESCE(p_tracking, '')), '-\d+(/\d+)?$', ''), '\D', '', 'g')) >= 8
      THEN regexp_replace(regexp_replace(btrim(COALESCE(p_tracking, '')), '-\d+(/\d+)?$', ''), '\D', '', 'g')
    -- เลขสั้น/รูปแบบแปลก → พฤติกรรมเดิม (ตัดแค่ -N/M · กันจับคู่มั่ว)
    ELSE regexp_replace(btrim(COALESCE(p_tracking, '')), '-\d+(/\d+)?$', '')
  END;
$$;

COMMENT ON FUNCTION public.shop_tracking_base(text) IS
  '0296 (2026-08-06): คีย์ครอบครัวแทรคกิ้ง shop↔import — ตัด -N/M แล้วถ้าเหลือตัวเลข ≥8 หลัก ใช้ "ตัวเลขล้วน" เป็นคีย์ (KY987498054 = 987498054 = KY987498054-1/2) แก้เคสโกดังคีย์มี prefix ขนส่งแต่ลูกค้าคีย์เลขดิบ (P22375/#53237). เลขสั้นคงพฤติกรรมเดิมกันจับคู่มั่ว · consumer ทุกตัว scope userid อยู่แล้ว.';
