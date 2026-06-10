-- ════════════════════════════════════════════════════════════════════════
-- 0173_count_forwarder_by_owner_rpc.sql
-- ════════════════════════════════════════════════════════════════════════
-- 2026-06-10 (เดฟ · CRM/leads lane · docs/research/full-scope-gap-2026-06-08.md
-- §2 "Build 6"):
--
-- /admin/leads "ลูกค้า PCS รายใหญ่" (big-pcs segment) ranks the lead pool by
-- lifetime tb_forwarder order count. actions/admin/leads.ts previously scanned
-- only the most-recent 8,000 tb_forwarder rows (BIG_PCS_SCAN) and counted in
-- JS — a recent-slice approximation, NOT the full base (47k+ rows), so a
-- long-standing big owner whose orders aren't recent could be mis-ranked or
-- missed entirely.
--
-- This RPC does the GROUP BY in Postgres over the FULL tb_forwarder base and
-- returns the top-N owners with their exact lifetime counts. leads.ts now
-- calls .rpc('count_forwarder_by_owner', { p_top }) — with the old slice-scan
-- kept in code as a deploy-before-migration fallback (same RPC+fallback
-- pattern as actions/admin/export/report-cnt.ts → 0146).
--
-- Precedent / style: 0146_report_cnt_distinct_rpcs.sql (LANGUAGE sql STABLE
-- aggregate RPCs over tb_forwarder).
--
-- Idempotent: CREATE OR REPLACE FUNCTION + REVOKE/GRANT are re-runnable.
-- Additive only — no table/column/data changes. ห้ามแตะ table เดิม: ✅ (read-only fn).
-- ════════════════════════════════════════════════════════════════════════

-- p_top: how many top owners to return (by lifetime order count, descending).
-- NULL or <= 0 → no limit (the FULL per-owner count list — "full-base ranking").
-- Default 200 = the /admin/leads BIG_PCS_TOP page size.
CREATE OR REPLACE FUNCTION public.count_forwarder_by_owner(p_top integer DEFAULT 200)
RETURNS TABLE (userid text, order_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT
    TRIM(f.userid)   AS userid,        -- the JS counter trimmed before counting; mirror it
    COUNT(*)::bigint AS order_count
  FROM public.tb_forwarder f
  WHERE f.userid IS NOT NULL
    AND TRIM(f.userid) <> ''
  GROUP BY TRIM(f.userid)
  ORDER BY COUNT(*) DESC, TRIM(f.userid) ASC
  LIMIT CASE WHEN p_top IS NULL OR p_top <= 0 THEN NULL ELSE p_top END;
$$;

COMMENT ON FUNCTION public.count_forwarder_by_owner(integer) IS
  '/admin/leads big-pcs segment — per-owner tb_forwarder order counts over the FULL base (top p_top by lifetime count; p_top NULL/<=0 = all owners). Build 6, full-scope-gap §2 (2026-06-10). service_role-only: feeds the PDPA-adjacent leads call-queue, read via createAdminClient.';

-- ── Grants — service_role ONLY ──────────────────────────────────────────
-- Unlike 0146 (granted authenticated too), this feeds the /admin/leads
-- PDPA-adjacent surface (member activity ranking) and is only ever called
-- via createAdminClient (service_role). SECURITY INVOKER (default): even if
-- anon/authenticated could call it, tb_forwarder RLS would still apply to
-- them — but revoke anyway (defense in depth; CREATE grants EXECUTE to
-- PUBLIC by default).
REVOKE ALL ON FUNCTION public.count_forwarder_by_owner(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_forwarder_by_owner(integer) TO service_role;

-- ════════════════════════════════════════════════════════════
-- DONE 0173.
--
-- Verification queries (run by hand after applying):
--   SELECT * FROM public.count_forwarder_by_owner(5);
--     -- expect 5 rows · order_count descending · non-empty userid
--   SELECT SUM(order_count) FROM public.count_forwarder_by_owner(NULL);
--     -- expect = SELECT COUNT(*) FROM public.tb_forwarder
--     --          WHERE TRIM(COALESCE(userid, '')) <> '';
--
-- Confirm legacy untouched (no schema/data change):
--   SELECT COUNT(*) FROM public.tb_forwarder;   -- unchanged
-- ════════════════════════════════════════════════════════════
