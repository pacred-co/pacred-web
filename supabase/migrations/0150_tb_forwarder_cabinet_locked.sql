-- ============================================================
-- 0150 — cabinet manual override + lock flag (B4 / backlog #259)
-- ============================================================
-- Theme: defensive belt vs MOMO/partner sync overwriting an
-- admin's manual cabinet correction.
--
-- Why this exists (read carefully — money-adjacent):
--   On 2026-05-29 MOMO sent routing batch IDs (PR20260527-SEA02)
--   into the container_no field instead of real cabinets
--   (GZS260529-1). Staff manually fixed tb_forwarder.fcabinetnumber
--   for affected rows — but the next MOMO cron tick (every 10 min)
--   OVERWROTE the fix back to the wrong value because propagation
--   was unconditional. Wave 26 shipped "Option A" = root-cause fix
--   in propagation (never write MOMO routing batch IDs as cabinets,
--   see lib/integrations/momo-isolated/propagate.ts:60-64). This
--   migration is "Option B" = staff defensive belt — a per-row
--   lock flag that MOMO/partner sync MUST honour.
--
-- Semantics:
--   fcabinet_locked = false (default) → MOMO/partner sync may write
--                                       fcabinetnumber per existing
--                                       forward-only rules
--   fcabinet_locked = true            → MOMO/partner sync MUST skip
--                                       fcabinetnumber on this row.
--                                       The manual value stays.
--
-- Reach: 47,666 existing rows get `false` (zero behavioural change).
-- Only locked rows skip sync. Index is PARTIAL on locked=true so the
-- "find locked rows for staff alerting" query is cheap.
--
-- camelCase note: tb_forwarder uses lowercase columns (fcabinetnumber,
-- fstatus, etc.) — fcabinet_locked follows that convention. NEVER add
-- quotes around it.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS · safe to re-run.
-- ============================================================

ALTER TABLE public.tb_forwarder
  ADD COLUMN IF NOT EXISTS fcabinet_locked boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS tb_forwarder_fcabinet_locked_idx
  ON public.tb_forwarder (fcabinet_locked)
  WHERE fcabinet_locked = true;

COMMENT ON COLUMN public.tb_forwarder.fcabinet_locked IS
  'true = admin manually locked the cabinet · MOMO/partner sync MUST skip fcabinetnumber on this row. Added 2026-06-08 backlog #259 (B4 · "Option B" belt-and-suspenders vs partner-API misroutes — see lib/integrations/momo-isolated/propagate.ts and CLAUDE.md Wave 26 history).';

-- NEXT FREE = 0151
