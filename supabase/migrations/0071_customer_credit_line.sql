-- ════════════════════════════════════════════════════════════
-- U4-2 · Customer credit line (เครดิตสินค้า / pay-later)
-- ════════════════════════════════════════════════════════════
-- Per docs/UPGRADE_PLAN.md §4 U4-2:
--
--   "Customer credit line — profiles.credit_limit + a credit-charge
--    ledger kind + an outstanding-credit view + a 'pay my credit' action;
--    lights up the dead wallet.credit_balance UI. A real revenue feature
--    legacy customers expect."
--
-- ── The picture ─────────────────────────────────────────────────────
-- Pacred's PHP system had per-customer pay-later. Customers ordered;
-- back office tracked the running tab; customer settled within N days
-- via bank transfer. In Pacred-web today, profiles already carries
-- credit_limit / credit_days / credit_enabled (migration 0003 column-
-- preserved from the PHP port), but NOTHING uses them — the wallet UI
-- has a "เครดิต" panel wired to wallet.credit_balance that always
-- reads 0 because no code ever writes to that bucket.
--
-- This migration lights up the feature end-to-end at the DB layer:
--
--   1. Extends wallet_transactions.kind with two new values:
--        credit_charge        — customer used credit (negative debit,
--                                bucket='credit'). Increases outstanding.
--        credit_payment       — customer paid back outstanding (positive
--                                credit, bucket='credit'). Decreases it.
--        wallet_to_credit_transfer — settlement of a credit_payment from
--                                the customer's main wallet (negative
--                                debit, bucket='main'). Paired 1:1 with
--                                a credit_payment row that has the same
--                                reference_id (the pair_id).
--
--   2. Adds reference_type='credit_settlement' so the
--      wallet_to_credit_transfer + credit_payment pair can share a
--      reference_id (the credit_payment row's id). This is the
--      idempotency anchor: partial-unique on the slice prevents the
--      same settlement happening twice.
--
--   3. Creates v_customer_credit_outstanding — the source of truth for
--      "how much does customer X owe right now". Per-row SUM over
--      bucket='credit' completed txns (credit_charge is negative,
--      credit_payment is positive). Flipped to positive (owed amount)
--      for display. RLS via security_invoker so a customer only sees
--      their own row.
--
--   4. Adds profiles.credit_terms_days alias semantic guard — the
--      existing migration 0003 column `credit_days` is the canonical
--      term-days field. We keep that name; UI labels it "ระยะเครดิต
--      (วัน)" / "Credit terms (days)". No schema change for terms —
--      this comment exists so a future agent doesn't add a duplicate
--      column from the upgrade-plan wording.
--
--   5. Partial-unique guard on the settlement pair so a double-click /
--      retry of customerPayCreditFromWallet can't double-debit. Mirrors
--      the 0049 / 0061 / 0063 pattern: keyed on the pair_id slice.
--
-- ── What we do NOT do ───────────────────────────────────────────────
-- - We do NOT touch the dead `wallet.credit_balance` column. The
--   0007 balance trigger will keep recomputing it from the new
--   bucket='credit' txns automatically (sum of completed) — so it
--   becomes the running NET (credit_payment - credit_charge = the
--   NEGATIVE of outstanding, or zero if fully settled). The VIEW is
--   the authoritative read surface for outstanding; the column stays
--   as a side-effect ledger sum, NOT a thing we update directly.
-- - We do NOT touch profiles.credit_limit (column already exists from
--   migration 0003 with numeric(10,2)). Admin write goes through
--   adminSetCustomerCreditLimit which respects the 0062 W-1 role pin.
-- - We do NOT add a separate `credit_transactions` table. Keeping
--   the ledger unified means existing wallet history UI, audit
--   triggers (0062 G-6), overdraw guard (0064), and admin reports
--   all pick up credit txns for free. See migration footer for the
--   "open question" record.
--
-- ── RLS / W-1 ───────────────────────────────────────────────────────
-- Per AGENTS.md §1 + migration 0062: every admin policy on a money
-- table MUST be role-pinned (no bare is_admin()). We add no new
-- policies on wallet / wallet_transactions — the existing 0062 admin
-- policies cover the new credit txns automatically because RLS is
-- per-row, not per-kind. profiles.credit_limit writes already gated
-- by the 0062 profiles_admin_all (super, ops, accounting, sales_admin)
-- policy; the action layer further narrows to super+accounting for
-- credit-limit changes specifically.
--
-- Idempotent: drop-if-exists / create-or-replace / additive index.
-- Zero data migration. Safe to apply on prod live.
-- ════════════════════════════════════════════════════════════

-- ── 1) Extend wallet_transactions.kind CHECK with credit values ────
-- Mirrors 0061 pattern: drop the auto-named CHECK, recreate as strict
-- superset so re-applying never rejects existing rows.
alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_kind_check;

alter table public.wallet_transactions
  add constraint wallet_transactions_kind_check check (kind in (
    'deposit','withdraw','refund','adjustment',
    'order_payment','order_top_up',
    'import_payment','import_top_up',
    'yuan_payment',
    'cashback_earn','cashback_redeem',
    'cost_adjustment',
    -- U4-2 credit-line ledger values:
    'credit_charge',              -- bucket='credit', amount<0 (debit). Customer used credit.
    'credit_payment',             -- bucket='credit', amount>0 (credit). Customer paid back.
    'wallet_to_credit_transfer'   -- bucket='main',   amount<0 (debit). Main-wallet leg of settlement.
  ));

comment on constraint wallet_transactions_kind_check on public.wallet_transactions is
  '0071/U4-2 — extends 0061 with credit_charge + credit_payment + wallet_to_credit_transfer for customer credit line. Pair (credit_payment, wallet_to_credit_transfer) share reference_id = the credit_payment row id; wallet_tx_credit_settlement_uniq enforces 1 pair per settlement.';

-- ── 2) Extend wallet_transactions.reference_type with credit_settlement ──
-- Mirrors 0063 pattern. The pair (credit_payment on bucket='credit',
-- wallet_to_credit_transfer on bucket='main') uses reference_type=
-- 'credit_settlement' so they're queryable as a unit. reference_id =
-- the credit_payment row id (the canonical pair_id).
alter table public.wallet_transactions
  drop constraint if exists wallet_transactions_reference_type_check;

alter table public.wallet_transactions
  add constraint wallet_transactions_reference_type_check check (
    reference_type in (
      'order_header','forwarder','yuan_payment','freight_invoice','manual',
      'credit_settlement'
    )
  );

comment on constraint wallet_transactions_reference_type_check on public.wallet_transactions is
  '0071/U4-2 — extends 0063 with credit_settlement. The (credit_payment, wallet_to_credit_transfer) pair share reference_id = the credit_payment row id (the canonical pair anchor).';

-- ── 3) profiles.credit_terms_days note ─────────────────────────────
-- Migration 0003 already added `credit_days int` (the canonical
-- term-days column). The upgrade-plan wording "credit_terms_days"
-- maps to it. We add a column comment so future agents don't add a
-- duplicate column from the spec wording.
comment on column public.profiles.credit_days is
  '0071/U4-2 — payment terms in days for the customer credit line (was tb_users.creditDay in PHP). The upgrade-plan calls this credit_terms_days; same field. Default 30 when credit_limit > 0 (set by adminSetCustomerCreditLimit).';

comment on column public.profiles.credit_limit is
  '0071/U4-2 — maximum outstanding credit (THB) a customer may carry. The upgrade-plan calls this credit_limit_thb; same field. v_customer_credit_outstanding enforces outstanding <= credit_limit at write time via adminChargeToCredit.';

-- ── 4) Outstanding-credit view — single source of truth for "owed" ─
-- Per-profile aggregate of completed bucket='credit' txns, flipped to
-- positive ("owed amount"). credit_charge rows are negative (debit);
-- credit_payment rows are positive (credit) — sum is the running NET
-- the customer's wallet.credit_balance also tracks. We flip sign so a
-- positive outstanding_thb reads naturally as "customer owes us".
--
-- security_invoker = on means RLS on the underlying tables applies as
-- the caller (per Supabase view RLS norm). So:
--   - customer reads only their own row (wallet_tx select policy +
--     profiles select policy both gate by auth.uid())
--   - admins read all rows (0062 admin SELECT policies on the same
--     tables let through their role array)
-- The view itself takes no policies — they live on the base tables.
drop view if exists public.v_customer_credit_outstanding;

create view public.v_customer_credit_outstanding
  with (security_invoker = true)
as
select
  p.id                                                       as profile_id,
  p.credit_limit                                             as credit_limit_thb,
  coalesce(p.credit_days, 30)                                as credit_terms_days,
  -- Sum of completed bucket='credit' txns:
  --   credit_charge  → negative (e.g. -500)
  --   credit_payment → positive (e.g. +500)
  -- Net is the customer's running credit_balance (also held in
  -- wallet.credit_balance via the 0007 trigger). We flip the sign so
  -- a POSITIVE outstanding_thb = "customer owes Pacred this much".
  -- coalesce so a customer with zero credit txns reads 0.
  (-coalesce(
    (
      select sum(wt.amount)
        from public.wallet_transactions wt
       where wt.profile_id = p.id
         and wt.bucket     = 'credit'
         and wt.kind       in ('credit_charge', 'credit_payment')
         and wt.status     = 'completed'
    ),
    0
  ))::numeric(12,2)                                          as outstanding_thb,
  -- Available credit headroom = limit - outstanding (negative means
  -- they're over-limit; UI surfaces that as a warning, write actions
  -- refuse to push further).
  (p.credit_limit + coalesce(
    (
      select sum(wt.amount)
        from public.wallet_transactions wt
       where wt.profile_id = p.id
         and wt.bucket     = 'credit'
         and wt.kind       in ('credit_charge', 'credit_payment')
         and wt.status     = 'completed'
    ),
    0
  ))::numeric(12,2)                                          as available_credit_thb
from public.profiles p
where p.credit_limit > 0
   or exists (
        select 1
          from public.wallet_transactions wt
         where wt.profile_id = p.id
           and wt.bucket     = 'credit'
           and wt.kind       in ('credit_charge', 'credit_payment')
       );

comment on view public.v_customer_credit_outstanding is
  '0071/U4-2 — single source of truth for customer credit-line state. Per-profile: credit_limit_thb, credit_terms_days, outstanding_thb (positive = owed), available_credit_thb (limit - outstanding). security_invoker so RLS on profiles + wallet_transactions enforces: customer reads own row, admins read all. Filters to profiles with a non-zero limit OR existing credit activity to keep the view small.';

-- ── 5) Partial-unique guard on settlement pair ─────────────────────
-- Each (credit_payment, wallet_to_credit_transfer) pair shares
-- reference_id = the credit_payment row id (the pair anchor). To
-- guarantee a customer's double-click / network retry / form re-POST
-- can NEVER double-debit the main wallet, partial-unique the
-- wallet_to_credit_transfer slice on (reference_id) — only one
-- completed transfer per pair-id is allowed.
-- (We don't unique the credit_payment side itself because that one
--  *generates* the reference_id; it has no prior id to conflict on.)
create unique index if not exists wallet_tx_credit_settlement_uniq
  on public.wallet_transactions (reference_id)
  where reference_type = 'credit_settlement'
    and kind           = 'wallet_to_credit_transfer'
    and status         = 'completed';

comment on index public.wallet_tx_credit_settlement_uniq is
  '0071/U4-2 — DB guard against double-debit on customerPayCreditFromWallet. Partial unique on the wallet_to_credit_transfer slice per settlement pair_id (reference_id = the credit_payment row id). The action catches 23505 + re-SELECTs the canonical pair for idempotent retry.';

-- ── Notes / open questions captured in code ────────────────────────
-- Q: kind expansion vs separate credit_transactions table?
-- A: Kind expansion. Reasons:
--    - Reuses 0062 G-6 audit trigger (every wallet_transactions write
--      gets logged to admin_audit_log — credit txns inherit for free)
--    - Reuses 0064 overdraw guard (the wallet_to_credit_transfer leg
--      hits the main-bucket guard automatically — no parallel guard
--      to maintain)
--    - Reuses wallet history UI (the /wallet/history page renders
--      credit txns by reading the same table; we add labels not code)
--    - Customer credit_balance is already a column on wallet (0007)
--      kept in sync by the existing recompute trigger — separate
--      table would mean dead-column or duplicate-source-of-truth
--    A separate credit_transactions table would force every one of
--    those to grow a credit-aware branch. The 3-kind expansion gives
--    us the feature with zero parallel infrastructure. Documented
--    here so a future redesign has the rationale.
