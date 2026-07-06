-- 0241 — per-order purchaser (ผู้สั่งซื้อ) assignment + `purchaser`/`purchaser_lead` roles
--
-- Owner directive (④, 2026-07-06). The ฝากสั่งซื้อ (shop) + ฝากนำเข้า (forwarder)
-- work is assigned to a purchaser (ผู้สั่งซื้อ) **PER ORDER**. A purchaser sees
-- ONLY their own assigned orders. A dedicated "หัวหน้าสั่งซื้อ" (purchaser_lead)
-- sees ALL purchaser work AND can reassign. The ล่ามจีน (interpreter) hands off
-- work — can see whose an order is + reassign it.
--
-- Assignment is PER-ORDER via a NEW field `adminidpurchaser` (a legacy
-- tb_admin.adminID string, e.g. "AD020" — the SAME identity world the order
-- creator cols adminid/adminidcreate already use). This is DISTINCT from the
-- customer-level tb_users.adminIDPurchaser (mig 0217) — that is per-customer and
-- is NOT reused here.
--
-- Companion code (ships together · gate tsc 0):
--   lib/auth/require-admin.ts               (AdminRole += purchaser, purchaser_lead)
--   lib/validators/admin-form.ts            (ADMIN_ROLES + ROLE_LABELS + ASSIGNABLE_ROLES)
--   actions/admin/assign-order-purchaser.ts (assignOrderPurchaser · gated interpreter/lead/god)
--   lib/admin/purchaser-scope.ts            (pure scope rule + test)
--   app/[locale]/(admin)/admin/service-orders/page.tsx  (hard-scope + ผู้สั่งซื้อ filter)
--   app/[locale]/(admin)/admin/forwarders/page.tsx      (hard-scope + ผู้สั่งซื้อ filter)
--   the two *-table.tsx + purchaser-cell.tsx (display + reassign control)
--
-- ADDITIVE ONLY — no data change. `admins.role` is a CHECK constraint (NOT a
-- Postgres enum) and is_admin() is role-agnostic, so — exactly like mig 0193
-- (ultra) / 0220 (normies) — the ONLY schema touch is the CHECK widen + the two
-- new nullable columns (default '' = ยังไม่มอบหมาย).
--
-- Extends the CHECK constraint last set by mig 0220 (26 roles) → 28 roles.

-- ── (1) widen admins.role CHECK to add the two new roles ─────────────────────
alter table public.admins drop constraint if exists admins_role_check;

alter table public.admins add  constraint admins_role_check
  check (role in (
    -- ── Visibility tiers (all god-nav) ──
    'ultra',                  -- Ultra Admin Z — sees cost + profit + sales
    'super',                  -- sees profit + sales, NOT cost
    'normies',                -- sees sales only
    -- ── Per-order purchaser roles (owner ④ · 2026-07-06 · mig 0241) ──
    'purchaser',              -- ผู้สั่งซื้อ — sees ONLY their own assigned orders   ← NEW
    'purchaser_lead',         -- หัวหน้าสั่งซื้อ — sees ALL purchaser work + reassign  ← NEW
    -- ── Cargo function roles ──
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
  '2026-07-06 (owner ④ · mig 0241): added `purchaser` (ผู้สั่งซื้อ — sees only own '
  'assigned orders) + `purchaser_lead` (หัวหน้าสั่งซื้อ — sees ALL + reassigns). '
  'Per-order assignment via tb_header_order/tb_forwarder.adminidpurchaser. '
  'Extends mig 0220.';

-- ── (2) per-order assigned-purchaser column on the two order tables ──────────
-- `adminidpurchaser` = a tb_admin.adminID string (the SAME identity world as the
-- creator cols adminid/adminidcreate). '' = ยังไม่มอบหมาย (unassigned). Idempotent.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tb_header_order'
      and column_name = 'adminidpurchaser'
  ) then
    alter table public.tb_header_order
      add column adminidpurchaser varchar(20) not null default '';
  end if;
end $$;

create index if not exists idx_tb_header_order_adminidpurchaser
  on public.tb_header_order (adminidpurchaser);

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tb_forwarder'
      and column_name = 'adminidpurchaser'
  ) then
    alter table public.tb_forwarder
      add column adminidpurchaser varchar(20) not null default '';
  end if;
end $$;

create index if not exists idx_tb_forwarder_adminidpurchaser
  on public.tb_forwarder (adminidpurchaser);

comment on column public.tb_header_order.adminidpurchaser is
  '2026-07-06 (owner ④ · mig 0241) — assigned purchaser (ผู้สั่งซื้อ) tb_admin.adminID. '
  'PER-ORDER assignment. '''' = ยังไม่มอบหมาย. A `purchaser`-only viewer is hard-scoped to '
  'their own; interpreter/purchaser_lead/god reassign.';
comment on column public.tb_forwarder.adminidpurchaser is
  '2026-07-06 (owner ④ · mig 0241) — assigned purchaser (ผู้สั่งซื้อ) tb_admin.adminID. '
  'PER-ORDER assignment. '''' = ยังไม่มอบหมาย.';
