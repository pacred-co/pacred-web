-- ============================================================
-- 0159 — concurrent-edit heartbeat lock on tb_header_order
-- ============================================================
-- Theme: prevent two staff from silently clobbering each other's
-- edits on the same shop-order (ฝากสั่งซื้อ) edit page.
--
-- Why this exists (legacy `pcs-admin/include/pages/shops/updateLock.php`
-- + `update.php` L499-511 jQuery setInterval):
--   When admin opens `?page=update&id=<hno>` to edit a shop order,
--   the page calls `updateLock.php` every 60 seconds to UPDATE the
--   header's `session` (= admin's PHP session ID) and `hlockdate`
--   (= NOW + 60s). If another admin opens the same order and sees
--   `hlockdate > NOW` for a DIFFERENT session, the second admin
--   sees a banner "กำลังถูกแก้ไขโดย admin XYZ" + edit buttons
--   disabled until they manually override.
--
--   Today (post-Wave 31 5-tab workflow), two staff editing the
--   same order simultaneously silently clobber each other (last
--   write wins, the other's edits are lost). The 5-tab workflow
--   only just shipped — this will become felt as more ops adopt.
--   ภูม flagged this as E4 in shop-order-deep-2026-06-02.md §3.
--
-- Why NEW columns (not reuse legacy `session` + `hlockdate`):
--   The legacy columns exist on the schema (tb_header_order L2554-
--   2556) but they are varchar(100) `session` + `timestamp without
--   time zone` `hlockdate` with NOT-NULL defaults — written by the
--   legacy PHP only. We add explicit, nullable Pacred-native
--   columns so we can:
--     (a) store the human-readable adminID (varchar(50)) instead
--         of an opaque PHP session ID — UI banner can show "admin_pee"
--         not "abcd1234efgh5678";
--     (b) use timestamptz so we get correct interval comparison vs
--         NOW() across UTC/ICT — `hlockdate` (timestamp w/o tz) is
--         legacy-PHP-style and ambiguous;
--     (c) leave the legacy fields untouched (a parallel PHP install
--         could still write them) — zero behavioural change for any
--         non-Pacred consumer of tb_header_order.
--
-- Semantics:
--   hlockedby IS NULL AND hlockedat IS NULL
--     → no admin holds the lock (free to acquire).
--
--   hlockedby = '<adminID>' AND hlockedat > NOW()
--     → adminID currently holds the lock; it expires at hlockedat.
--     Another admin sees an amber banner + edit buttons disabled.
--
--   hlockedby = '<adminID>' AND hlockedat <= NOW()
--     → lock expired (admin closed tab / browser crashed / window
--     navigated away without firing the unlock). Any admin may
--     re-acquire by writing a fresh hlockedat = NOW() + 60s.
--
--   Set by: `actions/admin/service-orders-lock.ts ::
--   lockServiceOrder({hNo})` — UPSERTs the lock if currently
--   unlocked OR held by same admin OR expired.
--
--   Cleared by: `unlockServiceOrder({hNo})` on unmount /
--   beforeunload (best-effort) AND by the next acquirer (no
--   cleanup job needed).
--
-- 60-sec TTL convention:
--   The client island heartbeats every 50 seconds — giving a 10-sec
--   safety margin so a slow round-trip never lets the lock expire
--   under the active editor.
--
-- Server-side mutation block:
--   NOT enforced at the server layer in this migration. The lock
--   is a UI-only courtesy guard — if two staff REALLY want to
--   clobber each other they can. Server-enforced refusal is a
--   future hardening step (would need to plumb the lock check
--   into every header-edit action — bigger surface).
--
-- Reach:
--   - 21,950 existing rows get NULL/NULL (no behavioural change).
--   - Idempotent: `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF
--     NOT EXISTS` — safe to re-run.
--
-- Index strategy:
--   Plain index on `hlockedat` (NOT partial on `hlockedat > NOW()`
--   — that would require an IMMUTABLE function and PostgreSQL
--   refuses NOW() in a partial index predicate). The full index is
--   tiny (most rows have NULL → skipped by Postgres' NULL handling
--   in btree). Lookups by `hlockedby` are not needed (the banner
--   query is "is THIS hno currently locked by ANYONE else", keyed
--   by hno PK).
--
-- camelCase note: tb_header_order uses lowercase columns
-- (hstatus, hlockdate, hdatepayment, etc.) — hlockedby +
-- hlockedat follow that convention. NEVER add quotes.
-- ============================================================

ALTER TABLE public.tb_header_order
  ADD COLUMN IF NOT EXISTS hlockedby varchar(50);

ALTER TABLE public.tb_header_order
  ADD COLUMN IF NOT EXISTS hlockedat timestamptz;

CREATE INDEX IF NOT EXISTS tb_header_order_hlockedat_idx
  ON public.tb_header_order (hlockedat);

COMMENT ON COLUMN public.tb_header_order.hlockedby IS
  'Heartbeat-lock owner (adminID, e.g. "admin_pee") · NULL = unlocked. Pacred-native column (legacy `session` is varchar(100) PHP-session-id, kept untouched). Cleared by unlockServiceOrder OR overwritten on next acquire. Added 2026-06-09 to prevent two staff silently clobbering each other on the shop-order /edit page (legacy updateLock.php · faithful port).';

COMMENT ON COLUMN public.tb_header_order.hlockedat IS
  'Heartbeat-lock expiry timestamp (timestamptz, set to NOW() + 60s on every heartbeat) · NULL = unlocked. When NOT NULL AND hlockedat > NOW(), hlockedby holds the lock; otherwise the lock is free to acquire. Client island heartbeats every 50 seconds (10-sec safety margin). Pacred-native column (legacy `hlockdate` is timestamp w/o tz, kept untouched).';

-- NEXT FREE = 0160
