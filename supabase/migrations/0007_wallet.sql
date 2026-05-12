-- ════════════════════════════════════════════════════════════
-- Phase C1 — Wallet, cashback, credit (consolidated ledger)
-- ════════════════════════════════════════════════════════════
-- Legacy split into 5 tables that all served the same domain. We
-- collapse them to 2 tables:
--
--   tb_wallet           ─┐
--   tb_cash_back         ├──→  public.wallet (1:1, 3 balance columns)
--   tb_credit           ─┘
--
--   tb_wallet_hs        ─┐
--   tb_cash_back_hs      ├──→  public.wallet_transactions (single ledger
--   tb_wallet_paydeposit─┘                                  with bucket col)
--
-- Why merge:
-- - The 3 buckets (main / cashback / credit) have the same shape — a
--   running balance plus an append-only ledger.
-- - Legacy `tb_wallet_paydeposit` was a many-to-one link table coupling
--   a wallet entry to a service-order header; we replace it with
--   reference_type + reference_id columns on wallet_transactions
--   (polymorphic FK), which generalises to forwarder/payment refs too.
-- - `type` vs `typeNew` in tb_wallet_hs were two overlapping enums.
--   We pick one clean enum (`kind`) and add cashback_* + adjustment.
--
-- Balance maintenance: a trigger on wallet_transactions recomputes
-- the affected bucket from `sum(amount) where status='completed'`.
-- Approach trades a small write cost for ironclad consistency —
-- a "negative cashback" bug from the legacy double-entry model
-- can't happen here.
--
-- Legacy enum mapping (tb_wallet_hs.typeNew → wallet_transactions.kind):
--   1 เติมเงิน                → 'deposit'
--   2 คืนเงิน                 → 'refund'
--   3 ชำระฝากสั่ง             → 'order_payment'
--   4 ชำระฝากสั่งเติมเพิ่ม   → 'order_top_up'
--   5 ชำระนำเข้า              → 'import_payment'
--   6 ชำระเงินนำเข้าเติมเพิ่ม → 'import_top_up'
--   7 ชำระเงินฝากโอน          → 'yuan_payment'
--   (new) ถอนเงิน             → 'withdraw'
--   (cashback bucket only)    → 'cashback_earn' | 'cashback_redeem'
--   (admin only)              → 'adjustment'
-- ════════════════════════════════════════════════════════════

-- ── Balance table (1:1 with profile) ──
create table if not exists public.wallet (
  profile_id        uuid primary key references public.profiles(id) on delete cascade,
  balance           numeric(12,2) not null default 0,           -- main bucket
  cashback_balance  numeric(12,2) not null default 0,
  credit_balance    numeric(12,2) not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists wallet_updated_at_trigger on public.wallet;
create trigger wallet_updated_at_trigger
  before update on public.wallet
  for each row execute function public.set_updated_at();

-- ── Ledger ──
create table if not exists public.wallet_transactions (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,

  bucket          text not null check (bucket in ('main','cashback','credit')),
  amount          numeric(12,2) not null,                       -- signed: +credit / -debit
  kind            text not null check (kind in (
                    'deposit','withdraw','refund','adjustment',
                    'order_payment','order_top_up',
                    'import_payment','import_top_up',
                    'yuan_payment',
                    'cashback_earn','cashback_redeem'
                  )),
  status          text not null default 'pending'
                  check (status in ('pending','completed','failed','cancelled')),

  -- bank/transfer details (filled for deposit / withdraw)
  slip_url        text,                                          -- customer's slip (supabase storage path)
  slip_date       timestamptz,                                   -- date stamped on the slip
  bank_name       text,                                          -- "ธนาคารปลายทาง" for deposit, "ธนาคารผู้รับ" for withdraw
  account_name    text,
  account_number  text,

  -- polymorphic reference to whatever this txn pays for / refunds
  reference_type  text check (reference_type in (
                    'order_header','forwarder','yuan_payment','manual'
                  )),
  reference_id    text,                                          -- text because legacy hNo is a slug
  ref_top_up_id   uuid,                                          -- for top-up linked to a payment txn

  note            text,
  admin_id        text,                                          -- admin who created
  admin_id_update text,                                          -- last admin to update
  locked_until    timestamptz default now(),                     -- legacy LockDate — prevent dupe submission
  session_id      text,                                          -- legacy "เครื่องที่มาเปิดตอนนั้น"

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists wallet_tx_profile_idx
  on public.wallet_transactions(profile_id, created_at desc);

create index if not exists wallet_tx_pending_idx
  on public.wallet_transactions(status, created_at) where status = 'pending';

create index if not exists wallet_tx_reference_idx
  on public.wallet_transactions(reference_type, reference_id)
  where reference_type is not null;

drop trigger if exists wallet_tx_updated_at_trigger on public.wallet_transactions;
create trigger wallet_tx_updated_at_trigger
  before update on public.wallet_transactions
  for each row execute function public.set_updated_at();

-- ── Balance maintenance trigger ──
-- After any insert/update/delete on wallet_transactions, recompute the
-- balance for the affected (profile_id, bucket). Only completed txns
-- count towards balance — pending/failed/cancelled don't move money.
create or replace function public.wallet_recompute_balance()
returns trigger as $$
declare
  target_profile uuid;
  target_bucket  text;
  new_balance    numeric(12,2);
begin
  -- Which row was touched?
  if tg_op = 'DELETE' then
    target_profile := old.profile_id;
    target_bucket  := old.bucket;
  else
    target_profile := new.profile_id;
    target_bucket  := new.bucket;
  end if;

  -- Ensure wallet row exists (idempotent upsert)
  insert into public.wallet (profile_id)
    values (target_profile)
    on conflict (profile_id) do nothing;

  -- Recompute from completed txns
  select coalesce(sum(amount), 0)
    into new_balance
    from public.wallet_transactions
   where profile_id = target_profile
     and bucket     = target_bucket
     and status     = 'completed';

  -- Write to the appropriate column
  if target_bucket = 'main' then
    update public.wallet set balance          = new_balance where profile_id = target_profile;
  elsif target_bucket = 'cashback' then
    update public.wallet set cashback_balance = new_balance where profile_id = target_profile;
  elsif target_bucket = 'credit' then
    update public.wallet set credit_balance   = new_balance where profile_id = target_profile;
  end if;

  return null;  -- after-trigger, return ignored
end;
$$ language plpgsql;

drop trigger if exists wallet_tx_balance_trigger on public.wallet_transactions;
create trigger wallet_tx_balance_trigger
  after insert or update of amount, status, bucket or delete
  on public.wallet_transactions
  for each row execute function public.wallet_recompute_balance();

-- ── Auto-create wallet row when profile is created ──
create or replace function public.wallet_init_for_profile()
returns trigger as $$
begin
  insert into public.wallet (profile_id) values (new.id)
    on conflict (profile_id) do nothing;
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_init_wallet_trigger on public.profiles;
create trigger profiles_init_wallet_trigger
  after insert on public.profiles
  for each row execute function public.wallet_init_for_profile();

-- Backfill wallet rows for existing profiles
insert into public.wallet (profile_id)
  select id from public.profiles
  on conflict (profile_id) do nothing;

-- ════════════════════════════════════════════════════════════
-- RLS — owner-only reads; writes restricted to deposit/withdraw
-- ════════════════════════════════════════════════════════════
alter table public.wallet              enable row level security;
alter table public.wallet_transactions enable row level security;

-- wallet: read only (balance is computed; users can't write directly)
drop policy if exists "wallet_select_own" on public.wallet;
create policy "wallet_select_own" on public.wallet
  for select using (auth.uid() = profile_id);

-- wallet_transactions: select own
drop policy if exists "wallet_tx_select_own" on public.wallet_transactions;
create policy "wallet_tx_select_own" on public.wallet_transactions
  for select using (auth.uid() = profile_id);

-- wallet_transactions: insert only allowed for self-served deposits +
-- withdrawals, in pending status. Anything else (refunds, order_payment,
-- adjustments, status updates) is admin-only.
drop policy if exists "wallet_tx_insert_self_serve" on public.wallet_transactions;
create policy "wallet_tx_insert_self_serve" on public.wallet_transactions
  for insert with check (
    auth.uid() = profile_id
    and status = 'pending'
    and kind in ('deposit','withdraw')
    and bucket = 'main'
  );

-- updates: user can only update their own pending deposit/withdraw rows
-- (e.g. replace slip, edit bank info) — never flip status. Status
-- transitions are admin-only.
drop policy if exists "wallet_tx_update_own_pending" on public.wallet_transactions;
create policy "wallet_tx_update_own_pending" on public.wallet_transactions
  for update using (
    auth.uid() = profile_id
    and status = 'pending'
    and kind in ('deposit','withdraw')
  ) with check (
    auth.uid() = profile_id
    and status = 'pending'
    and kind in ('deposit','withdraw')
  );

-- no DELETE for users — soft-cancel via status='cancelled' (admin)

-- ════════════════════════════════════════════════════════════
-- Storage — 'slips' bucket for deposit/withdraw/payment slips
-- ════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('slips', 'slips', false)
on conflict (id) do nothing;

-- Path pattern: slips/{user_id}/{kind}/{filename}

drop policy if exists "slips_user_select" on storage.objects;
create policy "slips_user_select" on storage.objects
  for select using (
    bucket_id = 'slips'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "slips_user_insert" on storage.objects;
create policy "slips_user_insert" on storage.objects
  for insert with check (
    bucket_id = 'slips'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "slips_user_update" on storage.objects;
create policy "slips_user_update" on storage.objects
  for update using (
    bucket_id = 'slips'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "slips_user_delete" on storage.objects;
create policy "slips_user_delete" on storage.objects
  for delete using (
    bucket_id = 'slips'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
