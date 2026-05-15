-- ════════════════════════════════════════════════════════════
-- V-D1 · cargo_shipments CBM per source (received / queue / manifest)
-- ════════════════════════════════════════════════════════════
-- Per cargo-ops-forensics: real case GZE260422-1 measured 16.79 CBM
-- via "รับเข้า" (received at TH warehouse) but 21.28 CBM via "รวมคิว"
-- (queue/billed) — same container, different sources, ฿4.49 CBM diff
-- triggers customer disputes and stalls revenue.
--
-- Today: cargo_shipments has a single `volume_cbm` column. We add 3
-- per-source columns so staff can compare BEFORE billing:
--   received_cbm  — what TH warehouse measured at receive scan
--   queue_cbm     — what the queue/manifest sum told the customer (= billed)
--   manifest_cbm  — what the China-side manifest declared at packing
--
-- Backfill: existing `volume_cbm` → `manifest_cbm` (best-fit for legacy
-- imports; received/queue start NULL until staff records them).
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

alter table public.cargo_shipments
  add column if not exists received_cbm numeric(10,3),
  add column if not exists queue_cbm    numeric(10,3),
  add column if not exists manifest_cbm numeric(10,3);

-- Each source must be non-negative if set
alter table public.cargo_shipments
  drop constraint if exists cargo_shipments_received_cbm_chk,
  drop constraint if exists cargo_shipments_queue_cbm_chk,
  drop constraint if exists cargo_shipments_manifest_cbm_chk;
alter table public.cargo_shipments
  add constraint cargo_shipments_received_cbm_chk check (received_cbm is null or received_cbm >= 0),
  add constraint cargo_shipments_queue_cbm_chk    check (queue_cbm    is null or queue_cbm    >= 0),
  add constraint cargo_shipments_manifest_cbm_chk check (manifest_cbm is null or manifest_cbm >= 0);

-- Backfill: existing volume_cbm → manifest_cbm (China-side declaration
-- is the source-of-truth for legacy data we don't have receive scans for).
update public.cargo_shipments
   set manifest_cbm = volume_cbm
 where manifest_cbm is null and volume_cbm is not null;

-- Comments — surface intent in the schema
comment on column public.cargo_shipments.volume_cbm  is
  'Legacy single-source CBM. Kept for backward compat; new code should read received_cbm/queue_cbm/manifest_cbm and compute the surface diff. V-D1.';
comment on column public.cargo_shipments.received_cbm is
  'CBM measured by TH warehouse at receive scan. Source of truth for what physically arrived. V-D1.';
comment on column public.cargo_shipments.queue_cbm is
  'CBM used in the customer queue / billing sum. May differ from received_cbm if China overestimated; compare before bill dispute. V-D1.';
comment on column public.cargo_shipments.manifest_cbm is
  'CBM declared in the China-side packing manifest. Backfilled from legacy volume_cbm where missing. V-D1.';
