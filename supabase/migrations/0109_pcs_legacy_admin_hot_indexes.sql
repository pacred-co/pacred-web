-- ════════════════════════════════════════════════════════════
-- 0109 · PCS-legacy ADMIN hot-path indexes (Wave 21 P2 perf fix)
-- ════════════════════════════════════════════════════════════
-- Background — 0108 indexed every (userid)-filtered CUSTOMER chrome
-- query. This migration handles the mirror problem on the ADMIN side.
--
-- The admin layout calls `getSidebarCounts()` (actions/admin/sidebar-counts.ts)
-- which fires 22 sequential `count: exact, head: true` queries on EVERY
-- /admin/* page render. The legacy MySQL schema (and our faithful port
-- in 0082) carries NO non-unique secondary indexes, and 0108's
-- `(userid, fstatus)` compound indexes can't be used by a plain
-- `WHERE fstatus = '4'` query (no userid anchor) — Postgres falls back
-- to a sequential scan on 47K rows. Repeat 22 times per page render =
-- 1.5–3 s of chrome time before the page even starts rendering.
--
-- Wave 21 P2 survey: docs/research/wave-21-p2-query-survey.md
--
-- Observed: GET /admin/customers/PR2583 → 5.7s
--   ├─ next.js:          731ms
--   ├─ proxy.ts:         510ms
--   └─ application-code: 4.4s   ← ~1.5-3s is the 22 sidebar counts
--
-- Index plan — every filter column the admin chrome / dashboards /
-- reports hit (all of these are predicate-exact partial indexes where
-- the filter is a constant, which keeps the indexes 10-100× smaller
-- than full ones):
--
--   tb_forwarder        (fstatus)                        — sidebar ×4, forwarders/page ×11, kpi ×8
--   tb_forwarder        (fdate DESC)                     — 30d-window filter, accounting, kpi
--   tb_forwarder        partial fstatus='5'+paydeposit='1' — sidebar forwarderCredit
--   tb_forwarder        partial fnote!='' AND fstatus!='7' — sidebar forwarderNote
--   tb_forwarder        partial fcredit='1'              — reports/credit-pending, sidebar
--   tb_forwarder        partial fcabinetnumber + fstatus<'4' — containers in-transit
--   tb_forwarder        partial ftrackingchn!=''         — warehouse-history dupe-detection
--   tb_header_order     (hstatus)                        — sidebar ×3, kpi ×6
--   tb_header_order     (hdate DESC)                     — service-orders, accounting, kpi
--   tb_header_order     partial hnote!='' AND hstatus NOT IN ('5','6') — sidebar shopNote
--   tb_payment          (paystatus)                      — sidebar, accounting, kpi
--   tb_payment          (paydate DESC)                   — accounting + kpi date filter
--   tb_wallet_hs        partial status+amount>0          — sidebar walletTopup
--   tb_wallet_hs        partial status+amount<0          — sidebar walletWithdraw
--   tb_wallet_hs        (type, status, date DESC)        — accounting topup/withdraw/refund tabs
--   tb_wallet           partial wallettotal<0            — reports/debtors
--   tb_users            partial useractive='0'           — sidebar customerPending
--   tb_users            partial usercompany+useractive   — sidebar corporatePending
--   tb_users            (userlastlogin DESC)             — customers/recently-active
--   tb_forwarder_import2 partial WHERE fid IS NULL       — sidebar whError, warehouse orphans
--   tb_forwarder_import2 (fid, fi2date DESC) WHERE fid IS NOT NULL — warehouse-history matched
--   tb_cnt              partial cntstatus='1'            — sidebar cntUnpaid
--   tb_cnt_item         (fcabinetnumber)                 — report-cnt paidSet lookup
--
-- 23 indexes total. Most are partials — tiny disk footprint, instant
-- maintenance, razor-fast on the exact predicate the sidebar uses.
--
-- ── How to apply ─────────────────────────────────────────────
-- IF NOT EXISTS = idempotent (safe to re-run). Statements are plain
-- `CREATE INDEX` (not CONCURRENTLY) to stay inside the transaction
-- Supabase's migration runner wraps each file in. Build locks are
-- AccessShareLock-compatible (reads stay live; writes briefly block
-- on each indexed table). On Pro tier with the current data shape:
--   tb_forwarder      (47K rows)   — ~10-30s per index
--   tb_wallet_hs      (~104K rows) — ~30-60s per index
--   other tables      (<22K rows)  — <10s per index
-- Total worst case ~10-15 min during which admin writes briefly queue.
-- Apply during a quiet window (or after-hours).
--
-- If higher-traffic prod, drop the matching indexes from this file
-- and recreate via `CREATE INDEX CONCURRENTLY` from `psql` directly
-- (each in its own statement, outside any transaction).

-- ────────────────────────────────────────────────────────────
-- tb_forwarder (47K rows)
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tb_forwarder_fstatus
  ON public.tb_forwarder (fstatus);

CREATE INDEX IF NOT EXISTS idx_tb_forwarder_fdate_desc
  ON public.tb_forwarder (fdate DESC);

CREATE INDEX IF NOT EXISTS idx_tb_forwarder_credit_open
  ON public.tb_forwarder (fstatus)
  WHERE fstatus = '5' AND paydeposit = '1';

CREATE INDEX IF NOT EXISTS idx_tb_forwarder_fnote_open
  ON public.tb_forwarder (fstatus)
  WHERE fnote IS NOT NULL AND fnote <> '' AND fstatus <> '7';

CREATE INDEX IF NOT EXISTS idx_tb_forwarder_fcredit_open
  ON public.tb_forwarder (fcredit)
  WHERE fcredit = '1';

CREATE INDEX IF NOT EXISTS idx_tb_forwarder_cabinet_pre_arrival
  ON public.tb_forwarder (fcabinetnumber)
  WHERE fstatus < '4'
    AND fcabinetnumber IS NOT NULL
    AND fcabinetnumber <> ''
    AND fcabinetnumber <> '0';

CREATE INDEX IF NOT EXISTS idx_tb_forwarder_ftrackingchn
  ON public.tb_forwarder (ftrackingchn)
  WHERE ftrackingchn IS NOT NULL AND ftrackingchn <> '';

-- ────────────────────────────────────────────────────────────
-- tb_header_order (22K rows)
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tb_header_order_hstatus
  ON public.tb_header_order (hstatus);

CREATE INDEX IF NOT EXISTS idx_tb_header_order_hdate_desc
  ON public.tb_header_order (hdate DESC);

CREATE INDEX IF NOT EXISTS idx_tb_header_order_hnote_open
  ON public.tb_header_order (hstatus)
  WHERE hnote <> '' AND hstatus NOT IN ('5', '6');

-- ────────────────────────────────────────────────────────────
-- tb_payment
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tb_payment_paystatus
  ON public.tb_payment (paystatus);

CREATE INDEX IF NOT EXISTS idx_tb_payment_paydate_desc
  ON public.tb_payment (paydate DESC);

-- ────────────────────────────────────────────────────────────
-- tb_wallet_hs (~104K rows · biggest table after tb_forwarder)
-- ────────────────────────────────────────────────────────────
-- Sidebar fires two predicates: (status='1' AND amount > 0) for topup
-- and (status='1' AND amount < 0) for withdraw. Two narrow partials
-- match each predicate exactly; cheaper to maintain than a single
-- functional sign(amount) index, and the planner uses them directly.

CREATE INDEX IF NOT EXISTS idx_tb_wallet_hs_status_amount_pos
  ON public.tb_wallet_hs (status)
  WHERE amount > 0;

CREATE INDEX IF NOT EXISTS idx_tb_wallet_hs_status_amount_neg
  ON public.tb_wallet_hs (status)
  WHERE amount < 0;

CREATE INDEX IF NOT EXISTS idx_tb_wallet_hs_type_status_date
  ON public.tb_wallet_hs (type, status, date DESC);

-- ────────────────────────────────────────────────────────────
-- tb_wallet (~9K rows)
-- ────────────────────────────────────────────────────────────
-- reports/debtors only ever scans wallettotal < 0; partial keeps the
-- index tiny.

CREATE INDEX IF NOT EXISTS idx_tb_wallet_debtors
  ON public.tb_wallet (wallettotal)
  WHERE wallettotal < 0;

-- ────────────────────────────────────────────────────────────
-- tb_users (8.9K rows)
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tb_users_useractive_pending
  ON public.tb_users (useractive)
  WHERE useractive = '0';

CREATE INDEX IF NOT EXISTS idx_tb_users_company_active_pending
  ON public.tb_users (usercompany, useractive)
  WHERE usercompany = '1' AND useractive = '0';

CREATE INDEX IF NOT EXISTS idx_tb_users_lastlogin_desc
  ON public.tb_users (userlastlogin DESC NULLS LAST);

-- ────────────────────────────────────────────────────────────
-- tb_forwarder_import2 (warehouse scan events · size grows)
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tb_forwarder_import2_orphans
  ON public.tb_forwarder_import2 (fi2date DESC)
  WHERE fid IS NULL;

CREATE INDEX IF NOT EXISTS idx_tb_forwarder_import2_matched
  ON public.tb_forwarder_import2 (fid, fi2date DESC)
  WHERE fid IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- tb_cnt + tb_cnt_item
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tb_cnt_cntstatus_unpaid
  ON public.tb_cnt (cntstatus)
  WHERE cntstatus = '1';

CREATE INDEX IF NOT EXISTS idx_tb_cnt_item_fcabinetnumber
  ON public.tb_cnt_item (fcabinetnumber);

-- ────────────────────────────────────────────────────────────
-- ANALYZE — make the planner pick the new indexes immediately
-- (instead of waiting for autovacuum's stats to catch up).
-- ────────────────────────────────────────────────────────────

ANALYZE public.tb_forwarder;
ANALYZE public.tb_header_order;
ANALYZE public.tb_payment;
ANALYZE public.tb_wallet_hs;
ANALYZE public.tb_wallet;
ANALYZE public.tb_users;
ANALYZE public.tb_forwarder_import2;
ANALYZE public.tb_cnt;
ANALYZE public.tb_cnt_item;
