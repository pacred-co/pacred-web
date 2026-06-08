-- ============================================================
-- 0156 — courier / Lalamove tracking-URL on tb_forwarder
-- ============================================================
-- Theme: AIR-import external-courier dispatch (2026-06-08 gap analysis #2).
--
-- Why this exists:
--   Some forwarder rows are delivered last-mile by an EXTERNAL courier
--   (Lalamove / Grab / a 3rd-party truck) rather than a Pacred driver
--   batch. Those couriers issue their own tracking URL. Until now there
--   was nowhere to store it, so ops staff pasted the URL into a LINE chat
--   and the customer could not see live last-mile status on the order
--   detail page.
--
--   This adds ONE nullable text column on tb_forwarder so:
--     - ops sets it on the driver-batch / dispatch admin page, and
--     - the customer sees a "ติดตามพัสดุ (ขนส่งภายนอก)" link on the
--       /service-import/[fNo] forwarder detail page.
--
--   It lives on tb_forwarder (not tb_forwarder_driver_item) because the
--   customer detail page reads tb_forwarder directly and a forwarder maps
--   1:1 to its current last-mile dispatch — keeping the value here makes
--   it directly customer-displayable with no extra join.
--
-- camelCase note: tb_forwarder uses lowercase columns (fcabinetnumber,
-- fstatus, fcabinet_locked, etc.). courier_tracking_url follows that
-- snake/lowercase convention. NEVER add quotes around it.
--
-- Reach: 47,666 existing rows get NULL (zero behavioural change). Index is
-- PARTIAL on NOT NULL so the "rows with an external courier link" query is
-- cheap; the customer page reads it by id (already indexed PK).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS · safe to re-run.
-- ============================================================

ALTER TABLE public.tb_forwarder
  ADD COLUMN IF NOT EXISTS courier_tracking_url text;

CREATE INDEX IF NOT EXISTS tb_forwarder_courier_tracking_url_idx
  ON public.tb_forwarder (id)
  WHERE courier_tracking_url IS NOT NULL;

COMMENT ON COLUMN public.tb_forwarder.courier_tracking_url IS
  'External last-mile courier tracking URL (Lalamove / Grab / 3rd-party truck). Set by ops on the driver-batch/dispatch admin page; shown to the customer on /service-import/[fNo] as a "ติดตามพัสดุ (ขนส่งภายนอก)" link. NULL = no external courier link. Added 2026-06-08 (gap analysis #2 · AIR-import dispatch).';

-- NEXT FREE = 0157
