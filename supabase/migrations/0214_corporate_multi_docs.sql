-- 0214_corporate_multi_docs.sql (owner 2026-06-26)
-- "ตั้งโปรไฟล์ลูกค้า: บุคคล → นิติ + แนบเอกสารนิติ (ภพ.20 / หนังสือรับรอง /
--  บัตรกรรมการ / อื่นๆ) อัปได้หลายไฟล์".
--
-- Legacy tb_corporate stores only TWO single-file columns (corporatefile =
-- หนังสือรับรอง · corporatefile20 = ภพ.20). The owner wants MORE types +
-- MULTIPLE files. Add a jsonb gallery column `corporate_docs` that holds an
-- array of { type, key, name, at } — mirrors the proven tb_forwarder.fimages
-- multi-image pattern (mig 0176). The legacy single columns are KEPT
-- untouched (the 362 existing rows + any legacy reader keep working); new
-- multi-doc uploads land in this column.
--
-- Additive · nullable · idempotent. No money. Safe to re-run.

ALTER TABLE public.tb_corporate
  ADD COLUMN IF NOT EXISTS corporate_docs jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.tb_corporate.corporate_docs IS
  'Multi-doc gallery (owner 2026-06-26): JSON array of {type:vat|affidavit|director_id|other, key:bucket-key, name:original-filename, at:iso}. Legacy corporatefile/corporatefile20 kept for back-compat.';
