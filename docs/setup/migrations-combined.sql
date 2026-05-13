-- ════════════════════════════════════════════════════════════
-- Pacred — combined migrations 0002 → 0021
-- Generated 2026-05-13 10:49
-- Run after schema.sql
-- ════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════
-- 0002_orders.sql
-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- Demo: Orders feature (Phase 5 reference)
-- This file shows the pattern for adding new tables to the system.
-- Run after schema.sql in Supabase SQL Editor.
-- ════════════════════════════════════════════════════════════

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  service_type  text not null check (service_type in ('import','export','clear','customs','order','payment')),
  origin        text,
  destination   text,
  description   text,
  status        text not null default 'pending' check (status in ('pending','processing','shipped','delivered','cancelled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists orders_user_id_idx on public.orders(user_id);
create index if not exists orders_status_idx on public.orders(status);

-- updated_at trigger reuses the function defined in schema.sql
drop trigger if exists orders_updated_at_trigger on public.orders;
create trigger orders_updated_at_trigger
  before update on public.orders
  for each row execute function public.set_updated_at();

-- RLS — own-rows policies
alter table public.orders enable row level security;

drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own" on public.orders
  for select using (auth.uid() = user_id);

drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders
  for insert with check (auth.uid() = user_id);

drop policy if exists "orders_update_own" on public.orders;
create policy "orders_update_own" on public.orders
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "orders_delete_own" on public.orders;
create policy "orders_delete_own" on public.orders
  for delete using (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- 0003_profiles_extended.sql
-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- Phase B1 — Extend profiles with customer-facing columns
-- ════════════════════════════════════════════════════════════
-- Adds the legacy tb_users columns we still need on profiles, plus
-- prep columns for LINE Messaging API push (ADR-0001) and Phase D/E
-- linkages (sales admin, customer group, freight type).
--
-- Run after 0002_orders.sql in Supabase SQL Editor.
--
-- Legacy column mapping (tb_users → profiles):
--   userSex            → sex
--   userBirthday       → birthday
--   userLastLogin      → last_login_at
--   userRegisterWith   → register_with   ('PCS'→'email', 'F'→'facebook', 'L'→'line')
--   userPicture        → avatar_url
--   userLineID         → line_id          (user-typed chat ID, ≠ line_user_id)
--   userFacebook       → facebook_url
--   coID DEFAULT 'PCS' → customer_group DEFAULT 'PR' (Pacred general)
--   adminID            → admin_id
--   adminIDSale        → sales_admin_id
--   userRecom          → recommended_by
--   userTransportType  → transport_type
--   userShipBy         → ship_by
--   userPayMethod 1/2  → pay_method ('origin'/'destination')
--   userNote           → note
--   userActive 0/1     → is_active boolean
--   userLineIDOA       → line_user_id     (LINE Messaging API push target — ADR-0001)
--   shopUser 1         → shop_user boolean
--   channel            → referral_channel
--   companyCustomer 1/2 → freight_type ('seafreight'/'cargo')
--   userComparison*    → comparison_enabled / comparison_value
--   userCredit*        → credit_enabled / credit_limit / credit_days
--   userLineNotify     → DROPPED — LINE Notify EOL (ADR-0001)
--   pcs_logged         → DROPPED — Supabase JWT replaces
--   userCompany        → DROPPED — derived from account_type='juristic'
-- ════════════════════════════════════════════════════════════

alter table public.profiles
  -- demographics
  add column if not exists sex              text     check (sex in ('male','female','other')),
  add column if not exists birthday         date,
  add column if not exists last_login_at    timestamptz,

  -- onboarding origin
  add column if not exists register_with    text     check (register_with in ('email','facebook','google','line')),
  add column if not exists referral_channel text,
  add column if not exists recommended_by   text,

  -- profile media + social
  add column if not exists avatar_url       text,
  add column if not exists line_id          text,
  add column if not exists facebook_url     text,

  -- LINE Messaging API push (ADR-0001) — populated when user links LINE in /profile
  add column if not exists line_user_id     text,
  add column if not exists line_linked_at   timestamptz,
  add column if not exists notify_channels  jsonb    not null default '{"line": true, "email": true}'::jsonb,

  -- customer classification (Pacred replaces legacy coID='PCS')
  add column if not exists customer_group   text     not null default 'PR',
  add column if not exists freight_type     text     check (freight_type in ('seafreight','cargo')),
  add column if not exists shop_user        boolean  not null default false,

  -- admin linkage
  add column if not exists admin_id         text,
  add column if not exists sales_admin_id   text,

  -- shipping preferences (used by service-import in Phase D)
  add column if not exists transport_type   text,
  add column if not exists ship_by          text,
  add column if not exists pay_method       text     check (pay_method in ('origin','destination')),

  -- credit + comparison (used by service-import in Phase D)
  add column if not exists comparison_enabled boolean not null default false,
  add column if not exists comparison_value   numeric(10,2) not null default 0,
  add column if not exists credit_enabled     boolean not null default false,
  add column if not exists credit_limit       numeric(10,2) not null default 0,
  add column if not exists credit_days        integer not null default 0,

  -- free-form
  add column if not exists note             text,

  -- activation gate (was userActive 1=used)
  add column if not exists is_active        boolean  not null default false;

-- ── Constraints ──
-- One LINE account links to at most one profile. NULLs allowed (multiple users without LINE link).
create unique index if not exists profiles_line_user_id_idx
  on public.profiles(line_user_id) where line_user_id is not null;

-- ── Indexes for common admin queries (Phase G later, but cheap to add now) ──
create index if not exists profiles_customer_group_idx on public.profiles(customer_group);
create index if not exists profiles_sales_admin_id_idx on public.profiles(sales_admin_id) where sales_admin_id is not null;

-- ── Backfill register_with for existing rows ──
-- Existing rows came in via email/Google/Facebook OAuth; default to 'email' if unknown.
update public.profiles
   set register_with = 'email'
 where register_with is null;


-- ════════════════════════════════════════════════════════════
-- 0004_corporate.sql
-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- Phase B2 — Juristic company details (1:1 with profiles)
-- ════════════════════════════════════════════════════════════
-- Only present for profiles where account_type='juristic'. Stores
-- the company-affidavit / VAT-doc references and DBD lookup data.
--
-- Legacy mapping (tb_corporate → corporate):
--   userID                          → profile_id (FK uuid)
--   corporateNumber                 → tax_id          (also kept on profiles for quick lookup)
--   corporateName                   → company_name
--   corporateAddress                → company_address
--   corporateFile (หนังสือรับรอง)    → document refs (see documents table — doc_type='company_affidavit')
--   corporateFile20 (ภพ20)          → document refs (doc_type='vat')
--   cpDateCreate                    → created_at
--   corporateStatus 0/1             → status enum
--
-- Documents are stored via the existing public.documents table
-- (member-docs bucket) — this table just holds the metadata + DBD
-- verification state.
-- ════════════════════════════════════════════════════════════

create table if not exists public.corporate (
  profile_id        uuid primary key references public.profiles(id) on delete cascade,

  -- DBD juristic-person fields (mirrors legacy tb_corporate)
  tax_id            text not null,
  company_name      text not null,
  company_address   text,

  -- Verification state — DBD lookup or admin manual approve
  status            text not null default 'pending'
                    check (status in ('pending','verified','rejected')),
  verified_at       timestamptz,
  verified_by       text,                                 -- admin_id, manual approve
  rejection_reason  text,

  -- DBD response cache (for re-display, audit, anti-tampering)
  dbd_payload       jsonb,
  dbd_fetched_at    timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Tax-id uniqueness for verified rows only (legacy allowed duplicates
-- because some records were drafts; we mirror that flexibility)
create unique index if not exists corporate_tax_id_verified_idx
  on public.corporate(tax_id) where status = 'verified';

create index if not exists corporate_status_idx on public.corporate(status);

-- updated_at trigger
drop trigger if exists corporate_updated_at_trigger on public.corporate;
create trigger corporate_updated_at_trigger
  before update on public.corporate
  for each row execute function public.set_updated_at();

-- ── RLS — owner-only ──
alter table public.corporate enable row level security;

drop policy if exists "corporate_select_own" on public.corporate;
create policy "corporate_select_own" on public.corporate
  for select using (auth.uid() = profile_id);

drop policy if exists "corporate_insert_own" on public.corporate;
create policy "corporate_insert_own" on public.corporate
  for insert with check (auth.uid() = profile_id);

drop policy if exists "corporate_update_own" on public.corporate;
create policy "corporate_update_own" on public.corporate
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- delete is admin-only (no policy = denied for users)

-- ── Guard: corporate row requires account_type='juristic' ──
-- Enforced via trigger because account_type lives on profiles.
create or replace function public.guard_corporate_account_type()
returns trigger as $$
declare
  acct_type text;
begin
  select account_type into acct_type
    from public.profiles
   where id = new.profile_id;

  if acct_type is null then
    raise exception 'corporate.profile_id % not found in profiles', new.profile_id;
  end if;

  if acct_type <> 'juristic' then
    raise exception 'corporate row requires profiles.account_type = juristic (got %)', acct_type;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists corporate_guard_account_type on public.corporate;
create trigger corporate_guard_account_type
  before insert or update on public.corporate
  for each row execute function public.guard_corporate_account_type();


-- ════════════════════════════════════════════════════════════
-- 0005_addresses.sql
-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- Phase B3 — Shipping addresses + default-flag + soft delete
-- ════════════════════════════════════════════════════════════
-- Legacy mapping (tb_address + tb_address_main → addresses):
--   addressID           → id (uuid, replaces bigint pk)
--   userID              → profile_id (FK uuid)
--   addressName         → first_name
--   addressLastname     → last_name
--   addressTel          → phone
--   addressTel2         → phone2
--   addressNo           → address_line       (บ้านเลขที่ + ถนน รวมในบรรทัดเดียว)
--   addressSubDistrict  → sub_district
--   addressDistrict     → district
--   addressProvince     → province
--   addressZIPCode      → postal_code
--   addressNote         → note
--   addressStatus 1/0   → deleted_at (soft-delete via timestamp NULL=active)
--   latitude/longitude  → latitude/longitude (kept)
--   adminID             → created_by_admin   (nullable — null when self-served)
--
-- tb_address_main (separate 1:1) collapsed into is_default boolean
-- + partial unique index → exactly one active default per profile.
--
-- tb_address_maomao_free (free-shipping pricing buckets) NOT ported —
-- handled at rate-calc time in Phase D via rates tables (10_rates.sql).
-- ════════════════════════════════════════════════════════════

create table if not exists public.addresses (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,

  -- contact
  first_name      text not null,
  last_name       text not null,
  phone           text not null,
  phone2          text,

  -- thai postal address
  address_line    text not null,
  sub_district    text not null,
  district        text not null,
  province        text not null,
  postal_code     text not null,
  note            text,

  -- map pin (optional — used by forwarder pickup in Phase D)
  latitude        numeric(10,8),
  longitude       numeric(11,8),

  -- default flag (replaces tb_address_main)
  is_default      boolean not null default false,

  -- audit
  created_by_admin text,                                  -- admin_id if created on behalf of user
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz                              -- soft delete (NULL = active)
);

-- ── Indexes ──
create index if not exists addresses_profile_id_idx
  on public.addresses(profile_id) where deleted_at is null;

-- Exactly one default per profile (only among active addresses)
create unique index if not exists addresses_one_default_per_profile_idx
  on public.addresses(profile_id) where is_default = true and deleted_at is null;

create index if not exists addresses_province_idx
  on public.addresses(province) where deleted_at is null;

-- ── updated_at trigger ──
drop trigger if exists addresses_updated_at_trigger on public.addresses;
create trigger addresses_updated_at_trigger
  before update on public.addresses
  for each row execute function public.set_updated_at();

-- ── Auto-promote first address to default ──
-- If a profile has no default address yet, the next insert/un-delete
-- becomes the default automatically (parity with legacy UX where
-- the first address registered was implicitly the main one).
create or replace function public.addresses_auto_default()
returns trigger as $$
begin
  if new.deleted_at is null and new.is_default = false then
    if not exists (
      select 1 from public.addresses
       where profile_id = new.profile_id
         and is_default = true
         and deleted_at is null
         and id <> new.id
    ) then
      new.is_default := true;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists addresses_auto_default_trigger on public.addresses;
create trigger addresses_auto_default_trigger
  before insert or update of deleted_at, is_default on public.addresses
  for each row execute function public.addresses_auto_default();

-- ── Prevent setting default on a soft-deleted address ──
-- (Belt-and-braces: legacy bug allowed 'main' to point at addressStatus=0
-- entries. We enforce at DB level so the front-end can't trigger it.)
alter table public.addresses
  drop constraint if exists addresses_default_requires_active;
alter table public.addresses
  add constraint addresses_default_requires_active
  check (not (is_default = true and deleted_at is not null));

-- ── RLS — owner-only ──
alter table public.addresses enable row level security;

drop policy if exists "addresses_select_own" on public.addresses;
create policy "addresses_select_own" on public.addresses
  for select using (auth.uid() = profile_id);

drop policy if exists "addresses_insert_own" on public.addresses;
create policy "addresses_insert_own" on public.addresses
  for insert with check (auth.uid() = profile_id);

drop policy if exists "addresses_update_own" on public.addresses;
create policy "addresses_update_own" on public.addresses
  for update using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

-- No DELETE policy — UI must soft-delete via update deleted_at = now()


-- ════════════════════════════════════════════════════════════
-- 0006_tos_acceptance.sql
-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- Phase B6 — TOS (Terms of Service) acceptance gate
-- ════════════════════════════════════════════════════════════
-- Legacy mapping: tb_terms_service (per-user version log) → two
-- columns on profiles. We don't need the full history at the
-- customer side; if compliance ever needs an audit trail, add a
-- terms_acceptance_log table in admin phase (G).
--
-- The current TOS version is a constant in lib/tos.ts (CURRENT_TOS_
-- VERSION). When marketing publishes new terms, bump the constant
-- and every existing user sees the acceptance modal on next login.
-- ════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists tos_accepted_version text,
  add column if not exists tos_accepted_at      timestamptz;


-- ════════════════════════════════════════════════════════════
-- 0007_wallet.sql
-- ════════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════════
-- 0008_payment_yuan.sql
-- ════════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════════
-- 0009_rates.sql
-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- Phase D1 — Rates + customer groups + settings singleton
-- ════════════════════════════════════════════════════════════
-- Legacy collapse strategy:
--
-- tb_co                → customer_groups (lookup table)
-- tb_settings (90+ cols!) → settings (singleton; only customer-side
--                            knobs; admin warehouse-cost defaults
--                            stay in admin_settings — Phase G)
-- tb_rate_g_kg / cbm   → rate_general (with 3-tier pricing)
-- tb_rate_vip_kg / cbm → rate_vip (flat rate)
-- tb_rate_custom_kg / cbm     → rate_custom_user (per-user override)
-- tb_hs_rate_custom_kg / cbm  → rate_custom_hs (per-user × HS code,
--                                most granular — admin-managed, Phase G)
--
-- All 4 rate tables share the same axis schema:
--   (customer_group | profile_id, source_warehouse, transport_type,
--    product_type, basis ['kg'|'cbm']) → rate value
--
-- Waterfall lookup order in lib/forwarder/calc-price.ts (D3):
--   rate_custom_hs → rate_custom_user → rate_vip → rate_general
--
-- Legacy enum mappings (preserved as-is for Phase D scope; rename
-- only where the legacy code was numeric-cryptic):
--   sourceWarehouse 1/2 → 'guangzhou' / 'yiwu'
--   transportType   1/2/3 → 'truck' / 'ship' / 'air'
--   productType    1/2/3/4 → 'general' / 'tisi' / 'fda' / 'special'
--                            (มอก / อย / พิเศษ)
-- ════════════════════════════════════════════════════════════

-- ── customer_groups ──
create table if not exists public.customer_groups (
  code        text primary key,
  name        text not null,
  is_active   boolean not null default true,
  is_vip      boolean not null default false,
  created_at  timestamptz not null default now()
);

insert into public.customer_groups (code, name, is_vip) values
  ('PR',   'Pacred ลูกค้าทั่วไป',  false),
  ('SVIP', 'Super VIP',            true),
  ('VIP',  'VIP',                  true)
on conflict (code) do nothing;

-- ── settings singleton ──
create table if not exists public.settings (
  id                          int primary key default 1,
  service_fee                 numeric(10,2) not null default 50,   -- +50 บาท PCS service fee
  juristic_discount_threshold numeric(10,2) not null default 1000, -- ≥1000 baht
  juristic_discount_pct       numeric(6,4)  not null default 0.01, -- 1% off
  qc_fee_per_item             numeric(10,2) not null default 5,
  crate_fee_base              numeric(10,2) not null default 100,
  free_shipping_enabled       boolean       not null default false,
  free_shipping_threshold     numeric(10,2),
  yuan_rate                   numeric(8,4)  not null default 5.0,  -- supersedes NEXT_PUBLIC_YUAN_RATE env
  -- domestic transport per ship_by/warehouse — JSON for flexibility
  domestic_costs              jsonb         not null default '{}'::jsonb,
  updated_at                  timestamptz   not null default now(),
  constraint settings_singleton check (id = 1)
);

insert into public.settings (id) values (1) on conflict do nothing;

drop trigger if exists settings_updated_at_trigger on public.settings;
create trigger settings_updated_at_trigger
  before update on public.settings
  for each row execute function public.set_updated_at();

-- ── rate_general (tiered) ──
create table if not exists public.rate_general (
  id                uuid primary key default gen_random_uuid(),
  customer_group    text not null default 'PR' references public.customer_groups(code) on delete restrict,
  source_warehouse  text not null check (source_warehouse in ('guangzhou','yiwu')),
  transport_type    text not null check (transport_type   in ('truck','ship','air')),
  product_type      text not null check (product_type     in ('general','tisi','fda','special')),
  basis             text not null check (basis            in ('kg','cbm')),
  tier1             numeric(10,2),                            -- เรทตั้งต้น
  tier2             numeric(10,2),
  tier3             numeric(10,2),
  admin_id_update   text,
  updated_at        timestamptz not null default now(),
  unique (customer_group, source_warehouse, transport_type, product_type, basis)
);

drop trigger if exists rate_general_updated_at_trigger on public.rate_general;
create trigger rate_general_updated_at_trigger
  before update on public.rate_general
  for each row execute function public.set_updated_at();

-- ── rate_vip (flat) ──
create table if not exists public.rate_vip (
  id                uuid primary key default gen_random_uuid(),
  customer_group    text not null references public.customer_groups(code) on delete restrict,
  source_warehouse  text not null check (source_warehouse in ('guangzhou','yiwu')),
  transport_type    text not null check (transport_type   in ('truck','ship','air')),
  product_type      text not null check (product_type     in ('general','tisi','fda','special')),
  basis             text not null check (basis            in ('kg','cbm')),
  rate              numeric(10,2) not null,
  admin_id_update   text,
  updated_at        timestamptz not null default now(),
  unique (customer_group, source_warehouse, transport_type, product_type, basis)
);

drop trigger if exists rate_vip_updated_at_trigger on public.rate_vip;
create trigger rate_vip_updated_at_trigger
  before update on public.rate_vip
  for each row execute function public.set_updated_at();

-- ── rate_custom_user (per-user override) ──
create table if not exists public.rate_custom_user (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  source_warehouse  text not null check (source_warehouse in ('guangzhou','yiwu')),
  transport_type    text not null check (transport_type   in ('truck','ship','air')),
  product_type      text not null check (product_type     in ('general','tisi','fda','special')),
  basis             text not null check (basis            in ('kg','cbm')),
  rate              numeric(10,2) not null,
  admin_id_update   text,
  updated_at        timestamptz not null default now(),
  unique (profile_id, source_warehouse, transport_type, product_type, basis)
);

drop trigger if exists rate_custom_user_updated_at_trigger on public.rate_custom_user;
create trigger rate_custom_user_updated_at_trigger
  before update on public.rate_custom_user
  for each row execute function public.set_updated_at();

-- rate_custom_hs (HS-code overrides) — admin-managed, Phase G; placeholder shape
create table if not exists public.rate_custom_hs (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  hs_code           text not null,
  source_warehouse  text not null,
  transport_type    text not null,
  product_type      text not null,
  basis             text not null check (basis in ('kg','cbm')),
  rate_before       numeric(10,2),                            -- before-threshold rate
  rate              numeric(10,2) not null,
  admin_id_update   text,
  updated_at        timestamptz not null default now()
);

-- ── Seed dev defaults ── (general rates so dev can compute prices)
-- Pick conservative numbers; production tweaks via admin Phase G.
insert into public.rate_general
  (customer_group, source_warehouse, transport_type, product_type, basis, tier1, tier2, tier3)
values
  ('PR','guangzhou','truck','general','kg',   35, 32, 30),
  ('PR','guangzhou','truck','general','cbm', 4500, 4200, 3900),
  ('PR','guangzhou','ship', 'general','kg',   25, 22, 20),
  ('PR','guangzhou','ship', 'general','cbm', 3500, 3200, 2900),
  ('PR','guangzhou','truck','tisi',  'kg',   45, 42, 40),
  ('PR','guangzhou','ship', 'tisi',  'kg',   35, 32, 30),
  ('PR','guangzhou','truck','fda',   'kg',   55, 52, 50),
  ('PR','guangzhou','ship', 'fda',   'kg',   45, 42, 40),
  ('PR','yiwu',     'truck','general','kg',   38, 35, 33),
  ('PR','yiwu',     'ship', 'general','kg',   28, 25, 23)
on conflict (customer_group, source_warehouse, transport_type, product_type, basis) do nothing;

-- ════════════════════════════════════════════════════════════
-- RLS — rates + settings are READ-public for authenticated users
-- (so the rate engine can run for any logged-in customer), writes
-- are admin-only (no policy = denied).
-- customer_groups is also read-public.
-- rate_custom_user is read-own.
-- ════════════════════════════════════════════════════════════
alter table public.customer_groups   enable row level security;
alter table public.settings          enable row level security;
alter table public.rate_general      enable row level security;
alter table public.rate_vip          enable row level security;
alter table public.rate_custom_user  enable row level security;
alter table public.rate_custom_hs    enable row level security;

drop policy if exists "customer_groups_select_all" on public.customer_groups;
create policy "customer_groups_select_all" on public.customer_groups
  for select using (auth.role() = 'authenticated');

drop policy if exists "settings_select_all" on public.settings;
create policy "settings_select_all" on public.settings
  for select using (auth.role() = 'authenticated');

drop policy if exists "rate_general_select_all" on public.rate_general;
create policy "rate_general_select_all" on public.rate_general
  for select using (auth.role() = 'authenticated');

drop policy if exists "rate_vip_select_all" on public.rate_vip;
create policy "rate_vip_select_all" on public.rate_vip
  for select using (auth.role() = 'authenticated');

drop policy if exists "rate_custom_user_select_own" on public.rate_custom_user;
create policy "rate_custom_user_select_own" on public.rate_custom_user
  for select using (auth.uid() = profile_id);

drop policy if exists "rate_custom_hs_select_own" on public.rate_custom_hs;
create policy "rate_custom_hs_select_own" on public.rate_custom_hs
  for select using (auth.uid() = profile_id);


-- ════════════════════════════════════════════════════════════
-- 0010_forwarder.sql
-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- Phase D2 — Forwarder (ฝากนำเข้า — biggest customer-side domain)
-- ════════════════════════════════════════════════════════════
-- Legacy tb_forwarder is 100+ columns mixing customer-set inputs,
-- computed prices, and 30+ admin-internal fields (cost_*, profit_*,
-- printStatus*, lockDate, sessionId, fStatusCar*, partner-warehouse
-- IDs). We split into:
--
--   forwarders                 — customer-visible record + computed price
--   forwarder_items            — line items per package
--   forwarder_images           — cover + extras (Storage paths)
--   forwarder_status_log       — audit (legacy tb_log_forwarder_status)
--
-- Admin-internal columns (cost_*, profit_*, admin_id_*, partner
-- warehouse codes, printStatus*) are NULLABLE on forwarders for now
-- and get a separate forwarder_admin sidecar table in Phase G if the
-- column count grows.
--
-- Status enum (replaces legacy varchar(2) numeric codes):
--   1 → 'pending_payment'    รอชำระเงิน
--   2 → 'shipped_china'      สินค้าออกจากจีน
--   3 → 'in_transit'         ขนส่งกลางทาง (ทะเล/รถ)
--   4 → 'arrived_thailand'   สินค้าเข้าโกดังไทย
--   5 → 'out_for_delivery'   กำลังจัดส่ง
--   6 → 'delivered'          ส่งสำเร็จ
--   7 → 'cancelled'          ยกเลิก
--
-- f_no format: F{YYMMDD}-{seq}  (Pacred convention, parallel to ONS
-- for service-order). Generated via sequence + trigger.
-- ════════════════════════════════════════════════════════════

create sequence if not exists public.forwarder_seq;

create or replace function public.generate_forwarder_no()
returns trigger as $$
declare
  yymmdd text;
  seq    int;
begin
  if new.f_no is null then
    yymmdd := to_char(current_date, 'YYMMDD');
    seq    := nextval('public.forwarder_seq');
    new.f_no := 'F' || yymmdd || '-' || seq::text;
  end if;
  return new;
end;
$$ language plpgsql;

create table if not exists public.forwarders (
  id                    uuid primary key default gen_random_uuid(),
  f_no                  text unique,                                  -- F{YYMMDD}-{seq}
  profile_id            uuid not null references public.profiles(id) on delete cascade,

  -- state machine
  status                text not null default 'pending_payment'
                        check (status in (
                          'pending_payment','shipped_china','in_transit',
                          'arrived_thailand','out_for_delivery','delivered','cancelled'
                        )),
  paydeposit_pending    boolean not null default false,               -- legacy paydeposit 1 = "รอตรวจสอบการจ่ายเงิน"

  -- shipment classification (customer choice)
  source_warehouse      text not null check (source_warehouse in ('guangzhou','yiwu')),
  partner_warehouse     text,                                          -- 'sang' | 'ctt' | 'mk' | 'mx' | 'jmf' — admin sets
  transport_type        text not null check (transport_type in ('truck','ship','air')),
  product_type          text not null check (product_type in ('general','tisi','fda','special')),
  product_type_sub      text,                                          -- legacy fProductsType2
  ship_by               text,                                          -- domestic delivery method
  pay_method            text not null default 'origin' check (pay_method in ('origin','destination')),
  rate_basis            text not null default 'auto' check (rate_basis in ('kg','cbm','auto')),
                                                                       -- 'auto' = take whichever yields higher price
                                                                       --  per legacy fRefPrice 1=weight 2=volume

  -- shipping address snapshot (legacy fAddress*)
  ship_first_name       text not null,
  ship_last_name        text not null,
  ship_phone            text not null,
  ship_phone2           text,
  ship_address_line     text not null,
  ship_sub_district     text not null,
  ship_district         text not null,
  ship_province         text not null,
  ship_postal_code      text not null,
  ship_note             text,
  ship_latitude         numeric(10,8),
  ship_longitude        numeric(11,8),

  -- box-level details (rolled up from items; or set directly if no items breakdown)
  box_count             int not null default 1,
  weight_kg             numeric(10,2) not null default 0,
  width_cm              numeric(10,2) not null default 0,
  length_cm             numeric(10,2) not null default 0,
  height_cm             numeric(10,2) not null default 0,
  volume_cbm            numeric(10,5) not null default 0,              -- (W×L×H)/10^6, generated on read

  -- pricing inputs (locked at submit time)
  custom_rate           boolean not null default false,                -- legacy customRate 0 default, 1 custom
  custom_rate_kg        numeric(10,2),
  custom_rate_cbm       numeric(10,2),
  yuan_rate_locked      numeric(8,4),                                  -- exchange rate at submit (for fTransportPriceCHNTHB)
  domestic_china_thb    numeric(10,2) not null default 0,              -- ค่าขนส่งในจีน (already in THB)
  thailand_delivery_thb numeric(10,2) not null default 0,              -- ค่าขนส่งในไทย (legacy fTransportPrice)
  crate                 boolean not null default false,                -- ตีลังไม้
  crate_price           numeric(10,2) not null default 0,
  qc                    boolean not null default false,
  qc_price              numeric(10,2) not null default 0,
  other_price           numeric(10,2) not null default 0,
  other_price_desc      text,
  discount              numeric(10,2) not null default 0,
  service_fee           numeric(10,2) not null default 0,              -- read from settings.service_fee at submit
  price_update          numeric(10,2) not null default 0,              -- adjustment column

  -- pricing outputs (computed by D3 engine, written at submit + admin-edit)
  transport_price       numeric(10,2) not null default 0,              -- main rate × weight/cbm
  total_price           numeric(10,2) not null default 0,

  -- admin internals (Phase G; nullable for now)
  cost_total_price      numeric(10,2),                                 -- legacy fCostTotalPrice
  profit_total          numeric(10,2),
  print_status_invoice  boolean not null default false,
  print_status_receipt  boolean not null default false,
  admin_id_creator      text,
  admin_id_update       text,
  locked_until          timestamptz default now(),
  session_id            text,

  -- delivery tracking
  tracking_chn          text,
  tracking_chn2         text,
  tracking_th           text,
  cabinet_number        text,
  date_shipped_china    timestamptz,                                   -- legacy fDateStatus2
  date_in_transit       timestamptz,                                   -- fDateStatus3
  date_arrived_thailand timestamptz,                                   -- fDateStatus4
  date_out_for_delivery timestamptz,                                   -- fDateStatus5
  date_delivered        timestamptz,                                   -- fDateStatus6

  -- free-form
  detail                text,
  note_admin            text,                                          -- legacy fNote
  note_user             text,                                          -- legacy fNoteUser

  -- linkage
  credit_used           boolean not null default false,                -- paid via credit_balance
  ref_order             text,                                          -- legacy refOrder

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists forwarders_profile_idx
  on public.forwarders(profile_id, created_at desc);
create index if not exists forwarders_status_idx
  on public.forwarders(status, created_at);
create index if not exists forwarders_tracking_chn_idx
  on public.forwarders(tracking_chn) where tracking_chn is not null;

drop trigger if exists forwarders_no_trigger on public.forwarders;
create trigger forwarders_no_trigger
  before insert on public.forwarders
  for each row execute function public.generate_forwarder_no();

drop trigger if exists forwarders_updated_at_trigger on public.forwarders;
create trigger forwarders_updated_at_trigger
  before update on public.forwarders
  for each row execute function public.set_updated_at();

-- ── forwarder_items ──
create table if not exists public.forwarder_items (
  id                       uuid primary key default gen_random_uuid(),
  forwarder_id             uuid not null references public.forwarders(id) on delete cascade,
  product_id               text,                                       -- legacy reference; may join to product cache
  product_name             text not null,
  product_tracking         text,                                       -- per-box CN tracking
  product_tracking_note    text,
  product_qty              int not null default 1,
  product_type_code        text,                                       -- legacy productTypeCode

  -- dimensions per item (optional — fall back to forwarder-level if null)
  width_cm                 numeric(10,2),
  length_cm                numeric(10,2),
  height_cm                numeric(10,2),
  weight_per_item_kg       numeric(10,2),
  weight_all_kg            numeric(10,2),
  cbm_per_item             numeric(10,5),
  cbm_all                  numeric(10,5),

  -- per-item pricing carve-out (legacy items had separate qc/discount/etc)
  domestic_china_thb       numeric(10,2) not null default 0,
  crate_price              numeric(10,2) not null default 0,
  qc_price                 numeric(10,2) not null default 0,
  other_service_fee        numeric(10,2) not null default 0,
  thailand_delivery_fee    numeric(10,2) not null default 0,
  price_update             numeric(10,2) not null default 0,
  discount                 numeric(10,2) not null default 0,

  location_wth             text,                                       -- warehouse internal location
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  admin_id                 text,
  admin_id_updated         text
);

create index if not exists forwarder_items_forwarder_idx
  on public.forwarder_items(forwarder_id);

drop trigger if exists forwarder_items_updated_at_trigger on public.forwarder_items;
create trigger forwarder_items_updated_at_trigger
  before update on public.forwarder_items
  for each row execute function public.set_updated_at();

-- ── forwarder_images ──
-- One row per uploaded image; storage path under
-- forwarder-covers/{profile_id}/{forwarder_id}/...
create table if not exists public.forwarder_images (
  id           uuid primary key default gen_random_uuid(),
  forwarder_id uuid not null references public.forwarders(id) on delete cascade,
  image_path   text not null,                                           -- Supabase Storage key
  is_cover     boolean not null default false,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists forwarder_images_forwarder_idx
  on public.forwarder_images(forwarder_id, sort_order);

-- only one cover per forwarder
create unique index if not exists forwarder_images_one_cover_idx
  on public.forwarder_images(forwarder_id) where is_cover = true;

-- ── forwarder_status_log (audit) ──
create table if not exists public.forwarder_status_log (
  id              uuid primary key default gen_random_uuid(),
  forwarder_id    uuid not null references public.forwarders(id) on delete cascade,
  status_old      text,
  status_new      text not null,
  changed_at      timestamptz not null default now(),
  admin_id        text
);

create index if not exists forwarder_status_log_forwarder_idx
  on public.forwarder_status_log(forwarder_id, changed_at desc);

-- log inserts on status change
create or replace function public.forwarder_log_status_change()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into public.forwarder_status_log (forwarder_id, status_new)
      values (new.id, new.status);
    return new;
  end if;
  if new.status <> old.status then
    insert into public.forwarder_status_log (forwarder_id, status_old, status_new, admin_id)
      values (new.id, old.status, new.status, new.admin_id_update);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists forwarders_status_log_trigger on public.forwarders;
create trigger forwarders_status_log_trigger
  after insert or update of status on public.forwarders
  for each row execute function public.forwarder_log_status_change();

-- ════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════
alter table public.forwarders            enable row level security;
alter table public.forwarder_items       enable row level security;
alter table public.forwarder_images      enable row level security;
alter table public.forwarder_status_log  enable row level security;

drop policy if exists "forwarders_select_own" on public.forwarders;
create policy "forwarders_select_own" on public.forwarders
  for select using (auth.uid() = profile_id);

drop policy if exists "forwarders_insert_own" on public.forwarders;
create policy "forwarders_insert_own" on public.forwarders
  for insert with check (
    auth.uid() = profile_id
    and status = 'pending_payment'
  );

drop policy if exists "forwarders_update_own_pending" on public.forwarders;
create policy "forwarders_update_own_pending" on public.forwarders
  for update using (
    auth.uid() = profile_id
    and status = 'pending_payment'
  ) with check (
    auth.uid() = profile_id
    and status = 'pending_payment'
  );

-- items: select + write own (parent ownership inferred via forwarder_id)
drop policy if exists "forwarder_items_select_own" on public.forwarder_items;
create policy "forwarder_items_select_own" on public.forwarder_items
  for select using (
    exists (select 1 from public.forwarders f
             where f.id = forwarder_id and f.profile_id = auth.uid())
  );

drop policy if exists "forwarder_items_write_own_pending" on public.forwarder_items;
create policy "forwarder_items_write_own_pending" on public.forwarder_items
  for all using (
    exists (select 1 from public.forwarders f
             where f.id = forwarder_id
               and f.profile_id = auth.uid()
               and f.status = 'pending_payment')
  ) with check (
    exists (select 1 from public.forwarders f
             where f.id = forwarder_id
               and f.profile_id = auth.uid()
               and f.status = 'pending_payment')
  );

-- images: select + write own
drop policy if exists "forwarder_images_select_own" on public.forwarder_images;
create policy "forwarder_images_select_own" on public.forwarder_images
  for select using (
    exists (select 1 from public.forwarders f
             where f.id = forwarder_id and f.profile_id = auth.uid())
  );

drop policy if exists "forwarder_images_write_own_pending" on public.forwarder_images;
create policy "forwarder_images_write_own_pending" on public.forwarder_images
  for all using (
    exists (select 1 from public.forwarders f
             where f.id = forwarder_id
               and f.profile_id = auth.uid()
               and f.status = 'pending_payment')
  ) with check (
    exists (select 1 from public.forwarders f
             where f.id = forwarder_id
               and f.profile_id = auth.uid()
               and f.status = 'pending_payment')
  );

-- status log: select own (admin-write only — no policy = denied for users)
drop policy if exists "forwarder_status_log_select_own" on public.forwarder_status_log;
create policy "forwarder_status_log_select_own" on public.forwarder_status_log
  for select using (
    exists (select 1 from public.forwarders f
             where f.id = forwarder_id and f.profile_id = auth.uid())
  );

-- ════════════════════════════════════════════════════════════
-- Storage — forwarder-covers bucket (cover + multi-image upload)
-- ════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('forwarder-covers', 'forwarder-covers', false)
on conflict (id) do nothing;

-- Path pattern: forwarder-covers/{user_id}/{forwarder_id}/{filename}

drop policy if exists "forwarder_covers_user_select" on storage.objects;
create policy "forwarder_covers_user_select" on storage.objects
  for select using (
    bucket_id = 'forwarder-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "forwarder_covers_user_insert" on storage.objects;
create policy "forwarder_covers_user_insert" on storage.objects
  for insert with check (
    bucket_id = 'forwarder-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "forwarder_covers_user_update" on storage.objects;
create policy "forwarder_covers_user_update" on storage.objects
  for update using (
    bucket_id = 'forwarder-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "forwarder_covers_user_delete" on storage.objects;
create policy "forwarder_covers_user_delete" on storage.objects
  for delete using (
    bucket_id = 'forwarder-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );


-- ════════════════════════════════════════════════════════════
-- 0011_service_order.sql
-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- Phase E1 — Service-Order (ฝากสั่งซื้อ — cart + header + items)
-- ════════════════════════════════════════════════════════════
-- Customer pastes 1688/Taobao/Tmall URLs (or manually fills items)
-- into a shopping cart, then groups them into one or more service
-- orders. Pacred buys the goods in China, consolidates at the
-- warehouse, and ships to Thailand.
--
-- Cross-checked against legacy code at D:\xampp\htdocs\pcscargo\:
-- - member/cart.php (1211 LOC): addCart + addCartURL flows
-- - member/shops.php (2215 LOC): cart→order placement
-- - member/include/function.php: cProvider enum mapping
-- - 151-item per-user cart cap is in cart.php lines 17, 76
--
-- Legacy enum mappings (now stored as readable strings):
--   cProvider 1/2/3/4/5 → '1688' / 'taobao' / 'tmall' / 'shop' / 'nice'
--   hStatus 1..6 →
--     1=pending              รอดำเนินการ
--     2=awaiting_payment     รอชำระเงิน  (with payment_due_at expiry → auto-cancel to 6)
--     3=ordered              สั่งสินค้า
--     4=awaiting_chn_dispatch รอร้านจีนจัดส่ง
--     5=completed            สำเร็จ
--     6=cancelled            ยกเลิก
--   hWarehouseChina 1/2 → 'yiwu' / 'guangzhou' (note: legacy reversed
--     this from the forwarder mapping; we standardise to match
--     forwarders — 'guangzhou' / 'yiwu')
--   warehouse_name (per-item, admin receives at): 1/2/3/4/5 → 'sang' /
--     'ctt' / 'mk' / 'mx' / 'jmf'
--
-- h_no format: legacy was 'P' + auto-increment id. Pacred uses
-- 'O{YYMMDD}-{seq}' (the 'O' stands for Order, parallel to forwarders'
-- 'F'). Generated via sequence + trigger.
-- ════════════════════════════════════════════════════════════

-- ── cart_items ──
create table if not exists public.cart_items (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,

  provider     text not null default 'shop'
               check (provider in ('1688','taobao','tmall','shop','nice')),
  shop_name    text not null default 'pacred',           -- legacy default 'pcs' renamed
  url          text,                                      -- product link
  title        text,                                      -- product title
  image_path   text,                                      -- Supabase Storage key (carts bucket)
  color        text,
  size         text,
  price_cny    numeric(12,2) not null check (price_cny >= 0),
  amount       int           not null check (amount > 0),
  details      text,                                      -- buyer's note (size detail, special instruction)

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists cart_items_profile_idx
  on public.cart_items(profile_id, created_at desc);

drop trigger if exists cart_items_updated_at_trigger on public.cart_items;
create trigger cart_items_updated_at_trigger
  before update on public.cart_items
  for each row execute function public.set_updated_at();

-- Enforce 151-item cap per profile (legacy cart.php hardcoded the same)
create or replace function public.cart_items_cap()
returns trigger as $$
declare
  cnt int;
begin
  if tg_op = 'INSERT' then
    select count(*) into cnt from public.cart_items where profile_id = new.profile_id;
    if cnt >= 151 then
      raise exception 'cart cap reached (151 items)';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists cart_items_cap_trigger on public.cart_items;
create trigger cart_items_cap_trigger
  before insert on public.cart_items
  for each row execute function public.cart_items_cap();

-- ── service_orders (header) ──
create sequence if not exists public.service_order_seq;

create or replace function public.generate_service_order_no()
returns trigger as $$
declare
  yymmdd text;
  seq    int;
begin
  if new.h_no is null then
    yymmdd := to_char(current_date, 'YYMMDD');
    seq    := nextval('public.service_order_seq');
    new.h_no := 'O' || yymmdd || '-' || seq::text;
  end if;
  return new;
end;
$$ language plpgsql;

create table if not exists public.service_orders (
  id                    uuid primary key default gen_random_uuid(),
  h_no                  text unique,                                 -- O{YYMMDD}-{seq}
  profile_id            uuid not null references public.profiles(id) on delete cascade,

  status                text not null default 'pending'
                        check (status in (
                          'pending','awaiting_payment','ordered',
                          'awaiting_chn_dispatch','completed','cancelled'
                        )),
  shop_paid             boolean not null default false,              -- legacy hShopPay 1=already paid
  paydeposit_pending    boolean not null default false,              -- legacy paydeposit
  free_shipping         boolean not null default false,              -- ordered during free-shipping promo

  -- header summary
  title                 text,                                         -- legacy hTitle
  cover_image_path      text,                                         -- legacy hCover
  item_count            int    not null default 0,

  -- shipment classification
  warehouse_china       text   check (warehouse_china in ('guangzhou','yiwu')),
  transport_type        text   not null default 'truck'
                        check (transport_type in ('truck','ship','air')),
  ship_by               text,                                         -- 'PCS' / 'PCSF' / partner name
  pay_method            text   not null default 'origin' check (pay_method in ('origin','destination')),
  crate                 boolean not null default false,

  -- pricing — locked at submit
  yuan_rate_locked      numeric(8,4),                                 -- legacy hRate
  yuan_rate_cost        numeric(8,4) not null default 0,              -- admin internal
  subtotal_cny          numeric(12,2) not null default 0,             -- legacy hTotalPriceCHN
  domestic_china_cny    numeric(12,2) not null default 0,             -- legacy hShippingCHN (per-item sum)
  service_fee           numeric(10,2) not null default 50,            -- legacy hShippingService (50 baht)
  forwarder_fee         numeric(10,2) not null default 0,             -- legacy fShippingService for combined ship later
  price_update          numeric(12,2) not null default 0,             -- admin adjustment
  total_thb             numeric(12,2) not null default 0,             -- legacy hTotalPriceUser

  -- admin-internal cost/profit (Phase G)
  cost_all_cny          numeric(12,2),                                -- legacy hCostAll
  cost_all_thb          numeric(12,2),                                -- legacy hCostAllTH

  -- shipping address snapshot
  ship_first_name       text,
  ship_last_name        text,
  ship_phone            text,
  ship_phone2           text,
  ship_address_line     text,
  ship_sub_district     text,
  ship_district         text,
  ship_province         text,
  ship_postal_code      text,
  ship_note             text,

  -- state machine timestamps + payment timer
  date_pending          timestamptz not null default now(),
  date_awaiting_payment timestamptz,                                   -- legacy hDate2
  payment_due_at        timestamptz,                                   -- legacy hDatePayment — auto-cancel after this
  date_ordered          timestamptz,                                   -- legacy hDate3
  date_dispatched       timestamptz,                                   -- legacy hDate4
  date_completed        timestamptz,                                   -- legacy hDate5

  -- admin internals
  admin_id_create       text,
  admin_id_update       text,
  admin_id_interpreter  text,                                          -- legacy adminIDIP (Chinese interpreter)
  locked_until          timestamptz default now(),
  session_id            text,

  -- free-form
  note_admin            text,
  note_user             text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists service_orders_profile_idx
  on public.service_orders(profile_id, created_at desc);
create index if not exists service_orders_status_idx
  on public.service_orders(status, created_at);
create index if not exists service_orders_auto_cancel_idx
  on public.service_orders(payment_due_at)
  where status = 'awaiting_payment';

drop trigger if exists service_orders_h_no_trigger on public.service_orders;
create trigger service_orders_h_no_trigger
  before insert on public.service_orders
  for each row execute function public.generate_service_order_no();

drop trigger if exists service_orders_updated_at_trigger on public.service_orders;
create trigger service_orders_updated_at_trigger
  before update on public.service_orders
  for each row execute function public.set_updated_at();

-- ── service_order_items (line items, copied from cart at submit) ──
create table if not exists public.service_order_items (
  id                   uuid primary key default gen_random_uuid(),
  service_order_id     uuid not null references public.service_orders(id) on delete cascade,

  -- mirror of cart_items shape (snapshotted at order placement so cart
  -- changes don't affect already-submitted orders)
  provider             text not null,
  shop_name            text not null default 'pacred',
  url                  text,
  title                text,
  image_path           text,
  color                text,
  size                 text,
  price_cny            numeric(12,2) not null,
  amount               int           not null,
  details              text,

  -- per-item China-side details (admin fills as items ship)
  domestic_china_cny   numeric(12,2) not null default 0,             -- legacy cShippingCHN
  price_update         numeric(12,2) not null default 0,             -- legacy cPriceUpdate
  shipping_number      text,                                          -- legacy cShippingNumber
  tracking_number      text,                                          -- legacy cTrackingNumber
  warehouse_name       text check (warehouse_name in ('sang','ctt','mk','mx','jmf')),
  re_wallet            boolean not null default false,                -- legacy cReWallet — refunded back to wallet
  crate                boolean not null default false,
  qc                   boolean not null default false,
  note                 text,

  created_at           timestamptz not null default now()
);

create index if not exists service_order_items_order_idx
  on public.service_order_items(service_order_id);
create index if not exists service_order_items_tracking_idx
  on public.service_order_items(tracking_number)
  where tracking_number is not null;

-- Keep service_orders.item_count in sync via trigger
create or replace function public.service_orders_recount_items()
returns trigger as $$
declare
  target_order uuid;
  cnt int;
begin
  target_order := coalesce(new.service_order_id, old.service_order_id);
  select count(*) into cnt from public.service_order_items where service_order_id = target_order;
  update public.service_orders set item_count = cnt where id = target_order;
  return null;
end;
$$ language plpgsql;

drop trigger if exists service_order_items_recount_trigger on public.service_order_items;
create trigger service_order_items_recount_trigger
  after insert or delete on public.service_order_items
  for each row execute function public.service_orders_recount_items();

-- ── promotions (applied to a forwarder or service_order) ──
create table if not exists public.promotions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,                                          -- e.g. '77' for the 2026-03-04 special
  name        text not null,
  starts_at   timestamptz,
  ends_at     timestamptz,
  yuan_rate_override numeric(8,4),                                    -- if set, locks h_rate for orders applying this promo
  free_shipping     boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.promotion_applications (
  id             uuid primary key default gen_random_uuid(),
  promotion_id   uuid not null references public.promotions(id) on delete cascade,
  service_order_id uuid references public.service_orders(id) on delete cascade,
  forwarder_id   uuid references public.forwarders(id) on delete cascade,
  applied_at     timestamptz not null default now(),
  check ((service_order_id is null) <> (forwarder_id is null))  -- exactly one of the two
);

create index if not exists promotion_applications_service_order_idx
  on public.promotion_applications(service_order_id) where service_order_id is not null;

create index if not exists promotion_applications_forwarder_idx
  on public.promotion_applications(forwarder_id) where forwarder_id is not null;

-- ════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════
alter table public.cart_items             enable row level security;
alter table public.service_orders         enable row level security;
alter table public.service_order_items    enable row level security;
alter table public.promotions             enable row level security;
alter table public.promotion_applications enable row level security;

-- cart_items: full ownership
drop policy if exists "cart_items_all_own" on public.cart_items;
create policy "cart_items_all_own" on public.cart_items
  for all
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- service_orders: select-own; insert-own (status=pending); update-own (status in pending/awaiting_payment)
drop policy if exists "service_orders_select_own" on public.service_orders;
create policy "service_orders_select_own" on public.service_orders
  for select using (auth.uid() = profile_id);

drop policy if exists "service_orders_insert_own" on public.service_orders;
create policy "service_orders_insert_own" on public.service_orders
  for insert with check (
    auth.uid() = profile_id
    and status in ('pending','awaiting_payment')
  );

drop policy if exists "service_orders_update_own_editable" on public.service_orders;
create policy "service_orders_update_own_editable" on public.service_orders
  for update using (
    auth.uid() = profile_id
    and status in ('pending','awaiting_payment')
  ) with check (
    auth.uid() = profile_id
    and status in ('pending','awaiting_payment','cancelled')   -- allow self-cancel by user
  );

-- service_order_items: ownership inferred via parent
drop policy if exists "service_order_items_select_own" on public.service_order_items;
create policy "service_order_items_select_own" on public.service_order_items
  for select using (
    exists (select 1 from public.service_orders so
             where so.id = service_order_id and so.profile_id = auth.uid())
  );

drop policy if exists "service_order_items_write_own_editable" on public.service_order_items;
create policy "service_order_items_write_own_editable" on public.service_order_items
  for all using (
    exists (select 1 from public.service_orders so
             where so.id = service_order_id
               and so.profile_id = auth.uid()
               and so.status in ('pending','awaiting_payment'))
  ) with check (
    exists (select 1 from public.service_orders so
             where so.id = service_order_id
               and so.profile_id = auth.uid()
               and so.status in ('pending','awaiting_payment'))
  );

-- promotions: public read (so frontend can show available promos)
drop policy if exists "promotions_select_active" on public.promotions;
create policy "promotions_select_active" on public.promotions
  for select using (auth.role() = 'authenticated' and is_active = true);

-- promotion_applications: read own
drop policy if exists "promotion_applications_select_own" on public.promotion_applications;
create policy "promotion_applications_select_own" on public.promotion_applications
  for select using (
    (service_order_id is not null and exists (
      select 1 from public.service_orders so
       where so.id = service_order_id and so.profile_id = auth.uid()))
    or
    (forwarder_id is not null and exists (
      select 1 from public.forwarders f
       where f.id = forwarder_id and f.profile_id = auth.uid()))
  );

-- ════════════════════════════════════════════════════════════
-- Storage — 'carts' bucket for cart-item images uploaded by users
-- ════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('carts', 'carts', false)
on conflict (id) do nothing;

drop policy if exists "carts_user_select" on storage.objects;
create policy "carts_user_select" on storage.objects
  for select using (
    bucket_id = 'carts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "carts_user_insert" on storage.objects;
create policy "carts_user_insert" on storage.objects
  for insert with check (
    bucket_id = 'carts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "carts_user_update" on storage.objects;
create policy "carts_user_update" on storage.objects
  for update using (
    bucket_id = 'carts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "carts_user_delete" on storage.objects;
create policy "carts_user_delete" on storage.objects
  for delete using (
    bucket_id = 'carts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );


-- ════════════════════════════════════════════════════════════
-- 0012_avatars_bucket.sql
-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- Phase B5+ — Avatar uploads bucket
-- ════════════════════════════════════════════════════════════
-- Profile.avatar_url already exists (from 0003). This adds the
-- 'avatars' bucket (public read so <img> tags don't need signed URLs)
-- with owner-only write.
-- ════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)                              -- public read
on conflict (id) do nothing;

-- Path pattern: avatars/{user_id}/{filename}

-- Public read is implicit on a public bucket; we still want to gate writes.
drop policy if exists "avatars_user_insert" on storage.objects;
create policy "avatars_user_insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_user_update" on storage.objects;
create policy "avatars_user_update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_user_delete" on storage.objects;
create policy "avatars_user_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );


-- ════════════════════════════════════════════════════════════
-- 0013_sales_referral.sql
-- ════════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════════
-- 0014_notifications.sql
-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- Phase F2 — Notifications (per ADR-0001)
-- ════════════════════════════════════════════════════════════
-- LINE Notify EOL'd 2026-04-01; legacy tb_users.userLineNotify tokens
-- are dead. Replacement strategy per docs/decisions/0001-line-notify-
-- replacement.md:
--   1. LINE Messaging API push  (primary, via @pacred OA)
--   2. Email digest             (fallback when LINE not linked)
--   3. console.log              (dev — LINE_PUSH_BYPASS=true)
--
-- This migration adds the persistence layer:
--   notifications        — append-only event log per user
--   notification_reads   — read-state tracker (so we know unread count)
--
-- Outbound delivery (LINE / email) goes through a queue worker called
-- from a Vercel cron — see /api/cron/dispatch-notifications (Phase F2
-- ships the schema + lib stubs; production cron + LINE binding happens
-- when channel access tokens are configured).
-- ════════════════════════════════════════════════════════════

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles(id) on delete cascade,

  -- Event classification
  category      text not null check (category in (
                  'order','payment','forwarder','yuan_payment',
                  'wallet','sales','system','promo'
                )),
  severity      text not null default 'info'
                check (severity in ('info','success','warning','error')),

  -- User-visible content
  title         text not null,
  body          text not null,                     -- short body (1-2 sentences)

  -- Deep-link (relative) — e.g. /service-order/O260513-12
  link_href     text,

  -- Reference to the source object — null is fine for system-wide
  reference_type text check (reference_type in (
                   'service_order','forwarder','yuan_payment',
                   'wallet_transaction','sales_commission','sales_payout'
                 )),
  reference_id   text,                              -- text because some refs are slugs

  -- Delivery state (per channel)
  delivered_line_at   timestamptz,                  -- successful push
  delivered_email_at  timestamptz,                  -- successful email
  delivery_attempts   int  not null default 0,
  last_delivery_error text,

  created_at    timestamptz not null default now()
);

create index if not exists notifications_profile_idx
  on public.notifications(profile_id, created_at desc);

create index if not exists notifications_dispatch_idx
  on public.notifications(created_at) where delivered_line_at is null and delivered_email_at is null;

-- ── notification_reads (read state) ──
-- Separate table so we can keep the notifications row append-only and
-- have a single bit per (profile, notification) — simpler than a flag
-- column with a partial unique index.
create table if not exists public.notification_reads (
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (profile_id, notification_id)
);

-- ════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════
alter table public.notifications       enable row level security;
alter table public.notification_reads  enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select using (auth.uid() = profile_id);

-- INSERTs/UPDATEs to notifications happen via service-role from actions
-- (we don't grant customers the ability to forge notifications).

drop policy if exists "notification_reads_all_own" on public.notification_reads;
create policy "notification_reads_all_own" on public.notification_reads
  for all using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);


-- ════════════════════════════════════════════════════════════
-- 0015_admin_rbac.sql
-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- Phase G2 — Admin RBAC + helper + admin-write RLS overrides
-- ════════════════════════════════════════════════════════════
-- See docs/decisions/0002-admin-architecture.md for the full design.
--
-- Legacy tb_admin had 40+ columns mixing identity (companyType,
-- department, section) with admin-specific data. We split:
--   admins                 — minimal (profile_id, role)
--   admin_audit_log        — audit trail for status mutations
--
-- Roles (codes used by is_admin / app-layer guards):
--   super         — full access
--   ops           — forwarder / service-order operations
--   accounting    — wallet / yuan / payouts
--   sales_admin   — sales payouts + team_leaders
-- ════════════════════════════════════════════════════════════

create table if not exists public.admins (
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  role         text not null check (role in ('super','ops','accounting','sales_admin')),
  granted_at   timestamptz not null default now(),
  granted_by   uuid references public.profiles(id) on delete set null,
  is_active    boolean not null default true,
  primary key (profile_id, role)
);

create index if not exists admins_role_idx on public.admins(role) where is_active = true;

-- ── is_admin() helper ──
-- SECURITY DEFINER so RLS on `admins` can't recurse when policies on
-- other tables call it. search_path locked to public so it can't be
-- subverted by a session-level setting.
--
-- Drop any pre-existing is_admin variants first (different arg signatures
-- would otherwise conflict at call sites like `is_admin()` which would
-- be ambiguous between is_admin() and is_admin(text[] default null)).
do $$
declare r record;
begin
  for r in
    select oid::regprocedure as sig
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname = 'is_admin'
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;

create or replace function public.is_admin(any_role text[] default null)
  returns boolean
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  ok boolean;
begin
  select exists (
    select 1 from public.admins
     where profile_id = auth.uid()
       and is_active  = true
       and (any_role is null or role = any(any_role) or role = 'super')
  ) into ok;
  return coalesce(ok, false);
end;
$$;

revoke all on function public.is_admin(text[]) from public;
grant execute on function public.is_admin(text[]) to anon, authenticated;

-- ── admin_audit_log (status change history) ──
create table if not exists public.admin_audit_log (
  id              uuid primary key default gen_random_uuid(),
  admin_id        uuid not null references public.profiles(id) on delete restrict,
  action          text not null,                                -- 'forwarder.status_set' | 'wallet.deposit_approved' | etc
  target_type     text not null,                                -- 'forwarder' | 'service_order' | 'wallet_transaction' | ...
  target_id       text not null,                                -- text to accept slugs or uuids
  payload         jsonb,                                        -- arbitrary context
  created_at      timestamptz not null default now()
);

create index if not exists admin_audit_log_admin_idx
  on public.admin_audit_log(admin_id, created_at desc);
create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log(target_type, target_id);

-- ════════════════════════════════════════════════════════════
-- RLS on admins table itself
-- ════════════════════════════════════════════════════════════
alter table public.admins enable row level security;

-- An admin can see own role row(s); super can see all
drop policy if exists "admins_select" on public.admins;
create policy "admins_select" on public.admins
  for select using (
    profile_id = auth.uid() or public.is_admin(array['super'])
  );

-- Only 'super' can grant/revoke admin roles (via service-role from app)
-- We don't add INSERT/UPDATE/DELETE policies — those operations go
-- through the service-role admin client, which bypasses RLS.

-- audit_log: any admin can write (via service-role) + read own
alter table public.admin_audit_log enable row level security;

drop policy if exists "admin_audit_log_select" on public.admin_audit_log;
create policy "admin_audit_log_select" on public.admin_audit_log
  for select using (public.is_admin());

-- ════════════════════════════════════════════════════════════
-- Admin-write overrides on customer-side tables
-- ════════════════════════════════════════════════════════════
-- The pattern: existing customer policies stay untouched (they grant
-- self-owned access). We ADD a "for all" policy guarded by is_admin()
-- so admins can read/write any row. PostgREST evaluates policies of
-- the same action with OR, so customer keeps own access AND admin
-- gets everything.

-- profiles (admin sees + edits any)
drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- corporate
drop policy if exists "corporate_admin_all" on public.corporate;
create policy "corporate_admin_all" on public.corporate
  for all using (public.is_admin()) with check (public.is_admin());

-- addresses
drop policy if exists "addresses_admin_all" on public.addresses;
create policy "addresses_admin_all" on public.addresses
  for all using (public.is_admin()) with check (public.is_admin());

-- wallet + ledger
drop policy if exists "wallet_admin_all" on public.wallet;
create policy "wallet_admin_all" on public.wallet
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "wallet_tx_admin_all" on public.wallet_transactions;
create policy "wallet_tx_admin_all" on public.wallet_transactions
  for all using (public.is_admin()) with check (public.is_admin());

-- yuan_payments
drop policy if exists "yuan_payments_admin_all" on public.yuan_payments;
create policy "yuan_payments_admin_all" on public.yuan_payments
  for all using (public.is_admin()) with check (public.is_admin());

-- forwarders + items + images + status_log
drop policy if exists "forwarders_admin_all" on public.forwarders;
create policy "forwarders_admin_all" on public.forwarders
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "forwarder_items_admin_all" on public.forwarder_items;
create policy "forwarder_items_admin_all" on public.forwarder_items
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "forwarder_images_admin_all" on public.forwarder_images;
create policy "forwarder_images_admin_all" on public.forwarder_images
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "forwarder_status_log_admin_all" on public.forwarder_status_log;
create policy "forwarder_status_log_admin_all" on public.forwarder_status_log
  for all using (public.is_admin()) with check (public.is_admin());

-- cart_items
drop policy if exists "cart_items_admin_select" on public.cart_items;
create policy "cart_items_admin_select" on public.cart_items
  for select using (public.is_admin());

-- service_orders + items
drop policy if exists "service_orders_admin_all" on public.service_orders;
create policy "service_orders_admin_all" on public.service_orders
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "service_order_items_admin_all" on public.service_order_items;
create policy "service_order_items_admin_all" on public.service_order_items
  for all using (public.is_admin()) with check (public.is_admin());

-- promotions
drop policy if exists "promotions_admin_all" on public.promotions;
create policy "promotions_admin_all" on public.promotions
  for all using (public.is_admin()) with check (public.is_admin());

-- rates + settings + customer_groups
drop policy if exists "customer_groups_admin_all" on public.customer_groups;
create policy "customer_groups_admin_all" on public.customer_groups
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "settings_admin_all" on public.settings;
create policy "settings_admin_all" on public.settings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "rate_general_admin_all" on public.rate_general;
create policy "rate_general_admin_all" on public.rate_general
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "rate_vip_admin_all" on public.rate_vip;
create policy "rate_vip_admin_all" on public.rate_vip
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "rate_custom_user_admin_all" on public.rate_custom_user;
create policy "rate_custom_user_admin_all" on public.rate_custom_user
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "rate_custom_hs_admin_all" on public.rate_custom_hs;
create policy "rate_custom_hs_admin_all" on public.rate_custom_hs
  for all using (public.is_admin()) with check (public.is_admin());

-- sales tables
drop policy if exists "team_leaders_admin_all" on public.team_leaders;
create policy "team_leaders_admin_all" on public.team_leaders
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sales_commissions_admin_all" on public.sales_commissions;
create policy "sales_commissions_admin_all" on public.sales_commissions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sales_payouts_admin_all" on public.sales_payouts;
create policy "sales_payouts_admin_all" on public.sales_payouts
  for all using (public.is_admin()) with check (public.is_admin());

-- notifications (admin can see + insert any)
drop policy if exists "notifications_admin_all" on public.notifications;
create policy "notifications_admin_all" on public.notifications
  for all using (public.is_admin()) with check (public.is_admin());


-- ════════════════════════════════════════════════════════════
-- 0016_phase_h_upgrades.sql
-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- Phase H — Feature parity catch-up
-- ════════════════════════════════════════════════════════════
-- Adds the schema pieces flagged in the gap audit:
-- 1. containers — ops daily-tracking table (legacy รายการตู้)
-- 2. profiles: assigned_admin_phone / admin_avatar (derived via join — no
--    extra column needed; we use existing profiles.sales_admin_id)
-- 3. admin_profile_extras for legacy adminID-style metadata that doesn't
--    fit elsewhere (department / section / phone for sales rep card)
-- 4. cart_items.variant_label + variant_data (for SKU variants from
--    1688/Taobao paste flow)
-- ════════════════════════════════════════════════════════════

-- ── containers ──
-- Tracks shipping containers from China → Thailand.
-- Each forwarder/service_order line item links via container_id once
-- assigned by the warehouse ops team.
create table if not exists public.containers (
  id                   uuid primary key default gen_random_uuid(),
  container_no         text unique,                                   -- e.g. CN-260513-01
  vendor_container_id  text,                                          -- shipping line's container number
  vessel               text,                                          -- ship/truck name
  carrier              text,                                          -- carrier company (Maersk, COSCO, JMF, etc.)
  origin_warehouse     text check (origin_warehouse in ('guangzhou','yiwu','other')) default 'guangzhou',
  transport_type       text not null default 'truck' check (transport_type in ('truck','ship','air')),

  -- timeline
  status               text not null default 'preparing'
                       check (status in (
                         'preparing','sealed','in_transit',
                         'arrived_port','cleared_customs','delivered','cancelled'
                       )),
  date_sealed          timestamptz,
  date_in_transit      timestamptz,
  date_arrived_port    timestamptz,
  date_cleared         timestamptz,
  date_delivered       timestamptz,
  eta                  date,

  -- billing details
  total_weight_kg      numeric(12,2) default 0,
  total_volume_cbm     numeric(12,5) default 0,
  cost_thb             numeric(12,2),                                  -- admin internal (cost from carrier)

  note                 text,
  admin_id_create      text,
  admin_id_update      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists containers_status_idx on public.containers(status, created_at desc);
create index if not exists containers_eta_idx on public.containers(eta) where status in ('sealed','in_transit');

-- generator: CN-{YYMMDD}-{seq}
create sequence if not exists public.container_seq;
create or replace function public.generate_container_no()
returns trigger as $$
begin
  if new.container_no is null then
    new.container_no := 'CN' || to_char(current_date,'YYMMDD') || '-' || nextval('public.container_seq')::text;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists containers_no_trigger on public.containers;
create trigger containers_no_trigger before insert on public.containers
  for each row execute function public.generate_container_no();

drop trigger if exists containers_updated_at_trigger on public.containers;
create trigger containers_updated_at_trigger before update on public.containers
  for each row execute function public.set_updated_at();

-- Link forwarders + service_orders to a container (optional)
alter table public.forwarders     add column if not exists container_id uuid references public.containers(id) on delete set null;
alter table public.service_orders add column if not exists container_id uuid references public.containers(id) on delete set null;

create index if not exists forwarders_container_idx     on public.forwarders(container_id) where container_id is not null;
create index if not exists service_orders_container_idx on public.service_orders(container_id) where container_id is not null;

alter table public.containers enable row level security;

-- Customers can see containers their own forwarders/orders are in
-- (so /service-import/[fNo] can show "อยู่ในตู้ XXX")
drop policy if exists "containers_select_via_my_orders" on public.containers;
create policy "containers_select_via_my_orders" on public.containers
  for select using (
    exists (select 1 from public.forwarders f
             where f.container_id = id and f.profile_id = auth.uid())
    or
    exists (select 1 from public.service_orders so
             where so.container_id = id and so.profile_id = auth.uid())
  );

drop policy if exists "containers_admin_all" on public.containers;
create policy "containers_admin_all" on public.containers
  for all using (public.is_admin()) with check (public.is_admin());

-- ── cart_items: variant fields ──
-- For URL-paste flow with multi-SKU products. variant_data jsonb stores
-- the propPath like { color: 'red', size: 'M' } so a re-paste of the
-- same URL doesn't dedupe rows that are actually different SKUs.
alter table public.cart_items
  add column if not exists variant_label text,
  add column if not exists variant_data  jsonb,
  add column if not exists source_product_id text,                   -- legacy thid_item_id
  add column if not exists stock_available  int;

create index if not exists cart_items_source_idx
  on public.cart_items(profile_id, source_product_id) where source_product_id is not null;

-- ── admin_contact_extras ──
-- Sales rep card on customer sidebar needs the rep's display name +
-- direct phone + avatar (legacy fields adminPhone, adminPicture). We
-- piggyback on profiles for name/phone/avatar_url (admin IS a profile
-- with role row in admins) and add a single sidecar for non-profile
-- extras like the "extension number" used by some teams.
create table if not exists public.admin_contact_extras (
  profile_id     uuid primary key references public.profiles(id) on delete cascade,
  display_name   text,                                              -- "เซลล์ มิว" (shown on customer card)
  direct_phone   text,                                              -- the click-to-call number
  department     text,                                              -- 'sale' | 'ops' | 'qc' | ...
  section        text,                                              -- finer grouping inside department
  updated_at     timestamptz not null default now()
);

drop trigger if exists admin_contact_extras_updated_at_trigger on public.admin_contact_extras;
create trigger admin_contact_extras_updated_at_trigger
  before update on public.admin_contact_extras
  for each row execute function public.set_updated_at();

alter table public.admin_contact_extras enable row level security;

-- Public read (customer needs to see their rep's name+phone)
drop policy if exists "admin_contact_extras_select_all" on public.admin_contact_extras;
create policy "admin_contact_extras_select_all" on public.admin_contact_extras
  for select using (auth.role() = 'authenticated');

drop policy if exists "admin_contact_extras_admin_all" on public.admin_contact_extras;
create policy "admin_contact_extras_admin_all" on public.admin_contact_extras
  for all using (public.is_admin()) with check (public.is_admin());

-- ── Dashboard banners (admin-managed marketing) ──
create table if not exists public.dashboard_banners (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,                              -- 'search-china', 'billing', 'line-notify', ...
  title           text not null,
  subtitle        text,
  image_path      text,                                              -- public bucket
  link_href       text,
  cta_label       text,
  sort_order      int not null default 0,
  is_active       boolean not null default true,
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists dashboard_banners_active_idx
  on public.dashboard_banners(sort_order)
  where is_active = true;

drop trigger if exists dashboard_banners_updated_at_trigger on public.dashboard_banners;
create trigger dashboard_banners_updated_at_trigger before update on public.dashboard_banners
  for each row execute function public.set_updated_at();

alter table public.dashboard_banners enable row level security;

drop policy if exists "dashboard_banners_select_active" on public.dashboard_banners;
create policy "dashboard_banners_select_active" on public.dashboard_banners
  for select using (
    auth.role() = 'authenticated'
    and is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at   is null or ends_at   >= now())
  );

drop policy if exists "dashboard_banners_admin_all" on public.dashboard_banners;
create policy "dashboard_banners_admin_all" on public.dashboard_banners
  for all using (public.is_admin()) with check (public.is_admin());

-- ── Seed default banners so dashboard isn't empty on launch ──
insert into public.dashboard_banners (slug, title, subtitle, cta_label, link_href, sort_order) values
  ('search-china', 'ค้นหาสินค้าจากเว็บ 1688 / Taobao / Tmall', 'วางลิ้งสินค้าหรือพิมพ์คำค้น แปลภาษาไทยทันที', 'เริ่มค้นหา', '/service-order/add', 1),
  ('billing',      'ออกบิลใบเสร็จ / ใบแจ้งหนี้', 'ฝากสั่งซื้อด้วยตัวคุณเอง — Pacred ออกบิลให้อัตโนมัติ', 'ดูตัวอย่าง', '/service-order/cart', 2),
  ('line-notify',  'ไม่พลาดทุกการแจ้งเตือน', 'เชื่อมต่อ LINE OA Pacred ได้แล้ววันนี้', 'เชื่อม LINE', '/profile', 3)
on conflict (slug) do nothing;


-- ════════════════════════════════════════════════════════════
-- 0017_org_chart.sql
-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- Phase H · HR / Org-chart — Pacred organization structure
-- ════════════════════════════════════════════════════════════
-- 4-level hierarchy: branch → section → position → assignment
--
-- Following the user-provided Pacred org chart (NOT the legacy PCS Cargo
-- structure). 3 directors under CEO, each with their own branch:
--   • Business Development & Tech (cyan)  — TECH STAFF, SOURCING
--   • Operations (yellow)                 — SALES, CS-DOCS, WAREHOUSE,
--                                            LOGISTICS, QA & QC
--   • Finance & Admin (purple)            — ACCOUNTING, HR
--
-- M:N assignments — one person can hold multiple positions, one position
-- can have multiple people, separated by kind (employee/internship/partner).
-- ════════════════════════════════════════════════════════════

-- ── org_branches ──
create table if not exists public.org_branches (
  id                  uuid primary key default gen_random_uuid(),
  slug                text unique not null,
  name                text not null,
  director_profile_id uuid references public.profiles(id) on delete set null,
  color_tone          text not null check (color_tone in ('red','cyan','yellow','purple','grey','blue','green')),
  sort_order          int  not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists org_branches_updated_at_trigger on public.org_branches;
create trigger org_branches_updated_at_trigger before update on public.org_branches
  for each row execute function public.set_updated_at();

-- ── org_sections (departments under each branch) ──
create table if not exists public.org_sections (
  id                 uuid primary key default gen_random_uuid(),
  branch_id          uuid not null references public.org_branches(id) on delete cascade,
  slug               text not null,
  name               text not null,
  manager_profile_id uuid references public.profiles(id) on delete set null,
  sort_order         int  not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (branch_id, slug)
);

drop trigger if exists org_sections_updated_at_trigger on public.org_sections;
create trigger org_sections_updated_at_trigger before update on public.org_sections
  for each row execute function public.set_updated_at();

create index if not exists org_sections_branch_idx on public.org_sections(branch_id, sort_order);

-- ── org_positions (roles within each section) ──
create table if not exists public.org_positions (
  id                uuid primary key default gen_random_uuid(),
  section_id        uuid not null references public.org_sections(id) on delete cascade,
  slug              text not null,
  name              text not null,
  quota_employee    int  not null default 0,
  quota_internship  int  not null default 0,
  quota_partner     int  not null default 0,
  sort_order        int  not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (section_id, slug)
);

drop trigger if exists org_positions_updated_at_trigger on public.org_positions;
create trigger org_positions_updated_at_trigger before update on public.org_positions
  for each row execute function public.set_updated_at();

create index if not exists org_positions_section_idx on public.org_positions(section_id, sort_order);

-- ── org_assignments (person ↔ position, M:N, active when ended_at is null) ──
create table if not exists public.org_assignments (
  id          uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.org_positions(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('employee','internship','partner')),
  started_at  date not null default current_date,
  ended_at    date,
  notes       text,
  created_at  timestamptz not null default now(),
  -- Prevent same (person, position, kind) being assigned twice while active
  unique (position_id, profile_id, kind)
);

create index if not exists org_assignments_position_idx on public.org_assignments(position_id) where ended_at is null;
create index if not exists org_assignments_profile_idx  on public.org_assignments(profile_id)  where ended_at is null;

-- ════════════════════════════════════════════════════════════
-- RLS — read for any signed-in user, write for super-admin only
-- ════════════════════════════════════════════════════════════
alter table public.org_branches    enable row level security;
alter table public.org_sections    enable row level security;
alter table public.org_positions   enable row level security;
alter table public.org_assignments enable row level security;

drop policy if exists "org_branches_read"  on public.org_branches;
create policy "org_branches_read"  on public.org_branches  for select using (auth.uid() is not null);
drop policy if exists "org_branches_write" on public.org_branches;
create policy "org_branches_write" on public.org_branches  for all    using (public.is_admin(array['super'])) with check (public.is_admin(array['super']));

drop policy if exists "org_sections_read"  on public.org_sections;
create policy "org_sections_read"  on public.org_sections  for select using (auth.uid() is not null);
drop policy if exists "org_sections_write" on public.org_sections;
create policy "org_sections_write" on public.org_sections  for all    using (public.is_admin(array['super'])) with check (public.is_admin(array['super']));

drop policy if exists "org_positions_read"  on public.org_positions;
create policy "org_positions_read"  on public.org_positions for select using (auth.uid() is not null);
drop policy if exists "org_positions_write" on public.org_positions;
create policy "org_positions_write" on public.org_positions for all    using (public.is_admin(array['super'])) with check (public.is_admin(array['super']));

drop policy if exists "org_assignments_read"  on public.org_assignments;
create policy "org_assignments_read"  on public.org_assignments for select using (auth.uid() is not null);
drop policy if exists "org_assignments_write" on public.org_assignments;
create policy "org_assignments_write" on public.org_assignments for all    using (public.is_admin(array['super'])) with check (public.is_admin(array['super']));

-- ════════════════════════════════════════════════════════════
-- SEED — Pacred's actual structure from the org chart image
--   (employee/internship/partner quotas read off the chart cells)
-- ════════════════════════════════════════════════════════════

-- 3 branches
insert into public.org_branches (slug, name, color_tone, sort_order) values
  ('bd-tech',       'Business Development & Tech', 'cyan',   1),
  ('operations',    'Operations',                  'yellow', 2),
  ('finance-admin', 'Finance & Admin',             'purple', 3)
on conflict (slug) do nothing;

-- Sections + positions (via DO block so we can resolve branch_id / section_id by slug)
do $$
declare
  b_bdtech uuid := (select id from public.org_branches where slug='bd-tech');
  b_ops    uuid := (select id from public.org_branches where slug='operations');
  b_fin    uuid := (select id from public.org_branches where slug='finance-admin');
  s_id     uuid;
begin
  -- ════ BD & Tech ════
  insert into public.org_sections (branch_id, slug, name, sort_order) values
    (b_bdtech, 'tech-staff', 'Tech Staff',  1),
    (b_bdtech, 'sourcing',   'Sourcing',    2)
  on conflict (branch_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_bdtech and slug='tech-staff');
  insert into public.org_positions (section_id, slug, name, quota_employee, sort_order) values
    (s_id, 'developer', 'Developer', 2, 1),
    (s_id, 'marketing', 'Marketing', 2, 2)
  on conflict (section_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_bdtech and slug='sourcing');
  insert into public.org_positions (section_id, slug, name, quota_employee, sort_order) values
    (s_id, 'pricing',      'Pricing',      1, 1),
    (s_id, 'merchandiser', 'Merchandiser', 1, 2),
    (s_id, 'planning',     'Planning',     1, 3)
  on conflict (section_id, slug) do nothing;

  -- ════ Operations ════
  insert into public.org_sections (branch_id, slug, name, sort_order) values
    (b_ops, 'sales',           'Sales',           1),
    (b_ops, 'cs-docs',          'CS · DOCS',       2),
    (b_ops, 'warehouse-staff',  'Warehouse Staff', 3),
    (b_ops, 'logistics',        'Logistics',       4),
    (b_ops, 'qa-qc',            'QA & QC',         5)
  on conflict (branch_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_ops and slug='sales');
  insert into public.org_positions (section_id, slug, name, quota_employee, sort_order) values
    (s_id, 'sales-team-a', 'Sales Team A', 2, 1),
    (s_id, 'sales-team-b', 'Sales Team B', 2, 2)
  on conflict (section_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_ops and slug='cs-docs');
  insert into public.org_positions (section_id, slug, name, quota_employee, sort_order) values
    (s_id, 'customer-service', 'Customer Service', 2, 1),
    (s_id, 'docs',             'Docs',             3, 2)
  on conflict (section_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_ops and slug='warehouse-staff');
  insert into public.org_positions (section_id, slug, name, quota_employee, sort_order) values
    (s_id, 'warehouse', 'Warehouse', 2, 1)
  on conflict (section_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_ops and slug='logistics');
  insert into public.org_positions (section_id, slug, name, quota_employee, quota_partner, sort_order) values
    (s_id, 'sup-express',     'Sup-Express',         2, 0, 1),
    (s_id, 'express',          'Express',             2, 0, 2),
    (s_id, 'driver',           'Driver',              1, 0, 3),
    (s_id, 'messenger',        'Messenger',           1, 0, 4),
    (s_id, 'partner-tractor',  'Partner Tractor หัวลาก', 0, 2, 5)
  on conflict (section_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_ops and slug='qa-qc');
  insert into public.org_positions (section_id, slug, name, quota_employee, sort_order) values
    (s_id, 'qa',    'QA',     1, 1),
    (s_id, 'qc',    'QC',     1, 2),
    (s_id, 'audit', 'Audit',  1, 3)
  on conflict (section_id, slug) do nothing;

  -- ════ Finance & Admin ════
  insert into public.org_sections (branch_id, slug, name, sort_order) values
    (b_fin, 'accounting',      'Accounting',      1),
    (b_fin, 'human-resources', 'Human Resources', 2)
  on conflict (branch_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_fin and slug='accounting');
  insert into public.org_positions (section_id, slug, name, quota_employee, sort_order) values
    (s_id, 'acc-ar', 'ACC AR (รายรับ)', 1, 1),
    (s_id, 'acc-ap', 'ACC AP (รายจ่าย)', 1, 2)
  on conflict (section_id, slug) do nothing;

  s_id := (select id from public.org_sections where branch_id=b_fin and slug='human-resources');
  insert into public.org_positions (section_id, slug, name, quota_employee, sort_order) values
    (s_id, 'hr',   'HR',   1, 1),
    (s_id, 'maid', 'Maid', 2, 2)
  on conflict (section_id, slug) do nothing;
end$$;


-- ════════════════════════════════════════════════════════════
-- 0018_hr_employees.sql
-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- Phase H · HR — Employee directory extras
-- ════════════════════════════════════════════════════════════
-- Adds the columns admin_contact_extras was missing for the
-- /admin/hr/employees data-table view:
--   • nickname       — ชื่อเล่น (เซลล์ มิว, ปอน, ฯลฯ)
--   • company        — Pacred Cargo / Pacred Freight (multi-brand future-proof)
--   • employee_type  — พนักงานประจำ / ทดลองงาน / รายเดือน / รายวัน
--   • work_email     — อีเมลบริษัท (แยกจาก profiles.email = อีเมลส่วนตัว)
--   • work_phone     — เบอร์บริษัท (แยกจาก profiles.phone = เบอร์ส่วนตัว)
--   • suspended_at   — null = ยังทำงานอยู่, otherwise ลาออก/พักงาน
--   • hired_at       — วันเริ่มทำงานจริง (admins.granted_at = วันให้สิทธิ์ในระบบ)
-- ════════════════════════════════════════════════════════════

alter table public.admin_contact_extras
  add column if not exists nickname       text,
  add column if not exists company        text check (company in ('pacred','pacred-cargo','pacred-freight')) default 'pacred',
  add column if not exists employee_type  text check (employee_type in ('full_time','probation','contract','daily','intern','partner')) default 'full_time',
  add column if not exists work_email     text,
  add column if not exists work_phone     text,
  add column if not exists hired_at       date,
  add column if not exists suspended_at   timestamptz;

create index if not exists admin_contact_extras_active_idx
  on public.admin_contact_extras(suspended_at)
  where suspended_at is null;


-- ════════════════════════════════════════════════════════════
-- 0019_hr_recruitment.sql
-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- Phase H · HR — Recruitment (สรรหา / รับสมัครงาน)
-- ════════════════════════════════════════════════════════════
-- Workflow:
--   1. HR creates a job_posting (linked to org_positions, optional)
--   2. Applicants flow in (walk-in / online / referral)
--   3. Applicants advance through stages:
--        applied → screening → interviewing → offered → hired / rejected
--   4. When hired, hr links the applicant to a profile_id (the new
--      employee's account) so the employee directory + org assignments
--      stay in sync.
--
-- Resumes/CVs go into the private "resumes" Storage bucket, foldered by
-- applicant_id so RLS can scope downloads to admins only.
-- ════════════════════════════════════════════════════════════

-- ── job_postings ──
create table if not exists public.job_postings (
  id                 uuid primary key default gen_random_uuid(),
  slug               text unique not null,
  title              text not null,
  position_id        uuid references public.org_positions(id) on delete set null,
  description        text,
  status             text not null default 'open'
                       check (status in ('draft','open','paused','closed')),
  openings_count     int  not null default 1 check (openings_count >= 1),
  salary_range_text  text,
  location           text,
  employment_type    text not null default 'full_time'
                       check (employment_type in ('full_time','probation','contract','daily','intern','partner')),
  posted_at          timestamptz,
  closed_at          timestamptz,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists job_postings_updated_at_trigger on public.job_postings;
create trigger job_postings_updated_at_trigger before update on public.job_postings
  for each row execute function public.set_updated_at();

create index if not exists job_postings_status_idx on public.job_postings(status, posted_at desc);
create index if not exists job_postings_position_idx on public.job_postings(position_id) where position_id is not null;

-- ── job_applicants ──
create table if not exists public.job_applicants (
  id                      uuid primary key default gen_random_uuid(),
  posting_id              uuid not null references public.job_postings(id) on delete cascade,

  -- identity (free-form; we don't require a profile until hired)
  first_name              text not null,
  last_name               text,
  nickname                text,
  phone                   text,
  email                   text,
  birth_date              date,

  -- resume + intake
  resume_path             text,                               -- path in 'resumes' bucket
  source                  text not null default 'walk_in'
                            check (source in ('walk_in','website','line','facebook','referral','jobsdb','other')),
  source_note             text,                               -- e.g. referrer name
  applied_at              timestamptz not null default now(),

  -- pipeline
  stage                   text not null default 'applied'
                            check (stage in ('applied','screening','interviewing','offered','hired','rejected')),
  notes                   text,                               -- HR private notes
  interview_scheduled_at  timestamptz,                        -- next interview slot
  interview_location      text,
  interviewer_profile_id  uuid references public.profiles(id) on delete set null,

  -- outcome
  hired_profile_id        uuid references public.profiles(id) on delete set null,
  hired_at                timestamptz,
  rejected_reason         text,
  rejected_at             timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

drop trigger if exists job_applicants_updated_at_trigger on public.job_applicants;
create trigger job_applicants_updated_at_trigger before update on public.job_applicants
  for each row execute function public.set_updated_at();

create index if not exists job_applicants_posting_idx  on public.job_applicants(posting_id, stage);
create index if not exists job_applicants_stage_idx    on public.job_applicants(stage, applied_at desc);
create index if not exists job_applicants_interview_idx on public.job_applicants(interview_scheduled_at)
  where interview_scheduled_at is not null and stage in ('screening','interviewing');

-- ════════════════════════════════════════════════════════════
-- RLS — admin-only (any active admin role can read+write)
-- ════════════════════════════════════════════════════════════
alter table public.job_postings   enable row level security;
alter table public.job_applicants enable row level security;

drop policy if exists "job_postings_admin_all" on public.job_postings;
create policy "job_postings_admin_all" on public.job_postings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "job_applicants_admin_all" on public.job_applicants;
create policy "job_applicants_admin_all" on public.job_applicants
  for all using (public.is_admin()) with check (public.is_admin());

-- ════════════════════════════════════════════════════════════
-- Storage bucket: resumes (private, admin-only)
-- ════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

drop policy if exists "resumes_admin_read"   on storage.objects;
create policy "resumes_admin_read"   on storage.objects
  for select using (bucket_id = 'resumes' and public.is_admin());

drop policy if exists "resumes_admin_write"  on storage.objects;
create policy "resumes_admin_write"  on storage.objects
  for insert with check (bucket_id = 'resumes' and public.is_admin());

drop policy if exists "resumes_admin_update" on storage.objects;
create policy "resumes_admin_update" on storage.objects
  for update using (bucket_id = 'resumes' and public.is_admin()) with check (bucket_id = 'resumes' and public.is_admin());

drop policy if exists "resumes_admin_delete" on storage.objects;
create policy "resumes_admin_delete" on storage.objects
  for delete using (bucket_id = 'resumes' and public.is_admin());

-- ════════════════════════════════════════════════════════════
-- Seed — sample postings (drafts of vacant positions from org_positions
-- with empty quotas). Skipped if any postings already exist so re-run
-- doesn't bloat the table.
-- ════════════════════════════════════════════════════════════
do $$
declare
  pos_developer  uuid := (select id from public.org_positions where slug='developer');
  pos_customer_service uuid := (select id from public.org_positions where slug='customer-service');
  pos_acc_ar     uuid := (select id from public.org_positions where slug='acc-ar');
begin
  if not exists (select 1 from public.job_postings limit 1) then
    insert into public.job_postings (slug, title, position_id, description, status, openings_count, salary_range_text, location, employment_type, posted_at)
    values
      ('dev-fullstack-2026', 'Full-stack Developer', pos_developer,
       'รับสมัคร Full-stack Developer (Next.js + Supabase) สำหรับทีม Pacred Tech — ดูแลระบบฝากนำเข้า/ฝากสั่ง/ฝากโอน',
       'open', 2, '35,000 - 60,000 บาท/เดือน', 'สำนักงานใหญ่ กรุงเทพฯ', 'full_time', now()),
      ('cs-pacred-2026', 'Customer Service (CS)', pos_customer_service,
       'ดูแลลูกค้าฝากนำเข้า/ฝากสั่งสินค้า ตอบ LINE OA + โทรศัพท์ + ติดตามสถานะออเดอร์',
       'open', 2, '18,000 - 25,000 บาท/เดือน', 'สำนักงานใหญ่ กรุงเทพฯ', 'full_time', now()),
      ('acc-ar-2026', 'พนักงานบัญชี รายรับ (AR)', pos_acc_ar,
       'จัดทำใบเสร็จ + ตรวจสอบรายรับ + กระทบยอด wallet + ออกใบกำกับภาษี',
       'paused', 1, '22,000 - 30,000 บาท/เดือน', 'สำนักงานใหญ่ กรุงเทพฯ', 'full_time', now() - interval '7 days');
  end if;
end$$;


-- ════════════════════════════════════════════════════════════
-- 0020_hr_attendance.sql
-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- Phase H · HR — Time Attendance (TAS) + Leave Management
-- ════════════════════════════════════════════════════════════
-- Two related operational tables:
--   1. attendance_logs   — one row per (profile, work_date) with
--                          clock_in / clock_out and computed status.
--                          Currently populated manually by HR. Future:
--                          biometric device + employee self-service.
--   2. leave_requests    — vacation/sick/personal/etc. requests with
--                          a pending/approved/rejected lifecycle. Admin
--                          (super) approves; once approved, the matching
--                          attendance_log days are auto-marked 'leave'.
--
-- Default schedule (org-wide for now): 08:30 - 17:30 with 15-min grace
-- on clock-in. Per-employee or per-department schedule can be added
-- later via admin_contact_extras.
-- ════════════════════════════════════════════════════════════

-- ── attendance_logs ──
create table if not exists public.attendance_logs (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  work_date       date not null,

  clock_in        timestamptz,
  clock_out       timestamptz,
  expected_in     time not null default '08:30',
  expected_out    time not null default '17:30',

  status          text not null default 'absent'
                    check (status in (
                      'present',    -- clock_in & on time
                      'late',       -- clock_in > expected_in + grace
                      'early_leave',-- clock_out < expected_out
                      'absent',     -- no clock_in by end of day
                      'leave',      -- approved leave_request covers this day
                      'holiday',    -- public holiday / company off
                      'off'         -- regular day off (sat/sun)
                    )),
  late_minutes    int  not null default 0,
  worked_minutes  int  not null default 0,

  location        text,
  source          text not null default 'manual'
                    check (source in ('web','biometric','manual','import')),
  note            text,

  recorded_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (profile_id, work_date)
);

drop trigger if exists attendance_logs_updated_at_trigger on public.attendance_logs;
create trigger attendance_logs_updated_at_trigger before update on public.attendance_logs
  for each row execute function public.set_updated_at();

create index if not exists attendance_logs_date_idx on public.attendance_logs(work_date desc, status);
create index if not exists attendance_logs_profile_idx on public.attendance_logs(profile_id, work_date desc);

-- ── leave_requests ──
create table if not exists public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,

  leave_type      text not null
                    check (leave_type in ('vacation','sick','personal','maternity','marriage','funeral','unpaid','other')),
  start_date      date not null,
  end_date        date not null,
  days_count      numeric(4,1) not null default 1.0 check (days_count > 0),
  reason          text,

  status          text not null default 'pending'
                    check (status in ('pending','approved','rejected','cancelled')),
  approved_by     uuid references public.profiles(id) on delete set null,
  approved_at     timestamptz,
  approval_note   text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  check (end_date >= start_date)
);

drop trigger if exists leave_requests_updated_at_trigger on public.leave_requests;
create trigger leave_requests_updated_at_trigger before update on public.leave_requests
  for each row execute function public.set_updated_at();

create index if not exists leave_requests_status_idx on public.leave_requests(status, start_date desc);
create index if not exists leave_requests_profile_idx on public.leave_requests(profile_id, start_date desc);
create index if not exists leave_requests_pending_idx on public.leave_requests(created_at desc) where status = 'pending';

-- ════════════════════════════════════════════════════════════
-- Helper — recompute late_minutes + worked_minutes + status from
-- clock_in / clock_out. Called by upsert action + on trigger.
-- (Grace period = 15 min on clock-in)
-- ════════════════════════════════════════════════════════════
create or replace function public.recompute_attendance_log()
returns trigger language plpgsql as $$
declare
  grace_min int := 15;
  late_threshold timestamptz;
  expected_out_ts timestamptz;
  expected_in_ts  timestamptz;
begin
  -- Skip override if status already 'leave' / 'holiday' / 'off' (admin-set)
  if new.status in ('leave','holiday','off') then
    new.late_minutes   := 0;
    new.worked_minutes := 0;
    return new;
  end if;

  expected_in_ts  := (new.work_date::text || ' ' || new.expected_in::text)::timestamptz;
  expected_out_ts := (new.work_date::text || ' ' || new.expected_out::text)::timestamptz;
  late_threshold  := expected_in_ts + (grace_min || ' minutes')::interval;

  if new.clock_in is null then
    new.status := 'absent';
    new.late_minutes := 0;
    new.worked_minutes := 0;
  else
    -- Late calc
    if new.clock_in > late_threshold then
      new.status := 'late';
      new.late_minutes := greatest(0, ceil(extract(epoch from (new.clock_in - expected_in_ts)) / 60))::int;
    else
      new.status := 'present';
      new.late_minutes := 0;
    end if;

    -- Early leave
    if new.clock_out is not null and new.clock_out < expected_out_ts then
      new.status := 'early_leave';
    end if;

    -- Worked minutes
    if new.clock_out is not null then
      new.worked_minutes := greatest(0, ceil(extract(epoch from (new.clock_out - new.clock_in)) / 60))::int;
    else
      new.worked_minutes := 0;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_logs_recompute_trigger on public.attendance_logs;
create trigger attendance_logs_recompute_trigger
  before insert or update of clock_in, clock_out, expected_in, expected_out, status
  on public.attendance_logs
  for each row execute function public.recompute_attendance_log();

-- ════════════════════════════════════════════════════════════
-- Helper — when a leave_request is APPROVED, fill matching
-- attendance_logs days with status='leave' so the dashboard shows the
-- employee as on leave instead of absent.
-- ════════════════════════════════════════════════════════════
create or replace function public.apply_leave_to_attendance()
returns trigger language plpgsql as $$
declare
  d date;
begin
  if new.status = 'approved' and (old.status is null or old.status <> 'approved') then
    d := new.start_date;
    while d <= new.end_date loop
      insert into public.attendance_logs (profile_id, work_date, status, note, source)
      values (new.profile_id, d, 'leave',
              concat('Auto-set by leave request: ', new.leave_type), 'manual')
      on conflict (profile_id, work_date)
        do update set status = 'leave',
                      note = excluded.note;
      d := d + interval '1 day';
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists leave_requests_apply_trigger on public.leave_requests;
create trigger leave_requests_apply_trigger
  after insert or update of status
  on public.leave_requests
  for each row execute function public.apply_leave_to_attendance();

-- ════════════════════════════════════════════════════════════
-- RLS — admin-only for both tables (employees see own rows via separate
-- policy added in a future Phase 4 when /me/attendance ships).
-- ════════════════════════════════════════════════════════════
alter table public.attendance_logs enable row level security;
alter table public.leave_requests  enable row level security;

drop policy if exists "attendance_logs_admin_all" on public.attendance_logs;
create policy "attendance_logs_admin_all" on public.attendance_logs
  for all using (public.is_admin()) with check (public.is_admin());

-- Employee can see their own logs (for future self-service page)
drop policy if exists "attendance_logs_self_read" on public.attendance_logs;
create policy "attendance_logs_self_read" on public.attendance_logs
  for select using (profile_id = auth.uid());

drop policy if exists "leave_requests_admin_all" on public.leave_requests;
create policy "leave_requests_admin_all" on public.leave_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- Employee can see + create their own leave requests
drop policy if exists "leave_requests_self_read" on public.leave_requests;
create policy "leave_requests_self_read" on public.leave_requests
  for select using (profile_id = auth.uid());

drop policy if exists "leave_requests_self_insert" on public.leave_requests;
create policy "leave_requests_self_insert" on public.leave_requests
  for insert with check (profile_id = auth.uid() and status = 'pending');


-- ════════════════════════════════════════════════════════════
-- 0021_hr_learning_policies_audit.sql
-- ════════════════════════════════════════════════════════════
-- ════════════════════════════════════════════════════════════
-- Phase H · HR — Learning + Policies + Employee Audit
-- ════════════════════════════════════════════════════════════
-- 3 related people-ops tables to close out the HR module:
--   1. training_courses + training_enrollments
--        — internal courses ("LINE OA workflow", "Customs basics") +
--          per-employee enrollment + completion tracking.
--   2. policies + policy_acknowledgments
--        — company policy library (HR manual, IT acceptable use, data
--          protection) with optional "must acknowledge" workflow.
--   3. employee_audit_entries
--        — disciplinary actions / praises / warnings / notes recorded
--          against an employee profile. Source of truth for HR
--          performance reviews.
-- ════════════════════════════════════════════════════════════

-- ── training_courses ──
create table if not exists public.training_courses (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  title            text not null,
  category         text not null default 'general'
                     check (category in ('general','operations','compliance','technical','soft_skills','safety')),
  description      text,
  duration_hours   numeric(5,2) not null default 1.0 check (duration_hours > 0),
  instructor       text,                                       -- free text — could be external or "เซลล์ มิว"
  materials_url    text,                                       -- link to slide deck / video / Notion
  is_mandatory     boolean not null default false,             -- if true, every employee should enroll
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists training_courses_updated_at_trigger on public.training_courses;
create trigger training_courses_updated_at_trigger before update on public.training_courses
  for each row execute function public.set_updated_at();

create index if not exists training_courses_active_idx on public.training_courses(is_active, category);

-- ── training_enrollments ──
create table if not exists public.training_enrollments (
  id               uuid primary key default gen_random_uuid(),
  course_id        uuid not null references public.training_courses(id) on delete cascade,
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  status           text not null default 'enrolled'
                     check (status in ('enrolled','in_progress','completed','failed','exempted')),
  enrolled_at      timestamptz not null default now(),
  started_at       timestamptz,
  completed_at     timestamptz,
  score            numeric(5,2),                               -- 0-100 if scored
  certificate_url  text,
  notes            text,
  recorded_by      uuid references public.profiles(id) on delete set null,
  updated_at       timestamptz not null default now(),
  unique (course_id, profile_id)
);

drop trigger if exists training_enrollments_updated_at_trigger on public.training_enrollments;
create trigger training_enrollments_updated_at_trigger before update on public.training_enrollments
  for each row execute function public.set_updated_at();

create index if not exists training_enrollments_course_idx  on public.training_enrollments(course_id, status);
create index if not exists training_enrollments_profile_idx on public.training_enrollments(profile_id, status);

-- ── policies ──
create table if not exists public.policies (
  id               uuid primary key default gen_random_uuid(),
  slug             text unique not null,
  title            text not null,
  category         text not null default 'general'
                     check (category in ('general','hr','it','finance','operations','compliance','safety','data_privacy')),
  version          text not null default '1.0',
  body             text,                                       -- markdown
  external_url     text,                                       -- if hosted elsewhere (Notion, Confluence)
  requires_ack     boolean not null default false,             -- if true, employees must acknowledge
  is_published     boolean not null default false,
  published_at     timestamptz,
  effective_at     date,
  expires_at       date,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists policies_updated_at_trigger on public.policies;
create trigger policies_updated_at_trigger before update on public.policies
  for each row execute function public.set_updated_at();

create index if not exists policies_published_idx on public.policies(is_published, category);

-- ── policy_acknowledgments ──
create table if not exists public.policy_acknowledgments (
  id              uuid primary key default gen_random_uuid(),
  policy_id       uuid not null references public.policies(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  ip_address      inet,
  user_agent      text,
  unique (policy_id, profile_id)
);

create index if not exists policy_acks_policy_idx  on public.policy_acknowledgments(policy_id);
create index if not exists policy_acks_profile_idx on public.policy_acknowledgments(profile_id);

-- ── employee_audit_entries ──
-- Performance/disciplinary notes — different from admin_audit_log which
-- tracks system mutations. This is "person-centric HR file".
create table if not exists public.employee_audit_entries (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  entry_type      text not null
                    check (entry_type in ('praise','note','warning','disciplinary','training','review','other')),
  severity        text not null default 'info'
                    check (severity in ('info','low','medium','high','critical')),
  title           text not null,
  description     text,
  related_at      date,                                         -- when the event occurred
  attachments_urls text[],                                      -- optional links to docs / photos
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists employee_audit_entries_updated_at_trigger on public.employee_audit_entries;
create trigger employee_audit_entries_updated_at_trigger before update on public.employee_audit_entries
  for each row execute function public.set_updated_at();

create index if not exists employee_audit_entries_profile_idx on public.employee_audit_entries(profile_id, created_at desc);
create index if not exists employee_audit_entries_type_idx    on public.employee_audit_entries(entry_type, severity, created_at desc);

-- ════════════════════════════════════════════════════════════
-- RLS — admin all-access; employees can read own enrollments + ack own
-- policies + see own audit entries (future /me/profile reveals these).
-- ════════════════════════════════════════════════════════════
alter table public.training_courses           enable row level security;
alter table public.training_enrollments       enable row level security;
alter table public.policies                   enable row level security;
alter table public.policy_acknowledgments     enable row level security;
alter table public.employee_audit_entries     enable row level security;

-- training_courses: published-and-active courses visible to all admins (for now we just gate by is_admin)
drop policy if exists "training_courses_admin_all" on public.training_courses;
create policy "training_courses_admin_all" on public.training_courses
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "training_enrollments_admin_all" on public.training_enrollments;
create policy "training_enrollments_admin_all" on public.training_enrollments
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "training_enrollments_self_read" on public.training_enrollments;
create policy "training_enrollments_self_read" on public.training_enrollments
  for select using (profile_id = auth.uid());

drop policy if exists "policies_admin_all" on public.policies;
create policy "policies_admin_all" on public.policies
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "policies_published_read" on public.policies;
create policy "policies_published_read" on public.policies
  for select using (auth.role() = 'authenticated' and is_published = true);

drop policy if exists "policy_acks_admin_all" on public.policy_acknowledgments;
create policy "policy_acks_admin_all" on public.policy_acknowledgments
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "policy_acks_self_all" on public.policy_acknowledgments;
create policy "policy_acks_self_all" on public.policy_acknowledgments
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists "employee_audit_entries_admin_all" on public.employee_audit_entries;
create policy "employee_audit_entries_admin_all" on public.employee_audit_entries
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "employee_audit_entries_self_read" on public.employee_audit_entries;
create policy "employee_audit_entries_self_read" on public.employee_audit_entries
  for select using (profile_id = auth.uid());

-- ════════════════════════════════════════════════════════════
-- Seed — sample courses + policies (skip if any rows exist already)
-- ════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from public.training_courses limit 1) then
    insert into public.training_courses (slug, title, category, description, duration_hours, instructor, is_mandatory) values
      ('cs-line-oa',       'การใช้งาน LINE OA สำหรับ CS', 'operations', 'ตอบลูกค้า · จัดการกรุ๊ปสนทนา · escalation workflow', 2.0, 'ทีม CS Lead', true),
      ('customs-basics',   'พื้นฐานพิธีการศุลกากร',       'compliance', 'HS code · ใบขนสินค้า · ภาษี import · ฟอร์มหลัก', 4.0, 'ทีม Operations', false),
      ('data-privacy-101', 'การคุ้มครองข้อมูลส่วนบุคคล (PDPA)', 'compliance', 'หลักการ PDPA · ข้อมูลที่อ่อนไหว · การจัดการคำขอจากเจ้าของข้อมูล', 1.5, 'ทีม Compliance', true);
  end if;

  if not exists (select 1 from public.policies limit 1) then
    insert into public.policies (slug, title, category, version, body, requires_ack, is_published, published_at, effective_at) values
      ('hr-manual-2026',     'ระเบียบพนักงาน Pacred 2026',    'hr',          '1.0',
       'ระเบียบการลา · เครื่องแบบ · เวลาทำงาน · การประเมินผล · ค่าตอบแทน · บทลงโทษ', true, true, now(), current_date),
      ('it-acceptable-use',  'การใช้งานอุปกรณ์และระบบ IT',     'it',          '1.0',
       'ห้ามใช้อุปกรณ์บริษัทเพื่อจุดประสงค์ส่วนตัวที่ผิดกฎหมาย · นโยบายรหัสผ่าน · BYOD · backup', true, true, now(), current_date),
      ('data-privacy-policy','นโยบายคุ้มครองข้อมูลส่วนบุคคล',  'data_privacy','1.0',
       'การเก็บ ใช้ และเปิดเผยข้อมูลส่วนบุคคลของลูกค้า · สิทธิของเจ้าของข้อมูล · กระบวนการ data breach', true, true, now(), current_date),
      ('safety-warehouse',   'ความปลอดภัยในโกดัง',            'safety',      '1.0',
       'การยกของหนัก · การใช้รถยก · ทางหนีไฟ · เหตุฉุกเฉิน', false, true, now(), current_date);
  end if;
end$$;

