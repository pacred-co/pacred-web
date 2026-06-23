-- 0203_imported_leads_pr_code.sql
-- ปอน 2026-06-23: "รหัส PR" column on the new "ปิดการขายได้" (closed) tab — the rep
-- records the member code (PR…) of the customer once the deal closes + they register.
-- Editable free-text (lead data is messy · not format-enforced). Additive · idempotent
-- · NOT NULL DEFAULT '' (existing rows backfill to '' — fast, non-volatile default).

alter table public.imported_leads
  add column if not exists pr_code text not null default '';

comment on column public.imported_leads.pr_code is
  'PR member code recorded on a closed deal (ปอน 2026-06-23 · "ปิดการขายได้" tab).';
