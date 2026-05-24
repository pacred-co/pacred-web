-- ════════════════════════════════════════════════════════════
-- 0108 · PCS-legacy hot-path indexes (Sprint-8c perf fix)
-- ════════════════════════════════════════════════════════════
-- Background — 0082 ported the legacy MySQL UNIQUE indexes (18 of them)
-- but NONE of the non-unique secondary indexes. The legacy MySQL schema
-- itself never had any — PCS Cargo ran on a tiny historic dataset and
-- never noticed. On the Supabase port the same `tb_*` tables now hold
-- ~8,898 customers + years of orders/wallet history, and EVERY chrome
-- query + protected-page query is a SEQUENTIAL SCAN:
--
--   SELECT … FROM tb_wallet_hs WHERE userid='PR123' ORDER BY id DESC
--                                       ^^^^^ no index → seq-scan entire table
--
-- The legacy `header.php` + `header-theme.php` + `left-menu.php` chrome
-- fires 17 of these per protected nav (8 are COUNT(*)). The customer
-- reported "หลังบ้านลูกค้า กดแต่ละเมนู โหลดช้ามากๆ กว่าจะไป" — 5 + seconds
-- per click. With the chrome data cached (Sprint-8b) + auth cached
-- (Sprint-8c) the bottleneck is now the per-query seq-scan cost.
--
-- Index plan — every (userid)-filtered hot query in the customer portal:
--
--   tb_wallet           (userid)             — chrome wallet total
--   tb_wallet_hs        (userid, id DESC)    — /wallet history page
--   tb_cash_back        (userid)             — chrome cashback
--   tb_credit           (userid)             — chrome credit-user check
--   tb_forwarder        (userid)             — chrome (4 distinct counts share this base index)
--   tb_forwarder        (userid, fstatus)    — chrome fstatus='5' count
--   tb_forwarder        (userid, fcredit)    — chrome fcredit='1' + fcredit/fcreditdate combo
--   tb_header_order     (userid)             — chrome total-shops count
--   tb_header_order     (userid, hstatus)    — chrome hstatus='2' count + cron auto-cancel
--   tb_payment          (userid)             — chrome payment count
--   tb_cart             (userid)             — chrome cart badge
--   tb_rate_custom_cbm  (userid)             — chrome SVIP badge
--   tb_keyword_product  (id DESC)            — chrome top-menu keyword strip
--
-- (tb_users.userid + tb_corporate.userid are already UNIQUE from 0082.)
--
-- ── How to apply ─────────────────────────────────────────────
-- This migration uses `IF NOT EXISTS` so it's idempotent and safe to
-- re-run. The statements are intentionally plain `CREATE INDEX` (no
-- `CONCURRENTLY`) so they work inside a transaction — Supabase's
-- migration runner wraps each file in one. Locks during build are
-- AccessShareLock-compatible (reads stay live; writes briefly block
-- on each table). On the current ~1M-row dataset, each index builds
-- in <30s on the Supabase Pro-tier hardware.
--
-- If a later prod is in higher-traffic state where blocking writes
-- matters, drop the indexes from this migration before applying and
-- recreate them via `CREATE INDEX CONCURRENTLY` from psql instead
-- (each in its own statement, outside any transaction).

CREATE INDEX IF NOT EXISTS idx_tb_wallet_userid
  ON public.tb_wallet (userid);

CREATE INDEX IF NOT EXISTS idx_tb_wallet_hs_userid_id_desc
  ON public.tb_wallet_hs (userid, id DESC);

CREATE INDEX IF NOT EXISTS idx_tb_cash_back_userid
  ON public.tb_cash_back (userid);

CREATE INDEX IF NOT EXISTS idx_tb_credit_userid
  ON public.tb_credit (userid);

CREATE INDEX IF NOT EXISTS idx_tb_forwarder_userid
  ON public.tb_forwarder (userid);

CREATE INDEX IF NOT EXISTS idx_tb_forwarder_userid_fstatus
  ON public.tb_forwarder (userid, fstatus);

CREATE INDEX IF NOT EXISTS idx_tb_forwarder_userid_fcredit
  ON public.tb_forwarder (userid, fcredit);

CREATE INDEX IF NOT EXISTS idx_tb_header_order_userid
  ON public.tb_header_order (userid);

CREATE INDEX IF NOT EXISTS idx_tb_header_order_userid_hstatus
  ON public.tb_header_order (userid, hstatus);

CREATE INDEX IF NOT EXISTS idx_tb_payment_userid
  ON public.tb_payment (userid);

CREATE INDEX IF NOT EXISTS idx_tb_cart_userid
  ON public.tb_cart (userid);

CREATE INDEX IF NOT EXISTS idx_tb_rate_custom_cbm_userid
  ON public.tb_rate_custom_cbm (userid);

CREATE INDEX IF NOT EXISTS idx_tb_keyword_product_id_desc
  ON public.tb_keyword_product (id DESC);

-- Make the planner pick the new indexes immediately (instead of waiting
-- for autovacuum's stats to catch up).
ANALYZE public.tb_wallet;
ANALYZE public.tb_wallet_hs;
ANALYZE public.tb_cash_back;
ANALYZE public.tb_credit;
ANALYZE public.tb_forwarder;
ANALYZE public.tb_header_order;
ANALYZE public.tb_payment;
ANALYZE public.tb_cart;
ANALYZE public.tb_rate_custom_cbm;
ANALYZE public.tb_keyword_product;
