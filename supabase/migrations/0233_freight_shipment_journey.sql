-- 0233_freight_shipment_journey.sql
-- W4 freight activation (เดฟ 2026-06-30) — the FOUNDATION the workflow's foundation phase
-- failed to write (a script bug passed an array instead of a string → "[object]" empty task).
-- Hand-written to EXACTLY match the code the build lanes shipped:
--   lib/freight/journey-catalog.ts (the 38-code journey SOT · per-code milestoneField)
--   actions/admin/freight-shipment-workflow.ts (advanceFreightStatus / setFreightRedFlag)
--
-- freight_shipments is EMPTY (0 rows in prod) → these schema changes are ZERO-RISK.
-- Adds the JOURNEY axis (orthogonal to the existing 6-state `status`) + the RED overlay +
-- the milestone date columns + the status-history log. NO money column is touched (freight
-- money stays in freight_invoices + the p&l snapshot mig 0165).

ALTER TABLE public.freight_shipments
  ADD COLUMN IF NOT EXISTS journey_status text,            -- canonical journey code (journey-catalog.ts)
  ADD COLUMN IF NOT EXISTS issue_flag     text,            -- RED overlay (DELAY/HOLD/…) — NOT a status
  ADD COLUMN IF NOT EXISTS issue_note     text,
  -- milestone dates (one per code's milestoneField — journey-catalog.ts)
  ADD COLUMN IF NOT EXISTS confirmed_at            timestamptz,
  ADD COLUMN IF NOT EXISTS cn_cleared_at           timestamptz,  -- ศุลกากรจีน
  ADD COLUMN IF NOT EXISTS etd_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS atd_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS departed_at             timestamptz,
  ADD COLUMN IF NOT EXISTS eta_at                  timestamptz,
  ADD COLUMN IF NOT EXISTS ata_at                  timestamptz,  -- ATA/POD เรือ/รถถึง
  ADD COLUMN IF NOT EXISTS do_exchanged_at         timestamptz,  -- แลก D/O
  ADD COLUMN IF NOT EXISTS th_cleared_at           timestamptz,  -- ผ่านศุลกากรไทย
  ADD COLUMN IF NOT EXISTS arrived_th_warehouse_at timestamptz,  -- ถึงโกดังไทย
  ADD COLUMN IF NOT EXISTS delivered_at            timestamptz,  -- ส่งสำเร็จ
  ADD COLUMN IF NOT EXISTS container_returned_at   timestamptz,  -- คืนตู้
  ADD COLUMN IF NOT EXISTS billed_at               timestamptz,  -- วางบิล (ภายใน)
  ADD COLUMN IF NOT EXISTS closed_at               timestamptz;  -- ปิดงาน (ภายใน)

CREATE INDEX IF NOT EXISTS idx_freight_shipments_journey_status
  ON public.freight_shipments (journey_status);

-- the journey history log (one row per status change · advanceFreightStatus appends)
CREATE TABLE IF NOT EXISTS public.freight_shipment_status_log (
  id                  bigserial PRIMARY KEY,
  freight_shipment_id uuid NOT NULL REFERENCES public.freight_shipments(id) ON DELETE CASCADE,
  from_status         text,
  to_status           text NOT NULL,
  main_status         text,
  note                text,
  is_red              boolean NOT NULL DEFAULT false,
  changed_by_admin_id varchar(50),
  changed_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_freight_status_log_shipment
  ON public.freight_shipment_status_log (freight_shipment_id, changed_at DESC);

ALTER TABLE public.freight_shipment_status_log ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='freight_shipment_status_log' AND policyname='freight_status_log_admin_read'
  ) THEN
    CREATE POLICY freight_status_log_admin_read ON public.freight_shipment_status_log
      FOR SELECT USING (public.is_admin());
  END IF;
END $$;

COMMENT ON COLUMN public.freight_shipments.journey_status IS
  'Canonical journey code (lib/freight/journey-catalog.ts) — orthogonal to the 6-state `status`. W4 เดฟ 2026-06-30.';
COMMENT ON COLUMN public.freight_shipments.issue_flag IS
  'RED overlay (DELAY/HOLD) — a flag ON TOP of journey_status, not a status itself.';
