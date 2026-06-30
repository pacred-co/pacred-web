-- 0229_billing_run_slip.sql
-- ภูม 2026-06-29 — วางบิล: เซลแนบสลิปได้ · บัญชีเป็นคนยืนยัน (ตัดจ่าย)
--
-- The billing-run (ใบวางบิล · tb_forwarder_invoice) had only an accounting-only
-- "บันทึกการรับชำระ" settle form — no way for the SALES rep who chases the
-- customer to attach the payment slip, and the slip never reached the accounting
-- slip-verify queue. ภูม: เซลอัพสลิป (กดยืนยันไม่ได้) → บัญชีตรวจ+ตัดจ่าย.
--
-- Adds 4 NULLABLE columns (additive · no data risk · no default backfill needed):
--   slip_path        — storage path in the "slips" bucket (signed-URL on read)
--   slip_uploaded_by — legacy admin/member id who attached it (audit)
--   slip_uploaded_at — when
--   slip_status      — NULL = no slip · 'pending' = waiting accounting · 'verified'
--                       = accounting confirmed (set when the bill is marked paid)
--
-- Money-safety: these are display/workflow columns ONLY. They do NOT touch
-- total_thb / status / wht — the actual settle stays `markBillingRunPaid`
-- (gated super/accounting). No wallet/tb_payment side-effect.

ALTER TABLE public.tb_forwarder_invoice
  ADD COLUMN IF NOT EXISTS slip_path        text,
  ADD COLUMN IF NOT EXISTS slip_uploaded_by varchar(50),
  ADD COLUMN IF NOT EXISTS slip_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS slip_status      varchar(12);

-- Queue lookup: the accounting slip-verify queue lists issued bills whose slip
-- is pending. Partial index keeps it tiny (only the rows that need attention).
CREATE INDEX IF NOT EXISTS idx_tb_forwarder_invoice_slip_pending
  ON public.tb_forwarder_invoice (slip_uploaded_at)
  WHERE slip_status = 'pending';

COMMENT ON COLUMN public.tb_forwarder_invoice.slip_status IS
  'NULL=no slip · pending=รอบัญชีตรวจ · verified=บัญชียืนยันแล้ว (set on mark-paid). ภูม 2026-06-29.';
