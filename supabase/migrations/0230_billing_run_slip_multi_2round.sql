-- 0230_billing_run_slip_multi_2round.sql
-- ภูม 2026-06-30 — วางบิล slip: หลายรูป + ตรวจ 2 รอบ (ให้เหมือนหน้า wallet)
--
-- 0229 added a SINGLE slip_path. ภูม wants (1) attach MANY slip images, and
-- (2) the SAME 2-round verify flow accounting uses on /admin/wallet/[id]
-- (ตรวจสลิป รอบ 1 → อนุมัติ+ตัดจ่าย รอบ 2 · mig 0198 `reviewed_at` on tb_wallet_hs).
--
-- Adds (additive · safe · no real prod slips yet — 0229 is brand new):
--   slip_paths       jsonb  — array of storage paths (multi-slip). slip_path (0229)
--                              kept as the latest/primary for the dashboard thumb.
--   slip_reviewed_at timestamptz — round-1 stamp (บัญชี "ตรวจสลิป รอบ 1"). markBillingRunPaid
--                              (รอบ 2 · ตัดจ่าย) refuses until this is set when a slip exists.
--   slip_reviewed_by varchar(50)
--
-- Money-safety: display/workflow columns ONLY — never total/status/wht. The settle
-- stays markBillingRunPaid (gated super/accounting/ultra). No wallet side-effect.

ALTER TABLE public.tb_forwarder_invoice
  ADD COLUMN IF NOT EXISTS slip_paths       jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS slip_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS slip_reviewed_by varchar(50);

COMMENT ON COLUMN public.tb_forwarder_invoice.slip_paths IS
  'array ของ path สลิป (หลายรูป) · ภูม 2026-06-30. slip_path = ตัวล่าสุด/หลัก.';
COMMENT ON COLUMN public.tb_forwarder_invoice.slip_reviewed_at IS
  'ตรวจสลิป รอบ 1 (บัญชี) — ตัดจ่ายรอบ 2 ทำไม่ได้จนกว่าจะมีค่านี้ (ถ้ามีสลิป). ภูม 2026-06-30.';
