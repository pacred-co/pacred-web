# Legacy gap audit — cust-06-misc (Address · China-address · China product search · Map)

> Lane: `cust-06-misc` · side: **customer** · auditor pass: 2026-05-30
> Legacy spec: `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/member/`
> Pacred HEAD: `dave-pacred` (`844a0b5a`)
> Mandate: ห้าม death — legacy is the spec; flow-ORDER must match.

---

## Overview

### Legacy scope (what PCS Cargo actually shipped for this lane)

The top-level page files (`member/address.php`, `china-address.php`, `search.php`,
`map.php`, `convertURL.php`) are **absent from this extract** — only the front-controller
handlers under `member/include/pages/{address,search}/` + the `member/api/*` endpoints
survive. The page-level markup was reconstructed by the Pacred porters from a fuller
snapshot (their file-header line refs match), so the workflow inventory below is built from
the surviving handlers + the porters' transcription comments + the nav (`left-menu.php`,
`top-menu.php`).

Legacy workflows in this lane:

1. **Thai delivery address (`address.php` + `include/pages/address/*`)** — CRUD over
   `tb_address` + `tb_address_main`:
   - ADD (`address.php` POST `add` → INSERT tb_address; if no main → INSERT tb_address_main)
   - EDIT (`editAddress.php` modal → POST `update` → UPDATE tb_address)
   - DELETE (`deleteAddress.php` AJAX → soft-delete `addressStatus='0'`; refuses if it is the main address → echoes `1`)
   - SET MAIN (`setMainAddress.php` AJAX → UPDATE tb_address_main.addressID)
   - jQuery.Thailand subdistrict→district→province→zipcode autocomplete (`#demo1`)
   - Google Maps pin-drop writing `latitude`/`longitude` hidden inputs
2. **China warehouse address (`china-address.php`)** — the member-portal file is an
   **empty placeholder** (`card-body` blank). The real China-warehouse content lives in the
   WordPress page `ที่อยู่โกดังจีน/` (linked from `top-menu.php` dropdown), not the member portal.
3. **China product search (`search.php` + `include/pages/search/*`)** — the iconic PCS flow:
   - URL paste (MODE A): paste 1688/taobao/tmall product link → `searchURL.php` parses via
     `laonet.online` `item_get` (1688 + taobao) with `akucargo.com get/v2` fallback → renders
     product card with SKU axis grid + qty + price (`calPriceForwarder2`) + **add-to-cart** (`btnCart` → cart.php)
   - Keyword search (MODE B): `searchKey.php`/`search.php` → `akucargo.com search/v1` (1688 / taobao tabs)
     + `provider=pcs` → SQL on `tb_product`; popular keywords from `tb_keyword_product`; logs each
     search into **`tb_history_key`**
   - Reverse-image search: camera upload (`top-menu.php` `imagesSearch`) + the "ค้นหาสินค้าที่คล้ายกัน"
     (find-similar) link on every result → `searchIMG.php`/`searchIMG2.php` → `laonet.online item_search_img` (`?img=`)
4. **Geolocation map (`map.php`)** — standalone Google Maps "Pan to current location" sample; no SQL.
5. **APIs** — `apiCalPrice.php` (forwarder freight price calc, full tiered rate engine), `apiCalPricePCS.php`
   (flat ฿120/CBM min ฿50), `check-juristic-person/` (DBD/MOC OpenAPI → autofill company name + Thai
   address from a 13-digit juristic ID — **customer-facing** tax-invoice autofill), `convert-img-to-webp/`
   (GD image→webp resize for uploads), `getLineOA.php` (writes `tb_users.userLineIDOA` for LINE OA linking).

### Pacred scope (what exists on `dave-pacred`)

- `/addresses` (`app/[locale]/(protected)/addresses/page.tsx`) — faithful 1:1 transcription reading
  `tb_address`/`tb_address_main`; ADD wired via `add-address-action.ts` → `tb_address` (correct table).
- `/china-address` — faithful 1:1 (empty placeholder, matching legacy).
- `/map` — faithful 1:1 (verbatim Google Maps embed in an iframe).
- `/search` — faithful 1:1 transcription. MODE A (URL paste) wires `convertProductUrlDetail` (TAMIT-cloud);
  MODE B keyword wires AkuCargo (taobao/1688) + `tb_product` (pcs). Popular keywords + the camera form +
  the global search bar live in `components/legacy/pcs-top-menu.tsx`.
- **Working buy-flow lives on `/service-order/add`** (`link-paste-search.tsx` → `searchProductByUrl` +
  `addCartItem`) — NOT on `/search`.
- `lib/china-search/*` — TAMIT detail + AkuCargo keyword + laonet image + short-url cache, well-built + unit-tested.
- `app/api/china-search/{route.ts,image/route.ts}` — keyword + reverse-image API routes EXIST.
- `lib/dbd/parse-juristic.ts` + `actions/admin/customers.ts` — DBD juristic lookup, **admin-only**.
- Two **dead** rebuilt files: `actions/addresses.ts` + `addresses-manager.tsx` (write to the empty rebuilt
  `addresses` table; imported by nothing reachable).

### % complete (faithfulness + zero-retraining lens)

**~62%.** The visible surfaces are faithfully transcribed (address list, search markup, map, china-address)
and the core revenue path (paste link → add to cart) works on `/service-order/add`. But the **customer
self-service mutations** that the legacy gave customers are missing or in the wrong place:
address edit/delete/set-main are inert; reverse-image search has a route but no wired UI; the customer
tax-invoice juristic-autofill is admin-only; and the search→cart flow was relocated off `/search`
(flow-order divergence). Plus a search-log table divergence (`tb_history_key` → `tb_search_history`).

---

## Workflow-by-workflow gap table

| # | Legacy flow | Pacred equivalent | Status | Flow-order correct? | Owner |
|---|---|---|---|---|---|
| 1 | Address — list (`tb_address` WHERE addressStatus='1') | `/addresses` page.tsx reads tb_address | ✅ | ✅ | เดฟ |
| 2 | Address — ADD (INSERT tb_address + conditional tb_address_main) | `add-address-action.ts` → tb_address (+tb_address_main) | ✅ | ✅ | เดฟ |
| 3 | Address — EDIT (`editAddress.php` → UPDATE tb_address) | none (customer); row button inert; admin-only via `customer-profile.ts` | ❌ | n/a | เดฟ |
| 4 | Address — DELETE (`deleteAddress.php` → addressStatus='0', refuse-if-main) | none (customer); row button inert | ❌ | n/a | เดฟ |
| 5 | Address — SET MAIN (`setMainAddress.php` → tb_address_main) | none (customer); row button inert; admin-only via `customer-profile.ts` | ❌ | n/a | เดฟ |
| 6 | Address — jQuery.Thailand subdistrict→zipcode autocomplete | `#demo1` markup rendered, plugin inert (lat/long not autofilled either) | 🟡 | n/a | ปอน |
| 7 | Address — Google Maps pin-drop → lat/long | `#map` empty div; lat/long hidden inputs always blank→0 | 🟡 | n/a | ปอน |
| 8 | China warehouse address (`china-address.php` empty placeholder) | `/china-address` faithful empty placeholder | ✅ | ✅ | ปอน |
| 9 | China warehouse address — real content (WP `ที่อยู่โกดังจีน/`) | no China-warehouse address content anywhere in Pacred | ❌ | n/a | ปอน |
| 10 | Search — URL paste MODE A (parse product card) | `/search` UrlPasteMode → convertProductUrlDetail (TAMIT) | ✅ | 🟡 (see #12) | เดฟ |
| 11 | Search — keyword MODE B (taobao/1688/pcs tabs) | `/search` AkuCargo + tb_product | ✅ | ✅ | เดฟ |
| 12 | Search — add-to-cart FROM the search result (`btnCart` → cart) | `/search` btnCart is inert (`action=""`); buy-flow relocated to `/service-order/add` | 🟡 | ❌ (relocated) | เดฟ |
| 13 | Search — reverse-image / "find-similar" (`?img=` → searchIMG → laonet) | `/search` SearchParams has no `img`; api/china-search/image route EXISTS but unwired to UI | ❌ | n/a | เดฟ |
| 14 | Search — camera upload from global bar (`top-menu.php` imagesSearch → /search) | pcs-top-menu camera form posts `imagesSearch` to /search; /search ignores it | ❌ | n/a | เดฟ |
| 15 | Search — popular keywords (`tb_keyword_product`) | pcs-top-menu reads keywords (server-loaded) | ✅ | ✅ | ปอน |
| 16 | Search — log each query (`tb_history_key` INSERT) | logged to NEW `tb_search_history` (0102); legacy admin report reads tb_history_key | 🟡 | n/a | ภูม |
| 17 | Map (`map.php` Google Maps sample) | `/map` verbatim iframe | ✅ | ✅ | ปอน |
| 18 | `apiCalPrice.php` — forwarder tiered freight price engine | `actions/forwarder*.ts` calc-price (separate lane `import`) | ✅ | ✅ | ภูม |
| 19 | `check-juristic-person` — CUSTOMER tax-invoice autofill (DBD by tax ID) | `parse-juristic` + actions/admin/customers.ts = **admin-only**; customer cart-tax-doc-pref types manually | ❌ | n/a | เดฟ |
| 20 | `getLineOA.php` — write tb_users.userLineIDOA (LINE OA link) | (LINE OA linking — separate lane; not found in this lane's surfaces) | 🟡 | n/a | ก๊อต |
| 21 | `convert-img-to-webp` — GD image→webp resize on upload | client/Supabase image handling (separate upload lane) | 🟡 | n/a | ภูม |
| 22 | Rebuilt `addresses` table + `actions/addresses.ts` + manager | DEAD — imported by nothing reachable; writes empty `addresses` table | 💀 (cleanup) | n/a | เดฟ |

Legend: ✅ faithful + correct · 🟡 partial / divergent / deferred · ❌ missing · 💀 dead-write/dead-code.

---

## Death-flows (P0 / P1 detailed)

### P1 — Customer cannot EDIT / DELETE / SET-MAIN their own delivery address  (rows 3-5)
**Legacy:** `/addresses` row buttons fired jQuery AJAX → `editAddress.php` (UPDATE tb_address),
`deleteAddress.php` (soft-delete `addressStatus='0'`, with a guard that refuses to delete the row that
is currently the main address — it `echo '1'`), `setMainAddress.php` (UPDATE tb_address_main.addressID).
A customer manages their whole address book self-serve.

**Pacred:** `app/[locale]/(protected)/addresses/page.tsx` L296-345 renders all three buttons 1:1 but the
`onclick` handlers are **intentionally not wired** — they carry only a `data-legacy-onclick` string
(documented in the page header). There is **no customer-facing server action** for edit/delete/set-main.
`actions/addresses.ts` has `updateAddress`/`softDeleteAddress`/`setDefaultAddress` but they target the
**dead rebuilt `addresses` table** and are imported by nothing reachable. Admin CAN edit a customer's
address (`actions/admin/customer-profile.ts` L418-520, correctly writing `tb_address`/`tb_address_main`) —
so the data path + table are proven; only the customer-facing trigger is missing.

**Why P1 (not P0):** a customer can still ADD a new address (the common case) and place orders; they just
can't fix a typo or change which address is default without admin help. Real friction, not a revenue stop.

**Fix:** add `actions/addresses-tb.ts` (customer-scoped, member_code-joined) with `editAddress` /
`deleteAddress` (soft-delete + main-guard, echoing the legacy refuse-if-main rule) / `setMainAddress`,
each routing through the admin client to the `tb_address`/`tb_address_main` rows (RLS-locked). Wire the
three row buttons + the edit modal (`editAddress.php` markup already known). Owner: **เดฟ**.

### P1 — Reverse-image ("ค้นหาสินค้าที่คล้ายกัน") + camera search dead on the customer search surface  (rows 13-14)
**Legacy:** every search result rendered a "ค้นหาสินค้าที่คล้ายกัน" link → `/search?img=<picUrl>` →
`searchIMG.php`/`searchIMG2.php` → `laonet.online item_search_img`. The global bar's camera input
(`top-menu.php` `imagesSearch`) submitted an uploaded image to `/search` for the same reverse lookup.
This is a heavily-used discovery path for cargo customers who shop by photo.

**Pacred:** the `/search` `SearchParams` type (page.tsx L88-93) has **no `img` field** — a `?img=` URL
falls through to keyword MODE B and searches the image URL as text (garbage). `components/legacy/pcs-top-menu.tsx`
L282-294 renders the camera `<input name="imagesSearch">` posting to `/search`, but `/search` ignores it.
The backend EXISTS and is good: `app/api/china-search/image/route.ts` + `lib/china-search/laonet.ts` —
but no customer UI surface calls it. `link-paste-search.tsx` explicitly defers image-upload UI ("Out of scope for V1").

**Why P1:** a real legacy discovery flow is silently dead — the camera icon + every find-similar link do
nothing useful. Not a revenue stop (customers can paste links / type keywords), but a visible broken promise.

**Fix:** add `?img=` handling to `/search` (call the existing `api/china-search/image` backend, render the
result grid) AND wire the pcs-top-menu camera input to it. Owner: **เดฟ** (customer-backend + the existing lib).

### P1 — Customer tax-invoice juristic-autofill is admin-only  (row 19)
**Legacy:** `member/api/check-juristic-person/index.php` hit the DBD/MOC OpenAPI by 13-digit juristic ID and
returned company name (TH/EN), type, register date, and a fully-formatted Thai + EN address — **customer-facing**,
so a juristic customer requesting a tax invoice / registering got their company details auto-filled (no manual typing).

**Pacred:** the DBD lookup exists only as an **admin** tool — `lib/dbd/parse-juristic.ts` + `actions/admin/customers.ts`
(L113 "DBD juristic-person lookup + compare", from `admin/juristic-check` + admin customer-convert). The CUSTOMER
side does NOT autofill: `app/[locale]/(protected)/cart/cart-tax-doc-pref.tsx` exposes a plain `companyName`
input the customer types by hand, and `actions/auth.ts` juristic-register has no DBD call. So a faithful piece
of customer UX (type tax ID → company + address appear) is missing.

**Why P1:** affects only juristic customers at tax-invoice time; they can still type it manually. The lib is
already written — it just needs a customer-scoped action wrapper + a wire into the tax-doc pref + register flows.

**Fix:** expose a customer-scoped `lookupJuristic(taxId)` action (reuse `parse-juristic`), wire an autofill
button into `cart-tax-doc-pref.tsx` + the juristic-register step. Owner: **เดฟ** (cross-cutting customer-backend).

---

## Flow-order divergences

### FO-1 — Search → add-to-cart is split across two screens  (row 12)
**Legacy ORDER:** type/paste on `/search` → see the parsed product card (MODE A) or grid (MODE B) →
click **"หยิบใส่รถเข็น"** (`btnCart`) **on that same card** → product goes to cart. One continuous flow,
the iconic PCS loop: *search where you are, add from where you are.*

**Pacred ORDER:** `/search` renders the card with `btnCart` but `action=""` — the button does **nothing**.
To actually buy, the customer must navigate to `/service-order/add` and **re-paste the same link** into
`link-paste-search.tsx`, which then fetches the product *again* and offers add-to-cart. So the flow is
search → (dead end) → go elsewhere → re-paste → add. The pieces all exist but the legacy single-surface
order is broken into two, with a re-paste in between.

**Faithfulness call:** this is a real flow-order gap under the owner's "100% sameness" rule. The minimum
faithful fix is to make `/search`'s `btnCart` add to cart in place (it can call the same `addCartItem` +
`searchProductByUrl` the add page uses). Owner: **เดฟ**.

### FO-2 — Search-log lands in a different table than the legacy admin report reads  (row 16)
**Legacy ORDER:** `search.php` L370-372 INSERTed every query into `tb_history_key`; `pcs-admin/report-search.php`
aggregates **`tb_history_key`** for the admin "popular searches" report.

**Pacred ORDER:** customer searches log to the NEW `tb_search_history` (migration 0102, via
`SearchHistoryLogger` → `actions/search.ts`). No admin surface consumes it, and the eventual port of
`report-search.php` would read the (empty) `tb_history_key`. Not a customer-visible death, but a
silent table-divergence that will surface as "the admin search report is empty" when that admin page ports.
Owner: **ภูม** (admin-backend — reconcile the report to `tb_search_history`, or dual-write).

---

## Modals / AJAX / cron / print inventory

**Modals (legacy):**
- `#add-address` modal (address.php) — ported 1:1, opens via `?page=1` searchParam. ✅
- `#edit-Address2` modal (`editAddress.php`) — markup known; **NOT ported** (no edit action). ❌
- Add-address SweetAlert success/error popups — not reproduced (jQuery plugin). 🟡 cosmetic

**AJAX endpoints (legacy `include/pages/`):**
- `address/editAddress.php` — UPDATE tb_address → **no Pacred customer action**. ❌
- `address/deleteAddress.php` — soft-delete addressStatus='0' (+refuse-if-main) → **no Pacred customer action**. ❌
- `address/setMainAddress.php` — UPDATE tb_address_main → **no Pacred customer action**. ❌
- `search/searchURL.php` — product-detail parse → Pacred `convertProductUrlDetail` (server-side, not AJAX). ✅
- `search/dataAPI.php` (48 KB proxy) — fills MODE-A card → replaced by server-side TAMIT fetch. ✅ (functionally)
- `search/searchKey.php` / `search.php` (keyword) → AkuCargo. ✅
- `search/searchIMG.php` / `searchIMG2.php` / `searchIMGUpload.php` (reverse image) → `api/china-search/image` route EXISTS but **unwired to UI**. ❌
- `search/search1/2/3.php` — home recommendation carousels (owl-carousel) — not in this lane's Pacred surfaces. 🟡

**APIs (legacy `member/api/`):**
- `apiCalPrice.php` — freight tiered rate engine → ported in the `import`/forwarder lane (`calc-price`). ✅ (other lane)
- `apiCalPricePCS.php` — flat ฿120/CBM, min ฿50 → check it survived the forwarder port. 🟡 (other lane)
- `check-juristic-person/` (DBD autofill) — **admin-only** in Pacred; customer-facing autofill missing. ❌
- `convert-img-to-webp/` — GD image→webp → Supabase/client image handling (other lane). 🟡
- `getLineOA.php` — write userLineIDOA → LINE-OA-link lane (not found here). 🟡

**Cron:** none in this lane (address/search/map have no scheduled jobs).

**Print/PDF:** none in this lane.

---

## Recommended fixes (ranked, with owner)

1. **(P1, เดฟ) Customer address edit / delete / set-main** — add `actions/addresses-tb.ts` (3 actions on
   `tb_address`/`tb_address_main`, member_code-scoped, honour legacy refuse-if-main on delete) + wire the
   three row buttons + edit modal on `/addresses`. Highest churn relief — every customer has an address book.
2. **(P1/FO-1, เดฟ) Make `/search` `btnCart` add to cart in place** — reuse `addCartItem` + `searchProductByUrl`
   so the legacy single-surface search→cart order is restored; removes the re-paste detour.
3. **(P1, เดฟ) Wire reverse-image / camera search** — add `?img=` handling on `/search` + wire the pcs-top-menu
   camera input, calling the already-built `api/china-search/image` route. Backend done; just needs the UI wire.
4. **(P1, เดฟ) Customer juristic tax-invoice autofill** — expose a customer-scoped `lookupJuristic(taxId)` action
   (reuse `lib/dbd/parse-juristic`) + autofill button in `cart-tax-doc-pref.tsx` + juristic-register step.
5. **(P2, ภูม) Reconcile search-log table** — point the (future) admin search report at `tb_search_history`,
   or dual-write `tb_history_key`, so FO-2 doesn't surface as an empty admin report.
6. **(P2, ปอน) China-warehouse address content** — `/china-address` is faithfully empty, but customers need the
   actual China warehouse addresses somewhere (legacy had them on the WP page). Decide a Pacred home for them.
7. **(P2, ปอน) Address autocomplete + map pin-drop** — re-enable jQuery.Thailand subdistrict→zipcode autofill +
   the Google-Maps pin (lat/long) on the add-address modal; today both are inert (lat/long always 0).
8. **(P3 cleanup, เดฟ) Delete dead rebuilt address stack** — remove `actions/addresses.ts` +
   `addresses-manager.tsx` (write the empty rebuilt `addresses` table; imported by nothing). Removes a
   live silent-dead-write trap that looks like the address backend but isn't.
