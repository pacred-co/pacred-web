-- 0094_view_sales_by_rep.sql
--
-- V-G6 #2 — Sales revenue per sales rep (Wave 8 backlog item #7).
--
-- D1 / ADR-0017 — faithful PCS Cargo port. Postgres VIEW that aggregates
-- the three legacy revenue streams (`tb_forwarder`, `tb_header_order`,
-- `tb_payment`) per sales rep (`tb_users.adminidsale`). Replaces the
-- "Wave 8 banner" stub at /admin/reports/sales-by-rep that rendered
-- ฿0 for every rep because the rebuilt `profiles + forwarders +
-- service_orders + yuan_payments` schema is empty on prod.
--
-- Why a VIEW (not an RPC):
--   - PostgREST exposes views as first-class read endpoints with .gte /
--     .lte / .order chained from the admin client — no extra wiring.
--   - View output is bounded: ~14 admins × ~120 active months = ~1700 rows
--     worst case (cheap to materialise on every request).
--   - `create or replace view` is idempotent + safe to re-apply via the
--     Supabase dashboard SQL editor (Wave-8 manual deploy gate per ภูม).
--
-- Why the activity_month bucket:
--   - Per-rep revenue is read in monthly windows in the legacy
--     `report-sale-new.php` (~700 LOC) — defaults to current month with
--     optional ?from=YYYY-MM &?to=YYYY-MM range. Bucketing inside the
--     view lets the page filter with .gte("activity_month", ...) and
--     server-side aggregate downstream.
--
-- Status filters mirror legacy `report-sale-new.php` revenue gates:
--   - tb_forwarder.fstatus IN ('6','7') — "เตรียมส่ง" + "ส่งแล้ว" (revenue
--     recognised once the import job is dispatched · L156-160 in
--     tb_forwarder COMMENT block / 0081_pcs_legacy_schema.sql).
--   - tb_header_order.hstatus IN ('5','6') — "สำเร็จ" + "ยกเลิกออเดอร์"
--     keeps post-fulfilment revenue (per tb_header_order.hstatus comment
--     block — 0081_pcs_legacy_schema.sql L2568).  Cancelled orders kept
--     in totals here mirror the legacy report's "all closed" totals;
--     the page later splits these out so accountants can see the delta.
--   - tb_payment.paystatus = '3' — completed yuan transfers (legacy
--     L3613 default flow; '1' = pending, '2' = processing).
--
-- Column names verified against migration 0081 (tb_users L5828-5869,
-- tb_admin L611-657, tb_forwarder L1598-1709, tb_header_order
-- L2506-2561, tb_payment L3611-3634) — all lowercase, no camelCase.
--
-- Idempotent.
-- ════════════════════════════════════════════════════════════════════

create or replace view public.vw_sales_by_rep as
with
  forwarder_per_rep as (
    select
      u.adminidsale                                                     as admin_userid,
      date_trunc('month', f.fdate)                                      as activity_month,
      count(distinct f.id)                                              as forwarder_count,
      coalesce(sum(f.ftotalprice), 0)::numeric(14,2)                    as forwarder_revenue_thb,
      count(distinct u.userid)                                          as forwarder_customer_count
    from public.tb_users  u
    join public.tb_forwarder f
      on f.userid = u.userid
    where u.adminidsale is not null
      and u.adminidsale <> ''
      and f.fstatus in ('6', '7')
      and f.fdate is not null
    group by u.adminidsale, date_trunc('month', f.fdate)
  ),
  shop_per_rep as (
    select
      u.adminidsale                                                     as admin_userid,
      date_trunc('month', h.hdate)                                      as activity_month,
      count(distinct h.id)                                              as shop_count,
      coalesce(sum(h.htotalpriceuser), 0)::numeric(14,2)                as shop_revenue_thb,
      count(distinct u.userid)                                          as shop_customer_count
    from public.tb_users  u
    join public.tb_header_order h
      on h.userid = u.userid
    where u.adminidsale is not null
      and u.adminidsale <> ''
      and h.hstatus in ('5', '6')
      and h.hdate is not null
    group by u.adminidsale, date_trunc('month', h.hdate)
  ),
  payment_per_rep as (
    select
      u.adminidsale                                                     as admin_userid,
      date_trunc('month', p.paydate)                                    as activity_month,
      count(distinct p.id)                                              as payment_count,
      coalesce(sum(p.paythb), 0)::numeric(14,2)                         as payment_revenue_thb,
      count(distinct u.userid)                                          as payment_customer_count
    from public.tb_users  u
    join public.tb_payment p
      on p.userid = u.userid
    where u.adminidsale is not null
      and u.adminidsale <> ''
      and p.paystatus = '3'
      and p.paydate is not null
    group by u.adminidsale, date_trunc('month', p.paydate)
  ),
  customers_per_rep as (
    select
      u.adminidsale                                                     as admin_userid,
      count(distinct u.userid)                                          as customer_count
    from public.tb_users u
    where u.adminidsale is not null
      and u.adminidsale <> ''
      and (u.userstatus is null or u.userstatus <> '0')
    group by u.adminidsale
  ),
  months as (
    -- One row per (rep, activity_month) across any of the three sources.
    select admin_userid, activity_month from forwarder_per_rep
    union
    select admin_userid, activity_month from shop_per_rep
    union
    select admin_userid, activity_month from payment_per_rep
  )
select
  m.admin_userid,
  a.adminnickname,
  trim(concat(a.adminname, ' ', a.adminlastname))                       as admin_fullname,
  c.customer_count,
  m.activity_month,
  coalesce(f.forwarder_revenue_thb, 0)                                  as forwarder_revenue_thb,
  coalesce(f.forwarder_count,        0)                                 as forwarder_count,
  coalesce(s.shop_revenue_thb,       0)                                 as shop_revenue_thb,
  coalesce(s.shop_count,             0)                                 as shop_count,
  coalesce(p.payment_revenue_thb,    0)                                 as payment_revenue_thb,
  coalesce(p.payment_count,          0)                                 as payment_count,
  (coalesce(f.forwarder_revenue_thb, 0)
   + coalesce(s.shop_revenue_thb,    0)
   + coalesce(p.payment_revenue_thb, 0))::numeric(14,2)                 as total_revenue_thb
from months m
left join public.tb_admin a
  on a.adminid = m.admin_userid
left join customers_per_rep c
  on c.admin_userid = m.admin_userid
left join forwarder_per_rep f
  on f.admin_userid    = m.admin_userid
 and f.activity_month  = m.activity_month
left join shop_per_rep s
  on s.admin_userid    = m.admin_userid
 and s.activity_month  = m.activity_month
left join payment_per_rep p
  on p.admin_userid    = m.admin_userid
 and p.activity_month  = m.activity_month;

-- Run the view as the calling role (consistent with 0087 — keeps the
-- security model legible: the page uses `createAdminClient()` which
-- already has service_role privileges; nothing escalates inside the
-- view definition).
alter view if exists public.vw_sales_by_rep set (security_invoker = on);

grant select on public.vw_sales_by_rep to service_role;

comment on view public.vw_sales_by_rep is
  'V-G6 #2 — per-(sales rep × month) revenue rollup across tb_forwarder + tb_header_order + tb_payment, keyed on tb_users.adminidsale → tb_admin.adminid. Filter with .gte/.lte on activity_month from the admin client. Migration 0094.';
