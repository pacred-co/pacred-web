-- ════════════════════════════════════════════════════════════
-- 0119 · MOMO commit-tracking columns on momo_import_tracks
-- ════════════════════════════════════════════════════════════
-- Brief 2026-05-28 (synthesis G1 · ภูม): สร้าง review-grid commit UX
-- สำหรับ Admin MOMO sync. Admin คลิก "สร้างใหม่" ต่อ row → INSERT
-- ลง tb_forwarder + mark row นั้นว่า committed แล้ว.
--
-- Why these columns: ระหว่าง review grid ต้องรู้ว่า row ไหน committed
-- แล้ว (ไม่ต้องแสดงในตาราง pending) และ row ไหนยัง pending. จะใช้
-- `momo_sync_logs` แทนก็ได้ แต่จะ scan ทั้ง logs ทุกครั้ง slow + ยุ่ง.
-- เก็บ flag ตรงๆ บน source row สะอาดและเร็วกว่า.
--
-- ⚠️ ISOLATION (per 2026-05-28 brief — same rules as 0116, 0117):
--   ✅ Touch ONLY momo_* tables (here: momo_import_tracks)
--   ❌ Do NOT touch legacy cargo_* / tb_*
--   ❌ Do NOT touch enum / trigger / function / RLS policy of legacy
--   ❌ tb_forwarder is referenced ONLY as text (id stored as bigint;
--      NO foreign key — keeps isolation tight per brief)
--
-- Idempotent (safe to re-run).
-- ════════════════════════════════════════════════════════════

-- ── 1. Add commit-tracking columns ────────────────────────────
alter table public.momo_import_tracks
  add column if not exists committed_at            timestamptz,
  add column if not exists committed_forwarder_id  bigint,
  add column if not exists committed_by            uuid,
  add column if not exists commit_userid           text;

comment on column public.momo_import_tracks.committed_at is
  'Timestamp when admin clicked "สร้างใหม่" and the row was INSERTed into tb_forwarder. NULL = still pending in review grid.';
comment on column public.momo_import_tracks.committed_forwarder_id is
  'The tb_forwarder.id created from this row. No FK — text reference only (isolation).';
comment on column public.momo_import_tracks.committed_by is
  'auth.users.id of the admin who committed (no FK — isolation).';
comment on column public.momo_import_tracks.commit_userid is
  'tb_users.userID (PR####) the admin assigned this row to. Stored for audit.';

-- ── 2. Index for the review-grid query ─────────────────────────
-- Pending rows query: WHERE committed_at IS NULL ORDER BY last_synced_at DESC.
-- Partial index keeps it tiny — only un-committed rows.
create index if not exists momo_import_tracks_pending_idx
  on public.momo_import_tracks (last_synced_at desc)
  where committed_at is null;

-- Index for "what did admin X commit" audit queries.
create index if not exists momo_import_tracks_committed_idx
  on public.momo_import_tracks (committed_at desc)
  where committed_at is not null;

-- ════════════════════════════════════════════════════════════
-- Verification queries (paste in SQL Editor after running this):
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name='momo_import_tracks'
--      AND column_name IN ('committed_at','committed_forwarder_id','committed_by','commit_userid');
--   -- 4 rows expected, all nullable.
--
--   -- All rows still pending after migration:
--   SELECT count(*) FROM momo_import_tracks WHERE committed_at IS NULL;
-- ════════════════════════════════════════════════════════════
