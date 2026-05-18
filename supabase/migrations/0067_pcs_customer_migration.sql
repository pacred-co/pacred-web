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
