-- 0199_admin_code_scheme_ad.sql
-- Owner directive (2026-06-22): SEPARATE the admin code from the customer PR
-- pool — "เอาเลข PR ของฝั่ง admin แยกออกจากฝั่งลูกค้า · กำหนดใหม่เลย".
--
-- This REVERSES the 0184 "staff share the PR pool" decision. Staff now get
-- their OWN scheme `AD###` (AD001, AD002, …) minted from a SEPARATE atomic
-- lowest-vacant counter, so admins never touch the customer PR sequence and
-- customer PR codes stay clean + contiguous.
--
-- The at-insert staff signal is `employee_code` (non-null, non-empty) — set by
-- adminCreateNew (real code 690xxx or a STAFF-/LGCY- placeholder) + the legacy
-- admin bridge; customers always have employee_code = NULL. This is the same
-- bulletproof gate 0174 used (admins-table linkage doesn't exist yet at BEFORE
-- INSERT, so employee_code is the only reliable at-insert signal).
--
-- The CUSTOMER PR path below is BYTE-IDENTICAL to 0184 (advisory lock +
-- cross-table lowest-vacant over profiles + tb_users + UNIQUE index) — only the
-- staff branch is new. The existing 22 staff that currently hold interspersed PR
-- codes are re-coded to AD### (+ their few references cascaded) by
-- scripts/recode-staff-to-ad-2026-06-22.mjs (dry-run + backup first). After that
-- backfill the trigger's lowest-vacant AD scan continues from AD023.
--
-- Safe to apply ahead of the data backfill: it only changes how a NULL
-- member_code is filled at INSERT for a STAFF row. No existing row is touched.

create or replace function public.generate_member_code()
returns trigger
language plpgsql
as $function$
declare
  v_max_n integer;
  v_n     integer;
begin
  -- Explicit member_code provided → respect it (unchanged from 0114).
  if new.member_code is not null then return new; end if;

  -- ── STAFF → AD#### scheme (owner 2026-06-22) ───────────────────────────
  -- A staff row is signalled by a non-empty employee_code (customers = NULL).
  -- Mint from a SEPARATE atomic lowest-vacant counter over AD-prefixed codes,
  -- under its OWN advisory lock, so admins never enter the customer PR pool.
  if new.employee_code is not null and new.employee_code <> '' then
    perform pg_advisory_xact_lock(hashtext('public.profiles.admin_code'));

    select coalesce(
      (select max((substring(member_code from 3))::int)
         from public.profiles where member_code ~ '^AD[0-9]+$'), 0)
    into v_max_n;

    select min(g) into v_n
    from generate_series(1, v_max_n + 1) as g
    where g not in (
      select (substring(member_code from 3))::int
        from public.profiles where member_code ~ '^AD[0-9]+$'
    );

    new.member_code := 'AD' || lpad(v_n::text, 3, '0');
    return new;
  end if;

  -- ── CUSTOMER → PR shared pool (BYTE-IDENTICAL to 0184) ─────────────────
  perform pg_advisory_xact_lock(hashtext('public.profiles.member_code'));

  select greatest(
    coalesce((select max((substring(member_code from 3))::int)
              from public.profiles where member_code ~ '^PR[0-9]+$'), 0),
    coalesce((select max((substring("userID" from 3))::int)
              from public.tb_users where "userID" ~ '^PR[0-9]+$'), 0)
  ) into v_max_n;

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
$function$;
