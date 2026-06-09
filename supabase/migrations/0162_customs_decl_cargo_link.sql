-- 0162 · 2026-06-09 — P3 (tax-invoice platform): bridge the freight
-- customs_declarations model to CARGO (the consolidated ใบขนรวม).
--
-- ONE customs schema serves BOTH freight + cargo (docs/research/tax-invoice-
-- platform-build-plan-2026-06-09.md §3 — "reuse the freight customs model for
-- the consolidated ใบขนรวม"). The freight declaration (mig 0057) is keyed to a
-- freight_shipment; a CARGO ใบขนรวม is keyed instead to a forwarder/cabinet.
--
-- Changes (all additive / idempotent):
--   1. relax freight_shipment_id NOT NULL → nullable (a cargo declaration has
--      no freight_shipment).
--   2. add cargo_forwarder_id (→ tb_forwarder.id) + cargo_cabinet_no (the ตู้).
--   3. CHECK: a declaration is sourced from EITHER a freight_shipment OR a cargo
--      forwarder — never neither, never both.
--   4. indexes on the cargo keys + a partial-unique "one active per forwarder".
--
-- ⚠️ The existing freight index `customs_declarations_one_active_per_shipment`
-- (partial unique on freight_shipment_id WHERE status<>'cancelled') stays
-- correct after freight_shipment_id becomes nullable — Postgres unique indexes
-- skip NULL keys, so cargo rows (freight_shipment_id IS NULL) never collide on
-- it. The cargo equivalent is added below.

-- 1) relax NOT NULL ----------------------------------------------------------
alter table public.customs_declarations
  alter column freight_shipment_id drop not null;

-- 2) cargo bridge columns ----------------------------------------------------
alter table public.customs_declarations
  add column if not exists cargo_forwarder_id integer,
  add column if not exists cargo_cabinet_no   text;

-- 3) source CHECK — exactly one of {freight_shipment, cargo_forwarder} -------
-- (drop-then-add so re-running picks up any future edit · idempotent)
alter table public.customs_declarations
  drop constraint if exists customs_declarations_source_exactly_one;
alter table public.customs_declarations
  add  constraint customs_declarations_source_exactly_one check (
    (freight_shipment_id is not null and cargo_forwarder_id is null)
    or (freight_shipment_id is null and cargo_forwarder_id is not null)
  );

-- 4) indexes -----------------------------------------------------------------
create index if not exists customs_declarations_cargo_forwarder_idx
  on public.customs_declarations(cargo_forwarder_id) where cargo_forwarder_id is not null;
create index if not exists customs_declarations_cargo_cabinet_idx
  on public.customs_declarations(cargo_cabinet_no) where cargo_cabinet_no is not null;

-- ADR-0016 mirror — at most one ACTIVE (non-cancelled) declaration per cargo
-- forwarder at any time. Re-issuance allowed after cancel (matches the freight
-- "one active per shipment" rule).
create unique index if not exists customs_declarations_one_active_per_cargo_forwarder
  on public.customs_declarations(cargo_forwarder_id)
  where cargo_forwarder_id is not null and status <> 'cancelled';

comment on column public.customs_declarations.cargo_forwarder_id is
  '2026-06-09 (mig 0162) — when set, this declaration is a CARGO ใบขนรวม keyed '
  'to tb_forwarder.id (NOT a freight_shipment). Exactly one of '
  'freight_shipment_id / cargo_forwarder_id is set (CHECK).';
comment on column public.customs_declarations.cargo_cabinet_no is
  '2026-06-09 (mig 0162) — the consolidation grain for a CARGO ใบขนรวม '
  '(tb_forwarder.fcabinetnumber · the ตู้). Informational; the authoritative key '
  'is cargo_forwarder_id.';
comment on constraint customs_declarations_source_exactly_one on public.customs_declarations is
  '2026-06-09 (mig 0162) — a declaration is sourced from EITHER a freight_shipment '
  'OR a cargo forwarder (never neither / both). Lets one customs schema serve '
  'both freight + cargo ใบขนรวม.';
