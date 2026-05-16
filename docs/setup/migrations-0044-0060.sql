-- ════════════════════════════════════════════════════════════
-- Pacred — combined migrations 0044 → 0048 + 0060
-- (ภูม Phase-I2 batch + เดฟ member_code) · generated 2026-05-17 by เดฟ
-- ════════════════════════════════════════════════════════════
-- HOW TO APPLY — ภูม, run on BOTH environments (dev FIRST, then production):
--   1. Supabase Dashboard → select the project (dev, then prod)
--   2. SQL Editor → New query
--   3. Paste this WHOLE file → Run
--   4. "already exists" / "duplicate" notices = SAFE. Every statement is
--      idempotent (create table IF NOT EXISTS · create or replace ·
--      drop+recreate trigger/policy · on conflict do nothing) — re-run anytime.
--
-- PREREQUISITES: migrations 0002-0043 already applied (the live system runs
-- on them). These 6 migrations are mutually INDEPENDENT — order does not
-- matter; each only needs the 0002-0043 base.
--
-- WHAT THIS ADDS:
--   0044  withholding_tax_entries        — V-A6 WHT (ภาษีหัก ณ ที่จ่าย) + wht-certs bucket
--   0045  freight_qa_inspections (+seq)  — V-E10 warehouse QA/QC intake + photos bucket
--   0046  org_contacts                   — V-G5 owner-self-serve contact management
--   0047  tos_versions + tos_acceptances — V-G4 TOS version management
--   0048  freight_quotes + items (+seq)  — V-E6 freight quotation workflow
--   0060  generate_member_code()         — member_code PR00001 → PR001 + backfill
--
-- AFTER RUNNING: scroll to the VERIFY block at the bottom — it returns
-- three result sets; eyeball each against its "Expected" comment.
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
-- V-A6 · withholding_tax_entries + wht-certs Storage bucket
-- ════════════════════════════════════════════════════════════
-- Per ADR-0015 (locked 2026-05-16 night). Pacred customers who are
-- juristic (companies) withhold 1%/1.5%/2%/3%/5% of the service fee
-- per Thai Revenue Department rules, transfer Net = Gross − W, and
-- must hand Pacred a 50 ทวิ certificate. The certificate IS the tax
-- credit — losing it = losing money. Staff explicit ask (chat
-- 11/12/2025 + 30/3/2026): "ถ้าไม่แนบใบหัก ยังไม่ได้รับใบเสร็จ" —
-- receipt issuance must be gated on this row's cert_status.
--
-- A row's EXISTENCE = "WHT applies". No row = personal customer
-- (no withholding) → tax-invoice issues freely as before.
--
-- This migration introduces:
--   1. withholding_tax_entries     — one row per WHT event (parent = order_h_no OR forwarder_f_no, optional tax_invoice_id link)
--   2. RLS                         — customer reads own; super/accounting full access (mirror tax_invoices)
--   3. wht-certs Storage bucket    — private, customer-folder pattern (mirror tax-invoices)
--   4. Comments
--
-- Idempotent. Renamed from spec's 0039 → 0044 per phase I2 prep doc.
-- ════════════════════════════════════════════════════════════

-- 1) withholding_tax_entries -------------------------------------------
create table if not exists public.withholding_tax_entries (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles(id) on delete restrict,

  -- Exactly one parent order (mirror tax_invoices_one_parent_order, migration 0034).
  order_h_no          text references public.service_orders(h_no),
  forwarder_f_no      text references public.forwarders(f_no),

  -- Linked once a tax invoice is issued for the same parent (issuance-time backfill).
  tax_invoice_id      uuid references public.tax_invoices(id),

  -- Financial snapshot (frozen at row creation; receipt always shows gross_invoice_thb)
  gross_invoice_thb   numeric(12,2) not null,    -- full invoice total (the receipt total)
  wht_base_thb        numeric(12,2) not null,    -- the WHT-able service portion (staff-confirmed)
  wht_rate_pct        numeric(4,2)  not null check (wht_rate_pct in (1, 1.5, 2, 3, 5)),
  wht_amount_thb      numeric(12,2) not null,    -- = round(wht_base_thb * wht_rate_pct/100, 2)
  net_expected_thb    numeric(12,2) not null,    -- = gross_invoice_thb − wht_amount_thb

  -- Certificate (หนังสือรับรองหัก ณ ที่จ่าย / 50 ทวิ)
  cert_status         text not null default 'pending'
                        check (cert_status in ('pending', 'received', 'waived')),
  cert_number         text,                       -- customer's 50 ทวิ running no.
  cert_storage_path   text,                       -- "{profile_id}/{parent_key}/cert-...pdf" in bucket 'wht-certs'
  cert_received_at    timestamptz,
  waived_reason       text,                       -- required when cert_status='waived'
  waived_by_admin     uuid references public.profiles(id),
  waived_at           timestamptz,

  -- Audit trail
  recorded_by_admin   uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Exactly one parent order (XOR — same pattern as tax_invoices).
  constraint wht_one_parent_order check (
    (order_h_no is not null and forwarder_f_no is null) or
    (order_h_no is null     and forwarder_f_no is not null)
  ),
  -- waived requires a reason + approver.
  constraint wht_waived_has_reason check (
    cert_status <> 'waived' or (waived_reason is not null and waived_by_admin is not null)
  ),
  -- received requires the certificate metadata.
  constraint wht_received_has_path check (
    cert_status <> 'received' or (cert_storage_path is not null and cert_received_at is not null)
  )
);

-- Lookup indexes -------------------------------------------------------
create index if not exists wht_profile_status_idx
  on public.withholding_tax_entries(profile_id, cert_status);
create index if not exists wht_order_idx
  on public.withholding_tax_entries(order_h_no)     where order_h_no    is not null;
create index if not exists wht_forwarder_idx
  on public.withholding_tax_entries(forwarder_f_no) where forwarder_f_no is not null;
create index if not exists wht_tax_invoice_idx
  on public.withholding_tax_entries(tax_invoice_id) where tax_invoice_id is not null;
create index if not exists wht_pending_cert_idx
  on public.withholding_tax_entries(profile_id) where cert_status = 'pending';

-- One WHT entry per parent order (no double-counting if accidentally re-created).
-- Two partial-unique indexes (parent column is XOR via the CHECK above).
create unique index if not exists wht_one_per_order_uidx
  on public.withholding_tax_entries(order_h_no)
  where order_h_no is not null;
create unique index if not exists wht_one_per_forwarder_uidx
  on public.withholding_tax_entries(forwarder_f_no)
  where forwarder_f_no is not null;

-- updated_at auto-touch.
drop trigger if exists wht_entries_updated_at_trigger on public.withholding_tax_entries;
create trigger wht_entries_updated_at_trigger
  before update on public.withholding_tax_entries
  for each row execute function public.set_updated_at();

-- 2) RLS ---------------------------------------------------------------
alter table public.withholding_tax_entries enable row level security;

-- Customer reads OWN row (so the customer-side receipt page can render the
-- WHT line + the net_expected_thb amount in the bank-transfer instructions).
drop policy if exists wht_self_read on public.withholding_tax_entries;
create policy wht_self_read
  on public.withholding_tax_entries for select
  using (profile_id = auth.uid());

-- Super + accounting full access. Mirror tax_invoices (ADR-0005 K-7).
-- ops can read (to see if a WHT row blocks an order they're handling) but cannot
-- mutate — keep the financial table tight.
drop policy if exists wht_admin_read on public.withholding_tax_entries;
create policy wht_admin_read
  on public.withholding_tax_entries for select
  using (public.is_admin(array['super','accounting','ops']));

drop policy if exists wht_admin_write on public.withholding_tax_entries;
create policy wht_admin_write
  on public.withholding_tax_entries for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- 3) Storage bucket 'wht-certs' ----------------------------------------
-- Per ADR-0015 Q4 — DEDICATED bucket (not reusing 'slips'). Different
-- retention class (tax doc) + different access pattern (admin-only V1,
-- customer self-upload deferred to V1.1).
insert into storage.buckets (id, name, public)
values ('wht-certs', 'wht-certs', false)
on conflict (id) do nothing;

-- Customer-side read: authenticated user can read certs filed under their
-- own {profile_id}/ folder (V1.1 customer download).
drop policy if exists "wht_certs_user_read" on storage.objects;
create policy "wht_certs_user_read"
  on storage.objects for select
  using (
    bucket_id = 'wht-certs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admin read: super + accounting can read any cert (audit, support).
drop policy if exists "wht_certs_admin_read" on storage.objects;
create policy "wht_certs_admin_read"
  on storage.objects for select
  using (
    bucket_id = 'wht-certs'
    and public.is_admin(array['super','accounting'])
  );

-- No INSERT/UPDATE/DELETE policies — all writes go through service_role
-- inside server actions (actions/admin/wht.ts). Default-deny otherwise.

-- 4) Comments ----------------------------------------------------------
comment on table  public.withholding_tax_entries is
  'Withholding-tax (ภาษีหัก ณ ที่จ่าย) per order. Row existence = "WHT applies". No row = personal customer / no withholding. See ADR-0015.';
comment on column public.withholding_tax_entries.gross_invoice_thb is
  'The full invoice total (what the receipt prints). NEVER mutated — WHT does not change the receipt gross.';
comment on column public.withholding_tax_entries.wht_base_thb is
  'The WHT-able service portion (staff-confirmed at row creation). Reimbursed pass-through costs (ค่าสินค้า) are typically NOT WHT-able.';
comment on column public.withholding_tax_entries.wht_rate_pct is
  'Allowed set {1, 1.5, 2, 3, 5}. UI default: 1 = freight/transport, 3 = pure service.';
comment on column public.withholding_tax_entries.net_expected_thb is
  '= gross_invoice_thb − wht_amount_thb. The customer transfers THIS amount (Net), not gross. V-A3 reconciliation reads this column.';
comment on column public.withholding_tax_entries.cert_status is
  'pending → received (cert uploaded) → tax invoice can issue. pending → waived (super/accounting only + waived_reason) → tax invoice can issue.';
comment on column public.withholding_tax_entries.cert_storage_path is
  'Path in Storage bucket "wht-certs". Set when cert_status flips to received.';
comment on constraint wht_one_parent_order on public.withholding_tax_entries is
  'Each WHT row points to exactly one parent order (cargo OR forwarder), not both, not neither. Mirrors tax_invoices_one_parent_order.';
comment on constraint wht_waived_has_reason on public.withholding_tax_entries is
  'A waived cert MUST carry waived_reason + waived_by_admin (audit-trail completeness — ADR-0014 pattern).';
comment on constraint wht_received_has_path on public.withholding_tax_entries is
  'A received cert MUST carry storage path + received timestamp (cant flip to received without actually attaching the file).';


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


-- ════════════════════════════════════════════════════════════
-- V-G5 · org_contacts (owner-self-serve org contact management)
-- ════════════════════════════════════════════════════════════
-- Per port-spec `admin-polish-bundle.md` §V-G5.
--
-- Pacred currently has contact constants hardcoded in
-- `components/seo/site.ts` (CONTACT.email*, SOCIAL.*, ADDRESSES.*, LINE_OA.*,
-- BANK.*). Owner can't self-serve update — every change requires a code
-- deploy. V-G5 adds a DB-backed `org_contacts` table that the owner can
-- manage via `/admin/settings/contacts`.
--
-- V1 = backend management surface only. Customer-side reads (footer,
-- contact-us page) keep using site.ts; integration deferred to V-G5.1
-- (when owner actually populates the table + tests on staging).
--
-- This migration introduces:
--   1. org_contacts table — single row per contact value, kind discriminator
--   2. RLS — admin write, public read (active rows)
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) org_contacts ------------------------------------------------------
create table if not exists public.org_contacts (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null check (kind in (
                         'domain',     -- pacred.co · pcscargo.com (legacy)
                         'email',      -- sales@pacred.co etc.
                         'line_oa',    -- LINE OA basic/premium IDs + add-friend URLs
                         'phone',      -- 02-421-3325 · 066-125-3007
                         'wechat',     -- WeChat IDs
                         'social',     -- Facebook · Instagram · TikTok · YouTube
                         'address'     -- HQ · warehouse
                       )),
  label                text not null,            -- "ฝ่ายขาย", "Cargo line", "Bangkok HQ"
  value                text not null,            -- the actual value (email / URL / phone / etc.)
  department           text,                     -- optional grouping for emails (ขาย / บัญชี / HR)
  is_active            boolean not null default true,
  display_order        smallint not null default 0,
  notes                text,                     -- internal-only — not customer-facing

  created_by_admin_id  uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Indexes ---------------------------------------------------------------
create index if not exists org_contacts_kind_active_idx
  on public.org_contacts(kind, is_active);
create index if not exists org_contacts_display_order_idx
  on public.org_contacts(kind, display_order);

-- updated_at auto-touch.
drop trigger if exists org_contacts_updated_at_trigger on public.org_contacts;
create trigger org_contacts_updated_at_trigger
  before update on public.org_contacts
  for each row execute function public.set_updated_at();

-- 2) RLS ---------------------------------------------------------------
alter table public.org_contacts enable row level security;

-- Public can read ACTIVE rows (no auth required — for landing footer +
-- contact-us page). Inactive rows hidden from public.
drop policy if exists org_contacts_public_read on public.org_contacts;
create policy org_contacts_public_read
  on public.org_contacts for select
  using (is_active = true);

-- Admin (super + accounting + sales_admin) full access — super for
-- ownership, accounting for invoice/receipt contact info, sales_admin
-- for sales-rep phone/LINE updates.
drop policy if exists org_contacts_admin_all on public.org_contacts;
create policy org_contacts_admin_all
  on public.org_contacts for all
  using      (public.is_admin(array['super','accounting','sales_admin']))
  with check (public.is_admin(array['super','accounting','sales_admin']));

-- 3) Comments ----------------------------------------------------------
comment on table  public.org_contacts is
  'V-G5 — owner-self-serve org contact info. Replaces hardcoded constants in components/seo/site.ts. V1 = backend management only; customer-side read integration deferred to V-G5.1.';
comment on column public.org_contacts.kind is
  'Contact type discriminator. domain | email | line_oa | phone | wechat | social | address.';
comment on column public.org_contacts.value is
  'The actual value (email address, URL, phone number, address line, etc.).';
comment on column public.org_contacts.department is
  'Optional grouping for emails (ขาย / บัญชี / HR) or phones (CS / sales / company main).';
comment on column public.org_contacts.is_active is
  'Inactive rows hidden from public read but kept for history. Toggle via admin UI without deleting.';
comment on column public.org_contacts.display_order is
  'Per-kind ordering (lower = first). Admin UI uses drag-to-reorder.';


-- ════════════════════════════════════════════════════════════
-- V-G4 · tos_versions + tos_acceptances (TOS version management)
-- ════════════════════════════════════════════════════════════
-- Per port-spec `admin-polish-bundle.md` §V-G4.
--
-- Today: TOS body is hardcoded in `lib/tos.ts::CURRENT_TOS_VERSION` +
-- some template fixture. Owner can't change the T&C wording or version
-- number without a code deploy.
--
-- V-G4 adds DB-backed version tracking. V1 = backend management surface
-- ONLY — admin can create versions + view acceptance counts. The
-- customer-side gate (`actions/tos.ts::acceptCurrentTos` + the layout
-- modal) keeps reading `CURRENT_TOS_VERSION` from code. V-G4.1
-- migrates the gate to read DB once the owner verifies the table
-- workflow on staging.
--
-- This migration introduces:
--   1. tos_versions table — versioned TOS bodies (admin-write-only)
--   2. tos_acceptances table — per-profile acceptance log (already
--      partially tracked via profiles.tos_accepted_version; this adds
--      per-version detail for audit + future "force re-accept" flow)
--   3. RLS — admin manage versions; public read active versions;
--      customer reads own acceptances
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) tos_versions ------------------------------------------------------
create table if not exists public.tos_versions (
  id                   uuid primary key default gen_random_uuid(),
  version_no           text unique not null,        -- "v2.0", "2026-05-16"
  title                text not null,
  body_md              text not null,                -- markdown source
  effective_from       date not null,
  is_active            boolean not null default false,
  -- Cargo-only or both (some customers use cargo without freight = different scope of TOS)
  applies_to           text not null default 'all'
                         check (applies_to in ('all','cargo_only','freight_only')),

  created_by_admin_id  uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists tos_versions_active_idx
  on public.tos_versions(is_active, effective_from desc) where is_active = true;

drop trigger if exists tos_versions_updated_at_trigger on public.tos_versions;
create trigger tos_versions_updated_at_trigger
  before update on public.tos_versions
  for each row execute function public.set_updated_at();

-- 2) tos_acceptances ---------------------------------------------------
-- One row per (profile, version) — captures the explicit accept click.
-- profiles.tos_accepted_version (existing) denormalises the LATEST
-- acceptance for fast-gate queries; this table is the audit trail.
create table if not exists public.tos_acceptances (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  tos_version_id  uuid not null references public.tos_versions(id) on delete restrict,
  accepted_at     timestamptz not null default now(),
  ip_address      inet,
  user_agent      text
);

create unique index if not exists tos_acceptances_profile_version_uidx
  on public.tos_acceptances(profile_id, tos_version_id);
create index if not exists tos_acceptances_version_idx
  on public.tos_acceptances(tos_version_id);
create index if not exists tos_acceptances_profile_idx
  on public.tos_acceptances(profile_id);

-- 3) RLS ---------------------------------------------------------------
alter table public.tos_versions    enable row level security;
alter table public.tos_acceptances enable row level security;

-- tos_versions: public reads ACTIVE versions only (for V-G4.1 customer
-- gate that will replace CURRENT_TOS_VERSION). Admin (super only) full.
drop policy if exists tos_versions_public_read on public.tos_versions;
create policy tos_versions_public_read
  on public.tos_versions for select
  using (is_active = true);

drop policy if exists tos_versions_admin_all on public.tos_versions;
create policy tos_versions_admin_all
  on public.tos_versions for all
  using      (public.is_admin(array['super']))
  with check (public.is_admin(array['super']));

-- tos_acceptances: customer reads own; admin (super + accounting) reads all.
drop policy if exists tos_acceptances_self_read on public.tos_acceptances;
create policy tos_acceptances_self_read
  on public.tos_acceptances for select
  using (profile_id = auth.uid());

drop policy if exists tos_acceptances_admin_read on public.tos_acceptances;
create policy tos_acceptances_admin_read
  on public.tos_acceptances for select
  using (public.is_admin(array['super','accounting']));

-- Customer can INSERT own acceptance (V-G4.1 customer-side gate);
-- admin INSERT also allowed (admin-initiated bulk-reset workflow).
drop policy if exists tos_acceptances_self_insert on public.tos_acceptances;
create policy tos_acceptances_self_insert
  on public.tos_acceptances for insert
  with check (profile_id = auth.uid());

drop policy if exists tos_acceptances_admin_insert on public.tos_acceptances;
create policy tos_acceptances_admin_insert
  on public.tos_acceptances for insert
  with check (public.is_admin(array['super','accounting']));

-- No UPDATE/DELETE — acceptances are append-only.

-- 4) Comments ----------------------------------------------------------
comment on table  public.tos_versions is
  'V-G4 — versioned TOS bodies. V1 = backend management only; customer-side gate still reads CURRENT_TOS_VERSION from lib/tos.ts until V-G4.1 wires the read.';
comment on column public.tos_versions.version_no is
  'Unique version label (e.g. "v2.0", "2026-05-16"). Customer-facing.';
comment on column public.tos_versions.is_active is
  'Only one version should be active per applies_to scope at a time (app-layer enforced). Inactive versions kept for audit + acceptance history.';
comment on column public.tos_versions.applies_to is
  'all | cargo_only | freight_only — V1 expected to use "all" for everyone; cargo/freight split is for future T&C divergence.';

comment on table  public.tos_acceptances is
  'V-G4 — per-acceptance log (audit + per-version count). profiles.tos_accepted_version is the denormalised "latest" for fast gate queries.';


-- ════════════════════════════════════════════════════════════
-- V-E6 · freight_quotes + freight_quote_items (quotation workflow)
-- ════════════════════════════════════════════════════════════
-- Per port-spec [docs/port-specs/freight-quotation.md].
--
-- Adds Pacred's first formal freight-quotation flow:
--   draft → pending_approval → approved → sent → accepted/rejected/expired
--
-- V1 RBAC (per ภูม brief 2026-05-17 + ลูกพี่/เดฟ ack):
--   - create / edit (draft only): super, ops, sales_admin, accounting
--   - submit for approval        : super, ops, sales_admin, accounting
--   - approve / reject           : SUPER ONLY (no separate `manager` role)
--   - send / mark_accepted / expire / convert : super, sales_admin, accounting
--
-- `convert_to_shipment` requires `freight_shipments` table — that ships
-- in V-E1 (migration 0049). V1 of V-E6 leaves `converted_to_shipment_id`
-- nullable; the convert action lives in code but returns error until
-- 0049 lands.
--
-- This migration introduces:
--   1. freight_quote_seq          — daily serial counter
--   2. freight_quotes             — quote header
--   3. freight_quote_items        — quote line items
--   4. next_freight_quote_no()    — atomic serial generator
--   5. RLS                        — customer reads own (sent+), admin full
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Daily serial counter ---------------------------------------------
create table if not exists public.freight_quote_seq (
  period_yymmdd text primary key,
  next_seq      int  not null default 1,
  updated_at    timestamptz not null default now()
);

-- 2) freight_quotes ----------------------------------------------------
create table if not exists public.freight_quotes (
  id                       uuid primary key default gen_random_uuid(),
  quote_no                 text unique,                                -- FQYYMMDD-NNNN

  status                   text not null default 'draft'
                             check (status in (
                               'draft', 'pending_approval', 'approved',
                               'sent', 'accepted', 'rejected', 'expired'
                             )),

  -- Customer pointer (NULL = cold quote to unregistered prospect)
  profile_id               uuid references public.profiles(id) on delete restrict,
  buyer_name_snapshot      text not null,
  buyer_tax_id_snapshot    text,                                      -- 13-digit, optional
  buyer_contact_snapshot   text,                                      -- multi-line name + tel + email

  -- Logistics terms
  transport_mode           text not null check (transport_mode in (
                             'sea_fcl', 'sea_lcl', 'truck', 'air'
                           )),
  port_loading             text,
  port_discharge           text,
  place_delivery           text,
  incoterm                 text check (incoterm in (
                             'EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP',
                             'FAS', 'FOB', 'CFR', 'CIF'
                           )),
  currency                 text not null default 'THB' check (currency in ('THB','USD')),

  -- Financial snapshot — frozen on approval (header total = Σ items)
  subtotal                 numeric(12,2) not null default 0,
  vat_pct                  numeric(4,2)  not null default 7.00 check (vat_pct >= 0 and vat_pct <= 30),
  vat_amount               numeric(12,2) not null default 0,
  total                    numeric(12,2) not null default 0,

  valid_until              date,
  notes                    text,

  -- Audit fields
  created_by_admin_id      uuid not null references public.profiles(id),
  approved_by_admin_id     uuid references public.profiles(id),
  approved_at              timestamptz,
  rejected_reason          text,
  rejected_by_admin_id     uuid references public.profiles(id),
  rejected_at              timestamptz,
  sent_at                  timestamptz,
  accepted_at              timestamptz,
  expired_at               timestamptz,

  -- V-E1 conversion (nullable until V-E1 freight_shipments table exists).
  -- UNIQUE prevents double-conversion. FK added in V-E1 follow-up migration.
  converted_to_shipment_id uuid,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint freight_quotes_rejected_has_reason check (
    status <> 'rejected' or (rejected_reason is not null and char_length(rejected_reason) >= 3)
  ),
  constraint freight_quotes_approved_consistent check (
    status not in ('approved','sent','accepted')
    or (approved_by_admin_id is not null and approved_at is not null)
  )
);

-- Indexes -------------------------------------------------------------
create index if not exists freight_quotes_status_created_idx
  on public.freight_quotes(status, created_at desc);
create index if not exists freight_quotes_profile_status_idx
  on public.freight_quotes(profile_id, status) where profile_id is not null;
create unique index if not exists freight_quotes_converted_uidx
  on public.freight_quotes(converted_to_shipment_id) where converted_to_shipment_id is not null;
create index if not exists freight_quotes_quote_no_idx
  on public.freight_quotes(quote_no) where quote_no is not null;

-- updated_at auto-touch.
drop trigger if exists freight_quotes_updated_at_trigger on public.freight_quotes;
create trigger freight_quotes_updated_at_trigger
  before update on public.freight_quotes
  for each row execute function public.set_updated_at();

-- 3) freight_quote_items ----------------------------------------------
create table if not exists public.freight_quote_items (
  id               uuid primary key default gen_random_uuid(),
  freight_quote_id uuid not null references public.freight_quotes(id) on delete cascade,
  position         smallint not null default 1,
  description      text not null,
  quantity         numeric(12,3) not null check (quantity > 0),
  unit             text not null default 'JOB' check (unit in (
                     'CBM', 'KGM', 'JOB', 'PCS', 'LO', 'CTN', 'PAL', 'TEU', 'FEU'
                   )),
  unit_price_thb   numeric(12,2) not null check (unit_price_thb >= 0 and unit_price_thb <= 999999.99),
  line_total_thb   numeric(12,2) not null,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists freight_quote_items_quote_pos_uidx
  on public.freight_quote_items(freight_quote_id, position);

drop trigger if exists freight_quote_items_updated_at_trigger on public.freight_quote_items;
create trigger freight_quote_items_updated_at_trigger
  before update on public.freight_quote_items
  for each row execute function public.set_updated_at();

-- 4) Atomic serial generator -------------------------------------------
-- FQYYMMDD-NNNN with daily reset (Bangkok TZ). Mirror next_qa_inspection_no.
create or replace function public.next_freight_quote_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yymmdd text := to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD');
  seq    int;
begin
  insert into public.freight_quote_seq (period_yymmdd, next_seq)
    values (yymmdd, 2)
    on conflict (period_yymmdd) do update
      set next_seq   = freight_quote_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'FQ' || yymmdd || '-' || lpad(seq::text, 4, '0');
end;
$$;

revoke all     on function public.next_freight_quote_no() from public, authenticated, anon;
grant  execute on function public.next_freight_quote_no() to service_role;

-- 5) RLS ---------------------------------------------------------------
alter table public.freight_quotes      enable row level security;
alter table public.freight_quote_items enable row level security;
alter table public.freight_quote_seq   enable row level security;

-- Customer reads own (only when status >= sent — drafts/pending hidden).
drop policy if exists freight_quotes_customer_read on public.freight_quotes;
create policy freight_quotes_customer_read
  on public.freight_quotes for select
  using (
    profile_id = auth.uid()
    and status in ('sent', 'accepted', 'rejected', 'expired')
  );

-- Admin (super + ops + sales_admin + accounting): full read.
drop policy if exists freight_quotes_admin_read on public.freight_quotes;
create policy freight_quotes_admin_read
  on public.freight_quotes for select
  using (public.is_admin(array['super','ops','sales_admin','accounting']));

-- Admin (same set): write — app-layer enforces per-status role split.
drop policy if exists freight_quotes_admin_write on public.freight_quotes;
create policy freight_quotes_admin_write
  on public.freight_quotes for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- Items: inherit visibility from parent quote.
drop policy if exists freight_quote_items_customer_read on public.freight_quote_items;
create policy freight_quote_items_customer_read
  on public.freight_quote_items for select
  using (
    exists (
      select 1 from public.freight_quotes q
       where q.id = freight_quote_items.freight_quote_id
         and q.profile_id = auth.uid()
         and q.status in ('sent', 'accepted', 'rejected', 'expired')
    )
  );

drop policy if exists freight_quote_items_admin_all on public.freight_quote_items;
create policy freight_quote_items_admin_all
  on public.freight_quote_items for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- Seq table admin-only (generator fn bypasses via security definer).
drop policy if exists freight_quote_seq_admin_all on public.freight_quote_seq;
create policy freight_quote_seq_admin_all
  on public.freight_quote_seq for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- 6) Comments ----------------------------------------------------------
comment on table  public.freight_quotes is
  'V-E6 — freight quotation workflow. Status: draft → pending_approval → approved → sent → accepted/rejected/expired. Convert-to-shipment is V-E1 dependency.';
comment on column public.freight_quotes.quote_no is
  'Format FQYYMMDD-NNNN. Reserved at insert time via next_freight_quote_no().';
comment on column public.freight_quotes.status is
  'draft (editable by creator) | pending_approval (locked, awaits super) | approved (locked, financial frozen) | sent (visible to customer) | accepted / rejected / expired (terminal).';
comment on column public.freight_quotes.converted_to_shipment_id is
  'V-E1 dependency — points to freight_shipments(id) after convert action runs. UNIQUE prevents double-conversion.';
comment on constraint freight_quotes_rejected_has_reason on public.freight_quotes is
  'rejected status MUST carry a reason ≥3 chars (audit completeness — ADR-0014 pattern).';
comment on constraint freight_quotes_approved_consistent on public.freight_quotes is
  'approved/sent/accepted status MUST have approver + timestamp populated.';

comment on table  public.freight_quote_items is
  'Per-line quote items. Editable only when parent status=draft.';

comment on function public.next_freight_quote_no is
  'Atomic FQYYMMDD-NNNN serial generator with daily counter reset (Bangkok TZ). Concurrent calls serialise on upsert lock.';


-- 0060_member_code_3digit.sql
-- Member code pattern change: PR00001 (5-digit fixed) → PR001 (min-3-digit).
--
-- Numbered 0060 — clear of ภูม's fast-moving Phase-I2 migration block
-- (0044-005x). This migration is independent (only the generate_member_code
-- function + a profiles backfill), so apply-order does not matter; the gap
-- between 0048 and 0060 is harmless (migrations apply in sorted version order).
--
-- Per ลูกพี่ 2026-05-17: รหัสลูกค้าต้องเป็นแพทเทิน PR001 — ขั้นต่ำ 3 หลัก,
-- รันต่อไปเรื่อย ๆ ได้, เกินหลักร้อย (PR1000, PR12345) ก็รันได้ปกติ ห้ามเออเร่อ.
--
-- `lpad(n, 3, '0')` pads to a MINIMUM of 3 chars and NEVER truncates — so:
--   n=1     → '001'   → PR001
--   n=42    → '042'   → PR042
--   n=999   → '999'   → PR999
--   n=1000  → '1000'  → PR1000   (already ≥3 chars, lpad leaves it alone)
--   n=12345 → '12345' → PR12345
-- The running counter (member_code_seq) is unbounded — no overflow, no error.
--
-- Idempotent: re-running `create or replace` + the backfill is safe.

-- 1) Generator function — lpad 5 → 3 -----------------------------------------
create or replace function public.generate_member_code() returns trigger as $$
begin
  if new.member_code is null then
    new.member_code := 'PR' || lpad(nextval('public.member_code_seq')::text, 3, '0');
  end if;
  return new;
end;
$$ language plpgsql;

-- 2) Backfill existing rows to the new padding --------------------------------
-- The running NUMBER is preserved; only the zero-padding changes.
--   PR00001 → PR001 · PR00042 → PR042 · PR01000 → PR1000
-- `substring(member_code from 3)` drops the 'PR' prefix; `::int` strips the
-- leading zeros (so '00001' → 1); re-`lpad`-ed to the new 3-min pattern.
-- The `~ '^PR\d+$'` guard skips any non-standard codes. member_code is
-- `unique` but the underlying numbers stay unique, so no collision.
-- (member_code is not referenced as a foreign key anywhere — verified — so
--  rewriting it does not orphan any row.)
update public.profiles
set member_code = 'PR' || lpad((substring(member_code from 3))::int::text, 3, '0')
where member_code ~ '^PR\d+$';

-- 3) member_code_seq is untouched — `nextval` continues from its current
--    value, so the next signup picks up right after the existing rows.


-- ════════════════════════════════════════════════════════════
-- VERIFY — run after the migrations above (3 result sets)
-- ════════════════════════════════════════════════════════════
-- (1) Expected: 9 rows — the new tables.
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name in (
     'withholding_tax_entries',
     'freight_qa_inspections', 'qa_inspection_seq',
     'org_contacts',
     'tos_versions', 'tos_acceptances',
     'freight_quotes', 'freight_quote_items', 'freight_quote_seq'
   )
 order by table_name;

-- (2) Expected: 2 rows — the new Storage buckets.
select id from storage.buckets
 where id in ('wht-certs', 'qa-inspection-photos')
 order by id;

-- (3) Expected: 1 row, pads_to_3 = true — the member_code generator now
--     zero-pads to a MINIMUM of 3 digits (PR001), not a fixed 5 (PR00001).
select proname,
       pg_get_functiondef(oid) like '%lpad%3%' as pads_to_3
  from pg_proc
 where proname = 'generate_member_code';
