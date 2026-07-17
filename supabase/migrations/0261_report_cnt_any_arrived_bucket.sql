-- ════════════════════════════════════════════════════════════════════════
-- 0261_report_cnt_any_arrived_bucket.sql
-- ════════════════════════════════════════════════════════════════════════
-- 2026-07-18 — owner directive: on /admin/report-cnt, a ตู้ moves from the
-- "รอเข้าโกดังไทย" tab to "เข้าโกดังไทยแล้ว" the moment ANY tracking in it is
-- scanned-received into the TH warehouse (ยิงรับเข้าแม้แต่ชิ้นเดียว) — not only
-- once EVERY tracking has arrived.
--
--   BEFORE (0243): bucket = container-wide MIN(fstatus)
--     succeed ⟺ MIN(fstatus) >= '4'   (ALL trackings arrived)
--     waiting ⟺ MIN(fstatus) <  '4'
--
--   AFTER (0261): bucket = container-wide MAX(fstatus) — "any arrived"
--     succeed ⟺ MAX(fstatus) >= '4'   (at least ONE tracking arrived)
--     waiting ⟺ MAX(fstatus) <  '4'   (none arrived yet)
--
-- fstatus is a single-char varchar '1'..'7' → lexical MAX == numeric MAX; '99'
-- (cancelled) is excluded in WHERE so it never pins MAX; an empty-string row
-- can't pin MAX ('' < '4' lexically) → an all-blank cabinet stays waiting
-- (conservative). Every OTHER filter (fcabinetnumber, <>'99', transport,
-- succeed-date, actionPay), the return shape, and the whole-container SUM
-- rollups are UNCHANGED — only WHICH tab a mixed container shows in flips.
-- NO per-forwarder money VALUE is touched (money-neutral). Additive CREATE OR
-- REPLACE only (no signature/return-type change vs 0243). Idempotent.
--
-- The JS fallback (page.tsx groupByContainer + isContainerInBucket) mirrors this
-- MAX rule so the RPC path and the fallback bucket identically.
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
    -- min_fstatus = the LEAST-advanced tracking → the row's representative
    -- "what it's still waiting on" status (display). max_fstatus now drives the
    -- BUCKET (any-arrived · 0261).
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
  -- 0261: "any arrived" — a ตู้ is เข้าโกดังไทยแล้ว as soon as at least ONE of its
  -- trackings reached TH (MAX(fstatus) >= '4'). Still mutually exclusive per ตู้.
  HAVING (p_page = 'waiting' AND MAX(f.fstatus) <  '4')
      OR (p_page = 'succeed' AND MAX(f.fstatus) >= '4')
  ORDER BY MAX(f.fdatestatus4) DESC NULLS LAST, f.fcabinetnumber;
$$;

COMMENT ON FUNCTION public.get_container_summary(text, text, date, date) IS
  '/admin/report-cnt listing — one row per cabinet, bucketed by container-wide MAX(fstatus) (0261 "any arrived": ≥1 tracking in TH → เข้าโกดังไทยแล้ว). Rollups sum the whole cabinet; min_fstatus = representative display status.';

-- count_distinct_cabinets: same "any arrived" bucket so the tab/transport BADGE
-- counts stay EXACT vs the listing (owner "อย่ามั่ว"). MIN → MAX in the HAVING.
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
    HAVING (p_page = 'waiting' AND MAX(f.fstatus) <  '4')
        OR (p_page = 'succeed' AND MAX(f.fstatus) >= '4')
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.get_container_summary(text, text, date, date)         TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.count_distinct_cabinets(text, text, date, date, text) TO service_role, authenticated;
