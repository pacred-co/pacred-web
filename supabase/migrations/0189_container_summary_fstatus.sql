-- ════════════════════════════════════════════════════════════════════════
-- 0189_container_summary_fstatus.sql
-- ════════════════════════════════════════════════════════════════════════
-- 2026-06-18 (ภูม · พี่ป๊อป) — /admin/report-cnt status column was "มั่ว":
--   every row in the "เข้าโกดังไทยแล้ว" tab showed "ส่งแล้ว" (fstatus 7) and
--   every row in "รอเข้าโกดังไทย" showed "รอเข้าโกดังจีน" (fstatus 1) —
--   REGARDLESS of the real per-tracking fstatus. A freshly scan-arrived
--   container (rows at fstatus 4 = ถึงไทยแล้ว) wrongly displayed "ส่งแล้ว".
--
-- ROOT CAUSE: get_container_summary (0146) aggregates by cabinet but never
--   returned an fstatus, so page.tsx HARDCODED `isWaiting ? '1' : '7'`.
--
-- FIX: the GROUP BY already has every row's fstatus in hand — return MIN +
--   MAX. The page renders MIN (the least-advanced tracking = the container's
--   true overall stage: a container is only "ส่งแล้ว" once EVERY tracking is
--   delivered; until then a just-arrived container shows "ถึงไทยแล้ว").
--
-- Adding OUT columns changes the return type → DROP + CREATE (CREATE OR
-- REPLACE cannot change a function's return type). The function is read-only
-- and called only by /admin/report-cnt + the export action, so a drop+create
-- inside one migration is safe. count_distinct_cabinets (0146) is untouched.
-- ════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_container_summary(text, text, date, date);

CREATE FUNCTION public.get_container_summary(
  p_page      text,
  p_transport text DEFAULT NULL,
  p_start     date DEFAULT NULL,
  p_end       date DEFAULT NULL
)
RETURNS TABLE (
  fcabinetnumber       text,
  ftransporttype       text,
  fwarehousename       text,
  fdatecontainerclose  timestamptz,
  latest_fdatestatus4  timestamptz,
  row_count            bigint,
  sum_weight           numeric,
  sum_volume           numeric,
  sum_cost             numeric,
  sum_price            numeric,
  min_fstatus          text,
  max_fstatus          text
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    f.fcabinetnumber,
    MAX(f.ftransporttype)                    AS ftransporttype,
    MAX(f.fwarehousename)                    AS fwarehousename,
    MAX(f.fdatecontainerclose::timestamptz)  AS fdatecontainerclose,
    MAX(f.fdatestatus4::timestamptz)         AS latest_fdatestatus4,
    COUNT(*)::bigint                         AS row_count,
    COALESCE(SUM(f.fweight::numeric),         0)::numeric  AS sum_weight,
    COALESCE(SUM(f.fvolume::numeric),         0)::numeric  AS sum_volume,
    COALESCE(SUM(f.fcosttotalprice::numeric), 0)::numeric  AS sum_cost,
    COALESCE(SUM(f.ftotalprice::numeric),     0)::numeric  AS sum_price,
    -- fstatus is a single-char text ('1'..'7') → lexical MIN/MAX == numeric.
    -- MIN = the container's least-advanced tracking (the true overall stage).
    MIN(f.fstatus)                           AS min_fstatus,
    MAX(f.fstatus)                           AS max_fstatus
  FROM public.tb_forwarder f
  WHERE f.fcabinetnumber IS NOT NULL
    AND f.fcabinetnumber <> ''
    AND f.fcabinetnumber <> '0'
    AND (
      (p_page = 'waiting' AND f.fstatus < '4') OR
      (p_page = 'succeed' AND f.fstatus > '3')
    )
    AND (
      p_transport IS NULL OR p_transport = '' OR f.ftransporttype = p_transport
    )
    AND (
      p_page <> 'succeed' OR p_start IS NULL OR p_end IS NULL OR
      (f.fdatecontainerclose >= (p_start::text || ' 00:00:00')::timestamptz
       AND f.fdatecontainerclose <= (p_end::text   || ' 23:59:59')::timestamptz)
    )
  GROUP BY f.fcabinetnumber
  ORDER BY MAX(f.fdatestatus4) DESC NULLS LAST, f.fcabinetnumber;
$$;

COMMENT ON FUNCTION public.get_container_summary(text, text, date, date) IS
  '/admin/report-cnt main listing — one row per distinct cabinet with rollups + MIN/MAX fstatus. 0189 (2026-06-18): added min/max_fstatus to fix the hardcoded status column.';

GRANT EXECUTE ON FUNCTION public.get_container_summary(text, text, date, date) TO service_role, authenticated;
