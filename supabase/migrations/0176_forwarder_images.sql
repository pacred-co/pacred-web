-- 0176_forwarder_images.sql
-- 2026-06-11 (ปอน · owner "มันไม่ใช่ 'เปลี่ยนรูปสินค้า' แต่เป็น 'เพิ่มรูปภาพ' ·
-- มันจะมีหลายๆรูปภาพ"): the admin forwarder detail page needs a MULTI-image
-- gallery per order. Legacy `tb_forwarder.fcover` is a single cover (varchar 500)
-- — keep it as the primary/cover (the customer page + receipts still read it) and
-- ADD an additive `fimages` column holding a JSON array of additional admin-
-- uploaded image keys (bucket `forwarder-covers`).
--
-- Additive + idempotent (ADD COLUMN IF NOT EXISTS · constant DEFAULT) → on PG 11+
-- this is a metadata-only change (no table rewrite) even on the ~47k prod rows, and
-- every existing reader that SELECTs explicit columns is unaffected.

ALTER TABLE public.tb_forwarder
  ADD COLUMN IF NOT EXISTS fimages text NOT NULL DEFAULT '[]'::text;

COMMENT ON COLUMN public.tb_forwarder.fimages IS
  'JSON array of admin-uploaded gallery image keys (bucket forwarder-covers), in addition to the single legacy fcover cover. ปอน 2026-06-11.';
