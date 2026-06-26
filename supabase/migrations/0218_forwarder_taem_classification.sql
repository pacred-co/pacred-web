-- ════════════════════════════════════════════════════════════
-- 0218 · tb_forwarder — แต้ม (iTAM) classification capture
-- ════════════════════════════════════════════════════════════
-- The แต้ม "Shipment Report" packing-list carries, per tracking, beyond the
-- container/weight/volume the reconcile already ingests:
--   - col T "CG."           → แต้ม's HS / customs-classification code
--   - col H "Type"          → product type (普通货物/ทั่วไป·电器/มอก.·药和食物/อย.)
--   - col S "Remark Number" → the box marking / shipping mark on the parcel
--
-- This adds REFERENCE-ONLY columns on tb_forwarder to store what แต้ม sent, so
-- staff can verify it against the curated values WITHOUT the ingest silently
-- overwriting them.
--
-- ⚠️ MONEY ISOLATION (AGENTS.md §0e) — deliberately SEPARATE columns:
--   - `fproductstype` is the SELL+COST product-type enum (drives the rate +
--     cost resolvers · changing it changes the customer's price). The ingest
--     NEVER touches it; แต้ม's raw Type lands in `ftaem_product_type` and the
--     UI flags a mismatch for staff to reconcile by hand.
--   - the curated per-line HS lives on tb_forwarder_item.hs_code (mig 0158/0180,
--     CS-curated · consumed by the ใบขน). แต้ม's CG. lands in `ftaem_hs_code`
--     (forwarder-level reference) so the curated HS is never clobbered.
--   - `fbox_mark` is a free-text shipping mark — touches no price/status/wallet.
--
-- HS field check: tb_forwarder has NO HS column (HS is item-level · mig
-- 0180/0181 added hs_code/hs_stat_code on tb_forwarder_item + tb_order, NOT on
-- tb_forwarder). So `ftaem_hs_code` here is the forwarder-level reference for
-- the per-tracking CG. แต้ม sends.
--
-- Additive + idempotent (add column if not exists). No backfill. Next free = 0219.
-- DO NOT apply here — the integrator (เดฟ) applies migrations to prod+dev.
-- ════════════════════════════════════════════════════════════

-- box marking / shipping mark (col S "Remark Number") — free text.
alter table public.tb_forwarder
  add column if not exists fbox_mark text;

-- แต้ม's HS / customs-classification (col T "CG.") — reference; does NOT feed
-- the curated per-line tb_forwarder_item.hs_code or any price/duty.
alter table public.tb_forwarder
  add column if not exists ftaem_hs_code text;

-- แต้ม's raw product Type (col H) — reference; the price-feeding enum stays
-- `fproductstype`. The ingest stores this verbatim + the UI flags a mismatch.
alter table public.tb_forwarder
  add column if not exists ftaem_product_type text;

comment on column public.tb_forwarder.fbox_mark is
  'Box marking / shipping mark from the แต้ม packing-list (col S "Remark Number"). Free text — no price/status impact.';
comment on column public.tb_forwarder.ftaem_hs_code is
  'แต้ม HS / customs classification (col T "CG."). Reference only — does NOT feed the curated per-line tb_forwarder_item.hs_code or any duty/price.';
comment on column public.tb_forwarder.ftaem_product_type is
  'แต้ม raw product Type (col H). Reference only — the price-feeding enum stays fproductstype. UI flags a mismatch for manual reconcile.';
