-- ════════════════════════════════════════════════════════════
-- 0120 · Raw event audit log + detail-explosion tables (Phase B)
-- ════════════════════════════════════════════════════════════
-- Brief 2026-05-28 (ปอน) "Momo Data Foundation" Phase B — add 4 new
-- tables for raw audit + nested object/array explosion. Together with
-- 0119, these complete the "data foundation" — every nested MOMO field
-- is queryable without resorting to raw->>'...' jsonb casts.
--
-- Tables added (4):
--   momo_raw_events                  ← per-item raw audit log (insert-only)
--   momo_import_track_status_dates   ← explode import_track.raw.status_date
--   momo_container_details           ← explode container_closed.raw.container_details
--   momo_sack_tracks                 ← explode sack_info.raw.tracks[]
--
-- Why a separate momo_raw_events log (vs the raw column on each main table):
--   - Main tables hold the LATEST state per unique key (upsert).
--   - momo_raw_events holds EVERY item received (insert-only),
--     including items that failed to map. Audit + debug + replay.
--   - When mapping logic evolves, we can re-process raw_events to
--     update the main tables without re-fetching MOMO.
--
-- ⚠️ ISOLATION (same rules as 0116/0117/0118/0119):
--   ✅ Touch ONLY momo_* tables
--   ❌ Do NOT touch legacy cargo_* / tb_*
--   ❌ Do NOT rename / drop / change meaning of existing columns
--
-- Idempotent — CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- ════════════════════════════════════════════════════════════


-- ── 1. momo_raw_events ────────────────────────────────────────
-- Universal audit log: one row per MOMO item received, regardless of
-- whether downstream mapping/upsert succeeded. Useful for replaying
-- past responses + debug "why did this tracking get this status?".
--
-- source_endpoint values:
--   'import_track'     → /api/func/get/import/track/{date-range}
--   'container_closed' → /api/func/get/container/closed/{date-range}
--   'sack_info'        → /api/sack/get/info/{sackNo}
--   (future endpoints can use their own keys)

create table if not exists public.momo_raw_events (
  id                   uuid primary key default gen_random_uuid(),
  source_endpoint      text not null,                  -- see comment above
  source_url           text,                           -- full URL (no token!)
  source_method        text default 'GET',
  source_date_range    text,                           -- e.g. "2026-05-27+2026-05-27"
  momo_id              text,                           -- raw._id (Mongo ObjectId)
  -- Denormalized fast-lookup keys (extracted on insert from raw):
  momo_tracking_no     text,
  momo_container_ref   text,
  sack_no              text,
  cg_no                text,
  -- The full raw item + a hash for dedup:
  raw                  jsonb not null,
  raw_hash             text,                           -- sha256(raw) hex
  received_at          timestamptz,                    -- parsed raw.updated_date
  sync_run_id          uuid,                           -- links to a sync invocation
  created_at           timestamptz not null default now()
);

comment on table public.momo_raw_events is
  'Universal per-item audit log for every MOMO API response. Insert-only. Lets us replay history when mapping logic changes. Admin-only via service_role. Phase B 2026-05-28.';
comment on column public.momo_raw_events.source_endpoint is
  'Which MOMO endpoint this row came from: ''import_track'' | ''container_closed'' | ''sack_info'' | future';
comment on column public.momo_raw_events.raw_hash is
  'sha256(JSON.stringify(raw)) hex — for cheap dedup checks across re-syncs.';

create index if not exists momo_raw_events_endpoint_idx        on public.momo_raw_events (source_endpoint);
create index if not exists momo_raw_events_tracking_idx        on public.momo_raw_events (momo_tracking_no);
create index if not exists momo_raw_events_container_ref_idx   on public.momo_raw_events (momo_container_ref);
create index if not exists momo_raw_events_sack_idx            on public.momo_raw_events (sack_no);
create index if not exists momo_raw_events_received_idx        on public.momo_raw_events (received_at desc);
create index if not exists momo_raw_events_created_idx         on public.momo_raw_events (created_at desc);
create index if not exists momo_raw_events_sync_run_idx        on public.momo_raw_events (sync_run_id);
create index if not exists momo_raw_events_momo_id_idx         on public.momo_raw_events (momo_id);

alter table public.momo_raw_events enable row level security;


-- ── 2. momo_import_track_status_dates ─────────────────────────
-- Explode raw.status_date object:
--   {
--     waiting:        "2026-05-22 17:42:53",
--     kodang:         "2026-05-22 17:42:53",
--     mergebox:       "2026-05-23 10:06:47",
--     wooden_create:  "",
--     prepare_export: "2026-05-23 17:28:53",
--     exported:       ""
--   }
-- → 6 rows per import_track (one per phase key, value may be NULL for "")
--
-- This lets us answer "when did tracking X reach phase Y?" without
-- jsonb extraction. Empty string ("" = "not yet") → status_at NULL,
-- but status_value_raw preserves the original value for audit.

create table if not exists public.momo_import_track_status_dates (
  id                  uuid primary key default gen_random_uuid(),
  import_track_id     uuid not null
    references public.momo_import_tracks(id)
    on delete cascade,
  momo_tracking_no    text not null,           -- denormalized for fast filter
  status_key          text not null,           -- 'waiting' | 'kodang' | 'mergebox' | 'wooden_create' | 'prepare_export' | 'exported'
  status_value_raw    text,                    -- "2026-05-22 17:42:53" or "" (empty preserved)
  status_at           timestamptz,             -- parsed or NULL (empty string)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- One key per tracking per import_track row
  constraint momo_import_track_status_dates_unique
    unique (import_track_id, status_key)
);

comment on table public.momo_import_track_status_dates is
  'One row per (import_track, status phase). status_at NULL means "phase not reached yet". Admin-only via service_role. Phase B 2026-05-28.';

create index if not exists momo_its_tracking_idx       on public.momo_import_track_status_dates (momo_tracking_no);
create index if not exists momo_its_key_idx            on public.momo_import_track_status_dates (status_key);
create index if not exists momo_its_at_idx             on public.momo_import_track_status_dates (status_at desc);
create index if not exists momo_its_parent_idx         on public.momo_import_track_status_dates (import_track_id);

alter table public.momo_import_track_status_dates enable row level security;


-- ── 3. momo_container_details ─────────────────────────────────
-- Explode raw.container_details object (ETD/ETA/vessel/BL).
-- One row per container_closed. Stored as typed columns for fast filter
-- + the raw_container_details jsonb preserved for any field we missed.

create table if not exists public.momo_container_details (
  id                        uuid primary key default gen_random_uuid(),
  container_closed_id       uuid not null
    references public.momo_container_closed(id)
    on delete cascade,
  -- Denormalized parent refs:
  momo_container_ref        text,
  container_batch_no        text,
  real_container_no         text,
  -- Typed columns from container_details object:
  bl_no                     text,
  vessel_no                 text,
  estimate_date             date,         -- raw.container_details.ESTIMATE_DATE ("2026-06-10")
  etd_cn_kodang             timestamptz,  -- raw.container_details.ETD_CN_KODANG
  eta_th_kodang             timestamptz,  -- raw.container_details.ETA_TH_KODANG
  etd_immigration           timestamptz,  -- raw.container_details.ETD_IMMIGRATION
  eta_immigration           timestamptz,  -- raw.container_details.ETA_IMMIGRATION
  transshipment             text,         -- often a port code string
  raw_container_details     jsonb,        -- the full container_details object for audit
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  -- One details row per container — re-sync upserts in place.
  constraint momo_container_details_unique
    unique (container_closed_id)
);

comment on table public.momo_container_details is
  'One row per container_closed exploding the container_details object (BL/vessel/ETD/ETA/etc.). Phase B 2026-05-28.';

create index if not exists momo_cd_ref_idx        on public.momo_container_details (momo_container_ref);
create index if not exists momo_cd_batch_idx      on public.momo_container_details (container_batch_no);
create index if not exists momo_cd_real_idx       on public.momo_container_details (real_container_no);
create index if not exists momo_cd_etd_cn_idx     on public.momo_container_details (etd_cn_kodang desc);
create index if not exists momo_cd_eta_th_idx     on public.momo_container_details (eta_th_kodang desc);
create index if not exists momo_cd_estimate_idx   on public.momo_container_details (estimate_date desc);

alter table public.momo_container_details enable row level security;


-- ── 4. momo_sack_tracks ───────────────────────────────────────
-- Explode raw.tracks[] from sack_info responses. Sack endpoint returns
-- tracks as an array of TRACKING STRINGS (not objects in the current
-- shape — but we still create per-tracking rows for the JOIN bridge).
-- If MOMO later upgrades the shape to objects, the extra weight/cbm
-- columns are ready.

create table if not exists public.momo_sack_tracks (
  id                  uuid primary key default gen_random_uuid(),
  sack_info_id        uuid not null
    references public.momo_sack_infos(id)
    on delete cascade,
  sack_no             text not null,
  momo_tracking_no    text not null,
  -- Optional weight/dim fields — populated when MOMO returns object items.
  weight_kg           numeric,
  cbm                 numeric,
  width               numeric,
  length              numeric,
  height              numeric,
  quantity            integer,
  raw                 jsonb,                 -- the array element (string or object)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- One tracking per sack — re-sync upserts in place.
  constraint momo_sack_tracks_unique
    unique (sack_info_id, momo_tracking_no)
);

comment on table public.momo_sack_tracks is
  'One row per tracking inside a sack (from sack_info.raw.tracks[]). JOIN bridge: tracking ↔ sack ↔ container. Phase B 2026-05-28.';

create index if not exists momo_st_tracking_idx  on public.momo_sack_tracks (momo_tracking_no);
create index if not exists momo_st_sack_idx      on public.momo_sack_tracks (sack_no);
create index if not exists momo_st_parent_idx    on public.momo_sack_tracks (sack_info_id);

alter table public.momo_sack_tracks enable row level security;


-- ════════════════════════════════════════════════════════════
-- Verification queries (run after apply + after backfill):
--
--   -- All 4 new tables present:
--   \d momo_raw_events
--   \d momo_import_track_status_dates
--   \d momo_container_details
--   \d momo_sack_tracks
--
--   -- Status-date history for tracking 9822290862949:
--   SELECT status_key, status_value_raw, status_at
--   FROM momo_import_track_status_dates
--   WHERE momo_tracking_no = '9822290862949'
--   ORDER BY status_at NULLS LAST;
--
--   -- Container details for the bug-case container:
--   SELECT real_container_no, bl_no, vessel_no, estimate_date,
--          etd_cn_kodang, eta_th_kodang
--   FROM momo_container_details
--   WHERE real_container_no = 'JXLU6157980';
--
--   -- Raw event audit count by endpoint:
--   SELECT source_endpoint, count(*) FROM momo_raw_events
--   GROUP BY source_endpoint;
--
-- Confirm legacy untouched:
--   SELECT count(*) FROM cargo_containers; -- unchanged
--   SELECT count(*) FROM tb_forwarder;     -- unchanged
-- ════════════════════════════════════════════════════════════
