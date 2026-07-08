-- 0244 — ฝากโอนหยวน: payee QR (收款码) image column
--
-- Owner 2026-07-08 (พี่ป๊อป): "งานโอนหยวน ลูกค้าส่งไฟล์รูป QRCODE ของ alipay จีนมา
-- ตอนนี้ยังไม่มีให้แนบ · หลังบ้านแอดมินจะมาทำก็แอดรูปไม่ได้ · มีให้กรอกแค่ธนาคาร".
--
-- Legacy PCS + our current flow capture the recipient only as TEXT (paydetail)
-- plus the transfer SLIP (imagesslip = customer proof / imagesslipadmin = admin
-- proof-of-payment AFTER Pacred pays). But modern Alipay/WeChat payments are made
-- by scanning the payee's 收款码 (receive-money QR) — an IMAGE the customer sends.
-- There was no column for it, so the China operator had no QR to scan.
--
-- This adds a dedicated column so the payee QR flows: customer attaches at request
-- → admin sees it → whoever transfers scans it. Kept SEPARATE from the after-transfer
-- slip so the two images never overwrite each other. Image-only · no money/status.
--
-- Idempotent · additive · nullable-with-default (no backfill needed).

ALTER TABLE public.tb_payment
  ADD COLUMN IF NOT EXISTS payee_qr_image varchar(255) NOT NULL DEFAULT '';

COMMENT ON COLUMN public.tb_payment.payee_qr_image IS
  'ฝากโอนหยวน: รูป QR ปลายทาง (Alipay/WeChat 收款码) ที่ลูกค้าส่งมาให้โอน — filename in the slips bucket. Distinct from imagesslip/imagesslipadmin (after-transfer proof). Added mig 0244.';
