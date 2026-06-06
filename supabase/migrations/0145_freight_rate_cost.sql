-- ════════════════════════════════════════════════════════════════════
-- 0145 — China-freight COST table + monthly FX + markup-tier (ADR-0028-adjacent)
-- Owner directive 2026-06-06: EXW/CFR quotes must show TRUE NET margin, not just
-- "กำไรขั้นต้น". The China-side freight cost is FX-dependent (≈35฿/USD) + monthly
-- + per-port×carrier → it cannot be hardcoded. This admin-editable table + the
-- business_config FX/markup keys let ops/accounting maintain the live cost so the
-- rate engine computes real net margin.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.tb_freight_rate (
  id              uuid primary key default gen_random_uuid(),
  transport_mode  text not null check (transport_mode in ('sea_fcl','sea_lcl','air')),
  pol             text not null default '',          -- port of loading (China) — '' = any
  pod             text not null default '',          -- port of discharge (Thailand) — '' = any
  carrier         text not null default '',          -- carrier code — '' = any
  container_type  text not null default '',          -- FCL: '20'/'40'/'40HQ' · LCL/AIR: ''
  cost_usd        numeric(12,4) not null,            -- cost per unit (container / CBM / KG) in USD
  unit            text not null default 'container' check (unit in ('container','cbm','kg')),
  fx_thb_per_usd  numeric(7,2) not null default 35,  -- snapshot FX at entry time
  effective_from  date not null default current_date,
  active          boolean not null default true,
  note            text not null default '',
  updated_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists tb_freight_rate_lookup_idx
  on public.tb_freight_rate (transport_mode, pol, pod, active, effective_from desc);

alter table public.tb_freight_rate enable row level security;

drop policy if exists tb_freight_rate_admin_read on public.tb_freight_rate;
create policy tb_freight_rate_admin_read on public.tb_freight_rate
  for select using (public.is_admin(array['super','ops','accounting']));

drop policy if exists tb_freight_rate_admin_write on public.tb_freight_rate;
create policy tb_freight_rate_admin_write on public.tb_freight_rate
  for all using (public.is_admin(array['super','ops']))
  with check (public.is_admin(array['super','ops']));

-- FX + markup-tier + margin-cap config (business_config single source of truth).
insert into public.business_config (key, value, value_type, category, description) values
  ('freight.fx_rate_thb_per_usd', to_jsonb(35.00),            'number',       'Freight', 'USD→THB FX for China-freight cost (updated monthly by ops/accounting).'),
  ('freight.markup_tiers_pct',    '[30,25,20,15,10]'::jsonb,  'json',         'Freight', 'The 5 freight markup tiers (%) the pricer picks per customer/volume.'),
  ('freight.default_markup_pct',  to_jsonb(25),               'number',       'Freight', 'Default freight markup % applied as a reference.'),
  ('freight.margin_cap_thb',      to_jsonb(15000),            'currency_thb', 'Freight', 'CEO directive: max profit ≤ this per container (else flag the quote).')
on conflict (key) do nothing;
