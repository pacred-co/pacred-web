-- ════════════════════════════════════════════════════════════
-- 0195 · taem_container_etd_eta — ETD/ETA per container from แต้ม (iTAM)
-- ════════════════════════════════════════════════════════════
-- report-cnt #4 (owner ภูม 2026-06-19/20):
--   *"ETD/ETA เอาของ MOMO มาเทียบ แต่ยึดของ iTAM (แต้ม) เป็นหลัก"* — the แต้ม
--   packing-list is AUTHORITATIVE for ETD (เรือออกจากจีน) + ETA (ถึงไทย); MOMO is
--   only a comparison / fallback ("MOMO ชอบมั่ว").
--
-- WHY a dedicated per-container store (not overwrite momo_import_tracks.etd/eta):
--   - report-cnt groups tb_forwarder by `fCabinetNumber` — which is EITHER a real
--     container code (GZS260601-1, after the container closes) OR a MOMO routing-
--     batch placeholder (PR20260605-SEA03, before it closes). The resolver must
--     surface ETD/ETA for BOTH. Keying by the container code covers both: the แต้ม
--     reconcile writes the real container onto fcabinetnumber when it knows it, and
--     the placeholder otherwise — either way we store etd/eta under the SAME key the
--     report groups by.
--   - keeping a SEPARATE แต้ม store leaves the MOMO `momo_import_tracks.etd/eta`
--     untouched, so the resolver can express แต้ม-PRIMARY + MOMO-FALLBACK precedence
--     (and a future "compare" tooltip) without one source clobbering the other.
--
-- Source: the แต้ม "MOMO Pacred" packing-list, parsed by
-- lib/admin/taem-reconcile-parser.ts + written by actions/admin/taem-reconcile.ts
-- (the existing audited reconcile WRITE path — extended minimally, no new money path).
--
-- Isolation: NO FK to tb_* / cargo_* (mirrors the momo_* isolation rule). Admin-only
-- via service_role. Idempotent (safe to re-run).
-- ════════════════════════════════════════════════════════════

create table if not exists public.taem_container_etd_eta (
  -- The container key = the value that appears in tb_forwarder.fcabinetnumber for
  -- the parcels in this container (a real GZS…/GZE…/EK… code, or — while the
  -- container is still open on the MOMO side — the SEA0x routing-batch placeholder).
  container_no   text primary key,
  etd            date,            -- เรือ/รถ ออกจากจีน (ETD)
  eta            date,            -- ถึงไทย (ETA)
  source         text not null default 'taem',  -- always 'taem' here (authoritative)
  updated_by     text,            -- admin id that last reconciled
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.taem_container_etd_eta enable row level security;

comment on table public.taem_container_etd_eta is
  'ETD/ETA per container from the แต้ม (iTAM) packing-list — AUTHORITATIVE (MOMO is fallback/compare). Keyed by container_no = the value in tb_forwarder.fCabinetNumber. Admin-only via service_role. NO FK to legacy. Created 2026-06-20 (report-cnt #4).';
comment on column public.taem_container_etd_eta.container_no is
  'Container code as it appears in tb_forwarder.fCabinetNumber (real GZS…/GZE…/EK… or a MOMO SEA0x placeholder while still open).';
comment on column public.taem_container_etd_eta.etd is 'ETD — date the container departs China (sea/road), from แต้ม packing-list.';
comment on column public.taem_container_etd_eta.eta is 'ETA — date the container arrives in Thailand, from แต้ม packing-list.';
