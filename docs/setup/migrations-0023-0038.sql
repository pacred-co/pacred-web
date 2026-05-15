-- ============================================================
-- Pacred -- combined migrations 0023 -> 0038
-- Generated 2026-05-16
-- ============================================================
-- HOW TO APPLY (Poom / Dave):
--   1. Supabase Dashboard -> SQL Editor -> New query
--   2. Paste this whole file -> Run
--   3. "already exists" / "duplicate" notices are safe to ignore --
--      every statement is idempotent (create ... if not exists,
--      drop+recreate policies/constraints/triggers, add column if
--      not exists, on conflict do nothing). Safe to re-run.
--
-- PREREQUISITES: schema.sql + migrations 0002-0022 must already be
-- applied. These 16 build on earlier tables (otp_codes, notifications,
-- profiles, admin_contact_extras, forwarders, service_orders,
-- containers, admins, wallet_transactions). None of 0023-0038 depend
-- on 0022 (contact_messages) specifically.
--
-- COVERS:
--   0023  otp_codes.purpose += 'change_phone'
--   0024  notifications.reference_type += 'contact_message'
--   0025  profiles.notify_channels.daily_digest flag
--   0026  notifications.category += 'sales_digest'
--   0027  admin_contact_extras.contract_end_date
--   0028  forwarder_driver table
--   0029  csv_imports table + csv-imports storage bucket
--   0030  hs_codes + container_hs_lines + seed
--   0031  hs_codes RLS -> authenticated-only read
--   0032  csv_imports.started_at + stale-import recovery
--   0033  cargo_containers + cargo_shipments + tracking + history
--   0034  tax_invoices + lines + serial generator
--   0035  tax-invoices storage bucket
--   0036  carriers table + seed
--   0037  cargo_shipments.received_box_count
--   0038  forwarder_cost_adjustments table
--
-- VERIFY AFTER RUNNING (paste in SQL Editor) -- expect 13 rows:
--   select table_name from information_schema.tables
--    where table_schema='public'
--      and table_name in ('forwarder_driver','csv_imports','hs_codes',
--        'container_hs_lines','cargo_containers','cargo_shipments',
--        'cargo_shipment_tracking','cargo_container_status_history',
--        'tax_invoices','tax_invoice_lines','tax_invoice_seq',
--        'carriers','forwarder_cost_adjustments')
--    order by table_name;
-- ============================================================

-- ============================================================
-- >>> 0023_otp_purpose_change_phone.sql
-- ============================================================
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


-- ============================================================
-- >>> 0024_notification_ref_contact_message.sql
-- ============================================================
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


-- ============================================================
-- >>> 0025_profiles_notify_channels_daily_digest.sql
-- ============================================================
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


-- ============================================================
-- >>> 0026_notification_category_sales_digest.sql
-- ============================================================
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


-- ============================================================
-- >>> 0027_admin_contact_extras_contract_end_date.sql
-- ============================================================
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


-- ============================================================
-- >>> 0028_forwarder_driver.sql
-- ============================================================
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


-- ============================================================
-- >>> 0029_csv_imports.sql
-- ============================================================
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


-- ============================================================
-- >>> 0030_hs_codes_rates.sql
-- ============================================================
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


-- ============================================================
-- >>> 0031_hs_codes_rls_authenticated.sql
-- ============================================================
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


-- ============================================================
-- >>> 0032_csv_imports_started_at.sql
-- ============================================================
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


-- ============================================================
-- >>> 0033_containers.sql
-- ============================================================
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


-- ============================================================
-- >>> 0034_tax_invoices.sql
-- ============================================================
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


-- ============================================================
-- >>> 0035_tax_invoices_storage.sql
-- ============================================================
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


-- ============================================================
-- >>> 0036_carriers.sql
-- ============================================================
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


-- ============================================================
-- >>> 0037_cargo_shipments_received_qty.sql
-- ============================================================
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


-- ============================================================
-- >>> 0038_forwarder_cost_adjustments.sql
-- ============================================================
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

