-- ============================================================
-- 0158 — per-item delivered-at timestamp on tb_forwarder_driver_item
-- ============================================================
-- Theme: precise "delivered today / last 7 days" filter on the
-- sales/accounting oversight surface (/admin/driver-runs).
--
-- Why this exists (read carefully):
--   On 2026-06-09 round-6 agent A swapped `/admin/driver-runs/page.tsx`
--   from the §0e rebuilt-empty `forwarder_driver` (0 rows) to the live
--   legacy `tb_forwarder_driver_item` (29,782 rows). That schema-swap
--   restored visibility for sales/accounting — but the legacy schema has
--   NO per-item completed-at timestamp. The "เสร็จล่าสุด · 7 วันที่ผ่านมา"
--   section had to proxy "recent" via `tb_forwarder_driver.fddate`
--   (= when the BATCH was created), joined through the item. Imprecise:
--   a batch created 10 days ago whose driver delivers an item today
--   would FALL OUT of the 7-day filter (the batch's fddate is > 7d old)
--   so the just-delivered item is invisible to disbursement / sales.
--
--   This migration adds the missing per-item delivered-at column so the
--   filter can ask the precise question — "items whose delivery flip
--   happened in the last 7 days" — irrespective of when their parent
--   batch was opened. ภูม flagged this in the pre-handoff round.
--
-- Semantics:
--   fdicompletedat IS NULL                    → either (a) the item is
--                                                still pending (fdistatus
--                                                '' or '1'), OR (b) it was
--                                                delivered BEFORE this
--                                                migration was applied
--                                                (pre-existing 28k delivered
--                                                rows · we intentionally do
--                                                NOT backfill — see "Reach"
--                                                below). The page filter
--                                                falls back to batch.fddate
--                                                proxy in case (b) so old
--                                                rows still render.
--
--   fdicompletedat IS NOT NULL                → the item went through the
--                                                deliver flip ('1' → '2')
--                                                AFTER 0158 was applied.
--                                                The page filter uses the
--                                                exact timestamp.
--
--   Set by: `actions/admin/driver-work.ts :: transitionItemStatus(...,
--           action="deliver")` — in the same UPDATE that flips
--           fdistatus '1' → '2' (atomic with the status change so a
--           successful flip without a timestamp is not possible).
--
--   NOT set by: the "load" path (fdistatus '' → '1' — this is "ขึ้นรถ",
--               not delivered) and NOT set by the "fail" path (fdistatus
--               → '3'). Only the success-delivered terminal state writes
--               the column. If a customer is re-delivered after a failed
--               attempt, the column captures the SUCCESSFUL delivery time.
--
-- Reach:
--   - 29,782 existing rows get NULL (no behavioural change for them).
--   - We intentionally do NOT backfill the ~28k delivered rows from
--     batch.fddate — batch.fddate ≠ per-item delivered-at (a batch can
--     deliver across multiple days; backfilling would invent fake
--     precision). Page falls back to batch.fddate proxy for NULL values.
--   - Only NEW deliveries (post-migration) get a precise timestamp.
--
-- Index strategy:
--   Partial DESC index on `fdistatus = '2'` only — the filter is always
--   "delivered items, newest first". Excluding fdistatus '' / '1' / '3'
--   from the index keeps it lean (only ~28k delivered rows indexed
--   today, growing slowly · NULLS LAST so post-migration rows sort
--   to the top deterministically).
--
-- camelCase note: tb_forwarder_driver_item uses lowercase columns
-- (fdistatus, fdipictureon, fdipictureoff, etc.) — fdicompletedat
-- follows that convention. NEVER add quotes around it.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS · CREATE INDEX IF NOT EXISTS ·
-- safe to re-run.
-- ============================================================

ALTER TABLE public.tb_forwarder_driver_item
  ADD COLUMN IF NOT EXISTS fdicompletedat timestamptz;

CREATE INDEX IF NOT EXISTS tb_forwarder_driver_item_fdicompletedat_idx
  ON public.tb_forwarder_driver_item (fdicompletedat DESC NULLS LAST)
  WHERE fdistatus = '2';

COMMENT ON COLUMN public.tb_forwarder_driver_item.fdicompletedat IS
  'Per-item delivered-at timestamp · set by actions/admin/driver-work.ts on the deliver flip (fdistatus 1→2) · NULL = item still pending OR delivered pre-0158 (page falls back to batch.fddate proxy for NULL · NOT backfilled because batch.fddate ≠ per-item delivered-at). Added 2026-06-09 to give /admin/driver-runs a precise "เสร็จล่าสุด 7 วัน" filter after the round-6 schema-swap from rebuilt forwarder_driver (0 rows) to live tb_forwarder_driver_item (29,782 rows).';

-- NEXT FREE = 0159
