-- 0213_driver_item_fail_note.sql
-- Persist the "ส่งไม่ได้" (delivery-failed) reason on the driver item row so it
-- shows INLINE on the driver detail (/admin/drivers/[id]) + work (/work) pages.
-- Previously the reason was captured (window.prompt) and only logged to
-- admin_audit_log.payload.reason — never visible on the row itself.
--
-- Legacy tb_forwarder_driver_item has NO such column — this is a Pacred QoL
-- enhancement (the legacy system never showed the failure reason). Additive +
-- idempotent + nullable → zero blast radius.
ALTER TABLE public.tb_forwarder_driver_item
  ADD COLUMN IF NOT EXISTS fdinote text;

COMMENT ON COLUMN public.tb_forwarder_driver_item.fdinote IS
  'Pacred: reason captured when a driver marks an item ส่งไม่ได้ (fdistatus=3). Shown inline on /admin/drivers/[id] + /work. Legacy has no equivalent.';
