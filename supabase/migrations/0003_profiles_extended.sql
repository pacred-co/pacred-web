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
