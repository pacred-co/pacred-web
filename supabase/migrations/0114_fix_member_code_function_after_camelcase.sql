-- ============================================================
-- 0114 - Fix generate_member_code() after camelCase pilot
-- ============================================================
-- The camelCase pilot (0113) renamed tb_users.userid -> tb_users."userID".
-- PostgreSQL RENAME COLUMN updates indexes/FKs/views automatically,
-- but it does NOT re-parse PL/pgSQL function bodies stored as text.
--
-- The generate_member_code() trigger fires on every profiles INSERT
-- (i.e. every customer signup). The latest live definition is in
-- migration 0103; both queries on tb_users used the lowercase `userid`
-- identifier. After the rename, those queries throw
--   ERROR:  column "userid" does not exist
-- which surfaces in the Pacred client as the opaque
-- `{ ok: false, error: "profile_failed" }` -> "บันทึกโปรไฟล์ไม่สำเร็จ".
-- Both /register tabs (personal + juristic) broke even with OTP_BYPASS=true.
--
-- Fix: re-declare the function with the new quoted "userID" identifier.
-- Logic + behavior preserved 1:1 from 0103 - this is purely a name swap.
--
-- Same column gets renamed back to lowercase if 0113 is ever reverted, so
-- this 0114 stays correct only while 0113 is applied. If reverting 0113,
-- also revert this (replace "userID" back to userid in the function body).
--
-- Also handles next_pr_member_code() from 0083 - same single-table scan,
-- same fix. The helper isn't currently called by any trigger but exists
-- in the public schema for ad-hoc admin use.
--
-- Idempotent: CREATE OR REPLACE FUNCTION is idempotent by design.
-- ============================================================

-- 1) The active trigger - latest version from 0103, with userid -> "userID"
create or replace function public.generate_member_code() returns trigger
language plpgsql
as $fn$
declare
  v_max_n integer;
  v_n     integer;
begin
  if new.member_code is not null then return new; end if;

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
$fn$;

comment on function public.generate_member_code() is
  'Pacred PR member-code generator (0114) - lowest-vacant scan across profiles + tb_users. Same logic as 0103, with tb_users."userID" quoted to match the camelCase column post-0113.';

-- 2) The helper function (from 0083) - admin convenience, not on hot path
create or replace function public.next_pr_member_code() returns text
language sql
stable
as $fn$
  select 'PR' || coalesce(
    (select min(g)::text
     from generate_series(1,
       coalesce(
         (select max((substring("userID" from 3))::integer)
            from public.tb_users
           where "userID" ~ '^PR[0-9]+$'), 0) + 1) as g
     where ('PR' || g) not in (select "userID" from public.tb_users)
    ), '1');
$fn$;

comment on function public.next_pr_member_code() is
  'Returns the lowest vacant PR<n> in tb_users. Helper - not on the signup hot path (generate_member_code() is the actual trigger). 0114 quotes "userID" to match the camelCase column post-0113.';
