-- 0185 — ฝากสั่งซื้อ: add a real "ถึงโกดังจีน" status to tb_header_order.hstatus
-- (owner 2026-06-16 · MOMO arrival P0).
--
-- Problem: tb_header_order.hstatus is character varying(1), DEFAULT '1', NOT NULL,
-- and the legacy vocabulary fills every single digit:
--   1 รอดำเนินการ · 2 รอชำระเงิน · 3 สั่งสินค้า · 4 รอร้านจีนจัดส่ง · 5 สำเร็จ · 6 ยกเลิก
-- There is NO value for "the goods reached the China warehouse" and no code advanced
-- the order when a linked forwarder (reforder → hno) arrived at the china warehouse.
--
-- There is NO CHECK constraint on hstatus (verified across all migrations) — but the
-- column is varchar(1), so a new value that slots BETWEEN '4' and '5' in string order
-- (we use '40': '4' < '40' < '5') cannot be stored until the column is widened.
--
-- This migration widens hstatus to varchar(2) so the new value '40' = "ถึงโกดังจีน"
-- fits. It is non-destructive: existing single-char values ('1'..'6') are unchanged,
-- and varchar(2) is a strict superset of varchar(1). DEFAULT '1' + NOT NULL preserved.
--
-- String ordering is preserved for the one ordering query that exists
-- (actions/admin/shop-disbursement.ts:286 `.gt("hstatus","2").neq("hstatus","6")`):
--   '40' > '2'  → true  (correct: post-payment, disbursement-eligible)
--   '40' ≠ '6'  → true  (correct: not cancelled)
-- The customer/admin DISPLAY order is array-controlled (lib/legacy-status-map.ts +
-- the admin tab strip), so '40' renders right after "4 รอร้านจีนจัดส่ง" regardless
-- of the digit chosen.
--
-- Idempotent. No data backfill (the app advances rows forward-only on MOMO arrival).
-- INTEGRATOR: apply prod + dev (NOT applied by the build agent). NEXT FREE = 0186.

alter table public.tb_header_order
  alter column hstatus type character varying(2);

comment on column public.tb_header_order.hstatus is
  '1=รอดำเนินการ 2=รอชำระเงิน 3=สั่งสินค้า 4=รอร้านจีนจัดส่ง 40=ถึงโกดังจีน 5=สำเร็จ 6=ยกเลิกออเดอร์';
