-- ════════════════════════════════════════════════════════════
-- 0122 · Per-item sync audit + link to sync_logs (Phase D)
-- ════════════════════════════════════════════════════════════
-- Brief 2026-05-28 (ปอน) "Momo Data Foundation" Phase D — extend the
-- audit layer so we can see, for any sync invocation, EXACTLY which
-- items were touched + which succeeded vs failed.
--
-- Changes:
--   1. ALTER momo_sync_logs ADD COLUMN sync_run_id uuid
--      Links a sync_logs row to its detailed items + to raw_events
--      from the same run.
--   2. CREATE TABLE momo_sync_run_items
--      Per-item audit: one row per upsert / insert / recompute that
--      happened inside a sync run. Lets us see "this sync touched 42
--      items, 40 succeeded, 2 failed because of X".
--
-- The existing momo_sync_logs table stays — coexist pattern. New code
-- uses momo_sync_logs as the run-level header + momo_sync_run_items
-- as the line items. Old code that only reads sync_logs continues to
-- work unchanged.
--
-- ⚠️ ISOLATION (same rules as 0116-0121):
--   ✅ Touch ONLY momo_* tables
--   ❌ Do NOT touch legacy cargo_* / tb_*
--   ❌ Do NOT rename / drop / change meaning of existing columns
--
-- Idempotent — ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS.
-- ════════════════════════════════════════════════════════════


-- ── 1. ALTER momo_sync_logs ADD sync_run_id ───────────────────
alter table public.momo_sync_logs
  add column if not exists sync_run_id uuid;

comment on column public.momo_sync_logs.sync_run_id is
  'UUID grouping all rows that belong to one sync invocation. Same value is on momo_raw_events.sync_run_id and momo_sync_run_items.sync_run_id from the same run. Nullable — pre-0122 rows have NULL.';

create index if not exists momo_sync_logs_run_id_idx
  on public.momo_sync_logs (sync_run_id);


-- ── 2. momo_sync_run_items ────────────────────────────────────
-- Per-item audit. One row per atomic action inside a sync run.
-- "action" describes what happened to this item:
--   'upsert_import_track' | 'upsert_container_closed' | 'upsert_sack_info'
--   'explode_container_closed_tracks' | 'explode_sack_tracks'
--   'upsert_link' | 'refresh_snapshot' | 'append_history'
--   'insert_raw_event'
-- Success/error give us per-item debug — much finer-grained than the
-- single errors[] in momo_sync_logs.

create table if not exists public.momo_sync_run_items (
  id                  uuid primary key default gen_random_uuid(),
  sync_run_id         uuid not null,
  source_endpoint     text,                 -- 'import_track' | 'container_closed' | 'sack_info' | 'backfill' | etc.
  source_record_id    uuid,                 -- id of the affected row (if known)
  momo_tracking_no    text,
  momo_container_ref  text,
  sack_no             text,
  action              text not null,
  success             boolean not null,
  error_message       text,
  raw                 jsonb,                -- optional context dump
  created_at          timestamptz not null default now()
);

comment on table public.momo_sync_run_items is
  'Per-item audit inside a sync run. Links to momo_sync_logs via sync_run_id. INSERT-only. Phase D 2026-05-28.';

create index if not exists momo_sri_run_idx        on public.momo_sync_run_items (sync_run_id);
create index if not exists momo_sri_endpoint_idx   on public.momo_sync_run_items (source_endpoint);
create index if not exists momo_sri_tracking_idx   on public.momo_sync_run_items (momo_tracking_no);
create index if not exists momo_sri_action_idx     on public.momo_sync_run_items (action);
create index if not exists momo_sri_success_idx    on public.momo_sync_run_items (success);
create index if not exists momo_sri_created_idx    on public.momo_sync_run_items (created_at desc);

alter table public.momo_sync_run_items enable row level security;


-- ════════════════════════════════════════════════════════════
-- Verification queries:
--
--   -- Pivot from a sync_logs row to all items in that run:
--   SELECT l.created_at, l.status,
--          (SELECT count(*) FROM momo_sync_run_items i
--           WHERE i.sync_run_id = l.sync_run_id) AS item_count,
--          (SELECT count(*) FROM momo_raw_events r
--           WHERE r.sync_run_id = l.sync_run_id) AS raw_event_count
--   FROM momo_sync_logs l
--   WHERE l.sync_run_id IS NOT NULL
--   ORDER BY l.created_at DESC
--   LIMIT 10;
--
--   -- Show failures from the latest run:
--   SELECT action, momo_tracking_no, error_message
--   FROM momo_sync_run_items
--   WHERE sync_run_id = (
--     SELECT sync_run_id FROM momo_sync_logs
--     WHERE sync_run_id IS NOT NULL
--     ORDER BY created_at DESC LIMIT 1
--   )
--   AND success = false;
-- ════════════════════════════════════════════════════════════
