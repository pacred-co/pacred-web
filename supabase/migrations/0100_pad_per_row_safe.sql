-- ════════════════════════════════════════════════════════════
-- 0100 · Pad PR<n> codes — per-row, cross-table-aware, no-batch
-- ════════════════════════════════════════════════════════════
-- 0098 + 0099 both failed mid-resolve with UNIQUE-violations
-- (PR111, then PR109). The root cause of BOTH failures is the same
-- and goes deeper than the resolver's walk-forward bug I patched
-- in 0099: the COLLISION DETECTION itself was incomplete.
--
-- Why detection was incomplete:
--   · 0098/0099's cursor only looked at WITHIN-profiles collisions
--     (numeric n with multiple rows in profiles).
--   · But Pacred's PR<n> code space spans TWO tables:
--       profiles.member_code  (Pacred-web signups)
--       tb_users.userid       (legacy PCS customers + the legacy-bridge auth)
--   · A profile can hold PR0109 (numeric 109, padded form) while a
--     DIFFERENT customer in tb_users holds PR109 (numeric 109, bare form).
--     The cursor sees count(*)=1 for profiles → no collision detected.
--   · Then step 5's bulk-UPDATE tries to pad PR0109 → PR109, and slams
--     into the UNIQUE constraint because profiles.PR109 may also exist
--     (from another collision) — or tb_users.PR109 represents a real
--     different customer, which means the two should NOT share a code.
--
-- The robust algorithm: forget detection-then-fix. For EVERY row that
-- needs padding, process it ONE AT A TIME, and for each one ask:
--   · what's the padded target?
--   · is that target already taken by a DIFFERENT identity in EITHER
--     profiles or tb_users?
--   · if yes → assign a fresh high vacant slot instead
--   · if no  → just pad
--
-- This eliminates all the collision-detection cleverness. Slower
-- (per-row PL/pgSQL), but bulletproof for ~100 rows on prod.
--
-- Owner rule (unchanged): keep oldest, push newer to fresh high slot.
-- Implementation: profiles processed `order by created_at` — the
-- oldest gets its preferred padded code; subsequent newer profiles
-- that would collide get pushed high.
--
-- Apply via Supabase Dashboard SQL Editor. Idempotent + atomic.
-- ════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 1) Pad profiles per-row, oldest-first, with cross-table conflict skip
-- ──────────────────────────────────────────────────────────────────
do $$
declare
  rec        record;
  target     text;
  next_high  int;
  padded     int := 0;
  pushed     int := 0;
begin
  -- starting point for the "push to high vacant" allocator
  select coalesce(greatest(
    (select max((substring(member_code from 3))::int)
       from public.profiles  where member_code ~ '^PR[0-9]+$'),
    (select max((substring(userid from 3))::int)
       from public.tb_users  where userid      ~ '^PR[0-9]+$')
  ), 0) + 1 into next_high;

  for rec in
    select id, member_code, created_at
      from public.profiles
     where member_code ~ '^PR[0-9]+$'
     order by created_at -- oldest first → gets its canonical slot
  loop
    target := 'PR' || lpad((substring(rec.member_code from 3))::int::text, 3, '0');

    -- already canonical → no-op
    if target = rec.member_code then
      continue;
    end if;

    -- target taken by a DIFFERENT identity in EITHER table → push high
    if exists (select 1 from public.profiles
                where member_code = target and id <> rec.id)
       or exists (select 1 from public.tb_users where userid = target)
    then
      -- find next vacant high (string match across both tables)
      while exists (select 1 from public.profiles
                     where member_code = 'PR' || lpad(next_high::text, 3, '0'))
            or exists (select 1 from public.tb_users
                        where userid = 'PR' || lpad(next_high::text, 3, '0'))
      loop
        next_high := next_high + 1;
      end loop;

      target := 'PR' || lpad(next_high::text, 3, '0');
      next_high := next_high + 1;
      pushed := pushed + 1;
      raise notice '0100 push-high: profile % (was %) → % (target collided)',
        rec.id, rec.member_code, target;
    end if;

    update public.profiles set member_code = target where id = rec.id;
    padded := padded + 1;
  end loop;

  raise notice '0100 profiles pad complete: % padded total, % pushed to high', padded, pushed;
end $$;

-- ──────────────────────────────────────────────────────────────────
-- 2) Pad tb_users per-row, with profiles-collision push
-- ──────────────────────────────────────────────────────────────────
-- tb_users has no UNIQUE on userid (legacy MySQL), but Pacred's data
-- model says profiles.member_code and tb_users.userid share the same
-- PR<n> namespace — they MUST not point at the same code for
-- different identities. So we still need the cross-table conflict
-- check here too. Process oldest-first by `id` (no created_at column
-- guaranteed on this legacy table); for tb_users, "older" usually
-- means "lower PR number" anyway, so ID order roughly matches.
do $$
declare
  rec        record;
  target     text;
  next_high  int;
  padded     int := 0;
  pushed     int := 0;
begin
  select coalesce(greatest(
    (select max((substring(member_code from 3))::int)
       from public.profiles  where member_code ~ '^PR[0-9]+$'),
    (select max((substring(userid from 3))::int)
       from public.tb_users  where userid      ~ '^PR[0-9]+$')
  ), 0) + 1 into next_high;

  for rec in
    select userid
      from public.tb_users
     where userid ~ '^PR[0-9]+$'
     order by (substring(userid from 3))::int  -- low PR first
  loop
    target := 'PR' || lpad((substring(rec.userid from 3))::int::text, 3, '0');

    if target = rec.userid then
      continue;
    end if;

    -- target collides with a different identity in profiles or another
    -- tb_users row → push to high vacant
    if exists (select 1 from public.profiles where member_code = target)
       or exists (select 1 from public.tb_users
                   where userid = target and userid <> rec.userid)
    then
      while exists (select 1 from public.profiles
                     where member_code = 'PR' || lpad(next_high::text, 3, '0'))
            or exists (select 1 from public.tb_users
                        where userid = 'PR' || lpad(next_high::text, 3, '0'))
      loop
        next_high := next_high + 1;
      end loop;

      target := 'PR' || lpad(next_high::text, 3, '0');
      next_high := next_high + 1;
      pushed := pushed + 1;
      raise notice '0100 push-high: tb_users % → % (target collided)',
        rec.userid, target;
    end if;

    -- update tb_users + cascade to ALL referencing columns in one atomic
    -- block, so the in-flight integrity stays clean. We do this by
    -- looping over every userid/whuserid/subuserid column found in the
    -- catalog and running:
    --   UPDATE col SET col = target WHERE col = rec.userid
    -- This must come BEFORE updating tb_users itself (else the
    -- references would point at a non-existent userid mid-tx).
    --
    -- Subtle: we update from the OLD value (rec.userid) to the NEW
    -- value (target). This way the cascade is correct even though
    -- legacy MySQL had no FK.
    declare
      catrec record;
      upd_sql text;
    begin
      for catrec in
        select c.table_schema, c.table_name, c.column_name
          from information_schema.columns c
          join information_schema.tables  t
            on t.table_schema = c.table_schema
           and t.table_name   = c.table_name
         where c.table_schema = 'public'
           and c.column_name in ('userid', 'whuserid', 'subuserid')
           and c.data_type    like '%character%'
           and t.table_type   = 'BASE TABLE'
           and not (c.table_name = 'tb_users' and c.column_name = 'userid')
      loop
        upd_sql := format(
          'update %I.%I set %I = %L where %I = %L',
          catrec.table_schema, catrec.table_name,
          catrec.column_name, target,
          catrec.column_name, rec.userid
        );
        execute upd_sql;
      end loop;
    end;

    -- finally update tb_users itself
    update public.tb_users set userid = target where userid = rec.userid;

    padded := padded + 1;
  end loop;

  raise notice '0100 tb_users pad complete: % padded total, % pushed to high', padded, pushed;
end $$;

-- ──────────────────────────────────────────────────────────────────
-- 3) Replace generate_member_code() — lpad + numeric dedup
-- ──────────────────────────────────────────────────────────────────
create or replace function public.generate_member_code() returns trigger
language plpgsql
as $fn$
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
              from public.profiles  where member_code ~ '^PR[0-9]+$'), 0),
    coalesce((select max((substring(userid from 3))::int)
              from public.tb_users  where userid      ~ '^PR[0-9]+$'), 0)
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
$fn$;

comment on function public.generate_member_code() is
  'Pacred PR member-code generator (migration 0100) — lowest-vacant '
  'NUMERIC scan across profiles + tb_users; emits PR + min-3-digit '
  'zero-padded integer. Supersedes 0090/0095/0096/0097/0098/0099.';

-- ──────────────────────────────────────────────────────────────────
-- 4) Post-state sanity
-- ──────────────────────────────────────────────────────────────────
do $$
declare
  bare_profiles int;
  bare_users    int;
  cross_collide int;
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

  -- cross-table integrity: no profile and tb_users share the same code
  -- (except possibly the legacy-bridge linkage, which intentionally maps
  -- profile.member_code == tb_users.userid for the SAME customer — but
  -- that doesn't show up as a duplicate row in either table)
  select count(*) into cross_collide
    from public.profiles p
    join public.tb_users u on u.userid = p.member_code;
  if cross_collide > 0 then
    raise warning 'POST-MIGRATION: % profile↔tb_users code overlaps (legacy-bridge links — verify intentional)',
      cross_collide;
  end if;

  select pg_get_functiondef('public.generate_member_code()'::regprocedure)
    into fn_def;
  if fn_def !~ 'lpad' or fn_def !~ 'generate_series' then
    raise warning 'POST-MIGRATION: generate_member_code() body does not look like lpad+lowest-vacant';
  end if;
end $$;
