-- ════════════════════════════════════════════════════════════
-- 0064 · Wallet overdraw guard — H-1 (aggregate-pending overdraw)
-- ════════════════════════════════════════════════════════════
-- Pre-launch customer-gap audit [docs/research/gap-customer.md §H-1].
--
-- ── The hole ──
-- `actions/wallet.ts::createWithdraw` and `actions/payment.ts::
-- createYuanPayment` (wallet-paid) insert their debit row with
-- status='pending'. The 0007 balance trigger `wallet_recompute_balance`
-- sums only rows `where status='completed'`, so a PENDING debit does
-- NOT reduce `wallet.balance`. Each action's balance check reads only
-- that completed-only balance — so a customer can stack N withdraw
-- requests and/or N wallet-paid yuan transfers, each individually
-- <= balance, none reflected until an admin approves them. When the
-- admin approves them all, the main balance goes NEGATIVE — Pacred
-- pays out / ships transfers it was never funded for.
--
-- Distinct from the 2026-05-17 money audit: P0-2 is the yuan debit
-- being RLS-blocked; P1-1 is concurrent pay-from-wallet (writes
-- 'completed' immediately). The aggregate-pending overdraw on the
-- admin-gated withdraw + yuan path was uncovered. 0061 only added a
-- tax-invoice duplicate guard.
--
-- ── The fix — one coherent balance-integrity rule ──
-- 1. `wallet_available_balance(profile, bucket)` — the single SQL
--    definition of spendable balance: completed rows PLUS open pending
--    DEBITS. (Pending CREDITS — a deposit awaiting approval — are NOT
--    counted: that money is not in the wallet yet.) The app layer
--    mirrors this rule in lib/wallet/balance.ts for its pre-insert
--    check; this function is the authority the DB trigger trusts.
-- 2. `wallet_assert_no_overdraw()` — a BEFORE INSERT/UPDATE trigger:
--    the hard non-negative floor. Rejects any customer-side PENDING
--    main-bucket debit (a new request, or an amount-edit on an open
--    one) that would push the available balance below zero. Locks the
--    wallet row FOR UPDATE so the floor holds under concurrent submits,
--    not just check-then-act.
--
-- ── Scope — what the trigger deliberately does NOT block ──
--  * status='completed' debits — pay-from-wallet writes these, and the
--    admin `allow_overdraw` override depends on being able to. Their
--    pending-aware check lives in the app layer; the concurrent
--    pay-from-wallet overdraw (money-audit P1-1) keeps its own,
--    separately-tracked floor.
--  * pending -> completed approval (admin) — leaves the available
--    balance unchanged, so it never trips the guard.
--  * kind='adjustment' — the admin manual-correction escape hatch.
--
-- Idempotent (create-or-replace / drop-if-exists). Zero data
-- migration. Safe to apply on prod live.
-- ════════════════════════════════════════════════════════════

-- ── Spendable-balance function — single source of truth ──
-- SECURITY DEFINER so it always sums the true rows regardless of the
-- caller's RLS context (a money guard must not be fooled by row
-- visibility). Kept off the PostgREST RPC surface — see revoke below.
create or replace function public.wallet_available_balance(
  p_profile uuid,
  p_bucket  text default 'main'
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount), 0)::numeric(12,2)
    from public.wallet_transactions
   where profile_id = p_profile
     and bucket     = p_bucket
     and (
           status = 'completed'
        or (status = 'pending' and amount < 0)
     );
$$;

comment on function public.wallet_available_balance(uuid, text) is
  '0064 H-1 — spendable balance = completed rows + open pending debits. Backs the wallet_tx_overdraw_guard trigger; mirrored in lib/wallet/balance.ts. Trigger-internal — execute revoked from client roles so a caller cannot read another profile''s balance via RPC.';

-- Trigger-internal only. The SECURITY DEFINER trigger (owner = migration
-- runner) keeps EXECUTE via ownership; client roles lose the default grant.
revoke all on function public.wallet_available_balance(uuid, text)
  from public, anon, authenticated;

-- ── Overdraw-guard trigger — the hard non-negative floor ──
create or replace function public.wallet_assert_no_overdraw()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_available   numeric(12,2);
  v_old_contrib numeric(12,2) := 0;
  v_new_contrib numeric(12,2) := 0;
  v_projected   numeric(12,2);
begin
  -- Guard customer-side PENDING debits on the MAIN bucket only.
  -- 'completed' rows (pay-from-wallet, admin allow_overdraw,
  -- pending->completed approval) and 'adjustment' (admin escape hatch)
  -- are intentionally out of scope — see the migration header.
  if new.status <> 'pending'
     or new.bucket <> 'main'
     or new.kind = 'adjustment' then
    return new;
  end if;

  -- A pending row counts toward the spendable balance only if it is a
  -- debit (mirrors wallet_available_balance). A pending credit does not.
  if new.amount < 0 then
    v_new_contrib := new.amount;
  end if;

  -- On UPDATE, back out the row's pre-update contribution so the
  -- projection reflects swapping OLD for NEW (catches amount edits on
  -- an already-open pending withdraw).
  if tg_op = 'UPDATE'
     and (old.status = 'completed'
          or (old.status = 'pending' and old.amount < 0)) then
    v_old_contrib := old.amount;
  end if;

  -- This operation does not reduce the spendable balance -> nothing to
  -- guard (a new credit, or shrinking an existing debit).
  if v_new_contrib >= v_old_contrib then
    return new;
  end if;

  -- Serialize concurrent debits per profile so the floor is hard, not
  -- check-then-act. The wallet row exists (0007 backfill + profiles-
  -- insert trigger); FOR UPDATE over zero rows is a harmless no-op.
  perform 1 from public.wallet where profile_id = new.profile_id for update;

  v_available := public.wallet_available_balance(new.profile_id, 'main');
  v_projected := v_available - v_old_contrib + v_new_contrib;

  -- Block only operations that push the spendable balance below zero.
  -- If it is already negative (legacy bad data), still allow operations
  -- that do not worsen it, so admins can remediate.
  if v_projected < 0 and v_projected < v_available then
    raise exception
      'wallet overdraw blocked: available %, requested debit %, projected % (profile %, kind %)',
      v_available, (v_new_contrib - v_old_contrib), v_projected,
      new.profile_id, new.kind
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.wallet_assert_no_overdraw() is
  '0064 H-1 — hard non-negative floor for customer-side pending main-bucket debits (withdraw / wallet-paid yuan). See the migration header for the deliberate scope exclusions.';

drop trigger if exists wallet_tx_overdraw_guard on public.wallet_transactions;
create trigger wallet_tx_overdraw_guard
  before insert or update of amount, status, bucket
  on public.wallet_transactions
  for each row execute function public.wallet_assert_no_overdraw();
