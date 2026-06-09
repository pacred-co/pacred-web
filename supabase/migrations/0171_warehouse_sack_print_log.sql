-- ════════════════════════════════════════════════════════════
-- 0171 · warehouse_sack_print_log (+ tb_forwarder.warehouse_app_intake flag)
-- ════════════════════════════════════════════════════════════
-- W10 — MOMO/CargoThai warehouse worker-app (Theme 7 Phase 1).
--
-- Two pieces:
--   1. warehouse_sack_print_log — an ISOLATED audit table recording every
--      sack-tag / box-label print at warehouse scale (who printed which
--      sack/shipment label, when, how many copies). Lets a supervisor see
--      print history + re-print counts (legacy `momo_sack_print` equivalent).
--   2. tb_forwarder.warehouse_app_intake — a NULLABLE additive boolean flag
--      marking rows the worker app intaked (vs legacy create / partner sync),
--      so the warehouse dashboard can split "our-warehouse intaked today"
--      from synced/legacy rows. NULLABLE / no default change of existing rows
--      / no money column touched.
--
-- ⚠️ ISOLATION RULES:
--   ✅ ONE new isolated table + ONE nullable additive column.
--   ❌ ห้าม ALTER existing tb_forwarder columns / NOT NULL / money cols.
--      The ADD COLUMN is nullable, no default → zero rewrite of the 47k rows.
--   ❌ ห้ามแตะ money path.
--
-- RLS: is_admin([super + warehouse + ops + manager]) on the new table.
-- Idempotent (add column if not exists · create … if not exists · drop policy).
-- ════════════════════════════════════════════════════════════

-- ── 1. sack/label print audit ─────────────────────────────────
create table if not exists public.warehouse_sack_print_log (
  id              uuid primary key default gen_random_uuid(),

  -- what was printed: a sack tag (sack_id) OR a shipment box label (fid).
  -- exactly one is set; both nullable so a single table covers both kinds.
  sack_id         bigint,
  fid             bigint,

  label_kind      text not null
                    check (label_kind in ('sack_tag', 'box_label', 'barcode')),

  copies          integer not null default 1 check (copies >= 1 and copies <= 999),

  admin_id        text not null,

  created_at      timestamptz not null default now()
);

create index if not exists warehouse_sack_print_log_sack_idx    on public.warehouse_sack_print_log (sack_id);
create index if not exists warehouse_sack_print_log_fid_idx     on public.warehouse_sack_print_log (fid);
create index if not exists warehouse_sack_print_log_created_idx on public.warehouse_sack_print_log (created_at desc);

alter table public.warehouse_sack_print_log enable row level security;

drop policy if exists warehouse_sack_print_log_admin_all on public.warehouse_sack_print_log;
create policy warehouse_sack_print_log_admin_all
  on public.warehouse_sack_print_log for all
  using (public.is_admin(array['super','warehouse','ops','manager']))
  with check (public.is_admin(array['super','warehouse','ops','manager']));

comment on table public.warehouse_sack_print_log is
  'W10 warehouse label-print audit (sack tags / box labels / barcodes). ISOLATED — no FK, no money. Lets supervisors see print + re-print history at warehouse scale.';

-- ── 2. tb_forwarder worker-app intake marker (nullable additive) ──
-- NULL on every existing row (legacy/sync intakes) · the worker app sets
-- true on its own intakes. No default → no table rewrite. NEVER read by
-- any money/billing path — display/dashboard only.
alter table public.tb_forwarder
  add column if not exists warehouse_app_intake boolean;

create index if not exists tb_forwarder_warehouse_app_intake_idx
  on public.tb_forwarder (warehouse_app_intake)
  where warehouse_app_intake = true;

comment on column public.tb_forwarder.warehouse_app_intake is
  'W10 (mig 0171) · NULLABLE additive flag. true = this row was intaked via the China-warehouse worker app (vs legacy create / partner sync). Dashboard split only — NEVER read by any money/billing path. NULL = legacy/sync (the 47k existing rows).';

-- ════════════════════════════════════════════════════════════
-- DONE 0171.
-- Verification:
--   SELECT count(*) FROM warehouse_sack_print_log;                          -- 0
--   SELECT count(*) FROM tb_forwarder WHERE warehouse_app_intake = true;    -- 0
--   SELECT count(*) FROM tb_forwarder;                                      -- unchanged
-- ════════════════════════════════════════════════════════════
