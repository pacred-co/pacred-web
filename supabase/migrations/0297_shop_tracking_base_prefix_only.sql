-- ════════════════════════════════════════════════════════════════════════
-- 0297_shop_tracking_base_prefix_only.sql  (แก้ 0296 ให้แคบลง · ทันที)
-- ════════════════════════════════════════════════════════════════════════
-- 0296 ใช้ "digits ≥8 หลัก" เป็นคีย์ → กว้างไป: เลขกระสอบ `CBX260620-SEA07`
-- (digits = 26062007 = 8 หลัก) กลายเป็นคีย์ตัวเลข → เสี่ยงจับคู่ผิดข้ามงาน
-- (unit test `shop-order-status-rule.test.ts` จับได้: "non-numeric suffix is identity").
--
-- FIX: ใช้คีย์ตัวเลขเฉพาะทรง **"อักษรนำหน้า 0-4 ตัว + ตัวเลขล้วน ≥8 หลัก"**
--   ✅ KY987498054 · SF1573784113120 · 987498054 · KY987498054-1/2  → ตัวเลข
--   ❌ CBX260620-SEA07 (กระสอบ · มีอักษรแทรกกลาง) · GZS260729-1 (เลขตู้) → คงเดิม
-- ตรงกับ TS mirror `shopTrackingBase()` เป๊ะ (regex เดียวกัน) — ห้าม drift.
-- Idempotent · READ-path only.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.shop_tracking_base(p_tracking text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN regexp_replace(btrim(COALESCE(p_tracking, '')), '-\d+(/\d+)?$', '') ~ '^[A-Za-z]{0,4}\d{8,}$'
      THEN regexp_replace(regexp_replace(btrim(COALESCE(p_tracking, '')), '-\d+(/\d+)?$', ''), '^[A-Za-z]{0,4}', '')
    ELSE regexp_replace(btrim(COALESCE(p_tracking, '')), '-\d+(/\d+)?$', '')
  END;
$$;

COMMENT ON FUNCTION public.shop_tracking_base(text) IS
  '0297 (2026-08-06): คีย์ครอบครัวแทรคกิ้ง shop↔import — ตัด -N/M แล้วถ้าเป็นทรง "อักษรนำ 0-4 ตัว + ตัวเลข ≥8 หลัก" ใช้ตัวเลขล้วนเป็นคีย์ (KY987498054 = 987498054) แก้เคสโกดังคีย์มี prefix ขนส่ง ลูกค้าคีย์เลขดิบ (P22375/#53237). ทรงอื่น (กระสอบ CBX…-SEA07 · เลขตู้) คงเดิมกันจับคู่ผิด. mirror TS shopTrackingBase() ห้าม drift.';
