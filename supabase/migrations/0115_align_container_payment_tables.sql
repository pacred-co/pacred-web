-- ============================================================
-- 0115 (batch 2a) - container-payment admin tables camelCase
-- ============================================================
-- Batch 2a of the cross-app camelCase alignment (was 0113 +
-- 0114 hotfix for batch 1 = tb_users + tb_admin + tb_co).
-- This batch covers ONLY the container-payment admin tables
-- (smallest cargo-adjacent slice, 2 admin files touch them).
-- Batch 2b = full tb_forwarder family (~177 renames, 18
-- customer-facing pages) is deferred until those pages can
-- be migrated one screen at a time.
--
-- - tb_cnt (12 renames)
-- - tb_cnt_item (3 renames)
-- - tb_check_forwarder (4 renames)
-- Total: 19 renames across 3 tables.
--
-- Pre-flight verified: no PL/pgSQL function bodies reference
-- these tables (0010_forwarder.sql functions operate on the
-- REBUILT public.forwarders table, not legacy tb_forwarder).
-- So no companion 0116-style hotfix expected.
--
-- Source: ก๊อต's spec at pacred-admin-next/docs/database/
-- No type changes. No data changes. Idempotent (IF EXISTS guard).
-- ============================================================

-- -- tb_cnt (12 renames) --
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='adminidcreate') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='adminIDCreate') THEN EXECUTE 'ALTER TABLE public.tb_cnt RENAME COLUMN adminidcreate TO "adminIDCreate"'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='adminidupdate') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='adminIDUpdate') THEN EXECUTE 'ALTER TABLE public.tb_cnt RENAME COLUMN adminidupdate TO "adminIDUpdate"'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='cntamount') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='cntAmount') THEN EXECUTE 'ALTER TABLE public.tb_cnt RENAME COLUMN cntamount TO "cntAmount"'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='cntfile') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='cntFile') THEN EXECUTE 'ALTER TABLE public.tb_cnt RENAME COLUMN cntfile TO "cntFile"'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='cntimagesslip') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='cntImagesSlip') THEN EXECUTE 'ALTER TABLE public.tb_cnt RENAME COLUMN cntimagesslip TO "cntImagesSlip"'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='cntname') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='cntName') THEN EXECUTE 'ALTER TABLE public.tb_cnt RENAME COLUMN cntname TO "cntName"'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='cntstatus') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='cntStatus') THEN EXECUTE 'ALTER TABLE public.tb_cnt RENAME COLUMN cntstatus TO "cntStatus"'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='dateupdate') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='dateUpdate') THEN EXECUTE 'ALTER TABLE public.tb_cnt RENAME COLUMN dateupdate TO "dateUpdate"'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='id') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='ID') THEN EXECUTE 'ALTER TABLE public.tb_cnt RENAME COLUMN id TO "ID"'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='nameaccount') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='nameAccount') THEN EXECUTE 'ALTER TABLE public.tb_cnt RENAME COLUMN nameaccount TO "nameAccount"'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='nameblank') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='nameBlank') THEN EXECUTE 'ALTER TABLE public.tb_cnt RENAME COLUMN nameblank TO "nameBlank"'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='noblank') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt' AND column_name='noBlank') THEN EXECUTE 'ALTER TABLE public.tb_cnt RENAME COLUMN noblank TO "noBlank"'; END IF; END $$;

-- -- tb_cnt_item (3 renames) --
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt_item' AND column_name='cntid') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt_item' AND column_name='cntID') THEN EXECUTE 'ALTER TABLE public.tb_cnt_item RENAME COLUMN cntid TO "cntID"'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt_item' AND column_name='fcabinetnumber') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt_item' AND column_name='fCabinetNumber') THEN EXECUTE 'ALTER TABLE public.tb_cnt_item RENAME COLUMN fcabinetnumber TO "fCabinetNumber"'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt_item' AND column_name='id') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_cnt_item' AND column_name='ID') THEN EXECUTE 'ALTER TABLE public.tb_cnt_item RENAME COLUMN id TO "ID"'; END IF; END $$;

-- -- tb_check_forwarder (4 renames) --
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_check_forwarder' AND column_name='adminid') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_check_forwarder' AND column_name='adminID') THEN EXECUTE 'ALTER TABLE public.tb_check_forwarder RENAME COLUMN adminid TO "adminID"'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_check_forwarder' AND column_name='cfstatus') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_check_forwarder' AND column_name='cfStatus') THEN EXECUTE 'ALTER TABLE public.tb_check_forwarder RENAME COLUMN cfstatus TO "cfStatus"'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_check_forwarder' AND column_name='fid') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_check_forwarder' AND column_name='fID') THEN EXECUTE 'ALTER TABLE public.tb_check_forwarder RENAME COLUMN fid TO "fID"'; END IF; END $$;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_check_forwarder' AND column_name='id') AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tb_check_forwarder' AND column_name='ID') THEN EXECUTE 'ALTER TABLE public.tb_check_forwarder RENAME COLUMN id TO "ID"'; END IF; END $$;
