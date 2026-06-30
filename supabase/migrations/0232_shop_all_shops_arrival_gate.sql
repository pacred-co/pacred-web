-- 0232_shop_all_shops_arrival_gate.sql (ภูม 2026-06-30)
-- Fix the multi-shop premature-completion bug.
--
-- THE bug (owner: "3 ร้าน 2 ร้านมาถึงแล้ว อีกร้านยังไม่ถึง แต่สถานะออเดอร์ไปสำเร็จแล้ว"):
-- mig 0216's trigger flips a ฝากสั่งซื้อ order to '5' สำเร็จ as soon as ONE shop's
-- forwarder gets a container / fstatus≥3 — it never checks the OTHER shops. A
-- 3-shop order where 1 shop is still in China shows สำเร็จ.
--
-- FIX — gate the flip on ALL shops of the order, not the single triggering row:
--   forwarder write fires the trigger → resolve the order → roll up EVERY shop
--   (one tb_order row = one ร้าน · linked by ctrackingnumber = forwarder ftrackingchn):
--     • ALL shops shipped + done (container OR fstatus≥3) → '5' สำเร็จ
--     • ALL shops shipped + arrived China (fstatus≥2)      → '40' ถึงโกดังจีน
--     • otherwise (a shop not shipped / not arrived)        → stay (no flip · คง 4)
--   A "shop" = a tb_order row that has a ร้าน/สินค้า/tracking (fully-empty rows skipped).
--
-- Forward-only · idempotent (.hstatus IN ('4','40') guard) · status-only · no money.
-- Already-completed ('5') orders are never un-done (forward-only). Single-shop
-- orders degrade to the exact 0216 behaviour (the one shop IS all shops).

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
  -- tracking yet OR no forwarder with a container/fstatus≥3; "pending ARRIVED"
  -- if no tracking OR no forwarder fstatus≥2. all_* = no pending shop remains.
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
              AND (COALESCE(btrim(f.fcabinetnumber),'') <> '' OR f.fstatus IN ('3','4','5','6','7'))
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

  IF all_done THEN
    -- ทุกร้านได้เลขตู้/ออกจากจีนแล้ว → สำเร็จ
    UPDATE public.tb_header_order
       SET hstatus = '5', hdateupdate = now()
     WHERE hno = target_hno
       AND hstatus IN ('4', '40');
  ELSIF all_arrived THEN
    -- ทุกร้านถึงโกดังจีนแล้ว (แต่บางร้านยังไม่ได้เลขตู้) → ถึงโกดังจีน
    UPDATE public.tb_header_order
       SET hstatus = '40', hdateupdate = now()
     WHERE hno = target_hno
       AND hstatus = '4';
  END IF;
  -- else: a shop is still missing/in-transit → leave the order at its current
  -- status (รอร้านจีนจัดส่ง) so it is NOT prematurely marked สำเร็จ.

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
  'ภูม 2026-06-30: ฝากสั่งซื้อ multi-shop gate — ออเดอร์ขึ้น สำเร็จ(5)/ถึงโกดังจีน(40) ก็ต่อเมื่อ ทุกร้าน ถึงครบ (ไม่ใช่ร้านเดียว). ไม่ครบ = คง รอร้านจีนจัดส่ง.';
