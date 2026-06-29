-- 0223 — crate price (ราคาค่าตีลังไม้) on shop orders (owner 2026-06-29 · fix #3)
--
-- Faithful to tb_forwarder.pricecrate (0081 L1700) — the forwarder already has a
-- crate-PRICE column, but tb_header_order has only the crate FLAG (`crate`
-- varchar(1) · 1=ตีลัง · 0081 L2558) and NO price. This adds the price so
-- pricing/สั่งซื้อ can enter a ราคาค่าตีลังไม้ at the shop-order level (editable
-- at any status), and the spawn carries it into tb_forwarder.pricecrate.
--
-- COST/charge field (ค่าตีลังไม้) — NOT part of the ฝากสั่งซื้อ SELL total
-- formula (htotalpriceuser). It feeds the forwarder/import cost + invoice line
-- downstream, mirroring tb_forwarder.pricecrate semantics.
--
-- NOT NULL DEFAULT 0.00 matches tb_forwarder.pricecrate and back-fills every
-- live tb_header_order row safely (no separate UPDATE). IF NOT EXISTS makes it
-- re-runnable. No data migration, no FK, additive.

ALTER TABLE public.tb_header_order
  ADD COLUMN IF NOT EXISTS pricecrate numeric(10,2) NOT NULL DEFAULT 0.00;

COMMENT ON COLUMN public.tb_header_order.pricecrate IS
  'ราคาค่าตีลังไม้ (crate price) — sibling of crate; carried to tb_forwarder.pricecrate on spawn. Cost/charge field, NOT part of the ฝากสั่งซื้อ sell total (htotalpriceuser).';
