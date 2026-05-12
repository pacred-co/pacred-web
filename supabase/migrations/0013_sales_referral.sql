-- ════════════════════════════════════════════════════════════
-- Phase F1 — Sales referral & commission ledger
-- ════════════════════════════════════════════════════════════
-- Verified against D:\xampp\htdocs\pcscargo\member\:
--   user-sales.php          — sees own-team unpaid commissions
--   report-user-sales.php   — payout slip + selected items → 'paid'
--   report-user-sales-history.php — payout history view
--
-- The legacy code hardcoded the sales-leader whitelist in PHP:
--   PCS888 → THADA.VIP team
--   PCS2000 + PCS352 → SIN.VIP team
--   PCS2678 → OOAEOM.VIP team
--   PCS4155 → SWAN team
-- We replace that with a normalised team_leaders table so any
-- profile can be elevated to leader status without a code change
-- (CLAUDE.md "Critical migration concerns" #11).
--
-- Pacred terminology:
--   team               = customer_group (an existing entity from 0009)
--   team_leader        = profile that gets commission on team's orders
--   sales_commission   = unpaid earning entry per (leader, order/forwarder)
--   sales_payout       = batch payout record (slip + bank info)
-- ════════════════════════════════════════════════════════════

-- ── team_leaders ──
-- One profile is "leader" of one customer_group. A customer_group can
-- have multiple leaders (SIN.VIP had two: PCS2000 + PCS352 in legacy).
create table if not exists public.team_leaders (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  team_code       text not null references public.customer_groups(code) on delete restrict,
  commission_pct  numeric(6,4) not null default 0.0100,   -- 1% default; 0.005 = 0.5%
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (profile_id, team_code)
);

create index if not exists team_leaders_team_code_idx
  on public.team_leaders(team_code) where is_active = true;

create index if not exists team_leaders_profile_idx
  on public.team_leaders(profile_id) where is_active = true;

drop trigger if exists team_leaders_updated_at_trigger on public.team_leaders;
create trigger team_leaders_updated_at_trigger
  before update on public.team_leaders
  for each row execute function public.set_updated_at();

-- ── sales_payouts (batched payouts) ──
create table if not exists public.sales_payouts (
  id                uuid primary key default gen_random_uuid(),
  team_leader_id    uuid not null references public.team_leaders(id) on delete restrict,
  amount_total      numeric(12,2) not null check (amount_total > 0),

  -- payout target (bank info)
  bank_name         text not null,
  account_name      text not null,
  account_number    text not null,

  -- payout evidence (admin uploads slip after wire)
  slip_url          text,
  slip_date         timestamptz,

  -- state machine
  status            text not null default 'pending'
                    check (status in ('pending','approved','paid','rejected')),
  rejection_reason  text,

  requested_at      timestamptz not null default now(),
  approved_at       timestamptz,
  paid_at           timestamptz,
  admin_id          text,

  note              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists sales_payouts_team_leader_idx
  on public.sales_payouts(team_leader_id, requested_at desc);

create index if not exists sales_payouts_pending_idx
  on public.sales_payouts(status, requested_at) where status in ('pending','approved');

drop trigger if exists sales_payouts_updated_at_trigger on public.sales_payouts;
create trigger sales_payouts_updated_at_trigger
  before update on public.sales_payouts
  for each row execute function public.set_updated_at();

-- ── sales_commissions (unpaid earning per order/forwarder) ──
create table if not exists public.sales_commissions (
  id                  uuid primary key default gen_random_uuid(),
  team_leader_id      uuid not null references public.team_leaders(id) on delete restrict,

  -- which earning generated this commission (polymorphic — exactly one)
  reference_type      text not null check (reference_type in ('forwarder','service_order')),
  reference_id        uuid not null,                         -- forwarders.id OR service_orders.id

  -- snapshot of computation at earning time (so admin can audit even if rates change)
  customer_profile_id uuid not null references public.profiles(id) on delete restrict,
  base_amount         numeric(12,2) not null,                -- the order/forwarder total at the time
  commission_pct      numeric(6,4)  not null,
  commission_amount   numeric(12,2) not null,

  -- payout linkage
  status              text not null default 'unpaid'
                      check (status in ('unpaid','paid','cancelled')),
  payout_id           uuid references public.sales_payouts(id) on delete set null,

  earned_at           timestamptz not null default now(),
  paid_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists sales_commissions_leader_status_idx
  on public.sales_commissions(team_leader_id, status, earned_at desc);

create index if not exists sales_commissions_payout_idx
  on public.sales_commissions(payout_id) where payout_id is not null;

create index if not exists sales_commissions_customer_idx
  on public.sales_commissions(customer_profile_id);

-- Prevent double-claim: same (leader, reference) pair only once
create unique index if not exists sales_commissions_unique_per_ref_idx
  on public.sales_commissions(team_leader_id, reference_type, reference_id);

drop trigger if exists sales_commissions_updated_at_trigger on public.sales_commissions;
create trigger sales_commissions_updated_at_trigger
  before update on public.sales_commissions
  for each row execute function public.set_updated_at();

-- ── Auto-commission helper ──
-- When a forwarder reaches 'delivered' or a service_order reaches
-- 'completed', look up the customer's customer_group, find any active
-- team_leaders for that group, and create a sales_commissions row.
-- Idempotent via the unique index above (re-trigger does nothing).
create or replace function public.maybe_create_sales_commission(
  p_reference_type text,
  p_reference_id   uuid,
  p_customer_id    uuid,
  p_base_amount    numeric
) returns void as $$
declare
  cust_group text;
  leader     record;
begin
  select customer_group into cust_group
    from public.profiles where id = p_customer_id;

  if cust_group is null then return; end if;

  for leader in
    select id as leader_id, commission_pct
      from public.team_leaders
     where team_code = cust_group and is_active = true
  loop
    insert into public.sales_commissions
      (team_leader_id, reference_type, reference_id,
       customer_profile_id, base_amount, commission_pct, commission_amount)
    values
      (leader.leader_id, p_reference_type, p_reference_id,
       p_customer_id, p_base_amount, leader.commission_pct,
       round(p_base_amount * leader.commission_pct, 2))
    on conflict (team_leader_id, reference_type, reference_id) do nothing;
  end loop;
end;
$$ language plpgsql security definer;

-- Auto-emit commission on forwarder delivery
create or replace function public.forwarders_emit_commission()
returns trigger as $$
begin
  if new.status = 'delivered' and (old.status is null or old.status <> 'delivered') then
    perform public.maybe_create_sales_commission(
      'forwarder', new.id, new.profile_id, new.total_price
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists forwarders_commission_trigger on public.forwarders;
create trigger forwarders_commission_trigger
  after update of status on public.forwarders
  for each row execute function public.forwarders_emit_commission();

-- Auto-emit commission on service_order completion
create or replace function public.service_orders_emit_commission()
returns trigger as $$
begin
  if new.status = 'completed' and (old.status is null or old.status <> 'completed') then
    perform public.maybe_create_sales_commission(
      'service_order', new.id, new.profile_id, new.total_thb
    );
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists service_orders_commission_trigger on public.service_orders;
create trigger service_orders_commission_trigger
  after update of status on public.service_orders
  for each row execute function public.service_orders_emit_commission();

-- ════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════
alter table public.team_leaders       enable row level security;
alter table public.sales_payouts      enable row level security;
alter table public.sales_commissions  enable row level security;

-- team_leaders: a leader can see their own role row (so the UI knows whether to show /sales)
drop policy if exists "team_leaders_select_own" on public.team_leaders;
create policy "team_leaders_select_own" on public.team_leaders
  for select using (auth.uid() = profile_id);

-- sales_commissions: leader sees own
drop policy if exists "sales_commissions_select_own" on public.sales_commissions;
create policy "sales_commissions_select_own" on public.sales_commissions
  for select using (
    exists (select 1 from public.team_leaders tl
             where tl.id = team_leader_id and tl.profile_id = auth.uid())
  );

-- sales_payouts: leader sees own payouts; INSERT only allowed when
-- creating own pending request (status=pending, all commissions belong
-- to the same leader and are unpaid — enforced at app layer)
drop policy if exists "sales_payouts_select_own" on public.sales_payouts;
create policy "sales_payouts_select_own" on public.sales_payouts
  for select using (
    exists (select 1 from public.team_leaders tl
             where tl.id = team_leader_id and tl.profile_id = auth.uid())
  );

drop policy if exists "sales_payouts_insert_own" on public.sales_payouts;
create policy "sales_payouts_insert_own" on public.sales_payouts
  for insert with check (
    status = 'pending'
    and exists (select 1 from public.team_leaders tl
                 where tl.id = team_leader_id and tl.profile_id = auth.uid())
  );

-- No customer-side updates to payouts after submit (admin-only)

-- sales_commissions: leader can update only to flip unpaid→paid via payout
-- attachment, but in practice admin handles this. Customer-side
-- requestPayout action uses service-role admin client to atomically:
-- (a) insert payout, (b) update commissions to set payout_id + status='paid'.
-- So no UPDATE policy for users.
