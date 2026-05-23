-- ════════════════════════════════════════════════════════════
-- 0099 · Resolve numeric-pad collisions (V2) + pad cascade — temp-table safe
-- ════════════════════════════════════════════════════════════
-- 0098 failed mid-resolve with:
--   ERROR: 23505: duplicate key value violates unique constraint
--          "profiles_member_code_key"
--   DETAIL: Key (member_code)=(PR111) already exists.
--
-- Root cause: 0098's walk-forward used a nested EXISTS subquery with
-- `(substring(...))::int = next_n` + a regex filter. Postgres' planner
-- can re-order AND-chain predicates; if the cast-equality is evaluated
-- before the regex narrowing (likely on small tables), rows that don't
-- match the regex still get cast — and any that throw silently get
-- dropped, so collisions hide. Cheaper fix: don't rely on per-iteration
-- EXISTS at all. Materialize the used-slots set ONCE in a temp table,
-- and pick the next slot from there.
--
-- 0099 is the corrected one-paste replacement for 0098. Same five
-- functional steps (resolve → re-verify → replace trigger → pad
-- profiles → pad all tb_* userid columns), just with the resolver
-- swapped for the temp-table algorithm.
--
-- Owner rule (unchanged from 0098):
--   "ห้ามชนกัน เอาคนที่เข้ามาทีหลังเขยิบออกไป เอาของเก่าเดิมคงไว้"
--   → keep oldest (created_at), push newer to fresh high slot.
--
-- Apply via Supabase Dashboard SQL Editor. Idempotent + atomic.
-- ════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1) Materialize the used-numeric set into a temp table
-- ──────────────────────────────────────────────────────────────────
-- Single temp table holding EVERY PR<n> numeric slot currently
-- occupied in either profiles or tb_users. Subsequent lookups are
-- straight `where n = next_n` on a primary-keyed integer — fast +
-- planner-friendly.
--
-- Why a temp table not a CTE: the resolver does N renumbers and each
-- one needs to see the updated used-set (incl. just-assigned slots).
-- Temp tables persist across statements in the same session/tx.
create temporary table if not exists _0099_used_slots (
  n int primary key
) on commit drop;

insert into _0099_used_slots(n)
select (substring(userid from 3))::int
  from public.tb_users
 where userid ~ '^PR[0-9]+$'
on conflict do nothing;

insert into _0099_used_slots(n)
select (substring(member_code from 3))::int
  from public.profiles
 where member_code ~ '^PR[0-9]+$'
on conflict do nothing;

-- ──────────────────────────────────────────────────────────────────
-- 2) Resolve numeric-pad collisions in profiles (using the temp set)
-- ──────────────────────────────────────────────────────────────────
do $$
declare
  rec        record;
  newer_id   uuid;
  next_n     int;
  new_code   text;
  renumbered int := 0;
begin
  -- starting point: one above the highest currently-used slot
  select coalesce(max(n), 0) + 1 into next_n from _0099_used_slots;

  -- iterate collision groups oldest-first per numeric n
  for rec in
    select
      (substring(member_code from 3))::int       as n,
      array_agg(id          order by created_at) as ids,
      array_agg(member_code order by created_at) as codes
      from public.profiles
     where member_code ~ '^PR[0-9]+$'
     group by 1
    having count(*) > 1
     order by 1
  loop
    -- ids[1] = oldest = keep; ids[2..N] = newer = renumber
    for i in 2 .. array_length(rec.ids, 1) loop
      newer_id := rec.ids[i];

      -- walk forward in the temp set until we find an unused slot
      while exists (select 1 from _0099_used_slots where n = next_n) loop
        next_n := next_n + 1;
      end loop;

      new_code := 'PR' || lpad(next_n::text, 3, '0');

      -- defensive: ensure the EXACT STRING isn't somehow in profiles
      -- already (e.g. as a string of different padding shape that the
      -- numeric set somehow missed — should never happen, but cheap
      -- to verify before paying the UNIQUE-violation cost)
      while exists (select 1 from public.profiles where member_code = new_code)
            or exists (select 1 from public.tb_users where userid = new_code) loop
        raise warning '0099 string-form clash on % — bumping next_n past', new_code;
        next_n := next_n + 1;
        new_code := 'PR' || lpad(next_n::text, 3, '0');
      end loop;

      update public.profiles set member_code = new_code where id = newer_id;
      raise notice '0099 collision-resolve: profile % (was %, numeric %) → %',
        newer_id, rec.codes[i], rec.n, new_code;

      -- mark this slot used + advance for next iteration
      insert into _0099_used_slots(n) values (next_n) on conflict do nothing;
      renumbered := renumbered + 1;
      next_n := next_n + 1;
    end loop;
  end loop;

  raise notice '0099 collision-resolve complete: % row(s) renumbered', renumbered;
end $$;

-- ──────────────────────────────────────────────────────────────────
-- 3) Re-verify no numeric collisions remain
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
    raise exception '0099 step-3 gate: still % numeric collisions in profiles after resolve — abort', dupe_count;
  end if;

  select count(*) into dupe_count from (
    select (substring(userid from 3))::int as n, count(*) as c
      from public.tb_users
     where userid ~ '^PR[0-9]+$'
     group by 1 having count(*) > 1
  ) as t;
  if dupe_count > 0 then
    raise exception '0099 step-3 gate: % numeric collisions in tb_users — manual reconcile required', dupe_count;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────
-- 4) Replace generate_member_code() — lpad + numeric dedup
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
  'Pacred PR member-code generator (migration 0099) — lowest-vacant '
  'NUMERIC scan across profiles + tb_users; emits PR + min-3-digit '
  'zero-padded integer. Supersedes 0090/0095/0096/0097/0098.';

-- ──────────────────────────────────────────────────────────────────
-- 5) Backfill profiles.member_code → padded (idempotent)
-- ──────────────────────────────────────────────────────────────────
update public.profiles
   set member_code = 'PR' || lpad((substring(member_code from 3))::int::text, 3, '0')
 where member_code ~ '^PR[0-9]+$'
   and member_code <> 'PR' || lpad((substring(member_code from 3))::int::text, 3, '0');

-- ──────────────────────────────────────────────────────────────────
-- 6) Backfill EVERY tb_* userid column to padded format
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
      raise notice '0099 backfill: %.% — % row(s) padded', rec.table_name, rec.column_name, row_cnt;
      total_cnt := total_cnt + row_cnt;
    end if;
  end loop;
  raise notice '0099 backfill complete: % total row(s) across all tb_* userid columns', total_cnt;
end $$;

-- ──────────────────────────────────────────────────────────────────
-- 7) Post-state sanity
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
