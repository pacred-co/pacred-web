-- ════════════════════════════════════════════════════════════
-- 0180 · HS-code library — Form-E / ACFTA + other-forms duty extension
-- ════════════════════════════════════════════════════════════
-- Owner spec 2026-06-12 ("คลัง HS"): extend the EXISTING hs_codes dictionary
-- (mig 0030 · NOT a new table) so each code carries — alongside the normal duty
-- (default_duty_pct = อากรปกติ) — the Form-E/ACFTA preferential duty + a free
-- map of other preferential forms (อื่นๆ) + a freeform note.
--
-- Consumers: the คลัง HS CRUD page (/admin/accounting/hs-library) manages these
-- and the cost-editor (cargo-cost-line-editor.tsx) reads them as an informational
-- duty hint. ⚠️ REFERENCE / DICTIONARY DATA ONLY — never feeds the selling price
-- or a declaration's persisted duty (AGENTS.md §0e isolation).
--
-- Additive + idempotent (add column if not exists). Next free = 0180.
-- DO NOT apply here — the integrator (เดฟ) applies migrations to prod.
-- ════════════════════════════════════════════════════════════

-- อากร Form-E / ACFTA (จีน-อาเซียน preferential rate · %).
alter table public.hs_codes
  add column if not exists form_e_duty_pct numeric(6,3) not null default 0
    check (form_e_duty_pct >= 0 and form_e_duty_pct <= 100);

-- Other preferential forms (อื่นๆ) — a {"<formName>": <pct>} map, e.g.
-- {"Form-D (ATIGA)": 0, "Form-AK (Korea)": 5}.
alter table public.hs_codes
  add column if not exists other_forms jsonb not null default '{}'::jsonb;

-- Freeform note for the คลัง HS entry (เงื่อนไข / ของควบคุม / หมายเหตุ).
alter table public.hs_codes
  add column if not exists hs_note text;

comment on column public.hs_codes.form_e_duty_pct is
  'อากร Form-E / ACFTA (China-ASEAN preferential rate · %). Reference only — never feeds selling price or a declaration''s persisted duty.';
comment on column public.hs_codes.other_forms is
  'Other preferential-form duty map {"<formName>": <pct>} (อื่นๆ). Reference only.';
comment on column public.hs_codes.hs_note is
  'Freeform note for the คลัง HS entry (conditions / controlled-goods / remarks).';
