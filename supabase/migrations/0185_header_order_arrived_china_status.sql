-- 0185 — ฝากสั่งซื้อ: widen tb_header_order.hstatus varchar(1)->(2) for the new
-- "ถึงโกดังจีน" status value '40' (slots between '4' and '5' in array-controlled order).
-- tb_header_order.hstatus is referenced by view vw_sales_by_rep, so the column type
-- cannot be altered while the view exists. This migration drops + recreates that view
-- around the ALTER. Idempotent: no-op once hstatus is already varchar(2)+.
-- Applied prod+dev 2026-06-16 via scripts/apply-0185-view-safe.mjs (live def capture).
DO $$
BEGIN
  IF (SELECT character_maximum_length FROM information_schema.columns
      WHERE table_name='tb_header_order' AND column_name='hstatus') < 2 THEN
    DROP VIEW IF EXISTS vw_sales_by_rep;
    ALTER TABLE tb_header_order ALTER COLUMN hstatus TYPE character varying(2);
    CREATE VIEW vw_sales_by_rep AS
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
     LEFT JOIN payment_per_rep p ON p.admin_userid::text = m.admin_userid::text AND p.activity_month = m.activity_month;;
  END IF;
END $$;
