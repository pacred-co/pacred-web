-- ════════════════════════════════════════════════════════════
-- 0240 · momo_box_detail — per-box (per-split-parcel) dimensions from MOMO Live
-- ════════════════════════════════════════════════════════════
-- Owner/ภูม 2026-07-02 (verified on prod screenshots):
--   A cargo tracking can be SPLIT by MOMO into N boxes with DIFFERENT sizes —
--   e.g. tracking 1782103385 = 6 boxes: 204×61×80 / 204×61×80 / 194×125×166 /
--   190×115×110 / 190×78×73 / 75×90×40 (MOMO's web shows them as "-1/6 … -6/6").
--   tb_forwarder holds ONE row per BASE tracking (the whole-tracking AGGREGATE),
--   so a multi-box tracking's ก×ย×ส can't be represented there — the per-box dims
--   are dropped (propagate-live-data.ts fills dims ONLY for a single-box tracking).
--
--   This table STORES the per-box breakdown MOMO's Live scrape already carries
--   (lib/integrations/momo-web/client.ts vendor_tracks[]) so:
--     - /admin/report-cnt "แยกตามขนาด" can group by the box's ACTUAL size, and
--     - /admin/forwarders/[fNo] can SHOW each box's real ก×ย×ส for a multi-box
--       tracking (instead of one blank dims input).
--
-- 💰 MONEY-SAFETY — this is a DISPLAY/DETAIL store ONLY:
--   - The price uses tb_forwarder.fvolume (คิวรวม, the aggregate). This table is
--     NEVER read by any pricing/billing/cost path — it only feeds two admin
--     DISPLAY surfaces. It does NOT change the aggregate that feeds the SELL price.
--   - It does NOT touch tb_forwarder (no ALTER / no new column on the money table).
--
-- WHY A DEDICATED TABLE (not a jsonb column on tb_forwarder):
--   1. tb_forwarder is the billing spine — adding a jsonb blob there risks the
--      money table + is un-queryable per box. Keeping it out = money-safe.
--   2. This is a 1→N explosion (base tracking → N boxes), which the codebase
--      already models with dedicated isolated momo_* tables
--      (momo_import_track_status_dates / momo_container_details / momo_sack_tracks
--      in 0120). A per-box table matches that established convention exactly.
--   3. Both consumers query by base tracking OR by container — indexable here.
--
-- ISOLATION (same rules as the momo_* tables · 0116/0120):
--   ✅ NEW table only · NO FK to legacy tb_* / cargo_* (mirrors momo_* isolation)
--   ✅ RLS = service_role only (admin client) — anon/authenticated reject
--   ❌ Do NOT ALTER / DROP / RENAME any existing table
--
-- Written by: lib/integrations/momo-web/propagate-live-data.ts (the Live data-fill,
-- best-effort — a per-box upsert failure never blocks the money-fill / status pass).
-- Idempotent — CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- ════════════════════════════════════════════════════════════

create table if not exists public.momo_box_detail (
  id                 uuid primary key default gen_random_uuid(),
  -- The BASE tracking (MOMO "-i/n" suffix stripped) — the JOIN key both consumers
  -- use (tb_forwarder holds ONE row per base tracking).
  base_tracking      text not null,
  -- The exact split tracking as MOMO returns it ("1782103385-3" or "…-3/6"); the
  -- per-box identity. UNIQUE with base so re-sync upserts the same box in place.
  box_tracking       text not null,
  -- The customer code (cn_usercode · PR) this box belongs to — for the report grouping.
  member_code        text,
  -- The cabinet (เลขตู้ · tb_forwarder.fcabinetnumber equivalent = container_name)
  -- so report-cnt can fetch a whole container's per-box detail in one query.
  container_name     text,
  -- The physical container code + MOMO routing batch (audit / display).
  container_code     text,
  container_no       text,
  -- The per-box DIMENSIONS (cm) — the whole point of this table.
  width              numeric,       -- ก
  length             numeric,       -- ย
  height             numeric,       -- ส
  -- Per-PIECE weight/volume as MOMO's scrape reports them, + the pieces count.
  -- (The TOTAL = per-piece × quantity; kept per-piece here to mirror the scrape,
  -- the report can derive the total. NEVER fed to pricing.)
  weight_kg          numeric,       -- per-piece kg
  cbm                numeric,       -- per-piece คิว
  quantity           integer,       -- จำนวนชิ้น (pieces in this box)
  status_id          integer,
  status_text        text,
  last_synced_at     timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- One row per (base tracking, box tracking) — re-sync upserts in place.
  constraint momo_box_detail_unique unique (base_tracking, box_tracking)
);

alter table public.momo_box_detail enable row level security;

comment on table public.momo_box_detail is
  'Per-box (per-split-parcel) dimensions from the MOMO Live scrape. ONE row per split box of a base tracking (MOMO "-i/n"). DISPLAY/DETAIL ONLY — feeds /admin/report-cnt แยกตามขนาด + the /admin/forwarders per-box view. NEVER read by pricing/billing (the price uses tb_forwarder.fvolume aggregate). Admin-only via service_role. NO FK to legacy. Created 2026-07-02 (ภูม · per-box dims).';
comment on column public.momo_box_detail.base_tracking is
  'MOMO base tracking (the "-i/n" split-suffix stripped) — the JOIN key to tb_forwarder (one row per base tracking).';
comment on column public.momo_box_detail.box_tracking is
  'The exact split tracking as MOMO returns it ("…-3" or "…-3/6") — the per-box identity.';
comment on column public.momo_box_detail.width  is 'Per-box width ก (cm) from MOMO Live vendor_tracks[].width.';
comment on column public.momo_box_detail.length is 'Per-box length ย (cm) from MOMO Live vendor_tracks[].length.';
comment on column public.momo_box_detail.height is 'Per-box height ส (cm) from MOMO Live vendor_tracks[].height.';
comment on column public.momo_box_detail.weight_kg is 'PER-PIECE weight (kg) — the TOTAL is × quantity. Reference/display only, never pricing.';
comment on column public.momo_box_detail.cbm is 'PER-PIECE volume (คิว) — the TOTAL is × quantity. Reference/display only, never pricing.';

create index if not exists momo_box_detail_base_idx      on public.momo_box_detail (base_tracking);
create index if not exists momo_box_detail_container_idx  on public.momo_box_detail (container_name);
create index if not exists momo_box_detail_member_idx     on public.momo_box_detail (member_code);
create index if not exists momo_box_detail_synced_idx     on public.momo_box_detail (last_synced_at desc);

-- ════════════════════════════════════════════════════════════
-- Verification (run after apply + after one MOMO Live sync):
--   SELECT count(*) FROM momo_box_detail;                         -- 0 before first sync
--   -- The 6 boxes of the bug-case tracking:
--   SELECT box_tracking, width, length, height, quantity
--   FROM momo_box_detail WHERE base_tracking = '1782103385'
--   ORDER BY box_tracking;
--   -- A whole container's per-box detail:
--   SELECT base_tracking, count(*) AS boxes
--   FROM momo_box_detail WHERE container_name = 'GZE260701-1'
--   GROUP BY base_tracking;
-- Confirm legacy untouched:
--   SELECT count(*) FROM tb_forwarder;                            -- unchanged
-- ════════════════════════════════════════════════════════════
