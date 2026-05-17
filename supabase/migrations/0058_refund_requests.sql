-- ════════════════════════════════════════════════════════════
-- U1-6 · refund_requests + next_refund_request_no() + RLS
-- ════════════════════════════════════════════════════════════
-- Per [docs/UPGRADE_PLAN.md] §1 U1-6 + [docs/research/gap-revenue-flow.md] H-3.
--
-- ── The hole ────────────────────────────────────────────────
-- Pacred has 4 scenarios that produce a customer-facing refund:
--   (1) cancel-after-paid  — admin cancels a paid forwarder / service-order
--   (2) yuan transfer refund — admin refunds a *completed* yuan_payment
--   (3) carrier-change over-collection — admin over-billed; partial refund
--   (4) customer-facing refund/claim — generic "please refund me" entry
--
-- Currently NO coherent place: each happens ad-hoc via wallet_transactions
-- kind='refund' (the kind exists in 0007 / 0061 but no centralised action
-- + no customer-visible entry). Status pages may say "refunded" while no
-- money actually moves — the gap is "status without money path"
-- (gap-revenue-flow H-3).
--
-- ── The fix (V1) ────────────────────────────────────────────
-- One refund_requests table covering all 4 cases + 5 actions
-- (customerCreateRefundRequest, adminCreateRefund, adminApproveRefund,
-- adminRejectRefund, adminMarkRefundPaid). Mark-paid is the ONLY step
-- that writes wallet_transactions (kind='refund', positive amount, credit
-- to customer's main bucket) — approve does NOT move money (decision
-- only). paid_wallet_tx_id links the audit chain so the wallet credit
-- and the refund request are inseparable.
--
-- V1 scope ships full-amount refunds only (per-request). Partial refunds
-- are modelled as "customer creates a new request for the remainder" —
-- defers a complex "refund_request_lines" model with no immediate value
-- because every legacy scenario in audit (cargo cancellation / yuan /
-- carrier over-bill) is one-shot.
--
-- ── RLS ──────────────────────────────────────────────────────
-- Customer: SELECT OWN (any status — sees history); INSERT own with
--   source !== 'manual' + status='pending' + no admin fields.
-- super + accounting: full read + write (mirror 0044 WHT pattern).
-- ops + sales_admin: read-only (so support can see refund queue without
--   ability to approve/pay).
--
-- Idempotent. Zero data migration. Safe to apply on prod live.
-- ════════════════════════════════════════════════════════════

-- 1) Daily serial counter (mirror 0048 freight_quote_seq) -------------
create table if not exists public.refund_request_seq (
  period_yymmdd text primary key,
  next_seq      int  not null default 1,
  updated_at    timestamptz not null default now()
);

-- 2) refund_requests --------------------------------------------------
create table if not exists public.refund_requests (
  id                    uuid primary key default gen_random_uuid(),
  request_no            text unique,                                  -- RF-YYMMDD-NNNN

  profile_id            uuid not null references public.profiles(id) on delete restrict,

  -- Which path does this refund come from? source_ref points at the
  -- canonical id within that domain. NULL source_ref valid only when
  -- source='manual' (admin creates a refund with no specific parent).
  source                text not null check (source in (
                          'forwarder',       -- source_ref = forwarders.f_no
                          'service_order',   -- source_ref = service_orders.h_no
                          'yuan_payment',    -- source_ref = yuan_payments.id (uuid as text)
                          'manual'           -- source_ref nullable
                        )),
  source_ref            text,                                         -- f_no / h_no / yuan_payments.id

  amount_thb            numeric(12,2) not null check (amount_thb > 0),
  reason                text not null,                                -- free text from customer ≥10 chars OR admin manual

  status                text not null default 'pending'
                          check (status in ('pending','approved','rejected','paid')),

  -- Admin decision (set on approve / reject)
  approved_by_admin_id  uuid references public.profiles(id),
  approved_at           timestamptz,
  rejected_reason       text,
  rejected_at           timestamptz,
  rejected_by_admin_id  uuid references public.profiles(id),

  -- Money actually moved (set on mark-paid)
  paid_at               timestamptz,
  paid_by_admin_id      uuid references public.profiles(id),
  paid_wallet_tx_id     uuid references public.wallet_transactions(id),

  -- Provenance: NULL = customer self-created; uuid = admin created on
  -- behalf (e.g. carrier-change over-collection refund initiated by ops).
  created_by_admin_id   uuid references public.profiles(id),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Source / source_ref XOR-ish: manual allows NULL, all others must have a ref.
  constraint refund_requests_source_ref_consistent check (
    (source = 'manual') or (source_ref is not null and char_length(source_ref) >= 1)
  ),
  -- Rejected must carry a reason (ADR-0014 audit-trail completeness).
  constraint refund_requests_rejected_has_reason check (
    status <> 'rejected'
    or (rejected_reason is not null and char_length(rejected_reason) >= 5)
  ),
  -- Approved must carry approver + timestamp.
  constraint refund_requests_approved_consistent check (
    status not in ('approved','paid')
    or (approved_by_admin_id is not null and approved_at is not null)
  ),
  -- Paid must carry pay-side metadata (timestamp + wallet tx link).
  constraint refund_requests_paid_consistent check (
    status <> 'paid'
    or (paid_at is not null and paid_wallet_tx_id is not null and paid_by_admin_id is not null)
  )
);

-- Indexes -------------------------------------------------------------
create index if not exists refund_requests_profile_idx
  on public.refund_requests(profile_id, created_at desc);
create index if not exists refund_requests_status_idx
  on public.refund_requests(status, created_at desc);
create index if not exists refund_requests_source_idx
  on public.refund_requests(source, source_ref)
  where source_ref is not null;
create index if not exists refund_requests_request_no_idx
  on public.refund_requests(request_no) where request_no is not null;

-- updated_at auto-touch.
drop trigger if exists refund_requests_updated_at_trigger on public.refund_requests;
create trigger refund_requests_updated_at_trigger
  before update on public.refund_requests
  for each row execute function public.set_updated_at();

-- 3) Atomic serial generator -----------------------------------------
-- RF-YYMMDD-NNNN with daily reset (Bangkok TZ). Mirror
-- next_freight_quote_no (0048) + next_qa_inspection_no.
create or replace function public.next_refund_request_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yymmdd text := to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD');
  seq    int;
begin
  insert into public.refund_request_seq (period_yymmdd, next_seq)
    values (yymmdd, 2)
    on conflict (period_yymmdd) do update
      set next_seq   = refund_request_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'RF-' || yymmdd || '-' || lpad(seq::text, 4, '0');
end;
$$;

revoke all     on function public.next_refund_request_no() from public, authenticated, anon;
grant  execute on function public.next_refund_request_no() to service_role;

-- 4) RLS --------------------------------------------------------------
alter table public.refund_requests    enable row level security;
alter table public.refund_request_seq enable row level security;

-- Customer reads OWN (any status — sees their refund history).
drop policy if exists refund_requests_self_read on public.refund_requests;
create policy refund_requests_self_read
  on public.refund_requests for select
  using (profile_id = auth.uid());

-- Customer INSERTs own — only for non-manual sources (manual is admin-only),
-- only in pending status, no admin fields set, not created-by-admin.
-- This is the gate that keeps a customer from forging an "already approved
-- to be paid" row.
drop policy if exists refund_requests_self_insert on public.refund_requests;
create policy refund_requests_self_insert
  on public.refund_requests for insert
  with check (
    profile_id = auth.uid()
    and status = 'pending'
    and source in ('forwarder','service_order','yuan_payment')
    and source_ref is not null
    and approved_by_admin_id is null
    and approved_at           is null
    and rejected_reason       is null
    and rejected_at           is null
    and rejected_by_admin_id  is null
    and paid_at               is null
    and paid_wallet_tx_id     is null
    and paid_by_admin_id      is null
    and created_by_admin_id   is null
  );

-- Admin read (super + ops + accounting + sales_admin so support can see
-- the queue). Writes restricted to super + accounting (the money side).
drop policy if exists refund_requests_admin_read on public.refund_requests;
create policy refund_requests_admin_read
  on public.refund_requests for select
  using (public.is_admin(array['super','accounting','ops','sales_admin']));

drop policy if exists refund_requests_admin_write on public.refund_requests;
create policy refund_requests_admin_write
  on public.refund_requests for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- Seq table admin-only (generator fn bypasses via security definer).
drop policy if exists refund_request_seq_admin_all on public.refund_request_seq;
create policy refund_request_seq_admin_all
  on public.refund_request_seq for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- 5) Comments ---------------------------------------------------------
comment on table  public.refund_requests is
  'U1-6 — refund money path. One row per customer-facing refund request. Status: pending → approved → paid (terminal) | pending → rejected (terminal). The mark-paid step writes wallet_transactions kind=refund credit and stores the tx id in paid_wallet_tx_id. See [docs/UPGRADE_PLAN.md] §1 U1-6.';
comment on column public.refund_requests.request_no is
  'Format RF-YYMMDD-NNNN. Reserved at insert time via next_refund_request_no().';
comment on column public.refund_requests.source is
  'forwarder | service_order | yuan_payment | manual. manual is admin-only (customer INSERT policy excludes it).';
comment on column public.refund_requests.source_ref is
  'f_no | h_no | yuan_payments.id (uuid::text). NULL only when source=manual.';
comment on column public.refund_requests.status is
  'pending → approved → paid (terminal) | pending → rejected (terminal). Approve does NOT move money; mark-paid writes the wallet credit.';
comment on column public.refund_requests.paid_wallet_tx_id is
  'FK to the wallet_transactions row (kind=refund, positive amount credit) created on mark-paid. Set transactionally so the refund_request and the wallet credit are inseparable.';
comment on column public.refund_requests.created_by_admin_id is
  'NULL = customer self-created (RLS-scoped). uuid = admin-created on behalf (e.g. carrier-change over-collection).';

comment on constraint refund_requests_source_ref_consistent on public.refund_requests is
  'source=manual allows NULL source_ref. All other sources MUST have a ref pointing at f_no / h_no / yuan_payments.id.';
comment on constraint refund_requests_rejected_has_reason on public.refund_requests is
  'rejected status MUST carry a reason ≥5 chars (audit completeness — ADR-0014 pattern).';
comment on constraint refund_requests_approved_consistent on public.refund_requests is
  'approved/paid status MUST have approver + timestamp populated.';
comment on constraint refund_requests_paid_consistent on public.refund_requests is
  'paid status MUST have paid_at + paid_wallet_tx_id + paid_by_admin_id — the money credit cannot be detached from the request.';

comment on function public.next_refund_request_no() is
  'U1-6 — atomic RF-YYMMDD-NNNN serial generator with daily counter reset (Bangkok TZ). Concurrent calls serialise on upsert lock.';
