-- ════════════════════════════════════════════════════════════
-- V-D2 + V-D3 · canonical cargo_type + carrier container number
-- ════════════════════════════════════════════════════════════
-- Per docs/audit/cargo-ops-forensics-2026-05-16.md §3.3 + §4 D2/D3
-- and docs/port-specs/cargo-volume-reconciliation.md.
--
-- V-D2 — the two legacy systems tag the SAME five cargo categories
--   with DIFFERENT latin codes:
--     PCS API "Shipment Report":      A / M / X / O / Z
--     China warehouse 装柜明细 manifest: G / T / F
--   Pacred stores ONE canonical value; lib/warehouse/cargo-type.ts
--   normalises both legacy code sets onto it.
--
-- V-D3 — a container carries two identifiers: the Pacred-issued code
--   (cargo_containers.code, e.g. GZE260407-1) and the carrier's
--   physical container number on the B/L (e.g. BLOU2025012). Today
--   only the Pacred code has a column.
--
-- Additive + idempotent. (เดฟ — structural prep; ภูม wires UI + the
-- MOMO/manifest import normalisation + tests.)
--
-- NOTE: migration 0039 was taken by V-D1 (cbm-per-source); withholding
-- tax (ADR-0015 / V-A6) now lands at 0041+, not 0039.
-- ════════════════════════════════════════════════════════════

-- ── V-D2 · canonical cargo type on each shipment ────────────────────
alter table public.cargo_shipments
  add column if not exists cargo_type text;

alter table public.cargo_shipments
  drop constraint if exists cargo_shipments_cargo_type_chk;
alter table public.cargo_shipments
  add constraint cargo_shipments_cargo_type_chk
  check (cargo_type is null or cargo_type in
    ('general','electrical','food_drug','brand','controlled'));

create index if not exists cargo_shipments_cargo_type_idx
  on public.cargo_shipments(cargo_type) where cargo_type is not null;

comment on column public.cargo_shipments.cargo_type is
  'Canonical cargo category (V-D2): general/electrical/food_drug/brand/controlled. Legacy A/M/X/O/Z (PCS API) and G/T/F (China manifest) both normalise here via lib/warehouse/cargo-type.ts. NULL until set on import.';

-- ── V-D3 · carrier physical container number ────────────────────────
alter table public.cargo_containers
  add column if not exists carrier_container_no text;

create index if not exists cargo_containers_carrier_no_idx
  on public.cargo_containers(carrier_container_no) where carrier_container_no is not null;

comment on column public.cargo_containers.carrier_container_no is
  'The shipping-line / carrier physical container number from the B/L (e.g. BLOU2025012, SLVU4871649). Distinct from cargo_containers.code, which is the Pacred-issued GZE/GZS code. V-D3.';
