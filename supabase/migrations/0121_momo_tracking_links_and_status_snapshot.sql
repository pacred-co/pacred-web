-- ════════════════════════════════════════════════════════════
-- 0121 · Tracking relationship + status snapshot (Phase C)
-- ════════════════════════════════════════════════════════════
-- Brief 2026-05-28 (ปอน) "Momo Data Foundation" Phase C — add the
-- relationship layer + derived snapshot/history. With these, a single
-- tracking number can resolve its CURRENT phase + status code + which
-- source endpoint produced that answer, in one query.
--
-- Tables added (3):
--   momo_tracking_links              ← edge: tracking ↔ container/sack/cg + matched_by
--   momo_tracking_status_snapshots   ← derived current status per tracking
--   momo_tracking_status_history     ← append-only audit of snapshot changes
--
-- Why these are separate from existing main tables:
--   - Links table is denormalized (one row per tracking + source row),
--     which the main tables can't express (they're per-endpoint).
--   - Snapshot is a DERIVED projection that priority-rules across the
--     3 endpoints. Stored so we don't recompute on every page load.
--   - History is append-only — we need an audit trail when a tracking
--     advances from one phase to the next.
--
-- ⚠️ ISOLATION (same rules as 0116-0120):
--   ✅ Touch ONLY momo_* tables
--   ❌ Do NOT touch legacy cargo_* / tb_*
--   ❌ Do NOT rename / drop / change existing columns
--
-- Idempotent — CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- ════════════════════════════════════════════════════════════


-- ── 1. momo_tracking_links ────────────────────────────────────
-- Edge table: every (tracking_no, source row) connection ends up here.
-- One tracking can appear in multiple source endpoints — we want to be
-- able to look up "all the places we've seen tracking X" in one query.
--
-- matched_by examples:
--   'import_track.tracking'                  — tracking is the row id
--   'container_closed.track_details.reTrack' — found inside track_details[]
--   'sack_info.tracks'                       — found inside sack tracks[]
--
-- confidence is reserved for future use (when MOMO endpoints disagree).
-- For now we always write 'high'.

create table if not exists public.momo_tracking_links (
  id                   uuid primary key default gen_random_uuid(),
  momo_tracking_no     text not null,
  momo_container_ref   text,
  container_batch_no   text,
  real_container_no    text,
  sack_no              text,
  cg_no                text,
  source_endpoint      text not null,        -- 'import_track' | 'container_closed' | 'sack_info'
  source_table         text not null,        -- 'momo_import_tracks' | 'momo_container_closed_tracks' | 'momo_sack_tracks'
  source_record_id     uuid not null,        -- id of the source row
  matched_by           text not null,        -- human-readable match reason
  confidence           text default 'high',  -- 'high' | 'medium' | 'low'
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- One edge per (tracking + source row) — re-runs upsert.
  constraint momo_tracking_links_unique
    unique (momo_tracking_no, source_table, source_record_id)
);

comment on table public.momo_tracking_links is
  'Edge table: one row per tracking ↔ source-row connection. Lets us answer "where has this tracking appeared" + "how did we link it". Phase C 2026-05-28.';

create index if not exists momo_links_tracking_idx      on public.momo_tracking_links (momo_tracking_no);
create index if not exists momo_links_container_ref_idx on public.momo_tracking_links (momo_container_ref);
create index if not exists momo_links_real_idx          on public.momo_tracking_links (real_container_no);
create index if not exists momo_links_sack_idx          on public.momo_tracking_links (sack_no);
create index if not exists momo_links_cg_idx            on public.momo_tracking_links (cg_no);
create index if not exists momo_links_endpoint_idx      on public.momo_tracking_links (source_endpoint);

alter table public.momo_tracking_links enable row level security;


-- ── 2. momo_tracking_status_snapshots ─────────────────────────
-- Derived current status per tracking, computed from priority rules:
--   priority 5: delivery        (highest — final)
--   priority 4: arrival         (Thailand warehouse)
--   priority 3: container_closed (departed CN)
--   priority 2: import_track
--   priority 1: sack_info       (lowest)
--
-- Stored as a materialized snapshot so customer/admin pages don't
-- recompute on every load. Recalculated by sync route + backfill.
--
-- One row per tracking — sync upserts in place.

create table if not exists public.momo_tracking_status_snapshots (
  id                       uuid primary key default gen_random_uuid(),
  momo_tracking_no         text not null unique,
  current_phase            text,             -- 'ORIGIN' | 'TRANSIT' | 'DESTINATION' | 'UNKNOWN'
  current_status_code      text,             -- e.g. 'DEPARTED_FROM_CN_WAREHOUSE'
  current_status_label     text,             -- Thai label
  source_endpoint          text,             -- which endpoint produced this
  source_record_id         uuid,             -- which row in source table
  source_priority          integer,          -- 1..5
  momo_container_ref       text,
  container_batch_no       text,
  real_container_no        text,
  sack_no                  text,
  ship_by                  text,
  weight_kg                numeric,
  cbm                      numeric,
  estimate_date            date,
  last_event_at            timestamptz,      -- timestamp from the driving signal
  mapping_notes            text,             -- human-readable derivation reason
  raw_sources              jsonb,            -- { importTrackId, containerClosedId, sackTrackId, ... }
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.momo_tracking_status_snapshots is
  'Derived current status per tracking. Recomputed by sync route + backfill from all source endpoints. Phase C 2026-05-28.';

create index if not exists momo_snap_phase_idx       on public.momo_tracking_status_snapshots (current_phase);
create index if not exists momo_snap_status_idx      on public.momo_tracking_status_snapshots (current_status_code);
create index if not exists momo_snap_source_idx      on public.momo_tracking_status_snapshots (source_endpoint);
create index if not exists momo_snap_ref_idx         on public.momo_tracking_status_snapshots (momo_container_ref);
create index if not exists momo_snap_real_idx        on public.momo_tracking_status_snapshots (real_container_no);
create index if not exists momo_snap_sack_idx        on public.momo_tracking_status_snapshots (sack_no);
create index if not exists momo_snap_last_event_idx  on public.momo_tracking_status_snapshots (last_event_at desc);

alter table public.momo_tracking_status_snapshots enable row level security;


-- ── 3. momo_tracking_status_history ───────────────────────────
-- Append-only audit. Insert one row each time a tracking's snapshot
-- changes phase/code/source. NEVER UPDATE existing rows. The pair
-- (tracking, changed_at) is the natural key.

create table if not exists public.momo_tracking_status_history (
  id                   uuid primary key default gen_random_uuid(),
  momo_tracking_no     text not null,
  old_phase            text,
  new_phase            text,
  old_status_code      text,
  new_status_code      text,
  old_status_label     text,
  new_status_label     text,
  source_endpoint      text,
  source_record_id     uuid,
  matched_by           text,
  raw_snapshot         jsonb,                  -- the full new snapshot at change time
  changed_at           timestamptz not null default now(),
  sync_run_id          uuid
);

comment on table public.momo_tracking_status_history is
  'Append-only audit of momo_tracking_status_snapshots transitions. INSERT ONLY — never UPDATE. Phase C 2026-05-28.';

create index if not exists momo_history_tracking_idx    on public.momo_tracking_status_history (momo_tracking_no);
create index if not exists momo_history_changed_idx     on public.momo_tracking_status_history (changed_at desc);
create index if not exists momo_history_new_phase_idx   on public.momo_tracking_status_history (new_phase);
create index if not exists momo_history_new_status_idx  on public.momo_tracking_status_history (new_status_code);
create index if not exists momo_history_sync_run_idx    on public.momo_tracking_status_history (sync_run_id);

alter table public.momo_tracking_status_history enable row level security;


-- ════════════════════════════════════════════════════════════
-- Verification queries:
--
--   -- Test case from brief — tracking 1779529270 should resolve to TRANSIT:
--   SELECT current_phase, current_status_code, current_status_label,
--          source_endpoint, real_container_no, estimate_date, last_event_at
--   FROM momo_tracking_status_snapshots
--   WHERE momo_tracking_no = '1779529270';
--   -- Expect:
--   --   current_phase = 'TRANSIT'
--   --   current_status_code = 'DEPARTED_FROM_CN_WAREHOUSE'
--   --   source_endpoint = 'container_closed'
--   --   real_container_no = 'JXLU6157980'
--   --   estimate_date = '2026-06-10'
--
--   -- All edges for that tracking:
--   SELECT source_endpoint, source_table, matched_by
--   FROM momo_tracking_links
--   WHERE momo_tracking_no = '1779529270';
--   -- Expect at least 2 rows:
--   --   import_track     | momo_import_tracks            | import_track.tracking
--   --   container_closed | momo_container_closed_tracks  | container_closed.track_details.reTrack
--
--   -- History trail:
--   SELECT old_status_code, new_status_code, changed_at
--   FROM momo_tracking_status_history
--   WHERE momo_tracking_no = '1779529270'
--   ORDER BY changed_at;
-- ════════════════════════════════════════════════════════════
