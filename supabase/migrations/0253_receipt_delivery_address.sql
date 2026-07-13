-- 0253_receipt_delivery_address.sql
-- Add a DISPLAY-ONLY ship-to snapshot to the ใบเสร็จ (receipt document), mirroring
-- tb_forwarder_invoice.delivery_address (mig 0247) on the ใบวางบิล.
--
-- WHY (owner 2026-07-13 · "แก้ใบวางบิลให้ถูก พอเสร็จ ใบเสร็จก็เป็นอีกแล้ว · ข้อมูลไม่
-- ลิงค์ไปถึงกัน"): a swapped delivery address REPLACED the address on the ใบวางบิล
-- (billing-run-paper.tsx single-slot rule) but the ใบเสร็จ still rendered the OLD
-- tax/registered address (recompaddress) → the two documents disagreed. This column
-- lets the receipt carry the SAME ship-to snapshot the bill shows, stamped at
-- receipt-issue time (from the paid bill's delivery_address) AND refreshed when the
-- bill's delivery address is edited later (adminSetBillingRunDeliveryAddress).
--
-- Distinct from tb_receipt.recompaddress, which is the receipt's tax/billing identity
-- address (the G1/G8 frozen snapshot · never touched by the delivery picker).
-- DISPLAY-only — affects NO amount / WHT / status. The receipt loader renders it via
-- the SAME single-slot rule as the bill: delivery_address || recompaddress || composed.
--
-- Nullable → legacy receipts (delivery_address IS NULL) render recompaddress unchanged
-- (no regression). Additive · idempotent.

alter table tb_receipt
  add column if not exists delivery_address text;

comment on column tb_receipt.delivery_address is
  'DISPLAY-only ship-to snapshot on the ใบเสร็จ — mirrors tb_forwarder_invoice.delivery_address (mig 0247). Distinct from recompaddress (tax/billing identity · G1/G8 frozen). Set at receipt-issue from the paid bill + refreshed by adminSetBillingRunDeliveryAddress. Never affects amount/WHT/status.';
