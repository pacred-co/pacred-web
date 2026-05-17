-- ════════════════════════════════════════════════════════════
-- C-1 fix · wallet_tx_insert_self_serve — bind amount sign to kind
-- ════════════════════════════════════════════════════════════
-- Per `docs/research/audit-core-2026-05-18.md` §3 C-1 (P1, launch
-- week). The original `wallet_tx_insert_self_serve` RLS (migration
-- `0007`) constrains profile / status / kind / bucket but **never the
-- sign of `amount`**. A direct PostgREST self-insert with
-- `kind='withdraw', amount=+50000, status='pending'` slips through;
-- if any admin later approves it (`pending → completed`), the
-- `0007_wallet.sql` recompute trigger sums the +50000 and inflates
-- `wallet.balance` with money that never entered Pacred.
--
-- The application actions are disciplined (createDeposit inserts
-- +amount, createWithdraw inserts -d.amount, lib/validators/wallet.ts
-- forces positive input) — but RLS is the ONLY gate when the write
-- bypasses the action layer.
--
-- ── Fix (this migration) ───────────────────────────────────
-- Re-create the policy with an additional sign predicate:
--   - kind='deposit'  → amount > 0   (always a credit)
--   - kind='withdraw' → amount < 0   (always a debit)
--
-- Plus a defence-in-depth table-level CHECK (`wallet_tx_kind_sign_chk`)
-- enforcing the same rule for EVERY insert path (admin actions, refund
-- credits via 'refund' kind, etc.) — so a future careless action OR a
-- direct service-role write also cannot slip a sign mismatch through.
--
-- The CHECK only constrains the two app-controlled signed kinds — it
-- does NOT constrain other kinds (order_payment, import_payment,
-- credit_charge, refund, etc.) because they are admin-issued and have
-- their own sign rules per business logic.
--
-- Idempotent · additive. Zero data migration (existing rows already
-- satisfy the rule because actions enforce it).
-- ════════════════════════════════════════════════════════════

-- ── 1) Replace the RLS INSERT policy with sign-aware predicate ─────

drop policy if exists "wallet_tx_insert_self_serve" on public.wallet_transactions;
create policy "wallet_tx_insert_self_serve" on public.wallet_transactions
  for insert with check (
    auth.uid() = profile_id
    and status  = 'pending'
    and bucket  = 'main'
    and (
      (kind = 'deposit'  and amount > 0)
      or (kind = 'withdraw' and amount < 0)
    )
  );

comment on policy "wallet_tx_insert_self_serve" on public.wallet_transactions is
  'C-1 fix (P1 from audit-core-2026-05-18 §3): tightened to bind amount sign to kind. A deposit MUST be a positive credit; a withdraw MUST be a negative debit. Closes the +50000 sign-flip self-serve exploit.';

-- ── 2) Defence-in-depth table CHECK on signed kinds ────────────────
-- This is the belt-and-suspenders backup for the RLS policy. If
-- a future action OR service-role direct insert ever passes a
-- wrong-signed amount for the two signed self-serve kinds, the
-- CHECK fires server-side (regardless of who is writing).
--
-- DROP + ADD to make re-application idempotent. The ADD will fail
-- if any pre-existing row violates the rule (rare but real
-- compatibility check); if that happens, the rows must be repaired
-- manually before this migration completes.

alter table public.wallet_transactions
  drop constraint if exists wallet_tx_kind_sign_chk;

alter table public.wallet_transactions
  add constraint wallet_tx_kind_sign_chk check (
    case
      when kind = 'deposit'  then amount > 0
      when kind = 'withdraw' then amount < 0
      else true                              -- other kinds: not constrained here
    end
  );

comment on constraint wallet_tx_kind_sign_chk on public.wallet_transactions is
  'C-1 defence-in-depth: deposit must credit (amount > 0); withdraw must debit (amount < 0). All other kinds (order_payment, refund, credit_charge, etc.) unconstrained here — they have business-rule signs enforced in the issuing action.';

-- ── 3) Verify (one-row count) ──────────────────────────────────────

do $c1$
declare
  violation_count int;
begin
  -- Defensive sanity check — if ANY existing rows would violate the
  -- new CHECK, the ADD CONSTRAINT above would have raised. Belt-and-
  -- suspenders: count again and warn if non-zero (should be 0).
  select count(*) into violation_count
    from public.wallet_transactions
   where (kind = 'deposit'  and amount <= 0)
      or (kind = 'withdraw' and amount >= 0);

  if violation_count > 0 then
    raise warning
      'C-1 verify: % wallet_transactions row(s) violate the new sign rule. Inspect + repair manually.',
      violation_count;
  else
    raise notice
      'C-1 verify: 0 sign violations. wallet_tx_insert_self_serve + wallet_tx_kind_sign_chk now enforced.';
  end if;
end
$c1$;
