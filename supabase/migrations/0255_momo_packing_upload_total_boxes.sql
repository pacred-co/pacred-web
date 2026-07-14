-- ════════════════════════════════════════════════════════════
-- 0255 · momo_packing_upload.total_boxes (เฟส 0b · ภูม 2026-07-14)
-- ════════════════════════════════════════════════════════════
-- The container-verify list compares the packing-list box count against the
-- system (tb_forwarder) box count. 0252 stored weight/cbm/tracking_count but not (renumbered 0252→0254 at integration · 0252/0253 taken by header_usd/receipt)
-- the box total — add it (= the packing list's Σ parcel qty · `totals.qty`).
-- Additive · nullable · no backfill needed (table was empty). Idempotent.
-- ════════════════════════════════════════════════════════════

alter table public.momo_packing_upload
  add column if not exists total_boxes integer;

comment on column public.momo_packing_upload.total_boxes is
  'Total box/parcel count from the packing list (Σ qty) — for the container box-count verify.';
