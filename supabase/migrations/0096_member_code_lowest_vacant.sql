-- ════════════════════════════════════════════════════════════
-- 0096 · generate_member_code — LOWEST-VACANT scanner across both
--        profiles + tb_users (supersedes 0090 + 0095 trigger logic)
-- ════════════════════════════════════════════════════════════
-- Live state 2026-05-23 night after applying 0090 + 0095:
--   · 0090 (เดฟ) — lowest-vacant scanner against `profiles` only
--   · 0095 (ภูม) — abandon sequence · `MAX()+1` across both tables
--                  with a floor of 11099 → minimum next code = PR11100
--   0095 won (last CREATE OR REPLACE FUNCTION). Today the first
--   post-fix Pacred signup got `PR11100`. Owner verdict (เดฟ):
--   "ไกลไปป่าวไหนอะ fill ค่าว่าก่อน" — too far; fill the gaps first.
--
-- The gap is real and large:
--   · tb_users.userid runs PR1..PR10899 (8,898 legacy customers loaded
--     via 0081-0083) — but NOT contiguous (the legacy PHP free-listed
--     deletions, so PR2/PR55/PR789/etc. are vacant in tb_users)
--   · profiles.member_code holds:
--       - a handful of pre-migration test PR<n> codes
--       - PR10900..PR10903 — the 4 collision-renamed signups from
--         0095 step 1 (former PR120/PR121/PR122/PR124)
--   · Everything from PR11100 onward is fresh sequence territory
--
-- A lowest-vacant scan from PR1 → max+1 returns the FIRST integer
-- not in either table. New signups will fill PR2/PR3/PR55/... — every
-- previously-deleted slot — before reaching PR11100. This matches the
-- legacy PCS PHP behaviour (which also did a min-vacant lookup on
-- tb_users) and keeps the customer-visible code space dense.
--
-- ── Differences vs predecessors ────────────────────────────────────
-- 0090 (เดฟ): right algorithm (lowest-vacant) but checks only `profiles`
--    → would re-issue PR120 if a 2021-vintage tb_users customer holds
--      it; that's the very collision class 0095 was written to stop.
-- 0095 (ภูม): right scope (both tables) but wrong algorithm (MAX+1
--    with floor 11099) → safe but wasteful — every new code starts
--    PR11100+, abandoning ~9,000 reclaimable slots between PR1..PR10899.
-- 0096 (this) — both-tables AND lowest-vacant. Race-safe (advisory
--    lock, mirrors 0090). Format: `PR<n>` bare integer (NO lpad — match
--    the migrated population's format per 0090 comment).
--
-- Idempotent: CREATE OR REPLACE FUNCTION. Re-applying is a no-op.
-- The dead `member_code_seq` sequence from 0060 stays orphan (0095
-- intentionally left it; cheaper than risking a mid-deploy invalidate).
--
-- ⚠ Operator (เดฟ): apply via Supabase Dashboard SQL Editor. After
-- apply, the next prod signup should get the smallest PR<n> NOT in
-- profiles OR tb_users — probably very low (PR2, PR55, PR123…). The
-- 4 collision-renumbered profiles (PR10900-PR10903) stay where they
-- are — they have a non-null member_code so the trigger short-circuits.
-- ════════════════════════════════════════════════════════════

create or replace function public.generate_member_code() returns trigger
language plpgsql
as $$
declare
  v_max_n integer;
  v_n     integer;
begin
  -- Pre-set codes pass through (caller already picked one).
  if new.member_code is not null then
    return new;
  end if;

  -- Serialise concurrent allocations. Two simultaneous inserts both
  -- block on this lock; whichever commits first releases, second
  -- re-runs the scan against the post-commit state.
  perform pg_advisory_xact_lock(hashtext('public.profiles.member_code'));

  -- Bound the scan: max numeric PR<n> across BOTH tables.
  -- The regex anchors both ends → letter accounts (PRCARGO, PRTT,
  -- PRARNON, PRFAM) and no-prefix specials (PW, JET, FCL, AIGA) are
  -- excluded; they don't reserve numeric slots.
  select greatest(
    coalesce((select max((substring(member_code from 3))::int)
              from public.profiles
              where member_code ~ '^PR[0-9]+$'), 0),
    coalesce((select max((substring(userid from 3))::int)
              from public.tb_users
              where userid ~ '^PR[0-9]+$'), 0)
  ) into v_max_n;

  -- Lowest unused PR<n> in [1, max+1] across BOTH tables.
  -- generate_series caps at v_max_n+1 so the scan is bounded; even
  -- with 11k rows the series + 2 anti-semi-joins run in <50ms.
  select min(g)
  into v_n
  from generate_series(1, v_max_n + 1) as g
  where ('PR' || g) not in (
    select member_code
      from public.profiles
     where member_code ~ '^PR[0-9]+$'
  )
  and ('PR' || g) not in (
    select userid
      from public.tb_users
     where userid ~ '^PR[0-9]+$'
  );

  -- Bare integer (PR1, PR55, PR201, PR8898 …) — matches the 8,898
  -- migrated tb_users format. NO lpad: 0095 confirmed lpad'd PR001
  -- gives us two collision-prone code shapes in the same column.
  new.member_code := 'PR' || v_n;
  return new;
end;
$$;

comment on function public.generate_member_code() is
  'Pacred PR member-code generator (migration 0096) — LOWEST-VACANT '
  'scan across BOTH profiles.member_code AND tb_users.userid. '
  'Supersedes 0090 (profiles-only) + 0095 (MAX+1 with floor 11099). '
  'Dense reuse of the PR<n> space; matches legacy PHP behaviour.';

-- ──────────────────────────────────────────────────────────────────
-- Sanity check (no rows expected to print on success).
-- Re-verifies post-0095 invariants: no profile/tb_users collisions,
-- the function definition references the new lowest-vacant pattern.
-- ──────────────────────────────────────────────────────────────────
do $$
declare
  conflict_count int;
  fn_def text;
begin
  select count(*) into conflict_count
  from public.profiles p
  join public.tb_users u on u.userid = p.member_code;
  if conflict_count > 0 then
    raise warning 'POST-MIGRATION CHECK: % collisions still exist between profiles.member_code and tb_users.userid', conflict_count;
  end if;

  select pg_get_functiondef('public.generate_member_code()'::regprocedure)
    into fn_def;
  if fn_def !~ 'generate_series' or fn_def !~ 'min\(g\)' then
    raise warning 'POST-MIGRATION CHECK: generate_member_code() body does not look like the lowest-vacant scanner';
  end if;
end $$;
