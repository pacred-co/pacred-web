-- ════════════════════════════════════════════════════════════
-- 0110 · admin_contact_extras — legacy PCS bridge columns
-- ════════════════════════════════════════════════════════════
-- Background — Wave 22 tb_admin → admins consolidation
--
-- ภูม decided (2026-05-27) to NOT auto-migrate the 13 legacy
-- `tb_admin` rows. Instead ภูม will manually recreate each admin
-- through the Pacred `/admin/admins/new` UI form (Phase 3 of this
-- wave) — fresh Pacred auth.users + profile + admins-role-grant per
-- person, with full control over which role each admin gets.
--
-- This migration adds the SMALL set of columns the new admin form +
-- legacy linkage need beyond what `admin_contact_extras` already
-- carries (display_name, direct_phone, department, section, nickname,
-- company, employee_type, work_email, work_phone, hired_at,
-- suspended_at, contract_end_date).
--
-- Wave 21 P2 survey: docs/research/tb-admin-merge-intel-2026-05-27.md
-- Code audit:        docs/research/tb-admin-code-audit-2026-05-27.md
--
-- ── Why these 5 columns ──
--   legacy_admin_id    — the `admin_<nickname>` string from
--                        tb_admin.adminID. CANONICAL bridge so
--                        `tb_users.adminidsale` (which stores those
--                        strings on ~8,890 customer rows) can resolve
--                        to the new Pacred admin via JOIN
--                        admin_contact_extras ON legacy_admin_id.
--                        UNIQUE partial index — null allowed for
--                        Pacred-native admins (4 currently exist).
--
--   ended_at           — permanent leave date (legacy `endDate`).
--                        `suspended_at` already exists for TEMPORARY
--                        pause (`adminTMP='1'`); `ended_at` is for
--                        full retirement / resignation (legacy
--                        `adminDel='1'`). Keep both distinct so HR
--                        reports can split the two.
--
--   legacy_admin_type  — raw `tb_admin.adminType` ('1'-'7'). Maps to
--                        existing `employee_type` enum but the legacy
--                        VARCHAR(1) value is preserved as audit-trail
--                        for ports that need exact fidelity.
--
--   legacy_admin_status — raw `tb_admin.adminStatus`. NOT the same as
--                        RBAC role; legacy comment is "สิทธิ์การ
--                        เข้าถึงข้อมูล" — preserved for traceability.
--
--   admin_note         — internal HR free-text note (Pacred-side,
--                        not in legacy). For ภูม to record context
--                        when manually recreating an admin
--                        ("ลาออกแล้วกลับมาใหม่ 2026-04" etc).
--
-- ── How to apply ──────────────────────────────────────────────
-- IF NOT EXISTS = idempotent (safe to re-run). Plain ALTER TABLE
-- inside the Supabase migration runner's transaction — adds a
-- minimal AccessExclusiveLock for ~50ms on `admin_contact_extras`
-- (the table is 0 rows on prod → instant).
--
-- Existing 5 columns of `admins` are UNTOUCHED — `is_admin()`
-- SECURITY DEFINER + RLS policies across 20+ tables keep working.
-- The 4 native super-admins are unaffected.

alter table public.admin_contact_extras
  add column if not exists legacy_admin_id     text,
  add column if not exists ended_at            timestamptz,
  add column if not exists legacy_admin_type   text,
  add column if not exists legacy_admin_status text,
  add column if not exists admin_note          text;

-- Bridge index — every `tb_users.adminidsale` lookup hits this.
-- Partial index keeps it tiny (only legacy-migrated admins · the
-- 4 native + any future fresh hires have NULL here).
create unique index if not exists admin_contact_extras_legacy_admin_id_uidx
  on public.admin_contact_extras(legacy_admin_id)
  where legacy_admin_id is not null;

-- Column comments — searchable from any SQL client.
comment on column public.admin_contact_extras.legacy_admin_id is
  'Legacy PCS tb_admin.adminID string (e.g. admin_pop, admin_nat). Set when ภูม manually recreates a PCS admin through /admin/admins/new. Used by tb_users.adminidsale JOIN to keep customer→rep linkage working during the tb_admin → admins transition.';

comment on column public.admin_contact_extras.ended_at is
  'Permanent leave date (legacy tb_admin.endDate). Complementary to suspended_at (= temporary pause).';

comment on column public.admin_contact_extras.legacy_admin_type is
  'Raw tb_admin.adminType value (1-7: พนักงานประจำ/ทดลองงาน/รายเดือน/รายวัน/etc). Pacred uses employee_type enum but this carries the legacy code for audit-trail fidelity.';

comment on column public.admin_contact_extras.legacy_admin_status is
  'Raw tb_admin.adminStatus value. Legacy "สิทธิ์การเข้าถึงข้อมูล" — distinct from Pacred RBAC role (which lives in admins.role).';

comment on column public.admin_contact_extras.admin_note is
  'Free-text internal HR note (Pacred-side, no legacy equivalent). For ภูม to record context per admin — re-hire dates, leave reasons, etc.';

-- Make the planner aware of the new columns immediately (analyze is
-- ~instant on the 0-row table).
analyze public.admin_contact_extras;
