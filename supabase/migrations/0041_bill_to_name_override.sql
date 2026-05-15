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
