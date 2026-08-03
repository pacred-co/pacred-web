-- ════════════════════════════════════════════════════════════
-- 0286 · ปลดล็อก "รันเลข PR ลูกค้าใหม่" ที่ติดด่านที่อยู่ (mig 0270)
-- ════════════════════════════════════════════════════════════
-- owner 2026-08-03 (จอ /admin/customers/PR9640):
--   "รันเลข PR ลูกค้าใหม่ใช้ไม่ได้ครับ"
--   move_rolled_back: select another main address before removing address 3804
--                     for customer PR9640
--
-- 🔴 ROOT = ด่านที่อยู่ 2 ตัวของ 0270 ล็อกกันเอง (deadlock ไม่ว่าจะย้ายทางไหน):
--   • ย้าย tb_address ก่อน  → trg_protect_customer_main_address ปฏิเสธ
--     ("ที่อยู่หลักย้ายเจ้าของไม่ได้ ต้องเลือกที่อยู่หลักใหม่ก่อน")
--   • ย้าย tb_address_main ก่อน → trg_guard_customer_main_address ปฏิเสธ
--     ("ที่อยู่หลักต้องเป็นของลูกค้ารายนั้น" — tb_address ยังเป็นรหัสเก่าอยู่)
-- ⇒ ลูกค้าที่ "มีที่อยู่หลัก" (ปกติทุกคน) รันเลข PR ใหม่ไม่ได้เลยตั้งแต่ 0270.
--
-- ทั้ง 2 ด่านถูกออกแบบมากันเคส "ที่อยู่หลักหลุด/ชี้ไปที่ตายแล้ว" ซึ่งถูกต้อง —
-- แต่มันอ่านสถานะ **กลางทาง** ของทรานแซกชัน. การรันเลข PR ใหม่ไม่ได้ย้าย
-- ที่อยู่ไปให้ใครอื่น: **คนเดิม ที่อยู่เดิม เปลี่ยนแค่รหัส** และ tb_address +
-- tb_address_main ย้ายไปพร้อมกันใน BEGIN/COMMIT ก้อนเดียว (all-or-nothing +
-- นับแถวยืนยันทุกตาราง · lib/admin/reassign-member-code-mover.ts) → ตอน COMMIT
-- คู่นี้ตรงกันเสมอ ไม่มีทางเหลือ pointer ตาย.
--
-- FIX = ธง **ระดับทรานแซกชัน** `app.member_code_move` ที่ตัวย้ายเท่านั้นตั้งได้
-- (`SET LOCAL` ผ่าน connection ตรง · หายเองตอน COMMIT/ROLLBACK). PostgREST /
-- supabase-js ส่ง SET LOCAL ไม่ได้ → ไม่มีทางลอดด่านจากฝั่งแอปหรือ RLS.
-- ด่านทั้งหมดยังทำงานเหมือนเดิม 100% กับทุก path ปกติ.
--
-- Additive + idempotent (CREATE OR REPLACE FUNCTION ล้วน · ไม่แตะข้อมูล/ทริกเกอร์).
-- ════════════════════════════════════════════════════════════

-- ธงเดียว อ่านที่เดียว — ห้ามให้แต่ละ trigger ไปเดา current_setting เอง
CREATE OR REPLACE FUNCTION public.is_member_code_move()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(current_setting('app.member_code_move', true), '') = 'on';
$$;

COMMENT ON FUNCTION public.is_member_code_move() IS
  'true เมื่ออยู่ในทรานแซกชัน "รันเลข PR ลูกค้าใหม่" (reassign-member-code-mover ตั้ง SET LOCAL app.member_code_move=''on''). ใช้ยกเว้นด่านที่อยู่ 0270 ที่อ่านสถานะกลางทาง — เจ้าของคนเดิม ที่อยู่เดิม เปลี่ยนแค่รหัส และ tb_address + tb_address_main ย้ายพร้อมกันในก้อนเดียว. ตั้งได้เฉพาะ connection ตรง (SET LOCAL) — PostgREST/supabase-js ทำไม่ได้.';

-- ── 1. ที่อยู่หลักต้องเป็นของลูกค้ารายนั้น (BEFORE INS/UPD tb_address_main) ──
CREATE OR REPLACE FUNCTION public.guard_customer_main_address()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ระหว่างรันเลข PR ใหม่: คู่ tb_address/tb_address_main ย้ายคนละคำสั่งแต่ก้อน
  -- เดียวกัน → กลางทางมันไม่ตรงกันโดยธรรมชาติ. ความถูกต้องถูกบังคับที่ตัวย้าย
  -- (นับแถวต่อตาราง + verify ไม่เหลือรหัสเก่า + ROLLBACK ทั้งก้อนถ้าพลาด).
  IF public.is_member_code_move() THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tb_address a
    WHERE a.addressid = NEW.addressid
      AND a.userid = NEW.userid
      AND a.addressstatus = '1'
      AND public.is_customer_delivery_address_usable(
        a.addressstatus, a.addressname, a.addresslastname, a.addresstel, a.addresstel2,
        a.addressno, a.addresssubdistrict, a.addressdistrict, a.addressprovince, a.addresszipcode
      )
  ) THEN
    RAISE EXCEPTION 'main address % must be active and owned by customer %', NEW.addressid, NEW.userid
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 2. ห้ามลบ/ปิด/ย้ายเจ้าของ ที่อยู่หลัก (BEFORE DEL/UPD tb_address) ──
CREATE OR REPLACE FUNCTION public.protect_customer_main_address()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- รันเลข PR ใหม่ = เปลี่ยน "รหัส" ของเจ้าของคนเดิม ไม่ใช่ยกที่อยู่ให้คนอื่น
  -- และไม่ได้ลบ/ปิดที่อยู่ → ไม่เข้าข่ายที่ด่านนี้กัน.
  IF public.is_member_code_move() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tb_address_main m
    WHERE m.userid = OLD.userid
      AND m.addressid = OLD.addressid
  ) AND (
    TG_OP = 'DELETE'
    OR NEW.userid IS DISTINCT FROM OLD.userid
    OR NEW.addressstatus IS DISTINCT FROM '1'
  ) THEN
    RAISE EXCEPTION 'select another main address before removing address % for customer %', OLD.addressid, OLD.userid
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- ── 3. ซิงค์ที่อยู่ล่าสุดของลูกค้า (AFTER tb_address_main) ──
CREATE OR REPLACE FUNCTION public.sync_customer_main_to_last_used()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- ระหว่างรันเลข PR ใหม่ addressid ไม่เปลี่ยน (เปลี่ยนแค่ userid) และแถว
  -- tb_users ก็ถูกย้ายในก้อนเดียวกันอยู่แล้ว → ไม่มีอะไรต้องซิงค์. ถ้าไม่ข้าม
  -- สาขา OLD จะไปล้าง "userAddressID" ของรหัสเก่าที่กำลังจะไม่มีอยู่ = สับสนเปล่าๆ.
  IF public.is_member_code_move() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE public.tb_users
    SET "userAddressID" = ''
    WHERE "userID" = OLD.userid
      AND "userAddressID" = OLD.addressid::text
      AND (TG_OP = 'DELETE' OR OLD.userid IS DISTINCT FROM NEW.userid);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE public.tb_users
    SET "userAddressID" = NEW.addressid::text
    WHERE "userID" = NEW.userid;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;
