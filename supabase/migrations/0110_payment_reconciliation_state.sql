-- ════════════════════════════════════════════════════════════
-- V-A3 (Phase 2) · payment ↔ order reconciliation state
-- ════════════════════════════════════════════════════════════
-- Companion to migration 0043 (slip_transferred_at) + the existing
-- /admin/accounting/reconcile (forwarder status auto-clear, ภูม Phase G).
-- Per [PORT_PLAN](docs/PORT_PLAN.md) Part V row V-A3 + the legacy
-- credit-pending logic in
--   /Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/
--     member/pcs-admin/forwarder.php:1431  (sets fCredit=1, fCreditDate)
--     member/pcs-admin/forwarder-action.php:185-186  (fCreditError filter:
--       "AND fCredit='1' AND fCreditDate<NOW()")
-- — the legacy system flagged credit-pending forwarders for follow-up
-- but had **no link** between the slip the customer uploaded later and
-- the credit-pending forwarder it was meant to clear. Staff did this
-- by hand in MySQL.
--
-- This migration extends `wallet_transactions` with the reconciliation
-- state the admin UI needs to surface "matched / mismatch / unmatched"
-- buckets at the slip level (distinct from the forwarder-status auto-
-- clear flow ภูม already shipped).
--
-- All columns are nullable + default null → 0 impact on legacy /
-- in-flight rows. Pure additive change.
-- (เดฟ — V-A3 dave-pacred lane.)
-- ════════════════════════════════════════════════════════════

alter table public.wallet_transactions
  add column if not exists reconciliation_status text;

-- Legal values when set:
--   'matched'        — auto-matched by the system (single completed wallet_tx ↔ one
--                      credit-pending forwarder, same userid, amount within tolerance)
--   'manual_match'   — admin force-matched via adminManualMatch (cross-link recorded)
--   'unmatched'      — admin reviewed + confirmed no matching credit order;
--                      routes to refund queue or write-off
--   null             — not yet reviewed (default; new + legacy rows)
alter table public.wallet_transactions
  add constraint wallet_transactions_reconciliation_status_chk
  check (reconciliation_status is null
         or reconciliation_status in ('matched', 'manual_match', 'unmatched'))
  not valid;

alter table public.wallet_transactions
  add column if not exists reconciliation_note text;

-- Cross-link to the forwarder that this deposit slip was applied against.
-- Set when reconciliation_status = 'matched' or 'manual_match'.
-- Nullable: deposits not tied to a specific forwarder (top-ups for future
-- use, etc.) stay null forever — that's a valid terminal state.
alter table public.wallet_transactions
  add column if not exists reconciled_forwarder_id uuid
  references public.forwarders(id) on delete set null;

alter table public.wallet_transactions
  add column if not exists reconciled_at timestamptz;

alter table public.wallet_transactions
  add column if not exists reconciled_by uuid
  references public.profiles(id) on delete set null;

-- Hot path: "list unreviewed deposits" — completed wallet_tx with null
-- reconciliation_status. Partial index keeps it tiny + fast.
create index if not exists wallet_transactions_reconciliation_pending_idx
  on public.wallet_transactions(profile_id, created_at desc)
  where status = 'completed'
    and kind   = 'deposit'
    and reconciliation_status is null;

-- "Already matched to forwarder X" lookup
create index if not exists wallet_transactions_reconciled_forwarder_idx
  on public.wallet_transactions(reconciled_forwarder_id)
  where reconciled_forwarder_id is not null;

comment on column public.wallet_transactions.reconciliation_status is
  'V-A3 Phase 2: slip↔order reconciliation outcome. null=unreviewed, matched=auto, manual_match=admin override, unmatched=routed to refund queue. See actions/admin/payment-reconciliation.ts.';

comment on column public.wallet_transactions.reconciled_forwarder_id is
  'V-A3 Phase 2: the forwarder this deposit cleared (legacy fCredit follow-up). Set when status moves out of null.';

comment on column public.wallet_transactions.reconciled_at is
  'V-A3 Phase 2: when reconciliation_status was set (audit + race-safety).';

comment on column public.wallet_transactions.reconciled_by is
  'V-A3 Phase 2: which admin set the reconciliation_status (NULL for system-auto matches).';
