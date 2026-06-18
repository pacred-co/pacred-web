-- 0192 — คิว (CBM) precision → 6 decimals for MONEY exactness.
-- Owner 2026-06-18: "เรื่องคิว ทศนิยมต้องเป๊ะนะครับ เพราะเดี๋ยวเรื่องเงินจะเพี้ยน".
-- The China packing list carries 6-decimal volumes (e.g. 0.073834 CBM) but
-- tb_forwarder.fvolume was numeric(10,5) → it truncated to 0.07383, drifting the
-- billed CBM×rate. Widen the BILLED-VOLUME columns to numeric(14,6) (8 integer +
-- 6 fractional digits · widening · non-destructive · no existing CBM overflows —
-- a container CBM is < 100). RATE columns (฿/CBM: customratecbm, tb_rate_*_cbm,
-- container_costs.rate_per_cbm_thb, …) are PRICES not volumes → they stay 2dp.
-- No view depends on these columns (verified) → plain ALTER.
ALTER TABLE tb_forwarder      ALTER COLUMN fvolume           TYPE numeric(14,6);
ALTER TABLE tb_forwarder_item ALTER COLUMN productcbmperitem TYPE numeric(14,6);
ALTER TABLE tb_forwarder_item ALTER COLUMN productcbmall     TYPE numeric(14,6);
-- NOTE: existing rows already stored at 5dp (or 2dp for items) keep their
-- truncated value — re-import from the packing list to make a past container
-- exact (the truncation Δ is ~1e-6 CBM · immaterial per row). FUTURE writes are
-- exact: the write-path roundings were changed from *100000/100000 (5dp) to
-- *1000000/1000000 (6dp) in the same change set.
