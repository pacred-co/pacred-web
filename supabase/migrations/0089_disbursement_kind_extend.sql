-- ════════════════════════════════════════════════════════════
-- 0089 · container_disbursements.kind — add 'container_lease'
-- ════════════════════════════════════════════════════════════
-- D1 Phase-B sidebar fidelity audit Wave-A
-- (docs/research/sidebar-fidelity-audit/02-wallet-withdrawal-pattern.md
--  §3 + §5.1c) — the legacy ค่าตู้สินค้า ("container cost") sidebar
-- item points at /admin/accounting/disbursements?kind=container, but the
-- CHECK enum on container_disbursements.kind (migration 0069 lines
-- 139-147) does NOT include 'container' (or 'container_lease'), so the
-- query returns 0 rows even when ค่าตู้ AP exists. Staff click the
-- sidebar badge → land on an empty list → workflow breaks.
--
-- "ค่าตู้" semantically ≠ 'trucking' (trucking is line-haul cost; the
-- container lease/rental fee is a separate spend bucket the carrier or
-- equipment vendor charges) — so this migration adds 'container_lease'
-- as its own enum value, additive + non-destructive.
--
-- The companion ?kind=thai-freight sidebar item (audit §3 row 86) is
-- INTENTIONALLY not added — the audit recommends rewiring its sidebar
-- href to ?kind=trucking (already in the enum) since 'trucking' already
-- means "domestic THB trucking (TH-side)" per the 0069 comment. The
-- href rewire is Agent-1's scope (lib/admin/sidebar-menu.ts).
--
-- ⚠️  COORDINATION NOTE — numbered 0089, NOT 0088
-- Wave-A originally drafted as '0088' but pre-emptively bumped to '0089'
-- to reserve the 0088 slot for เดฟ's planned Wave-2
-- '0088_pcs_profiles_backfill' (per docs/research/wave-1-fidelity/
-- _SYNTHESIS.md §8 — the higher-stakes 8,892-ghost-customer fix).
-- This migration is idempotent + has no forward dependency, so it's
-- safely renumberable if the order ever needs to shift again.
--
-- ── Idempotency ─────────────────────────────────────────────
-- DROP-then-recreate the unnamed inline constraint. Postgres auto-names
-- it 'container_disbursements_kind_check' from the table+column.
-- 'drop ... if exists' makes re-runs no-ops; the new constraint is the
-- old set + 'container_lease'.
-- ════════════════════════════════════════════════════════════

alter table public.container_disbursements
  drop constraint if exists container_disbursements_kind_check;

alter table public.container_disbursements
  add constraint container_disbursements_kind_check check (kind in (
    'freight',         -- main shipping (the carrier's freight bill)
    'customs_duty',    -- import duty + VAT at clearance
    'handling',        -- THC, port handling, warehouse-in/out fees
    'fuel',            -- standalone fuel surcharge (when not baked into freight)
    'storage',         -- ค่าเช่า / demurrage / detention (slot rental at port)
    'trucking',        -- domestic THB trucking (CN-side OR TH-side)
    'container_lease', -- 🆕 ค่าตู้สินค้า — container/equipment lease fee paid to carrier
    'other'            -- everything else; free-text note required
  ));

comment on constraint container_disbursements_kind_check
  on public.container_disbursements is
  'AP outflow categories. ''container_lease'' added 0089 to support the legacy ค่าตู้สินค้า sidebar bucket (separate from ''trucking'' which is line-haul; lease is the container-rental spend).';
