-- ════════════════════════════════════════════════════════════════════════
-- 0146_report_cnt_distinct_rpcs.sql
-- ════════════════════════════════════════════════════════════════════════
-- 2026-06-06 (ภูม B2 + B5 from late-PM save-point 2026-06-05):
--
-- Two RPCs to close the /admin/report-cnt over-count + perf bugs that
-- พี่ป๊อป + ภูม flagged:
--
--   B2 (UX over-count) — `loadHeaderCounts` shows tab badges 8.8× too high:
--     · "รอเข้าโกดังไทย" badge = 283 ROWS / 32 distinct CABINETS
--     · "เข้าโกดังไทยแล้ว" badge = 46,339 ROWS / 5,603 distinct CABINETS
--   Pacred-staff workload looks 8× larger than reality. The /admin/report-cnt
--   page groups BY fcabinetnumber on render, so the tab badges should also
--   count DISTINCT fcabinetnumber — not ROWS.
--
--   B5 (perf) — main listing query pulls 50,000 tb_forwarder rows just to
--   JS-group them into ~5,603 containers · 12-23 MB wire per page-load.
--   Replace with a Postgres GROUP BY + SUM RPC returning the 5,603 already-
--   aggregated rows · cuts wire ~88×.
--
-- Idempotent: each RPC is `CREATE OR REPLACE FUNCTION`.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1) count_distinct_cabinets ─────────────────────────────────────────
-- Returns the number of DISTINCT fcabinetnumber values matching the page
-- + transport + (succeed-only date-range) filter combination — for tab
-- badges on /admin/report-cnt.
--
-- Semantics mirror the existing JS `countWaiting`/`countSucceed`:
--   p_page = 'waiting' → fstatus < '4' (rows that haven't reached Thailand)
--   p_page = 'succeed' → fstatus > '3' (rows that have reached Thailand)
--   p_transport NULL/'' → no transport filter
--   p_transport '1'     → ftransporttype='1' (truck · ทางรถ)
--   p_transport '2'     → ftransporttype='2' (sea · ทางเรือ)
--   p_start/p_end date range applies to fdatecontainerclose · succeed page only.
--
-- Always excludes empty/null/zero fcabinetnumber (matches the page query).

CREATE OR REPLACE FUNCTION public.count_distinct_cabinets(
  p_page      text,
  p_transport text DEFAULT NULL,
  p_start     date DEFAULT NULL,
  p_end       date DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(DISTINCT f.fcabinetnumber)
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
    );
$$;

COMMENT ON FUNCTION public.count_distinct_cabinets(text, text, date, date) IS
  '/admin/report-cnt tab badge — DISTINCT fcabinetnumber count. B2 fix (2026-06-06).';


-- ── 2) get_container_summary ──────────────────────────────────────────
-- Returns one row per distinct fcabinetnumber matching the same filter,
-- with the rollup numbers /admin/report-cnt needs to render the table
-- (count of forwarder rows in the cabinet, sum of weight/volume/cost/price,
-- latest fdatestatus4, warehouse name).
--
-- The page can JOIN this against tb_cnt_item server-side or client-side
-- for the "จ่ายแล้ว" flag (or wrap as a second RPC if perf demands it later).
--
-- 50,000-row in-memory walk → ~5,603-row pre-aggregated result · 88× wire cut.

CREATE OR REPLACE FUNCTION public.get_container_summary(
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
  sum_price            numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    f.fcabinetnumber,
    -- For a given cabinet the transport / warehouse / close-date should be
    -- consistent across rows; MAX picks a stable value in the rare case
    -- the data drifted.
    MAX(f.ftransporttype)                    AS ftransporttype,
    MAX(f.fwarehousename)                    AS fwarehousename,
    MAX(f.fdatecontainerclose::timestamptz)  AS fdatecontainerclose,
    MAX(f.fdatestatus4::timestamptz)         AS latest_fdatestatus4,
    COUNT(*)::bigint                         AS row_count,
    COALESCE(SUM(f.fweight::numeric),         0)::numeric  AS sum_weight,
    COALESCE(SUM(f.fvolume::numeric),         0)::numeric  AS sum_volume,
    COALESCE(SUM(f.fcosttotalprice::numeric), 0)::numeric  AS sum_cost,
    COALESCE(SUM(f.ftotalprice::numeric),     0)::numeric  AS sum_price
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
  '/admin/report-cnt main listing — one row per distinct cabinet with rollups. B5 fix (2026-06-06).';

-- ── Grants (service_role + authenticated read; RLS lives on tb_forwarder) ──
GRANT EXECUTE ON FUNCTION public.count_distinct_cabinets(text, text, date, date) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.get_container_summary(text, text, date, date)   TO service_role, authenticated;
