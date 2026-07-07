-- ════════════════════════════════════════════════════════════════════════
-- 0243_report_cnt_container_level_bucket.sql
-- ════════════════════════════════════════════════════════════════════════
-- 2026-07-07 — /admin/report-cnt bucketed containers by a ROW-level fstatus
-- predicate (0146/0189/0190/0191):
--     (p_page='waiting' AND f.fstatus < '4') OR (p_page='succeed' AND f.fstatus > '3')
-- applied in WHERE, BEFORE GROUP BY fcabinetnumber. For a MIXED container
-- (some trackings <4, some >3):
--   • it matched BOTH buckets → the ตู้ showed in the waiting AND the succeed
--     tab, with an inconsistent MIN(fstatus) per bucket, and
--   • the per-page rollups (SUM weight/volume/cost/price, COUNT) summed only
--     the bucket-matching rows → PARTIAL container totals.
--
-- CORRECT model (the 0189 comment: "a container is only advanced once EVERY
-- tracking is [arrived]"): a cabinet is
--   succeed ⟺ MIN(fstatus) >= '4'  (all trackings arrived in TH)
--   waiting ⟺ MIN(fstatus) <  '4'
-- — mutually exclusive, aggregating over ALL rows of the cabinet.
--
-- FIX: move ONLY the bucket predicate from row-level WHERE → container-wide
-- HAVING MIN(fstatus). Every OTHER filter (fcabinetnumber, <>'99', transport,
-- succeed-date, actionPay) + the return shape are UNCHANGED. fstatus is a
-- single-char varchar '1'..'7' → lexical MIN == numeric; '99' (cancelled) is
-- already excluded in WHERE, so it never pins MIN. An empty/NULL-only cabinet →
-- MIN empty/NULL → falls in neither HAVING branch's succeed side; an empty MIN
-- goes to waiting (< '4'), matching the pre-fix conservative behaviour.
--
-- Additive CREATE OR REPLACE only (no signature/return-type change vs the
-- deployed 0190 get_container_summary + 0191 count_distinct_cabinets) — no
-- table/data change. Idempotent. NO per-forwarder money VALUE is touched: only
-- WHICH bucket a container shows in + which rows the LIST aggregate sums (now
-- the whole container, which is MORE correct + matches the detail page/legacy).
-- ════════════════════════════════════════════════════════════════════════

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
    -- container-wide MIN/MAX over ALL its trackings (0243: sums now whole-ตู้).
    MIN(f.fstatus)                           AS min_fstatus,
    MAX(f.fstatus)                           AS max_fstatus
  FROM public.tb_forwarder f
  WHERE f.fcabinetnumber IS NOT NULL
    AND f.fcabinetnumber <> ''
    AND f.fcabinetnumber <> '0'
    AND f.fstatus <> '99'                                   -- 0190: drop cancelled
    AND (
      p_transport IS NULL OR p_transport = '' OR f.ftransporttype = p_transport
    )
    AND (
      p_page <> 'succeed' OR p_start IS NULL OR p_end IS NULL OR
      (f.fdatecontainerclose >= (p_start::text || ' 00:00:00')::timestamptz
       AND f.fdatecontainerclose <= (p_end::text   || ' 23:59:59')::timestamptz)
    )
  GROUP BY f.fcabinetnumber
  -- 0243: container-level bucket by the least-advanced tracking (MIN). One ตู้
  -- lands in exactly ONE tab — no more mixed-cabinet double-list / partial sums.
  HAVING (p_page = 'waiting' AND MIN(f.fstatus) <  '4')
      OR (p_page = 'succeed' AND MIN(f.fstatus) >= '4')
  ORDER BY MAX(f.fdatestatus4) DESC NULLS LAST, f.fcabinetnumber;
$$;

COMMENT ON FUNCTION public.get_container_summary(text, text, date, date) IS
  '/admin/report-cnt listing — one row per cabinet, bucketed by container-wide MIN(fstatus). 0243 (2026-07-07): WHERE row-bucket → HAVING MIN (fixes mixed-cabinet double-list + partial rollups).';

-- count_distinct_cabinets: same container-level bucket so the tab/transport
-- BADGE counts stay EXACT vs the listing (owner "อย่ามั่ว"). The bucket now
-- needs a GROUP BY + HAVING, so COUNT(DISTINCT) → COUNT(*) over the grouped
-- subquery (equivalent). Keeps the 5-arg (p_action_pay) signature from 0191.
CREATE OR REPLACE FUNCTION public.count_distinct_cabinets(
  p_page       text,
  p_transport  text DEFAULT NULL,
  p_start      date DEFAULT NULL,
  p_end        date DEFAULT NULL,
  p_action_pay text DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::bigint FROM (
    SELECT f.fcabinetnumber
    FROM public.tb_forwarder f
    WHERE f.fcabinetnumber IS NOT NULL
      AND f.fcabinetnumber <> ''
      AND f.fcabinetnumber <> '0'
      AND f.fstatus <> '99'
      AND (
        p_transport IS NULL OR p_transport = '' OR f.ftransporttype = p_transport
      )
      AND (
        p_page <> 'succeed' OR p_start IS NULL OR p_end IS NULL OR
        (f.fdatecontainerclose >= (p_start::text || ' 00:00:00')::timestamptz
         AND f.fdatecontainerclose <= (p_end::text   || ' 23:59:59')::timestamptz)
      )
      AND (
        p_action_pay IS NULL OR p_action_pay = '' OR p_action_pay = 'all'
        OR (p_action_pay = '2' AND EXISTS (
              SELECT 1 FROM public.tb_cnt_item ci
              WHERE ci."fCabinetNumber" = f.fcabinetnumber))
        OR (p_action_pay = '1' AND NOT EXISTS (
              SELECT 1 FROM public.tb_cnt_item ci
              WHERE ci."fCabinetNumber" = f.fcabinetnumber))
      )
    GROUP BY f.fcabinetnumber
    HAVING (p_page = 'waiting' AND MIN(f.fstatus) <  '4')
        OR (p_page = 'succeed' AND MIN(f.fstatus) >= '4')
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.get_container_summary(text, text, date, date)         TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.count_distinct_cabinets(text, text, date, date, text) TO service_role, authenticated;
