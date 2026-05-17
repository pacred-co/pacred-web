-- ════════════════════════════════════════════════════════════
-- Phase B QoL · U4-3a delivery ack + U4-3b yuan tax-invoice
-- ════════════════════════════════════════════════════════════
-- Per docs/STRATEGY.md + docs/UPGRADE_PLAN.md §4 (U4-3).
--
-- Today both `forwarders.delivered` and `service_orders.completed`
-- are terminal read-only states. The customer has no way to confirm
-- "ของถึงครบจริง" — which:
--   1. Leaves a quality-control gap (no proof the delivery was OK).
--   2. Forces every dispute to escalate via LINE / phone.
--   3. Hides "successful delivery" metric from any future dashboard
--      (currently we know the courier dropped it off, not that the
--      buyer received what they expected).
--
-- ── Schema (this migration) ───────────────────────────────
--   forwarders.acknowledged_at     timestamptz NULL
--   forwarders.acknowledged_note   text        NULL
--   service_orders.acknowledged_at timestamptz NULL
--   service_orders.acknowledged_note text      NULL
--
-- ── RLS ───────────────────────────────────────────────────
-- We do NOT need new policies. The existing customer-self-update
-- policies on forwarders + service_orders already gate UPDATEs to
-- profile_id = auth.uid(). The customer action layer
-- (customerAcknowledgeForwarderDelivery / *ServiceOrderDelivery)
-- restricts the write to ack columns only AND to status=delivered/
-- completed AND to acknowledged_at IS NULL (idempotent).
--
-- ── Idempotent · zero data migration · additive ───────────
-- All four new columns are nullable. Existing rows stay unchanged;
-- ack columns simply remain NULL until the customer presses the
-- button. No backfill needed (we cannot infer past acks).
-- ════════════════════════════════════════════════════════════

-- ── 1) forwarders ─────────────────────────────────────────
alter table public.forwarders
  add column if not exists acknowledged_at   timestamptz,
  add column if not exists acknowledged_note text;

comment on column public.forwarders.acknowledged_at is
  'U4-3a — when the customer pressed "ยืนยันรับสินค้าครบถ้วน" on /service-import/[fNo] after status=delivered. NULL = not yet acknowledged.';
comment on column public.forwarders.acknowledged_note is
  'U4-3a — optional free-text note the customer added when acknowledging delivery (e.g. "ของครบดี" / "กล่อง 3 บุบเล็กน้อย"). NULL when ack not pressed or pressed without a note.';

-- ── 2) service_orders ─────────────────────────────────────
alter table public.service_orders
  add column if not exists acknowledged_at   timestamptz,
  add column if not exists acknowledged_note text;

comment on column public.service_orders.acknowledged_at is
  'U4-3a — when the customer pressed "ยืนยันรับสินค้าครบถ้วน" on /service-order/[hNo] after status=completed. NULL = not yet acknowledged.';
comment on column public.service_orders.acknowledged_note is
  'U4-3a — optional free-text note the customer added when acknowledging delivery. NULL when ack not pressed or pressed without a note.';

-- ════════════════════════════════════════════════════════════
-- U4-3b — tax invoices can now point to a yuan_payment
-- ════════════════════════════════════════════════════════════
-- Today `requestTaxInvoice` (actions/tax-invoices.ts) only accepts
-- `forwarder` or `service_order` as parent. ฝากโอน (yuan_payment)
-- juristic customers cannot get a tax invoice for the THB they paid
-- to Pacred for the transfer — gap on the books.
--
-- ── Schema (additive, nullable) ───────────────────────────
--   tax_invoices.yuan_payment_id  uuid NULL
--   tax_invoices_one_parent_order check — RELAXED to allow exactly
--     one of (order_h_no | forwarder_f_no | yuan_payment_id) to be
--     non-null.
--   tax_invoice_one_per_yuan_uidx — at most one non-cancelled
--     invoice per yuan_payment (RD Code 86 numbering safety).
--
-- Existing rows: pre-migration rows are guaranteed to point to one
-- of (order_h_no | forwarder_f_no) by the old constraint, so they
-- already satisfy the new "exactly one of three" rule (yuan_payment_id
-- starts NULL on every existing row).

alter table public.tax_invoices
  add column if not exists yuan_payment_id uuid
    references public.yuan_payments(id) on delete restrict;

comment on column public.tax_invoices.yuan_payment_id is
  'U4-3b — parent yuan_payments.id when the tax invoice is for a ฝากโอน transaction. Mutually exclusive with order_h_no + forwarder_f_no (see tax_invoices_one_parent_order).';

-- Relax the one-parent-order check to allow yuan_payment_id as a
-- third option. We DROP + ADD because Postgres lacks ALTER CHECK.
alter table public.tax_invoices
  drop constraint if exists tax_invoices_one_parent_order;

alter table public.tax_invoices
  add constraint tax_invoices_one_parent_order check (
    (case when order_h_no       is not null then 1 else 0 end +
     case when forwarder_f_no   is not null then 1 else 0 end +
     case when yuan_payment_id  is not null then 1 else 0 end) = 1
  );

comment on constraint tax_invoices_one_parent_order on public.tax_invoices is
  'U4-3b — each tax invoice must point to exactly one parent: a service_order (order_h_no) OR a forwarder (forwarder_f_no) OR a yuan_payment (yuan_payment_id). Not zero, not two, not three.';

-- Partial-unique guard mirroring 0061 — at most one non-cancelled
-- tax invoice per yuan_payment, RD Code 86 numbering safety.
create unique index if not exists tax_invoice_one_per_yuan_uidx
  on public.tax_invoices (yuan_payment_id)
  where yuan_payment_id is not null and status <> 'cancelled';

comment on index public.tax_invoice_one_per_yuan_uidx is
  'U4-3b — at most one non-cancelled tax invoice per yuan_payment.id. requestTaxInvoice catches 23505 + re-SELECTs idempotently.';

-- Lookup index for the yuan-side join.
create index if not exists tax_invoices_yuan_payment_idx
  on public.tax_invoices(yuan_payment_id)
  where yuan_payment_id is not null;

-- ── 3) Verify (zero-row count expected) ───────────────────
do $u43a$
declare
  fwd_already int;
  ord_already int;
begin
  -- Defensive sanity check — no existing rows should have ack already
  -- set (we just added the columns). This is purely an instrumentation
  -- check the migration ran end-to-end without an interleaved write.
  select count(*) into fwd_already
    from public.forwarders
   where acknowledged_at is not null;

  select count(*) into ord_already
    from public.service_orders
   where acknowledged_at is not null;

  raise notice
    'U4-3a verify: forwarders.acknowledged_at pre-existing rows = %, service_orders.acknowledged_at pre-existing rows = % (both expected 0 on fresh column add).',
    fwd_already, ord_already;
end
$u43a$;
