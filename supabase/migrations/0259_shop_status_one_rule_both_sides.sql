-- 0259_shop_status_one_rule_both_sides.sql (2026-07-17)
-- ONE rule · BOTH sides of the link · เส้นตรง เส้นเดียวกันทั้งระบบ.
--
-- Owner 2026-07-17 (P22332 / forwarder 52712 · the SAME complaint as 2026-06-19,
-- 06-22, 06-30, 07-13): "ออเดอร์นี้ มีแทรคกิ้งอะไรหมดแล้ว แต่สถานะยังไม่เดิน ·
-- เคยให้แก้ไปแล้วไม่ใช่หรอครับ เรื่องสถานะงาน ทั้งระบบ · มันต้องเป็นเส้นตรง และเป็น
-- เส้นเดียวกันทั้งระบบ".
--
-- ── ROOT CAUSE (proven on prod, not guessed) ────────────────────────────────
-- The 0234/0235 "systemic SOT" trigger is ONE-SIDED: it fires only on
-- tb_forwarder (AFTER INSERT OR UPDATE OF fstatus, fcabinetnumber).
-- tb_order had ZERO triggers. The shop↔import link has TWO sides, so the
-- re-derive must fire from BOTH — a link becomes true when EITHER side moves.
--
-- P22332 timeline (prod):
--   2026-07-15 22:15  tb_forwarder 52712 INSERTed by MOMO already at fstatus='2'
--                     (reforder='' · fdatestatus2 backdated 07-14). The trigger
--                     FIRED, resolved by tracking → tb_order had no row carrying
--                     '1783998478' yet → RETURN NEW. Nothing written.
--   2026-07-16 19:07  staff keyed the tracking into tb_order 129257
--                     (adminUpdateShopTracking · service-orders-shop-workflow.ts
--                     L885 writes ctrackingnumber and does NOT re-derive).
--                     No trigger on tb_order → nothing re-derived.
--   → and tb_forwarder never gets written again (it sits at fstatus='2' waiting
--     for a container), so the tb_forwarder trigger never gets a second chance.
--   → P22332 is pinned at '4' FOREVER while the UI correctly renders
--     "มาถึงโกดังจีน 1/1 · เหลืออีก 0 ร้าน" (the READ path re-derives live; only
--     the STORED hstatus is stale). derive → '40'. Data is clean (exact match
--     resolves · no whitespace · no suffix): the rule was right, it just never ran.
--
-- ── THE FIX (root · whole class · [[fix-root-prevent-whole-class]]) ─────────
-- 1. ONE rule, ONE home: `derive_shop_order_status(hno)` — the pure function
--    (mirrors lib/admin/shop-order-arrivals.ts::deriveShopStatus).
-- 2. ONE writer: `apply_shop_order_status(hno)` — resolve + guarded write.
-- 3. BOTH sides call it:
--      · tb_forwarder trigger (rewritten to delegate — same binding as 0235)
--      · tb_order trigger (NEW — closes the hole)
--    Two triggers, one rule → they cannot drift, and EVERY writer of either
--    side is caught (the 3 app writers of ctrackingnumber + manual SQL + any
--    future path), which is why the DB chokepoint was chosen on 2026-06-30.
--
-- THE RULE (unchanged · owner 3-stage · STATUS-ONLY · no money):
--   '4'  รอร้านจีนจัดส่ง   ← otherwise (a shop not shipped / not arrived)
--   '40' ถึงโกดังจีน        ← ทุกร้านถึงโกดังจีน (fstatus≥2) แต่ยังมีร้านไม่ได้เลขตู้
--   '5'  สำเร็จ            ← ทุกร้านได้เลขตู้ (fcabinetnumber) / ถึงไทย (fstatus≥4)
-- Two-way inside {4,40} (40→4 down-correct · P22328) · '3' forward-PULLED only ·
-- '5'/'6'/'99' NEVER touched (forward-only out of completion · cancelled).
--
-- ── 3 LATENT divergences SQL↔TS closed here (all 0 rows on prod today — they
--    are NOT the cause; fixed because the owner asked for ONE rule, not two) ──
--   D1  0-real-shop order: old SQL `NOT EXISTS(pending)` = TRUE ⇒ all_done ⇒ '5'
--       (auto-สำเร็จ an empty order!) · TS returns '4'. → SQL now matches TS.
--   D2  old SQL matched `f.ftrackingchn = o.ctrackingnumber` raw · TS trims both.
--       → SQL now btrim()s both sides.
--   D3  TS counted ALL tb_order rows · SQL filtered to "real shop" rows.
--       → the TS mirror adopts the same real-shop filter (see the .ts diff).
--
-- Idempotent (the hstatus guard makes a converged order a 0-row no-op).
-- No recursion: both triggers write tb_header_order only (which has no trigger).

-- ── 1. THE RULE (pure function · the ONE definition) ────────────────────────
CREATE OR REPLACE FUNCTION public.derive_shop_order_status(p_hno text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  WITH real_shop AS (
    -- "real shop" = a tb_order row carrying a ร้าน/สินค้า/tracking (skip junk rows).
    SELECT btrim(COALESCE(o.ctrackingnumber, '')) AS trk
    FROM public.tb_order o
    WHERE o.hno = p_hno
      AND (COALESCE(btrim(o.cnameshop), '') <> ''
        OR COALESCE(btrim(o.ctitle), '') <> ''
        OR COALESCE(btrim(o.ctrackingnumber), '') <> '')
  ),
  st AS (
    SELECT
      -- arrived = ANY forwarder for this tracking at fstatus ≥ 2 (ถึงโกดังจีน).
      rs.trk <> '' AND EXISTS (
        SELECT 1 FROM public.tb_forwarder f
        WHERE btrim(f.ftrackingchn) = rs.trk
          AND f.fstatus IN ('2','3','4','5','6','7')
      ) AS arrived,
      -- done = เลขตู้ (fcabinetnumber) OR fstatus ≥ 4 (ถึงไทย/…). fstatus '3'
      -- alone is NOT done — the container assignment is the authoritative
      -- "loaded + left China" signal.
      rs.trk <> '' AND EXISTS (
        SELECT 1 FROM public.tb_forwarder f
        WHERE btrim(f.ftrackingchn) = rs.trk
          AND (COALESCE(btrim(f.fcabinetnumber), '') <> ''
            OR f.fstatus IN ('4','5','6','7'))
      ) AS done
    FROM real_shop rs
  )
  SELECT CASE
    -- D1: no real shop yet → '4'. NEVER auto-'5' an empty order (matches
    -- deriveShopStatus: `if (s.totalShops === 0) return "4"`).
    WHEN COUNT(*) = 0 THEN '4'
    WHEN COUNT(*) FILTER (WHERE done)    = COUNT(*) THEN '5'
    WHEN COUNT(*) FILTER (WHERE arrived) = COUNT(*) THEN '40'
    ELSE '4'
  END
  FROM st;
$$;

COMMENT ON FUNCTION public.derive_shop_order_status(text) IS
  'ฝากสั่งซื้อ 3-stage rule (owner 2026-06-30): status = PURE FUNCTION of shop arrivals. 4=รอร้านจีนจัดส่ง 40=ถึงโกดังจีน 5=สำเร็จ. SOT mirror of lib/admin/shop-order-arrivals.ts::deriveShopStatus. READ-ONLY.';

-- ── 2. THE WRITER (guarded · the ONE write path) ────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_shop_order_status(p_hno text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  cur    text;
  target text;
BEGIN
  IF p_hno IS NULL OR btrim(p_hno) = '' THEN
    RETURN;
  END IF;

  -- EARLY-EXIT on the UNIQUE tb_header_order(hno) index BEFORE the roll-up.
  -- Only {3,4,40} are governed: '1'/'2' (pre-payment) and '5'/'6'/'99'
  -- (complete/cancelled) are never touched. This also keeps the tb_order
  -- trigger cheap at cart-create (a 150-row cart = 150 index lookups, no
  -- roll-up, because the header is still at '1'/'2').
  SELECT btrim(hstatus) INTO cur
  FROM public.tb_header_order
  WHERE hno = p_hno;

  IF cur IS NULL OR cur NOT IN ('3','4','40') THEN
    RETURN;
  END IF;

  target := public.derive_shop_order_status(p_hno);
  IF target = cur THEN
    RETURN; -- converged → no-op (idempotent)
  END IF;

  IF cur = '3' THEN
    -- '3' (สั่งสินค้า·ชำระแล้ว) is only ever forward-PULLED to {40,5}; its 3→4
    -- transition belongs to the shop-tracking handler, not this gate.
    IF target NOT IN ('40','5') THEN
      RETURN;
    END IF;
    UPDATE public.tb_header_order
       SET hstatus     = target,
           hdateupdate = now(),
           hdate5      = CASE WHEN target = '5' THEN now() ELSE hdate5 END
     WHERE hno = p_hno
       AND hstatus = '3';   -- TOCTOU guard on the value we read
  ELSE
    -- {4,40} → any of 4/40/5, incl. the 40→4 DOWN-CORRECT (P22328).
    UPDATE public.tb_header_order
       SET hstatus     = target,
           hdateupdate = now(),
           hdate5      = CASE WHEN target = '5' THEN now() ELSE hdate5 END
     WHERE hno = p_hno
       AND hstatus IN ('4','40');
  END IF;
END;
$$;

COMMENT ON FUNCTION public.apply_shop_order_status(text) IS
  'Re-derive + write one ฝากสั่งซื้อ order status via derive_shop_order_status(). STATUS-ONLY (hstatus/hdateupdate/hdate5) · never money. Governs {3,4,40} only; never re-opens 5/6/99. Idempotent + TOCTOU-guarded.';

-- ── 3a. SIDE A — tb_forwarder (rewritten to delegate to the ONE rule) ───────
CREATE OR REPLACE FUNCTION public.advance_shop_order_on_forwarder_arrival()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_hno text;
BEGIN
  -- Resolve the linked shop-order hno: reforder first, else by tracking
  -- (a MOMO-created forwarder has reforder='').
  target_hno := NULLIF(btrim(COALESCE(NEW.reforder, '')), '');

  IF target_hno IS NULL THEN
    IF NEW.ftrackingchn IS NULL OR btrim(NEW.ftrackingchn) = '' THEN
      RETURN NEW;
    END IF;
    SELECT o.hno INTO target_hno
      FROM public.tb_order o
      WHERE btrim(o.ctrackingnumber) = btrim(NEW.ftrackingchn)   -- D2: trim both
        AND COALESCE(btrim(o.hno), '') <> ''
      LIMIT 1;
  END IF;

  IF target_hno IS NULL THEN
    RETURN NEW;
  END IF;

  -- NOTE: the 0235 early-exit `IF NEW.fstatus NOT IN ('2'..'7') THEN RETURN`
  -- is INTENTIONALLY GONE — it blocked the down-correct. A forwarder demoted
  -- to fstatus='1' must drop its order 40→4 (status = pure function, both ways).
  PERFORM public.apply_shop_order_status(target_hno);
  RETURN NEW;
END;
$$;

-- (binding unchanged from 0234/0235 — restated so the file is self-contained)
DROP TRIGGER IF EXISTS trg_advance_shop_on_forwarder_arrival ON public.tb_forwarder;
CREATE TRIGGER trg_advance_shop_on_forwarder_arrival
AFTER INSERT OR UPDATE OF fstatus, fcabinetnumber ON public.tb_forwarder
FOR EACH ROW EXECUTE FUNCTION public.advance_shop_order_on_forwarder_arrival();

-- ── 3b. SIDE B — tb_order (THE MISSING HALF · closes the class) ─────────────
CREATE OR REPLACE FUNCTION public.advance_shop_order_on_order_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- a shop row removed changes the roll-up (fewer shops → maybe all arrived).
    PERFORM public.apply_shop_order_status(NULLIF(btrim(COALESCE(OLD.hno, '')), ''));
    RETURN OLD;
  END IF;

  PERFORM public.apply_shop_order_status(NULLIF(btrim(COALESCE(NEW.hno, '')), ''));

  -- a row re-pointed to another order → re-derive the one it left, too.
  IF TG_OP = 'UPDATE'
     AND COALESCE(btrim(OLD.hno), '') IS DISTINCT FROM COALESCE(btrim(NEW.hno), '') THEN
    PERFORM public.apply_shop_order_status(NULLIF(btrim(COALESCE(OLD.hno, '')), ''));
  END IF;

  RETURN NEW;
END;
$$;

-- Fires on the columns the rule actually depends on:
--   ctrackingnumber → the link itself (THE P22332 hole)
--   hno             → re-pointing a shop row
--   cnameshop/ctitle → the "real shop" filter (a junk row becoming real)
DROP TRIGGER IF EXISTS trg_advance_shop_on_order_link ON public.tb_order;
CREATE TRIGGER trg_advance_shop_on_order_link
AFTER INSERT OR DELETE OR UPDATE OF ctrackingnumber, hno, cnameshop, ctitle
ON public.tb_order
FOR EACH ROW EXECUTE FUNCTION public.advance_shop_order_on_order_link();

-- ── 4. perf: the roll-up + both triggers filter tb_order by hno, which had NO
--    index (only a partial one on ctrackingnumber). Additive · no behavior change.
CREATE INDEX IF NOT EXISTS idx_tb_order_hno ON public.tb_order (hno);
