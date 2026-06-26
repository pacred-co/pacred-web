-- 0215_advance_shop_on_forwarder_arrival.sql (owner 2026-06-26)
-- THE SYSTEMIC fix for the recurring "ฝากสั่งซื้อ มี tracking ฝากนำเข้าแล้ว แต่
-- สถานะไม่ขยับ" complaint (P22318 etc.).
--
-- ROOT: a ฝากสั่งซื้อ (tb_header_order) completes 4/40 → 5 when its goods become
-- a ฝากนำเข้า (tb_forwarder) that reaches the China warehouse (fstatus ≥ 2). The
-- app helper lib/admin/advance-linked-shop-order.ts does this — but it was only
-- WIRED into 2 of the many paths that set fstatus (bulk-status + MOMO propagate).
-- A forwarder can reach the warehouse via OTHER paths (MOMO commit, warehouse
-- scan, manual edit, invoice-cost, the "ถึงโกดังจีน" button) → those left the
-- linked shop order stuck = the owner's "แก้แค่หน้าเดียว" recurring bug.
--
-- FIX: a DB trigger on tb_forwarder fires on EVERY fstatus write (INSERT or
-- UPDATE), so no code path can ever miss it again. Same logic as the app helper:
-- resolve the linked hno (reforder, else tb_order.ctrackingnumber = ftrackingchn)
-- → forward-only complete hstatus '4'/'40' → '5'. Idempotent · status-only · no
-- money. The app-level calls stay (harmless belt-and-suspenders).

-- The trigger looks up tb_order by ctrackingnumber — index it (idempotent).
CREATE INDEX IF NOT EXISTS idx_tb_order_ctrackingnumber
  ON public.tb_order (ctrackingnumber)
  WHERE ctrackingnumber IS NOT NULL AND ctrackingnumber <> '';

CREATE OR REPLACE FUNCTION public.advance_shop_order_on_forwarder_arrival()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_hno text;
BEGIN
  -- Only when the forwarder is AT or BEYOND the China warehouse (physical 2-4 +
  -- money 5-7 all imply "arrived in China"). fstatus is a single char.
  IF NEW.fstatus IS NULL OR NEW.fstatus NOT IN ('2','3','4','5','6','7') THEN
    RETURN NEW;
  END IF;

  -- Resolve the linked shop-order hno: reforder first (spawn path), else by the
  -- tracking the shop order recorded (MOMO-created forwarders have reforder='').
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

  -- Forward-only complete (4/40 → 5). The WHERE makes it idempotent + a no-op
  -- once the order is past 4/40 (paid/cancelled/done).
  UPDATE public.tb_header_order
     SET hstatus = '5', hdateupdate = now()
   WHERE hno = target_hno
     AND hstatus IN ('4', '40');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advance_shop_on_forwarder_arrival ON public.tb_forwarder;
CREATE TRIGGER trg_advance_shop_on_forwarder_arrival
  AFTER INSERT OR UPDATE OF fstatus ON public.tb_forwarder
  FOR EACH ROW
  EXECUTE FUNCTION public.advance_shop_order_on_forwarder_arrival();

COMMENT ON FUNCTION public.advance_shop_order_on_forwarder_arrival() IS
  'owner 2026-06-26: systemic auto-complete ฝากสั่งซื้อ 4/40→5 when its linked ฝากนำเข้า reaches China warehouse (fstatus≥2), from ANY path. Fixes the recurring stuck-status bug (was app-wired to only 2 paths).';
