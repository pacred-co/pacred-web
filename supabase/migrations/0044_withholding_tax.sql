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
