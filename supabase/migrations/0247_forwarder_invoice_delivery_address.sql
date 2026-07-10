-- 0247_forwarder_invoice_delivery_address.sql
-- Add a DISPLAY-ONLY ship-to snapshot to the ใบวางบิล (billing-run document).
--
-- Distinct from tb_forwarder_invoice.buyer_address, which is the BILLING/tax
-- identity address (juristic → registered corporate address · load-bearing for
-- the bill==receipt snapshot G7/G8 · NEVER touched by the delivery picker).
--
-- delivery_address is set via adminSetBillingRunDeliveryAddress (a snapshot of a
-- chosen tb_address row belonging to the invoice customer) and rendered by
-- <BillingRunPaper> as a "ที่อยู่จัดส่ง" line. It affects NO amount / tax / status.
-- Additive · nullable-defaulted → forward-safe (existing bills render '' = hidden).

alter table tb_forwarder_invoice
  add column if not exists delivery_address text not null default '';

comment on column tb_forwarder_invoice.delivery_address is
  'DISPLAY-only ship-to snapshot on the ใบวางบิล — distinct from buyer_address (tax billing identity). Set via adminSetBillingRunDeliveryAddress. Never affects amount/tax/status.';
