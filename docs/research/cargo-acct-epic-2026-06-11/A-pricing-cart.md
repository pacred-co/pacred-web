# Workstream A — Customer cart/order PRICING (the recalc-on-toggle money bug)

> **Owner bug (verbatim intent):** when a customer toggles ทางรถ(EK)/ทางเรือ(SEA),
> ตีลังไม้(crate yes/no), or qty in the cart, the order-summary price does NOT
> recalculate → customers transfer the wrong amount → cost loss. "ตั้งต้นทุน
> กำไร สำคัญมาก … ห้ามตกหล่น ห้ามข้ามห้ามเดา."
>
> **Method:** grounded 100% on the staged legacy source
> (`C:/Users/Admin/AppData/Local/Temp/pacred-legacy/member`) + the live Pacred
> tree. AUDIT ONLY — no code changed.
>
> **Scope note:** the SET-side rate/cost/FX wiring (admin settings → engine) was
> already audited 2026-06-11 in `docs/research/rate-cost-wiring-audit-2026-06-11.md`
> (4-lane fix wave, commits `4963d20b`..`0f3f5443`). **This doc is the
> complementary CUSTOMER-side audit** — does the price the customer SEES react to
> the toggles they touch. The two do not overlap.

---

## 0. TL;DR — the six findings

1. **The legacy customer cart NEVER priced transport/crate at cart time.** Legacy
   `calculateCart.php` (ฝากสั่งซื้อ) = goods only (`cAmount × cPrice × rsDefault`).
   Transport (`fTotalPrice`) + crate (`priceCrate`) are added by **admin** after the
   warehouse measures the goods. So qty→recalc is faithful; รถ/เรือ/ตีลัง→recalc at
   cart **was never a legacy feature**. Pacred `/cart` reproduces this faithfully.
2. **Pacred `/cart` (the LIVE customer cart) is faithful + qty recalc WORKS** — but
   it renders EK/SEA + crate radio cards that have **zero price effect** and **no
   estimate is shown**. That is the *perceived* bug: the customer sees toggles that
   look like they should move the price, and nothing moves. (Legacy had the same
   silent selectors; the owner now wants them to drive a live estimate.)
3. **A working recalc-on-toggle engine ALREADY EXISTS** — `getCustomerImportEstimate`
   (`actions/forwarder-quote.ts`) → `resolveForwarderRate` (`lib/forwarder/resolve-rate.ts`),
   reads the live `tb_rate_*` cards, recomputes on รถ/เรือ/คร/crate change (debounced).
   **But it is wired only into a standalone `/service-import/estimate` page**, never
   into the cart summary or the order-entry form. → **This is the fix: surface the
   existing estimator inside the cart + the import-add form.**
4. **`/service-order/cart` + its `CartManager` (cart-manager.tsx) is DEAD code** —
   the page `redirect("/cart")`s. `CartManager` has the exact bug the owner
   describes (transport/warehouse/crate toggles + a money summary that ignores all
   three), but it is unreachable. **Landmine, not the live bug.** Recommend delete.
5. **Cart-badge count is CORRECT** — `countCart` in `lib/legacy/pcs-chrome.ts` is a
   live `tb_cart` `count('exact')` keyed on the user. No gap. (60 s `unstable_cache`
   TTL; refreshes via `revalidateTag("pcs-chrome")` on cart mutations.)
6. **Crate fee** is correctly modelled everywhere as a **separate adder on top**
   (never inside the rate math), faithful to legacy. The estimator lets the
   customer type a crate THB; the legacy never showed crate THB to the customer
   (admin set `priceCrate`). Decision needed: show a default crate fee or keep it
   admin-set.

**Bottom line:** no customer is silently *charged* wrong by the live flow today —
the live cart seeds `total_thb = 0` and **admin prices the order** before payment
(faithful). The "wrong amount transferred" risk is an **expectation gap**: the
customer toggles รถ/เรือ/ตีลัง, sees no price, guesses, and pre-pays goods-value
only. The fix is to show the existing rate-engine estimate live next to those
toggles (cart + add-form), clearly labelled "ประเมิน — ราคาจริงหลังชั่ง/วัด".

---

## 1. The legacy price model (grounded, file:line)

### 1.1 Two DISTINCT flows — do not conflate

| Flow | Legacy entry | Cart-time price | Transport/crate priced… |
|---|---|---|---|
| **ฝากสั่งซื้อ** (China shopping cart) | `shops.php` → `cart` pages | **goods only** (¥×rate) | by admin LATER, when the shop order becomes a forwarder order |
| **ฝากนำเข้า** (forwarder / customer ships own goods) | `forwarder.php` | **none at create** | by admin in `forwarder.php` `update_data` after measuring |

The owner's "cart" = the ฝากสั่งซื้อ cart. The owner's "toggle รถ/เรือ/ตีลัง" =
the EK/SEA + crate radio pair that BOTH flows show at submit time.

### 1.2 The transport rate engine — `apiCalPrice.php` + `calPriceForwarder2()`

**File:** `member/api/apiCalPrice.php` (the LIVE AJAX preview, 234 lines) +
`member/include/function.php :: calPriceForwarder2()` (referenced; the SAVE-path
twin lives in `pcs-admin/forwarder.php` `getPrice()` per the Pacred port header).

**POST inputs** (`apiCalPrice.php` L154-156): `fProductsType`, `fTransportType`
(1=รถ EK / 2=เรือ SEA), `fWarehouseChina`, `volumeAll`, `weight`, optional `userID`.

**Rate waterfall** (`calPriceForwarder2` L17-127):

```
if customRateSwitch==1               → admin-typed manual rate (highest)   L17-22
else probe tb_rate_custom_cbm(userID):
  num_rows==0:
     coID=='PCS' (general)           → tiered tb_rate_g_kg / tb_rate_g_cbm  L26-86
                                        KG tiers:  ≤100→rgKG1 · >100&&<500→rgKG2 · else rgKG3   L29-56
                                        CBM tiers: ≤2 →rgCBM1 · >2 &&<5  →rgCBM2 · else rgCBM3   L58-85
     else (VIP)                      → flat tb_rate_vip_kg.rKG / tb_rate_vip_cbm.rCBM (by coID) L87-106
  num_rows>0  (SVIP)                 → flat tb_rate_custom_kg.rKG / tb_rate_custom_cbm.rCBM (by userID) L107-126
```

Every rate row is keyed on `(sourceWarehouse, rTransportType, rProductsType[, coID|userID])`
— so **changing fTransportType (รถ↔เรือ) selects a DIFFERENT rate row** → different
price. That is the crux of "toggle รถ/เรือ should change the price."

`round_up()` (`function.php` L86-90) = `ceil(value*100)/100` (ceiling to 2 dp), NOT
banker's rounding. `fTotalPrice = round_up(weight×rateKG)` ; `fTotalPriceCBM =
round_up(volume×rateCBM)`.

### 1.3 KG-vs-CBM selection (`apiCalPrice.php` L198-227)

```
calPriceType==0 ("ราคามากสุด"): bill by whichever total is HIGHER
        fTotalPriceCBM > fTotalPrice → CBM ; else KG                       L199-214
calPriceType==1 → KG (ค่าเทียบ said weight)                                 L215-220
calPriceType==2 → CBM (ค่าเทียบ said volume)
```
**ค่าเทียบ (comparison)** (`calPriceForwarder2` L129-143): if `userComparison==1`
OR `customUserComparisonValue==1`, compute `KGPerCBM = weight/volume`; threshold =
`userComparisonValue` (or 200 fresh / 150 if linked refOrder when custom). `KGPerCBM
> threshold → bill KG (1)` else `bill CBM (2)`. (NB the SAVE path uses `>=` favouring
CBM on ties; the preview `apiCalPrice.php` uses `>` favouring KG — the Pacred port
documents this exactly in `resolve-rate.ts` header.)

### 1.4 Crate fee + the summed order total (`function.php` L1402-1410)

```php
function calPriceForwarderSumCompany(...):
  pricePayAll = (fPriceUpdate + fTotalPrice + fTransportPrice + fShippingService
                + priceCrate + fTransportPriceCHNTHB + priceOther) - fDiscount;
  if (userCompany==1 && pricePayAll>=1000 && ...) pricePayAll -= pricePayAll*0.01;  // 1% juristic
```

→ **`priceCrate` (ตีลังไม้) is a SEPARATE adder**, never inside the rate math.
Same in the cart-of-forwarders summary (`forwarder/calPrice.php` L26) and the per-order
display (`pcs-admin/.../forwarder/update.php` L873). The 1% juristic discount only
when `userCompany==1 && total>=1000`.

### 1.5 The ฝากสั่งซื้อ cart total (`cart/calculateCart.php`, 31 lines — goods only)

```php
rsDefault = tb_settings.rsDefault (ID=1);  if pro==19 → rsDefault = 5.10;     L6-12
foreach selected tb_cart row:  price += (cAmount * cPrice);                    L19-23
return { price (¥), priceTH = price*rsDefault };                              L25-29
```
**No transport, no crate, no rate table.** This is the legacy cart's ENTIRE price
math. Transport/crate are NOT computed here — they're collected as form fields and
priced later by admin.

`cart/updateQuantity.php` (12 lines): `UPDATE tb_cart SET cAmount` — persists qty only.

### 1.6 The recalc TRIGGER mechanism legacy uses (the key the owner is missing)

Legacy = **AJAX-on-change**. The customer order-entry FORM (`forwarder.php` at the
member root — NOT in this staged copy, but its ADMIN twin `pcs-admin/.../forwarder/
update.php` L1600-1758 is identical in shape and IS staged) binds a recompute to
EVERY price-driving field:

```js
function calPriceKG(){                                          // update.php L1624-1658
   read fWarehouseChina, productsType, kgProduct, volumeHidden,
        fTransportPrice, fDiscount, priceCrate, priceOther, fAmount …
   $.ajax POST include/pages/forwarder/calPrice.php  →  $('#dataPrice').html(data);
}
$('#productsType').on('change keyup', calPriceKG);             // L1734
$('#fTransportPrice').on('change keyup', calPriceKG);          // L1740
$('#priceCrate').on('change keyup', calPriceKG);               // L1731
$('#fWarehouseChina').on('change keyup', calPriceKG);          // L1737
$('#fAmount').on('change keyup', () => { calPriceKG(); calVolumeAll(); });  // L1755-1758
function calVolumeAll(){ volumeAll = round(volume * fAmount,5); }           // L1716-1721
```

So in legacy: **change รถ/เรือ → AJAX → re-render the price block.** `calVolumeAll`
re-derives `volume×qty` whenever qty changes. THIS is the mechanism Pacred's cart
+ add-form lack. (The transport-type `<select>` on the admin page submits a full
form rather than firing `calPriceKG` directly, but the customer-side `apiCalPrice.php`
takes `fTransportType` as a live POST param — proving the engine is built to recompute
per transport mode.)

---

## 2. Pacred current state (grounded, file:line)

### 2.1 Price engines — TWO pure ports (both correct)

| Module | Lane | Drives |
|---|---|---|
| `lib/forwarder/resolve-rate.ts` | **LIVE** `tb_forwarder` (~45k rows) | faithful port of `forwarder.php` `getPrice()` SAVE path. Used by admin pricing + the customer estimator. Handles manual→SVIP→general(tiered)→VIP, KG/CBM, ค่าเทียบ, `>=`-tie. |
| `lib/forwarder/calc-price.ts` | rebuilt `forwarders` (~0 prod rows) | port of `apiCalPrice.php`; only `service-import/add` rebuilt lane. Crate/qc/service-fee as explicit adders. |

Both are PURE + unit-tested; the caller does the SQL waterfall. **No engine bug.**

### 2.2 The customer estimator — `getCustomerImportEstimate` (THE working recalc)

`actions/forwarder-quote.ts` L119-180: customer-safe. Reads the user's tier
(`tb_users.coID`, SVIP probe on `tb_rate_custom_cbm`), then for each transport mode
(`TRANSPORTS`) reads the live `tb_rate_*` candidates and calls `resolveForwarderRate`.
Returns per-mode `{ unitRate, basisUsed, transportSubtotal, crateThb, grandTotal,
hasRate }` + the cheapest. **Crate = a separate `crateThb` adder** (L130/L159),
faithful. **This is exactly "connected to the rate/cost settings."**

**UI:** `app/[locale]/(protected)/service-import/estimate/import-estimate-client.tsx`
— a `"use client"` component that recomputes via a **400ms-debounced `useEffect`**
on `[warehouse, productType, basis, weightKg, cbm, crate, crateThb]` (L83-106).
**Toggling รถ/เรือ/คร/crate DOES live-recalc here — it works.**

⚠️ **Gaps in the estimator itself:** (a) **no qty field** — only W×L×H or direct
CBM + weight (L46-78); the legacy `calVolumeAll = volume×fAmount` per-box scaling is
absent. (b) crate THB is a free-typed default "300" (L58) — legacy never exposed
crate THB to the customer. (c) It's a **standalone page** reachable from the
left-menu (`components/legacy/pcs-left-menu.tsx`), **disconnected from the actual
order flow** — the customer estimates on one page, then orders on another that shows
no price.

### 2.3 The LIVE cart — `/cart` (faithful, qty recalc works, transport/crate inert)

- **Page:** `app/[locale]/(protected)/cart/page.tsx` — faithful port of `cart.php`.
  `ShippingOptionsCard` (L527-601) renders the EK/SEA (`hTransportType` 1/2) + crate
  (`crate` 2/1) radio pair **verbatim from `cart.php` L601-651** — pure form fields,
  **no price wiring** (faithful: legacy didn't price them here either).
- **Summary:** `cart-interactivity.tsx` (`CartInteractivity`). The order summary
  recomputes **goods-only** via `calculateCartTotal` (the `calculateCart.php`
  replacement): `priceCny` + `priceThb = priceCny × rsDefault` + promo discount.
  - ✅ **qty → recalc WORKS** (`changeAmount` L222-238 recomputes `priceCny`
    locally; `recompute` L192-206 hits the server action on select/pro2 change).
  - ✅ select-all / per-row select → recalc (L208-220).
  - ✅ pro2 (3.3) → rsDefault 5.10 (L240-243), faithful to `calculateCart.php` L10-12.
  - ❌ **toggling `hTransportType` (รถ/เรือ) or `crate` → summary unchanged** —
    because (faithfully) these are not in the cart price. **No estimate of the
    coming transport cost is shown.** ← the owner's perceived bug.
- **Badge:** `countCart` (`lib/legacy/pcs-chrome.ts` L407) = live `tb_cart` count. ✅

### 2.4 The order-entry form — `/service-import/add` (no price at all)

`service-import-add-fields.tsx`: collects `fTrackingCHN`, `fDetail`, `fAmount`,
`hTransportType` (1/2), `crate` (2/1), address, ship-by — **no weight/cbm, no price
preview** (faithful — customer doesn't know weight yet; admin measures). Submits via
`createLegacyForwarder`. The toggles are inert here too, but legacy was the same
(no price shown to the customer at create). Still: a "ดูราคาประเมิน" affordance
(reusing the estimator) would close the expectation gap.

### 2.5 The submit + when the REAL price is set

- `/cart` → `submitCartOrder` → seeds the shop order at `hStatus='1'`, **price not
  set**. `placeServiceOrder` (the dead-cart delegate) returns `total_thb: 0` with
  the comment "priced by admin at hStatus 1→2 (รอชำระเงิน)" (`actions/service-order.ts`
  L740). **Admin prices the order** (warehouse measures → `resolve-rate.ts` math →
  `fStatus=5 รอชำระเงิน`). This is faithful and is why no one is *silently
  over/under-charged by the cart* — the binding price is set after measurement.

### 2.6 DEAD code — `/service-order/cart` + `CartManager`

`app/[locale]/(protected)/service-order/cart/page.tsx` = `redirect("/cart")` (the
"split-brain fix": header badge + search CTA used to point here; all unified on
`/cart`). `cart-manager.tsx` (`CartManager`) is imported ONLY by that redirected
page → **unreachable**. But it is the textbook bug: it renders transport(truck/ship/
air)+warehouse+crate toggles (L372-428) and an order summary `totalThb = subtotalCny
× yuanRate + serviceFee` (L81-84) that **ignores all three**. If anyone ever
re-mounts it, the owner's bug ships. **Recommend deletion** (with `/service-order/cart`
left as the redirect, or removed if no inbound links remain).

---

## 3. The GAP table (legacy logic · Pacred state · GAP · fix)

| # | Concern | Legacy (file:line) | Pacred state | GAP | Concrete fix |
|---|---|---|---|---|---|
| A1 | **Price recalc on รถ/เรือ toggle** | `apiCalPrice.php` takes `fTransportType` live; `calPriceKG` on-change AJAX (`update.php` L1734-1742) | `/cart` shows EK/SEA radios with **no price effect**; engine (`getCustomerImportEstimate`) exists but only on `/service-import/estimate` | **Customer toggles รถ/เรือ → sees no price** (perceived "doesn't recalc") | **Surface the estimator in the cart.** Add a client island next to `ShippingOptionsCard` that, when the customer has supplied (or is asked for) weight/CBM, calls `getCustomerImportEstimate` and shows a per-mode "ราคาขนส่งโดยประมาณ" that updates on `hTransportType`/`crate` change. Label "ประเมิน — ราคาจริงคิดหลังชั่ง/วัดที่โกดัง". |
| A2 | **Price recalc on ตีลัง toggle** | `priceCrate` separate adder (`function.php` L1405); `$('#priceCrate').on('change', calPriceKG)` (L1731) | `/cart` crate radios inert; estimator supports `crateThb` adder (works on `/estimate`) | Crate toggle moves nothing on the cart | Same island (A1): pass `crate` boolean → add the crate THB to the estimate. Decide a **default crate fee** (legacy left it admin-set; if showing to customer, seed a config `cargo.crate_default_thb`). |
| A3 | **Price recalc on qty change** | `calVolumeAll = volume×fAmount` then `calPriceKG` (`update.php` L1716-1721, L1755) | `/cart` qty recalc **works** (goods ¥). Estimator has **no qty field** | For the cart goods total: ✅ no gap. For the transport estimate: the estimator can't scale by box count (only total weight/CBM) | If A1 surfaces a per-box estimate, add a qty/`fAmount` input to the estimate call so `volumeAll = perBoxCbm × qty` (mirror `calVolumeAll`). For the goods cart total, nothing to do. |
| A4 | **Cart-badge count** | `tb_cart` row count | `countCart` = live `tb_cart` `count('exact')` (`pcs-chrome.ts` L407) | **None** | No change. (Note the 60s cache → call `revalidateTag("pcs-chrome")` on any new cart add/remove if instant badge is wanted; already done on the existing mutations.) |
| A5 | **Rate-settings wiring** | rate tables `tb_rate_g_*`/`tb_rate_vip_*`/`tb_rate_custom_*` | `resolveForwarderRate`/`getCustomerImportEstimate` read these LIVE; SET side fixed in the 2026-06-11 wave | **None new** (covered by `rate-cost-wiring-audit-2026-06-11.md`) | Reuse `getCustomerImportEstimate` — it already reads the live cards. Don't build a new rate path. |
| A6 | **Dead `CartManager` landmine** | n/a | `cart-manager.tsx` reachable only via redirected `/service-order/cart`; has the exact ignored-toggle bug | A re-mount would ship the bug; also confuses future readers | **Delete** `cart-manager.tsx` (+ `service-order-bulk-actions.tsx` if only used there) and keep `/service-order/cart` as the thin redirect (or remove if no inbound links). |
| A7 | **Order-entry form price preview** | legacy customer `forwarder.php` showed an AJAX price block as the customer typed | `/service-import/add` shows **no price** (faithful) | Expectation gap only (customer can't see an estimate while creating an import order) | Optional: add a "ดูราคาประเมิน" button on the add-form that opens the estimator pre-filled with the chosen transport/crate. Lower priority than A1. |

---

## 4. Concrete build plan (for the fix workstream — not done here)

**Goal:** make the toggles the owner cares about (รถ/เรือ · ตีลัง · qty) drive a
**live, rate-engine-backed estimate** shown right where the customer toggles them,
WITHOUT changing the faithful "admin sets the binding price after measuring" flow.

**Approach — reuse, don't rebuild.** The engine + the customer-safe action already
exist and already read the live `tb_rate_*` cards. The work is UI wiring + one
qty-aware tweak.

### Files to change
1. **`app/[locale]/(protected)/cart/page.tsx`** — render a new client island
   (below/beside `ShippingOptionsCard`) for the China→TH transport estimate.
2. **NEW `app/[locale]/(protected)/cart/cart-transport-estimate.tsx`** (`"use client"`)
   — owns `hTransportType`/`crate`/(optional weight·CBM·qty) state, calls
   `getCustomerImportEstimate` debounced (copy the 400ms `useEffect` pattern from
   `import-estimate-client.tsx` L83-106), renders per-mode "ราคาขนส่งโดยประมาณ"
   with the "หลังชั่ง/วัดจริงที่โกดัง" disclaimer. Bridge the existing cart radio
   inputs (`name="hTransportType"`/`name="crate"`) to this island via a `CustomEvent`
   or shared state (the cart already uses a `CustomEvent` bridge for maomao —
   `cart-interactivity.tsx` L158-164 — follow that precedent).
3. **`actions/forwarder-quote.ts` — `getCustomerImportEstimate`** — add an optional
   `qty`/`amount` input so `billableValue` can scale `volumeCbm × qty` (mirror
   legacy `calVolumeAll`). Keep backward-compatible (default qty=1).
4. **`import-estimate-client.tsx`** — add the same qty field for parity (currently
   missing) so both surfaces agree.
5. **`app/[locale]/(protected)/service-import/add/*`** (A7, optional) — a "ดูราคา
   ประเมิน" affordance reusing the same island.
6. **Delete** `app/[locale]/(protected)/service-order/cart/cart-manager.tsx` (A6).
7. **i18n** — add the estimate-card keys to `messages/th.json` + `messages/en.json`
   (`cartPage` namespace) with parity (`pnpm audit:i18n`).
8. **Config (A2 decision)** — if a default crate fee is shown, add
   `business_config cargo.crate_default_thb` (else keep crate THB hidden/admin-set
   and show only "ตีลัง: คิดเพิ่มตามจริง").

### Server-action vs client
- **Recompute = client-debounced call to the EXISTING server action**
  (`getCustomerImportEstimate`). Rates live in the DB, so the math must run
  server-side — exactly what the estimate action already does. The client only
  owns toggle state + the debounce + render. This mirrors both the legacy
  AJAX-on-change pattern (§1.6) and the working `/estimate` page.
- **Do NOT** compute price in the browser from a shipped rate table (leaks internal
  rates + tiers). The customer-safe action already strips margin/floor/tier internals.

### Guardrails (AGENTS.md §0c/§0e/§0f)
- The estimate is **advisory** — keep `total_thb=0` at submit; admin still sets the
  binding price (don't accidentally make the estimate the charge). State this in
  the UI.
- Confirm-before-mutate is N/A (estimate is read-only) but the order **submit**
  already confirms (`cart-interactivity.tsx` L404).
- Verify the estimate card renders nothing/an honest "กรอกน้ำหนัก/ปริมาตรเพื่อ
  ประเมิน" empty-state when weight+CBM are unknown (the cart customer often
  doesn't know weight — be honest, don't show ฿0).
- Mobile-first (360/390): the estimate card sits in the cart's existing responsive
  grid.

---

## 5. Evidence index (every claim's source)

**Legacy** (`C:/Users/Admin/AppData/Local/Temp/pacred-legacy/`):
- `member/api/apiCalPrice.php` L4-153 (rate waterfall), L154-233 (POST + KG/CBM select + render)
- `member/api/apiCalPricePCS.php` L8 (`volumeAll×120`, floor 50 — the PCSE estimate)
- `member/include/function.php` L86-90 (`round_up`), L1402-1410 (`calPriceForwarderSumCompany` + 1% juristic + crate adder)
- `member/include/pages/cart/calculateCart.php` L6-29 (goods-only cart total + rsDefault/pro19)
- `member/include/pages/cart/updateQuantity.php` L8 (qty persist)
- `member/include/pages/forwarder/calPrice.php` L21-46 (forwarder-list summary: `+priceCrate`, +50 PCSF, 1% juristic)
- `member/pcs-admin/include/pages/forwarder/update.php` L570-571 (`crate`/`nameCrate`), L873 (`priceAllUser` sum incl. `priceCrate`), L1231-1234 (`priceCrate` field), L1624-1758 (the `calPriceKG` on-change AJAX recompute mechanism)

**Pacred** (worktree `…/adoring-chandrasekhar-0f8ad7`):
- `lib/forwarder/resolve-rate.ts` (LIVE rate port — full header documents the legacy line refs)
- `lib/forwarder/calc-price.ts` (rebuilt-lane port; crate/qc adders L236-249)
- `actions/forwarder-quote.ts` L119-180 (`getCustomerImportEstimate` — reads live `tb_rate_*`, per-mode recompute, crate adder)
- `app/[locale]/(protected)/service-import/estimate/import-estimate-client.tsx` L83-106 (debounced recalc-on-toggle — the working reference; no qty field)
- `app/[locale]/(protected)/cart/page.tsx` L527-601 (`ShippingOptionsCard` EK/SEA+crate radios, faithful, no price)
- `app/[locale]/(protected)/cart/cart-interactivity.tsx` L192-243 (goods recompute: qty/select/pro2 work; transport/crate not in total), L827-857 (summary)
- `app/[locale]/(protected)/service-order/cart/page.tsx` (`redirect("/cart")` — dead)
- `app/[locale]/(protected)/service-order/cart/cart-manager.tsx` L81-84 (`totalThb` ignores transport/crate), L372-428 (the inert toggles) — DEAD landmine
- `app/[locale]/(protected)/service-order.ts` (sic `actions/service-order.ts`) L658-745 (`placeServiceOrder` → `submitCartOrder`, `total_thb: 0`, admin prices later)
- `lib/legacy/pcs-chrome.ts` L407 (`countCart` live `tb_cart` count) , L89-100/156-164 (badge fields)
- `app/[locale]/(protected)/service-import/add/service-import-add-fields.tsx` (order-entry form — toggles, no price)

**Prior overlapping audit (do not re-do):** `docs/research/rate-cost-wiring-audit-2026-06-11.md`
(SET-side rate/cost/FX; the live money loop is CONNECTED; commits `4963d20b`..`0f3f5443`).
