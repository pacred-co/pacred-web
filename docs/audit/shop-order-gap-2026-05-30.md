# Shop-Order (บริการฝากสั่ง) Gap Audit — 2026-05-30

**Auditor:** Agent G2 (read-only deep-audit)
**Trigger:** ภูม flag — *"3. บริการฝากสั่ง แกยังไม่แกะมาให้ละเอียด ให้เป๊ะเลยนะ"*
**Method:** AGENTS.md §0b deep-audit-from-source protocol — every gap cited against the legacy PHP file on disk + verified against the Pacred TypeScript that should mirror it.
**Legacy SOT:** `D:\REALSHITDATAPCS\pcsc\public_html\member\` (verified accessible · 16 root-level entries · `pcs-admin/` + `include/pages/` contain all shop+cart flow handlers).
**Pacred under audit:** `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\` · branch `claude/adoring-chandrasekhar-0f8ad7` · HEAD `bc81a78` (per session resume).

---

## 0. Scope-creep alert (read first)

The legacy "บริการฝากสั่ง" reach is **larger than the file name suggests**. `pcs-admin/shops.php` is 1,942 LOC with **~28 distinct POST handlers**, and the workflow spans:

1. **Customer-side cart** (`include/pages/cart/*`) — add/edit/delete items, calculate price, choose Thai ship-to address, switch shipBy carrier, apply promo
2. **Customer-side shops list** (`shops.php?page=add` lands the order)
3. **Customer-side search/URL paste** (`include/pages/search/dataAPI.php` → TAMIT API for 1688/Taobao/Tmall — pastes product → renders SKU grid → POST `addCartURL` → `tb_cart`)
4. **Admin-side workflow** — the 5-step "process-model" `tb_header_order.hstatus` 1→2→3→4→5 lifecycle with admin update tabs (update1 quote → update3 ordered → update4 tracking → update5 received-at-China)
5. **Admin-side spawn** — when admin enters `cTrackingNumber` → auto-INSERT `tb_forwarder` row with `refOrder=hNo` (the bridge into the import flow)
6. **Admin-side print** — invoice + receipt mPDF generation
7. **Admin-side refund** — `shopping-return.php` per-item refund into `tb_wallet_hs`
8. **Notifications** — Email + SMS + LINE Notify + LINE OA on every status change (10+ trigger points across `shops.php`)
9. **Promo overlays** — `tb_promotion` rows for 3.3 / valentine / PCSF free-shipping
10. **Cross-cutting** — `tb_users.userAddressID/userShipBy/userPayMethod` "last used" defaults · `tb_cash_back_hs` cashback (currently dormant in legacy) · `tb_history` audit log on every mutation

**Top-line finding: Pacred's shop-order is ≈ 35-45% complete against the legacy.** The read paths are mostly faithful (list/detail with `tb_*` schema works), but the **customer purchase flow, admin update workflow, automated spawn-to-forwarder, refund flow, and ALL print/notify side-effects are partially broken or missing**. Worst, there's a **dual-schema bifurcation** (rebuilt `service_orders`+`cart_items` coexisting with legacy `tb_header_order`+`tb_cart`) that leaves customers with **TWO different carts** depending on which route they land on. This is the single biggest revenue blocker found.

**Discovery method note:** The customer-side root PHP files (`/member/shops.php`, `/member/cart.php`, `/member/search.php`) are NOT present in `D:\REALSHITDATAPCS\pcsc\public_html\member\` — only directories exist at that level. The `pcs-admin/shops.php` + `pcs-admin/cart.php` files double as both the staff workflow AND the customer-facing handler logic (the legacy URL rewrite `RewriteRule ^cart/$ cart.php` likely resolved customer URLs to the same handler files; `include/header.php` discriminates by `$_COOKIE["pcs_userID"]` vs `$_COOKIE["pcs_admin_adminID"]`). All POST handler logic + SQL inspection was done against `pcs-admin/shops.php` + `pcs-admin/cart.php` + the customer-only AJAX endpoints under `member/include/pages/{cart,shops,search}/`.

---

## 1. Architecture map

### 1a. Legacy data flow (PHP)

```
search.php?url=<chinese-url>
   └─ include/pages/search/dataAPI.php → curl(TAMIT) → render SKU grid
       └─ POST addCartURL → cart.php L63-111 → INSERT tb_cart

cart/ (cart.php main view)
   ├─ AJAX calculateCart.php  → recalc on row-check toggle
   ├─ AJAX updateQuantity.php → cAmount edit
   ├─ AJAX deleteItem.php     → DELETE tb_cart
   ├─ AJAX api-shipBy.php     → forwarder picker for "ส่งกลับไทย"
   ├─ AJAX option-address-thai.php / api-shipBy.php / checkPCSMaoMao.php
   ├─ AJAX add-address-form.php / update-address-form.php → modal forms
   └─ POST → shops.php?page=add (addOrder)
                ├─ INSERT tb_header_order (hStatus=1, hNo='P'+id)
                ├─ INSERT tb_order × N rows (snapshot cart)
                ├─ DELETE tb_cart
                ├─ UPDATE tb_users (last-used defaults)
                ├─ UPDATE tb_header_order rollup (hTotalPriceCHN, hRate, hCount, hTitle, hCover)
                ├─ INSERT tb_promotion (when pro='77' = 3.3 promo)
                └─ SEND email + SMS + LINE Notify + LINE OA

shops.php?page=add (LIST mode)
shops.php?page=detail&id=$hNo (DETAIL mode — read-only)
shops.php?page=update&id=$hNo (WORKFLOW mode — admin-only, 5 tabs by hStatus)
   ├─ Tab 1 (hStatus=1 รอดำเนินการ): update2 → quote, set hCostAll/hRateCost/hShippingCHN, flip hStatus=2 + hDatePayment=+5d
   ├─ Tab 2 (hStatus=2 รอชำระเงิน):  customer pays via wallet → flip hStatus=3
   ├─ Tab 3 (hStatus=3 สั่งสินค้า):   update3 → set cShippingNumber (China shop order #) per shop
   ├─ Tab 4 (hStatus=4 รอจีนจัดส่ง):  update4 → set cTrackingNumber per cShippingNumber + saveTarcking
   │                                  └─ AUTO-SPAWN: INSERT tb_forwarder w/ refOrder=hNo + 19 fields copied
   └─ Tab 5 (hStatus=5 สำเร็จ):       update5 → read-only, shows linked tb_forwarder.ID via refOrder

Admin actions on detail/update page:
   ├─ POST saveNote                → UPDATE hNote/hNoteUser + notify customer
   ├─ POST update_hStatus           → flip status (legacy "ย้อนสถานะ")
   ├─ POST update_hAddress          → change ship-to address
   ├─ POST update_hShipBy           → change carrier
   ├─ POST update_hTransportType    → EK/Sea swap
   ├─ POST update_hRate             → custom yuan rate
   ├─ POST update_payMethod         → origin/destination pay
   ├─ POST update_crate             → flip "ตีลังไม้"
   ├─ POST update_cTracking         → fix typoed China tracking
   ├─ POST update_cPriceUpdate      → admin price adjust on one line item
   ├─ POST updateShippingNumber     → fix typoed China shop order #
   ├─ POST upAdminIDIP              → reassign IP (ฝ่ายฝากสั่งซื้อ)
   ├─ POST arrSaveTarcking          → multi-tracking split (when one shop has N parcels)
   ├─ AJAX repayItem.php            → per-item refund (cReWallet=1, INSERT tb_wallet_hs type=5, status=2)
   ├─ AJAX cancelOrder.php          → flip hStatus=6 (customer self-cancel)
   ├─ AJAX deleteItem.php           → admin delete a tb_order row (NOT customer DELETE)
   ├─ AJAX deleteOrder.php          → hard delete hNo (super-admin only)
   ├─ AJAX editIPC.php              → reassign IP via modal
   ├─ AJAX updateLock.php           → freeze status changes
   └─ Print URLs:
        printShop.php?print=1&id[]=hNo → ใบเสร็จ (receipt)
        printShop.php?print=2&id[]=hNo → ใบแจ้งหนี้ (invoice)

shopping-return.php (refund — separate file)
   ├─ ?page=add&hNo=$hNo            → render refund form (line-item + qty)
   ├─ ?page=detail                  → show refund detail
   └─ default                       → list (home.php)
```

### 1b. Pacred today (TypeScript)

```
Customer side:
   /cart                    → page.tsx reads tb_cart           ← LEGACY-SCHEMA cart
       ├─ CartInteractivity            (calculateCartTotal, updateCartItemQuantity, deleteCartItem from actions/cart.ts → tb_cart)
       ├─ CartAddressShipBy            (SSR-precomputed lists)
       └─ submitCartOrder → INSERT tb_header_order + tb_order + DELETE tb_cart  (faithful)

   /cart/add                → CartPage + focus effect   ← same /cart, just auto-focus

   /service-order/cart      → page.tsx reads cart_items       ← REBUILT-SCHEMA cart (DIFFERENT cart!)
       ├─ CartManager (cart_items via listCart() from actions/cart.ts)
       └─ placeServiceOrder → INSERT service_orders + service_order_items (rebuilt)

   /service-order/add       → page.tsx + LinkPasteSearch
       └─ addCartItem → INSERT cart_items                     ← REBUILT-SCHEMA only

   /service-order           → page.tsx reads tb_header_order   (faithful list)
   /service-order/[hNo]     → reads tb_header_order            (faithful detail)
   /service-order/pending   → reads tb_header_order            (faithful list filtered hstatus=2)
   /service-order/print     → ?
   /search                  → page.tsx — TAMIT MODE A (URL paste) calls convertProductUrlDetail()
       └─ FORM submits to action="" name="addCartURL"          ← NO HANDLER (broken)

Admin side:
   /admin/service-orders         → page.tsx reads tb_header_order  (faithful)
   /admin/service-orders/[hNo]   → page.tsx → service_orders OR fallback legacy-view → tb_header_order
       ├─ SpawnForwarderForm → spawnForwardersFromShopOrder → INSERT tb_forwarder (faithful Wave 21)
       ├─ AdminServiceOrderUpdateForm → adminUpdateServiceOrder → UPDATE service_orders  ← REBUILT only (no-op for migrated rows)
       ├─ adminMarkServiceOrderPaid → UPDATE service_orders + INSERT wallet_transactions  ← REBUILT only
       └─ BillToOverridePanel
   /admin/service-orders/notes   → notes list
   /admin/service-orders/cart    → admin cart-on-behalf-of-user
   /admin/service-orders/cart/add → admin cart add-form

   /admin/shop-payouts           → shop-affiliate payout (NOT refund flow!)

   /admin/reports/shop, /shops-profit, /shops-profit-pay → tb_header_order reports (look OK)
   /admin/reports/monthly-orders → tb_header_order rollup

   No equivalents found for:
     - shopping-return.php (per-item refund flow)
     - printShop.php       (PDF print of invoice/receipt — partial via /service-order/print?)
     - admin "process-model" 5-tab edit workflow (no update1/update3/update4 tabs)
     - admin saveNote/update_hStatus/update_hAddress/etc 14+ inline POST handlers
```

---

## 2. Gap-diff table (legacy mode → Pacred · prioritized)

### 🔴 P0 — Revenue blocker / data corruption / customer can't complete workflow

| # | Legacy mode/feature | Legacy file:line | Pacred equivalent | Status | Gap notes |
|---|---|---|---|---|---|
| **1** | **Dual-cart bifurcation** — `tb_cart` (legacy) vs `cart_items` (rebuilt) coexist as two separate carts | `pcs-admin/cart.php` L3-111 (writes `tb_cart`) vs Pacred `actions/cart.ts` L539 `addCartItem` (writes `cart_items`) | `/cart` reads `tb_cart`; `/service-order/cart` reads `cart_items` | 🔴 **WRONG BEHAVIOR** | Customer's URL-paste add via `/service-order/add` → `cart_items`. Customer's `/cart` view reads `tb_cart` (sees EMPTY). Conversely customer's `/service-order/cart` reads `cart_items` only (won't see what they added via `/cart` flow when that hooks up). **TWO DIFFERENT CARTS PER CUSTOMER.** Must pick ONE schema and route all adds + all reads there. Owner rule "100% same as legacy" → pick `tb_cart`. |
| **2** | **Customer URL-paste add to cart is silently broken** | `search.php` MODE A → `cart.php` `addCartURL` handler L63-111 → INSERT `tb_cart` | Pacred `/search` page MODE A `app/[locale]/(protected)/search/page.tsx` L622-860 renders skeleton form `<form action="" name="addCartURL">` | 🔴 **MISSING** | Form has no `onSubmit`, no Server Action, action="". Customer pastes URL → sees SKU grid (Wave 28 `convertProductUrlDetail` wired) → presses "หยิบใส่รถเข็น" → **NOTHING HAPPENS**. The legacy `addCartURL` POST handler was never ported. Customer has no way to get TAMIT-search results INTO the cart from `/search`. The only working URL-add path is `/service-order/add` (separate page, writes to wrong schema — see gap #1). |
| **3** | **`cancelServiceOrder` writes to `service_orders` — 21,950 legacy rows can't cancel** | `include/pages/shops/cancelOrder.php` L8 — UPDATE `tb_header_order` SET hStatus='6' | `actions/service-order.ts` L759-783 — UPDATE `service_orders` SET status='cancelled' WHERE h_no=... | 🔴 **WRONG TABLE** | The cancel button on `/service-order/[hNo]` for any migrated order (hStatus 1 or 2) silently no-ops. The Update path uses `eq("h_no", hNo)` against an empty rebuilt table. Customer sees the button, clicks it, status doesn't change. Must dual-write to `tb_header_order` OR pivot the customer cancel path to legacy schema. |
| **4** | **Admin status flip workflow is dormant for migrated orders** — the entire `/admin/service-orders/[hNo]` UpdateForm targets `service_orders` | `pcs-admin/shops.php` L905-915 — `update_hStatus` handler updates `tb_header_order` | `actions/admin/service-orders.ts` L47-100 `adminUpdateServiceOrder` reads + writes `service_orders` (empty on prod) | 🔴 **WRONG TABLE** | Sales/ops admin opens any legacy ฝากสั่ง order → tries to set status (e.g., "รอชำระเงิน" → "สั่งสินค้าแล้ว") → action returns `not_found`. The entire 5-tab process-model workflow legacy supports doesn't function on the 21,950 ported orders. **Largest single admin workflow gap.** |
| **5** | **Admin "mark as paid" writes to rebuilt `service_orders`** | `pcs-admin/shops.php` L1186-1224 + L916-1070 `update2` handler (sets hStatus=2 + hDatePayment+5d + inserts wallet entry) | `actions/admin/service-orders.ts` `adminMarkServiceOrderPaid` writes `service_orders` + `wallet_transactions` | 🔴 **WRONG TABLE** | Even if customer pays via the wallet (the customer-side `payServiceOrderFromWallet` in `actions/service-order.ts` L800 — also wrong table!), admin's manual mark-paid path also fails. Money-flow bridge is broken for 21,950 historical orders. Customer pays via `tb_wallet_hs` (legacy) but Pacred records the debit in `wallet_transactions` (rebuilt) — split ledger. |
| **6** | **`payServiceOrderFromWallet` writes to rebuilt schema** | `pcs-admin/shops.php` L1186-1224 — UPDATE tb_header_order hStatus=3, INSERT tb_wallet_hs type=2 status=2 | `actions/service-order.ts` L800-949 — UPDATE `service_orders` + INSERT `wallet_transactions` | 🔴 **WRONG TABLE** | Customer self-pay from wallet on a migrated order → SELECT `service_orders` (not found) → returns `not_found`. **Customer is unable to pay their ฝากสั่ง orders.** Critical revenue blocker for all migrated customers (~8,898). |
| **7** | **Customer `/service-order/[hNo]` ack-delivery writes to rebuilt schema** | Legacy didn't model "customer acknowledged" — Pacred-added U4-3a feature | `actions/service-order.ts` L966-1040 `customerAcknowledgeServiceOrderDelivery` writes `service_orders` | 🔴 **WRONG TABLE** | This is a Pacred-original U4-3a enhancement but stuck against empty rebuilt table; no impact for legacy orders (none reach status=completed via this code path) but symptomatic of the systemic dual-schema problem. |

### 🟠 P1 — Workflow works but admin has to patch manually / data quality loss

| # | Legacy mode/feature | Legacy file:line | Pacred equivalent | Status | Gap notes |
|---|---|---|---|---|---|
| **8** | **Refund per item (shopping-return)** — admin refunds 1+ items, sets `tb_order.cReWallet=1`, inserts `tb_wallet_hs` deposit, recomputes `hTotalPriceCHN` | `pcs-admin/shopping-return.php` + `include/pages/shopping-return/add.php` + `pcs-admin/include/pages/shops/repayItem.php` (153 LOC) | Pacred `/admin/refunds` exists but not wired to shop-order line items; no `shopping-return.php` equivalent. `actions/admin/shop-payouts.ts` is **shop-affiliate wallet payouts** — DIFFERENT FEATURE | 🔴 **MISSING** | When customer asks for refund on an item (legacy "คืนเงิน" button on /admin update page L82-92), there's no Pacred path. Admin must SQL-patch by hand. Affects line-item refund workflow.  |
| **9** | **5-tab admin process-model workflow** (update1 quote → update3 ordered → update4 tracking → update5 received) | `pcs-admin/include/pages/shops/update.php` + `update/update1..5.php` (1,892 LOC total) | Pacred shows a single `AdminServiceOrderUpdateForm` (status flip + note) — no tabbed quote/ordered/tracking forms | 🟠 **PARTIAL** | Pacred admin can set status but can't edit `cAmount/cPrice/cShippingCHN` per line item (update2 quote), can't enter `cShippingNumber` per-shop (update3), can't enter `cTrackingNumber` per shipping number (update4 — except via SpawnForwarderForm which exists separately). The shop-order tracking lifecycle relies on staff entering data in these tabs. Currently they can't. |
| **10** | **`saveTarcking` auto-spawn forwarder + multi-parcel split (`arrSaveTarcking`)** | `shops.php` L1363-1582 (saveTarcking single-row) + L1584-1791 (arrSaveTarcking multi-parcel split) | `actions/admin/service-orders-spawn.ts` `spawnForwardersFromShopOrder` (373 LOC) — handles single trackings + bulk array | 🟢 **MATCHES** (Wave 21) — but spawn-form UI only exposes 1 tracking per shop, not the multi-parcel split | 🟠 **PARTIAL UX** | The Server Action is correct, but Pacred's UI form doesn't surface the `arrStack`/per-parcel-shipping split that legacy update4 L78-117 expanded. Admin can't split one shop's 3 parcels into 3 separate `tb_forwarder` rows from the UI. |
| **11** | **`updateShippingNumber`** — admin fixes a typoed China shop order # | `shops.php` L1793-1805 | No Pacred equivalent | 🔴 **MISSING** | Admin spots typo in `cShippingNumber` → must SQL-patch. Common task — China shop order numbers are 12-15 digits, transcription errors happen daily. |
| **12** | **`update_cTracking`** — admin fixes a typoed China tracking number | `shops.php` L776-815 (sub-handler in `?page=detail` mode) | No Pacred equivalent | 🔴 **MISSING** | Same as #11 but for tracking number (post-spawn). Currently admin must DELETE the spawned `tb_forwarder` row and re-spawn. Workflow leak.  |
| **13** | **`update_hAddress` / `update_hShipBy` / `update_hTransportType` / `update_hRate` / `update_payMethod` / `update_crate`** — 6 single-field updates on the header | `shops.php` L1225-1362 | No Pacred equivalents — only status + note in UpdateForm | 🔴 **MISSING** | Customer rings staff: "เปลี่ยนที่อยู่ส่งหน่อย", "เปลี่ยนเป็นเรือแทนรถ", "ขอจ่ายปลายทาง", "ขอตีลังไม้" — staff must SQL-patch. Affects ~5-10% of orders pre-pickup. |
| **14** | **`update_cPriceUpdate`** — inline per-line price adjustment | `shops.php` L1806-1846 | No Pacred equivalent | 🟠 **MISSING** | Admin adjusts ¥ price on one line item (commonly used when China shop changes price post-order). Staff workaround: total-refund + re-order. |
| **15** | **`upAdminIDIP`** — reassign IP-operator (the ฝ่ายฝากสั่งซื้อ staff member responsible) | `shops.php` L1847-... + `editIPC.php` | No Pacred equivalent — `/admin/customers/transfer-rep` is the analogous sales-rep transfer but doesn't cover per-order IP-operator assignment | 🟠 **MISSING** | When IP-operator leaves company / takes leave, orders need reassignment to new IP. Manual SQL today. |
| **16** | **Print invoice (`printShop?print=2`) + Print receipt (`printShop?print=1`)** | `pcs-admin/printShop.php` (381 LOC, mPDF, "ใบแจ้งหนี้" + "ใบเสร็จ" with WHT 1% + 4-signature) | `app/[locale]/(admin)/admin/.../printShop` — couldn't find · `/service-order/print` exists on customer side · `lib/admin/print-receipt-f.ts` exists for forwarder receipts | 🟠 **PARTIAL** | Shop-order receipt print path appears to exist on customer side, but the admin-side print path (which the legacy update.php L83-91 + L90-91 buttons link to with `&id[]=hNo` array support) is missing. Wave 29 work focused on forwarder receipt; shop-order receipt likely defers there too. |
| **17** | **`tb_promotion` row INSERT on order placement (3.3 promo)** | `shops.php` L65-72 — INSERT tb_promotion when pro2=77 | `actions/cart.ts` L286-298 `submitCartOrder` — INSERT `tb_promotion` (faithful) | 🟢 **MATCHES** | (Cited for completeness — gap-table also tracks ✅ to show what works.) |
| **18** | **`tb_promotion` row INSERT on spawn (when 3.3 customer's order spawns a forwarder)** | `shops.php` L1514-1523 — propagate promoID from hNo → spawned fID | `actions/admin/service-orders-spawn.ts` — does NOT propagate `tb_promotion` to spawned `tb_forwarder` | 🟠 **MISSING** | Promo customers' downstream forwarder rows lose the promo discount entitlement. Admin has to manually link. |
| **19** | **Email + SMS + LINE Notify + LINE OA notification on every status change** | `shops.php` L143-150 (place), L994-1070 (update2 → status=2), L1102-1180 (update3 → status=3), L1456-1511 (spawn) | `actions/cart.ts` `submitCartOrder` calls `notify.serviceOrderPlaced`; `service-order.ts` `payServiceOrderFromWallet` calls `notify.walletTxStatusChanged`; `actions/admin/service-orders-spawn.ts` mentions sendNotification but for forwarder | 🟠 **PARTIAL** | Place-order notify and pay-from-wallet notify exist; status-change-by-admin notify (legacy SMS+Email+LINE on hStatus 2/3/4/5 changes) is NOT wired since `adminUpdateServiceOrder` doesn't touch legacy rows. The legacy notify includes Thai message templates with `pricePay`, `datetime_now2`, LINE OA flex-card payload — all unported on the status-change path. |
| **20** | **`hDatePayment +5 day` countdown timer** | `shops.php` L955 (DB INTERVAL 5 DAY) + `shops.php` L70-71 (UI display when hDatePayment > now) | `actions/cart.ts` `submitCartOrder` doesn't set `hdatepayment`; `actions/service-order.ts` `placeServiceOrder` sets `payment_due_at = now + 24 HOURS` on `service_orders` | 🟠 **WRONG VALUE + WRONG TABLE** | Legacy is 5 days; Pacred placeServiceOrder uses 24 hours. Different policy. Also `payment_due_at` lands on `service_orders` (empty), and `tb_header_order.hdatepayment` is left NULL by `submitCartOrder` — so the legacy auto-cancel-after-overdue path in `shops.php` L72-78 doesn't trigger for Pacred-created orders. |
| **21** | **Overdue-payment auto-cancel** — `shops.php` renders → checks `hDatePayment < NOW` → UPDATE `hStatus=6` | `shops.php` L72-78 (read-time side effect — not cron) | No Pacred equivalent — neither in `actions/cart.ts` nor as a cron | 🔴 **MISSING** | Orders sit in `hstatus=2` forever even after the payment window closes. Pacred has no payment-deadline enforcement. (Legacy PHP did this in-place on every admin page-load — that's an anti-pattern Pacred should solve via cron, not by porting the read-time write.) |
| **22** | **`tb_users` last-used defaults UPDATE on order-placement** | `shops.php` L203 — UPDATE tb_users SET userAddressID, userShipBy, userPayMethod | `actions/cart.ts` `submitCartOrder` L452-459 — UPDATE tb_users (faithful) | 🟢 **MATCHES** | Cited as positive. Update spelling: legacy uses camelCase (`userAddressID`), Pacred uses same — schema casing drift §0 cleared per CLAUDE.md. |

### 🟡 P2 — Polish / edge cases / cleanup

| # | Legacy mode/feature | Legacy file:line | Pacred equivalent | Status | Gap notes |
|---|---|---|---|---|---|
| **23** | **PCS warehouse pickup address** | `shops.php` L25-36 hardcoded Bangkok address | `actions/cart.ts` L321-332 uses `ADDRESSES.warehouseTh` (Samut Sakhon — Pacred-actual) | 🟢 **INTENTIONAL DIVERGENCE** | This is per AGENTS.md §0a "polish the UI" — keep. |
| **24** | **`fcover` image legacy URL rewriting** | `shops.php` chProhNo + `convertIMGCHN` per row | `app/[locale]/(protected)/service-order/page.tsx` uses `legacyMemberUrl` | 🟢 **MATCHES** | |
| **25** | **`shopping-return` listing** | `pcs-admin/shopping-return.php` `default` case → `home.php` | No Pacred equivalent · `/admin/refunds` is generic refunds | 🟠 **PARTIAL** | If gap #8 closes, list page also needs porting. |
| **26** | **Survey / `tb_pro_valentine` overlay** | `include/pages/cart/check-proV.php` + `saveproV.php` + `survey.php` (Google Sheets API check for past-recipient list) | No Pacred equivalent | 🟢 **DEFER** | Time-bounded promo — legacy code reads a 2023 Google Sheet. Not load-bearing. Defer Phase C. |
| **27** | **Cart capacity 151-item cap** | `shops.php` L23 — `if(101>=$countAdd)` (actually 101 in code, comment says 151 — bug in legacy) + `cart.php` L18 — `$countFor=151-$countCart` | Pacred `actions/cart.ts` constant `CART_CAPACITY = 151` (read-only display) + DB-side trigger ("cart cap reached (151 items)") | 🟢 **MATCHES** | Legacy bug "101 vs 151" exists; Pacred picked 151 (likely correct). Note in CLAUDE_TECHNICAL: "151-cap trigger raises 'cart cap reached (151 items)'". |
| **28** | **Image upload variant (`addCart` with file upload via `$_FILES['cImages']`)** | `cart.php` L26-51 — multi-row form with image upload  | Pacred only supports `addCartItem` single-row with image_path string · no file upload | 🟠 **MISSING** | Legacy customer could upload product photos (especially for "ฝากซื้อ" custom requests where no URL exists). Pacred can paste URL only. Affects manual-ask workflow ~5% of orders. |
| **29** | **`addCartUser` — admin adds to customer's cart on behalf** | `cart.php` L112-138 | `actions/admin/cart.ts` `adminAddItemToCart` exists | 🟢 **MATCHES** | Wave 23 admin form covers this. |
| **30** | **`getList.php` — modal to multi-select cancel orders** | `include/pages/shops/getList.php` (105 LOC modal) | No Pacred equivalent — `/service-order/page.tsx` has no bulk-cancel modal | 🟡 **PARTIAL** | Bulk-cancel from list view exists in some forms (Wave 20 mentions "ChargedMany") but the specific "view confirm grid then bulk-cancel" modal isn't ported. Minor. |
| **31** | **`getList.php` price recap modal** | (same file, also serves as bulk-pay-confirm modal) | Pacred customer pay-from-wallet is per-order only · no bulk-pay multi-select | 🟡 **PARTIAL** | Legacy let customer bulk-pay N orders in one wallet debit. Pacred forces one-at-a-time. UX regression for power users. |
| **32** | **Order detail tracking-edit inline form (per shop, in-place edit cTrackingNumber)** | `shops.php` L760-815 detail-mode `update_cTracking` handler + `detail.php` L251-264 inline `<form class="editForm">` per shop | No Pacred equivalent | 🟠 **MISSING** | Already in #12; cited again because the UI surface (inline-edit per shop in the detail page) is distinct from the workflow update tabs (#9). |
| **33** | **`shop-search.php` — multi-axis search (hNo/tracking/cShippingNumber/userID/all)** | `pcs-admin/shop-search.php` (250 LOC) | `/admin/search` exists (1 file · scope unknown) | 🟡 **UNVERIFIED** | Whether `/admin/search` covers shop-search multi-axis is out of this audit's scope. ภูม flag. |
| **34** | **`tb_history` audit-log INSERT on every mutation (`saveHistory(sql, type)`)** | All over `shops.php` — `saveHistory($sql, 27/28/29/30...)` after each UPDATE | Pacred uses `logAdminAction` in `actions/admin/common.ts` | 🟢 **PARTIAL/MATCHES** | Pacred admin actions log, but customer-facing actions (cart.ts) don't write to `tb_history` — minor data-completeness loss. |
| **35** | **PCS branding in addresses / Thai labels** | `shops.php` various: "PCS Cargo กทม", "PCS<num>" | Pacred consistent: "Pacred"; member codes "PR<num>" | 🟢 **MATCHES** (PR rebrand done) | |

### 🟢 What DOES work (read paths · ack)

| # | Feature | Status |
|---|---|---|
| 36 | Customer `/cart` list rendering (reads `tb_cart`) | 🟢 Faithful |
| 37 | Customer `/service-order` list (reads `tb_header_order`) | 🟢 Faithful |
| 38 | Customer `/service-order/[hNo]` detail (reads `tb_header_order` + `tb_order`) | 🟢 Faithful |
| 39 | Customer `submitCartOrder` (the cart → tb_header_order INSERT) | 🟢 Faithful |
| 40 | Customer `calculateCartTotal` (price recalc) | 🟢 Faithful |
| 41 | Customer `deleteCartItem` / `updateCartItemQuantity` | 🟢 Faithful |
| 42 | Customer search `/search?url=` MODE A render skeleton + TAMIT call | 🟢 Faithful (the GAP is the ADD button — see #2) |
| 43 | Admin `/admin/service-orders` list | 🟢 Faithful |
| 44 | Admin `/admin/service-orders/[hNo]` legacy fallback view | 🟢 Faithful (read-only) |
| 45 | Admin `spawnForwardersFromShopOrder` (Wave 21) | 🟢 Faithful (Server Action) |
| 46 | Admin reports — `shops-profit`, `shops-profit-pay`, `shop`, `monthly-orders` | 🟢 Read paths working |
| 47 | Promo `tb_promotion` insert on order-place (3.3 promo) | 🟢 Faithful |
| 48 | tb_users "last used" defaults UPDATE | 🟢 Faithful |

---

## 3. Severity recap

| Severity | Count | Top items |
|---|---|---|
| 🔴 P0 (revenue blocker / wrong-table writes) | **7** | #1 dual-cart, #2 search-cart broken, #3-#7 wrong-table writes for 21,950 migrated orders |
| 🟠 P1 (admin patches manually) | **15** | #8 refund flow, #9 5-tab workflow, #11-#16 inline edits, #19-#21 timer/notify/auto-cancel |
| 🟡 P2 (polish) | **13** | bulk-actions, image-upload-add, address-detail divergence |

**Realistic estimate: shop-order ≈ 35-45% complete vs legacy.** The customer-side cart view + order-list + detail-read are correctly ported (≈ 70% of read paths). The **mutation paths** — admin workflow tabs, cancel, mark-paid, refund, status-flips, inline edits — are systemically broken because they write to the rebuilt `service_orders` table that holds 0 rows on prod. The 21,950 historic ฝากสั่ง orders are effectively READ-ONLY in Pacred today.

---

## 4. Recommendation — ONE focused fix for next session

**Top recommendation: close the dual-schema bifurcation by making ALL mutation paths target the legacy `tb_*` schema (matches owner's "100% sameness FIRST" rule).**

Specifically — in priority order, what to do next session (~6-10 hours, single-developer):

1. **Pivot `cancelServiceOrder` to `tb_header_order`** (~30 min · single Server Action rewrite + tests). Closes gap #3 — unblocks customer self-cancel for 21,950 migrated orders. **Highest revenue-per-effort.**
2. **Pivot `payServiceOrderFromWallet` to `tb_header_order` + `tb_wallet_hs`** (~2 hours · rewrite the entire ledger path to the legacy tables). Closes gap #6 — unblocks customer wallet-pay for ALL ฝากสั่ง orders. **Single biggest revenue unblock in the whole audit.**
3. **Pivot `adminUpdateServiceOrder` + `adminMarkServiceOrderPaid` to `tb_header_order` + `tb_wallet_hs`** (~2 hours). Closes gaps #4 + #5 — unblocks admin manual mark-paid + status-flip for legacy rows.
4. **Wire the `/search` MODE A "หยิบใส่รถเข็น" form to a real Server Action that writes to `tb_cart`** (~1 hour · single Server Action). Closes gap #2 — closes the URL-paste → cart loop on the legacy schema.
5. **Decide on dual-cart fate: drop `cart_items` writes (or migrate the data + drop the table)** (~30 min decision; ~2 hours migration if data exists). Closes gap #1.

After this 5-step pivot, **the customer purchase + payment loop will function for ALL 21,950 migrated orders + all new orders**, and the admin status workflow becomes operable. Refund flow (gap #8), 5-tab edit workflow (gap #9), and inline-edits (#11-#16) are then the next sprint after.

**Alternative — bigger ROI, riskier scope: do all 5 pivots in one wave (call it Wave 31: "Schema unify on tb_*"). All 5 together is ~6-8 hours of work + ~1 hour of test re-baselining; benefits compound (e.g., #6 will also fix the wallet-balance race-condition #890-913 idempotency in `payServiceOrderFromWallet` if rewritten cleanly).**

---

## 5. Side findings (out of strict scope but worth noting)

1. **Dual schema is the systemic root cause** — not just for shop-order. Looking at `actions/admin/service-orders.ts`, `actions/service-order.ts`, and `actions/cart.ts`, the rebuilt-vs-legacy split appears throughout. This pattern likely repeats for `forwarders` family (per ภูม Wave 22 audit), `wallet` family, and `addresses` family. A dedicated "schema unify on tb_*" sweep would close ~50+ gaps in one shot. Recommend a tracked decision per CLAUDE.md Wave 28 §B-5 ("Schema casing drift").
2. **`/search` MODE A TAMIT integration** is the Wave-28 hot-link feature — `convertProductUrlDetail()` ✅ works, but stops short of writing the result anywhere. The skeleton + the call work, but the "add to cart" terminus is missing — this is the most-visible customer surface that's silently broken (gap #2).
3. **Comment in `actions/cart.ts` L155-156** explicitly notes "Image-unlink (legacy L15-17) is NOT reproduced — legacy 'images/shops/<file>' lives on the legacy disk; Pacred image storage is the Phase-A backfill (separate)." So image storage was deferred. ภูม's 2026-05-24 evening note ("customer image + storage files uploaded to Supabase S3 prod (pcsracgo/public/member)") suggests this might now be unblockable — worth a quick verify.
4. **Legacy data scope** — `pcs-admin/shops.php` includes ~14 LINE Notify hardcoded `$token="wj4GhTEPAmbI9jqeV6W8RBxLhA1N5LwGnBFumQUBaPb"` etc — these tokens are leaked. PSC-scrub plan covers; ก๊อต API switchover gates the actual deletion (CLAUDE.md §3 rule).
5. **`tb_promotion` cross-references** — gap #18 (promo propagation to spawned forwarder) crosses the shop/import boundary. Whoever picks up the promo-engine port (#26 in current backlog) should bundle this.
6. **`shops.php` `addOrder` race on `hNo`** — `SELECT MAX(id)+1 → "P"+id`. Legacy PHP race-rare under single-customer flow; Pacred mirrors this in `actions/cart.ts` L258-268 (flagged as "single-customer race-rare; DB sequence is proper long-term fix"). Worth a Postgres sequence migration before launch traffic ramps.
7. **`saveHistory()` audit logs** — legacy `pcs-admin/shops.php` calls `saveHistory($sql, 27/28/29/30/...)` after each UPDATE (types 27-30 = shop-order events). Pacred's `tb_history` is loaded but the equivalent audit insert on customer-facing mutations (cart.ts + service-order.ts) is missing. Data-completeness for forensics — losing audit-trail for new orders.
8. **`shopping-return.php` LEFT JOIN tb_wallet** — refund flow reads `tb_wallet.walletTotal` to check balance. Pacred wallet balance lives in `wallet.balance` (rebuilt) AND `tb_wallet.walletTotal` (legacy). The legacy table for migrated customers is the source of truth. Any refund port must use `tb_wallet` not `wallet`.
9. **Cart-form action="" / name="addCartURL"** — even after the gap is fixed, the form is currently using the legacy PHP-style submit pattern (form action + named submit button). Pacred should switch to `onClick` Server Action invocation per Next.js 16 patterns. Currently this surface is dead code.
10. **Search log INSERT side-effect** (`tb_history_key`) — per `app/[locale]/(protected)/search/page.tsx` L268-277 FLAGGED note, the legacy `search.php` L370-372 INSERT was deliberately deferred. Adopting it as a Server Action mutation would close that data-quality gap; low priority.

---

## 6. Files referenced (absolute paths · for follow-up sessions)

**Legacy SOT:**
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\shops.php` (1942 LOC · ~28 POST handlers)
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\cart.php` (870 LOC · 3 addCart variants)
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\shopping-return.php` (38 LOC dispatcher) + `include/pages/shopping-return/{add,detail,home}.php`
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\include\pages\shops\{detail,update,cancelOrder,deleteItem,deleteOrder,editIPC,loadForm,repayItem,updateLock}.php` (13 files · 2614 LOC total)
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\include\pages\shops\update\{update1,update3,update4,update5}.php` (893 LOC)
- `D:\REALSHITDATAPCS\pcsc\public_html\member\include\pages\{cart,shops,search}\*.php` (customer-side AJAX endpoints)

**Pacred under audit:**
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\actions\cart.ts` (1186 LOC — read/write split: tb_cart functions L60-499 + cart_items functions L501-1186)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\actions\service-order.ts` (1041 LOC — mostly correct reads + WRONG-TABLE writes)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\actions\admin\service-orders.ts` (381 LOC — all writes target empty service_orders)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\actions\admin\service-orders-spawn.ts` (373 LOC — CORRECT Wave 21 port to tb_forwarder)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\actions\admin\cart.ts` (588 LOC — admin cart-on-behalf-of-user)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\actions\admin\shop-payouts.ts` (113 LOC — different feature, NOT refund)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(protected)\cart\page.tsx` (769 LOC — reads tb_cart)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(protected)\service-order\cart\page.tsx` (~85 LOC — reads cart_items via listCart())
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(protected)\service-order\add\link-paste-search.tsx` (~250 LOC — writes cart_items)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(protected)\service-order\page.tsx` (638 LOC — list reads tb_header_order)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(protected)\service-order\[hNo]\page.tsx` (286 LOC — detail reads tb_header_order)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(protected)\search\page.tsx` (870 LOC — MODE A SKU grid · form action="" broken)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\page.tsx` (~330 LOC — list)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\[hNo]\page.tsx` (240 LOC — detail with legacy fallback)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\[hNo]\legacy-view.tsx` (~200 LOC — read-only legacy tb_header_order render)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\[hNo]\update-form.tsx` (~150 LOC — only status + note, no per-tab workflow)

---

**End of audit.** Recommended next-session entry: pivot Server Actions #3, #5, #6 to `tb_header_order` (closes 21,950-order revenue blocker in single wave) then loop back for refund-port (#8) + 5-tab workflow (#9) in Wave 32.
