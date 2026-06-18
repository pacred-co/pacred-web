-- ════════════════════════════════════════════════════════════════════════
-- 0190_report_cnt_exclude_cancelled.sql
-- ════════════════════════════════════════════════════════════════════════
-- 2026-06-18 (audit) — /admin/report-cnt leaks CANCELLED containers into the
-- "เข้าโกดังไทยแล้ว" tab. The tab/RPC predicate is a LEXICAL text comparison
-- `f.fstatus > '3'` (fstatus is varchar), and the cancel sentinel '99'
-- (tb_forwarder.fstatus '99' = สถานะพิเศษ/ยกเลิก · barcode.ts TB_FSTATUS map)
-- sorts ABOVE '3' as text → a cancelled ตู้ shows up as if it had arrived (and
-- its MIN(fstatus) renders as the gray "99" chip). It also inflates the succeed
-- tab badge.
--
-- FIX: exclude fstatus '99' from BOTH report-cnt RPCs. The valid physical/money
-- axis is '1'..'7'; '99' is out-of-band and never belongs in either tab.
-- CREATE OR REPLACE (no return-type change vs 0189/0146) — idempotent.
-- ════════════════════════════════════════════════════════════════════════

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
    AND f.fstatus <> '99'                                   -- 0190: drop cancelled
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
    MIN(f.fstatus)                           AS min_fstatus,
    MAX(f.fstatus)                           AS max_fstatus
  FROM public.tb_forwarder f
  WHERE f.fcabinetnumber IS NOT NULL
    AND f.fcabinetnumber <> ''
    AND f.fcabinetnumber <> '0'
    AND f.fstatus <> '99'                                   -- 0190: drop cancelled
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

GRANT EXECUTE ON FUNCTION public.count_distinct_cabinets(text, text, date, date) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.get_container_summary(text, text, date, date)   TO service_role, authenticated;
