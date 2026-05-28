-- ════════════════════════════════════════════════════════════
-- 0109 · V-A1 (D1 faithful-port) · tb_payment.slip_transfer_time
-- ════════════════════════════════════════════════════════════
-- PORT_PLAN Part V-A1 — "Payment record stores the slip transfer time
-- (editable + audited) — not the approval-click time".
--
-- Background
-- ──────────
-- Legacy PCS Cargo `tb_payment` (migration 0081 L3611-3634) stores two
-- timestamps:
--   `paydate`       — customer's request time (INSERT at member/pcs-admin/
--                     payment.php L34 + L59 + L68 — captured server-side
--                     at the moment the customer submits the yuan-transfer
--                     request, NOT the moment they actually transferred at
--                     the bank).
--   `paydateadmin`  — admin's approval-click time (set via NOW() at
--                     member/pcs-admin/payment.php L644 + L659 in the
--                     UPDATE that flips `paystatus` to approved).
--
-- Neither captures the REAL bank-transfer time visible on the customer's
-- slip. Accounting staff want bank-reconciliation to line up with the
-- customer's actual transaction time, not the admin's click time.
--
-- Fix — add a third nullable timestamptz column `slip_transfer_time`:
--   • NULL  = no override; reconciliation falls back to `paydateadmin`
--             (or `paydate` if `paydateadmin` is NULL).
--   • value = admin-recorded actual transfer time as shown on the slip.
--
-- The reconciliation / bank-export query reads
--   coalesce(slip_transfer_time, paydateadmin, paydate)
-- so all existing reads remain backward-compatible (rows with NULL keep
-- the pre-V-A1 behaviour). The Pacred-side admin server action edits
-- this column with audit logging — every edit writes an `admin_audit_log`
-- row (action='tb_payment.set_slip_transfer_time', target_type='tb_payment',
-- payload includes {before, after}).
--
-- Validation that the new value is ≤ now() and ≥ row's `paydate` lives
-- in the server-action Zod layer (actions/admin/tb-payment.ts) — not as a
-- CHECK constraint, because legacy MySQL `paydate` rows are stored as
-- "timestamp without time zone" (no offset) and the comparison is more
-- nuanced than a raw < / > in SQL.
--
-- Indexing — V-A1 use-cases scan filtered (slip_transfer_time IS NOT NULL)
-- for "rows the admin has reconciled". Filtered index keeps the index
-- tiny since most rows are NULL.

ALTER TABLE public.tb_payment
  ADD COLUMN IF NOT EXISTS slip_transfer_time timestamptz;

COMMENT ON COLUMN public.tb_payment.slip_transfer_time IS
  'V-A1 (D1): customer''s ACTUAL bank-transfer time recorded from the slip. NULL = use paydateadmin (approval-click time) as the reconciliation timestamp. Set ONLY by admin via actions/admin/tb-payment.ts adminSetTbPaymentSlipTransferTime (super+accounting RBAC, audit-logged).';

CREATE INDEX IF NOT EXISTS idx_tb_payment_slip_transfer_time
  ON public.tb_payment (slip_transfer_time)
  WHERE slip_transfer_time IS NOT NULL;

-- Refresh planner stats so the new column is known on first query.
ANALYZE public.tb_payment;
