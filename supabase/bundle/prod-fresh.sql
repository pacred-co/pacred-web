-- =====================================================================
-- Pacred / pacred-web · CONSOLIDATED PROD-FRESH SCHEMA BUNDLE
-- =====================================================================
-- Generated 2026-05-20 ค่ำ per ภูม directive (move to supabase prod only).
--
-- This bundle concatenates every migration in supabase/migrations/ in
-- numeric order. Apply once to a FRESH Supabase project to reproduce
-- the exact production schema. Do NOT re-run on an existing DB.
--
-- Order:
--   0002-0080 → Pacred app schema (profiles · forwarders · wallet ·
--     orders · containers spine · HR · admin RBAC · audit log)
--   0081-0083 → LEGACY PCS Cargo `tb_*` schema (117 tables, ~8898
--     customers ported from pcsc_main).
--   0084-0086 → Pacred extensions (booking docs · tax-invoice CN ·
--     work-item messages).
--   0087 → migration_view SECURITY INVOKER hardening.
--   0089 → disbursement kind enum extension.
--
-- Intentional gaps: 0001 · 0065 · 0088 (unused numbers; see
-- supabase/migrations/README.md for context).
--
-- Run procedure (Supabase SQL editor): paste this entire file as one
-- statement. Alternative (psql):
--   psql "$PROD_DB_URL" -f supabase/bundle/prod-fresh.sql
-- =====================================================================

-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0002_orders.sql                                                ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0003_profiles_extended.sql                                     ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0004_corporate.sql                                             ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0005_addresses.sql                                             ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0006_tos_acceptance.sql                                        ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0007_wallet.sql                                                ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0008_payment_yuan.sql                                          ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0009_rates.sql                                                 ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0010_forwarder.sql                                             ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0011_service_order.sql                                         ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0012_avatars_bucket.sql                                        ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0013_sales_referral.sql                                        ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0014_notifications.sql                                         ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0015_admin_rbac.sql                                            ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0016_phase_h_upgrades.sql                                      ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0017_org_chart.sql                                             ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0018_hr_employees.sql                                          ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0019_hr_recruitment.sql                                        ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0020_hr_attendance.sql                                         ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0021_hr_learning_policies_audit.sql                            ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0022_contact_messages.sql                                      ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- P-6 · Contact form submissions
-- ════════════════════════════════════════════════════════════
-- Public contact form on /contact stores submissions here. Logged-in
-- users get profile_id linkage; guests submit anonymously. Admins read
-- + triage via the existing admin notifications fan-out.
-- ════════════════════════════════════════════════════════════

create table if not exists public.contact_messages (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid references public.profiles(id) on delete set null,
  name         text not null,
  contact      text not null,                                       -- email or phone (free-form for now)
  subject      text,
  message      text not null,
  status       text not null default 'new'
                 check (status in ('new','read','replied','closed')),
  source_url   text,                                                -- referrer if available
  user_agent   text,
  ip           text,                                                -- abuse / rate-limit signal
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists contact_messages_status_idx
  on public.contact_messages(status, created_at desc);
create index if not exists contact_messages_profile_idx
  on public.contact_messages(profile_id);

drop trigger if exists contact_messages_updated_at_trigger on public.contact_messages;
create trigger contact_messages_updated_at_trigger
  before update on public.contact_messages
  for each row execute function public.set_updated_at();

-- ── RLS ──
alter table public.contact_messages enable row level security;

-- Anyone (anon + authenticated) may submit
drop policy if exists contact_messages_insert_anyone on public.contact_messages;
create policy contact_messages_insert_anyone
  on public.contact_messages for insert
  with check (true);

-- Authenticated users see their own past submissions
drop policy if exists contact_messages_select_own on public.contact_messages;
create policy contact_messages_select_own
  on public.contact_messages for select
  using (profile_id is not null and auth.uid() = profile_id);

-- Admins read + update everything (status triage)
drop policy if exists contact_messages_admin_all on public.contact_messages;
create policy contact_messages_admin_all
  on public.contact_messages for all
  using (public.is_admin())
  with check (public.is_admin());


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0023_otp_purpose_change_phone.sql                              ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- P-3 · Extend otp_codes.purpose for phone-change flow
-- ════════════════════════════════════════════════════════════
-- Original schema.sql constrained purpose to ('register','login','reset').
-- P-3 needs a separate purpose so the change-phone OTP rate-limit and
-- one-time use stay isolated from password-reset codes.
-- ════════════════════════════════════════════════════════════

alter table public.otp_codes
  drop constraint if exists otp_codes_purpose_check;

alter table public.otp_codes
  add constraint otp_codes_purpose_check
  check (purpose in ('register','login','reset','change_phone'));


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0024_notification_ref_contact_message.sql                      ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- 0024 · Extend notifications.reference_type to include
--       'contact_message' so admin notifications fired by P-6
--       (commit 3a9252e + admin page 8db9140) can deep-link.
-- ════════════════════════════════════════════════════════════
-- Original CHECK constraint set in 0014_notifications.sql allowed
-- only customer-side reference types. Admin-side notifications
-- (e.g. "ข้อความใหม่จากฟอร์มติดต่อ") need 'contact_message' too.
--
-- Idempotent: drops + recreates the constraint with both old and
-- new values. Safe to re-run.
-- ════════════════════════════════════════════════════════════

alter table public.notifications
  drop constraint if exists notifications_reference_type_check;

alter table public.notifications
  add constraint notifications_reference_type_check
  check (reference_type in (
    'service_order',
    'forwarder',
    'yuan_payment',
    'wallet_transaction',
    'sales_commission',
    'sales_payout',
    'contact_message'
  ));


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0025_profiles_notify_channels_daily_digest.sql                 ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- P-15 · Add daily_digest flag to profiles.notify_channels jsonb
-- ════════════════════════════════════════════════════════════
-- Per Part O2 Sprint 6 P-15 (เดฟ assigned 2026-05-14): the
-- /api/cron/sales-daily-digest endpoint loops admins where
--   role IN ('super','sales_admin') AND notify_channels.daily_digest = true
-- and calls sendNotification() per opted-in admin.
--
-- The notify_channels column already exists (migration 0014), used
-- for {line, email} toggles. We extend the JSON shape with a third
-- key. Default: false — admins must opt in via /profile (UI work
-- can come later; for now toggle via Supabase Table Editor).
--
-- Idempotent — uses jsonb || merge so existing keys stay.
-- ════════════════════════════════════════════════════════════

update public.profiles
   set notify_channels = coalesce(notify_channels, '{}'::jsonb) || '{"daily_digest": false}'::jsonb
 where notify_channels is null
    or notify_channels->>'daily_digest' is null;

-- New rows: notify_channels has no enforced default key shape, so
-- the cron endpoint treats `notify_channels->>'daily_digest' = 'true'`
-- as opt-in (anything else, including null/missing, = opt-out).


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0026_notification_category_sales_digest.sql                    ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- P-15 · Extend notifications.category CHECK to include
--        'sales_digest' for the daily sales digest cron.
-- ════════════════════════════════════════════════════════════
-- Original CHECK constraint set in 0014_notifications.sql allowed
-- 8 customer-facing event categories. P-15 spec calls for
-- category='sales_digest' on each admin notification dispatched
-- by /api/cron/sales-daily-digest — needs a new enum value.
--
-- Idempotent: drops + recreates with the new value appended.
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════

alter table public.notifications
  drop constraint if exists notifications_category_check;

alter table public.notifications
  add constraint notifications_category_check
  check (category in (
    'order',
    'payment',
    'forwarder',
    'yuan_payment',
    'wallet',
    'sales',
    'system',
    'promo',
    'sales_digest'
  ));


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0027_admin_contact_extras_contract_end_date.sql                ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- P-17 · Add contract_end_date to admin_contact_extras for the
--        probation-expiry cron sweep.
-- ════════════════════════════════════════════════════════════
-- Per Part O2 Sprint 6 P-17 (เดฟ assigned 2026-05-14): port the
-- legacy admin half of pcs-admin/api/autorun/check-apprentice/ —
-- sweep employees on probation whose contract end date has passed
-- and deactivate them.
--
-- DECISION (ภูม, per §6): spec wrote "employees.contract_end_date"
-- but our HR module (migration 0018) stores employee meta on
-- admin_contact_extras (column extension over admins) — there's no
-- separate `employees` table. Same with "is_active": HR uses
-- `suspended_at IS NULL` to mean "still working". The cron route
-- (P-17 follow-up) writes `suspended_at = now()` when the contract
-- is past due.
--
-- Idempotent — column adds are NOOP if already present.
-- ════════════════════════════════════════════════════════════

alter table public.admin_contact_extras
  add column if not exists contract_end_date date;

-- Speed up the cron sweep query: find probation employees whose
-- end date has passed and who are still active.
create index if not exists admin_contact_extras_probation_expiring_idx
  on public.admin_contact_extras(contract_end_date)
  where employee_type = 'probation' and suspended_at is null;

comment on column public.admin_contact_extras.contract_end_date is
  'For employee_type=''probation'': end of probation period. The /api/cron/expire-probation cron sweeps past-due rows daily and sets suspended_at=now().';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0028_forwarder_driver.sql                                      ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- P-18 · forwarder_driver — driver assignment table
-- ════════════════════════════════════════════════════════════
-- Per Part O2 Sprint 6 P-18 (เดฟ assigned 2026-05-14): port legacy
-- tb_forwarder_driver. Each row = one assignment of a forwarder
-- shipment to a delivery driver (a profiles row whose user is set
-- up as driver via admin tooling — no separate driver table for now;
-- profile_id is enough).
--
-- State machine:
--   1 = assigned    (waiting for driver accept; auto-expires after 17h)
--   2 = accepted    (driver took the job)
--   3 = expired     (17h timeout; cron flipped 1 → 3)
--   4 = completed   (delivery confirmed)
--
-- Driver expiry cron sweeps status=1 AND fd_date < now()-17h → status=3
-- (route: /api/cron/expire-driver-assignments, schedule hourly).
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

create table if not exists public.forwarder_driver (
  id            uuid primary key default gen_random_uuid(),
  forwarder_id  uuid not null references public.forwarders(id) on delete cascade,
  profile_id    uuid not null references public.profiles(id)   on delete restrict,
  status        smallint not null default 1
                  check (status in (1, 2, 3, 4)),
  fd_date       timestamptz not null default now(),                -- assigned_at
  accepted_at   timestamptz,
  completed_at  timestamptz,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists forwarder_driver_forwarder_idx
  on public.forwarder_driver(forwarder_id);
create index if not exists forwarder_driver_profile_idx
  on public.forwarder_driver(profile_id);
-- Composite index supports the cron sweep + admin filter-by-status.
create index if not exists forwarder_driver_status_date_idx
  on public.forwarder_driver(status, fd_date);

drop trigger if exists forwarder_driver_updated_at_trigger
  on public.forwarder_driver;
create trigger forwarder_driver_updated_at_trigger
  before update on public.forwarder_driver
  for each row execute function public.set_updated_at();

-- ── RLS ──
alter table public.forwarder_driver enable row level security;

-- Drivers see their own assignments
drop policy if exists forwarder_driver_select_own on public.forwarder_driver;
create policy forwarder_driver_select_own
  on public.forwarder_driver for select
  using (auth.uid() = profile_id);

-- Admins (any role): full access
drop policy if exists forwarder_driver_admin_all on public.forwarder_driver;
create policy forwarder_driver_admin_all
  on public.forwarder_driver for all
  using (public.is_admin())
  with check (public.is_admin());

comment on table  public.forwarder_driver is
  'Assignment of a forwarder shipment to a delivery driver. Status state machine: 1=assigned → 2=accepted (or 3=expired via cron after 17h) → 4=completed. Mirror of legacy tb_forwarder_driver.';
comment on column public.forwarder_driver.fd_date is
  'Assignment timestamp. Cron /api/cron/expire-driver-assignments flips status=1 → 3 when fd_date < now()-17h.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0029_csv_imports.sql                                           ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- P-19 · Admin CSV bulk import — staging table + storage bucket
-- ════════════════════════════════════════════════════════════
-- Per Part O2 Sprint 6 P-19 (เดฟ assigned 2026-05-14): port the
-- legacy admin tools `import-excel.php` + `single-code-text-converter.php`.
--
-- Workflow:
--   1. Admin uploads CSV via /admin/csv-imports/upload — file goes to
--      Supabase Storage `csv-imports/<admin_uuid>/<timestamp>.csv` and
--      a row is created in csv_imports with status='uploaded'.
--   2. Admin opens detail → server parses with papaparse, captures
--      first 5 rows into preview_rows jsonb, status flips to 'previewed'.
--   3. Admin reviews preview → clicks "Import" → server parses full file
--      and inserts into target_table. status flips 'importing' → 'imported'
--      or 'failed' on error (error_message captured).
--
-- Start scope (per spec): target_table='forwarders' only — most common
-- use case. Future: extend CHECK to add other targets (cart_items,
-- yuan_payments, etc.).
--
-- DECISION (ภูม, per §6): migration number 0029 (spec wrote 0028
-- but 0028 was claimed by P-18 forwarder_driver this morning).
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

create table if not exists public.csv_imports (
  id              uuid primary key default gen_random_uuid(),
  uploader_id     uuid not null references public.profiles(id) on delete restrict,
  filename        text not null,
  storage_path    text not null,                                       -- relative path in csv-imports bucket
  target_table    text not null check (target_table in ('forwarders')),
  status          text not null default 'uploaded'
                    check (status in ('uploaded','previewed','importing','imported','failed')),
  row_count       integer not null default 0,                          -- total parsed rows (excl header)
  imported_count  integer not null default 0,                          -- successfully written rows
  preview_rows    jsonb,                                               -- first ~5 rows for the preview UI
  error_message   text,
  size_bytes      integer,
  mime_type       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  imported_at     timestamptz
);

create index if not exists csv_imports_uploader_idx
  on public.csv_imports(uploader_id, created_at desc);
create index if not exists csv_imports_status_idx
  on public.csv_imports(status, created_at desc);

drop trigger if exists csv_imports_updated_at_trigger on public.csv_imports;
create trigger csv_imports_updated_at_trigger
  before update on public.csv_imports
  for each row execute function public.set_updated_at();

-- ── RLS — admin-only ──
alter table public.csv_imports enable row level security;

drop policy if exists csv_imports_admin_all on public.csv_imports;
create policy csv_imports_admin_all
  on public.csv_imports for all
  using (public.is_admin())
  with check (public.is_admin());

-- ════════════════════════════════════════════════════════════
-- Storage — 'csv-imports' bucket for CSV uploads
-- ════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('csv-imports', 'csv-imports', false)
on conflict (id) do nothing;

-- Admin-only access (any of the 4 admin roles via is_admin()).
-- Folder convention: <admin_uuid>/<timestamp>.csv — but since the
-- whole bucket is admin-gated we don't need per-folder enforcement.

drop policy if exists "csv_imports_admin_select" on storage.objects;
create policy "csv_imports_admin_select" on storage.objects
  for select using (bucket_id = 'csv-imports' and public.is_admin());

drop policy if exists "csv_imports_admin_insert" on storage.objects;
create policy "csv_imports_admin_insert" on storage.objects
  for insert with check (bucket_id = 'csv-imports' and public.is_admin());

drop policy if exists "csv_imports_admin_update" on storage.objects;
create policy "csv_imports_admin_update" on storage.objects
  for update using (bucket_id = 'csv-imports' and public.is_admin());

drop policy if exists "csv_imports_admin_delete" on storage.objects;
create policy "csv_imports_admin_delete" on storage.objects
  for delete using (bucket_id = 'csv-imports' and public.is_admin());

comment on table public.csv_imports is
  'Admin staging table for CSV bulk imports. Each row tracks one upload through upload→preview→import lifecycle. Mirror of legacy tb_csvimport.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0030_hs_codes_rates.sql                                        ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- P-20 · HS code rates + container HS line items
-- ════════════════════════════════════════════════════════════
-- Per Part O2 Sprint 6 P-20 (เดฟ assigned 2026-05-14): port legacy
-- admin tools cnt-hs.php + hs-customrate.php + report-cnt.php into:
--
--   1. hs_codes — Customs HS code dictionary with default duty %
--   2. container_hs_lines — line items per container, qty/weight/value
--      sliced by HS code, joined to containers + hs_codes
--
-- Used by /admin/containers/[id]/hs (line items entry) and
-- /admin/reports/containers-hs (aggregate by hs_code report).
--
-- DECISION (ภูม, per §6): migration number 0030 (spec wrote 0029 —
-- claimed by P-19 csv_imports earlier today).
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- ── hs_codes — customs code dictionary ──
create table if not exists public.hs_codes (
  code              text primary key,                                -- e.g. "8517.12.00"
  description       text not null,
  description_en    text,
  default_duty_pct  numeric(6,3) not null default 0
                      check (default_duty_pct >= 0 and default_duty_pct <= 100),
  unit              text default 'piece',                            -- 'piece', 'kg', 'set', etc.
  note              text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists hs_codes_active_idx
  on public.hs_codes(is_active) where is_active = true;

drop trigger if exists hs_codes_updated_at_trigger on public.hs_codes;
create trigger hs_codes_updated_at_trigger
  before update on public.hs_codes
  for each row execute function public.set_updated_at();

-- ── container_hs_lines — qty/weight/value broken down by HS code ──
create table if not exists public.container_hs_lines (
  id              uuid primary key default gen_random_uuid(),
  container_id    uuid not null references public.containers(id) on delete cascade,
  hs_code         text not null references public.hs_codes(code)   on delete restrict,
  qty             numeric(14,3) not null default 0 check (qty >= 0),
  weight_kg       numeric(14,3) not null default 0 check (weight_kg >= 0),
  value_thb       numeric(14,2) not null default 0 check (value_thb >= 0),
  duty_pct_used   numeric(6,3),                                      -- snapshot of rate at line entry time (overridable)
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists container_hs_lines_container_idx
  on public.container_hs_lines(container_id);
create index if not exists container_hs_lines_hs_idx
  on public.container_hs_lines(hs_code);

drop trigger if exists container_hs_lines_updated_at_trigger on public.container_hs_lines;
create trigger container_hs_lines_updated_at_trigger
  before update on public.container_hs_lines
  for each row execute function public.set_updated_at();

-- ── RLS ──
alter table public.hs_codes            enable row level security;
alter table public.container_hs_lines  enable row level security;

-- hs_codes: admin write; everyone authenticated may read (rate
-- transparency for future customer-facing display).
drop policy if exists hs_codes_select_all on public.hs_codes;
create policy hs_codes_select_all on public.hs_codes
  for select using (true);

drop policy if exists hs_codes_admin_write on public.hs_codes;
create policy hs_codes_admin_write on public.hs_codes
  for all using (public.is_admin()) with check (public.is_admin());

-- container_hs_lines: admin-only (operational table).
drop policy if exists container_hs_lines_admin_all on public.container_hs_lines;
create policy container_hs_lines_admin_all on public.container_hs_lines
  for all using (public.is_admin()) with check (public.is_admin());

-- ── seed a few common HS codes so the picker isn't empty ──
insert into public.hs_codes (code, description, default_duty_pct, unit) values
  ('8517.12.00', 'โทรศัพท์มือถือ smartphone',                  0.000, 'piece'),
  ('8504.40.90', 'อะแดปเตอร์/ที่ชาร์จ',                            5.000, 'piece'),
  ('6109.10.00', 'เสื้อยืด cotton',                              30.000, 'piece'),
  ('6204.62.00', 'กางเกงผู้หญิง cotton',                          30.000, 'piece'),
  ('9503.00.99', 'ของเล่นทั่วไป',                                  0.000, 'piece'),
  ('3924.10.00', 'ภาชนะพลาสติก',                                  20.000, 'piece'),
  ('6403.99.00', 'รองเท้า',                                       30.000, 'piece'),
  ('8473.30.20', 'เคสคอม / accessories',                          5.000, 'piece'),
  ('9999.99.99', 'อื่นๆ (general — ใช้ตอนยังไม่จัดประเภท)',         10.000, 'piece')
on conflict (code) do nothing;

comment on table public.hs_codes is
  'Customs HS code dictionary with default duty %. Mirror of legacy hs-customrate.php.';
comment on table public.container_hs_lines is
  'Per-container HS code breakdown — qty/weight/value sliced by code. Mirror of legacy cnt-hs.php.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0031_hs_codes_rls_authenticated.sql                            ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- 0031_hs_codes_rls_authenticated.sql
-- P-20-followup-rls: tighten hs_codes_select_all RLS to authenticated only.
--
-- 0030_hs_codes_rates.sql created the policy with `using (true)` (open to
-- anon).  The intent per file comment was "authenticated users can read
-- this reference data" — fix the policy to match.  Risk is low (HS codes
-- are public reference data — no PII), but the inconsistency between
-- comment + actual policy is a footgun for future maintainers.

drop policy if exists hs_codes_select_all on public.hs_codes;

create policy hs_codes_select_all on public.hs_codes
  for select
  using (auth.role() = 'authenticated');


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0032_csv_imports_started_at.sql                                ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- 0032_csv_imports_started_at.sql
-- P-19-followup-stale: stale 'importing' recovery.
--
-- Without started_at, a process crash mid-confirmCsvImport leaves the
-- row stuck at status='importing' forever — the next admin who clicks
-- "import" hits "import_in_progress" guard and is blocked permanently.
--
-- This migration adds started_at + a recovery view.  The actual sweep
-- can be either:
--   (a) on-read in actions/admin/csv-imports.ts (cheap; runs whenever
--       admin lists/views the imports table — no cron needed)
--   (b) a cron job (via vercel.json — but per P-vercel-plan we're
--       already at 5 crons; prefer on-read)
--
-- Pick (a) — implemented in actions/admin/csv-imports.ts as a sweep
-- that runs at the top of listCsvImports / getCsvImport.
--
-- Threshold: 10 minutes.  Largest legitimate import is MAX_IMPORT_ROWS
-- (5000 rows) at ~10 forwarders inserts/sec = ~8 minutes worst case.
-- 10 minutes gives a safety margin without leaving zombie rows visible
-- for hours.
--
-- Idempotent.

alter table public.csv_imports
  add column if not exists started_at timestamptz;

-- Backfill: existing rows that ever entered 'importing' don't have
-- started_at, but they're either 'imported' or 'failed' by now (ภูม
-- already ran the import flow successfully on dev project).  Anything
-- still 'importing' on production migration-run was a previously stuck
-- zombie — flip those now to 'failed' with a recovery message so they
-- don't immediately re-zombie.
update public.csv_imports
   set status = 'failed',
       error_message = coalesce(error_message, '') ||
                       ' (auto-recovered on 0032 migration: status was importing with no started_at)'
 where status = 'importing'
   and started_at is null;

create index if not exists csv_imports_stale_importing_idx
  on public.csv_imports(status, started_at)
  where status = 'importing';

comment on column public.csv_imports.started_at is
  'Set when status transitions to importing. The application sweeps stuck rows where started_at < now() - 10 minutes back to failed (P-19-followup-stale).';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0033_containers.sql                                            ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- T-P2 · cargo_containers + cargo_shipments + tracking — warehouse spine
-- ════════════════════════════════════════════════════════════
-- Per docs/architecture/container-centric-model.md (design locked
-- 2026-05-16). The container is the system's spine. Customers +
-- shipments hang off it, not the other way around.
--
-- NAMING NOTE (important): this migration uses the `cargo_*` prefix to
-- AVOID colliding with the legacy `public.containers` table created in
-- migration 0016 (which kept its old ops-tracking shape: container_no,
-- vendor_container_id, vessel, carrier, origin_warehouse, status enum
-- preparing/sealed/in_transit/arrived_port/cleared_customs/delivered/
-- cancelled, etc.).  The two coexist:
--
--   public.containers          (0016) — legacy ops tracking;
--                                       /admin/containers + forwarders.container_id
--   public.cargo_containers    (this) — new container-centric spine with
--                                       shipments/tracking/history breakdown
--
-- Long-term consolidation may happen (V3 territory), for now they coexist
-- so this migration doesn't break the existing /admin/containers page.
--
-- This migration introduces:
--   1. admins.role enum extended: + 'warehouse' + 'driver'
--   2. cargo_containers — physical shipping unit (truck/sea/air)
--   3. cargo_shipments — one customer's portion of a cargo_container,
--      linked back to existing forwarders (cargo-import) or service_orders
--      (China-shop) via optional FKs
--   4. cargo_shipment_tracking — per-shipment scan/event timeline
--   5. cargo_container_status_history — high-level state log
--
-- MOMO sync writes to source='momo'. Pacred-self writes source='pacred'.
-- Customer-direct scan (future) writes source='customer_scan' (tracking only).
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Extend admins.role to add 'warehouse' + 'driver' ---------------
--   Existing values: super, ops, accounting, sales_admin
--   We drop the existing CHECK and re-add with the expanded set.
alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins add  constraint admins_role_check
  check (role in ('super','ops','accounting','sales_admin','warehouse','driver'));

-- 2) cargo_containers ----------------------------------------------
create table if not exists public.cargo_containers (
  id              uuid primary key default gen_random_uuid(),
  -- Container code. Self-issued format: <origin>-<YYMMDD>-<seq>
  -- (e.g. "GZE260516-1" = Guangzhou-Eastbound, 2026-05-16, seq 1).
  -- MOMO-issued: whatever JMF returns (mirror the partner contract).
  code            text unique not null,
  transport_mode  text not null check (transport_mode in ('truck','sea','air')),
  origin          text not null,
  destination     text not null,
  status          text not null check (status in (
                    'packing','sealed','in_transit','arrived','unloading','closed'
                  )) default 'packing',
  packed_at       timestamptz,
  sealed_at       timestamptz,
  eta             date,
  actual_arrival  timestamptz,
  source          text not null check (source in ('pacred','momo','self')) default 'momo',
  -- denorm cache, refreshable from MOMO or our own sum
  total_boxes     int           not null default 0,
  total_weight_kg numeric(12,2) not null default 0,
  total_cbm       numeric(10,3) not null default 0,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create index if not exists cargo_containers_status_eta_idx
  on public.cargo_containers(status, eta);
create index if not exists cargo_containers_source_updated_idx
  on public.cargo_containers(source, updated_at desc);

drop trigger if exists cargo_containers_updated_at_trigger on public.cargo_containers;
create trigger cargo_containers_updated_at_trigger
  before update on public.cargo_containers
  for each row execute function public.set_updated_at();

-- 3) cargo_shipments -----------------------------------------------
create table if not exists public.cargo_shipments (
  id                  uuid primary key default gen_random_uuid(),
  shipment_code       text unique not null,
  cargo_container_id  uuid references public.cargo_containers(id) on delete restrict,
  profile_id          uuid not null references public.profiles(id) on delete restrict,
  -- One shipment must trace back to either a cargo-import order
  -- (forwarders.f_no) or a China-shop order (service_orders.h_no).
  -- Combined flows allowed (both can be set).
  forwarder_f_no      text references public.forwarders(f_no),
  service_order_h_no  text references public.service_orders(h_no),
  box_count           int not null default 1,
  weight_kg           numeric(10,2),
  volume_cbm          numeric(10,3),
  status              text not null check (status in (
                        'received_cn',
                        'packed_cn',
                        'sealed_in_container',
                        'in_transit',
                        'arrived_th',
                        'unloaded',
                        'out_for_delivery',
                        'delivered'
                      )) default 'received_cn',
  received_at_cn      timestamptz,
  delivered_at_th     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint cargo_shipments_one_parent_order check (
    forwarder_f_no is not null or service_order_h_no is not null
  )
);

create index if not exists cargo_shipments_container_profile_idx
  on public.cargo_shipments(cargo_container_id, profile_id);
create index if not exists cargo_shipments_profile_status_idx
  on public.cargo_shipments(profile_id, status);
create index if not exists cargo_shipments_forwarder_idx
  on public.cargo_shipments(forwarder_f_no) where forwarder_f_no is not null;
create index if not exists cargo_shipments_service_order_idx
  on public.cargo_shipments(service_order_h_no) where service_order_h_no is not null;

drop trigger if exists cargo_shipments_updated_at_trigger on public.cargo_shipments;
create trigger cargo_shipments_updated_at_trigger
  before update on public.cargo_shipments
  for each row execute function public.set_updated_at();

-- 4) cargo_shipment_tracking ---------------------------------------
-- Per-box or per-shipment scan timeline. MVP scans at shipment level
-- (box_no nullable); box-level when scanner UX is ready.
create table if not exists public.cargo_shipment_tracking (
  id                 uuid primary key default gen_random_uuid(),
  cargo_shipment_id  uuid not null references public.cargo_shipments(id) on delete cascade,
  box_no             text,
  event              text not null,                   -- 'scan_receive','scan_pack','scan_seal','scan_unload', etc.
  location           text,                            -- warehouse code or carrier name
  scanned_at         timestamptz not null default now(),
  -- FK references profiles(id), NOT admins(profile_id), because admins
  -- has composite PK (profile_id, role) — profile_id alone isn't unique.
  -- Admin-role check happens via RLS (cargo_shipment_tracking_admin_all
  -- gates write to ['super','ops','warehouse','driver']) — the FK only
  -- proves the scanner profile exists.
  scanned_by         uuid references public.profiles(id),
  source             text not null check (source in ('pacred','momo','customer_scan')) default 'pacred',
  note               text,
  created_at         timestamptz not null default now()
);

create index if not exists cargo_shipment_tracking_shipment_scanned_idx
  on public.cargo_shipment_tracking(cargo_shipment_id, scanned_at desc);

-- 5) cargo_container_status_history --------------------------------
-- High-level transitions on the cargo container itself, separate from
-- per-shipment scans. One row per state change.
create table if not exists public.cargo_container_status_history (
  id                  uuid primary key default gen_random_uuid(),
  cargo_container_id  uuid not null references public.cargo_containers(id) on delete cascade,
  from_status         text,
  to_status           text not null,
  note                text,
  changed_at          timestamptz not null default now(),
  -- See cargo_shipment_tracking.scanned_by note — FK to profiles(id).
  changed_by_admin    uuid references public.profiles(id),
  source              text not null check (source in ('pacred','momo','self')) default 'pacred'
);

create index if not exists cargo_container_status_history_container_changed_idx
  on public.cargo_container_status_history(cargo_container_id, changed_at desc);

-- 6) RLS -----------------------------------------------------------
alter table public.cargo_containers               enable row level security;
alter table public.cargo_shipments                enable row level security;
alter table public.cargo_shipment_tracking        enable row level security;
alter table public.cargo_container_status_history enable row level security;

-- cargo_containers: customer sees a container only if they own ≥1 shipment in it
drop policy if exists cargo_containers_customer_read on public.cargo_containers;
create policy cargo_containers_customer_read
  on public.cargo_containers for select
  using (
    exists (
      select 1 from public.cargo_shipments s
       where s.cargo_container_id = cargo_containers.id
         and s.profile_id         = auth.uid()
    )
  );

drop policy if exists cargo_containers_admin_all on public.cargo_containers;
create policy cargo_containers_admin_all
  on public.cargo_containers for all
  using      (public.is_admin(array['super','ops','warehouse']))
  with check (public.is_admin(array['super','ops','warehouse']));

-- cargo_shipments: customer sees own; warehouse staff full access
drop policy if exists cargo_shipments_customer_read on public.cargo_shipments;
create policy cargo_shipments_customer_read
  on public.cargo_shipments for select
  using (profile_id = auth.uid());

drop policy if exists cargo_shipments_admin_all on public.cargo_shipments;
create policy cargo_shipments_admin_all
  on public.cargo_shipments for all
  using      (public.is_admin(array['super','ops','warehouse']))
  with check (public.is_admin(array['super','ops','warehouse']));

-- cargo_shipment_tracking: customer reads via parent shipment ownership
drop policy if exists cargo_shipment_tracking_customer_read on public.cargo_shipment_tracking;
create policy cargo_shipment_tracking_customer_read
  on public.cargo_shipment_tracking for select
  using (
    exists (
      select 1 from public.cargo_shipments s
       where s.id         = cargo_shipment_tracking.cargo_shipment_id
         and s.profile_id = auth.uid()
    )
  );

-- cargo_shipment_tracking: warehouse + driver write (drivers scan their own runs)
drop policy if exists cargo_shipment_tracking_admin_all on public.cargo_shipment_tracking;
create policy cargo_shipment_tracking_admin_all
  on public.cargo_shipment_tracking for all
  using      (public.is_admin(array['super','ops','warehouse','driver']))
  with check (public.is_admin(array['super','ops','warehouse','driver']));

-- cargo_container_status_history: admin-only (customer doesn't need state machine internals)
drop policy if exists cargo_container_status_history_admin_all on public.cargo_container_status_history;
create policy cargo_container_status_history_admin_all
  on public.cargo_container_status_history for all
  using      (public.is_admin(array['super','ops','warehouse']))
  with check (public.is_admin(array['super','ops','warehouse']));

-- 7) Comments ------------------------------------------------------
comment on table  public.cargo_containers is
  'Physical shipping unit (truck/sea/air). One container has many shipments and many customers. See docs/architecture/container-centric-model.md. Coexists with legacy public.containers (0016) which keeps the old ops-tracking shape — long-term consolidation deferred.';
comment on column public.cargo_containers.code is
  'Container code. Self-issued format <origin>-<YYMMDD>-<seq> (e.g. GZE260516-1) OR MOMO-issued (whatever JMF returns).';
comment on column public.cargo_containers.source is
  'pacred = Pacred-managed; momo = synced from MOMO JMF partner; self = future customer-direct scan source.';

comment on table  public.cargo_shipments is
  'One customer''s portion of a cargo container. Bridges existing forwarders (cargo-import) and service_orders (China-shop) into the container spine.';
comment on constraint cargo_shipments_one_parent_order on public.cargo_shipments is
  'Each shipment must trace back to at least one parent order (forwarder or service_order). Both can be set for combined flows.';

comment on table  public.cargo_shipment_tracking is
  'Per-shipment scan/event timeline. MVP at shipment level (box_no nullable). Box-level scanning lands when UX is ready.';

comment on table  public.cargo_container_status_history is
  'High-level cargo container state transitions (packing → sealed → in_transit → arrived → unloading → closed). Separate from per-shipment scans.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0034_tax_invoices.sql                                          ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- T-P4 G2a · tax_invoices + serial generator (RD Code 86)
-- ════════════════════════════════════════════════════════════
-- Per ADR-0006 (design contract locked 2026-05-16) + ADR-0005 K-6
-- (numbering format INV-YYYYMM-NNNN with monthly counter reset) +
-- ADR-0005 K-7 (issuance approver = super OR accounting).
--
-- Customer (juristic OR personal-with-tax-ID) requests a tax invoice
-- from the receipt page. Admin issues from /admin/tax-invoices/[id].
-- Once issued, the header is immutable (Thai Revenue Department
-- Code 86 compliance). Cancellation does not delete — flip status to
-- 'cancelled' + watermark PDF. Issue a credit note (ใบลดหนี้) as a
-- NEW row pointing back via credit_note_id.
--
-- This migration introduces:
--   1. tax_invoice_seq         — monthly serial counter (one row/month)
--   2. tax_invoices            — header (immutable buyer + financial snapshot)
--   3. tax_invoice_lines       — line items snapshot
--   4. next_tax_invoice_serial() — atomic serial generator (security definer)
--   5. RLS: customer reads own; super/accounting reads + writes all
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Monthly serial counter ----------------------------------------
create table if not exists public.tax_invoice_seq (
  period_yyyymm text primary key,
  next_seq      int  not null default 1,
  updated_at    timestamptz not null default now()
);

-- 2) Tax invoice header --------------------------------------------
create table if not exists public.tax_invoices (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles(id) on delete restrict,
  -- Source order pointer — exactly one of these must be set.
  order_h_no          text references public.service_orders(h_no),
  forwarder_f_no      text references public.forwarders(f_no),

  -- Buyer snapshot at issuance (RD Code 86 — immutable; do NOT join to profiles)
  buyer_name          text not null,
  buyer_address       text not null,
  buyer_tax_id        text not null,
  buyer_branch        text not null default 'สำนักงานใหญ่',

  -- Issuance state
  status              text not null check (status in ('pending','issued','cancelled')) default 'pending',
  serial_no           text unique,                  -- INV-YYYYMM-NNNN (null while pending)
  issued_at           timestamptz,
  -- FK references profiles(id), NOT admins(profile_id), because admins
  -- has composite PK (profile_id, role) — profile_id alone isn't unique.
  -- Admin-role check happens via RLS (super/accounting per ADR-0005 K-7);
  -- the FK only proves the issuer exists.
  issued_by_admin     uuid references public.profiles(id),

  -- Financial snapshot (frozen at issuance; not refreshed when order updates)
  subtotal_thb        numeric(12,2) not null,
  vat_thb             numeric(12,2) not null,
  total_thb           numeric(12,2) not null,
  vat_mode            text not null check (vat_mode in ('inclusive','exclusive')) default 'inclusive',
  payment_method      text not null,

  -- Storage
  pdf_storage_path    text,                          -- "{profile_id}/{INV-...}.pdf"

  -- Cancellation
  cancelled_at        timestamptz,
  -- See issued_by_admin note — FK to profiles(id), not admins(profile_id).
  cancelled_by_admin  uuid references public.profiles(id),
  cancellation_reason text,
  credit_note_id      uuid references public.tax_invoices(id),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- A tax invoice MUST point to exactly one source order — not both, not neither.
  constraint tax_invoices_one_parent_order check (
    (order_h_no is not null and forwarder_f_no is null) or
    (order_h_no is null     and forwarder_f_no is not null)
  ),
  -- When status='issued', the serial + issued metadata must all be set.
  constraint tax_invoices_issued_has_serial check (
    status <> 'issued' or (
      serial_no       is not null and
      issued_at       is not null and
      issued_by_admin is not null
    )
  )
);

create index if not exists tax_invoices_profile_status_idx
  on public.tax_invoices(profile_id, status);
create index if not exists tax_invoices_serial_idx
  on public.tax_invoices(serial_no) where serial_no is not null;
create index if not exists tax_invoices_issued_at_idx
  on public.tax_invoices(issued_at desc) where status = 'issued';
create index if not exists tax_invoices_order_idx
  on public.tax_invoices(order_h_no) where order_h_no is not null;
create index if not exists tax_invoices_forwarder_idx
  on public.tax_invoices(forwarder_f_no) where forwarder_f_no is not null;

drop trigger if exists tax_invoices_updated_at_trigger on public.tax_invoices;
create trigger tax_invoices_updated_at_trigger
  before update on public.tax_invoices
  for each row execute function public.set_updated_at();

-- 3) Tax invoice line items ----------------------------------------
create table if not exists public.tax_invoice_lines (
  id              uuid primary key default gen_random_uuid(),
  tax_invoice_id  uuid not null references public.tax_invoices(id) on delete cascade,
  position        int  not null,
  description     text not null,
  qty             numeric(12,2) not null,
  unit_price_thb  numeric(12,2) not null,
  amount_thb      numeric(12,2) not null,
  vat_thb         numeric(12,2) not null,
  created_at      timestamptz not null default now()
);

create unique index if not exists tax_invoice_lines_invoice_position_uidx
  on public.tax_invoice_lines(tax_invoice_id, position);

-- 4) Atomic serial generator ---------------------------------------
-- INV-YYYYMM-NNNN with monthly counter reset (Bangkok timezone).
-- Concurrent calls serialise on the upsert lock (Postgres handles
-- the conflict path under SERIALIZABLE or read-committed both).
create or replace function public.next_tax_invoice_serial()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yyyymm text := to_char(now() at time zone 'Asia/Bangkok', 'YYYYMM');
  seq    int;
begin
  insert into public.tax_invoice_seq (period_yyyymm, next_seq)
    values (yyyymm, 2)
    on conflict (period_yyyymm) do update
      set next_seq   = tax_invoice_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'INV-' || yyyymm || '-' || lpad(seq::text, 4, '0');
end;
$$;

-- Lock function access: only service_role (server actions) calls this.
-- App-layer adminMarkTaxInvoiceIssued already gates by withAdmin.
revoke all      on function public.next_tax_invoice_serial() from public, authenticated, anon;
grant  execute  on function public.next_tax_invoice_serial() to service_role;

-- 5) RLS -----------------------------------------------------------
alter table public.tax_invoice_seq   enable row level security;
alter table public.tax_invoices      enable row level security;
alter table public.tax_invoice_lines enable row level security;

-- tax_invoices: customer reads own; super/accounting full access
drop policy if exists tax_invoices_self_read on public.tax_invoices;
create policy tax_invoices_self_read
  on public.tax_invoices for select
  using (profile_id = auth.uid());

drop policy if exists tax_invoices_admin_all on public.tax_invoices;
create policy tax_invoices_admin_all
  on public.tax_invoices for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- tax_invoice_lines: customer reads via parent invoice ownership
drop policy if exists tax_invoice_lines_via_parent_read on public.tax_invoice_lines;
create policy tax_invoice_lines_via_parent_read
  on public.tax_invoice_lines for select
  using (
    exists (
      select 1 from public.tax_invoices ti
       where ti.id          = tax_invoice_lines.tax_invoice_id
         and (ti.profile_id = auth.uid()
              or public.is_admin(array['super','accounting']))
    )
  );

drop policy if exists tax_invoice_lines_admin_write on public.tax_invoice_lines;
create policy tax_invoice_lines_admin_write
  on public.tax_invoice_lines for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- tax_invoice_seq: admin-only (the serial generator function bypasses RLS
-- via security definer, but the table itself stays locked down).
drop policy if exists tax_invoice_seq_admin_all on public.tax_invoice_seq;
create policy tax_invoice_seq_admin_all
  on public.tax_invoice_seq for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- 6) Comments ------------------------------------------------------
comment on table  public.tax_invoices is
  'Tax invoices issued to customers per Thai Revenue Department Code 86. Once status=issued, the header is immutable (no row updates from app layer). See ADR-0006.';
comment on column public.tax_invoices.serial_no is
  'Format INV-YYYYMM-NNNN (Bangkok timezone monthly reset). Set ONLY via next_tax_invoice_serial() at issuance.';
comment on column public.tax_invoices.credit_note_id is
  'When this row is itself a credit note (ใบลดหนี้), points back to the cancelled original tax invoice.';
comment on constraint tax_invoices_one_parent_order on public.tax_invoices is
  'Each tax invoice must point to exactly one parent order (cargo-import OR China-shop), not both, not neither.';
comment on constraint tax_invoices_issued_has_serial on public.tax_invoices is
  'Defensive: when status=issued, the serial_no + issued_at + issued_by_admin must all be populated.';

comment on table  public.tax_invoice_lines is
  'Line items snapshot at issuance. Position-ordered for stable rendering.';

comment on function public.next_tax_invoice_serial is
  'Atomic serial generator for tax invoices. INV-YYYYMM-NNNN with monthly counter reset (Bangkok timezone). Concurrent calls serialise on the upsert lock.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0035_tax_invoices_storage.sql                                  ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- T-P4 G2c · tax-invoices Storage bucket
-- ════════════════════════════════════════════════════════════
-- Per ADR-0006 §5: PDF generated server-side at issuance, uploaded
-- to 'tax-invoices' Storage bucket, customer downloads through
-- /api/tax-invoice/[id] (gated by RLS-style ownership check).
--
-- Bucket is PRIVATE (signed URL or server-streamed). Path layout:
--   tax-invoices/{profile_id}/{INV-YYYYMM-NNNN}.pdf
--
-- Server-side writes happen through admin client (service_role bypasses
-- RLS) so we only define a customer-side READ policy. Optional convenience
-- — server reads also use admin client + bypass these policies.
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Bucket --------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('tax-invoices', 'tax-invoices', false)                    -- private; signed/streamed only
on conflict (id) do nothing;

-- 2) Customer-side read policy ------------------------------------
-- Authenticated user can read PDFs filed under their own user_id
-- folder. This mirrors the slips/avatars pattern. The route handler
-- additionally re-verifies ownership against tax_invoices.profile_id
-- before streaming.
drop policy if exists "tax_invoices_user_read" on storage.objects;
create policy "tax_invoices_user_read"
  on storage.objects for select
  using (
    bucket_id = 'tax-invoices'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 3) Admin (super/accounting) read policy --------------------------
-- Admins can read any tax-invoice PDF for support/audit. Server actions
-- already gate via withAdmin(["super","accounting"]) — this policy is a
-- belt-and-braces for cases where an admin browses Storage directly.
drop policy if exists "tax_invoices_admin_read" on storage.objects;
create policy "tax_invoices_admin_read"
  on storage.objects for select
  using (
    bucket_id = 'tax-invoices'
    and public.is_admin(array['super','accounting'])
  );

-- NOTE: no INSERT/UPDATE/DELETE policies for users — all writes go
-- through service_role (admin client) inside server actions. If a
-- non-admin somehow tries to upload here, RLS will reject (default-deny).


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0036_carriers.sql                                              ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- U2-3 · carriers (last-mile + international shipping providers)
-- ════════════════════════════════════════════════════════════
-- Per Part U U2-3 + chat audit L-8: SPX/J&T/Flash/EMS/Lalamove are
-- hardcoded in PHP today. Staff has asked to add new carriers ~4 times
-- in 6 weeks (DOC SHIPPING + AIR IMPORT chats). This migration adds an
-- admin-managed `carriers` table so adding a new carrier becomes an
-- admin action, not a dev escalation.
--
-- Scope (V1):
--   - Table + indexes + RLS (super/ops can write; everyone reads)
--   - No FK from existing forwarders/cargo_shipments yet (bigger change;
--     deferred to a follow-up). For now `forwarders.partner_warehouse`
--     stays as enum (china-side warehouse — different concept).
--   - Future: add `carrier_id` to cargo_shipments for THAILAND-side
--     last-mile carrier tracking.
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

create table if not exists public.carriers (
  id                    uuid primary key default gen_random_uuid(),
  -- Stable code for programmatic refs ("spx", "jnt", "flash"). Lowercase,
  -- alphanumeric + underscore. Used in URLs / API keys / future shipment
  -- FK lookups.
  code                  text not null unique,
  name_th               text not null,
  name_en               text not null,

  -- Tracking-URL template — `{tracking}` placeholder substituted by app.
  -- E.g. "https://www.spx.co.th/track?no={tracking}"
  tracking_url_template text,

  -- Admin can mark a carrier inactive without deleting (preserves
  -- historical references in audit logs / future shipment FKs).
  is_active             boolean not null default true,

  -- Manual sort order for admin UI + customer-facing dropdowns.
  sort_order            int not null default 100,

  -- Free-form notes (e.g., contact person, contract terms, rate sheet
  -- link). Admin-only.
  note                  text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists carriers_active_sort_idx
  on public.carriers(is_active, sort_order, name_th);

-- Code format guard: lowercase letters/digits/underscore only.
alter table public.carriers
  drop constraint if exists carriers_code_format_chk;
alter table public.carriers
  add constraint carriers_code_format_chk
  check (code ~ '^[a-z0-9_]+$' and char_length(code) between 2 and 32);

-- updated_at trigger (set_updated_at() exists from earlier migrations)
drop trigger if exists carriers_updated_at_trigger on public.carriers;
create trigger carriers_updated_at_trigger
  before update on public.carriers
  for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────
-- Read: anyone authenticated (customer-facing dropdown will need this
-- when shipment-level carrier FK is wired). Write: super or ops.
alter table public.carriers enable row level security;

drop policy if exists carriers_authenticated_read on public.carriers;
create policy carriers_authenticated_read
  on public.carriers for select
  to authenticated
  using (true);

drop policy if exists carriers_admin_write on public.carriers;
create policy carriers_admin_write
  on public.carriers for all
  using      (public.is_admin(array['super','ops']))
  with check (public.is_admin(array['super','ops']));

-- ── Seed: the 5 carriers staff explicitly mentioned in chat ──────────
-- ON CONFLICT (code) DO NOTHING so re-running the migration doesn't
-- overwrite admin edits to name/url/note made after first apply.
insert into public.carriers (code, name_th, name_en, tracking_url_template, sort_order) values
  ('spx',      'Shopee Express',  'Shopee Express',  'https://spx.co.th/track?no={tracking}',                10),
  ('jnt',      'J&T Express',     'J&T Express',     'https://www.jtexpress.co.th/index/query/gzquery.html?bills={tracking}', 20),
  ('flash',    'Flash Express',   'Flash Express',   'https://www.flashexpress.com/fle/tracking?se={tracking}',              30),
  ('ems',      'ไปรษณีย์ไทย EMS', 'Thailand Post EMS','https://track.thailandpost.co.th/?trackNumber={tracking}',           40),
  ('lalamove', 'Lalamove',        'Lalamove',        null,                                                                  50)
on conflict (code) do nothing;

-- Comments
comment on table  public.carriers is
  'Last-mile + international shipping carriers (SPX, J&T, Flash, EMS, Lalamove, etc.). U2-3 — admin can CRUD without dev escalation.';
comment on column public.carriers.tracking_url_template is
  'Template with {tracking} placeholder; app substitutes the tracking number for a clickable customer link.';
comment on column public.carriers.code is
  'Stable lowercase identifier — used in URLs, API keys, future cargo_shipments.carrier_id lookups. Cannot edit after first reference (do soft-delete via is_active=false instead).';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0037_cargo_shipments_received_qty.sql                          ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- U1-5 · cargo_shipments.received_box_count (split-receipt aware)
-- ════════════════════════════════════════════════════════════
-- Per chat audit MOMO group: container splits become qty=1 in legacy
-- because "เป็นข้อจำกัดของแอปรับเข้าไทย" — the receipt scanner only
-- records "received" as a binary, not partial counts.
--
-- Pacred fix: model expected vs received explicitly. Existing
-- `box_count` becomes the expected count (what was packed/declared at
-- origin). New `received_box_count` is what staff actually scanned in
-- at the TH warehouse. UI then computes "received N of M boxes".
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

alter table public.cargo_shipments
  add column if not exists received_box_count int not null default 0;

-- Constraint: received cannot be negative. Allow received > expected
-- (rare but valid: extra boxes arrive that weren't on the manifest).
alter table public.cargo_shipments
  drop constraint if exists cargo_shipments_received_box_count_chk;
alter table public.cargo_shipments
  add constraint cargo_shipments_received_box_count_chk
  check (received_box_count >= 0);

-- Timestamp of the most recent received_box_count change. Useful for
-- "last partial scan" display + freshness metrics.
alter table public.cargo_shipments
  add column if not exists received_at_partial timestamptz;

-- Bookkeeping comments that future readers/devs will see in DB schema
comment on column public.cargo_shipments.box_count is
  'Expected number of boxes (declared at origin / packed by China warehouse). Compare with received_box_count to detect partial receipt — chat MOMO bug fix U1-5.';
comment on column public.cargo_shipments.received_box_count is
  'Actual boxes received at TH warehouse. Defaults 0 until staff scans in. Can exceed box_count if extra/unmanifested boxes arrive.';
comment on column public.cargo_shipments.received_at_partial is
  'Timestamp of the last received_box_count change. Distinct from received_at_cn (whole-shipment first-receive) and delivered_at_th (terminal transition).';

-- Backfill: completed shipments (status='delivered' or terminal-ish)
-- should have received_box_count = box_count for historical accuracy.
-- Defensive UPDATE — only touches rows where received is still 0
-- (so re-running migration never overwrites manual edits).
update public.cargo_shipments
   set received_box_count = box_count
 where received_box_count = 0
   and status in ('arrived_th','unloaded','out_for_delivery','delivered');


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0038_forwarder_cost_adjustments.sql                            ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0039_cargo_shipments_cbm_per_source.sql                        ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0040_cargo_type_and_carrier_container.sql                      ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0041_bill_to_name_override.sql                                 ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0042_cargo_containers_close_at.sql                             ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0043_slip_transferred_at.sql                                   ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0044_withholding_tax.sql                                       ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- V-A6 · withholding_tax_entries + wht-certs Storage bucket
-- ════════════════════════════════════════════════════════════
-- Per ADR-0015 (locked 2026-05-16 night). Pacred customers who are
-- juristic (companies) withhold 1%/1.5%/2%/3%/5% of the service fee
-- per Thai Revenue Department rules, transfer Net = Gross − W, and
-- must hand Pacred a 50 ทวิ certificate. The certificate IS the tax
-- credit — losing it = losing money. Staff explicit ask (chat
-- 11/12/2025 + 30/3/2026): "ถ้าไม่แนบใบหัก ยังไม่ได้รับใบเสร็จ" —
-- receipt issuance must be gated on this row's cert_status.
--
-- A row's EXISTENCE = "WHT applies". No row = personal customer
-- (no withholding) → tax-invoice issues freely as before.
--
-- This migration introduces:
--   1. withholding_tax_entries     — one row per WHT event (parent = order_h_no OR forwarder_f_no, optional tax_invoice_id link)
--   2. RLS                         — customer reads own; super/accounting full access (mirror tax_invoices)
--   3. wht-certs Storage bucket    — private, customer-folder pattern (mirror tax-invoices)
--   4. Comments
--
-- Idempotent. Renamed from spec's 0039 → 0044 per phase I2 prep doc.
-- ════════════════════════════════════════════════════════════

-- 1) withholding_tax_entries -------------------------------------------
create table if not exists public.withholding_tax_entries (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles(id) on delete restrict,

  -- Exactly one parent order (mirror tax_invoices_one_parent_order, migration 0034).
  order_h_no          text references public.service_orders(h_no),
  forwarder_f_no      text references public.forwarders(f_no),

  -- Linked once a tax invoice is issued for the same parent (issuance-time backfill).
  tax_invoice_id      uuid references public.tax_invoices(id),

  -- Financial snapshot (frozen at row creation; receipt always shows gross_invoice_thb)
  gross_invoice_thb   numeric(12,2) not null,    -- full invoice total (the receipt total)
  wht_base_thb        numeric(12,2) not null,    -- the WHT-able service portion (staff-confirmed)
  wht_rate_pct        numeric(4,2)  not null check (wht_rate_pct in (1, 1.5, 2, 3, 5)),
  wht_amount_thb      numeric(12,2) not null,    -- = round(wht_base_thb * wht_rate_pct/100, 2)
  net_expected_thb    numeric(12,2) not null,    -- = gross_invoice_thb − wht_amount_thb

  -- Certificate (หนังสือรับรองหัก ณ ที่จ่าย / 50 ทวิ)
  cert_status         text not null default 'pending'
                        check (cert_status in ('pending', 'received', 'waived')),
  cert_number         text,                       -- customer's 50 ทวิ running no.
  cert_storage_path   text,                       -- "{profile_id}/{parent_key}/cert-...pdf" in bucket 'wht-certs'
  cert_received_at    timestamptz,
  waived_reason       text,                       -- required when cert_status='waived'
  waived_by_admin     uuid references public.profiles(id),
  waived_at           timestamptz,

  -- Audit trail
  recorded_by_admin   uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Exactly one parent order (XOR — same pattern as tax_invoices).
  constraint wht_one_parent_order check (
    (order_h_no is not null and forwarder_f_no is null) or
    (order_h_no is null     and forwarder_f_no is not null)
  ),
  -- waived requires a reason + approver.
  constraint wht_waived_has_reason check (
    cert_status <> 'waived' or (waived_reason is not null and waived_by_admin is not null)
  ),
  -- received requires the certificate metadata.
  constraint wht_received_has_path check (
    cert_status <> 'received' or (cert_storage_path is not null and cert_received_at is not null)
  )
);

-- Lookup indexes -------------------------------------------------------
create index if not exists wht_profile_status_idx
  on public.withholding_tax_entries(profile_id, cert_status);
create index if not exists wht_order_idx
  on public.withholding_tax_entries(order_h_no)     where order_h_no    is not null;
create index if not exists wht_forwarder_idx
  on public.withholding_tax_entries(forwarder_f_no) where forwarder_f_no is not null;
create index if not exists wht_tax_invoice_idx
  on public.withholding_tax_entries(tax_invoice_id) where tax_invoice_id is not null;
create index if not exists wht_pending_cert_idx
  on public.withholding_tax_entries(profile_id) where cert_status = 'pending';

-- One WHT entry per parent order (no double-counting if accidentally re-created).
-- Two partial-unique indexes (parent column is XOR via the CHECK above).
create unique index if not exists wht_one_per_order_uidx
  on public.withholding_tax_entries(order_h_no)
  where order_h_no is not null;
create unique index if not exists wht_one_per_forwarder_uidx
  on public.withholding_tax_entries(forwarder_f_no)
  where forwarder_f_no is not null;

-- updated_at auto-touch.
drop trigger if exists wht_entries_updated_at_trigger on public.withholding_tax_entries;
create trigger wht_entries_updated_at_trigger
  before update on public.withholding_tax_entries
  for each row execute function public.set_updated_at();

-- 2) RLS ---------------------------------------------------------------
alter table public.withholding_tax_entries enable row level security;

-- Customer reads OWN row (so the customer-side receipt page can render the
-- WHT line + the net_expected_thb amount in the bank-transfer instructions).
drop policy if exists wht_self_read on public.withholding_tax_entries;
create policy wht_self_read
  on public.withholding_tax_entries for select
  using (profile_id = auth.uid());

-- Super + accounting full access. Mirror tax_invoices (ADR-0005 K-7).
-- ops can read (to see if a WHT row blocks an order they're handling) but cannot
-- mutate — keep the financial table tight.
drop policy if exists wht_admin_read on public.withholding_tax_entries;
create policy wht_admin_read
  on public.withholding_tax_entries for select
  using (public.is_admin(array['super','accounting','ops']));

drop policy if exists wht_admin_write on public.withholding_tax_entries;
create policy wht_admin_write
  on public.withholding_tax_entries for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- 3) Storage bucket 'wht-certs' ----------------------------------------
-- Per ADR-0015 Q4 — DEDICATED bucket (not reusing 'slips'). Different
-- retention class (tax doc) + different access pattern (admin-only V1,
-- customer self-upload deferred to V1.1).
insert into storage.buckets (id, name, public)
values ('wht-certs', 'wht-certs', false)
on conflict (id) do nothing;

-- Customer-side read: authenticated user can read certs filed under their
-- own {profile_id}/ folder (V1.1 customer download).
drop policy if exists "wht_certs_user_read" on storage.objects;
create policy "wht_certs_user_read"
  on storage.objects for select
  using (
    bucket_id = 'wht-certs'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admin read: super + accounting can read any cert (audit, support).
drop policy if exists "wht_certs_admin_read" on storage.objects;
create policy "wht_certs_admin_read"
  on storage.objects for select
  using (
    bucket_id = 'wht-certs'
    and public.is_admin(array['super','accounting'])
  );

-- No INSERT/UPDATE/DELETE policies — all writes go through service_role
-- inside server actions (actions/admin/wht.ts). Default-deny otherwise.

-- 4) Comments ----------------------------------------------------------
comment on table  public.withholding_tax_entries is
  'Withholding-tax (ภาษีหัก ณ ที่จ่าย) per order. Row existence = "WHT applies". No row = personal customer / no withholding. See ADR-0015.';
comment on column public.withholding_tax_entries.gross_invoice_thb is
  'The full invoice total (what the receipt prints). NEVER mutated — WHT does not change the receipt gross.';
comment on column public.withholding_tax_entries.wht_base_thb is
  'The WHT-able service portion (staff-confirmed at row creation). Reimbursed pass-through costs (ค่าสินค้า) are typically NOT WHT-able.';
comment on column public.withholding_tax_entries.wht_rate_pct is
  'Allowed set {1, 1.5, 2, 3, 5}. UI default: 1 = freight/transport, 3 = pure service.';
comment on column public.withholding_tax_entries.net_expected_thb is
  '= gross_invoice_thb − wht_amount_thb. The customer transfers THIS amount (Net), not gross. V-A3 reconciliation reads this column.';
comment on column public.withholding_tax_entries.cert_status is
  'pending → received (cert uploaded) → tax invoice can issue. pending → waived (super/accounting only + waived_reason) → tax invoice can issue.';
comment on column public.withholding_tax_entries.cert_storage_path is
  'Path in Storage bucket "wht-certs". Set when cert_status flips to received.';
comment on constraint wht_one_parent_order on public.withholding_tax_entries is
  'Each WHT row points to exactly one parent order (cargo OR forwarder), not both, not neither. Mirrors tax_invoices_one_parent_order.';
comment on constraint wht_waived_has_reason on public.withholding_tax_entries is
  'A waived cert MUST carry waived_reason + waived_by_admin (audit-trail completeness — ADR-0014 pattern).';
comment on constraint wht_received_has_path on public.withholding_tax_entries is
  'A received cert MUST carry storage path + received timestamp (cant flip to received without actually attaching the file).';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0045_freight_qa_inspections.sql                                ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- V-E10 · freight_qa_inspections + qa-inspection-photos bucket
-- ════════════════════════════════════════════════════════════
-- Per port-spec [docs/port-specs/freight-qa-qc-inspection.md].
--
-- Warehouse intake inspection — runs when shipment arrives at TH warehouse,
-- BEFORE billing is allowed. Outcome enum {pass, fail_minor, fail_major,
-- waived}; failed cases trigger customer notification, waived requires
-- super-only override + reason. V-E7 billing gate (when shipped) will
-- refuse to issue freight_invoices for shipments without a pass/waive/
-- fail_minor inspection.
--
-- V1 cargo-only (freight_shipments doesn't exist yet — V-E1 ships it later).
-- The `freight_shipment_id` column is reserved as nullable; a follow-up
-- migration after V-E1 will add the FK + relax constraints to allow either
-- side. For now: `cargo_shipment_id` is the only valid parent.
--
-- This migration introduces:
--   1. freight_qa_inspections    — one row per inspection event
--   2. qa_inspection_seq         — daily serial counter (QA-YYMMDD-NNNN)
--   3. next_qa_inspection_no()   — atomic serial generator
--   4. RLS                       — customer reads own, warehouse+super+accounting full write
--   5. qa-inspection-photos bucket — private; photo evidence
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Daily serial counter ----------------------------------------------
create table if not exists public.qa_inspection_seq (
  period_yymmdd text primary key,
  next_seq      int  not null default 1,
  updated_at    timestamptz not null default now()
);

-- 2) freight_qa_inspections --------------------------------------------
create table if not exists public.freight_qa_inspections (
  id                       uuid primary key default gen_random_uuid(),

  -- One of these is set (XOR). freight_shipment_id is reserved for V-E1.
  freight_shipment_id      uuid,   -- FK will be added in a follow-up after V-E1 lands.
  cargo_shipment_id        uuid references public.cargo_shipments(id) on delete restrict,

  inspection_no            text unique,   -- QA-YYMMDD-NNNN (auto via trigger / fn)

  inspected_by_admin_id    uuid not null references public.profiles(id),
  inspected_at             timestamptz not null default now(),

  outcome                  text not null check (outcome in (
                             'pass',
                             'fail_minor',
                             'fail_major',
                             'waived'
                           )),
  damage_level             text check (damage_level in (
                             'none',
                             'cosmetic',
                             'partial',
                             'total'
                           )),
  missing_items            int  not null default 0,
  notes                    text,
  photo_paths              text[] not null default '{}',

  -- waived flow (super-only — gate at app layer; DB just enforces shape)
  waived_reason            text,
  waived_by_admin_id       uuid references public.profiles(id),
  waived_at                timestamptz,

  customer_notified_at     timestamptz,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- Exactly one parent. (XOR — same pattern as tax_invoices_one_parent_order.)
  -- V1: only cargo_shipment_id is valid (freight side is reserved nullable).
  constraint qa_one_parent_shipment check (
    (cargo_shipment_id is not null and freight_shipment_id is null) or
    (cargo_shipment_id is null     and freight_shipment_id is not null)
  ),
  -- waived requires reason ≥5 chars + an approver.
  constraint qa_waived_consistency check (
    outcome <> 'waived' or (
      waived_reason is not null
      and char_length(waived_reason) >= 5
      and waived_by_admin_id is not null
      and waived_at is not null
    )
  ),
  -- fail_minor / fail_major must declare a damage level.
  constraint qa_damage_consistency check (
    outcome not in ('fail_minor','fail_major') or damage_level is not null
  )
);

-- Lookup indexes -------------------------------------------------------
create index if not exists qa_inspections_cargo_shipment_idx
  on public.freight_qa_inspections(cargo_shipment_id)
  where cargo_shipment_id is not null;
create index if not exists qa_inspections_freight_shipment_idx
  on public.freight_qa_inspections(freight_shipment_id)
  where freight_shipment_id is not null;
create index if not exists qa_inspections_outcome_idx
  on public.freight_qa_inspections(outcome);
create index if not exists qa_inspections_inspected_at_idx
  on public.freight_qa_inspections(inspected_at desc);

-- updated_at auto-touch.
drop trigger if exists qa_inspections_updated_at_trigger on public.freight_qa_inspections;
create trigger qa_inspections_updated_at_trigger
  before update on public.freight_qa_inspections
  for each row execute function public.set_updated_at();

-- 3) Atomic serial generator -------------------------------------------
-- QA-YYMMDD-NNNN with daily counter reset (Bangkok timezone).
create or replace function public.next_qa_inspection_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yymmdd text := to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD');
  seq    int;
begin
  insert into public.qa_inspection_seq (period_yymmdd, next_seq)
    values (yymmdd, 2)
    on conflict (period_yymmdd) do update
      set next_seq   = qa_inspection_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'QA-' || yymmdd || '-' || lpad(seq::text, 4, '0');
end;
$$;

revoke all     on function public.next_qa_inspection_no() from public, authenticated, anon;
grant  execute on function public.next_qa_inspection_no() to service_role;

-- 4) RLS ---------------------------------------------------------------
alter table public.freight_qa_inspections enable row level security;
alter table public.qa_inspection_seq      enable row level security;

-- Customer reads own inspection (visible the moment admin records it —
-- there's no draft state, an existing row is always meaningful).
drop policy if exists qa_inspections_customer_read on public.freight_qa_inspections;
create policy qa_inspections_customer_read
  on public.freight_qa_inspections for select
  using (
    exists (
      select 1 from public.cargo_shipments cs
       where cs.id = freight_qa_inspections.cargo_shipment_id
         and cs.profile_id = auth.uid()
    )
  );

-- Warehouse + super + accounting: full access (admin gates waive at app layer).
drop policy if exists qa_inspections_admin_all on public.freight_qa_inspections;
create policy qa_inspections_admin_all
  on public.freight_qa_inspections for all
  using      (public.is_admin(array['super','accounting','warehouse']))
  with check (public.is_admin(array['super','accounting','warehouse']));

-- Seq table: admin-only (generator fn bypasses via security definer).
drop policy if exists qa_inspection_seq_admin_all on public.qa_inspection_seq;
create policy qa_inspection_seq_admin_all
  on public.qa_inspection_seq for all
  using      (public.is_admin(array['super','accounting','warehouse']))
  with check (public.is_admin(array['super','accounting','warehouse']));

-- 5) Storage bucket 'qa-inspection-photos' -----------------------------
insert into storage.buckets (id, name, public)
values ('qa-inspection-photos', 'qa-inspection-photos', false)
on conflict (id) do nothing;

-- Customer reads photos under their owned shipment folder.
-- Path layout: {cargo_shipment_id}/{inspection_id}/photo-{N}.{ext}.
-- We check the first folder segment maps to a cargo_shipment owned by user.
drop policy if exists "qa_photos_customer_read" on storage.objects;
create policy "qa_photos_customer_read"
  on storage.objects for select
  using (
    bucket_id = 'qa-inspection-photos'
    and exists (
      select 1 from public.cargo_shipments cs
       where cs.id::text = (storage.foldername(name))[1]
         and cs.profile_id = auth.uid()
    )
  );

-- Admin (warehouse / super / accounting) reads any photo.
drop policy if exists "qa_photos_admin_read" on storage.objects;
create policy "qa_photos_admin_read"
  on storage.objects for select
  using (
    bucket_id = 'qa-inspection-photos'
    and public.is_admin(array['super','accounting','warehouse'])
  );

-- No INSERT/UPDATE/DELETE policies — all writes go through service_role
-- inside server actions (actions/admin/qa-inspections.ts).

-- 6) Comments ----------------------------------------------------------
comment on table  public.freight_qa_inspections is
  'Warehouse intake QA/QC inspection per arrived shipment. Pre-billing gate for V-E7 freight invoices. V1 cargo-only; freight side reserved nullable for V-E1.';
comment on column public.freight_qa_inspections.outcome is
  'pass | fail_minor (deliverable, customer accepts as-is) | fail_major (rework/claim) | waived (super-only override + reason).';
comment on column public.freight_qa_inspections.damage_level is
  'none | cosmetic | partial | total. Required when outcome in {fail_minor, fail_major}.';
comment on column public.freight_qa_inspections.photo_paths is
  'Array of Storage paths in bucket qa-inspection-photos. Each path = {cargo_shipment_id}/{inspection_id}/photo-N.{ext}.';
comment on constraint qa_one_parent_shipment on public.freight_qa_inspections is
  'V1: only cargo_shipment_id is non-null. After V-E1 ships, a follow-up migration adds the freight_shipments FK + relaxes this constraint to allow either side.';
comment on constraint qa_waived_consistency on public.freight_qa_inspections is
  'waived outcome requires reason ≥5 chars + approver + timestamp (ADR-0014 audit pattern).';
comment on function public.next_qa_inspection_no is
  'Atomic serial generator. QA-YYMMDD-NNNN with daily reset (Bangkok TZ). Concurrent calls serialise on upsert lock.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0046_org_contacts.sql                                          ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- V-G5 · org_contacts (owner-self-serve org contact management)
-- ════════════════════════════════════════════════════════════
-- Per port-spec `admin-polish-bundle.md` §V-G5.
--
-- Pacred currently has contact constants hardcoded in
-- `components/seo/site.ts` (CONTACT.email*, SOCIAL.*, ADDRESSES.*, LINE_OA.*,
-- BANK.*). Owner can't self-serve update — every change requires a code
-- deploy. V-G5 adds a DB-backed `org_contacts` table that the owner can
-- manage via `/admin/settings/contacts`.
--
-- V1 = backend management surface only. Customer-side reads (footer,
-- contact-us page) keep using site.ts; integration deferred to V-G5.1
-- (when owner actually populates the table + tests on staging).
--
-- This migration introduces:
--   1. org_contacts table — single row per contact value, kind discriminator
--   2. RLS — admin write, public read (active rows)
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) org_contacts ------------------------------------------------------
create table if not exists public.org_contacts (
  id                   uuid primary key default gen_random_uuid(),
  kind                 text not null check (kind in (
                         'domain',     -- pacred.co · pcscargo.com (legacy)
                         'email',      -- sales@pacred.co etc.
                         'line_oa',    -- LINE OA basic/premium IDs + add-friend URLs
                         'phone',      -- 02-421-3325 · 066-125-3007
                         'wechat',     -- WeChat IDs
                         'social',     -- Facebook · Instagram · TikTok · YouTube
                         'address'     -- HQ · warehouse
                       )),
  label                text not null,            -- "ฝ่ายขาย", "Cargo line", "Bangkok HQ"
  value                text not null,            -- the actual value (email / URL / phone / etc.)
  department           text,                     -- optional grouping for emails (ขาย / บัญชี / HR)
  is_active            boolean not null default true,
  display_order        smallint not null default 0,
  notes                text,                     -- internal-only — not customer-facing

  created_by_admin_id  uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Indexes ---------------------------------------------------------------
create index if not exists org_contacts_kind_active_idx
  on public.org_contacts(kind, is_active);
create index if not exists org_contacts_display_order_idx
  on public.org_contacts(kind, display_order);

-- updated_at auto-touch.
drop trigger if exists org_contacts_updated_at_trigger on public.org_contacts;
create trigger org_contacts_updated_at_trigger
  before update on public.org_contacts
  for each row execute function public.set_updated_at();

-- 2) RLS ---------------------------------------------------------------
alter table public.org_contacts enable row level security;

-- Public can read ACTIVE rows (no auth required — for landing footer +
-- contact-us page). Inactive rows hidden from public.
drop policy if exists org_contacts_public_read on public.org_contacts;
create policy org_contacts_public_read
  on public.org_contacts for select
  using (is_active = true);

-- Admin (super + accounting + sales_admin) full access — super for
-- ownership, accounting for invoice/receipt contact info, sales_admin
-- for sales-rep phone/LINE updates.
drop policy if exists org_contacts_admin_all on public.org_contacts;
create policy org_contacts_admin_all
  on public.org_contacts for all
  using      (public.is_admin(array['super','accounting','sales_admin']))
  with check (public.is_admin(array['super','accounting','sales_admin']));

-- 3) Comments ----------------------------------------------------------
comment on table  public.org_contacts is
  'V-G5 — owner-self-serve org contact info. Replaces hardcoded constants in components/seo/site.ts. V1 = backend management only; customer-side read integration deferred to V-G5.1.';
comment on column public.org_contacts.kind is
  'Contact type discriminator. domain | email | line_oa | phone | wechat | social | address.';
comment on column public.org_contacts.value is
  'The actual value (email address, URL, phone number, address line, etc.).';
comment on column public.org_contacts.department is
  'Optional grouping for emails (ขาย / บัญชี / HR) or phones (CS / sales / company main).';
comment on column public.org_contacts.is_active is
  'Inactive rows hidden from public read but kept for history. Toggle via admin UI without deleting.';
comment on column public.org_contacts.display_order is
  'Per-kind ordering (lower = first). Admin UI uses drag-to-reorder.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0047_tos_versions.sql                                          ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- V-G4 · tos_versions + tos_acceptances (TOS version management)
-- ════════════════════════════════════════════════════════════
-- Per port-spec `admin-polish-bundle.md` §V-G4.
--
-- Today: TOS body is hardcoded in `lib/tos.ts::CURRENT_TOS_VERSION` +
-- some template fixture. Owner can't change the T&C wording or version
-- number without a code deploy.
--
-- V-G4 adds DB-backed version tracking. V1 = backend management surface
-- ONLY — admin can create versions + view acceptance counts. The
-- customer-side gate (`actions/tos.ts::acceptCurrentTos` + the layout
-- modal) keeps reading `CURRENT_TOS_VERSION` from code. V-G4.1
-- migrates the gate to read DB once the owner verifies the table
-- workflow on staging.
--
-- This migration introduces:
--   1. tos_versions table — versioned TOS bodies (admin-write-only)
--   2. tos_acceptances table — per-profile acceptance log (already
--      partially tracked via profiles.tos_accepted_version; this adds
--      per-version detail for audit + future "force re-accept" flow)
--   3. RLS — admin manage versions; public read active versions;
--      customer reads own acceptances
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) tos_versions ------------------------------------------------------
create table if not exists public.tos_versions (
  id                   uuid primary key default gen_random_uuid(),
  version_no           text unique not null,        -- "v2.0", "2026-05-16"
  title                text not null,
  body_md              text not null,                -- markdown source
  effective_from       date not null,
  is_active            boolean not null default false,
  -- Cargo-only or both (some customers use cargo without freight = different scope of TOS)
  applies_to           text not null default 'all'
                         check (applies_to in ('all','cargo_only','freight_only')),

  created_by_admin_id  uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists tos_versions_active_idx
  on public.tos_versions(is_active, effective_from desc) where is_active = true;

drop trigger if exists tos_versions_updated_at_trigger on public.tos_versions;
create trigger tos_versions_updated_at_trigger
  before update on public.tos_versions
  for each row execute function public.set_updated_at();

-- 2) tos_acceptances ---------------------------------------------------
-- One row per (profile, version) — captures the explicit accept click.
-- profiles.tos_accepted_version (existing) denormalises the LATEST
-- acceptance for fast-gate queries; this table is the audit trail.
create table if not exists public.tos_acceptances (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  tos_version_id  uuid not null references public.tos_versions(id) on delete restrict,
  accepted_at     timestamptz not null default now(),
  ip_address      inet,
  user_agent      text
);

create unique index if not exists tos_acceptances_profile_version_uidx
  on public.tos_acceptances(profile_id, tos_version_id);
create index if not exists tos_acceptances_version_idx
  on public.tos_acceptances(tos_version_id);
create index if not exists tos_acceptances_profile_idx
  on public.tos_acceptances(profile_id);

-- 3) RLS ---------------------------------------------------------------
alter table public.tos_versions    enable row level security;
alter table public.tos_acceptances enable row level security;

-- tos_versions: public reads ACTIVE versions only (for V-G4.1 customer
-- gate that will replace CURRENT_TOS_VERSION). Admin (super only) full.
drop policy if exists tos_versions_public_read on public.tos_versions;
create policy tos_versions_public_read
  on public.tos_versions for select
  using (is_active = true);

drop policy if exists tos_versions_admin_all on public.tos_versions;
create policy tos_versions_admin_all
  on public.tos_versions for all
  using      (public.is_admin(array['super']))
  with check (public.is_admin(array['super']));

-- tos_acceptances: customer reads own; admin (super + accounting) reads all.
drop policy if exists tos_acceptances_self_read on public.tos_acceptances;
create policy tos_acceptances_self_read
  on public.tos_acceptances for select
  using (profile_id = auth.uid());

drop policy if exists tos_acceptances_admin_read on public.tos_acceptances;
create policy tos_acceptances_admin_read
  on public.tos_acceptances for select
  using (public.is_admin(array['super','accounting']));

-- Customer can INSERT own acceptance (V-G4.1 customer-side gate);
-- admin INSERT also allowed (admin-initiated bulk-reset workflow).
drop policy if exists tos_acceptances_self_insert on public.tos_acceptances;
create policy tos_acceptances_self_insert
  on public.tos_acceptances for insert
  with check (profile_id = auth.uid());

drop policy if exists tos_acceptances_admin_insert on public.tos_acceptances;
create policy tos_acceptances_admin_insert
  on public.tos_acceptances for insert
  with check (public.is_admin(array['super','accounting']));

-- No UPDATE/DELETE — acceptances are append-only.

-- 4) Comments ----------------------------------------------------------
comment on table  public.tos_versions is
  'V-G4 — versioned TOS bodies. V1 = backend management only; customer-side gate still reads CURRENT_TOS_VERSION from lib/tos.ts until V-G4.1 wires the read.';
comment on column public.tos_versions.version_no is
  'Unique version label (e.g. "v2.0", "2026-05-16"). Customer-facing.';
comment on column public.tos_versions.is_active is
  'Only one version should be active per applies_to scope at a time (app-layer enforced). Inactive versions kept for audit + acceptance history.';
comment on column public.tos_versions.applies_to is
  'all | cargo_only | freight_only — V1 expected to use "all" for everyone; cargo/freight split is for future T&C divergence.';

comment on table  public.tos_acceptances is
  'V-G4 — per-acceptance log (audit + per-version count). profiles.tos_accepted_version is the denormalised "latest" for fast gate queries.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0048_freight_quotes.sql                                        ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- V-E6 · freight_quotes + freight_quote_items (quotation workflow)
-- ════════════════════════════════════════════════════════════
-- Per port-spec [docs/port-specs/freight-quotation.md].
--
-- Adds Pacred's first formal freight-quotation flow:
--   draft → pending_approval → approved → sent → accepted/rejected/expired
--
-- V1 RBAC (per ภูม brief 2026-05-17 + ลูกพี่/เดฟ ack):
--   - create / edit (draft only): super, ops, sales_admin, accounting
--   - submit for approval        : super, ops, sales_admin, accounting
--   - approve / reject           : SUPER ONLY (no separate `manager` role)
--   - send / mark_accepted / expire / convert : super, sales_admin, accounting
--
-- `convert_to_shipment` requires `freight_shipments` table — that ships
-- in V-E1 (migration 0049). V1 of V-E6 leaves `converted_to_shipment_id`
-- nullable; the convert action lives in code but returns error until
-- 0049 lands.
--
-- This migration introduces:
--   1. freight_quote_seq          — daily serial counter
--   2. freight_quotes             — quote header
--   3. freight_quote_items        — quote line items
--   4. next_freight_quote_no()    — atomic serial generator
--   5. RLS                        — customer reads own (sent+), admin full
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Daily serial counter ---------------------------------------------
create table if not exists public.freight_quote_seq (
  period_yymmdd text primary key,
  next_seq      int  not null default 1,
  updated_at    timestamptz not null default now()
);

-- 2) freight_quotes ----------------------------------------------------
create table if not exists public.freight_quotes (
  id                       uuid primary key default gen_random_uuid(),
  quote_no                 text unique,                                -- FQYYMMDD-NNNN

  status                   text not null default 'draft'
                             check (status in (
                               'draft', 'pending_approval', 'approved',
                               'sent', 'accepted', 'rejected', 'expired'
                             )),

  -- Customer pointer (NULL = cold quote to unregistered prospect)
  profile_id               uuid references public.profiles(id) on delete restrict,
  buyer_name_snapshot      text not null,
  buyer_tax_id_snapshot    text,                                      -- 13-digit, optional
  buyer_contact_snapshot   text,                                      -- multi-line name + tel + email

  -- Logistics terms
  transport_mode           text not null check (transport_mode in (
                             'sea_fcl', 'sea_lcl', 'truck', 'air'
                           )),
  port_loading             text,
  port_discharge           text,
  place_delivery           text,
  incoterm                 text check (incoterm in (
                             'EXW', 'FCA', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP',
                             'FAS', 'FOB', 'CFR', 'CIF'
                           )),
  currency                 text not null default 'THB' check (currency in ('THB','USD')),

  -- Financial snapshot — frozen on approval (header total = Σ items)
  subtotal                 numeric(12,2) not null default 0,
  vat_pct                  numeric(4,2)  not null default 7.00 check (vat_pct >= 0 and vat_pct <= 30),
  vat_amount               numeric(12,2) not null default 0,
  total                    numeric(12,2) not null default 0,

  valid_until              date,
  notes                    text,

  -- Audit fields
  created_by_admin_id      uuid not null references public.profiles(id),
  approved_by_admin_id     uuid references public.profiles(id),
  approved_at              timestamptz,
  rejected_reason          text,
  rejected_by_admin_id     uuid references public.profiles(id),
  rejected_at              timestamptz,
  sent_at                  timestamptz,
  accepted_at              timestamptz,
  expired_at               timestamptz,

  -- V-E1 conversion (nullable until V-E1 freight_shipments table exists).
  -- UNIQUE prevents double-conversion. FK added in V-E1 follow-up migration.
  converted_to_shipment_id uuid,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint freight_quotes_rejected_has_reason check (
    status <> 'rejected' or (rejected_reason is not null and char_length(rejected_reason) >= 3)
  ),
  constraint freight_quotes_approved_consistent check (
    status not in ('approved','sent','accepted')
    or (approved_by_admin_id is not null and approved_at is not null)
  )
);

-- Indexes -------------------------------------------------------------
create index if not exists freight_quotes_status_created_idx
  on public.freight_quotes(status, created_at desc);
create index if not exists freight_quotes_profile_status_idx
  on public.freight_quotes(profile_id, status) where profile_id is not null;
create unique index if not exists freight_quotes_converted_uidx
  on public.freight_quotes(converted_to_shipment_id) where converted_to_shipment_id is not null;
create index if not exists freight_quotes_quote_no_idx
  on public.freight_quotes(quote_no) where quote_no is not null;

-- updated_at auto-touch.
drop trigger if exists freight_quotes_updated_at_trigger on public.freight_quotes;
create trigger freight_quotes_updated_at_trigger
  before update on public.freight_quotes
  for each row execute function public.set_updated_at();

-- 3) freight_quote_items ----------------------------------------------
create table if not exists public.freight_quote_items (
  id               uuid primary key default gen_random_uuid(),
  freight_quote_id uuid not null references public.freight_quotes(id) on delete cascade,
  position         smallint not null default 1,
  description      text not null,
  quantity         numeric(12,3) not null check (quantity > 0),
  unit             text not null default 'JOB' check (unit in (
                     'CBM', 'KGM', 'JOB', 'PCS', 'LO', 'CTN', 'PAL', 'TEU', 'FEU'
                   )),
  unit_price_thb   numeric(12,2) not null check (unit_price_thb >= 0 and unit_price_thb <= 999999.99),
  line_total_thb   numeric(12,2) not null,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists freight_quote_items_quote_pos_uidx
  on public.freight_quote_items(freight_quote_id, position);

drop trigger if exists freight_quote_items_updated_at_trigger on public.freight_quote_items;
create trigger freight_quote_items_updated_at_trigger
  before update on public.freight_quote_items
  for each row execute function public.set_updated_at();

-- 4) Atomic serial generator -------------------------------------------
-- FQYYMMDD-NNNN with daily reset (Bangkok TZ). Mirror next_qa_inspection_no.
create or replace function public.next_freight_quote_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yymmdd text := to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD');
  seq    int;
begin
  insert into public.freight_quote_seq (period_yymmdd, next_seq)
    values (yymmdd, 2)
    on conflict (period_yymmdd) do update
      set next_seq   = freight_quote_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'FQ' || yymmdd || '-' || lpad(seq::text, 4, '0');
end;
$$;

revoke all     on function public.next_freight_quote_no() from public, authenticated, anon;
grant  execute on function public.next_freight_quote_no() to service_role;

-- 5) RLS ---------------------------------------------------------------
alter table public.freight_quotes      enable row level security;
alter table public.freight_quote_items enable row level security;
alter table public.freight_quote_seq   enable row level security;

-- Customer reads own (only when status >= sent — drafts/pending hidden).
drop policy if exists freight_quotes_customer_read on public.freight_quotes;
create policy freight_quotes_customer_read
  on public.freight_quotes for select
  using (
    profile_id = auth.uid()
    and status in ('sent', 'accepted', 'rejected', 'expired')
  );

-- Admin (super + ops + sales_admin + accounting): full read.
drop policy if exists freight_quotes_admin_read on public.freight_quotes;
create policy freight_quotes_admin_read
  on public.freight_quotes for select
  using (public.is_admin(array['super','ops','sales_admin','accounting']));

-- Admin (same set): write — app-layer enforces per-status role split.
drop policy if exists freight_quotes_admin_write on public.freight_quotes;
create policy freight_quotes_admin_write
  on public.freight_quotes for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- Items: inherit visibility from parent quote.
drop policy if exists freight_quote_items_customer_read on public.freight_quote_items;
create policy freight_quote_items_customer_read
  on public.freight_quote_items for select
  using (
    exists (
      select 1 from public.freight_quotes q
       where q.id = freight_quote_items.freight_quote_id
         and q.profile_id = auth.uid()
         and q.status in ('sent', 'accepted', 'rejected', 'expired')
    )
  );

drop policy if exists freight_quote_items_admin_all on public.freight_quote_items;
create policy freight_quote_items_admin_all
  on public.freight_quote_items for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- Seq table admin-only (generator fn bypasses via security definer).
drop policy if exists freight_quote_seq_admin_all on public.freight_quote_seq;
create policy freight_quote_seq_admin_all
  on public.freight_quote_seq for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- 6) Comments ----------------------------------------------------------
comment on table  public.freight_quotes is
  'V-E6 — freight quotation workflow. Status: draft → pending_approval → approved → sent → accepted/rejected/expired. Convert-to-shipment is V-E1 dependency.';
comment on column public.freight_quotes.quote_no is
  'Format FQYYMMDD-NNNN. Reserved at insert time via next_freight_quote_no().';
comment on column public.freight_quotes.status is
  'draft (editable by creator) | pending_approval (locked, awaits super) | approved (locked, financial frozen) | sent (visible to customer) | accepted / rejected / expired (terminal).';
comment on column public.freight_quotes.converted_to_shipment_id is
  'V-E1 dependency — points to freight_shipments(id) after convert action runs. UNIQUE prevents double-conversion.';
comment on constraint freight_quotes_rejected_has_reason on public.freight_quotes is
  'rejected status MUST carry a reason ≥3 chars (audit completeness — ADR-0014 pattern).';
comment on constraint freight_quotes_approved_consistent on public.freight_quotes is
  'approved/sent/accepted status MUST have approver + timestamp populated.';

comment on table  public.freight_quote_items is
  'Per-line quote items. Editable only when parent status=draft.';

comment on function public.next_freight_quote_no is
  'Atomic FQYYMMDD-NNNN serial generator with daily counter reset (Bangkok TZ). Concurrent calls serialise on upsert lock.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0049_wallet_order_payment_unique.sql                           ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- F-11 / G9 · wallet_transactions partial-unique guard for order_payment
-- ════════════════════════════════════════════════════════════
-- Per [docs/runbook/poom-handoff-2026-05-16.md] §F-11 (เดฟ → ภูม,
-- T-D1 re-audit 2026-05-17 finding G9).
--
-- Problem: `payServiceOrderFromWallet` + `adminMarkServiceOrderPaid`
-- use check-then-act idempotency (SELECT existing completed tx →
-- INSERT if none). Under concurrent submits (2 tabs / back-button /
-- API replay), both can pass the SELECT and both INSERT, causing a
-- double-debit. Pay button's `disabled={pending}` client-side guard
-- blocks the common case but cannot stop the residual race.
--
-- This migration adds a DB-level partial-unique index keyed on
-- (reference_id) for the completed-order_payment slice of
-- wallet_transactions — so the second concurrent INSERT raises
-- 23505 and the actions can catch + re-SELECT idempotently.
--
-- Why partial:
-- - `wallet_transactions` carries many kinds (deposit, withdraw, etc).
--   The uniqueness rule is "≤1 COMPLETED order_payment per service
--   order" — specifically the (reference_type='order_header', kind=
--   'order_payment', status='completed') slice.
-- - Forwarder payments use `reference_type='forwarder'` — separate
--   slice, no collision risk.
-- - Yuan/wallet-deposit/etc. payments use other reference_types
--   and/or other kinds — also unaffected.
-- - reference_id repeats per kind/type globally — the partial WHERE
--   constrains the uniqueness to the order_payment slice only.
--
-- After this migration:
-- - actions/service-order.ts::payServiceOrderFromWallet
-- - actions/admin/service-orders.ts::adminMarkServiceOrderPaid
-- both wrap their wallet INSERT in a try-catch — on Postgres error
-- code '23505' (unique_violation) they re-SELECT the existing tx and
-- return { ok: true, data: { tx_id, already_paid: true } }. Existing
-- check-then-act SELECT stays as the fast path; the catch is the
-- atomic backstop.
--
-- Idempotent. Zero data migration. Safe to apply on prod live.
-- ════════════════════════════════════════════════════════════

create unique index if not exists wallet_tx_order_payment_uniq
  on public.wallet_transactions (reference_id)
  where reference_type = 'order_header'
    and kind           = 'order_payment'
    and status         = 'completed';

comment on index public.wallet_tx_order_payment_uniq is
  'F-11/G9 — DB-level guard against double-debit on pay-from-wallet. Partial unique on completed order_payment per service-order h_no. Actions catch 23505 + re-SELECT for idempotent retry.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0050_freight_shipments.sql                                     ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- V-E1 (part 1/2) · freight_shipments + freight_parties
-- ════════════════════════════════════════════════════════════
-- Per [docs/port-specs/freight-document-suite.md] + ADR-0016
-- (locked 2026-05-16 night, 5 Qs resolved).
--
-- The freight spine. Distinct from `cargo_*` (consolidated cargo;
-- weight/CBM grain) — freight = one job, one consignee, full
-- commercial documents (CI, PL, Form E, D/O).
--
-- Status workflow (V1 simplified):
--   draft → confirmed → in_progress → cleared → delivered
--                                    ↘ cancelled (terminal)
--
-- Companion migration 0051 adds freight_invoices + lines (the value
-- block per ADR-0016 §"Field model").
--
-- V-E6 convert hook: after this migration ships,
-- `adminConvertQuoteToShipment` (in actions/admin/freight-quotes.ts)
-- can replace its stub body to actually INSERT a freight_shipments
-- row from an accepted freight_quote (V-E6).
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Yearly job_no serial counter ---------------------------------------
-- A{YY}{NNNNN} pattern from legacy PHP (e.g. A2600200036). 5-digit running
-- per year — yearly reset (Bangkok TZ). High cap so we don't roll over.
create table if not exists public.freight_job_seq (
  period_yy   text primary key,           -- 'YY' (e.g. '26')
  next_seq    int  not null default 1,
  updated_at  timestamptz not null default now()
);

-- 2) freight_shipments --------------------------------------------------
create table if not exists public.freight_shipments (
  id                  uuid primary key default gen_random_uuid(),
  job_no              text unique,            -- A{YY}{NNNNN} — reserved at insert

  -- Customer pointer
  profile_id          uuid not null references public.profiles(id) on delete restrict,

  -- Workflow status
  status              text not null default 'draft'
                        check (status in (
                          'draft',
                          'confirmed',
                          'in_progress',
                          'cleared',
                          'delivered',
                          'cancelled'
                        )),

  -- Logistics terms (per ADR-0016 + freight-document-suite spec)
  transport_mode      text not null check (transport_mode in (
                        'sea_fcl', 'sea_lcl', 'truck', 'air'
                      )),
  container_code      text,                                    -- GZE####/GZS#### internal code
  carrier_container_no text,                                   -- physical B/L container no (SLVU4871649)
  bl_no               text,                                    -- B/L number
  vessel_voyage       text,                                    -- M. MARINER 2614S
  port_loading        text,
  port_discharge      text,
  place_delivery      text,
  incoterm            text check (incoterm in (
                        'EXW','FCA','CPT','CIP','DAP','DPU','DDP',
                        'FAS','FOB','CFR','CIF'
                      )),
  payment_term        text,                                    -- 'T/T', 'L/C at sight', ...
  origin_country      text not null default 'CHINA',

  -- ADR-0016 value block (per shipment — invoice carries its own block
  -- frozen at issuance, but the shipment-level fields drive defaults).
  commercial_value_usd        numeric(14,2) check (commercial_value_usd >= 0 and commercial_value_usd <= 99999999.99),
  exchange_rate               numeric(8,4)  check (exchange_rate > 0     and exchange_rate <= 9999.9999),
  rate_source                 text default 'staff_entered' check (rate_source in ('staff_entered')),
  rate_date                   date,
  commercial_value_thb        numeric(14,2) check (commercial_value_thb >= 0 and commercial_value_thb <= 999999999.99),
  declared_customs_value_thb  numeric(14,2) check (declared_customs_value_thb >= 0 and declared_customs_value_thb <= 999999999.99),
  declared_value_basis        text,                            -- required when declared != commercial; audit-trail string
  hs_code                     text references public.hs_codes(code) on delete restrict,
  duty_rate_pct               numeric(6,3) check (duty_rate_pct >= 0 and duty_rate_pct <= 100),
  duty_thb                    numeric(14,2) check (duty_thb >= 0 and duty_thb <= 999999999.99),
  vat_base_thb                numeric(14,2) check (vat_base_thb >= 0 and vat_base_thb <= 999999999.99),
  vat_thb                     numeric(14,2) check (vat_thb >= 0 and vat_thb <= 999999999.99),
  vat_plan_label              text,                            -- "แผน 1" / "แผน 2" — documentation, not logic
  form_e_applied              boolean not null default false,

  -- Quote linkage (V-E6 → V-E1 conversion)
  source_quote_id     uuid references public.freight_quotes(id) on delete restrict,

  -- Customer notes
  notes               text,

  -- Audit
  created_by_admin_id uuid references public.profiles(id),
  confirmed_at        timestamptz,
  delivered_at        timestamptz,
  cancelled_at        timestamptz,
  cancelled_reason    text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- ADR-0016 rule #1: commercial_value_* and declared_customs_value_thb
  -- are NEVER silently the same field. If commercial_value_usd is set,
  -- exchange_rate must accompany it (so commercial_value_thb is derivable).
  constraint freight_shipments_commercial_rate_pair check (
    (commercial_value_usd is null) = (exchange_rate is null)
  ),
  constraint freight_shipments_cancelled_has_reason check (
    status <> 'cancelled' or (cancelled_reason is not null and cancelled_at is not null)
  )
);

-- Lookup indexes -------------------------------------------------------
create index if not exists freight_shipments_profile_status_idx
  on public.freight_shipments(profile_id, status);
create index if not exists freight_shipments_status_created_idx
  on public.freight_shipments(status, created_at desc);
create index if not exists freight_shipments_job_no_idx
  on public.freight_shipments(job_no) where job_no is not null;
create index if not exists freight_shipments_carrier_container_idx
  on public.freight_shipments(carrier_container_no) where carrier_container_no is not null;
create index if not exists freight_shipments_source_quote_idx
  on public.freight_shipments(source_quote_id) where source_quote_id is not null;
create unique index if not exists freight_shipments_source_quote_uidx
  on public.freight_shipments(source_quote_id) where source_quote_id is not null;

drop trigger if exists freight_shipments_updated_at_trigger on public.freight_shipments;
create trigger freight_shipments_updated_at_trigger
  before update on public.freight_shipments
  for each row execute function public.set_updated_at();

-- 3) freight_parties — shipper + consignee snapshots --------------------
-- Per spec §"freight_parties". Snapshot at document issuance — mirror
-- tax_invoices buyer-snapshot rule. Two roles per shipment.
create table if not exists public.freight_parties (
  id                  uuid primary key default gen_random_uuid(),
  freight_shipment_id uuid not null references public.freight_shipments(id) on delete cascade,
  role                text not null check (role in ('shipper', 'consignee')),

  -- Common fields
  name                text not null,
  address             text not null,

  -- Consignee-specific (Thai importer): tax_id + branch
  tax_id              text,
  branch              text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One shipper + one consignee per shipment (no duplicates per role).
create unique index if not exists freight_parties_shipment_role_uidx
  on public.freight_parties(freight_shipment_id, role);

drop trigger if exists freight_parties_updated_at_trigger on public.freight_parties;
create trigger freight_parties_updated_at_trigger
  before update on public.freight_parties
  for each row execute function public.set_updated_at();

-- 4) Atomic job_no generator -------------------------------------------
-- A{YY}{NNNNN} with yearly reset (Bangkok TZ).
create or replace function public.next_freight_job_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yy  text := to_char(now() at time zone 'Asia/Bangkok', 'YY');
  seq int;
begin
  insert into public.freight_job_seq (period_yy, next_seq)
    values (yy, 2)
    on conflict (period_yy) do update
      set next_seq   = freight_job_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'A' || yy || lpad(seq::text, 5, '0');
end;
$$;

revoke all     on function public.next_freight_job_no() from public, authenticated, anon;
grant  execute on function public.next_freight_job_no() to service_role;

-- 5) RLS ----------------------------------------------------------------
alter table public.freight_shipments enable row level security;
alter table public.freight_parties   enable row level security;
alter table public.freight_job_seq   enable row level security;

-- Customer reads own shipment (any status). Differs from V-E6 quotes
-- which hide draft/pending — for freight_shipments the customer needs
-- to see status throughout the journey, not just at delivery.
drop policy if exists freight_shipments_customer_read on public.freight_shipments;
create policy freight_shipments_customer_read
  on public.freight_shipments for select
  using (profile_id = auth.uid());

-- Admin (super + ops + sales_admin + accounting): full read+write.
drop policy if exists freight_shipments_admin_all on public.freight_shipments;
create policy freight_shipments_admin_all
  on public.freight_shipments for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- Parties: inherit visibility from parent shipment.
drop policy if exists freight_parties_customer_read on public.freight_parties;
create policy freight_parties_customer_read
  on public.freight_parties for select
  using (
    exists (
      select 1 from public.freight_shipments s
       where s.id = freight_parties.freight_shipment_id
         and s.profile_id = auth.uid()
    )
  );

drop policy if exists freight_parties_admin_all on public.freight_parties;
create policy freight_parties_admin_all
  on public.freight_parties for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

drop policy if exists freight_job_seq_admin_all on public.freight_job_seq;
create policy freight_job_seq_admin_all
  on public.freight_job_seq for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- 6) V-E10 QA FK backfill ----------------------------------------------
-- freight_qa_inspections.freight_shipment_id was reserved nullable in
-- migration 0045. Now that freight_shipments exists, add the FK so
-- inspections can key to either side (cargo OR freight). The existing
-- XOR constraint already allows freight_shipment_id non-null.
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
     where table_schema = 'public'
       and table_name   = 'freight_qa_inspections'
       and constraint_name = 'freight_qa_inspections_freight_shipment_id_fkey'
  ) then
    alter table public.freight_qa_inspections
      add constraint freight_qa_inspections_freight_shipment_id_fkey
      foreign key (freight_shipment_id)
      references public.freight_shipments(id)
      on delete restrict;
  end if;
end$$;

-- 7) Comments -----------------------------------------------------------
comment on table  public.freight_shipments is
  'V-E1 — freight spine (distinct from cargo_* consolidated cargo). One job per consignee with full commercial documents. ADR-0016 value block per ADR.';
comment on column public.freight_shipments.job_no is
  'Format A{YY}{NNNNN}. Reserved at insert via next_freight_job_no(). Yearly reset (Bangkok TZ).';
comment on column public.freight_shipments.declared_customs_value_thb is
  'CIF declared value on ใบขนสินค้า — NEVER silently equal to commercial_value_thb. Edit gated to super+accounting per ADR-0016 Q3.';
comment on column public.freight_shipments.declared_value_basis is
  'Free-text justification, required when declared_customs_value_thb is set (audit per ADR-0014).';
comment on column public.freight_shipments.exchange_rate is
  'USD→THB rate frozen with the shipment commitment. rate_source enum locked to staff_entered V1 per ADR-0016 Q1.';
comment on column public.freight_shipments.source_quote_id is
  'V-E6 → V-E1 conversion link. UNIQUE — one quote becomes at-most-one shipment.';

comment on table  public.freight_parties is
  'Shipper + consignee snapshots per freight shipment. Snapshotted at issuance — mirror tax_invoices buyer-snapshot immutability (0034).';

comment on function public.next_freight_job_no is
  'Atomic A{YY}{NNNNN} job_no generator. Yearly counter reset (Bangkok TZ). Concurrent calls serialise on upsert lock.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0051_freight_invoices.sql                                      ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- V-E1 (part 2/2) · freight_invoices + freight_invoice_lines
-- ════════════════════════════════════════════════════════════
-- Per [docs/port-specs/freight-document-suite.md] + ADR-0016.
--
-- The Commercial Invoice + Packing List for a freight shipment. One
-- invoice per shipment (V1 — multi-invoice per shipment deferred to
-- V-E1.1 if partial shipments need split CI).
--
-- Status workflow (mirror tax_invoices, migration 0034):
--   draft → issued → cancelled
--   - draft  : header + lines mutable
--   - issued : financial frozen (commercial_value_usd, exchange_rate,
--              all duty/VAT figures, lines snapshotted). Customer can
--              download the CI / PL / Form E PDFs.
--   - cancelled: PDF re-rendered with watermark; new invoice can be
--                issued for the same shipment.
--
-- Pre-billing gate (V-A6 WHT + V-E10 QA):
--   - WHT cert gate: if a withholding_tax_entries row exists for
--     this freight job, cert_status must be 'received' or 'waived'
--     before issuance (analogous to tax_invoices issuance gate).
--   - QA gate: if a cargo_shipment is linked via freight_shipments
--     (V1 has no cargo linkage on freight_shipments — separate V-E1.1)
--     then isCargoShipmentQaPassed must be true. V1 stub returns
--     true for now since freight_shipments don't carry cargo FK.
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Daily invoice_no serial counter -----------------------------------
-- FI{YYMMDD}-{NNNN}. Daily reset (Bangkok TZ). Distinct from:
--   tax_invoices.serial_no = INV-YYYYMM-NNNN (monthly)
--   freight_quotes.quote_no = FQ{YYMMDD}-{NNNN} (daily)
create table if not exists public.freight_invoice_seq (
  period_yymmdd  text primary key,
  next_seq       int  not null default 1,
  updated_at     timestamptz not null default now()
);

-- 2) freight_invoices ---------------------------------------------------
create table if not exists public.freight_invoices (
  id                          uuid primary key default gen_random_uuid(),
  invoice_no                  text unique,                          -- FI{YYMMDD}-{NNNN} (null while draft)

  freight_shipment_id         uuid not null references public.freight_shipments(id) on delete restrict,
  profile_id                  uuid not null references public.profiles(id)         on delete restrict,

  status                      text not null default 'draft'
                                check (status in ('draft', 'issued', 'cancelled')),

  -- Snapshot of parties at issuance (frozen). Mirror tax_invoices buyer
  -- snapshot — never live-join after issue.
  shipper_name_snapshot       text,
  shipper_address_snapshot    text,
  consignee_name_snapshot     text,
  consignee_address_snapshot  text,
  consignee_tax_id_snapshot   text,
  consignee_branch_snapshot   text,

  -- Logistics snapshot
  transport_mode_snapshot     text,
  container_code_snapshot     text,
  bl_no_snapshot              text,
  vessel_voyage_snapshot      text,
  port_loading_snapshot       text,
  port_discharge_snapshot     text,
  incoterm_snapshot           text,
  payment_term_snapshot       text,
  origin_country_snapshot     text,

  -- ADR-0016 value block — FROZEN at issuance.
  commercial_value_usd        numeric(14,2) check (commercial_value_usd >= 0 and commercial_value_usd <= 99999999.99),
  exchange_rate               numeric(8,4)  check (exchange_rate > 0     and exchange_rate <= 9999.9999),
  rate_source                 text default 'staff_entered' check (rate_source in ('staff_entered')),
  rate_date                   date,
  commercial_value_thb        numeric(14,2) check (commercial_value_thb >= 0 and commercial_value_thb <= 999999999.99),
  declared_customs_value_thb  numeric(14,2) check (declared_customs_value_thb >= 0 and declared_customs_value_thb <= 999999999.99),
  declared_value_basis        text,
  hs_code                     text references public.hs_codes(code) on delete restrict,
  duty_rate_pct               numeric(6,3) check (duty_rate_pct >= 0 and duty_rate_pct <= 100),
  duty_thb                    numeric(14,2) check (duty_thb >= 0 and duty_thb <= 999999999.99),
  vat_base_thb                numeric(14,2) check (vat_base_thb >= 0 and vat_base_thb <= 999999999.99),
  vat_thb                     numeric(14,2) check (vat_thb >= 0 and vat_thb <= 999999999.99),
  vat_plan_label              text,
  form_e_applied              boolean not null default false,

  notes                       text,

  -- Issuance metadata
  issued_at                   timestamptz,
  issued_by_admin_id          uuid references public.profiles(id),
  pdf_storage_path            text,

  -- Cancellation metadata
  cancelled_at                timestamptz,
  cancelled_by_admin_id       uuid references public.profiles(id),
  cancellation_reason         text,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  -- ADR-0016 rule #1 mirror: paired commercial_value pieces.
  constraint freight_invoices_commercial_rate_pair check (
    (commercial_value_usd is null) = (exchange_rate is null)
  ),
  -- Issued requires serial + issuance metadata + financial snapshot non-null.
  constraint freight_invoices_issued_consistent check (
    status <> 'issued' or (
      invoice_no               is not null
      and issued_at            is not null
      and issued_by_admin_id   is not null
      and commercial_value_usd is not null
      and exchange_rate        is not null
    )
  ),
  -- Cancelled requires reason.
  constraint freight_invoices_cancelled_has_reason check (
    status <> 'cancelled' or (cancellation_reason is not null and cancelled_at is not null)
  )
);

-- Indexes ---------------------------------------------------------------
create index if not exists freight_invoices_profile_status_idx
  on public.freight_invoices(profile_id, status);
create index if not exists freight_invoices_shipment_idx
  on public.freight_invoices(freight_shipment_id);
create index if not exists freight_invoices_status_created_idx
  on public.freight_invoices(status, created_at desc);
create index if not exists freight_invoices_invoice_no_idx
  on public.freight_invoices(invoice_no) where invoice_no is not null;

-- One issued (non-cancelled) invoice per shipment at any time. Drafts
-- can pile up; cancelled rows preserved for audit. Re-issuance allowed
-- after cancel.
create unique index if not exists freight_invoices_one_issued_per_shipment
  on public.freight_invoices(freight_shipment_id)
  where status = 'issued';

drop trigger if exists freight_invoices_updated_at_trigger on public.freight_invoices;
create trigger freight_invoices_updated_at_trigger
  before update on public.freight_invoices
  for each row execute function public.set_updated_at();

-- 3) freight_invoice_lines ---------------------------------------------
create table if not exists public.freight_invoice_lines (
  id                  uuid primary key default gen_random_uuid(),
  freight_invoice_id  uuid not null references public.freight_invoices(id) on delete cascade,
  position            smallint not null default 1,

  -- The goods (per spec)
  marks               text,                                       -- "Marks & No."
  description         text not null,
  qty                 numeric(14,3) not null check (qty > 0),
  unit                text not null default 'PCS' check (unit in (
                        'PCS', 'LO', 'MTK', 'KGM', 'CTN', 'PAL', 'SET'
                      )),
  unit_price_usd      numeric(14,2) not null check (unit_price_usd >= 0 and unit_price_usd <= 99999999.99),
  amount_usd          numeric(14,2) not null,                     -- = qty × unit_price_usd
  cartons             int           check (cartons >= 0 and cartons <= 999999),
  gross_weight_kg     numeric(14,3) check (gross_weight_kg >= 0 and gross_weight_kg <= 9999999.999),
  hs_code             text references public.hs_codes(code) on delete restrict,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists freight_invoice_lines_invoice_pos_uidx
  on public.freight_invoice_lines(freight_invoice_id, position);
create index if not exists freight_invoice_lines_hs_code_idx
  on public.freight_invoice_lines(hs_code) where hs_code is not null;

drop trigger if exists freight_invoice_lines_updated_at_trigger on public.freight_invoice_lines;
create trigger freight_invoice_lines_updated_at_trigger
  before update on public.freight_invoice_lines
  for each row execute function public.set_updated_at();

-- 4) Atomic invoice_no generator ---------------------------------------
create or replace function public.next_freight_invoice_serial()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yymmdd text := to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD');
  seq    int;
begin
  insert into public.freight_invoice_seq (period_yymmdd, next_seq)
    values (yymmdd, 2)
    on conflict (period_yymmdd) do update
      set next_seq   = freight_invoice_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'FI' || yymmdd || '-' || lpad(seq::text, 4, '0');
end;
$$;

revoke all     on function public.next_freight_invoice_serial() from public, authenticated, anon;
grant  execute on function public.next_freight_invoice_serial() to service_role;

-- 5) RLS ----------------------------------------------------------------
alter table public.freight_invoices      enable row level security;
alter table public.freight_invoice_lines enable row level security;
alter table public.freight_invoice_seq   enable row level security;

-- Customer reads OWN invoice (any status — V1 keeps it simple).
drop policy if exists freight_invoices_customer_read on public.freight_invoices;
create policy freight_invoices_customer_read
  on public.freight_invoices for select
  using (profile_id = auth.uid());

-- Admin (super + ops + accounting): full read+write.
drop policy if exists freight_invoices_admin_all on public.freight_invoices;
create policy freight_invoices_admin_all
  on public.freight_invoices for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

-- Lines: inherit from parent invoice.
drop policy if exists freight_invoice_lines_customer_read on public.freight_invoice_lines;
create policy freight_invoice_lines_customer_read
  on public.freight_invoice_lines for select
  using (
    exists (
      select 1 from public.freight_invoices fi
       where fi.id = freight_invoice_lines.freight_invoice_id
         and fi.profile_id = auth.uid()
    )
  );

drop policy if exists freight_invoice_lines_admin_all on public.freight_invoice_lines;
create policy freight_invoice_lines_admin_all
  on public.freight_invoice_lines for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists freight_invoice_seq_admin_all on public.freight_invoice_seq;
create policy freight_invoice_seq_admin_all
  on public.freight_invoice_seq for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

-- 6) Comments -----------------------------------------------------------
comment on table  public.freight_invoices is
  'V-E1 — Commercial Invoice for a freight shipment. ADR-0016 value block frozen at issuance.';
comment on column public.freight_invoices.invoice_no is
  'Format FI{YYMMDD}-{NNNN}. Daily counter reset (Bangkok TZ). Reserved at issuance.';
comment on column public.freight_invoices.status is
  'draft (mutable) → issued (financial frozen, PDF available) → cancelled (re-render with watermark; new invoice can be issued for same shipment).';
comment on column public.freight_invoices.commercial_value_thb is
  'commercial_value_usd × exchange_rate, frozen at issuance. NEVER live-recomputed.';
comment on column public.freight_invoices.declared_customs_value_thb is
  'CIF declared value — NEVER silently equal to commercial_value_thb per ADR-0016 rule #1. Edit gated to super+accounting per ADR-0016 Q3.';

comment on index public.freight_invoices_one_issued_per_shipment is
  'ADR-0016 rule #5: one committed invoice per shipment. Re-issuance requires cancel first.';

comment on table  public.freight_invoice_lines is
  'Per-line items snapshotted into the invoice. Editable only when parent status=draft.';

comment on function public.next_freight_invoice_serial is
  'Atomic FI{YYMMDD}-{NNNN} generator. Daily counter reset (Bangkok TZ). Concurrent calls serialise on upsert lock.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0052_freight_invoice_payments.sql                              ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- V-E7 · freight_invoice_payments — payment ledger + receipt layer
-- ════════════════════════════════════════════════════════════
-- Per [docs/port-specs/freight-receipt-and-payment.md].
--
-- V-E1 (migrations 0050 + 0051) shipped freight_shipments + freight_invoices
-- + freight_invoice_lines. V-E7 adds the PAYMENT side: one freight_invoices
-- row can receive many partial payments over weeks (ledger pattern, mirror
-- the F-11 forwarder-payment design). When sum(payments) >= total the
-- invoice's payment_status flips to paid; the receipt PDF re-renders with a
-- "ได้รับเงินแล้ว" stamp.
--
-- ── Two independent state axes on freight_invoices ──────────────────
-- freight_invoices.status        = DOCUMENT lifecycle  : draft → issued → cancelled
--                                  (migration 0051 — DO NOT repurpose)
-- freight_invoices.payment_status = PAYMENT settlement  : unpaid → partial
--                                                          → paid → overpaid
--                                  (this migration — recomputed from the
--                                   payments ledger by the server action)
-- The V-E7 spec (written 2026-05-16, before 0051) assumed status carried
-- BOTH meanings. It doesn't. We keep status as the document lifecycle and
-- add payment_status as a SEPARATE column so neither axis clobbers the
-- other. A cancelled invoice can still be 'paid' historically; an issued
-- invoice progresses unpaid → partial → paid as money arrives.
--
-- ── WHT gate (defensive) ────────────────────────────────────────────
-- The spec wants receipt issuance gated on withholding_tax_entries
-- cert_status (mirror tax_invoices). But that table (migration 0044) keys
-- its parent via order_h_no XOR forwarder_f_no ONLY — there is NO
-- freight_shipment_id / freight_invoice_id column. So freight WHT linkage
-- does not exist yet. V-E7 implements the gate DEFENSIVELY in the server
-- action: when no WHT row can be found for the freight job, issuance is
-- allowed freely. Wiring real freight↔WHT linkage = follow-up V-A6.1
-- (would add freight_invoice_id to withholding_tax_entries + relax its
-- XOR constraint). No schema change here for that — documented only.
--
-- This migration introduces:
--   1. freight_invoices.payment_status  — new column + CHECK + default
--   2. freight_invoices.fully_paid_at   — timestamp the ledger first cleared
--   3. freight_invoice_payments         — the partial-pay ledger table
--   4. Indexes
--   5. RLS — customer reads own (join to freight_invoices.profile_id);
--            admin super/ops/accounting full
--   6. Storage bucket 'freight-payment-slips' — private (mirror wht-certs)
--   7. Comments
--
-- Idempotent — safe to re-run. 0052 confirmed free per
-- docs/runbook/poom-phase-i2-prep.md migration map.
-- ════════════════════════════════════════════════════════════

-- 1) freight_invoices.payment_status — payment settlement axis ----------
-- Added separately from status (document lifecycle). Recomputed by
-- actions/admin/freight-invoice-payments.ts after every payment insert.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'freight_invoices'
       and column_name  = 'payment_status'
  ) then
    alter table public.freight_invoices
      add column payment_status text not null default 'unpaid'
        check (payment_status in ('unpaid', 'partial', 'paid', 'overpaid'));
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'freight_invoices'
       and column_name  = 'fully_paid_at'
  ) then
    alter table public.freight_invoices
      add column fully_paid_at timestamptz;
  end if;
end$$;

-- Lookup index for "outstanding invoices" admin queries.
create index if not exists freight_invoices_payment_status_idx
  on public.freight_invoices(payment_status);

-- 2) freight_invoice_payments — partial-pay ledger ----------------------
-- One row per payment received against an invoice. Append-only in spirit:
-- a mistaken payment is voided (status='voided' + reason), never deleted,
-- so the ledger stays a faithful audit trail.
create table if not exists public.freight_invoice_payments (
  id                    uuid primary key default gen_random_uuid(),

  freight_invoice_id    uuid not null references public.freight_invoices(id) on delete restrict,
  -- Denormalised for RLS query speed — must equal the invoice's profile_id
  -- (enforced by the server action; no live FK-pair CHECK since RLS reads
  -- this column directly and we trust the service-role insert path).
  profile_id            uuid not null references public.profiles(id) on delete restrict,

  -- Payment method — manual entry V1 (no external gateway until T+30d).
  method                text not null
                          check (method in ('cash', 'bank_transfer', 'wallet')),

  -- Amount received (THB only V1). Positive.
  amount_thb            numeric(14,2) not null
                          check (amount_thb > 0 and amount_thb <= 999999999.99),

  -- When the money actually moved (bank-print time for transfers — mirror
  -- wallet_transactions.slip_transferred_at per V-A1, NOT the record time).
  paid_at               timestamptz not null default now(),

  -- Bank-transfer evidence (optional). Path in 'freight-payment-slips'.
  slip_storage_path     text,
  bank_ref              text,

  -- Voiding metadata (mistaken entry — kept for audit, never hard-deleted).
  status                text not null default 'recorded'
                          check (status in ('recorded', 'voided')),
  voided_at             timestamptz,
  voided_by_admin_id    uuid references public.profiles(id),
  void_reason           text,

  -- Audit
  recorded_by_admin_id  uuid not null references public.profiles(id),
  notes                 text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- A voided payment must carry the void metadata (audit completeness —
  -- ADR-0014 pattern, mirror freight_invoices_cancelled_has_reason).
  constraint freight_invoice_payments_voided_has_reason check (
    status <> 'voided' or (voided_at is not null and void_reason is not null)
  )
);

-- Indexes ---------------------------------------------------------------
create index if not exists freight_invoice_payments_invoice_idx
  on public.freight_invoice_payments(freight_invoice_id);
create index if not exists freight_invoice_payments_profile_idx
  on public.freight_invoice_payments(profile_id);
create index if not exists freight_invoice_payments_invoice_status_idx
  on public.freight_invoice_payments(freight_invoice_id, status);
create index if not exists freight_invoice_payments_paid_at_idx
  on public.freight_invoice_payments(paid_at desc);

drop trigger if exists freight_invoice_payments_updated_at_trigger on public.freight_invoice_payments;
create trigger freight_invoice_payments_updated_at_trigger
  before update on public.freight_invoice_payments
  for each row execute function public.set_updated_at();

-- 3) RLS ----------------------------------------------------------------
alter table public.freight_invoice_payments enable row level security;

-- Customer reads payments on their OWN invoices. The denormalised
-- profile_id makes this a flat predicate (no join) — fast for the
-- customer portal payment-history list.
drop policy if exists freight_invoice_payments_customer_read on public.freight_invoice_payments;
create policy freight_invoice_payments_customer_read
  on public.freight_invoice_payments for select
  using (profile_id = auth.uid());

-- Admin (super + ops + accounting): full read+write. ops can see the
-- ledger to support customers; financial mutations all flow through the
-- server action which gates super/ops/accounting (matches 0051's
-- freight_invoices_admin_all role set so ops can operate the panel).
drop policy if exists freight_invoice_payments_admin_all on public.freight_invoice_payments;
create policy freight_invoice_payments_admin_all
  on public.freight_invoice_payments for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

-- 4) Storage bucket 'freight-payment-slips' -----------------------------
-- Private bucket for bank-transfer slips. Mirror 'wht-certs' (0044) +
-- 'tax-invoices' (0035): customer-folder read policy + admin read policy;
-- all writes flow through service_role inside the server action.
-- Path layout: freight-payment-slips/{profile_id}/{invoice_no}-{stamp}.{ext}
insert into storage.buckets (id, name, public)
values ('freight-payment-slips', 'freight-payment-slips', false)
on conflict (id) do nothing;

-- Customer-side read: authenticated user can read slips filed under their
-- own {profile_id}/ folder.
drop policy if exists "freight_payment_slips_user_read" on storage.objects;
create policy "freight_payment_slips_user_read"
  on storage.objects for select
  using (
    bucket_id = 'freight-payment-slips'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admin read: super + ops + accounting can read any slip (support, audit).
drop policy if exists "freight_payment_slips_admin_read" on storage.objects;
create policy "freight_payment_slips_admin_read"
  on storage.objects for select
  using (
    bucket_id = 'freight-payment-slips'
    and public.is_admin(array['super','ops','accounting'])
  );

-- No INSERT/UPDATE/DELETE policies — writes go through service_role inside
-- actions/admin/freight-invoice-payments.ts. Default-deny otherwise.

-- 5) Comments -----------------------------------------------------------
comment on column public.freight_invoices.payment_status is
  'PAYMENT settlement axis (V-E7) — unpaid → partial → paid → overpaid. Recomputed from the freight_invoice_payments ledger by the server action. Distinct from .status (DOCUMENT lifecycle: draft/issued/cancelled). Both axes are independent.';
comment on column public.freight_invoices.fully_paid_at is
  'Timestamp the ledger first reached paid/overpaid. Drives the "ได้รับเงินแล้ว" stamp + payment date on the freight receipt PDF.';

comment on table  public.freight_invoice_payments is
  'V-E7 — partial-payment ledger for freight_invoices. One invoice receives many payments over time; sum(recorded) drives freight_invoices.payment_status. Voided rows kept for audit (never hard-deleted).';
comment on column public.freight_invoice_payments.profile_id is
  'Denormalised from the parent invoice for flat RLS predicate. The server action enforces it equals freight_invoices.profile_id.';
comment on column public.freight_invoice_payments.method is
  'Manual-entry payment methods V1: cash / bank_transfer (optional slip) / wallet. External payment gateway = T+30d, out of V1 scope.';
comment on column public.freight_invoice_payments.paid_at is
  'When the money actually moved (bank-print time for transfers, mirror wallet_transactions.slip_transferred_at) — NOT the admin record time (created_at).';
comment on column public.freight_invoice_payments.status is
  'recorded (counts toward the invoice paid total) → voided (mistaken entry, excluded from the total, kept for audit with void_reason).';
comment on constraint freight_invoice_payments_voided_has_reason on public.freight_invoice_payments is
  'A voided payment MUST carry voided_at + void_reason — audit-trail completeness (ADR-0014 pattern).';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0053_freight_invoice_wht.sql                                   ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- U2-3 · WHT gate for freight invoices
-- ════════════════════════════════════════════════════════════
-- Per UPGRADE_PLAN §2 U2-3 + gap-schema-security G-4 + ADR-0015
-- (extension to the cargo-only V-A6 model).
--
-- V-A6 (migration 0044) wired WHT for cargo orders — admin creates a
-- withholding_tax_entries row (FK to service_orders.h_no OR
-- forwarders.f_no) → cert_status='pending' → blocks issueTaxInvoice
-- until cert received/waived.
--
-- The freight side (V-E1 freight_invoices, migration 0051) had no WHT
-- gate. Juristic freight customers withhold tax the SAME way — but
-- Pacred couldn't block their receipt issuance today. U2-3 closes
-- this gap.
--
-- Changes:
--   1. Add freight_invoice_id column to withholding_tax_entries
--   2. Relax wht_one_parent_order from 2-way XOR (h_no OR f_no) to
--      3-way XOR (h_no OR f_no OR freight_invoice_id), exactly-one
--   3. Add partial-unique on freight_invoice_id (mirror the two
--      existing partial-unique indexes for cargo parents)
--   4. Index for the freight side for the issuance-gate lookup
--
-- After this migration, adminIssueFreightInvoice can check:
--   select 1 from withholding_tax_entries
--    where freight_invoice_id = <id> and cert_status='pending';
-- → block issuance if found (mirror tax_invoices issuance gate from
-- V-A6).
--
-- Idempotent. Safe to apply on prod live (no data migration).
-- ════════════════════════════════════════════════════════════

-- 1) Add the freight_invoice_id column ----------------------------------
alter table public.withholding_tax_entries
  add column if not exists freight_invoice_id uuid references public.freight_invoices(id) on delete restrict;

-- 2) Relax the XOR constraint to 3-way --------------------------------
-- Drop the existing 2-way XOR, replace with 3-way exactly-one.
-- (Idempotent: drop-if-exists then add.)
alter table public.withholding_tax_entries
  drop constraint if exists wht_one_parent_order;
alter table public.withholding_tax_entries
  add constraint wht_one_parent_order check (
    (case when order_h_no         is not null then 1 else 0 end) +
    (case when forwarder_f_no     is not null then 1 else 0 end) +
    (case when freight_invoice_id is not null then 1 else 0 end) = 1
  );

-- 3) Partial-unique on freight_invoice_id ------------------------------
-- Mirror the existing wht_one_per_order_uidx / wht_one_per_forwarder_uidx
-- pattern. One WHT row per freight invoice (no double-counting).
create unique index if not exists wht_one_per_freight_invoice_uidx
  on public.withholding_tax_entries(freight_invoice_id)
  where freight_invoice_id is not null;

-- 4) Lookup index for the issuance gate --------------------------------
create index if not exists wht_freight_invoice_idx
  on public.withholding_tax_entries(freight_invoice_id)
  where freight_invoice_id is not null;

-- 5) Comments ---------------------------------------------------------
comment on column public.withholding_tax_entries.freight_invoice_id is
  'U2-3 — freight-side parent. XOR with order_h_no + forwarder_f_no (exactly one non-null per wht_one_parent_order constraint).';
comment on constraint wht_one_parent_order on public.withholding_tax_entries is
  '3-way XOR: each WHT row points to exactly one parent — order_h_no (shop), forwarder_f_no (cargo import), or freight_invoice_id (freight commercial invoice). Mirrors tax_invoices_one_parent_order pattern extended for V-E1.';
comment on index public.wht_one_per_freight_invoice_uidx is
  'U2-3 — at most one WHT entry per freight_invoice (mirror the cargo-side per-parent unique pattern).';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0054_commissions.sql                                           ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- V-E8 + V-H1 + V-H2 · commission_tiers + commission_accruals
--                     + commission_withdrawals
--                     + commission_withdrawal_items
--                     + admins.role enum extension ('interpreter')
-- ════════════════════════════════════════════════════════════
-- Per port-spec docs/port-specs/commission-withdrawal.md (locked
-- 2026-05-16 night) + ADR-0015 Q3 + Phase I2 RBAC ack 2026-05-17.
--
-- ONE unified commission ledger serves both legacy PHP commission flows:
--   1. Interpreter (ล่ามจีน)  — per-job, per-order commission
--      Legacy PHP: pcs-admin/include/pages/withdraw-commission-interpreter/
--   2. Sales rep              — direct sales margin per closed order
--      Legacy PHP: pcs-admin/include/pages/withdraw-commission-sale/
--
-- This is DISTINCT from the team-leader referral commission flow in
-- 0013_sales_referral.sql (team_leaders + sales_commissions + sales_payouts).
-- That ledger pays GROUP leaders a % of their team's orders. THIS ledger
-- pays the individual staff member who closed/handled the order. Both
-- coexist long-term (different business policies, different RLS, different
-- legacy PHP pages).
--
-- Common workflow (mirrors legacy PHP withdraw-commission-* flow):
--   accrual  (system mints per closed order)
--     → request (staff bundles N accruals into a withdrawal, picks payee bank)
--     → approve (super/accounting reviews; pending → approved)
--     → paid    (super/accounting transfers + uploads slip; approved → paid)
--   rejected branch: pending → rejected (with reason)
--
-- Thai law WHT 15% on payouts > 5,000 THB (Revenue Code §50(1)) — column
-- exists + constraint enforces consistency, but UI wiring is deferred to
-- V1.1 per the V1 scope.
--
-- This migration introduces:
--   1. admins.role enum extended: + 'interpreter'   (3-line drop+add check)
--   2. commission_tiers             — per-role/per-service rate lookup
--   3. commission_accruals          — earned-but-unpaid per closed order
--   4. commission_withdrawal_seq    — daily serial for CW-{YYMM}-{seq}
--   5. commission_withdrawals       — withdrawal request header
--   6. commission_withdrawal_items  — accruals ← withdrawal join
--   7. next_commission_withdrawal_no() — atomic serial generator
--   8. RLS: customer reads NOTHING (commission is staff-only); staff
--           reads own; super/accounting full r/w.
--   9. Storage bucket 'commission-slips' (private, super+accounting only V1)
--  10. Comments
--
-- Idempotent throughout (`if not exists`, `drop ... if exists` first).
-- ════════════════════════════════════════════════════════════

-- 1) Extend admins.role with 'interpreter' --------------------------
-- Existing values (per 0033): super, ops, accounting, sales_admin,
-- warehouse, driver. ADR-0015 Q3 + Phase I2 RBAC ack 2026-05-17 add
-- 'interpreter' — legacy ล่ามจีน staff get own commission portal +
-- own accrual visibility (RLS-scoped to earner_admin_id = auth.uid()).
alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins add  constraint admins_role_check
  check (role in (
    'super','ops','accounting','sales_admin','warehouse','driver','interpreter'
  ));

-- 2) commission_tiers ----------------------------------------------
-- Per-role/per-service rate lookup. Snapshot at accrual time
-- (commission_accruals.tier_id) freezes the historical rate so past
-- accruals don't get re-rated when tiers change.
create table if not exists public.commission_tiers (
  id                uuid primary key default gen_random_uuid(),
  role_kind         text not null
                      check (role_kind in ('interpreter','sales_rep')),
  service_kind      text not null
                      check (service_kind in (
                        'service_order',   -- China shop (orders)
                        'forwarder',       -- cargo import
                        'freight_quote'    -- international freight conversion
                      )),
  tier_name         text not null,                                  -- e.g. "interpreter standard rate"
  rate_pct          numeric(6,3),                                   -- e.g. 1.500 = 1.5%
  flat_thb          numeric(12,2),                                  -- OR a flat per-job amount
  min_base_thb      numeric(12,2),                                  -- min order value to qualify
  effective_from    date not null default current_date,
  effective_to      date,
  is_active         boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint commission_tiers_rate_xor_flat check (
    (rate_pct is not null and flat_thb is null)
    or (rate_pct is null and flat_thb is not null)
  )
);

create index if not exists commission_tiers_lookup_idx
  on public.commission_tiers(role_kind, service_kind, is_active);

drop trigger if exists commission_tiers_updated_at_trigger on public.commission_tiers;
create trigger commission_tiers_updated_at_trigger
  before update on public.commission_tiers
  for each row execute function public.set_updated_at();

-- 3) commission_accruals -------------------------------------------
-- One row per (earner × source order). Idempotent: partial-unique on
-- (source_kind, source_ref, earner_admin_id) prevents double-mint per
-- source × earner. Background job (cron) is V1.1; V1 = admin triggers
-- adminAccrueCommissionForOrder() manually per closed order.
create table if not exists public.commission_accruals (
  id                       uuid primary key default gen_random_uuid(),
  earner_admin_id          uuid not null references public.profiles(id) on delete restrict,
  role_kind                text not null
                             check (role_kind in ('interpreter','sales_rep')),
  tier_id                  uuid not null references public.commission_tiers(id) on delete restrict,
  source_kind              text not null
                             check (source_kind in (
                               'service_order','forwarder','freight_quote'
                             )),
  source_ref               text not null,                            -- h_no | f_no | quote_no
  base_thb                 numeric(12,2) not null,                   -- the base the rate applied to
  accrued_amount_thb       numeric(12,2) not null,                   -- frozen at accrual
  accrued_at               timestamptz not null default now(),       -- when source closed + mint occurred
  withdrawal_item_id       uuid,                                     -- nullable; set when included in a paid withdrawal
                                                                     -- FK added after withdrawal_items table exists (see below)
  notes                    text,
  created_at               timestamptz not null default now()
);

-- Indexes -----------------------------------------------------------
-- Fast "my unpaid balance" query — partial index on unpaid rows only.
create index if not exists commission_accruals_earner_unpaid_idx
  on public.commission_accruals(earner_admin_id, accrued_at desc)
  where withdrawal_item_id is null;

create index if not exists commission_accruals_earner_idx
  on public.commission_accruals(earner_admin_id, accrued_at desc);

-- Source lookup (for re-accrual audit + cron idempotency).
create unique index if not exists commission_accruals_source_uidx
  on public.commission_accruals(source_kind, source_ref, earner_admin_id);

-- 4) commission_withdrawal_seq -------------------------------------
-- Monthly serial counter — CW-{YYMM}-{seq}. Reset per (YY,MM).
create table if not exists public.commission_withdrawal_seq (
  period_yymm   text primary key,                                    -- e.g. "2605"
  next_seq      int not null default 1,
  updated_at    timestamptz not null default now()
);

-- 5) commission_withdrawals ----------------------------------------
-- Withdrawal request header. Status machine:
--   pending → approved → paid          (happy path)
--   pending → rejected (with reason)   (super/accounting reject)
create table if not exists public.commission_withdrawals (
  id                       uuid primary key default gen_random_uuid(),
  withdrawal_no            text unique,                              -- CW-{YYMM}-{seq}, reserved at insert

  earner_admin_id          uuid not null references public.profiles(id) on delete restrict,
  role_kind                text not null
                             check (role_kind in ('interpreter','sales_rep')),
  title                    text not null,                            -- e.g. "ค่าคอมเดือนพ.ค. 2026"

  -- Financial snapshot (frozen at request time)
  gross_thb                numeric(12,2) not null check (gross_thb > 0),
  wht_rate_pct             numeric(4,2) not null default 15.00,      -- Thai WHT default; override audited
  wht_amount_thb           numeric(12,2) not null default 0,
  net_thb                  numeric(12,2) not null,

  -- Payee bank account snapshot (frozen at request time)
  payee_bank_name          text not null,
  payee_account_name       text not null,
  payee_account_no         text not null,

  -- Status machine
  status                   text not null default 'pending'
                             check (status in (
                               'pending','approved','rejected','paid'
                             )),

  requested_at             timestamptz not null default now(),
  approved_at              timestamptz,
  approved_by_admin_id     uuid references public.profiles(id),

  rejected_at              timestamptz,
  rejected_by_admin_id     uuid references public.profiles(id),
  rejected_reason          text,

  paid_at                  timestamptz,
  paid_by_admin_id         uuid references public.profiles(id),
  slip_storage_path        text,                                     -- bucket: commission-slips

  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- ── Consistency constraints ──
  constraint commission_withdrawals_rejected_has_reason check (
    status <> 'rejected'
    or (rejected_at is not null
        and rejected_by_admin_id is not null
        and rejected_reason is not null
        and char_length(rejected_reason) >= 3)
  ),
  constraint commission_withdrawals_paid_consistency check (
    status <> 'paid'
    or (paid_at is not null
        and paid_by_admin_id is not null
        and slip_storage_path is not null)
  ),
  constraint commission_withdrawals_approved_consistency check (
    status not in ('approved','paid')
    or (approved_at is not null and approved_by_admin_id is not null)
  ),
  -- WHT consistency per Thai Revenue Code §50(1):
  -- wht_amount must be 0 OR (gross > 5000 AND wht_rate > 0). The "OR"
  -- branch allows wht_amount=0 even on >5k payouts when staff
  -- overrides rate to 0 (taxable elsewhere — audited via wht_rate_pct).
  constraint commission_withdrawals_wht_consistency check (
    wht_amount_thb = 0
    or (gross_thb > 5000 and wht_rate_pct > 0)
  )
);

-- Indexes -----------------------------------------------------------
create index if not exists commission_withdrawals_earner_idx
  on public.commission_withdrawals(earner_admin_id, requested_at desc);
create index if not exists commission_withdrawals_status_idx
  on public.commission_withdrawals(status, requested_at desc);
create index if not exists commission_withdrawals_pending_queue_idx
  on public.commission_withdrawals(requested_at desc)
  where status in ('pending','approved');

drop trigger if exists commission_withdrawals_updated_at_trigger on public.commission_withdrawals;
create trigger commission_withdrawals_updated_at_trigger
  before update on public.commission_withdrawals
  for each row execute function public.set_updated_at();

-- 6) commission_withdrawal_items -----------------------------------
-- Many-to-one join: a withdrawal aggregates N accruals.
-- UNIQUE on commission_accrual_id prevents double-include.
create table if not exists public.commission_withdrawal_items (
  id                          uuid primary key default gen_random_uuid(),
  commission_withdrawal_id    uuid not null references public.commission_withdrawals(id) on delete restrict,
  commission_accrual_id       uuid not null references public.commission_accruals(id) on delete restrict,
  included_amount_thb         numeric(12,2) not null,                -- snapshot of accrual amount at request time
  created_at                  timestamptz not null default now(),
  unique (commission_accrual_id)                                     -- one accrual → at most one withdrawal
);

create index if not exists commission_withdrawal_items_withdrawal_idx
  on public.commission_withdrawal_items(commission_withdrawal_id);

-- Backfill the deferred FK on commission_accruals.withdrawal_item_id.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'commission_accruals_withdrawal_item_fkey'
  ) then
    alter table public.commission_accruals
      add constraint commission_accruals_withdrawal_item_fkey
      foreign key (withdrawal_item_id)
      references public.commission_withdrawal_items(id)
      on delete set null;
  end if;
end $$;

-- 7) next_commission_withdrawal_no() --------------------------------
-- CW-{YYMM}-{seq} with monthly reset (Bangkok TZ). Mirror pattern of
-- next_freight_quote_no (0048) + next_freight_invoice_serial (0051).
create or replace function public.next_commission_withdrawal_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yymm text := to_char(now() at time zone 'Asia/Bangkok', 'YYMM');
  seq  int;
begin
  insert into public.commission_withdrawal_seq (period_yymm, next_seq)
    values (yymm, 2)
    on conflict (period_yymm) do update
      set next_seq   = commission_withdrawal_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'CW-' || yymm || '-' || lpad(seq::text, 4, '0');
end;
$$;

revoke all     on function public.next_commission_withdrawal_no() from public, authenticated, anon;
grant  execute on function public.next_commission_withdrawal_no() to service_role;

-- 8) RLS ------------------------------------------------------------
-- Customer reads NOTHING (commission is admin/staff only). No customer
-- policies created — default-deny applies.
--
-- Staff (interpreter + sales_admin + sales_rep) reads OWN accruals +
-- own withdrawals via earner_admin_id = auth.uid().
--
-- Super + accounting: full r/w on all four tables.
alter table public.commission_tiers              enable row level security;
alter table public.commission_accruals           enable row level security;
alter table public.commission_withdrawals        enable row level security;
alter table public.commission_withdrawal_items   enable row level security;
alter table public.commission_withdrawal_seq     enable row level security;

-- ── commission_tiers ──
-- Staff reads tiers matching their role (so portal can show "you earn at
-- this rate"). Super + accounting full r/w.
drop policy if exists commission_tiers_staff_read on public.commission_tiers;
create policy commission_tiers_staff_read
  on public.commission_tiers for select
  using (
    public.is_admin(array['interpreter','sales_admin'])
    and is_active = true
  );

drop policy if exists commission_tiers_admin_all on public.commission_tiers;
create policy commission_tiers_admin_all
  on public.commission_tiers for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- ── commission_accruals ──
-- Earner reads OWN accruals.
drop policy if exists commission_accruals_earner_read on public.commission_accruals;
create policy commission_accruals_earner_read
  on public.commission_accruals for select
  using (earner_admin_id = auth.uid());

drop policy if exists commission_accruals_admin_all on public.commission_accruals;
create policy commission_accruals_admin_all
  on public.commission_accruals for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- ── commission_withdrawals ──
-- Earner reads OWN withdrawals.
drop policy if exists commission_withdrawals_earner_read on public.commission_withdrawals;
create policy commission_withdrawals_earner_read
  on public.commission_withdrawals for select
  using (earner_admin_id = auth.uid());

-- Earner creates own pending withdrawal request. App-layer also enforces
-- the items must belong to the earner + sum > minimum threshold.
drop policy if exists commission_withdrawals_earner_request on public.commission_withdrawals;
create policy commission_withdrawals_earner_request
  on public.commission_withdrawals for insert
  with check (
    earner_admin_id = auth.uid()
    and status = 'pending'
  );

drop policy if exists commission_withdrawals_admin_all on public.commission_withdrawals;
create policy commission_withdrawals_admin_all
  on public.commission_withdrawals for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- ── commission_withdrawal_items ──
-- Earner reads items belonging to own withdrawals.
drop policy if exists commission_withdrawal_items_earner_read on public.commission_withdrawal_items;
create policy commission_withdrawal_items_earner_read
  on public.commission_withdrawal_items for select
  using (
    exists (
      select 1 from public.commission_withdrawals w
       where w.id = commission_withdrawal_items.commission_withdrawal_id
         and w.earner_admin_id = auth.uid()
    )
  );

drop policy if exists commission_withdrawal_items_admin_all on public.commission_withdrawal_items;
create policy commission_withdrawal_items_admin_all
  on public.commission_withdrawal_items for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- ── commission_withdrawal_seq ──
-- Admin-only access; the generator fn bypasses via SECURITY DEFINER.
drop policy if exists commission_withdrawal_seq_admin_all on public.commission_withdrawal_seq;
create policy commission_withdrawal_seq_admin_all
  on public.commission_withdrawal_seq for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- 9) Storage bucket 'commission-slips' ------------------------------
-- Private bucket — super + accounting write/read; earner reads own
-- (via the path prefix {earner_admin_id}/). Pattern mirrors wht-certs
-- (0044) + slips (existing).
insert into storage.buckets (id, name, public)
values ('commission-slips', 'commission-slips', false)
on conflict (id) do nothing;

-- Earner-side read: authenticated user can read slips filed under their
-- own {earner_admin_id}/ folder (so they can see proof of payment).
drop policy if exists "commission_slips_user_read" on storage.objects;
create policy "commission_slips_user_read"
  on storage.objects for select
  using (
    bucket_id = 'commission-slips'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admin read: super + accounting can read any slip (audit, support).
drop policy if exists "commission_slips_admin_read" on storage.objects;
create policy "commission_slips_admin_read"
  on storage.objects for select
  using (
    bucket_id = 'commission-slips'
    and public.is_admin(array['super','accounting'])
  );

-- No INSERT/UPDATE/DELETE policies — all writes go through service_role
-- inside server actions (actions/admin/commissions.ts). Default-deny otherwise.

-- 10) Comments -----------------------------------------------------
comment on table  public.commission_tiers is
  'V-E8 — per-role/per-service commission rate lookup. exactly one of (rate_pct, flat_thb) is non-null. Snapshotted into commission_accruals.tier_id at accrual to freeze the historical rate.';
comment on table  public.commission_accruals is
  'V-E8 — earned-but-unpaid commission rows. One per (earner × source order). Idempotent via partial-unique (source_kind, source_ref, earner_admin_id). withdrawal_item_id = null while unpaid; set when included in a withdrawal.';
comment on table  public.commission_withdrawals is
  'V-E8 — withdrawal request header. status pending → approved → paid (or pending → rejected). WHT 15% applied per Thai Revenue Code §50(1) when gross > 5,000 THB.';
comment on table  public.commission_withdrawal_items is
  'V-E8 — accruals included in a withdrawal. UNIQUE (commission_accrual_id) prevents double-include.';

comment on column public.commission_tiers.rate_pct is
  'percentage e.g. 1.500 = 1.5%. exactly-one with flat_thb (constraint).';
comment on column public.commission_tiers.flat_thb is
  'OR a flat per-job amount. exactly-one with rate_pct (constraint).';
comment on column public.commission_accruals.tier_id is
  'snapshot at accrual time — frozen. on delete restrict so we cant lose the historical rate.';
comment on column public.commission_accruals.source_kind is
  'service_order | forwarder | freight_quote — which type of source order this accrual was minted from.';
comment on column public.commission_accruals.source_ref is
  'the source order id (h_no / f_no / quote_no depending on source_kind).';
comment on column public.commission_withdrawals.withdrawal_no is
  'Format CW-{YYMM}-{seq}. Reserved at insert via next_commission_withdrawal_no().';
comment on column public.commission_withdrawals.wht_rate_pct is
  'Thai WHT default 15% per Revenue Code §50(1); staff can override to 0 for taxable-elsewhere cases (audited).';
comment on column public.commission_withdrawals.slip_storage_path is
  'bucket: commission-slips. format: {earner_admin_id}/{withdrawal_no}.{ext}';

comment on constraint commission_withdrawals_paid_consistency on public.commission_withdrawals is
  'status=paid MUST have paid_at + paid_by_admin_id + slip_storage_path populated. Cant flip to paid without the slip.';
comment on constraint commission_withdrawals_wht_consistency on public.commission_withdrawals is
  'wht_amount_thb = 0 OR (gross_thb > 5000 AND wht_rate_pct > 0). Mirrors Thai Revenue Code §50(1) threshold; override audited.';

comment on function public.next_commission_withdrawal_no() is
  'Atomic CW-{YYMM}-{seq} serial generator with monthly counter reset (Bangkok TZ). Concurrent calls serialise on upsert lock.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0055_broadcasts.sql                                            ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- V-G3 · admin broadcasts (push popup to customers)
-- ════════════════════════════════════════════════════════════
-- Per port-spec [docs/port-specs/admin-polish-bundle.md] §V-G3.
--
-- Pacred has inbound `/admin/contact-messages` (customer → admin). PHP
-- `popup.php` + `pages/popup/` let admin send OUTBOUND push notifications
-- to customers (e.g. "ปิดทำการสงกรานต์ 13-15 เม.ย." / promo announcements).
-- No equivalent in Pacred V1. This migration adds the spine.
--
-- Two delivery channels (V1 = in-app only via notifications rows; LINE
-- push deferred to V-G3.1 — needs LINE Messaging API quota + rate-limit
-- queue, separate task).
--
-- V1 ships:
-- 1. broadcasts table
-- 2. notifications.broadcast_id FK (so admin can read sent-count + drill
--    down to read-rate via existing notification_reads table)
-- 3. RLS: super + sales_admin write; customer never reads (broadcasts
--    table itself — but DOES see resulting notifications rows naturally)
--
-- Idempotent. Numbered 0055 (after V-E8 commission claims 0054).
-- ════════════════════════════════════════════════════════════

-- 1) broadcasts table -------------------------------------------------
create table if not exists public.broadcasts (
  id                  uuid primary key default gen_random_uuid(),

  -- Content
  title               text not null,
  body                text not null,                  -- short body (markdown light)
  link_href           text,                            -- relative deep-link

  -- Audience — V1 supports 4 filter modes
  audience            text not null check (audience in (
                        'all',                         -- every active customer
                        'juristic_only',
                        'personal_only',
                        'specific_ids'                 -- audience_ids[] list
                      )),
  audience_ids        uuid[],                          -- when audience='specific_ids'

  -- Scheduling
  scheduled_for       timestamptz,                     -- nullable; null = send now
  status              text not null default 'draft'
                        check (status in (
                          'draft',
                          'scheduled',
                          'sending',
                          'sent',
                          'cancelled'
                        )),

  -- Result counters (filled by send action)
  sent_count          int not null default 0,
  failed_count        int not null default 0,

  -- Audit
  created_by_admin_id uuid not null references public.profiles(id),
  scheduled_at        timestamptz,                     -- when admin clicked "schedule"
  sent_at             timestamptz,                     -- when actual send fired
  cancelled_at        timestamptz,
  cancelled_reason    text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- specific_ids audience MUST carry an id list.
  constraint broadcasts_specific_ids_has_list check (
    audience <> 'specific_ids' or (audience_ids is not null and array_length(audience_ids, 1) > 0)
  ),
  -- scheduled status MUST have scheduled_for set + future-ish (allow past
  -- so reschedule works; the cron picks up anything past + status=scheduled).
  constraint broadcasts_scheduled_has_time check (
    status <> 'scheduled' or scheduled_for is not null
  ),
  -- sent status MUST have sent_at populated.
  constraint broadcasts_sent_has_timestamp check (
    status <> 'sent' or sent_at is not null
  ),
  -- cancelled status MUST have reason.
  constraint broadcasts_cancelled_has_reason check (
    status <> 'cancelled' or (cancelled_reason is not null and cancelled_at is not null)
  )
);

-- Lookup indexes -----------------------------------------------------
create index if not exists broadcasts_status_created_idx
  on public.broadcasts(status, created_at desc);
create index if not exists broadcasts_scheduled_for_idx
  on public.broadcasts(scheduled_for) where status = 'scheduled';

drop trigger if exists broadcasts_updated_at_trigger on public.broadcasts;
create trigger broadcasts_updated_at_trigger
  before update on public.broadcasts
  for each row execute function public.set_updated_at();

-- 2) notifications.broadcast_id FK -----------------------------------
alter table public.notifications
  add column if not exists broadcast_id uuid references public.broadcasts(id) on delete set null;

create index if not exists notifications_broadcast_idx
  on public.notifications(broadcast_id) where broadcast_id is not null;

-- 3) RLS --------------------------------------------------------------
alter table public.broadcasts enable row level security;

-- Customer reads NOTHING from broadcasts — they only see the resulting
-- notification rows (which are already RLS-scoped per profile).
-- Admin (super + sales_admin) full read + write.
drop policy if exists broadcasts_admin_all on public.broadcasts;
create policy broadcasts_admin_all
  on public.broadcasts for all
  using      (public.is_admin(array['super','sales_admin']))
  with check (public.is_admin(array['super','sales_admin']));

-- 4) Comments ---------------------------------------------------------
comment on table  public.broadcasts is
  'V-G3 — admin push broadcasts (outbound). One row per campaign. V1 in-app only via notifications rows; V-G3.1 adds LINE push.';
comment on column public.broadcasts.audience is
  'all | juristic_only | personal_only | specific_ids. Future V-G3.2: specific_segment via JSONB filter.';
comment on column public.broadcasts.audience_ids is
  'profile_id[] when audience=specific_ids. MUST be non-empty per CHECK.';
comment on column public.broadcasts.scheduled_for is
  'Null = send now (V1 only). Future V-G3.1 cron picks up past-due scheduled rows.';
comment on column public.broadcasts.sent_count is
  'Count of notifications rows successfully inserted at send time.';
comment on column public.broadcasts.failed_count is
  'Count of failures during fan-out (rare — RLS or duplicate primary key).';
comment on column public.notifications.broadcast_id is
  'V-G3 — links a notifications row back to its source broadcast for per-campaign read-rate analytics.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0056_accounting_periods.sql                                    ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- V-E9 · accounting_periods + period_close_event + freeze trigger
-- ════════════════════════════════════════════════════════════
-- Per [docs/port-specs/freight-monthly-closing.md] (V-E9 spec).
--
-- When the accounting team closes a month ("ปิดงวด") on Monday morning,
-- this migration provides the spine + DB-level safety net to ensure no
-- admin can accidentally edit issued invoices / payments / commission
-- accruals / wallet transactions belonging to a closed month.
--
-- ── V1 scope ──────────────────────────────────────────────────────
-- 1. `accounting_periods` — one row per `yyyymm` (e.g. "202605").
--    Status lifecycle:
--      open    → period is mutable; new tx land here
--      closing → admin signaled "preparing to close" (UI may warn but
--                trigger still allows writes; soft barrier)
--      closed  → trigger BLOCKS UPDATE/DELETE on financial tables for
--                rows whose effective date falls in this period
--
-- 2. `period_close_event` — append-only ledger of what was frozen at
--    close (row counts + sums per table). One row PER table per close,
--    so the close action writes ~5 rows per yyyymm.
--
-- 3. `accounting_period_freeze_check()` — BEFORE UPDATE/DELETE trigger
--    function attached to:
--      tax_invoices           (effective date = issued_at)
--      freight_invoices       (effective date = issued_at)
--      freight_invoice_payments (effective date = paid_at)
--      wallet_transactions    (effective date = created_at)
--    If the row's period is `closed`, RAISE EXCEPTION 'period_closed'.
--
-- ── Period-effective-date logic (decision call) ──────────────────
-- The spec is ambiguous on which timestamp marks a row as "belonging
-- to" a period. We pick the most semantically correct field per table
-- (the field accounting cares about for ภ.พ.30 reconciliation):
--   tax_invoices.issued_at         — RD Code 86 issuance date
--   freight_invoices.issued_at     — when the freight CI was committed
--   freight_invoice_payments.paid_at — when the money moved (bank-print
--                                       time, not record time)
--   wallet_transactions.created_at — append-only ledger; no other ts
-- If a row's effective field is NULL (e.g. draft invoice), the trigger
-- falls back to created_at (defensive — drafts are mutable anyway since
-- draft invoices have no issued_at, but the fallback prevents NULL
-- from silently bypassing the freeze).
--
-- ── RLS ──────────────────────────────────────────────────────────
-- Customer reads NOTHING from accounting_periods / period_close_event.
-- Admin (super + accounting) full read + write. ops can read for context
-- (so the UI can warn "งวดนี้ปิดแล้ว" mid-flow) but cannot mutate.
--
-- ── V1 DEFERRED ──────────────────────────────────────────────────
-- - Cron auto-seed each month-1 (V1 admin clicks "open period" manually)
-- - PEAK accounting export (U2-4 separate item)
-- - Per-channel revenue breakdown beyond basic counts (V-E12 dashboards)
-- - Closing checklist UI (V1 = just the close button; V1.1 enforces)
-- - cargo_shipments financial-field freeze (V1 scope = the 4 tables
--   above; cargo_shipments status flips are allowed since they're
--   tracking, not money — the money side lives in wallet_transactions
--   which IS frozen)
--
-- Idempotent (if-not-exists + drop-trigger-if-exists + create-or-replace).
-- Number 0056 per docs/runbook/poom-phase-i2-prep.md (V-G3 broadcasts
-- claimed 0055, leaving 0056 free for V-E9).
-- ════════════════════════════════════════════════════════════

-- 1) accounting_periods --------------------------------------------------
create table if not exists public.accounting_periods (
  -- yyyymm format e.g. "202605". Text so we can sort lexicographically
  -- + index range-scan "last 24 months" cheaply.
  period_yyyymm        text primary key
                         check (period_yyyymm ~ '^[0-9]{4}(0[1-9]|1[0-2])$'),

  status               text not null default 'open'
                         check (status in ('open', 'closing', 'closed')),

  opened_at            timestamptz not null default now(),
  -- FK references profiles(id), NOT admins(profile_id) — admins has
  -- composite PK (profile_id, role) so profile_id alone isn't unique.
  -- Mirrors the tax_invoices issued_by_admin pattern (migration 0034).
  opened_by_admin_id   uuid references public.profiles(id),

  closing_marked_at    timestamptz,
  closed_at            timestamptz,
  closed_by_admin_id   uuid references public.profiles(id),
  closing_notes        text,

  reopened_at          timestamptz,
  reopened_by_admin_id uuid references public.profiles(id),
  reopened_reason      text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- When status='closed', the close metadata MUST be set (audit
  -- completeness — ADR-0014 pattern, mirror tax_invoices_issued_has_serial).
  constraint accounting_periods_closed_has_metadata check (
    status <> 'closed' or (
      closed_at            is not null and
      closed_by_admin_id   is not null
    )
  ),
  -- A reopen MUST carry a reason + reopener (the rare-but-serious case
  -- the spec explicitly calls out — super-only emergency rollback).
  constraint accounting_periods_reopen_has_reason check (
    reopened_at is null or (
      reopened_reason      is not null and
      char_length(reopened_reason) >= 10 and
      reopened_by_admin_id is not null
    )
  )
);

create index if not exists accounting_periods_status_idx
  on public.accounting_periods(status);
create index if not exists accounting_periods_closed_at_idx
  on public.accounting_periods(closed_at desc) where status = 'closed';

drop trigger if exists accounting_periods_updated_at_trigger on public.accounting_periods;
create trigger accounting_periods_updated_at_trigger
  before update on public.accounting_periods
  for each row execute function public.set_updated_at();

-- 2) period_close_event — per-table snapshot at close --------------------
-- Append-only ledger. One row PER table PER close, so the close action
-- writes ~5 rows per yyyymm. A reopen DOES NOT delete these — they're
-- the historical record of what was frozen.
create table if not exists public.period_close_event (
  id                   uuid primary key default gen_random_uuid(),

  period_yyyymm        text not null references public.accounting_periods(period_yyyymm) on delete restrict,
  table_name           text not null,                  -- e.g. 'tax_invoices'

  -- Snapshot at close time. Row counts + sums of the headline THB
  -- column (varies per table — see column-comment below). NULL when
  -- the table has no THB-summable column (e.g. row-count-only).
  row_count            int           not null default 0,
  sum_thb              numeric(14,2),
  sum_label            text,                            -- "total_thb" / "amount_thb" / etc — what sum_thb sums

  -- Audit
  closed_at            timestamptz not null default now(),
  closed_by_admin_id   uuid references public.profiles(id),

  created_at           timestamptz not null default now()
);

-- One snapshot per (period, table) per close event — but a reopen +
-- re-close should append a NEW row, not overwrite (audit-trail
-- completeness). So no unique constraint — order by closed_at desc to
-- get the latest.
create index if not exists period_close_event_period_idx
  on public.period_close_event(period_yyyymm, closed_at desc);
create index if not exists period_close_event_table_idx
  on public.period_close_event(table_name);

-- 3) Freeze-check trigger function ---------------------------------------
-- Defensive helper: derive the yyyymm string of a timestamptz in Bangkok
-- timezone (the period boundary is BKK-local, not UTC — accounting works
-- in BKK calendar months).
create or replace function public.accounting_period_yyyymm_of(ts timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(ts at time zone 'Asia/Bangkok', 'YYYYMM');
$$;

comment on function public.accounting_period_yyyymm_of(timestamptz) is
  'V-E9 — BKK-local yyyymm string for a timestamptz. Used by accounting_period_freeze_check to bucket rows into periods.';

-- The trigger function — fires BEFORE UPDATE or DELETE on the protected
-- tables. Picks the table-appropriate "effective date" off OLD (the row
-- being mutated), maps it to a yyyymm, and checks accounting_periods
-- for a `closed` row. If closed → block.
create or replace function public.accounting_period_freeze_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eff_ts      timestamptz;
  v_yyyymm      text;
  v_is_closed   boolean;
begin
  -- Pick the table-appropriate effective timestamp. NULL fallback to
  -- created_at so a draft (issued_at IS NULL) doesn't silently bypass
  -- the freeze. Draft rows have no issued_at by definition, so they
  -- bucket by created_at — which for a brand-new draft is "today",
  -- so it won't fall in a closed past period anyway.
  if tg_table_name = 'tax_invoices' then
    v_eff_ts := coalesce(old.issued_at, old.created_at);
  elsif tg_table_name = 'freight_invoices' then
    v_eff_ts := coalesce(old.issued_at, old.created_at);
  elsif tg_table_name = 'freight_invoice_payments' then
    v_eff_ts := coalesce(old.paid_at, old.created_at);
  elsif tg_table_name = 'wallet_transactions' then
    v_eff_ts := old.created_at;
  else
    -- Shouldn't happen — we only attach to the 4 tables above. If a
    -- future migration attaches to another table, this default keeps
    -- the trigger safe rather than throwing on a missing branch.
    v_eff_ts := old.created_at;
  end if;

  if v_eff_ts is null then
    -- No effective date at all (shouldn't happen — created_at has a
    -- default). Allow the mutation rather than blocking arbitrarily.
    return coalesce(new, old);
  end if;

  v_yyyymm := public.accounting_period_yyyymm_of(v_eff_ts);

  select status = 'closed'
    into v_is_closed
    from public.accounting_periods
   where period_yyyymm = v_yyyymm;

  -- No accounting_periods row for this yyyymm → period was never opened
  -- → never closed → allow. (Pre-V-E9 history rows stay editable.)
  if v_is_closed is null or v_is_closed = false then
    return coalesce(new, old);
  end if;

  -- Period is closed. Block the mutation. Use a stable errcode so the
  -- app layer can detect it precisely without string-matching.
  raise exception
    'period_closed: % (% / %) belongs to closed accounting period %',
    tg_table_name, tg_op, old.id, v_yyyymm
    using errcode = 'P0001';
end;
$$;

comment on function public.accounting_period_freeze_check() is
  'V-E9 — BEFORE UPDATE/DELETE guard. Blocks mutations on financial-table rows whose effective date falls in a CLOSED accounting period. Attached to tax_invoices / freight_invoices / freight_invoice_payments / wallet_transactions.';

-- 4) Attach the trigger to each protected table -------------------------
-- BEFORE UPDATE OR DELETE — the trigger fires BEFORE the mutation lands,
-- so RAISE EXCEPTION rolls the whole statement back cleanly.

drop trigger if exists tax_invoices_period_freeze on public.tax_invoices;
create trigger tax_invoices_period_freeze
  before update or delete on public.tax_invoices
  for each row execute function public.accounting_period_freeze_check();

drop trigger if exists freight_invoices_period_freeze on public.freight_invoices;
create trigger freight_invoices_period_freeze
  before update or delete on public.freight_invoices
  for each row execute function public.accounting_period_freeze_check();

drop trigger if exists freight_invoice_payments_period_freeze on public.freight_invoice_payments;
create trigger freight_invoice_payments_period_freeze
  before update or delete on public.freight_invoice_payments
  for each row execute function public.accounting_period_freeze_check();

drop trigger if exists wallet_transactions_period_freeze on public.wallet_transactions;
create trigger wallet_transactions_period_freeze
  before update or delete on public.wallet_transactions
  for each row execute function public.accounting_period_freeze_check();

-- 5) RLS ----------------------------------------------------------------
alter table public.accounting_periods  enable row level security;
alter table public.period_close_event  enable row level security;

-- Customer reads NOTHING (these are admin-only financial control surfaces).
-- No SELECT policy for the public/anon role = default-deny.

-- Admin reads: super + accounting + ops (ops gets read-only context so
-- the UI can warn "งวดนี้ปิดแล้ว" mid-flow when an op is operating).
drop policy if exists accounting_periods_admin_read on public.accounting_periods;
create policy accounting_periods_admin_read
  on public.accounting_periods for select
  using (public.is_admin(array['super','accounting','ops']));

-- Admin writes: super + accounting only (ops cannot mutate the close
-- spine; that's a financial-control responsibility).
drop policy if exists accounting_periods_admin_write on public.accounting_periods;
create policy accounting_periods_admin_write
  on public.accounting_periods for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- period_close_event: mirror — admin read, super+accounting write.
drop policy if exists period_close_event_admin_read on public.period_close_event;
create policy period_close_event_admin_read
  on public.period_close_event for select
  using (public.is_admin(array['super','accounting','ops']));

drop policy if exists period_close_event_admin_write on public.period_close_event;
create policy period_close_event_admin_write
  on public.period_close_event for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- 6) Comments -----------------------------------------------------------
comment on table  public.accounting_periods is
  'V-E9 — one row per yyyymm (BKK calendar month). Status open → closing → closed. Once closed, the freeze trigger blocks UPDATE/DELETE on financial-table rows in that period.';
comment on column public.accounting_periods.period_yyyymm is
  'yyyymm string e.g. "202605" — sortable lex order, BKK calendar month boundary.';
comment on column public.accounting_periods.status is
  'open (mutable) → closing (admin signaled "preparing"; UI may warn but trigger still allows writes) → closed (trigger BLOCKS UPDATE/DELETE on tax_invoices / freight_invoices / freight_invoice_payments / wallet_transactions rows in this period).';
comment on column public.accounting_periods.reopened_reason is
  'Super-only emergency rollback reason (≥10 chars per CHECK). Audit-logged via admin_audit_log. The handoff brief: "rare + serious" — discourage with friction.';
comment on constraint accounting_periods_closed_has_metadata on public.accounting_periods is
  'A closed period MUST carry closed_at + closed_by_admin_id (audit-trail completeness — ADR-0014 pattern).';
comment on constraint accounting_periods_reopen_has_reason on public.accounting_periods is
  'A reopen MUST carry reason ≥10 chars + reopener (rare-but-serious emergency rollback per the spec).';

comment on table  public.period_close_event is
  'V-E9 — append-only ledger of per-table snapshots at close. One row per (period, table) per close event. Reopen + re-close appends NEW rows (never deletes — historical audit trail).';
comment on column public.period_close_event.sum_thb is
  'Headline THB sum at close. NULL when the table has no THB-summable column. See sum_label for what column was summed.';
comment on column public.period_close_event.sum_label is
  'Column name that sum_thb summed — varies per table (e.g. "total_thb" for tax_invoices, "amount_thb" for freight_invoice_payments).';

comment on trigger tax_invoices_period_freeze on public.tax_invoices is
  'V-E9 — blocks UPDATE/DELETE on tax invoices whose issued_at falls in a closed accounting period.';
comment on trigger freight_invoices_period_freeze on public.freight_invoices is
  'V-E9 — blocks UPDATE/DELETE on freight invoices whose issued_at falls in a closed accounting period.';
comment on trigger freight_invoice_payments_period_freeze on public.freight_invoice_payments is
  'V-E9 — blocks UPDATE/DELETE on freight invoice payments whose paid_at falls in a closed accounting period.';
comment on trigger wallet_transactions_period_freeze on public.wallet_transactions is
  'V-E9 — blocks UPDATE/DELETE on wallet transactions whose created_at falls in a closed accounting period.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0057_customs_declarations.sql                                  ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- V-E11 · customs_declarations + customs_declaration_lines
-- ════════════════════════════════════════════════════════════
-- Per [docs/port-specs/freight-customs-declaration.md].
--
-- Internal-only V2 — admin draws the ใบขนสินค้า (Thai customs
-- declaration form) from a freight shipment, prints PDF + exports
-- structured JSON for later upload to NetBay / Customs Trader Portal
-- (Phase III: U3-1 / U3-2 — DPX ERP integration).
--
-- Status workflow:
--   draft → submitted → accepted → released
--                    ↘ cancelled (terminal — any non-released)
--
--   - draft     : header + lines mutable
--   - submitted : admin walked it into the customs office (locked)
--   - accepted  : customs accepted entry (control no may be set)
--   - released  : goods released from customs
--   - cancelled : with reason; new declaration may be issued
--
-- Re-issuance: partial unique on freight_shipment_id allows a new
-- declaration once the previous one is cancelled (mirror freight_
-- invoices "one issued per shipment" rule).
--
-- Pre-V3 deferrals (per spec):
--   - NetBay / Customs Trader Portal upload (Phase III)
--   - Auto-seed lines from freight_invoice_lines + hs_codes — V1
--     creates lines manually; V2 of THIS feature could add the seed
--   - Multi-currency declared values (V1 = THB only)
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════

-- 1) Daily declaration_no serial counter -----------------------------------
-- CD-{YYMMDD}-{NNNN}. Daily reset (Bangkok TZ). Distinct from
--   FI{YYMMDD}-{NNNN} (freight_invoices)
--   A{YY}{NNNNN}      (freight_shipments)
create table if not exists public.customs_declaration_seq (
  period_yymmdd  text primary key,
  next_seq       int  not null default 1,
  updated_at     timestamptz not null default now()
);

-- 2) customs_declarations -------------------------------------------------
create table if not exists public.customs_declarations (
  id                       uuid primary key default gen_random_uuid(),
  declaration_no           text unique,                              -- CD-{YYMMDD}-{NNNN} (null while draft)

  freight_shipment_id      uuid not null references public.freight_shipments(id) on delete restrict,

  status                   text not null default 'draft'
                             check (status in ('draft', 'submitted', 'accepted', 'released', 'cancelled')),

  declaration_type         text not null
                             check (declaration_type in ('import', 'export', 'transit')),

  -- Lifecycle timestamps
  declared_at              timestamptz,                              -- when admin drafted + readied for submission
  submitted_at             timestamptz,                              -- when admin filed at customs office
  accepted_at              timestamptz,                              -- when customs accepted entry
  released_at              timestamptz,                              -- when goods released
  cancelled_at             timestamptz,
  cancelled_reason         text,

  -- Customs / broker info
  customs_office           text,                                     -- e.g. BANGKOK_PORT_CUSTOMS_HOUSE / LAEM_CHABANG_CUSTOMS_HOUSE / MUKDAHAN_CUSTOMS_BORDER
  broker_name              text,                                     -- free-text broker name
  broker_license_no        text,                                     -- broker's customs license
  customs_control_no       text,                                     -- the real Thai Customs control no (broker fills after submission)
  ship_or_truck_arrival_date date,                                   -- arrival of vessel / truck
  port_of_entry            text,                                     -- e.g. "Bangkok Port", "Laem Chabang Terminal B3"

  -- Money totals (THB only V1)
  total_declared_value_thb  numeric(14,2) check (total_declared_value_thb >= 0  and total_declared_value_thb  <= 999999999.99),
  total_duty_thb            numeric(14,2) check (total_duty_thb           >= 0  and total_duty_thb           <= 999999999.99),
  total_vat_thb             numeric(14,2) check (total_vat_thb            >= 0  and total_vat_thb            <= 999999999.99),
  total_other_taxes_thb     numeric(14,2) default 0 check (total_other_taxes_thb >= 0 and total_other_taxes_thb <= 999999999.99),

  -- Payment channel hint (PromptPay for duty/VAT is increasingly common)
  paid_through_promptpay   boolean not null default false,

  notes                    text,

  -- Audit
  created_by_admin_id      uuid references public.profiles(id),
  updated_by_admin_id      uuid references public.profiles(id),
  submitted_by_admin_id    uuid references public.profiles(id),
  accepted_by_admin_id     uuid references public.profiles(id),
  released_by_admin_id     uuid references public.profiles(id),
  cancelled_by_admin_id    uuid references public.profiles(id),

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- Status / metadata consistency constraints
  constraint customs_declarations_submitted_consistent check (
    status not in ('submitted','accepted','released')
    or (declaration_no is not null and submitted_at is not null and submitted_by_admin_id is not null)
  ),
  constraint customs_declarations_accepted_consistent check (
    status not in ('accepted','released')
    or (accepted_at is not null and accepted_by_admin_id is not null)
  ),
  constraint customs_declarations_released_consistent check (
    status <> 'released'
    or (released_at is not null and released_by_admin_id is not null)
  ),
  constraint customs_declarations_cancelled_has_reason check (
    status <> 'cancelled'
    or (cancelled_reason is not null and cancelled_at is not null and cancelled_by_admin_id is not null)
  )
);

-- Indexes -------------------------------------------------------------
create index if not exists customs_declarations_shipment_idx
  on public.customs_declarations(freight_shipment_id);
create index if not exists customs_declarations_status_created_idx
  on public.customs_declarations(status, created_at desc);
create index if not exists customs_declarations_declaration_no_idx
  on public.customs_declarations(declaration_no) where declaration_no is not null;
create index if not exists customs_declarations_control_no_idx
  on public.customs_declarations(customs_control_no) where customs_control_no is not null;

-- ADR-0016 mirror — at most one ACTIVE (non-cancelled) declaration per
-- shipment at any time. Re-issuance allowed after cancel.
create unique index if not exists customs_declarations_one_active_per_shipment
  on public.customs_declarations(freight_shipment_id)
  where status <> 'cancelled';

drop trigger if exists customs_declarations_updated_at_trigger on public.customs_declarations;
create trigger customs_declarations_updated_at_trigger
  before update on public.customs_declarations
  for each row execute function public.set_updated_at();

-- 3) customs_declaration_lines ----------------------------------------
create table if not exists public.customs_declaration_lines (
  id                          uuid primary key default gen_random_uuid(),
  declaration_id              uuid not null references public.customs_declarations(id) on delete cascade,
  position                    smallint not null default 1,

  hs_code                     text references public.hs_codes(code) on delete restrict,
  description                 text not null,
  country_of_origin           text default 'CN',                     -- ISO 2-letter
  qty                         numeric(14,3) not null default 0 check (qty >= 0),
  unit                        text not null default 'PCS',
  gross_weight_kg             numeric(14,3) check (gross_weight_kg >= 0 and gross_weight_kg <= 9999999.999),
  net_weight_kg               numeric(14,3) check (net_weight_kg   >= 0 and net_weight_kg   <= 9999999.999),
  declared_value_thb          numeric(14,2) not null default 0 check (declared_value_thb >= 0 and declared_value_thb <= 999999999.99),
  duty_rate_pct               numeric(6,3)  default 0 check (duty_rate_pct >= 0 and duty_rate_pct <= 100),
  duty_thb                    numeric(14,2) default 0 check (duty_thb      >= 0 and duty_thb      <= 999999999.99),
  vat_thb                     numeric(14,2) default 0 check (vat_thb       >= 0 and vat_thb       <= 999999999.99),
  fta_applied                 boolean not null default false,        -- Form E or other FTA preference used
  notes                       text,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create unique index if not exists customs_declaration_lines_decl_pos_uidx
  on public.customs_declaration_lines(declaration_id, position);
create index if not exists customs_declaration_lines_hs_code_idx
  on public.customs_declaration_lines(hs_code) where hs_code is not null;

drop trigger if exists customs_declaration_lines_updated_at_trigger on public.customs_declaration_lines;
create trigger customs_declaration_lines_updated_at_trigger
  before update on public.customs_declaration_lines
  for each row execute function public.set_updated_at();

-- 4) Atomic declaration_no generator ----------------------------------
-- CD-{YYMMDD}-{NNNN} with daily reset (Bangkok TZ).
create or replace function public.next_customs_declaration_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yymmdd text := to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD');
  seq    int;
begin
  insert into public.customs_declaration_seq (period_yymmdd, next_seq)
    values (yymmdd, 2)
    on conflict (period_yymmdd) do update
      set next_seq   = customs_declaration_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'CD-' || yymmdd || '-' || lpad(seq::text, 4, '0');
end;
$$;

revoke all     on function public.next_customs_declaration_no() from public, authenticated, anon;
grant  execute on function public.next_customs_declaration_no() to service_role;

-- 5) RLS ---------------------------------------------------------------
alter table public.customs_declarations       enable row level security;
alter table public.customs_declaration_lines  enable row level security;
alter table public.customs_declaration_seq    enable row level security;

-- Customer reads OWN declaration once it's at least submitted (matches
-- spec — customer never sees a draft).
drop policy if exists customs_declarations_customer_read on public.customs_declarations;
create policy customs_declarations_customer_read
  on public.customs_declarations for select
  using (
    exists (
      select 1 from public.freight_shipments s
       where s.id = customs_declarations.freight_shipment_id
         and s.profile_id = auth.uid()
    )
    and status in ('submitted','accepted','released')
  );

-- Admin (super + accounting): full read+write.
-- W-1 keystone: array['super','accounting'] explicit per role rule.
drop policy if exists customs_declarations_admin_all on public.customs_declarations;
create policy customs_declarations_admin_all
  on public.customs_declarations for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- Lines: inherit visibility from parent declaration (customer read gated
-- on same submitted+ rule).
drop policy if exists customs_declaration_lines_customer_read on public.customs_declaration_lines;
create policy customs_declaration_lines_customer_read
  on public.customs_declaration_lines for select
  using (
    exists (
      select 1
        from public.customs_declarations cd
        join public.freight_shipments    s on s.id = cd.freight_shipment_id
       where cd.id = customs_declaration_lines.declaration_id
         and s.profile_id = auth.uid()
         and cd.status in ('submitted','accepted','released')
    )
  );

drop policy if exists customs_declaration_lines_admin_all on public.customs_declaration_lines;
create policy customs_declaration_lines_admin_all
  on public.customs_declaration_lines for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

drop policy if exists customs_declaration_seq_admin_all on public.customs_declaration_seq;
create policy customs_declaration_seq_admin_all
  on public.customs_declaration_seq for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- 6) Comments ---------------------------------------------------------
comment on table  public.customs_declarations is
  'V-E11 — Thai customs declaration (ใบขนสินค้า) for a freight shipment. Internal-only V2; admin manually drafts + files at the customs office. NetBay / Customs Trader Portal API integration deferred to Phase III (U3-1 / U3-2).';
comment on column public.customs_declarations.declaration_no is
  'Pacred internal CD-{YYMMDD}-{NNNN}. NOT the real Thai Customs control number — see customs_control_no.';
comment on column public.customs_declarations.customs_control_no is
  'Real Thai Customs control number returned after acceptance (broker fills it in).';
comment on column public.customs_declarations.status is
  'draft → submitted → accepted → released. Cancellation possible at any non-released stage with reason.';
comment on index  public.customs_declarations_one_active_per_shipment is
  'At most one active (non-cancelled) declaration per freight shipment. Re-issuance allowed after cancel.';

comment on table  public.customs_declaration_lines is
  'Per HS-code line. declared_value_thb + duty_rate_pct + duty/VAT snapshot at draft time (V1 — admin can edit until submission).';

comment on function public.next_customs_declaration_no is
  'Atomic CD-{YYMMDD}-{NNNN} declaration_no generator. Daily counter reset (Bangkok TZ). Concurrent calls serialise on upsert lock.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0058_refund_requests.sql                                       ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0059_container_unify.sql                                       ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- U1-1 · Container unify (cargo_containers canonical)
-- ════════════════════════════════════════════════════════════
-- Per UPGRADE_PLAN §1 U1-1 ("Unify the two container tables — pick
-- cargo_containers canonical, migrate legacy containers, repoint
-- forwarders.container_id, redirect /admin/containers — the rest
-- of U1 (and R-1) inherits a split if this is not first").
--
-- Background — the rename collision was fixed at commit `bf7acf8`
-- but the unify itself was deferred. We have two coexisting tables:
--
--   public.containers        (0016 phase-H) — vendor / vessel /
--                            carrier / cost_thb / 7-state legacy
--                            status enum; FK targets:
--                              forwarders.container_id
--                              service_orders.container_id
--
--   public.cargo_containers  (0033 spine + 0040 carrier no + 0042
--                            close_at) — code / transport_mode /
--                            origin / destination / 6-state spine
--                            status; FK targets:
--                              cargo_shipments.cargo_container_id
--
-- This migration:
--   1. Adds backward-compat columns to cargo_containers so legacy
--      ops fields survive (vessel, carrier, vendor_container_id,
--      cost_thb, note, cleared_at, delivered_at, cancelled_at,
--      legacy_container_id).
--   2. Backfills rows from `containers` → `cargo_containers` that
--      have not yet been mirrored (idempotent — keyed on
--      legacy_container_id).
--   3. Adds `cargo_container_id` to forwarders + service_orders
--      (FK → cargo_containers) and backfills via the legacy mapping.
--   4. KEEPS the legacy `containers` table + old `container_id`
--      columns in place — read-only safety net + rollback path.
--      Drop will land in a later cleanup migration once all
--      readers are repointed (tracked in PORT_PLAN U1-1 follow-up).
--
-- All steps idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════

-- ── 1) Backward-compat columns on cargo_containers ─────────────────

alter table public.cargo_containers
  add column if not exists legacy_container_id   uuid,
  add column if not exists legacy_container_no   text,
  add column if not exists vessel                text,
  add column if not exists carrier               text,
  add column if not exists vendor_container_id   text,
  add column if not exists cost_thb              numeric(12,2),
  add column if not exists note                  text,
  add column if not exists cleared_at            timestamptz,
  add column if not exists delivered_at          timestamptz,
  add column if not exists cancelled_at          timestamptz;

-- Unique constraint on legacy_container_id (backfill key).
-- Partial unique → many NULLs allowed (spine-native rows have no legacy id).
create unique index if not exists cargo_containers_legacy_container_id_uk
  on public.cargo_containers(legacy_container_id)
  where legacy_container_id is not null;

comment on column public.cargo_containers.legacy_container_id is
  'U1-1: original public.containers.id this row was mirrored from. NULL for spine-native rows. Provides the join key from forwarders.container_id (legacy) to cargo_containers.id (canonical) during the transition.';
comment on column public.cargo_containers.legacy_container_no is
  'U1-1: original public.containers.container_no (e.g. CN-260513-01). Preserved for staff search + audit trail. New rows leave NULL.';
comment on column public.cargo_containers.vessel is
  'U1-1: ship / truck name from legacy ops tracking. Optional metadata. NULL on spine-native rows.';
comment on column public.cargo_containers.carrier is
  'U1-1: carrier company (Maersk / COSCO / JMF / etc.) from legacy ops tracking. Distinct from cargo_containers.source — that flags the data source (pacred/momo/self), this names the physical carrier.';
comment on column public.cargo_containers.vendor_container_id is
  'U1-1: shipping line''s container number from legacy ops tracking. Now superseded by carrier_container_no (V-D3, B/L number); kept for backfill compatibility. New rows should write to carrier_container_no only.';
comment on column public.cargo_containers.cost_thb is
  'U1-1: admin-internal cost from carrier (legacy ops field). Optional. Drives margin calc on container detail page.';
comment on column public.cargo_containers.cleared_at is
  'U1-1: customs-cleared timestamp from legacy 0016 status flow. Spine maps the legacy "cleared_customs" status onto "arrived" + this timestamp; readers can detect "cleared but not unloaded" via this column.';
comment on column public.cargo_containers.delivered_at is
  'U1-1: container-level delivery timestamp from legacy 0016 status flow. Spine maps legacy "delivered" onto "closed" + this timestamp.';
comment on column public.cargo_containers.cancelled_at is
  'U1-1: container-level cancellation timestamp from legacy 0016 status flow. Spine has no cancelled status; mapped to "closed" + this timestamp. Readers should treat closed-with-cancelled_at-set as cancelled.';

-- ── 2) Backfill cargo_containers from legacy containers ─────────────

-- Status mapping helper inlined as CASE:
--   preparing       → packing
--   sealed          → sealed
--   in_transit      → in_transit
--   arrived_port    → arrived
--   cleared_customs → arrived  (+ cleared_at)
--   delivered       → closed   (+ delivered_at)
--   cancelled       → closed   (+ cancelled_at)
--
-- Transport mapping: truck → truck, ship → sea, air → air
-- Origin mapping: guangzhou → 'CN-GZ', yiwu → 'CN-YW', other → 'CN-XX'
-- Destination: default 'TH-BKK' (legacy didn't store this).
--
-- code = container_no (CN-YYMMDD-N format won't clash with spine
-- GZE/GZS codes). Where container_no IS NULL on legacy (rare,
-- pre-trigger rows), generate "LEGACY-{id-prefix}".

insert into public.cargo_containers (
  id, code, transport_mode, origin, destination, status,
  packed_at, sealed_at, eta, actual_arrival, source,
  total_weight_kg, total_cbm,
  legacy_container_id, legacy_container_no, vessel, carrier,
  vendor_container_id, cost_thb, note,
  cleared_at, delivered_at, cancelled_at,
  created_at, updated_at
)
select
  gen_random_uuid(),
  coalesce(c.container_no, 'LEGACY-' || substr(c.id::text, 1, 8)),
  case c.transport_type
    when 'truck' then 'truck'
    when 'ship'  then 'sea'
    when 'air'   then 'air'
    else 'truck'
  end,
  case c.origin_warehouse
    when 'guangzhou' then 'CN-GZ'
    when 'yiwu'      then 'CN-YW'
    else 'CN-XX'
  end,
  'TH-BKK',
  case c.status
    when 'preparing'       then 'packing'
    when 'sealed'          then 'sealed'
    when 'in_transit'      then 'in_transit'
    when 'arrived_port'    then 'arrived'
    when 'cleared_customs' then 'arrived'
    when 'delivered'       then 'closed'
    when 'cancelled'       then 'closed'
    else                        'packing'
  end,
  null,                                 -- packed_at — legacy didn't track
  c.date_sealed,
  c.eta,
  c.date_arrived_port,
  'pacred',                              -- legacy data was Pacred-managed
  coalesce(c.total_weight_kg, 0),
  coalesce(c.total_volume_cbm, 0),
  c.id,                                  -- legacy_container_id
  c.container_no,                        -- legacy_container_no
  c.vessel,
  c.carrier,
  c.vendor_container_id,
  c.cost_thb,
  c.note,
  c.date_cleared,                        -- cleared_at
  c.date_delivered,                      -- delivered_at
  case when c.status = 'cancelled' then c.updated_at else null end,
  c.created_at,
  c.updated_at
from public.containers c
where not exists (
  select 1 from public.cargo_containers cc
   where cc.legacy_container_id = c.id
);

-- Also handle code-collision case: if a legacy CN- code happens to
-- coincide with an existing spine code (unlikely but possible), the
-- insert above would have failed via cargo_containers.code unique
-- constraint. The WHERE NOT EXISTS handles the legacy_container_id
-- side; if code collision still bites, the insert raises — caller
-- (this migration) errors out loud rather than silently dropping
-- rows. Acceptable: collisions are detectable via Supabase logs and
-- the few-row legacy table can be hand-fixed.

-- ── 3) New FK column on forwarders ──────────────────────────────────

alter table public.forwarders
  add column if not exists cargo_container_id uuid
  references public.cargo_containers(id) on delete set null;

create index if not exists forwarders_cargo_container_idx
  on public.forwarders(cargo_container_id) where cargo_container_id is not null;

comment on column public.forwarders.cargo_container_id is
  'U1-1: canonical FK into cargo_containers (spine). Backfilled from legacy forwarders.container_id via the cargo_containers.legacy_container_id mapping. New writes should target this column only; legacy container_id retained read-only for rollback safety.';

update public.forwarders f
   set cargo_container_id = cc.id
  from public.cargo_containers cc
 where cc.legacy_container_id = f.container_id
   and f.container_id        is not null
   and f.cargo_container_id  is null;

-- ── 4) New FK column on service_orders ──────────────────────────────

alter table public.service_orders
  add column if not exists cargo_container_id uuid
  references public.cargo_containers(id) on delete set null;

create index if not exists service_orders_cargo_container_idx
  on public.service_orders(cargo_container_id) where cargo_container_id is not null;

comment on column public.service_orders.cargo_container_id is
  'U1-1: canonical FK into cargo_containers (spine). Backfilled from legacy service_orders.container_id via the cargo_containers.legacy_container_id mapping. New writes should target this column only; legacy container_id retained read-only for rollback safety.';

update public.service_orders so
   set cargo_container_id = cc.id
  from public.cargo_containers cc
 where cc.legacy_container_id = so.container_id
   and so.container_id        is not null
   and so.cargo_container_id  is null;

-- ── 5) Legacy table deprecation comment ─────────────────────────────

comment on table public.containers is
  'DEPRECATED (U1-1, 2026-05-17): legacy 0016 phase-H container ops table. Rows mirrored into public.cargo_containers (canonical) via the U1-1 backfill. Kept read-only as rollback safety + audit trail until /admin/containers UI is fully sunset. Do not INSERT/UPDATE new rows here — write to cargo_containers instead. Future cleanup migration will drop this table once all readers are repointed.';

-- ── 6) Verify (counts) ─────────────────────────────────────────────

do $$
declare
  legacy_count           int;
  mirrored_count         int;
  forwarder_repoint_diff int;
  so_repoint_diff        int;
begin
  select count(*) into legacy_count   from public.containers;
  select count(*) into mirrored_count from public.cargo_containers where legacy_container_id is not null;

  if legacy_count <> mirrored_count then
    raise warning 'U1-1 backfill skipped some legacy containers — legacy=% mirrored=%',
      legacy_count, mirrored_count;
  else
    raise notice 'U1-1 backfill OK — % legacy container(s) mirrored', legacy_count;
  end if;

  select count(*) into forwarder_repoint_diff
    from public.forwarders
   where container_id is not null
     and cargo_container_id is null;
  if forwarder_repoint_diff > 0 then
    raise warning 'U1-1 % forwarder(s) have container_id but no cargo_container_id — broken mapping?', forwarder_repoint_diff;
  end if;

  select count(*) into so_repoint_diff
    from public.service_orders
   where container_id is not null
     and cargo_container_id is null;
  if so_repoint_diff > 0 then
    raise warning 'U1-1 % service_order(s) have container_id but no cargo_container_id — broken mapping?', so_repoint_diff;
  end if;
end$$;


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0060_member_code_3digit.sql                                    ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- 0060_member_code_3digit.sql
-- Member code pattern change: PR00001 (5-digit fixed) → PR001 (min-3-digit).
--
-- Numbered 0060 — clear of ภูม's fast-moving Phase-I2 migration block
-- (0044-005x). This migration is independent (only the generate_member_code
-- function + a profiles backfill), so apply-order does not matter; the gap
-- between 0048 and 0060 is harmless (migrations apply in sorted version order).
--
-- Per ลูกพี่ 2026-05-17: รหัสลูกค้าต้องเป็นแพทเทิน PR001 — ขั้นต่ำ 3 หลัก,
-- รันต่อไปเรื่อย ๆ ได้, เกินหลักร้อย (PR1000, PR12345) ก็รันได้ปกติ ห้ามเออเร่อ.
--
-- `lpad(n, 3, '0')` pads to a MINIMUM of 3 chars and NEVER truncates — so:
--   n=1     → '001'   → PR001
--   n=42    → '042'   → PR042
--   n=999   → '999'   → PR999
--   n=1000  → '1000'  → PR1000   (already ≥3 chars, lpad leaves it alone)
--   n=12345 → '12345' → PR12345
-- The running counter (member_code_seq) is unbounded — no overflow, no error.
--
-- Idempotent: re-running `create or replace` + the backfill is safe.

-- 1) Generator function — lpad 5 → 3 -----------------------------------------
create or replace function public.generate_member_code() returns trigger as $$
begin
  if new.member_code is null then
    new.member_code := 'PR' || lpad(nextval('public.member_code_seq')::text, 3, '0');
  end if;
  return new;
end;
$$ language plpgsql;

-- 2) Backfill existing rows to the new padding --------------------------------
-- The running NUMBER is preserved; only the zero-padding changes.
--   PR00001 → PR001 · PR00042 → PR042 · PR01000 → PR1000
-- `substring(member_code from 3)` drops the 'PR' prefix; `::int` strips the
-- leading zeros (so '00001' → 1); re-`lpad`-ed to the new 3-min pattern.
-- The `~ '^PR\d+$'` guard skips any non-standard codes. member_code is
-- `unique` but the underlying numbers stay unique, so no collision.
-- (member_code is not referenced as a foreign key anywhere — verified — so
--  rewriting it does not orphan any row.)
update public.profiles
set member_code = 'PR' || lpad((substring(member_code from 3))::int::text, 3, '0')
where member_code ~ '^PR\d+$';

-- 3) member_code_seq is untouched — `nextval` continues from its current
--    value, so the next signup picks up right after the existing rows.


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0061_money_idempotency_guards.sql                              ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- 0061 · Money idempotency guards — P0-1 + P1-2 + P1-4
-- ════════════════════════════════════════════════════════════
-- Pre-launch money audit [docs/research/audit-money-billing-2026-05-17.md].
-- Three independent, idempotent, RLS-neutral changes. Zero data
-- migration. Safe to apply on prod live.
--
-- ── P0-1 — cost-adjustment tx poisons the main-payment idempotency ──
-- `adminMarkCostAdjustmentPaid` (actions/admin/forwarder-cost-adjustments.ts)
-- wrote a wallet_transactions row with the tuple
--   (kind='import_payment', reference_type='forwarder', reference_id=f_no,
--    status='completed')
-- — IDENTICAL to the tuple `payForwarderFromWallet` + `adminMarkForwarderPaid`
-- query for their check-then-act idempotency. A paid cost adjustment made the
-- main forwarder payment conclude `already_paid` and SKIP the big debit →
-- Pacred ships the import having collected only the small fee.
--
-- Fix: give cost adjustments their own `kind` value ('cost_adjustment').
-- This migration extends the wallet_transactions.kind CHECK to allow it; the
-- action is updated to write kind='cost_adjustment'. The idempotency SELECTs
-- in both callers filter `.eq("kind","import_payment")` → they can no longer
-- match a cost-adjustment row.
--
-- Also adds a 0049-style partial-unique index on the forwarder main-payment
-- slice — once `kind` disambiguates it, ≤1 completed import_payment per
-- forwarder is enforced at the DB level (the actions catch 23505 + re-SELECT).
--
-- ── P1-2 — recordFreightPayment has no double-submit guard ──
-- An admin double-click / form re-POST inserts the same freight payment
-- twice → invoice flips to overpaid. Mirror of the F-11 fix (0049): add a
-- partial-unique index on (freight_invoice_id, bank_ref) for the recorded
-- slice; the action catches 23505.
--
-- ── P1-4 — requestTaxInvoice can create duplicate pending invoices ──
-- Concurrent requests both pass the check-then-act SELECT → two pending
-- tax_invoices for one order → RD Code 86 numbering risk if both issue.
-- Mirror of withholding_tax_entries (0044): one non-cancelled invoice per
-- order_h_no / forwarder_f_no, enforced via partial-unique index.
-- ════════════════════════════════════════════════════════════

-- ── P0-1 (a) — extend wallet_transactions.kind CHECK with 'cost_adjustment' ──
-- The CHECK was created inline in 0007 → Postgres auto-named it
-- `wallet_transactions_kind_check`. Drop + recreate with the extra value.
-- Idempotent: drop-if-exists, and the new constraint is a strict superset
-- so re-applying never rejects existing rows.
alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_kind_check;

alter table public.wallet_transactions
  add constraint wallet_transactions_kind_check check (kind in (
    'deposit','withdraw','refund','adjustment',
    'order_payment','order_top_up',
    'import_payment','import_top_up',
    'yuan_payment',
    'cashback_earn','cashback_redeem',
    'cost_adjustment'
  ));

comment on constraint wallet_transactions_kind_check on public.wallet_transactions is
  '0061 — extends 0007 with cost_adjustment (P0-1: forwarder post-delivery cost adjustments get their own kind so they no longer poison the main import_payment idempotency check).';

-- ── P0-1 (b) — partial-unique guard on the forwarder main-payment slice ──
-- Mirrors wallet_tx_order_payment_uniq (0049) but for the forwarder side.
-- After P0-1 (a), cost adjustments use kind='cost_adjustment' so they fall
-- OUTSIDE this slice — the index constrains only the genuine main payment.
create unique index if not exists wallet_tx_import_payment_uniq
  on public.wallet_transactions (reference_id)
  where reference_type = 'forwarder'
    and kind           = 'import_payment'
    and status         = 'completed';

comment on index public.wallet_tx_import_payment_uniq is
  '0061/P0-1 — DB guard against double-debit on forwarder pay-from-wallet. Partial unique on completed import_payment per forwarder f_no. payForwarderFromWallet + adminMarkForwarderPaid catch 23505 + re-SELECT for idempotent retry. Cost adjustments use kind=cost_adjustment so they are excluded.';

-- ── P1-2 — partial-unique guard against freight-payment double-submit ──
-- One bank_ref records a freight payment once. NULL bank_ref rows (cash /
-- wallet entries with no transfer ref) are excluded — the partial WHERE
-- skips them so they are never blocked.
create unique index if not exists freight_payment_bank_ref_uniq
  on public.freight_invoice_payments (freight_invoice_id, bank_ref)
  where status = 'recorded' and bank_ref is not null;

comment on index public.freight_payment_bank_ref_uniq is
  '0061/P1-2 — DB guard against double-recording a freight invoice payment. Partial unique on (freight_invoice_id, bank_ref) for the recorded slice. recordFreightPayment catches 23505. Cash/wallet rows with NULL bank_ref are excluded.';

-- ── P1-4 — one non-cancelled tax invoice per order / forwarder ──
-- Mirrors wht_one_per_order_uidx / wht_one_per_forwarder_uidx (0044).
-- Cancelled invoices are excluded so a customer can re-request after a
-- cancellation. requestTaxInvoice catches 23505 + re-SELECTs idempotently.
create unique index if not exists tax_invoice_one_per_order_uidx
  on public.tax_invoices (order_h_no)
  where order_h_no is not null and status <> 'cancelled';

create unique index if not exists tax_invoice_one_per_forwarder_uidx
  on public.tax_invoices (forwarder_f_no)
  where forwarder_f_no is not null and status <> 'cancelled';

comment on index public.tax_invoice_one_per_order_uidx is
  '0061/P1-4 — at most one non-cancelled tax invoice per service-order h_no (RD Code 86 numbering safety). requestTaxInvoice catches 23505 + re-SELECTs.';
comment on index public.tax_invoice_one_per_forwarder_uidx is
  '0061/P1-4 — at most one non-cancelled tax invoice per forwarder f_no (RD Code 86 numbering safety). requestTaxInvoice catches 23505 + re-SELECTs.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0062_rls_role_pin_money_pii.sql                                ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- 0062 · W-1 SECURITY KEYSTONE — role-pin money/PII/order RLS
-- ════════════════════════════════════════════════════════════
-- Source: docs/research/PACRED-MASTER-STRATEGY.md §1 (Fix A) +
--         docs/research/gap-schema-security.md S-1 / G-6.
--
-- ── THE HOLE (S-1) ──────────────────────────────────────────
-- Migration 0033 extended admins.role with two LOW-TRUST roles
-- ('warehouse', 'driver') — scan staff + truck drivers. But every
-- admin-write override in 0015_admin_rbac.sql is
--   for all using (public.is_admin()) with check (public.is_admin())
-- — BARE is_admin(), no role array. is_admin(null) returns true for
-- ANY active admin. So a 'driver'/'warehouse' login, hitting PostgREST
-- directly with its own anon-key JWT (no server action needed), can:
--   • UPDATE public.wallet SET balance = 9999999  (any customer)
--   • INSERT public.wallet_transactions (kind='adjustment',
--     status='completed') → credit itself unlimited money
--   • flip any service_orders / forwarders to 'completed'
--   • rewrite any profiles row (another user's tax_id, credit_limit,
--     sales_admin_id) + read every customer's PII.
-- The app-layer requireAdmin(["ops"]) page guards are irrelevant —
-- the attacker never touches the actions; RLS is the only gate, and
-- bare is_admin() says yes.
--
-- ── THE FIX (S-1 Fix A) ─────────────────────────────────────
-- Every *_admin_all / admin-write policy on a money / PII / order /
-- pricing table is re-pinned to an explicit role array:
--   money       → array['super','accounting','ops']
--   orders      → array['super','ops','accounting']
--   PII         → array['super','ops','accounting','sales_admin']
--   sales money → array['super','accounting','sales_admin']
--   pricing cfg → array['super','ops','accounting']
-- 'super' is always implicitly included by is_admin() itself (the
-- helper short-circuits `role = 'super'`), so the arrays need not
-- list it — but we list it anyway for grep-ability / intent clarity.
--
-- warehouse/driver KEEP access only where they genuinely need it —
-- the cargo_* spine (0033) and legacy `containers` ops tracking — so
-- those policies are NOT locked out here. Migration 0033's cargo_*
-- policies are already correctly role-pinned and untouched.
--
-- Later migrations (0034 tax_invoices, 0036 carriers, 0038 cost-adj,
-- 0044 WHT, 0045-0052 freight) ALREADY role-pin their admin policies
-- — verified, nothing to fix there.
--
-- ── BACKSTOP (G-6) ──────────────────────────────────────────
-- §3 below adds a DB-level trigger that logs every INSERT/UPDATE on
-- wallet_transactions to admin_audit_log — so even the direct-PostgREST
-- exploit path above leaves an attribution row. logAdminAction() in
-- actions/admin/* structurally cannot catch a non-action write.
--
-- Idempotent: every policy is drop-if-exists + recreate; the trigger
-- is drop-if-exists + recreate; the function is create-or-replace.
-- RLS-aware: only re-pins existing policies, adds no new grants, never
-- widens access. Safe to apply on prod live, zero data migration.
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- 1. Role-pin the bare is_admin() policies from 0015 + 0016 + 0030
-- ════════════════════════════════════════════════════════════
-- Each block: drop the bare-is_admin() policy, recreate role-pinned.
-- The customer self-owned policies on each table are NOT touched —
-- PostgREST OR-combines same-action policies, so customers keep their
-- own-row access and admins get the (now role-gated) override.

-- ── PII tables — profiles / corporate / addresses ──
-- super + ops (operations need customer records) + accounting
-- (billing) + sales_admin (rep assignment). NOT warehouse/driver.
drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all
  using      (public.is_admin(array['super','ops','accounting','sales_admin']))
  with check (public.is_admin(array['super','ops','accounting','sales_admin']));

drop policy if exists "corporate_admin_all" on public.corporate;
create policy "corporate_admin_all" on public.corporate
  for all
  using      (public.is_admin(array['super','ops','accounting','sales_admin']))
  with check (public.is_admin(array['super','ops','accounting','sales_admin']));

drop policy if exists "addresses_admin_all" on public.addresses;
create policy "addresses_admin_all" on public.addresses
  for all
  using      (public.is_admin(array['super','ops','accounting','sales_admin']))
  with check (public.is_admin(array['super','ops','accounting','sales_admin']));

-- ── Money tables — wallet / wallet_transactions / yuan_payments ──
-- super + accounting + ops. NOT warehouse/driver/sales_admin.
-- This is the keystone — it closes the "driver credits its own
-- wallet via PostgREST" exploit.
drop policy if exists "wallet_admin_all" on public.wallet;
create policy "wallet_admin_all" on public.wallet
  for all
  using      (public.is_admin(array['super','accounting','ops']))
  with check (public.is_admin(array['super','accounting','ops']));

drop policy if exists "wallet_tx_admin_all" on public.wallet_transactions;
create policy "wallet_tx_admin_all" on public.wallet_transactions
  for all
  using      (public.is_admin(array['super','accounting','ops']))
  with check (public.is_admin(array['super','accounting','ops']));

drop policy if exists "yuan_payments_admin_all" on public.yuan_payments;
create policy "yuan_payments_admin_all" on public.yuan_payments
  for all
  using      (public.is_admin(array['super','accounting','ops']))
  with check (public.is_admin(array['super','accounting','ops']));

-- ── Order tables — forwarders + items/images/status_log ──
-- super + ops (run the orders) + accounting (bill them).
drop policy if exists "forwarders_admin_all" on public.forwarders;
create policy "forwarders_admin_all" on public.forwarders
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "forwarder_items_admin_all" on public.forwarder_items;
create policy "forwarder_items_admin_all" on public.forwarder_items
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "forwarder_images_admin_all" on public.forwarder_images;
create policy "forwarder_images_admin_all" on public.forwarder_images
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "forwarder_status_log_admin_all" on public.forwarder_status_log;
create policy "forwarder_status_log_admin_all" on public.forwarder_status_log
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

-- ── Order tables — service_orders + items + cart_items ──
drop policy if exists "service_orders_admin_all" on public.service_orders;
create policy "service_orders_admin_all" on public.service_orders
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "service_order_items_admin_all" on public.service_order_items;
create policy "service_order_items_admin_all" on public.service_order_items
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

-- cart_items had only an admin SELECT policy (not "for all").
drop policy if exists "cart_items_admin_select" on public.cart_items;
create policy "cart_items_admin_select" on public.cart_items
  for select using (public.is_admin(array['super','ops','accounting']));

-- ── Sales money — team_leaders / sales_commissions / sales_payouts ──
-- super + accounting (pays the commissions) + sales_admin (manages
-- the sales org). NOT ops/warehouse/driver.
drop policy if exists "team_leaders_admin_all" on public.team_leaders;
create policy "team_leaders_admin_all" on public.team_leaders
  for all
  using      (public.is_admin(array['super','accounting','sales_admin']))
  with check (public.is_admin(array['super','accounting','sales_admin']));

drop policy if exists "sales_commissions_admin_all" on public.sales_commissions;
create policy "sales_commissions_admin_all" on public.sales_commissions
  for all
  using      (public.is_admin(array['super','accounting','sales_admin']))
  with check (public.is_admin(array['super','accounting','sales_admin']));

drop policy if exists "sales_payouts_admin_all" on public.sales_payouts;
create policy "sales_payouts_admin_all" on public.sales_payouts
  for all
  using      (public.is_admin(array['super','accounting','sales_admin']))
  with check (public.is_admin(array['super','accounting','sales_admin']));

-- ── Pricing config — promotions / customer_groups / settings / rates ──
-- These define what customers PAY — a low-trust role rewriting a rate
-- or a promo IS a money-impact write. super + ops + accounting.
drop policy if exists "promotions_admin_all" on public.promotions;
create policy "promotions_admin_all" on public.promotions
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "customer_groups_admin_all" on public.customer_groups;
create policy "customer_groups_admin_all" on public.customer_groups
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "settings_admin_all" on public.settings;
create policy "settings_admin_all" on public.settings
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "rate_general_admin_all" on public.rate_general;
create policy "rate_general_admin_all" on public.rate_general
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "rate_vip_admin_all" on public.rate_vip;
create policy "rate_vip_admin_all" on public.rate_vip
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "rate_custom_user_admin_all" on public.rate_custom_user;
create policy "rate_custom_user_admin_all" on public.rate_custom_user
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

drop policy if exists "rate_custom_hs_admin_all" on public.rate_custom_hs;
create policy "rate_custom_hs_admin_all" on public.rate_custom_hs
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

-- ── Notifications — admin can write a notification to any customer ──
-- Not money, but a customer-facing write surface. Pin to the roles
-- that legitimately notify customers; exclude warehouse/driver.
drop policy if exists "notifications_admin_all" on public.notifications;
create policy "notifications_admin_all" on public.notifications
  for all
  using      (public.is_admin(array['super','ops','accounting','sales_admin']))
  with check (public.is_admin(array['super','ops','accounting','sales_admin']));

-- ── admin_audit_log — the audit trail must not be readable by the
--    low-trust roles (knowing what is/isn't logged aids an attacker).
drop policy if exists "admin_audit_log_select" on public.admin_audit_log;
create policy "admin_audit_log_select" on public.admin_audit_log
  for select using (public.is_admin(array['super','accounting','ops']));

-- ── 0016 legacy `containers` (ops tracking) — order-adjacent.
-- warehouse genuinely needs this (it is the legacy ops-tracking
-- table — container_no / vessel / status). Keep warehouse; add
-- ops + super. Drop the bare driver/accounting/sales_admin reach.
drop policy if exists "containers_admin_all" on public.containers;
create policy "containers_admin_all" on public.containers
  for all
  using      (public.is_admin(array['super','ops','warehouse']))
  with check (public.is_admin(array['super','ops','warehouse']));

-- ── 0030 container_hs_lines — HS-code customs lines on a container.
-- Customs declaration data tied to orders → super + ops + accounting.
drop policy if exists container_hs_lines_admin_all on public.container_hs_lines;
create policy container_hs_lines_admin_all on public.container_hs_lines
  for all
  using      (public.is_admin(array['super','ops','accounting']))
  with check (public.is_admin(array['super','ops','accounting']));

-- NOTE — DELIBERATELY LEFT as bare is_admin() (not money/PII-customer,
-- or genuinely all-admin internal tooling; locking them adds no
-- security and risks breaking a role that needs them):
--   0016 admin_contact_extras / dashboard_banners — internal admin +
--        marketing config (no customer money/PII).
--   0019/0020/0021 HR tables (job_postings, job_applicants,
--        attendance_logs, leave_requests, training_*, policies,
--        employee_audit_entries) — staff HR data; a separate concern,
--        gated by the HR admin surface, no customer money/PII.
--   0022 contact_messages — public contact-form inbox.
--   0028 forwarder_driver — driver run assignment; the driver role
--        legitimately needs this (it is literally the driver's table).
--   0029 csv_imports / 0030 hs_codes — internal import tooling +
--        HS-code reference data.

-- ════════════════════════════════════════════════════════════
-- 2. is_admin() — no change needed
-- ════════════════════════════════════════════════════════════
-- The helper is correct as written (0015): is_admin(text[]) returns
-- true when the caller holds 'super' OR any role in the passed array.
-- The bug was never the function — it was 0015 calling it with no
-- argument on write policies. §1 above fixes every such call site.

-- ════════════════════════════════════════════════════════════
-- 3. G-6 BACKSTOP — DB-level money-mutation audit trigger
-- ════════════════════════════════════════════════════════════
-- admin_audit_log is written ONLY by logAdminAction() inside
-- actions/admin/*. A direct createAdminClient() / PostgREST write
-- (exactly the S-1 exploit path) leaves zero audit rows. This trigger
-- records every INSERT/UPDATE on wallet_transactions REGARDLESS of
-- code path — the authoritative DB-level money trail.
--
-- It reuses the existing admin_audit_log table (0015). Shape mapping:
--   admin_id    — admin_audit_log.admin_id is NOT NULL + FK→profiles
--                 ON DELETE RESTRICT. A trigger has no guaranteed
--                 admin actor (auth.uid() can be a customer doing a
--                 self-serve wallet insert, or NULL for service-role).
--                 We resolve it to: auth.uid() if that uid exists in
--                 profiles, else the row's own profile_id (which is a
--                 valid profiles FK by wallet_transactions' own
--                 constraint). This satisfies NOT NULL + the FK while
--                 still recording WHO acted in the payload.
--   action      — 'wallet_tx.insert' | 'wallet_tx.update'
--   target_type — 'wallet_transaction'
--   target_id   — the wallet_transactions.id
--   payload     — actor uid, the txn's profile_id, kind, status,
--                 amount, bucket, reference, and (for UPDATE) the
--                 before-snapshot of the money-bearing columns.
--
-- SECURITY DEFINER so the insert into admin_audit_log succeeds even
-- when the triggering write came from a low-privilege session.
create or replace function public.audit_wallet_transaction()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  actor_uid  uuid := auth.uid();
  log_admin  uuid;
  payload    jsonb;
begin
  -- Resolve a non-null, FK-valid admin_id. Prefer the acting uid;
  -- fall back to the txn's own profile_id (always a valid profiles
  -- row per wallet_transactions.profile_id's FK).
  if actor_uid is not null
     and exists (select 1 from public.profiles p where p.id = actor_uid) then
    log_admin := actor_uid;
  else
    log_admin := new.profile_id;
  end if;

  payload := jsonb_build_object(
    'actor_uid',      actor_uid,                       -- null = service-role / cron
    'tx_profile_id',  new.profile_id,
    'kind',           new.kind,
    'bucket',         new.bucket,
    'status',         new.status,
    'amount',         new.amount,
    'reference_type', new.reference_type,
    'reference_id',   new.reference_id,
    'via',            'db_trigger'                     -- distinguishes from logAdminAction rows
  );

  if tg_op = 'UPDATE' then
    -- Capture the before-image of the money-bearing columns so a
    -- silent status flip / amount edit is reconstructable.
    payload := payload || jsonb_build_object(
      'before', jsonb_build_object(
        'status', old.status,
        'amount', old.amount,
        'kind',   old.kind,
        'bucket', old.bucket
      )
    );
  end if;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, payload)
  values (
    log_admin,
    'wallet_tx.' || lower(tg_op),                      -- wallet_tx.insert | wallet_tx.update
    'wallet_transaction',
    new.id::text,
    payload
  );

  return null;  -- after-trigger; return value ignored
end;
$$;

comment on function public.audit_wallet_transaction() is
  '0062/G-6 — DB-level money-mutation audit. Logs every INSERT/UPDATE on wallet_transactions to admin_audit_log regardless of code path, so a direct PostgREST/createAdminClient write (the S-1 exploit path) still leaves an attribution row. logAdminAction() in actions/admin/* cannot catch non-action writes; this can. SECURITY DEFINER so the audit insert succeeds for low-privilege sessions.';

drop trigger if exists wallet_tx_audit_trigger on public.wallet_transactions;
create trigger wallet_tx_audit_trigger
  after insert or update on public.wallet_transactions
  for each row execute function public.audit_wallet_transaction();


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0063_wallet_freight_invoice_reference.sql                      ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- 0063 · Wallet ↔ freight-invoice bridge — W-3 (gap-schema-security G-3)
-- ════════════════════════════════════════════════════════════
-- Per [docs/research/PACRED-MASTER-STRATEGY.md] §2 (the wallet-leak chain)
-- + [docs/research/gap-schema-security.md] G-3.
--
-- ── The hole ────────────────────────────────────────────────────────
-- freight_invoice_payments.method (migration 0052) accepts 'wallet', but
-- wallet_transactions.reference_type (migration 0007) is a closed 4-value
-- enum — ('order_header','forwarder','yuan_payment','manual') — with NO
-- 'freight_invoice' value. So recordFreightPayment, on method='wallet',
-- COULD NOT insert a wallet debit even if it wanted to: the CHECK would
-- reject it. The action therefore skipped the debit entirely (documented
-- in-code as "follow-up V-E7.1"). Net effect: recording a freight payment
-- as 'wallet' flipped the invoice to paid WITHOUT ever reducing the
-- customer's wallet balance — a free shipment. Same bug class as the
-- already-fixed money-audit P0-2 (yuan wallet debit), but for freight.
--
-- ── The fix (two idempotent, RLS-neutral, zero-data changes) ────────
-- (a) Extend wallet_transactions.reference_type CHECK with
--     'freight_invoice' so a freight wallet debit has a legitimate way in.
-- (b) Add a partial-unique guard on the freight-payment wallet slice,
--     mirroring wallet_tx_order_payment_uniq (0049) and
--     wallet_tx_import_payment_uniq (0061) — so a double-submit of one
--     freight payment cannot double-debit the wallet. The bridge is
--     keyed PER PAYMENT ROW: reference_id = freight_invoice_payments.id
--     (a freight invoice receives many partial payments — each is its own
--     debit; the unique key is therefore the payment row, not the invoice).
--
-- The matching code change lives in
-- actions/admin/freight-invoice-payments.ts::recordFreightPayment — on
-- method='wallet' it now inserts a completed wallet_transactions debit
-- (kind='import_payment', reference_type='freight_invoice') and checks the
-- insert error (a failed money insert fails the whole action). It mirrors
-- the cargo order_payment debit in payServiceOrderFromWallet.
--
-- Idempotent: drop-if-exists + the new CHECK is a strict superset of the
-- 0007 enum, so re-applying never rejects an existing row. The index uses
-- `if not exists`. Zero data migration. Safe to apply on prod live.
-- ════════════════════════════════════════════════════════════

-- ── (a) extend wallet_transactions.reference_type CHECK ──────────────
-- The CHECK was created inline in 0007 → Postgres auto-named it
-- `wallet_transactions_reference_type_check`. Drop + recreate with the
-- extra value. Strict superset → re-applying never rejects existing rows.
alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_reference_type_check;

alter table public.wallet_transactions
  add constraint wallet_transactions_reference_type_check check (
    reference_type in (
      'order_header','forwarder','yuan_payment','freight_invoice','manual'
    )
  );

comment on constraint wallet_transactions_reference_type_check on public.wallet_transactions is
  '0063 — extends 0007 with freight_invoice (W-3 / gap-schema-security G-3: a freight invoice paid via wallet now writes a real wallet_transactions debit instead of flipping the invoice to paid with no debit — closing the free-shipment leak). reference_id for this type = the freight_invoice_payments row id (1 debit per partial payment).';

-- ── (b) partial-unique guard against freight-payment wallet double-debit ──
-- Mirrors wallet_tx_order_payment_uniq (0049) + wallet_tx_import_payment_uniq
-- (0061). The freight wallet debit is keyed on the PAYMENT row id
-- (reference_id = freight_invoice_payments.id) — so the slice
-- (reference_type='freight_invoice', kind='import_payment',
--  status='completed') is unique per payment row. A double-submit of the
-- same freight payment (admin double-click / form re-POST) raises 23505;
-- recordFreightPayment catches it + re-SELECTs the canonical debit.
create unique index if not exists wallet_tx_freight_payment_uniq
  on public.wallet_transactions (reference_id)
  where reference_type = 'freight_invoice'
    and kind           = 'import_payment'
    and status         = 'completed';

comment on index public.wallet_tx_freight_payment_uniq is
  '0063/W-3 — DB guard against double-debit on freight invoice pay-from-wallet. Partial unique on completed import_payment per freight_invoice_payments row id. recordFreightPayment catches 23505 + re-SELECTs for idempotent retry.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0064_wallet_overdraw_guard.sql                                 ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- 0064 · Wallet overdraw guard — H-1 (aggregate-pending overdraw)
-- ════════════════════════════════════════════════════════════
-- Pre-launch customer-gap audit [docs/research/gap-customer.md §H-1].
--
-- ── The hole ──
-- `actions/wallet.ts::createWithdraw` and `actions/payment.ts::
-- createYuanPayment` (wallet-paid) insert their debit row with
-- status='pending'. The 0007 balance trigger `wallet_recompute_balance`
-- sums only rows `where status='completed'`, so a PENDING debit does
-- NOT reduce `wallet.balance`. Each action's balance check reads only
-- that completed-only balance — so a customer can stack N withdraw
-- requests and/or N wallet-paid yuan transfers, each individually
-- <= balance, none reflected until an admin approves them. When the
-- admin approves them all, the main balance goes NEGATIVE — Pacred
-- pays out / ships transfers it was never funded for.
--
-- Distinct from the 2026-05-17 money audit: P0-2 is the yuan debit
-- being RLS-blocked; P1-1 is concurrent pay-from-wallet (writes
-- 'completed' immediately). The aggregate-pending overdraw on the
-- admin-gated withdraw + yuan path was uncovered. 0061 only added a
-- tax-invoice duplicate guard.
--
-- ── The fix — one coherent balance-integrity rule ──
-- 1. `wallet_available_balance(profile, bucket)` — the single SQL
--    definition of spendable balance: completed rows PLUS open pending
--    DEBITS. (Pending CREDITS — a deposit awaiting approval — are NOT
--    counted: that money is not in the wallet yet.) The app layer
--    mirrors this rule in lib/wallet/balance.ts for its pre-insert
--    check; this function is the authority the DB trigger trusts.
-- 2. `wallet_assert_no_overdraw()` — a BEFORE INSERT/UPDATE trigger:
--    the hard non-negative floor. Rejects any customer-side PENDING
--    main-bucket debit (a new request, or an amount-edit on an open
--    one) that would push the available balance below zero. Locks the
--    wallet row FOR UPDATE so the floor holds under concurrent submits,
--    not just check-then-act.
--
-- ── Scope — what the trigger deliberately does NOT block ──
--  * status='completed' debits — pay-from-wallet writes these, and the
--    admin `allow_overdraw` override depends on being able to. Their
--    pending-aware check lives in the app layer; the concurrent
--    pay-from-wallet overdraw (money-audit P1-1) keeps its own,
--    separately-tracked floor.
--  * pending -> completed approval (admin) — leaves the available
--    balance unchanged, so it never trips the guard.
--  * kind='adjustment' — the admin manual-correction escape hatch.
--
-- Idempotent (create-or-replace / drop-if-exists). Zero data
-- migration. Safe to apply on prod live.
-- ════════════════════════════════════════════════════════════

-- ── Spendable-balance function — single source of truth ──
-- SECURITY DEFINER so it always sums the true rows regardless of the
-- caller's RLS context (a money guard must not be fooled by row
-- visibility). Kept off the PostgREST RPC surface — see revoke below.
create or replace function public.wallet_available_balance(
  p_profile uuid,
  p_bucket  text default 'main'
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount), 0)::numeric(12,2)
    from public.wallet_transactions
   where profile_id = p_profile
     and bucket     = p_bucket
     and (
           status = 'completed'
        or (status = 'pending' and amount < 0)
     );
$$;

comment on function public.wallet_available_balance(uuid, text) is
  '0064 H-1 — spendable balance = completed rows + open pending debits. Backs the wallet_tx_overdraw_guard trigger; mirrored in lib/wallet/balance.ts. Trigger-internal — execute revoked from client roles so a caller cannot read another profile''s balance via RPC.';

-- Trigger-internal only. The SECURITY DEFINER trigger (owner = migration
-- runner) keeps EXECUTE via ownership; client roles lose the default grant.
revoke all on function public.wallet_available_balance(uuid, text)
  from public, anon, authenticated;

-- ── Overdraw-guard trigger — the hard non-negative floor ──
create or replace function public.wallet_assert_no_overdraw()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_available   numeric(12,2);
  v_old_contrib numeric(12,2) := 0;
  v_new_contrib numeric(12,2) := 0;
  v_projected   numeric(12,2);
begin
  -- Guard customer-side PENDING debits on the MAIN bucket only.
  -- 'completed' rows (pay-from-wallet, admin allow_overdraw,
  -- pending->completed approval) and 'adjustment' (admin escape hatch)
  -- are intentionally out of scope — see the migration header.
  if new.status <> 'pending'
     or new.bucket <> 'main'
     or new.kind = 'adjustment' then
    return new;
  end if;

  -- A pending row counts toward the spendable balance only if it is a
  -- debit (mirrors wallet_available_balance). A pending credit does not.
  if new.amount < 0 then
    v_new_contrib := new.amount;
  end if;

  -- On UPDATE, back out the row's pre-update contribution so the
  -- projection reflects swapping OLD for NEW (catches amount edits on
  -- an already-open pending withdraw).
  if tg_op = 'UPDATE'
     and (old.status = 'completed'
          or (old.status = 'pending' and old.amount < 0)) then
    v_old_contrib := old.amount;
  end if;

  -- This operation does not reduce the spendable balance -> nothing to
  -- guard (a new credit, or shrinking an existing debit).
  if v_new_contrib >= v_old_contrib then
    return new;
  end if;

  -- Serialize concurrent debits per profile so the floor is hard, not
  -- check-then-act. The wallet row exists (0007 backfill + profiles-
  -- insert trigger); FOR UPDATE over zero rows is a harmless no-op.
  perform 1 from public.wallet where profile_id = new.profile_id for update;

  v_available := public.wallet_available_balance(new.profile_id, 'main');
  v_projected := v_available - v_old_contrib + v_new_contrib;

  -- Block only operations that push the spendable balance below zero.
  -- If it is already negative (legacy bad data), still allow operations
  -- that do not worsen it, so admins can remediate.
  if v_projected < 0 and v_projected < v_available then
    raise exception
      'wallet overdraw blocked: available %, requested debit %, projected % (profile %, kind %)',
      v_available, (v_new_contrib - v_old_contrib), v_projected,
      new.profile_id, new.kind
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.wallet_assert_no_overdraw() is
  '0064 H-1 — hard non-negative floor for customer-side pending main-bucket debits (withdraw / wallet-paid yuan). See the migration header for the deliberate scope exclusions.';

drop trigger if exists wallet_tx_overdraw_guard on public.wallet_transactions;
create trigger wallet_tx_overdraw_guard
  before insert or update of amount, status, bucket
  on public.wallet_transactions
  for each row execute function public.wallet_assert_no_overdraw();


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0066_post_u1_audit_fixes.sql                                   ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- Post-U1 audit follow-ups (commits 871450b + 0e652f0 + 185adfd)
-- ════════════════════════════════════════════════════════════
-- Per the audit verdict 🟡 ship-with-followup, this migration closes
-- the two server-side gaps that the audit flagged. The third concern
-- (legacy containers.ts writing only to the legacy table) was fixed
-- in code (the legacy actions now return a deprecation error +
-- /admin/containers/[id] redirects to the spine).
--
-- ── Fix 1: refund_requests transition lock ──────────────────────────
-- Audit MED#2: paid → approved reversal would let admin double-credit
-- the same refund. Add a BEFORE UPDATE trigger that forbids any
-- transition OUT of terminal states (paid, rejected).
--
-- ── Fix 2: freight_invoices single-active-per-shipment ──────────────
-- Audit LOW#3: concurrent adminMarkFreightDelivered calls have a TOCTOU
-- window where both pass the "no existing invoice" pre-check and both
-- INSERT. Add a partial unique index on freight_invoice_id WHERE
-- status != 'cancelled' so the DB collapses the race to one row.
--
-- Both fixes are idempotent + additive. No data migration.
-- ════════════════════════════════════════════════════════════

-- ── Fix 1: refund_requests transition lock ──────────────────────────

create or replace function public.refund_requests_block_terminal_reversal()
returns trigger as $$
begin
  -- Block any transition OUT of terminal states. paid + rejected are
  -- final; the only allowed updates to those rows are no-op (same status)
  -- or admin metadata fixes (e.g. typo in reason). Any other status
  -- change raises.
  if old.status in ('paid', 'rejected') and new.status <> old.status then
    raise exception
      'refund_requests cannot be reopened from terminal state % (id=%, request_no=%) — create a new request for the corrective refund',
      old.status, old.id, old.request_no
      using errcode = '23514';  -- check_violation
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists refund_requests_block_terminal_reversal_trigger on public.refund_requests;
create trigger refund_requests_block_terminal_reversal_trigger
  before update on public.refund_requests
  for each row execute function public.refund_requests_block_terminal_reversal();

comment on function public.refund_requests_block_terminal_reversal() is
  'Audit MED#2 follow-up to commit 0e652f0: blocks status changes OUT of terminal states (paid, rejected). Closes the "re-flip approved then double-credit" hole. Allowed: same-status updates + metadata edits. To correct a wrongful paid/rejected, create a NEW refund_requests row.';

-- ── Fix 2: freight_invoices single-active-per-shipment ──────────────

create unique index if not exists freight_invoices_one_active_per_shipment_uidx
  on public.freight_invoices(freight_shipment_id)
  where status <> 'cancelled';

comment on index public.freight_invoices_one_active_per_shipment_uidx is
  'Audit LOW#3 follow-up to commit 871450b: ensures at most one non-cancelled freight_invoice exists per freight_shipment, closing the TOCTOU race in adminMarkFreightDelivered auto-draft (the existence pre-check is not race-safe). Concurrent inserts now collapse to one row via DB-level constraint.';

-- ── Verify (counts) ─────────────────────────────────────────────────

do $$
declare
  dupe_freight_invoice_count int;
  terminal_refund_count      int;
begin
  -- Surface any pre-existing duplicate freight_invoices that would
  -- prevent the new index from being created. The CREATE INDEX IF NOT
  -- EXISTS above won't fail loudly on dupes — Postgres will warn.
  select count(*) - count(distinct freight_shipment_id) into dupe_freight_invoice_count
    from public.freight_invoices
    where status <> 'cancelled';
  if dupe_freight_invoice_count > 0 then
    raise warning 'freight_invoices has % duplicate non-cancelled rows per shipment — manual cleanup needed before unique index is enforceable', dupe_freight_invoice_count;
  end if;

  select count(*) into terminal_refund_count
    from public.refund_requests
    where status in ('paid', 'rejected');
  raise notice 'refund_requests transition-lock active over % terminal rows', terminal_refund_count;
end$$;


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0067_pcs_customer_migration.sql                                ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- U2-1 · PCS → Pacred customer migration
-- ════════════════════════════════════════════════════════════
-- Per docs/UPGRADE_PLAN.md §2 U2-1 + docs/research/legacy-chat-datanew-2026-05-17.md
-- L-2 (ป๊อป → ก๊อต 2026-05-17 11:48):
--
--   "แก้ไขรหัสเดิมของเขา จาก PCS เป็น PR แค่นั้น" — keep the running
--   number, just swap the prefix. PCS1234 → PR1234. Customers get a
--   rebrand notice ("เราจะแจ้งลูกค้าว่าเรารีแบรน"). Sales then phones
--   to follow them. The legacy table is `tb_users` (~9,279 rows,
--   max userID = PCS10594 in the 2026-03-19 dump at
--   C:\xampp\htdocs\pcscargo\member\pcs-admin\html-private\update-database\).
--
-- THE TRAP (L-2 final line): the running sequence
-- `public.member_code_seq` keeps emitting PR001, PR002, … for fresh
-- signups. If we backfill PR1234 (legacy) and the sequence is sitting
-- at 99, a fresh signup tomorrow becomes PR100, which is fine — but
-- the moment the sequence ticks past the highest LEGACY number we get
-- a hard `profiles.member_code` UNIQUE collision (the trigger inserts
-- a duplicate). The fix is to `setval(member_code_seq, max_legacy + N)`
-- so the next nextval() returns max_legacy + N + 1 — well past every
-- migrated row's number.
--
-- This migration:
--   1. Adds `profiles.migrated_from_pcs` boolean + `profiles.legacy_pcs_user_id`
--      so migrated rows are distinguishable from native signups
--      (and the backfill can be keyed off them — idempotent re-runs).
--   2. Creates `pcs_legacy_customers_staging` — a deliberately
--      simple, ungoverned staging table that ภูม pre-populates from
--      the `tb_users` dump via the runbook
--      (docs/runbook/u2-1-pcs-customer-migration.md). Once empty,
--      can be dropped manually post-cutover.
--   3. (Intentional NO-OP for `profiles` backfill.) profiles.id is FK →
--      auth.users.id, and auth.users can only be created via the
--      Supabase admin API (out of reach from a SQL migration). The
--      companion server action `adminBackfillPcsAuthUsers()`
--      (actions/admin/pcs-migration.ts) walks staging rows + creates
--      auth.users via supabase.auth.admin.createUser() + inserts the
--      matching profiles row with the re-stamped PR<n> member_code.
--      Customers reset their password (email or phone OTP) on first
--      login. THIS MIGRATION DOES NOT TOUCH `profiles` ROWS — only
--      the schema additions in step 1.
--   4. Offsets `member_code_seq` to `max(legacy_pcs_num) + 100` so the
--      next fresh signup picks up at max+101 — buffer absorbs any race
--      with staging rows that arrive after the offset is set.
--   5. Provides a reporting view `v_pcs_migration_status` so the
--      runbook + admin UI can verify backfill progress at a glance —
--      this view is the source of truth for "did the backfill run?",
--      NOT the migration's apply-success.
--
-- All steps idempotent + additive. Safe to re-run.
-- ════════════════════════════════════════════════════════════

-- ── 1) Mark column on profiles ─────────────────────────────────────

alter table public.profiles
  add column if not exists migrated_from_pcs    boolean not null default false,
  add column if not exists legacy_pcs_user_id   text;

comment on column public.profiles.migrated_from_pcs is
  'U2-1: true if this row was backfilled from the legacy PCS tb_users dump (vs a native Pacred signup). Lets the team distinguish migrated customers (need rebrand notice + password reset on first login) from organic signups.';
comment on column public.profiles.legacy_pcs_user_id is
  'U2-1: the legacy tb_users.userID (e.g. PCS1234). Idempotency key for the staging backfill — re-runs detect already-migrated rows via this column. NULL for native signups.';

-- Partial unique — only enforced for migrated rows so native signups
-- (which never set this) don''t collide on NULL.
create unique index if not exists profiles_legacy_pcs_user_id_uidx
  on public.profiles(legacy_pcs_user_id)
  where legacy_pcs_user_id is not null;

-- ── 2) Staging table (ungoverned — ภูม populates from dump) ────────

create table if not exists public.pcs_legacy_customers_staging (
  -- Legacy primary key — what we re-stamp to PR<n>.
  legacy_user_id      text primary key,            -- e.g. 'PCS1234'

  -- Demographics + contact (mapped 1:1 from tb_users columns).
  user_tel            text,                         -- userTel
  first_name          text,                         -- userName
  last_name           text,                         -- userLastName
  email               text,                         -- userEmail (often NULL/empty in legacy)
  line_id             text,                         -- userLineID
  facebook_url        text,                         -- userFacebook
  user_registered     timestamptz,                  -- userRegistered
  user_sex            text,                         -- userSex ('ชาย'/'หญิง'/'') — needs mapping
  user_birthday       date,                         -- userBirthday
  user_last_login     timestamptz,                  -- userLastLogin

  -- Classification (legacy → Pacred-equivalent).
  co_id               text,                         -- coID ('PCS'/'VIP'/'VIP5') → customer_group
  admin_id            text,                         -- adminID (creator)
  sales_admin_id      text,                         -- adminIDSale
  user_recom          text,                         -- userRecom (recommended_by)
  channel             text,                         -- channel (referral_channel)
  company_customer    text,                         -- companyCustomer '1'=seafreight / '2'=cargo
  shop_user           text,                         -- shopUser '1' = self-shopper
  user_note           text,                         -- userNote (free-form)
  user_active         text,                         -- userActive '1' = used

  -- Bookkeeping for the backfill.
  imported_at         timestamptz not null default now(),
  backfilled_at       timestamptz,                  -- set when row turns into a profiles INSERT
  backfilled_profile_id uuid,                       -- the resulting profiles.id (also auth.users.id)
  notes               text                          -- free-form (e.g. "skipped: duplicate phone")
);

comment on table public.pcs_legacy_customers_staging is
  'U2-1: staging buffer for the one-shot PCS → Pacred customer migration. ภูม pre-populates this from a CSV export of legacy `tb_users` (runbook: docs/runbook/u2-1-pcs-customer-migration.md). The adminBackfillPcsAuthUsers() server action (actions/admin/pcs-migration.ts) consumes it — this migration itself does NOT insert into profiles (see section 3 banner). Drop manually post-cutover (no FK depends on it).';

-- ── 3) Profiles backfill: INTENTIONALLY NO-OP (see server action) ──
--
-- This migration does NOT insert any rows into `public.profiles`.
--
-- Reason: `profiles.id` is a FK → `auth.users.id`, and `auth.users`
-- rows can only be created via the Supabase admin API
-- (`supabase.auth.admin.createUser()`) — there is no SQL path to it.
-- A migration that tried to INSERT into profiles directly would either
-- fail the FK (no matching auth row) or require an unsafe placeholder.
--
-- The customer-creation work happens in the companion server action:
--   actions/admin/pcs-migration.ts → adminBackfillPcsAuthUsers()
--
-- which iterates `pcs_legacy_customers_staging` rows, calls
-- `supabase.auth.admin.createUser()` with a generated random password
-- (migrated customer resets via email/phone OTP on first login), then
-- inserts the matching `profiles` row with the re-stamped `PR<n>`
-- member_code in the same loop iteration.
--
-- Verification surface for "did the backfill run": query
-- `public.v_pcs_migration_status` (created in step 5 below) — NOT the
-- successful application of this migration. A clean `0067` apply only
-- proves schema + sequence offset + staging table are in place.

-- ── 4) Sequence offset (THE TRAP) ──────────────────────────────────
--
-- Compute max legacy number from staging + max already-migrated number
-- in profiles. Offset member_code_seq to max + 100 buffer.
--
-- If staging is empty AND no migrated rows yet → no offset needed
-- (sequence is fine as-is for native signups; the next migration run
-- will re-offset once staging is populated).

-- NOTE on dollar-quoting: `$$` would clash with the `$` end-anchor in
-- the POSIX regexes below (`^PCS[0-9]+$`). Use a tagged dollar quote
-- `$pcsmig$ ... $pcsmig$` so the lexer never confuses a regex `$` with
-- a closing quote. Also use `[0-9]` (POSIX class) over `\d` — Postgres
-- supports both but `[0-9]` is portable across older planners.

do $pcsmig$
declare
  max_staging_num    int := 0;
  max_migrated_num   int := 0;
  max_native_num     int := 0;
  current_seq_value  bigint;
  target_seq_value   bigint;
  buffer             constant int := 100;
begin
  -- Highest PCS<n> in staging
  select coalesce(max((regexp_replace(legacy_user_id, '^PCS', ''))::int), 0)
    into max_staging_num
    from public.pcs_legacy_customers_staging
    where legacy_user_id ~ '^PCS[0-9]+$';

  -- Highest already-migrated PR<n> in profiles (from earlier run)
  select coalesce(max((regexp_replace(legacy_pcs_user_id, '^PCS', ''))::int), 0)
    into max_migrated_num
    from public.profiles
    where legacy_pcs_user_id is not null
      and legacy_pcs_user_id ~ '^PCS[0-9]+$';

  -- Highest native PR<n> already issued — make sure we don''t REGRESS
  -- the sequence below where native signups currently are.
  select coalesce(max((substring(member_code from 3))::int), 0)
    into max_native_num
    from public.profiles
    where member_code ~ '^PR[0-9]+$'
      and (migrated_from_pcs is null or migrated_from_pcs = false);

  current_seq_value := (select last_value from public.member_code_seq);
  target_seq_value  := greatest(max_staging_num, max_migrated_num, max_native_num) + buffer;

  -- Only advance — never roll back the sequence (a sequence going
  -- backwards would re-issue codes that may already exist).
  if target_seq_value > current_seq_value then
    perform setval('public.member_code_seq', target_seq_value, true);
    raise notice
      'U2-1: member_code_seq offset to % (max_staging=% max_migrated=% max_native=% + buffer=%). Next signup -> PR%.',
      target_seq_value, max_staging_num, max_migrated_num, max_native_num, buffer, target_seq_value + 1;
  else
    raise notice
      'U2-1: member_code_seq already at % - no offset needed (max_staging=% max_migrated=% max_native=% + buffer=%, target=%).',
      current_seq_value, max_staging_num, max_migrated_num, max_native_num, buffer, target_seq_value;
  end if;
end
$pcsmig$;

-- ── 5) Reporting view — easy verify queries ────────────────────────

create or replace view public.v_pcs_migration_status as
select
  (select count(*) from public.pcs_legacy_customers_staging)                                as staging_rows,
  (select count(*) from public.pcs_legacy_customers_staging where backfilled_at is null)   as staging_pending,
  (select count(*) from public.pcs_legacy_customers_staging where backfilled_at is not null) as staging_done,
  (select count(*) from public.profiles where migrated_from_pcs = true)                    as migrated_profiles,
  (select last_value from public.member_code_seq)                                          as member_code_seq_current,
  (select coalesce(max((regexp_replace(legacy_user_id, '^PCS', ''))::int), 0)
     from public.pcs_legacy_customers_staging
     where legacy_user_id ~ '^PCS[0-9]+$')                                                 as max_legacy_num_in_staging,
  (select coalesce(max((substring(member_code from 3))::int), 0)
     from public.profiles
     where member_code ~ '^PR[0-9]+$')                                                     as max_member_code_num;

comment on view public.v_pcs_migration_status is
  'U2-1: one-row dashboard for PCS→Pacred migration. Used by /admin/migration/pcs-customers + the runbook verify step.';

-- ── 6) Verify counts (raise notice for psql output) ────────────────

do $pcsmig_v$
declare
  staging_rows int;
  migrated_rows int;
begin
  select count(*) into staging_rows from public.pcs_legacy_customers_staging;
  select count(*) into migrated_rows from public.profiles where migrated_from_pcs = true;
  raise notice
    'U2-1: migration applied. Staging=% rows. Already-migrated=% rows. Run adminBackfillPcsAuthUsers() after populating staging.',
    staging_rows, migrated_rows;
end
$pcsmig_v$;


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0068_cargo_sacks.sql                                           ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- U2-5 · cargo_sacks — "กระสอบรวม" consolidation entity
-- ════════════════════════════════════════════════════════════
-- Per UPGRADE_PLAN §2 U2-5 + datanew L-4:
--
--   "A 'sack' / consolidation object (กระสอบรวม) is missing from
--    the Pacred data model. The drop introduces a data entity no
--    Pacred doc models: the sack / consolidated bag, with its own
--    code namespace CBX<YYMMDD>-EK<NN> (e.g. CBX251111-EK04) and
--    its own MOMO endpoint (/api/sack/get/info/{code}). A sack
--    bundles many small customer parcels; MOMO measures the
--    OUTSIDE of the bag, PCS measures the GOODS INSIDE — this is
--    reconciliation-gap root cause #1."
--
-- ── The hole ────────────────────────────────────────────────
-- Today cargo_shipments link directly to cargo_containers. There's
-- no intermediate "sack" — so when MOMO returns sack-level
-- measurements (the outside-of-bag CBM/weight), we have nowhere
-- to store them. The CBM gap that U1-3 (billing gate) keys on
-- can be explained by: container's total CBM = sum of sack outside-
-- measurements ≠ sum of shipment goods-inside-measurements. The
-- sack is the missing layer that lets staff reconcile.
--
-- ── The fix (V1) ────────────────────────────────────────────
-- 1. cargo_sacks table — code (CBX-YYMMDD-NN unique), parent
--    cargo_container_id, outside weight + cbm, source (momo/pacred/self)
-- 2. cargo_shipments.cargo_sack_id (optional FK) — a shipment can
--    be in a sack inside a container, OR directly in the container
--    without a sack (e.g. larger goods)
-- 3. Daily code-generation helper next_sack_code() mirroring the
--    cargo_containers pattern (sequence + trigger)
-- 4. RLS: customer sees a sack only if they own ≥1 shipment in it
--    (mirrors cargo_containers_customer_read); admin via
--    ['super','ops','warehouse']
--
-- V1 scope ships READ-only sync surface — i.e. the MOMO sync (post
-- U1-7) populates this table from the partner; staff don't manually
-- create sacks. A future migration adds staff-side create/edit if
-- needed.
--
-- Idempotent + additive. Zero data migration.
-- ════════════════════════════════════════════════════════════

-- ── 1) Daily serial counter for sack codes ──────────────────────────

create table if not exists public.cargo_sack_seq (
  period_yymmdd text primary key,
  next_seq      int  not null default 1,
  updated_at    timestamptz not null default now()
);

-- ── 2) Code-generation helper ──────────────────────────────────────
-- Returns codes like CBX260518-EK01, CBX260518-EK02, ... resetting
-- daily. SECURITY DEFINER so service_role + the trigger below both
-- bypass RLS on the seq table.

create or replace function public.next_sack_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yymmdd text := to_char(timezone('Asia/Bangkok', now()), 'YYMMDD');
  v_seq    int;
begin
  insert into public.cargo_sack_seq (period_yymmdd, next_seq)
       values (v_yymmdd, 2)
  on conflict (period_yymmdd) do update
     set next_seq = cargo_sack_seq.next_seq + 1
   returning next_seq - 1 into v_seq;

  return 'CBX' || v_yymmdd || '-EK' || lpad(v_seq::text, 2, '0');
end;
$$;

comment on function public.next_sack_code() is
  'U2-5: returns the next sack code in CBX<YYMMDD>-EK<NN> format (e.g. CBX260518-EK01). Resets daily per Bangkok TZ. Mirrors the MOMO native code namespace per datanew L-4.';

-- ── 3) cargo_sacks table ────────────────────────────────────────────

create table if not exists public.cargo_sacks (
  id                  uuid primary key default gen_random_uuid(),

  -- CBX<YYMMDD>-EK<NN> — partner-issued by MOMO OR Pacred-issued
  -- via next_sack_code() when source='pacred'/'self'.
  code                text unique not null,

  -- Which container is this sack inside? Nullable for the brief
  -- window between sack creation + container assignment.
  cargo_container_id  uuid references public.cargo_containers(id) on delete set null,

  -- MOMO outside-of-bag measurements (the reconciliation reference).
  -- Distinct from cargo_shipments.received_cbm (per-shipment goods-
  -- inside measurement at the TH warehouse).
  weight_kg           numeric(12,2),
  cbm                 numeric(10,3),

  origin              text,                              -- e.g. CN-GZ, CN-YW (mirror cargo_containers)
  destination         text,                              -- e.g. TH-BKK

  -- Where did this row come from?
  source              text not null check (source in ('momo','pacred','self')) default 'momo',

  -- Optional timeline markers (lightweight — full lifecycle is on the parent container).
  packed_at           timestamptz,                       -- when staff/MOMO marked the sack closed
  arrived_at          timestamptz,                       -- when sack reached destination

  -- Free-text staff note (e.g. "ของกระจัดกระจาย — แยกตามสี")
  note                text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists cargo_sacks_container_idx
  on public.cargo_sacks(cargo_container_id) where cargo_container_id is not null;
create index if not exists cargo_sacks_source_updated_idx
  on public.cargo_sacks(source, updated_at desc);

drop trigger if exists cargo_sacks_updated_at_trigger on public.cargo_sacks;
create trigger cargo_sacks_updated_at_trigger
  before update on public.cargo_sacks
  for each row execute function public.set_updated_at();

comment on table  public.cargo_sacks is
  'U2-5: consolidation bag ("กระสอบรวม"). One sack bundles many cargo_shipments inside one cargo_container. Code namespace CBX<YYMMDD>-EK<NN>. MOMO measures the outside (weight_kg + cbm here); cargo_shipments.received_cbm is the per-shipment goods-inside measurement at TH warehouse. The gap between the two explains the U1-3 billing reconciliation lane (datanew L-3 / L-4).';
comment on column public.cargo_sacks.code is
  'CBX<YYMMDD>-EK<NN> sack code. Generated by next_sack_code() for self-issued; mirror of partner code for source=momo.';
comment on column public.cargo_sacks.weight_kg is
  'MOMO outside-of-bag weight in kg. Distinct from per-shipment weight inside the sack.';
comment on column public.cargo_sacks.cbm is
  'MOMO outside-of-bag CBM. Used as the billing-reconciliation reference; sum of inside-shipment CBMs may differ (the L-3 gap).';

-- ── 4) cargo_shipments.cargo_sack_id ────────────────────────────────

alter table public.cargo_shipments
  add column if not exists cargo_sack_id uuid
  references public.cargo_sacks(id) on delete set null;

create index if not exists cargo_shipments_sack_idx
  on public.cargo_shipments(cargo_sack_id) where cargo_sack_id is not null;

comment on column public.cargo_shipments.cargo_sack_id is
  'U2-5: optional sack this shipment is bundled inside. NULL = shipment is directly in the container without a sack (larger goods).';

-- ── 5) RLS ──────────────────────────────────────────────────────────

alter table public.cargo_sacks enable row level security;

-- Customer reads a sack only if they own ≥1 shipment in it OR ≥1
-- shipment in the parent container.
drop policy if exists cargo_sacks_customer_read on public.cargo_sacks;
create policy cargo_sacks_customer_read
  on public.cargo_sacks for select
  using (
    exists (
      select 1 from public.cargo_shipments s
       where s.cargo_sack_id = cargo_sacks.id
         and s.profile_id    = auth.uid()
    )
    or exists (
      select 1 from public.cargo_shipments s
       where s.cargo_container_id = cargo_sacks.cargo_container_id
         and s.profile_id         = auth.uid()
    )
  );

-- Admin write: super + ops + warehouse (mirror cargo_containers).
drop policy if exists cargo_sacks_admin_all on public.cargo_sacks;
create policy cargo_sacks_admin_all
  on public.cargo_sacks for all
  using      (public.is_admin(array['super','ops','warehouse']))
  with check (public.is_admin(array['super','ops','warehouse']));

-- ── 6) Verify (counts) ─────────────────────────────────────────────

do $$
declare
  rls_count int;
begin
  select count(*) into rls_count
    from pg_policies
   where schemaname = 'public' and tablename = 'cargo_sacks';
  if rls_count < 2 then
    raise warning 'cargo_sacks RLS expected ≥ 2 policies, found %', rls_count;
  else
    raise notice 'U2-5 cargo_sacks ready — % RLS policies installed', rls_count;
  end if;
end$$;


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0069_container_costs_disbursements.sql                         ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- U2-2 · container_costs + container_disbursements — cost basis + AP ledger
-- ════════════════════════════════════════════════════════════
-- Per UPGRADE_PLAN §2 U2-2 + research G-1/G-2 + R-7:
--
--   "Pacred has zero cost side today → no margin, no 'billed below
--    cost' flag, no commission-on-profit. Legacy tb_cost_container
--    held the carrier-rate-card (the EXPECTED cost per cabinet+type),
--    and tb_bill / tb_bill_item held the disbursement ledger (the
--    ACTUAL outflows). Pacred ports both as two distinct tables:
--      - container_costs        = rate-card (what carrier *charges*)
--      - container_disbursements = AP ledger (what Pacred *paid out*)
--    Both feed R-7 margin reconciliation later."
--
-- ── G-1: container_costs (carrier rate card) ────────────────
-- One row per (carrier, route, container_type) with rate inputs
-- + an effective window. Lookup is most-specific-wins via
-- effective_from / effective_to.
--
-- ── G-2: container_disbursements (AP ledger) ────────────────
-- One row per actual outflow against a specific cargo_container.
-- Kind enumerates the legacy categories (D/O · duty · freight ·
-- handling · fuel · storage · trucking) plus a free 'other' bucket.
-- Receipt scan goes in Storage bucket 'disbursement-receipts'.
--
-- ── RLS ─────────────────────────────────────────────────────
-- container_costs: super + accounting WRITE; ops + sales_admin +
--   warehouse READ (they need rate visibility to quote / plan).
-- container_disbursements: super + accounting WRITE + READ ONLY —
--   no ops / warehouse / sales_admin access. AP ledger is finance-
--   only per ADR-0005 K-7 + W-1 keystone (gap-schema-security S-1).
--
-- ── Storage bucket ──────────────────────────────────────────
-- 'disbursement-receipts' — private. Customer never sees a row.
-- Path pattern: disbursement-receipts/{cargo_container_id}/{file}
--
-- Idempotent + additive. Zero data migration.
-- ════════════════════════════════════════════════════════════

-- ── 1) container_costs (carrier rate card) ──────────────────────────

create table if not exists public.container_costs (
  id                   uuid primary key default gen_random_uuid(),

  -- Identifier of the carrier that quotes this rate (e.g. 'MOMO',
  -- 'COSCO', 'TTP', 'EVERGREEN'). Free-text because the carrier set
  -- is informal during legacy port; later we may FK to a `carriers`
  -- master once that's locked.
  carrier_name         text not null,

  -- Transport mode the rate applies to. Aligned with cargo_containers.
  transport_mode       text not null check (transport_mode in ('truck','sea','air')),

  -- Origin / destination — short codes (e.g. 'CN-GZ', 'CN-YW', 'TH-BKK').
  -- Free-text so admin can add new routes without a migration.
  origin               text not null,
  destination          text not null,

  -- Container / vehicle type — e.g. '40HQ', '20GP', '40RF', 'truck-6w', 'truck-10w'.
  container_type       text not null,

  -- Rate inputs. Both nullable because some carriers price by CBM only
  -- (sea LCL) and some by kg only (air freight). At least one must be
  -- non-null (enforced by CHECK below).
  rate_per_cbm_thb     numeric(12,2),
  rate_per_kg_thb      numeric(12,2),

  -- Optional minimum charge — billed when actual × rate < minimum.
  minimum_charge_thb   numeric(12,2),

  -- Fuel surcharge as a % uplift on the base rate. Stored on the rate
  -- row (vs as a separate disbursement kind) because it's a percentage
  -- of THIS rate — not a fixed amount. Open Q: see migration footer.
  fuel_surcharge_pct   numeric(5,2),

  -- Effective window. effective_to NULL = currently active.
  effective_from       date not null,
  effective_to         date,

  -- Where did this row come from?
  source               text not null
                         check (source in ('manual','momo_api','partner_email'))
                         default 'manual',

  -- Free-text note (e.g. "MOMO quoted via email 2026-04-15 — pending counter-signature")
  note                 text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- At least one rate dimension must be priced.
  constraint container_costs_has_rate check (
    rate_per_cbm_thb is not null or rate_per_kg_thb is not null
  ),
  -- Effective window sanity.
  constraint container_costs_window_ok check (
    effective_to is null or effective_to >= effective_from
  )
);

-- Lookup index for the common "find the rate for this (carrier, mode,
-- origin, destination, container_type) at this date" query.
create index if not exists container_costs_lookup_idx
  on public.container_costs(carrier_name, transport_mode, origin, destination, container_type, effective_from desc);

-- Currently-active rows index (effective_to is null = open-ended).
create index if not exists container_costs_active_idx
  on public.container_costs(carrier_name, transport_mode) where effective_to is null;

drop trigger if exists container_costs_updated_at_trigger on public.container_costs;
create trigger container_costs_updated_at_trigger
  before update on public.container_costs
  for each row execute function public.set_updated_at();

comment on table  public.container_costs is
  'U2-2 / G-1: carrier rate card. Most-specific match by (carrier, mode, origin, destination, container_type) within the effective window = expected cost basis for a container. Feeds R-7 margin reconciliation later. Pure rate input — actual disbursements live in container_disbursements.';
comment on column public.container_costs.carrier_name is
  'Free-text carrier identifier (e.g. MOMO, COSCO, TTP, EVERGREEN). Will FK to a carriers master once locked.';
comment on column public.container_costs.fuel_surcharge_pct is
  'Percentage uplift on top of base rate (rate_per_cbm × (1 + fuel_surcharge_pct/100)). Stored on rate row because it is rate-relative, not a fixed amount.';
comment on column public.container_costs.effective_to is
  'NULL = currently active rate. Setting this to a date archives the row when a new rate replaces it.';
comment on constraint container_costs_has_rate on public.container_costs is
  'At least one of rate_per_cbm_thb or rate_per_kg_thb must be set — a row with no rate is unusable.';

-- ── 2) container_disbursements (AP ledger) ──────────────────────────

create table if not exists public.container_disbursements (
  id                   uuid primary key default gen_random_uuid(),

  -- The container this outflow is against. Cascade on container delete
  -- because a container that gets reset shouldn't leave orphan AP rows
  -- — admin deletes are gated to super only via the table CHECK in
  -- cargo_containers (no policy here).
  cargo_container_id   uuid not null references public.cargo_containers(id) on delete cascade,

  -- Outflow category. Aligned with legacy tb_bill_item kinds + the
  -- common Pacred cost dictionary.
  kind                 text not null check (kind in (
                          'freight',        -- main shipping (the carrier's freight bill)
                          'customs_duty',   -- import duty + VAT at clearance
                          'handling',       -- THC, port handling, warehouse-in/out fees
                          'fuel',           -- standalone fuel surcharge (when not baked into freight)
                          'storage',        -- ค่าเช่า / demurrage / detention
                          'trucking',       -- domestic THB trucking (CN-side OR TH-side)
                          'other'           -- everything else; free-text note required
                       )),

  amount_thb           numeric(12,2) not null check (amount_thb > 0),

  -- Who got paid (free-text vendor name, e.g. 'COSCO', 'Pacred ทีมรถ',
  -- 'กรมศุลกากร'). Same pattern as legacy tb_bill_item.
  vendor_name          text not null,

  -- Vendor's invoice / receipt number for cross-reference.
  invoice_no           text,

  -- When the money actually moved out. NULL = recorded but not yet paid
  -- (V1.1 may add a status enum; for now timestamp-presence = paid).
  paid_at              timestamptz,

  -- Admin who recorded the disbursement. Same FK pattern as
  -- cargo_container_status_history.changed_by_admin — references
  -- profiles(id) because admins has composite PK (profile_id, role).
  paid_by_admin_id     uuid references public.profiles(id),

  -- Receipt scan in storage bucket 'disbursement-receipts'.
  -- Path: {cargo_container_id}/{file}.
  attachment_path      text,

  note                 text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- 'other' kind must carry a note so the entry is auditable.
  constraint container_disbursements_other_has_note check (
    kind <> 'other' or (note is not null and length(trim(note)) > 0)
  )
);

create index if not exists container_disbursements_container_paid_idx
  on public.container_disbursements(cargo_container_id, paid_at desc nulls last);
create index if not exists container_disbursements_kind_idx
  on public.container_disbursements(kind);
create index if not exists container_disbursements_vendor_idx
  on public.container_disbursements(vendor_name);

drop trigger if exists container_disbursements_updated_at_trigger on public.container_disbursements;
create trigger container_disbursements_updated_at_trigger
  before update on public.container_disbursements
  for each row execute function public.set_updated_at();

comment on table  public.container_disbursements is
  'U2-2 / G-2 / R-7: AP ledger — one row per ACTUAL outflow Pacred paid against a cargo_container. Distinct from container_costs (the expected rate-card cost). Sum of amount_thb here = container_costs_thb in the margin helper.';
comment on column public.container_disbursements.kind is
  'Outflow category aligned with legacy tb_bill_item: freight | customs_duty | handling | fuel | storage | trucking | other.';
comment on column public.container_disbursements.paid_at is
  'When the money moved out. NULL = recorded but pending payment (V1.1 may introduce an explicit status enum).';
comment on column public.container_disbursements.attachment_path is
  'Storage path inside bucket "disbursement-receipts". Pattern: {cargo_container_id}/{file}.';
comment on constraint container_disbursements_other_has_note on public.container_disbursements is
  'Disbursements of kind=other must carry a note explaining what they are (auditability — ADR-0014 pattern).';

-- ── 3) RLS ──────────────────────────────────────────────────────────

alter table public.container_costs         enable row level security;
alter table public.container_disbursements enable row level security;

-- container_costs: super + accounting WRITE
drop policy if exists container_costs_admin_write on public.container_costs;
create policy container_costs_admin_write
  on public.container_costs for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- container_costs: ops + sales_admin + warehouse READ (rate visibility for quotes/planning)
drop policy if exists container_costs_admin_read on public.container_costs;
create policy container_costs_admin_read
  on public.container_costs for select
  using (public.is_admin(array['super','accounting','ops','sales_admin','warehouse']));

-- container_disbursements: super + accounting WRITE + READ (finance-only — never customer-facing)
drop policy if exists container_disbursements_admin_all on public.container_disbursements;
create policy container_disbursements_admin_all
  on public.container_disbursements for all
  using      (public.is_admin(array['super','accounting']))
  with check (public.is_admin(array['super','accounting']));

-- ── 4) Storage bucket 'disbursement-receipts' ───────────────────────
-- Private. Path pattern: {cargo_container_id}/{file}. Admin-only via
-- super + accounting policies; no customer access path.

insert into storage.buckets (id, name, public)
values ('disbursement-receipts', 'disbursement-receipts', false)
on conflict (id) do nothing;

drop policy if exists "disbursement_receipts_admin_read" on storage.objects;
create policy "disbursement_receipts_admin_read"
  on storage.objects for select
  using (
    bucket_id = 'disbursement-receipts'
    and public.is_admin(array['super','accounting'])
  );

drop policy if exists "disbursement_receipts_admin_write" on storage.objects;
create policy "disbursement_receipts_admin_write"
  on storage.objects for insert
  with check (
    bucket_id = 'disbursement-receipts'
    and public.is_admin(array['super','accounting'])
  );

drop policy if exists "disbursement_receipts_admin_update" on storage.objects;
create policy "disbursement_receipts_admin_update"
  on storage.objects for update
  using (
    bucket_id = 'disbursement-receipts'
    and public.is_admin(array['super','accounting'])
  );

drop policy if exists "disbursement_receipts_admin_delete" on storage.objects;
create policy "disbursement_receipts_admin_delete"
  on storage.objects for delete
  using (
    bucket_id = 'disbursement-receipts'
    and public.is_admin(array['super','accounting'])
  );

-- ── 5) Verify (counts) ─────────────────────────────────────────────
do $$
declare
  costs_rls   int;
  disb_rls    int;
begin
  select count(*) into costs_rls
    from pg_policies where schemaname = 'public' and tablename = 'container_costs';
  select count(*) into disb_rls
    from pg_policies where schemaname = 'public' and tablename = 'container_disbursements';
  if costs_rls < 2 then
    raise warning 'container_costs RLS expected >= 2 policies, found %', costs_rls;
  end if;
  if disb_rls < 1 then
    raise warning 'container_disbursements RLS expected >= 1 policy, found %', disb_rls;
  end if;
  raise notice 'U2-2 ready — container_costs % policies, container_disbursements % policies', costs_rls, disb_rls;
end$$;


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0070_supervisory_layer.sql                                     ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- U4-1 (Poom split) — Admin supervisory layer (cron-health + notification delivery log)
-- ════════════════════════════════════════════════════════════
-- Implements TWO sub-items of U4-1 (docs/UPGRADE_PLAN.md §4):
--   1. cron-health panel  → new public.cron_invocations log table
--   2. notification delivery log → adds delivery_status + delivery_error
--      columns to the existing public.notifications table
--
-- Both are super-side supervisory; ship together for a single apply step.
--
-- ── Decisions ──────────────────────────────────────────────────────
-- - cron_invocations is append-only — every cron run writes ONE row at
--   end (or two: pre/post — see lib/cron/instrument.ts).
--   Index covers (cron_path, fired_at desc) for the per-cron last-fire
--   query that powers the /admin/system/crons cards.
-- - RLS: SELECT for super + ops; service_role writes from the cron
--   wrapper (bypasses RLS). No customer access.
-- - notifications.delivery_status is nullable. Existing rows pre-this
--   migration have NULL; the UI treats NULL as "legacy / unknown" and
--   defaults the display to 'delivered' when delivered_line_at IS NOT
--   NULL OR delivered_email_at IS NOT NULL. The new column is the
--   forward-looking signal for the queue worker (post-U4-1).
-- - Idempotent + additive; safe to re-run.
-- ════════════════════════════════════════════════════════════

-- ── 1) cron_invocations ────────────────────────────────────────────

create table if not exists public.cron_invocations (
  id              uuid primary key default gen_random_uuid(),

  -- Matches the path entry in vercel.json (and lib/cron/registry.ts).
  --   '/api/cron/sms-balance-check'
  --   '/api/cron/auto-cancel-orders'
  cron_path       text not null,

  -- When the handler started.
  fired_at        timestamptz not null default now(),

  -- When the handler returned (NULL if pre-row, populated on the post-row).
  finished_at     timestamptz,
  duration_ms     int,

  -- Lifecycle: 'success' (handler returned ok) | 'failure' (threw / explicit
  -- failure) | 'partial' (some items succeeded, some failed — e.g. broadcast
  -- fan-out where 1k inserted + 50 failed).
  status          text not null check (status in ('success','failure','partial')),

  -- Per-cron meta (e.g. { sent: 5, failed: 0 } or { cancelled: 3 }). Free-form.
  result_summary  jsonb,

  -- Error string when status='failure' or 'partial' for the failed batch.
  error_message   text,

  created_at      timestamptz not null default now()
);

create index if not exists cron_invocations_path_fired_idx
  on public.cron_invocations(cron_path, fired_at desc);

create index if not exists cron_invocations_status_idx
  on public.cron_invocations(status, fired_at desc) where status <> 'success';

comment on table public.cron_invocations is
  'U4-1: append-only log of every Vercel cron invocation, written by lib/cron/instrument.ts. Powers /admin/system/crons (last fire + 7-day success rate + last error).';
comment on column public.cron_invocations.cron_path is
  'Matches vercel.json cron path entry (e.g. /api/cron/sms-balance-check). Joined with lib/cron/registry.ts for schedule + label.';
comment on column public.cron_invocations.status is
  'success | failure | partial. partial = handler completed but with internal item-level failures (see result_summary).';

-- ── 2) cron_invocations RLS ────────────────────────────────────────

alter table public.cron_invocations enable row level security;

-- SELECT: super + ops (ops needs to see cron health for the operational
-- modules they run — forwarder cancellations, driver expiry, etc).
drop policy if exists "cron_invocations_admin_select" on public.cron_invocations;
create policy "cron_invocations_admin_select" on public.cron_invocations
  for select using (public.is_admin(array['super','ops']));

-- INSERT/UPDATE/DELETE go through the service_role admin client from
-- lib/cron/instrument.ts (RLS bypassed). We intentionally don't grant
-- a table-level write policy — keeps the surface tight.

-- ── 3) notifications.delivery_status + delivery_error ──────────────

alter table public.notifications
  add column if not exists delivery_status text
  check (delivery_status is null or delivery_status in ('pending','delivered','failed','read'));

alter table public.notifications
  add column if not exists delivery_error text;

create index if not exists notifications_delivery_status_idx
  on public.notifications(delivery_status, created_at desc)
  where delivery_status is not null;

comment on column public.notifications.delivery_status is
  'U4-1: per-row delivery lifecycle. NULL = legacy row (treat as delivered if delivered_line_at OR delivered_email_at is set). pending | delivered | failed | read.';
comment on column public.notifications.delivery_error is
  'U4-1: error string on failed delivery (LINE push failure / email send failure). NULL when delivery succeeded.';

-- ── 4) Verify (counts) ─────────────────────────────────────────────

do $$
declare
  rls_count    int;
  delivery_col int;
begin
  select count(*) into rls_count
    from pg_policies
   where schemaname = 'public' and tablename = 'cron_invocations';
  if rls_count < 1 then
    raise warning 'cron_invocations RLS expected ≥ 1 policy, found %', rls_count;
  else
    raise notice 'U4-1 cron_invocations ready — % RLS policies installed', rls_count;
  end if;

  select count(*) into delivery_col
    from information_schema.columns
   where table_schema='public' and table_name='notifications' and column_name='delivery_status';
  if delivery_col = 0 then
    raise warning 'notifications.delivery_status missing after migration';
  else
    raise notice 'U4-1 notifications.delivery_status column ready';
  end if;
end$$;


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0071_customer_credit_line.sql                                  ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- U4-2 · Customer credit line (เครดิตสินค้า / pay-later)
-- ════════════════════════════════════════════════════════════
-- Per docs/UPGRADE_PLAN.md §4 U4-2:
--
--   "Customer credit line — profiles.credit_limit + a credit-charge
--    ledger kind + an outstanding-credit view + a 'pay my credit' action;
--    lights up the dead wallet.credit_balance UI. A real revenue feature
--    legacy customers expect."
--
-- ── The picture ─────────────────────────────────────────────────────
-- Pacred's PHP system had per-customer pay-later. Customers ordered;
-- back office tracked the running tab; customer settled within N days
-- via bank transfer. In Pacred-web today, profiles already carries
-- credit_limit / credit_days / credit_enabled (migration 0003 column-
-- preserved from the PHP port), but NOTHING uses them — the wallet UI
-- has a "เครดิต" panel wired to wallet.credit_balance that always
-- reads 0 because no code ever writes to that bucket.
--
-- This migration lights up the feature end-to-end at the DB layer:
--
--   1. Extends wallet_transactions.kind with two new values:
--        credit_charge        — customer used credit (negative debit,
--                                bucket='credit'). Increases outstanding.
--        credit_payment       — customer paid back outstanding (positive
--                                credit, bucket='credit'). Decreases it.
--        wallet_to_credit_transfer — settlement of a credit_payment from
--                                the customer's main wallet (negative
--                                debit, bucket='main'). Paired 1:1 with
--                                a credit_payment row that has the same
--                                reference_id (the pair_id).
--
--   2. Adds reference_type='credit_settlement' so the
--      wallet_to_credit_transfer + credit_payment pair can share a
--      reference_id (the credit_payment row's id). This is the
--      idempotency anchor: partial-unique on the slice prevents the
--      same settlement happening twice.
--
--   3. Creates v_customer_credit_outstanding — the source of truth for
--      "how much does customer X owe right now". Per-row SUM over
--      bucket='credit' completed txns (credit_charge is negative,
--      credit_payment is positive). Flipped to positive (owed amount)
--      for display. RLS via security_invoker so a customer only sees
--      their own row.
--
--   4. Adds profiles.credit_terms_days alias semantic guard — the
--      existing migration 0003 column `credit_days` is the canonical
--      term-days field. We keep that name; UI labels it "ระยะเครดิต
--      (วัน)" / "Credit terms (days)". No schema change for terms —
--      this comment exists so a future agent doesn't add a duplicate
--      column from the upgrade-plan wording.
--
--   5. Partial-unique guard on the settlement pair so a double-click /
--      retry of customerPayCreditFromWallet can't double-debit. Mirrors
--      the 0049 / 0061 / 0063 pattern: keyed on the pair_id slice.
--
-- ── What we do NOT do ───────────────────────────────────────────────
-- - We do NOT touch the dead `wallet.credit_balance` column. The
--   0007 balance trigger will keep recomputing it from the new
--   bucket='credit' txns automatically (sum of completed) — so it
--   becomes the running NET (credit_payment - credit_charge = the
--   NEGATIVE of outstanding, or zero if fully settled). The VIEW is
--   the authoritative read surface for outstanding; the column stays
--   as a side-effect ledger sum, NOT a thing we update directly.
-- - We do NOT touch profiles.credit_limit (column already exists from
--   migration 0003 with numeric(10,2)). Admin write goes through
--   adminSetCustomerCreditLimit which respects the 0062 W-1 role pin.
-- - We do NOT add a separate `credit_transactions` table. Keeping
--   the ledger unified means existing wallet history UI, audit
--   triggers (0062 G-6), overdraw guard (0064), and admin reports
--   all pick up credit txns for free. See migration footer for the
--   "open question" record.
--
-- ── RLS / W-1 ───────────────────────────────────────────────────────
-- Per AGENTS.md §1 + migration 0062: every admin policy on a money
-- table MUST be role-pinned (no bare is_admin()). We add no new
-- policies on wallet / wallet_transactions — the existing 0062 admin
-- policies cover the new credit txns automatically because RLS is
-- per-row, not per-kind. profiles.credit_limit writes already gated
-- by the 0062 profiles_admin_all (super, ops, accounting, sales_admin)
-- policy; the action layer further narrows to super+accounting for
-- credit-limit changes specifically.
--
-- Idempotent: drop-if-exists / create-or-replace / additive index.
-- Zero data migration. Safe to apply on prod live.
-- ════════════════════════════════════════════════════════════

-- ── 1) Extend wallet_transactions.kind CHECK with credit values ────
-- Mirrors 0061 pattern: drop the auto-named CHECK, recreate as strict
-- superset so re-applying never rejects existing rows.
alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_kind_check;

alter table public.wallet_transactions
  add constraint wallet_transactions_kind_check check (kind in (
    'deposit','withdraw','refund','adjustment',
    'order_payment','order_top_up',
    'import_payment','import_top_up',
    'yuan_payment',
    'cashback_earn','cashback_redeem',
    'cost_adjustment',
    -- U4-2 credit-line ledger values:
    'credit_charge',              -- bucket='credit', amount<0 (debit). Customer used credit.
    'credit_payment',             -- bucket='credit', amount>0 (credit). Customer paid back.
    'wallet_to_credit_transfer'   -- bucket='main',   amount<0 (debit). Main-wallet leg of settlement.
  ));

comment on constraint wallet_transactions_kind_check on public.wallet_transactions is
  '0071/U4-2 — extends 0061 with credit_charge + credit_payment + wallet_to_credit_transfer for customer credit line. Pair (credit_payment, wallet_to_credit_transfer) share reference_id = the credit_payment row id; wallet_tx_credit_settlement_uniq enforces 1 pair per settlement.';

-- ── 2) Extend wallet_transactions.reference_type with credit_settlement ──
-- Mirrors 0063 pattern. The pair (credit_payment on bucket='credit',
-- wallet_to_credit_transfer on bucket='main') uses reference_type=
-- 'credit_settlement' so they're queryable as a unit. reference_id =
-- the credit_payment row id (the canonical pair_id).
alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_reference_type_check;

alter table public.wallet_transactions
  add constraint wallet_transactions_reference_type_check check (
    reference_type in (
      'order_header','forwarder','yuan_payment','freight_invoice','manual',
      'credit_settlement'
    )
  );

comment on constraint wallet_transactions_reference_type_check on public.wallet_transactions is
  '0071/U4-2 — extends 0063 with credit_settlement. The (credit_payment, wallet_to_credit_transfer) pair share reference_id = the credit_payment row id (the canonical pair anchor).';

-- ── 3) profiles.credit_terms_days note ─────────────────────────────
-- Migration 0003 already added `credit_days int` (the canonical
-- term-days column). The upgrade-plan wording "credit_terms_days"
-- maps to it. We add a column comment so future agents don't add a
-- duplicate column from the spec wording.
comment on column public.profiles.credit_days is
  '0071/U4-2 — payment terms in days for the customer credit line (was tb_users.creditDay in PHP). The upgrade-plan calls this credit_terms_days; same field. Default 30 when credit_limit > 0 (set by adminSetCustomerCreditLimit).';

comment on column public.profiles.credit_limit is
  '0071/U4-2 — maximum outstanding credit (THB) a customer may carry. The upgrade-plan calls this credit_limit_thb; same field. v_customer_credit_outstanding enforces outstanding <= credit_limit at write time via adminChargeToCredit.';

-- ── 4) Outstanding-credit view — single source of truth for "owed" ─
-- Per-profile aggregate of completed bucket='credit' txns, flipped to
-- positive ("owed amount"). credit_charge rows are negative (debit);
-- credit_payment rows are positive (credit) — sum is the running NET
-- the customer's wallet.credit_balance also tracks. We flip sign so a
-- positive outstanding_thb reads naturally as "customer owes us".
--
-- security_invoker = on means RLS on the underlying tables applies as
-- the caller (per Supabase view RLS norm). So:
--   - customer reads only their own row (wallet_tx select policy +
--     profiles select policy both gate by auth.uid())
--   - admins read all rows (0062 admin SELECT policies on the same
--     tables let through their role array)
-- The view itself takes no policies — they live on the base tables.
drop view if exists public.v_customer_credit_outstanding;

create view public.v_customer_credit_outstanding
  with (security_invoker = true)
as
select
  p.id                                                       as profile_id,
  p.credit_limit                                             as credit_limit_thb,
  coalesce(p.credit_days, 30)                                as credit_terms_days,
  -- Sum of completed bucket='credit' txns:
  --   credit_charge  → negative (e.g. -500)
  --   credit_payment → positive (e.g. +500)
  -- Net is the customer's running credit_balance (also held in
  -- wallet.credit_balance via the 0007 trigger). We flip the sign so
  -- a POSITIVE outstanding_thb = "customer owes Pacred this much".
  -- coalesce so a customer with zero credit txns reads 0.
  (-coalesce(
    (
      select sum(wt.amount)
        from public.wallet_transactions wt
       where wt.profile_id = p.id
         and wt.bucket     = 'credit'
         and wt.kind       in ('credit_charge', 'credit_payment')
         and wt.status     = 'completed'
    ),
    0
  ))::numeric(12,2)                                          as outstanding_thb,
  -- Available credit headroom = limit - outstanding (negative means
  -- they're over-limit; UI surfaces that as a warning, write actions
  -- refuse to push further).
  (p.credit_limit + coalesce(
    (
      select sum(wt.amount)
        from public.wallet_transactions wt
       where wt.profile_id = p.id
         and wt.bucket     = 'credit'
         and wt.kind       in ('credit_charge', 'credit_payment')
         and wt.status     = 'completed'
    ),
    0
  ))::numeric(12,2)                                          as available_credit_thb
from public.profiles p
where p.credit_limit > 0
   or exists (
        select 1
          from public.wallet_transactions wt
         where wt.profile_id = p.id
           and wt.bucket     = 'credit'
           and wt.kind       in ('credit_charge', 'credit_payment')
       );

comment on view public.v_customer_credit_outstanding is
  '0071/U4-2 — single source of truth for customer credit-line state. Per-profile: credit_limit_thb, credit_terms_days, outstanding_thb (positive = owed), available_credit_thb (limit - outstanding). security_invoker so RLS on profiles + wallet_transactions enforces: customer reads own row, admins read all. Filters to profiles with a non-zero limit OR existing credit activity to keep the view small.';

-- ── 5) Partial-unique guard on settlement pair ─────────────────────
-- Each (credit_payment, wallet_to_credit_transfer) pair shares
-- reference_id = the credit_payment row id (the pair anchor). To
-- guarantee a customer's double-click / network retry / form re-POST
-- can NEVER double-debit the main wallet, partial-unique the
-- wallet_to_credit_transfer slice on (reference_id) — only one
-- completed transfer per pair-id is allowed.
-- (We don't unique the credit_payment side itself because that one
--  *generates* the reference_id; it has no prior id to conflict on.)
create unique index if not exists wallet_tx_credit_settlement_uniq
  on public.wallet_transactions (reference_id)
  where reference_type = 'credit_settlement'
    and kind           = 'wallet_to_credit_transfer'
    and status         = 'completed';

comment on index public.wallet_tx_credit_settlement_uniq is
  '0071/U4-2 — DB guard against double-debit on customerPayCreditFromWallet. Partial unique on the wallet_to_credit_transfer slice per settlement pair_id (reference_id = the credit_payment row id). The action catches 23505 + re-SELECTs the canonical pair for idempotent retry.';

-- ── Notes / open questions captured in code ────────────────────────
-- Q: kind expansion vs separate credit_transactions table?
-- A: Kind expansion. Reasons:
--    - Reuses 0062 G-6 audit trigger (every wallet_transactions write
--      gets logged to admin_audit_log — credit txns inherit for free)
--    - Reuses 0064 overdraw guard (the wallet_to_credit_transfer leg
--      hits the main-bucket guard automatically — no parallel guard
--      to maintain)
--    - Reuses wallet history UI (the /wallet/history page renders
--      credit txns by reading the same table; we add labels not code)
--    - Customer credit_balance is already a column on wallet (0007)
--      kept in sync by the existing recompute trigger — separate
--      table would mean dead-column or duplicate-source-of-truth
--    A separate credit_transactions table would force every one of
--    those to grow a credit-aware branch. The 3-kind expansion gives
--    us the feature with zero parallel infrastructure. Documented
--    here so a future redesign has the rationale.


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0072_wallet_self_serve_amount_sign_guard.sql                   ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- C-1 fix · wallet_tx_insert_self_serve — bind amount sign to kind
-- ════════════════════════════════════════════════════════════
-- Per `docs/research/audit-core-2026-05-18.md` §3 C-1 (P1, launch
-- week). The original `wallet_tx_insert_self_serve` RLS (migration
-- `0007`) constrains profile / status / kind / bucket but **never the
-- sign of `amount`**. A direct PostgREST self-insert with
-- `kind='withdraw', amount=+50000, status='pending'` slips through;
-- if any admin later approves it (`pending → completed`), the
-- `0007_wallet.sql` recompute trigger sums the +50000 and inflates
-- `wallet.balance` with money that never entered Pacred.
--
-- The application actions are disciplined (createDeposit inserts
-- +amount, createWithdraw inserts -d.amount, lib/validators/wallet.ts
-- forces positive input) — but RLS is the ONLY gate when the write
-- bypasses the action layer.
--
-- ── Fix (this migration) ───────────────────────────────────
-- Re-create the policy with an additional sign predicate:
--   - kind='deposit'  → amount > 0   (always a credit)
--   - kind='withdraw' → amount < 0   (always a debit)
--
-- Plus a defence-in-depth table-level CHECK (`wallet_tx_kind_sign_chk`)
-- enforcing the same rule for EVERY insert path (admin actions, refund
-- credits via 'refund' kind, etc.) — so a future careless action OR a
-- direct service-role write also cannot slip a sign mismatch through.
--
-- The CHECK only constrains the two app-controlled signed kinds — it
-- does NOT constrain other kinds (order_payment, import_payment,
-- credit_charge, refund, etc.) because they are admin-issued and have
-- their own sign rules per business logic.
--
-- Idempotent · additive. Zero data migration (existing rows already
-- satisfy the rule because actions enforce it).
-- ════════════════════════════════════════════════════════════

-- ── 1) Replace the RLS INSERT policy with sign-aware predicate ─────

drop policy if exists "wallet_tx_insert_self_serve" on public.wallet_transactions;
create policy "wallet_tx_insert_self_serve" on public.wallet_transactions
  for insert with check (
    auth.uid() = profile_id
    and status  = 'pending'
    and bucket  = 'main'
    and (
      (kind = 'deposit'  and amount > 0)
      or (kind = 'withdraw' and amount < 0)
    )
  );

comment on policy "wallet_tx_insert_self_serve" on public.wallet_transactions is
  'C-1 fix (P1 from audit-core-2026-05-18 §3): tightened to bind amount sign to kind. A deposit MUST be a positive credit; a withdraw MUST be a negative debit. Closes the +50000 sign-flip self-serve exploit.';

-- ── 2) Defence-in-depth table CHECK on signed kinds ────────────────
-- This is the belt-and-suspenders backup for the RLS policy. If
-- a future action OR service-role direct insert ever passes a
-- wrong-signed amount for the two signed self-serve kinds, the
-- CHECK fires server-side (regardless of who is writing).
--
-- DROP + ADD to make re-application idempotent. The ADD will fail
-- if any pre-existing row violates the rule (rare but real
-- compatibility check); if that happens, the rows must be repaired
-- manually before this migration completes.

alter table public.wallet_transactions
  drop constraint if exists wallet_tx_kind_sign_chk;

alter table public.wallet_transactions
  add constraint wallet_tx_kind_sign_chk check (
    case
      when kind = 'deposit'  then amount > 0
      when kind = 'withdraw' then amount < 0
      else true                              -- other kinds: not constrained here
    end
  );

comment on constraint wallet_tx_kind_sign_chk on public.wallet_transactions is
  'C-1 defence-in-depth: deposit must credit (amount > 0); withdraw must debit (amount < 0). All other kinds (order_payment, refund, credit_charge, etc.) unconstrained here — they have business-rule signs enforced in the issuing action.';

-- ── 3) Verify (one-row count) ──────────────────────────────────────

do $c1$
declare
  violation_count int;
begin
  -- Defensive sanity check — if ANY existing rows would violate the
  -- new CHECK, the ADD CONSTRAINT above would have raised. Belt-and-
  -- suspenders: count again and warn if non-zero (should be 0).
  select count(*) into violation_count
    from public.wallet_transactions
   where (kind = 'deposit'  and amount <= 0)
      or (kind = 'withdraw' and amount >= 0);

  if violation_count > 0 then
    raise warning
      'C-1 verify: % wallet_transactions row(s) violate the new sign rule. Inspect + repair manually.',
      violation_count;
  else
    raise notice
      'C-1 verify: 0 sign violations. wallet_tx_insert_self_serve + wallet_tx_kind_sign_chk now enforced.';
  end if;
end
$c1$;


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0073_delivery_acknowledgement.sql                              ║
-- ╚══════════════════════════════════════════════════════════════════╝
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


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0074_yuan_refund_slip.sql                                      ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- G-5 fix · yuan_payments refund slip + metadata
-- ════════════════════════════════════════════════════════════
-- Per `docs/research/gap-schema-security.md` G-5 — today admin can
-- transition a yuan_payment to status='refunded' via
-- adminUpdateYuanPayment WITHOUT attaching proof of the refund or
-- recording who/when. The wallet-paid path reverses the debit
-- correctly (audit-core-2026-05-18 §2 H-2), but the slip-only path
-- has no audit-grade evidence the money actually went back to the
-- customer. Accounting reconciliation cannot tie the refund to a
-- bank-statement entry.
--
-- Three additive nullable columns close the loop:
--   refund_slip_path        text  — storage key in 'slips' bucket
--                                   under yuan-refunds/{id}/{ts}.{ext}
--   refunded_at             timestamptz — stamped by the action
--   refunded_by_admin_id    uuid  — profile_id of the acting admin
--
-- The new adminMarkYuanPaymentRefunded action (this batch) requires
-- the slip + stamps both timestamps and admin id atomically. The
-- legacy adminUpdateYuanPayment refund branch stays callable (used
-- by older flows) but is now considered the unproved-refund path —
-- a follow-up migration may make the new fields NOT NULL once all
-- callers route through the new action.
--
-- Storage: reuses the existing 'slips' private bucket (migration
-- 0007). Path pattern: yuan-refunds/{yuan_payment_id}/{timestamp}.{ext}.
-- The admin-side action writes via service_role so the existing per-
-- user RLS policies (which scope path[1] to auth.uid()) don't apply —
-- the path prefix is "yuan-refunds" which no user owns, so a customer
-- bypassing the action cannot self-insert there even if RLS opened.
--
-- Idempotent + additive. No data migration.
-- ════════════════════════════════════════════════════════════

alter table public.yuan_payments
  add column if not exists refund_slip_path     text,
  add column if not exists refunded_at          timestamptz,
  add column if not exists refunded_by_admin_id uuid references public.profiles(id);

create index if not exists yuan_payments_refunded_at_idx
  on public.yuan_payments(refunded_at) where refunded_at is not null;

comment on column public.yuan_payments.refund_slip_path is
  'G-5: storage key (slips bucket) of the bank-transfer slip proving the refund actually moved money back to the customer. Path layout: yuan-refunds/{yuan_payment_id}/{timestamp}.{ext}. NULL = legacy/un-proved refund.';
comment on column public.yuan_payments.refunded_at is
  'G-5: timestamp the refund slip was attached + admin marked the row refunded via adminMarkYuanPaymentRefunded. Distinct from updated_at (touched on every edit).';
comment on column public.yuan_payments.refunded_by_admin_id is
  'G-5: profile_id of the admin (super/accounting) who attached the refund slip + stamped refunded_at. NULL = legacy/un-proved refund.';

-- ── Storage RLS — explicit admin write under yuan-refunds/ prefix ─
-- The 'slips' bucket policies in 0007 only allow auth.uid() == path[1]
-- writes. yuan-refunds/{yuan_payment_id}/... uses a UUID as the first
-- folder which never matches a user, so no customer can write there via
-- the user-scoped policies. The admin path uses the service role via
-- createAdminClient and bypasses RLS, so no extra storage policy is
-- needed. This block exists only to document the intent + future-proof
-- against a "let yuan_payment.profile_id read its own refund slip"
-- customer-side feature (currently OUT OF SCOPE).
--
-- Future extension (commented):
--   create policy "yuan_refunds_owner_read" on storage.objects
--     for select using (
--       bucket_id = 'slips'
--       and (storage.foldername(name))[1] = 'yuan-refunds'
--       and (storage.foldername(name))[2]::uuid in (
--         select id from public.yuan_payments where profile_id = auth.uid()
--       )
--     );

do $g5$
begin
  raise notice
    'G-5 (0074): yuan_payments now has refund_slip_path + refunded_at + refunded_by_admin_id (all nullable). New action adminMarkYuanPaymentRefunded enforces slip + stamps fields atomically.';
end
$g5$;


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0075_admin_impersonation.sql                                   ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- 0075 · G-4 — Admin impersonation (view-as-customer, read-only)
-- ════════════════════════════════════════════════════════════
-- Source: docs/research/gap-admin.md G-4 — support + ops can see
-- EXACTLY what a customer sees, without phoning, without
-- screenshare. Today every "ลูกค้าบอกว่าหน้าจอขึ้นแบบนี้" call
-- is blind because admin pages don't render in the customer
-- viewport.
--
-- ── Design ──────────────────────────────────────────────────
-- An impersonation_session row is created by adminBeginImpersonation
-- (super OR ops). A cookie `pacred_impersonating` carries a signed
-- payload {admin_id, target_profile_id, session_id, expires_at}.
-- lib/auth/get-user.ts `getEffectiveUser()` looks at the cookie,
-- re-verifies the admin still has super/ops role + the session is
-- still active + not expired, and returns the TARGET profile (with
-- `_impersonating: true` flag). All RLS-scoped customer reads
-- happen as if the target customer is signed in.
--
-- ── HARD CONSTRAINT: WRITES BLOCKED ─────────────────────────
-- Impersonation is a READ-ONLY tool. Every server action that
-- mutates checks `getEffectiveUser()._impersonating` and refuses
-- with `cannot_write_during_impersonation`. This is enforced in
-- app code (lib/auth/impersonation.ts assertNotImpersonating).
-- We do NOT need a DB-level write-block because the admin auth
-- cookie is still that of the admin — RLS on customer tables
-- already requires the row to be either self-owned (by auth.uid())
-- or admin-overridden. The cookie remap is a UI/action concern.
--
-- ── Schema ──────────────────────────────────────────────────
-- One row per impersonation session. Append-only audit-style
-- (no UPDATE on row content other than setting ended_at +
-- exit_reason at session close).
-- ════════════════════════════════════════════════════════════

create table if not exists public.impersonation_sessions (
  id                 uuid primary key default gen_random_uuid(),
  admin_id           uuid not null references public.profiles(id) on delete restrict,
  target_profile_id  uuid not null references public.profiles(id) on delete restrict,
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  expires_at         timestamptz not null,
  exit_reason        text check (exit_reason in ('manual','expired','admin_role_lost')),
  created_at         timestamptz not null default now()
);

comment on table public.impersonation_sessions is
  'G-4 — admin view-as-customer sessions. One row per session. Read-only — admin cannot mutate during impersonation; assertNotImpersonating() in lib/auth/impersonation.ts enforces.';

create index if not exists impersonation_sessions_admin_idx
  on public.impersonation_sessions(admin_id, started_at desc);
create index if not exists impersonation_sessions_target_idx
  on public.impersonation_sessions(target_profile_id, started_at desc);
create index if not exists impersonation_sessions_active_idx
  on public.impersonation_sessions(admin_id)
  where ended_at is null;

-- ════════════════════════════════════════════════════════════
-- RLS — super read all; ops/etc. read only own sessions
-- ════════════════════════════════════════════════════════════
-- Customers never have access. Service-role bypasses RLS so
-- adminBeginImpersonation / adminEndImpersonation can write via
-- createAdminClient. We deliberately do NOT add insert/update/
-- delete policies — those go through the service-role admin
-- client + withAdmin role gate.
alter table public.impersonation_sessions enable row level security;

drop policy if exists "impersonation_sessions_select_own" on public.impersonation_sessions;
create policy "impersonation_sessions_select_own" on public.impersonation_sessions
  for select
  using (
    public.is_admin(array['super'])
    or (admin_id = auth.uid() and public.is_admin(array['ops','accounting','sales_admin']))
  );

-- audit events written by adminBeginImpersonation + adminEndImpersonation
-- via logAdminAction:
--   admin.impersonation_begin  (target_type='profile', target_id=target_profile_id)
--   admin.impersonation_end    (target_type='profile', target_id=target_profile_id)


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0076_business_config.sql                                       ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- 0076 · G-10 — Editable business config (super-only single source)
-- ════════════════════════════════════════════════════════════
-- Source: docs/research/gap-admin.md G-10 — every "magic constant"
-- today (OTP TTL, min-deposit amount, cashback %, bank account list,
-- feature flags like LIFF enabled) is a code constant. Admin can't
-- tweak without a dev push. Slows ops + creates the "ask dev" rut.
--
-- ── Design ──────────────────────────────────────────────────
-- One table, one source of truth. Key/value/type/category schema.
-- lib/business-config.ts:
--   - getBusinessConfig(key, defaultValue) — 60s in-memory cache,
--     returns the typed value; falls back to defaultValue on miss.
--   - setBusinessConfig(key, value) — service-role write +
--     invalidates the cache key.
-- adminUpdateBusinessConfig (super only) calls setBusinessConfig
-- + writes audit log with before/after.
--
-- Admin UI at /admin/settings/business-config — tabbed by category
-- (OTP / Wallet / Cashback / Banks / Features). Type-aware editor
-- (number/boolean/json) + validation.
--
-- ── Schema ──────────────────────────────────────────────────
-- value is jsonb — flexible enough for number, string, boolean,
-- array, object. value_type hints the editor + validator. Note
-- that jsonb numbers MUST be unwrapped via `value->>0`-style or
-- `(value)::numeric` cast at read; the lib helper does this.
-- ════════════════════════════════════════════════════════════

create table if not exists public.business_config (
  key                     text primary key,
  value                   jsonb not null,
  value_type              text not null check (
    value_type in ('number','string','boolean','json','currency_thb','percent','duration_ms')
  ),
  category                text,
  description             text,
  updated_by_admin_id     uuid references public.profiles(id) on delete set null,
  updated_at              timestamptz not null default now(),
  created_at              timestamptz not null default now()
);

comment on table public.business_config is
  'G-10 — admin-editable business constants. Read via lib/business-config.ts (60s cache). Write via actions/admin/business-config.ts adminUpdateBusinessConfig (super only). Seeded from in-code defaults; an unset key falls back to the call-site defaultValue so the system never breaks on a missing row.';

create index if not exists business_config_category_idx
  on public.business_config(category);

-- ════════════════════════════════════════════════════════════
-- RLS — super read+write; ops/etc. read (other admin pages may
-- call getBusinessConfig); customer no access.
-- ════════════════════════════════════════════════════════════
alter table public.business_config enable row level security;

drop policy if exists "business_config_select_admin" on public.business_config;
create policy "business_config_select_admin" on public.business_config
  for select
  using (public.is_admin(array['super','ops','accounting','sales_admin']));

-- Writes go through the service-role client (createAdminClient) +
-- withAdmin(["super"]) at the app layer, so no RLS write policy.
-- This matches the pattern in 0015 (admins, settings, etc).

-- ════════════════════════════════════════════════════════════
-- Seed defaults — idempotent (do nothing on conflict)
-- ════════════════════════════════════════════════════════════
-- Source of truth for these values is currently scattered: OTP TTL
-- in lib/auth/otp.test.ts (5 * 60 * 1000), wallet min/max in
-- lib/validators/wallet.ts (positive() + max(1_000_000)), bank
-- accounts in components/seo/site.ts, etc. Seeding HERE makes the
-- table the eventual source — call-site code should migrate to
-- getBusinessConfig(key, hardcoded_default) progressively. Until
-- then, the table is read-mostly + the defaults match today's
-- behaviour, so adopting the helper is a no-op.

insert into public.business_config (key, value, value_type, category, description) values
  ('otp.ttl_ms',                  to_jsonb(300000),                              'duration_ms',   'OTP',      'OTP code time-to-live (ms). Default 5 minutes.'),
  ('otp.rate_limit_per_hour',     to_jsonb(3),                                   'number',        'OTP',      'Max OTP requests per (phone, purpose) per rolling hour.'),
  ('wallet.deposit_min_thb',      to_jsonb(1),                                   'currency_thb',  'Wallet',   'Minimum allowed deposit amount (THB). Should match lib/validators/wallet.ts positive() floor.'),
  ('wallet.deposit_max_thb',      to_jsonb(1000000),                             'currency_thb',  'Wallet',   'Maximum allowed deposit amount (THB). Should match lib/validators/wallet.ts max(1_000_000).'),
  ('wallet.withdraw_min_thb',     to_jsonb(100),                                 'currency_thb',  'Wallet',   'Minimum allowed withdraw amount (THB).'),
  ('wallet.withdraw_max_thb',     to_jsonb(1000000),                             'currency_thb',  'Wallet',   'Maximum allowed withdraw amount (THB).'),
  ('cashback.default_pct',        to_jsonb(0),                                   'percent',       'Cashback', 'Default cashback percent applied to completed orders (0..100).'),
  ('banks.deposit_accounts',      '[]'::jsonb,                                   'json',          'Banks',    'Bank accounts shown on /wallet/deposit page. Array of {bank,account_no,account_name,active}.'),
  ('features.liff_enabled',       to_jsonb(false),                               'boolean',       'Features', 'LIFF (LINE Front-end Framework) flow on customer portal. Default off until DV-2 ships.'),
  ('features.china_search_demo',  to_jsonb(true),                                'boolean',       'Features', 'China-search demo mode (ADR-0003 Option E).')
on conflict (key) do nothing;


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0077_platform_incidents.sql                                    ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- 0077 · platform_incidents — IO-1 auto-incident capture + triage
-- ════════════════════════════════════════════════════════════
-- Source: docs/research/platform-observability-system-2026-05-18.md
--         §6 — Stage 1 (MVP / IO-1).
--
-- Migration number: 0077 is a เดฟ-RESERVED slot for the observability
-- system — ภูม owns 0073-0076 (delivery-ack / yuan-refund-slip /
-- impersonation / business-config) + 0078+. Do NOT renumber.
--
-- ── THE HOLE (§2.8 of the design doc) ───────────────────────
-- There is no React error boundary anywhere in app/, and no Pacred-
-- owned store that *collects* errors with a visible lifecycle status.
-- A client render error today shows the un-branded default Next.js
-- screen and is captured nowhere Pacred can query. The owner's ask —
-- "เจอบั๊กส่งเลย ไม่มีปุ่มส่ง · เห็นสถานะว่าส่งเรื่องแล้ว / กำลัง
-- ดำเนินการ" — needs an incident row that auto-captures (no button)
-- and carries an open→acknowledged→in_progress→resolved/ignored
-- lifecycle the user can see.
--
-- ── THE FIX (§6.2 — platform_incidents) ─────────────────────
-- ONE table. The capture rails (global-error.tsx boundary, the
-- Server-Action error wrapper, the Sentry webhook) all upsert here,
-- deduped by `fingerprint` — the SAME error fires N times → ONE row,
-- `occurrence_count` increments. Triage advances `status` through a
-- whitelisted lifecycle; the user who hit it sees that status.
--
-- It is a SEPARATE table from work_items (0080) — design doc §2.7:
-- an incident is auto-created (no human / no domain row), needs a
-- fingerprint + occurrence_count, has 'ignored' + 'acknowledged'
-- states work_items lacks, and its status is visible to the customer.
-- A triaged incident MAY spawn a work_item — work_item_id is the
-- optional bridge FK.
--
-- ── RLS (follows the 0062 role-pin keystone + 0080 posture) ──
-- Two audiences, two policy families — EXPLICIT is_admin(array[...])
-- role arrays, never bare is_admin() (the 0062 S-1 fix):
--   admin SELECT → super + every office/operational role can READ
--                  the triage queue (the owner/ก๊อต must see it).
--   customer SELECT → a signed-in user reads ONLY rows whose
--                  actor_ref matches their own redacted id — the
--                  "ปัญหาที่ฉันแจ้ง" panel. RLS is NARROWING: a
--                  customer sees fewer rows, never company data.
--   WRITE → no table-level write policy. Every insert/upsert/triage
--           write goes through the service-role admin client from a
--           requireAdmin-gated Server Action or an API route — the
--           same tight-surface discipline 0080 + 0062 use.
--
-- Idempotent + additive: create-if-not-exists, drop-if-exists on every
-- policy/trigger, the notifications CHECK swap is guarded. Zero data
-- migration. Adds no grants on existing tables. Safe on prod live.
-- ════════════════════════════════════════════════════════════

-- ── 1) platform_incidents ───────────────────────────────────────────
create table if not exists public.platform_incidents (
  id                 uuid primary key default gen_random_uuid(),

  -- ── Dedup key ──
  -- A stable hash of (kind, normalised message, route) computed by the
  -- ingest route (lib/observability/fingerprint.ts). The SAME error
  -- fires N times → ONE incident; occurrence_count increments. The
  -- partial-unique index below keeps exactly one *live* incident per
  -- fingerprint (resolved/ignored rows are excluded so a recurrence
  -- after a fix opens a fresh incident).
  fingerprint        text not null check (char_length(fingerprint) between 1 and 128),

  -- ── Which surface emitted it ──
  -- public  = the marketing site (no auth)
  -- portal  = the customer portal
  -- admin   = the back-office
  -- partner = a partner webhook (e.g. Sentry, MOMO)
  -- server  = a server-side / route-handler / cron error
  source             text not null check (source in (
                       'public','portal','admin','partner','server'
                     )),

  -- ── Error kind ──
  kind               text not null check (kind in (
                       'js_error',      -- client-side render / runtime error
                       'server_error',  -- a thrown server / route-handler error
                       'failed_action', -- a Server Action threw (withObservability)
                       'api_error'      -- a non-2xx from an API / partner call
                     )),

  -- ── Triage severity ──
  -- Set by an ingest-time rule (a money-path route → 'high'; a server
  -- 500 → 'high'; everything else → 'medium' default). 'critical' is
  -- reserved for the alert engine / manual escalation.
  severity           text not null default 'medium' check (severity in (
                       'low','medium','high','critical'
                     )),

  -- ── The lifecycle the owner asked for ──
  -- open         → captured, not yet triaged ("ส่งเรื่องแล้ว")
  -- acknowledged → a dev owns it            ("กำลังดำเนินการ")
  -- in_progress  → a fix is being worked    ("กำลังดำเนินการ")
  -- resolved     → fixed, resolution_note set ("แก้ไขแล้ว")
  -- ignored      → not a real bug — silently closed (not surfaced)
  status             text not null default 'open' check (status in (
                       'open','acknowledged','in_progress','resolved','ignored'
                     )),

  -- ── Human-facing fields ──
  title              text not null check (char_length(title) between 1 and 200),
  message            text not null check (char_length(message) between 1 and 4000),
  stack              text,                       -- PII-stripped; nullable
  route              text,                       -- the path it happened on

  -- ── Context — a small bag. NO cookies, NO auth headers, NO raw PII. ──
  -- browser/OS for js_error · action-name for failed_action · HTTP
  -- status for api_error. The capture rails strip cookies/auth headers
  -- (the sentry.*.config.ts beforeSend pattern).
  surface_meta       jsonb,

  -- ── Actor context — a ROLE + a REDACTED id, never an identity ──
  -- actor_role: 'customer' | an admins.role | 'partner' | 'anon'.
  -- actor_ref:  redactId(uid) — lets triage correlate "same user, 3
  --             incidents" and powers the customer "ปัญหาที่ฉันแจ้ง"
  --             RLS policy, WITHOUT storing who the user is.
  actor_role         text check (actor_role is null or actor_role in (
                       'customer','anon','partner',
                       'super','ops','accounting','sales_admin',
                       'warehouse','driver','interpreter'
                     )),
  actor_ref          text check (actor_ref is null or char_length(actor_ref) between 1 and 64),

  -- ── Dedup counters ──
  occurrence_count   int not null default 1 check (occurrence_count >= 1),
  first_seen         timestamptz not null default now(),
  last_seen          timestamptz not null default now(),

  -- ── Triage assignment + lifecycle stamps ──
  assigned_to        uuid references public.profiles(id) on delete set null,
  acknowledged_at    timestamptz,
  resolved_at        timestamptz,
  resolution_note    text check (resolution_note is null or char_length(resolution_note) between 1 and 2000),

  -- ── Bridge to a fix job (design doc §2.7) ──
  work_item_id       uuid references public.work_items(id) on delete set null,

  -- ── Deep-link to the Sentry issue, when the row came via the webhook ──
  sentry_issue_url   text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- ── Consistency CHECKs (fail-closed — the work_items / refund_requests
  --    posture). A resolved incident MUST carry its resolution. Any
  --    triaged incident (acknowledged and beyond) MUST carry an assignee
  --    + an acknowledged_at. last_seen never precedes first_seen. ──
  constraint platform_incidents_resolved_consistent check (
    status <> 'resolved'
    or (resolved_at is not null and resolution_note is not null)
  ),
  constraint platform_incidents_triaged_consistent check (
    status not in ('acknowledged','in_progress','resolved')
    or (acknowledged_at is not null and assigned_to is not null)
  ),
  constraint platform_incidents_seen_order check (
    last_seen >= first_seen
  )
);

-- ── 2) Indexes ──────────────────────────────────────────────────────
-- The triage queue's primary query — live incidents, newest re-fire first.
create index if not exists platform_incidents_status_seen_idx
  on public.platform_incidents(status, last_seen desc);

-- Dedup — exactly ONE live incident per fingerprint. resolved/ignored
-- rows are excluded so a recurrence after a fix opens a fresh incident.
create unique index if not exists platform_incidents_fingerprint_live_idx
  on public.platform_incidents(fingerprint)
  where status not in ('resolved','ignored');

-- Filtering the queue by surface / kind.
create index if not exists platform_incidents_source_kind_idx
  on public.platform_incidents(source, kind);

-- Per-user correlation + the customer "issues I hit" panel query.
create index if not exists platform_incidents_actor_idx
  on public.platform_incidents(actor_ref, last_seen desc)
  where actor_ref is not null;

-- The seed-alert scan — new open high-severity incidents.
create index if not exists platform_incidents_alert_idx
  on public.platform_incidents(severity, status)
  where status = 'open';

-- ── 3) updated_at auto-touch ────────────────────────────────────────
-- public.set_updated_at() is defined in the early migrations — reuse it
-- (orders / wallet / refund_requests / work_items all do).
drop trigger if exists platform_incidents_updated_at_trigger on public.platform_incidents;
create trigger platform_incidents_updated_at_trigger
  before update on public.platform_incidents
  for each row execute function public.set_updated_at();

-- ── 4) RLS ──────────────────────────────────────────────────────────
alter table public.platform_incidents enable row level security;

-- SELECT (admin) — every office + operational + supervisory admin role
-- can READ the triage queue. Cross-role visibility is intentional: the
-- owner / ก๊อต (super) and every department head must be able to see
-- platform health. WRITES are NOT granted here (service-role only).
-- EXPLICIT role array — never bare is_admin() (the 0062 S-1 fix).
drop policy if exists "platform_incidents_admin_select" on public.platform_incidents;
create policy "platform_incidents_admin_select" on public.platform_incidents
  for select
  using (public.is_admin(array[
    'super','ops','accounting','sales_admin','warehouse','driver','interpreter'
  ]));

-- SELECT (customer) — a signed-in user reads ONLY incidents whose
-- actor_ref equals the redacted form of their own auth uid. This powers
-- the "ปัญหาที่ฉันแจ้ง" panel (design doc §6.6) — the user sees the
-- lifecycle status of issues THEY hit, and nothing else. RLS is
-- NARROWING: a customer sees fewer rows, never company aggregates,
-- never another customer's incidents.
--
-- actor_ref is stored as redactId(uid) = left(uid, 8) || '-***'. The
-- predicate reconstructs that form from auth.uid() so the comparison
-- is exact. A NULL actor_ref row (anonymous capture) never matches.
drop policy if exists "platform_incidents_owner_select" on public.platform_incidents;
create policy "platform_incidents_owner_select" on public.platform_incidents
  for select
  using (
    actor_ref is not null
    and auth.uid() is not null
    and actor_ref = left(auth.uid()::text, 8) || '-***'
  );

-- No INSERT / UPDATE / DELETE policy — every write goes through the
-- service-role admin client from a requireAdmin-gated Server Action
-- (actions/admin/incidents.ts) or an API route (the ingest + the
-- Sentry webhook). Keeping the direct PostgREST write surface empty
-- means a low-trust anon/customer JWT cannot forge or rewrite an
-- incident — the same exploit class 0062 + 0080 close.

-- ── 5) notifications.category — add 'observability' ─────────────────
-- IO-1.2 (design doc §6.7) — the seed alert fires sendNotification()
-- with category='observability'. The 0014 CHECK constraint does not
-- include it. Swap the constraint to the canonical category set
-- (the 0014 base + 'sales_digest' which a later migration added +
-- the new 'observability'). Guarded so it is idempotent.
do $$
begin
  alter table public.notifications
    drop constraint if exists notifications_category_check;
  alter table public.notifications
    add constraint notifications_category_check
    check (category in (
      'order','payment','forwarder','yuan_payment',
      'wallet','sales','system','promo','sales_digest',
      'observability'
    ));
exception
  when others then
    raise warning '0077 — notifications.category CHECK swap skipped: %', sqlerrm;
end$$;

-- notifications.reference_type — add 'platform_incident' so the alert
-- notification can deep-link back to the incident detail page. Same
-- guarded swap; the canonical reference-type set + the new value.
do $$
begin
  alter table public.notifications
    drop constraint if exists notifications_reference_type_check;
  alter table public.notifications
    add constraint notifications_reference_type_check
    check (reference_type is null or reference_type in (
      'service_order','forwarder','yuan_payment',
      'wallet_transaction','sales_commission','sales_payout',
      'contact_message','platform_incident'
    ));
exception
  when others then
    raise warning '0077 — notifications.reference_type CHECK swap skipped: %', sqlerrm;
end$$;

-- ── 6) work_items.entity_type — add 'platform_incident' ─────────────
-- IO-1.7 / design doc §2.7 — a triaged incident MAY spawn a fix
-- work_item, linked via platform_incidents.work_item_id. An incident
-- has no domain row, so the work_item points back at the incident
-- itself: entity_type='platform_incident', entity_ref = the incident
-- id. The 0080 work_items.entity_type CHECK does not yet allow that
-- value — extend it (additive: every existing value is kept). Guarded
-- so it is idempotent + a no-op if 0080 has not been applied yet.
do $$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'work_items'
  ) then
    alter table public.work_items
      drop constraint if exists work_items_entity_type_check;
    alter table public.work_items
      add constraint work_items_entity_type_check
      check (entity_type in (
        'forwarder','service_order','cargo_container','cargo_shipment',
        'freight_shipment','customs_declaration','freight_invoice',
        'contact_message','refund_request','qa_inspection',
        'platform_incident'
      ));
    raise notice '0077 — work_items.entity_type CHECK extended with platform_incident';
  else
    raise notice '0077 — work_items not present yet; entity_type CHECK extend skipped (re-run after 0080)';
  end if;
exception
  when others then
    raise warning '0077 — work_items.entity_type CHECK swap skipped: %', sqlerrm;
end$$;

-- ── 7) Comments ─────────────────────────────────────────────────────
comment on table public.platform_incidents is
  '0077 / IO-1 — auto-captured platform error incidents with a visible triage lifecycle (platform-observability-system-2026-05-18.md §6). Capture rails (global-error.tsx, the Server-Action wrapper, the Sentry webhook) upsert here, deduped by fingerprint. A SEPARATE table from work_items (§2.7): auto-created, fingerprinted, customer-visible status. A triaged incident MAY bridge to a work_item via work_item_id.';
comment on column public.platform_incidents.fingerprint is
  'Stable dedup hash of (kind, normalised message, route). N hits of the same error → ONE row; occurrence_count increments. The platform_incidents_fingerprint_live_idx partial-unique index keeps one live incident per fingerprint.';
comment on column public.platform_incidents.source is
  'Which surface emitted the error — public | portal | admin | partner | server.';
comment on column public.platform_incidents.kind is
  'js_error (client) | server_error (thrown server-side) | failed_action (a Server Action threw) | api_error (a non-2xx partner/API call).';
comment on column public.platform_incidents.status is
  'The owner-asked lifecycle — open → acknowledged → in_progress → resolved | ignored. Transitions whitelisted in actions/admin/incidents.ts with an optimistic .eq(status, expectedFrom) race-guard. The status is visible to the user who hit the error.';
comment on column public.platform_incidents.actor_role is
  'The ROLE of whoever hit it — customer | anon | partner | an admins.role. A role, never an identity (design doc §3.4).';
comment on column public.platform_incidents.actor_ref is
  'A REDACTED user id — redactId(uid) = left(uid,8) || ''-***''. Lets triage correlate same-user incidents + powers the customer owner-select RLS policy, without storing who the user is.';
comment on column public.platform_incidents.surface_meta is
  'Small event-specific bag — browser/OS / action-name / HTTP status. NO cookies, NO auth headers, NO raw PII (the sentry beforeSend posture).';
comment on column public.platform_incidents.work_item_id is
  'Optional bridge to a fix job — set when triage spawns a work_item (design doc §2.7). Incident = "something broke + its triage status"; work_item = "a human must do the fix".';
comment on constraint platform_incidents_resolved_consistent on public.platform_incidents is
  'A resolved incident MUST carry resolved_at + resolution_note — audit completeness (mirrors the refund_requests / work_items *_consistent constraints).';
comment on constraint platform_incidents_triaged_consistent on public.platform_incidents is
  'An acknowledged / in_progress / resolved incident MUST carry acknowledged_at + assigned_to — a triaged incident always has an owner.';

-- ── 8) Verify (counts) ──────────────────────────────────────────────
do $$
declare
  rls_count int;
  idx_count int;
begin
  select count(*) into rls_count
    from pg_policies
   where schemaname = 'public' and tablename = 'platform_incidents';
  if rls_count < 2 then
    raise warning '0077 platform_incidents RLS expected >= 2 policies, found %', rls_count;
  else
    raise notice '0077 platform_incidents ready — % RLS policies installed', rls_count;
  end if;

  select count(*) into idx_count
    from pg_indexes
   where schemaname = 'public' and tablename = 'platform_incidents';
  raise notice '0077 platform_incidents — % indexes installed', idx_count;
end $$;


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0078_warehouse_cascade_rpc.sql                                 ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- 0078 · Warehouse cascade RPC — P1-5 atomicity fix
-- ════════════════════════════════════════════════════════════
-- Per review-u1-u2-2026-05-18.md §P1-5:
--
-- The container → cargo_shipments → forwarders / service_orders status
-- cascade in `actions/admin/warehouse.ts::cascadeContainerToShipments`
-- was best-effort and non-atomic: each hop was wrapped in try/catch and
-- "logged + continued" on failure. A mid-cascade failure left a
-- container 'arrived' while child forwarders stayed 'in_transit' —
-- billing-gate.ts then read divergent state and let a wallet debit
-- through on a stale CBM estimate (the exact ~31% gap U1-3 exists to
-- prevent).
--
-- ── The fix ──
-- Move the entire cascade into a single SECURITY DEFINER Postgres
-- function. Postgres runs each function call in its own transaction
-- (or inside the caller's TX) — so all writes commit or none do. If
-- ANY hop raises, every prior write in the same call is rolled back.
-- No partial state. The action layer keeps its same return shape; only
-- the cascade internals move to SQL.
--
-- ── What's preserved ──
--  * Forward-only lifecycle (never regress a row already past target).
--  * Per-status date_* column stamp (matches the manual flip actions —
--    forwarders.ts::STATUS_DATE_COL + service-orders.ts::STATUS_DATE_COL).
--  * U1-5 delivered → completed auto-close hook for service_orders.
--  * Distinct audit-action names ('container.cascade_shipment_status' /
--    'shipment.cascade_forwarder_status' / 'shipment.cascade_service_
--    order_status' / 'service_order.auto_close_on_delivery').
--  * The same admin_id_update fingerprint on every flipped row.
--
-- ── What's different ──
--  * Atomicity. A failed forwarder UPDATE rolls back the prior shipment
--    UPDATE in the same call, instead of being logged + skipped.
--  * Return value: jsonb summarising counts (shipments_updated /
--    forwarders_updated / service_orders_updated / auto_closed_orders)
--    so the action can surface "3 of 12 children updated" in the UI.
--  * Audit-log rows are inserted by the function itself (mirrors what
--    the TS cascade did via logAdminAction); on rollback they roll back
--    with the rest — keeping the audit trail honest.
--
-- ── Atomicity guarantee ──
-- This function is the SINGLE source of cascade truth. The action
-- layer (`adminSetContainerStatus`) used to call the cascade AFTER
-- the parent container update — that pattern is preserved: the
-- container's own status flip + history row land first (separate TX
-- via dbSetContainerStatus); this function then atomically cascades
-- to all children. The two-phase shape (parent first, then atomic
-- children) is intentional — a failed cascade leaves the container
-- updated and an admin can retry, but never leaves children half-done.
--
-- ── Security ──
-- SECURITY DEFINER so the function runs with the migration runner's
-- privileges (same pattern as is_admin, wallet_assert_no_overdraw).
-- EXECUTE is REVOKED from public/anon/authenticated and GRANTED only
-- to service_role — only the server-side action can call it. RLS on
-- the underlying tables is bypassed (intentional — the action layer
-- has already gated on withAdmin(['super','ops','warehouse'])).
--
-- Idempotent (create or replace). Zero data migration. Safe to apply.
-- ════════════════════════════════════════════════════════════

create or replace function public.cascade_container_status(
  p_container_id    uuid,
  p_container_status text,
  p_admin_id        uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Status maps — mirror the TS constants in actions/admin/warehouse.ts.
  -- Kept in-function (not as separate tables) to keep the maps + cascade
  -- atomic and reviewable in one place.
  v_shipment_target          text;
  v_forwarder_target         text;
  v_service_order_target     text;

  -- Per-row scratch
  v_shipment                 record;
  v_forwarder                record;
  v_service_order            record;
  v_fwd_date_col             text;
  v_so_date_col              text;
  v_now                      timestamptz := now();

  -- Counters returned in the result jsonb
  v_shipments_total          int := 0;
  v_shipments_updated        int := 0;
  v_shipments_skipped_ahead  int := 0;
  v_forwarders_updated       int := 0;
  v_forwarders_skipped_ahead int := 0;
  v_service_orders_updated   int := 0;
  v_service_orders_skipped_ahead int := 0;
  v_auto_closed_orders       int := 0;

  -- Lifecycle order arrays for the forward-only "don't regress" check.
  -- Match the TS SHIPMENT_ORDER / FORWARDER_STATUS_ORDER /
  -- SERVICE_ORDER_STATUS_ORDER constants. Index lookups via array_position.
  v_shipment_order text[] := array[
    'received_cn', 'packed_cn', 'sealed_in_container', 'in_transit',
    'arrived_th', 'unloaded', 'out_for_delivery', 'delivered'
  ];
  v_forwarder_order text[] := array[
    'pending_payment', 'shipped_china', 'in_transit',
    'arrived_thailand', 'out_for_delivery', 'delivered'
  ];
  v_service_order_order text[] := array[
    'pending', 'awaiting_payment', 'ordered',
    'awaiting_chn_dispatch', 'completed'
  ];

  v_ci int;   -- current index
  v_ti int;   -- target index
begin
  -- ── Container → shipment target ──
  -- Mirrors TS CONTAINER_TO_SHIPMENT map. 'packing'/'closed' = no cascade.
  v_shipment_target := case p_container_status
    when 'sealed'     then 'sealed_in_container'
    when 'in_transit' then 'in_transit'
    when 'arrived'    then 'arrived_th'
    when 'unloading'  then 'unloaded'
    else null
  end;

  if v_shipment_target is null then
    -- No-op cascade for packing / closed. Return early with zero counts.
    return jsonb_build_object(
      'shipments_total',           0,
      'shipments_updated',         0,
      'shipments_skipped_ahead',   0,
      'forwarders_updated',        0,
      'forwarders_skipped_ahead',  0,
      'service_orders_updated',    0,
      'service_orders_skipped_ahead', 0,
      'auto_closed_orders',        0,
      'cascade_reason',            'no_cascade_for_status'
    );
  end if;

  -- ── Loop every shipment attached to the container ──
  for v_shipment in
    select id, status, forwarder_f_no, service_order_h_no
      from public.cargo_shipments
     where cargo_container_id = p_container_id
     for update
  loop
    v_shipments_total := v_shipments_total + 1;

    -- Forward-only check: skip if already at or past the target.
    -- Unknown current status (e.g. cancelled, legacy) is treated as
    -- "ahead" so we never auto-overwrite it. Matches isAtOrPast() in TS.
    v_ci := array_position(v_shipment_order, v_shipment.status);
    v_ti := array_position(v_shipment_order, v_shipment_target);
    if v_ci is null or (v_ti is not null and v_ci >= v_ti) then
      v_shipments_skipped_ahead := v_shipments_skipped_ahead + 1;
    else
      -- Flip shipment + stamp completion timestamp on delivered/received
      -- (matches lib/warehouse/shipments.ts::setShipmentStatus).
      update public.cargo_shipments
         set status          = v_shipment_target,
             received_at_cn  = case when v_shipment_target = 'received_cn'
                                       and received_at_cn is null
                                    then v_now else received_at_cn end,
             delivered_at_th = case when v_shipment_target = 'delivered'
                                       and delivered_at_th is null
                                    then v_now else delivered_at_th end
       where id = v_shipment.id;
      v_shipments_updated := v_shipments_updated + 1;

      -- Audit — admin_audit_log.target_id is text so cast UUID to text.
      insert into public.admin_audit_log (admin_id, action, target_type, target_id, payload)
      values (
        p_admin_id,
        'container.cascade_shipment_status',
        'shipment',
        v_shipment.id::text,
        jsonb_build_object(
          'cargo_container_id', p_container_id,
          'container_status',   p_container_status,
          'from_status',        v_shipment.status,
          'to_status',          v_shipment_target
        )
      );
    end if;

    -- ── Hop 2: shipment → forwarder OR service_order ──
    -- Use the *target* shipment status (post-cascade) so a freshly-
    -- bumped shipment cascades immediately. The TS code does the same.

    -- Forwarder hop (only for shipment statuses that map onward)
    v_forwarder_target := case v_shipment_target
      when 'sealed_in_container' then 'shipped_china'
      when 'in_transit'          then 'in_transit'
      when 'arrived_th'          then 'arrived_thailand'
      when 'out_for_delivery'    then 'out_for_delivery'
      when 'delivered'           then 'delivered'
      else null
    end;

    if v_forwarder_target is not null and v_shipment.forwarder_f_no is not null then
      select id, status
        into v_forwarder
        from public.forwarders
       where f_no = v_shipment.forwarder_f_no
       for update;

      if found then
        v_ci := array_position(v_forwarder_order, v_forwarder.status);
        v_ti := array_position(v_forwarder_order, v_forwarder_target);
        if v_ci is null or (v_ti is not null and v_ci >= v_ti) then
          v_forwarders_skipped_ahead := v_forwarders_skipped_ahead + 1;
        else
          v_fwd_date_col := case v_forwarder_target
            when 'shipped_china'    then 'date_shipped_china'
            when 'in_transit'       then 'date_in_transit'
            when 'arrived_thailand' then 'date_arrived_thailand'
            when 'out_for_delivery' then 'date_out_for_delivery'
            when 'delivered'        then 'date_delivered'
            else null
          end;

          -- Build dynamic UPDATE so we can conditionally stamp the right
          -- date_* column. format()/EXECUTE is the cleanest way; alternative
          -- would be a 5-arm CASE on every column (uglier, same result).
          execute format(
            'update public.forwarders
                set status = $1,
                    admin_id_update = $2,
                    %I = coalesce(%I, $3)
              where id = $4',
            v_fwd_date_col, v_fwd_date_col
          )
          using v_forwarder_target, p_admin_id::text, v_now, v_forwarder.id;

          v_forwarders_updated := v_forwarders_updated + 1;

          insert into public.admin_audit_log (admin_id, action, target_type, target_id, payload)
          values (
            p_admin_id,
            'shipment.cascade_forwarder_status',
            'forwarder',
            v_forwarder.id::text,
            jsonb_build_object(
              'cargo_shipment_id', v_shipment.id,
              'shipment_status',   v_shipment_target,
              'from_status',       v_forwarder.status,
              'to_status',         v_forwarder_target
            )
          );
        end if;
      end if;
    end if;

    -- Service-order hop (only on shipment 'delivered' → service_order
    -- 'completed' per the SHIPMENT_TO_SERVICE_ORDER map).
    v_service_order_target := case v_shipment_target
      when 'delivered' then 'completed'
      else null
    end;

    if v_service_order_target is not null and v_shipment.service_order_h_no is not null then
      select id, status
        into v_service_order
        from public.service_orders
       where h_no = v_shipment.service_order_h_no
       for update;

      if found then
        v_ci := array_position(v_service_order_order, v_service_order.status);
        v_ti := array_position(v_service_order_order, v_service_order_target);
        if v_ci is null or (v_ti is not null and v_ci >= v_ti) then
          v_service_orders_skipped_ahead := v_service_orders_skipped_ahead + 1;
        else
          v_so_date_col := case v_service_order_target
            when 'awaiting_payment'      then 'date_awaiting_payment'
            when 'ordered'               then 'date_ordered'
            when 'awaiting_chn_dispatch' then 'date_dispatched'
            when 'completed'             then 'date_completed'
            else null
          end;

          execute format(
            'update public.service_orders
                set status = $1,
                    admin_id_update = $2,
                    %I = coalesce(%I, $3)
              where id = $4',
            v_so_date_col, v_so_date_col
          )
          using v_service_order_target, p_admin_id::text, v_now, v_service_order.id;

          v_service_orders_updated := v_service_orders_updated + 1;

          -- U1-5: distinct audit-action for the delivered → completed
          -- auto-close hop. Keeps the existing reporting query
          -- ('service_order.auto_close_on_delivery') wired.
          if v_shipment_target = 'delivered' and v_service_order_target = 'completed' then
            v_auto_closed_orders := v_auto_closed_orders + 1;
            insert into public.admin_audit_log (admin_id, action, target_type, target_id, payload)
            values (
              p_admin_id,
              'service_order.auto_close_on_delivery',
              'service_order',
              v_service_order.id::text,
              jsonb_build_object(
                'cargo_shipment_id', v_shipment.id,
                'shipment_status',   v_shipment_target,
                'from_status',       v_service_order.status,
                'to_status',         v_service_order_target
              )
            );
          else
            insert into public.admin_audit_log (admin_id, action, target_type, target_id, payload)
            values (
              p_admin_id,
              'shipment.cascade_service_order_status',
              'service_order',
              v_service_order.id::text,
              jsonb_build_object(
                'cargo_shipment_id', v_shipment.id,
                'shipment_status',   v_shipment_target,
                'from_status',       v_service_order.status,
                'to_status',         v_service_order_target
              )
            );
          end if;
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'shipments_total',              v_shipments_total,
    'shipments_updated',            v_shipments_updated,
    'shipments_skipped_ahead',      v_shipments_skipped_ahead,
    'forwarders_updated',           v_forwarders_updated,
    'forwarders_skipped_ahead',     v_forwarders_skipped_ahead,
    'service_orders_updated',       v_service_orders_updated,
    'service_orders_skipped_ahead', v_service_orders_skipped_ahead,
    'auto_closed_orders',           v_auto_closed_orders,
    'cascade_reason',               'ok'
  );
end;
$$;

comment on function public.cascade_container_status(uuid, text, uuid) is
  '0078 P1-5 — atomic cascade of a container status change down to its child shipments and onward to the parent forwarders / service_orders. All writes (status updates + admin_audit_log rows) happen in a single TX: any hop raising rolls back the entire cascade, so children can never be left half-updated. Mirrors the TS map constants in actions/admin/warehouse.ts (CONTAINER_TO_SHIPMENT / SHIPMENT_TO_FORWARDER / SHIPMENT_TO_SERVICE_ORDER) and preserves forward-only lifecycle (never regress a row already past the target). Returns a jsonb counter summary so callers can surface "N of M children updated" in the UI. Trigger-internal — execute revoked from client roles; only the service_role (server actions) may call.';

-- ── Locked-down grants — service_role only ──
revoke all on function public.cascade_container_status(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.cascade_container_status(uuid, text, uuid)
  to service_role;


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0079_bookings.sql                                              ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- BK-1 · bookings + booking_options + booking_rates + booking_no serial
--        + work_items.entity_type 'booking' + notifications.category 'booking'
-- ════════════════════════════════════════════════════════════
-- Per design doc [docs/research/booking-flow-system-2026-05-18.md] §6.
--
-- The booking flow is a THIN INTAKE LAYER — three new tables that feed the
-- shipped work-board (`0080_work_items`) + the shipped freight_quotes
-- (`0048`) + the shipped notification rails (`0014` / `0024` / `0026`).
-- It does NOT replace any domain table; it adds:
--
--   1. booking_seq         — daily serial counter (mirrors freight_quote_seq)
--   2. bookings            — customer booking submissions (draft → submitted
--                            → contacted → quoted → won/lost/cancelled)
--   3. booking_options     — picked option line-items (labor / tractor /
--                            upgrades) — reconstructs the quotation receipt
--   4. booking_rates       — admin-editable option rate table (kills the
--                            stale-hardcoded-rate pattern; R-5-aligned —
--                            §6.6 + §9-1)
--   5. next_booking_no()   — atomic BKYYMMDD-NNNN serial generator
--   6. RLS                 — guest INSERT-draft only · customer reads own ·
--                            admin full
--
-- Also extends three existing CHECK constraints (idempotent):
--   • work_items.entity_type            ← add 'booking'  (§6.5)
--   • notifications.category            ← add 'booking'  (§6.5)
--   • notifications.reference_type      ← add 'booking'  (§6.5)
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════

-- ── 1) Daily serial counter ───────────────────────────────────────────
create table if not exists public.booking_seq (
  period_yymmdd text primary key,
  next_seq      int  not null default 1,
  updated_at    timestamptz not null default now()
);

-- ── 2) bookings — header ──────────────────────────────────────────────
create table if not exists public.bookings (
  id              uuid primary key default gen_random_uuid(),
  booking_no      text unique,                              -- BKYYMMDD-NNNN

  status          text not null default 'draft'
                    check (status in (
                      'draft',       -- created pre-auth-gate, not yet submitted
                      'submitted',   -- customer confirmed → now a job
                      'contacted',   -- rep reached the customer
                      'quoted',      -- Pricing formalised a freight_quote
                      'won',         -- converted to an order/shipment
                      'lost',        -- customer declined / went cold
                      'cancelled'    -- customer cancelled
                    )),

  -- ── Service + route ──
  service_slug    text not null check (char_length(service_slug) between 1 and 64),
  route_slug      text check (route_slug is null or char_length(route_slug) between 1 and 64),
  transport_mode  text check (transport_mode is null or transport_mode in (
                    'sea_lcl','sea_fcl','truck','air','sourcing','customs','remit'
                  )),

  -- ── Customer pointer ──
  -- NULL only while status='draft' (a guest's pre-gate draft).  A submit
  -- MUST bind profile_id (enforced by bookings_submitted_has_profile below).
  profile_id      uuid references public.profiles(id) on delete restrict,
  contact_name    text,                                     -- snapshot — editable on review
  contact_phone   text,
  contact_line    text,
  customer_note   text,

  -- ── Document-handling posture (§4.3 selector #5) ──
  doc_mode        text not null default 'none'
                    check (doc_mode in ('none','tax_invoice','customs_declaration')),

  -- ── Pin pickup / drop-off (§4.3 selector #3) ──
  pickup_lat      numeric(9,6),
  pickup_lng      numeric(9,6),
  pickup_address  text,
  dropoff_lat     numeric(9,6),
  dropoff_lng     numeric(9,6),
  dropoff_address text,

  -- ── Estimate SNAPSHOT — frozen on submit (audit trail) ──
  -- estimate_breakdown is the QuoteLine[] as JSONB — the itemised receipt
  -- the customer saw. estimate_total = Σ rows.amount.  is_estimate stays
  -- true because the real price is rep-confirmed (§4.7 estimate-honesty
  -- rule).  Pricing's later freight_quote carries the real number.
  estimate_total      numeric(12,2) not null default 0
                        check (estimate_total >= 0 and estimate_total <= 9999999.99),
  estimate_breakdown  jsonb        not null default '[]'::jsonb,
  is_estimate         boolean      not null default true,

  -- ── Lead provenance (feeds R-3 lead-inbox) ──
  source_channel  text,            -- 'home_calculator'|'customs_landing'|'services'|…
  source_url      text,

  -- ── R-5 hand-off — once Pricing formalises a quote ──
  freight_quote_id uuid references public.freight_quotes(id) on delete set null,

  -- ── Lifecycle stamps ──
  submitted_at    timestamptz,
  contacted_at    timestamptz,
  closed_at       timestamptz,                              -- set on won/lost/cancelled
  closed_reason   text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- ── Integrity constraints ──
  -- A submitted (or later) booking MUST carry a profile_id + submitted_at.
  constraint bookings_submitted_has_profile check (
    status = 'draft'
    or (profile_id is not null and submitted_at is not null)
  ),
  -- A closed (won/lost/cancelled) booking MUST stamp closed_at.
  constraint bookings_closed_has_stamp check (
    status not in ('won','lost','cancelled')
    or closed_at is not null
  ),
  -- A quoted booking MUST link to the freight_quote it became.
  constraint bookings_quoted_has_quote check (
    status <> 'quoted'
    or freight_quote_id is not null
  )
);

-- Indexes -------------------------------------------------------------
-- Sales-desk list: open work, newest first.
create index if not exists bookings_status_created_idx
  on public.bookings(status, created_at desc);
-- Customer portal /bookings.
create index if not exists bookings_profile_status_idx
  on public.bookings(profile_id, status) where profile_id is not null;
-- Per-service filtering for the desk.
create index if not exists bookings_service_status_idx
  on public.bookings(service_slug, status, created_at desc);
-- Reverse lookup by booking_no.
create index if not exists bookings_booking_no_idx
  on public.bookings(booking_no) where booking_no is not null;

-- updated_at auto-touch -----------------------------------------------
drop trigger if exists bookings_updated_at_trigger on public.bookings;
create trigger bookings_updated_at_trigger
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- ── 3) booking_options — picked option line-items ─────────────────────
-- Mirrors freight_quote_items: a line-item child of a header.  Lets the
-- quotation receipt be reconstructed + the rep see exactly what the
-- customer chose.
create table if not exists public.booking_options (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  position     smallint not null default 1,
  option_key   text not null check (char_length(option_key) between 1 and 64),
  option_label text not null check (char_length(option_label) between 1 and 200),
  detail       text,                                         -- '×2 คน' | 'หัวลาก 10 ล้อ'
  quantity     numeric(8,2) not null default 1
                  check (quantity > 0 and quantity <= 999.99),
  unit_amount  numeric(12,2) not null default 0
                  check (unit_amount >= 0 and unit_amount <= 999999.99),
  line_amount  numeric(12,2) not null default 0
                  check (line_amount >= 0 and line_amount <= 9999999.99),
  created_at   timestamptz not null default now()
);

create index if not exists booking_options_booking_idx
  on public.booking_options(booking_id);
create unique index if not exists booking_options_booking_position_uidx
  on public.booking_options(booking_id, position);

-- ── 4) booking_rates — admin-editable option rate table ───────────────
-- Kills the stale-hardcoded-rate pattern (§6.6 / R-5 alignment).  The
-- booking detail page reads this table for option pricing; the base
-- service price still comes from the shipped calc* functions in BK-1.
create table if not exists public.booking_rates (
  id           uuid primary key default gen_random_uuid(),
  scope        text not null check (scope in ('labor','tractor','doc','upgrade')),
  rate_key     text not null check (char_length(rate_key) between 1 and 64),
  service_slug text,                                         -- NULL = applies to all services
  label_th     text not null check (char_length(label_th) between 1 and 120),
  label_en     text not null check (char_length(label_en) between 1 and 120),
  unit_amount  numeric(12,2) not null check (unit_amount >= 0 and unit_amount <= 999999.99),
  active       boolean not null default true,
  valid_from   date,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One active rate per (scope, rate_key, service_slug) at a time.  service_slug
-- NULL = the catch-all default; a service-specific row overrides it in app code.
create unique index if not exists booking_rates_unique_active_idx
  on public.booking_rates(scope, rate_key, coalesce(service_slug, ''))
  where active;

create index if not exists booking_rates_scope_active_idx
  on public.booking_rates(scope, active) where active;

drop trigger if exists booking_rates_updated_at_trigger on public.booking_rates;
create trigger booking_rates_updated_at_trigger
  before update on public.booking_rates
  for each row execute function public.set_updated_at();

-- ── 5) next_booking_no() — atomic serial ──────────────────────────────
-- BKYYMMDD-NNNN with daily reset (Bangkok TZ).  Mirrors next_freight_quote_no.
create or replace function public.next_booking_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yymmdd text := to_char(now() at time zone 'Asia/Bangkok', 'YYMMDD');
  seq    int;
begin
  insert into public.booking_seq (period_yymmdd, next_seq)
    values (yymmdd, 2)
    on conflict (period_yymmdd) do update
      set next_seq   = booking_seq.next_seq + 1,
          updated_at = now()
    returning next_seq - 1 into seq;
  return 'BK' || yymmdd || '-' || lpad(seq::text, 4, '0');
end;
$$;

revoke all     on function public.next_booking_no() from public, authenticated, anon;
grant  execute on function public.next_booking_no() to service_role;

-- ── 6) RLS ────────────────────────────────────────────────────────────
alter table public.bookings        enable row level security;
alter table public.booking_options enable row level security;
alter table public.booking_rates   enable row level security;
alter table public.booking_seq     enable row level security;

-- ── 6.1) bookings policies ──
-- Anon (guest) — INSERT-draft only.  No select.  The selection survives the
-- auth-gate round-trip via an opaque ?draft=<id> token the app hands back.
-- A draft carries no PII (the guest has not registered yet).  The app-layer
-- action (actions/bookings.ts:createDraftBooking) is the real guard; RLS
-- here is the floor — anon cannot escalate status, cannot select, cannot
-- update.  Scoped hard.
drop policy if exists bookings_anon_insert_draft on public.bookings;
create policy bookings_anon_insert_draft
  on public.bookings for insert
  to anon
  with check (status = 'draft' and profile_id is null);

-- Customer — read own (any status).
drop policy if exists bookings_customer_read on public.bookings;
create policy bookings_customer_read
  on public.bookings for select
  to authenticated
  using (profile_id = auth.uid());

-- Customer — INSERT a draft (logged-in path).  profile_id pinned to self.
drop policy if exists bookings_customer_insert_draft on public.bookings;
create policy bookings_customer_insert_draft
  on public.bookings for insert
  to authenticated
  with check (
    status = 'draft'
    and (profile_id is null or profile_id = auth.uid())
  );

-- Customer — UPDATE own draft (review-step edits) + own draft → submitted.
-- Cannot mutate status away from draft/submitted, cannot reassign profile_id.
-- App layer enforces the draft → submitted transition via submitBooking()
-- (which also spawns the work_item — the RLS floor only allows the move).
drop policy if exists bookings_customer_update_own on public.bookings;
create policy bookings_customer_update_own
  on public.bookings for update
  to authenticated
  using (profile_id = auth.uid() and status in ('draft','submitted'))
  with check (
    profile_id = auth.uid()
    and status in ('draft','submitted')
  );

-- Admin — full read.
drop policy if exists bookings_admin_read on public.bookings;
create policy bookings_admin_read
  on public.bookings for select
  using (public.is_admin(array['super','ops','sales_admin','accounting']));

-- Admin — full write (app layer enforces per-status workflow).
drop policy if exists bookings_admin_write on public.bookings;
create policy bookings_admin_write
  on public.bookings for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- ── 6.2) booking_options policies — inherit visibility from parent ──
-- Anon — INSERT children of own draft (carries the option selections).
drop policy if exists booking_options_anon_insert on public.booking_options;
create policy booking_options_anon_insert
  on public.booking_options for insert
  to anon
  with check (
    exists (
      select 1 from public.bookings b
       where b.id = booking_options.booking_id
         and b.status = 'draft'
         and b.profile_id is null
    )
  );

-- Customer — read children of own booking.
drop policy if exists booking_options_customer_read on public.booking_options;
create policy booking_options_customer_read
  on public.booking_options for select
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
       where b.id = booking_options.booking_id
         and b.profile_id = auth.uid()
    )
  );

-- Customer — INSERT children of own draft.
drop policy if exists booking_options_customer_insert on public.booking_options;
create policy booking_options_customer_insert
  on public.booking_options for insert
  to authenticated
  with check (
    exists (
      select 1 from public.bookings b
       where b.id = booking_options.booking_id
         and b.profile_id = auth.uid()
         and b.status = 'draft'
    )
  );

-- Customer — DELETE children of own draft (re-pick options on review step).
drop policy if exists booking_options_customer_delete on public.booking_options;
create policy booking_options_customer_delete
  on public.booking_options for delete
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
       where b.id = booking_options.booking_id
         and b.profile_id = auth.uid()
         and b.status = 'draft'
    )
  );

-- Admin — full.
drop policy if exists booking_options_admin_all on public.booking_options;
create policy booking_options_admin_all
  on public.booking_options for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- ── 6.3) booking_rates policies — public READ (the page reads it), admin write ──
-- The booking detail page is public + needs to read option rates to render the
-- quotation panel.  Rates are non-sensitive (Pacred publishes them on landing
-- pages already).  Admin-only writes.
drop policy if exists booking_rates_public_read on public.booking_rates;
create policy booking_rates_public_read
  on public.booking_rates for select
  using (active = true);

drop policy if exists booking_rates_admin_all on public.booking_rates;
create policy booking_rates_admin_all
  on public.booking_rates for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- ── 6.4) booking_seq — admin-only (generator fn bypasses via security definer) ──
drop policy if exists booking_seq_admin_all on public.booking_seq;
create policy booking_seq_admin_all
  on public.booking_seq for all
  using      (public.is_admin(array['super','ops','sales_admin','accounting']))
  with check (public.is_admin(array['super','ops','sales_admin','accounting']));

-- ── 7) Extend work_items.entity_type CHECK to add 'booking' ───────────
-- The submitted booking spawns a work_item via ensure_work_item() with
-- entity_type='booking', entity_ref=booking_no.  See §6.5 step 2.
alter table public.work_items
  drop constraint if exists work_items_entity_type_check;

alter table public.work_items
  add constraint work_items_entity_type_check
  check (entity_type in (
    'forwarder',
    'service_order',
    'cargo_container',
    'cargo_shipment',
    'freight_shipment',
    'customs_declaration',
    'freight_invoice',
    'contact_message',
    'refund_request',
    'qa_inspection',
    'booking'
  ));

-- ── 8) Extend notifications.category + reference_type CHECK to add 'booking' ──
-- §6.5 step 4 — sendNotification('booking', …) on submit (admin + customer).
alter table public.notifications
  drop constraint if exists notifications_category_check;

alter table public.notifications
  add constraint notifications_category_check
  check (category in (
    'order',
    'payment',
    'forwarder',
    'yuan_payment',
    'wallet',
    'sales',
    'system',
    'promo',
    'sales_digest',
    'booking'
  ));

alter table public.notifications
  drop constraint if exists notifications_reference_type_check;

alter table public.notifications
  add constraint notifications_reference_type_check
  check (reference_type in (
    'service_order',
    'forwarder',
    'yuan_payment',
    'wallet_transaction',
    'sales_commission',
    'sales_payout',
    'contact_message',
    'booking'
  ));

-- ── 9) Seed booking_rates — today's hardcoded numbers, in DB ──────────
-- Per §6.6 the booking flow ships seeded with the existing operation's
-- rate sheet so the page renders the same price the legacy operation
-- charges.  Admin can edit these via /admin/booking-rates later.  The
-- on conflict DO NOTHING keeps the seed idempotent — re-running the
-- migration does not overwrite admin edits.
insert into public.booking_rates (scope, rate_key, service_slug, label_th, label_en, unit_amount, active)
values
  -- labor (per worker, per job)
  ('labor', 'worker', null, 'ค่าแรงงาน',                'Labor (per worker)',     600, true),
  ('labor', 'heavy_lift', null, 'ค่ายกของหนัก (เพิ่ม)',  'Heavy-lift surcharge',   400, true),

  -- tractor classes (per job)
  ('tractor', 'truck_4w', null, 'หัวลาก 4 ล้อ',         'Tractor — 4-wheel',    1500, true),
  ('tractor', 'truck_6w', null, 'หัวลาก 6 ล้อ',         'Tractor — 6-wheel',    2500, true),
  ('tractor', 'truck_10w', null, 'หัวลาก 10 ล้อ',       'Tractor — 10-wheel',   3500, true),
  ('tractor', 'trailer', null, 'เทรลเลอร์',             'Trailer',               5500, true),

  -- document handling
  ('doc', 'tax_invoice', null, 'ออกใบกำกับภาษี',         'Issue tax invoice',     600, true),
  ('doc', 'customs_declaration', null, 'ออกใบขนสินค้า',  'Customs declaration',  1800, true),

  -- upgrade plans
  ('upgrade', 'insurance', null, 'ประกันสินค้า',         'Cargo insurance',       500, true),
  ('upgrade', 'door_to_door', null, 'Door-to-door',      'Door-to-door upgrade', 1200, true),
  ('upgrade', 'fumigation', null, 'ฟูมิเกชัน',           'Fumigation',           1500, true),
  ('upgrade', 'priority', null, 'Priority handling',     'Priority handling',     800, true)
on conflict do nothing;

-- ── 10) Comments ──────────────────────────────────────────────────────
comment on table public.bookings is
  'BK-1 — customer booking submissions (a thin intake layer that feeds the work-board + Sales/Pricing desks; design: docs/research/booking-flow-system-2026-05-18.md). Status: draft → submitted → contacted → quoted → won/lost/cancelled. A booking ≠ a quote; a booking SEEDS a quote (freight_quote_id links once Pricing formalises one — §6.4).';
comment on column public.bookings.booking_no is
  'Format BKYYMMDD-NNNN. Reserved at submit time via next_booking_no() (drafts have null booking_no — never shown to the customer).';
comment on column public.bookings.status is
  'draft (pre-gate, anon-insertable) | submitted (job spawned, customer-visible) | contacted (rep reached) | quoted (Pricing made a freight_quote) | won (converted) | lost (declined) | cancelled (customer cancelled). App-layer enforces the legal transitions.';
comment on column public.bookings.estimate_breakdown is
  'QuoteLine[] as JSONB — the itemised receipt the customer saw at submit time. Frozen audit snapshot; the real number lives on the linked freight_quote later.';
comment on column public.bookings.is_estimate is
  'Always true — Pacred booking prices are estimates rep-confirmed later (§4.7 estimate-honesty rule). Kept as a column so a future "binding-price" booking variant can be modelled by flipping it false on that subset.';
comment on column public.bookings.profile_id is
  'NULL only while status=draft (guest pre-gate). The submit transition (submitBooking server action) binds it. Enforced by bookings_submitted_has_profile constraint.';

comment on table public.booking_options is
  'BK-1 — per-booking option line-items (labor / tractor / upgrades / doc-handling). Mirrors freight_quote_items shape. Quote receipt = SELECT … FROM booking_options WHERE booking_id = $1 ORDER BY position.';

comment on table public.booking_rates is
  'BK-1 — admin-editable option rate table (R-5 quote_rates pattern; §6.6). Public READ (the booking page consumes it), admin WRITE. When R-5 lands its quote_rates table they will be unified per §9-1.';

comment on function public.next_booking_no is
  'BK-1 — atomic BKYYMMDD-NNNN serial generator with daily counter reset (Bangkok TZ). Concurrent calls serialise on the upsert lock. service_role only.';

comment on constraint bookings_submitted_has_profile on public.bookings is
  'A submitted (or later) booking MUST carry a profile_id + submitted_at. Drafts may be anon (profile_id null) — the carry mechanism (§5.4).';
comment on constraint bookings_closed_has_stamp on public.bookings is
  'A won/lost/cancelled booking MUST stamp closed_at (audit completeness — ADR-0014 pattern).';
comment on constraint bookings_quoted_has_quote on public.bookings is
  'A quoted booking MUST link freight_quote_id — the R-5 seam materialised.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0080_work_items.sql                                            ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- 0080 · work_items — cross-department work-board / job-assignment spine
-- ════════════════════════════════════════════════════════════
-- Source: docs/research/operating-system-analysis-2026-05-18.md §1.4
--         + docs/research/capability-tools-strategy-2026-05-18.md
--         Tier 2 centrepiece.
--
-- Migration number: 0080 is a เดฟ-RESERVED block — deliberately clear
-- of ภูม's active 0073-0079 sequence. Do NOT renumber into that range.
--
-- ── THE HOLE (§1.2 of the operating-system analysis) ─────────
-- Status-visibility — Pacred's headline DNA promise — is delivered
-- for the *customer* (shipment timeline, scan events, freshness pill)
-- but missing for *staff*. Every department reads only its own table:
--   CS    → contact_messages          ops → forwarders / service_orders
--   wh    → cargo_containers           acc → freight_invoices / wallet
-- There is NO single screen that answers "show me every live job, its
-- stage, and which department/person owns it RIGHT NOW". A hand-off
-- from department A to B is still a LINE message — the legacy
-- "ของอยู่ไหน" status-relay failure, rebuilt at the staff layer.
--
-- ── THE FIX (§1.4 — the work_items spine) ───────────────────
-- ONE thin overlay table that *indexes* the domain rows into a single
-- assignable, queryable flow. It is ADDITIVE:
--   • It does NOT replace forwarders / service_orders / cargo_* /
--     freight_invoices / customs_declarations — those stay canonical.
--   • A work_item is a pointer: (entity_type, entity_ref) → the domain
--     row, plus assignment + lifecycle state the domain row lacks
--     (assigned_role, assigned_to, due_at, priority, a free note).
--   • The /admin/board page + per-role inbox read work_items; staff
--     still act on the domain detail page as today.
--
-- The polymorphic link is (entity_type, entity_ref) — entity_ref is a
-- TEXT natural key so it works uniformly across heterogeneous PKs:
--   forwarder            → forwarders.f_no            (text)
--   service_order        → service_orders.h_no        (text)
--   cargo_container      → cargo_containers.code      (text)
--   cargo_shipment       → cargo_shipments.shipment_code (text)
--   freight_shipment     → freight_shipments.id       (uuid::text)
--   customs_declaration  → customs_declarations.id    (uuid::text)
--   freight_invoice      → freight_invoices.id        (uuid::text)
--   contact_message      → contact_messages.id        (uuid::text)
--   refund_request       → refund_requests.id         (uuid::text)
--   qa_inspection        → freight_qa_inspections.id  (uuid::text)
-- No FK is enforced on entity_ref (it spans 10 tables / mixed key
-- types); the app layer + the (entity_type, entity_ref) unique index
-- keep it coherent. This mirrors how refund_requests.source_ref (0058)
-- already models a heterogeneous polymorphic link with a text ref.
--
-- ── RLS (follows the 0062 role-pin keystone) ────────────────
-- Work assignment is internal-operations data — NO customer access at
-- all (the table is never exposed to a customer client). Every policy
-- uses an EXPLICIT is_admin(array[...]) role array — never bare
-- is_admin() — per the 0062 S-1 fix. Two policies:
--   SELECT  → all operational + supervisory roles can SEE the board
--             (cross-department visibility IS the point):
--             super, ops, accounting, sales_admin, warehouse, driver,
--             interpreter.
--   WRITE   → super + ops only. ops is the operations coordinator that
--             routes work; super is the implicit catch-all. Other roles
--             advance work via the gated Server Actions in
--             actions/admin/work-items.ts (createAdminClient bypasses
--             RLS — the requireAdmin gate there is the real check), not
--             via direct PostgREST writes. Keeping the table-level
--             write surface tight (super+ops) means a low-trust
--             warehouse/driver anon-key JWT cannot rewrite assignments
--             directly — the same exploit class 0062 closed for money.
--
-- Idempotent: table is create-if-not-exists, every policy + trigger is
-- drop-if-exists + recreate, the function is create-or-replace. Zero
-- data migration. Additive only — adds no grants on existing tables,
-- never widens access. Safe to apply on prod live.
-- ════════════════════════════════════════════════════════════

-- ── 1) work_items ───────────────────────────────────────────────────
create table if not exists public.work_items (
  id              uuid primary key default gen_random_uuid(),

  -- ── Polymorphic domain link ──
  -- entity_type names the domain table; entity_ref is its natural key
  -- as text (f_no / h_no / code / shipment_code / uuid::text). See the
  -- header for the per-type mapping. No cross-table FK is possible here.
  entity_type     text not null check (entity_type in (
                    'forwarder',
                    'service_order',
                    'cargo_container',
                    'cargo_shipment',
                    'freight_shipment',
                    'customs_declaration',
                    'freight_invoice',
                    'contact_message',
                    'refund_request',
                    'qa_inspection'
                  )),
  entity_ref      text not null check (char_length(entity_ref) between 1 and 128),

  -- ── What kind of work + a human title ──
  -- type is the work category (drives icon + default routing). title is
  -- a short staff-facing label; note is the free-text hand-off detail.
  type            text not null check (type in (
                    'intake_review',     -- a new order needs first-touch
                    'payment_followup',  -- chase / verify a payment
                    'warehouse_action',  -- receive / pack / load / scan
                    'doc_issue',         -- issue an invoice / Form-E / D-O / declaration
                    'customs_clearance', -- clear a shipment at the port
                    'delivery_dispatch', -- assign + dispatch a delivery run
                    'cs_followup',       -- a customer ticket / question
                    'refund_process',    -- process a refund request
                    'qa_check',          -- a QA / QC inspection
                    'general'            -- catch-all hand-off
                  )),
  title           text not null check (char_length(title) between 1 and 200),
  note            text,

  -- ── Lifecycle ──
  -- open → in_progress → done (terminal) | open/in_progress → cancelled.
  -- blocked is a non-terminal hold (waiting on another department /
  -- the customer). The board groups by status; the actions enforce the
  -- legal transitions with an optimistic .eq("status", expectedFrom)
  -- race-guard (see actions/admin/work-items.ts).
  status          text not null default 'open' check (status in (
                    'open', 'in_progress', 'blocked', 'done', 'cancelled'
                  )),

  -- low | normal | high | urgent — sorts the board within a column.
  priority        text not null default 'normal' check (priority in (
                    'low', 'normal', 'high', 'urgent'
                  )),

  -- ── Assignment ──
  -- assigned_role routes the item to a DEPARTMENT (always set — every
  -- item belongs to some role's inbox). assigned_to optionally pins it
  -- to one person (a profiles.id that is an admin). The CHECK keeps
  -- assigned_role within the known admin-role set (mirrors
  -- admins.role — 0033 + 0054 extended it to this 7-value set).
  assigned_role   text not null default 'ops' check (assigned_role in (
                    'super', 'ops', 'accounting', 'sales_admin',
                    'warehouse', 'driver', 'interpreter'
                  )),
  assigned_to     uuid references public.profiles(id) on delete set null,

  -- ── Timing ──
  due_at          timestamptz,                       -- SLA target (nullable)

  -- ── Provenance + lifecycle stamps ──
  created_by      uuid references public.profiles(id) on delete set null,
  started_at      timestamptz,                       -- set when → in_progress
  closed_at       timestamptz,                       -- set when → done / cancelled
  closed_by       uuid references public.profiles(id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A done / cancelled item MUST carry a closed_at (audit completeness —
  -- mirrors the refund_requests *_consistent constraints in 0058).
  constraint work_items_closed_consistent check (
    status not in ('done','cancelled')
    or closed_at is not null
  )
);

-- ── 2) Indexes ──────────────────────────────────────────────────────
-- The board's primary query: open work for a role, newest / by priority.
create index if not exists work_items_role_status_idx
  on public.work_items(assigned_role, status, created_at desc);

-- The per-person "my inbox" query.
create index if not exists work_items_assignee_idx
  on public.work_items(assigned_to, status)
  where assigned_to is not null;

-- "Show every live job by stage" — the cross-department board columns.
create index if not exists work_items_status_idx
  on public.work_items(status, created_at desc);

-- Reverse lookup: given a domain row, is there an open work_item for it?
-- (used by the additive status-cascade hook to find-or-create.)
create index if not exists work_items_entity_idx
  on public.work_items(entity_type, entity_ref);

-- Overdue scan — open/in_progress items past their due_at.
create index if not exists work_items_due_idx
  on public.work_items(due_at)
  where due_at is not null and status in ('open','in_progress','blocked');

-- ── 3) updated_at auto-touch ────────────────────────────────────────
-- public.set_updated_at() is defined in the early migrations (used by
-- orders / corporate / addresses / wallet / refund_requests) — reuse it.
drop trigger if exists work_items_updated_at_trigger on public.work_items;
create trigger work_items_updated_at_trigger
  before update on public.work_items
  for each row execute function public.set_updated_at();

-- ── 4) RLS ──────────────────────────────────────────────────────────
alter table public.work_items enable row level security;

-- SELECT — cross-department visibility is the WHOLE point of the board,
-- so every operational + supervisory admin role can read. NO customer
-- access (no auth.uid()-self policy — the table is internal-only).
drop policy if exists "work_items_admin_select" on public.work_items;
create policy "work_items_admin_select" on public.work_items
  for select
  using (public.is_admin(array[
    'super','ops','accounting','sales_admin','warehouse','driver','interpreter'
  ]));

-- WRITE — table-level INSERT/UPDATE/DELETE pinned to super + ops (the
-- operations-coordination roles). Every other role mutates work_items
-- through the requireAdmin-gated Server Actions in
-- actions/admin/work-items.ts, which use the service-role admin client
-- (RLS-bypassing) — the action's requireAdmin([...]) is the real gate.
-- Keeping the direct PostgREST write surface narrow means a low-trust
-- warehouse / driver JWT cannot rewrite the board directly (the 0062
-- S-1 exploit class). EXPLICIT role array — never bare is_admin().
drop policy if exists "work_items_admin_write" on public.work_items;
create policy "work_items_admin_write" on public.work_items
  for all
  using      (public.is_admin(array['super','ops']))
  with check (public.is_admin(array['super','ops']));

-- ── 5) find-or-create helper (additive cascade hook support) ────────
-- §1.4 says the work_items spine should be opened/advanced by the same
-- status-change events the U1-2 cascade already fires on. Rather than a
-- DB trigger on 10 heterogeneous domain tables, we expose ONE idempotent
-- SECURITY DEFINER function that the warehouse / order / freight Server
-- Actions can call (best-effort, post-status-change) to ensure a board
-- entry exists for a domain row. Re-callable: if a non-closed work_item
-- already exists for (entity_type, entity_ref) it is returned untouched;
-- otherwise one is inserted at status='open'. This makes the spine
-- additive — domain code calls it, it never rewrites domain tables.
create or replace function public.ensure_work_item(
  p_entity_type   text,
  p_entity_ref    text,
  p_type          text,
  p_title         text,
  p_assigned_role text default 'ops',
  p_priority      text default 'normal',
  p_due_at        timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  new_id      uuid;
begin
  -- Already an open / in-progress / blocked item for this domain row?
  select id into existing_id
    from public.work_items
   where entity_type = p_entity_type
     and entity_ref  = p_entity_ref
     and status in ('open','in_progress','blocked')
   order by created_at desc
   limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.work_items
    (entity_type, entity_ref, type, title, assigned_role, priority, due_at)
  values
    (p_entity_type, p_entity_ref, p_type, p_title, p_assigned_role, p_priority, p_due_at)
  returning id into new_id;

  return new_id;
end;
$$;

-- Only the service-role admin client calls this (from a requireAdmin-gated
-- Server Action) — mirror next_refund_request_no (0058): no anon/authenticated
-- execute grant. Keeps the helper off the public PostgREST surface entirely.
revoke all     on function public.ensure_work_item(text,text,text,text,text,text,timestamptz) from public, authenticated, anon;
grant  execute on function public.ensure_work_item(text,text,text,text,text,text,timestamptz) to service_role;

-- ── 6) Comments ─────────────────────────────────────────────────────
comment on table public.work_items is
  '0080 — cross-department work-board / job-assignment spine (operating-system-analysis-2026-05-18.md §1.4). A thin ADDITIVE overlay: each row points (entity_type, entity_ref) at a domain row and carries the assignment + lifecycle state the domain row lacks. The /admin/board page + per-role inbox read this table; domain tables are NOT replaced.';
comment on column public.work_items.entity_type is
  'Names the domain table. entity_ref is its natural key as text. 10 types — see migration header for the per-type ref mapping (f_no / h_no / code / uuid::text).';
comment on column public.work_items.entity_ref is
  'Polymorphic domain key as TEXT (no cross-table FK — spans 10 tables / mixed PK types). Mirrors refund_requests.source_ref (0058).';
comment on column public.work_items.type is
  'Work category — drives board icon + default routing. intake_review | payment_followup | warehouse_action | doc_issue | customs_clearance | delivery_dispatch | cs_followup | refund_process | qa_check | general.';
comment on column public.work_items.status is
  'open → in_progress → done (terminal) | → cancelled (terminal). blocked = non-terminal hold. Transitions enforced in actions/admin/work-items.ts with an optimistic .eq(status, expectedFrom) race-guard.';
comment on column public.work_items.assigned_role is
  'The DEPARTMENT that owns this item (always set). Drives the per-role inbox. Within the admins.role set (0033 + 0054).';
comment on column public.work_items.assigned_to is
  'Optional pin to one person (a profiles.id that is an admin). NULL = the whole assigned_role department owns it.';
comment on column public.work_items.due_at is
  'SLA target. NULL = no SLA. The work_items_due_idx powers the overdue scan on the board.';
comment on constraint work_items_closed_consistent on public.work_items is
  'A done / cancelled work_item MUST carry closed_at — audit completeness (mirrors the refund_requests *_consistent constraints in 0058).';
comment on function public.ensure_work_item(text,text,text,text,text,text,timestamptz) is
  '0080 — idempotent find-or-create for a board entry on a domain row. Returns the existing open/in_progress/blocked work_item for (entity_type, entity_ref) if one exists, else inserts a new open one. Called best-effort by domain Server Actions post-status-change so the work_items spine stays ADDITIVE (no DB trigger on the 10 domain tables).';

-- ── 7) Verify (counts) ──────────────────────────────────────────────
do $$
declare
  rls_count int;
  idx_count int;
begin
  select count(*) into rls_count
    from pg_policies
   where schemaname = 'public' and tablename = 'work_items';
  if rls_count < 2 then
    raise warning '0080 work_items RLS expected >= 2 policies, found %', rls_count;
  else
    raise notice '0080 work_items ready — % RLS policies installed', rls_count;
  end if;

  select count(*) into idx_count
    from pg_indexes
   where schemaname = 'public' and tablename = 'work_items';
  raise notice '0080 work_items — % indexes installed', idx_count;
end $$;


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0081_pcs_legacy_schema.sql                                     ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- 0081 · PCS Cargo legacy schema — 117 tables (D1 Phase A)
-- ════════════════════════════════════════════════════════════
-- Source: legacy MySQL `pcsc_main` — phpMyAdmin dump 2026-05-18-1358
--         (117 tables · 3,780,238 rows · ~8,898 customers).
-- D1 / ADR-0017: Pacred becomes the legacy PCS Cargo system, faithfully,
--   rebranded PCS → PR. Runbook: docs/runbook/pcs-data-migration.md.
--
-- THIS FILE = schema only — CREATE TABLE + PRIMARY KEY + sequences + the
--   legacy column COMMENTs. It carries NO customer data.
--   · indexes + sequence resync → 0082_pcs_legacy_indexes.sql
--   · PR member-code generator  → 0083_pcs_legacy_member_seq.sql
--   · the 3.78M data rows load SEPARATELY via psql (customer PII — never
--     committed to git; see runbook §5-§6).
--
-- Faithful-port notes (MySQL → PostgreSQL via pgloader):
--   · legacy table names kept verbatim — tb_* / tas_* / reserve_meeting_room.
--   · identifiers folded to lowercase (PostgreSQL-idiomatic: `userID` →
--     `userid`) — unquoted PG queries resolve to these. Phase-B code uses
--     lowercase column names.
--   · legacy types preserved — tinyint→smallint, datetime→timestamp,
--     decimal→numeric, year→smallint.
--   · datetime/date columns are NULLable — the legacy schema's NOT NULL
--     temporal columns hold 0000-00-00 sentinels, which have no PostgreSQL
--     representation and convert to NULL on load.
--   · the PCS→PR rebrand is applied to the DATA (userid / useridmain
--     columns) in the load step — this file is pure schema.
--   · legacy schema has 0 foreign keys / 0 triggers — none to port.
--
-- SECURITY — RLS is ENABLED on all 117 tables, with NO policies (below).
--   Supabase exposes every public-schema table to the `anon` role through
--   PostgREST. These tables hold customer PII — names, phones, emails,
--   addresses — and password hashes (tb_users.userpass). RLS-enabled +
--   no-policy locks every table to service_role only: the secure default.
--   Phase-B (ภูม) adds the per-table customer/staff access policies.
-- ════════════════════════════════════════════════════════════

-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--





--
-- Name: reserve_meeting_room; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reserve_meeting_room (
    id bigint NOT NULL,
    event character varying(255) NOT NULL,
    datemeet date,
    start_date time without time zone NOT NULL,
    end_date time without time zone NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    note text NOT NULL
);


--
-- Name: reserve_meeting_room_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reserve_meeting_room_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reserve_meeting_room_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reserve_meeting_room_id_seq OWNED BY public.reserve_meeting_room.id;


--
-- Name: tas_historydata_mobile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tas_historydata_mobile (
    id bigint NOT NULL,
    date date,
    "time" time without time zone NOT NULL,
    adminid character varying(30) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    datetimeupload timestamp without time zone,
    name character varying(200) NOT NULL,
    scanid character varying(20) NOT NULL,
    status character varying(4) NOT NULL,
    note text NOT NULL,
    latitude numeric(10,8) NOT NULL,
    longitude numeric(20,8) NOT NULL,
    noteuser text NOT NULL
);


--
-- Name: tas_historydata_mobile_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tas_historydata_mobile_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tas_historydata_mobile_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tas_historydata_mobile_id_seq OWNED BY public.tas_historydata_mobile.id;


--
-- Name: tas_historydataold; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tas_historydataold (
    id bigint NOT NULL,
    date date,
    "time" time without time zone NOT NULL,
    adminid character varying(30) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    datetimeupload timestamp without time zone,
    name character varying(200) NOT NULL,
    scanid character varying(20) NOT NULL,
    status character varying(4) NOT NULL,
    note text NOT NULL
);


--
-- Name: tas_historydataold_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tas_historydataold_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tas_historydataold_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tas_historydataold_id_seq OWNED BY public.tas_historydataold.id;


--
-- Name: tas_historydataold_tmp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tas_historydataold_tmp (
    id bigint NOT NULL,
    date date,
    "time" time without time zone NOT NULL,
    adminid character varying(30) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    datetimeupload timestamp without time zone,
    name character varying(200) NOT NULL,
    scanid character varying(20) NOT NULL,
    status character varying(4) NOT NULL,
    note text NOT NULL,
    filename character varying(250) NOT NULL
);


--
-- Name: tas_historydataold_tmp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tas_historydataold_tmp_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tas_historydataold_tmp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tas_historydataold_tmp_id_seq OWNED BY public.tas_historydataold_tmp.id;


--
-- Name: tas_holiday; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tas_holiday (
    id bigint NOT NULL,
    holidayname character varying(255) NOT NULL,
    holidaydate date,
    adminidcreate character varying(30) NOT NULL,
    date timestamp without time zone,
    note text NOT NULL
);


--
-- Name: tas_holiday_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tas_holiday_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tas_holiday_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tas_holiday_id_seq OWNED BY public.tas_holiday.id;


--
-- Name: tas_holiday_maid; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tas_holiday_maid (
    id bigint NOT NULL,
    holidaydate date,
    adminidcreate character varying(30) NOT NULL,
    date timestamp without time zone,
    note text NOT NULL,
    adminid character varying(30) NOT NULL
);


--
-- Name: tas_holiday_maid_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tas_holiday_maid_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tas_holiday_maid_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tas_holiday_maid_id_seq OWNED BY public.tas_holiday_maid.id;


--
-- Name: tas_leave; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tas_leave (
    id bigint NOT NULL,
    type character varying(1) NOT NULL,
    startdate date,
    enddate date,
    duration character varying(1) NOT NULL,
    reason text NOT NULL,
    filename character varying(250) NOT NULL,
    adminid character varying(30) NOT NULL,
    date timestamp without time zone,
    status character varying(1) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    adminidceo character varying(30) NOT NULL,
    adminidhr character varying(30) NOT NULL
);


--
-- Name: TABLE tas_leave; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tas_leave IS 'การลางาน';


--
-- Name: COLUMN tas_leave.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tas_leave.type IS 'ประเภทการลา 1=ลาป่วย,2=ลาพักผ่อน,3=ลากิจส่วนตัว,4=ลาคลอด';


--
-- Name: COLUMN tas_leave.duration; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tas_leave.duration IS '1=ทั้งวัน,2=ครึ่งวันเช้า,3=ครึ่งวันบ่าย';


--
-- Name: COLUMN tas_leave.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tas_leave.status IS '1=รอ HR ตรวจสอบ, 2=รอผู้บริหารอนุมัติ, 3=อนุมัติ,4=ไม่อนุมัติ';


--
-- Name: tas_leave_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tas_leave_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tas_leave_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tas_leave_id_seq OWNED BY public.tas_leave.id;


--
-- Name: tb_account_pcs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_account_pcs (
    id bigint NOT NULL,
    bankname character varying(300) NOT NULL,
    accountnumber character varying(300) NOT NULL,
    accountname character varying(300) NOT NULL,
    adminid character varying(30) NOT NULL
);


--
-- Name: tb_account_pcs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_account_pcs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_account_pcs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_account_pcs_id_seq OWNED BY public.tb_account_pcs.id;


--
-- Name: tb_address; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_address (
    addressid bigint NOT NULL,
    addressstatus character varying(1) DEFAULT '1'::character varying NOT NULL,
    addressname character varying(200) NOT NULL,
    addresslastname character varying(200) NOT NULL,
    addresstel character varying(10) NOT NULL,
    addresstel2 character varying(10),
    addressno character varying(200) NOT NULL,
    addresssubdistrict character varying(255) NOT NULL,
    addressdistrict character varying(255) NOT NULL,
    addressprovince character varying(255) NOT NULL,
    addresszipcode character varying(5) NOT NULL,
    addressnote text NOT NULL,
    userid character varying(10) NOT NULL,
    adminid character varying(30) NOT NULL,
    latitude numeric(10,8) NOT NULL,
    longitude numeric(10,8) NOT NULL
);


--
-- Name: COLUMN tb_address.addressstatus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addressstatus IS 'สถานะการลบที่อยู่ 1=ใช้งาน,0=ลบ';


--
-- Name: COLUMN tb_address.addressname; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addressname IS 'ชื่อ';


--
-- Name: COLUMN tb_address.addresslastname; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addresslastname IS 'นามสกุล';


--
-- Name: COLUMN tb_address.addresstel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addresstel IS 'เบอร์โทร';


--
-- Name: COLUMN tb_address.addresstel2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addresstel2 IS 'เบอร์โทร2';


--
-- Name: COLUMN tb_address.addressno; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addressno IS 'บ้านเลขที่';


--
-- Name: COLUMN tb_address.addresssubdistrict; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addresssubdistrict IS 'ตำบล';


--
-- Name: COLUMN tb_address.addressdistrict; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addressdistrict IS 'อำเภอ';


--
-- Name: COLUMN tb_address.addressprovince; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addressprovince IS 'จังหวัด';


--
-- Name: COLUMN tb_address.addresszipcode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addresszipcode IS 'รหัสไปรษณีย์';


--
-- Name: COLUMN tb_address.addressnote; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.addressnote IS 'หมายเหตุเพิ่มเติม';


--
-- Name: COLUMN tb_address.userid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.userid IS 'รหัสสมาชิก';


--
-- Name: COLUMN tb_address.adminid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address.adminid IS 'admin ที่สร้างรายการ';


--
-- Name: tb_address_addressid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_address_addressid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_address_addressid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_address_addressid_seq OWNED BY public.tb_address.addressid;


--
-- Name: tb_address_main; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_address_main (
    id bigint NOT NULL,
    addressid bigint NOT NULL,
    userid character varying(10) NOT NULL
);


--
-- Name: tb_address_main_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_address_main_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_address_main_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_address_main_id_seq OWNED BY public.tb_address_main.id;


--
-- Name: tb_address_maomao_free; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_address_maomao_free (
    id bigint NOT NULL,
    datetime timestamp without time zone,
    addresssubdistrict character varying(255) NOT NULL,
    addressdistrict character varying(255) NOT NULL,
    addressprovince character varying(255) NOT NULL,
    addresszipcode character varying(5) NOT NULL,
    userid character varying(10) NOT NULL,
    adminid character varying(30) NOT NULL
);


--
-- Name: COLUMN tb_address_maomao_free.addresssubdistrict; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address_maomao_free.addresssubdistrict IS 'ตำบล';


--
-- Name: COLUMN tb_address_maomao_free.addressdistrict; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address_maomao_free.addressdistrict IS 'อำเภอ';


--
-- Name: COLUMN tb_address_maomao_free.addressprovince; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address_maomao_free.addressprovince IS 'จังหวัด';


--
-- Name: COLUMN tb_address_maomao_free.addresszipcode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address_maomao_free.addresszipcode IS 'รหัสไปรษณีย์';


--
-- Name: COLUMN tb_address_maomao_free.userid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address_maomao_free.userid IS 'รหัสสมาชิก';


--
-- Name: COLUMN tb_address_maomao_free.adminid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_address_maomao_free.adminid IS 'admin ที่สร้างรายการ';


--
-- Name: tb_address_maomao_free_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_address_maomao_free_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_address_maomao_free_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_address_maomao_free_id_seq OWNED BY public.tb_address_maomao_free.id;


--
-- Name: tb_admin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_admin (
    id integer NOT NULL,
    adminid character varying(20) NOT NULL,
    adminstatusa character varying(1) DEFAULT '1'::character varying NOT NULL,
    adminpass character varying(80) NOT NULL,
    adminname character varying(255) NOT NULL,
    adminlastname character varying(255) NOT NULL,
    adminemail character varying(255) NOT NULL,
    adminemailorg bigint NOT NULL,
    adminsex character varying(4),
    adminbirthday timestamp without time zone,
    adminstatus character varying(2) NOT NULL,
    adminstatussale character varying(1) NOT NULL,
    adminpicture character varying(150) DEFAULT 'user.jpg'::character varying NOT NULL,
    adminregistered timestamp without time zone,
    admintel character varying(13) NOT NULL,
    adminlastlogin timestamp without time zone,
    pcs_admin_logged character varying(80),
    admintype character varying(1) NOT NULL,
    department character varying(2) NOT NULL,
    section character varying(2) NOT NULL,
    companytype character varying(1) NOT NULL,
    startdate timestamp without time zone,
    enddate timestamp without time zone,
    enddateoflogin timestamp without time zone,
    admindel character varying(40) NOT NULL,
    datedel timestamp without time zone,
    adminnickname character varying(30) NOT NULL,
    admintmp character varying(1) NOT NULL,
    admintelorg bigint NOT NULL,
    salarytype character varying(1) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    nationalidcard character varying(25) NOT NULL,
    expirydate date,
    salary numeric(10,2) NOT NULL,
    datecreate timestamp without time zone,
    statusresetpass character varying(1) NOT NULL,
    nationalidcardfile character varying(255) NOT NULL,
    copyhouseregistrationfile character varying(255) NOT NULL,
    resumefile character varying(255) NOT NULL,
    religion character varying(2) NOT NULL,
    nationality character varying(200) NOT NULL,
    maritalstatus character varying(2) NOT NULL,
    adminlinetokennotify character varying(100) NOT NULL,
    dateadminlinetokennotify timestamp without time zone,
    bearer_token character varying(255) NOT NULL
);


--
-- Name: COLUMN tb_admin.adminstatusa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_admin.adminstatusa IS 'สถานะการใช้งานบัญชี 1=ใช้งาน,0=ไม่ใช้งาน';


--
-- Name: COLUMN tb_admin.adminemailorg; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_admin.adminemailorg IS 'เมลองค์กร';


--
-- Name: COLUMN tb_admin.adminstatus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_admin.adminstatus IS 'สิทธิ์การเข้าถึงข้อมูล';


--
-- Name: COLUMN tb_admin.admintype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_admin.admintype IS '1=พนักงานประจำ, 2=ทดลองงาน, 3=เด็กฝึกงาน, 4=สหกิจศึกษา, 5=พาสเนอร์, 6=คนในบ้าน';


--
-- Name: COLUMN tb_admin.admintmp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_admin.admintmp IS '2=พักชัวคราว';


--
-- Name: COLUMN tb_admin.religion; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_admin.religion IS '1 = พุทธศาสนา,2 = คริสต์ศาสนา,3 = อิสลาม,4 = ฮินดู,5 = ซิกข์,6 = ยูดาห์,7 = ไม่มีศาสนา,8 = ศาสนาอื่นๆ	';


--
-- Name: COLUMN tb_admin.maritalstatus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_admin.maritalstatus IS '1 = โสด,2 = แต่งงานแล้ว,3 = หย่าร้าง,4 = ม่าย,5 = แยกกันอยู่,6 = มีความสัมพันธ์,7 = หมั้น,8 = อื่น ๆ';


--
-- Name: tb_admin_address; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_admin_address (
    id bigint NOT NULL,
    addressno text NOT NULL,
    district character varying(255) NOT NULL,
    amphoe character varying(255) NOT NULL,
    province character varying(255) NOT NULL,
    zipcode character varying(10) NOT NULL,
    addressnote text NOT NULL,
    date timestamp without time zone,
    adminid character varying(30) NOT NULL
);


--
-- Name: tb_admin_address_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_admin_address_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_admin_address_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_admin_address_id_seq OWNED BY public.tb_admin_address.id;


--
-- Name: tb_admin_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_admin_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_admin_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_admin_id_seq OWNED BY public.tb_admin.id;


--
-- Name: tb_api_china_hs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_api_china_hs (
    id bigint NOT NULL,
    whsid bigint NOT NULL,
    url text NOT NULL,
    type integer NOT NULL,
    status integer NOT NULL,
    namecategory character varying(200) NOT NULL
);


--
-- Name: COLUMN tb_api_china_hs.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_api_china_hs.type IS '1=ค้นหาคำ,2=วางลิงก์1688,3=วางลิงก์taobao,4=วางลิงก์tmall';


--
-- Name: COLUMN tb_api_china_hs.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_api_china_hs.status IS '0=ทำงานปกติ,1=ไม่ทำงาน';


--
-- Name: tb_api_china_hs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_api_china_hs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_api_china_hs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_api_china_hs_id_seq OWNED BY public.tb_api_china_hs.id;


--
-- Name: tb_bill; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_bill (
    billid bigint NOT NULL,
    date timestamp without time zone,
    printstatus character varying(1) NOT NULL,
    adminid character varying(30) NOT NULL
);


--
-- Name: tb_bill_billid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_bill_billid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_bill_billid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_bill_billid_seq OWNED BY public.tb_bill.billid;


--
-- Name: tb_bill_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_bill_item (
    id bigint NOT NULL,
    billid bigint NOT NULL,
    fid bigint NOT NULL
);


--
-- Name: tb_bill_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_bill_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_bill_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_bill_item_id_seq OWNED BY public.tb_bill_item.id;


--
-- Name: tb_cart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_cart (
    id integer NOT NULL,
    cdetails text NOT NULL,
    curl character varying(300) NOT NULL,
    ctitle character varying(300) NOT NULL,
    cnameshop character varying(300) DEFAULT 'pcs'::character varying NOT NULL,
    cprovider character varying(1) DEFAULT '4'::character varying NOT NULL,
    cimages character varying(300) NOT NULL,
    cprice numeric(10,2) NOT NULL,
    camount integer NOT NULL,
    ccolor character varying(200) NOT NULL,
    csize character varying(200) NOT NULL,
    userid character varying(30) NOT NULL
);


--
-- Name: COLUMN tb_cart.cnameshop; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_cart.cnameshop IS 'pcs=ไม่มีชื่อร้าน';


--
-- Name: tb_cart_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_cart_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_cart_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_cart_id_seq OWNED BY public.tb_cart.id;


--
-- Name: tb_cash_back; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_cash_back (
    userid character varying(10) NOT NULL,
    cbtotal numeric(10,2) NOT NULL
);


--
-- Name: tb_cash_back_hs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_cash_back_hs (
    cbhid bigint NOT NULL,
    cbhdate timestamp without time zone,
    cbhstatus character varying(1) NOT NULL,
    cbhamount numeric(10,2) NOT NULL,
    userid character varying(10) NOT NULL,
    cbhrefid text NOT NULL
);


--
-- Name: COLUMN tb_cash_back_hs.cbhstatus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_cash_back_hs.cbhstatus IS '1=บวกเพิ่ม,2=ชำระเงิน';


--
-- Name: tb_cash_back_hs_cbhid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_cash_back_hs_cbhid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_cash_back_hs_cbhid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_cash_back_hs_cbhid_seq OWNED BY public.tb_cash_back_hs.cbhid;


--
-- Name: tb_check_forwarder; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_check_forwarder (
    id bigint NOT NULL,
    cfstatus character varying(1) NOT NULL,
    fid bigint NOT NULL,
    date timestamp without time zone,
    adminid character varying(50) NOT NULL
);


--
-- Name: tb_check_forwarder_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_check_forwarder_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_check_forwarder_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_check_forwarder_id_seq OWNED BY public.tb_check_forwarder.id;


--
-- Name: tb_cnt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_cnt (
    id bigint NOT NULL,
    cntname character varying(1000) NOT NULL,
    cntstatus character varying(1) NOT NULL,
    cntamount numeric(10,2) NOT NULL,
    cntimagesslip character varying(200) NOT NULL,
    date timestamp without time zone,
    adminidcreate character varying(30) NOT NULL,
    nameblank character varying(300) NOT NULL,
    noblank character varying(200) NOT NULL,
    nameaccount character varying(300) NOT NULL,
    cntfile character varying(200) NOT NULL,
    dateupdate timestamp without time zone,
    adminidupdate character varying(30) NOT NULL
);


--
-- Name: TABLE tb_cnt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tb_cnt IS 'ตารางจ่ายเงินค่าตู้';


--
-- Name: COLUMN tb_cnt.cntname; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_cnt.cntname IS 'เลขตู้';


--
-- Name: COLUMN tb_cnt.cntamount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_cnt.cntamount IS 'จำนวนเงินที่จ่าย';


--
-- Name: COLUMN tb_cnt.date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_cnt.date IS 'วันที่ทำรายการ';


--
-- Name: COLUMN tb_cnt.adminidcreate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_cnt.adminidcreate IS 'แอดมินทำรายการ';


--
-- Name: tb_cnt_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_cnt_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_cnt_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_cnt_id_seq OWNED BY public.tb_cnt.id;


--
-- Name: tb_cnt_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_cnt_item (
    id bigint NOT NULL,
    fcabinetnumber character varying(300) NOT NULL,
    cntid bigint NOT NULL
);


--
-- Name: tb_cnt_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_cnt_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_cnt_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_cnt_item_id_seq OWNED BY public.tb_cnt_item.id;


--
-- Name: tb_cnt_pay_idorco; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_cnt_pay_idorco (
    id bigint NOT NULL,
    fidorco character varying(30) NOT NULL,
    fcabinetnumber character varying(300) NOT NULL
);


--
-- Name: TABLE tb_cnt_pay_idorco; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tb_cnt_pay_idorco IS 'รายการจ่ายเงินเลข PK';


--
-- Name: tb_cnt_pay_idorco_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_cnt_pay_idorco_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_cnt_pay_idorco_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_cnt_pay_idorco_id_seq OWNED BY public.tb_cnt_pay_idorco.id;


--
-- Name: tb_cnt_pay_trackingchn; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_cnt_pay_trackingchn (
    id bigint NOT NULL,
    ftrackingchn character varying(50) NOT NULL,
    fcabinetnumber character varying(300) NOT NULL
);


--
-- Name: TABLE tb_cnt_pay_trackingchn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tb_cnt_pay_trackingchn IS 'ข้อมูลจ่ายตามเลขแทรคกิ้ง';


--
-- Name: tb_cnt_pay_trackingchn_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_cnt_pay_trackingchn_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_cnt_pay_trackingchn_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_cnt_pay_trackingchn_id_seq OWNED BY public.tb_cnt_pay_trackingchn.id;


--
-- Name: tb_co; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_co (
    id integer NOT NULL,
    costatus character varying(1) DEFAULT '1'::character varying NOT NULL,
    coid character varying(10) NOT NULL,
    coname character varying(255) NOT NULL
);


--
-- Name: tb_co_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_co_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_co_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_co_id_seq OWNED BY public.tb_co.id;


--
-- Name: tb_contact_outsider; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_contact_outsider (
    id bigint NOT NULL,
    title text NOT NULL,
    coname character varying(255) NOT NULL,
    colastname character varying(255) NOT NULL,
    coemail character varying(255) NOT NULL,
    cotel character varying(13) NOT NULL,
    coaddress text NOT NULL,
    conickname character varying(255) NOT NULL,
    note text NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    adminidcreate character varying(30) NOT NULL,
    adminidupdate character varying(30) NOT NULL
);


--
-- Name: TABLE tb_contact_outsider; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tb_contact_outsider IS 'รายชื่อติดต่อบุคคลภายนอก';


--
-- Name: tb_contact_outsider_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_contact_outsider_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_contact_outsider_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_contact_outsider_id_seq OWNED BY public.tb_contact_outsider.id;


--
-- Name: tb_corporate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_corporate (
    id bigint NOT NULL,
    userid character varying(10) NOT NULL,
    corporatenumber character varying(13) NOT NULL,
    corporatename character varying(300) NOT NULL,
    corporateaddress text NOT NULL,
    corporatefile character varying(200) NOT NULL,
    corporatefile20 character varying(200) NOT NULL,
    cpdatecreate timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    corporatestatus character varying(1) NOT NULL
);


--
-- Name: tb_corporate_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_corporate_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_corporate_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_corporate_id_seq OWNED BY public.tb_corporate.id;


--
-- Name: tb_cost_container; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_cost_container (
    id bigint NOT NULL,
    fcabinetnumber character varying(300) NOT NULL,
    fproductstype1 numeric(10,2) NOT NULL,
    fproductstype2 numeric(10,2) NOT NULL,
    fproductstype3 numeric(10,2) NOT NULL,
    fproductstype4 numeric(10,2) NOT NULL,
    adminid character varying(50),
    date timestamp without time zone
);


--
-- Name: tb_cost_container_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_cost_container_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_cost_container_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_cost_container_id_seq OWNED BY public.tb_cost_container.id;


--
-- Name: tb_credit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_credit (
    userid character varying(10) NOT NULL,
    creditvalue numeric(10,2) NOT NULL
);


--
-- Name: tb_csvimport; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_csvimport (
    id character varying(15) NOT NULL,
    csvname character varying(100) NOT NULL,
    csvdate timestamp without time zone,
    csvcount integer NOT NULL,
    csvcountprocess integer NOT NULL,
    adminid character varying(10) NOT NULL
);


--
-- Name: COLUMN tb_csvimport.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_csvimport.id IS 'ปีเดือนวัน-เวลา';


--
-- Name: tb_customrate_hs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_customrate_hs (
    id bigint NOT NULL,
    adminid character varying(50) NOT NULL,
    date timestamp without time zone,
    userid character varying(30) NOT NULL
);


--
-- Name: tb_customrate_hs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_customrate_hs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_customrate_hs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_customrate_hs_id_seq OWNED BY public.tb_customrate_hs.id;


--
-- Name: tb_education_background; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_education_background (
    id bigint NOT NULL,
    educationstatus character varying(1) NOT NULL,
    educationlevel character varying(1) NOT NULL,
    institution character varying(255) NOT NULL,
    faculty character varying(255) NOT NULL,
    educationdepartment character varying(255) NOT NULL,
    graduateyear smallint,
    gpa numeric(10,2) NOT NULL,
    adminid character varying(30) NOT NULL,
    date timestamp without time zone
);


--
-- Name: COLUMN tb_education_background.educationstatus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_education_background.educationstatus IS '1=จบการศึกษา, 2=กำลังศึกษาอยู่';


--
-- Name: COLUMN tb_education_background.educationlevel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_education_background.educationlevel IS '1=ต่ำกว่ามัธยมศึกษา,2=มัธยมศึกษาตอนต้น,3=มัธยมศึกษาตอนปลาย,4=ปวช.,5=ปวท.,6=ปวส.,7=อนุปริญญา,8=ปริญญาตรี,9=ปริญญาโท,10=ปริญญาเอก';


--
-- Name: tb_education_background_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_education_background_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_education_background_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_education_background_id_seq OWNED BY public.tb_education_background.id;


--
-- Name: tb_farwarder_quotation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_farwarder_quotation (
    id bigint NOT NULL,
    fqno character varying(30) NOT NULL,
    date timestamp without time zone,
    adminidcreate character varying(30) NOT NULL,
    adminidapprover character varying(30) NOT NULL,
    dateapprover timestamp without time zone,
    compnumber character varying(13) NOT NULL,
    compname character varying(300) NOT NULL,
    compaddress text NOT NULL,
    contact character varying(500) NOT NULL,
    userid character varying(30) NOT NULL,
    email character varying(200) NOT NULL,
    tel character varying(15) NOT NULL
);


--
-- Name: COLUMN tb_farwarder_quotation.date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation.date IS 'วันที่สร้างรายการ';


--
-- Name: COLUMN tb_farwarder_quotation.adminidcreate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation.adminidcreate IS 'แอดมินที่สร้าง';


--
-- Name: COLUMN tb_farwarder_quotation.adminidapprover; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation.adminidapprover IS 'คนอนุมัติราคา';


--
-- Name: COLUMN tb_farwarder_quotation.dateapprover; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation.dateapprover IS 'เวลาที่อนุมัติ';


--
-- Name: COLUMN tb_farwarder_quotation.compnumber; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation.compnumber IS 'เลขผู้เสียภาษี';


--
-- Name: COLUMN tb_farwarder_quotation.compname; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation.compname IS 'ชื่อบริษัท';


--
-- Name: COLUMN tb_farwarder_quotation.compaddress; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation.compaddress IS 'ที่อยู่บริษัท';


--
-- Name: COLUMN tb_farwarder_quotation.contact; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation.contact IS 'ผู้ติดต่อมา';


--
-- Name: tb_farwarder_quotation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_farwarder_quotation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_farwarder_quotation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_farwarder_quotation_id_seq OWNED BY public.tb_farwarder_quotation.id;


--
-- Name: tb_farwarder_quotation_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_farwarder_quotation_item (
    id bigint NOT NULL,
    fqid bigint NOT NULL,
    warehousetype character varying(1) NOT NULL,
    transporttype character varying(1) NOT NULL,
    producttype character varying(1) NOT NULL,
    price numeric(10,2) NOT NULL
);


--
-- Name: COLUMN tb_farwarder_quotation_item.warehousetype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation_item.warehousetype IS '1=กวางโจว,2=อี้อู';


--
-- Name: COLUMN tb_farwarder_quotation_item.transporttype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation_item.transporttype IS '1=ทางรถ,2=เรือ';


--
-- Name: COLUMN tb_farwarder_quotation_item.producttype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_farwarder_quotation_item.producttype IS '1=ทั่วไป';


--
-- Name: tb_farwarder_quotation_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_farwarder_quotation_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_farwarder_quotation_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_farwarder_quotation_item_id_seq OWNED BY public.tb_farwarder_quotation_item.id;


--
-- Name: tb_forwarder; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder (
    id bigint NOT NULL,
    fdate timestamp without time zone,
    fstatus character varying(2) DEFAULT '1'::character varying NOT NULL,
    paydeposit character varying(1),
    fpallet character varying(100),
    fdatestatus2 timestamp without time zone,
    fdatestatus3 timestamp without time zone,
    fdatestatus4 timestamp without time zone,
    fdatestatus5 timestamp without time zone,
    fdatestatus6 timestamp without time zone,
    fdatestatus7 timestamp without time zone,
    fstatuscaron character varying(1),
    fstatuscardateon timestamp without time zone,
    fstatuscaradminon character varying(10) NOT NULL,
    fstatuscaroff character varying(1) NOT NULL,
    fstatuscardateoff timestamp without time zone,
    fstatuscaradminoff character varying(10) NOT NULL,
    printstatus1 character varying(1) DEFAULT '0'::character varying NOT NULL,
    printstatus2 character varying(1) DEFAULT '0'::character varying NOT NULL,
    printstatus3 character varying(1) DEFAULT '0'::character varying NOT NULL,
    printstatus4 character varying(1) NOT NULL,
    fdatekey timestamp without time zone,
    fdateadminstatus timestamp without time zone,
    fdatebarcode timestamp without time zone,
    fwarehousechina character varying(1) NOT NULL,
    fwarehousename character varying(1) NOT NULL,
    ftransporttype character varying(1) NOT NULL,
    fcabinetnumber character varying(300) NOT NULL,
    fidorco character varying(30),
    ftrackingchn character varying(50) NOT NULL,
    ftrackingchn2 character varying(100),
    fdatetothai date,
    fdatecontainerclose timestamp without time zone,
    fshipby character varying(10) NOT NULL,
    ffreeshipping character varying(1) NOT NULL,
    ftrackingth character varying(50) DEFAULT '-'::character varying NOT NULL,
    famount integer DEFAULT 1 NOT NULL,
    famountcount character varying(1),
    fdetail text NOT NULL,
    fnote text,
    fnoteuser character varying(1) NOT NULL,
    fnoteuserread character varying(1) NOT NULL,
    fnotedate timestamp without time zone,
    fcover character varying(500) NOT NULL,
    fimg1 character varying(40),
    fimg2 character varying(40),
    fimg3 character varying(40),
    fimg4 character varying(40),
    fphotoend character varying(200) NOT NULL,
    fproductstype character varying(1) NOT NULL,
    fproductstype2 character varying(1),
    fweight numeric(10,2) NOT NULL,
    fwidth numeric(10,2) NOT NULL,
    flength numeric(10,2) NOT NULL,
    fheight numeric(10,2) NOT NULL,
    fvolume numeric(10,5) NOT NULL,
    customratekg numeric(10,2) NOT NULL,
    customratecbm numeric(10,2) NOT NULL,
    customrate character varying(1) DEFAULT '0'::character varying NOT NULL,
    frefprice character varying(1) NOT NULL,
    frefrate numeric(10,2) NOT NULL,
    fcostrefrate numeric(10,2) NOT NULL,
    ftransportprice numeric(10,2) NOT NULL,
    ftransportpricesum character varying(1),
    fpriceupdate numeric(10,2) NOT NULL,
    fdiscount numeric(10,2) NOT NULL,
    fshippingservice numeric(10,2) DEFAULT 0.00,
    ftotalprice numeric(10,2) NOT NULL,
    fcosttotalprice numeric(10,2) NOT NULL,
    fcosttotalpricesheet numeric(10,2) NOT NULL,
    fprofittransportchn numeric(10,2) NOT NULL,
    fprofitpriceupdate numeric(10,2) NOT NULL,
    fprofittotal numeric(10,2) NOT NULL,
    faddressname character varying(200) NOT NULL,
    faddresslastname character varying(200) NOT NULL,
    faddressno character varying(255) NOT NULL,
    faddresssubdistrict character varying(255) NOT NULL,
    faddressdistrict character varying(255) NOT NULL,
    faddressprovince character varying(255) NOT NULL,
    faddresszipcode character varying(5) NOT NULL,
    faddressnote text NOT NULL,
    faddresstel character varying(10) NOT NULL,
    faddresstel2 character varying(10) NOT NULL,
    faddresslatitude numeric(10,8) NOT NULL,
    faddresslongitude numeric(10,8) NOT NULL,
    userid character varying(10) NOT NULL,
    adminid character varying(10) NOT NULL,
    adminidcreator character varying(10) NOT NULL,
    adminidkey character varying(10) NOT NULL,
    flockdate timestamp without time zone,
    adminidupdate character varying(10) NOT NULL,
    session character varying(100) NOT NULL,
    reforder character varying(30) NOT NULL,
    fcredit character varying(1) NOT NULL,
    fcreditdate timestamp without time zone,
    fusercompany character varying(1) NOT NULL,
    fsendsms1day character varying(1) NOT NULL,
    fsendsms3day character varying(1) NOT NULL,
    fsendsms3eday character varying(1) NOT NULL,
    paymethod character varying(1) DEFAULT '1'::character varying NOT NULL,
    crate character varying(1) DEFAULT '2'::character varying NOT NULL,
    pricecrate numeric(10,2) NOT NULL,
    fqc character varying(1) NOT NULL,
    fqcprice numeric(10,2) NOT NULL,
    ftransportpricechnthb numeric(10,2) NOT NULL,
    pricemore character varying(1) NOT NULL,
    priceother numeric(10,2) NOT NULL,
    linkapiorder character varying(1) NOT NULL,
    smpcs character varying(255),
    subuserid character varying(50) NOT NULL
);


--
-- Name: COLUMN tb_forwarder.fdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fdate IS 'วันที่สร้าง';


--
-- Name: COLUMN tb_forwarder.paydeposit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.paydeposit IS '1 คือ รอตรวจสอบการจ่ายเงิน';


--
-- Name: COLUMN tb_forwarder.fdatestatus4; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fdatestatus4 IS 'สินค้าเข้าโกดังไทย';


--
-- Name: COLUMN tb_forwarder.fstatuscaron; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fstatuscaron IS 'สถานะรายการขึ้นรถ: ';


--
-- Name: COLUMN tb_forwarder.printstatus1; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.printstatus1 IS '0=ยังไม่พิมพ์,1=พิมพ์แล้ว	';


--
-- Name: COLUMN tb_forwarder.printstatus2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.printstatus2 IS '0=ยังไม่พิมพ์,1=พิมพ์แล้ว';


--
-- Name: COLUMN tb_forwarder.printstatus3; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.printstatus3 IS '0=ยังไม่พิมพ์,1=พิมพ์แล้ว';


--
-- Name: COLUMN tb_forwarder.fdatekey; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fdatekey IS 'วันทีกรอกข้อมูลสินค้า';


--
-- Name: COLUMN tb_forwarder.fwarehousechina; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fwarehousechina IS '1=กวางโจว,2=อี้อู';


--
-- Name: COLUMN tb_forwarder.fwarehousename; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fwarehousename IS 'โกดังรับของที่จีน
1=แสง, 2=CTT, 3=MK, 4=MX, 5=JMF, 6=GOGO, 7=CargoCenter, 8=MOMO';


--
-- Name: COLUMN tb_forwarder.ftransporttype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.ftransporttype IS 'รูปแบบการขนส่ง';


--
-- Name: COLUMN tb_forwarder.fdatecontainerclose; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fdatecontainerclose IS 'วันที่ปิดตู้';


--
-- Name: COLUMN tb_forwarder.fshipby; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fshipby IS 'รูปแบบการขนส่งไทย';


--
-- Name: COLUMN tb_forwarder.ffreeshipping; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.ffreeshipping IS '1=สั่งตอนโปรส่งฟรี พื้นที่ กทม';


--
-- Name: COLUMN tb_forwarder.famount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.famount IS 'จำนวนกล่อง';


--
-- Name: COLUMN tb_forwarder.famountcount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.famountcount IS 'รวมกล่อง';


--
-- Name: COLUMN tb_forwarder.customrate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.customrate IS '0=คิดตามปกติ,1=กำหนดเอง';


--
-- Name: COLUMN tb_forwarder.ftransportprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.ftransportprice IS 'ค่าขนส่งในไทย';


--
-- Name: COLUMN tb_forwarder.ftransportpricesum; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.ftransportpricesum IS '1=คิดรวมรายการอื่น';


--
-- Name: COLUMN tb_forwarder.fdiscount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fdiscount IS 'ส่วนลด';


--
-- Name: COLUMN tb_forwarder.fshippingservice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fshippingservice IS 'ค่าบริการฝากนำเข้า';


--
-- Name: COLUMN tb_forwarder.fcosttotalprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fcosttotalprice IS 'ต้นทุนขนส่ง';


--
-- Name: COLUMN tb_forwarder.fcosttotalpricesheet; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fcosttotalpricesheet IS 'ต้นทุนจากSheet';


--
-- Name: COLUMN tb_forwarder.fprofittransportchn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fprofittransportchn IS 'กำไรค่าขนส่งจีน';


--
-- Name: COLUMN tb_forwarder.fprofitpriceupdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fprofitpriceupdate IS 'กำไร เพิ่ม/ลด เงิน';


--
-- Name: COLUMN tb_forwarder.fprofittotal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fprofittotal IS 'กำไรสุทธิ';


--
-- Name: COLUMN tb_forwarder.adminidkey; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.adminidkey IS 'คนkey กล่อง';


--
-- Name: COLUMN tb_forwarder.fusercompany; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fusercompany IS 'นค บริษัท';


--
-- Name: COLUMN tb_forwarder.paymethod; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.paymethod IS 'วิธีเก็บเงิน 1=ต้นทาง 2=ปลายทาง';


--
-- Name: COLUMN tb_forwarder.crate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.crate IS '1=ตีลัง';


--
-- Name: COLUMN tb_forwarder.fqc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fqc IS '1=ไม่ตรวจนับ, 2=ตรวจนับ';


--
-- Name: COLUMN tb_forwarder.fqcprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.fqcprice IS 'ค่า QC สินค้า';


--
-- Name: COLUMN tb_forwarder.ftransportpricechnthb; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.ftransportpricechnthb IS 'ค่าขนส่งจีน บาท';


--
-- Name: COLUMN tb_forwarder.pricemore; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.pricemore IS '1=ค่าตีลังไม้,2=ค่าขนส่งจีน';


--
-- Name: COLUMN tb_forwarder.priceother; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.priceother IS 'ค่าอื่นๆ qp';


--
-- Name: COLUMN tb_forwarder.linkapiorder; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.linkapiorder IS 'การเชื่อมต่อผ่าน API 1 = JMF';


--
-- Name: COLUMN tb_forwarder.smpcs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder.smpcs IS 'สำรองเชื่อม sm';


--
-- Name: tb_forwarder_driver; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_driver (
    id bigint NOT NULL,
    fddate timestamp without time zone,
    fdname character varying(200) NOT NULL,
    fdamount integer NOT NULL,
    fdadminid character varying(20) NOT NULL,
    fdadmincreator character varying(20) NOT NULL,
    fdstatus character varying(1) NOT NULL,
    endtime timestamp without time zone
);


--
-- Name: tb_forwarder_driver_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_driver_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_driver_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_driver_id_seq OWNED BY public.tb_forwarder_driver.id;


--
-- Name: tb_forwarder_driver_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_driver_item (
    id bigint NOT NULL,
    fdid bigint NOT NULL,
    fid bigint NOT NULL,
    fdistatus character varying(1) NOT NULL,
    fdipictureon character varying(150) NOT NULL,
    fdipictureoff character varying(150) NOT NULL
);


--
-- Name: COLUMN tb_forwarder_driver_item.fdipictureon; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_driver_item.fdipictureon IS 'รูปขึ้นรถ';


--
-- Name: COLUMN tb_forwarder_driver_item.fdipictureoff; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_driver_item.fdipictureoff IS 'ลงรถ';


--
-- Name: tb_forwarder_driver_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_driver_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_driver_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_driver_item_id_seq OWNED BY public.tb_forwarder_driver_item.id;


--
-- Name: tb_forwarder_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_id_seq OWNED BY public.tb_forwarder.id;


--
-- Name: tb_forwarder_img; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_img (
    id bigint NOT NULL,
    img character varying(255) NOT NULL,
    fid bigint NOT NULL
);


--
-- Name: tb_forwarder_img_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_img_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_img_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_img_id_seq OWNED BY public.tb_forwarder_img.id;


--
-- Name: tb_forwarder_import; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_import (
    id bigint NOT NULL,
    fid bigint NOT NULL,
    fiamount integer NOT NULL,
    fidate timestamp without time zone,
    adminid character varying(10) NOT NULL
);


--
-- Name: tb_forwarder_import2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_import2 (
    id bigint NOT NULL,
    fid bigint,
    keysearch character varying(80) NOT NULL,
    fipallet character varying(5) NOT NULL,
    fi2amount integer NOT NULL,
    fi2date timestamp without time zone,
    adminid character varying(10) NOT NULL
);


--
-- Name: tb_forwarder_import2_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_import2_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_import2_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_import2_id_seq OWNED BY public.tb_forwarder_import2.id;


--
-- Name: tb_forwarder_import_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_import_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_import_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_import_id_seq OWNED BY public.tb_forwarder_import.id;


--
-- Name: tb_forwarder_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_item (
    id bigint NOT NULL,
    productid bigint NOT NULL,
    productname character varying(255) NOT NULL,
    producttracking character varying(255) NOT NULL,
    producttrackingnote text NOT NULL,
    productqty integer NOT NULL,
    productbagid bigint NOT NULL,
    productwidth numeric(10,2) NOT NULL,
    productlength numeric(10,2) NOT NULL,
    productheight numeric(10,2) NOT NULL,
    productweightperitem numeric(10,2) NOT NULL,
    productweightall numeric(10,2) NOT NULL,
    productcbmperitem numeric(10,2) NOT NULL,
    productcbmall numeric(10,2) NOT NULL,
    productweightformat character varying(100) NOT NULL,
    producttypecode character varying(5) NOT NULL,
    containercode character varying(200) NOT NULL,
    userid character varying(50) NOT NULL,
    fid bigint NOT NULL,
    date timestamp without time zone,
    lasttimeupdated timestamp without time zone,
    adminid character varying(50) NOT NULL,
    adminidupdated character varying(50) NOT NULL,
    domesticshippingchina numeric(10,2) NOT NULL,
    chinawoodencratefeetype character varying(1) NOT NULL,
    chinawoodencratefee numeric(10,2) NOT NULL,
    locationwth character varying(20) NOT NULL,
    otherservicefee numeric(10,2) NOT NULL,
    thailanddeliveryfee numeric(10,2) NOT NULL,
    frefprice character varying(1) NOT NULL,
    fqc character varying(1) NOT NULL,
    fqcprice numeric(10,2) NOT NULL,
    fpriceupdate numeric(10,2) NOT NULL,
    fdiscount numeric(10,2) NOT NULL
);


--
-- Name: COLUMN tb_forwarder_item.adminid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.adminid IS 'แอดมินที่สร้าง';


--
-- Name: COLUMN tb_forwarder_item.adminidupdated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.adminidupdated IS 'แอดมินที่แก้ไขล่าสุด';


--
-- Name: COLUMN tb_forwarder_item.domesticshippingchina; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.domesticshippingchina IS 'ค่าขนส่งในจีน เดิมใน tb_forwarder fTransportPriceCHNTHB';


--
-- Name: COLUMN tb_forwarder_item.chinawoodencratefeetype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.chinawoodencratefeetype IS 'ตีลังไม้ 1=ไม่ตี, 2=ตีลัง เดิม tb_forwarder crate';


--
-- Name: COLUMN tb_forwarder_item.chinawoodencratefee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.chinawoodencratefee IS 'ค่าตีลังไม้';


--
-- Name: COLUMN tb_forwarder_item.otherservicefee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.otherservicefee IS 'ค่าบริการอื่น ๆ';


--
-- Name: COLUMN tb_forwarder_item.thailanddeliveryfee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.thailanddeliveryfee IS 'ค่าขนส่งในไทย';


--
-- Name: COLUMN tb_forwarder_item.frefprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.frefprice IS 'คิดเรทนำเข้าตาม 1=น้ำหนัก 2=ปริมาตร';


--
-- Name: COLUMN tb_forwarder_item.fqc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.fqc IS '	1=ไม่ตรวจนับ, 2=ตรวจนับ';


--
-- Name: COLUMN tb_forwarder_item.fqcprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.fqcprice IS 'ค่า QC สินค้า';


--
-- Name: COLUMN tb_forwarder_item.fpriceupdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.fpriceupdate IS 'ราคาที่เก็บเพิ่มมาจากฝากนำเข้า';


--
-- Name: COLUMN tb_forwarder_item.fdiscount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_item.fdiscount IS 'ส่วนลด';


--
-- Name: tb_forwarder_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_item_id_seq OWNED BY public.tb_forwarder_item.id;


--
-- Name: tb_forwarder_jmf_tmp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_jmf_tmp (
    id bigint NOT NULL,
    idjmf bigint NOT NULL,
    datecrate timestamp without time zone,
    ip character varying(250) NOT NULL,
    fdate timestamp without time zone,
    fwarehousechina character varying(1) NOT NULL,
    ftransporttype character varying(1) NOT NULL,
    fcabinetnumber character varying(255) NOT NULL,
    fidorco character varying(30) NOT NULL,
    ftrackingchn character varying(100) NOT NULL,
    ftrackingchn2 character varying(100) NOT NULL,
    fdatetothai timestamp without time zone,
    fdatecontainerclose timestamp without time zone,
    famount integer NOT NULL,
    fdetail text NOT NULL,
    fcover character varying(255) NOT NULL,
    fimg1 character varying(23) NOT NULL,
    fimg2 character varying(23) NOT NULL,
    fimg3 character varying(23) NOT NULL,
    fimg4 character varying(23) NOT NULL,
    fproductstype character varying(1) NOT NULL,
    fweight numeric(10,2) NOT NULL,
    fwidth numeric(10,2) NOT NULL,
    flength numeric(10,2) NOT NULL,
    fheight numeric(10,2) NOT NULL,
    fvolume numeric(10,5) NOT NULL,
    fshippingservice numeric(10,2) NOT NULL,
    userid character varying(50) NOT NULL,
    crate character varying(1) NOT NULL,
    pricecrate numeric(10,2) NOT NULL,
    ftransportpricechnthb numeric(10,2) NOT NULL,
    priceother numeric(10,2) NOT NULL,
    apistatus character varying(10) NOT NULL,
    apiresult character varying(10) NOT NULL
);


--
-- Name: COLUMN tb_forwarder_jmf_tmp.fwarehousechina; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_jmf_tmp.fwarehousechina IS '1=กวางโจว,2=อี้อู';


--
-- Name: COLUMN tb_forwarder_jmf_tmp.ftransporttype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_jmf_tmp.ftransporttype IS 'รูปแบบการขนส่ง';


--
-- Name: COLUMN tb_forwarder_jmf_tmp.crate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_jmf_tmp.crate IS '1=ตีลัง';


--
-- Name: COLUMN tb_forwarder_jmf_tmp.ftransportpricechnthb; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_jmf_tmp.ftransportpricechnthb IS 'ค่าขนส่งจีน บาท';


--
-- Name: COLUMN tb_forwarder_jmf_tmp.priceother; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_forwarder_jmf_tmp.priceother IS 'ค่าอื่นๆ';


--
-- Name: tb_forwarder_jmf_tmp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_jmf_tmp_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_jmf_tmp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_jmf_tmp_id_seq OWNED BY public.tb_forwarder_jmf_tmp.id;


--
-- Name: tb_forwarder_prepare; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_prepare (
    id bigint NOT NULL,
    fid bigint NOT NULL,
    fpamount integer NOT NULL,
    fpdate timestamp without time zone,
    adminid character varying(10) NOT NULL
);


--
-- Name: tb_forwarder_prepare_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_prepare_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_prepare_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_prepare_id_seq OWNED BY public.tb_forwarder_prepare.id;


--
-- Name: tb_forwarder_tran_th_h; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_tran_th_h (
    id bigint NOT NULL,
    date timestamp without time zone,
    adminidcreate character varying(30) NOT NULL
);


--
-- Name: tb_forwarder_tran_th_h_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_tran_th_h_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_tran_th_h_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_tran_th_h_id_seq OWNED BY public.tb_forwarder_tran_th_h.id;


--
-- Name: tb_forwarder_tran_th_sub; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_forwarder_tran_th_sub (
    id bigint NOT NULL,
    ftthhid bigint NOT NULL,
    fid bigint NOT NULL
);


--
-- Name: tb_forwarder_tran_th_sub_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_forwarder_tran_th_sub_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_forwarder_tran_th_sub_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_forwarder_tran_th_sub_id_seq OWNED BY public.tb_forwarder_tran_th_sub.id;


--
-- Name: tb_header_order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_header_order (
    id bigint NOT NULL,
    hstatus character varying(1) DEFAULT '1'::character varying NOT NULL,
    hshoppay character varying(1),
    paydeposit character varying(1),
    hno character varying(30) NOT NULL,
    htitle character varying(300) NOT NULL,
    hcover character varying(500) NOT NULL,
    hcount integer NOT NULL,
    hdate timestamp without time zone,
    hdate2 timestamp without time zone,
    hdate3 timestamp without time zone,
    hdate4 timestamp without time zone,
    hdate5 timestamp without time zone,
    hdateupdate timestamp without time zone,
    hdatepayment timestamp without time zone,
    htransporttype character varying(1) NOT NULL,
    htotalpricechn numeric(10,2) NOT NULL,
    htotalpriceuser numeric(10,2) NOT NULL,
    hshippingservice numeric(10,2) DEFAULT 0.00 NOT NULL,
    hshippingchn numeric(10,2) NOT NULL,
    hpriceupdate numeric(10,2) NOT NULL,
    hrate numeric(10,2) NOT NULL,
    hratecost numeric(10,2) DEFAULT 0.00 NOT NULL,
    hcostall numeric(10,2) DEFAULT 0.00 NOT NULL,
    hcostallth numeric(10,2) DEFAULT 0.00 NOT NULL,
    hnote text NOT NULL,
    hnoteuser character varying(1) NOT NULL,
    hnoteuserread character varying(1) NOT NULL,
    hnotedate timestamp without time zone,
    hprintbill2 character varying(1) NOT NULL,
    hshipby character varying(10) NOT NULL,
    hfreeshipping character varying(1) NOT NULL,
    hwarehousechina character varying(1),
    haddressname character varying(200) NOT NULL,
    haddresslastname character varying(200) NOT NULL,
    haddressno character varying(255) NOT NULL,
    haddresssubdistrict character varying(255) NOT NULL,
    haddressdistrict character varying(255) NOT NULL,
    haddressprovince character varying(255) NOT NULL,
    haddresszipcode character varying(5) NOT NULL,
    haddressnote text NOT NULL,
    haddresstel character varying(10) NOT NULL,
    haddresstel2 character varying(10) NOT NULL,
    hprintbill character varying(1) NOT NULL,
    userid character varying(30) NOT NULL,
    adminidcreate character varying(10),
    adminid character varying(10) NOT NULL,
    hlockdate timestamp without time zone,
    adminidupdate character varying(10) NOT NULL,
    session character varying(100) NOT NULL,
    paymethod character varying(1) NOT NULL,
    crate character varying(1) NOT NULL,
    fshippingservice numeric(10,2) NOT NULL,
    adminidip character varying(30) NOT NULL
);


--
-- Name: COLUMN tb_header_order.hstatus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hstatus IS '1=รอดำเนินการ 2=รอชำระเงิน 3=สั่งสินค้า 4=รอร้านจีนจัดส่ง 5=สำเร็จ 6=ยกเลิกออเดอร์';


--
-- Name: COLUMN tb_header_order.hshoppay; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hshoppay IS '1=จ่ายเงินแล้ว';


--
-- Name: COLUMN tb_header_order.paydeposit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.paydeposit IS '1 คือ รอตรวจสอบการจ่ายเงิน';


--
-- Name: COLUMN tb_header_order.hdate2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hdate2 IS 'รอชำระเงิน';


--
-- Name: COLUMN tb_header_order.hdate3; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hdate3 IS 'สั่งสินค้า';


--
-- Name: COLUMN tb_header_order.hdate4; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hdate4 IS 'รอร้านจีนจัดส่ง';


--
-- Name: COLUMN tb_header_order.hdate5; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hdate5 IS 'สำเร็จ';


--
-- Name: COLUMN tb_header_order.hshippingservice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hshippingservice IS 'ค่าบริการ 50 บาท';


--
-- Name: COLUMN tb_header_order.hshippingchn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hshippingchn IS 'ค่าขนส่งจีน';


--
-- Name: COLUMN tb_header_order.hratecost; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hratecost IS 'เรทต้นทุน';


--
-- Name: COLUMN tb_header_order.hcostall; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hcostall IS 'ราคาซื้อจริง';


--
-- Name: COLUMN tb_header_order.hnoteuser; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hnoteuser IS '1=ยังไม่อ่าน,2or null อ่านแล้ว';


--
-- Name: COLUMN tb_header_order.hprintbill2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hprintbill2 IS 'ใบแจ้งหนี้';


--
-- Name: COLUMN tb_header_order.hshipby; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hshipby IS 'บริษัทขนส่งในไทย F=ฟรี';


--
-- Name: COLUMN tb_header_order.hfreeshipping; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hfreeshipping IS '1=สั่งซื้อช่วงจัดส่งฟรี';


--
-- Name: COLUMN tb_header_order.hwarehousechina; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.hwarehousechina IS '1=อี้อู,2=กวางโจว';


--
-- Name: COLUMN tb_header_order.paymethod; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.paymethod IS 'วิธีเก็บเงิน 1=ต้นทาง 2=ปลายทาง';


--
-- Name: COLUMN tb_header_order.crate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.crate IS '1=ตีลัง';


--
-- Name: COLUMN tb_header_order.adminidip; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_header_order.adminidip IS 'ล่ามจีนที่ดูแล';


--
-- Name: tb_header_order_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_header_order_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_header_order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_header_order_id_seq OWNED BY public.tb_header_order.id;


--
-- Name: tb_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_history (
    id bigint NOT NULL,
    date timestamp without time zone,
    action text NOT NULL,
    status character varying(2) NOT NULL,
    adminid character varying(20) NOT NULL
);


--
-- Name: tb_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_history_id_seq OWNED BY public.tb_history.id;


--
-- Name: tb_history_key; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_history_key (
    id bigint NOT NULL,
    date timestamp without time zone,
    keyword text NOT NULL,
    userid character varying(10) NOT NULL,
    type character varying(1) NOT NULL,
    apierror character varying(1) NOT NULL,
    categoryname character varying(300) NOT NULL
);


--
-- Name: COLUMN tb_history_key.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_history_key.type IS '1=keyword,2=1688,3=taobao,4=tmall';


--
-- Name: tb_history_key_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_history_key_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_history_key_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_history_key_id_seq OWNED BY public.tb_history_key.id;


--
-- Name: tb_hs_rate_custom_cbm; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_hs_rate_custom_cbm (
    id bigint NOT NULL,
    userid character varying(30) NOT NULL,
    sourcewarehouse character varying(1) NOT NULL,
    rtransporttype character varying(1) NOT NULL,
    rproductstype character varying(1) NOT NULL,
    rcbmbefore numeric(10,2) NOT NULL,
    rcbm numeric(10,2) NOT NULL,
    adminidupdate character varying(50) NOT NULL,
    crhsid bigint NOT NULL
);


--
-- Name: tb_hs_rate_custom_cbm_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_hs_rate_custom_cbm_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_hs_rate_custom_cbm_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_hs_rate_custom_cbm_id_seq OWNED BY public.tb_hs_rate_custom_cbm.id;


--
-- Name: tb_hs_rate_custom_kg; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_hs_rate_custom_kg (
    id bigint NOT NULL,
    userid character varying(30) NOT NULL,
    sourcewarehouse character varying(1) NOT NULL,
    rtransporttype character varying(1) NOT NULL,
    rproductstype character varying(1) NOT NULL,
    rkgbefore numeric(10,2) NOT NULL,
    rkg numeric(10,2) NOT NULL,
    adminidupdate character varying(50) NOT NULL,
    crhsid bigint NOT NULL
);


--
-- Name: tb_hs_rate_custom_kg_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_hs_rate_custom_kg_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_hs_rate_custom_kg_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_hs_rate_custom_kg_id_seq OWNED BY public.tb_hs_rate_custom_kg.id;


--
-- Name: tb_keyword_product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_keyword_product (
    id bigint NOT NULL,
    keyword character varying(255) NOT NULL,
    note character varying(255) NOT NULL,
    adminidcreate character varying(25) NOT NULL,
    date timestamp without time zone
);


--
-- Name: tb_keyword_product_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_keyword_product_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_keyword_product_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_keyword_product_id_seq OWNED BY public.tb_keyword_product.id;


--
-- Name: tb_log_forwarder_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_log_forwarder_status (
    id bigint NOT NULL,
    fid bigint NOT NULL,
    fstatusold character varying(2) NOT NULL,
    fstatusnew character varying(2) NOT NULL,
    adminidchange character varying(50) NOT NULL,
    fdatechange timestamp without time zone
);


--
-- Name: tb_log_forwarder_status_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_log_forwarder_status_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_log_forwarder_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_log_forwarder_status_id_seq OWNED BY public.tb_log_forwarder_status.id;


--
-- Name: tb_notify; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_notify (
    id bigint NOT NULL,
    title character varying(400) NOT NULL,
    content character varying(100) NOT NULL,
    datestart timestamp without time zone,
    dateexp timestamp without time zone,
    url character varying(400) NOT NULL,
    adminid character varying(10) NOT NULL
);


--
-- Name: tb_notify_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_notify_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_notify_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_notify_id_seq OWNED BY public.tb_notify.id;


--
-- Name: tb_notify_read; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_notify_read (
    id bigint NOT NULL,
    userid character varying(10) NOT NULL,
    popid bigint NOT NULL
);


--
-- Name: tb_notify_read_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_notify_read_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_notify_read_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_notify_read_id_seq OWNED BY public.tb_notify_read.id;


--
-- Name: tb_notify_sheet_ctt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_notify_sheet_ctt (
    id bigint NOT NULL,
    date timestamp without time zone,
    numrow integer NOT NULL
);


--
-- Name: tb_notify_sheet_ctt_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_notify_sheet_ctt_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_notify_sheet_ctt_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_notify_sheet_ctt_id_seq OWNED BY public.tb_notify_sheet_ctt.id;


--
-- Name: tb_notify_wp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_notify_wp (
    id bigint NOT NULL,
    title character varying(300) NOT NULL,
    detail text NOT NULL,
    datestart timestamp without time zone,
    dateexp timestamp without time zone,
    adminid character varying(30) NOT NULL,
    status character varying(1) NOT NULL,
    url character varying(500) NOT NULL
);


--
-- Name: COLUMN tb_notify_wp.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_notify_wp.status IS '1 คือ เห็นทั้งหมด , 2 คือ เห็นเฉพาะสามาชิก';


--
-- Name: tb_notify_wp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_notify_wp_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_notify_wp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_notify_wp_id_seq OWNED BY public.tb_notify_wp.id;


--
-- Name: tb_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_options (
    option_id bigint NOT NULL,
    option_key character varying(200) NOT NULL,
    option_value text NOT NULL
);


--
-- Name: tb_options_option_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_options_option_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_options_option_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_options_option_id_seq OWNED BY public.tb_options.option_id;


--
-- Name: tb_order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_order (
    id integer NOT NULL,
    cdetails text NOT NULL,
    curl character varying(300) NOT NULL,
    ctitle character varying(300) NOT NULL,
    cnameshop character varying(300) DEFAULT 'pcs'::character varying NOT NULL,
    cprovider character varying(1) DEFAULT '4'::character varying NOT NULL,
    cimages character varying(300) NOT NULL,
    cprice numeric(10,2) NOT NULL,
    cshippingchn numeric(10,2) NOT NULL,
    cpriceupdate numeric(10,2) NOT NULL,
    camount integer NOT NULL,
    ccolor character varying(200) NOT NULL,
    csize character varying(200) NOT NULL,
    userid character varying(10) NOT NULL,
    hno character varying(30) NOT NULL,
    cshippingnumber character varying(500) NOT NULL,
    ctrackingnumber character varying(200) NOT NULL,
    crewallet character varying(1) NOT NULL,
    cnote character varying(255) NOT NULL,
    hwarehousename character varying(1) NOT NULL,
    hcrate character varying(1) DEFAULT '2'::character varying NOT NULL,
    hqc character varying(1) NOT NULL
);


--
-- Name: COLUMN tb_order.cnameshop; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_order.cnameshop IS 'pcs=ไม่มีชื่อร้าน';


--
-- Name: COLUMN tb_order.hwarehousename; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_order.hwarehousename IS 'โกดังรับของที่จีน 1=แสง, 2=CTT, 3=MK, 4=MX, 5=JMF';


--
-- Name: COLUMN tb_order.hcrate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_order.hcrate IS '1=ตีลัง';


--
-- Name: COLUMN tb_order.hqc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_order.hqc IS '1=ไม่ตรวจนับ, 2=ตรวจนับ';


--
-- Name: tb_order_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_order_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_order_id_seq OWNED BY public.tb_order.id;


--
-- Name: tb_org_email_ships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_org_email_ships (
    id bigint NOT NULL,
    adminid character varying(30) NOT NULL,
    oeid bigint NOT NULL
);


--
-- Name: COLUMN tb_org_email_ships.oeid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_org_email_ships.oeid IS 'ID ตาราง tb_organization_email';


--
-- Name: tb_org_email_ships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_org_email_ships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_org_email_ships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_org_email_ships_id_seq OWNED BY public.tb_org_email_ships.id;


--
-- Name: tb_org_line_ships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_org_line_ships (
    id bigint NOT NULL,
    adminid character varying(30) NOT NULL,
    olid bigint NOT NULL
);


--
-- Name: COLUMN tb_org_line_ships.olid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_org_line_ships.olid IS 'ID ตาราง tb_organization_line';


--
-- Name: tb_org_line_ships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_org_line_ships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_org_line_ships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_org_line_ships_id_seq OWNED BY public.tb_org_line_ships.id;


--
-- Name: tb_org_tell_ships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_org_tell_ships (
    id bigint NOT NULL,
    adminid character varying(30) NOT NULL,
    otid bigint NOT NULL
);


--
-- Name: COLUMN tb_org_tell_ships.otid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_org_tell_ships.otid IS 'ID ตาราง tb_organization_tell';


--
-- Name: tb_org_tell_ships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_org_tell_ships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_org_tell_ships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_org_tell_ships_id_seq OWNED BY public.tb_org_tell_ships.id;


--
-- Name: tb_org_wechat_ships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_org_wechat_ships (
    id bigint NOT NULL,
    adminid character varying(30) NOT NULL,
    owcid bigint NOT NULL
);


--
-- Name: COLUMN tb_org_wechat_ships.owcid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_org_wechat_ships.owcid IS 'ID ตาราง tb_organization_wechat';


--
-- Name: tb_org_wechat_ships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_org_wechat_ships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_org_wechat_ships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_org_wechat_ships_id_seq OWNED BY public.tb_org_wechat_ships.id;


--
-- Name: tb_organization_domainname; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_organization_domainname (
    id bigint NOT NULL,
    domain character varying(255) NOT NULL,
    start_date date,
    end_date date,
    pay_date date,
    note character varying(255) NOT NULL,
    adminidcreate character varying(255) NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    adminidupdate character varying(255) NOT NULL
);


--
-- Name: tb_organization_domainname_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_organization_domainname_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_organization_domainname_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_organization_domainname_id_seq OWNED BY public.tb_organization_domainname.id;


--
-- Name: tb_organization_email; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_organization_email (
    id bigint NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    email character varying(255) NOT NULL,
    emailtel character varying(30) NOT NULL,
    passemail character varying(255) NOT NULL,
    emailtype character varying(1) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    adminidupdate character varying(30) NOT NULL,
    note text NOT NULL
);


--
-- Name: COLUMN tb_organization_email.emailtype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_organization_email.emailtype IS '1=ฟรี, 2=ซื้อ';


--
-- Name: tb_organization_email_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_organization_email_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_organization_email_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_organization_email_id_seq OWNED BY public.tb_organization_email.id;


--
-- Name: tb_organization_line; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_organization_line (
    id bigint NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    line character varying(255) NOT NULL,
    emailline character varying(30) NOT NULL,
    telline character varying(30) NOT NULL,
    passline character varying(255) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    adminidupdate character varying(30) NOT NULL,
    note text NOT NULL
);


--
-- Name: tb_organization_line_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_organization_line_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_organization_line_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_organization_line_id_seq OWNED BY public.tb_organization_line.id;


--
-- Name: tb_organization_tell; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_organization_tell (
    id bigint NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    tell character varying(20) NOT NULL,
    nameequipment character varying(255) NOT NULL,
    numberequipment character varying(255) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    adminidupdate character varying(30) NOT NULL,
    note text NOT NULL
);


--
-- Name: COLUMN tb_organization_tell.date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_organization_tell.date IS 'วันที่สร้าง';


--
-- Name: COLUMN tb_organization_tell.dateupdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_organization_tell.dateupdate IS 'วันที่อัปเดต';


--
-- Name: COLUMN tb_organization_tell.tell; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_organization_tell.tell IS 'เบอร์โทร ตัดเครื่องหมายพืเศษออก';


--
-- Name: COLUMN tb_organization_tell.nameequipment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_organization_tell.nameequipment IS 'ชื่ออุปกรณ์';


--
-- Name: COLUMN tb_organization_tell.numberequipment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_organization_tell.numberequipment IS 'หมายเลขเครื่องโทรศัพท์';


--
-- Name: tb_organization_tell_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_organization_tell_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_organization_tell_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_organization_tell_id_seq OWNED BY public.tb_organization_tell.id;


--
-- Name: tb_organization_wechat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_organization_wechat (
    id bigint NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    wechat character varying(255) NOT NULL,
    emailwechat character varying(30) NOT NULL,
    telwechat character varying(30) NOT NULL,
    passwechat character varying(255) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    adminidupdate character varying(30) NOT NULL,
    note text NOT NULL
);


--
-- Name: tb_organization_wechat_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_organization_wechat_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_organization_wechat_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_organization_wechat_id_seq OWNED BY public.tb_organization_wechat.id;


--
-- Name: tb_otp_check; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_otp_check (
    id bigint NOT NULL,
    usertel character varying(15) NOT NULL,
    pin character varying(10) NOT NULL,
    token character varying(40) NOT NULL,
    refno character varying(20) NOT NULL,
    date timestamp without time zone
);


--
-- Name: tb_otp_check_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_otp_check_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_otp_check_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_otp_check_id_seq OWNED BY public.tb_otp_check.id;


--
-- Name: tb_page_name; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_page_name (
    id integer NOT NULL,
    pagename character varying(255) NOT NULL
);


--
-- Name: tb_page_name_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_page_name_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_page_name_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_page_name_id_seq OWNED BY public.tb_page_name.id;


--
-- Name: tb_payment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_payment (
    id bigint NOT NULL,
    paydate timestamp without time zone,
    paydeposit character varying(1) NOT NULL,
    paystatus character varying(1) DEFAULT '1'::character varying NOT NULL,
    paytype character varying(1) NOT NULL,
    paydetail text NOT NULL,
    payyuan numeric(10,2) NOT NULL,
    payrate numeric(10,2) NOT NULL,
    payratecost numeric(10,2) NOT NULL,
    paythb numeric(10,2) NOT NULL,
    paythbcost numeric(10,2) NOT NULL,
    payprofitthb numeric(10,2) NOT NULL,
    paydateadmin timestamp without time zone,
    userid character varying(10) NOT NULL,
    adminid character varying(10) NOT NULL,
    adminidupdate character varying(10) NOT NULL,
    payadminidcreator character varying(10) NOT NULL,
    paylockdate timestamp without time zone,
    session character varying(100) NOT NULL,
    imagesslip character varying(250) NOT NULL,
    certifiedtruecopy character varying(250) NOT NULL,
    imagesslipadmin character varying(250) NOT NULL
);


--
-- Name: COLUMN tb_payment.certifiedtruecopy; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_payment.certifiedtruecopy IS 'ชื่อไฟล์ หนังสือเดินทางหรือบัตรประชาชน';


--
-- Name: COLUMN tb_payment.imagesslipadmin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_payment.imagesslipadmin IS 'ชื่อไฟล์หลักฐานการทำงานของแอดมิน';


--
-- Name: tb_payment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_payment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_payment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_payment_id_seq OWNED BY public.tb_payment.id;


--
-- Name: tb_pcs_logged; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_pcs_logged (
    id bigint NOT NULL,
    pcs_logged text NOT NULL,
    userid character varying(50) NOT NULL,
    basepath text NOT NULL,
    test character varying(2) NOT NULL,
    path text NOT NULL
);


--
-- Name: tb_pcs_logged_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_pcs_logged_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_pcs_logged_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_pcs_logged_id_seq OWNED BY public.tb_pcs_logged.id;


--
-- Name: tb_post_job; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_post_job (
    id bigint NOT NULL,
    companytype character varying(2) NOT NULL,
    admintype character varying(2) NOT NULL,
    department character varying(2) NOT NULL,
    section character varying(2) NOT NULL,
    jobtitle character varying(500) NOT NULL,
    amount integer NOT NULL,
    description text NOT NULL,
    qualifications text NOT NULL,
    welfarebenefit text NOT NULL,
    workingtime character varying(1000) NOT NULL,
    startdate timestamp without time zone,
    enddate timestamp without time zone,
    admincreate character varying(30) NOT NULL,
    date timestamp without time zone,
    salary character varying(500) NOT NULL
);


--
-- Name: tb_post_job_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_post_job_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_post_job_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_post_job_id_seq OWNED BY public.tb_post_job.id;


--
-- Name: tb_pro_valentine; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_pro_valentine (
    userid character varying(30) NOT NULL,
    message text NOT NULL,
    date timestamp without time zone
);


--
-- Name: COLUMN tb_pro_valentine.date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_pro_valentine.date IS 'เวลาที่โพสต์';


--
-- Name: tb_product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_product (
    id bigint NOT NULL,
    pproductcategory integer NOT NULL,
    pdate timestamp without time zone,
    pdateupdate timestamp without time zone,
    pnameth character varying(500) NOT NULL,
    pintro character varying(500) NOT NULL,
    pdetailth character varying(500) NOT NULL,
    pprovider character varying(1) NOT NULL,
    purl character varying(500) NOT NULL,
    pimages character varying(300) NOT NULL,
    pprice numeric(10,2) NOT NULL,
    ppricepromo numeric(10,2) NOT NULL,
    pdetail text NOT NULL,
    pproductid character varying(200) NOT NULL,
    adminid character varying(30) NOT NULL,
    adminidupdate character varying(30) NOT NULL
);


--
-- Name: COLUMN tb_product.pprovider; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_product.pprovider IS 'ร้านจีน';


--
-- Name: tb_product_category; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_product_category (
    pcid bigint NOT NULL,
    pcname character varying(300) NOT NULL,
    pcdetail character varying(500) NOT NULL
);


--
-- Name: tb_product_category_pcid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_product_category_pcid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_product_category_pcid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_product_category_pcid_seq OWNED BY public.tb_product_category.pcid;


--
-- Name: tb_product_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_product_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_product_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_product_id_seq OWNED BY public.tb_product.id;


--
-- Name: tb_promotion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_promotion (
    id bigint NOT NULL,
    date timestamp without time zone,
    promoid bigint NOT NULL,
    fid bigint NOT NULL,
    hno character varying(30) NOT NULL
);


--
-- Name: tb_promotion33; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_promotion33 (
    userid character varying(30) NOT NULL,
    statuspro character varying(1) NOT NULL
);


--
-- Name: COLUMN tb_promotion33.statuspro; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_promotion33.statuspro IS '1=ยังไม่ใช้,2=ใช้โปรแล้ว';


--
-- Name: tb_promotion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_promotion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_promotion_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_promotion_id_seq OWNED BY public.tb_promotion.id;


--
-- Name: tb_rate_custom_cbm; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_rate_custom_cbm (
    id integer NOT NULL,
    userid character varying(10) NOT NULL,
    rtransporttype character varying(1) NOT NULL,
    sourcewarehouse character varying(1) NOT NULL,
    rproductstype character varying(1) NOT NULL,
    rcbm numeric(10,2) NOT NULL,
    adminidupdate character varying(10) NOT NULL
);


--
-- Name: tb_rate_custom_cbm_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_rate_custom_cbm_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_rate_custom_cbm_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_rate_custom_cbm_id_seq OWNED BY public.tb_rate_custom_cbm.id;


--
-- Name: tb_rate_custom_kg; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_rate_custom_kg (
    id integer NOT NULL,
    userid character varying(10) NOT NULL,
    sourcewarehouse character varying(1) NOT NULL,
    rtransporttype character varying(1) NOT NULL,
    rproductstype character varying(1) NOT NULL,
    rkg numeric(10,2) NOT NULL,
    adminidupdate character varying(10) NOT NULL
);


--
-- Name: tb_rate_custom_kg_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_rate_custom_kg_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_rate_custom_kg_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_rate_custom_kg_id_seq OWNED BY public.tb_rate_custom_kg.id;


--
-- Name: tb_rate_g_cbm; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_rate_g_cbm (
    id integer NOT NULL,
    coid character varying(10) NOT NULL,
    sourcewarehouse character varying(1) NOT NULL,
    rgtransporttype character varying(1) NOT NULL,
    rgproductstype character varying(1) NOT NULL,
    rgcbm1 numeric(10,2) NOT NULL,
    rgcbm2 numeric(10,2) NOT NULL,
    rgcbm3 numeric(10,2) NOT NULL,
    adminidupdate character varying(10) NOT NULL
);


--
-- Name: COLUMN tb_rate_g_cbm.sourcewarehouse; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_rate_g_cbm.sourcewarehouse IS 'โกดังต้นทาง : 1=กวางโจว,2=อี้อู';


--
-- Name: tb_rate_g_cbm_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_rate_g_cbm_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_rate_g_cbm_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_rate_g_cbm_id_seq OWNED BY public.tb_rate_g_cbm.id;


--
-- Name: tb_rate_g_kg; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_rate_g_kg (
    id integer NOT NULL,
    coid character varying(10) NOT NULL,
    sourcewarehouse character varying(1) NOT NULL,
    rgtransporttype character varying(1) NOT NULL,
    rgproductstype character varying(1) NOT NULL,
    rgkg1 numeric(10,2) NOT NULL,
    rgkg2 numeric(10,2) NOT NULL,
    rgkg3 numeric(10,2) NOT NULL,
    adminidupdate character varying(10) NOT NULL
);


--
-- Name: COLUMN tb_rate_g_kg.sourcewarehouse; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_rate_g_kg.sourcewarehouse IS 'โกดังต้นทาง : 1=กวางโจว,2=อี้อู';


--
-- Name: COLUMN tb_rate_g_kg.rgtransporttype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_rate_g_kg.rgtransporttype IS 'ประเภทการขนส่ง 1=รถ,2=เรือ';


--
-- Name: tb_rate_g_kg_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_rate_g_kg_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_rate_g_kg_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_rate_g_kg_id_seq OWNED BY public.tb_rate_g_kg.id;


--
-- Name: tb_rate_vip_cbm; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_rate_vip_cbm (
    id integer NOT NULL,
    coid character varying(10) NOT NULL,
    sourcewarehouse character varying(1) NOT NULL,
    rtransporttype character varying(1) NOT NULL,
    rproductstype character varying(1) NOT NULL,
    rcbm numeric(10,2) NOT NULL,
    adminidupdate character varying(10) NOT NULL
);


--
-- Name: tb_rate_vip_cbm_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_rate_vip_cbm_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_rate_vip_cbm_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_rate_vip_cbm_id_seq OWNED BY public.tb_rate_vip_cbm.id;


--
-- Name: tb_rate_vip_kg; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_rate_vip_kg (
    id integer NOT NULL,
    coid character varying(10) NOT NULL,
    sourcewarehouse character varying(1) NOT NULL,
    rtransporttype character varying(1) NOT NULL,
    rproductstype character varying(1) NOT NULL,
    rkg numeric(10,2) NOT NULL,
    adminidupdate character varying(10) NOT NULL
);


--
-- Name: tb_rate_vip_kg_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_rate_vip_kg_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_rate_vip_kg_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_rate_vip_kg_id_seq OWNED BY public.tb_rate_vip_kg.id;


--
-- Name: tb_receipt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_receipt (
    id bigint NOT NULL,
    rstatus character varying(1) DEFAULT '3'::character varying NOT NULL,
    rid character varying(20) NOT NULL,
    refid character varying(50) NOT NULL,
    rdatecreate timestamp without time zone,
    rdate timestamp without time zone,
    issuedate timestamp without time zone,
    ramount numeric(10,2) NOT NULL,
    totalbeforewithholding numeric(10,2) NOT NULL,
    adminid character varying(30) NOT NULL,
    userid character varying(30) NOT NULL,
    statusprint character varying(1) NOT NULL,
    adminidprint character varying(30) NOT NULL,
    rdateprint timestamp without time zone,
    statusprintcopy character varying(1) NOT NULL,
    rdateprintcopy timestamp without time zone,
    adminidprintcopy character varying(30) NOT NULL,
    recompnumber character varying(13) NOT NULL,
    recompname character varying(300) NOT NULL,
    recompaddress text NOT NULL,
    rpopup character varying(1) NOT NULL,
    corporatetype character varying(1) NOT NULL,
    documentissuer character varying(300) NOT NULL,
    documentapprover character varying(300) NOT NULL,
    refwhid bigint
);


--
-- Name: COLUMN tb_receipt.rid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.rid IS 'PCS221002-1';


--
-- Name: COLUMN tb_receipt.refid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.refid IS 'เลขอ้างอิง เช่น ใบแจ้งหนี้';


--
-- Name: COLUMN tb_receipt.rdatecreate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.rdatecreate IS 'วันที่สร้าง';


--
-- Name: COLUMN tb_receipt.rdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.rdate IS '	วันเวลาที่ทำรายการผ่านระบบ pcs wallet';


--
-- Name: COLUMN tb_receipt.issuedate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.issuedate IS 'วันที่ออกเอกสาร';


--
-- Name: COLUMN tb_receipt.ramount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.ramount IS 'ยอดที่จ่ายจริงมา ยอดหลังหัก ณ ที่จ่าย';


--
-- Name: COLUMN tb_receipt.totalbeforewithholding; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.totalbeforewithholding IS 'ยอดก่อน หัก ณ ที่จ่าย';


--
-- Name: COLUMN tb_receipt.statusprint; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.statusprint IS '1=print แล้ว';


--
-- Name: COLUMN tb_receipt.rpopup; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.rpopup IS '1=กดดู popup แล้ว';


--
-- Name: COLUMN tb_receipt.corporatetype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.corporatetype IS '1=ลูกค้าบริษัท, 2=ลูกค้าทั่วไป';


--
-- Name: COLUMN tb_receipt.documentissuer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.documentissuer IS 'ผู้ออกเอกสารเอาชื่อ-นามสกุลมาเลย';


--
-- Name: COLUMN tb_receipt.documentapprover; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.documentapprover IS 'ผู้อนุมัติเอกสารเอาชื่อ-นามสกุลมาเลย';


--
-- Name: COLUMN tb_receipt.refwhid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_receipt.refwhid IS 'อ้างอิงรายการเติมเงิน';


--
-- Name: tb_receipt_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_receipt_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_receipt_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_receipt_id_seq OWNED BY public.tb_receipt.id;


--
-- Name: tb_receipt_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_receipt_item (
    id bigint NOT NULL,
    rid character varying(30) NOT NULL,
    fid bigint NOT NULL
);


--
-- Name: tb_receipt_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_receipt_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_receipt_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_receipt_item_id_seq OWNED BY public.tb_receipt_item.id;


--
-- Name: tb_register; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_register (
    id bigint NOT NULL,
    type character varying(1) NOT NULL,
    corporatenumber character varying(13) NOT NULL,
    corporatename character varying(300) NOT NULL,
    corporateaddress text NOT NULL,
    corporatefile character varying(200) NOT NULL,
    corporatefile20 character varying(200) NOT NULL,
    usertel character varying(13) NOT NULL,
    userpass character varying(80) NOT NULL,
    username character varying(200) NOT NULL,
    userlastname character varying(200) NOT NULL,
    useremail character varying(100) NOT NULL,
    shopuser character varying(1) NOT NULL,
    channel character varying(2) NOT NULL,
    userregistered timestamp without time zone,
    userregisterwith character varying(3) NOT NULL,
    coid character varying(10) DEFAULT 'PCS'::character varying NOT NULL,
    adminidsale character varying(30) NOT NULL,
    userpicture character varying(150) DEFAULT 'user.jpg'::character varying NOT NULL,
    userrecom character varying(20) NOT NULL,
    token character varying(40) NOT NULL,
    refno character varying(20) NOT NULL,
    pin character varying(10) NOT NULL
);


--
-- Name: COLUMN tb_register.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_register.type IS '1=ทั่วไป,2=นิติบุคคล ';


--
-- Name: COLUMN tb_register.corporatefile; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_register.corporatefile IS 'หนังสือรับรอง';


--
-- Name: COLUMN tb_register.corporatefile20; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_register.corporatefile20 IS 'ภพ20';


--
-- Name: COLUMN tb_register.shopuser; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_register.shopuser IS '1=ซื้อไปใข้เอง';


--
-- Name: COLUMN tb_register.channel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_register.channel IS 'รู้จักเราจากช่องทางใด';


--
-- Name: COLUMN tb_register.userregisterwith; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_register.userregisterwith IS 'วิธีสมัครสมาชิก PCS=สมาชิกในระบบ,F=เฟสบุ๊ก,L=ไลน์	';


--
-- Name: COLUMN tb_register.coid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_register.coid IS '	กลุ่มลูกค้า PCS=ลูกค้าทั่วไป';


--
-- Name: COLUMN tb_register.pin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_register.pin IS 'OTP';


--
-- Name: tb_register_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_register_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_register_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_register_id_seq OWNED BY public.tb_register.id;


--
-- Name: tb_sales_report; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_sales_report (
    id bigint NOT NULL,
    srdate timestamp without time zone,
    fid bigint NOT NULL,
    sradminidsale character varying(20) NOT NULL
);


--
-- Name: COLUMN tb_sales_report.srdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_sales_report.srdate IS 'วันที่ลูกค้าชำระ';


--
-- Name: COLUMN tb_sales_report.fid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_sales_report.fid IS 'เลขที่ออเดอร์ฝากนำเข้า';


--
-- Name: tb_sales_report_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_sales_report_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_sales_report_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_sales_report_id_seq OWNED BY public.tb_sales_report.id;


--
-- Name: tb_set_comm_interpreter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_set_comm_interpreter (
    id bigint NOT NULL,
    percom numeric(10,2) NOT NULL,
    adminid character varying(20) NOT NULL,
    adminidupdate character varying(20) NOT NULL,
    dateupdate timestamp without time zone
);


--
-- Name: tb_set_comm_interpreter_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_set_comm_interpreter_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_set_comm_interpreter_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_set_comm_interpreter_id_seq OWNED BY public.tb_set_comm_interpreter.id;


--
-- Name: tb_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_settings (
    id integer NOT NULL,
    rgdefault numeric(10,2) NOT NULL,
    rsdefault numeric(10,2) NOT NULL,
    rpdefault numeric(10,2) NOT NULL,
    hratecostdefault numeric(10,2),
    hratecostsale numeric(10,2) NOT NULL,
    numberpaymemt character varying(1000) NOT NULL,
    freeshipping character varying(1) NOT NULL,
    fcostcar1default numeric(10,2) NOT NULL,
    fcostcar2default numeric(10,2) NOT NULL,
    fcostcar3default numeric(10,2) NOT NULL,
    fcostcar4default numeric(10,2) NOT NULL,
    fcostcar1default2 numeric(10,2) DEFAULT 0.00 NOT NULL,
    fcostcar2default2 numeric(10,2) DEFAULT 0.00 NOT NULL,
    fcostcar3default2 numeric(10,2) DEFAULT 0.00 NOT NULL,
    fcostcar4default2 numeric(10,2) DEFAULT 0.00 NOT NULL,
    fcostship1default numeric(10,2) NOT NULL,
    fcostship2default numeric(10,2) NOT NULL,
    fcostship3default numeric(10,2) NOT NULL,
    fcostship4default numeric(10,2) NOT NULL,
    fcostship1default2 numeric(10,2) NOT NULL,
    fcostship2default2 numeric(10,2) NOT NULL,
    fcostship3default2 numeric(10,2) NOT NULL,
    fcostship4default2 numeric(10,2) NOT NULL,
    fcostcar1defaultsang numeric(10,2) NOT NULL,
    fcostcar2defaultsang numeric(10,2) NOT NULL,
    fcostcar3defaultsang numeric(10,2) NOT NULL,
    fcostcar4defaultsang numeric(10,2) NOT NULL,
    fcostship1defaultsang numeric(10,2) NOT NULL,
    fcostship2defaultsang numeric(10,2) NOT NULL,
    fcostship3defaultsang numeric(10,2) NOT NULL,
    fcostship4defaultsang numeric(10,2) NOT NULL,
    fcostcar1defaultsang2 numeric(10,2) NOT NULL,
    fcostcar2defaultsang2 numeric(10,2) NOT NULL,
    fcostcar3defaultsang2 numeric(10,2) NOT NULL,
    fcostcar4defaultsang2 numeric(10,2) NOT NULL,
    fcostship1defaultsang2 numeric(10,2) NOT NULL,
    fcostship2defaultsang2 numeric(10,2) NOT NULL,
    fcostship3defaultsang2 numeric(10,2) NOT NULL,
    fcostship4defaultsang2 numeric(10,2) NOT NULL,
    fcostcar1defaultmkcargo numeric(10,2) NOT NULL,
    fcostcar2defaultmkcargo numeric(10,2) NOT NULL,
    fcostcar3defaultmkcargo numeric(10,2) NOT NULL,
    fcostcar4defaultmkcargo numeric(10,2) NOT NULL,
    fcostship1defaultmkcargo numeric(10,2) NOT NULL,
    fcostship2defaultmkcargo numeric(10,2) NOT NULL,
    fcostship3defaultmkcargo numeric(10,2) NOT NULL,
    fcostship4defaultmkcargo numeric(10,2) NOT NULL,
    fcostcar1defaultmkcargo2 numeric(10,2) NOT NULL,
    fcostcar2defaultmkcargo2 numeric(10,2) NOT NULL,
    fcostcar3defaultmkcargo2 numeric(10,2) NOT NULL,
    fcostcar4defaultmkcargo2 numeric(10,2) NOT NULL,
    fcostship1defaultmkcargo2 numeric(10,2) NOT NULL,
    fcostship2defaultmkcargo2 numeric(10,2) NOT NULL,
    fcostship3defaultmkcargo2 numeric(10,2) NOT NULL,
    fcostship4defaultmkcargo2 numeric(10,2) NOT NULL,
    fcostcar1defaultmxcargo numeric(10,2) NOT NULL,
    fcostcar2defaultmxcargo numeric(10,2) NOT NULL,
    fcostcar3defaultmxcargo numeric(10,2) NOT NULL,
    fcostcar4defaultmxcargo numeric(10,2) NOT NULL,
    fcostship1defaultmxcargo numeric(10,2) NOT NULL,
    fcostship2defaultmxcargo numeric(10,2) NOT NULL,
    fcostship3defaultmxcargo numeric(10,2) NOT NULL,
    fcostship4defaultmxcargo numeric(10,2) NOT NULL,
    fcostcar1defaultwmxcargo numeric(10,2) NOT NULL,
    fcostcar2defaultwmxcargo numeric(10,2) NOT NULL,
    fcostcar3defaultwmxcargo numeric(10,2) NOT NULL,
    fcostcar4defaultwmxcargo numeric(10,2) NOT NULL,
    fcostship1defaultwmxcargo numeric(10,2) NOT NULL,
    fcostship2defaultwmxcargo numeric(10,2) NOT NULL,
    fcostship3defaultwmxcargo numeric(10,2) NOT NULL,
    fcostship4defaultwmxcargo numeric(10,2) NOT NULL,
    fcostcar1defaultmxcargo2 numeric(10,2) NOT NULL,
    fcostcar2defaultmxcargo2 numeric(10,2) NOT NULL,
    fcostcar3defaultmxcargo2 numeric(10,2) NOT NULL,
    fcostcar4defaultmxcargo2 numeric(10,2) NOT NULL,
    fcostship1defaultmxcargo2 numeric(10,2) NOT NULL,
    fcostship2defaultmxcargo2 numeric(10,2) NOT NULL,
    fcostship3defaultmxcargo2 numeric(10,2) NOT NULL,
    fcostship4defaultmxcargo2 numeric(10,2) NOT NULL,
    fcostcar1defaultwmxcargo2 numeric(10,2) NOT NULL,
    fcostcar2defaultwmxcargo2 numeric(10,2) NOT NULL,
    fcostcar3defaultwmxcargo2 numeric(10,2) NOT NULL,
    fcostcar4defaultwmxcargo2 numeric(10,2) NOT NULL,
    fcostship1defaultwmxcargo2 numeric(10,2) NOT NULL,
    fcostship2defaultwmxcargo2 numeric(10,2) NOT NULL,
    fcostship3defaultwmxcargo2 numeric(10,2) NOT NULL,
    fcostship4defaultwmxcargo2 numeric(10,2) NOT NULL,
    fcostcar1defaultjmf numeric(10,2) NOT NULL,
    fcostcar2defaultjmf2 numeric(10,2) NOT NULL,
    fcostcar2defaultjmf numeric(10,2) NOT NULL,
    fcostcar3defaultjmf2 numeric(10,2) NOT NULL,
    fcostcar3defaultjmf numeric(10,2) NOT NULL,
    fcostcar4defaultjmf2 numeric(10,2) NOT NULL,
    fcostship1defaultjmf numeric(10,2) NOT NULL,
    fcostship2defaultjmf2 numeric(10,2) NOT NULL,
    fcostship2defaultjmf numeric(10,2) NOT NULL,
    fcostship3defaultjmf2 numeric(10,2) NOT NULL,
    fcostship3defaultjmf numeric(10,2) NOT NULL,
    fcostship4defaultjmf2 numeric(10,2) NOT NULL,
    fcostship4defaultjmf numeric(10,2) NOT NULL,
    fcostship1defaultjmf2 numeric(10,2) NOT NULL,
    fcostcar4defaultjmf numeric(10,2) NOT NULL,
    fcostcar1defaultjmf2 numeric(10,2) NOT NULL,
    fcostcar1defaultgogo numeric(10,2) NOT NULL,
    fcostcar2defaultgogo numeric(10,2) NOT NULL,
    fcostcar3defaultgogo numeric(10,2) NOT NULL,
    fcostcar4defaultgogo numeric(10,2) NOT NULL,
    fcostcar1defaultgogo2 numeric(10,2) NOT NULL,
    fcostcar2defaultgogo2 numeric(10,2) NOT NULL,
    fcostcar3defaultgogo2 numeric(10,2) NOT NULL,
    fcostcar4defaultgogo2 numeric(10,2) NOT NULL,
    fcostship1defaultgogo numeric(10,2) NOT NULL,
    fcostship2defaultgogo numeric(10,2) NOT NULL,
    fcostship3defaultgogo numeric(10,2) NOT NULL,
    fcostship4defaultgogo numeric(10,2) NOT NULL,
    fcostship1defaultgogo2 numeric(10,2) NOT NULL,
    fcostship2defaultgogo2 numeric(10,2) NOT NULL,
    fcostship3defaultgogo2 numeric(10,2) NOT NULL,
    fcostship4defaultgogo2 numeric(10,2) NOT NULL,
    fcostcar1defaultcargocenter numeric(10,2) NOT NULL,
    fcostcar2defaultcargocenter numeric(10,2) NOT NULL,
    fcostcar3defaultcargocenter numeric(10,2) NOT NULL,
    fcostcar4defaultcargocenter numeric(10,2) NOT NULL,
    fcostcar1defaultcargocenter2 numeric(10,2) NOT NULL,
    fcostcar2defaultcargocenter2 numeric(10,2) NOT NULL,
    fcostcar3defaultcargocenter2 numeric(10,2) NOT NULL,
    fcostcar4defaultcargocenter2 numeric(10,2) NOT NULL,
    fcostship1defaultcargocenter numeric(10,2) NOT NULL,
    fcostship2defaultcargocenter numeric(10,2) NOT NULL,
    fcostship3defaultcargocenter numeric(10,2) NOT NULL,
    fcostship4defaultcargocenter numeric(10,2) NOT NULL,
    fcostship1defaultcargocenter2 numeric(10,2) NOT NULL,
    fcostship2defaultcargocenter2 numeric(10,2) NOT NULL,
    fcostship3defaultcargocenter2 numeric(10,2) NOT NULL,
    fcostship4defaultcargocenter2 numeric(10,2) NOT NULL,
    fcostcar1defaultmomo numeric(10,2) NOT NULL,
    fcostcar2defaultmomo numeric(10,2) NOT NULL,
    fcostcar3defaultmomo numeric(10,2) NOT NULL,
    fcostcar4defaultmomo numeric(10,2) NOT NULL,
    fcostcar1defaultmomo2 numeric(10,2) NOT NULL,
    fcostcar2defaultmomo2 numeric(10,2) NOT NULL,
    fcostcar3defaultmomo2 numeric(10,2) NOT NULL,
    fcostcar4defaultmomo2 numeric(10,2) NOT NULL,
    fcostship1defaultmomo numeric(10,2) NOT NULL,
    fcostship2defaultmomo numeric(10,2) NOT NULL,
    fcostship3defaultmomo numeric(10,2) NOT NULL,
    fcostship4defaultmomo numeric(10,2) NOT NULL,
    fcostship1defaultmomo2 numeric(10,2) NOT NULL,
    fcostship2defaultmomo2 numeric(10,2) NOT NULL,
    fcostship3defaultmomo2 numeric(10,2) NOT NULL,
    fcostship4defaultmomo2 numeric(10,2) NOT NULL
);


--
-- Name: COLUMN tb_settings.hratecostdefault; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.hratecostdefault IS 'ต้นทุนเรทตั้งต้น';


--
-- Name: COLUMN tb_settings.fcostcar1defaultgogo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar1defaultgogo IS 'กวางโจว ทางรถ ทั่วไป';


--
-- Name: COLUMN tb_settings.fcostcar2defaultgogo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar2defaultgogo IS 'กวางโจว ทางรถ มอก';


--
-- Name: COLUMN tb_settings.fcostcar3defaultgogo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar3defaultgogo IS 'กวางโจว ทางรถ อย';


--
-- Name: COLUMN tb_settings.fcostcar4defaultgogo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar4defaultgogo IS 'กวางโจว ทางรถ พิเศษ';


--
-- Name: COLUMN tb_settings.fcostcar1defaultgogo2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar1defaultgogo2 IS 'กวางโจว ทางรถ ทั่วไป';


--
-- Name: COLUMN tb_settings.fcostcar2defaultgogo2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar2defaultgogo2 IS 'กวางโจว ทางรถ มอก';


--
-- Name: COLUMN tb_settings.fcostcar3defaultgogo2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar3defaultgogo2 IS 'กวางโจว ทางรถ อย';


--
-- Name: COLUMN tb_settings.fcostcar4defaultgogo2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar4defaultgogo2 IS 'กวางโจว ทางรถ พิเศษ';


--
-- Name: COLUMN tb_settings.fcostship1defaultgogo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship1defaultgogo IS 'กวางโจว ทางเรือ ทั่วไป';


--
-- Name: COLUMN tb_settings.fcostship2defaultgogo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship2defaultgogo IS 'กวางโจว ทางเรือ มอก';


--
-- Name: COLUMN tb_settings.fcostship3defaultgogo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship3defaultgogo IS 'กวางโจว ทางเรือ อย';


--
-- Name: COLUMN tb_settings.fcostship4defaultgogo; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship4defaultgogo IS 'กวางโจว ทางเรือ พิเศษ';


--
-- Name: COLUMN tb_settings.fcostship1defaultgogo2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship1defaultgogo2 IS 'กวางโจว ทางเรือ ทั่วไป';


--
-- Name: COLUMN tb_settings.fcostship2defaultgogo2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship2defaultgogo2 IS 'กวางโจว ทางเรือ มอก';


--
-- Name: COLUMN tb_settings.fcostship3defaultgogo2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship3defaultgogo2 IS 'กวางโจว ทางเรือ อย';


--
-- Name: COLUMN tb_settings.fcostship4defaultgogo2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship4defaultgogo2 IS 'กวางโจว ทางเรือ พิเศษ';


--
-- Name: COLUMN tb_settings.fcostcar1defaultcargocenter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar1defaultcargocenter IS 'กวางโจว ทางรถ ทั่วไป';


--
-- Name: COLUMN tb_settings.fcostcar2defaultcargocenter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar2defaultcargocenter IS 'กวางโจว ทางรถ มอก';


--
-- Name: COLUMN tb_settings.fcostcar3defaultcargocenter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar3defaultcargocenter IS 'กวางโจว ทางรถ อย';


--
-- Name: COLUMN tb_settings.fcostcar4defaultcargocenter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar4defaultcargocenter IS 'กวางโจว ทางรถ พิเศษ';


--
-- Name: COLUMN tb_settings.fcostcar1defaultcargocenter2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar1defaultcargocenter2 IS 'กวางโจว ทางรถ ทั่วไป';


--
-- Name: COLUMN tb_settings.fcostcar2defaultcargocenter2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar2defaultcargocenter2 IS 'กวางโจว ทางรถ มอก';


--
-- Name: COLUMN tb_settings.fcostcar3defaultcargocenter2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar3defaultcargocenter2 IS 'กวางโจว ทางรถ อย';


--
-- Name: COLUMN tb_settings.fcostcar4defaultcargocenter2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostcar4defaultcargocenter2 IS 'กวางโจว ทางรถ พิเศษ';


--
-- Name: COLUMN tb_settings.fcostship1defaultcargocenter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship1defaultcargocenter IS 'กวางโจว ทางเรือ ทั่วไป';


--
-- Name: COLUMN tb_settings.fcostship2defaultcargocenter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship2defaultcargocenter IS 'กวางโจว ทางเรือ มอก';


--
-- Name: COLUMN tb_settings.fcostship3defaultcargocenter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship3defaultcargocenter IS 'กวางโจว ทางเรือ อย';


--
-- Name: COLUMN tb_settings.fcostship4defaultcargocenter; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship4defaultcargocenter IS 'กวางโจว ทางเรือ พิเศษ';


--
-- Name: COLUMN tb_settings.fcostship1defaultcargocenter2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship1defaultcargocenter2 IS 'กวางโจว ทางเรือ ทั่วไป';


--
-- Name: COLUMN tb_settings.fcostship2defaultcargocenter2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship2defaultcargocenter2 IS 'กวางโจว ทางเรือ มอก';


--
-- Name: COLUMN tb_settings.fcostship3defaultcargocenter2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship3defaultcargocenter2 IS 'กวางโจว ทางเรือ อย';


--
-- Name: COLUMN tb_settings.fcostship4defaultcargocenter2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_settings.fcostship4defaultcargocenter2 IS 'กวางโจว ทางเรือ พิเศษ';


--
-- Name: tb_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_settings_id_seq OWNED BY public.tb_settings.id;


--
-- Name: tb_shop_pay_h; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_shop_pay_h (
    id bigint NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    amount numeric(10,2) NOT NULL,
    title character varying(300) NOT NULL,
    status character varying(1) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    namebank character varying(2) NOT NULL,
    nameuserbank character varying(200) NOT NULL,
    nouserbank character varying(200) NOT NULL,
    imagesslip character varying(300) NOT NULL,
    adminidupdate character varying(30) NOT NULL
);


--
-- Name: COLUMN tb_shop_pay_h.amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_shop_pay_h.amount IS 'จำนวนที่โอน';


--
-- Name: COLUMN tb_shop_pay_h.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_shop_pay_h.status IS '1=รอดำเนินการ, 2=สำเร็จ';


--
-- Name: COLUMN tb_shop_pay_h.adminidcreate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_shop_pay_h.adminidcreate IS 'แอดมินสร้างรายการ';


--
-- Name: COLUMN tb_shop_pay_h.namebank; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_shop_pay_h.namebank IS 'ธนาคารปลายทางที่รับเงิน';


--
-- Name: COLUMN tb_shop_pay_h.nameuserbank; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_shop_pay_h.nameuserbank IS 'ชื่อบัญชีรับเงินคืน';


--
-- Name: COLUMN tb_shop_pay_h.nouserbank; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_shop_pay_h.nouserbank IS 'เลขที่บัญชีโอนเงินคืน';


--
-- Name: COLUMN tb_shop_pay_h.adminidupdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_shop_pay_h.adminidupdate IS 'แอดมินทำรายการ';


--
-- Name: tb_shop_pay_h_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_shop_pay_h_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_shop_pay_h_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_shop_pay_h_id_seq OWNED BY public.tb_shop_pay_h.id;


--
-- Name: tb_shop_pay_sub; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_shop_pay_sub (
    id bigint NOT NULL,
    hno character varying(30) NOT NULL,
    sphid bigint NOT NULL,
    hcostallth numeric(10,2) NOT NULL
);


--
-- Name: tb_shop_pay_sub_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_shop_pay_sub_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_shop_pay_sub_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_shop_pay_sub_id_seq OWNED BY public.tb_shop_pay_sub.id;


--
-- Name: tb_sms_hs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_sms_hs (
    id bigint NOT NULL,
    date timestamp without time zone,
    msisdn text NOT NULL,
    message text NOT NULL,
    status character varying(1) NOT NULL
);


--
-- Name: tb_sms_hs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_sms_hs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_sms_hs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_sms_hs_id_seq OWNED BY public.tb_sms_hs.id;


--
-- Name: tb_sms_statistic; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_sms_statistic (
    id bigint NOT NULL,
    date timestamp without time zone,
    browser character varying(80) NOT NULL,
    browserversion character varying(20) NOT NULL,
    ip character varying(20) NOT NULL,
    getdevice character varying(30) NOT NULL,
    userid character varying(20) NOT NULL
);


--
-- Name: tb_sms_statistic9; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_sms_statistic9 (
    id bigint NOT NULL,
    date timestamp without time zone,
    browser character varying(80) NOT NULL,
    browserversion character varying(20) NOT NULL,
    ip character varying(20) NOT NULL,
    getdevice character varying(30) NOT NULL,
    userid character varying(20) NOT NULL
);


--
-- Name: tb_sms_statistic9_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_sms_statistic9_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_sms_statistic9_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_sms_statistic9_id_seq OWNED BY public.tb_sms_statistic9.id;


--
-- Name: tb_sms_statistic_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_sms_statistic_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_sms_statistic_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_sms_statistic_id_seq OWNED BY public.tb_sms_statistic.id;


--
-- Name: tb_survey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_survey (
    id bigint NOT NULL,
    userid character varying(30) NOT NULL,
    usersex character varying(200) NOT NULL,
    userbirthday character varying(20) NOT NULL,
    occupation character varying(200) NOT NULL,
    usedpcs text NOT NULL,
    serviceintroduction character varying(100) NOT NULL,
    problems text NOT NULL,
    forwarder text NOT NULL,
    shop text NOT NULL,
    promotion text NOT NULL,
    date timestamp without time zone
);


--
-- Name: tb_survey202306; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_survey202306 (
    id bigint NOT NULL,
    date timestamp without time zone,
    userid character varying(30) NOT NULL,
    usersex character varying(200) NOT NULL,
    occupation character varying(200) NOT NULL,
    usedpcs text NOT NULL,
    problems text NOT NULL,
    adjust text NOT NULL,
    readblog character varying(100) NOT NULL,
    benefitblog text NOT NULL,
    promotion text NOT NULL,
    addservice text NOT NULL,
    recommend character varying(100) NOT NULL
);


--
-- Name: tb_survey202306_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_survey202306_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_survey202306_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_survey202306_id_seq OWNED BY public.tb_survey202306.id;


--
-- Name: tb_survey_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_survey_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_survey_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_survey_id_seq OWNED BY public.tb_survey.id;


--
-- Name: tb_terms_service; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_terms_service (
    id bigint NOT NULL,
    userid character varying(30) NOT NULL,
    date timestamp without time zone,
    version character varying(20) NOT NULL
);


--
-- Name: COLUMN tb_terms_service.date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_terms_service.date IS 'เวลากดยอมรับเงื่อนไข';


--
-- Name: COLUMN tb_terms_service.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_terms_service.version IS 'เวอร์ชันของเงื่อนไขการใช้บริการ';


--
-- Name: tb_terms_service_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_terms_service_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_terms_service_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_terms_service_id_seq OWNED BY public.tb_terms_service.id;


--
-- Name: tb_tmp_forwarder_cargothai; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_tmp_forwarder_cargothai (
    id bigint NOT NULL,
    container_name character varying(255),
    container_code character varying(255),
    due_date timestamp without time zone,
    box_total integer,
    box_weight numeric(10,2),
    box_cbm numeric(10,6),
    sm_code character varying(255),
    sm_date timestamp without time zone,
    manifest_date timestamp without time zone,
    estimated_date timestamp without time zone,
    etd timestamp without time zone,
    eta timestamp without time zone,
    re timestamp without time zone,
    created_at timestamp without time zone,
    note text,
    note_amount integer,
    transport_name character varying(255),
    transport_code character varying(255),
    warehouse_name character varying(255),
    warehouse_code character varying(255),
    status character varying(255),
    status_date timestamp without time zone,
    sm character varying(255),
    userid character varying(255),
    hno character varying(255),
    api_lasttimeupdated timestamp without time zone
);


--
-- Name: COLUMN tb_tmp_forwarder_cargothai.note_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_cargothai.note_amount IS 'หน่วยหยวน';


--
-- Name: tb_tmp_forwarder_cargothai_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_tmp_forwarder_cargothai_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_tmp_forwarder_cargothai_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_tmp_forwarder_cargothai_id_seq OWNED BY public.tb_tmp_forwarder_cargothai.id;


--
-- Name: tb_tmp_forwarder_item_cargothai; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_tmp_forwarder_item_cargothai (
    id bigint NOT NULL,
    productid bigint NOT NULL,
    productname character varying(255) NOT NULL,
    producttracking character varying(255) NOT NULL,
    producttrackingnote text NOT NULL,
    productqty integer NOT NULL,
    productbagid bigint NOT NULL,
    productwidth numeric(10,2) NOT NULL,
    productlength numeric(10,2) NOT NULL,
    productheight numeric(10,2) NOT NULL,
    productweightperitem numeric(10,2) NOT NULL,
    productweightall numeric(10,2) NOT NULL,
    productcbmperitem numeric(10,6) NOT NULL,
    productcbmall numeric(10,6) NOT NULL,
    productweightformat character varying(100) NOT NULL,
    producttypecode character varying(5) NOT NULL,
    containercode character varying(200) NOT NULL,
    userid character varying(50) NOT NULL,
    fid bigint NOT NULL,
    date timestamp without time zone,
    lasttimeupdated timestamp without time zone,
    adminid character varying(50) NOT NULL,
    adminidupdated character varying(50) NOT NULL,
    domesticshippingchina numeric(10,2) NOT NULL,
    chinawoodencratefeetype character varying(1) NOT NULL,
    chinawoodencratefee numeric(10,2) NOT NULL,
    otherservicefee numeric(10,2) NOT NULL,
    thailanddeliveryfee numeric(10,2) NOT NULL,
    frefprice character varying(1) NOT NULL,
    fqc character varying(1) NOT NULL,
    fqcprice numeric(10,2) NOT NULL,
    fpriceupdate numeric(10,2) NOT NULL,
    fdiscount numeric(10,2) NOT NULL,
    sm_code character varying(255) NOT NULL,
    sm character varying(255) NOT NULL,
    container_code character varying(255) NOT NULL,
    productcostchn numeric(10,2) NOT NULL,
    transport_code character varying(5) NOT NULL
);


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.adminid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.adminid IS 'แอดมินที่สร้าง';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.adminidupdated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.adminidupdated IS 'แอดมินที่แก้ไขล่าสุด';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.domesticshippingchina; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.domesticshippingchina IS 'ค่าขนส่งในจีน เดิมใน tb_forwarder fTransportPriceCHNTHB';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.chinawoodencratefeetype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.chinawoodencratefeetype IS 'ตีลังไม้ 1=ไม่ตี, 2=ตีลัง เดิม tb_forwarder crate';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.chinawoodencratefee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.chinawoodencratefee IS 'ค่าตีลังไม้';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.otherservicefee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.otherservicefee IS 'ค่าบริการอื่น ๆ';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.thailanddeliveryfee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.thailanddeliveryfee IS 'ค่าขนส่งในไทย';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.frefprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.frefprice IS 'คิดเรทนำเข้าตาม 1=น้ำหนัก 2=ปริมาตร';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.fqc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.fqc IS '	1=ไม่ตรวจนับ, 2=ตรวจนับ';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.fqcprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.fqcprice IS 'ค่า QC สินค้า';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.fpriceupdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.fpriceupdate IS 'ราคาที่เก็บเพิ่มมาจากฝากนำเข้า';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.fdiscount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.fdiscount IS 'ส่วนลด';


--
-- Name: COLUMN tb_tmp_forwarder_item_cargothai.productcostchn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_cargothai.productcostchn IS 'note_amount';


--
-- Name: tb_tmp_forwarder_item_cargothai_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_tmp_forwarder_item_cargothai_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_tmp_forwarder_item_cargothai_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_tmp_forwarder_item_cargothai_id_seq OWNED BY public.tb_tmp_forwarder_item_cargothai.id;


--
-- Name: tb_tmp_forwarder_item_momo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_tmp_forwarder_item_momo (
    id bigint NOT NULL,
    productid character varying(255) NOT NULL,
    productname character varying(255) NOT NULL,
    producttracking character varying(255) NOT NULL,
    producttrackingnote text NOT NULL,
    productqty integer NOT NULL,
    productbagid bigint NOT NULL,
    productwidth numeric(10,2) NOT NULL,
    productlength numeric(10,2) NOT NULL,
    productheight numeric(10,2) NOT NULL,
    productweightperitem numeric(10,2) NOT NULL,
    productweightall numeric(10,2) NOT NULL,
    productcbmperitem numeric(10,6) NOT NULL,
    productcbmall numeric(10,6) NOT NULL,
    productweightformat character varying(100) NOT NULL,
    producttypecode character varying(5) NOT NULL,
    containercode character varying(200) NOT NULL,
    userid character varying(50) NOT NULL,
    fid bigint NOT NULL,
    date timestamp without time zone,
    lasttimeupdated timestamp without time zone,
    adminid character varying(50) NOT NULL,
    adminidupdated character varying(50) NOT NULL,
    domesticshippingchina numeric(10,2) NOT NULL,
    chinawoodencratefeetype character varying(1) NOT NULL,
    chinawoodencratefee numeric(10,2) NOT NULL,
    otherservicefee numeric(10,2) NOT NULL,
    thailanddeliveryfee numeric(10,2) NOT NULL,
    frefprice character varying(1) NOT NULL,
    fqc character varying(1) NOT NULL,
    fqcprice numeric(10,2) NOT NULL,
    fpriceupdate numeric(10,2) NOT NULL,
    fdiscount numeric(10,2) NOT NULL,
    sm_code character varying(255) NOT NULL,
    sm character varying(255) NOT NULL,
    container_code character varying(255) NOT NULL,
    productcostchn numeric(10,2) NOT NULL,
    transport_code character varying(5) NOT NULL
);


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.adminid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.adminid IS 'แอดมินที่สร้าง';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.adminidupdated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.adminidupdated IS 'แอดมินที่แก้ไขล่าสุด';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.domesticshippingchina; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.domesticshippingchina IS 'ค่าขนส่งในจีน เดิมใน tb_forwarder fTransportPriceCHNTHB';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.chinawoodencratefeetype; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.chinawoodencratefeetype IS 'ตีลังไม้ 1=ไม่ตี, 2=ตีลัง เดิม tb_forwarder crate';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.chinawoodencratefee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.chinawoodencratefee IS 'ค่าตีลังไม้';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.otherservicefee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.otherservicefee IS 'ค่าบริการอื่น ๆ';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.thailanddeliveryfee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.thailanddeliveryfee IS 'ค่าขนส่งในไทย';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.frefprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.frefprice IS 'คิดเรทนำเข้าตาม 1=น้ำหนัก 2=ปริมาตร';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.fqc; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.fqc IS '	1=ไม่ตรวจนับ, 2=ตรวจนับ';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.fqcprice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.fqcprice IS 'ค่า QC สินค้า';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.fpriceupdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.fpriceupdate IS 'ราคาที่เก็บเพิ่มมาจากฝากนำเข้า';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.fdiscount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.fdiscount IS 'ส่วนลด';


--
-- Name: COLUMN tb_tmp_forwarder_item_momo.productcostchn; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_item_momo.productcostchn IS 'note_amount';


--
-- Name: tb_tmp_forwarder_item_momo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_tmp_forwarder_item_momo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_tmp_forwarder_item_momo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_tmp_forwarder_item_momo_id_seq OWNED BY public.tb_tmp_forwarder_item_momo.id;


--
-- Name: tb_tmp_forwarder_momo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_tmp_forwarder_momo (
    id bigint NOT NULL,
    container_name character varying(255),
    container_code character varying(255),
    due_date timestamp without time zone,
    box_total integer,
    box_weight numeric(10,2),
    box_cbm numeric(10,6),
    sm_code character varying(255),
    sm_date timestamp without time zone,
    manifest_date timestamp without time zone,
    estimated_date timestamp without time zone,
    etd timestamp without time zone,
    eta timestamp without time zone,
    re timestamp without time zone,
    created_at timestamp without time zone,
    note text,
    note_amount integer,
    transport_name character varying(255),
    transport_code character varying(255),
    warehouse_name character varying(255),
    warehouse_code character varying(255),
    status character varying(255),
    status_date timestamp without time zone,
    sm character varying(255),
    userid character varying(255),
    hno character varying(255),
    api_lasttimeupdated timestamp without time zone
);


--
-- Name: COLUMN tb_tmp_forwarder_momo.note_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_tmp_forwarder_momo.note_amount IS 'หน่วยหยวน';


--
-- Name: tb_tmp_forwarder_momo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_tmp_forwarder_momo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_tmp_forwarder_momo_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_tmp_forwarder_momo_id_seq OWNED BY public.tb_tmp_forwarder_momo.id;


--
-- Name: tb_tmp_profile_admin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_tmp_profile_admin (
    id bigint NOT NULL,
    token character varying(70) NOT NULL
);


--
-- Name: tb_tmp_profile_admin_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_tmp_profile_admin_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_tmp_profile_admin_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_tmp_profile_admin_id_seq OWNED BY public.tb_tmp_profile_admin.id;


--
-- Name: tb_user_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_user_sales (
    id bigint NOT NULL,
    usstatus character varying(1) NOT NULL,
    date timestamp without time zone,
    useridmain character varying(10) NOT NULL,
    userid character varying(10) NOT NULL,
    idf bigint NOT NULL
);


--
-- Name: COLUMN tb_user_sales.idf; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_user_sales.idf IS 'เลขที่ออเดอร์นำเข้า';


--
-- Name: tb_user_sales_admin_pay; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_user_sales_admin_pay (
    id bigint NOT NULL,
    date timestamp without time zone,
    status character varying(1) NOT NULL,
    useridmain character varying(10) NOT NULL,
    dateslip timestamp without time zone,
    imagesslip character varying(200) NOT NULL,
    amount numeric(10,2) NOT NULL,
    admincreate character varying(20) NOT NULL,
    name_blank character varying(256) NOT NULL,
    no_blank character varying(256) NOT NULL,
    name_account character varying(256) NOT NULL,
    file character varying(300) NOT NULL
);


--
-- Name: COLUMN tb_user_sales_admin_pay.date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_user_sales_admin_pay.date IS 'วันที่สร้าง';


--
-- Name: tb_user_sales_admin_pay_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_user_sales_admin_pay_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_user_sales_admin_pay_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_user_sales_admin_pay_id_seq OWNED BY public.tb_user_sales_admin_pay.id;


--
-- Name: tb_user_sales_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_user_sales_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_user_sales_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_user_sales_id_seq OWNED BY public.tb_user_sales.id;


--
-- Name: tb_user_sales_pay; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_user_sales_pay (
    id bigint NOT NULL,
    idus bigint NOT NULL,
    idusap bigint NOT NULL
);


--
-- Name: COLUMN tb_user_sales_pay.idusap; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_user_sales_pay.idusap IS 'ไอดีที่ทำรายการจ่าย';


--
-- Name: tb_user_sales_pay_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_user_sales_pay_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_user_sales_pay_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_user_sales_pay_id_seq OWNED BY public.tb_user_sales_pay.id;


--
-- Name: tb_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_users (
    id bigint NOT NULL,
    userid character varying(10) NOT NULL,
    usertel character varying(13) NOT NULL,
    userstatus character varying(1) DEFAULT '1'::character varying NOT NULL,
    userpass character varying(80) NOT NULL,
    pcs_logged character varying(80),
    username character varying(200) NOT NULL,
    userlastname character varying(200) NOT NULL,
    useremail character varying(100),
    userlineid character varying(50),
    userfacebook character varying(255),
    userregistered timestamp without time zone,
    usersex character varying(10),
    userbirthday date,
    userlastlogin timestamp without time zone,
    userregisterwith character varying(3),
    userpicture character varying(150) DEFAULT 'user.jpg'::character varying NOT NULL,
    userrecoverkey character varying(30),
    userrecoverdate timestamp without time zone,
    coid character varying(10) DEFAULT 'PCS'::character varying NOT NULL,
    adminid character varying(20),
    adminidsale character varying(20),
    userlinenotify character varying(80) NOT NULL,
    usercompany character varying(1) NOT NULL,
    usercomparison character varying(1) NOT NULL,
    usercomparisonvalue numeric(10,2) NOT NULL,
    usercredit character varying(1) NOT NULL,
    usercreditvalue numeric(10,2) NOT NULL,
    usercreditdate integer NOT NULL,
    shopuser character varying(1) NOT NULL,
    channel character varying(2) NOT NULL,
    userrecom character varying(20) NOT NULL,
    useraddressid character varying(20) NOT NULL,
    usertransporttype character varying(1) NOT NULL,
    usershipby character varying(20) NOT NULL,
    userpaymethod character varying(1) NOT NULL,
    usernote text NOT NULL,
    useractive character varying(1) NOT NULL,
    userlineidoa character varying(50) NOT NULL,
    companycustomer character varying(1) NOT NULL
);


--
-- Name: COLUMN tb_users.userid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userid IS 'รหัสสมาชิก';


--
-- Name: COLUMN tb_users.usertel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.usertel IS 'เบอร์โทร';


--
-- Name: COLUMN tb_users.userstatus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userstatus IS 'สถานะการใช้งานบัญชี_1=ใช้งาน,0=ลบบัญชี';


--
-- Name: COLUMN tb_users.userpass; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userpass IS 'รหัสผ่านเข้าสู่ระบบ';


--
-- Name: COLUMN tb_users.username; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.username IS 'ชื่อจริง';


--
-- Name: COLUMN tb_users.userlastname; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userlastname IS 'นามสกุล';


--
-- Name: COLUMN tb_users.useremail; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.useremail IS 'อีเมล';


--
-- Name: COLUMN tb_users.userlineid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userlineid IS 'ไอดีไลน์';


--
-- Name: COLUMN tb_users.userfacebook; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userfacebook IS 'ลิงก์เฟสบุ๊ก';


--
-- Name: COLUMN tb_users.userregistered; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userregistered IS 'วันที่สมัครใช้งาน';


--
-- Name: COLUMN tb_users.usersex; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.usersex IS 'เพศ Null=ไม่ระบุ,1=ชาย,2=หญิง,3=เพศทางเลือก';


--
-- Name: COLUMN tb_users.userbirthday; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userbirthday IS 'วันเกิด';


--
-- Name: COLUMN tb_users.userlastlogin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userlastlogin IS 'เวลาล็อกอินล่าสุด';


--
-- Name: COLUMN tb_users.userregisterwith; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userregisterwith IS 'วิธีสมัครสมาชิก PCS=สมาชิกในระบบ,F=เฟสบุ๊ก,L=ไลน์';


--
-- Name: COLUMN tb_users.userrecoverkey; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userrecoverkey IS 'ตัวเลขขอรีเซ็ตรหัสผ่าน';


--
-- Name: COLUMN tb_users.userrecoverdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userrecoverdate IS 'วันที่ขอรีเซ็ต';


--
-- Name: COLUMN tb_users.coid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.coid IS 'กลุ่มลูกค้า PCS=ลูกค้าทั่วไป';


--
-- Name: COLUMN tb_users.adminid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.adminid IS 'admin ที่สร้างบัญชีนี้';


--
-- Name: COLUMN tb_users.shopuser; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.shopuser IS '1=ซื้อไปใข้เอง';


--
-- Name: COLUMN tb_users.userpaymethod; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userpaymethod IS 'วิธีเก็บเงิน 1=ต้นทาง 2=ปลายทาง';


--
-- Name: COLUMN tb_users.useractive; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.useractive IS '1=ใช้งานแล้ว';


--
-- Name: COLUMN tb_users.userlineidoa; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.userlineidoa IS 'user_line_id';


--
-- Name: COLUMN tb_users.companycustomer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users.companycustomer IS '1=seafreight,2=cargo';


--
-- Name: tb_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_users_id_seq OWNED BY public.tb_users.id;


--
-- Name: tb_users_otp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_users_otp (
    id bigint NOT NULL,
    userid character varying(30) NOT NULL,
    date timestamp without time zone
);


--
-- Name: COLUMN tb_users_otp.date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users_otp.date IS 'วันที่ยืนยันตัวตน';


--
-- Name: tb_users_otp_hs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_users_otp_hs (
    id bigint NOT NULL,
    date timestamp without time zone,
    userid character varying(30) NOT NULL,
    tel character varying(12) NOT NULL,
    type character varying(1) NOT NULL,
    ip character varying(45) NOT NULL,
    refno character varying(20) NOT NULL,
    token character varying(40) NOT NULL
);


--
-- Name: COLUMN tb_users_otp_hs.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_users_otp_hs.type IS '1=ยืนยันตัวตนสมัครใหม่,2=ยืนยันตัวตนลูกค้าเดิม,3=ขอรหัสผ่านใหม่,4=เปลี่ยนเบอร์';


--
-- Name: tb_users_otp_hs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_users_otp_hs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_users_otp_hs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_users_otp_hs_id_seq OWNED BY public.tb_users_otp_hs.id;


--
-- Name: tb_users_otp_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_users_otp_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_users_otp_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_users_otp_id_seq OWNED BY public.tb_users_otp.id;


--
-- Name: tb_wallet; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_wallet (
    userid character varying(10) NOT NULL,
    wallettotal numeric(10,2) DEFAULT 0.00
);


--
-- Name: COLUMN tb_wallet.userid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet.userid IS 'รหัสสมาชิก';


--
-- Name: COLUMN tb_wallet.wallettotal; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet.wallettotal IS 'ยอดเงินกระเป่า';


--
-- Name: tb_wallet_hs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_wallet_hs (
    id bigint NOT NULL,
    date timestamp without time zone,
    dateslip timestamp without time zone,
    amount numeric(10,2) NOT NULL,
    status character varying(1),
    type character varying(1),
    typenew character varying(1) NOT NULL,
    typeservice character varying(1) NOT NULL,
    paydeposit character varying(1),
    admincreate character varying(20),
    imagesslip character varying(150),
    depositnamebank character varying(100),
    nameuserbank character varying(200),
    nouserbank character varying(200),
    note text,
    adminid character varying(20),
    adminidupdate character varying(20),
    lockdate timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    session character varying(100),
    reforder character varying(30),
    reforder2 bigint,
    whno character varying(30) NOT NULL,
    wusercredit character varying(1) NOT NULL,
    userid character varying(20) NOT NULL,
    adminidcrate character varying(30) NOT NULL
);


--
-- Name: COLUMN tb_wallet_hs.date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.date IS 'วันที่ทำรายการ';


--
-- Name: COLUMN tb_wallet_hs.dateslip; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.dateslip IS 'วันที่โอนในสลิป ฝาก';


--
-- Name: COLUMN tb_wallet_hs.amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.amount IS 'จำนวนเงิน';


--
-- Name: COLUMN tb_wallet_hs.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.status IS '1=รอดำเนินการ,2=สำเร็จ,3=ไม่สำเร็จ';


--
-- Name: COLUMN tb_wallet_hs.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.type IS '1=รายการเติมเงิน,2=รายการชำระเงินฝากสั่ง,3=รายการถอนเงิน,4=รายการชำระเงินฝากนำเข้า,5=รายการคืนเงิน,6=ชำระเงินฝากโอน,7=ชำระเงินรอตรวจสอบการเติม';


--
-- Name: COLUMN tb_wallet_hs.typenew; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.typenew IS '1=เติมเงิน,2=คืนเงิน,3=ชำระฝากสั่ง,4=ชำระฝากสั่งเติมเพิ่ม,5=ชำระนำเข้า,6=ชำระเงินนำเข้าเติมเพิ่ม, 7=ชำระเงินฝากโอน';


--
-- Name: COLUMN tb_wallet_hs.typeservice; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.typeservice IS '1=ฝากสั่งซื้อ, 2=ฝากนำเข้า, 3=ฝากโอน';


--
-- Name: COLUMN tb_wallet_hs.paydeposit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.paydeposit IS 'รายการเติมพร้อมชำระ';


--
-- Name: COLUMN tb_wallet_hs.imagesslip; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.imagesslip IS 'ชื่อไฟล์สลิป ฝาก หรือ ถอน';


--
-- Name: COLUMN tb_wallet_hs.depositnamebank; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.depositnamebank IS 'ธนาคารปลายทางที่รับเงิน';


--
-- Name: COLUMN tb_wallet_hs.nameuserbank; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.nameuserbank IS 'ชื่อบัญชีรับเงินคืน';


--
-- Name: COLUMN tb_wallet_hs.nouserbank; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.nouserbank IS 'เลขที่บัญชีโอนเงินคืน';


--
-- Name: COLUMN tb_wallet_hs.adminid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.adminid IS 'adminเปิดรายการ';


--
-- Name: COLUMN tb_wallet_hs.adminidupdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.adminidupdate IS 'แอดมินทำรายการ';


--
-- Name: COLUMN tb_wallet_hs.lockdate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.lockdate IS 'เวลาห้ามเปิดรายการซ้ำ';


--
-- Name: COLUMN tb_wallet_hs.session; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.session IS 'เครื่องที่มาเปิดตอนนั้น';


--
-- Name: COLUMN tb_wallet_hs.reforder; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.reforder IS 'อ้างอิงรายการตามสถานะ รายการฝากชำระเงินเลขที่ รายการถอนเงิน';


--
-- Name: COLUMN tb_wallet_hs.reforder2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_wallet_hs.reforder2 IS 'อ้างอิงการเติมพร้อมชำระ
';


--
-- Name: tb_wallet_hs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_wallet_hs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_wallet_hs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_wallet_hs_id_seq OWNED BY public.tb_wallet_hs.id;


--
-- Name: tb_wallet_paydeposit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_wallet_paydeposit (
    id bigint NOT NULL,
    whid bigint NOT NULL,
    hno character varying(30) NOT NULL
);


--
-- Name: tb_wallet_paydeposit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_wallet_paydeposit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_wallet_paydeposit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_wallet_paydeposit_id_seq OWNED BY public.tb_wallet_paydeposit.id;


--
-- Name: tb_web_hs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_web_hs (
    id bigint NOT NULL,
    datetime timestamp without time zone,
    ip character varying(45) NOT NULL,
    device integer NOT NULL,
    os integer NOT NULL,
    browser integer NOT NULL,
    load_time numeric(10,8) NOT NULL,
    user_agent text NOT NULL,
    session_id character varying(256) NOT NULL,
    userid character varying(30) NOT NULL,
    page_name integer NOT NULL
);


--
-- Name: COLUMN tb_web_hs.device; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_web_hs.device IS 'nameGetDevice()';


--
-- Name: COLUMN tb_web_hs.os; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_web_hs.os IS 'nameGetOS()';


--
-- Name: COLUMN tb_web_hs.browser; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_web_hs.browser IS 'getBrowserName()';


--
-- Name: COLUMN tb_web_hs.page_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_web_hs.page_name IS 'namePageName()';


--
-- Name: tb_web_hs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_web_hs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_web_hs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_web_hs_id_seq OWNED BY public.tb_web_hs.id;


--
-- Name: tb_withdraw_comm_interpreter_h; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_withdraw_comm_interpreter_h (
    id bigint NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    title character varying(300) NOT NULL,
    amount numeric(10,2) NOT NULL,
    commbefore numeric(10,2) NOT NULL,
    withholding numeric(10,2) NOT NULL,
    status character varying(1) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    adminidupdate character varying(30) NOT NULL,
    namebank character varying(2) NOT NULL,
    nameuserbank character varying(200) NOT NULL,
    nouserbank character varying(200) NOT NULL,
    imagesslip character varying(300) NOT NULL,
    adminid character varying(30) NOT NULL
);


--
-- Name: COLUMN tb_withdraw_comm_interpreter_h.commbefore; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_withdraw_comm_interpreter_h.commbefore IS 'Commission before';


--
-- Name: COLUMN tb_withdraw_comm_interpreter_h.withholding; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_withdraw_comm_interpreter_h.withholding IS 'Withholding';


--
-- Name: tb_withdraw_comm_interpreter_h_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_withdraw_comm_interpreter_h_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_withdraw_comm_interpreter_h_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_withdraw_comm_interpreter_h_id_seq OWNED BY public.tb_withdraw_comm_interpreter_h.id;


--
-- Name: tb_withdraw_comm_interpreter_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_withdraw_comm_interpreter_item (
    id bigint NOT NULL,
    hno character varying(30) NOT NULL,
    wciid bigint NOT NULL,
    diffyaun numeric(10,2) NOT NULL
);


--
-- Name: COLUMN tb_withdraw_comm_interpreter_item.diffyaun; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_withdraw_comm_interpreter_item.diffyaun IS 'ส่วนต่าง ณ วันที่จ่ายเงิน';


--
-- Name: tb_withdraw_comm_interpreter_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_withdraw_comm_interpreter_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_withdraw_comm_interpreter_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_withdraw_comm_interpreter_item_id_seq OWNED BY public.tb_withdraw_comm_interpreter_item.id;


--
-- Name: tb_withdraw_comm_sale_h; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_withdraw_comm_sale_h (
    id bigint NOT NULL,
    date timestamp without time zone,
    dateupdate timestamp without time zone,
    title character varying(300) NOT NULL,
    amount numeric(10,2) NOT NULL,
    commbefore numeric(10,2) NOT NULL,
    withholding numeric(10,2) NOT NULL,
    status character varying(1) NOT NULL,
    adminidcreate character varying(30) NOT NULL,
    adminidupdate character varying(30) NOT NULL,
    namebank character varying(2) NOT NULL,
    nameuserbank character varying(200) NOT NULL,
    nouserbank character varying(200) NOT NULL,
    imagesslip character varying(300) NOT NULL,
    adminid character varying(30) NOT NULL
);


--
-- Name: COLUMN tb_withdraw_comm_sale_h.commbefore; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_withdraw_comm_sale_h.commbefore IS 'Commission before ';


--
-- Name: COLUMN tb_withdraw_comm_sale_h.withholding; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_withdraw_comm_sale_h.withholding IS 'Withholding';


--
-- Name: tb_withdraw_comm_sale_h_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_withdraw_comm_sale_h_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_withdraw_comm_sale_h_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_withdraw_comm_sale_h_id_seq OWNED BY public.tb_withdraw_comm_sale_h.id;


--
-- Name: tb_withdraw_comm_sale_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_withdraw_comm_sale_item (
    id bigint NOT NULL,
    fid bigint NOT NULL,
    wcsid bigint NOT NULL
);


--
-- Name: tb_withdraw_comm_sale_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_withdraw_comm_sale_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_withdraw_comm_sale_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_withdraw_comm_sale_item_id_seq OWNED BY public.tb_withdraw_comm_sale_item.id;


--
-- Name: tb_youtude; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tb_youtude (
    id bigint NOT NULL,
    dateget timestamp without time zone,
    title text NOT NULL,
    videoid character varying(256) NOT NULL,
    urlcover character varying(256) NOT NULL,
    category character varying(1) NOT NULL
);


--
-- Name: TABLE tb_youtude; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tb_youtude IS 'ข้อมูลจาก youtude';


--
-- Name: COLUMN tb_youtude.category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.tb_youtude.category IS '1=all,2=ceo';


--
-- Name: tb_youtude_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tb_youtude_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tb_youtude_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tb_youtude_id_seq OWNED BY public.tb_youtude.id;


--
-- Name: reserve_meeting_room id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reserve_meeting_room ALTER COLUMN id SET DEFAULT nextval('public.reserve_meeting_room_id_seq'::regclass);


--
-- Name: tas_historydata_mobile id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_historydata_mobile ALTER COLUMN id SET DEFAULT nextval('public.tas_historydata_mobile_id_seq'::regclass);


--
-- Name: tas_historydataold id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_historydataold ALTER COLUMN id SET DEFAULT nextval('public.tas_historydataold_id_seq'::regclass);


--
-- Name: tas_historydataold_tmp id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_historydataold_tmp ALTER COLUMN id SET DEFAULT nextval('public.tas_historydataold_tmp_id_seq'::regclass);


--
-- Name: tas_holiday id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_holiday ALTER COLUMN id SET DEFAULT nextval('public.tas_holiday_id_seq'::regclass);


--
-- Name: tas_holiday_maid id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_holiday_maid ALTER COLUMN id SET DEFAULT nextval('public.tas_holiday_maid_id_seq'::regclass);


--
-- Name: tas_leave id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_leave ALTER COLUMN id SET DEFAULT nextval('public.tas_leave_id_seq'::regclass);


--
-- Name: tb_account_pcs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_account_pcs ALTER COLUMN id SET DEFAULT nextval('public.tb_account_pcs_id_seq'::regclass);


--
-- Name: tb_address addressid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_address ALTER COLUMN addressid SET DEFAULT nextval('public.tb_address_addressid_seq'::regclass);


--
-- Name: tb_address_main id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_address_main ALTER COLUMN id SET DEFAULT nextval('public.tb_address_main_id_seq'::regclass);


--
-- Name: tb_address_maomao_free id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_address_maomao_free ALTER COLUMN id SET DEFAULT nextval('public.tb_address_maomao_free_id_seq'::regclass);


--
-- Name: tb_admin id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_admin ALTER COLUMN id SET DEFAULT nextval('public.tb_admin_id_seq'::regclass);


--
-- Name: tb_admin_address id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_admin_address ALTER COLUMN id SET DEFAULT nextval('public.tb_admin_address_id_seq'::regclass);


--
-- Name: tb_api_china_hs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_api_china_hs ALTER COLUMN id SET DEFAULT nextval('public.tb_api_china_hs_id_seq'::regclass);


--
-- Name: tb_bill billid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_bill ALTER COLUMN billid SET DEFAULT nextval('public.tb_bill_billid_seq'::regclass);


--
-- Name: tb_bill_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_bill_item ALTER COLUMN id SET DEFAULT nextval('public.tb_bill_item_id_seq'::regclass);


--
-- Name: tb_cart id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cart ALTER COLUMN id SET DEFAULT nextval('public.tb_cart_id_seq'::regclass);


--
-- Name: tb_cash_back_hs cbhid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cash_back_hs ALTER COLUMN cbhid SET DEFAULT nextval('public.tb_cash_back_hs_cbhid_seq'::regclass);


--
-- Name: tb_check_forwarder id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_check_forwarder ALTER COLUMN id SET DEFAULT nextval('public.tb_check_forwarder_id_seq'::regclass);


--
-- Name: tb_cnt id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cnt ALTER COLUMN id SET DEFAULT nextval('public.tb_cnt_id_seq'::regclass);


--
-- Name: tb_cnt_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cnt_item ALTER COLUMN id SET DEFAULT nextval('public.tb_cnt_item_id_seq'::regclass);


--
-- Name: tb_cnt_pay_idorco id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cnt_pay_idorco ALTER COLUMN id SET DEFAULT nextval('public.tb_cnt_pay_idorco_id_seq'::regclass);


--
-- Name: tb_cnt_pay_trackingchn id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cnt_pay_trackingchn ALTER COLUMN id SET DEFAULT nextval('public.tb_cnt_pay_trackingchn_id_seq'::regclass);


--
-- Name: tb_co id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_co ALTER COLUMN id SET DEFAULT nextval('public.tb_co_id_seq'::regclass);


--
-- Name: tb_contact_outsider id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_contact_outsider ALTER COLUMN id SET DEFAULT nextval('public.tb_contact_outsider_id_seq'::regclass);


--
-- Name: tb_corporate id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_corporate ALTER COLUMN id SET DEFAULT nextval('public.tb_corporate_id_seq'::regclass);


--
-- Name: tb_cost_container id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cost_container ALTER COLUMN id SET DEFAULT nextval('public.tb_cost_container_id_seq'::regclass);


--
-- Name: tb_customrate_hs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_customrate_hs ALTER COLUMN id SET DEFAULT nextval('public.tb_customrate_hs_id_seq'::regclass);


--
-- Name: tb_education_background id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_education_background ALTER COLUMN id SET DEFAULT nextval('public.tb_education_background_id_seq'::regclass);


--
-- Name: tb_farwarder_quotation id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_farwarder_quotation ALTER COLUMN id SET DEFAULT nextval('public.tb_farwarder_quotation_id_seq'::regclass);


--
-- Name: tb_farwarder_quotation_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_farwarder_quotation_item ALTER COLUMN id SET DEFAULT nextval('public.tb_farwarder_quotation_item_id_seq'::regclass);


--
-- Name: tb_forwarder id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_id_seq'::regclass);


--
-- Name: tb_forwarder_driver id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_driver ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_driver_id_seq'::regclass);


--
-- Name: tb_forwarder_driver_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_driver_item ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_driver_item_id_seq'::regclass);


--
-- Name: tb_forwarder_img id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_img ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_img_id_seq'::regclass);


--
-- Name: tb_forwarder_import id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_import ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_import_id_seq'::regclass);


--
-- Name: tb_forwarder_import2 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_import2 ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_import2_id_seq'::regclass);


--
-- Name: tb_forwarder_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_item ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_item_id_seq'::regclass);


--
-- Name: tb_forwarder_jmf_tmp id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_jmf_tmp ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_jmf_tmp_id_seq'::regclass);


--
-- Name: tb_forwarder_prepare id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_prepare ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_prepare_id_seq'::regclass);


--
-- Name: tb_forwarder_tran_th_h id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_tran_th_h ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_tran_th_h_id_seq'::regclass);


--
-- Name: tb_forwarder_tran_th_sub id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_tran_th_sub ALTER COLUMN id SET DEFAULT nextval('public.tb_forwarder_tran_th_sub_id_seq'::regclass);


--
-- Name: tb_header_order id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_header_order ALTER COLUMN id SET DEFAULT nextval('public.tb_header_order_id_seq'::regclass);


--
-- Name: tb_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_history ALTER COLUMN id SET DEFAULT nextval('public.tb_history_id_seq'::regclass);


--
-- Name: tb_history_key id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_history_key ALTER COLUMN id SET DEFAULT nextval('public.tb_history_key_id_seq'::regclass);


--
-- Name: tb_hs_rate_custom_cbm id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_hs_rate_custom_cbm ALTER COLUMN id SET DEFAULT nextval('public.tb_hs_rate_custom_cbm_id_seq'::regclass);


--
-- Name: tb_hs_rate_custom_kg id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_hs_rate_custom_kg ALTER COLUMN id SET DEFAULT nextval('public.tb_hs_rate_custom_kg_id_seq'::regclass);


--
-- Name: tb_keyword_product id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_keyword_product ALTER COLUMN id SET DEFAULT nextval('public.tb_keyword_product_id_seq'::regclass);


--
-- Name: tb_log_forwarder_status id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_log_forwarder_status ALTER COLUMN id SET DEFAULT nextval('public.tb_log_forwarder_status_id_seq'::regclass);


--
-- Name: tb_notify id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_notify ALTER COLUMN id SET DEFAULT nextval('public.tb_notify_id_seq'::regclass);


--
-- Name: tb_notify_read id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_notify_read ALTER COLUMN id SET DEFAULT nextval('public.tb_notify_read_id_seq'::regclass);


--
-- Name: tb_notify_sheet_ctt id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_notify_sheet_ctt ALTER COLUMN id SET DEFAULT nextval('public.tb_notify_sheet_ctt_id_seq'::regclass);


--
-- Name: tb_notify_wp id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_notify_wp ALTER COLUMN id SET DEFAULT nextval('public.tb_notify_wp_id_seq'::regclass);


--
-- Name: tb_options option_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_options ALTER COLUMN option_id SET DEFAULT nextval('public.tb_options_option_id_seq'::regclass);


--
-- Name: tb_order id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_order ALTER COLUMN id SET DEFAULT nextval('public.tb_order_id_seq'::regclass);


--
-- Name: tb_org_email_ships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_org_email_ships ALTER COLUMN id SET DEFAULT nextval('public.tb_org_email_ships_id_seq'::regclass);


--
-- Name: tb_org_line_ships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_org_line_ships ALTER COLUMN id SET DEFAULT nextval('public.tb_org_line_ships_id_seq'::regclass);


--
-- Name: tb_org_tell_ships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_org_tell_ships ALTER COLUMN id SET DEFAULT nextval('public.tb_org_tell_ships_id_seq'::regclass);


--
-- Name: tb_org_wechat_ships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_org_wechat_ships ALTER COLUMN id SET DEFAULT nextval('public.tb_org_wechat_ships_id_seq'::regclass);


--
-- Name: tb_organization_domainname id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_domainname ALTER COLUMN id SET DEFAULT nextval('public.tb_organization_domainname_id_seq'::regclass);


--
-- Name: tb_organization_email id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_email ALTER COLUMN id SET DEFAULT nextval('public.tb_organization_email_id_seq'::regclass);


--
-- Name: tb_organization_line id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_line ALTER COLUMN id SET DEFAULT nextval('public.tb_organization_line_id_seq'::regclass);


--
-- Name: tb_organization_tell id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_tell ALTER COLUMN id SET DEFAULT nextval('public.tb_organization_tell_id_seq'::regclass);


--
-- Name: tb_organization_wechat id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_wechat ALTER COLUMN id SET DEFAULT nextval('public.tb_organization_wechat_id_seq'::regclass);


--
-- Name: tb_otp_check id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_otp_check ALTER COLUMN id SET DEFAULT nextval('public.tb_otp_check_id_seq'::regclass);


--
-- Name: tb_page_name id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_page_name ALTER COLUMN id SET DEFAULT nextval('public.tb_page_name_id_seq'::regclass);


--
-- Name: tb_payment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_payment ALTER COLUMN id SET DEFAULT nextval('public.tb_payment_id_seq'::regclass);


--
-- Name: tb_pcs_logged id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_pcs_logged ALTER COLUMN id SET DEFAULT nextval('public.tb_pcs_logged_id_seq'::regclass);


--
-- Name: tb_post_job id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_post_job ALTER COLUMN id SET DEFAULT nextval('public.tb_post_job_id_seq'::regclass);


--
-- Name: tb_product id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_product ALTER COLUMN id SET DEFAULT nextval('public.tb_product_id_seq'::regclass);


--
-- Name: tb_product_category pcid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_product_category ALTER COLUMN pcid SET DEFAULT nextval('public.tb_product_category_pcid_seq'::regclass);


--
-- Name: tb_promotion id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_promotion ALTER COLUMN id SET DEFAULT nextval('public.tb_promotion_id_seq'::regclass);


--
-- Name: tb_rate_custom_cbm id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_custom_cbm ALTER COLUMN id SET DEFAULT nextval('public.tb_rate_custom_cbm_id_seq'::regclass);


--
-- Name: tb_rate_custom_kg id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_custom_kg ALTER COLUMN id SET DEFAULT nextval('public.tb_rate_custom_kg_id_seq'::regclass);


--
-- Name: tb_rate_g_cbm id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_g_cbm ALTER COLUMN id SET DEFAULT nextval('public.tb_rate_g_cbm_id_seq'::regclass);


--
-- Name: tb_rate_g_kg id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_g_kg ALTER COLUMN id SET DEFAULT nextval('public.tb_rate_g_kg_id_seq'::regclass);


--
-- Name: tb_rate_vip_cbm id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_vip_cbm ALTER COLUMN id SET DEFAULT nextval('public.tb_rate_vip_cbm_id_seq'::regclass);


--
-- Name: tb_rate_vip_kg id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_vip_kg ALTER COLUMN id SET DEFAULT nextval('public.tb_rate_vip_kg_id_seq'::regclass);


--
-- Name: tb_receipt id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_receipt ALTER COLUMN id SET DEFAULT nextval('public.tb_receipt_id_seq'::regclass);


--
-- Name: tb_receipt_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_receipt_item ALTER COLUMN id SET DEFAULT nextval('public.tb_receipt_item_id_seq'::regclass);


--
-- Name: tb_register id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_register ALTER COLUMN id SET DEFAULT nextval('public.tb_register_id_seq'::regclass);


--
-- Name: tb_sales_report id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sales_report ALTER COLUMN id SET DEFAULT nextval('public.tb_sales_report_id_seq'::regclass);


--
-- Name: tb_set_comm_interpreter id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_set_comm_interpreter ALTER COLUMN id SET DEFAULT nextval('public.tb_set_comm_interpreter_id_seq'::regclass);


--
-- Name: tb_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_settings ALTER COLUMN id SET DEFAULT nextval('public.tb_settings_id_seq'::regclass);


--
-- Name: tb_shop_pay_h id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_shop_pay_h ALTER COLUMN id SET DEFAULT nextval('public.tb_shop_pay_h_id_seq'::regclass);


--
-- Name: tb_shop_pay_sub id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_shop_pay_sub ALTER COLUMN id SET DEFAULT nextval('public.tb_shop_pay_sub_id_seq'::regclass);


--
-- Name: tb_sms_hs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sms_hs ALTER COLUMN id SET DEFAULT nextval('public.tb_sms_hs_id_seq'::regclass);


--
-- Name: tb_sms_statistic id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sms_statistic ALTER COLUMN id SET DEFAULT nextval('public.tb_sms_statistic_id_seq'::regclass);


--
-- Name: tb_sms_statistic9 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sms_statistic9 ALTER COLUMN id SET DEFAULT nextval('public.tb_sms_statistic9_id_seq'::regclass);


--
-- Name: tb_survey id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_survey ALTER COLUMN id SET DEFAULT nextval('public.tb_survey_id_seq'::regclass);


--
-- Name: tb_survey202306 id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_survey202306 ALTER COLUMN id SET DEFAULT nextval('public.tb_survey202306_id_seq'::regclass);


--
-- Name: tb_terms_service id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_terms_service ALTER COLUMN id SET DEFAULT nextval('public.tb_terms_service_id_seq'::regclass);


--
-- Name: tb_tmp_forwarder_cargothai id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_forwarder_cargothai ALTER COLUMN id SET DEFAULT nextval('public.tb_tmp_forwarder_cargothai_id_seq'::regclass);


--
-- Name: tb_tmp_forwarder_item_cargothai id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_forwarder_item_cargothai ALTER COLUMN id SET DEFAULT nextval('public.tb_tmp_forwarder_item_cargothai_id_seq'::regclass);


--
-- Name: tb_tmp_forwarder_item_momo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_forwarder_item_momo ALTER COLUMN id SET DEFAULT nextval('public.tb_tmp_forwarder_item_momo_id_seq'::regclass);


--
-- Name: tb_tmp_forwarder_momo id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_forwarder_momo ALTER COLUMN id SET DEFAULT nextval('public.tb_tmp_forwarder_momo_id_seq'::regclass);


--
-- Name: tb_tmp_profile_admin id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_profile_admin ALTER COLUMN id SET DEFAULT nextval('public.tb_tmp_profile_admin_id_seq'::regclass);


--
-- Name: tb_user_sales id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_user_sales ALTER COLUMN id SET DEFAULT nextval('public.tb_user_sales_id_seq'::regclass);


--
-- Name: tb_user_sales_admin_pay id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_user_sales_admin_pay ALTER COLUMN id SET DEFAULT nextval('public.tb_user_sales_admin_pay_id_seq'::regclass);


--
-- Name: tb_user_sales_pay id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_user_sales_pay ALTER COLUMN id SET DEFAULT nextval('public.tb_user_sales_pay_id_seq'::regclass);


--
-- Name: tb_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_users ALTER COLUMN id SET DEFAULT nextval('public.tb_users_id_seq'::regclass);


--
-- Name: tb_users_otp id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_users_otp ALTER COLUMN id SET DEFAULT nextval('public.tb_users_otp_id_seq'::regclass);


--
-- Name: tb_users_otp_hs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_users_otp_hs ALTER COLUMN id SET DEFAULT nextval('public.tb_users_otp_hs_id_seq'::regclass);


--
-- Name: tb_wallet_hs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_wallet_hs ALTER COLUMN id SET DEFAULT nextval('public.tb_wallet_hs_id_seq'::regclass);


--
-- Name: tb_wallet_paydeposit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_wallet_paydeposit ALTER COLUMN id SET DEFAULT nextval('public.tb_wallet_paydeposit_id_seq'::regclass);


--
-- Name: tb_web_hs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_web_hs ALTER COLUMN id SET DEFAULT nextval('public.tb_web_hs_id_seq'::regclass);


--
-- Name: tb_withdraw_comm_interpreter_h id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_withdraw_comm_interpreter_h ALTER COLUMN id SET DEFAULT nextval('public.tb_withdraw_comm_interpreter_h_id_seq'::regclass);


--
-- Name: tb_withdraw_comm_interpreter_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_withdraw_comm_interpreter_item ALTER COLUMN id SET DEFAULT nextval('public.tb_withdraw_comm_interpreter_item_id_seq'::regclass);


--
-- Name: tb_withdraw_comm_sale_h id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_withdraw_comm_sale_h ALTER COLUMN id SET DEFAULT nextval('public.tb_withdraw_comm_sale_h_id_seq'::regclass);


--
-- Name: tb_withdraw_comm_sale_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_withdraw_comm_sale_item ALTER COLUMN id SET DEFAULT nextval('public.tb_withdraw_comm_sale_item_id_seq'::regclass);


--
-- Name: tb_youtude id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_youtude ALTER COLUMN id SET DEFAULT nextval('public.tb_youtude_id_seq'::regclass);


--
--


-- ── PRIMARY KEY constraints (117) ────────────────────────────

-- Name: reserve_meeting_room idx_16391_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reserve_meeting_room
    ADD CONSTRAINT idx_16391_primary PRIMARY KEY (id);



--
-- Name: tas_historydata_mobile idx_16398_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_historydata_mobile
    ADD CONSTRAINT idx_16398_primary PRIMARY KEY (id);



--
-- Name: tas_historydataold idx_16405_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_historydataold
    ADD CONSTRAINT idx_16405_primary PRIMARY KEY (id);



--
-- Name: tas_historydataold_tmp idx_16412_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_historydataold_tmp
    ADD CONSTRAINT idx_16412_primary PRIMARY KEY (id);



--
-- Name: tas_holiday idx_16419_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_holiday
    ADD CONSTRAINT idx_16419_primary PRIMARY KEY (id);



--
-- Name: tas_holiday_maid idx_16426_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_holiday_maid
    ADD CONSTRAINT idx_16426_primary PRIMARY KEY (id);



--
-- Name: tas_leave idx_16433_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tas_leave
    ADD CONSTRAINT idx_16433_primary PRIMARY KEY (id);



--
-- Name: tb_account_pcs idx_16440_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_account_pcs
    ADD CONSTRAINT idx_16440_primary PRIMARY KEY (id);



--
-- Name: tb_address idx_16447_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_address
    ADD CONSTRAINT idx_16447_primary PRIMARY KEY (addressid);



--
-- Name: tb_address_main idx_16455_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_address_main
    ADD CONSTRAINT idx_16455_primary PRIMARY KEY (id);



--
-- Name: tb_address_maomao_free idx_16460_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_address_maomao_free
    ADD CONSTRAINT idx_16460_primary PRIMARY KEY (id);



--
-- Name: tb_admin idx_16467_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_admin
    ADD CONSTRAINT idx_16467_primary PRIMARY KEY (id);



--
-- Name: tb_admin_address idx_16476_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_admin_address
    ADD CONSTRAINT idx_16476_primary PRIMARY KEY (id);



--
-- Name: tb_api_china_hs idx_16483_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_api_china_hs
    ADD CONSTRAINT idx_16483_primary PRIMARY KEY (id);



--
-- Name: tb_bill idx_16490_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_bill
    ADD CONSTRAINT idx_16490_primary PRIMARY KEY (billid);



--
-- Name: tb_bill_item idx_16495_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_bill_item
    ADD CONSTRAINT idx_16495_primary PRIMARY KEY (id);



--
-- Name: tb_cart idx_16500_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cart
    ADD CONSTRAINT idx_16500_primary PRIMARY KEY (id);



--
-- Name: tb_cash_back idx_16508_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cash_back
    ADD CONSTRAINT idx_16508_primary PRIMARY KEY (userid);



--
-- Name: tb_cash_back_hs idx_16512_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cash_back_hs
    ADD CONSTRAINT idx_16512_primary PRIMARY KEY (cbhid);



--
-- Name: tb_check_forwarder idx_16519_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_check_forwarder
    ADD CONSTRAINT idx_16519_primary PRIMARY KEY (id);



--
-- Name: tb_cnt idx_16524_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cnt
    ADD CONSTRAINT idx_16524_primary PRIMARY KEY (id);



--
-- Name: tb_cnt_item idx_16531_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cnt_item
    ADD CONSTRAINT idx_16531_primary PRIMARY KEY (id);



--
-- Name: tb_cnt_pay_idorco idx_16536_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cnt_pay_idorco
    ADD CONSTRAINT idx_16536_primary PRIMARY KEY (id);



--
-- Name: tb_cnt_pay_trackingchn idx_16541_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cnt_pay_trackingchn
    ADD CONSTRAINT idx_16541_primary PRIMARY KEY (id);



--
-- Name: tb_co idx_16546_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_co
    ADD CONSTRAINT idx_16546_primary PRIMARY KEY (id);



--
-- Name: tb_contact_outsider idx_16552_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_contact_outsider
    ADD CONSTRAINT idx_16552_primary PRIMARY KEY (id);



--
-- Name: tb_corporate idx_16559_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_corporate
    ADD CONSTRAINT idx_16559_primary PRIMARY KEY (id);



--
-- Name: tb_cost_container idx_16567_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_cost_container
    ADD CONSTRAINT idx_16567_primary PRIMARY KEY (id);



--
-- Name: tb_credit idx_16571_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_credit
    ADD CONSTRAINT idx_16571_primary PRIMARY KEY (userid);



--
-- Name: tb_csvimport idx_16574_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_csvimport
    ADD CONSTRAINT idx_16574_primary PRIMARY KEY (id);



--
-- Name: tb_customrate_hs idx_16578_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_customrate_hs
    ADD CONSTRAINT idx_16578_primary PRIMARY KEY (id);



--
-- Name: tb_education_background idx_16583_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_education_background
    ADD CONSTRAINT idx_16583_primary PRIMARY KEY (id);



--
-- Name: tb_farwarder_quotation idx_16590_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_farwarder_quotation
    ADD CONSTRAINT idx_16590_primary PRIMARY KEY (id);



--
-- Name: tb_farwarder_quotation_item idx_16597_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_farwarder_quotation_item
    ADD CONSTRAINT idx_16597_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder idx_16602_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder
    ADD CONSTRAINT idx_16602_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_driver idx_16619_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_driver
    ADD CONSTRAINT idx_16619_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_driver_item idx_16624_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_driver_item
    ADD CONSTRAINT idx_16624_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_img idx_16629_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_img
    ADD CONSTRAINT idx_16629_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_import idx_16634_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_import
    ADD CONSTRAINT idx_16634_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_import2 idx_16639_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_import2
    ADD CONSTRAINT idx_16639_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_item idx_16644_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_item
    ADD CONSTRAINT idx_16644_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_jmf_tmp idx_16651_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_jmf_tmp
    ADD CONSTRAINT idx_16651_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_prepare idx_16658_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_prepare
    ADD CONSTRAINT idx_16658_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_tran_th_h idx_16663_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_tran_th_h
    ADD CONSTRAINT idx_16663_primary PRIMARY KEY (id);



--
-- Name: tb_forwarder_tran_th_sub idx_16668_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_forwarder_tran_th_sub
    ADD CONSTRAINT idx_16668_primary PRIMARY KEY (id);



--
-- Name: tb_header_order idx_16673_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_header_order
    ADD CONSTRAINT idx_16673_primary PRIMARY KEY (id);



--
-- Name: tb_history idx_16685_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_history
    ADD CONSTRAINT idx_16685_primary PRIMARY KEY (id);



--
-- Name: tb_history_key idx_16692_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_history_key
    ADD CONSTRAINT idx_16692_primary PRIMARY KEY (id);



--
-- Name: tb_hs_rate_custom_cbm idx_16699_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_hs_rate_custom_cbm
    ADD CONSTRAINT idx_16699_primary PRIMARY KEY (id);



--
-- Name: tb_hs_rate_custom_kg idx_16704_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_hs_rate_custom_kg
    ADD CONSTRAINT idx_16704_primary PRIMARY KEY (id);



--
-- Name: tb_keyword_product idx_16709_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_keyword_product
    ADD CONSTRAINT idx_16709_primary PRIMARY KEY (id);



--
-- Name: tb_log_forwarder_status idx_16716_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_log_forwarder_status
    ADD CONSTRAINT idx_16716_primary PRIMARY KEY (id);



--
-- Name: tb_notify idx_16721_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_notify
    ADD CONSTRAINT idx_16721_primary PRIMARY KEY (id);



--
-- Name: tb_notify_read idx_16728_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_notify_read
    ADD CONSTRAINT idx_16728_primary PRIMARY KEY (id);



--
-- Name: tb_notify_sheet_ctt idx_16733_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_notify_sheet_ctt
    ADD CONSTRAINT idx_16733_primary PRIMARY KEY (id);



--
-- Name: tb_notify_wp idx_16738_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_notify_wp
    ADD CONSTRAINT idx_16738_primary PRIMARY KEY (id);



--
-- Name: tb_options idx_16745_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_options
    ADD CONSTRAINT idx_16745_primary PRIMARY KEY (option_id);



--
-- Name: tb_order idx_16752_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_order
    ADD CONSTRAINT idx_16752_primary PRIMARY KEY (id);



--
-- Name: tb_org_email_ships idx_16762_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_org_email_ships
    ADD CONSTRAINT idx_16762_primary PRIMARY KEY (id);



--
-- Name: tb_org_line_ships idx_16767_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_org_line_ships
    ADD CONSTRAINT idx_16767_primary PRIMARY KEY (id);



--
-- Name: tb_org_tell_ships idx_16772_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_org_tell_ships
    ADD CONSTRAINT idx_16772_primary PRIMARY KEY (id);



--
-- Name: tb_org_wechat_ships idx_16777_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_org_wechat_ships
    ADD CONSTRAINT idx_16777_primary PRIMARY KEY (id);



--
-- Name: tb_organization_domainname idx_16782_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_domainname
    ADD CONSTRAINT idx_16782_primary PRIMARY KEY (id);



--
-- Name: tb_organization_email idx_16789_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_email
    ADD CONSTRAINT idx_16789_primary PRIMARY KEY (id);



--
-- Name: tb_organization_line idx_16796_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_line
    ADD CONSTRAINT idx_16796_primary PRIMARY KEY (id);



--
-- Name: tb_organization_tell idx_16803_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_tell
    ADD CONSTRAINT idx_16803_primary PRIMARY KEY (id);



--
-- Name: tb_organization_wechat idx_16810_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_organization_wechat
    ADD CONSTRAINT idx_16810_primary PRIMARY KEY (id);



--
-- Name: tb_otp_check idx_16817_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_otp_check
    ADD CONSTRAINT idx_16817_primary PRIMARY KEY (id);



--
-- Name: tb_page_name idx_16822_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_page_name
    ADD CONSTRAINT idx_16822_primary PRIMARY KEY (id);



--
-- Name: tb_payment idx_16827_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_payment
    ADD CONSTRAINT idx_16827_primary PRIMARY KEY (id);



--
-- Name: tb_pcs_logged idx_16835_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_pcs_logged
    ADD CONSTRAINT idx_16835_primary PRIMARY KEY (id);



--
-- Name: tb_post_job idx_16842_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_post_job
    ADD CONSTRAINT idx_16842_primary PRIMARY KEY (id);



--
-- Name: tb_pro_valentine idx_16848_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_pro_valentine
    ADD CONSTRAINT idx_16848_primary PRIMARY KEY (userid);



--
-- Name: tb_product idx_16854_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_product
    ADD CONSTRAINT idx_16854_primary PRIMARY KEY (id);



--
-- Name: tb_product_category idx_16861_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_product_category
    ADD CONSTRAINT idx_16861_primary PRIMARY KEY (pcid);



--
-- Name: tb_promotion idx_16868_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_promotion
    ADD CONSTRAINT idx_16868_primary PRIMARY KEY (id);



--
-- Name: tb_promotion33 idx_16872_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_promotion33
    ADD CONSTRAINT idx_16872_primary PRIMARY KEY (userid);



--
-- Name: tb_rate_custom_cbm idx_16876_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_custom_cbm
    ADD CONSTRAINT idx_16876_primary PRIMARY KEY (id);



--
-- Name: tb_rate_custom_kg idx_16881_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_custom_kg
    ADD CONSTRAINT idx_16881_primary PRIMARY KEY (id);



--
-- Name: tb_rate_g_cbm idx_16886_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_g_cbm
    ADD CONSTRAINT idx_16886_primary PRIMARY KEY (id);



--
-- Name: tb_rate_g_kg idx_16891_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_g_kg
    ADD CONSTRAINT idx_16891_primary PRIMARY KEY (id);



--
-- Name: tb_rate_vip_cbm idx_16896_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_vip_cbm
    ADD CONSTRAINT idx_16896_primary PRIMARY KEY (id);



--
-- Name: tb_rate_vip_kg idx_16901_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_rate_vip_kg
    ADD CONSTRAINT idx_16901_primary PRIMARY KEY (id);



--
-- Name: tb_receipt idx_16906_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_receipt
    ADD CONSTRAINT idx_16906_primary PRIMARY KEY (id);



--
-- Name: tb_receipt_item idx_16914_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_receipt_item
    ADD CONSTRAINT idx_16914_primary PRIMARY KEY (id);



--
-- Name: tb_register idx_16919_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_register
    ADD CONSTRAINT idx_16919_primary PRIMARY KEY (id);



--
-- Name: tb_sales_report idx_16928_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sales_report
    ADD CONSTRAINT idx_16928_primary PRIMARY KEY (id);



--
-- Name: tb_set_comm_interpreter idx_16933_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_set_comm_interpreter
    ADD CONSTRAINT idx_16933_primary PRIMARY KEY (id);



--
-- Name: tb_settings idx_16938_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_settings
    ADD CONSTRAINT idx_16938_primary PRIMARY KEY (id);



--
-- Name: tb_shop_pay_h idx_16949_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_shop_pay_h
    ADD CONSTRAINT idx_16949_primary PRIMARY KEY (id);



--
-- Name: tb_shop_pay_sub idx_16956_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_shop_pay_sub
    ADD CONSTRAINT idx_16956_primary PRIMARY KEY (id);



--
-- Name: tb_sms_hs idx_16961_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sms_hs
    ADD CONSTRAINT idx_16961_primary PRIMARY KEY (id);



--
-- Name: tb_sms_statistic idx_16968_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sms_statistic
    ADD CONSTRAINT idx_16968_primary PRIMARY KEY (id);



--
-- Name: tb_sms_statistic9 idx_16973_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_sms_statistic9
    ADD CONSTRAINT idx_16973_primary PRIMARY KEY (id);



--
-- Name: tb_survey idx_16978_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_survey
    ADD CONSTRAINT idx_16978_primary PRIMARY KEY (id);



--
-- Name: tb_survey202306 idx_16985_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_survey202306
    ADD CONSTRAINT idx_16985_primary PRIMARY KEY (id);



--
-- Name: tb_terms_service idx_16992_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_terms_service
    ADD CONSTRAINT idx_16992_primary PRIMARY KEY (id);



--
-- Name: tb_tmp_forwarder_cargothai idx_16997_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_forwarder_cargothai
    ADD CONSTRAINT idx_16997_primary PRIMARY KEY (id);



--
-- Name: tb_tmp_forwarder_item_cargothai idx_17004_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_forwarder_item_cargothai
    ADD CONSTRAINT idx_17004_primary PRIMARY KEY (id);



--
-- Name: tb_tmp_forwarder_item_momo idx_17011_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_forwarder_item_momo
    ADD CONSTRAINT idx_17011_primary PRIMARY KEY (id);



--
-- Name: tb_tmp_forwarder_momo idx_17018_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_forwarder_momo
    ADD CONSTRAINT idx_17018_primary PRIMARY KEY (id);



--
-- Name: tb_tmp_profile_admin idx_17025_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_tmp_profile_admin
    ADD CONSTRAINT idx_17025_primary PRIMARY KEY (id);



--
-- Name: tb_user_sales idx_17030_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_user_sales
    ADD CONSTRAINT idx_17030_primary PRIMARY KEY (id);



--
-- Name: tb_user_sales_admin_pay idx_17035_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_user_sales_admin_pay
    ADD CONSTRAINT idx_17035_primary PRIMARY KEY (id);



--
-- Name: tb_user_sales_pay idx_17042_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_user_sales_pay
    ADD CONSTRAINT idx_17042_primary PRIMARY KEY (id);



--
-- Name: tb_users idx_17047_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_users
    ADD CONSTRAINT idx_17047_primary PRIMARY KEY (id);



--
-- Name: tb_users_otp idx_17057_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_users_otp
    ADD CONSTRAINT idx_17057_primary PRIMARY KEY (id);



--
-- Name: tb_users_otp_hs idx_17062_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_users_otp_hs
    ADD CONSTRAINT idx_17062_primary PRIMARY KEY (id);



--
-- Name: tb_wallet idx_17066_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_wallet
    ADD CONSTRAINT idx_17066_primary PRIMARY KEY (userid);



--
-- Name: tb_wallet_hs idx_17071_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_wallet_hs
    ADD CONSTRAINT idx_17071_primary PRIMARY KEY (id);



--
-- Name: tb_wallet_paydeposit idx_17079_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_wallet_paydeposit
    ADD CONSTRAINT idx_17079_primary PRIMARY KEY (id);



--
-- Name: tb_web_hs idx_17084_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_web_hs
    ADD CONSTRAINT idx_17084_primary PRIMARY KEY (id);



--
-- Name: tb_withdraw_comm_interpreter_h idx_17091_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_withdraw_comm_interpreter_h
    ADD CONSTRAINT idx_17091_primary PRIMARY KEY (id);



--
-- Name: tb_withdraw_comm_interpreter_item idx_17098_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_withdraw_comm_interpreter_item
    ADD CONSTRAINT idx_17098_primary PRIMARY KEY (id);



--
-- Name: tb_withdraw_comm_sale_h idx_17103_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_withdraw_comm_sale_h
    ADD CONSTRAINT idx_17103_primary PRIMARY KEY (id);



--
-- Name: tb_withdraw_comm_sale_item idx_17110_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_withdraw_comm_sale_item
    ADD CONSTRAINT idx_17110_primary PRIMARY KEY (id);



--
-- Name: tb_youtude idx_17115_primary; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tb_youtude
    ADD CONSTRAINT idx_17115_primary PRIMARY KEY (id);

-- ── Row-Level Security — enable on all 117 tables ───────────
-- No policies: locks each table to service_role. Phase B adds policies.

ALTER TABLE public.reserve_meeting_room ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_historydata_mobile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_historydataold ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_historydataold_tmp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_holiday ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_holiday_maid ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tas_leave ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_account_pcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_address ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_address_main ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_address_maomao_free ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_admin_address ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_api_china_hs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_bill ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_bill_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cart ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cash_back ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cash_back_hs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_check_forwarder ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cnt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cnt_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cnt_pay_idorco ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cnt_pay_trackingchn ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_co ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_contact_outsider ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_corporate ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_cost_container ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_credit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_csvimport ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_customrate_hs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_education_background ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_farwarder_quotation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_farwarder_quotation_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_driver ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_driver_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_img ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_import ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_import2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_jmf_tmp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_prepare ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_tran_th_h ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_forwarder_tran_th_sub ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_header_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_history_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_hs_rate_custom_cbm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_hs_rate_custom_kg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_keyword_product ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_log_forwarder_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_notify ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_notify_read ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_notify_sheet_ctt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_notify_wp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_org_email_ships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_org_line_ships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_org_tell_ships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_org_wechat_ships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_organization_domainname ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_organization_email ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_organization_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_organization_tell ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_organization_wechat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_otp_check ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_page_name ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_pcs_logged ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_post_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_pro_valentine ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_product ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_product_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_promotion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_promotion33 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_rate_custom_cbm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_rate_custom_kg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_rate_g_cbm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_rate_g_kg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_rate_vip_cbm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_rate_vip_kg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_receipt_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_sales_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_set_comm_interpreter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_shop_pay_h ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_shop_pay_sub ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_sms_hs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_sms_statistic ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_sms_statistic9 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_survey ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_survey202306 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_terms_service ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_tmp_forwarder_cargothai ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_tmp_forwarder_item_cargothai ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_tmp_forwarder_item_momo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_tmp_forwarder_momo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_tmp_profile_admin ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_user_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_user_sales_admin_pay ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_user_sales_pay ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_users_otp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_users_otp_hs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_wallet_hs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_wallet_paydeposit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_web_hs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_withdraw_comm_interpreter_h ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_withdraw_comm_interpreter_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_withdraw_comm_sale_h ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_withdraw_comm_sale_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_youtude ENABLE ROW LEVEL SECURITY;


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0082_pcs_legacy_indexes.sql                                    ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- 0082 · PCS Cargo legacy schema — indexes + sequence resync (D1 Phase A)
-- ════════════════════════════════════════════════════════════
-- Companion to 0081. Apply AFTER the 3.78M-row data load (runbook §6.5):
--   · the 18 UNIQUE indexes of the legacy schema. The legacy MySQL schema
--     carries no non-unique secondary indexes — none are added here
--     (faithful port; Phase-B perf indexes, if needed, land at 0087+).
--   · sequence resync — every *_id_seq is set past the loaded MAX(id) so
--     post-migration INSERTs never collide with a migrated row. Each
--     statement is data-driven, so it is correct whatever the load order.
-- ════════════════════════════════════════════════════════════

-- ── UNIQUE indexes (18) ──────────────────────────────────────



--
-- Name: idx_16467_adminemail; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16467_adminemail ON public.tb_admin USING btree (adminemail);



--
-- Name: idx_16467_adminid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16467_adminid ON public.tb_admin USING btree (adminid);



--
-- Name: idx_16467_admintel; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16467_admintel ON public.tb_admin USING btree (admintel);



--
-- Name: idx_16495_fid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16495_fid ON public.tb_bill_item USING btree (fid);



--
-- Name: idx_16559_userid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16559_userid ON public.tb_corporate USING btree (userid);



--
-- Name: idx_16567_fcabinetnumber; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16567_fcabinetnumber ON public.tb_cost_container USING btree (fcabinetnumber);



--
-- Name: idx_16639_fid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16639_fid ON public.tb_forwarder_import2 USING btree (fid);



--
-- Name: idx_16673_hno; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16673_hno ON public.tb_header_order USING btree (hno);



--
-- Name: idx_16745_optionname; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16745_optionname ON public.tb_options USING btree (option_key);



--
-- Name: idx_16906_rid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16906_rid ON public.tb_receipt USING btree (rid);



--
-- Name: idx_16914_fid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16914_fid ON public.tb_receipt_item USING btree (fid);



--
-- Name: idx_16928_fid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16928_fid ON public.tb_sales_report USING btree (fid);



--
-- Name: idx_16978_userid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16978_userid ON public.tb_survey USING btree (userid);



--
-- Name: idx_16985_userid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16985_userid ON public.tb_survey202306 USING btree (userid);



--
-- Name: idx_16997_sm_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_16997_sm_code ON public.tb_tmp_forwarder_cargothai USING btree (sm_code);



--
-- Name: idx_17018_sm_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_17018_sm_code ON public.tb_tmp_forwarder_momo USING btree (sm_code);



--
-- Name: idx_17047_userid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_17047_userid ON public.tb_users USING btree (userid);



--
-- Name: idx_17047_usertel; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_17047_usertel ON public.tb_users USING btree (usertel);

-- ── Sequence resync — set every *_id_seq past MAX(id) ───────
-- Data-driven: GREATEST(MAX(id),1) as value, EXISTS(rows) as is_called
-- → next value = MAX(id)+1 for loaded tables, 1 for empty tables.

SELECT setval('public.reserve_meeting_room_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.reserve_meeting_room),0),1), EXISTS(SELECT 1 FROM public.reserve_meeting_room));
SELECT setval('public.tas_historydata_mobile_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tas_historydata_mobile),0),1), EXISTS(SELECT 1 FROM public.tas_historydata_mobile));
SELECT setval('public.tas_historydataold_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tas_historydataold),0),1), EXISTS(SELECT 1 FROM public.tas_historydataold));
SELECT setval('public.tas_historydataold_tmp_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tas_historydataold_tmp),0),1), EXISTS(SELECT 1 FROM public.tas_historydataold_tmp));
SELECT setval('public.tas_holiday_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tas_holiday),0),1), EXISTS(SELECT 1 FROM public.tas_holiday));
SELECT setval('public.tas_holiday_maid_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tas_holiday_maid),0),1), EXISTS(SELECT 1 FROM public.tas_holiday_maid));
SELECT setval('public.tas_leave_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tas_leave),0),1), EXISTS(SELECT 1 FROM public.tas_leave));
SELECT setval('public.tb_account_pcs_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_account_pcs),0),1), EXISTS(SELECT 1 FROM public.tb_account_pcs));
SELECT setval('public.tb_address_addressid_seq', GREATEST(COALESCE((SELECT MAX(addressid) FROM public.tb_address),0),1), EXISTS(SELECT 1 FROM public.tb_address));
SELECT setval('public.tb_address_main_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_address_main),0),1), EXISTS(SELECT 1 FROM public.tb_address_main));
SELECT setval('public.tb_address_maomao_free_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_address_maomao_free),0),1), EXISTS(SELECT 1 FROM public.tb_address_maomao_free));
SELECT setval('public.tb_admin_address_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_admin_address),0),1), EXISTS(SELECT 1 FROM public.tb_admin_address));
SELECT setval('public.tb_admin_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_admin),0),1), EXISTS(SELECT 1 FROM public.tb_admin));
SELECT setval('public.tb_api_china_hs_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_api_china_hs),0),1), EXISTS(SELECT 1 FROM public.tb_api_china_hs));
SELECT setval('public.tb_bill_billid_seq', GREATEST(COALESCE((SELECT MAX(billid) FROM public.tb_bill),0),1), EXISTS(SELECT 1 FROM public.tb_bill));
SELECT setval('public.tb_bill_item_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_bill_item),0),1), EXISTS(SELECT 1 FROM public.tb_bill_item));
SELECT setval('public.tb_cart_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_cart),0),1), EXISTS(SELECT 1 FROM public.tb_cart));
SELECT setval('public.tb_cash_back_hs_cbhid_seq', GREATEST(COALESCE((SELECT MAX(cbhid) FROM public.tb_cash_back_hs),0),1), EXISTS(SELECT 1 FROM public.tb_cash_back_hs));
SELECT setval('public.tb_check_forwarder_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_check_forwarder),0),1), EXISTS(SELECT 1 FROM public.tb_check_forwarder));
SELECT setval('public.tb_cnt_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_cnt),0),1), EXISTS(SELECT 1 FROM public.tb_cnt));
SELECT setval('public.tb_cnt_item_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_cnt_item),0),1), EXISTS(SELECT 1 FROM public.tb_cnt_item));
SELECT setval('public.tb_cnt_pay_idorco_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_cnt_pay_idorco),0),1), EXISTS(SELECT 1 FROM public.tb_cnt_pay_idorco));
SELECT setval('public.tb_cnt_pay_trackingchn_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_cnt_pay_trackingchn),0),1), EXISTS(SELECT 1 FROM public.tb_cnt_pay_trackingchn));
SELECT setval('public.tb_co_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_co),0),1), EXISTS(SELECT 1 FROM public.tb_co));
SELECT setval('public.tb_contact_outsider_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_contact_outsider),0),1), EXISTS(SELECT 1 FROM public.tb_contact_outsider));
SELECT setval('public.tb_corporate_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_corporate),0),1), EXISTS(SELECT 1 FROM public.tb_corporate));
SELECT setval('public.tb_cost_container_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_cost_container),0),1), EXISTS(SELECT 1 FROM public.tb_cost_container));
SELECT setval('public.tb_customrate_hs_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_customrate_hs),0),1), EXISTS(SELECT 1 FROM public.tb_customrate_hs));
SELECT setval('public.tb_education_background_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_education_background),0),1), EXISTS(SELECT 1 FROM public.tb_education_background));
SELECT setval('public.tb_farwarder_quotation_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_farwarder_quotation),0),1), EXISTS(SELECT 1 FROM public.tb_farwarder_quotation));
SELECT setval('public.tb_farwarder_quotation_item_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_farwarder_quotation_item),0),1), EXISTS(SELECT 1 FROM public.tb_farwarder_quotation_item));
SELECT setval('public.tb_forwarder_driver_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_driver),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_driver));
SELECT setval('public.tb_forwarder_driver_item_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_driver_item),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_driver_item));
SELECT setval('public.tb_forwarder_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder));
SELECT setval('public.tb_forwarder_img_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_img),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_img));
SELECT setval('public.tb_forwarder_import2_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_import2),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_import2));
SELECT setval('public.tb_forwarder_import_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_import),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_import));
SELECT setval('public.tb_forwarder_item_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_item),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_item));
SELECT setval('public.tb_forwarder_jmf_tmp_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_jmf_tmp),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_jmf_tmp));
SELECT setval('public.tb_forwarder_prepare_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_prepare),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_prepare));
SELECT setval('public.tb_forwarder_tran_th_h_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_tran_th_h),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_tran_th_h));
SELECT setval('public.tb_forwarder_tran_th_sub_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_forwarder_tran_th_sub),0),1), EXISTS(SELECT 1 FROM public.tb_forwarder_tran_th_sub));
SELECT setval('public.tb_header_order_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_header_order),0),1), EXISTS(SELECT 1 FROM public.tb_header_order));
SELECT setval('public.tb_history_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_history),0),1), EXISTS(SELECT 1 FROM public.tb_history));
SELECT setval('public.tb_history_key_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_history_key),0),1), EXISTS(SELECT 1 FROM public.tb_history_key));
SELECT setval('public.tb_hs_rate_custom_cbm_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_hs_rate_custom_cbm),0),1), EXISTS(SELECT 1 FROM public.tb_hs_rate_custom_cbm));
SELECT setval('public.tb_hs_rate_custom_kg_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_hs_rate_custom_kg),0),1), EXISTS(SELECT 1 FROM public.tb_hs_rate_custom_kg));
SELECT setval('public.tb_keyword_product_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_keyword_product),0),1), EXISTS(SELECT 1 FROM public.tb_keyword_product));
SELECT setval('public.tb_log_forwarder_status_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_log_forwarder_status),0),1), EXISTS(SELECT 1 FROM public.tb_log_forwarder_status));
SELECT setval('public.tb_notify_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_notify),0),1), EXISTS(SELECT 1 FROM public.tb_notify));
SELECT setval('public.tb_notify_read_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_notify_read),0),1), EXISTS(SELECT 1 FROM public.tb_notify_read));
SELECT setval('public.tb_notify_sheet_ctt_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_notify_sheet_ctt),0),1), EXISTS(SELECT 1 FROM public.tb_notify_sheet_ctt));
SELECT setval('public.tb_notify_wp_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_notify_wp),0),1), EXISTS(SELECT 1 FROM public.tb_notify_wp));
SELECT setval('public.tb_options_option_id_seq', GREATEST(COALESCE((SELECT MAX(option_id) FROM public.tb_options),0),1), EXISTS(SELECT 1 FROM public.tb_options));
SELECT setval('public.tb_order_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_order),0),1), EXISTS(SELECT 1 FROM public.tb_order));
SELECT setval('public.tb_org_email_ships_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_org_email_ships),0),1), EXISTS(SELECT 1 FROM public.tb_org_email_ships));
SELECT setval('public.tb_org_line_ships_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_org_line_ships),0),1), EXISTS(SELECT 1 FROM public.tb_org_line_ships));
SELECT setval('public.tb_org_tell_ships_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_org_tell_ships),0),1), EXISTS(SELECT 1 FROM public.tb_org_tell_ships));
SELECT setval('public.tb_org_wechat_ships_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_org_wechat_ships),0),1), EXISTS(SELECT 1 FROM public.tb_org_wechat_ships));
SELECT setval('public.tb_organization_domainname_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_organization_domainname),0),1), EXISTS(SELECT 1 FROM public.tb_organization_domainname));
SELECT setval('public.tb_organization_email_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_organization_email),0),1), EXISTS(SELECT 1 FROM public.tb_organization_email));
SELECT setval('public.tb_organization_line_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_organization_line),0),1), EXISTS(SELECT 1 FROM public.tb_organization_line));
SELECT setval('public.tb_organization_tell_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_organization_tell),0),1), EXISTS(SELECT 1 FROM public.tb_organization_tell));
SELECT setval('public.tb_organization_wechat_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_organization_wechat),0),1), EXISTS(SELECT 1 FROM public.tb_organization_wechat));
SELECT setval('public.tb_otp_check_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_otp_check),0),1), EXISTS(SELECT 1 FROM public.tb_otp_check));
SELECT setval('public.tb_page_name_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_page_name),0),1), EXISTS(SELECT 1 FROM public.tb_page_name));
SELECT setval('public.tb_payment_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_payment),0),1), EXISTS(SELECT 1 FROM public.tb_payment));
SELECT setval('public.tb_pcs_logged_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_pcs_logged),0),1), EXISTS(SELECT 1 FROM public.tb_pcs_logged));
SELECT setval('public.tb_post_job_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_post_job),0),1), EXISTS(SELECT 1 FROM public.tb_post_job));
SELECT setval('public.tb_product_category_pcid_seq', GREATEST(COALESCE((SELECT MAX(pcid) FROM public.tb_product_category),0),1), EXISTS(SELECT 1 FROM public.tb_product_category));
SELECT setval('public.tb_product_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_product),0),1), EXISTS(SELECT 1 FROM public.tb_product));
SELECT setval('public.tb_promotion_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_promotion),0),1), EXISTS(SELECT 1 FROM public.tb_promotion));
SELECT setval('public.tb_rate_custom_cbm_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_rate_custom_cbm),0),1), EXISTS(SELECT 1 FROM public.tb_rate_custom_cbm));
SELECT setval('public.tb_rate_custom_kg_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_rate_custom_kg),0),1), EXISTS(SELECT 1 FROM public.tb_rate_custom_kg));
SELECT setval('public.tb_rate_g_cbm_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_rate_g_cbm),0),1), EXISTS(SELECT 1 FROM public.tb_rate_g_cbm));
SELECT setval('public.tb_rate_g_kg_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_rate_g_kg),0),1), EXISTS(SELECT 1 FROM public.tb_rate_g_kg));
SELECT setval('public.tb_rate_vip_cbm_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_rate_vip_cbm),0),1), EXISTS(SELECT 1 FROM public.tb_rate_vip_cbm));
SELECT setval('public.tb_rate_vip_kg_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_rate_vip_kg),0),1), EXISTS(SELECT 1 FROM public.tb_rate_vip_kg));
SELECT setval('public.tb_receipt_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_receipt),0),1), EXISTS(SELECT 1 FROM public.tb_receipt));
SELECT setval('public.tb_receipt_item_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_receipt_item),0),1), EXISTS(SELECT 1 FROM public.tb_receipt_item));
SELECT setval('public.tb_register_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_register),0),1), EXISTS(SELECT 1 FROM public.tb_register));
SELECT setval('public.tb_sales_report_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_sales_report),0),1), EXISTS(SELECT 1 FROM public.tb_sales_report));
SELECT setval('public.tb_set_comm_interpreter_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_set_comm_interpreter),0),1), EXISTS(SELECT 1 FROM public.tb_set_comm_interpreter));
SELECT setval('public.tb_settings_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_settings),0),1), EXISTS(SELECT 1 FROM public.tb_settings));
SELECT setval('public.tb_shop_pay_h_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_shop_pay_h),0),1), EXISTS(SELECT 1 FROM public.tb_shop_pay_h));
SELECT setval('public.tb_shop_pay_sub_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_shop_pay_sub),0),1), EXISTS(SELECT 1 FROM public.tb_shop_pay_sub));
SELECT setval('public.tb_sms_hs_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_sms_hs),0),1), EXISTS(SELECT 1 FROM public.tb_sms_hs));
SELECT setval('public.tb_sms_statistic9_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_sms_statistic9),0),1), EXISTS(SELECT 1 FROM public.tb_sms_statistic9));
SELECT setval('public.tb_sms_statistic_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_sms_statistic),0),1), EXISTS(SELECT 1 FROM public.tb_sms_statistic));
SELECT setval('public.tb_survey202306_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_survey202306),0),1), EXISTS(SELECT 1 FROM public.tb_survey202306));
SELECT setval('public.tb_survey_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_survey),0),1), EXISTS(SELECT 1 FROM public.tb_survey));
SELECT setval('public.tb_terms_service_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_terms_service),0),1), EXISTS(SELECT 1 FROM public.tb_terms_service));
SELECT setval('public.tb_tmp_forwarder_cargothai_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_tmp_forwarder_cargothai),0),1), EXISTS(SELECT 1 FROM public.tb_tmp_forwarder_cargothai));
SELECT setval('public.tb_tmp_forwarder_item_cargothai_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_tmp_forwarder_item_cargothai),0),1), EXISTS(SELECT 1 FROM public.tb_tmp_forwarder_item_cargothai));
SELECT setval('public.tb_tmp_forwarder_item_momo_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_tmp_forwarder_item_momo),0),1), EXISTS(SELECT 1 FROM public.tb_tmp_forwarder_item_momo));
SELECT setval('public.tb_tmp_forwarder_momo_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_tmp_forwarder_momo),0),1), EXISTS(SELECT 1 FROM public.tb_tmp_forwarder_momo));
SELECT setval('public.tb_tmp_profile_admin_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_tmp_profile_admin),0),1), EXISTS(SELECT 1 FROM public.tb_tmp_profile_admin));
SELECT setval('public.tb_user_sales_admin_pay_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_user_sales_admin_pay),0),1), EXISTS(SELECT 1 FROM public.tb_user_sales_admin_pay));
SELECT setval('public.tb_user_sales_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_user_sales),0),1), EXISTS(SELECT 1 FROM public.tb_user_sales));
SELECT setval('public.tb_user_sales_pay_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_user_sales_pay),0),1), EXISTS(SELECT 1 FROM public.tb_user_sales_pay));
SELECT setval('public.tb_users_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_users),0),1), EXISTS(SELECT 1 FROM public.tb_users));
SELECT setval('public.tb_users_otp_hs_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_users_otp_hs),0),1), EXISTS(SELECT 1 FROM public.tb_users_otp_hs));
SELECT setval('public.tb_users_otp_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_users_otp),0),1), EXISTS(SELECT 1 FROM public.tb_users_otp));
SELECT setval('public.tb_wallet_hs_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_wallet_hs),0),1), EXISTS(SELECT 1 FROM public.tb_wallet_hs));
SELECT setval('public.tb_wallet_paydeposit_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_wallet_paydeposit),0),1), EXISTS(SELECT 1 FROM public.tb_wallet_paydeposit));
SELECT setval('public.tb_web_hs_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_web_hs),0),1), EXISTS(SELECT 1 FROM public.tb_web_hs));
SELECT setval('public.tb_withdraw_comm_interpreter_h_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_withdraw_comm_interpreter_h),0),1), EXISTS(SELECT 1 FROM public.tb_withdraw_comm_interpreter_h));
SELECT setval('public.tb_withdraw_comm_interpreter_item_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_withdraw_comm_interpreter_item),0),1), EXISTS(SELECT 1 FROM public.tb_withdraw_comm_interpreter_item));
SELECT setval('public.tb_withdraw_comm_sale_h_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_withdraw_comm_sale_h),0),1), EXISTS(SELECT 1 FROM public.tb_withdraw_comm_sale_h));
SELECT setval('public.tb_withdraw_comm_sale_item_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_withdraw_comm_sale_item),0),1), EXISTS(SELECT 1 FROM public.tb_withdraw_comm_sale_item));
SELECT setval('public.tb_youtude_id_seq', GREATEST(COALESCE((SELECT MAX(id) FROM public.tb_youtude),0),1), EXISTS(SELECT 1 FROM public.tb_youtude));


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0083_pcs_legacy_member_seq.sql                                 ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- 0083 · PCS Cargo legacy — PR member-code generator (D1 Phase A)
-- ════════════════════════════════════════════════════════════
-- Per runbook §7 Q4 (เดฟ · 2026-05-18): post-migration signups continue the
-- legacy PR<n> series, LOWEST-VACANT first — the smallest unused PR<n>,
-- counting from PR1 up. The migrated ~8,898 customers occupy a sparse
-- PR<n> set (legacy running numbers, un-padded — PR1, PR1791, PR8898 …),
-- so the first new signups fill the low gaps (PR1-PR5 …).
--
-- This file DEFINES public.next_pr_member_code() only. Wiring it into the
-- customer signup flow is Phase B (ภูม). It deliberately does NOT touch the
-- existing generate_member_code() trigger / member_code_seq (migration
-- 0060): that serves the rebuilt `profiles` table and its padded PR001
-- pattern. The two coexist until Phase B reconciles auth onto tb_users.
--
-- NOTE — faithful port: the legacy tb_users carries no UNIQUE constraint on
-- userid (none added here — see 0081/0082). The data IS unique in practice
-- (verified at load). The advisory lock below serialises concurrent code
-- allocation; Phase B should still add a unique index on tb_users.userid
-- and retry-on-conflict when it wires signup.
-- ════════════════════════════════════════════════════════════

-- next_pr_member_code() — return the lowest unused PR<n> in tb_users.
--
-- · scans 1 .. (max numeric PR code + 1); returns 'PR' || (lowest vacant).
-- · the regex guard ^PR[0-9]+$ counts only numeric PR codes — the legacy
--   letter accounts (PRCARGO / PRTT / PRARNON / PRFAM) and the no-prefix
--   specials (PW / JET / FCL / AIGA) are correctly excluded from the series.
-- · pg_advisory_xact_lock serialises concurrent callers: the 2nd caller
--   blocks until the 1st transaction commits its INSERT, so it sees the
--   freshly-taken code and picks the next one. Caller MUST allocate the
--   code and INSERT the tb_users row in the SAME transaction.
create or replace function public.next_pr_member_code() returns text as $$
declare
  n integer;
begin
  perform pg_advisory_xact_lock(hashtext('pcs_legacy.pr_member_code'));

  select min(g) into n
  from generate_series(
         1,
         (select coalesce(max((substring(userid from 3))::integer), 0) + 1
            from public.tb_users
           where userid ~ '^PR[0-9]+$')
       ) as g
  where ('PR' || g) not in (select userid from public.tb_users);

  return 'PR' || n;
end;
$$ language plpgsql;

comment on function public.next_pr_member_code() is
  'D1 Phase A (0083): lowest-vacant PR<n> member code for post-migration '
  'signups. Caller must allocate + INSERT in one transaction. See runbook '
  'docs/runbook/pcs-data-migration.md §7 Q4.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0084_booking_documents.sql                                     ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- BK-1.5 (G1) · Link documents to bookings + extend doc_type CHECK for
--               the booking-flow attach-documents selector.
-- ════════════════════════════════════════════════════════════
-- Closes the G1 gap from the BK-1 audit (DocAttachSelector was a
-- placeholder).  Per design [docs/research/booking-flow-system-2026-05-18.md]
-- §6.2:  "a booking's uploads are documents rows tagged with the booking_id,
-- RLS owner-only."
--
-- This migration:
--   1. Adds nullable bookings FK column `booking_id` to public.documents +
--      an index for the per-booking lookup.
--   2. Extends the doc_type CHECK constraint to include 6 booking-attachment
--      types (`booking_*`).  The original 3 juristic-registration types
--      (`company_affidavit`, `vat`, `national_id`) stay untouched — the
--      juristic-check flow keeps working.
--   3. Adds an admin-read RLS policy on public.documents for the standard
--      admin role set, so /admin/bookings/[bookingNo] can list attachments.
--      (Customers continue to read only their own via the existing
--      documents_select_own policy from schema.sql.)
--
-- Idempotent.  Safe to re-run.
-- ════════════════════════════════════════════════════════════

-- ── 1) Add booking_id column + index ──────────────────────────────────
alter table public.documents
  add column if not exists booking_id uuid references public.bookings(id) on delete set null;

create index if not exists documents_booking_id_idx
  on public.documents(booking_id)
  where booking_id is not null;

-- ── 2) Extend doc_type CHECK ──────────────────────────────────────────
-- The 3 original juristic types + 6 booking types.  Other features that
-- need their own doc_type values can add them via their own ALTER
-- (idempotent drop+add pattern — see 0024 / 0026 for the precedent).
alter table public.documents
  drop constraint if exists documents_doc_type_check;

alter table public.documents
  add constraint documents_doc_type_check
  check (doc_type in (
    -- Juristic registration (original)
    'company_affidavit',
    'vat',
    'national_id',
    -- Booking attachments (BK-1.5)
    'booking_invoice',
    'booking_packing_list',
    'booking_certificate',
    'booking_vat_paw20',
    'booking_national_id',
    'booking_passport'
  ));

-- ── 3) Admin RLS read policy ──────────────────────────────────────────
-- The customer-side documents_select_own policy is unchanged (owner-only).
-- This adds an OR-branch admin policy so the admin booking detail page
-- (which uses createAdminClient anyway for now) plus future RLS-aware
-- admin reads can list a booking's attachments.
drop policy if exists "documents_admin_read" on public.documents;
create policy "documents_admin_read" on public.documents
  for select
  using (public.is_admin(array['super','ops','sales_admin','accounting']));

-- ── 4) Comments ───────────────────────────────────────────────────────
comment on column public.documents.booking_id is
  'BK-1.5 — when a document is uploaded as a booking attachment (via actions/bookings.ts:uploadBookingDocument), this FK points to the parent booking. NULL for juristic-registration documents + other non-booking uploads. ON DELETE SET NULL so a booking deletion does not cascade away the storage object''s metadata row.';

comment on constraint documents_doc_type_check on public.documents is
  'BK-1.5 — extended from the original 3 juristic types to also accept 6 booking attachment kinds (invoice / packing_list / certificate / vat_paw20 / national_id / passport — each prefixed `booking_`). Add new feature types via the same drop+add idempotent pattern used here.';

comment on policy "documents_admin_read" on public.documents is
  'BK-1.5 — admin (super/ops/sales_admin/accounting) reads ALL documents (PII surface — same role set as /admin/customers). Customer-side select stays scoped to own via documents_select_own.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0085_tax_invoices_credit_note_for.sql                          ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- G2e-2 (R3) · tax_invoices.credit_note_for_id — bidirectional credit-note link
-- ════════════════════════════════════════════════════════════
-- Per ADR-0006 §7 + RD Code 86 — when admin needs to refund a paid invoice
-- (not just typo correction — that uses the existing cancel→reissue path),
-- they cancel the original AND issue a "ใบลดหนี้" (credit note) that
-- references the original.
--
-- Original schema (0034) shipped one-direction link via `credit_note_id`
-- pointing FROM the cancelled original TO the credit note.  To make the
-- credit note self-identifying (without an indirect lookup) this adds
-- the inverse pointer:  credit_note_for_id  FROM the credit note  TO  the
-- original tax invoice.
--
-- A row's identity then maps cleanly:
--   credit_note_id     IS NOT NULL  →  original-that-has-been-credited
--   credit_note_for_id IS NOT NULL  →  this row IS a credit note
--   both NULL                       →  normal invoice (default)
--
-- The original `credit_note_id` column is kept (back-compat + the customer
-- detail page already reads it).  The new column is purely additive.
--
-- Idempotent.  Safe to re-run.
-- ════════════════════════════════════════════════════════════

-- 1) Add the inverse-pointer column
alter table public.tax_invoices
  add column if not exists credit_note_for_id uuid references public.tax_invoices(id);

-- Index for "find the credit note for an original invoice" / customer
-- portal "show all credit notes I have received".
create index if not exists tax_invoices_credit_note_for_idx
  on public.tax_invoices(credit_note_for_id)
  where credit_note_for_id is not null;

-- 2) Bidirectional consistency constraint
-- A credit note (credit_note_for_id IS NOT NULL) MUST be issued (status='issued'
-- with a serial) — never pending or cancelled.
alter table public.tax_invoices
  drop constraint if exists tax_invoices_credit_note_is_issued;

alter table public.tax_invoices
  add constraint tax_invoices_credit_note_is_issued check (
    credit_note_for_id is null
    or status = 'issued'
  );

-- 3) Comments
comment on column public.tax_invoices.credit_note_for_id is
  'G2e-2 — when this row IS a credit note (ใบลดหนี้), points to the original cancelled tax invoice it credits.  Inverse of credit_note_id (which points FROM the original TO this credit note).  Both columns populated bidirectionally on issuance.';

comment on constraint tax_invoices_credit_note_is_issued on public.tax_invoices is
  'G2e-2 — a credit note (credit_note_for_id NOT NULL) is always issued, never draft/cancelled (creating a draft credit note has no business meaning — issuance is atomic).';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0086_work_item_messages.sql                                    ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- IC-1 (T1) · work_item_messages + waiting_for block on work_items
-- ════════════════════════════════════════════════════════════
-- Per design [docs/research/internal-chat-system-2026-05-18.md] §2.
--
-- This is the **internal per-job chat + status-visibility layer** that
-- pairs with `0080_work_items` (the cross-department work-board spine).
-- Three things land here:
--
--   1. work_item_messages           — per-job chat thread (comment /
--                                     system / status_note)
--   2. work_item_message_mentions   — @mention fan-out (one row per
--                                     mention; powers the inbox)
--   3. work_items.waiting_for block — 3 new columns (blocked_on_role,
--                                     blocked_on_admin, waiting_reason)
--                                     + a CHECK on the reason vocab +
--                                     a partial index for the board
--                                     filter
--
-- Also extends two CHECK constraints (idempotent):
--   - notifications.category       += 'work_chat'
--   - notifications.reference_type += 'work_item'
--
-- Per design §3.2 the waiting_reason vocab is intentionally small +
-- fixed (8 values).  A free-text "why" defeats the at-a-glance scan +
-- the per-reason filter.  Nuance goes in the status_note message body;
-- the category stays an enum.
--
-- Idempotent.  Safe to re-run.
-- ════════════════════════════════════════════════════════════

-- ── 1) work_item_messages ─────────────────────────────────────────────
-- One row = one staff message OR one machine-generated system event
-- on one job.  NULL author + kind='system' = automatic event line so
-- the chat + the event log are one timeline (§3.4).
create table if not exists public.work_item_messages (
  id              uuid primary key default gen_random_uuid(),
  work_item_id    uuid not null references public.work_items(id) on delete cascade,

  -- Author.  NULL when kind='system' (machine-generated).  FK to profiles
  -- (not admins — admins has composite PK) — author MUST be an admin at
  -- post time (enforced by the Server Action + the RLS policy below).
  author_admin_id uuid references public.profiles(id) on delete set null,

  kind            text not null default 'comment'
                    check (kind in ('comment','system','status_note')),
  --   comment      — a human message
  --   system       — auto event (stage change, assignment, waiting set/cleared)
  --   status_note  — a human message that ALSO sets/clears the waiting_for
  --                  block in the same action (§3.3); rendered with emphasis

  body            text not null check (char_length(body) between 1 and 5000),

  -- When kind='status_note', the waiting fields this message set
  -- (denormalised copy for the timeline; live values live on work_items).
  set_waiting_reason text,
  set_blocked_role   text,

  deleted_at      timestamptz,                  -- soft-delete only
  created_at      timestamptz not null default now(),

  -- A system-generated row has no author + must be a 'system' kind.
  constraint work_item_messages_system_kind_consistent check (
    (author_admin_id is not null and kind in ('comment','status_note'))
    or (author_admin_id is null and kind = 'system')
  ),
  -- status_note must carry the waiting fields it mirrors.
  constraint work_item_messages_status_note_has_waiting check (
    kind <> 'status_note'
    or (set_waiting_reason is not null or set_blocked_role is not null)
  )
);

-- Thread scan (one job's messages in order).
create index if not exists work_item_messages_thread_idx
  on public.work_item_messages(work_item_id, created_at)
  where deleted_at is null;
-- Author profile pull (for "messages I posted recently").
create index if not exists work_item_messages_author_idx
  on public.work_item_messages(author_admin_id, created_at desc)
  where deleted_at is null and author_admin_id is not null;

-- ── 2) work_item_message_mentions ─────────────────────────────────────
-- @mention fan-out.  One row per (message, mentioned staff).  Written
-- at post time by the action after it parses @handles.  Denormalised
-- work_item_id so the "mentioned me" inbox needs no join to messages.
create table if not exists public.work_item_message_mentions (
  message_id         uuid not null references public.work_item_messages(id) on delete cascade,
  mentioned_admin_id uuid not null references public.profiles(id) on delete cascade,
  work_item_id       uuid not null references public.work_items(id) on delete cascade,
  notified_at        timestamptz,                -- set when the notification fired
  seen_at            timestamptz,                -- set when the mentioned staff opened the thread
  created_at         timestamptz not null default now(),
  primary key (message_id, mentioned_admin_id)
);

-- Inbox: unseen mentions for a staffer (the "@me" pull).
create index if not exists work_item_message_mentions_inbox_idx
  on public.work_item_message_mentions(mentioned_admin_id, created_at desc)
  where seen_at is null;
-- Per-job mention list (for the thread panel's "people @ed in this thread" pill).
create index if not exists work_item_message_mentions_job_idx
  on public.work_item_message_mentions(work_item_id, created_at);

-- ── 3) work_items.waiting_for block ───────────────────────────────────
-- Three columns added to the existing work_items table — additive only,
-- cannot conflict with anything in 0080.
alter table public.work_items
  add column if not exists blocked_on_role  text,
  add column if not exists blocked_on_admin uuid references public.profiles(id) on delete set null,
  add column if not exists waiting_reason   text;

-- waiting_reason vocabulary (per design §3.2 — 8 values + null = not blocked).
-- Each maps to a real legacy pain (A2/A4 rate-fix · A6 document · ...).
alter table public.work_items
  drop constraint if exists work_items_waiting_reason_chk;

alter table public.work_items
  add constraint work_items_waiting_reason_chk
  check (waiting_reason is null or waiting_reason in (
    'confirm',       -- รอเฟิม / รออนุมัติ — the generic "รอใครเฟิม"
    'disbursement',  -- รอเบิกจ่าย — container cost / vendor payout
    'billing',       -- รอวางบิล / รอออกใบแจ้งหนี้
    'follow_up',     -- รอตามลูกค้า / ตามคู่ค้า
    'document',      -- A6 — WHT cert / Form E / D/O / slip
    'payment',       -- รอลูกค้าชำระ
    'rate_fix',      -- A2/A4 — wrong rate must be corrected
    'external'       -- รอหน่วยงานภายนอก (customs / carrier)
  ));

-- "All jobs currently blocked on dept X for reason Y" — one scan.
create index if not exists work_items_blocked_idx
  on public.work_items(blocked_on_role, waiting_reason)
  where waiting_reason is not null;

-- "Jobs blocked on me personally" — for the inbox tab (§5.3).
create index if not exists work_items_blocked_on_admin_idx
  on public.work_items(blocked_on_admin)
  where blocked_on_admin is not null and waiting_reason is not null;

-- ── 4) Extend notifications enums ─────────────────────────────────────
-- Per §4.2 — staff chat notifications ride the shipped sendNotification()
-- pipeline.  Just add the category + reference type to the existing
-- CHECK constraints (drop+add idempotent pattern from 0024 / 0026).
alter table public.notifications
  drop constraint if exists notifications_category_check;

alter table public.notifications
  add constraint notifications_category_check
  check (category in (
    'order',
    'payment',
    'forwarder',
    'yuan_payment',
    'wallet',
    'sales',
    'system',
    'promo',
    'sales_digest',
    'booking',
    'observability',
    'work_chat'        -- IC-1: @mention + waiting-for notifications
  ));

alter table public.notifications
  drop constraint if exists notifications_reference_type_check;

alter table public.notifications
  add constraint notifications_reference_type_check
  check (reference_type in (
    'service_order',
    'forwarder',
    'yuan_payment',
    'wallet_transaction',
    'sales_commission',
    'sales_payout',
    'contact_message',
    'booking',
    'platform_incident',
    'work_item'        -- IC-1: deep-link from work_chat notifications
  ));

-- ── 5) RLS ────────────────────────────────────────────────────────────
alter table public.work_item_messages         enable row level security;
alter table public.work_item_message_mentions enable row level security;

-- READ: every active admin sees every thread — the org-wide promise.
drop policy if exists work_item_messages_admin_read on public.work_item_messages;
create policy work_item_messages_admin_read
  on public.work_item_messages for select
  using (public.is_admin());

-- WRITE: any active admin may post.  Author MUST equal auth.uid()
-- (defence in depth — the Server Action enforces it too).
drop policy if exists work_item_messages_admin_write on public.work_item_messages;
create policy work_item_messages_admin_write
  on public.work_item_messages for insert
  with check (public.is_admin() and author_admin_id = auth.uid());

-- UPDATE: soft-delete only.  Author may flip deleted_at; super-admin
-- may flip any row's deleted_at.  The Server Action is the real gate;
-- this policy is the floor.
drop policy if exists work_item_messages_soft_delete on public.work_item_messages;
create policy work_item_messages_soft_delete
  on public.work_item_messages for update
  using (
    (author_admin_id = auth.uid() and public.is_admin())
    or public.is_admin(array['super'])
  )
  with check (
    (author_admin_id = auth.uid() and public.is_admin())
    or public.is_admin(array['super'])
  );

-- Mentions: any admin reads (the thread itself is org-wide).
drop policy if exists work_item_message_mentions_admin_read on public.work_item_message_mentions;
create policy work_item_message_mentions_admin_read
  on public.work_item_message_mentions for select
  using (public.is_admin());

-- INSERT: any admin (the Server Action writes these alongside the message).
drop policy if exists work_item_message_mentions_insert on public.work_item_message_mentions;
create policy work_item_message_mentions_insert
  on public.work_item_message_mentions for insert
  with check (public.is_admin());

-- UPDATE: only the mentioned staffer may flip seen_at on their own rows.
drop policy if exists work_item_message_mentions_mark_seen on public.work_item_message_mentions;
create policy work_item_message_mentions_mark_seen
  on public.work_item_message_mentions for update
  using (mentioned_admin_id = auth.uid())
  with check (mentioned_admin_id = auth.uid());

-- ── 6) Comments ───────────────────────────────────────────────────────
comment on table public.work_item_messages is
  'IC-1 — per-job internal chat thread.  One row = one staff message or one machine-generated system event on one work_item.  Append-only (soft-delete via deleted_at).  Design: docs/research/internal-chat-system-2026-05-18.md §2.';

comment on column public.work_item_messages.kind is
  'comment = human message · system = auto event (stage change, assignment, waiting set/cleared) · status_note = human message that ALSO mutates the work_items waiting_for block in the same transaction.';

comment on table public.work_item_message_mentions is
  'IC-1 — @mention fan-out for work_item_messages.  One row per (message, mentioned staff).  Powers the per-staffer "@me" inbox (work_item_message_mentions_inbox_idx) + the per-thread "people mentioned" pill.';

comment on column public.work_items.blocked_on_role is
  'IC-1 — when this job is stuck (waiting_reason IS NOT NULL), which DEPARTMENT must act.  Draws from admins.role vocabulary.  NULL = either not blocked OR blocked on a non-Pacred actor (waiting_reason=external).';
comment on column public.work_items.blocked_on_admin is
  'IC-1 — optional: pin the wait to a specific PERSON (a profiles.id of an admins row).  NULL = the whole blocked_on_role dept owns the unblock.';
comment on column public.work_items.waiting_reason is
  'IC-1 — WHY the job is blocked (8-value vocab per design §3.2).  NULL = not blocked, just moving normally.  A stage change is NOT a wait — only "stuck on a named party for a named thing" sets this.';


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0087_pcs_migration_view_security_invoker.sql                   ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- 0087 · v_pcs_migration_status — SECURITY DEFINER → INVOKER
-- ════════════════════════════════════════════════════════════
-- Supabase Security Advisor flags public.v_pcs_migration_status as
-- CRITICAL ("Security Definer View"): the view (a one-row reporting
-- dashboard created by migration 0067, the pre-D1 PCS-customer
-- migration) runs with the view OWNER's privileges, so a query through
-- it enforces the owner's RLS, not the caller's — an RLS bypass.
--
-- Fix: security_invoker = on (PostgreSQL 15+) — the view now runs with
-- the QUERYING user's privileges + RLS. Non-destructive: the view and
-- its sole consumer (/admin/migration/pcs-customers via
-- actions/admin/pcs-migration.ts) keep working; admin reads go through
-- the service-role client, which is unaffected.
--
-- NOTE — D1 context: migration 0067's whole PCS-customer-migration
-- feature (the pcs_legacy_customers_staging table, this view,
-- actions/admin/pcs-migration.ts, the /admin/migration/pcs-customers
-- page) is SUPERSEDED by the D1 faithful port (runbook
-- docs/runbook/pcs-data-migration.md §8 — D1 replaces it with the
-- 117-table tb_* load). Fully removing that dead feature is a separate
-- เดฟ decision; THIS migration only closes the security finding.
-- ════════════════════════════════════════════════════════════

alter view if exists public.v_pcs_migration_status set (security_invoker = on);


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║ 0089_disbursement_kind_extend.sql                              ║
-- ╚══════════════════════════════════════════════════════════════════╝
-- ════════════════════════════════════════════════════════════
-- 0089 · container_disbursements.kind — add 'container_lease'
-- ════════════════════════════════════════════════════════════
-- D1 Phase-B sidebar fidelity audit Wave-A
-- (docs/research/sidebar-fidelity-audit/02-wallet-withdrawal-pattern.md
--  §3 + §5.1c) — the legacy ค่าตู้สินค้า ("container cost") sidebar
-- item points at /admin/accounting/disbursements?kind=container, but the
-- CHECK enum on container_disbursements.kind (migration 0069 lines
-- 139-147) does NOT include 'container' (or 'container_lease'), so the
-- query returns 0 rows even when ค่าตู้ AP exists. Staff click the
-- sidebar badge → land on an empty list → workflow breaks.
--
-- "ค่าตู้" semantically ≠ 'trucking' (trucking is line-haul cost; the
-- container lease/rental fee is a separate spend bucket the carrier or
-- equipment vendor charges) — so this migration adds 'container_lease'
-- as its own enum value, additive + non-destructive.
--
-- The companion ?kind=thai-freight sidebar item (audit §3 row 86) is
-- INTENTIONALLY not added — the audit recommends rewiring its sidebar
-- href to ?kind=trucking (already in the enum) since 'trucking' already
-- means "domestic THB trucking (TH-side)" per the 0069 comment. The
-- href rewire is Agent-1's scope (lib/admin/sidebar-menu.ts).
--
-- ⚠️  COORDINATION NOTE — numbered 0089, NOT 0088
-- Wave-A originally drafted as '0088' but pre-emptively bumped to '0089'
-- to reserve the 0088 slot for เดฟ's planned Wave-2
-- '0088_pcs_profiles_backfill' (per docs/research/wave-1-fidelity/
-- _SYNTHESIS.md §8 — the higher-stakes 8,892-ghost-customer fix).
-- This migration is idempotent + has no forward dependency, so it's
-- safely renumberable if the order ever needs to shift again.
--
-- ── Idempotency ─────────────────────────────────────────────
-- DROP-then-recreate the unnamed inline constraint. Postgres auto-names
-- it 'container_disbursements_kind_check' from the table+column.
-- 'drop ... if exists' makes re-runs no-ops; the new constraint is the
-- old set + 'container_lease'.
-- ════════════════════════════════════════════════════════════

alter table public.container_disbursements
  drop constraint if exists container_disbursements_kind_check;

alter table public.container_disbursements
  add constraint container_disbursements_kind_check check (kind in (
    'freight',         -- main shipping (the carrier's freight bill)
    'customs_duty',    -- import duty + VAT at clearance
    'handling',        -- THC, port handling, warehouse-in/out fees
    'fuel',            -- standalone fuel surcharge (when not baked into freight)
    'storage',         -- ค่าเช่า / demurrage / detention (slot rental at port)
    'trucking',        -- domestic THB trucking (CN-side OR TH-side)
    'container_lease', -- 🆕 ค่าตู้สินค้า — container/equipment lease fee paid to carrier
    'other'            -- everything else; free-text note required
  ));

comment on constraint container_disbursements_kind_check
  on public.container_disbursements is
  'AP outflow categories. ''container_lease'' added 0089 to support the legacy ค่าตู้สินค้า sidebar bucket (separate from ''trucking'' which is line-haul; lease is the container-rental spend).';


