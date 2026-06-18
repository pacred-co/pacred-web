-- ════════════════════════════════════════════════════════════════════════
-- 0191_count_distinct_cabinets_action_pay.sql
-- ════════════════════════════════════════════════════════════════════════
-- 2026-06-18 (audit) — /admin/report-cnt tab + transport BADGE counts ignored
-- the "การจ่ายเงินตู้" (จ่ายแล้ว / ยังไม่จ่าย) filter, so when an admin picked a
-- non-default actionPay the badge (tab total) exceeded the rows actually shown
-- (the listing IS actionPay-filtered in page.tsx). Owner standard: "badge numbers
-- EXACT — อย่ามั่ว".
--
-- FIX: add an optional p_action_pay arg to count_distinct_cabinets that mirrors
-- the page's tb_cnt_item paid-flag filter (a cabinet is "จ่ายแล้ว" iff it has a
-- tb_cnt_item row). EXISTS/NOT EXISTS avoids COUNT(DISTINCT) fan-out.
--   p_action_pay '1' = ยังไม่จ่าย (NO tb_cnt_item row)
--   p_action_pay '2' = จ่ายแล้ว  (HAS a tb_cnt_item row)
--   NULL/'all'/''    = no paid filter (back-compat — the old behaviour)
--
-- ⚠️ tb_cnt_item uses the quoted mixed-case "fCabinetNumber" on prod (the page
-- joins on it via .in("fCabinetNumber", ...)).
--
-- ⚠️ Adding a DEFAULT arg via CREATE OR REPLACE does NOT replace the old 4-arg
-- function — Postgres keys functions by their arg signature, so it would create
-- a SECOND overload and a bare 4-arg call (the common actionPay='all' case) then
-- hits a PostgREST "could not choose the best candidate" ambiguity. So DROP the
-- old 4-arg signature FIRST, leaving only the 5-arg (DEFAULT NULL) function — a
-- 4-arg call then unambiguously binds it via the default.
-- ════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.count_distinct_cabinets(text, text, date, date);

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
  SELECT COUNT(DISTINCT f.fcabinetnumber)
  FROM public.tb_forwarder f
  WHERE f.fcabinetnumber IS NOT NULL
    AND f.fcabinetnumber <> ''
    AND f.fcabinetnumber <> '0'
    AND f.fstatus <> '99'
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
    AND (
      p_action_pay IS NULL OR p_action_pay = '' OR p_action_pay = 'all'
      OR (p_action_pay = '2' AND EXISTS (
            SELECT 1 FROM public.tb_cnt_item ci
            WHERE ci."fCabinetNumber" = f.fcabinetnumber))
      OR (p_action_pay = '1' AND NOT EXISTS (
            SELECT 1 FROM public.tb_cnt_item ci
            WHERE ci."fCabinetNumber" = f.fcabinetnumber))
    );
$$;

GRANT EXECUTE ON FUNCTION public.count_distinct_cabinets(text, text, date, date, text) TO service_role, authenticated;
