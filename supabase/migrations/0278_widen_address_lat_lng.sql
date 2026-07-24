-- 0278_widen_address_lat_lng.sql
--
-- ปักหมุดตำแหน่งจัดส่ง (ปอน 2026-07-24) — คนขับยืนอยู่หน้าบ้านลูกค้าแล้วกด
-- "ปักหมุด" เพื่อบันทึกละติจูด/ลองจิจูดจริงลงที่อยู่จัดส่ง เพื่อให้รอบหน้า
-- กด Google Maps แล้วนำทางไปถูกจุด.
--
-- 🔴 ทำไมต้องมี migration นี้ก่อนถึงจะทำฟีเจอร์ได้:
-- คอลัมน์พิกัดทั้ง 2 ตารางเป็น numeric(10,8) = เหลือที่ให้เลข "หน้า" จุดทศนิยม
-- แค่ 2 หลัก → เก็บได้สูงสุด 99.99999999 เท่านั้น. ลองจิจูดประเทศไทยอยู่ที่
-- 97-105 (กรุงเทพ ≈ 100.52) → ทุกครั้งที่ปักหมุดในกรุงเทพ/ภาคกลาง/อีสาน/ใต้
-- Postgres จะ throw "numeric field overflow" แล้วเขียนไม่ลง.
-- ยืนยันกับ prod จริงแล้ว (2026-07-24): SELECT (100.5231234)::numeric(10,8)
-- → ERROR numeric field overflow.
--
-- 📌 หลักฐานว่าข้อจำกัดนี้กัดข้อมูลเก่ามาแล้ว (อ่านอย่างเดียว ยังไม่แก้ในไฟล์นี้):
-- tb_forwarder  926 แถว → มีพิกัด 0 แถว (ไม่เคยเขียนลงได้เลย)
-- tb_address  4,255 แถว → มีพิกัด 1,152 แถว แต่ 782 แถว (68%) ลองจิจูด =
--   99.99999999 เป๊ะ ซึ่งคือ "เพดาน" ของ numeric(10,8) พอดี. แถวพวกนี้คือ
--   กรุงเทพ · บุรีรัมย์ · หนองคาย · นราธิวาส · พัทลุง · ชลบุรี ฯลฯ ที่ลองจิจูด
--   จริง >100 → MySQL ตัวเก่า (โหมดไม่เข้มงวด) ตัดค่าให้เงียบๆ ตอนบันทึก
--   = พิกัดชุดนั้นนำทางไม่ได้ (ชี้ไปกลางป่าฝั่งตะวันตกหมด).
--
-- ⚠️ migration นี้ "ไม่" แตะข้อมูล 782 แถวที่เพี้ยนอยู่แล้ว — การจะลบทิ้งหรือ
-- ให้คนขับปักใหม่เป็นการตัดสินใจเรื่องข้อมูลของ owner (แยกเป็นงาน data-fix).
-- ตอนนี้โค้ดฝั่งอ่านมองพิกัดจาก tb_forwarder เท่านั้น ซึ่งเป็น 0 ทั้งหมด →
-- ยังไม่มีคนขับคนไหนถูกพาไปผิดที่จากข้อมูลชุดนี้.
--
-- ทำอะไร: ขยายความกว้างคอลัมน์อย่างเดียว numeric(10,8) → numeric(11,8)
-- (3 หลักหน้าจุด = รองรับ ±180.00000000 ครบทั้งโลก).
-- ไม่ตัดข้อมูลเดิม · ไม่เปลี่ยน NOT NULL / default · ไม่แตะแถวไหน ·
-- idempotent (รันซ้ำได้ ถ้ากว้างพอแล้วจะข้าม).

BEGIN;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('tb_forwarder', 'faddresslatitude'),
      ('tb_forwarder', 'faddresslongitude'),
      ('tb_address',   'latitude'),
      ('tb_address',   'longitude')
    ) AS v(tbl, col)
  LOOP
    -- ข้ามถ้าไม่มีคอลัมน์ (กัน migration ล้มบน env ที่ schema ต่าง) หรือกว้างพอแล้ว
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = t.tbl
         AND column_name  = t.col
         AND data_type    = 'numeric'
         AND numeric_precision < 11
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I TYPE numeric(11,8)',
        t.tbl, t.col
      );
      RAISE NOTICE 'widened %.% -> numeric(11,8)', t.tbl, t.col;
    ELSE
      RAISE NOTICE 'skip %.% (missing or already wide enough)', t.tbl, t.col;
    END IF;
  END LOOP;
END $$;

COMMIT;
