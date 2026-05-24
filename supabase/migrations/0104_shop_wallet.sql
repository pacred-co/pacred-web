-- ════════════════════════════════════════════════════════════
-- 0104 · Shop wallet (G7 production tables — Sprint-2 P1.2)
-- ════════════════════════════════════════════════════════════
-- Sprint-1 G7 shipped the actions/affiliate-shop-wallet.ts FOUNDATION
-- with stub returns (zeros + "feature not yet implemented" errors)
-- because the backing tables weren't in the pacred-web schema yet.
-- This migration adds them so the four customer-facing actions can do
-- real work:
--
--   getShopWalletSummary           ─→ SELECT balance + lifetime + pending
--                                     + available
--   listShopWalletTransactions     ─→ SELECT history page, newest first
--   transferFromPersonalToShopWallet → atomic: debit wallet.balance
--                                     (main bucket) + credit tb_wallet_shop
--   requestShopWalletWithdraw       → INSERT pending row + debit balance
--                                     immediately (admin marks completed
--                                     later via the back-office payout
--                                     console — out of scope here)
--
-- Legacy refs:
--   tb_shop_pay_h (0081 L4896-4961) — admin-created withdraw record.
--     Kept around for the historical join, but not the live shop balance
--     source. The shop balance is per-profile aggregate over the new
--     tb_shop_transactions ledger.
--
-- Schema design follows the existing `wallet` + `wallet_transactions`
-- pattern (migration 0007) — balance table + ledger + auto-recompute
-- trigger — to keep the mental model consistent. The kind enum is shop-
-- specific (`earn`, `refund`, `payment`, `withdraw`, `transfer_in`,
-- `transfer_out`, `adjustment`) so the actions match the existing G7
-- ShopWalletKind type.
--
-- RLS posture:
--   - owner-only read on both tables (profile_id = auth.uid())
--   - owner inserts ONLY status='pending' rows (transfer/withdraw paths
--     in the actions self-rate-check + atomic-debit; defence-in-depth
--     keeps this layer narrow)
--   - admin (super/ops/accounting) full read + insert/update for
--     payouts, manual adjustments, status changes
--
-- Idempotent — safe to re-run.
-- ════════════════════════════════════════════════════════════

-- ── 1) Balance table (1:1 with profile) ──────────────────────────
create table if not exists public.tb_wallet_shop (
  profile_id        uuid primary key references public.profiles(id) on delete cascade,
  -- The shop-bucket balance the customer can transfer out or withdraw.
  -- Updated by the auto-recompute trigger from completed transactions.
  balance           numeric(12,2) not null default 0,
  -- Sum of every inbound completed credit (earn + refund + transfer_in)
  -- since the customer joined. Display-only; never reduced.
  lifetime_earned   numeric(12,2) not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists tb_wallet_shop_updated_at_trigger on public.tb_wallet_shop;
create trigger tb_wallet_shop_updated_at_trigger
  before update on public.tb_wallet_shop
  for each row execute function public.set_updated_at();

-- ── 2) Transactions ledger ───────────────────────────────────────
create table if not exists public.tb_shop_transactions (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,

  -- Shop wallet kinds — narrower than the main wallet's. Mirrors the
  -- ShopWalletKind type in actions/affiliate-shop-wallet.ts.
  kind            text not null check (kind in (
                    'earn',         -- inbound: affiliate commission credited
                    'refund',       -- inbound: refunded payment back to shop wallet
                    'payment',      -- outbound: used to pay something (rare for shop)
                    'withdraw',     -- outbound: customer requested cash withdraw
                    'transfer_in',  -- inbound: from personal wallet
                    'transfer_out', -- outbound: to personal wallet (future)
                    'adjustment'    -- admin manual ±
                  )),

  -- Signed: +credit / -debit (inbound kinds are positive, outbound
  -- negative). The trigger sums these for the live balance.
  amount          numeric(12,2) not null,

  status          text not null default 'pending'
                  check (status in ('pending','completed','failed','cancelled')),

  note            text,

  -- Polymorphic link to the source — service_order for affiliate-earn,
  -- manual for adjustments, etc.
  reference_type  text check (reference_type in (
                    'service_order', 'commission', 'manual', 'withdraw_request',
                    'transfer_pair'
                  )),
  reference_id    text,

  -- Withdraw-only — bank details for the payout. Kept on the txn row so
  -- the admin payout console renders without a separate join.
  bank_name       text,
  account_name    text,
  account_number  text,
  slip_url        text,                  -- proof-of-payout slip from admin

  -- Who reviewed/processed (admin only).
  reviewed_by_admin_id  uuid references public.profiles(id) on delete set null,
  reviewed_at           timestamptz,
  rejected_reason       text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists tb_shop_transactions_profile_idx
  on public.tb_shop_transactions(profile_id, created_at desc);
create index if not exists tb_shop_transactions_pending_idx
  on public.tb_shop_transactions(status, created_at) where status = 'pending';
create index if not exists tb_shop_transactions_kind_idx
  on public.tb_shop_transactions(profile_id, kind);

drop trigger if exists tb_shop_transactions_updated_at_trigger on public.tb_shop_transactions;
create trigger tb_shop_transactions_updated_at_trigger
  before update on public.tb_shop_transactions
  for each row execute function public.set_updated_at();

-- ── 3) Auto-recompute trigger (mirrors wallet_recompute_balance) ──
-- Recomputes tb_wallet_shop.balance + lifetime_earned for the affected
-- profile after any insert/update/delete on tb_shop_transactions. Only
-- COMPLETED transactions count towards balance — pending/failed/
-- cancelled don't move money. The "pending" state intentionally locks
-- the balance though, via the available-balance calc in the action.
create or replace function public.tb_wallet_shop_recompute()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  target_profile  uuid;
  new_balance     numeric(12,2);
  new_lifetime    numeric(12,2);
begin
  if tg_op = 'DELETE' then
    target_profile := old.profile_id;
  else
    target_profile := new.profile_id;
  end if;

  -- Ensure wallet-shop row exists (idempotent upsert).
  insert into public.tb_wallet_shop (profile_id)
    values (target_profile)
    on conflict (profile_id) do nothing;

  -- Balance: sum of completed transactions only.
  select coalesce(sum(amount), 0)
    into new_balance
    from public.tb_shop_transactions
   where profile_id = target_profile
     and status     = 'completed';

  -- Lifetime earned: sum of completed inbound credits.
  select coalesce(sum(amount), 0)
    into new_lifetime
    from public.tb_shop_transactions
   where profile_id = target_profile
     and status     = 'completed'
     and kind       in ('earn', 'refund', 'transfer_in');

  update public.tb_wallet_shop
     set balance         = new_balance,
         lifetime_earned = new_lifetime
   where profile_id = target_profile;

  return null;
end;
$fn$;

drop trigger if exists tb_shop_transactions_recompute on public.tb_shop_transactions;
create trigger tb_shop_transactions_recompute
  after insert or update or delete on public.tb_shop_transactions
  for each row execute function public.tb_wallet_shop_recompute();

-- ── 4) RLS ───────────────────────────────────────────────────────
alter table public.tb_wallet_shop enable row level security;
alter table public.tb_shop_transactions enable row level security;

-- 4a) Owner reads their own balance row.
drop policy if exists tb_wallet_shop_select_own on public.tb_wallet_shop;
create policy tb_wallet_shop_select_own
  on public.tb_wallet_shop for select
  using (profile_id = auth.uid());

-- 4b) Admin (super/ops/accounting) reads all balances (payout console).
drop policy if exists tb_wallet_shop_admin_read on public.tb_wallet_shop;
create policy tb_wallet_shop_admin_read
  on public.tb_wallet_shop for select
  using (public.is_admin(array['super','ops','accounting']));

-- 4c) Owner reads their own transactions.
drop policy if exists tb_shop_transactions_select_own on public.tb_shop_transactions;
create policy tb_shop_transactions_select_own
  on public.tb_shop_transactions for select
  using (profile_id = auth.uid());

-- 4d) Owner inserts ONLY pending withdraw/transfer rows. The actions
-- atomically do the balance debit too — defence-in-depth: status MUST
-- be 'pending' at insert time (admin promotes to 'completed' later).
drop policy if exists tb_shop_transactions_insert_own on public.tb_shop_transactions;
create policy tb_shop_transactions_insert_own
  on public.tb_shop_transactions for insert
  with check (
    profile_id = auth.uid()
    and status = 'pending'
    and kind in ('withdraw', 'transfer_out')
  );

-- 4e) Admin (super/ops/accounting) full read + write for the payout
-- console. Writes via the admin actions, never directly from PostgREST.
drop policy if exists tb_shop_transactions_admin_all on public.tb_shop_transactions;
create policy tb_shop_transactions_admin_all
  on public.tb_shop_transactions for all
  using (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

-- ── 5) Grants ────────────────────────────────────────────────────
grant select on public.tb_wallet_shop to authenticated;
grant select, insert on public.tb_shop_transactions to authenticated;

-- ── 6) Comments ──────────────────────────────────────────────────
comment on table public.tb_wallet_shop is
  'Shop-wallet (affiliate / partner) balance — one row per profile. Auto-recomputed from tb_shop_transactions via trigger; never write here directly.';

comment on table public.tb_shop_transactions is
  'Shop-wallet ledger — every credit/debit on the shop bucket. Owner can INSERT pending withdraw/transfer rows; admin promotes to completed via the payout console.';

comment on column public.tb_shop_transactions.amount is
  'Signed amount: +credit (earn/refund/transfer_in) / -debit (withdraw/transfer_out/payment). The trigger sums these for the live balance.';

comment on column public.tb_shop_transactions.status is
  'pending = awaiting admin review (does not affect balance until completed); completed = balance updated; failed/cancelled = no balance impact.';
