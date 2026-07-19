-- ════════════════════════════════════════════════════════════════════════
-- 0263_container_summary_total_cbm.sql
-- ════════════════════════════════════════════════════════════════════════
-- 2026-07-19 — owner: "ตอนเอา คิว กิโล จำนวนกล่อง แต่ละแทรคกิ้งมารวมเข้าชิปเม้น/ตู้
-- ต้องบวกรวมให้ตรง ไม่ใช่หายหรือบัค".
--
-- tb_forwarder stores fvolume in TWO conventions, discriminated by famountcount
-- (legacy forwarder.php L1935-1941 "CBMProduct"):
--   famountcount = '1'  → fvolume is ALREADY the row-TOTAL CBM (MOMO commit path)
--   anything else       → fvolume is PER-BOX CBM → row total = fvolume × famount
--                         (manually-keyed / legacy / TTW rows)
--
-- get_container_summary's sum_volume summed RAW fvolume → a per-box row's CBM
-- under-reported by ×famount on the /admin/report-cnt container rollup (e.g.
-- GZS260625-5T: 19-box tracking counted 0.18067 คิว instead of 3.43273). This
-- migration fixes ONLY the sum_volume expression to the per-row TOTAL — the
-- SELL side + app code already honour the rule (lib/forwarder/quantities.ts
-- totalCbmOf is the TS mirror of this expression; keep the two in lockstep).
--
-- fweight is always a row TOTAL (no per-box convention) → unchanged. Money
-- sums (cost/price) are stored totals → unchanged. Bucketing/filters/signature/
-- return shape byte-identical to 0261. CREATE OR REPLACE only. Idempotent.
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
    -- 0263: row-TOTAL CBM (the famountcount "CBMProduct" rule) — NOT raw fvolume.
    -- famountcount='1' → fvolume already total · else × GREATEST(famount,1)
    -- (missing/0 box count on a per-box row ⇒ ×1 — never zero a real volume).
    COALESCE(SUM(
      CASE WHEN btrim(COALESCE(f.famountcount::text, '')) = '1'
           THEN f.fvolume::numeric
           ELSE f.fvolume::numeric * GREATEST(COALESCE(f.famount::numeric, 1), 1)
      END
    ), 0)::numeric                                          AS sum_volume,
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
      p_transport IS NULL OR p_transport = '' OR f.ftransporttype = p_transport
    )
    AND (
      p_page <> 'succeed' OR p_start IS NULL OR p_end IS NULL OR
      (f.fdatecontainerclose >= (p_start::text || ' 00:00:00')::timestamptz
       AND f.fdatecontainerclose <= (p_end::text   || ' 23:59:59')::timestamptz)
    )
  GROUP BY f.fcabinetnumber
  -- 0261: "any arrived" bucket — unchanged.
  HAVING (p_page = 'waiting' AND MAX(f.fstatus) <  '4')
      OR (p_page = 'succeed' AND MAX(f.fstatus) >= '4')
  ORDER BY MAX(f.fdatestatus4) DESC NULLS LAST, f.fcabinetnumber;
$$;

COMMENT ON FUNCTION public.get_container_summary(text, text, date, date) IS
  '/admin/report-cnt listing — one row per cabinet (0261 any-arrived bucket). 0263: sum_volume = Σ row-TOTAL CBM via the famountcount CBMProduct rule (TS mirror: lib/forwarder/quantities.ts totalCbmOf).';

GRANT EXECUTE ON FUNCTION public.get_container_summary(text, text, date, date) TO service_role, authenticated;
