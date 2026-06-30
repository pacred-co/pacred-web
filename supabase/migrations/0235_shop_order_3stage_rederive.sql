-- 0235_shop_order_3stage_rederive.sql (2026-06-30)
-- 3-stage RE-DERIVE for ฝากสั่งซื้อ multi-shop status — two-way inside {4,40}.
--
-- Owner rule: a ฝากสั่งซื้อ order's status is a PURE FUNCTION of its shops'
-- arrivals — NOT a one-way latch. Three stages:
--   '4'  รอร้านจีนจัดส่ง   ← otherwise (a shop not shipped / not arrived)
--   '40' ถึงโกดังจีน        ← ทุกร้านถึงโกดังจีน (fstatus≥2) แต่ยังมีร้านไม่ได้เลขตู้
--   '5'  สำเร็จ            ← ทุกร้านได้เลขตู้ (fcabinetnumber) / ถึงไทย (fstatus≥4)
--
-- THE bug this closes (P22328 · owner "อีกร้านยังไม่ถึง แต่สถานะออเดอร์ไปสำเร็จ/
-- ถึงโกดังจีนแล้ว"): the 0234 trigger only ever ADVANCED (4→40→5) — an order at '40'
-- whose state later regresses (a forwarder reverted, a not-yet-arrived shop added,
-- data-drift) or that was wrongly stamped '40' was NEVER re-derived back to '4'.
--
-- FIX — re-derive the target on EVERY forwarder write of fstatus/fcabinetnumber
-- and write it whenever it differs, two-way inside {4,40}:
--   target '5'  → from {3,4,40}  (forward · incl. 3→5 forward-pull)
--   target '40' → from {3,4}     (4→40 advance · 3→40 forward-pull)
--   target '4'  → from {40}      (40→4 DOWN-CORRECT · the P22328 fix)
-- A '3' (สั่งสินค้า·ชำระแล้ว) is only ever forward-PULLED to {40,5} — never demoted
-- to '4' (its 3→4 transition is the shop-tracking handler's job, not this gate).
-- '5'/'6'/'99' are NEVER touched (forward-only out of completion · cancelled).
--
-- STATUS-ONLY · no money. Idempotent (the .hstatus IN (...) guard makes a converged
-- order a 0-row no-op). Additive (CREATE OR REPLACE) — the trigger binding
-- (AFTER INSERT OR UPDATE OF fstatus,fcabinetnumber) is unchanged.
--
-- DONE definition (matches lib/admin/shop-order-arrivals.ts as of 2026-06-30):
--   done = COALESCE(btrim(fcabinetnumber),'') <> ''  (เลขตู้ assigned · loaded into
--          a closed container)  OR  fstatus IN ('4','5','6','7')  (ถึงไทย/…).
--   fstatus '3' (กำลังส่งมาไทย) alone is NOT done unless a เลขตู้ is stamped — the
--   container assignment is the authoritative "loaded + left China" signal.
-- ARRIVED definition (unchanged): fstatus IN ('2','3','4','5','6','7').

CREATE OR REPLACE FUNCTION public.advance_shop_order_on_forwarder_arrival()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_hno text;
  all_done boolean;
  all_arrived boolean;
BEGIN
  IF NEW.fstatus IS NULL OR NEW.fstatus NOT IN ('2','3','4','5','6','7') THEN
    RETURN NEW;
  END IF;

  -- Resolve the linked shop-order hno (reforder first, else by tracking).
  target_hno := NULLIF(btrim(COALESCE(NEW.reforder, '')), '');
  IF target_hno IS NULL THEN
    IF NEW.ftrackingchn IS NULL OR btrim(NEW.ftrackingchn) = '' THEN
      RETURN NEW;
    END IF;
    SELECT o.hno INTO target_hno
      FROM public.tb_order o
      WHERE o.ctrackingnumber = NEW.ftrackingchn
        AND COALESCE(o.hno, '') <> ''
      LIMIT 1;
  END IF;
  IF target_hno IS NULL THEN
    RETURN NEW;
  END IF;

  -- Roll up EVERY real shop of the order. A shop is "pending DONE" if it has no
  -- tracking yet OR no forwarder with a เลขตู้/fstatus≥4; "pending ARRIVED" if no
  -- tracking OR no forwarder fstatus≥2. all_* = no pending shop remains.
  -- "Real shop" = a tb_order row with a ร้าน/สินค้า/tracking (skip empty junk rows).
  SELECT
    NOT EXISTS (
      SELECT 1 FROM public.tb_order o
      WHERE o.hno = target_hno
        AND (COALESCE(btrim(o.cnameshop),'') <> '' OR COALESCE(btrim(o.ctitle),'') <> '' OR COALESCE(btrim(o.ctrackingnumber),'') <> '')
        AND (
          COALESCE(btrim(o.ctrackingnumber),'') = ''
          OR NOT EXISTS (
            SELECT 1 FROM public.tb_forwarder f
            WHERE f.ftrackingchn = o.ctrackingnumber
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
            WHERE f.ftrackingchn = o.ctrackingnumber
              AND f.fstatus IN ('2','3','4','5','6','7')
          )
        )
    )
  INTO all_done, all_arrived;

  -- deriveShopStatus: allDone → '5' · allArrived → '40' · else → '4'.
  -- (allDone ⇒ allArrived, so the order is correct.) Write it two-way inside {4,40}:
  IF all_done THEN
    -- → '5' สำเร็จ : forward from {3,4,40} (incl. 3→5 forward-pull). Never 5/6/99.
    UPDATE public.tb_header_order
       SET hstatus = '5', hdateupdate = now()
     WHERE hno = target_hno
       AND hstatus IN ('3', '4', '40');
  ELSIF all_arrived THEN
    -- → '40' ถึงโกดังจีน : 4→40 advance · 3→40 forward-pull. Never demote 40 here.
    UPDATE public.tb_header_order
       SET hstatus = '40', hdateupdate = now()
     WHERE hno = target_hno
       AND hstatus IN ('3', '4');
  ELSE
    -- → '4' รอร้านจีนจัดส่ง : KEY CHANGE — an order sitting at '40' must DROP BACK
    -- to '4' when not all shops have arrived (P22328 down-correct). A '3' is NOT
    -- demoted (3→4 is the shop-tracking handler's job); 5/6/99 untouched.
    UPDATE public.tb_header_order
       SET hstatus = '4', hdateupdate = now()
     WHERE hno = target_hno
       AND hstatus = '40';
  END IF;

  RETURN NEW;
END;
$$;

-- Re-bind unchanged (fires on fstatus | fcabinetnumber write).
DROP TRIGGER IF EXISTS trg_advance_shop_on_forwarder_arrival ON public.tb_forwarder;
CREATE TRIGGER trg_advance_shop_on_forwarder_arrival
  AFTER INSERT OR UPDATE OF fstatus, fcabinetnumber ON public.tb_forwarder
  FOR EACH ROW
  EXECUTE FUNCTION public.advance_shop_order_on_forwarder_arrival();

COMMENT ON FUNCTION public.advance_shop_order_on_forwarder_arrival() IS
  '2026-06-30: ฝากสั่งซื้อ 3-stage RE-DERIVE — สถานะ = pure function ของร้านที่มาถึง (4 รอร้านจีนจัดส่ง → 40 ถึงโกดังจีน → 5 สำเร็จ). Two-way ใน {4,40} (40→4 ลงได้เมื่อไม่ครบ · P22328), forward-only พ้น 5; 3 forward-pull เท่านั้น; 5/6/99 ไม่แตะ. status-only · no money.';
