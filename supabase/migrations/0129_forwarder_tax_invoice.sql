-- ════════════════════════════════════════════════════════════════
-- 0129 — Live-lane (tb_forwarder) tax invoice + per-class WHT store.
-- เดฟ-agent · 2026-05-30 · P2 of the tax-billing-flow rebuild.
-- ════════════════════════════════════════════════════════════════
-- WHY A NEW TABLE (not the World-A tax_invoices / withholding_tax_entries):
--   The existing World-A tables (migration 0034 + 0044) are PROFILES-based:
--     - tax_invoices.profile_id          → profiles(id)   NOT NULL
--     - tax_invoices.forwarder_f_no      → forwarders(f_no)  (the REBUILT,
--       near-empty table — NOT the live tb_forwarder)
--     - withholding_tax_entries enforces ONE row per parent order
--       (wht_one_per_forwarder_uidx) with a single wht_rate_pct in
--       {1,1.5,2,3,5}.
--   The LIVE lane keys off tb_forwarder.id (bigint) + tb_users.userID (text);
--   most legacy customers have NO profiles row. AND the owner's per-line WHT
--   model (transport 1% + service 3% + rental 5% + goods 0% co-existing on
--   ONE order) cannot fit the single-rate-per-order World-A row.
--   → Forcing tb_* data through the World-A FKs would break (FK violations,
--     unique-index violations, lost per-class detail). So this is a thin,
--     dedicated, tb_*-native store. The tax MATH is shared (lib/tax/wht.ts).
--   See docs/research/tax-billing-flow-design-2026-05-30.md §4 + the agent
--   report for the full rationale + the flag.
--
-- WHEN ROWS ARE CREATED: at forwarder payment-land, when the order's
--   tb_forwarder.tax_doc_pref='tax_invoice' (column from migration 0127).
--   The auto-receipt hook (lib/admin/auto-issue-receipt.ts) computes the
--   per-line tax via computeForwarderTax(getTaxRates()) and inserts here.
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════════

-- ── 1) Tax-invoice header (one per issued ใบกำกับภาษี on the live lane) ──
create table if not exists public.tb_forwarder_tax_invoice (
  id              bigserial primary key,
  -- The minted RD-running number (mirrors tax_invoices.serial_no convention;
  -- the live lane reuses the FRC/FRG receipt minter family OR INV-YYYYMM — the
  -- app layer decides + writes it here). Unique when present.
  serial_no       text,
  -- Source pointers — tb_*-native (NOT profiles/forwarders).
  userid          text   not null references public.tb_users("userID") on delete restrict,
  -- The receipt this tax-invoice was issued alongside (auto-receipt path).
  receipt_id      bigint references public.tb_receipt(id) on delete set null,
  rid             text,                       -- tb_receipt.rid mirror (for joins/printing)

  -- Buyer snapshot at issuance (RD Code 86 — immutable; do NOT re-join).
  buyer_name      text not null default '',
  buyer_tax_id    text not null default '',
  buyer_address   text not null default '',
  buyer_branch    text not null default 'สำนักงานใหญ่',
  is_juristic     boolean not null default false,

  -- Financial snapshot (computed by lib/tax/wht.ts computeForwarderTax).
  -- All baht, 2-dp satang.
  base_transport      numeric(14,2) not null default 0,  -- transport (domestic + intl)
  base_transport_intl numeric(14,2) not null default 0,  -- the VAT-0% (zero-rated) leg
  base_service        numeric(14,2) not null default 0,
  base_rental         numeric(14,2) not null default 0,
  base_goods          numeric(14,2) not null default 0,
  base_total          numeric(14,2) not null default 0,  -- post-discount, pre-VAT
  vatable_base        numeric(14,2) not null default 0,  -- base_total − intl leg
  vat_amount          numeric(14,2) not null default 0,  -- VAT 7% on vatable_base
  wht_total           numeric(14,2) not null default 0,  -- Σ per-class WHT
  gross_before_wht    numeric(14,2) not null default 0,  -- base_total + vat
  net_payable         numeric(14,2) not null default 0,  -- gross − wht
  vat_pct             numeric(5,2)  not null default 7,

  -- Issuance state
  status          text not null default 'issued' check (status in ('issued','cancelled')),
  issued_at       timestamptz not null default now(),
  issued_by       text not null default 'system-auto',   -- adminID or 'system-auto'
  cancelled_at    timestamptz,
  cancelled_by    text,
  cancel_reason   text,

  pdf_storage_path text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists tb_forwarder_tax_invoice_serial_uidx
  on public.tb_forwarder_tax_invoice (serial_no) where serial_no is not null;
create index if not exists tb_forwarder_tax_invoice_userid_idx
  on public.tb_forwarder_tax_invoice (userid);
create index if not exists tb_forwarder_tax_invoice_receipt_idx
  on public.tb_forwarder_tax_invoice (receipt_id) where receipt_id is not null;
create index if not exists tb_forwarder_tax_invoice_rid_idx
  on public.tb_forwarder_tax_invoice (rid) where rid is not null;

-- ── 2) Line items — one per tb_forwarder row covered by this invoice ──
create table if not exists public.tb_forwarder_tax_invoice_item (
  id              bigserial primary key,
  invoice_id      bigint not null references public.tb_forwarder_tax_invoice(id) on delete cascade,
  fid             bigint not null references public.tb_forwarder(id) on delete restrict,
  -- the per-forwarder buckets snapshot (for line rendering / audit)
  ftotalprice           numeric(14,2) not null default 0,  -- transport (China→TH)
  ftransportprice       numeric(14,2) not null default 0,  -- TH-domestic
  ftransportpricechnthb numeric(14,2) not null default 0,  -- intl leg (VAT 0%)
  fshippingservice      numeric(14,2) not null default 0,
  pricecrate            numeric(14,2) not null default 0,
  priceother            numeric(14,2) not null default 0,
  fpriceupdate          numeric(14,2) not null default 0,
  fdiscount             numeric(14,2) not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists tb_forwarder_tax_invoice_item_invoice_idx
  on public.tb_forwarder_tax_invoice_item (invoice_id);
create index if not exists tb_forwarder_tax_invoice_item_fid_idx
  on public.tb_forwarder_tax_invoice_item (fid);
-- One invoice line per forwarder row (a forwarder is on ≤1 tax invoice).
create unique index if not exists tb_forwarder_tax_invoice_item_fid_uidx
  on public.tb_forwarder_tax_invoice_item (fid);

-- ── 3) Per-CLASS WHT entries — transport 1% · service 3% · rental 5% · goods 0% ──
-- (The World-A withholding_tax_entries can only hold ONE rate per order; the
--  owner's model needs one row PER class. That is the whole reason for this
--  table.) cert tracking mirrors withholding_tax_entries semantics.
create table if not exists public.tb_forwarder_wht_entry (
  id              bigserial primary key,
  invoice_id      bigint references public.tb_forwarder_tax_invoice(id) on delete cascade,
  userid          text not null references public.tb_users("userID") on delete restrict,

  wht_class       text not null check (wht_class in ('transport','service','rental','goods')),
  wht_base_thb    numeric(14,2) not null default 0,   -- pre-VAT base for this class
  wht_rate_pct    numeric(6,3)  not null default 0,    -- e.g. 1.000 / 3.000 / 5.000 / 0.000
  wht_amount_thb  numeric(14,2) not null default 0,    -- round(base × rate/100, 2)

  -- 50-ทวิ certificate tracking (Pacred RECEIVES from juristic customers).
  cert_status     text not null default 'pending' check (cert_status in ('pending','received','waived')),
  cert_number     text,
  cert_storage_path text,
  cert_received_at  timestamptz,
  waived_reason   text,
  waived_by       text,
  waived_at       timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists tb_forwarder_wht_entry_invoice_idx
  on public.tb_forwarder_wht_entry (invoice_id) where invoice_id is not null;
create index if not exists tb_forwarder_wht_entry_userid_idx
  on public.tb_forwarder_wht_entry (userid);
create index if not exists tb_forwarder_wht_entry_pending_idx
  on public.tb_forwarder_wht_entry (userid) where cert_status = 'pending';
-- One WHT row per (invoice, class) — no double counting.
create unique index if not exists tb_forwarder_wht_entry_invoice_class_uidx
  on public.tb_forwarder_wht_entry (invoice_id, wht_class) where invoice_id is not null;

-- ── 4) updated_at auto-touch (reuse the shared trigger fn if present) ──
do $$ begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists tb_forwarder_tax_invoice_updated_at on public.tb_forwarder_tax_invoice;
    create trigger tb_forwarder_tax_invoice_updated_at
      before update on public.tb_forwarder_tax_invoice
      for each row execute function public.set_updated_at();
    drop trigger if exists tb_forwarder_wht_entry_updated_at on public.tb_forwarder_wht_entry;
    create trigger tb_forwarder_wht_entry_updated_at
      before update on public.tb_forwarder_wht_entry
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- ── 5) RLS — service_role only (these are tb_* legacy tables; all access is
--        via the admin client in server actions, like the rest of tb_*). ──
alter table public.tb_forwarder_tax_invoice      enable row level security;
alter table public.tb_forwarder_tax_invoice_item enable row level security;
alter table public.tb_forwarder_wht_entry        enable row level security;
-- No policies → default-deny for anon/authenticated; service_role bypasses RLS.

-- ── 6) Comments ──
comment on table public.tb_forwarder_tax_invoice is
  'ใบกำกับภาษี (RD Code 86) for the LIVE tb_forwarder lane. tb_*-native (userid/receipt_id FKs) because the World-A tax_invoices is profiles-based and cannot accept a tb_forwarder source. Tax math = lib/tax/wht.ts computeForwarderTax. Issued at payment-land when tb_forwarder.tax_doc_pref=tax_invoice.';
comment on table public.tb_forwarder_wht_entry is
  'Per-CLASS withholding-tax rows (transport 1% · service 3% · rental 5% · goods 0%) — one row per class, which the single-rate-per-order World-A withholding_tax_entries cannot represent. Tracks the 50-ทวิ cert Pacred receives from juristic customers.';
