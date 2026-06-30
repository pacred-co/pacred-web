-- 0230_forwarder_exception.sql
-- เดฟ 2026-06-30 (gap G7 · owner "อุดจุดบอด") — parcel-exception handling
--
-- The China-ops chats constantly surface parcel exceptions with NO place to
-- record them in Pacred: พัสดุไม่ใช่ของลูกค้า · ของแตก/ชำรุด · ตู้ตีกลับ ·
-- ของติดด่าน · PR สลับ/ทักผิดราย. Staff had no way to FLAG a ฝากนำเข้า
-- (tb_forwarder) row as an exception, record it (note + photo), and see a
-- queue of open exceptions.
--
-- This adds the SAFE MVP backing store: flag + record + queue ONLY. Five
-- NULLABLE columns (additive · no default backfill · no data risk):
--
--   fexception_type    — not_mine / damaged / container_returned / customs_held
--                        / wrong_pr / other  (the exception kind)
--   fexception_note    — staff's free-text detail
--   fexception_photo   — storage path in the "slips" bucket (signed-URL on read)
--   fexception_status  — NULL = no exception · 'open' = needs follow-up ·
--                        'resolved' = closed out
--   fexception_at      — when it was flagged (or resolved)
--   fexception_by      — legacy admin id who flagged/resolved it (audit)
--
-- 🔒 MONEY/OWNERSHIP SAFETY (the whole point of the SAFE MVP):
--   These columns are a RECORD-ONLY exception log. They DO NOT touch and have
--   NO trigger/FK onto any money or ownership field — fstatus, ftotalprice /
--   any f*price, fweight/fvolume, userid, billing (tb_forwarder_invoice),
--   tb_credit, tb_wallet*, tb_payment. Re-tagging a customer (wrong_pr /
--   not_mine), adjusting a bill, or moving status stays on the EXISTING audited
--   paths (the inline [แก้ไข ลูกค้า] field · the วางบิล button · the status
--   workflow), which an owner/accounting must drive. No FK to any money table.

ALTER TABLE public.tb_forwarder
  ADD COLUMN IF NOT EXISTS fexception_type   varchar(20),
  ADD COLUMN IF NOT EXISTS fexception_note   text,
  ADD COLUMN IF NOT EXISTS fexception_photo  text,
  ADD COLUMN IF NOT EXISTS fexception_status varchar(10),
  ADD COLUMN IF NOT EXISTS fexception_at     timestamptz,
  ADD COLUMN IF NOT EXISTS fexception_by     varchar(50);

-- Queue lookup: the exceptions queue lists only rows whose exception is OPEN.
-- A partial index keeps it tiny (only the handful of rows that need attention),
-- ordered by when they were flagged (newest-first on read).
CREATE INDEX IF NOT EXISTS idx_tb_forwarder_exception_open
  ON public.tb_forwarder (fexception_at DESC)
  WHERE fexception_status = 'open';

COMMENT ON COLUMN public.tb_forwarder.fexception_status IS
  'NULL=ไม่มีปัญหา · open=มีปัญหา รอดำเนินการ · resolved=ปิดเคสแล้ว. '
  'RECORD-ONLY exception log — never touches money/status/ownership. เดฟ 2026-06-30 (mig 0230).';
COMMENT ON COLUMN public.tb_forwarder.fexception_type IS
  'not_mine / damaged / container_returned / customs_held / wrong_pr / other. เดฟ 2026-06-30.';
