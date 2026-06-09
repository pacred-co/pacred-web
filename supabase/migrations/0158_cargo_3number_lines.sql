-- 0158 · 2026-06-09 — P2 (tax-invoice platform): per-line COST + DECLARED capture
--                       + the `pricing` AdminRole.
--
-- THE 3-NUMBER MODEL (docs/research/tax-invoice-platform-build-plan-2026-06-09.md):
-- a CARGO import has THREE distinct prices that must never be conflated —
--   SELLING (CS → invoice + VAT)          · already captured (tb_order.cprice / forwarder header)
--   COST    (Pricing → PEAK stock-in)     · NEW per-line columns below
--   DECLARED / มูลค่าสำแดง (Docs → ใบขน)   · NEW per-line columns below
--
-- This migration ADDS the per-line cost + declared columns at their natural grain
-- (tb_order = shop-order line · tb_forwarder_item = import-forwarder line) and
-- introduces the `pricing` role that captures the COST number. Purely additive +
-- idempotent (safe to re-run).
--
-- ⚠️ The forwarder HEADER `fcosttotalprice` is intentionally NOT rolled up from
-- these per-line costs here — it already has an authoritative writer (the ไอแต้ม
-- container-cost-sheet sync, owner-locked · adminApplyContainerCostFromSheet).
-- The PEAK header rollup lands in P4 so it cannot collide with that source.

-- ── per-line COST + DECLARED on the shop-order line (tb_order) ──
alter table public.tb_order
  add column if not exists cost_unit_cny      numeric(14,2),
  add column if not exists cost_rate_cny      numeric(8,4),
  add column if not exists declared_value_thb numeric(14,2),
  add column if not exists hs_code            text;

-- ── per-line COST + DECLARED on the import-forwarder line (tb_forwarder_item) ──
alter table public.tb_forwarder_item
  add column if not exists cost_unit_thb      numeric(14,2),
  add column if not exists cost_rate_cny      numeric(8,4),
  add column if not exists declared_value_thb numeric(14,2),
  add column if not exists hs_code            text;

-- ── widen admins.role CHECK to include `pricing` (drop+re-add · idempotent) ──
alter table public.admins drop constraint if exists admins_role_check;

alter table public.admins add  constraint admins_role_check
  check (role in (
    -- Cargo
    'super',
    'manager',
    'ops',
    'accounting',
    'sales_admin',
    'sales',
    'qa',
    'warehouse',
    'driver',
    'interpreter',
    'pricing',                -- Cargo Pricing — captures COST (PEAK stock-in)  ← NEW (0158)
    -- Freight (13 from 0091)
    'freight_sales_manager',
    'freight_sales',
    'freight_export_manager',
    'freight_export_cs',
    'freight_export_doc',
    'freight_export_clearance',
    'freight_clearance_both',
    'freight_export_messenger',
    'freight_import_manager',
    'freight_import_cs',
    'freight_import_doc',
    'freight_import_clearance',
    'freight_import_messenger'
  ));

comment on constraint admins_role_check on public.admins is
  '2026-06-09 (mig 0158): added `pricing` role — captures COST (PEAK stock-in) '
  'in the 3-number tax-invoice model (SELLING / COST / DECLARED). '
  'Distinct from accounting / sales.';
