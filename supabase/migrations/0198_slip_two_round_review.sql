-- 0198_slip_two_round_review.sql
-- Owner 2026-06-21 (A4 · D2 resolved: same admin may do both rounds) — the
-- accountant slip-verify must be a real TWO-ROUND check: ROUND 1 (ตรวจสลิป) →
-- ROUND 2 (อนุมัติ + ตัดจ่าย). Before this, approve was a single 1-click '1'→'2'.
--
-- Design = a precondition FLAG, not a new status value (so the pending queues
-- that filter status='1' / paystatus='1' don't change shape): the row stays
-- pending until the FINAL approve; `reviewed_at` records that round-1 happened,
-- and the approve actions refuse to settle until `reviewed_at` is set.
--
-- Adds `reviewed_at` + `reviewed_by_admin_id` to BOTH slip-carrying tables.
-- Additive + nullable + idempotent (no table rewrite · no default).

ALTER TABLE public.tb_wallet_hs
  ADD COLUMN IF NOT EXISTS reviewed_at          timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by_admin_id text;

ALTER TABLE public.tb_payment
  ADD COLUMN IF NOT EXISTS reviewed_at          timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by_admin_id text;

COMMENT ON COLUMN public.tb_wallet_hs.reviewed_at IS
  'A4 (owner 2026-06-21) — round-1 slip-review stamp. The approve (round-2) refuses to settle until this is set. NULL = not yet round-1 reviewed.';
COMMENT ON COLUMN public.tb_payment.reviewed_at IS
  'A4 (owner 2026-06-21) — round-1 yuan-slip-review stamp. Approve refuses until set.';
