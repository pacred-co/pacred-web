-- 0141 — per-customer CS (customer-service) assignment.
--
-- Owner 2026-06-05: the ops workflow has BOTH a เซล (รับลูกค้า) and a CS
-- (ติดตามสถานะให้ลูกค้า). Each customer gets their own CS, assigned at register
-- exactly like the sales rep (tb_users.adminIDSale). This mirrors the sales
-- model 1:1:
--   - tb_users.adminIDCS      : the customer's assigned CS (a tb_admin.adminID
--                               string, e.g. 'admin_ploy'). '' = no CS yet →
--                               the sidebar shows the central CS line.
--   - tb_admin.adminStatusCS  : '1' = in the CS round-robin pool (mirror of
--                               adminStatusSale). Seeded with พลอย (admin_ploy).
--
-- Both columns are camelCase + quoted (mirror adminIDSale / adminStatusSale ·
-- migration 0113 convention). Idempotent · additive · no data loss.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_users' AND column_name = 'adminIDCS'
  ) THEN
    ALTER TABLE public.tb_users ADD COLUMN "adminIDCS" varchar(20) NOT NULL DEFAULT '';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tb_admin' AND column_name = 'adminStatusCS'
  ) THEN
    ALTER TABLE public.tb_admin ADD COLUMN "adminStatusCS" varchar(1) NOT NULL DEFAULT '0';
  END IF;
END $$;

-- Index for the round-robin "fewest-owned" count (mirrors the adminIDSale hot path).
CREATE INDEX IF NOT EXISTS idx_tb_users_adminidcs ON public.tb_users ("adminIDCS");

-- Seed: flag พลอย (admin_ploy) as the initial CS pool member (owner directive ·
-- = the central CS line CONTACT.phoneCs 062-603-4456). Flagging more CS staff
-- later is just UPDATE tb_admin SET adminStatusCS='1' WHERE adminID=...
UPDATE public.tb_admin SET "adminStatusCS" = '1'
  WHERE "adminID" = 'admin_ploy' AND "adminStatusCS" <> '1';
