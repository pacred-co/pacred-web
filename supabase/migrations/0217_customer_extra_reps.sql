-- 0217 — per-customer extra owner-reps: ล่ามจีน / Pricing / ผู้สั่งซื้อ.
--
-- Owner 2026-06-26: a customer already has a เซล (adminIDSale · รับลูกค้า) and a
-- CS (adminIDCS · ติดตามสถานะ). The owner wants each customer ALSO to have their
-- OWN ล่ามจีน (interpreter) · Pricing · ผู้สั่งซื้อ (purchaser) — assignable from
-- the back-office, visible to the whole team — modelled 1:1 on the existing
-- sales/CS rep columns:
--   - tb_users.adminIDInterpreter : the customer's ล่ามจีน (a tb_admin.adminID
--                                   string, e.g. 'admin_xxx'). '' = ยังไม่กำหนด.
--   - tb_users.adminIDPricing     : the customer's Pricing เจ้าหน้าที่. '' = none.
--   - tb_users.adminIDPurchaser   : the customer's ผู้สั่งซื้อ. '' = none.
--
-- Casing/type VERIFIED against the live columns: adminIDSale (0113) +
-- adminIDCS (0141) are both camelCase + quoted varchar(20) NOT NULL DEFAULT ''.
-- These three mirror that EXACTLY so reads/writes stay consistent with the
-- existing rep model. Idempotent · additive · no data loss.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_users' AND column_name = 'adminIDInterpreter'
  ) THEN
    ALTER TABLE public.tb_users ADD COLUMN "adminIDInterpreter" varchar(20) NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_users' AND column_name = 'adminIDPricing'
  ) THEN
    ALTER TABLE public.tb_users ADD COLUMN "adminIDPricing" varchar(20) NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_users' AND column_name = 'adminIDPurchaser'
  ) THEN
    ALTER TABLE public.tb_users ADD COLUMN "adminIDPurchaser" varchar(20) NOT NULL DEFAULT '';
  END IF;
END $$;

-- Indexes for the "fewest-owned" / per-rep lookup (mirror the adminIDSale /
-- adminIDCS hot paths).
CREATE INDEX IF NOT EXISTS idx_tb_users_adminidinterpreter ON public.tb_users ("adminIDInterpreter");
CREATE INDEX IF NOT EXISTS idx_tb_users_adminidpricing     ON public.tb_users ("adminIDPricing");
CREATE INDEX IF NOT EXISTS idx_tb_users_adminidpurchaser   ON public.tb_users ("adminIDPurchaser");
