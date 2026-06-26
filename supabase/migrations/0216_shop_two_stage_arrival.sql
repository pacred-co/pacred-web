-- 0216_shop_two_stage_arrival.sql (owner 2026-06-26)
-- Refine 0215: the ฝากสั่งซื้อ must show TWO stages, not jump straight to สำเร็จ.
--   owner: "พอได้เลขแทรคกิ้งว่าถึงโกดังจีน → ขึ้น 'ถึงโกดังจีน' (40)
--           ถ้าได้เลขตู้ / ปิดตู้แล้ว → ขึ้น 'สำเร็จ' (5)"
--
-- So:
--   forwarder ถึงโกดังจีน (fstatus=2) + ยังไม่มีเลขตู้ (fcabinetnumber ว่าง) → shop 4 → 40
--   forwarder ได้เลขตู้ (fcabinetnumber) หรือ fstatus≥3 (ออกจากจีน/ถึงไทย/…)      → shop 4/40 → 5
--
-- The trigger now also watches fcabinetnumber (the container is often assigned in
-- a SEPARATE update from fstatus), so the 40→5 step fires when the เลขตู้ lands.
-- Forward-only · idempotent · status-only · no money.

CREATE OR REPLACE FUNCTION public.advance_shop_order_on_forwarder_arrival()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_hno text;
  has_container boolean;
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
      WHERE o.ctrackingnumber = NEW.ftrackingchn
        AND COALESCE(o.hno, '') <> ''
      LIMIT 1;
  END IF;
  IF target_hno IS NULL THEN
    RETURN NEW;
  END IF;

  has_container := COALESCE(btrim(NEW.fcabinetnumber), '') <> '';

  IF has_container OR NEW.fstatus IN ('3','4','5','6','7') THEN
    -- ได้เลขตู้ / ปิดตู้ / ออกจากจีนแล้ว → สำเร็จ
    UPDATE public.tb_header_order
       SET hstatus = '5', hdateupdate = now()
     WHERE hno = target_hno
       AND hstatus IN ('4', '40');
  ELSE
    -- ถึงโกดังจีน · ยังไม่มีเลขตู้ → 40 (intermediate, only forward from 4)
    UPDATE public.tb_header_order
       SET hstatus = '40', hdateupdate = now()
     WHERE hno = target_hno
       AND hstatus = '4';
  END IF;

  RETURN NEW;
END;
$$;

-- Re-bind the trigger to ALSO fire when the container (fcabinetnumber) is set.
DROP TRIGGER IF EXISTS trg_advance_shop_on_forwarder_arrival ON public.tb_forwarder;
CREATE TRIGGER trg_advance_shop_on_forwarder_arrival
  AFTER INSERT OR UPDATE OF fstatus, fcabinetnumber ON public.tb_forwarder
  FOR EACH ROW
  EXECUTE FUNCTION public.advance_shop_order_on_forwarder_arrival();

COMMENT ON FUNCTION public.advance_shop_order_on_forwarder_arrival() IS
  'owner 2026-06-26: ฝากสั่งซื้อ 2 จังหวะ — ถึงโกดังจีน(fstatus=2,ไม่มีเลขตู้)→40 · ได้เลขตู้/fstatus≥3→5. Fires from ANY path on fstatus|fcabinetnumber write.';
