-- 0161 · 2026-06-09 — P3 (tax-invoice platform): CARGO tax-doc job record.
--
-- THE 3-NUMBER / 4-ROLE MODEL (docs/research/tax-invoice-platform-build-plan-
-- 2026-06-09.md + docs/learnings/pacred-cargo-tax-invoice-flow.md):
-- a CARGO import (ฝากสั่งซื้อ / ฝากนำเข้า) is a Freight-LCL job where Pacred
-- issues ONE consolidated customs declaration (ใบขนรวม) under the shipping
-- company name; the customer sees only the ใบกำกับภาษี. The work is split
-- across 4 roles, each carrying ONE of the three numbers:
--   CS       (SELLING)             · cs_status
--   PRICING  (COST → PEAK)         · pricing_status
--   DOCS     (DECLARED → ใบขน)     · docs_status
--   ACCOUNT  (PEAK + ใบกำกับ)      · account_status
--
-- This table is the per-job spine that carries the doc-mode + the 4 section
-- statuses + the link to the consolidated customs declaration. It is keyed on
-- EITHER an import-forwarder (fid → tb_forwarder.id) OR a shop-order (hno →
-- tb_header_order.hno) — one of the two is set per job.
--
-- P3 SCOPE = CAPTURE/SURFACE ONLY. No issuance, no money, no comms, no status
-- flips driven by money. The *_status columns default '' (untouched) and are
-- advanced by the per-section roles in P4 (the 4-role workspace). This migration
-- only stands up the table + RLS so the Docs surface (P3) can read/attach a
-- declaration_id. Purely additive + idempotent (safe to re-run).

create table if not exists public.tb_cargo_taxdoc_job (
  id              uuid primary key default gen_random_uuid(),

  -- ── Job key — EXACTLY one of fid / hno is set (CHECK below) ──
  fid             integer,                 -- → tb_forwarder.id (ฝากนำเข้า import-forwarder)
  hno             text,                    -- → tb_header_order.hno (ฝากสั่งซื้อ shop-order)

  -- ── doc-mode (mirror tb_forwarder.tax_doc_pref / cart.ts shape) ──
  --   tax_invoice = เอาเอกสาร (+VAT) · customs = อยากได้ใบขนในชื่อตัวเอง
  --   receipt = ไม่รับเอกสาร (NNB / เหมาภาษี) · none = ยังไม่เลือก
  doc_mode        text not null default 'none'
                    check (doc_mode in ('none', 'receipt', 'tax_invoice', 'customs')),

  -- ── 4-section status (advanced in P4; '' = not started) ──
  cs_status       text not null default '',
  pricing_status  text not null default '',
  docs_status     text not null default '',
  account_status  text not null default '',

  -- ── Consolidation grain + the linked ใบขนรวม ──
  cabinet_no      text,                    -- tb_forwarder.fcabinetnumber (the ตู้)
  declaration_id  uuid references public.customs_declarations(id) on delete set null,

  notes           text,

  created_by_admin_id uuid references public.profiles(id),
  updated_by_admin_id uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- exactly one job key set
  constraint tb_cargo_taxdoc_job_one_key check (
    (fid is not null and hno is null)
    or (fid is null and hno is not null)
  )
);

-- One job per import-forwarder + one job per shop-order (partial uniques —
-- NULLs don't collide).
create unique index if not exists tb_cargo_taxdoc_job_fid_uidx
  on public.tb_cargo_taxdoc_job(fid) where fid is not null;
create unique index if not exists tb_cargo_taxdoc_job_hno_uidx
  on public.tb_cargo_taxdoc_job(hno) where hno is not null;

create index if not exists tb_cargo_taxdoc_job_cabinet_idx
  on public.tb_cargo_taxdoc_job(cabinet_no) where cabinet_no is not null;
create index if not exists tb_cargo_taxdoc_job_declaration_idx
  on public.tb_cargo_taxdoc_job(declaration_id) where declaration_id is not null;
create index if not exists tb_cargo_taxdoc_job_docs_status_idx
  on public.tb_cargo_taxdoc_job(docs_status);

drop trigger if exists tb_cargo_taxdoc_job_updated_at_trigger on public.tb_cargo_taxdoc_job;
create trigger tb_cargo_taxdoc_job_updated_at_trigger
  before update on public.tb_cargo_taxdoc_job
  for each row execute function public.set_updated_at();

-- ── RLS — internal staff only (the 3-number model is company-internal) ──
alter table public.tb_cargo_taxdoc_job enable row level security;

drop policy if exists tb_cargo_taxdoc_job_admin_all on public.tb_cargo_taxdoc_job;
create policy tb_cargo_taxdoc_job_admin_all
  on public.tb_cargo_taxdoc_job for all
  using      (public.is_admin(array['super','sales','pricing','accounting','freight_import_doc']))
  with check (public.is_admin(array['super','sales','pricing','accounting','freight_import_doc']));

comment on table public.tb_cargo_taxdoc_job is
  '2026-06-09 (mig 0161) P3 — CARGO tax-doc job spine (3-number / 4-role model). '
  'Keyed on EITHER fid (import-forwarder) OR hno (shop-order). Carries the doc-mode, '
  'the 4 section statuses (cs/pricing/docs/account), the cabinet_no, and the link to '
  'the consolidated customs declaration (ใบขนรวม). P3 = capture/surface only; '
  'no issuance / money / comms.';
comment on column public.tb_cargo_taxdoc_job.declaration_id is
  'FK to the consolidated customs_declarations row (ใบขนรวม) for this cargo job. '
  'NULL until Docs creates/links the declaration.';
