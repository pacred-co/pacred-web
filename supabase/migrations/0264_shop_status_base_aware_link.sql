-- ════════════════════════════════════════════════════════════════════════
-- 0264_shop_status_base_aware_link.sql
-- ════════════════════════════════════════════════════════════════════════
-- 2026-07-19 — owner: "ของสั่งซื้อ สถานะลูกค้าไม่เดิน จนลูกค้าไปหาเจ้าอื่น ·
-- รอร้านจีนจัดส่ง → ถึงโกดังจีน → ข้ามฝั่งนำเข้า ต้องไหลต่อกัน ทุกฝ่ายเห็นตรงกัน".
--
-- TWO structural holes in the 0235 3-stage re-derive:
--   (1) EXACT-match link: `f.ftrackingchn = o.ctrackingnumber`. Per the canonical
--       tracking pattern (owner 2026-07-19) the customer keys the SHIPMENT number
--       (base, e.g. 710092508207) while MOMO often commits only the box rows
--       (-1/2, -2/2) → the equality never matches → the shop order NEVER advances.
--       FIX: base-aware match — the forwarder's BASE (strip -N/M) also matches.
--   (2) Nothing fires when the tracking is keyed LATE on tb_order (the forwarder
--       already existed) — no tb_forwarder write happens → stuck until an
--       unrelated forwarder update. FIX: a second trigger ON tb_order.
--
-- Also hardened: the roll-up now ignores CANCELLED forwarders (fstatus='99' —
-- a cancelled row with a stale cabinet must not count a shop as "done").
--
-- Shape: ONE callable core `rederive_shop_order_status(hno)` (same 0235 logic,
-- both triggers call it · idempotent · status-only · writes only within
-- {3,4,40}→{4,40,5} · never touches 5/6/99). Idempotent CREATE OR REPLACE.
-- ════════════════════════════════════════════════════════════════════════

-- ── the callable core — 0235's roll-up + write, base-aware + '99'-proof ──
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

-- ── trigger 1 (tb_forwarder · re-bound to the core) ──
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
    -- base-aware: the customer keys the SHIPMENT number; this forwarder may be a
    -- box row (-N/M) — match its base too.
    SELECT o.hno INTO target_hno
      FROM public.tb_order o
      WHERE COALESCE(o.hno, '') <> ''
        AND (
          o.ctrackingnumber = NEW.ftrackingchn
          OR btrim(o.ctrackingnumber) = regexp_replace(btrim(NEW.ftrackingchn), '-\d+(/\d+)?$', '')
        )
      LIMIT 1;
  END IF;
  IF target_hno IS NOT NULL THEN
    PERFORM public.rederive_shop_order_status(target_hno);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advance_shop_on_forwarder_arrival ON public.tb_forwarder;
CREATE TRIGGER trg_advance_shop_on_forwarder_arrival
  AFTER INSERT OR UPDATE OF fstatus, fcabinetnumber ON public.tb_forwarder
  FOR EACH ROW
  EXECUTE FUNCTION public.advance_shop_order_on_forwarder_arrival();

-- ── trigger 2 (NEW · tb_order) — keying/fixing a tracking wakes the status up ──
CREATE OR REPLACE FUNCTION public.advance_shop_order_on_tracking_keyed()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(btrim(NEW.hno), '') <> '' THEN
    PERFORM public.rederive_shop_order_status(NEW.hno);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advance_shop_on_tracking_keyed ON public.tb_order;
CREATE TRIGGER trg_advance_shop_on_tracking_keyed
  AFTER INSERT OR UPDATE OF ctrackingnumber ON public.tb_order
  FOR EACH ROW
  EXECUTE FUNCTION public.advance_shop_order_on_tracking_keyed();

COMMENT ON FUNCTION public.rederive_shop_order_status(text) IS
  '2026-07-19: ฝากสั่งซื้อ 3-stage re-derive core (base-aware link · fstatus<>99 only). Called by BOTH the tb_forwarder trigger and the tb_order tracking-keyed trigger so the customer status flows the moment either side moves. Same write envelope as 0235 ({3,4,40}→{4,40,5} · never 5/6/99).';
