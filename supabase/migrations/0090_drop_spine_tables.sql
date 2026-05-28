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
-- scan flow moved to /admin/barcode/* (faithful port of the legacy
-- barcode-c-*.php / barcode-d-*.php / gateway.php trio).
--
-- ภูม verified Supabase prod: cargo_containers, cargo_shipments,
-- cargo_sacks were EMPTY. No production data lost.
--
-- ────────────────────────────────────────────────────────────────────
-- 2026-05-21 — Wave 3D cleanup COMPLETE. Drop activated. ✅
-- ────────────────────────────────────────────────────────────────────
-- Agent Z rewrote all 14 cargo_* consumers (read tb_forwarder directly
-- now); residual mentions of cargo_containers/shipments/sacks are
-- JSDoc-only / history comments — verified by:
--   grep -rln "cargo_containers\|cargo_shipments\|cargo_sacks" \
--     --include="*.ts" --include="*.tsx" | grep -v lib/warehouse \
--     | xargs grep -v "//\|^\s*\*"  →  0 code lines
--
-- Safe to apply: cascading drop cleans up indexes + FKs from migrations
-- 0033/0068. The legacy tb_forwarder.fcabinetnumber is now the single
-- source of truth for container groupings.
--
-- See docs/runbook/faithful-port-plan.md for the full Option A
-- decision record + Wave 2/3 agent split.

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
