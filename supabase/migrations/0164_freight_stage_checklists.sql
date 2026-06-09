-- ════════════════════════════════════════════════════════════
-- 0164 · freight_stage_checklists — per-stage task checklist for the cockpit
-- ════════════════════════════════════════════════════════════
-- W4 — Freight ops cockpit. Companion to 0163 (freight_job_operations).
-- Each row = one checklist item on a given stage of a shipment's job.
-- The cockpit detail panel renders a stage-aware checklist (sales / doc
-- стages) so the section owner can track sub-tasks (e.g. DOC: ใบขน drafted /
-- Form-E obtained / D/O released). Pure ops tracking — no money, no comms.
--
-- ⚠️ ISOLATION RULES (same as 0163):
--   ✅ ONE new table. FK to freight_shipments only, ON DELETE CASCADE.
--      owner_admin_id references profiles(id).
--   ❌ ห้าม ALTER / DROP table เดิม. ❌ no money/comms.
--
-- RLS: same admin set as 0163.
-- Idempotent.
-- ════════════════════════════════════════════════════════════

create table if not exists public.freight_stage_checklists (
  id                  uuid primary key default gen_random_uuid(),

  freight_shipment_id uuid not null
                        references public.freight_shipments(id) on delete cascade,

  -- Which stage this item lives on (matches the *_status columns on 0163).
  stage               text not null
                        check (stage in ('pricing', 'sales', 'docs', 'acc')),

  -- The task label (free text).
  item                text not null,

  owner_admin_id      uuid references public.profiles(id),

  done                boolean not null default false,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Detail panel reads all items for a shipment, grouped by stage.
create index if not exists freight_stage_checklists_shipment_idx
  on public.freight_stage_checklists (freight_shipment_id, stage);

drop trigger if exists freight_stage_checklists_updated_at_trigger on public.freight_stage_checklists;
create trigger freight_stage_checklists_updated_at_trigger
  before update on public.freight_stage_checklists
  for each row execute function public.set_updated_at();

-- ── RLS — same admin set as 0163 ──────────────────────────────
alter table public.freight_stage_checklists enable row level security;

drop policy if exists freight_stage_checklists_admin_all on public.freight_stage_checklists;
create policy freight_stage_checklists_admin_all
  on public.freight_stage_checklists for all
  using (public.is_admin(array[
    'super','ops','sales_admin','accounting','pricing',
    'freight_sales_manager','freight_sales',
    'freight_export_manager','freight_export_cs','freight_export_doc','freight_export_clearance',
    'freight_clearance_both',
    'freight_import_manager','freight_import_cs','freight_import_doc','freight_import_clearance'
  ]))
  with check (public.is_admin(array[
    'super','ops','sales_admin','accounting','pricing',
    'freight_sales_manager','freight_sales',
    'freight_export_manager','freight_export_cs','freight_export_doc','freight_export_clearance',
    'freight_clearance_both',
    'freight_import_manager','freight_import_cs','freight_import_doc','freight_import_clearance'
  ]));

comment on table public.freight_stage_checklists is
  'W4 freight ops cockpit per-stage checklist items (sales/doc/etc). One row per task on a shipment stage. Pure ops tracking — no money/comms.';

-- ════════════════════════════════════════════════════════════
-- DONE 0164.
-- Verification:
--   SELECT count(*) FROM freight_stage_checklists;       -- 0
--   SELECT count(*) FROM freight_shipments;              -- unchanged
-- ════════════════════════════════════════════════════════════
