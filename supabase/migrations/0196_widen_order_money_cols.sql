-- 0196_widen_order_money_cols.sql
--
-- WIDEN the full money chain numeric(10,2) → numeric(14,2) (cap ~100M → ~1 trillion)
-- so the platform can take very large orders as the company scales (owner 2026-06-20
-- "ขยายให้ครบ จบๆ · บริษัทต้อง scale ใหญ่ขึ้น"). Originated as ปอน's draft (header/order/
-- payment only); เดฟ extended it to the FULL chain after a §0e sink audit.
--
-- WHY: every accumulating money TOTAL in the legacy schema (mig 0081) is numeric(10,2)
-- = caps at 99,999,999.99. An order whose grand total exceeds that throws Postgres
-- 22003 (numeric overflow) on the rollup/pay/receipt write. The cart code now guards
-- with MONEY_COL_MAX and REJECTS over-cap orders cleanly; this migration lifts the
-- ceiling end-to-end so they go through instead.
--
-- SCOPE (the §0e SINK AUDIT 2026-06-20 — prod column-width probe): widen EVERY column
-- a large order/cost total flows INTO across the whole chain, so no narrow sink remains:
--   order      → tb_header_order, tb_order
--   payment    → tb_payment
--   receipt    → tb_receipt
--   container  → tb_cnt (ค่าตู้ batch)
--   wallet     → tb_wallet, tb_wallet_hs
--   credit     → tb_credit (a scaling B2B credit line can exceed 100M)
--   forwarder  → tb_forwarder, tb_forwarder_item (cargo/import totals + fees)
-- LEFT numeric(10,2) ON PURPOSE: FX RATES (hrate/hratecost/payrate/payratecost/
-- *refrate/customrate*), PER-UNIT price (cprice), and WEIGHTS/DIMENSIONS
-- (f/product weight·height·length·width) — a rate/unit/dimension never needs >100M and
-- widening them would only mask a real fat-finger. (Doc tables tb_*_tax_invoice /
-- tb_forwarder_invoice were already created wide — verified, no action.)
--
-- vw_sales_by_rep depends on tb_forwarder.ftotalprice + tb_header_order.htotalpriceuser
-- + tb_payment.paythb (it SUMs them), so ALTER TYPE on those is blocked while the view
-- exists → DROP + recreate it around the ALTERs (the proven mig 0185 pattern). The view
-- body is captured verbatim from the live prod definition (pg_get_viewdef).
--
-- SAFETY: numeric precision INCREASE with unchanged scale is non-destructive (existing
-- values preserved exactly · PG skips the table rewrite) and prod tables here are tiny
-- (header 8 · order 12 · forwarder 90 · rest 0-11 rows) → negligible lock. Wrapped in a
-- txn so a failure rolls back atomically (the view is never left dropped). Re-runnable
-- (ALTER TYPE to the same type is a no-op; DROP VIEW IF EXISTS + CREATE recreate).
--
-- AFTER APPLYING: bump MONEY_COL_MAX 99_999_999.99 → 999_999_999_999.99 in
-- actions/cart.ts + actions/admin/cart.ts so the cart guard stops rejecting big orders.
-- NEXT FREE migration after this = 0197.

BEGIN;

-- vw_sales_by_rep blocks ALTER TYPE on the columns it sums → drop, ALTER, recreate.
DROP VIEW IF EXISTS public.vw_sales_by_rep;

-- ── order ────────────────────────────────────────────────────────────
ALTER TABLE public.tb_header_order
  ALTER COLUMN htotalpriceuser  TYPE numeric(14,2),  -- ฿ grand total
  ALTER COLUMN htotalpricechn   TYPE numeric(14,2),  -- ¥ grand total
  ALTER COLUMN hcostall         TYPE numeric(14,2),  -- ¥ cost total
  ALTER COLUMN hcostallth       TYPE numeric(14,2),  -- ฿ cost total
  ALTER COLUMN hshippingservice TYPE numeric(14,2),  -- service/เหมาๆ fee
  ALTER COLUMN fshippingservice TYPE numeric(14,2),  -- (legacy dup service fee)
  ALTER COLUMN hshippingchn     TYPE numeric(14,2),  -- china shipping total
  ALTER COLUMN hpriceupdate     TYPE numeric(14,2);  -- admin-updated total
  -- LEFT (10,2): hrate, hratecost (FX rates)

ALTER TABLE public.tb_order
  ALTER COLUMN cshippingchn TYPE numeric(14,2),  -- per-line china shipping total
  ALTER COLUMN cpriceupdate TYPE numeric(14,2);  -- per-line updated total
  -- LEFT (10,2): cprice (per-UNIT price — a single unit > 100M is implausible)

-- ── payment ──────────────────────────────────────────────────────────
ALTER TABLE public.tb_payment
  ALTER COLUMN paythb       TYPE numeric(14,2),  -- ฿ paid
  ALTER COLUMN payyuan      TYPE numeric(14,2),  -- ¥ paid
  ALTER COLUMN paythbcost   TYPE numeric(14,2),  -- ฿ cost
  ALTER COLUMN payprofitthb TYPE numeric(14,2);  -- ฿ profit
  -- LEFT (10,2): payrate, payratecost (FX rates)

-- ── receipt (the 50-ทวิ / ใบเสร็จ doc) ────────────────────────────────
ALTER TABLE public.tb_receipt
  ALTER COLUMN ramount                TYPE numeric(14,2),  -- receipt amount
  ALTER COLUMN totalbeforewithholding TYPE numeric(14,2);  -- pre-WHT total

-- ── container ค่าตู้ batch ─────────────────────────────────────────────
ALTER TABLE public.tb_cnt
  ALTER COLUMN "cntAmount" TYPE numeric(14,2);  -- ยอดเบิกค่าตู้ (Σ per-tracking)

-- ── wallet ───────────────────────────────────────────────────────────
ALTER TABLE public.tb_wallet
  ALTER COLUMN wallettotal TYPE numeric(14,2);  -- balance
ALTER TABLE public.tb_wallet_hs
  ALTER COLUMN amount TYPE numeric(14,2);        -- per-entry amount

-- ── credit line (a scaling B2B customer's limit can exceed 100M) ──────
ALTER TABLE public.tb_credit
  ALTER COLUMN creditvalue TYPE numeric(14,2);

-- ── forwarder / import (cargo totals + fees · per-tracking) ───────────
ALTER TABLE public.tb_forwarder
  ALTER COLUMN ftotalprice           TYPE numeric(14,2),  -- sell total
  ALTER COLUMN fcosttotalprice       TYPE numeric(14,2),  -- cost total
  ALTER COLUMN fcosttotalpricesheet  TYPE numeric(14,2),  -- cost-sheet ref total
  ALTER COLUMN ftransportprice       TYPE numeric(14,2),  -- transport total
  ALTER COLUMN ftransportpricechnthb TYPE numeric(14,2),  -- china transport (THB)
  ALTER COLUMN fprofittransportchn   TYPE numeric(14,2),  -- transport profit
  ALTER COLUMN fprofittotal          TYPE numeric(14,2),  -- profit total
  ALTER COLUMN fprofitpriceupdate    TYPE numeric(14,2),  -- updated profit
  ALTER COLUMN fpriceupdate          TYPE numeric(14,2),  -- updated total
  ALTER COLUMN fshippingservice      TYPE numeric(14,2),  -- service fee
  ALTER COLUMN fdiscount             TYPE numeric(14,2),  -- discount
  ALTER COLUMN pricecrate            TYPE numeric(14,2),  -- ค่าตีลังไม้
  ALTER COLUMN priceother            TYPE numeric(14,2),  -- other fee
  ALTER COLUMN fqcprice              TYPE numeric(14,2);  -- QC fee
  -- LEFT (10,2): customratecbm, customratekg, fcostrefrate, frefrate (RATES);
  --              fheight, flength, fwidth, fweight (DIMENSIONS)

ALTER TABLE public.tb_forwarder_item
  ALTER COLUMN fpriceupdate          TYPE numeric(14,2),  -- per-line updated total
  ALTER COLUMN fdiscount             TYPE numeric(14,2),  -- per-line discount
  ALTER COLUMN fqcprice              TYPE numeric(14,2),  -- QC fee
  ALTER COLUMN domesticshippingchina TYPE numeric(14,2),  -- china domestic ship fee
  ALTER COLUMN chinawoodencratefee   TYPE numeric(14,2),  -- ค่าตีลังไม้จีน
  ALTER COLUMN otherservicefee       TYPE numeric(14,2),  -- other service fee
  ALTER COLUMN thailanddeliveryfee   TYPE numeric(14,2);  -- thailand delivery fee
  -- LEFT (10,2): productheight/length/width, productweightall/peritem (DIMENSIONS/WEIGHT)

-- Recreate vw_sales_by_rep verbatim (live prod definition · pg_get_viewdef).
CREATE VIEW public.vw_sales_by_rep AS
 WITH forwarder_per_rep AS (
         SELECT u."adminIDSale" AS admin_userid,
            date_trunc('month'::text, f_1.fdate) AS activity_month,
            count(DISTINCT f_1.id) AS forwarder_count,
            COALESCE(sum(f_1.ftotalprice), 0::numeric)::numeric(14,2) AS forwarder_revenue_thb,
            count(DISTINCT u."userID") AS forwarder_customer_count
           FROM tb_users u
             JOIN tb_forwarder f_1 ON f_1.userid::text = u."userID"::text
          WHERE u."adminIDSale" IS NOT NULL AND u."adminIDSale"::text <> ''::text AND (f_1.fstatus::text = ANY (ARRAY['6'::character varying::text, '7'::character varying::text])) AND f_1.fdate IS NOT NULL
          GROUP BY u."adminIDSale", (date_trunc('month'::text, f_1.fdate))
        ), shop_per_rep AS (
         SELECT u."adminIDSale" AS admin_userid,
            date_trunc('month'::text, h.hdate) AS activity_month,
            count(DISTINCT h.id) AS shop_count,
            COALESCE(sum(h.htotalpriceuser), 0::numeric)::numeric(14,2) AS shop_revenue_thb,
            count(DISTINCT u."userID") AS shop_customer_count
           FROM tb_users u
             JOIN tb_header_order h ON h.userid::text = u."userID"::text
          WHERE u."adminIDSale" IS NOT NULL AND u."adminIDSale"::text <> ''::text AND (h.hstatus::text = ANY (ARRAY['5'::character varying::text, '6'::character varying::text])) AND h.hdate IS NOT NULL
          GROUP BY u."adminIDSale", (date_trunc('month'::text, h.hdate))
        ), payment_per_rep AS (
         SELECT u."adminIDSale" AS admin_userid,
            date_trunc('month'::text, p_1.paydate) AS activity_month,
            count(DISTINCT p_1.id) AS payment_count,
            COALESCE(sum(p_1.paythb), 0::numeric)::numeric(14,2) AS payment_revenue_thb,
            count(DISTINCT u."userID") AS payment_customer_count
           FROM tb_users u
             JOIN tb_payment p_1 ON p_1.userid::text = u."userID"::text
          WHERE u."adminIDSale" IS NOT NULL AND u."adminIDSale"::text <> ''::text AND p_1.paystatus::text = '3'::text AND p_1.paydate IS NOT NULL
          GROUP BY u."adminIDSale", (date_trunc('month'::text, p_1.paydate))
        ), customers_per_rep AS (
         SELECT u."adminIDSale" AS admin_userid,
            count(DISTINCT u."userID") AS customer_count
           FROM tb_users u
          WHERE u."adminIDSale" IS NOT NULL AND u."adminIDSale"::text <> ''::text AND (u."userStatus" IS NULL OR u."userStatus"::text <> '0'::text)
          GROUP BY u."adminIDSale"
        ), months AS (
         SELECT forwarder_per_rep.admin_userid,
            forwarder_per_rep.activity_month
           FROM forwarder_per_rep
        UNION
         SELECT shop_per_rep.admin_userid,
            shop_per_rep.activity_month
           FROM shop_per_rep
        UNION
         SELECT payment_per_rep.admin_userid,
            payment_per_rep.activity_month
           FROM payment_per_rep
        )
 SELECT m.admin_userid,
    a."adminNickname" AS adminnickname,
    TRIM(BOTH FROM concat(a."adminName", ' ', a."adminLastName")) AS admin_fullname,
    c.customer_count,
    m.activity_month,
    COALESCE(f.forwarder_revenue_thb, 0::numeric) AS forwarder_revenue_thb,
    COALESCE(f.forwarder_count, 0::bigint) AS forwarder_count,
    COALESCE(s.shop_revenue_thb, 0::numeric) AS shop_revenue_thb,
    COALESCE(s.shop_count, 0::bigint) AS shop_count,
    COALESCE(p.payment_revenue_thb, 0::numeric) AS payment_revenue_thb,
    COALESCE(p.payment_count, 0::bigint) AS payment_count,
    (COALESCE(f.forwarder_revenue_thb, 0::numeric) + COALESCE(s.shop_revenue_thb, 0::numeric) + COALESCE(p.payment_revenue_thb, 0::numeric))::numeric(14,2) AS total_revenue_thb
   FROM months m
     LEFT JOIN tb_admin a ON a."adminID"::text = m.admin_userid::text
     LEFT JOIN customers_per_rep c ON c.admin_userid::text = m.admin_userid::text
     LEFT JOIN forwarder_per_rep f ON f.admin_userid::text = m.admin_userid::text AND f.activity_month = m.activity_month
     LEFT JOIN shop_per_rep s ON s.admin_userid::text = m.admin_userid::text AND s.activity_month = m.activity_month
     LEFT JOIN payment_per_rep p ON p.admin_userid::text = m.admin_userid::text AND p.activity_month = m.activity_month;

COMMIT;
