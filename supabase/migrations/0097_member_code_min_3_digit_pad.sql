-- ════════════════════════════════════════════════════════════
-- 0097 · PR<n> code — baseline "PR + min 3 digits" + cascade backfill
-- ════════════════════════════════════════════════════════════
-- Live state after 0096: trigger picks lowest-vacant integer; first
-- prod test signup got `PR10`. Owner verdict (เดฟ 2026-05-23 ค่ำ):
--   "เลขลูกค้า ต้องยืนพื้น โครงสร้างตัวเลขที่ 3 ตัวไม่ใช่หรอ
--    เช่น PR004 , PR123 , PR9845 , PR22397"
-- → format rule: `PR` + zero-padded integer with **minimum 3 digits**.
--    Smaller-than-100 → pad (PR1→PR004 wait actually PR1→PR001).
--    100-999 → already 3 digits, no pad (PR123 stays).
--    1000+ → length-as-needed (PR9845, PR22397 unchanged).
--   Equivalent: `'PR' || lpad(n::text, 3, '0')`.
--
-- This migration does THREE things, atomically (single migration tx):
--
--   1. REPLACE `generate_member_code()` to emit min-3-digit padded
--      codes, with NUMERIC dedup (PR10 in DB collides with new PR010
--      candidate because both extract to integer 10).
--
--   2. BACKFILL `public.profiles.member_code` PR1..PR99 → PR001..PR099.
--      Small table; covers the one collision-victim signup that landed
--      on PR10 today plus any pre-migration test profiles.
--
--   3. BACKFILL the legacy `tb_*` PR<n> userid space across EVERY
--      varchar column named `userid` / `whuserid` / `subuserid` in
--      schema `public` — auto-discovered via information_schema. This
--      catches the canonical `tb_users.userid` plus the ~40 tables
--      that key on userid as a plain string (no FK cascade exists in
--      the legacy MySQL schema, so we walk the catalog). Only rows
--      with the bare-PR<n> shape and <3 digits are touched; idempotent.
--
-- ── Why the cascade is safe ───────────────────────────────────────
-- · All affected columns are `character varying(N)` with N ≥ 10 —
--   padding bumps "PR1" (3 chars) → "PR001" (5 chars), still fits.
-- · Legacy MySQL had no FK constraints on userid (verified per 0083
--   header comment + 0081/0082), so an UPDATE doesn't auto-cascade —
--   we walk the catalog explicitly instead.
-- · No UNIQUE constraint on `tb_users.userid` either, but values ARE
--   unique in practice (per 0083 comment). Padding can only collide
--   if the legacy DB held two rows differing only by zero-prefix
--   (e.g. both 'PR1' and 'PR01') — the PHP source never generated
--   that shape (bare integers throughout). Pre-flight check below
--   aborts if it surfaces.
-- · Run inside the migration transaction → all 40+ UPDATEs either
--   all commit or all rollback. No partial-state risk.
--
-- ── ⚠️ Operator note (เดฟ) ─────────────────────────────────────────
-- · ~50-90 legacy customers had PR1..PR99 codes. Their `userid` will
--   change in the customer-visible portal AND every referencing tb_*
--   row. If any CS staff or recent customer screenshot quoted a
--   2-digit PR-code (e.g. "PR55"), they'll need to be told the new
--   form is "PR055". (The 4 collision-renames from 0095 — PR10900..
--   PR10903 — are NOT touched; they already have 5 digits.)
-- · Backups are nightly per Supabase Pro; if anything regresses on a
--   prod query that compared a bare PR-code literally, the
--   yzljakczhwrpbxflnmco snapshot from before this paste is the
--   recovery handle.
-- · Apply via Supabase Dashboard SQL Editor (idempotent + atomic).
-- ════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1) Pre-flight: would padding create collisions?
-- ──────────────────────────────────────────────────────────────────
-- Scan tb_users + profiles for any pair where the bare integer part
-- matches modulo zero-prefix (e.g. 'PR1' AND 'PR01' co-existing).
-- The legacy PHP didn't generate zero-prefix codes, so this should
-- return zero rows. If it doesn't, abort — manual reconcile needed.
do $$
declare
  dupe_count int;
begin
  select count(*) into dupe_count from (
    select (substring(member_code from 3))::int as n, count(*) as c
    from public.profiles
    where member_code ~ '^PR[0-9]+$'
    group by 1 having count(*) > 1
  ) as t;
  if dupe_count > 0 then
    raise exception '0097 pre-flight: % numeric collisions in profiles.member_code — cannot pad without dedupe', dupe_count;
  end if;

  select count(*) into dupe_count from (
    select (substring(userid from 3))::int as n, count(*) as c
    from public.tb_users
    where userid ~ '^PR[0-9]+$'
    group by 1 having count(*) > 1
  ) as t;
  if dupe_count > 0 then
    raise exception '0097 pre-flight: % numeric collisions in tb_users.userid — cannot pad without dedupe', dupe_count;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────
-- 2) Replace generate_member_code() — lpad + numeric dedup
-- ──────────────────────────────────────────────────────────────────
-- NUMERIC dedup: the NOT IN check compares integer values, not
-- strings. So 'PR10' in DB and a freshly-generated 'PR010' both
-- extract to numeric 10 — they DO collide semantically (no duplicate
-- customer with the same number even though string forms differ).
-- This guards the brief window during/after backfill where mixed
-- forms might coexist if anything was missed.

create or replace function public.generate_member_code() returns trigger
language plpgsql
as $$
declare
  v_max_n integer;
  v_n     integer;
begin
  if new.member_code is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('public.profiles.member_code'));

  -- Bound the scan: max numeric PR<n> across BOTH tables.
  select greatest(
    coalesce((select max((substring(member_code from 3))::int)
              from public.profiles
              where member_code ~ '^PR[0-9]+$'), 0),
    coalesce((select max((substring(userid from 3))::int)
              from public.tb_users
              where userid ~ '^PR[0-9]+$'), 0)
  ) into v_max_n;

  -- Lowest unused NUMERIC slot in [1, max+1] across BOTH tables.
  -- generate_series caps at v_max_n+1; the NOT IN compares integers
  -- so any string form of the same number (PR10 / PR010 / PR0010)
  -- counts as occupied.
  select min(g)
  into v_n
  from generate_series(1, v_max_n + 1) as g
  where g not in (
    select (substring(member_code from 3))::int
      from public.profiles
     where member_code ~ '^PR[0-9]+$'
  )
  and g not in (
    select (substring(userid from 3))::int
      from public.tb_users
     where userid ~ '^PR[0-9]+$'
  );

  -- Format: PR + min-3-digit zero-pad. lpad('123',3,'0')='123' (no-op),
  -- lpad('10',3,'0')='010', lpad('9845',3,'0')='9845' (no truncation).
  new.member_code := 'PR' || lpad(v_n::text, 3, '0');
  return new;
end;
$$;

comment on function public.generate_member_code() is
  'Pacred PR member-code generator (migration 0097) — lowest-vacant '
  'NUMERIC scan across both profiles + tb_users; emits PR + min-3-digit '
  'zero-padded integer (PR001 / PR055 / PR123 / PR9845). Supersedes '
  '0090/0095/0096.';

-- ──────────────────────────────────────────────────────────────────
-- 3) Backfill profiles.member_code → padded format
-- ──────────────────────────────────────────────────────────────────
-- WHERE clause ensures idempotency: only rows whose current value
-- differs from the padded form get touched.
update public.profiles
   set member_code = 'PR' || lpad((substring(member_code from 3))::int::text, 3, '0')
 where member_code ~ '^PR[0-9]+$'
   and member_code <> 'PR' || lpad((substring(member_code from 3))::int::text, 3, '0');

-- ──────────────────────────────────────────────────────────────────
-- 4) Backfill EVERY tb_* userid column to padded format
-- ──────────────────────────────────────────────────────────────────
-- Walks information_schema.columns for any character-typed column
-- named userid / whuserid / subuserid in schema public. For each
-- found column, runs the same idempotent update. Atomic with the
-- rest of this migration (single tx).
do $$
declare
  rec       record;
  upd_sql   text;
  row_cnt   bigint;
  total_cnt bigint := 0;
begin
  for rec in
    select c.table_schema, c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables  t
        on t.table_schema = c.table_schema
       and t.table_name   = c.table_name
     where c.table_schema  = 'public'
       and c.column_name  in ('userid', 'whuserid', 'subuserid')
       and c.data_type     like '%character%'
       and t.table_type    = 'BASE TABLE'
  loop
    upd_sql := format(
      $upd$ update %I.%I
              set %I = 'PR' || lpad((substring(%I from 3))::int::text, 3, '0')
            where %I ~ '^PR[0-9]+$'
              and %I <> 'PR' || lpad((substring(%I from 3))::int::text, 3, '0')
      $upd$,
      rec.table_schema, rec.table_name,
      rec.column_name, rec.column_name,
      rec.column_name,
      rec.column_name, rec.column_name
    );
    execute upd_sql;
    get diagnostics row_cnt = row_count;
    if row_cnt > 0 then
      raise notice '0097 backfill: %.% — % row(s) padded', rec.table_name, rec.column_name, row_cnt;
      total_cnt := total_cnt + row_cnt;
    end if;
  end loop;
  raise notice '0097 backfill complete: % total row(s) across all tb_* userid columns', total_cnt;
end $$;

-- ──────────────────────────────────────────────────────────────────
-- 5) Sanity-check the post-backfill state
-- ──────────────────────────────────────────────────────────────────
do $$
declare
  bare_profiles int;
  bare_users    int;
  fn_def        text;
begin
  -- No remaining bare PR<n> in the two canonical tables
  select count(*) into bare_profiles
    from public.profiles
   where member_code ~ '^PR[0-9]{1,2}$';
  if bare_profiles > 0 then
    raise warning 'POST-MIGRATION: % profiles rows still <3-digit PR codes', bare_profiles;
  end if;

  select count(*) into bare_users
    from public.tb_users
   where userid ~ '^PR[0-9]{1,2}$';
  if bare_users > 0 then
    raise warning 'POST-MIGRATION: % tb_users rows still <3-digit PR codes', bare_users;
  end if;

  -- Function reflects the new shape
  select pg_get_functiondef('public.generate_member_code()'::regprocedure)
    into fn_def;
  if fn_def !~ 'lpad' or fn_def !~ 'generate_series' then
    raise warning 'POST-MIGRATION: generate_member_code() body does not look like lpad+lowest-vacant';
  end if;
end $$;
