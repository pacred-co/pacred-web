-- ════════════════════════════════════════════════════════════
-- V-E10 · freight_qa_inspections + qa-inspection-photos bucket
-- ════════════════════════════════════════════════════════════
-- Per port-spec [docs/port-specs/freight-qa-qc-inspection.md].
--
-- Warehouse intake inspection — runs when shipment arrives at TH warehouse,
-- BEFORE billing is allowed. Outcome enum {pass, fail_minor, fail_major,
-- waived}; failed cases trigger customer notification, waived requires
-- super-only override + reason. V-E7 billing gate (when shipped) will
-- refuse to issue freight_invoices for shipments without a pass/waive/
-- fail_minor inspection.
--
-- V1 cargo-only (freight_shipments doesn't exist yet — V-E1 ships it later).
-- The `freight_shipment_id` column is reserved as nullable; a follow-up
-- migration after V-E1 will add the FK + relax constraints to allow either
-- side. For now: `cargo_shipment_id` is the only valid parent.
--
-- This migration introduces:
--   1. freight_qa_inspections    — one row per inspection event
--   2. qa_inspection_seq         — daily serial counter (QA-YYMMDD-NNNN)
--   3. next_qa_inspection_no()   — atomic serial generator
--   4. RLS                       — customer reads own, warehouse+super+accounting full write
--   5. qa-inspection-photos bucket — private; photo evidence
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Daily serial counter ----------------------------------------------
create table if not exists public.qa_inspection_seq (
  period_yymmdd text primary key,
  next_seq      int  not null default 1,
  updated_at    timestamptz not null default now()
);

-- 2) freight_qa_inspections --------------------------------------------
create table if not exists public.freight_qa_inspections (
  id                       uuid primary key default gen_random_uuid(),

  -- One of these is set (XOR). freight_shipment_id is reserved for V-E1.
  freight_shipment_id      uuid,   -- FK will be added in a follow-up after V-E1 lands.
  cargo_shipment_id        uuid references public.cargo_shipments(id) on delete restrict,

  inspection_no            text unique,   -- QA-YYMMDD-NNNN (auto via trigger / fn)

  inspected_by_admin_id    uuid not null references public.profiles(id),
  inspected_at             timestamptz not null default now(),

  outcome                  text not null check (outcome in (
                             'pass',
                             'fail_minor',
                             'fail_major',
                             'waived'
                           )),
  damage_level             text check (damage_level in (
                             'none',
                             'cosmetic',
                             'partial',
                             'total'
                           )),
  missing_items            int  not null default 0,
  notes                    text,
  photo_paths              text[] not null default '{}',

  -- waived flow (super-only — gate at app layer; DB just enforces shape)
  waived_reason            text,
  waived_by_admin_id       uuid references public.profiles(id),
  waived_at                timestamptz,

  customer_notified_at     timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- Exactly one parent. (XOR — same pattern as tax_invoices_one_parent_order.)
  -- V1: only cargo_shipment_id is valid (freight side is reserved nullable).
  constraint qa_one_parent_shipment check (
    (cargo_shipment_id is not null and freight_shipment_id is null) or
    (cargo_shipment_id is null     and freight_shipment_id is not null)
  ),
  -- waived requires reason ≥5 chars + an approver.
  constraint qa_waived_consistency check (
    outcome <> 'waived' or (
      waived_reason is not null
      and char_length(waived_reason) >= 5
      and waived_by_admin_id is not null
      and waived_at is not null
    )
  ),
  -- fail_minor / fail_major must declare a damage level.
  constraint qa_damage_consistency check (
    outcome not in ('fail_minor','fail_major') or damage_level is not null
  )
);

-- Lookup indexes -------------------------------------------------------
create index if not exists qa_inspections_cargo_shipment_idx
  on public.freight_qa_inspections(cargo_shipment_id)
  where cargo_shipment_id is not null;
create index if not exists qa_inspections_freight_shipment_idx
  on public.freight_qa_inspections(freight_shipment_id)
  where freight_shipment_id is not null;
create index if not exists qa_inspections_outcome_idx
  on public.freight_qa_inspections(outcome);
create index if not exists qa_inspections_inspected_at_idx
  on public.freight_qa_inspections(inspected_at desc);

-- updated_at auto-touch.
drop trigger if exists qa_inspections_updated_at_trigger on public.freight_qa_inspections;
create trigger qa_inspections_updated_at_trigger
  before update on public.freight_qa_inspections
  for each row execute function public.set_updated_at();

-- 3) Atomic serial generator -------------------------------------------
-- QA-YYMMDD-NNNN with daily counter reset (Bangkok timezone).
create or replace function public.next_qa_inspection_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yymmdd text := to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD');
  seq    int;
begin
  insert into public.qa_inspection_seq (period_yymmdd, next_seq)
    values (yymmdd, 2)
    on conflict (period_yymmdd) do update
      set next_seq   = qa_inspection_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'QA-' || yymmdd || '-' || lpad(seq::text, 4, '0');
end;
$$;

revoke all     on function public.next_qa_inspection_no() from public, authenticated, anon;
grant  execute on function public.next_qa_inspection_no() to service_role;

-- 4) RLS ---------------------------------------------------------------
alter table public.freight_qa_inspections enable row level security;
alter table public.qa_inspection_seq      enable row level security;

-- Customer reads own inspection (visible the moment admin records it —
-- there's no draft state, an existing row is always meaningful).
drop policy if exists qa_inspections_customer_read on public.freight_qa_inspections;
create policy qa_inspections_customer_read
  on public.freight_qa_inspections for select
  using (
    exists (
      select 1 from public.cargo_shipments cs
       where cs.id = freight_qa_inspections.cargo_shipment_id
         and cs.profile_id = auth.uid()
    )
  );

-- Warehouse + super + accounting: full access (admin gates waive at app layer).
drop policy if exists qa_inspections_admin_all on public.freight_qa_inspections;
create policy qa_inspections_admin_all
  on public.freight_qa_inspections for all
  using      (public.is_admin(array['super','accounting','warehouse']))
  with check (public.is_admin(array['super','accounting','warehouse']));

-- Seq table: admin-only (generator fn bypasses via security definer).
drop policy if exists qa_inspection_seq_admin_all on public.qa_inspection_seq;
create policy qa_inspection_seq_admin_all
  on public.qa_inspection_seq for all
  using      (public.is_admin(array['super','accounting','warehouse']))
  with check (public.is_admin(array['super','accounting','warehouse']));

-- 5) Storage bucket 'qa-inspection-photos' -----------------------------
insert into storage.buckets (id, name, public)
values ('qa-inspection-photos', 'qa-inspection-photos', false)
on conflict (id) do nothing;

-- Customer reads photos under their owned shipment folder.
-- Path layout: {cargo_shipment_id}/{inspection_id}/photo-{N}.{ext}.
-- We check the first folder segment maps to a cargo_shipment owned by user.
drop policy if exists "qa_photos_customer_read" on storage.objects;
create policy "qa_photos_customer_read"
  on storage.objects for select
  using (
    bucket_id = 'qa-inspection-photos'
    and exists (
      select 1 from public.cargo_shipments cs
       where cs.id::text = (storage.foldername(name))[1]
         and cs.profile_id = auth.uid()
    )
  );

-- Admin (warehouse / super / accounting) reads any photo.
drop policy if exists "qa_photos_admin_read" on storage.objects;
create policy "qa_photos_admin_read"
  on storage.objects for select
  using (
    bucket_id = 'qa-inspection-photos'
    and public.is_admin(array['super','accounting','warehouse'])
  );

-- No INSERT/UPDATE/DELETE policies — all writes go through service_role
-- inside server actions (actions/admin/qa-inspections.ts).

-- 6) Comments ----------------------------------------------------------
comment on table  public.freight_qa_inspections is
  'Warehouse intake QA/QC inspection per arrived shipment. Pre-billing gate for V-E7 freight invoices. V1 cargo-only; freight side reserved nullable for V-E1.';
comment on column public.freight_qa_inspections.outcome is
  'pass | fail_minor (deliverable, customer accepts as-is) | fail_major (rework/claim) | waived (super-only override + reason).';
comment on column public.freight_qa_inspections.damage_level is
  'none | cosmetic | partial | total. Required when outcome in {fail_minor, fail_major}.';
comment on column public.freight_qa_inspections.photo_paths is
  'Array of Storage paths in bucket qa-inspection-photos. Each path = {cargo_shipment_id}/{inspection_id}/photo-N.{ext}.';
comment on constraint qa_one_parent_shipment on public.freight_qa_inspections is
  'V1: only cargo_shipment_id is non-null. After V-E1 ships, a follow-up migration adds the freight_shipments FK + relaxes this constraint to allow either side.';
comment on constraint qa_waived_consistency on public.freight_qa_inspections is
  'waived outcome requires reason ≥5 chars + approver + timestamp (ADR-0014 audit pattern).';
comment on function public.next_qa_inspection_no is
  'Atomic serial generator. QA-YYMMDD-NNNN with daily reset (Bangkok TZ). Concurrent calls serialise on upsert lock.';
