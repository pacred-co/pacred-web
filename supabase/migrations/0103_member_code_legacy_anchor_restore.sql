-- ════════════════════════════════════════════════════════════
-- 0103 · Member-code restore — LEGACY-ANCHOR rule (supersedes 0100 data part)
-- ════════════════════════════════════════════════════════════
-- Owner directive 2026-05-24:
--   "ฐานลูกค้าเดิมก็ต้องมาก่อน อย่าไปเปลี่ยนของลูกค้า ส่วนที่มาใหม่ ก็ fill ไป
--    ส่วนเรื่อง staff จะมีอีก table แยกกันอยู่ในฝั่งของหลังบ้าน admin ปะ
--    แยกกันระหว่างลูกค้า และ staff อะถูกแล้ว"
--
-- Translated rule:
--   1. The legacy PCS customer base is the ANCHOR — never push a migrated
--      customer's code to a new slot.
--   2. NEW pacred-web signups fill lowest vacant slot in the numbering.
--   3. Staff/admin profiles eventually move to a separate back-office
--      table; for now, push them OUT of the customer-numbering low range
--      so they never collide with a legacy customer.
--
-- Migration 0100 (now deprecated for data updates) had the right padding
-- algorithm but the WRONG ordering — it processed profiles by created_at
-- (which is the migration timestamp, not "true age"), so it would have
-- pushed legacy customers (น.ส.ภูษิชา PR01, ปาณิศรา PR07) to new high
-- slots because newer Pacred-web dev accounts (Tadsakorn PR001,
-- Pond PR007) sat in the canonical padded slots first.
--
-- 0103 fixes this with a two-stage algorithm:
--   STAGE 1 — RELOCATE every non-migrated profile currently sitting in
--             PR1..PR99 (bare 1-2 digit) or PR001..PR099 (padded but
--             blocking legacy slots) to vacant slots above the current
--             max. This frees PR001..PR099 for the legacy customers.
--   STAGE 2 — PAD the 31 legacy bare codes (PR01..PR99 → PR001..PR099)
--             cleanly. Both profiles.member_code and tb_users.userid are
--             updated; the cascade in 0100 §2 (userid/whuserid/subuserid
--             columns) is reused.
--   STAGE 3 — REPLACE generate_member_code() with the lowest-vacant +
--             3-digit-pad version (was §3 of 0100, unchanged here).
--   STAGE 4 — Persist the diff to a real audit table so เดฟ can pull
--             "who-changed" for the customer notification.
--
-- Bridge update (separate commit to lib/auth/pcs-legacy-bridge.ts) adds
-- input normalization so a customer typing "PR01" / "PR1" / "PR001"
-- finds the same tb_users row regardless of which form they remember.
--
-- Idempotent + atomic — wrap apply in a transaction at the caller.
-- ════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────
-- 0) Persistent audit table — keeps the diff long after migration runs
-- ──────────────────────────────────────────────────────────────────
create table if not exists public.member_code_migration_audit (
  id           bigserial primary key,
  applied_at   timestamptz not null default now(),
  migration    text        not null,            -- '0103'
  table_name   text        not null,            -- 'profiles' / 'tb_users'
  identity_id  text        not null,            -- profile.id::text or tb_users.userid
  was          text        not null,            -- old code
  becomes      text        not null,            -- new code
  reason       text        not null,            -- 'relocate-staff-dev' / 'pad-legacy'
  customer_name text                            -- best-effort for the notify-list
);

comment on table public.member_code_migration_audit is
  'Every member-code change from migrations 0100/0103. Customer-notification source — query "select * where reason=''pad-legacy''" for the list of migrated customers whose displayed PR code changed from PR0X to PR00X.';

-- ──────────────────────────────────────────────────────────────────
-- 1) STAGE 1 — Relocate every non-migrated profile in PR<99 to high
-- ──────────────────────────────────────────────────────────────────
-- These are the staff/dev/test accounts that block legacy customer
-- padding. Move them ABOVE the current max so the PR001..PR099 range
-- is free for legacy padding.
do $$
declare
  rec        record;
  next_high  int;
  target     text;
  cust_name  text;
begin
  -- starting point: max+1 across BOTH tables (so the new slots don't
  -- collide with future signups either)
  select coalesce(greatest(
    (select max((substring(member_code from 3))::int) from public.profiles where member_code ~ '^PR[0-9]+$'),
    (select max((substring(userid from 3))::int)      from public.tb_users where userid      ~ '^PR[0-9]+$')
  ), 0) + 1 into next_high;

  for rec in
    select id, member_code, first_name, last_name
      from public.profiles
     where migrated_from_pcs = false
       and member_code ~ '^PR[0-9]+$'
       and (substring(member_code from 3))::int <= 99
     order by (substring(member_code from 3))::int, member_code
  loop
    -- Walk to the next vacant slot (cross-table check)
    while exists (select 1 from public.profiles where member_code = 'PR' || lpad(next_high::text, 3, '0'))
       or exists (select 1 from public.tb_users where userid      = 'PR' || lpad(next_high::text, 3, '0'))
    loop
      next_high := next_high + 1;
    end loop;
    target := 'PR' || lpad(next_high::text, 3, '0');
    next_high := next_high + 1;

    cust_name := coalesce(rec.first_name, '') || ' ' || coalesce(rec.last_name, '');

    insert into public.member_code_migration_audit
      (migration, table_name, identity_id, was, becomes, reason, customer_name)
      values ('0103', 'profiles', rec.id::text, rec.member_code, target,
              'relocate-staff-dev', nullif(trim(cust_name), ''));

    update public.profiles set member_code = target where id = rec.id;
  end loop;

  raise notice '0103 STAGE 1: relocated % staff/dev profiles to high vacant slots',
    (select count(*) from public.member_code_migration_audit
     where migration = '0103' and reason = 'relocate-staff-dev');
end $$;

-- ──────────────────────────────────────────────────────────────────
-- 2a) STAGE 2a — Pad the 31 legacy bare profiles (PR01..PR99 → PR001..PR099)
-- ──────────────────────────────────────────────────────────────────
do $$
declare
  rec       record;
  target    text;
  cust_name text;
begin
  for rec in
    select id, member_code, first_name, last_name
      from public.profiles
     where migrated_from_pcs = true
       and member_code ~ '^PR[0-9]{1,2}$'
     order by (substring(member_code from 3))::int
  loop
    target := 'PR' || lpad((substring(rec.member_code from 3))::int::text, 3, '0');
    if target = rec.member_code then continue; end if;

    cust_name := coalesce(rec.first_name, '') || ' ' || coalesce(rec.last_name, '');

    insert into public.member_code_migration_audit
      (migration, table_name, identity_id, was, becomes, reason, customer_name)
      values ('0103', 'profiles', rec.id::text, rec.member_code, target,
              'pad-legacy', nullif(trim(cust_name), ''));

    update public.profiles set member_code = target where id = rec.id;
    -- Keep legacy_pcs_user_id in sync — bridge normalizes either form,
    -- but keeping the column = the new code keeps subsequent admin
    -- tooling that joins on legacy_pcs_user_id = tb_users.userid working.
    update public.profiles set legacy_pcs_user_id = target where id = rec.id;
  end loop;

  raise notice '0103 STAGE 2a: padded % legacy profile codes',
    (select count(*) from public.member_code_migration_audit
     where migration = '0103' and table_name = 'profiles' and reason = 'pad-legacy');
end $$;

-- ──────────────────────────────────────────────────────────────────
-- 2b) STAGE 2b — Pad 31 legacy bare tb_users + cascade userid columns
-- ──────────────────────────────────────────────────────────────────
do $$
declare
  rec       record;
  target    text;
  catrec    record;
  upd_sql   text;
  cust_name text;
begin
  for rec in
    select userid, username, userlastname
      from public.tb_users
     where userid ~ '^PR[0-9]{1,2}$'
     order by (substring(userid from 3))::int
  loop
    target := 'PR' || lpad((substring(rec.userid from 3))::int::text, 3, '0');
    if target = rec.userid then continue; end if;

    cust_name := coalesce(rec.username, '') || ' ' || coalesce(rec.userlastname, '');

    insert into public.member_code_migration_audit
      (migration, table_name, identity_id, was, becomes, reason, customer_name)
      values ('0103', 'tb_users', rec.userid, rec.userid, target,
              'pad-legacy', nullif(trim(cust_name), ''));

    -- Cascade to ALL referencing userid/whuserid/subuserid columns BEFORE
    -- updating tb_users.userid itself.
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

    update public.tb_users set userid = target where userid = rec.userid;
  end loop;

  raise notice '0103 STAGE 2b: padded % legacy tb_users codes',
    (select count(*) from public.member_code_migration_audit
     where migration = '0103' and table_name = 'tb_users' and reason = 'pad-legacy');
end $$;

-- ──────────────────────────────────────────────────────────────────
-- 3) STAGE 3 — Replace generate_member_code() with the lowest-vacant impl
-- ──────────────────────────────────────────────────────────────────
create or replace function public.generate_member_code() returns trigger
language plpgsql
as $fn$
declare
  v_max_n integer;
  v_n     integer;
begin
  if new.member_code is not null then return new; end if;

  -- Serialise concurrent inserts so two near-simultaneous signups
  -- never grab the same lowest-vacant slot.
  perform pg_advisory_xact_lock(hashtext('public.profiles.member_code'));

  select greatest(
    coalesce((select max((substring(member_code from 3))::int)
              from public.profiles where member_code ~ '^PR[0-9]+$'), 0),
    coalesce((select max((substring(userid from 3))::int)
              from public.tb_users where userid      ~ '^PR[0-9]+$'), 0)
  ) into v_max_n;

  -- Lowest vacant slot across BOTH tables (legacy customers + pacred-web).
  select min(g) into v_n
  from generate_series(1, v_max_n + 1) as g
  where g not in (
    select (substring(member_code from 3))::int
      from public.profiles where member_code ~ '^PR[0-9]+$'
  )
  and g not in (
    select (substring(userid from 3))::int
      from public.tb_users where userid ~ '^PR[0-9]+$'
  );

  new.member_code := 'PR' || lpad(v_n::text, 3, '0');
  return new;
end;
$fn$;

comment on function public.generate_member_code() is
  'Pacred PR member-code generator (0103) — lowest-vacant numeric scan across profiles + tb_users; emits PR + min-3-digit zero-padded integer. Supersedes 0090/0095/0096/0097/0098/0099/0100.';

-- ──────────────────────────────────────────────────────────────────
-- 4) Post-state sanity
-- ──────────────────────────────────────────────────────────────────
do $$
declare
  bare_profiles int;
  bare_users    int;
begin
  select count(*) into bare_profiles
    from public.profiles where member_code ~ '^PR[0-9]{1,2}$';
  if bare_profiles > 0 then
    raise warning '0103 POST: % profiles still <3-digit', bare_profiles;
  end if;

  select count(*) into bare_users
    from public.tb_users where userid ~ '^PR[0-9]{1,2}$';
  if bare_users > 0 then
    raise warning '0103 POST: % tb_users still <3-digit', bare_users;
  end if;

  raise notice '0103 COMPLETE — audit in public.member_code_migration_audit';
end $$;
