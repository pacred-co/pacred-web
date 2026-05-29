-- ════════════════════════════════════════════════════════════
-- 0118 · Promote raw subset → typed columns on momo_* tables
-- ════════════════════════════════════════════════════════════
-- Brief 2026-05-28 (ปอน): "อยากเก็บข้อมูล raw ด้วย จะได้รู้ว่าอันนี้
-- ของใคร รหัสต้องไปที่ไหน" — raw object stays verbatim, but we ALSO
-- promote the most-queried fields to typed columns so admins can
-- filter/join/dashboard without `raw->>'...'` casts.
--
-- After 0118 you can run:
--   SELECT momo_tracking_no, momo_user_code, momo_user_group, momo_cg_no
--   FROM momo_import_tracks WHERE momo_user_code = '032';
-- instead of:
--   SELECT momo_tracking_no, raw->>'user_code', raw->>'user_group'
--   FROM momo_import_tracks WHERE raw->>'user_code' = '032';
--
-- Columns added:
--   momo_import_tracks     +7 (user_code, user_group, cg_no, ship_by,
--                              weight_kg, cbm, quantity)
--   momo_container_closed  +4 (ship_by, total_kg, total_cbm, total_parcel)
--   momo_sack_infos        +4 (ship_by, weight_kg, cbm, total_parcel)
--
-- The `raw jsonb` column on each table stays untouched — it remains
-- the source of truth; these columns are mirrors for index/query.
--
-- ⚠️ ISOLATION (per brief — same rules as 0116/0117):
--   ✅ Touch ONLY the 3 momo_* payload tables (not momo_sync_logs)
--   ❌ Do NOT touch legacy cargo_* / tb_*
--   ❌ Do NOT modify enum / trigger / function / RLS of legacy
--
-- Idempotent — safe to re-run (ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════

-- ── 1. momo_import_tracks (+7 columns) ────────────────────────
alter table public.momo_import_tracks
  add column if not exists momo_user_code  text,
  add column if not exists momo_user_group text,
  add column if not exists momo_cg_no      text,
  add column if not exists ship_by         text,
  add column if not exists weight_kg       numeric,
  add column if not exists cbm             numeric,
  add column if not exists quantity        integer;

comment on column public.momo_import_tracks.momo_user_code is
  'MOMO customer code (e.g. "032"). Pair with momo_user_group to form member_code (e.g. "PR032"). Mirrored from raw->>''user_code''.';
comment on column public.momo_import_tracks.momo_user_group is
  'MOMO user group prefix (e.g. "PR"). Mirrored from raw->>''user_group''.';
comment on column public.momo_import_tracks.momo_cg_no is
  'MOMO cargo group id (e.g. "CG79442972576"). Mirrored from raw->>''CG_NO''.';
comment on column public.momo_import_tracks.ship_by is
  '"car" | "ship" | "air". Mirrored from raw->>''ship_by''.';
comment on column public.momo_import_tracks.weight_kg is
  'Per-tracking weight in kg. Mirrored from raw->>''kg''.';
comment on column public.momo_import_tracks.cbm is
  'Per-tracking volume in CBM. Mirrored from raw->>''cbm''.';
comment on column public.momo_import_tracks.quantity is
  'Per-tracking parcel count. Mirrored from raw->>''quantity''.';

create index if not exists momo_import_tracks_user_code_idx
  on public.momo_import_tracks (momo_user_code);
create index if not exists momo_import_tracks_user_group_idx
  on public.momo_import_tracks (momo_user_group);
create index if not exists momo_import_tracks_cg_no_idx
  on public.momo_import_tracks (momo_cg_no);
create index if not exists momo_import_tracks_ship_by_idx
  on public.momo_import_tracks (ship_by);


-- ── 2. momo_container_closed (+4 columns) ─────────────────────
alter table public.momo_container_closed
  add column if not exists ship_by      text,
  add column if not exists total_kg     numeric,
  add column if not exists total_cbm    numeric,
  add column if not exists total_parcel integer;

comment on column public.momo_container_closed.ship_by is
  '"car" | "ship" | "air". Mirrored from raw->>''ship_by''.';
comment on column public.momo_container_closed.total_kg is
  'Container total weight in kg. Mirrored from raw->>''total_kg''.';
comment on column public.momo_container_closed.total_cbm is
  'Container total volume in CBM. Mirrored from raw->>''total_cbm''.';
comment on column public.momo_container_closed.total_parcel is
  'Container total parcel count. Mirrored from raw->>''total_parcel''.';

create index if not exists momo_container_closed_ship_by_idx
  on public.momo_container_closed (ship_by);


-- ── 3. momo_sack_infos (+4 columns) ───────────────────────────
alter table public.momo_sack_infos
  add column if not exists ship_by      text,
  add column if not exists weight_kg    numeric,
  add column if not exists cbm          numeric,
  add column if not exists total_parcel integer;

comment on column public.momo_sack_infos.ship_by is
  '"car" | "ship" | "air". Mirrored from raw->>''ship_by''.';
comment on column public.momo_sack_infos.weight_kg is
  'Sack weight in kg. Mirrored from raw->>''weight''.';
comment on column public.momo_sack_infos.cbm is
  'Sack volume in CBM. Mirrored from raw->>''cbm''.';
comment on column public.momo_sack_infos.total_parcel is
  'Sack total parcel count. Mirrored from raw->>''total_parcel''.';

create index if not exists momo_sack_infos_ship_by_idx
  on public.momo_sack_infos (ship_by);


-- ════════════════════════════════════════════════════════════
-- Verification queries (run after apply):
--   \d momo_import_tracks    -- should show 7 new cols
--   \d momo_container_closed -- should show 4 new cols
--   \d momo_sack_infos       -- should show 4 new cols
--
-- After next Sync click (mapper update needed — same commit):
--   SELECT momo_tracking_no, momo_user_code, momo_user_group,
--          momo_cg_no, ship_by, weight_kg, cbm, quantity
--   FROM momo_import_tracks LIMIT 5;
--   -- All new cols should populate (not NULL) for rows that had
--   -- the corresponding raw->>'...' value.
--
-- Confirm legacy untouched:
--   SELECT count(*) FROM cargo_containers;  -- unchanged
--   SELECT count(*) FROM tb_forwarder;      -- unchanged
-- ════════════════════════════════════════════════════════════
