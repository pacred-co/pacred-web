-- 0194 — MOMO (ฮุย ไท่ต๋า / HUI TAI DA) actual COST rate = 2,500 / CBM.
--
-- Owner 2026-06-19 + supplier invoices INV-20260618-0003 / -0004: MOMO bills
-- Pacred a flat 2,500/CBM ("คิดตาม CBM") per tracking from Guangzhou. The seeded
-- legacy defaults were 2,900 (sea · fcostship*defaultmomo) and 4,500 (road ·
-- fcostcar*defaultmomo) — both OVERSTATE the MOMO cost (→ understate profit, e.g.
-- container MO20260523-SEA02). The team was already hand-overriding MOMO
-- containers to 2,500 via per-cabinet custom rates (tb_cost_container); this
-- makes the DEFAULT match the bill so the override is no longer needed.
--
-- Per-shipment exceptions still happen (one invoice line was 4,700 for a 869kg
-- shipment, another 0.00) — those keep using a per-container custom rate, which
-- always wins over this default. Yiwu MOMO cells (…momo2) are left untouched (0)
-- — every invoice is Guangzhou; we never guess a rate (faithful to resolve-cost).
--
-- tb_settings is a single global config row. Idempotent (re-running sets 2,500
-- again). COST cells only — no SELL/rate-card column is touched.
UPDATE tb_settings SET
  fcostship1defaultmomo = 2500, fcostship2defaultmomo = 2500,
  fcostship3defaultmomo = 2500, fcostship4defaultmomo = 2500,
  fcostcar1defaultmomo  = 2500, fcostcar2defaultmomo  = 2500,
  fcostcar3defaultmomo  = 2500, fcostcar4defaultmomo  = 2500;
