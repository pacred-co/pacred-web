-- ════════════════════════════════════════════════════════════
-- 0088 · Fix member_code_seq collision + harden the trigger
-- ════════════════════════════════════════════════════════════
-- Problem (prod 2026-05-23): customer register at pacred.co.th fails
-- with "บันทึกโปรไฟล์ไม่สำเร็จ" (profile_failed). Root cause:
--   · Trigger `generate_member_code()` (migration 0060) uses
--     `nextval('member_code_seq')` → returns e.g. 201 → 'PR201'.
--   · But PR201 already exists in `profiles` (taken earlier the same
--     day by a different sign-up).
--   · Unique constraint `profiles_member_code_key` rejects the INSERT
--     with code 23505 → action returns 'profile_failed'.
--
-- Why the sequence drifted:
--   · ภูม's Phase-A data load (migrations 0081-0083) populated
--     `tb_users` with the migrated PR<n> codes but kept the rebuilt
--     `profiles` table untouched. Migration 0083 explicitly DEFERRED
--     wiring the new `next_pr_member_code()` into the signup flow
--     (Phase B / ภูม). Meanwhile signups have kept using the OLD
--     `member_code_seq` from 0060 — but that sequence's current value
--     no longer reflects the max code actually present in `profiles`
--     (a previous emergency hotfix or manual INSERT raced the seq).
--
-- This migration does TWO things:
--   1. Advance `member_code_seq` past the current max numeric PR<n>
--      in profiles. Safe + idempotent (`setval` to max+1).
--   2. Harden `generate_member_code()` with retry-on-conflict — if the
--      drawn code collides (next race, future drift) the trigger
--      loops up to 100 times taking subsequent seq values until it
--      finds a free code. Bounded loop avoids infinite spin in the
--      pathological case.
--
-- Long-term proper fix: rewire signup to use
-- `public.next_pr_member_code()` (defined in 0083) which scans for the
-- lowest-vacant PR<n> against tb_users. That's Phase B (ภูม). Until
-- then this migration keeps `profiles` signups working.
-- ════════════════════════════════════════════════════════════

-- 1) Advance the sequence past max(numeric PR code) in profiles.
--    Uses setval with `false` so the NEXT nextval returns max+1
--    (not max+2 — `is_called=false` means the value is "the current
--    value", not "the last one taken").
do $$
declare
  current_max int;
  next_val    int;
begin
  -- Take the larger of: max numeric PR<n> in profiles, and the
  -- current sequence value. setval to that + 1.
  select coalesce(
    max((substring(member_code from 3))::int),
    0
  ) into current_max
  from public.profiles
  where member_code ~ '^PR[0-9]+$';

  -- Compare with current sequence value (last_value).
  -- nextval would return last_value+1 normally; we want it to be
  -- AT LEAST current_max+1 so it's guaranteed past any existing row.
  select greatest(current_max, last_value)::int into next_val
  from public.member_code_seq;

  -- Set to next_val + 1 with is_called=true so the NEXT nextval
  -- returns next_val + 1 — past any existing row.
  perform setval('public.member_code_seq', next_val + 1, false);
end $$;

-- 2) Harden the trigger with retry-on-conflict (bounded loop).
create or replace function public.generate_member_code() returns trigger as $$
declare
  candidate text;
  attempts  int := 0;
begin
  if new.member_code is null then
    loop
      attempts := attempts + 1;
      candidate := 'PR' || lpad(nextval('public.member_code_seq')::text, 3, '0');
      -- If candidate is free, take it.
      if not exists (select 1 from public.profiles where member_code = candidate) then
        new.member_code := candidate;
        return new;
      end if;
      -- Defensive bound: 100 attempts is more than enough for any
      -- realistic drift. If we hit this, something is very wrong
      -- (sequence corrupted, or thousands of pre-allocated codes).
      if attempts >= 100 then
        raise exception 'generate_member_code: 100 sequence draws all collided — sequence + profiles state requires manual reconcile';
      end if;
    end loop;
  end if;
  return new;
end;
$$ language plpgsql;

comment on function public.generate_member_code() is
  'Pacred PR member-code generator with retry-on-conflict (migration '
  '0088). Loops up to 100 nextval draws if the drawn code collides — '
  'unblocks signup even when the sequence drifts past actual profiles '
  'state. Long-term: rewire to public.next_pr_member_code() per '
  'migration 0083 (Phase B / ภูม).';
