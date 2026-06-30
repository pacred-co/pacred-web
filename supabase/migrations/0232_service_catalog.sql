-- ════════════════════════════════════════════════════════════
-- 0232 · service_catalog — make Pacred's services first-class in the DB
-- Owner 2026-06-30 ("เอาทุกบริการของเราเข้า DB · 7-8 บริการ · แยก FCL/LCL ×
--   รถ/เรือ/แอร์ × คาร์โก้/เฟรท"): today a row's SERVICE is inferred from WHICH
--   table it lives in — no catalog table, no service_key column. This adds:
--     (a) a small reference table `service_catalog` (the 8 live lanes + 5
--         marketing "soon" lanes) — drives dashboards + role/workspace pivots +
--         the public grid.
--     (b) nullable `service_key` (+ `fcl_lcl` / `direction` where applicable)
--         columns on the 4 live order tables so an order can self-tag.
--
-- ⚠️ REFERENCE / CATEGORIZATION ONLY (AGENTS.md §0e). service_key is a LABEL —
--    it never feeds selling price / cost / a declaration's persisted duty.
--    NO money column is touched. NO FK to service_catalog (kept loose; validated
--    in lib/services/service-catalog.ts) so a future key edit can't break inserts.
--
-- ADDITIVE + IDEMPOTENT: create table/columns IF NOT EXISTS · seed via
--   ON CONFLICT (service_key) DO UPDATE (re-runnable, fills/refreshes). Safe to
--   re-run. DO NOT apply here — the integrator applies to prod+dev.
--
-- Helpers: is_admin(text[]) = mig 0015 · set_updated_at() = mig 0002.
-- The seed mirrors lib/services/service-catalog.ts SERVICE_CATALOG 1:1.
-- ════════════════════════════════════════════════════════════

-- ── (a) the catalog table ───────────────────────────────────────────
create table if not exists public.service_catalog (
  service_key                text primary key,
  name_th                    text not null,
  name_en                    text,
  service_group              text not null
                               check (service_group in ('cargo','freight','service')),
  -- which transport modes this service CAN use (subset of รถ/เรือ/แอร์); '{}' = n/a
  transport_modes            text[] not null default '{}'::text[]
                               check (transport_modes <@ array['truck','sea','air']),
  supports_fcl               boolean not null default false,
  supports_lcl               boolean not null default false,
  -- distinguishes freight_import vs freight_export
  direction                  text not null default 'import'
                               check (direction in ('import','export','both','none')),
  -- can this lane produce a ใบกำกับภาษี?
  issues_tax_invoice_default boolean not null default false,
  -- default money account (lib/payment/bank-accounts.ts key) when no ใบกำกับ
  default_account            text not null default 'service'
                               check (default_account in ('service','logistics','trading')),
  is_live                    boolean not null default true,   -- false = marketing-only / coming soon
  sort                       int not null default 100,
  active                     boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create index if not exists service_catalog_group_idx on public.service_catalog(service_group);
create index if not exists service_catalog_sort_idx  on public.service_catalog(sort);

drop trigger if exists service_catalog_updated_at_trigger on public.service_catalog;
create trigger service_catalog_updated_at_trigger
  before update on public.service_catalog
  for each row execute function public.set_updated_at();

alter table public.service_catalog enable row level security;

-- Admin read; service_role (used by actions/scripts) bypasses RLS for writes.
drop policy if exists service_catalog_admin_read on public.service_catalog;
create policy service_catalog_admin_read
  on public.service_catalog for select
  using (public.is_admin(array['ultra','super','manager','accounting','sales','sales_admin','ops','pricing','warehouse','freight_import_doc','freight_clearance_both']));

comment on table public.service_catalog is
  '0232 — first-class service identity (the 8 live lanes + 5 soon lanes). Reference only (§0e): drives dashboards / role pivots / public grid. Mirrors lib/services/service-catalog.ts.';

-- ── (a.1) seed the 13 lanes (8 live + 5 soon) — mirrors SERVICE_CATALOG ──
insert into public.service_catalog
  (service_key, name_th, name_en, service_group, transport_modes, supports_fcl, supports_lcl,
   direction, issues_tax_invoice_default, default_account, is_live, sort, active)
values
  ('shop_order',         'ฝากสั่งซื้อสินค้า',                        'China shopping cart',                       'cargo',   array['truck','sea','air'], false, true,  'import', true,  'service',   true,  10,  true),
  ('yuan_transfer',      'ฝากโอนชำระ / โอนหยวน',                     'Yuan / Alipay transfer',                    'cargo',   array[]::text[],            false, false, 'none',   true,  'service',   true,  20,  true),
  ('import_cargo',       'ฝากนำเข้า — คาร์โก้',                       'China→TH cargo (LCL consolidated)',         'cargo',   array['truck','sea','air'], false, true,  'import', true,  'service',   true,  30,  true),
  ('freight_import',     'ฝากนำเข้า — เฟรท FCL/LCL',                  'International freight import (FCL/LCL)',     'freight', array['truck','sea','air'], true,  true,  'import', true,  'service',   true,  40,  true),
  ('freight_export',     'ส่งออกสินค้า',                             'Export worldwide (FCL/LCL)',                'freight', array['truck','sea','air'], true,  true,  'export', true,  'service',   true,  50,  true),
  ('customs_clearance',  'เคลียร์สินค้าติดด่าน / ตัวแทนออกของ',       'Customs clearance',                         'service', array['truck','sea','air'], false, false, 'both',   true,  'service',   true,  60,  true),
  ('tax_documents',      'ใบกำกับ / ใบขนสินค้า',                      'Tax-invoice + customs declaration issuing', 'service', array[]::text[],            false, false, 'none',   true,  'trading',   true,  70,  true),
  ('domestic_logistics', 'ขนส่งในไทย + แมสเซ็นเจอร์',                 'Domestic logistics',                        'service', array['truck'],             false, false, 'none',   false, 'logistics', true,  80,  true),
  -- marketing-only "soon" lanes (active=false · no order surface)
  ('tax_refund',         'ขอคืนภาษี',                                'Tax refund',                                'service', array[]::text[],            false, false, 'none',   false, 'service',   false, 90,  false),
  ('fumigation',         'บริการฟูมิเกชัน',                          'Fumigation',                                'service', array[]::text[],            false, false, 'none',   true,  'service',   false, 100, false),
  ('consignment',        'บริการฝากขายสินค้า',                       'Consignment',                               'cargo',   array[]::text[],            false, false, 'none',   false, 'service',   false, 110, false),
  ('bill_payment',       'บริการฝากจ่ายบริการ',                      'Pay-on-behalf services',                    'service', array[]::text[],            false, false, 'none',   false, 'service',   false, 120, false),
  ('broker_matching',    'จับคู่ลงทะเบียนกรมศุล / ตัวแทนออกของ',      'Customs broker matching',                   'service', array[]::text[],            false, false, 'none',   false, 'service',   false, 130, false)
on conflict (service_key) do update set
  name_th                    = excluded.name_th,
  name_en                    = excluded.name_en,
  service_group              = excluded.service_group,
  transport_modes            = excluded.transport_modes,
  supports_fcl               = excluded.supports_fcl,
  supports_lcl               = excluded.supports_lcl,
  direction                  = excluded.direction,
  issues_tax_invoice_default = excluded.issues_tax_invoice_default,
  default_account            = excluded.default_account,
  is_live                    = excluded.is_live,
  sort                       = excluded.sort,
  active                     = excluded.active,
  updated_at                 = now();

-- ── (b) tag columns on the 4 live order tables (additive · nullable) ──
-- service_key on every order table; fcl_lcl on the lanes where FCL/LCL is a real
-- choice (cargo defaults LCL today / freight chooses); direction on the freight
-- stack (the only place import vs export is otherwise ambiguous).

-- shop_order
alter table public.tb_header_order add column if not exists service_key text;

-- import_cargo (cargo has no explicit FCL/LCL today → add the column so it can be set)
alter table public.tb_forwarder    add column if not exists service_key text;
alter table public.tb_forwarder    add column if not exists fcl_lcl     text;

-- yuan_transfer
alter table public.tb_payment      add column if not exists service_key text;

-- freight_import / freight_export — direction disambiguates the shared rows
alter table public.freight_shipments add column if not exists service_key text;
alter table public.freight_shipments add column if not exists direction   text;

-- indexes for "all orders of service X" (partial — only tagged rows)
create index if not exists tb_header_order_service_key_idx   on public.tb_header_order(service_key)   where service_key is not null;
create index if not exists tb_forwarder_service_key_idx      on public.tb_forwarder(service_key)      where service_key is not null;
create index if not exists tb_payment_service_key_idx        on public.tb_payment(service_key)        where service_key is not null;
create index if not exists freight_shipments_service_key_idx on public.freight_shipments(service_key) where service_key is not null;

comment on column public.tb_header_order.service_key   is '0232 — service identity (=shop_order). Reference/categorization only (§0e).';
comment on column public.tb_forwarder.service_key      is '0232 — service identity (=import_cargo). Reference/categorization only (§0e).';
comment on column public.tb_forwarder.fcl_lcl          is '0232 — chosen FCL/LCL (cargo defaults LCL). Reference only (§0e).';
comment on column public.tb_payment.service_key        is '0232 — service identity (=yuan_transfer). Reference/categorization only (§0e).';
comment on column public.freight_shipments.service_key is '0232 — service identity (freight_import / freight_export). Reference only (§0e).';
comment on column public.freight_shipments.direction   is '0232 — import|export — disambiguates freight_import vs freight_export. Reference only (§0e).';
