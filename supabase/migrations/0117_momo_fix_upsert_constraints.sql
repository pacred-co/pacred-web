-- ════════════════════════════════════════════════════════════
-- 0117 · Fix partial unique indexes → full unique indexes for upsert
-- ════════════════════════════════════════════════════════════
-- Bug found 2026-05-28: the partial unique indexes in 0116 (e.g.
-- `WHERE momo_tracking_no is not null`) cannot satisfy PostgreSQL's
-- ON CONFLICT clause used by `supabase.from(...).upsert(...,
-- { onConflict: "momo_tracking_no" })`. Result: every sync attempt
-- on momo_import_tracks + momo_container_closed fails with:
--   "there is no unique or exclusion constraint matching the
--    ON CONFLICT specification"
-- (one such failed sync_log already in momo_sync_logs from a click
--  test 2026-05-28 09:20:09 UTC).
--
-- Fix: drop the partial unique indexes + create plain unique indexes.
-- PostgreSQL's regular UNIQUE allows multiple NULLs by default
-- (NULL ≠ NULL semantics), so removing the WHERE filter is safe
-- — rows with NULL `momo_tracking_no` / `momo_container_no` can still
-- coexist; only non-null values get uniqueness enforcement.
--
-- ⚠️ ISOLATION (per 2026-05-28 brief — same rules as 0116):
--   ✅ Touch ONLY the momo_* tables created in 0116
--   ❌ Do NOT touch legacy cargo_* / tb_*
--   ❌ Do NOT touch enum / trigger / function / RLS policy of legacy
-- ════════════════════════════════════════════════════════════

-- ── 1. momo_import_tracks — swap partial → full unique ────────
drop index if exists public.momo_import_tracks_tracking_unique;
create unique index if not exists momo_import_tracks_tracking_unique
  on public.momo_import_tracks (momo_tracking_no);

-- ── 2. momo_container_closed — swap partial → full unique ────
drop index if exists public.momo_container_closed_container_unique;
create unique index if not exists momo_container_closed_container_unique
  on public.momo_container_closed (momo_container_no);

-- ── 3. momo_sack_infos — already correct (named constraint, no fix needed) ──
-- (Left here as a comment for audit clarity.)
--   ALREADY: constraint momo_sack_infos_sack_unique unique (momo_sack_no)
--   No change needed.

-- ════════════════════════════════════════════════════════════
-- Verification queries (paste in SQL Editor after running this):
--   SELECT indexname, indexdef
--   FROM pg_indexes
--   WHERE schemaname='public'
--     AND indexname IN (
--       'momo_import_tracks_tracking_unique',
--       'momo_container_closed_container_unique'
--     );
--   -- Both `indexdef` should NOT contain "WHERE" anymore.
--
-- Re-test sync:
--   POST /api/admin/momo/sync   {start, end}
--   → expect status=success, upserted_count=5, errors=[]
-- ════════════════════════════════════════════════════════════
