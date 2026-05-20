-- 0090_drop_spine_tables.sql
--
-- D1 Option A — drop the pre-D1 "spine" tables (cargo_containers /
-- cargo_shipments / cargo_sacks) added by migrations 0033 + 0068.
--
-- Context: on 2026-05-20 ค่ำ ภูม audited /admin/warehouse/containers
-- (the spine page) against legacy member/pcs-admin/report-cnt.php
-- (2487 LOC). The spine model diverged completely from legacy:
-- different status enum, no 11-button audit menu, no money columns,
-- no ทำรายการจ่ายเงินตู้ flow. Per Option A (พี่เดฟ-confirmed:
-- "just match what พี่ป๊อป wants"), the canonical container list
-- moved to /admin/report-cnt reading tb_forwarder directly, and the
-- scan flow moves to /admin/barcode/* (faithful port of the legacy
-- barcode-c-*.php / barcode-d-*.php / gateway.php trio).
--
-- ภูม verified Supabase prod: cargo_containers, cargo_shipments,
-- cargo_sacks are EMPTY. No production data to migrate. Safe to drop.
--
-- See docs/runbook/faithful-port-plan.md for the full Option A
-- decision record + Wave 2 agent split.

-- Drop in dependency order: shipments + sacks reference containers
-- via FK; drop them first, then containers.
DROP TABLE IF EXISTS public.cargo_shipments CASCADE;
DROP TABLE IF EXISTS public.cargo_sacks CASCADE;
DROP TABLE IF EXISTS public.cargo_containers CASCADE;

-- Also drop the pre-spine container table from migration 0016
-- (the very first "phase H" container model — superseded by the
-- spine in 0033 and now itself retired). 0059 unified them onto
-- cargo_containers; drop the union shim too if it survives.
DROP TABLE IF EXISTS public.containers CASCADE;

-- Note: the legacy tb_forwarder.fcabinetnumber column (varchar 300)
-- is the new single source of truth for container groupings.
-- No INDEX changes needed — 0082 already includes a btree on
-- tb_forwarder.fcabinetnumber.
