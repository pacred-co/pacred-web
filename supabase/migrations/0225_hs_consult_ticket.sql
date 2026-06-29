-- ════════════════════════════════════════════════════════════
-- 0225 · hs_consult_ticket — ad-hoc pre-order HS/พิกัด consult (G1)
-- Owner 2026-06-29 (operational-flow §8 G1): the #1 daily task = Sale/CS post
-- photo+Thai name → Doc replies HS/อากร/ฟอร์มอี/stat/ออกใบกำกับ + เลี่ยงพิกัด,
-- BEFORE an order exists. The order-bound hs-triage does not cover this.
-- Backing dictionary = hs_codes (mig 0030/0180/0181/0224); this adds the
-- request/answer WORKFLOW + the เลี่ยง/license flag set on top.
-- ⚠️ REFERENCE/CONSULT DATA ONLY (AGENTS.md §0e) — never feeds selling
--    price / cost / order / a declaration's persisted duty.
-- Idempotent. Photos reuse the existing member-docs bucket.
-- is_admin(text[]) helper = mig 0015 · set_updated_at() = mig 0002.
-- ════════════════════════════════════════════════════════════

create table if not exists public.hs_consult_ticket (
  id                     uuid primary key default gen_random_uuid(),

  -- ── request (Sale/CS) ──
  product_name_th        text not null,
  product_name_en        text,
  qty                    text,                 -- freeform ("9 ขวด", "48 กล่อง")
  request_note           text,                 -- specs / intended service / notes
  photo_keys             jsonb not null default '[]'::jsonb,  -- member-docs storage keys
  submitted_by           uuid not null references public.profiles(id),

  -- ── status ──
  status                 text not null default 'open'
                           check (status in ('open','answered','audit_confirmed','cancelled')),

  -- ── answer (Doc/pricing/accounting) ──
  hs_code                text,                 -- free text (codes not yet in library OK); not FK'd
  duty_pct               numeric(6,3) check (duty_pct is null or (duty_pct >= 0 and duty_pct <= 100)),
  form_e_pct             numeric(6,3) check (form_e_pct is null or (form_e_pct >= 0 and form_e_pct <= 100)),
  stat_code              text,                 -- รหัสสถิติ 000/001/090…
  can_issue_tax_invoice  boolean,              -- ออกใบกำกับได้ไหม (null=unanswered)
  answer_note            text,

  -- ── เลี่ยงพิกัด (license avoidance) ──
  is_evaded              boolean not null default false,
  original_restricted_item text,              -- what it really is before reclassify
  license_flags          jsonb not null default '[]'::jsonb,  -- ['มอก','อย','ใบอนุญาต','ทุ่มตลาด','เกษตร','DG']

  answered_by            uuid references public.profiles(id),
  answered_at            timestamptz,

  -- ── optional audit confirm (AUDIT DOC / senior) ──
  audited_by             uuid references public.profiles(id),
  audited_at             timestamptz,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists hs_consult_ticket_status_idx     on public.hs_consult_ticket(status);
create index if not exists hs_consult_ticket_created_idx     on public.hs_consult_ticket(created_at desc);
create index if not exists hs_consult_ticket_submitted_idx   on public.hs_consult_ticket(submitted_by);
create index if not exists hs_consult_ticket_hs_code_idx     on public.hs_consult_ticket(hs_code) where hs_code is not null;

drop trigger if exists hs_consult_ticket_updated_at_trigger on public.hs_consult_ticket;
create trigger hs_consult_ticket_updated_at_trigger
  before update on public.hs_consult_ticket
  for each row execute function public.set_updated_at();

alter table public.hs_consult_ticket enable row level security;

-- Admin (submit + answer + audit roles) full access; service_role bypasses RLS
-- (all writes go through actions/admin/hs-consult.ts which re-gates per stage).
-- NOTE: is_admin(any_role) already treats 'super' as satisfying any role check,
-- so 'super' (and via the operational roles below) is covered.
drop policy if exists hs_consult_ticket_admin_all on public.hs_consult_ticket;
create policy hs_consult_ticket_admin_all
  on public.hs_consult_ticket for all
  using      (public.is_admin(array['ultra','super','manager','sales','sales_admin','ops','freight_import_doc','freight_clearance_both','pricing','accounting']))
  with check (public.is_admin(array['ultra','super','manager','sales','sales_admin','ops','freight_import_doc','freight_clearance_both','pricing','accounting']));

-- Photos reuse member-docs bucket under hs-consult/<ticket_id>/<file>.
drop policy if exists "hs_consult_photos_admin_read" on storage.objects;
create policy "hs_consult_photos_admin_read"
  on storage.objects for select
  using (
    bucket_id = 'member-docs'
    and (storage.foldername(name))[1] = 'hs-consult'
    and public.is_admin(array['ultra','super','manager','sales','sales_admin','ops','freight_import_doc','freight_clearance_both','pricing','accounting'])
  );

comment on table public.hs_consult_ticket is
  '0225 (G1) — ad-hoc pre-order HS/พิกัด consult: Sale/CS photo+TH name → Doc answers HS/อากร/ฟอร์มอี/stat/ใบกำกับ + เลี่ยงพิกัด. Reference/consult only (§0e). Library = hs_codes.';
comment on column public.hs_consult_ticket.license_flags is
  'jsonb array of restriction tags driving เลี่ยงพิกัด: มอก/อย/ใบอนุญาต/ทุ่มตลาด/เกษตร/DG.';
