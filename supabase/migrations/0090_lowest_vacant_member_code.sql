-- ════════════════════════════════════════════════════════════
-- 0090 · profiles.member_code generator — LOWEST-VACANT scanner
-- ════════════════════════════════════════════════════════════
-- P0 incident 2026-05-23: production signups failing with
--   ERROR: duplicate key value violates unique constraint
--          "profiles_member_code_key"
--   DETAIL: Key (member_code)=(PR201) already exists.
-- Root cause: migration 0060's generator uses
--   nextval('member_code_seq')  →  lpad(…,3,'0')
-- The sequence somehow drifted down to 200 (likely set by an earlier
-- recovery attempt to "rewind"). Now every signup tries PR201, which
-- is occupied by recovered customer สุรเสกข์ โกวิทวีรธรรม (remapped
-- from the orphan-recovery batch PR20000-PR20008 → low-vacant slots).
-- The trigger doesn't catch the unique violation, so the insert fails
-- and we surface "บันทึกโปรไฟล์ไม่สำเร็จ" to the user.
--
-- This migration REPLACES the trigger function with a lowest-vacant
-- scanner identical in spirit to 0083's next_pr_member_code() (which
-- targets tb_users for the D1 faithful-port path). For each INSERT:
--
--   1. advisory_xact_lock serialises concurrent allocations
--   2. max_n  := max(PR<n>) across well-formed numeric codes
--   3. n      := lowest g in [1, max_n + 1] with no PR<g> in profiles
--   4. assign PR<n>  (NO lpad — bare integer; PR1..PR9999+, no leading zeros)
--
-- The bare-integer pattern (PR1, PR42, PR201) matches the legacy
-- PHP PCS Cargo convention + the 8,931 already-migrated rows (PR1,
-- PR1791, PR8898 …). The 3-digit pad from 0060 was a short-lived
-- aesthetic choice — abandoned to align with the migrated population
-- and avoid two collision-prone code formats in the same column.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP/CREATE TRIGGER are
-- safe to re-run.
--
-- Verification:
--   SELECT pg_get_functiondef('public.generate_member_code()'::regprocedure);
--   -- expect the new lowest-vacant body
-- ════════════════════════════════════════════════════════════

create or replace function public.generate_member_code() returns trigger
language plpgsql
as $$
declare
  v_max_n integer;
  v_n     integer;
begin
  if new.member_code is null then
    -- Serialise concurrent allocations across this trigger.
    -- Two signups landing at the same second both block on this
    -- lock; whichever commits first releases, second sees its
    -- code occupied and picks the next.
    perform pg_advisory_xact_lock(hashtext('public.profiles.member_code'));

    -- max numeric PR<n>. The regex anchors both ends so legacy
    -- alphanumeric codes (PRCARGO, PRTT, PRARNON, PRFAM) and the
    -- no-prefix specials (PW, JET, FCL, AIGA) are excluded.
    select coalesce(max((substring(member_code from 3))::int), 0)
      into v_max_n
      from public.profiles
     where member_code ~ '^PR[0-9]+$';

    -- Lowest unused integer in [1, max+1].  generate_series caps
    -- the scan at the current max — so even with a 100k-row table
    -- the scan is bounded + fast (single seq scan over a small range).
    select min(g)
      into v_n
      from generate_series(1, v_max_n + 1) as g
     where ('PR' || g) not in (
       select member_code
         from public.profiles
        where member_code ~ '^PR[0-9]+$'
     );

    new.member_code := 'PR' || v_n;
  end if;
  return new;
end;
$$;

comment on function public.generate_member_code() is
  '0090: lowest-vacant PR<n> scanner. Replaces the 0060 nextval+lpad '
  'generator (P0 incident 2026-05-23 — see migration header). Caller '
  'must allocate + INSERT in a single transaction; the advisory lock '
  'serialises concurrent allocations.';

-- Ensure the trigger is wired (idempotent re-create).
drop trigger if exists trg_generate_member_code on public.profiles;
create trigger trg_generate_member_code
  before insert on public.profiles
  for each row execute function public.generate_member_code();

-- ────────────────────────────────────────────────────────────
-- Sanity check (commented so the migration runs clean; uncomment
-- in psql / Studio to verify post-apply):
--
--   select max((substring(member_code from 3))::int) as max_n
--     from public.profiles where member_code ~ '^PR[0-9]+$';
--
--   select min(g) as first_vacant
--     from generate_series(1, 10905) g
--    where ('PR' || g) not in (
--      select member_code from public.profiles
--       where member_code ~ '^PR[0-9]+$'
--    );
-- ────────────────────────────────────────────────────────────
