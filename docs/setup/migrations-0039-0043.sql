-- ════════════════════════════════════════════════════════════
-- Pacred — combined migrations 0039 → 0043 (ภูม night-3 batch)
-- Generated 2026-05-16 by เดฟ
-- ════════════════════════════════════════════════════════════
-- HOW TO APPLY (เดฟ / ก๊อต — prod Supabase):
--   1. Supabase Dashboard → SQL Editor → New query
--   2. Paste this whole file → Run
--   3. "already exists" / "duplicate" notices = safe (every statement
--      is idempotent — add column IF NOT EXISTS, drop+recreate
--      constraints/indexes; safe to re-run any number of times)
--
-- PREREQUISITES: migrations 0002-0038 must already be applied.
-- This file extends:
--   - cargo_shipments     (V-D1/V-D2 columns)
--   - cargo_containers    (V-D3 + V-C3 columns)
--   - forwarders          (V-C2 column)
--   - service_orders      (V-C2 column)
--   - wallet_transactions (V-A1 column)
--   - yuan_payments       (V-A1 column)
--
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
-- 0039_cargo_shipments_cbm_per_source.sql
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- V-D1 · cargo_shipments CBM per source (received / queue / manifest)
-- ════════════════════════════════════════════════════════════
-- Per cargo-ops-forensics: real case GZE260422-1 measured 16.79 CBM
-- via "รับเข้า" (received at TH warehouse) but 21.28 CBM via "รวมคิว"
-- (queue/billed) — same container, different sources, ฿4.49 CBM diff
-- triggers customer disputes and stalls revenue.
--
-- Today: cargo_shipments has a single `volume_cbm` column. We add 3
-- per-source columns so staff can compare BEFORE billing:
--   received_cbm  — what TH warehouse measured at receive scan
--   queue_cbm     — what the queue/manifest sum told the customer (= billed)
--   manifest_cbm  — what the China-side manifest declared at packing
--
-- Backfill: existing `volume_cbm` → `manifest_cbm` (best-fit for legacy
-- imports; received/queue start NULL until staff records them).
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

alter table public.cargo_shipments
  add column if not exists received_cbm numeric(10,3),
  add column if not exists queue_cbm    numeric(10,3),
  add column if not exists manifest_cbm numeric(10,3);

-- Each source must be non-negative if set
alter table public.cargo_shipments
  drop constraint if exists cargo_shipments_received_cbm_chk,
  drop constraint if exists cargo_shipments_queue_cbm_chk,
  drop constraint if exists cargo_shipments_manifest_cbm_chk;
alter table public.cargo_shipments
  add constraint cargo_shipments_received_cbm_chk check (received_cbm is null or received_cbm >= 0),
  add constraint cargo_shipments_queue_cbm_chk    check (queue_cbm    is null or queue_cbm    >= 0),
  add constraint cargo_shipments_manifest_cbm_chk check (manifest_cbm is null or manifest_cbm >= 0);

-- Backfill: existing volume_cbm → manifest_cbm (China-side declaration
-- is the source-of-truth for legacy data we don't have receive scans for).
update public.cargo_shipments
   set manifest_cbm = volume_cbm
 where manifest_cbm is null and volume_cbm is not null;

-- Comments — surface intent in the schema
comment on column public.cargo_shipments.volume_cbm  is
  'Legacy single-source CBM. Kept for backward compat; new code should read received_cbm/queue_cbm/manifest_cbm and compute the surface diff. V-D1.';
comment on column public.cargo_shipments.received_cbm is
  'CBM measured by TH warehouse at receive scan. Source of truth for what physically arrived. V-D1.';
comment on column public.cargo_shipments.queue_cbm is
  'CBM used in the customer queue / billing sum. May differ from received_cbm if China overestimated; compare before bill dispute. V-D1.';
comment on column public.cargo_shipments.manifest_cbm is
  'CBM declared in the China-side packing manifest. Backfilled from legacy volume_cbm where missing. V-D1.';


-- ════════════════════════════════════════════════════════════
-- 0040_cargo_type_and_carrier_container.sql
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- V-D2 + V-D3 · canonical cargo_type + carrier container number
-- ════════════════════════════════════════════════════════════
-- Per docs/audit/cargo-ops-forensics-2026-05-16.md §3.3 + §4 D2/D3
-- and docs/port-specs/cargo-volume-reconciliation.md.
--
-- V-D2 — the two legacy systems tag the SAME five cargo categories
--   with DIFFERENT latin codes:
--     PCS API "Shipment Report":      A / M / X / O / Z
--     China warehouse 装柜明细 manifest: G / T / F
--   Pacred stores ONE canonical value; lib/warehouse/cargo-type.ts
--   normalises both legacy code sets onto it.
--
-- V-D3 — a container carries two identifiers: the Pacred-issued code
--   (cargo_containers.code, e.g. GZE260407-1) and the carrier's
--   physical container number on the B/L (e.g. BLOU2025012). Today
--   only the Pacred code has a column.
--
-- Additive + idempotent. (เดฟ — structural prep; ภูม wires UI + the
-- MOMO/manifest import normalisation + tests.)
--
-- NOTE: migration 0039 was taken by V-D1 (cbm-per-source); withholding
-- tax (ADR-0015 / V-A6) now lands at 0041+, not 0039.
-- ════════════════════════════════════════════════════════════

-- ── V-D2 · canonical cargo type on each shipment ────────────────────
alter table public.cargo_shipments
  add column if not exists cargo_type text;

alter table public.cargo_shipments
  drop constraint if exists cargo_shipments_cargo_type_chk;
alter table public.cargo_shipments
  add constraint cargo_shipments_cargo_type_chk
  check (cargo_type is null or cargo_type in
    ('general','electrical','food_drug','brand','controlled'));

create index if not exists cargo_shipments_cargo_type_idx
  on public.cargo_shipments(cargo_type) where cargo_type is not null;

comment on column public.cargo_shipments.cargo_type is
  'Canonical cargo category (V-D2): general/electrical/food_drug/brand/controlled. Legacy A/M/X/O/Z (PCS API) and G/T/F (China manifest) both normalise here via lib/warehouse/cargo-type.ts. NULL until set on import.';

-- ── V-D3 · carrier physical container number ────────────────────────
alter table public.cargo_containers
  add column if not exists carrier_container_no text;

create index if not exists cargo_containers_carrier_no_idx
  on public.cargo_containers(carrier_container_no) where carrier_container_no is not null;

comment on column public.cargo_containers.carrier_container_no is
  'The shipping-line / carrier physical container number from the B/L (e.g. BLOU2025012, SLVU4871649). Distinct from cargo_containers.code, which is the Pacred-issued GZE/GZS code. V-D3.';


-- ════════════════════════════════════════════════════════════
-- 0041_bill_to_name_override.sql
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- V-C2 · bill-header (buyer name) override on forwarders + service_orders
-- ════════════════════════════════════════════════════════════
-- Per docs/audit/cargo-ops-forensics-2026-05-16.md (chat "ใส่ชื่อ
-- บริษัทผู้ซื้อจริงไม่ใช่ผู้ส่งของ") + PORT_PLAN Part V row V-C2.
--
-- The customer's profile name (or corporate company_name) drives the
-- bill header by default. Real-world cases: the paying party differs
-- from the shipping recipient (group orders, agent buying for client,
-- tax-invoice nominee, etc.). Staff needs a per-order override that
-- the receipt/PDF picks up. Empty/null = use default profile/corporate
-- name (no override).
--
-- Audit: changes are recorded via admin_actions log by the new
-- adminSet*BillToOverride actions; no DB trigger needed.
--
-- Additive + idempotent. (ภูม — V-C2 ภูม-lane.)
-- ════════════════════════════════════════════════════════════

alter table public.forwarders
  add column if not exists bill_to_name_override text;

comment on column public.forwarders.bill_to_name_override is
  'V-C2: override the buyer name printed on the receipt/PDF for this forwarder. NULL = use default (ship_first_name + ship_last_name or profile/corporate). Edited by super/ops/accounting via adminSetForwarderBillToOverride; audited via admin_actions.';

alter table public.service_orders
  add column if not exists bill_to_name_override text;

comment on column public.service_orders.bill_to_name_override is
  'V-C2: override the buyer name printed on the receipt/PDF for this service_order. NULL = use default (customer profile or corporate company_name). Edited by super/ops/accounting via adminSetOrderBillToOverride; audited via admin_actions.';


-- ════════════════════════════════════════════════════════════
-- 0042_cargo_containers_close_at.sql
-- ════════════════════════════════════════════════════════════

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


-- ════════════════════════════════════════════════════════════
-- 0043_slip_transferred_at.sql
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- V-A1 · slip_transferred_at — record the customer's actual transfer
-- time (from the slip), not the admin's approval-click time.
-- ════════════════════════════════════════════════════════════
-- Per PORT_PLAN Part V row V-A1 + cargo-ops-forensics audit. Today
-- wallet_transactions.created_at gets stamped when the customer
-- submits the deposit request, and admin approvals (status flip
-- to 'completed') happen later — neither matches the bank slip's
-- timestamp. Accounting reports want to bucket by actual transfer
-- date to reconcile against bank statements.
--
-- Add slip_transferred_at to:
--   - public.wallet_transactions (covers all deposits/refunds/etc.)
--   - public.yuan_payments       (Alipay payouts)
--
-- Customer-side flow can capture this at slip upload (V2);
-- admin-side flow exposes inline editor + audits changes
-- via the new adminSet*SlipTransferredAt actions (this batch).
--
-- Additive + idempotent. (ภูม — V-A1 ภูม-lane.)
-- ════════════════════════════════════════════════════════════

alter table public.wallet_transactions
  add column if not exists slip_transferred_at timestamptz;

create index if not exists wallet_transactions_slip_transferred_at_idx
  on public.wallet_transactions(slip_transferred_at) where slip_transferred_at is not null;

comment on column public.wallet_transactions.slip_transferred_at is
  'V-A1: actual bank-transfer time as printed on the customer slip. Distinct from created_at (request time) and the implicit approval-time (when status flips to completed). NULL = not yet recorded. Editable by super/accounting via adminSetWalletTxSlipTransferredAt; audited.';

alter table public.yuan_payments
  add column if not exists slip_transferred_at timestamptz;

create index if not exists yuan_payments_slip_transferred_at_idx
  on public.yuan_payments(slip_transferred_at) where slip_transferred_at is not null;

comment on column public.yuan_payments.slip_transferred_at is
  'V-A1: actual bank-transfer time as printed on the customer slip. Same purpose as on wallet_transactions.';


-- ════════════════════════════════════════════════════════════
-- VERIFY all 5 migrations applied
-- ════════════════════════════════════════════════════════════
-- Expected: 7 rows (cbm_received, queue_cbm, manifest_cbm, cargo_type,
--                   carrier_container_no, bill_to_name_override × 2,
--                   close_at, slip_transferred_at × 2)
select table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
   and (
     (table_name = 'cargo_shipments'     and column_name in ('cbm_received','queue_cbm','manifest_cbm','cargo_type'))
     or (table_name = 'cargo_containers' and column_name in ('carrier_container_no','close_at'))
     or (table_name = 'forwarders'       and column_name = 'bill_to_name_override')
     or (table_name = 'service_orders'   and column_name = 'bill_to_name_override')
     or (table_name = 'wallet_transactions' and column_name = 'slip_transferred_at')
     or (table_name = 'yuan_payments'    and column_name = 'slip_transferred_at')
   )
 order by table_name, column_name;
