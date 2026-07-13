# Foreign-currency (USD) shop-order rate — store the TYPED rate, don't re-derive it (2026-07-13)

> Owner P22353/P22343: "ตั้งเรทขาย USD 35 แต่ขึ้น 35.006."

## The bug
A ฝากสั่งซื้อ opened in USD keeps `tb_header_order.hrate` = the **effective ¥→฿ rate**
(`effRate = บาท-per-USD ÷ ¥-per-USD`), and `hrate` is **numeric(10,2)**. The editor RE-DERIVES
the displayed บาท/USD from that 2dp `hrate` on every load (`bahtPerUnit = (Σ¥ × hrate) ÷ ΣUSD`).
A round-trip through a 2dp rate + the `roundUp2` (CEIL) of the ¥ subtotal drifts a typed `35` to
`35.006` (up to ~0.5% of the rate). The ฿ TOTAL was always correct (recomputed from the typed
input on save) — only the redisplayed RATE drifted.

## The fix (mig 0252 · additive · display-only)
Store the operator's **typed** rate verbatim in `tb_header_order.husdrate` (numeric(12,6)); the
editors prefer it over the derived value; both save actions
(`adminSaveShopOrderItemsAndQuote` + `adminUpdateOrderRate`) write it. `hrate` stays the money
basis (untouched) → a ¥ order is byte-identical. Lesson: **a value the operator TYPES must be
persisted, not reconstructed from a lower-precision derived field** — the round-trip is lossy.

## Related — refund of a foreign/¥ order = ¥ × the ORDER's paid rate (recurring)
A shop refund credits the wallet in ฿ = `cprice × qty × header.hrate` (the rate the customer
PAID), NOT ¥-as-฿ (5× short) and NOT the live rate. Both refund credit legs
(`service-orders-refund.ts:227,534`) use `× orderHrate`, and the refund recomputes the header
totals from the remaining lines (`htotalpricechn` / `htotalpriceuser`). This was fixed
2026-07-10 (`45842dee`, for P22343) — a P22343 that still shows a stale ¥-total or short wallet
credit is **pre-fix data**, not a live bug (the code is correct going forward). See
[[vip-tier-removal-and-refund-rate]] · [[cost-editable-sell-locked]].
