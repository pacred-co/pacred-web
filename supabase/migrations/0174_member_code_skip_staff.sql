-- ============================================================
-- 0174 — generate_member_code(): SKIP staff (keep member_code NULL)
-- ============================================================
-- Problem: staff/admin profiles are inserted with member_code NULL, so the
-- BEFORE INSERT trigger generate_member_code() (live body = migration 0114)
-- pads them a CUSTOMER PR code from the shared pool
-- (profiles.member_code ∪ tb_users."userID"). Observed: 18 staff profiles
-- holding PR018..PR132, polluting the customer numbering range. The admins
-- table is linked only AFTER the profile insert, so it is NOT visible to a
-- BEFORE INSERT trigger.
--
-- The only signal available at BEFORE INSERT is the NEW row's own columns.
-- Staff are inserted WITH employee_code (690xxx or a STAFF-/LGCY- placeholder);
-- customers are not. So we gate on NEW.employee_code: if it is set (non-null +
-- non-empty), leave member_code NULL and return early — staff stay out of the
-- customer range.
--
-- The CUSTOMER path is preserved 1:1 from migration 0114 (the live version):
--   * the NEW.member_code IS NOT NULL short-circuit (explicit code wins),
--   * the pg_advisory_xact_lock that serialises concurrent signups,
--   * the cross-table greatest(max) + lowest-vacant generate_series scan
--     across profiles.member_code and tb_users."userID",
--   * the 'PR' || lpad(n,3,'0') padding.
-- The ONLY new behavior is the staff early-return guard.
--
-- Idempotent: CREATE OR REPLACE FUNCTION by design. employee_code is a text
-- column on public.profiles (migration 0144), present on the NEW row at
-- BEFORE INSERT. Must be applied AFTER 0114 and must remain the LAST
-- definition of this function.
-- NOTE: this prevents NEW occurrences only — the 18 already-mis-assigned staff
-- are freed by scripts/free-staff-member-codes-2026-06-10.mjs (one-time data fix).
-- ============================================================

create or replace function public.generate_member_code() returns trigger
language plpgsql
as $fn$
declare
  v_max_n integer;
  v_n     integer;
begin
  -- Explicit member_code provided → respect it (unchanged from 0114).
  if new.member_code is not null then return new; end if;

  -- NEW (0174): staff are inserted WITH a non-empty employee_code; customers
  -- are not. If employee_code is set, this is a staff/admin profile → do NOT
  -- assign a customer PR code. Leave member_code NULL so staff stay out of the
  -- customer numbering. (admins-table linkage is created in a later step and
  -- is not available at BEFORE INSERT, so employee_code is the only at-insert
  -- staff signal.) The <> '' check routes an empty-string write to the
  -- customer path so a blank employee_code never falsely flags as staff.
  if new.employee_code is not null and new.employee_code <> '' then
    return new;
  end if;

  -- ---- CUSTOMER PATH (preserved 1:1 from 0114) ----------------------------
  -- Serialise concurrent inserts so two near-simultaneous signups never grab
  -- the same lowest-vacant slot.
  perform pg_advisory_xact_lock(hashtext('public.profiles.member_code'));

  select greatest(
    coalesce((select max((substring(member_code from 3))::int)
              from public.profiles where member_code ~ '^PR[0-9]+$'), 0),
    coalesce((select max((substring("userID" from 3))::int)
              from public.tb_users where "userID" ~ '^PR[0-9]+$'), 0)
  ) into v_max_n;

  -- Lowest vacant slot across BOTH tables (legacy customers + pacred-web).
  select min(g) into v_n
  from generate_series(1, v_max_n + 1) as g
  where g not in (
    select (substring(member_code from 3))::int
      from public.profiles where member_code ~ '^PR[0-9]+$'
  )
  and g not in (
    select (substring("userID" from 3))::int
      from public.tb_users where "userID" ~ '^PR[0-9]+$'
  );

  new.member_code := 'PR' || lpad(v_n::text, 3, '0');
  return new;
end;
$fn$;

comment on function public.generate_member_code() is
  'Pacred PR member-code generator (0174) — same lowest-vacant scan across profiles + tb_users as 0114, with one added guard: profiles inserted WITH a non-empty employee_code (staff/admin) are SKIPPED so they keep member_code NULL and never consume a customer PR slot. Customer path unchanged from 0114.';
