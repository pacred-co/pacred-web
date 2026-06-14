-- 0183 — create-side double-pay UNIQUE backstops
-- (forwarder-fidelity + disbursement audits, 2026-06-14 · owner-approved)
--
-- The legacy + Pacred "a thing is created once" invariants are enforced only by
-- a non-atomic SELECT-then-INSERT precheck (TOCTOU): two concurrent admins / a
-- double-click can both pass the check and both INSERT. These partial-UNIQUE
-- indexes are the DB backstop. Partial (excluding the empty/zero sentinel that
-- legitimately repeats) + IF NOT EXISTS (idempotent · safe re-run · safe on
-- both prod and the dev reconcile).
--
-- Prod dup-precheck (scripts/precheck-0183-dups.mjs): all 4 tables = 0 rows
-- (early-stage prod) → clean. Dev had ONE dup on tb_cnt_item."fCabinetNumber"
-- (cabinet LEOU2022222 in cnt_item 4830→cnt39 + 4831→cnt40) → the duplicate
-- (4831) is removed on dev before this migration is reconciled there.
--
-- NB column case: prod tb_cnt_item uses the quoted mixed-case "fCabinetNumber";
-- idf / idus / fid are lowercase.

-- 1. Container double-pay — a paid cabinet appears once (tb_cnt_item).
--    Closes actions/admin/cnt-payment.ts SELECT-then-INSERT.
CREATE UNIQUE INDEX IF NOT EXISTS ux_tb_cnt_item_fcabinetnumber
  ON public.tb_cnt_item ("fCabinetNumber")
  WHERE "fCabinetNumber" <> '' AND "fCabinetNumber" <> '0';

-- 2. Commission double-accrual — one earn per forwarder (tb_user_sales.idf).
--    Backstops the delivery-complete accrual idempotency (audit risk #8).
CREATE UNIQUE INDEX IF NOT EXISTS ux_tb_user_sales_idf
  ON public.tb_user_sales (idf)
  WHERE idf > 0;

-- 3. Withdraw double-request — one withdraw-request per earn (tb_user_sales_pay.idus).
CREATE UNIQUE INDEX IF NOT EXISTS ux_tb_user_sales_pay_idus
  ON public.tb_user_sales_pay (idus)
  WHERE idus > 0;

-- 4. Combine-shipping — a forwarder belongs to one TH-transport batch
--    (tb_forwarder_tran_th_sub.fid). Backstops adminCombineForwarderTransport.
CREATE UNIQUE INDEX IF NOT EXISTS ux_tb_forwarder_tran_th_sub_fid
  ON public.tb_forwarder_tran_th_sub (fid)
  WHERE fid > 0;
