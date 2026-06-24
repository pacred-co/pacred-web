-- 0209_invoice_receipt_mao_fee.sql
-- ภูม 2026-06-23 — แยกบรรทัด "ค่าส่งเหมาๆ" (PCSF flat ฿100/ชิปเมนต์) บนทั้ง
-- ใบวางบิล (tb_forwarder_invoice) + ใบเสร็จ (tb_receipt) ให้ตรงกัน.
--
-- WHY: the เหมาๆ was (a) FOLDED into one row's amount on the bill (invisible to
-- the customer · ลูกค้าไม่รู้ว่าจ่ายเหมาๆเท่าไหร่) and (b) MISSING entirely from the
-- receipt (autoIssueReceiptOnPaymentLand sums calcForwarderOutstanding, which
-- excludes the เหมาๆ) → the receipt total ran ฿100 SHORT of the bill (บิล 4,183.96
-- vs ใบเสร็จ 4,083.96 — they didn't match).
--
-- FIX: store the fee at the HEADER level on both docs as its own column, so:
--   • row/item amounts stay = base outstanding  → the invariant
--     subtotal_thb = Σ tb_forwarder_invoice_item.amount_thb still holds (mig 0138),
--   • total_thb (invoice) / ramount (receipt) INCLUDE this fee (computed in TS),
--   • both papers render "ค่าส่งเหมาๆ" as its own summary line → customer sees it
--     and the two docs reconcile to the satang.
--
-- Additive · idempotent · numeric(14,2) to match the 0196 money-col widening.

alter table public.tb_forwarder_invoice
  add column if not exists mao_fee_thb numeric(14,2) not null default 0;
comment on column public.tb_forwarder_invoice.mao_fee_thb is
  'ค่าส่งเหมาๆ (PCSF flat ฿100/ชิปเมนต์) — summary-level charge ADDED into total_thb and shown as its own line. NOT part of subtotal_thb (= Σ item amounts).';

alter table public.tb_receipt
  add column if not exists mao_fee_thb numeric(14,2) not null default 0;
comment on column public.tb_receipt.mao_fee_thb is
  'ค่าส่งเหมาๆ (PCSF flat ฿100/ชิปเมนต์) included in ramount — shown as its own line on the receipt so it matches the ใบวางบิล.';
