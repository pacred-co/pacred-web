-- ════════════════════════════════════════════════════════════
-- 0142 · container_cost_sheet_cache + container_cost_sheet_state
--        LANE A — แสง's "ปรับต้นทุนตู้ใหม่" Google Sheet snapshot
-- ════════════════════════════════════════════════════════════
-- A Vercel cron (`/api/cron/sync-container-cost-sheet`, every ~20 min)
-- pulls แสง's cost sheet
--   (`13ufkMUoYGnz9sm4gQXiaFp9G6Lx1mRR9to0rqEVK0FA` tab `main`)
-- and snapshots one row PER (container × tracking) into
-- `container_cost_sheet_cache` so the worklist
-- (`/admin/forwarders/container-cost-check`) + the per-parcel diff
-- (`/admin/report-cnt/{cnt}?action=cost-update`) read FAST and stay
-- fresh, instead of doing a live Sheets fetch on every page load.
--
-- The on-demand pages can STILL live-read the sheet (the cache is a
-- speed/freshness layer, never the only source). Faithful to legacy
-- `check-sang-cost.php` + `report-cnt.php?action=cost-update` which
-- read `main!A2:P`.
--
-- Sheet → cache mapping (legacy column indices, see
-- `lib/integrations/google-sheets/container-cost-sheet-adapter.ts`):
--   col 0  (A) container string  → cabinet_number (after cutCon())
--   col 1  (B) tracking+userid   → tracking_chn   (after parse)
--   col 3  (D) userid            → user_id
--   col 5  (F) amount            → summed → amount
--   col 6  (G) weight            → summed → weight
--   col 10 (K) volume (CBM)      → summed → volume
--   col 11 (L) product letter    → product_type (1/2/3/4/5)
--   col 12 (M) other             → summed → price_other
--   col 14 (O) cost              → summed → cost_total_price (the cost!)
--   col 15 (P) checked flag      → cabinet checked=1 (state table)
--
-- ISOLATION RULES:
--   ✅ NEW tables only. NO ALTER/DROP/RENAME of any existing table.
--   ✅ service_role-only access (cron + admin Server Actions).
--   ✅ RLS = deny all (no anon / no authenticated direct read).
--
-- Idempotent (safe to re-run): create … if not exists.
-- ════════════════════════════════════════════════════════════

-- ── 1. container_cost_sheet_state — singleton (id = 1) ─────────
create table if not exists public.container_cost_sheet_state (
  id            integer primary key check (id = 1),
  last_synced_at timestamptz,
  last_run_at   timestamptz,
  sheet_id      text,
  row_count     integer not null default 0,
  cabinet_count integer not null default 0,
  last_error    text
);

comment on table public.container_cost_sheet_state is
  'Singleton (id=1) status for แสง''s container-cost-sheet sync cron. Created 2026-06-05 (LANE A).';

insert into public.container_cost_sheet_state (id, last_synced_at, last_run_at, last_error)
values (1, null, null, null)
on conflict (id) do nothing;

alter table public.container_cost_sheet_state enable row level security;

drop policy if exists container_cost_sheet_state_deny_all on public.container_cost_sheet_state;
create policy container_cost_sheet_state_deny_all
  on public.container_cost_sheet_state
  as restrictive
  for all
  to public
  using (false)
  with check (false);

grant select, insert, update, delete on public.container_cost_sheet_state to service_role;
revoke all on public.container_cost_sheet_state from anon;
revoke all on public.container_cost_sheet_state from authenticated;

-- ── 2. container_cost_sheet_cache — per (cabinet × tracking) snapshot ──
-- The cron TRUNCATEs + re-inserts the whole sheet each run inside one
-- transaction (the sheet is small — a few thousand rows), so the cache
-- is always a clean mirror of the sheet's current state. A UNIQUE on
-- (cabinet_number, tracking_chn) lets a future incremental-upsert
-- variant swap in without a schema change.
create table if not exists public.container_cost_sheet_cache (
  id               bigserial primary key,
  cabinet_number   text not null,
  tracking_chn     text not null,
  user_id          text,
  amount           numeric(14,2) not null default 0,
  weight           numeric(14,3) not null default 0,
  volume           numeric(14,5) not null default 0,
  price_other      numeric(14,2) not null default 0,
  cost_total_price numeric(14,2) not null default 0,
  product_type     text,
  checked          boolean not null default false,
  synced_at        timestamptz not null default now(),
  constraint container_cost_sheet_cache_uq unique (cabinet_number, tracking_chn)
);

comment on table public.container_cost_sheet_cache is
  'Snapshot of แสง''s container-cost Google Sheet, one row per (cabinet × tracking). Refreshed by /api/cron/sync-container-cost-sheet. Speed/freshness layer — never the only source. Created 2026-06-05 (LANE A).';

create index if not exists container_cost_sheet_cache_cabinet_idx
  on public.container_cost_sheet_cache (cabinet_number);

create index if not exists container_cost_sheet_cache_tracking_idx
  on public.container_cost_sheet_cache (tracking_chn);

alter table public.container_cost_sheet_cache enable row level security;

drop policy if exists container_cost_sheet_cache_deny_all on public.container_cost_sheet_cache;
create policy container_cost_sheet_cache_deny_all
  on public.container_cost_sheet_cache
  as restrictive
  for all
  to public
  using (false)
  with check (false);

grant select, insert, update, delete, truncate on public.container_cost_sheet_cache to service_role;
revoke all on public.container_cost_sheet_cache from anon;
revoke all on public.container_cost_sheet_cache from authenticated;
