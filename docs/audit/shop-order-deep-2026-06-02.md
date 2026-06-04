# Shop-Order (บริการฝากสั่ง) DEEP Fidelity Audit — 2026-06-02

**Auditor:** Task #228 carry-over audit (read-only deep-audit)
**Trigger:** ภูม carry-over from the 5-system fidelity audit
([`docs/audit/master-fidelity-2026-05-30-evening.md`](master-fidelity-2026-05-30-evening.md)
— service-orders flagged ~15-25% complete · grand total 13 ❌ + 17 🔧).
**Method:** AGENTS.md §0b deep-audit-from-source — re-verify against the legacy
PHP files on disk, then diff against the CURRENT Pacred TypeScript at branch
`Poom-pacred` HEAD `096c0f12`. **Critical context** — this is the THIRD shop-order
audit in 4 days; the 2026-05-30 audits were partially superseded by ภูม +
ปอน sittings (2026-05-30 ค่ำ + 2026-05-31). This audit re-baselines what's
CLOSED vs OPEN at HEAD.
**Prior art (read first):**
- [`docs/audit/shop-order-gap-2026-05-30.md`](shop-order-gap-2026-05-30.md)
  (Agent G2 customer-side · 7 P0 / 15 P1 / 13 P2)
- [`docs/audit/service-orders-fidelity-2026-05-30-evening.md`](service-orders-fidelity-2026-05-30-evening.md)
  (admin-side · 13 P0 / 17 P1 / 11 P2)

**Legacy SOT:** `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\` (verified
accessible) + `member\include\pages\{cart,shops,search}\` (customer AJAX endpoints).
**Pacred under audit:** branch `Poom-pacred` HEAD `096c0f12` (= worktree HEAD,
0/0 in sync).

---

## 0. Headline — what changed since the 2026-05-30 audits

The 2026-05-30 audits painted a grim picture (~25-35% admin-side complete · 35-45%
customer-side · 21,950 migrated orders effectively READ-ONLY). **Between then and
HEAD, two BIG shipping batches landed** that closed most of the P0s:

**ภูม Wave 31 batch (2026-05-31 · `e337fe85`, `a303f375`, `cbc58ca4`):**
- ✅ **P0-13 + P1-10 (Tier D D1 + D3): 5-tab shop UPDATE workflow + tb_promotion carry**
  → `actions/admin/service-orders-shop-workflow.ts` (1,079 LOC): `adminQuoteShopOrder`
  (1→2) + `adminMarkShopOrderOrdered` (3→4) + `adminSpawnForwarderFromShopOrder`
  (4→5 with promo carry) — all 3 state-transitions write to `tb_header_order`
  with 4-channel notify (in-app + LINE OA + email + SMS for quote)
- ✅ **P0-16 (Tier D D2): per-item refund** → `actions/admin/service-orders-refund.ts`
  (346 LOC): `adminRefundShopOrderItem` — partial-qty split + `tb_wallet_hs type='5'`
  + `tb_wallet` balance bump + `tb_header_order.htotalpriceuser` recompute,
  rollback-safe (DELETE wallet_hs on failure mid-step)
- ✅ **P0-15: admin shop-order print route** → `app/[locale]/(admin)/admin/service-orders/print/page.tsx`
  — receipt + invoice modes, no userID pin (admin can print any of 21,950 orders),
  faithful to `printShop.php` markup
- ✅ **§0d UX mount: 4 sitting-F handlers mounted on legacy-view** (`81bb3c8d`)
  — Quote form + Mark-Ordered form + Spawn-to-completed button + Extra-edits panel
  (address/transport/note) — all the workflow forms NOW REACHABLE from the
  `/admin/service-orders/[hNo]` page via legacy-view fallback

**ภูม + เดฟ 2026-05-30 evening + 31 patches (`bd84929a`, `72faa24c`):**
- ✅ **Tier A2: customer-side cart unification** (`72faa24c` "unify cart to /cart")
  — `/service-order/cart` now reads `listCart()` → `tb_cart` (NOT `cart_items`).
  Single source of cart truth.
- ✅ **Customer-side cancel pivot** (in `actions/service-order.ts L754-817`)
  `cancelServiceOrder` now writes `tb_header_order.hstatus='6'` (NOT `service_orders`).
- ✅ **Customer-side wallet-pay pivot** (`payServiceOrderFromWallet` L906+)
  — writes `tb_wallet_hs type='2'` + `tb_wallet -=` + `tb_header_order.hstatus='3'`
  with idempotency + partial-failure rollback.
- ✅ **Admin notes page repoint to tb_header_order** (`72faa24c`).
- ✅ **`adminMarkServiceOrderPaidTb`** in `actions/admin/service-orders-tb.ts` (412 LOC)
  — Tier A2 revenue-leak closer · debits `tb_wallet` + INSERTs `tb_wallet_hs` +
  flips `tb_header_order.hstatus='3'` (the legacy `pay-users.php L48-83` port).
- ✅ **`adminSetOrderBillToOverride` tombstoned pending migration** (`bd84929a`)
  — still writes `service_orders.bill_to_name_override`; flagged for pivot to
  `tb_header_order.hbilltoname` once column lands.

**Effective completeness today: ~75-85% of the legacy admin + customer ฝากสั่ง
surface area is faithful and reachable.** The remaining gaps are the LONG TAIL
of inline edits, the heartbeat lock, the multi-axis admin search, and the
shopping-return list page. The single most-visible REMAINING gap is the customer
URL-paste from `/search` (the page still has `<form action="" name="addCartURL">`
with no handler — gap G2#2 NOT yet closed).

**Recommended next session: 6-10 hours of cleanup work + Phase-2 polish.** The
biggest revenue blockers are CLOSED. What's left is reachability of less-common
admin paths + 1 customer surface gap.

---

## 1. Legacy inventory (re-confirmed at HEAD)

### 1a. `pcs-admin/shops.php` (1,942 LOC) — 4 dispatch modes via `?page=`

| Mode | LOC range | Purpose |
|---|---|---|
| `?page=add` (default) | L4-555 | List + addOrder POST (cart → tb_header_order) |
| `?page=detail&id=<hno>` | L711-815 + `detail.php` | Read-only detail + 2 inline POSTs (saveNote, update_cTracking) + AJAX `cancelOrder()` |
| `?page=update&id=<hno>` | L890-1850 + `update.php` framework | The 5-tab workflow + 14 inline header-edit POSTs |
| (no `?page`) | = `add` | Same as default |

### 1b. The 14+ inline POST handlers in `?page=update` mode

| # | POST name | Lines | Purpose | Pacred state |
|---|---|---|---|---|
| 1 | `update2` | 916-1070 | Quote step (1→2): per-line cPrice/cAmount/cShippingCHN, hCostAll/hRateCost, hStatus=2 + hDatePayment+5d + 4-CH notify | ✅ `adminQuoteShopOrder` (shop-workflow.ts L203) |
| 2 | `update3` | 1102-1180 | Ordered step (3→4): per-line cPriceUpdate + per-shop cShippingNumber, hStatus=4 + 3-CH notify | ✅ `adminMarkShopOrderOrdered` (shop-workflow.ts L310) |
| 3 | `saveTarcking` | 1363-1582 | Single tracking step + tb_forwarder + tb_promotion + 4→5 flip | ✅ `spawnForwardersFromShopOrder` (spawn.ts) + `adminSpawnForwarderFromShopOrder` (shop-workflow.ts L460 — adds 4→5 flip + tb_promotion carry) |
| 4 | `arrSaveTarcking` | 1584-1791 | Multi-parcel split | ✅ `buildSpawnRows` in spawn-utils.ts |
| 5 | `updateShippingNumber` | 1793-1805 | Fix typoed cShippingNumber | ❌ MISSING |
| 6 | `update_hStatus` | 1846+ | Direct status flip | ✅ `adminUpdateServiceOrder` (service-orders.ts L47 — writes tb_header_order via REBUILT_TO_LEGACY_HSTATUS map) |
| 7 | `update_hAddress` | 1225-1241 | Change ship-to address | ✅ `adminUpdateOrderAddress` (shop-workflow.ts L863) |
| 8 | `update_hShipBy` | 1242-1261 | Change carrier | ❌ MISSING |
| 9 | `update_hTransportType` | 1262-1281 | Swap car/sea/air | ✅ `adminSwitchOrderTransport` (shop-workflow.ts L938) |
| 10 | `update_hRate` | 1282-1301 | Override yuan rate | ❌ MISSING |
| 11 | `update_payMethod` | 1302-1320 | Origin/destination | ❌ MISSING |
| 12 | `update_crate` | 1321-1340 | Toggle ตีลังไม้ | ❌ MISSING |
| 13 | `update_cost` | 1341-1362 | Update hRateCost/hCostAll standalone | ❌ MISSING (rolled INTO `adminQuoteShopOrder` for status=1) |
| 14 | `update_cPriceUpdate` | 1806-1846 | Per-line ¥ adjust | ❌ MISSING |
| 15 | `upAdminIDIP` | 1847+ | Reassign IP-operator | ❌ MISSING |
| 16 | `saveNote` (`?page=detail`) | 711-758 | Customer-visible note + admin note + 3-CH notify | ✅ `adminAddOrderNote` (shop-workflow.ts L1014) |
| 17 | `update_cTracking` (`?page=detail`) | 776-815 | Fix typoed tracking | ❌ MISSING |

### 1c. AJAX endpoints (`include/pages/shops/`)

| File | LOC | Purpose | Pacred state |
|---|---|---|---|
| `detail.php` | 569 | Full read-only detail render | ✅ `legacy-view.tsx` (389 LOC) |
| `cancelOrder.php` | 23 | Customer cancel | ✅ `cancelServiceOrder` (service-order.ts L754) |
| `deleteItem.php` | 41 | Admin remove tb_order row | ❌ MISSING |
| `deleteOrder.php` | 35 | Super-admin hard-delete | ❌ MISSING |
| `editIPC.php` | 74 | IP-operator reassign modal | ❌ MISSING |
| `loadForm.php` | 22 | Pre-spawn "ตรวจสอบรายการนำเข้า" | 🟡 PARTIAL — `spawnForwardersFromShopOrder` idempotent so re-submit returns existing fNo, but UI doesn't pre-show the dupe |
| `repayItem.php` | 153 | Per-item refund | ✅ `adminRefundShopOrderItem` (service-orders-refund.ts) |
| `updateLock.php` | 6 | 60-sec heartbeat | ❌ MISSING |

### 1d. `pcs-admin/cart.php` (870 LOC) — 3 POST + 3 AJAX

| Mode | Lines | Purpose | Pacred state |
|---|---|---|---|
| POST `addCart` (multi-row w/ images) | 3-62 | Multi-row cart-add with `$_FILES['cImages']` | 🟡 PARTIAL — `adminAddItemToCart` accepts cimages URL string, no file upload |
| POST `addCartURL` (TAMIT product) | 63-111 | URL-paste add | ✅ via `/service-order/add/link-paste-search.tsx` + customer-side `addCartItem`; ❌ `/search` MODE A button STILL BROKEN (action="" no handler) |
| POST `addCartUser` (admin-on-behalf) | 112-138 | Admin shops on behalf of customer | ✅ `adminAddCartUser` + `?userID=<PR>` UI |
| AJAX `listCart.php` | 73 | Admin views customer cart | ✅ `/admin/service-orders/cart?userID=<PR>` |
| AJAX `deleteItem.php` | 24 | Remove cart row | ✅ `adminRemoveCartItem` |
| AJAX `getUserID.php` | 25 | userIDs in ประเภทสมาชิก group | ❌ MISSING |

### 1e. Customer-side AJAX (`member/include/pages/{cart,shops,search}/`)

| File | LOC | Purpose | Pacred state |
|---|---|---|---|
| `cart/calculateCart.php` | — | Cart recalc on row-toggle | ✅ `calculateCartTotal` |
| `cart/updateQuantity.php` | — | Inline qty edit | ✅ `updateCartItemQuantity` + `updateCartItem` |
| `cart/deleteItem.php` | — | Inline row delete | ✅ `deleteCartItem` |
| `cart/api-shipBy.php` | — | Forwarder picker | ✅ (cart-address-shipby.tsx SSR-precomputed) |
| `cart/option-address-thai.php` | — | Address modal | 🟡 PARTIAL — form fields direct entry, no select-from-tb_address modal |
| `cart/add-address-form.php` | — | Add new address modal | ✅ (handled via `/addresses` page in customer portal) |
| `cart/update-address-form.php` | — | Edit address modal | ✅ (same) |
| `cart/api-delect-address.php` | — | Delete address AJAX | ✅ (in `/addresses`) |
| `cart/check-proV.php` + `saveproV.php` + `survey.php` | — | tb_pro_valentine overlay | 🟢 DEFER (Phase C — time-bounded 2023 promo) |
| `cart/checkPCSMaoMao.php` | — | PCS Mao Mao check | 🟡 UNVERIFIED |
| `shops/cancelOrder.php` | — | Customer self-cancel | ✅ `cancelServiceOrder` |
| `shops/calPrice.php` | — | Per-order price recalc | 🟡 UNVERIFIED — likely covered by getServiceOrder reads |
| `shops/getList.php` | 105 | Bulk-cancel + bulk-pay modal | ❌ MISSING (no bulk-actions in customer list) |
| `search/dataAPI.php` (TAMIT) | — | URL → SKU grid | ✅ `convertProductUrlDetail` (Wave 28) |

### 1f. `pcs-admin/shopping-return.php` (38 LOC dispatcher) + 3 sub-handlers

| Mode | Sub-handler | Pacred state |
|---|---|---|
| `?page=add&hNo=<hno>` | `include/pages/shopping-return/add.php` (the form) | 🟡 PARTIAL — server-side closed (`adminRefundShopOrderItem`); UI mount = `refund-item-form.tsx` per-item button on `legacy-view.tsx`; no dedicated `/admin/service-orders/[hNo]/refund` route |
| `?page=detail` | `shopping-return/detail.php` | ❌ MISSING |
| default | `shopping-return/home.php` (refund history list) | ❌ MISSING — `/admin/refunds` is generic Pacred refunds, not shop-line-item refund history |

### 1g. `pcs-admin/printShop.php` (381 LOC) — mPDF invoice + receipt

| URL | Purpose | Pacred state |
|---|---|---|
| `?print=1&id[]=<hno>` | Receipt (hStatus=5) | ✅ `/admin/service-orders/print?print=1&id=<hno>` |
| `?print=2&id[]=<hno>` | Invoice (hStatus 2-5) | ✅ same route with `?print=2` |
| Stamps hPrintBill / hPrintBill2 on render | | 🟡 NOT STAMPED — server is pure read; legacy stamps are FLAGGED for a deferred Server Action |
| Juristic tb_corporate lookup | | ✅ via `tb_corporate.corporatename` (P0-21 / ADR-0021 corporate-SOT) |
| 2 hardcoded customer overrides (PCS8765, PCS8304) | | 🟡 NOT MIGRATED — handle via `bill_to_name_override` (still on `service_orders`, also flagged for tb_header_order pivot per `bd84929a` tombstone) |

### 1h. `pcs-admin/shop-search.php` (250 LOC) — multi-axis admin search

| `?keyType=` | Search axis | Pacred state |
|---|---|---|
| `1` | hNo | ✅ via `/admin/service-orders?search=<hno>` |
| `2` | cTrackingNumber | ❌ MISSING |
| `3` | cShippingNumber | ❌ MISSING |
| `4` | userID | ✅ via list page search |
| `all` | OR of all 4 | ❌ MISSING |

---

## 2. Pacred inventory (HEAD `096c0f12` · 2026-06-02)

### 2a. Admin routes — `app/[locale]/(admin)/admin/service-orders/`

```
service-orders/
├─ page.tsx                       (629 LOC — list, Wave 26.2)
├─ service-orders-table.tsx       (600 LOC — sortable table, sticky actions, bulk-print)
├─ notes/page.tsx                 (210 LOC — notes list, repointed to tb_header_order ✅ 72faa24c)
├─ cart/
│  ├─ page.tsx                    (547 LOC — admin cart, tb_cart)
│  ├─ cart-submit-button.tsx
│  ├─ cart-row-actions.tsx
│  └─ add/{page.tsx, add-form.tsx, link-paste-search.tsx}
├─ [hNo]/
│  ├─ page.tsx                    (246 LOC — rebuilt+legacy dispatcher)
│  ├─ legacy-view.tsx             (389 LOC — full faithful render with workflow forms mounted)
│  ├─ update-form.tsx             (206 LOC — status flip + note · maps legacy char → rebuilt key)
│  ├─ quote-form.tsx              (177 LOC — Phase 1 #1 hstatus 1→2)
│  ├─ mark-paid-tb-form.tsx       (116 LOC — Tier A2 mark-paid → tb_*)
│  ├─ mark-ordered-form.tsx       (212 LOC — Phase 1 #2 hstatus 3→4 + Phase 1 #3 spawn-to-completed)
│  ├─ extra-edits-form.tsx        (230 LOC — 3 header edits: address + transport + note)
│  ├─ refund-item-form.tsx        (192 LOC — per-item refund UI · sitting-G)
│  ├─ spawn-form.tsx              (294 LOC — Wave 21 spawn)
│  └─ spawn-utils.ts              (56 LOC — buildSpawnRows)
└─ print/page.tsx                 (admin shop-order print · P0-15 cbc58ca4)
```

### 2b. Server Actions

| File | LOC | Key actions |
|---|---|---|
| `actions/admin/service-orders.ts` | 556 | `adminUpdateServiceOrder` ✅ writes tb_header_order via map · `adminMarkServiceOrderPaid` ⚠️ still writes service_orders (use `-tb.ts` instead) · `adminSetOrderBillToOverride` ⚠️ tombstoned pending tb_header_order.hbilltoname column |
| `actions/admin/service-orders-tb.ts` | 412 | `adminMarkServiceOrderPaidTb` ✅ Tier A2 → tb_wallet_hs + tb_wallet + tb_header_order |
| `actions/admin/service-orders-shop-workflow.ts` | 1079 | `adminQuoteShopOrder` (1→2) · `adminMarkShopOrderOrdered` (3→4) · `adminSpawnForwarderFromShopOrder` (4→5+promo) · `adminUpdateOrderAddress` · `adminSwitchOrderTransport` · `adminAddOrderNote` ✅ all tb_* |
| `actions/admin/service-orders-spawn.ts` | 373 | `spawnForwardersFromShopOrder` ✅ Wave 21 — INSERT tb_forwarder |
| `actions/admin/service-orders-refund.ts` | 346 | `adminRefundShopOrderItem` ✅ per-item refund tb_wallet_hs type='5' |
| `actions/admin/cart.ts` | 588 | Admin cart CRUD ✅ all tb_cart |
| `actions/service-order.ts` | 1156 | Customer-side · `listServiceOrders` `getServiceOrder` `cancelServiceOrder` `payServiceOrderFromWallet` `getServiceOrderForReceipt` ✅ all tb_* |
| `actions/cart.ts` | 1349 | Customer cart · `listCart` `addCartItem` `updateCartItem` `submitCartOrder` ✅ all tb_cart |

### 2c. Customer routes — `app/[locale]/(protected)/`

```
cart/
├─ page.tsx                       (769 LOC — reads tb_cart)
├─ cart-interactivity.tsx
├─ cart-address-shipby.tsx        (SSR-precomputed)
├─ cart-tax-doc-pref.tsx
└─ add/{page.tsx, cart-add-focus-effect.tsx}

service-order/
├─ page.tsx                       (list — tb_header_order)
├─ service-order-list.tsx
├─ add/{page.tsx, link-paste-search.tsx, service-order-bulk-actions.tsx}
├─ cart/{page.tsx, cart-manager.tsx}   ← UNIFIED to listCart() → tb_cart (P0-3/4/5)
├─ pending/page.tsx
├─ print/page.tsx                 (customer print · 1:1 from member/printShop.php)
└─ [hNo]/
   ├─ page.tsx                    (getServiceOrder → tb_header_order)
   ├─ cancel-button.tsx           (cancelServiceOrder → tb_header_order ✅)
   ├─ pay-from-wallet-button.tsx  (payServiceOrderFromWallet → tb_wallet_hs ✅)
   └─ receipt/page.tsx            (getServiceOrderForReceipt)

search/
├─ page.tsx                       (870 LOC — MODE A SKU grid ⚠️ action="" still broken)
├─ search-history-logger.tsx
├─ search-image-panel.tsx
└─ search-recents.tsx
```

---

## 3. Gap matrix — what's REMAINING at HEAD (prioritized)

### 🔴 P0 — Reachable revenue blocker / silently broken customer surface

| # | Legacy mode | Legacy file:line | Pacred state | Notes |
|---|---|---|---|---|
| **E1** | **Customer URL-paste from `/search` MODE A** — paste 1688/Taobao/Tmall URL → see SKU grid → press "หยิบใส่รถเข็น" → expects INSERT tb_cart | `cart.php` L63-111 `addCartURL` handler + `search.php` MODE A render | `app/[locale]/(protected)/search/page.tsx` L623-858 — `<form action="" method="POST" name="addCartURL">` with NO handler. Customer clicks → form submits to current URL → page re-renders w/ no add | 🔴 **SILENTLY BROKEN** | The customer SEES the SKU grid (Wave 28 `convertProductUrlDetail` works); the **only path to write the result into tb_cart** is via `/service-order/add` (different page, different UX). This is the most visible customer surface that's silently broken. **30-min fix**: wire button to `addCartItem({ url, title, image_path, price_cny, shop_name, provider, amount })` via `onClick` (no FormData). Detail: client component + dispatch + router.refresh + sweetalert. |
| **E2** | **`adminMarkServiceOrderPaid` still writes service_orders** | `actions/admin/service-orders.ts` L152-317 | `actions/admin/service-orders-tb.ts` `adminMarkServiceOrderPaidTb` already exists ✅ but the original wrong-table function STILL EXISTS — risk: a future call-site picks the wrong one | 🔴 **DUAL-WRITE TRAP** | Tombstone or redirect `adminMarkServiceOrderPaid` to delegate to the `-tb.ts` version. Verify NO existing UI mount calls the wrong one. Per AGENTS.md §0e Potemkin sweep. **15-min fix**: re-route + delete OR add explicit "use service-orders-tb.ts instead" banner. |

### 🟠 P1 — Reachable but inline edit / search axis / heartbeat missing

| # | Legacy mode | Legacy file:line | Pacred state | Notes |
|---|---|---|---|---|
| **E3** | **10 of 15 inline header-edit POSTs missing** — `update_hShipBy`, `update_hRate`, `update_payMethod`, `update_crate`, `update_cPriceUpdate`, `updateShippingNumber`, `update_cTracking`, `upAdminIDIP`, `deleteItem` (admin remove tb_order row), `deleteOrder` (super-admin hard delete) | `shops.php` L1225-1850 + AJAX files | None | 🟠 **MISSING** | Common in: customer rings "เปลี่ยนเป็นเรือแทนรถ" / "ขอจ่ายปลายทาง" / "ขอตีลังไม้" / "ขอแก้เรท" / "ขอแก้เลข tracking" / "ขอลบรายการ" / "ขอย้าย IP". Staff must SQL today. **6-8h port** = single sitting can ship all 10 as a "Phase-2 inline-edit batch" extending `extra-edits-form.tsx`. The 3 already-shipped (address/transport/note) are the pattern. |
| **E4** | **60-second `updateLock.php` heartbeat** | `updateLock.php` (6 LOC) + `update.php` L499-511 jQuery setInterval | None | 🟠 **MISSING** | Two admins editing the same order simultaneously silently clobber each other. Not yet hit because the 5-tab workflow only just shipped; will become felt as ops adopts. **1.5h port** = Server Action `lockServiceOrder({hNo})` UPDATEs `tb_header_order.session, hlockdate` + a 60s setInterval client island. |
| **E5** | **`shop-search.php` multi-axis search** (cTrackingNumber + cShippingNumber + `?keyType=all`) | `shop-search.php` (250 LOC) | `/admin/service-orders?search=` only matches hno/htitle/userid (page.tsx L99) | 🟠 **MISSING (2 axes)** | Staff trace "ของอยู่ไหน" via tracking number daily. **1-1.5h port** = JOIN `tb_order` on `(ctrackingnumber, cshippingnumber)` from list query when search term looks like a tracking. |
| **E6** | **`shopping-return.php` refund history list** | `shopping-return.php` default = `home.php` (3-tab list of past refunds) | `adminRefundShopOrderItem` ships ✅ + UI button ships ✅, but no list page of past refunds (ops can't review "ขอดูประวัติคืนเงิน") | 🟠 **MISSING** | **1-1.5h port** = new `/admin/service-orders/refunds/page.tsx` listing `tb_wallet_hs WHERE type='5' AND typeservice='1'` JOIN `tb_users` + `tb_header_order` by reforder. |
| **E7** | **Admin `adminSetOrderBillToOverride` still writes service_orders.bill_to_name_override** (tombstoned per `bd84929a` pending migration) | `actions/admin/service-orders.ts` L330+ | Action body present, write target = rebuilt empty `service_orders` — admin clicks "บันทึก" → green toast → no effect on real tb_header_order data (§0e dead-write trap) | 🟠 **REACHABLE DEAD-WRITE** | Per `bd84929a`, this is FLAGGED but a real-data block: any prod `?bill_to_name_override` admin override does NOT show on receipts / invoices today. **2h fix** = migration to add `tb_header_order.hbilltoname` + pivot action. Or **tombstone the UI button** in `bill-to-override-panel.tsx` until migration lands (10 min). |
| **E8** | **`hPrintBill` / `hPrintBill2` stamp on print render** | `printShop.php` L83-91 | Print route is pure read; stamps not written | 🟠 **MISSING** | `service-orders-table.tsx` L317-326 already renders "พิมพ์ใบเสร็จแล้ว" pill from these columns — but the columns never get stamped after Pacred's print, so the pill is always cold for new prints. **45-min fix** = Server Action invoked from a print-button confirmation popup that stamps after PDF dispatch. |
| **E9** | **IP-operator reassign modal (`upAdminIDIP` + `editIPC.php`)** | `editIPC.php` (74 LOC) + `shops.php` `upAdminIDIP` | None | 🟠 **MISSING** | When IP-operator leaves/takes leave, orders need reassign to new IP. Daily during staff turnover. **1-1.5h port** = Server Action `adminReassignOrderIp` + modal listing section=3/4 admins from `admins` (post Wave 22 tb_admin → admins merge). |
| **E10** | **Customer bulk-cancel + bulk-pay from list** (`getList.php` modal) | `include/pages/shops/getList.php` (105 LOC) | No bulk-actions on `/service-order/page.tsx` | 🟠 **MISSING (UX regression)** | Power users with 5+ pending orders need to multi-select. **1-1.5h port** = client-side multi-select + bulk-cancel via existing `cancelServiceOrder` per-order + bulk-pay via `payServiceOrderFromWallet` per-order loop. |
| **E11** | **Overdue payment auto-cancel cron** | `shops.php` L72-78 (read-time write — legacy anti-pattern) | None | 🟠 **MISSING** | Orders sit in `hstatus='2'` forever past `hdatepayment`. Legacy ran the check on every admin page-load (anti-pattern); Pacred should run as cron. **1h fix** = `app/api/cron/auto-cancel-overdue-shop-orders/route.ts` flips `tb_header_order.hstatus='6'` where `hdatepayment < NOW` AND `hstatus='2'`. |

### 🟡 P2 — Polish / edge cases

| # | Legacy mode | Legacy file:line | Pacred state | Notes |
|---|---|---|---|---|
| **E12** | **Image upload (`addCart` with `$_FILES['cImages']`)** | `cart.php` L26-51 | `adminAddItemToCart` + `addCartItem` accept image URL string only | 🟡 **MISSING** | Custom-ask orders ("ขอสั่งของจากร้าน X ที่ไม่มีลิงก์") lose the file-upload path. Pacred S3 prod ready (Wave 24 image backfill) → **2h port** = FormData multipart upload + S3 put + tb_cart.cimages URL. |
| **E13** | **Address-picker modal in cart submit** | `cart.php` L504-540 SELECT-existing-address modal | `cart-manager.tsx` direct form fields, only PCS-pickup auto-fills | 🟡 **PARTIAL** | Customer with 5+ saved addresses must re-type. **1.5h port** = modal showing tb_address list. |
| **E14** | **Customer-side `getList.php` price-recap modal** | (same file as E10) | None | 🟡 **MISSING** | Before bulk-pay, customer sees a "you're about to pay ฿X total" confirm modal. Folded into E10. |
| **E15** | **`hDatePayment + 5 day` live countdown** on customer detail + admin detail | `detail.php` L470-498 (setInterval) + `update.php` L683-712 | None | 🟡 **MISSING** | UX pressure tool. **45-min fix** = client island setInterval. |
| **E16** | **Status-progress strip on detail/update page** (5-step horizontal stepper) | `detail.php` L102-141 + `update.php` L101-140 | Status badge only | 🟡 **MISSING** | UX polish; bundle with E15. |
| **E17** | **2 hardcoded customer overrides** (PCS8765 + PCS8304) — juristic mode + custom address in print | `printShop.php` L72-82 | `bill_to_name_override` exists but tombstoned (E7) + no custom address override path | 🟡 **MIGRATE** | If these 2 specific customers migrated to PR<n>, port as `tb_header_order.hbilltoname` + new optional address override JSON column. Or document as "operate via SQL". |
| **E18** | **Round-robin IP-operator assignment on `adminSubmitCartAsOrder`** | `shops.php` L58-94 | `adminSubmitCartAsOrder` always assigns current admin as `adminidcreate` + `adminidip` | 🟡 **MISSING** | Workload-distribution feature — current Pacred = single-IP bottleneck if super-admin runs all submits. **2h port**. |
| **E19** | **`getUserID.php` AJAX** (userIDs by ประเภทสมาชิก group) | `cart.php` L645-654 | `adminAddCartUser` accepts userID directly, no group-filtered dropdown | 🟡 **PARTIAL UX** | Minor — admin types the PR<n> manually. |
| **E20** | **`tb_history` audit-log inserts (saveHistory types 27-30)** | All over `shops.php` | Pacred admin actions log to `admin_audit_log` (via `logAdminAction`); legacy `tb_history` not written | 🟡 **PARTIAL/MATCHES** | Modern equivalent works. Data-completeness split — decide if forensics centralization to `tb_history` worth it. |
| **E21** | **`tb_users` last-used defaults UPDATE on admin-side submit** | `shops.php` L203 | `submitCartOrder` (customer-side) ✅ writes defaults; `adminSubmitCartAsOrder` (admin-side) does NOT | 🟡 **MISSING (admin-side only)** | **15-min fix** in admin/cart.ts. |
| **E22** | **`hShipBy='PCSF' + non-BKK province` warning** in update page | `update.php` L209-215 conditional red banner | None | 🟡 **POLISH** | Carrier mismatch warning — bundle with E3 update_hShipBy port. |
| **E23** | **Inline tracking-edit form on detail page** (admin spots typo → click "แก้ไข" → inline edit cTrackingNumber) | `shops.php` L776-815 + `detail.php` L251-264 | None | 🟡 **MISSING** | Folded into E3 (update_cTracking + updateShippingNumber). |
| **E24** | **Pre-spawn "ตรวจสอบรายการนำเข้า"** (loadForm.php — show existing tb_forwarder before spawn) | `loadForm.php` (22 LOC) + `update4.php` L110-115 | `spawnForwardersFromShopOrder` idempotent post-submit; UI doesn't pre-show | 🟡 **PARTIAL UX** | Admin always has to press, then read the result. Low priority. |

---

## 4. Severity recap

| Severity | Count | Top items |
|---|---|---|
| 🔴 P0 (reachable revenue/customer-facing broken) | **2** | E1 search-cart broken · E2 dual-write trap |
| 🟠 P1 (reachable but missing edit/heartbeat/search axis) | **9** | E3 10× header POSTs · E4 heartbeat · E5 multi-axis search · E6 refund list · E7 bill-to dead-write · E8 hPrintBill stamp · E9 IP reassign · E10 bulk-actions · E11 overdue auto-cancel |
| 🟡 P2 (polish / edge) | **13** | E12 image upload · E13 address modal · E14-E24 polish |
| 🟢 What works (faithful + reachable) | **75-85%** | Full 5-tab workflow · refund · print · customer cancel · customer pay-from-wallet · unified cart · spawn · tb_promotion carry · 4-channel notify on quote |

**Aggregated estimate: ฝากสั่ง surface ≈ 75-85% complete vs legacy.** The 2026-05-30
audits' 25-45% number is OUT OF DATE — Wave 31 + sittings F/G/H closed most P0s.
**Remaining work ≈ 12-18 hours single-developer · ~6-9 hours with 3 parallel agents.**

---

## 5. Top 5 concrete gaps ภูม should know about (the "ที่ตกหล่น" list)

These are the 5 most-likely-to-be-felt-soon gaps at HEAD:

1. **E1 — Customer URL-paste broken on `/search`** (30 min · **🔴 only customer-visible silently-broken surface today**)
   - File: `app/[locale]/(protected)/search/page.tsx` L623-858
   - Fix: wire "หยิบใส่รถเข็น" button to client-side `addCartItem` call + router.refresh
   - **Why now:** every customer who arrives via Google with a 1688 URL → presses the cart button → nothing happens → confused → bounces. Highest customer-perception cost per dev-hour.

2. **E2 — Dual `adminMarkServiceOrderPaid` (rebuilt) coexists with `-tb` (tb)** (15 min · **🔴 dead-write trap risk**)
   - File: `actions/admin/service-orders.ts` L152-317
   - Fix: redirect to `adminMarkServiceOrderPaidTb` OR tombstone with throwOnReachable
   - **Why now:** future agent / future call-site could pick the wrong one (per AGENTS.md §0e Potemkin sweep). Cheap insurance against silent green-toast-no-effect.

3. **E3 — 10 inline header-edit POSTs missing** (6-8 hours · **🟠 highest staff-friction gap**)
   - File: new `actions/admin/service-orders-header-edits.ts` + extend `extra-edits-form.tsx`
   - Top 4 most-asked (per legacy use): `update_hShipBy`, `update_hRate`, `update_payMethod`, `update_crate`. The pattern from `adminSwitchOrderTransport` makes each ~30-45 min.
   - **Why now:** every "customer rings asking to change shipping method / tax pref / etc." today goes to SQL. 5-10% of orders see one of these requests pre-pickup.

4. **E5 — Multi-axis search (cTracking + cShipping)** (1-1.5 hours · **🟠 daily ops friction**)
   - File: `app/[locale]/(admin)/admin/service-orders/page.tsx` L99+
   - Fix: detect numeric/alphanumeric pattern → JOIN `tb_order` on `(ctrackingnumber, cshippingnumber)`
   - **Why now:** "ของอยู่ไหน" tracing happens daily. Currently staff must SQL the join.

5. **E7 — `adminSetOrderBillToOverride` dead-write** (2h migration OR 10-min tombstone · **🟠 reachable § 0e dead-write trap**)
   - File: `actions/admin/service-orders.ts` L330+ + UI `bill-to-override-panel.tsx`
   - Fix path A: write migration to add `tb_header_order.hbilltoname` column + pivot action (2h)
   - Fix path B: tombstone the UI button until migration lands (10 min) per `bd84929a` pattern
   - **Why now:** admin clicks "บันทึก" on bill-to override → green toast → invoice still shows default name. Real customer-confusion source.

---

## 6. Side findings (out of strict scope)

1. **The 2026-05-30 audits' framing is now stale.** Anyone reading them without
   reading this one will think shop-order is 25-45% complete — actually closer to
   75-85%. ภูม Wave 31 (the 5-tab batch) + sitting-F + sitting-G closed most
   P0s in 2 days. Recommend either updating those audit docs with a banner
   "SUPERSEDED 2026-06-02 — see shop-order-deep-2026-06-02.md" or archiving them.
2. **The 5-tab framework lives entirely server-side as 3 separate actions**
   (`adminQuoteShopOrder` + `adminMarkShopOrderOrdered` + `adminSpawnForwarderFromShopOrder`)
   not a UI shape that mirrors the legacy tabs. That's the right call — React
   makes the legacy tabbed pattern obsolete. Each form renders conditionally
   on `hstatus`. Reachable per AGENTS.md §0d (mounted via legacy-view.tsx).
3. **`adminMarkServiceOrderPaid` (rebuilt) AND `adminMarkServiceOrderPaidTb` (tb)
   both still exist.** This is a §0e Potemkin sweep candidate — tombstone the
   rebuilt one or assert exhaustively no UI mount still calls it.
4. **The `service_orders` table is still being read** by the admin `/admin/service-orders/[hNo]/page.tsx`
   primary path (falls through to `legacy-view.tsx` only if `service_orders` row missing).
   For the 21,950 migrated orders this fallback fires every time; for new
   Pacred-original orders the primary path is hit. Two parallel write paths
   (rebuilt vs tb) coexist — fine for now but worth a "schema-unify on tb"
   decision sprint when bandwidth allows.
5. **Notifications on 4-channel quote** (`adminQuoteShopOrder`) include SMS — but
   only for the quote (1→2). The ordered (3→4) and completed (4→5) handlers do
   2-3 channels per legacy spec. SMS gateway is `lib/sms/gateway.ts` (ThaiBulkSMS).
6. **`tb_promotion` carry from header → spawned forwarder** is correctly wired
   in `adminSpawnForwarderFromShopOrder` (shop-workflow.ts L553-606) — closes
   gap G2#18 / D12 from prior audits.
7. **The customer-side `payServiceOrderFromWallet` has comprehensive partial-failure
   rollback** (service-order.ts L906+) — DELETEs `tb_wallet_hs` if `tb_wallet`
   update fails; surfaces LOUD error w/ ids if `tb_header_order` update fails
   after wallet moved. Best practice.
8. **`/admin/service-orders/notes` was repointed to `tb_header_order`** in
   commit `72faa24c` ✅ (was reading `service_orders.note`, an empty rebuilt table).
9. **There's a flagged `tb_header_order.hbilltoname` migration pending** per
   `bd84929a` — this is the unblock for E7. Worth scheduling.
10. **Customer print + admin print share theme assets at `/legacy/pcs/theme/`** —
    placeholder paths flagged for ปอน's PR brand-asset swap. Not D1-port-critical.

---

## 7. Files referenced (absolute paths)

**Legacy SOT (re-verified 2026-06-02):**
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\shops.php` (1,942 LOC)
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\cart.php` (870 LOC)
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\printShop.php` (381 LOC)
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\shop-search.php` (250 LOC)
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\shopping-return.php` (38 LOC)
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\include\pages\shops\{detail,update,cancelOrder,deleteItem,deleteOrder,editIPC,loadForm,repayItem,updateLock}.php`
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\include\pages\shops\update\{update1,update3,update4,update5,update4 copy}.php` + `*Script.php` + `checkTracking.php`
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\include\pages\shopping-return\{home,add,detail}.php`
- `D:\REALSHITDATAPCS\pcsc\public_html\member\include\pages\{cart,shops,search}\` (customer AJAX endpoints)

**Pacred at HEAD `096c0f12` (`Poom-pacred` 2026-06-02):**

Admin:
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\page.tsx` (629)
- `\app\[locale]\(admin)\admin\service-orders\service-orders-table.tsx` (600)
- `\app\[locale]\(admin)\admin\service-orders\[hNo]\page.tsx` (246)
- `\app\[locale]\(admin)\admin\service-orders\[hNo]\legacy-view.tsx` (389) — full faithful render with all workflow forms mounted
- `\app\[locale]\(admin)\admin\service-orders\[hNo]\update-form.tsx` (206)
- `\app\[locale]\(admin)\admin\service-orders\[hNo]\quote-form.tsx` (177) — Phase 1 #1
- `\app\[locale]\(admin)\admin\service-orders\[hNo]\mark-paid-tb-form.tsx` (116) — Tier A2
- `\app\[locale]\(admin)\admin\service-orders\[hNo]\mark-ordered-form.tsx` (212) — Phase 1 #2 + Phase 1 #3
- `\app\[locale]\(admin)\admin\service-orders\[hNo]\extra-edits-form.tsx` (230) — address/transport/note edits
- `\app\[locale]\(admin)\admin\service-orders\[hNo]\refund-item-form.tsx` (192) — per-item refund UI
- `\app\[locale]\(admin)\admin\service-orders\[hNo]\spawn-form.tsx` (294)
- `\app\[locale]\(admin)\admin\service-orders\[hNo]\spawn-utils.ts` (56)
- `\app\[locale]\(admin)\admin\service-orders\print\page.tsx` — admin print (P0-15)
- `\app\[locale]\(admin)\admin\service-orders\cart\**` (Wave 23 P1 + Wave 24 #187)
- `\app\[locale]\(admin)\admin\service-orders\notes\page.tsx` (210) — repointed to tb_header_order in 72faa24c

Customer:
- `\app\[locale]\(protected)\cart\page.tsx` (769) — reads tb_cart
- `\app\[locale]\(protected)\service-order\page.tsx` — list, tb_header_order
- `\app\[locale]\(protected)\service-order\cart\page.tsx` — unified to listCart() → tb_cart (72faa24c)
- `\app\[locale]\(protected)\service-order\cart\cart-manager.tsx`
- `\app\[locale]\(protected)\service-order\add\page.tsx` + `link-paste-search.tsx` — TAMIT path that works
- `\app\[locale]\(protected)\service-order\[hNo]\page.tsx`
- `\app\[locale]\(protected)\service-order\[hNo]\cancel-button.tsx` (cancelServiceOrder → tb_header_order)
- `\app\[locale]\(protected)\service-order\[hNo]\pay-from-wallet-button.tsx` (payServiceOrderFromWallet → tb_wallet_hs)
- `\app\[locale]\(protected)\service-order\[hNo]\receipt\page.tsx`
- `\app\[locale]\(protected)\service-order\print\page.tsx` — 1:1 from member/printShop.php
- `\app\[locale]\(protected)\search\page.tsx` (870) — ⚠️ MODE A `<form action="" name="addCartURL">` STILL BROKEN

Server actions:
- `\actions\admin\service-orders.ts` (556) — `adminUpdateServiceOrder` (writes tb via map) · `adminMarkServiceOrderPaid` (wrong table — duplicate of `-tb.ts`) · `adminSetOrderBillToOverride` (tombstoned)
- `\actions\admin\service-orders-tb.ts` (412) — `adminMarkServiceOrderPaidTb` Tier A2
- `\actions\admin\service-orders-shop-workflow.ts` (1,079) — `adminQuoteShopOrder` + `adminMarkShopOrderOrdered` + `adminSpawnForwarderFromShopOrder` + `adminUpdateOrderAddress` + `adminSwitchOrderTransport` + `adminAddOrderNote`
- `\actions\admin\service-orders-spawn.ts` (373) — Wave 21
- `\actions\admin\service-orders-refund.ts` (346) — per-item refund
- `\actions\admin\cart.ts` (588)
- `\actions\service-order.ts` (1,156) — customer-side, all tb_*
- `\actions\cart.ts` (1,349) — customer cart, tb_cart

**Pacred missing entirely (the gap):**
- `\actions\admin\service-orders-header-edits.ts` (E3 — 10 inline POST handlers)
- `\actions\admin\service-orders-lock.ts` (E4 — heartbeat)
- `\app\api\cron\auto-cancel-overdue-shop-orders\route.ts` (E11)
- `\app\[locale]\(admin)\admin\service-orders\refunds\page.tsx` (E6 — refund history list)
- Wire-up for `/search` MODE A cart-add (E1)
- `tb_header_order.hbilltoname` migration (E7)

---

## 8. Recommendation — single sprint sequence (~10-14h)

Order by leverage-per-hour:

1. **E1 — wire /search MODE A cart-add** (~30 min) — only customer-visible silent break.
2. **E2 — tombstone `adminMarkServiceOrderPaid` (rebuilt)** (~15 min) — Potemkin sweep.
3. **E5 — multi-axis admin search** (~1.5h) — daily ops friction.
4. **E7 — tombstone bill-to UI OR ship hbilltoname migration** (~10 min OR ~2h).
5. **E11 — overdue auto-cancel cron** (~1h) — wallet leak avoidance.
6. **E3 — 10 inline header-edit POSTs batch** (~6-8h) — staff friction. Can parallelize 3 agents (a, b, c) on disjoint columns.
7. **E4 — heartbeat lock** (~1.5h) — concurrent-edit safety.
8. **E6 — refund history list** (~1.5h) — ops review surface.
9. **E9 — IP-operator reassign modal** (~1.5h) — staff turnover need.
10. **E10 — bulk-cancel/bulk-pay on customer list** (~1.5h) — power-user UX.

P2 polish (E12-E24) = a separate later sprint.

**End of audit.** Resume next session with the 5-item list in §5 or the
10-item priority sequence in §8.
