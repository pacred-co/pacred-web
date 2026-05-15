-- ════════════════════════════════════════════════════════════
-- U2-4 · forwarder_cost_adjustments (post-delivery rebill)
-- ════════════════════════════════════════════════════════════
-- Per chat audit W-4 + Part U U2-4: AIR IMPORT staff regularly discovers
-- extra fees AFTER a forwarder is marked delivered (D/O fee · gateway
-- fee · weight rebill · customs extra · other). Today the flow is:
--   1. Fee discovered → quoted in LINE chat
--   2. Customer asked to top-up + slip uploaded via LINE
--   3. Admin records ad-hoc in wallet without traceable link to forwarder
--
-- This migration adds a proper post-delivery cost-adjustment ledger:
--   - One row per fee (admin can add multiple per forwarder)
--   - kind enum captures the standard categories (extensible via 'other')
--   - status: unpaid → paid (when wallet_tx debited) → cancelled
--   - Slip upload optional (admin attaches supplier invoice)
--   - Customer notified at create + at status change
--
-- V1 scope: admin-only writes; customer read-only display on receipt.
-- Customer self-pay-from-wallet path deferred (admin marks paid manually
-- by debiting wallet via /admin/wallet adjustment for now).
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

create table if not exists public.forwarder_cost_adjustments (
  id                    uuid primary key default gen_random_uuid(),
  forwarder_id          uuid not null references public.forwarders(id) on delete restrict,
  profile_id            uuid not null references public.profiles(id) on delete restrict,

  -- What kind of fee. The 5 categories cover ~95% of chat W-4 cases;
  -- 'other' is the escape hatch for one-offs.
  kind                  text not null check (kind in (
                          'do_fee',          -- ค่า D/O (delivery order)
                          'gateway_fee',     -- ค่า gateway (port/airport)
                          'weight_rebill',   -- น้ำหนักจริงต่างจากที่เคลม
                          'customs_extra',   -- ค่าใช้จ่ายศุลกากรเพิ่มเติม
                          'other'            -- อื่นๆ — ใส่รายละเอียดใน note
                        )),

  amount_thb            numeric(12,2) not null check (amount_thb > 0),
  note                  text,                            -- explanation for customer
  slip_url              text,                            -- supplier invoice/receipt path in storage

  status                text not null check (status in ('unpaid','paid','cancelled')) default 'unpaid',

  -- Bookkeeping — who added + who paid + traceability
  -- FK to profiles(id) NOT admins(profile_id) — admins has composite PK
  -- so profile_id alone isn't unique (same pattern as 0033/0034 fix).
  added_by_admin        uuid references public.profiles(id),
  paid_at               timestamptz,
  paid_via_wallet_tx_id uuid references public.wallet_transactions(id),

  cancelled_at          timestamptz,
  cancelled_by_admin    uuid references public.profiles(id),
  cancellation_reason   text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Defensive: when status='paid', paid_at + paid_via_wallet_tx_id must
  -- both be set; when cancelled, cancellation metadata must be set.
  constraint fwd_cost_paid_has_meta check (
    status <> 'paid' or (paid_at is not null and paid_via_wallet_tx_id is not null)
  ),
  constraint fwd_cost_cancelled_has_meta check (
    status <> 'cancelled' or (cancelled_at is not null and cancelled_by_admin is not null)
  )
);

create index if not exists fwd_cost_adj_forwarder_idx
  on public.forwarder_cost_adjustments(forwarder_id, created_at desc);
create index if not exists fwd_cost_adj_profile_status_idx
  on public.forwarder_cost_adjustments(profile_id, status);
create index if not exists fwd_cost_adj_unpaid_idx
  on public.forwarder_cost_adjustments(status, created_at) where status = 'unpaid';

drop trigger if exists fwd_cost_adj_updated_at_trigger on public.forwarder_cost_adjustments;
create trigger fwd_cost_adj_updated_at_trigger
  before update on public.forwarder_cost_adjustments
  for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────
-- Customer reads own (so /service-import/[fNo]/receipt can show the
-- cost-adjustment list). Admin (super/ops/accounting) full access.
alter table public.forwarder_cost_adjustments enable row level security;

drop policy if exists fwd_cost_adj_self_read on public.forwarder_cost_adjustments;
create policy fwd_cost_adj_self_read
  on public.forwarder_cost_adjustments for select
  using (profile_id = auth.uid());

drop policy if exists fwd_cost_adj_admin_all on public.forwarder_cost_adjustments;
create policy fwd_cost_adj_admin_all
  on public.forwarder_cost_adjustments for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

-- ── Comments ─────────────────────────────────────────────────────────
comment on table public.forwarder_cost_adjustments is
  'Post-delivery extra fees per forwarder (U2-4 chat W-4): D/O fee · gateway fee · weight rebill · customs extra · other. Admin-recorded; customer sees on receipt page.';
comment on column public.forwarder_cost_adjustments.kind is
  '5-value enum covers ~95% of AIR IMPORT chat W-4 cases. Use other + note for one-offs.';
comment on column public.forwarder_cost_adjustments.paid_via_wallet_tx_id is
  'When admin marks paid, link the wallet_transaction that debited the customer. Provides full money-flow trace.';
