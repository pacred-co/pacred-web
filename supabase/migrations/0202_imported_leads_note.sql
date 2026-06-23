-- 0202_imported_leads_note.sql
-- ปอน 2026-06-22: per-lead standing note ("ช่องหมายเหตุ") on imported_leads.
-- Editable by the ASSIGNED rep + seniors in the normal work view (NOT ultra-only)
-- — "ช่องอื่นๆ user อื่นก็เห็นเหมือนกัน". Distinct from imported_lead_calls.note
-- (that is per-CALL history; this is the standing lead-level remark).
--
-- Additive · idempotent · NOT NULL DEFAULT '' (existing 296 prod rows backfill to
-- '' — fast, non-volatile default, no behaviour change).

alter table public.imported_leads
  add column if not exists note text not null default '';

comment on column public.imported_leads.note is
  'Standing per-lead note (หมายเหตุ) editable by the assigned rep + seniors (ปอน 2026-06-22).';
