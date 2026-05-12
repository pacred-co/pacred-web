-- ════════════════════════════════════════════════════════════
-- Phase D1 — Rates + customer groups + settings singleton
-- ════════════════════════════════════════════════════════════
-- Legacy collapse strategy:
--
-- tb_co                → customer_groups (lookup table)
-- tb_settings (90+ cols!) → settings (singleton; only customer-side
--                            knobs; admin warehouse-cost defaults
--                            stay in admin_settings — Phase G)
-- tb_rate_g_kg / cbm   → rate_general (with 3-tier pricing)
-- tb_rate_vip_kg / cbm → rate_vip (flat rate)
-- tb_rate_custom_kg / cbm     → rate_custom_user (per-user override)
-- tb_hs_rate_custom_kg / cbm  → rate_custom_hs (per-user × HS code,
--                                most granular — admin-managed, Phase G)
--
-- All 4 rate tables share the same axis schema:
--   (customer_group | profile_id, source_warehouse, transport_type,
--    product_type, basis ['kg'|'cbm']) → rate value
--
-- Waterfall lookup order in lib/forwarder/calc-price.ts (D3):
--   rate_custom_hs → rate_custom_user → rate_vip → rate_general
--
-- Legacy enum mappings (preserved as-is for Phase D scope; rename
-- only where the legacy code was numeric-cryptic):
--   sourceWarehouse 1/2 → 'guangzhou' / 'yiwu'
--   transportType   1/2/3 → 'truck' / 'ship' / 'air'
--   productType    1/2/3/4 → 'general' / 'tisi' / 'fda' / 'special'
--                            (มอก / อย / พิเศษ)
-- ════════════════════════════════════════════════════════════

-- ── customer_groups ──
create table if not exists public.customer_groups (
  code        text primary key,
  name        text not null,
  is_active   boolean not null default true,
  is_vip      boolean not null default false,
  created_at  timestamptz not null default now()
);

insert into public.customer_groups (code, name, is_vip) values
  ('PR',   'Pacred ลูกค้าทั่วไป',  false),
  ('SVIP', 'Super VIP',            true),
  ('VIP',  'VIP',                  true)
on conflict (code) do nothing;

-- ── settings singleton ──
create table if not exists public.settings (
  id                          int primary key default 1,
  service_fee                 numeric(10,2) not null default 50,   -- +50 บาท PCS service fee
  juristic_discount_threshold numeric(10,2) not null default 1000, -- ≥1000 baht
  juristic_discount_pct       numeric(6,4)  not null default 0.01, -- 1% off
  qc_fee_per_item             numeric(10,2) not null default 5,
  crate_fee_base              numeric(10,2) not null default 100,
  free_shipping_enabled       boolean       not null default false,
  free_shipping_threshold     numeric(10,2),
  yuan_rate                   numeric(8,4)  not null default 5.0,  -- supersedes NEXT_PUBLIC_YUAN_RATE env
  -- domestic transport per ship_by/warehouse — JSON for flexibility
  domestic_costs              jsonb         not null default '{}'::jsonb,
  updated_at                  timestamptz   not null default now(),
  constraint settings_singleton check (id = 1)
);

insert into public.settings (id) values (1) on conflict do nothing;

drop trigger if exists settings_updated_at_trigger on public.settings;
create trigger settings_updated_at_trigger
  before update on public.settings
  for each row execute function public.set_updated_at();

-- ── rate_general (tiered) ──
create table if not exists public.rate_general (
  id                uuid primary key default gen_random_uuid(),
  customer_group    text not null default 'PR' references public.customer_groups(code) on delete restrict,
  source_warehouse  text not null check (source_warehouse in ('guangzhou','yiwu')),
  transport_type    text not null check (transport_type   in ('truck','ship','air')),
  product_type      text not null check (product_type     in ('general','tisi','fda','special')),
  basis             text not null check (basis            in ('kg','cbm')),
  tier1             numeric(10,2),                            -- เรทตั้งต้น
  tier2             numeric(10,2),
  tier3             numeric(10,2),
  admin_id_update   text,
  updated_at        timestamptz not null default now(),
  unique (customer_group, source_warehouse, transport_type, product_type, basis)
);

drop trigger if exists rate_general_updated_at_trigger on public.rate_general;
create trigger rate_general_updated_at_trigger
  before update on public.rate_general
  for each row execute function public.set_updated_at();

-- ── rate_vip (flat) ──
create table if not exists public.rate_vip (
  id                uuid primary key default gen_random_uuid(),
  customer_group    text not null references public.customer_groups(code) on delete restrict,
  source_warehouse  text not null check (source_warehouse in ('guangzhou','yiwu')),
  transport_type    text not null check (transport_type   in ('truck','ship','air')),
  product_type      text not null check (product_type     in ('general','tisi','fda','special')),
  basis             text not null check (basis            in ('kg','cbm')),
  rate              numeric(10,2) not null,
  admin_id_update   text,
  updated_at        timestamptz not null default now(),
  unique (customer_group, source_warehouse, transport_type, product_type, basis)
);

drop trigger if exists rate_vip_updated_at_trigger on public.rate_vip;
create trigger rate_vip_updated_at_trigger
  before update on public.rate_vip
  for each row execute function public.set_updated_at();

-- ── rate_custom_user (per-user override) ──
create table if not exists public.rate_custom_user (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  source_warehouse  text not null check (source_warehouse in ('guangzhou','yiwu')),
  transport_type    text not null check (transport_type   in ('truck','ship','air')),
  product_type      text not null check (product_type     in ('general','tisi','fda','special')),
  basis             text not null check (basis            in ('kg','cbm')),
  rate              numeric(10,2) not null,
  admin_id_update   text,
  updated_at        timestamptz not null default now(),
  unique (profile_id, source_warehouse, transport_type, product_type, basis)
);

drop trigger if exists rate_custom_user_updated_at_trigger on public.rate_custom_user;
create trigger rate_custom_user_updated_at_trigger
  before update on public.rate_custom_user
  for each row execute function public.set_updated_at();

-- rate_custom_hs (HS-code overrides) — admin-managed, Phase G; placeholder shape
create table if not exists public.rate_custom_hs (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  hs_code           text not null,
  source_warehouse  text not null,
  transport_type    text not null,
  product_type      text not null,
  basis             text not null check (basis in ('kg','cbm')),
  rate_before       numeric(10,2),                            -- before-threshold rate
  rate              numeric(10,2) not null,
  admin_id_update   text,
  updated_at        timestamptz not null default now()
);

-- ── Seed dev defaults ── (general rates so dev can compute prices)
-- Pick conservative numbers; production tweaks via admin Phase G.
insert into public.rate_general
  (customer_group, source_warehouse, transport_type, product_type, basis, tier1, tier2, tier3)
values
  ('PR','guangzhou','truck','general','kg',   35, 32, 30),
  ('PR','guangzhou','truck','general','cbm', 4500, 4200, 3900),
  ('PR','guangzhou','ship', 'general','kg',   25, 22, 20),
  ('PR','guangzhou','ship', 'general','cbm', 3500, 3200, 2900),
  ('PR','guangzhou','truck','tisi',  'kg',   45, 42, 40),
  ('PR','guangzhou','ship', 'tisi',  'kg',   35, 32, 30),
  ('PR','guangzhou','truck','fda',   'kg',   55, 52, 50),
  ('PR','guangzhou','ship', 'fda',   'kg',   45, 42, 40),
  ('PR','yiwu',     'truck','general','kg',   38, 35, 33),
  ('PR','yiwu',     'ship', 'general','kg',   28, 25, 23)
on conflict (customer_group, source_warehouse, transport_type, product_type, basis) do nothing;

-- ════════════════════════════════════════════════════════════
-- RLS — rates + settings are READ-public for authenticated users
-- (so the rate engine can run for any logged-in customer), writes
-- are admin-only (no policy = denied).
-- customer_groups is also read-public.
-- rate_custom_user is read-own.
-- ════════════════════════════════════════════════════════════
alter table public.customer_groups   enable row level security;
alter table public.settings          enable row level security;
alter table public.rate_general      enable row level security;
alter table public.rate_vip          enable row level security;
alter table public.rate_custom_user  enable row level security;
alter table public.rate_custom_hs    enable row level security;

drop policy if exists "customer_groups_select_all" on public.customer_groups;
create policy "customer_groups_select_all" on public.customer_groups
  for select using (auth.role() = 'authenticated');

drop policy if exists "settings_select_all" on public.settings;
create policy "settings_select_all" on public.settings
  for select using (auth.role() = 'authenticated');

drop policy if exists "rate_general_select_all" on public.rate_general;
create policy "rate_general_select_all" on public.rate_general
  for select using (auth.role() = 'authenticated');

drop policy if exists "rate_vip_select_all" on public.rate_vip;
create policy "rate_vip_select_all" on public.rate_vip
  for select using (auth.role() = 'authenticated');

drop policy if exists "rate_custom_user_select_own" on public.rate_custom_user;
create policy "rate_custom_user_select_own" on public.rate_custom_user
  for select using (auth.uid() = profile_id);

drop policy if exists "rate_custom_hs_select_own" on public.rate_custom_hs;
create policy "rate_custom_hs_select_own" on public.rate_custom_hs
  for select using (auth.uid() = profile_id);
