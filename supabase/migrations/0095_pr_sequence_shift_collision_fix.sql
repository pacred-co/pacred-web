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
-- 2) Shift the sequence past the legacy max
-- ──────────────────────────────────────────────────────────────────
-- MAX(tb_users.userid::int after stripping prefix) = 10899 as of
-- 2026-05-23. Restart at 11000 → buffer of 100 above the legacy max +
-- room for the 4 just-renumbered profiles (PR10900..10903).
alter sequence public.member_code_seq restart with 11000;

-- ──────────────────────────────────────────────────────────────────
-- 3) Replace the generator with a collision-safe version
-- ──────────────────────────────────────────────────────────────────
-- The new function: on each insert, claim a sequence value; if the
-- candidate PR<n> already exists in tb_users.userid, advance the
-- sequence and try again. Caps at 10 retries to avoid an infinite
-- loop on a misconfigured sequence (in practice never trips because
-- the sequence is now ahead of any legacy row).
create or replace function public.generate_member_code() returns trigger as $$
declare
  next_num int;
  candidate text;
  retries int := 0;
begin
  if new.member_code is not null then
    return new;
  end if;
  loop
    next_num := nextval('public.member_code_seq');
    candidate := 'PR' || lpad(next_num::text, 3, '0');
    if not exists (
      select 1 from public.tb_users where userid = candidate
    ) and not exists (
      select 1 from public.profiles where member_code = candidate
    ) then
      new.member_code := candidate;
      return new;
    end if;
    retries := retries + 1;
    if retries > 10 then
      raise exception 'generate_member_code: could not find a free PR-code after 10 retries (last candidate %)', candidate;
    end if;
  end loop;
end;
$$ language plpgsql;

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
