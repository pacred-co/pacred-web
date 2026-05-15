-- ════════════════════════════════════════════════════════════
-- V-C3 · cargo_containers.close_at — "ตัดตู้" forward-looking deadline
-- ════════════════════════════════════════════════════════════
-- Per docs/audit/cargo-ops-forensics-2026-05-16.md and PORT_PLAN
-- Part V row V-C3. "ตัดตู้" = warehouse cuts the container off; no
-- more shipments accepted. Customers who miss it go to the next.
--
-- Distinct from sealed_at (past-tense, set when the container is
-- actually sealed). close_at is the announced deadline before
-- sealing. Surfaced to staff as a countdown on the container detail
-- page; admin actions adminAttachShipmentToContainer +
-- adminCreateShipmentManual REJECT attachment when now() > close_at.
--
-- Nullable: legacy containers + ad-hoc containers (e.g. self-shipped)
-- don't need a deadline. Only set when warehouse staff announces one.
--
-- Additive + idempotent. (ภูม — V-C3 ภูม-lane.)
-- ════════════════════════════════════════════════════════════

alter table public.cargo_containers
  add column if not exists close_at timestamptz;

create index if not exists cargo_containers_close_at_idx
  on public.cargo_containers(close_at) where close_at is not null;

comment on column public.cargo_containers.close_at is
  'V-C3: forward-looking "ตัดตู้" deadline. After this point, adminAttachShipmentToContainer + adminCreateShipmentManual reject new shipments. Distinct from sealed_at (past-tense; set when status flips to sealed). NULL = no deadline (ad-hoc / legacy).';
