-- ════════════════════════════════════════════════════════════
-- 0119 · Disambiguate container naming + explode track_details[]
-- ════════════════════════════════════════════════════════════
-- Brief 2026-05-28 (ปอน): "Momo Data Foundation" Phase A — fix the
-- preview bug where import_track row (tracking 1779529270 + fid
-- PR20260527-SEA01) and container_closed row (cid_code JXLU6157980)
-- display as 2 disjoint rows even though they're the same shipment.
--
-- ROOT CAUSE: mapper.ts never extracts `raw.track_details[]` from
-- container_closed responses → tracking inside the array is invisible
-- → no edge connects the two rows.
--
-- ROOT CAUSE 2 (naming):
--   momo_import_tracks.momo_container_no holds `PR20260527-SEA01` (= fid/ref)
--   momo_container_closed.momo_container_no holds `JXLU6157980` (= cid_code/real)
--   Two columns same name, different meanings → ambiguous joins.
--
-- FIX (Phase A — coexist with existing columns, no rename, no drop):
--   1. ADD COLUMN momo_container_ref to BOTH tables (clearer name for ref/fid)
--      — momo_import_tracks: mirror of existing momo_container_no
--      — momo_container_closed: NEW data, sourced from raw.fid
--   2. ADD COLUMN container_batch_no + real_container_no to momo_container_closed
--      — container_batch_no: raw.cid (e.g. "GZS260525-2")
--      — real_container_no: raw.cid_code (e.g. "JXLU6157980")
--   3. CREATE TABLE momo_container_closed_tracks — one row per track in
--      container_closed.raw.track_details[]. This is the JOIN bridge:
--      tracking ↔ momo_container_ref ↔ real_container_no.
--
-- Existing momo_container_no columns stay (no rename, no drop) — backward
-- compatible with all current readers. Mapper updates populate new + old.
--
-- ⚠️ ISOLATION (same rules as 0116/0117/0118):
--   ✅ Touch ONLY momo_* tables
--   ❌ Do NOT touch legacy cargo_* / tb_*
--   ❌ Do NOT rename, drop, or change meaning of existing columns
--
-- Idempotent — safe to re-run (ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════

-- ── 1. momo_import_tracks — alias the existing container_no column ─
-- The existing `momo_container_no` already holds the ref value
-- (raw.container_no = e.g. "PR20260527-SEA01"), but the column NAME
-- implies "the real container number" which is wrong. Add a clearer
-- alias so new queries use the right name.

alter table public.momo_import_tracks
  add column if not exists momo_container_ref text;

comment on column public.momo_import_tracks.momo_container_ref is
  'MOMO container reference / round ID (e.g. "PR20260527-SEA01"). Same value as the legacy `momo_container_no` column — this is the clearer name. Sourced from raw->>''container_no''. NOT the real container number — see momo_container_closed.real_container_no for that.';

create index if not exists momo_import_tracks_container_ref_idx
  on public.momo_import_tracks (momo_container_ref);


-- ── 2. momo_container_closed — split the ambiguous column ──────────
-- Existing `momo_container_no` holds cid_code (real). Keep it (backward
-- compat). Add 3 explicit columns to express the 3 different identifiers
-- this endpoint actually has:
--   fid       → momo_container_ref     (round / shipment grouping id)
--   cid       → container_batch_no     (Momo's batch number, e.g. "GZS260525-2")
--   cid_code  → real_container_no      (the actual shipping container number)

alter table public.momo_container_closed
  add column if not exists momo_container_ref text,
  add column if not exists container_batch_no text,
  add column if not exists real_container_no  text;

comment on column public.momo_container_closed.momo_container_ref is
  'MOMO container reference / round ID (e.g. "PR20260527-SEA01"). Sourced from raw->>''fid''. Join key with momo_import_tracks.momo_container_ref.';
comment on column public.momo_container_closed.container_batch_no is
  'MOMO container batch number (e.g. "GZS260525-2"). Sourced from raw->>''cid''.';
comment on column public.momo_container_closed.real_container_no is
  'Real shipping container number (e.g. "JXLU6157980"). Sourced from raw->>''cid_code''. SAME VALUE as the legacy momo_container_no column — use this name for clarity in new code.';

create index if not exists momo_container_closed_container_ref_idx
  on public.momo_container_closed (momo_container_ref);
create index if not exists momo_container_closed_batch_no_idx
  on public.momo_container_closed (container_batch_no);
create index if not exists momo_container_closed_real_container_no_idx
  on public.momo_container_closed (real_container_no);


-- ── 3. momo_container_closed_tracks — explode raw.track_details[] ──
-- Brief §"Container Closed Tracks" (P0 fix for preview disjoint rows).
--
-- raw.track_details = [{ reTrack, kg, cbm, width, height, length, total_quantity }, ...]
-- Each entry is a tracking number that lives INSIDE this closed container.
-- Without this table, there's no DB edge from tracking → real_container_no.
--
-- Example for the preview bug case:
--   container_closed row: cid_code=JXLU6157980, fid=PR20260527-SEA01
--   This table:           reTrack=1779529270, kg=5, cbm=0.0216
--   Now tracking 1779529270 ↔ real container JXLU6157980 has a row to JOIN.

create table if not exists public.momo_container_closed_tracks (
  id                    uuid primary key default gen_random_uuid(),
  container_closed_id   uuid not null
    references public.momo_container_closed(id)
    on delete cascade,
  -- Denormalized refs (mirror from parent for fast filtering — populated by mapper/backfill)
  momo_container_ref    text,    -- = parent's momo_container_ref (raw.fid)
  container_batch_no    text,    -- = parent's container_batch_no  (raw.cid)
  real_container_no     text,    -- = parent's real_container_no   (raw.cid_code)
  -- Per-tracking fields from raw.track_details[i]
  momo_tracking_no      text not null,        -- raw.track_details[i].reTrack
  weight_kg             numeric,              -- raw.track_details[i].kg
  cbm                   numeric,              -- raw.track_details[i].cbm
  width                 numeric,              -- raw.track_details[i].width
  height                numeric,              -- raw.track_details[i].height
  length                numeric,              -- raw.track_details[i].length
  quantity              integer,              -- raw.track_details[i].total_quantity
  raw                   jsonb not null,       -- full track_details[i] for audit
  last_synced_at        timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- One tracking per closed container — re-running sync upserts in place
  constraint momo_container_closed_tracks_unique
    unique (container_closed_id, momo_tracking_no)
);

comment on table public.momo_container_closed_tracks is
  'Per-tracking rows exploded from momo_container_closed.raw.track_details[]. JOIN BRIDGE between tracking number and the real container/batch — fixes the 2026-05-28 preview disjoint-row bug. Admin-only via service_role. Created 2026-05-28 (Phase A).';

create index if not exists momo_container_closed_tracks_tracking_idx
  on public.momo_container_closed_tracks (momo_tracking_no);
create index if not exists momo_container_closed_tracks_ref_idx
  on public.momo_container_closed_tracks (momo_container_ref);
create index if not exists momo_container_closed_tracks_real_idx
  on public.momo_container_closed_tracks (real_container_no);
create index if not exists momo_container_closed_tracks_batch_idx
  on public.momo_container_closed_tracks (container_batch_no);
create index if not exists momo_container_closed_tracks_parent_idx
  on public.momo_container_closed_tracks (container_closed_id);

alter table public.momo_container_closed_tracks enable row level security;

-- service_role bypasses RLS by default — no explicit allow policies.
-- All other roles default-deny (RLS on, no policy = reject).


-- ════════════════════════════════════════════════════════════
-- Verification queries (run after apply + after first sync click):
--
--   -- New columns exist:
--   \d momo_import_tracks
--   \d momo_container_closed
--   \d momo_container_closed_tracks
--
--   -- Preview unified row for the bug-case tracking:
--   SELECT
--     t.momo_tracking_no,
--     c.momo_container_ref,
--     c.container_batch_no,
--     c.real_container_no,
--     c.ship_by,
--     t.weight_kg, t.cbm, t.quantity
--   FROM momo_container_closed_tracks t
--   JOIN momo_container_closed c ON c.id = t.container_closed_id
--   WHERE t.momo_tracking_no = '1779529270';
--   -- Expect: 1779529270 | PR20260527-SEA01 | GZS260525-2 | JXLU6157980 | ship | 5 | 0.0216 | 1
--
--   -- Cross-table JOIN now possible:
--   SELECT
--     it.momo_tracking_no,
--     it.momo_container_ref AS ref_from_import_track,
--     cct.real_container_no AS real_from_container_closed
--   FROM momo_import_tracks it
--   LEFT JOIN momo_container_closed_tracks cct ON cct.momo_tracking_no = it.momo_tracking_no
--   WHERE it.momo_tracking_no = '1779529270';
--
-- Confirm legacy untouched:
--   SELECT count(*) FROM cargo_containers; -- unchanged
--   SELECT count(*) FROM tb_forwarder;     -- unchanged
-- ════════════════════════════════════════════════════════════
