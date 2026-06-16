-- 0184_staff_share_pr_pool.sql
-- Owner directive (2026-06-15): staff get a PR member_code TOO, SHARING the
-- customer number pool — "ใช้เลขร่วมกับฝั่งลูกค้าได้ แต่ห้ามวิ่งชนกัน".
--
-- This SUPERSEDES the 0174 staff-skip (which left staff member_code NULL). The
-- customer path was already collision-proof: a transaction advisory lock
-- serialises concurrent inserts, the next code is the LOWEST VACANT slot across
-- BOTH public.profiles AND public.tb_users, and profiles_member_code_key is a
-- UNIQUE index. By removing the employee_code early-return, staff fall into that
-- SAME atomic path → customers + staff draw from one shared sequence and can
-- never collide (lock + cross-table lowest-vacant + UNIQUE).
--
-- Safe to apply ahead of any code change: it only changes how a NULL member_code
-- is filled at INSERT. Existing staff (member_code NULL) are backfilled by
-- scripts/backfill-staff-pr-2026-06-15.mjs (dry-run first, same advisory lock).
--
-- Verified 2026-06-15: no code relies on staff having a NULL member_code
-- (staff-vs-customer is decided by the admins table / employee_code /
-- requireAdmin, never by member_code being NULL).

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

  -- 2026-06-15 (owner): staff now SHARE the customer PR pool — the 0174
  -- employee_code early-return is REMOVED, so every profile (customer OR staff)
  -- draws the next code from the SAME atomic lowest-vacant counter below. The
  -- lock + cross-table lowest-vacant + the UNIQUE index guarantee no collision
  -- across customers + staff.

  -- Serialise concurrent inserts so two near-simultaneous signups never grab
  -- the same lowest-vacant slot.
  perform pg_advisory_xact_lock(hashtext('public.profiles.member_code'));

  select greatest(
    coalesce((select max((substring(member_code from 3))::int)
              from public.profiles where member_code ~ '^PR[0-9]+$'), 0),
    coalesce((select max((substring("userID" from 3))::int)
              from public.tb_users where "userID" ~ '^PR[0-9]+$'), 0)
  ) into v_max_n;

  -- Lowest vacant slot across BOTH tables (legacy customers + pacred-web + staff).
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
