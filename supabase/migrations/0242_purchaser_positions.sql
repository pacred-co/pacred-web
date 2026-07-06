-- 0242 — purchaser positions (ตำแหน่ง ผู้สั่งซื้อ / หัวหน้าสั่งซื้อ) · owner 2026-07-06
--
-- The purchaser work-function moves OFF the money-tier role picker and ONTO the
-- POSITION axis (admin_contact_extras.position_id → admin_positions.workspace_role).
-- A staffer is now made a ผู้สั่งซื้อ by giving them a base visibility role (e.g.
-- normies — sees sales, NOT cost) PLUS the "ผู้สั่งซื้อ" position; the position's
-- workspace_role="purchaser" drives their sidebar (menuPurchaser) + the two order
-- lists' hard-scope. This keeps cost/profit visibility 100% on the ROLE axis
-- (money-visibility.ts UNCHANGED) — a purchaser base-role never gains cost sight,
-- while admin_web (role ultra/pricing) keeps it.
--
-- Seeds 2 positions under the biz_cs department (matching the existing seeded
-- "Pricing / ตั้งราคา" · 0221). workspace_role values "purchaser" / "purchaser_lead"
-- are valid AdminRole menu keys (ROLE_MENUS · sidebar-menu.ts) and there is NO
-- CHECK constraint on admin_positions.workspace_role (0221 defines it as plain
-- text) → no constraint widen needed.
--
-- ADDITIVE ONLY — no data change to any admin. Idempotent (ON CONFLICT on the
-- UNIQUE(lower(name_th), department) index admin_positions_name_dept_uniq · 0221).

insert into public.admin_positions (name_th, department, workspace_role) values
  ('ผู้สั่งซื้อ',      'biz_cs', 'purchaser'),
  ('หัวหน้าสั่งซื้อ',  'biz_cs', 'purchaser_lead')
on conflict (lower(name_th), department) do nothing;
