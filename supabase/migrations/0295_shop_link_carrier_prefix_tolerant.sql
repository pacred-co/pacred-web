-- ════════════════════════════════════════════════════════════════════════
-- 0295_shop_link_carrier_prefix_tolerant.sql
-- ════════════════════════════════════════════════════════════════════════
-- 2026-08-06 — owner (เคสจริง P22375 ↔ forwarder #53237 · ลูกค้า PR640 โวย):
--   "เลขพัสดุจีน กับ เลขที่ทางโกดังคีย์เข้ามา มันคนละเลขกัน แต่มันคืองานเดียวกัน
--    งานตกหล่น สถานะฝั่งสั่งซื้อไม่เชื่อมกับนำเข้า — เรื่องสถานะไหลทั้ง flow
--    ย้ำไปหลายรอบแล้ว"
--
-- ROOT: เลขแทรคเดียวกัน เขียนคนละ convention —
--   • ฝั่งสั่งซื้อ (ลูกค้า/ร้านจีนคีย์จากป้ายกล่อง): เลขดิบล้วน  "987498054"
--   • ฝั่งโกดังจีน/MOMO คีย์: เติม prefix อักษรขนส่ง             "KY987498054"
--     (KY=韵达/Yunda · convention เดียวกับ SF/JD/YT ฯลฯ)
-- ตัวเชื่อม 0235/0264 จับคู่ exact (+ base-aware ตัด -N/M) เท่านั้น → ไม่ match
-- → shop order ค้าง "รอร้านจีนจัดส่ง" ทั้งที่ของขึ้นตู้มาไทยแล้ว.
--
-- FIX (แขนง match ที่ 3 — digits-normalized · fail-safe แคบ):
--   เมื่อ ctrackingnumber เป็น "เลขดิบล้วน ≥ 8 หลัก" → เทียบกับ ftrackingchn
--   ที่ (ก) ตัด -N/M ท้าย (ข) ตัดอักขระที่ไม่ใช่ตัวเลขทิ้ง (prefix ขนส่ง).
--   คุม 2 ชั้นกัน false-positive: เลขดิบต้อง ≥8 หลัก (เคสจริงเคยมีเลข "733")
--   + ต้องเป็น "ลูกค้าคนเดียวกัน" (f.userid = o.userid — exact/base เดิมไม่ต้อง
--   เพราะเลขมี prefix เอกลักษณ์พอ · แขนงเลขดิบเข้มกว่า).
--
-- สแกนทั้งระบบก่อนแก้ (2026-08-06): class นี้ค้างอยู่ 1 เคส (P22375) ·
-- exact-match 172 · ไม่เกี่ยว 122 → แก้ที่ราก กันเกิดซ้ำทั้ง class.
-- Idempotent CREATE OR REPLACE · status-only (envelope เดิม {3,4,40}→{4,40,5}).
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rederive_shop_order_status(target_hno text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  all_done boolean;
  all_arrived boolean;
BEGIN
  IF target_hno IS NULL OR btrim(target_hno) = '' THEN
    RETURN;
  END IF;

  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.tb_order o
      WHERE o.hno = target_hno
        AND (COALESCE(btrim(o.cnameshop),'') <> '' OR COALESCE(btrim(o.ctitle),'') <> '' OR COALESCE(btrim(o.ctrackingnumber),'') <> '')
        AND (
          COALESCE(btrim(o.ctrackingnumber),'') = ''
          OR NOT EXISTS (
            SELECT 1 FROM public.tb_forwarder f
            WHERE f.fstatus <> '99'
              AND (
                btrim(f.ftrackingchn) = btrim(o.ctrackingnumber)
                OR regexp_replace(btrim(f.ftrackingchn), '-\d+(/\d+)?$', '') = btrim(o.ctrackingnumber)
                -- 0295: เลขดิบ (ลูกค้าคีย์จากป้าย) = เลขโกดังตัด prefix ขนส่ง (KY/SF/…)
                OR (
                  btrim(o.ctrackingnumber) ~ '^\d{8,}$'
                  AND f.userid = o.userid
                  AND regexp_replace(regexp_replace(btrim(f.ftrackingchn), '-\d+(/\d+)?$', ''), '\D', '', 'g') = btrim(o.ctrackingnumber)
                )
              )
              AND (COALESCE(btrim(f.fcabinetnumber),'') <> '' OR f.fstatus IN ('4','5','6','7'))
          )
        )
    ),
    NOT EXISTS (
      SELECT 1 FROM public.tb_order o
      WHERE o.hno = target_hno
        AND (COALESCE(btrim(o.cnameshop),'') <> '' OR COALESCE(btrim(o.ctitle),'') <> '' OR COALESCE(btrim(o.ctrackingnumber),'') <> '')
        AND (
          COALESCE(btrim(o.ctrackingnumber),'') = ''
          OR NOT EXISTS (
            SELECT 1 FROM public.tb_forwarder f
            WHERE f.fstatus <> '99'
              AND (
                btrim(f.ftrackingchn) = btrim(o.ctrackingnumber)
                OR regexp_replace(btrim(f.ftrackingchn), '-\d+(/\d+)?$', '') = btrim(o.ctrackingnumber)
                -- 0295: เลขดิบ = เลขโกดังตัด prefix ขนส่ง
                OR (
                  btrim(o.ctrackingnumber) ~ '^\d{8,}$'
                  AND f.userid = o.userid
                  AND regexp_replace(regexp_replace(btrim(f.ftrackingchn), '-\d+(/\d+)?$', ''), '\D', '', 'g') = btrim(o.ctrackingnumber)
                )
              )
              AND f.fstatus IN ('2','3','4','5','6','7')
          )
        )
    )
  INTO all_done, all_arrived;

  IF all_done THEN
    UPDATE public.tb_header_order
       SET hstatus = '5', hdateupdate = now()
     WHERE hno = target_hno AND hstatus IN ('3', '4', '40');
  ELSIF all_arrived THEN
    UPDATE public.tb_header_order
       SET hstatus = '40', hdateupdate = now()
     WHERE hno = target_hno AND hstatus IN ('3', '4');
  ELSE
    UPDATE public.tb_header_order
       SET hstatus = '4', hdateupdate = now()
     WHERE hno = target_hno AND hstatus = '40';
  END IF;
END;
$$;

-- ── trigger 1 (tb_forwarder) — reverse lookup ก็ต้องรู้จักแขนงเลขดิบ ──
CREATE OR REPLACE FUNCTION public.advance_shop_order_on_forwarder_arrival()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_hno text;
BEGIN
  IF NEW.fstatus IS NULL OR NEW.fstatus NOT IN ('2','3','4','5','6','7') THEN
    RETURN NEW;
  END IF;
  target_hno := NULLIF(btrim(COALESCE(NEW.reforder, '')), '');
  IF target_hno IS NULL THEN
    IF NEW.ftrackingchn IS NULL OR btrim(NEW.ftrackingchn) = '' THEN
      RETURN NEW;
    END IF;
    SELECT o.hno INTO target_hno
      FROM public.tb_order o
      WHERE COALESCE(o.hno, '') <> ''
        AND (
          o.ctrackingnumber = NEW.ftrackingchn
          OR btrim(o.ctrackingnumber) = regexp_replace(btrim(NEW.ftrackingchn), '-\d+(/\d+)?$', '')
          -- 0295: เลขดิบ (ฝั่งสั่งซื้อ) = เลขโกดังตัด prefix ขนส่ง · ลูกค้าเดียวกัน
          OR (
            btrim(o.ctrackingnumber) ~ '^\d{8,}$'
            AND o.userid = NEW.userid
            AND btrim(o.ctrackingnumber) = regexp_replace(regexp_replace(btrim(NEW.ftrackingchn), '-\d+(/\d+)?$', ''), '\D', '', 'g')
          )
        )
      LIMIT 1;
  END IF;
  IF target_hno IS NOT NULL THEN
    PERFORM public.rederive_shop_order_status(target_hno);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.rederive_shop_order_status(text) IS
  '2026-08-06 (0295): ฝากสั่งซื้อ 3-stage re-derive — link 3 แขนง: exact · base(-N/M) · เลขดิบ≥8หลัก=digits(ftrackingchn ตัด prefix ขนส่ง) คุม userid เดียวกัน (เคส P22375 ลูกค้าคีย์ 987498054 · โกดังคีย์ KY987498054). envelope เดิม {3,4,40}→{4,40,5} · ห้ามแตะ 5/6/99.';
