-- ════════════════════════════════════════════════════════════════════════
-- 0271_container_summary_date_filter_container_level.sql
-- ════════════════════════════════════════════════════════════════════════
-- 2026-07-22 (ภูม · พี่ป๊อป) — /admin/report-cnt "สถานะตู้" was INCONSISTENT
-- between two containers that both have arrived (fstatus=4) trackings mixed
-- with awaiting-payment (fstatus=5) ones:
--   GZE260714-1: dist {4:3, 5:17, 6:1} → wrongly showed "รอชำระเงิน" (min '5')
--   GZS260705-1: dist {4:1, 5:6}       → correctly showed "ถึงไทยแล้ว" (min '4')
--
-- ROOT CAUSE (verified on prod): the succeed-tab DATE filter
--     f.fdatecontainerclose >= p_start AND f.fdatecontainerclose <= p_end
-- was applied in the WHERE clause = ROW-LEVEL, BEFORE the GROUP BY. The 3
-- fstatus=4 rows of GZE260714-1 are MOMO box-split rows (…-1/3, -2/3, -3/3)
-- whose fdatecontainerclose is NULL (never stamped — the container closed but
-- the split rows didn't inherit the date · cf. Wave 24 #192). `NULL >= date`
-- is FALSE → those 3 arrived rows were dropped from the group → MIN(fstatus)
-- was computed over only {5,6} → min_fstatus '5' → the ตู้ read "รอชำระเงิน".
-- GZS260705-1's one fstatus=4 row HAD a valid in-range fdatecontainerclose, so
-- it survived → min '4' → "ถึงไทยแล้ว". Same data shape, opposite display.
--
-- Owner rule (ภูม): a ตู้ must keep showing "ถึงไทยแล้ว" as long as ANY tracking
-- is still at fstatus=4 — the status must flip to "รอชำระเงิน" only once EVERY
-- tracking has advanced. i.e. the representative status = MIN(fstatus) over ALL
-- the ตู้'s trackings, and that MIN must never be distorted by the date window.
--
-- FIX: move the succeed-date filter from the WHERE (row-level) to the HAVING
-- (CONTAINER-level, on MAX(fdatecontainerclose)). Now:
--   • every non-99 row of the cabinet enters the GROUP → MIN/MAX(fstatus) is
--     over ALL trackings (a NULL-close arrived row can no longer be dropped),
--   • the ตู้ is date-filtered as a whole by its latest close date (matching the
--     "one ตู้ = one close date" intent), and
--   • the "any-arrived" bucket (MAX(fstatus) >= '4', 0261) is unchanged.
-- Same fix mirrored into count_distinct_cabinets so the tab/transport BADGE
-- counts stay EXACT vs the listing (owner "อย่ามั่ว").
--
-- The row-level fstatus '99'-exclusion + transport filter stay in WHERE (a ตู้ is
-- transport-uniform; '99' cancelled rows must never enter any aggregate). ONLY
-- the date predicate moves. sum_volume (0263 CBMProduct rule), return shape,
-- signature, and money sums are byte-identical. CREATE OR REPLACE only. Idempotent.
-- READ-ONLY function — no per-forwarder value is touched (money-neutral).
--
-- ⚠️ The page.tsx JS fallback (groupByContainer) must mirror this — its fetch no
--   longer row-filters by date; it buckets + date-filters per container after the
--   group (see the paired app change in this commit).
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
    -- 0263: row-TOTAL CBM (famountcount "CBMProduct" rule) — unchanged.
    COALESCE(SUM(
      CASE WHEN btrim(COALESCE(f.famountcount::text, '')) = '1'
           THEN f.fvolume::numeric
           ELSE f.fvolume::numeric * GREATEST(COALESCE(f.famount::numeric, 1), 1)
      END
    ), 0)::numeric                                          AS sum_volume,
    COALESCE(SUM(f.fcosttotalprice::numeric), 0)::numeric  AS sum_cost,
    COALESCE(SUM(f.ftotalprice::numeric),     0)::numeric  AS sum_price,
    -- min_fstatus = LEAST-advanced tracking over ALL the ตู้'s rows (the true
    -- representative "what it's still waiting on" status). 0271: no longer
    -- distorted by the date window (that filter is now container-level, below).
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
  GROUP BY f.fcabinetnumber
  -- 0261 "any arrived" bucket + 0271 CONTAINER-level date filter (MAX close in
  -- range) — the arrived (fstatus=4) rows with a NULL close no longer drop out.
  HAVING ((p_page = 'waiting' AND MAX(f.fstatus) <  '4')
       OR (p_page = 'succeed' AND MAX(f.fstatus) >= '4'))
     AND ( p_page <> 'succeed' OR p_start IS NULL OR p_end IS NULL OR
           (MAX(f.fdatecontainerclose::timestamptz) >= (p_start::text || ' 00:00:00')::timestamptz
            AND MAX(f.fdatecontainerclose::timestamptz) <= (p_end::text   || ' 23:59:59')::timestamptz) )
  ORDER BY MAX(f.fdatestatus4) DESC NULLS LAST, f.fcabinetnumber;
$$;

COMMENT ON FUNCTION public.get_container_summary(text, text, date, date) IS
  '/admin/report-cnt listing — one row per cabinet (0261 any-arrived bucket). 0263: sum_volume = Σ row-TOTAL CBM (CBMProduct rule). 0271: succeed-date filter moved to HAVING (container-level MAX close) so min/max_fstatus is over ALL rows (NULL-close arrived rows no longer distort the status).';

-- count_distinct_cabinets — the tab/transport BADGE counts. Same 0271 fix: date
-- filter → HAVING container-level so the counts match the listing exactly.
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
        p_action_pay IS NULL OR p_action_pay = '' OR p_action_pay = 'all'
        OR (p_action_pay = '2' AND EXISTS (
              SELECT 1 FROM public.tb_cnt_item ci
              WHERE ci."fCabinetNumber" = f.fcabinetnumber))
        OR (p_action_pay = '1' AND NOT EXISTS (
              SELECT 1 FROM public.tb_cnt_item ci
              WHERE ci."fCabinetNumber" = f.fcabinetnumber))
      )
    GROUP BY f.fcabinetnumber
    HAVING ((p_page = 'waiting' AND MAX(f.fstatus) <  '4')
         OR (p_page = 'succeed' AND MAX(f.fstatus) >= '4'))
       AND ( p_page <> 'succeed' OR p_start IS NULL OR p_end IS NULL OR
             (MAX(f.fdatecontainerclose::timestamptz) >= (p_start::text || ' 00:00:00')::timestamptz
              AND MAX(f.fdatecontainerclose::timestamptz) <= (p_end::text   || ' 23:59:59')::timestamptz) )
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.get_container_summary(text, text, date, date)         TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.count_distinct_cabinets(text, text, date, date, text) TO service_role, authenticated;
