-- ════════════════════════════════════════════════════════════════════
-- 0165 — Freight P&L + margin-guard persistence (W5)
-- ════════════════════════════════════════════════════════════════════
-- The cost/sell/profit data is computed per quote (rate-engine) but was never
-- PERSISTED — the ≤15k฿/container CEO margin cap was an ephemeral UI banner only,
-- and the China-cost folding + commission split lived in the action's return
-- value, not the row. W5 persists them so the P&L dashboard + the cockpit can
-- surface real freight profitability.
--
-- ⚠️ MONEY/TAX SAFETY (project guardrail "ห้ามทำงานบัค งานหาย"):
--   These are DISPLAY/ANALYTICS snapshots. They NEVER touch the customer money
--   path — no wallet, no payment, no invoice, no commercial_value/vat/duty.
--   The ≤15k cap flag is ADVISORY (never blocks a save · owner decides hard-gate).
--   The 3-number model is respected: cost/profit here are the SELL−COST internal
--   margin, NOT the DECLARED (สำแดง) value and NOT a customer-visible figure.
--
-- All ADD COLUMN IF NOT EXISTS · nullable · idempotent (safe re-run). No data
-- backfill — existing rows stay NULL until the next compose/convert recomputes.
-- The business_config FX key (`freight.fx_rate_thb_per_usd`) + margin cap key
-- (`freight.margin_cap_thb`) are already seeded by migration 0145 — NOT re-seeded
-- here.
-- ════════════════════════════════════════════════════════════════════

-- 1) freight_quotes — persist the rate-engine P&L + margin/commission flags.
alter table public.freight_quotes
  add column if not exists profit_margin_thb       numeric(14,2),  -- SELL − COST (incl. China freight) · NET margin (NULL if never composed)
  add column if not exists margin_exceeds_cap      boolean,        -- advisory: profit > 15k × containers
  add column if not exists china_cost_lookup_error boolean,        -- true → China freight cost not found → gross-only profit (yellow banner)
  add column if not exists commission_calc_status  text,           -- 'computed' | 'gross_only' | 'unknown' — provenance of the commission split
  add column if not exists cost_china_freight_thb  numeric(14,2),  -- China-side freight cost (FX-converted) at compose time (0 if none)
  add column if not exists cost_local_thb          numeric(14,2),  -- Thai-side local cost (customs + transport) at compose time
  add column if not exists cost_total_thb          numeric(14,2);  -- cost_china_freight_thb + cost_local_thb

comment on column public.freight_quotes.profit_margin_thb is
  'W5 (0165) — persisted SELL−COST net margin from the rate engine at compose time. DISPLAY/ANALYTICS only — never a customer figure, never the DECLARED value. NULL until first composed.';
comment on column public.freight_quotes.margin_exceeds_cap is
  'W5 (0165) — advisory flag: profit > business_config freight.margin_cap_thb × containers. NEVER blocks a save (owner decides hard-gate).';
comment on column public.freight_quotes.china_cost_lookup_error is
  'W5 (0165) — true when no tb_freight_rate row matched → China freight cost unmodelled → profit_margin_thb is GROSS only. UI shows a yellow "ก่อนหักต้นทุนเฟรทจีน" banner.';
comment on column public.freight_quotes.commission_calc_status is
  'W5 (0165) — provenance of the commission split persisted on the line items: computed | gross_only | unknown.';

-- 2) freight_quote_items — persist the per-line commission breakdown.
alter table public.freight_quote_items
  add column if not exists commission_scope     text,           -- freight | thai_customs | origin | thai_transport | import_tax | none
  add column if not exists commission_pct       numeric(6,3),   -- the rate applied to this line's sell (0 for non-commissionable lines)
  add column if not exists commission_amount_thb numeric(14,2); -- sell × pct (line-level · pre-WHT)

comment on column public.freight_quote_items.commission_scope is
  'W5 (0165) — which commission bucket this line belongs to (freight 1% / thai_customs 5% / origin 5% / else none). Display/analytics only.';
comment on column public.freight_quote_items.commission_pct is
  'W5 (0165) — the commission % applied to this line''s sell amount (0 if non-commissionable).';
comment on column public.freight_quote_items.commission_amount_thb is
  'W5 (0165) — line-level commission = sell × pct (pre-WHT). The job-level WHT 3% is applied on the sum, not per line.';

-- 3) freight_shipments — snapshot the cost/margin block at quote→shipment convert.
alter table public.freight_shipments
  add column if not exists cost_china_freight_thb              numeric(14,2),  -- China-side freight cost (FX-converted) at convert time
  add column if not exists cost_local_thb                      numeric(14,2),  -- Thai-side local cost (customs + transport) at convert time
  add column if not exists cost_total_thb                      numeric(14,2),  -- cost_china_freight_thb + cost_local_thb
  add column if not exists profit_margin_thb                   numeric(14,2),  -- SELL − cost_total (snapshot — frozen at convert)
  add column if not exists margin_exceeds_cap_at_conversion    boolean,        -- advisory flag captured at convert
  add column if not exists margin_cap_thb                      numeric(14,2);  -- the cap value (15k × containers) at convert (snapshot of the policy)

comment on column public.freight_shipments.cost_total_thb is
  'W5 (0165) — total internal cost snapshot (China freight + Thai local) frozen at quote→shipment convert. DISPLAY/ANALYTICS — never a money-path value.';
comment on column public.freight_shipments.profit_margin_thb is
  'W5 (0165) — SELL − cost_total snapshot frozen at convert. The P&L dashboard reads this (+ the live revenue/invoice for the realised side).';
comment on column public.freight_shipments.margin_exceeds_cap_at_conversion is
  'W5 (0165) — advisory: did the converted quote exceed the ≤15k/container cap? Snapshot only — never blocks the convert.';
comment on column public.freight_shipments.margin_cap_thb is
  'W5 (0165) — the applicable margin cap (business_config freight.margin_cap_thb × containers) snapshotted at convert for the P&L view.';
