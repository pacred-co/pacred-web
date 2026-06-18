-- 0189 — admins.role enum expansion · `ultra` (Ultra Admin Z)
--
-- Owner directive 2026-06-18. Adds the TRUE god role `ultra` ("Ultra Admin Z")
-- that sees + does EVERYTHING, including money internals (cost · profit/margin ·
-- cost-rate/FX · declared value · commission).
--
-- Companion code (must ship together):
--   lib/auth/require-admin.ts          (AdminRole type + isGodRole + bypass)
--   lib/admin/money-visibility.ts      (canViewCostProfit → {ultra, accounting, pricing})
--   lib/validators/admin-form.ts       (ADMIN_ROLES + ROLE_LABELS)
--   lib/admin/phase-access.ts          (canAccessRoute god bypass)
--   lib/admin/sidebar-menu.ts          (ROLE_MENUS + ROLE_PRECEDENCE + dispatchers)
--   lib/admin/dashboards/pick-primary-role.ts
--
-- After this, `super` remains a god role for navigation/actions but is gated
-- OUT of money internals (canViewCostProfit excludes super). `ultra` is the
-- only god role that still sees them.
--
-- Extends the CHECK constraint last set by mig 0158 (24 roles) → 25 roles.

alter table public.admins drop constraint if exists admins_role_check;

alter table public.admins add  constraint admins_role_check
  check (role in (
    'ultra',                  -- Ultra Admin Z — TRUE god (sees cost/profit/commission)  ← NEW (0189)
    -- Cargo
    'super',                  -- god for everything EXCEPT money internals (0189)
    'manager',
    'ops',
    'accounting',
    'sales_admin',
    'sales',
    'qa',
    'warehouse',
    'driver',
    'interpreter',
    'pricing',
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
  '2026-06-18 (mig 0189): added `ultra` (Ultra Admin Z) — the true god role that '
  'sees money internals (cost/profit/margin/FX-cost/declared/commission). '
  '`super` keeps full nav/action reach but is gated OUT of money internals '
  '(canViewCostProfit = {ultra, accounting, pricing}).';
