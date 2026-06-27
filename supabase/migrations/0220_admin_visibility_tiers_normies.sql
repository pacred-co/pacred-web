-- 0220 — admin visibility tiers · add `normies` + migrate super → normies
--
-- Owner ปอน 2026-06-27: "ลบ role ไปเลย แก้เป็นสิทธิ์การมองเห็นแทน · เดี๋ยว role
-- ทำเพิ่มมาอีกอัน". The admin role model becomes THREE VISIBILITY TIERS — every
-- admin is god-nav (full menu/actions); they differ ONLY in money visibility:
--
--   ┌──────────┬──────────┬─────────┬───────────┐
--   │ tier     │ ต้นทุน    │ กำไร    │ ยอดขาย     │
--   ├──────────┼──────────┼─────────┼───────────┤
--   │ ultra    │   ✅     │   ✅    │    ✅      │
--   │ super    │   ❌     │   ✅    │    ✅      │  ← NEW meaning (was: saw neither)
--   │ normies  │   ❌     │   ❌    │    ✅      │  ← NEW role
--   └──────────┴──────────┴─────────┴───────────┘
--
-- Companion code (ships together · gate tsc 0):
--   lib/admin/money-visibility.ts   — canViewCost / canViewProfit split (+ canViewCostProfit alias = canViewCost)
--   lib/admin/god-role.ts           — isGodRole += 'normies'
--   lib/auth/require-admin.ts       — AdminRole += 'normies'
--   lib/validators/admin-form.ts    — ADMIN_ROLES/ROLE_LABELS += normies · ASSIGNABLE_ROLES = [ultra,super,normies]
--   lib/admin/phase-access.ts · dashboards/pick-primary-role.ts · sidebar-menu.ts — normies god-nav
--
-- The 25 function roles (manager/ops/accounting/sales/.../freight_*) remain VALID
-- values so the ~250 requireAdmin([...]) operational gates still compile + the
-- god-nav bypass covers them; they are merely RETIRED from the role picker
-- (ASSIGNABLE_ROLES). Re-add to ASSIGNABLE_ROLES when a functional role is needed
-- again. Extends the CHECK constraint last set by mig 0193 (25 roles) → 26 roles.
--
-- Two steps, ORDERED: (1) widen the CHECK to allow 'normies' BEFORE (2) the data
-- UPDATE that writes 'normies'. Idempotent (re-run = 0 affected rows).

alter table public.admins drop constraint if exists admins_role_check;

alter table public.admins add  constraint admins_role_check
  check (role in (
    -- ── Visibility tiers (all god-nav · the only assignable roles) ──
    'ultra',                  -- Ultra Admin Z — sees cost + profit + sales
    'super',                  -- sees profit + sales, NOT cost (2026-06-27)
    'normies',                -- sees sales only — NO cost, NO profit (2026-06-27)  ← NEW
    -- ── Cargo function roles (RETIRED from picker · kept valid for back-compat) ──
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
    -- ── Freight (13 from 0091) ──
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
  '2026-06-27 (ปอน · mig 0220): role = 3 VISIBILITY tiers (ultra/super/normies, '
  'all god-nav). ultra sees cost+profit; super sees profit-not-cost; normies sees '
  'neither. The 25 function roles stay valid (operational requireAdmin gates) but '
  'are retired from the picker (ASSIGNABLE_ROLES). Extends mig 0193.';

-- ── Data: demote every ACTIVE `super` grant → `normies` ──────────────────────
-- Owner: "ใครที่เป็น super อยู่ตอนนี้ ดันลงไปเป็น normies ให้หมด". They KEEP full
-- god-nav reach (normies is god-nav) and lose nothing visible today — `super`
-- already saw no cost/profit, and `normies` sees the same (none). This just
-- relabels them to the money-blind tier so a freshly-assigned `super` becomes
-- the new profit-seeing middle tier.
--
-- Scope: ACTIVE grants only. Inactive historical `super` rows (left by the
-- adminChangeRole soft-delete pattern) are kept untouched as audit history —
-- `super` remains a valid value so they don't violate the CHECK.
-- No UNIQUE(profile_id, role) conflict possible: `normies` is brand-new, so no
-- profile can already hold a `normies` row.
update public.admins
   set role = 'normies'
 where role = 'super'
   and is_active = true;
