-- ════════════════════════════════════════════════════════════
-- 0083 · PCS Cargo legacy — PR member-code generator (D1 Phase A)
-- ════════════════════════════════════════════════════════════
-- Per runbook §7 Q4 (เดฟ · 2026-05-18): post-migration signups continue the
-- legacy PR<n> series, LOWEST-VACANT first — the smallest unused PR<n>,
-- counting from PR1 up. The migrated ~8,898 customers occupy a sparse
-- PR<n> set (legacy running numbers, un-padded — PR1, PR1791, PR8898 …),
-- so the first new signups fill the low gaps (PR1-PR5 …).
--
-- This file DEFINES public.next_pr_member_code() only. Wiring it into the
-- customer signup flow is Phase B (ภูม). It deliberately does NOT touch the
-- existing generate_member_code() trigger / member_code_seq (migration
-- 0060): that serves the rebuilt `profiles` table and its padded PR001
-- pattern. The two coexist until Phase B reconciles auth onto tb_users.
--
-- NOTE — faithful port: the legacy tb_users carries no UNIQUE constraint on
-- userid (none added here — see 0081/0082). The data IS unique in practice
-- (verified at load). The advisory lock below serialises concurrent code
-- allocation; Phase B should still add a unique index on tb_users.userid
-- and retry-on-conflict when it wires signup.
-- ════════════════════════════════════════════════════════════

-- next_pr_member_code() — return the lowest unused PR<n> in tb_users.
--
-- · scans 1 .. (max numeric PR code + 1); returns 'PR' || (lowest vacant).
-- · the regex guard ^PR[0-9]+$ counts only numeric PR codes — the legacy
--   letter accounts (PRCARGO / PRTT / PRARNON / PRFAM) and the no-prefix
--   specials (PW / JET / FCL / AIGA) are correctly excluded from the series.
-- · pg_advisory_xact_lock serialises concurrent callers: the 2nd caller
--   blocks until the 1st transaction commits its INSERT, so it sees the
--   freshly-taken code and picks the next one. Caller MUST allocate the
--   code and INSERT the tb_users row in the SAME transaction.
create or replace function public.next_pr_member_code() returns text as $$
declare
  n integer;
begin
  perform pg_advisory_xact_lock(hashtext('pcs_legacy.pr_member_code'));

  select min(g) into n
  from generate_series(
         1,
         (select coalesce(max((substring(userid from 3))::integer), 0) + 1
            from public.tb_users
           where userid ~ '^PR[0-9]+$')
       ) as g
  where ('PR' || g) not in (select userid from public.tb_users);

  return 'PR' || n;
end;
$$ language plpgsql;

comment on function public.next_pr_member_code() is
  'D1 Phase A (0083): lowest-vacant PR<n> member code for post-migration '
  'signups. Caller must allocate + INSERT in one transaction. See runbook '
  'docs/runbook/pcs-data-migration.md §7 Q4.';
