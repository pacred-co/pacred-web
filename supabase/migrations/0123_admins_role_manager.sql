-- 0118 · 2026-05-28 ดึก — split `manager` role out of `super`
--
-- Per ภูม decision #6 from `docs/research/legacy-deep-dive/_SYNTHESIS.md` §6 D6:
-- "Manager role enum — แยกออกจาก super ไปด้วยเลย"
--
-- ─── Why ────────────────────────────────────────────────────
-- Legacy PCS Cargo distinguishes CEO (full control · Pacred = `super`)
-- from Manager (cross-team approval · cnt-payment approve · staff
-- supervision · NOT full system control). Legacy uses
-- (companyType, department, section) matrix — Manager is a Cargo dept
-- head who can approve cnt-payment + assign drivers + view all sub-team
-- queues but cannot grant admin roles or touch billing config.
--
-- Per `docs/research/legacy-deep-dive/04-staff-workflow-by-role.md` §2:
-- - CEO (Pacred=super): full system + grant roles + billing config
-- - Manager: cross-team approve · cnt-payment cntStatus 1→2 · driver
--            dispatch · staff supervision · NO role grants · NO billing config
--
-- This unblocks per-role sidebar filter (G4) and status-transition
-- gates (G5) — those land in this same wave but rely on this enum.
--
-- ─── Idempotent · safe to re-run ────────────────────────────
-- Uses `drop constraint if exists` before re-adding. Existing rows
-- keep their values; no data migration required.

alter table public.admins drop constraint if exists admins_role_check;

alter table public.admins add  constraint admins_role_check
  check (role in (
    -- CargoAndFreight / Cargo
    'super',                -- CEO / Owner (full control · grant roles · billing config)
    'manager',              -- Cargo Manager (approve cnt-payment · cross-team supervise)  ← NEW (0118)
    'ops',
    'accounting',
    'sales_admin',          -- Cargo Sales Manager (#29)
    'sales',                -- Cargo Sales Staff   (#30)
    'qa',                   -- QA & QC staff       (#5)
    'warehouse',
    'driver',
    'interpreter',
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
  '2026-05-28 (mig 0118): added `manager` role — Cargo Manager tier '
  '(approve cnt-payment · cross-team supervise · NO role grants). '
  'Distinct from `super` (CEO / full control).';
