-- ════════════════════════════════════════════════════════════
-- 0091 — admins.role enum expansion · Freight roles + sales/qa
-- ════════════════════════════════════════════════════════════
-- Migration author: Agent ZZ (2026-05-20 ค่ำ · per ภูม brief
--   "port เลย ยึดตาม Owner ก่อน · แก้อะไรก็ให้แจ้ง พี่เดฟไว้ด้วย").
--
-- Companion to: lib/auth/require-admin.ts (TypeScript enum extension)
--               lib/admin/sidebar-menu.ts  (per-role menu definitions)
--
-- ─── What this migration does ─────────────────────────────────
-- Extends the `admins_role_check` CHECK constraint to accept the
-- new role keys added in the AdminRole enum. Migration 0015 created
-- the constraint with 4 roles; migrations 0033 + 0054 expanded it to 7.
-- This migration brings it to the full legacy PCS Cargo coverage:
--
--   ── before (after 0054) ──
--   super | ops | accounting | sales_admin | warehouse | driver | interpreter
--
--   ── after (this migration) ──
--   super | ops | accounting
--   | sales_admin   — Cargo Sales Manager  (legacy doc role #29)
--   | sales         — Cargo Sales Staff     (legacy doc role #30) ← NEW
--   | qa            — QA & QC staff         (legacy doc role #5)  ← NEW
--   | warehouse | driver | interpreter
--   | freight_sales_manager          (#16)  ← NEW
--   | freight_sales                  (#17)  ← NEW
--   | freight_export_manager         (#18)  ← NEW
--   | freight_export_cs              (#19)  ← NEW
--   | freight_export_doc             (#20)  ← NEW
--   | freight_export_clearance       (#21)  ← NEW
--   | freight_clearance_both         (#22)  ← NEW   (Import & Export · shared PHP file)
--   | freight_export_messenger       (#23)  ← NEW
--   | freight_import_manager         (#24)  ← NEW
--   | freight_import_cs              (#25)  ← NEW
--   | freight_import_doc             (#26)  ← NEW
--   | freight_import_clearance       (#27)  ← NEW
--   | freight_import_messenger       (#28)  ← NEW
--
-- ─── Why split `sales_admin` vs `sales` ───────────────────────
-- Legacy doc lines 780-788 (Cargo Sales Manager) and 792-870 (Cargo
-- Sales) describe two DISTINCT roles. The Manager file says:
--   "ไฟล์ว่าง — ใช้เมนูเหมือน Sales แต่มีสิทธิ์อนุมัติเพิ่ม"
--   (empty file — same menu as Sales but with extra approval rights)
-- Pacred's prior `sales_admin` fused Sales-Manager + Sales-Staff +
-- Sales-All under one bucket. We restore the legacy Mgr/Staff split:
--   - `sales_admin` (existing key, KEPT) = Cargo Sales MANAGER
--   - `sales`       (NEW key)            = Cargo Sales STAFF
-- The KEY NAMES stay backwards-compatible — every existing row in
-- `admins` keeps its `sales_admin` role (Manager tier). New hires
-- assigned only the staff seat get `sales`.
--
-- ─── Why add `qa` ─────────────────────────────────────────────
-- Legacy doc role #5 (QA & QC, lines 358-382) has 12 SLA-breach
-- queues + a sales-rep transfer tool. Pacred today exposes those
-- queues as the single Phase-2 leaf `itemQAAll`, visible only to
-- `super`. A dedicated QA staffer cannot login without `super`
-- (massive over-privilege). The `qa` role fixes this gap.
--
-- ─── Why add 13 Freight roles ─────────────────────────────────
-- Legacy CompanyType 2 (`Freight`) has 13 distinct PHP role files
-- (doc lines 588-772). The Freight side of the platform exists in
-- Pacred (forwarder-import dropdown has `freight` segments,
-- accounting block has a `freight` leaf) but no Freight-role users
-- can be assigned. This migration unblocks role assignment.
--
-- IMPORTANT: the menu CONTENT for these 13 roles is currently
-- STUBBED in `lib/admin/sidebar-menu.ts` because the legacy doc
-- enumerates only role NAMES + section headers — never the actual
-- per-role item trees ("[Full Export Operations Access]" placeholder).
-- Per ภูม "ห้ามเดา" rule, the stubs carry a TODO comment asking
-- พี่เดฟ to extend the doc with the per-Freight-role menu trees
-- (legacy `Freight/SalesManager.php` etc. are the ground truth).
--
-- ─── Idempotent · safe to re-run ──────────────────────────────
-- Uses `drop constraint if exists` before re-adding. Existing rows
-- in `admins` keep their values; no data migration required.

alter table public.admins drop constraint if exists admins_role_check;

alter table public.admins add  constraint admins_role_check
  check (role in (
    -- CargoAndFreight / Cargo (existing + 2 new)
    'super','ops','accounting',
    'sales_admin',          -- Cargo Sales Manager (#29) — Mgr tier, approval
    'sales',                -- Cargo Sales Staff   (#30) — Staff tier        ← NEW
    'qa',                   -- QA & QC staff       (#5)                       ← NEW
    'warehouse','driver','interpreter',
    -- Freight (13 new)
    'freight_sales_manager',     -- #16
    'freight_sales',             -- #17
    'freight_export_manager',    -- #18
    'freight_export_cs',         -- #19
    'freight_export_doc',        -- #20
    'freight_export_clearance',  -- #21
    'freight_clearance_both',    -- #22 — shared PHP file (Import & Export)
    'freight_export_messenger',  -- #23
    'freight_import_manager',    -- #24
    'freight_import_cs',         -- #25
    'freight_import_doc',        -- #26
    'freight_import_clearance',  -- #27
    'freight_import_messenger'   -- #28
  ));

comment on constraint admins_role_check on public.admins is
  '2026-05-20 (mig 0091): full legacy PCS Cargo role coverage — '
  '7 Cargo/super/ops roles + 13 Freight roles + qa + sales(Staff). '
  'Mgr-tier roles (sales_admin, freight_*_manager, warehouse Mgr) hold '
  'approval rights distinct from their Staff counterparts.';
