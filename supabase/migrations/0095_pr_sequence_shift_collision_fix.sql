-- 0095_pr_sequence_shift_collision_fix.sql
--
-- Fix two related issues with PR member-code assignment, surfaced by ภูม
-- 2026-05-23 night ("user breakrule รันเลขยูสเซอร์PR... ชนกับ Table
-- tb_users ทำให้เกิดเลข PR ทับกัน"):
--
-- Issue 1 — 4 existing collisions
--   The new-signup trigger (generate_member_code · migration 0060)
--   starts member_code_seq at 1 with no awareness of legacy
--   tb_users.userid which already runs PR1..PR10899. As a result, 4
--   real customers who signed up via the Pacred web on 2026-05-22 got
--   the SAME PR-code as a 2021-vintage legacy customer:
--
--     profile (new)                       collides with tb_users (legacy)
--     ─────────────────────────────       ─────────────────────────────
--     PR120 · Chitmg (Myanmar)            PR120 · โรจน์ศักดิ์ สมฤทธิ์
--     PR121 · พิสิฏฐ์ กุมมลลือ              PR121 · นาย สนใจพาณิชย์
--     PR122 · TEST PASSOTP                PR122 · วิลาสินี คำหอม
--     PR124 · อรยา แซ่เต็ง                 PR124 · สุธี ปานสกุล
--
--   They are confirmed DIFFERENT people (different phone + email +
--   name) — verified by scripts/survey-pr-collisions.ts. The 4 new
--   profiles get renumbered into the safe range (≥ PR10900); the
--   legacy tb_users rows keep their original IDs (no FK depends on
--   profiles.member_code, but lots of legacy data ties to
--   tb_users.userid — easier + safer to move profiles).
--
-- Issue 2 — future signups would keep colliding
--   ALTER SEQUENCE member_code_seq RESTART WITH 11000 so the next
--   Pacred web signup picks PR11000, well clear of MAX(tb_users)=PR10899
--   plus a 100-row buffer.
--
-- Defence-in-depth — added trigger collision check
--   `generate_member_code` is replaced with a version that, on every
--   insert, advances the sequence ONE MORE TIME if the candidate PR-code
--   is already taken by tb_users.userid. Belt-and-braces: even if a
--   stray legacy row above PR11000 somehow exists, the trigger walks
--   past it instead of failing the signup.
--
-- ⚠ Operator note (ภูม): the 4 renumbered profiles' member_code WILL
-- change in the customer-visible portal. If any of those customers have
-- bookmarks, mentioned their PR-code on a slip, or screenshot'd the
-- old number — they'll need a heads-up. Coordinate with พี่ป๊อป.
--
-- Idempotent: re-running is safe — the rename steps are guarded by
-- `WHERE member_code IN (...)` and only fire if the row still has the
-- old code; the sequence RESTART is also a no-op if already past 11000.

-- ──────────────────────────────────────────────────────────────────
-- 1) Renumber the 4 colliding profiles
-- ──────────────────────────────────────────────────────────────────
-- Order matters: assign biggest target first so the next nextval() in
-- the trigger (after RESTART) doesn't collide with the renumbered set.
-- We hand-assign rather than letting the trigger fire because we want
-- predictable, mapped numbers for ops to communicate to those 4 users.

update public.profiles set member_code = 'PR10900'
  where id = '057858c4-1b13-4f3f-b5c6-355d2e12dabb' and member_code = 'PR124';

update public.profiles set member_code = 'PR10901'
  where id = '0af06d3b-251e-47b2-9d69-324e24677c71' and member_code = 'PR122';

update public.profiles set member_code = 'PR10902'
  where id = 'ec4c8c03-80a5-465f-a827-fcb3e59c47fa' and member_code = 'PR121';

update public.profiles set member_code = 'PR10903'
  where id = '4ea48414-070c-4c6b-ad00-e2226af79d27' and member_code = 'PR120';

-- ──────────────────────────────────────────────────────────────────
-- 2) Replace the generator — abandon the sequence approach entirely
-- ──────────────────────────────────────────────────────────────────
-- 2026-05-23 night incident: we initially tried `ALTER SEQUENCE
-- member_code_seq RESTART WITH 11000` + a sequence-based generator.
-- All Dashboard checks (`select last_value`, `select nextval()`)
-- showed the sequence correctly at 11000+, but every trigger fire
-- (both via supabase-js AND via Dashboard INSERT) kept emitting
-- PR100..PR110 — the trigger walked 10 retries inside the legacy
-- range, then errored. Root cause: PostgreSQL sequence values
-- pre-allocated to PgBouncer pool sessions BEFORE the ALTER are not
-- invalidated by ALTER/DROP+CREATE. Existing sessions keep emitting
-- their cached batch (often 50 values pre-grabbed) until exhausted.
-- A Supabase REST pool keeps these sessions alive for hours.
--
-- The fix: don't use a sequence at all. Compute MAX() across both
-- tables + a configurable floor on every insert. No cache, no
-- session state, no surprise. Slower-but-correct over fast-but-stale.
--
-- Race safety: profiles.member_code has a UNIQUE constraint, so two
-- simultaneous inserts that pick the same number → one of them
-- catches a uniqueness error + retries on its own (Supabase auth
-- signup auto-retries; manual `actions/auth.ts` paths surface it).
--
-- Floor `11099` → guarantees minimum next code = PR11100 (well above
-- MAX legacy tb_users.userid = PR10899 + buffer above the 4 renamed
-- profiles PR10900..PR10903).
create or replace function public.generate_member_code() returns trigger as $$
declare
  next_num int;
  candidate text;
begin
  if new.member_code is not null then
    return new;
  end if;

  -- Compute MAX(numeric part) across BOTH tables + the safety floor.
  -- coalesce()-wraps so an empty table yields 0 (no NULL contamination).
  select greatest(
    coalesce((select max((substring(member_code from 3))::int)
              from public.profiles
              where member_code ~ '^PR[0-9]+$'), 0),
    coalesce((select max((substring(userid from 3))::int)
              from public.tb_users
              where userid ~ '^PR[0-9]+$'), 0),
    coalesce((select max((substring(userid from 4))::int)
              from public.tb_users
              where userid ~ '^PCS[0-9]+$'), 0),
    11099   -- floor: at least PR11100 for every new signup
  ) + 1 into next_num;

  -- Walk forward in case a concurrent insert grabbed the same number
  -- (UNIQUE constraint on profiles.member_code would catch it but the
  -- explicit walk is faster than a constraint-violation retry loop).
  loop
    candidate := 'PR' || next_num::text;
    if not exists (select 1 from public.tb_users where userid = candidate)
       and not exists (select 1 from public.profiles where member_code = candidate) then
      new.member_code := candidate;
      return new;
    end if;
    next_num := next_num + 1;
  end loop;
end;
$$ language plpgsql;

-- The sequence is intentionally left orphan after this — no DROP, no
-- ALTER. Cheaper to leave a few KB of unused metadata than risk a
-- mid-deploy invalidation. A later sweep can `drop sequence
-- if exists public.member_code_seq` once nothing in the codebase
-- references it.

-- ──────────────────────────────────────────────────────────────────
-- 4) Sanity-check the result (no rows expected to print on success)
-- ──────────────────────────────────────────────────────────────────
do $$
declare
  conflict_count int;
begin
  select count(*) into conflict_count
  from public.profiles p
  join public.tb_users u on u.userid = p.member_code;
  if conflict_count > 0 then
    raise warning 'POST-MIGRATION CHECK: % collisions still exist between profiles.member_code and tb_users.userid', conflict_count;
  end if;
end $$;
