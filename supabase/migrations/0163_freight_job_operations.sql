-- ════════════════════════════════════════════════════════════
-- 0163 · freight_job_operations — AX JOB ops cockpit state layer
-- ════════════════════════════════════════════════════════════
-- W4 — Freight ops cockpit (PRICING→SALES→DOC→ACC). Reference:
-- the AX JOB MINE workflow (docs/research/freight-knowledge-2026-06-01).
--
-- THE LAYER, NOT A REBUILD: the freight spine already exists —
-- freight_quotes / freight_shipments / freight_parties / freight_invoices.
-- This table sits ON TOP of one freight_shipment and records the
-- per-stage workflow STATE + section assignments + a read-only P&L
-- snapshot for the cockpit's stat bar. It owns NO money: revenue/cost/
-- profit here are operator-entered SNAPSHOTS surfaced in the board, NOT
-- the authoritative figures (those stay on freight_shipments /
-- freight_invoices and are NEVER mutated by this layer).
--
-- 4-stage AX JOB pipeline (each its own status string · '' = not started):
--   PRICING  (Cargo/Freight Pricing — costs the job)
--   SALES    (CS confirms the customer quote)
--   DOC      (Shipping Doc — ใบขน / Form-E / customs records its cost)
--   ACC      (Accounting — closes P&L · gated on cs+pricing done)
--
-- ⚠️ ISOLATION RULES (per project safety constraints · same as 0154/0158):
--   ✅ ONE new table over the freight spine. FK to freight_shipments only
--      (the spine row), ON DELETE CASCADE (an op row makes no sense without
--      its shipment). assigned_*_admin_id reference profiles(id) (the
--      existing admin identity table) — same as freight_shipments.created_by_admin_id.
--   ❌ ห้าม ALTER / DROP / RENAME / TRUNCATE table เดิม (freight_shipments
--      etc. untouched).
--   ❌ ห้ามแตะ money path — no write to commercial_value / vat / invoice.
--
-- RLS: is_admin([freight + ops + accounting roles]) full; service-role
-- (admin client) bypasses RLS for the server actions.
--
-- Idempotent (safe to re-run): create … if not exists + drop policy if exists.
-- ════════════════════════════════════════════════════════════

create table if not exists public.freight_job_operations (
  id                        uuid primary key default gen_random_uuid(),

  -- The freight spine row this ops record belongs to. UNIQUE = at most one
  -- ops record per shipment (the cockpit's job card).
  freight_shipment_id       uuid not null
                              references public.freight_shipments(id) on delete cascade,

  -- ── Section assignments (who owns each stage · NO FK enforcement loop;
  --    profiles is the admin identity table, same as created_by_admin_id) ──
  assigned_pricing_admin_id uuid references public.profiles(id),
  assigned_sales_admin_id   uuid references public.profiles(id),
  assigned_doc_admin_id     uuid references public.profiles(id),
  assigned_acc_admin_id     uuid references public.profiles(id),

  -- ── Per-stage status. '' = not started · 'in_progress' · 'done'.
  --    (free text + CHECK so the Kanban columns are predictable.) ──
  pricing_status            text not null default ''
                              check (pricing_status in ('', 'in_progress', 'done')),
  sales_status              text not null default ''
                              check (sales_status in ('', 'in_progress', 'done')),
  docs_status               text not null default ''
                              check (docs_status in ('', 'in_progress', 'done')),
  acc_status                text not null default ''
                              check (acc_status in ('', 'in_progress', 'done')),

  -- ── Read-only P&L SNAPSHOT (operator-entered · surfaced in the stat bar).
  --    NOT the authoritative money — the spine + invoices own that. ──
  cost_snapshot_thb         numeric(14,2) check (cost_snapshot_thb >= 0    and cost_snapshot_thb    <= 999999999.99),
  revenue_snapshot_thb      numeric(14,2) check (revenue_snapshot_thb >= 0 and revenue_snapshot_thb <= 999999999.99),
  profit_snapshot_thb       numeric(14,2) check (profit_snapshot_thb >= -999999999.99 and profit_snapshot_thb <= 999999999.99),

  is_urgent                 boolean not null default false,

  notes                     text,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- One ops record per shipment.
create unique index if not exists freight_job_operations_shipment_uidx
  on public.freight_job_operations (freight_shipment_id);

-- Cockpit board reads filter by per-stage status + urgency + recency.
create index if not exists freight_job_operations_pricing_idx on public.freight_job_operations (pricing_status);
create index if not exists freight_job_operations_sales_idx   on public.freight_job_operations (sales_status);
create index if not exists freight_job_operations_docs_idx    on public.freight_job_operations (docs_status);
create index if not exists freight_job_operations_acc_idx     on public.freight_job_operations (acc_status);
create index if not exists freight_job_operations_urgent_idx  on public.freight_job_operations (is_urgent) where is_urgent = true;
create index if not exists freight_job_operations_updated_idx on public.freight_job_operations (updated_at desc);

drop trigger if exists freight_job_operations_updated_at_trigger on public.freight_job_operations;
create trigger freight_job_operations_updated_at_trigger
  before update on public.freight_job_operations
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────
alter table public.freight_job_operations enable row level security;

-- Admin full read+write — freight ops + cargo ops supervision + accounting.
-- (super always passes via is_admin.) Mirrors the freight_shipments admin set
-- broadened to the freight section roles that work the cockpit.
drop policy if exists freight_job_operations_admin_all on public.freight_job_operations;
create policy freight_job_operations_admin_all
  on public.freight_job_operations for all
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

comment on table public.freight_job_operations is
  'W4 freight ops cockpit (AX JOB) state layer over one freight_shipment. Per-stage status (pricing/sales/docs/acc) + section assignments + read-only P&L snapshot + urgency. Owns NO money — revenue/cost/profit are operator snapshots surfaced in the board, not authoritative (spine + invoices own that).';
comment on column public.freight_job_operations.cost_snapshot_thb is
  'Operator-entered cost snapshot for the cockpit stat bar. NOT the authoritative cost — does not write the spine / invoices / quote.';
comment on column public.freight_job_operations.revenue_snapshot_thb is
  'Operator-entered revenue snapshot for the cockpit stat bar. Defaults from the spine commercial_value_thb in the read action; editing it here does NOT mutate the spine.';
comment on column public.freight_job_operations.profit_snapshot_thb is
  'revenue_snapshot − cost_snapshot (computed in the action when both set). Display-only.';

-- ════════════════════════════════════════════════════════════
-- DONE 0163.
-- Verification:
--   SELECT count(*) FROM freight_job_operations;        -- 0
--   SELECT count(*) FROM freight_shipments;             -- unchanged (untouched)
-- next reserved (this wave) = 0164
-- ════════════════════════════════════════════════════════════
