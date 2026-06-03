# 🧾 Order/pricing flow recheck vs legacy + customer estimator (2026-06-04)

Owner asked (overnight): recheck the customer order/pricing flow 1:1 vs legacy — the price should change when picking transport (รถ/เรือ/แอร์-เร็วๆนี้) / crate (ตีลัง); add address-select (รับเอง Pacred / ที่อยู่ลูกค้า / อื่น); add shipment-reassign-to-another-customer; link/auto-fill everything.

## 1. Pricing-flow reality — VERIFIED against legacy source (the owner's premise needed nuance)
- **Legacy `forwarder/calPrice.php`** (customer AJAX) = SUMS the ADMIN-ALREADY-SET prices of the forwarders the customer selects to PAY (`fTotalPrice + fTransportPrice + fPriceUpdate + fShippingService + priceCrate + fTransportPriceCHNTHB + priceOther − fDiscount`, + PCSF 50฿, + juristic 1%). It is the **payment-total calc**, NOT a live transport/crate recalc.
- **Legacy `shops/calPrice.php`** (shop order) = SUMS `((hTotalPriceCHN + hShippingCHN) × hRate) + hShippingService` for the selected hStatus=2 orders. Same — payment-sum of admin-set values.
- **Transport-mode (fTransportType) + crate (priceCrate)** are **set ADMIN-side after the China warehouse measures the goods** (`forwarder-action.php` / Pacred `tb-edit-panel`). The customer never picked them with a live price in legacy.
- ∴ Pacred's `calculateForwarderTotal` (sums the same stored cols for the selected IDs + PCSF 50 + juristic 1%) is a **faithful 1:1 port**. The "static price at order" the owner saw is **correct-per-legacy** — the price isn't customer-set at order time; it's admin-set after measurement, summed at payment.

## 2. ✅ NEW (built this run): customer import price ESTIMATOR
A Pacred enhancement (NOT a legacy port — legacy had no customer estimator) giving the owner's "เพิ่มให้เลือก + ราคาเปลี่ยน":
- **`/service-import/estimate`** (`page.tsx` + `import-estimate-client.tsx`) — customer enters น้ำหนัก + ขนาด (กว้าง×ยาว×สูง→คิวอัตโนมัติ, or direct คิว) + โกดัง (กวางโจว/อี้อู) + ประเภทสินค้า + **transport mode (รถ/เรือ/แอร์-เร็วๆนี้)** + **ตีลัง toggle** → **LIVE price per mode, recalcs on every change** (debounced). Marks the cheapest mode. Clearly labeled **"ราคาประเมิน — ราคาจริงคำนวณหลังชั่ง/วัดจริงที่โกดัง"**.
- **`actions/forwarder-quote.ts::getCustomerImportEstimate`** — `requireAuth`, uses the customer's OWN rate tier, reuses the **verified Lane C engine** (`resolveForwarderRate` — the SVIP→VIP→general waterfall + KG-vs-CBM "ราคามากสุด" rule). ⚠️ **Privacy:** returns ONLY the customer's own price/rate; STRIPS the internal tier-naming, min-sell floor, CEO margin/profit, cost basis (those stay admin-only in `quote-multimode.ts`).
- Reachable (§0d): sidebar บริการฝากนำเข้า → "ประเมินราคานำเข้า".
- 🟠 **Owner morning-decision:** confirm the UX/placement; whether to also expose a PUBLIC (no-login, general-rate) version as a marketing/conversion tool on `/services/import-china`; whether to show the unit rate to the customer (currently shown — it's their own negotiated rate).

## 3. ✅ Already-existing (verified, the owner's "เพิ่มแต่คิดว่ามีอยู่แล้ว")
- **Address-select at order** — `cart/cart-address-shipby.tsx`: เปลี่ยนที่อยู่ modal lets the customer pick any saved `tb_address`, their main, OR "รับเองโกดัง Pacred" (warehouse pickup) + the in-TH carrier per the chosen address. ✅ exists + reachable.
- **Shipment-reassign to another customer** — `actions/admin/forwarders-field-edits.ts::adminReassignForwarderOwner` (legacy L1469), wired at `/admin/forwarders/[fNo]` via `tb-edit-panel.tsx` ("⚠ ย้ายเจ้าของรายการ — เฉพาะกรณีสร้างผิดบัญชี"): admin types the target PR code → **GUARD: the target `tb_users.userID` must exist** (Pacred-added; legacy didn't check → could orphan) → `tb_forwarder.userid` moves to that customer + audit-logged (`tb_forwarder.reassign_owner`, from→to). Verified what moves:
  - ✅ **The forwarder row + its line-items** (`tb_forwarder_item` keyed by the forwarder `id`, not userid) + its container/cnt linkage (keyed by forwarder) → **follow automatically** (children of the row). This IS the owner's "shipment/tracking ย้ายไปหาลูกค้าคนนั้น" — the whole shipment (tracking, items, cabinet) moves.
  - ⚠️ **The address snapshot** (`fAddress*` cols ON the row) stays as-is — **faithful to legacy** (it doesn't re-copy); the operator should re-pick the destination address after reassigning. (Owner morning-decision: auto-clear it / prompt a re-pick toast?)
  - ✅ **Already-settled wallet/payment** stays with the original payer — correct (money already moved under them; not a "move" candidate).
  - 🟠 **Scope note for owner:** reassign currently covers **ฝากนำเข้า (forwarder = the thing with tracking)**. **ฝากสั่งซื้อ (shop order, `tb_header_order`) has no owner-reassign** — but shop orders have no tracking until they spawn a forwarder, so "shipment/tracking reassign" = forwarder reassign = ✅ done. Confirm if a shop-order reassign is also wanted.

## 4. Auto-fill / link (the "ใช้ data ให้สุด, กรอกน้อยสุด" principle)
Already strong: order flows auto-fill the customer's address + rate tier from their profile; the estimator auto-derives คิว from dimensions; CRM links LINE↔customer↔orders. Broader opportunities (for owner prioritization): default the estimator's warehouse/product from the customer's last order; one-click "สร้างออเดอร์จากราคาประเมินนี้"; auto-suggest the cheapest mode at order. These are enhancements, not 1:1 gaps.

## Status
`pnpm typecheck` gating. Customer estimator is read-only (no order/money mutation), reuses the verified engine. Built per owner's explicit "เพิ่มให้เลือก" + flagged as a NEW enhancement (legacy was admin-set). Cross-ref: [`global-trade-group-2026-06-04.md`](global-trade-group-2026-06-04.md) §5 · Lane C `actions/admin/quote-multimode.ts`.
