-- ════════════════════════════════════════════════════════════
-- 0226 · taem_packing_line — per-tracking iTAM (แต้ม) packing-list REFERENCE store
-- ════════════════════════════════════════════════════════════
-- Owner (2026-06-29): *"เอาข้อมูลเข้า database · อุดจุดบอด"* — persist the iTAM (แต้ม)
-- packing-list ground truth so the MOMO-API-drop gap (iTAM-says-arrived vs what
-- reached tb_forwarder) is VISIBLE + one-click-fixable, instead of living only
-- transiently inside each previewTaemReconcile paste.
--
-- WHAT THIS IS:
--   A REFERENCE table. One row per (container, BASE tracking) — the `-N/M` box
--   rows are de-duped to the base tracking (parcel/wt/vol summed) at ingest, the
--   same discipline lib/admin/momo-bill-header.ts enforces, so a multi-box
--   shipment is stored ONCE (never double-counted).
--
-- WHAT THIS IS NOT:
--   - NOT a money table. NO FK to tb_forwarder / tb_order / any billing/wallet
--     table (mirrors the momo_* + taem_container_etd_eta isolation rule · §0e).
--   - NOT a write into the order/price flow. Nothing here feeds the SELL price.
--     The drift page (app/.../api-forwarder-momo/drift) READS this and links to
--     the EXISTING audited reconcile / commit paths for any actual fix.
--   - The ONLY writer is scripts/ingest-itam-packing-2026-06-29.mjs (idempotent
--     upsert on the UNIQUE key). Admin reads go through the service-role admin
--     client.
--
-- Additive + idempotent (create … if not exists). Safe to re-run. Next free = 0227.
-- DO NOT apply here — the integrator (เดฟ) applies migrations to prod+dev.
-- ════════════════════════════════════════════════════════════

create table if not exists public.taem_packing_line (
  id             uuid primary key default gen_random_uuid(),
  -- The container code as iTAM wrote it (GZS…/GZE…/EK…). Carried forward at
  -- ingest onto continuation rows (iTAM leaves col 0 blank on -2..-N rows).
  container_no   text not null,
  -- The BASE tracking — the `-N/M` box suffix stripped (lib/admin/momo-bill-header
  -- baseTracking). 1:1 with a tb_forwarder.ftrackingchn row when one exists.
  base_tracking  text not null,
  member_code    text,            -- customer code (col I "Code" · PR…/PCS…). May be null.
  item_type      text,            -- raw product Type (col H · 普通货物/ทั่วไป/A …). Reference.
  total_parcel   integer,         -- Σ Total Parcel (col N) across the base group.
  total_wt_kg    numeric(14,3),   -- Σ Total Wt. (col Q) kg across the base group.
  total_vol_cbm  numeric(14,6),   -- Σ Total Vol. (col R) m³ across the base group (6dp · matches 0192).
  etd            date,            -- ETD (col Y) — usually blank in the real files (set elsewhere).
  eta            date,            -- ETA (col Z) — usually blank in the real files.
  source_file    text,            -- the xlsx filename this base-tracking was ingested from.
  ingested_at    timestamptz not null default now(),
  -- Idempotent upsert key: re-ingesting a container overwrites its base rows in place.
  constraint taem_packing_line_container_base_uniq unique (container_no, base_tracking)
);

-- Lookup index for the drift JOIN (base_tracking = tb_forwarder.ftrackingchn).
create index if not exists taem_packing_line_base_tracking_idx
  on public.taem_packing_line (base_tracking);
create index if not exists taem_packing_line_container_idx
  on public.taem_packing_line (container_no);

alter table public.taem_packing_line enable row level security;

-- Admin read-only via authenticated (service_role bypasses RLS for the ingest write
-- and the admin-client reads). No insert/update/delete policy for non-service roles
-- → the only writer is the service-role ingest script (mirrors taem_container_etd_eta).
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'taem_packing_line'
      and policyname = 'taem_packing_line_admin_read'
  ) then
    create policy taem_packing_line_admin_read
      on public.taem_packing_line
      for select
      to authenticated
      using (public.is_admin());
  end if;
end $$;

comment on table public.taem_packing_line is
  'Per-tracking iTAM (แต้ม) packing-list REFERENCE store — de-duped to base tracking. Surfaces the MOMO-API-drop gap (iTAM-arrived vs tb_forwarder) on the read-only drift page. NO FK to money tables (§0e isolation). Only writer = scripts/ingest-itam-packing-2026-06-29.mjs (idempotent upsert). Created 2026-06-29.';
comment on column public.taem_packing_line.container_no is 'Container code from iTAM (GZS…/GZE…/EK…). Carried forward onto continuation rows at ingest.';
comment on column public.taem_packing_line.base_tracking is 'Base tracking — the -N/M box suffix stripped (baseTracking). JOINs to tb_forwarder.ftrackingchn.';
comment on column public.taem_packing_line.total_parcel is 'Σ Total Parcel across the base-tracking group (de-duped box rows summed).';
comment on column public.taem_packing_line.total_wt_kg is 'Σ Total Wt. (kg) across the base-tracking group.';
comment on column public.taem_packing_line.total_vol_cbm is 'Σ Total Vol. (m³) across the base-tracking group. 6dp (matches 0192).';
