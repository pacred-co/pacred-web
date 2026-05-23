-- ════════════════════════════════════════════════════════════
-- 0098 · Resolve numeric-pad collisions, THEN run 0097's pad+backfill
-- ════════════════════════════════════════════════════════════
-- 2026-05-23 ค่ำ: 0097 aborted at its pre-flight check — found 7 numeric
-- collisions in `profiles.member_code` (pairs of profiles whose member_code
-- string differs only in zero-padding, e.g. `PR1` AND `PR001`, or `PR10`
-- AND `PR010`). Different *strings* so the UNIQUE constraint never
-- triggered; same *numeric value* so post-padding both would become
-- `PR001`, creating a real unique-key violation.
--
-- Owner ruling (เดฟ 2026-05-23 ค่ำ): "ห้ามชนกัน เอาคนที่เข้ามาทีหลังเขยิบออกไป
-- เอาของเก่าเดิมคงไว้" — must not collide; the older row keeps the
-- numeric slot, the newer row gets pushed to a fresh PR-code above the
-- current max.
--
-- This migration does FIVE things, atomically:
--   1. RESOLVE the collisions: for each numeric-collision group, sort
--      by created_at ASC; keep row[0] (oldest), renumber rows[1..] to
--      fresh padded PR-codes scanned above max(profiles, tb_users).
--   2. REPLACE generate_member_code() with the lpad + numeric-dedup
--      generator (same body as 0097 section 2).
--   3. BACKFILL profiles.member_code to padded format (no-op for the
--      rows already padded by step 1).
--   4. BACKFILL every public.* userid/whuserid/subuserid varchar
--      column to padded format (auto-discovered via the catalog).
--   5. SANITY check post-state.
--
-- After 0098: all PR-codes are padded to min 3 digits; the newer
-- collision victims occupy new high slots (above the pre-existing max);
-- the older originals are untouched.
--
-- ⚠️ Operator note (CS):
--   · Renumbered rows = today's brand-new signups (post-0096), some test
--     signups, possibly a handful of 2026-05-22 victims. None should
--     have customer-quoted-the-code history (too recent).
--   · The ~50-90 legacy customers with PR1..PR99 in tb_users WILL see
--     their codes pad to PR001..PR099 across the whole tb_* schema.
--     If anyone has quoted a bare 2-digit code recently, the canonical
--     form is now the padded one. Same number, just zero-prefixed.
--
-- Apply via Supabase Dashboard SQL Editor (idempotent + atomic).
-- ════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1) Resolve numeric-pad collisions in profiles
-- ──────────────────────────────────────────────────────────────────
-- For each numeric-collision group: keep the oldest row, renumber the
-- newer rows to fresh padded PR-codes scanned above the current max
-- of profiles + tb_users. We pre-pad here (rather than leaving bare)
-- so step 3's idempotent backfill is a true no-op for these rows.
do $$
declare
  rec       record;
  newer_id  uuid;
  next_n    int;
  new_code  text;
  renumbered int := 0;
begin
  -- starting point: one above the current max across both tables
  select greatest(
    coalesce((select max((substring(member_code from 3))::int)
              from public.profiles
              where member_code ~ '^PR[0-9]+$'), 0),
    coalesce((select max((substring(userid from 3))::int)
              from public.tb_users
              where userid ~ '^PR[0-9]+$'), 0)
  ) + 1 into next_n;

  for rec in
    select
      (substring(member_code from 3))::int     as n,
      array_agg(id order by created_at)        as ids,
      array_agg(member_code order by created_at) as codes
    from public.profiles
    where member_code ~ '^PR[0-9]+$'
    group by 1
    having count(*) > 1
    order by 1
  loop
    -- ids[1] = oldest = keep as-is (step 3 will pad it if needed)
    -- ids[2..N] = newer = renumber to high vacant slots
    for i in 2 .. array_length(rec.ids, 1) loop
      newer_id := rec.ids[i];

      -- walk forward to find a truly-vacant numeric (skip slots in either table)
      loop
        if not exists (
          select 1 from public.tb_users
           where userid ~ '^PR[0-9]+$'
             and (substring(userid from 3))::int = next_n
        ) and not exists (
          select 1 from public.profiles
           where member_code ~ '^PR[0-9]+$'
             and (substring(member_code from 3))::int = next_n
             and id <> newer_id
        ) then
          exit;
        end if;
        next_n := next_n + 1;
      end loop;

      new_code := 'PR' || lpad(next_n::text, 3, '0');
      update public.profiles set member_code = new_code where id = newer_id;
      raise notice '0098 collision-resolve: profile % (was %, numeric %) → %',
        newer_id, rec.codes[i], rec.n, new_code;
      renumbered := renumbered + 1;
      next_n := next_n + 1;
    end loop;
  end loop;
  raise notice '0098 collision-resolve complete: % profile row(s) renumbered to fresh codes', renumbered;
end $$;

-- ──────────────────────────────────────────────────────────────────
-- 2) Re-verify no collisions remain (sanity gate before mass-update)
-- ──────────────────────────────────────────────────────────────────
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
    raise exception '0098 step-2 gate: still % numeric collisions in profiles after resolve — abort', dupe_count;
  end if;

  select count(*) into dupe_count from (
    select (substring(userid from 3))::int as n, count(*) as c
    from public.tb_users
    where userid ~ '^PR[0-9]+$'
    group by 1 having count(*) > 1
  ) as t;
  if dupe_count > 0 then
    raise exception '0098 step-2 gate: % numeric collisions in tb_users — cannot pad without manual reconcile', dupe_count;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────
-- 3) Replace generate_member_code() — lpad + numeric dedup
-- ──────────────────────────────────────────────────────────────────
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

  select greatest(
    coalesce((select max((substring(member_code from 3))::int)
              from public.profiles
              where member_code ~ '^PR[0-9]+$'), 0),
    coalesce((select max((substring(userid from 3))::int)
              from public.tb_users
              where userid ~ '^PR[0-9]+$'), 0)
  ) into v_max_n;

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

  new.member_code := 'PR' || lpad(v_n::text, 3, '0');
  return new;
end;
$$;

comment on function public.generate_member_code() is
  'Pacred PR member-code generator (migration 0098) — lowest-vacant '
  'NUMERIC scan across profiles + tb_users; emits PR + min-3-digit '
  'zero-padded integer. Supersedes 0090/0095/0096/0097.';

-- ──────────────────────────────────────────────────────────────────
-- 4) Backfill profiles.member_code → padded format (idempotent)
-- ──────────────────────────────────────────────────────────────────
update public.profiles
   set member_code = 'PR' || lpad((substring(member_code from 3))::int::text, 3, '0')
 where member_code ~ '^PR[0-9]+$'
   and member_code <> 'PR' || lpad((substring(member_code from 3))::int::text, 3, '0');

-- ──────────────────────────────────────────────────────────────────
-- 5) Backfill EVERY tb_* userid column to padded format
-- ──────────────────────────────────────────────────────────────────
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
      raise notice '0098 backfill: %.% — % row(s) padded', rec.table_name, rec.column_name, row_cnt;
      total_cnt := total_cnt + row_cnt;
    end if;
  end loop;
  raise notice '0098 backfill complete: % total row(s) across all tb_* userid columns', total_cnt;
end $$;

-- ──────────────────────────────────────────────────────────────────
-- 6) Post-state sanity
-- ──────────────────────────────────────────────────────────────────
do $$
declare
  bare_profiles int;
  bare_users    int;
  fn_def        text;
begin
  select count(*) into bare_profiles
    from public.profiles
   where member_code ~ '^PR[0-9]{1,2}$';
  if bare_profiles > 0 then
    raise warning 'POST-MIGRATION: % profiles still <3-digit', bare_profiles;
  end if;

  select count(*) into bare_users
    from public.tb_users
   where userid ~ '^PR[0-9]{1,2}$';
  if bare_users > 0 then
    raise warning 'POST-MIGRATION: % tb_users rows still <3-digit', bare_users;
  end if;

  select pg_get_functiondef('public.generate_member_code()'::regprocedure)
    into fn_def;
  if fn_def !~ 'lpad' or fn_def !~ 'generate_series' then
    raise warning 'POST-MIGRATION: generate_member_code() body does not look like lpad+lowest-vacant';
  end if;
end $$;
