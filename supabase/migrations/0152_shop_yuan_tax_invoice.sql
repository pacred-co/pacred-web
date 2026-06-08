-- ════════════════════════════════════════════════════════════════
-- 0152 — Live-lane tax-invoice store for ฝากสั่งซื้อ (tb_header_order)
--        + ฝากโอน (tb_payment), mirroring 0129 (the forwarder store).
-- เดฟ-agent · 2026-06-08 · MONEY/TAX-CRITICAL · ships DORMANT.
-- ════════════════════════════════════════════════════════════════
-- WHY A NEW STORE (the SAME rationale as migration 0129 · read that first):
--   The World-A `tax_invoices` (0034) is PROFILES-based (profile_id NOT NULL
--   → profiles(id); most legacy customers have NO profiles row) and is built
--   around a forwarders(f_no) FK. The LIVE lanes key off tb_users.userID (text)
--   + tb_header_order.hno (text) / tb_payment.id (bigint). Forcing tb_* data
--   through the World-A FKs breaks. 0129 solved this for forwarder; this file
--   does the SAME for shop + yuan with ONE shared store discriminated by
--   `service_type` ('shop' | 'yuan').
--
--   ── ONE table, two service types (vs 0153) ──
--   Reserved migration 0153 was left open for a separate yuan store, but shop
--   and yuan share an IDENTICAL header shape (buyer snapshot + VAT-7% financial
--   snapshot computed by lib/tax/tax-doc-mode.ts) — only the SOURCE-ORDER key
--   differs (shop = hno text · yuan = payment id). So we use ONE header table
--   with a `service_type` discriminator + a nullable `hno` (shop) / `payment_id`
--   (yuan) source pointer. This avoids a near-duplicate schema. 0153 is NOT
--   used — documented in the agent report.
--
-- WHEN ROWS ARE CREATED: at shop payment-land / yuan-approve, GATED behind the
--   business_config flag `tax_invoice.shop_yuan_enabled` (= {"enabled": false}
--   by default → issuance is SKIPPED entirely until the owner flips it). The
--   customer-request path (actions/tax-invoices.ts) is gated by the same flag.
--
-- Idempotent. RLS service-role-only (tb_* convention — admin client in actions).
-- ════════════════════════════════════════════════════════════════

-- ── 1) Tax-invoice header (shop + yuan · one per issued ใบกำกับ/ใบขน) ──
create table if not exists public.tb_shop_tax_invoice (
  id              bigserial primary key,

  -- Which live lane this invoice belongs to.
  service_type    text not null default 'shop'
                    check (service_type in ('shop', 'yuan')),

  -- The minted RD-running serial (TIV{yyMM}-{NNNNN}). Unique when present.
  serial_no       text,

  -- Source pointers — tb_*-native (NOT profiles/forwarders). Exactly ONE of
  -- (hno · payment_id) is set, matching service_type.
  userid          text   not null references public.tb_users("userID") on delete restrict,
  hno             text,                          -- tb_header_order.hno (shop)
  payment_id      bigint references public.tb_payment(id) on delete set null,  -- tb_payment.id (yuan)
  receipt_id      bigint references public.tb_receipt(id) on delete set null,  -- the receipt issued alongside (if any)
  rid             text,                          -- tb_receipt.rid mirror

  -- The document mode that drove the VAT base (lib/tax/tax-doc-mode.ts).
  --   'tax_invoice' (ใบกำกับ · VAT on goods) · 'customs' (ใบขน · VAT on service fee).
  doc_mode        text not null default 'tax_invoice'
                    check (doc_mode in ('tax_invoice', 'customs')),

  -- Buyer snapshot at issuance (RD Code 86 — immutable; do NOT re-join).
  buyer_name      text not null default '',
  buyer_tax_id    text not null default '',
  buyer_address   text not null default '',
  buyer_branch    text not null default 'สำนักงานใหญ่',
  is_juristic     boolean not null default false,

  -- Financial snapshot (computed by lib/tax/tax-doc-mode.ts computeTaxForMode).
  -- All baht, 2-dp satang.
  base_transport      numeric(14,2) not null default 0,
  base_transport_intl numeric(14,2) not null default 0,
  base_service        numeric(14,2) not null default 0,
  base_rental         numeric(14,2) not null default 0,
  base_goods          numeric(14,2) not null default 0,
  base_total          numeric(14,2) not null default 0,  -- post-discount, pre-VAT
  vatable_base        numeric(14,2) not null default 0,  -- the VAT-7% base for the mode
  vat_amount          numeric(14,2) not null default 0,  -- VAT 7% on vatable_base
  wht_total           numeric(14,2) not null default 0,  -- Σ per-class WHT
  gross_before_wht    numeric(14,2) not null default 0,  -- base_total + vat
  net_payable         numeric(14,2) not null default 0,  -- gross − wht
  vat_pct             numeric(5,2)  not null default 7,

  -- Issuance state
  status          text not null default 'issued' check (status in ('issued','cancelled')),
  issued_at       timestamptz not null default now(),
  issued_by       text not null default 'system-auto',   -- adminID / 'system-auto' / 'customer-request'
  cancelled_at    timestamptz,
  cancelled_by    text,
  cancel_reason   text,

  pdf_storage_path text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists tb_shop_tax_invoice_serial_uidx
  on public.tb_shop_tax_invoice (serial_no) where serial_no is not null;
create index if not exists tb_shop_tax_invoice_userid_idx
  on public.tb_shop_tax_invoice (userid);
-- One invoice per shop order (hno) — idempotency anchor for the shop lane.
create unique index if not exists tb_shop_tax_invoice_hno_uidx
  on public.tb_shop_tax_invoice (hno) where hno is not null;
-- One invoice per yuan payment (payment_id) — idempotency anchor for yuan.
create unique index if not exists tb_shop_tax_invoice_payment_uidx
  on public.tb_shop_tax_invoice (payment_id) where payment_id is not null;
create index if not exists tb_shop_tax_invoice_receipt_idx
  on public.tb_shop_tax_invoice (receipt_id) where receipt_id is not null;
create index if not exists tb_shop_tax_invoice_service_type_idx
  on public.tb_shop_tax_invoice (service_type);

-- ── 2) Line items — snapshot of the source-order money buckets (audit/render) ──
-- One row per source order (shop = 1 row keyed by hno · yuan = 1 row keyed by
-- payment_id). We keep it as a child table to mirror 0129's shape (header +
-- item) so the printable invoice + reconciliation read the same way for all 3
-- lanes (forwarder/shop/yuan).
create table if not exists public.tb_shop_tax_invoice_item (
  id              bigserial primary key,
  invoice_id      bigint not null references public.tb_shop_tax_invoice(id) on delete cascade,

  -- Source-order pointer (one of these is set per service_type).
  hno             text,                          -- tb_header_order.hno (shop)
  payment_id      bigint,                        -- tb_payment.id (yuan)

  -- The per-order money buckets snapshot (THB · for line rendering / audit).
  goods_thb       numeric(14,2) not null default 0,  -- ค่าสินค้า (shop htotalpricechn · yuan paythb)
  service_thb     numeric(14,2) not null default 0,  -- ค่าบริการ Pacred
  transport_thb   numeric(14,2) not null default 0,  -- ค่าขนส่งในไทย (domestic)
  transport_intl_thb numeric(14,2) not null default 0, -- ค่าขนส่งในจีน (intl · zero-rated)
  discount_thb    numeric(14,2) not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists tb_shop_tax_invoice_item_invoice_idx
  on public.tb_shop_tax_invoice_item (invoice_id);
create unique index if not exists tb_shop_tax_invoice_item_hno_uidx
  on public.tb_shop_tax_invoice_item (hno) where hno is not null;
create unique index if not exists tb_shop_tax_invoice_item_payment_uidx
  on public.tb_shop_tax_invoice_item (payment_id) where payment_id is not null;

-- ── 3) Per-CLASS WHT entries (transport 1% · service 3% · rental 5% · goods 0%) ──
-- Mirrors tb_forwarder_wht_entry (0129) — one row per class, which the
-- single-rate-per-order World-A withholding_tax_entries cannot represent.
create table if not exists public.tb_shop_wht_entry (
  id              bigserial primary key,
  invoice_id      bigint references public.tb_shop_tax_invoice(id) on delete cascade,
  userid          text not null references public.tb_users("userID") on delete restrict,

  wht_class       text not null check (wht_class in ('transport','service','rental','goods')),
  wht_base_thb    numeric(14,2) not null default 0,
  wht_rate_pct    numeric(6,3)  not null default 0,
  wht_amount_thb  numeric(14,2) not null default 0,

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

create index if not exists tb_shop_wht_entry_invoice_idx
  on public.tb_shop_wht_entry (invoice_id) where invoice_id is not null;
create index if not exists tb_shop_wht_entry_userid_idx
  on public.tb_shop_wht_entry (userid);
create index if not exists tb_shop_wht_entry_pending_idx
  on public.tb_shop_wht_entry (userid) where cert_status = 'pending';
create unique index if not exists tb_shop_wht_entry_invoice_class_uidx
  on public.tb_shop_wht_entry (invoice_id, wht_class) where invoice_id is not null;

-- ── 4) updated_at auto-touch (reuse the shared trigger fn if present) ──
do $$ begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists tb_shop_tax_invoice_updated_at on public.tb_shop_tax_invoice;
    create trigger tb_shop_tax_invoice_updated_at
      before update on public.tb_shop_tax_invoice
      for each row execute function public.set_updated_at();
    drop trigger if exists tb_shop_wht_entry_updated_at on public.tb_shop_wht_entry;
    create trigger tb_shop_wht_entry_updated_at
      before update on public.tb_shop_wht_entry
      for each row execute function public.set_updated_at();
  end if;
end $$;

-- ── 5) RLS — service_role only (tb_* convention · admin client in actions) ──
alter table public.tb_shop_tax_invoice      enable row level security;
alter table public.tb_shop_tax_invoice_item enable row level security;
alter table public.tb_shop_wht_entry        enable row level security;
-- No policies → default-deny for anon/authenticated; service_role bypasses RLS.

-- ── 6) LIVE-GATE — seed the default-OFF feature flag. ──
-- This flag gates ALL shop/yuan tax-invoice issuance + the customer surfaces.
-- DEFAULT {"enabled": false} → deploying this migration changes NOTHING in
-- production until the owner flips it (after a TEST-order money-loop browser
-- test + accounting sign-off on the ใบขน VAT base · see the agent report).
-- ON CONFLICT preserves any later admin edit (the flag is toggled live).
insert into public.business_config (key, value, value_type, category, description)
values (
  'tax_invoice.shop_yuan_enabled',
  '{"enabled": false}'::jsonb,
  'json',
  'tax',
  'LIVE-GATE สำหรับการออกใบกำกับภาษี/ใบขน ของ ฝากสั่งซื้อ (tb_header_order) + ฝากโอน (tb_payment). default {"enabled": false} = ปิด (ปลอดภัย · deploy ได้ไม่กระทบ prod). เปิดเมื่อ (1) ทดสอบ money-loop บน TEST order ครบ + (2) บัญชี sign-off ฐาน VAT ใบขน (lib/tax/tax-doc-mode.ts L187).'
)
on conflict (key) do nothing;

-- ── 7) Comments ──
comment on table public.tb_shop_tax_invoice is
  'ใบกำกับภาษี/ใบขน (RD Code 86) for the LIVE ฝากสั่งซื้อ (tb_header_order) + ฝากโอน (tb_payment) lanes. service_type discriminates shop vs yuan. tb_*-native (userid/hno/payment_id FKs) — the World-A tax_invoices is profiles-based + cannot accept a tb_* source. Tax math = lib/tax/tax-doc-mode.ts computeTaxForMode. Issued at payment-land/yuan-approve GATED behind business_config tax_invoice.shop_yuan_enabled (default OFF).';
comment on column public.tb_shop_tax_invoice.service_type is
  'shop = ฝากสั่งซื้อ (source = tb_header_order.hno) · yuan = ฝากโอน (source = tb_payment.id).';
comment on table public.tb_shop_wht_entry is
  'Per-CLASS withholding-tax rows for the shop/yuan lanes (mirrors tb_forwarder_wht_entry). One row per class.';
