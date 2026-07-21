-- 0268_shop_order_import_single_spine.sql (2026-07-21 · Codex)
-- ฝากสั่งซื้อ → ฝากนำเข้า: ONE status/link rule, both write sides, one read spine.
--
-- Repairs the 0264 regression/fork over 0259:
--   • zero real shops never auto-complete;
--   • fstatus rollback/cancel/delete can down-correct 40→4;
--   • completion stamps hdate5;
--   • one tb_order trigger only (the 0264 duplicate is removed);
--   • comma tracking bags are tokenised;
--   • MOMO -N / -N/M split boxes match by base;
--   • fallback matches are scoped by userid and ignore fstatus=99;
--   • one read function powers member/admin panels and the TS status mirror.
--
-- STATUS-ONLY. No price, wallet, receipt, commission, or shipment money changes.

-- ── 1. Canonical tracking-family key ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.shop_tracking_base(p_tracking text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(btrim(COALESCE(p_tracking, '')), '-\d+(/\d+)?$', '');
$$;

COMMENT ON FUNCTION public.shop_tracking_base(text) IS
  'Canonical shop/import tracking family: trim and strip one numeric MOMO -N or -N/M suffix; non-numeric suffixes remain identity.';

-- ── 2. THE pure status rule ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.derive_shop_order_status(p_hno text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  WITH real_shop AS (
    SELECT
      o.id AS shop_id,
      COALESCE(
        NULLIF(btrim(COALESCE(o.userid, '')), ''),
        btrim(COALESCE(h.userid, ''))
      ) AS userid,
      COALESCE(o.ctrackingnumber, '') AS tracking_bag
    FROM public.tb_order o
    LEFT JOIN public.tb_header_order h ON h.hno = o.hno
    WHERE o.hno = p_hno
      AND (
        COALESCE(btrim(o.cnameshop), '') <> ''
        OR COALESCE(btrim(o.ctitle), '') <> ''
        OR COALESCE(btrim(o.ctrackingnumber), '') <> ''
      )
  ),
  shop_token AS (
    SELECT
      rs.shop_id,
      rs.userid,
      btrim(token) AS tracking
    FROM real_shop rs
    CROSS JOIN LATERAL regexp_split_to_table(rs.tracking_bag, '[,，]') AS token
    WHERE btrim(token) <> ''
  ),
  shop_state AS (
    SELECT
      rs.shop_id,
      COUNT(ts.tracking) > 0 AND COALESCE(bool_and(ts.arrived), false) AS arrived,
      COUNT(ts.tracking) > 0 AND COALESCE(bool_and(ts.done), false) AS done
    FROM real_shop rs
    LEFT JOIN (
      SELECT
        t.shop_id,
        t.tracking,
        COALESCE(family.match_count, 0) > 0
          AND COALESCE(family.not_arrived_count, 0) = 0
          AND (
            COALESCE(family.expected_split_total, 0) = 0
            OR (
              COALESCE(family.split_index_count, 0) = family.expected_split_total
              AND family.min_split_index = 1
              AND family.max_split_index = family.expected_split_total
            )
          ) AS arrived,
        COALESCE(family.match_count, 0) > 0
          AND COALESCE(family.not_done_count, 0) = 0
          AND (
            COALESCE(family.expected_split_total, 0) = 0
            OR (
              COALESCE(family.split_index_count, 0) = family.expected_split_total
              AND family.min_split_index = 1
              AND family.max_split_index = family.expected_split_total
            )
          ) AS done
      FROM shop_token t
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::integer AS match_count,
          COUNT(*) FILTER (
            WHERE f.fstatus NOT IN ('2','3','4','5','6','7')
          )::integer AS not_arrived_count,
          COUNT(*) FILTER (
            WHERE COALESCE(btrim(f.fcabinetnumber), '') = ''
              AND f.fstatus NOT IN ('4','5','6','7')
          )::integer AS not_done_count,
          COALESCE(MAX(
            CASE WHEN btrim(COALESCE(f.ftrackingchn, '')) ~ '-[0-9]+/[0-9]+$'
              THEN substring(btrim(f.ftrackingchn) FROM '-[0-9]+/([0-9]+)$')::integer
              ELSE 0
            END
          ), 0)::integer AS expected_split_total,
          COUNT(DISTINCT
            CASE WHEN btrim(COALESCE(f.ftrackingchn, '')) ~ '-[0-9]+/[0-9]+$'
              THEN substring(btrim(f.ftrackingchn) FROM '-([0-9]+)/[0-9]+$')::integer
              ELSE NULL
            END
          )::integer AS split_index_count,
          MIN(
            CASE WHEN btrim(COALESCE(f.ftrackingchn, '')) ~ '-[0-9]+/[0-9]+$'
              THEN substring(btrim(f.ftrackingchn) FROM '-([0-9]+)/[0-9]+$')::integer
              ELSE NULL
            END
          )::integer AS min_split_index,
          MAX(
            CASE WHEN btrim(COALESCE(f.ftrackingchn, '')) ~ '-[0-9]+/[0-9]+$'
              THEN substring(btrim(f.ftrackingchn) FROM '-([0-9]+)/[0-9]+$')::integer
              ELSE NULL
            END
          )::integer AS max_split_index
        FROM public.tb_forwarder f
        WHERE btrim(COALESCE(f.userid, '')) = t.userid
          AND f.fstatus <> '99'
          AND public.shop_tracking_base(f.ftrackingchn) = public.shop_tracking_base(t.tracking)
      ) family ON true
    ) ts ON ts.shop_id = rs.shop_id
    GROUP BY rs.shop_id
  )
  SELECT CASE
    WHEN COUNT(*) = 0 THEN '4'
    WHEN COUNT(*) FILTER (WHERE done) = COUNT(*) THEN '5'
    WHEN COUNT(*) FILTER (WHERE arrived) = COUNT(*) THEN '40'
    ELSE '4'
  END
  FROM shop_state;
$$;

COMMENT ON FUNCTION public.derive_shop_order_status(text) IS
  '0268 SOT: per-real-shop, every comma tracking token and every active split-family row, same-user base-aware non-cancelled imports. Explicit -N/M families require all indices. 4=pending, 40=all arrived China, 5=all containered/at Thailand; zero shops=4.';

-- Keep the 0259 guarded writer as the ONE mutation path, but restate it here
-- so 0268 is self-contained and completion always stamps hdate5.
CREATE OR REPLACE FUNCTION public.apply_shop_order_status(p_hno text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  cur text;
  target text;
BEGIN
  IF p_hno IS NULL OR btrim(p_hno) = '' THEN RETURN; END IF;

  SELECT btrim(hstatus) INTO cur
  FROM public.tb_header_order
  WHERE hno = p_hno;

  IF cur IS NULL OR cur NOT IN ('3','4','40') THEN RETURN; END IF;
  target := public.derive_shop_order_status(p_hno);
  IF target = cur THEN RETURN; END IF;

  IF cur = '3' THEN
    IF target NOT IN ('40','5') THEN RETURN; END IF;
    UPDATE public.tb_header_order
       SET hstatus = target,
           hdateupdate = now(),
           hdate5 = CASE WHEN target = '5' THEN now() ELSE hdate5 END
     WHERE hno = p_hno AND hstatus = '3';
  ELSE
    UPDATE public.tb_header_order
       SET hstatus = target,
           hdateupdate = now(),
           hdate5 = CASE WHEN target = '5' THEN now() ELSE hdate5 END
     WHERE hno = p_hno AND hstatus IN ('4','40');
  END IF;
END;
$$;

-- Compatibility wrapper: old callers of 0264's name now delegate to the ONE
-- writer/rule instead of carrying a second implementation.
CREATE OR REPLACE FUNCTION public.rederive_shop_order_status(target_hno text)
RETURNS void
LANGUAGE sql
AS $$
  SELECT public.apply_shop_order_status(target_hno);
$$;

-- ── 3. Resolve and apply every order touched by a forwarder row ──────────────
CREATE OR REPLACE FUNCTION public.apply_shop_orders_for_forwarder(
  p_reforder text,
  p_tracking text,
  p_userid text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  linked_hno text;
  tracking_key text := public.shop_tracking_base(p_tracking);
  owner_key text := btrim(COALESCE(p_userid, ''));
BEGIN
  IF COALESCE(btrim(p_reforder), '') <> '' THEN
    PERFORM public.apply_shop_order_status(btrim(p_reforder));
  END IF;

  IF tracking_key = '' OR owner_key = '' THEN RETURN; END IF;
  FOR linked_hno IN
    SELECT DISTINCT o.hno
    FROM public.tb_order o
    LEFT JOIN public.tb_header_order h ON h.hno = o.hno
    CROSS JOIN LATERAL regexp_split_to_table(COALESCE(o.ctrackingnumber, ''), '[,，]') AS token
    WHERE COALESCE(btrim(o.hno), '') <> ''
      AND COALESCE(
        NULLIF(btrim(COALESCE(o.userid, '')), ''),
        btrim(COALESCE(h.userid, ''))
      ) = owner_key
      AND public.shop_tracking_base(token) = tracking_key
  LOOP
    PERFORM public.apply_shop_order_status(linked_hno);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_shop_order_on_forwarder_arrival()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM public.apply_shop_orders_for_forwarder(
      NEW.reforder, NEW.ftrackingchn, NEW.userid
    );
  END IF;

  IF TG_OP IN ('DELETE','UPDATE') THEN
    PERFORM public.apply_shop_orders_for_forwarder(
      OLD.reforder, OLD.ftrackingchn, OLD.userid
    );
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advance_shop_on_forwarder_arrival ON public.tb_forwarder;
CREATE TRIGGER trg_advance_shop_on_forwarder_arrival
AFTER INSERT OR DELETE OR UPDATE OF
  fstatus, fcabinetnumber, ftrackingchn, reforder, userid
ON public.tb_forwarder
FOR EACH ROW EXECUTE FUNCTION public.advance_shop_order_on_forwarder_arrival();

-- ── 4. One tb_order-side trigger (drop the 0264 duplicate) ──────────────────
DROP TRIGGER IF EXISTS trg_advance_shop_on_tracking_keyed ON public.tb_order;
DROP FUNCTION IF EXISTS public.advance_shop_order_on_tracking_keyed();

CREATE OR REPLACE FUNCTION public.advance_shop_order_on_order_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.apply_shop_order_status(NULLIF(btrim(COALESCE(OLD.hno, '')), ''));
    RETURN OLD;
  END IF;

  PERFORM public.apply_shop_order_status(NULLIF(btrim(COALESCE(NEW.hno, '')), ''));
  IF TG_OP = 'UPDATE'
     AND COALESCE(btrim(OLD.hno), '') IS DISTINCT FROM COALESCE(btrim(NEW.hno), '') THEN
    PERFORM public.apply_shop_order_status(NULLIF(btrim(COALESCE(OLD.hno, '')), ''));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_advance_shop_on_order_link ON public.tb_order;
CREATE TRIGGER trg_advance_shop_on_order_link
AFTER INSERT OR DELETE OR UPDATE OF
  ctrackingnumber, hno, userid, cnameshop, ctitle
ON public.tb_order
FOR EACH ROW EXECUTE FUNCTION public.advance_shop_order_on_order_link();

-- ── 5. Canonical read spine for member/admin/TS mirror ──────────────────────
CREATE OR REPLACE FUNCTION public.get_linked_shop_forwarders(p_hno text)
RETURNS TABLE (
  id bigint,
  userid text,
  reforder text,
  ftrackingchn text,
  fstatus text,
  fcabinetnumber text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH owner AS (
    SELECT btrim(COALESCE(h.userid, '')) AS userid
    FROM public.tb_header_order h
    WHERE h.hno = p_hno
    LIMIT 1
  ),
  token AS (
    SELECT DISTINCT
      COALESCE(
        NULLIF(btrim(COALESCE(o.userid, '')), ''),
        own.userid
      ) AS userid,
      public.shop_tracking_base(raw_token) AS tracking_key
    FROM public.tb_order o
    CROSS JOIN owner own
    CROSS JOIN LATERAL regexp_split_to_table(COALESCE(o.ctrackingnumber, ''), '[,，]') AS raw_token
    WHERE o.hno = p_hno
      AND btrim(raw_token) <> ''
  )
  SELECT
    f.id::bigint,
    f.userid::text,
    f.reforder::text,
    f.ftrackingchn::text,
    f.fstatus::text,
    f.fcabinetnumber::text
  FROM public.tb_forwarder f
  JOIN owner own ON btrim(COALESCE(f.userid, '')) = own.userid
  WHERE f.fstatus <> '99'
    AND (
      btrim(COALESCE(f.reforder, '')) = btrim(COALESCE(p_hno, ''))
      OR EXISTS (
        SELECT 1
        FROM token t
        WHERE t.userid = own.userid
          AND t.tracking_key <> ''
          AND t.tracking_key = public.shop_tracking_base(f.ftrackingchn)
      )
    )
  ORDER BY f.id DESC;
$$;

COMMENT ON FUNCTION public.get_linked_shop_forwarders(text) IS
  '0268 canonical shop→import reader: explicit reforder OR same-user comma-token/base tracking family; cancelled forwarders excluded.';

CREATE INDEX IF NOT EXISTS idx_tb_forwarder_user_tracking_base_active
  ON public.tb_forwarder (userid, public.shop_tracking_base(ftrackingchn))
  WHERE fstatus <> '99';

CREATE INDEX IF NOT EXISTS idx_tb_forwarder_reforder_active
  ON public.tb_forwarder (reforder)
  WHERE fstatus <> '99' AND COALESCE(btrim(reforder), '') <> '';
