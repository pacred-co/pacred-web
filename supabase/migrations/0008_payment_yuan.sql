-- ════════════════════════════════════════════════════════════
-- Phase C2 — Yuan transfer (ฝากโอนหยวน / Alipay / WeChat)
-- ════════════════════════════════════════════════════════════
-- Customer requests a transfer in CNY to a specified Alipay /
-- WeChat / bank target; Pacred executes the actual transfer and
-- collects the THB equivalent + service margin from the customer.
--
-- Legacy mapping (tb_payment → yuan_payments):
--   payDate            → created_at
--   payStatus 1..N     → status enum
--   payType 1..N       → channel enum (alipay / wechat / bank)
--   payDetail (text)   → recipient_detail (Alipay account, name, msg)
--   payYuan            → yuan_amount
--   payRate            → exchange_rate     (THB per 1 CNY at request)
--   payTHB             → thb_amount         (yuan_amount * exchange_rate)
--   payRateCost        → cost_rate          (admin field — internal cost)
--   payTHBCost         → cost_thb           (admin)
--   payProfitTHB       → profit_thb         (admin)
--   payDateAdmin       → executed_at
--   imagesSlip         → slip_url           (customer's THB transfer slip)
--   certifiedTrueCopy  → id_doc_url         (compliance: ID/passport)
--   imagesSlipAdmin    → admin_proof_url    (admin)
--   paydeposit         → paid_via_wallet boolean
--                        (top-up + pay in single submission — legacy
--                        "paydeposit" flag, leverages C1 ref_top_up_id)
-- ════════════════════════════════════════════════════════════

create table if not exists public.yuan_payments (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,

  -- request payload (immutable after submit)
  channel         text not null check (channel in ('alipay','wechat','bank')),
  recipient_detail text not null,                          -- account / name / message — multi-line text

  -- amounts (rate locked at request time)
  yuan_amount     numeric(12,2) not null check (yuan_amount > 0),
  exchange_rate   numeric(8,4)  not null check (exchange_rate > 0),
  thb_amount      numeric(12,2) not null check (thb_amount > 0),

  -- admin-internal cost/profit (filled when status moves to processing)
  cost_rate       numeric(8,4),
  cost_thb        numeric(12,2),
  profit_thb      numeric(12,2),

  -- payment evidence (customer)
  slip_url        text,                                    -- THB transfer slip
  id_doc_url      text,                                    -- ID / passport (anti-fraud)
  paid_via_wallet boolean not null default false,          -- true → no slip needed; debited from wallet

  -- admin proof
  admin_proof_url text,

  -- state machine
  status          text not null default 'pending'
                  check (status in ('pending','processing','completed','failed','refunded')),

  -- audit + dedupe
  admin_id        text,
  admin_id_update text,
  executed_at     timestamptz,
  locked_until    timestamptz default now(),               -- legacy payLockDate
  session_id      text,                                    -- legacy session

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists yuan_payments_profile_idx
  on public.yuan_payments(profile_id, created_at desc);

create index if not exists yuan_payments_pending_idx
  on public.yuan_payments(status, created_at)
  where status in ('pending','processing');

drop trigger if exists yuan_payments_updated_at_trigger on public.yuan_payments;
create trigger yuan_payments_updated_at_trigger
  before update on public.yuan_payments
  for each row execute function public.set_updated_at();

-- ── RLS ──
alter table public.yuan_payments enable row level security;

drop policy if exists "yuan_payments_select_own" on public.yuan_payments;
create policy "yuan_payments_select_own" on public.yuan_payments
  for select using (auth.uid() = profile_id);

-- Insert only allowed in pending status (status promotion = admin-only)
drop policy if exists "yuan_payments_insert_own" on public.yuan_payments;
create policy "yuan_payments_insert_own" on public.yuan_payments
  for insert with check (
    auth.uid() = profile_id
    and status = 'pending'
  );

-- Users can update their own pending requests (replace slip, fix typo)
-- but never flip status or change admin-internal cost fields.
drop policy if exists "yuan_payments_update_own_pending" on public.yuan_payments;
create policy "yuan_payments_update_own_pending" on public.yuan_payments
  for update using (
    auth.uid() = profile_id
    and status = 'pending'
  ) with check (
    auth.uid() = profile_id
    and status = 'pending'
  );

-- No delete; admin soft-cancels via status='refunded' or 'failed'
