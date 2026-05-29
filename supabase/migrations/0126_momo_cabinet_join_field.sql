-- ════════════════════════════════════════════════════════════
-- 0126 · MOMO cabinet field — propagate cid → momo_import_tracks
-- ════════════════════════════════════════════════════════════
-- ภูม flag 2026-05-30 evening (bug 2c · PRIMARY):
--
--   "PR20260527-SEA01 มันไม่ใช่นะ "cid": "GZS260525-2", อันเนี้ย
--    คือเลขตู้ที่ถูกต้อง"
--
-- The import_track endpoint returns container_no = "PR20260527-SEA01"
-- = MOMO's INTERNAL ROUTING BATCH ID (NOT the actual cabinet).
--
-- The container_closed endpoint returns cid = "GZS260525-2"
-- = THE REAL CABINET NAME used by PCS staff / customers / receipts.
--
-- Each container_closed row has track_details[] with reTrack = the
-- tracking number — that's how MOMO joins cabinet ↔ track.
--
-- ── COMPATIBILITY WITH 0119 ─────────────────────────────────────
-- Migration 0119 already added these columns on momo_container_closed:
--   - momo_container_ref  = raw.fid       (e.g. "PR20260527-SEA01")  routing batch
--   - container_batch_no  = raw.cid       (e.g. "GZS260525-2")        the CABINET ✅
--   - real_container_no   = raw.cid_code  (e.g. "JXLU6157980")        physical container
--
-- Migration 0119 ALSO added `momo_container_ref` on momo_import_tracks
-- (mirror of the existing routing-batch column), but did NOT add a
-- column for the JOINED cabinet (cid) — there's no producer that walks
-- container_closed.track_details and writes back. That's this migration.
--
-- We add `container_batch_no` to momo_import_tracks (matching the column
-- name on momo_container_closed) so the field is consistent across both
-- tables. The new producer (lib/integrations/momo-isolated/sync.ts step
-- 2.5 — added in the same commit) walks container_closed.track_details
-- and writes container_batch_no = cid back to each matching import_track.
--
-- Display + commit flow:
--   - Review page reads container_batch_no when known (else falls back
--     to momo_container_no which is the routing batch).
--   - commit-momo-row-core.ts writes container_batch_no (when present)
--     to tb_forwarder.fcabinetnumber.
--
-- One-off backfill for existing prod rows:
--   scripts/backfill-momo-cabinet.mjs
--   (parses every momo_container_closed.raw.track_details[].reTrack,
--    sets container_batch_no = cid on each matching import_track row).
--
-- ⚠️ ISOLATION (per 0116/0117/0118/0119 rules):
--   ✅ Touch ONLY momo_* tables
--   ❌ No FK to legacy tb_*/cargo_*
--   ❌ No ALTER on legacy enum / trigger / function
-- Idempotent — ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- ════════════════════════════════════════════════════════════

-- ── 1. Add the cabinet column ─────────────────────────────────
alter table public.momo_import_tracks
  add column if not exists container_batch_no text;

comment on column public.momo_import_tracks.container_batch_no is
  'The REAL cabinet name (e.g. "GZS260525-2") joined from momo_container_closed.cid via track_details[].reTrack lookup. Same value as momo_container_closed.container_batch_no (added in 0119). Distinct from momo_container_no (which is MOMO''s routing batch ID like "PR20260527-SEA02"). Populated by sync.ts step 2.5 after container_closed upsert. Used as the canonical cabinet display + tb_forwarder.fcabinetnumber write.';

-- ── 2. Index for the propagation lookup ───────────────────────
-- Used by: "which tracking numbers are in cabinet GZS260525-2",
-- the review-grid display, audit, future cabinet-level reports.
create index if not exists momo_import_tracks_batch_no_idx
  on public.momo_import_tracks (container_batch_no)
  where container_batch_no is not null;

-- ════════════════════════════════════════════════════════════
-- Verification (after migration):
--
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name='momo_import_tracks'
--      AND column_name='container_batch_no';
--   -- 1 row, text, nullable.
--
--   -- Confirm index:
--   SELECT indexname FROM pg_indexes
--    WHERE tablename='momo_import_tracks'
--      AND indexname='momo_import_tracks_batch_no_idx';
--
--   -- Pre-backfill — all rows are NULL:
--   SELECT count(*) FROM momo_import_tracks WHERE container_batch_no IS NULL;
--
--   -- After backfill — many rows have cabinet:
--   SELECT count(*), container_batch_no
--     FROM momo_import_tracks
--    WHERE container_batch_no IS NOT NULL
--    GROUP BY container_batch_no
--    ORDER BY count(*) DESC
--    LIMIT 10;
-- ════════════════════════════════════════════════════════════
