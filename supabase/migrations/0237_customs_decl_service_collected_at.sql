-- 0237 — dedicated ใบขนพ่วง (#17) SERVICE-collection latch.
-- The #17 build (task ใบขนพ่วง) initially reused customs_declarations.paid_through_promptpay
-- as the "service collected / idempotency" flag — but that column (mig 0057) is a SEPARATE,
-- admin-editable "ชำระ PromptPay" attribute of the declaration (edited via the customs/freight
-- declaration forms). Overloading it lets an unrelated admin edit silently mark the #17
-- collection as done (skipping a real collection) or reset it (double-collect). This adds a
-- dedicated, non-editable latch so the #17 SERVICE-account collection is independent + auditable.
-- Additive · idempotent · no backfill (no real ใบขนพ่วง collection has happened yet).
ALTER TABLE customs_declarations
  ADD COLUMN IF NOT EXISTS service_collected_at timestamptz;

COMMENT ON COLUMN customs_declarations.service_collected_at IS
  'ใบขนพ่วง (#17): timestamp the service-fee+duty+VAT was collected into the SERVICE account. NULL = not yet collected. The collect action atomic-claims on (service_collected_at IS NULL). Distinct from paid_through_promptpay (an unrelated 0057 attribute).';
