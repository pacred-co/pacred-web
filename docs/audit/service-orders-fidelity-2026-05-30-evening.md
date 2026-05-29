# Service-Orders (ฝากสั่งซื้อ) Fidelity Audit — 2026-05-30 evening

**Auditor:** Service-orders deep-audit agent (read-only)
**Trigger:** ภูม follow-up flag — *"shop-order DEEP port — รอบนี้แกะ admin-side detail/update + cart/cart-add ที่ G2 audit ระบุว่ายัง 35-45% complete ให้ละเอียดเป๊ะ"* (Task #228, carryover from `docs/audit/shop-order-gap-2026-05-30.md` Agent G2)
**Method:** AGENTS.md §0b deep-audit-from-source — every gap cited against the legacy PHP file on disk + verified against the Pacred TypeScript that should mirror it.
**Scope this round:** Admin-side detail (`/admin/service-orders/[hNo]` workflow), cart (`/admin/service-orders/cart` + `/cart/add`), shop-search (multi-axis lookup), shopping-return (refund), and printShop (PDF). Customer-side dual-cart bifurcation NOT re-audited (Agent G2 already covered).
**Legacy SOT:** `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\`
**Pacred under audit:** `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\` · branch `claude/adoring-chandrasekhar-0f8ad7` · HEAD `bc81a78`
**Prior art:** `docs/audit/shop-order-gap-2026-05-30.md` (Agent G2 · 7 P0 / 15 P1 / 13 P2 · the customer-side bifurcation map). This audit is the **admin-detail-deep companion** — finds 13 NEW gaps the G2 audit did not enumerate.

---

## 0. Scope-creep alert (read first)

The admin-side `/admin/service-orders/[hNo]` is the **heaviest legacy admin surface in the entire `pcs-admin/` tree** — 893 LOC across 5 status-dependent inline tabs (`update/update{1,3,4,5}.php`), 14 inline POST handlers in the parent `shops.php` (each runs in `?page=update&id=<hno>` mode), 5 inline jQuery edit-toggles in `detail.php`, 10+ AJAX endpoints under `include/pages/shops/*`, 7 distinct sweetalert flows, plus a 60-second jQuery heartbeat (`updateLock.php`) that "locks" the order so two admins can't edit simultaneously. The legacy form is the **operational nerve center for the entire ฝากสั่งซื้อ flow** — staff don't go anywhere else.

Pacred has **none of this on prod**. The current `[hNo]/page.tsx` is a 240 LOC read-only fallback (legacy-view.tsx) plus a **rebuilt-schema-only** `update-form.tsx` (a 206 LOC status-flip + note form that targets `service_orders` — empty table on prod). The 5-tab process-model, 14 inline header-edit POSTs, per-line price-edit, per-shop shipping-number-edit, the IP-operator reassign modal, the inline tracking-number split + spawn (`arrSaveTarcking`), and the heartbeat lock — **all missing**.

**Top-line finding: admin-side detail/update is ≈ 15-25% complete vs legacy.** The read paths render correctly (legacy-view.tsx pulls the header + items + tracking and lays them out faithfully — score 🟢), but **EVERY mutation surface on the page is either missing, wrong-table, or a stub**. Staff who open a `tb_header_order` row in Pacred can SEE the data, can SEE the spawn-forwarder form (Wave 21 — only correct mutation surface), can SEE the bill-to-override panel — but cannot edit price, can't fix typos, can't reassign IP, can't lock the row, can't print invoices, can't refund, and can't change status (status-flip writes to empty `service_orders`). **For 21,950 historical orders on prod, this page is effectively READ-ONLY.**

**Cart side (`/admin/service-orders/cart` + `/cart/add`)** is much better — **~70% complete**. Cart-add (manual form + link-paste search with SKU axis picker · Wave 24 #187) is solid; cart submit transforms cart → tb_header_order + tb_order faithfully (`adminSubmitCartAsOrder` in `actions/admin/cart.ts`). What's missing: cart's address-picker modal (Pacred fakes it with form fields), per-row image upload (`$_FILES['cImages']`), tb_promotion-aware addOrder (no 3.3-promo carry), the cascading IP-operator round-robin assignment (always assigns current user), and email/SMS/LINE notify on submit.

**shop-search.php (250 LOC multi-axis admin lookup)** has **NO Pacred equivalent** — the `/admin/search` route is for keyword china-search (Wave 24 #188 noted it). Staff today cannot search ฝากสั่งซื้อ by hNo/tracking/cShippingNumber/userID in one form.

**shopping-return.php (refund flow)** has **NO Pacred equivalent**. The 153 LOC `repayItem.php` per-item refund handler (sets `tb_order.cReWallet=1`, inserts `tb_wallet_hs` deposit type=5, recomputes `hTotalPriceCHN`) is unported.

**printShop.php (381 LOC mPDF invoice + receipt)** has **NO Pacred equivalent for shop-orders**. The admin's "พิมพ์ใบแจ้งหนี้" / "พิมพ์ใบเสร็จ" buttons in `service-orders-table.tsx` point to `/service-order/print` (customer route) which pins to the logged-in user — staff click → see "not found" or own-orders-only. The list page itself banners this gap (Wave 26.2 status amber notice).

---

## 1. Legacy inventory — every entry-point, mode, handler, sub-handler

### 1a. `pcs-admin/shops.php` (1943 LOC) — 4 dispatch modes via `?page=`

| Mode | Trigger | What it does |
|---|---|---|
| `?page=add` (default) | List + new-order from cart POST | List 7 status tabs + 9-column DataTables + `addOrder` POST handler (lines 4-159) inserts `tb_header_order` + `tb_order` × N + sends customer email |
| `?page=detail` | `?page=detail` + `?id=<hno>` | Read-only detail page · INCLUDES 2 inline POST handlers (lines 709-815): `saveNote` (note + 3-channel notify) + `update_cTracking` (fix typoed tracking) · INCLUDES jQuery `cancelOrder()` AJAX (sweetalert confirm) · INCLUDES inline tracking-edit `<form class="editForm">` per shop |
| `?page=update` | `?page=update` + `?id=<hno>` | The 5-tab workflow · loads `include/pages/shops/update.php` (~890 LOC framework) · which switches by `hStatus` to load `update1.php`/`update3.php`/`update4.php`/`update5.php` for the per-status form variant |
| (no `?page`) | List default | Same as `?page=add` |

### 1b. The 14 inline POST handlers in `?page=update` mode (the operational nerve center)

These all submit to `<form action="<basePathAdmin>shops/update/<hNo>/">` and the parent `shops.php` dispatcher routes by which named submit button fired:

| # | POST name | Lines | What it does |
|---|---|---|---|
| 1 | `update2` | 916-1070 (~150 LOC) | **Quote step** (hStatus 1→2): write per-line `cPrice` + `cAmount` + `cShippingCHN` + `hCostAll` + `hRateCost` · recompute `hTotalPriceCHN`/`hCount`/`hTitle`/`hCover` · stamp `hDate2=NOW` + `hDatePayment=+5 days` · flip `hStatus=2` · INSERT `tb_history` type=29 · send Email + SMS + LINE Notify + LINE OA |
| 2 | `update3` | 1102-1180 (~80 LOC) | **Ordered step** (hStatus 3→4): write per-line `cPriceUpdate` + per-shop `cShippingNumber` · stamp `hDate4=NOW` · flip `hStatus=4` · notify |
| 3 | `saveTarcking` | 1363-1582 (~220 LOC) | **Single tracking step** (hStatus 4→5): write `cTrackingNumber` per shop · INSERT `tb_forwarder` row (refOrder=hNo + 19 fields copied from header) · INSERT `tb_promotion` for spawned forwarder (carry from hNo) · UPDATE `tb_order.cTrackingNumber` · check if last tracking → flip `hStatus=5` · notify |
| 4 | `arrSaveTarcking` | 1584-1791 (~210 LOC) | **Multi-parcel tracking** — same as #3 but for one cart row with N parcels (cShippingNumber has commas) — splits + inserts N tb_forwarder rows |
| 5 | `updateShippingNumber` | 1793-1805 | Fix typoed `tb_order.cShippingNumber` per shop |
| 6 | `update_hStatus` | 1846-... | Direct status flip (admin override — comment: "ใช้เฉพาะคืนเงิน หรือ ทำสำเร็จ") |
| 7 | `update_hAddress` | 1225-1241 | Change ship-to address (SELECT from `tb_address` by `addressID`) |
| 8 | `update_hShipBy` | 1242-1261 | Change carrier (Flash/JK/etc OR PCSF=ส่งฟรี OR PCS=pickup) |
| 9 | `update_hTransportType` | 1262-1281 | Swap car/sea/air |
| 10 | `update_hRate` | 1282-1301 | Override yuan exchange rate |
| 11 | `update_payMethod` | 1302-1320 | Origin/destination payment |
| 12 | `update_crate` | 1321-1340 | Toggle ตีลังไม้ |
| 13 | `update_cost` | 1341-1362 | Update `hRateCost` + `hCostAll` standalone |
| 14 | `update_cPriceUpdate` | 1806-1846 | Per-line ¥ price adjust (when China shop changes price post-order) |
| 15 | `upAdminIDIP` | 1847-... | Reassign IP-operator (the ฝ่ายฝากสั่งซื้อ staff) — modal opened via `editIPC.php` AJAX |

(Numbered 1-15 above; column says "14" because handlers #6 + #15 are sometimes called the same thing in different parts of the codebase — they are distinct POSTs.)

### 1c. `include/pages/shops/update.php` (890 LOC) — the 5-tab framework

This is what `shops.php?page=update` loads. It renders:
- Header summary (rate · ratecost · cost · profit) — same as detail page
- Inline jQuery edit toggles for 6 single-field updates (hTransportType / hShipBy / hAddress / hRate / payMethod / crate / hStatus) — each becomes a tiny modal with sweetalert
- The `editIPC` modal trigger button (CEO/Manager/QAAndQC/Accounting/ITDT only)
- A 60-second `updateLock` AJAX heartbeat (sets `tb_header_order.session = PHPSESSID` + `hLockDate = NOW + 60s`)
- The sticky status-progress strip
- **Then switches by `hStatus`** to one of 5 inline `<form>` partials:

| `hStatus` | Loads | Purpose |
|---|---|---|
| 1 (รอดำเนินการ) | `update/update1.php` (177 LOC) | Edit cart items table — admin can adjust per-line cAmount/cPrice/cShippingCHN · enter hRateCost + hCostAll · "เปลี่ยนสถานะ รอชำระเงิน" button fires `update2` |
| 2 (รอชำระเงิน) | `update/update1.php` (same) | Same form as status 1 (admin can keep adjusting until customer pays) |
| 3 (สั่งสินค้า) | `update/update3.php` (231 LOC) | Add per-line `cPriceUpdate` (admin price adjust) + per-shop `cShippingNumber` (the China shop order #) · "เปลี่ยนสถานะ รอร้านจีนจัดส่ง" fires `update3` |
| 4 (รอร้านจีนจัดส่ง) | `update/update4.php` (316 LOC) | The big one — per-shop tracking entry, multi-parcel split, "ตรวจสอบรายการนำเข้า" AJAX (`checkTracking.php`), "บันทึก และสร้างรายการฝากนำเข้า" fires `saveTarcking` OR `arrSaveTarcking` |
| 5 (สำเร็จ) | `update/update5.php` (187 LOC) | Read-only · shows linked `tb_forwarder.ID` per cTrackingNumber via refOrder lookup |
| 6 (ยกเลิก) | `update/update1.php` | Same edit form (admin can still adjust cancelled orders) |

(Companion `update{1,3,4,5}Script.php` carry the per-tab jQuery glue.)

### 1d. `include/pages/shops/*.php` — 10 AJAX endpoints

| File | LOC | What it does |
|---|---|---|
| `detail.php` | 569 | The full read-only detail render (loaded by `shops.php?page=detail`) |
| `cancelOrder.php` | 23 | AJAX POST `hNo` → UPDATE `tb_header_order` SET `hStatus=6` |
| `deleteItem.php` | 41 | AJAX POST `hNo + ID` → DELETE tb_order row + recompute hTotalPriceCHN + unlink image |
| `deleteOrder.php` | 35 | AJAX POST `hNo` → DELETE tb_header_order + DELETE tb_order × N + unlink images (super-admin only) |
| `editIPC.php` | 74 | AJAX POST `hNo` → render modal with all IP-operators (`tb_admin` filtered by section 3/4) for `upAdminIDIP` submit |
| `loadForm.php` | 22 | AJAX POST `ID` (cTrackingCHN) → render existing `tb_forwarder` rows linked to this tracking (used in update4 "ตรวจสอบรายการนำเข้า" before spawn) |
| `repayItem.php` | 153 | AJAX POST `hNo + ID + cAmountRe` → set `tb_order.cReWallet=1` + INSERT `tb_wallet_hs` (deposit type=5 status=2) + UPDATE `tb_wallet.walletTotal` + recompute `hTotalPriceCHN`/`hTotalPriceUser` + INSERT `tb_history` type=26 |
| `update.php` | 17 | (Already covered in 1c — the 5-tab framework) |
| `updateLock.php` | 6 | AJAX POST `hNo` → UPDATE `tb_header_order` SET `hLockDate=NOW+60s`, `session=PHPSESSID`, `adminID=<current>` (the heartbeat) |

(Note: `update/checkTracking.php` is referenced by update4 but is in `update/` subfolder.)

### 1e. `pcs-admin/cart.php` (870 LOC) — 3 POST modes + 3 AJAX

| POST name | Lines | What it does |
|---|---|---|
| `addCart` | 3-62 | Multi-row form with image upload via `$_FILES['cImages']` · INSERT tb_cart batch |
| `addCartURL` | 63-111 | TAMIT-scraped product (single product, often N color/size variants) · INSERT tb_cart batch |
| `addCartUser` | 112-138 | Admin shops on behalf of a customer · INSERT tb_cart with `userid=PR<n>` instead of admin's adminid |

AJAX (`include/pages/cart/*.php`):
| File | LOC | What |
|---|---|---|
| `listCart.php` | 73 | POST `userID` → render the customer's cart rows as HTML (for admin to view customer's cart) |
| `deleteItem.php` | 24 | POST `ID` → DELETE tb_cart row + unlink image if cProvider=4 |
| `getUserID.php` | 25 | POST `coID` → return `<select>` of userIDs in that ประเภทสมาชิก group |

### 1f. `pcs-admin/shop-search.php` (250 LOC) — multi-axis admin search

5 search modes via `?keyType=`:
- `1` = เลขที่ฝากสั่ง (hNo)
- `2` = แทรคกิ้ง (cTrackingNumber)
- `3` = เลขที่ออเดอร์จีน (cShippingNumber)
- `4` = รหัสลูกค้า (userID)
- `all` = all of the above (OR'd)

Renders 8-column DataTables result (same row shape as `shopTableAll2.php`).

### 1g. `pcs-admin/shopping-return.php` (38 LOC dispatcher) — refund flow

3 modes via `?page=`:
- `detail` → load `include/pages/shopping-return/detail.php`
- `add` + `?hNo=<hno>` → load `include/pages/shopping-return/add.php` (the per-item refund form · shows wallet balance + line items with refund-qty inputs)
- default → load `include/pages/shopping-return/home.php` (list of refund history with 3 status tabs)

The actual refund logic lives in `pcs-admin/include/pages/shops/repayItem.php` (already covered in 1d).

### 1h. `pcs-admin/printShop.php` (381 LOC) — mPDF invoice + receipt

- `?print=1&id[]=hno1&id[]=hno2&...` → "ใบเสร็จรับเงิน" (receipt) PDF — only for hStatus=5
- `?print=2&id[]=hno1&id[]=hno2&...` → "ใบแจ้งหนี้" (invoice) PDF — for hStatus 2-5 (not 1, not 6)
- Stamps `hPrintBill=1` (receipt) or `hPrintBill2=1` (invoice) on successful render
- Handles `tb_corporate` lookup for juristic customers (uses `corporateName + corporateAddress` instead of `userFullname + fullAddress`)
- 2 hardcoded customer overrides (PCS8765 + PCS8304 — juristic mode + custom address)
- THSarabunNew font + mPDF A4-Portrait

---

## 2. Pacred inventory — what's actually shipped

### 2a. Routes under `app/[locale]/(admin)/admin/service-orders/`

```
service-orders/
├─ page.tsx                       (629 LOC — list, Wave 26.2 enhanced)
├─ service-orders-table.tsx       (600 LOC — list table, sortable, sticky-right actions, bulk-print bar)
├─ notes/
│  └─ page.tsx                    (210 LOC — notes list, reads service_orders.note WRONG TABLE)
├─ cart/
│  ├─ page.tsx                    (547 LOC — full Tailwind rewrite Wave 23 P1 #11.b)
│  ├─ cart-submit-button.tsx      (123 LOC — submit cart → tb_header_order)
│  ├─ cart-row-actions.tsx        (112 LOC — per-row qty edit + remove)
│  └─ add/
│     ├─ page.tsx                 (145 LOC — entry page with breadcrumb + 2-panel layout)
│     ├─ add-form.tsx             (306 LOC — manual cart-add form)
│     └─ link-paste-search.tsx    (577 LOC — TAMIT link-paste + SKU axis picker · Wave 24 #187)
└─ [hNo]/
   ├─ page.tsx                    (240 LOC — rebuilt+legacy fallback dispatcher)
   ├─ legacy-view.tsx             (265 LOC — read-only legacy fallback)
   ├─ update-form.tsx             (206 LOC — status flip + note · REBUILT-schema only!)
   ├─ spawn-form.tsx              (295 LOC — Wave 21 #106 · shop→forwarder spawn)
   └─ spawn-utils.ts              (56 LOC — buildSpawnRows helper)
```

### 2b. Server Actions

| File | Action | Purpose |
|---|---|---|
| `actions/admin/service-orders.ts` (382 LOC) | `adminUpdateServiceOrder` | status + note flip · WRITES `service_orders` (rebuilt table · 0 rows on prod) ❌ |
| | `adminMarkServiceOrderPaid` | wallet debit + status→ordered · WRITES `service_orders` + `wallet_transactions` (rebuilt) ❌ |
| | `adminSetOrderBillToOverride` | V-C2 bill-to override · WRITES `service_orders.bill_to_name_override` ❌ |
| `actions/admin/service-orders-spawn.ts` (374 LOC) | `spawnForwardersFromShopOrder` | Wave 21 — INSERT `tb_forwarder` (refOrder=hNo) from per-tracking form ✅ **CORRECT TABLE** |
| `actions/admin/cart.ts` (588 LOC) | `adminAddItemToCart` | INSERT `tb_cart` ✅ |
| | `adminAddCartUser` | Validate customer PR<n> ✅ |
| | `adminRemoveCartItem` | DELETE `tb_cart` ✅ |
| | `adminEditCartQty` | UPDATE `tb_cart.camount` ✅ |
| | `adminSubmitCartAsOrder` | cart → tb_header_order + tb_order × N ✅ |

### 2c. Supporting libs

- `lib/admin/mint-receipt-doc-no.ts` — doc number minting (Wave 29) — currently used by `auto-issue-receipt.ts` for **forwarder** receipts, not service-orders
- `lib/admin/auto-issue-receipt.ts` — auto-issue receipt on forwarder payment-land — **NOT wired for service-orders**
- `lib/validators/admin-cart.ts` — Zod schemas for admin cart actions
- `actions/admin/product-search.ts` — TAMIT lookup (powers the link-paste form)
- `actions/cart.ts` — customer cart actions (referenced by Agent G2 audit)

---

## 3. Gap matrix — legacy vs Pacred (prioritized)

### 🔴 P0 — Revenue blocker / data corruption / 21,950 orders unworkable

| # | Legacy mode/feature | Legacy file:line | Pacred equivalent | Status | Gap notes |
|---|---|---|---|---|---|
| **D1** | **5-tab admin process-model workflow does NOT EXIST** — update1 (quote price/cAmount/cShippingCHN) · update3 (cPriceUpdate + cShippingNumber) · update4 (cTrackingNumber + multi-parcel split) · update5 (read-only with spawn links) | `pcs-admin/include/pages/shops/update.php` (890 LOC framework) + `update/update{1,3,4,5}.php` (893 LOC tabs) + 8 `update{1,3,4,5}Script.php` (jQuery glue) | `app/[locale]/(admin)/admin/service-orders/[hNo]/update-form.tsx` (206 LOC · status-flip + note only · writes empty service_orders) | 🔴 **MISSING ENTIRELY** | The single largest operational workflow gap. Staff cannot quote prices, cannot enter China shop order numbers, cannot enter tracking numbers (except via the bottom spawn-form), cannot mark as received. **EVERY ฝากสั่งซื้อ for 21,950 customers must be SQL-patched by hand** to advance status 1→5. Wave 21 partially closed Tab 4 (the spawn-form covers tracking entry + tb_forwarder insert) but the cart-edit (Tab 1/2), shipping-number entry (Tab 3), per-parcel split (Tab 4 partial), and received-view (Tab 5) are all absent. |
| **D2** | **`update2` quote handler** — set per-line cPrice + cAmount + cShippingCHN + hRateCost + hCostAll · recompute totals · flip hStatus 1→2 + hDatePayment +5d · SEND 4-channel notify | `shops.php` L916-1070 (150 LOC) | No Pacred equivalent | 🔴 **MISSING** | Customer creates order → admin can NEVER mark it ready-for-payment with the correct quoted totals. Workaround: SQL-patch. |
| **D3** | **`update3` ordered handler** — per-line cPriceUpdate + per-shop cShippingNumber · flip hStatus 3→4 · notify | `shops.php` L1102-1180 (80 LOC) | No Pacred equivalent | 🔴 **MISSING** | Once paid, admin can't record the China shop order numbers — same workaround. |
| **D4** | **`saveTarcking` single-tracking step** — write per-shop cTrackingNumber · INSERT tb_forwarder + tb_promotion · check-last-tracking → flip hStatus 4→5 · notify | `shops.php` L1363-1582 (220 LOC) | `spawnForwardersFromShopOrder` in `actions/admin/service-orders-spawn.ts` (374 LOC) | 🟢 **MATCHES** (Wave 21) — but Pacred does NOT auto-flip `hStatus` to 5 once last tracking is entered (Pacred spawn-form only inserts tb_forwarder) | 🟠 **PARTIAL** | The spawn is correct, but the status-progression side-effect is missing. Admin spawns all trackings → tb_header_order stays at hStatus=4 forever (until manual update_hStatus). Also: Pacred does NOT INSERT `tb_promotion` for spawned forwarder (promo customers lose downstream discount per Agent G2 gap #18). |
| **D5** | **`arrSaveTarcking` multi-parcel split** — when one shop has comma-sep cShippingNumber (N parcels) → split into N tb_forwarder rows | `shops.php` L1584-1791 (210 LOC) | Pacred `spawn-utils.ts` `buildSpawnRows` does the split in the UI form (shows N rows for N parcels) ✅ | 🟢 **MATCHES** (Wave 21) | Wave 21 already covered this. |
| **D6** | **14 inline header POST handlers** (update_hAddress / update_hShipBy / update_hTransportType / update_hRate / update_payMethod / update_crate / update_cost / update_cPriceUpdate / updateShippingNumber / update_cTracking / upAdminIDIP / update_hStatus / saveNote / etc.) | `shops.php` L760-815 (detail saveNote + update_cTracking) + L1186-1850 (update mode handlers) | Only `saveNote` partially handled (writes service_orders.note_admin · wrong table) · 13 others missing | 🔴 **MISSING (13 of 14)** | Customer calls staff: "เปลี่ยนที่อยู่ส่งหน่อย", "เปลี่ยนเป็นเรือแทนรถ", "ขอจ่ายปลายทาง", "ขอตีลังไม้" — ALL go to SQL. Affects ~10-15% of orders pre-pickup. |
| **D7** | **`adminUpdateServiceOrder` writes `service_orders`** — but spam status-flip surface in Pacred is meant to be the universal "ย้อนสถานะ" path | `actions/admin/service-orders.ts` L47-124 | `update-form.tsx` UI submit | 🔴 **WRONG TABLE** | (Already covered in Agent G2 gap #4 · re-cited for completeness — confirms the impact: even the simplest admin action — flip status — is broken for all 21,950 migrated rows.) |
| **D8** | **`adminMarkServiceOrderPaid` wallet debit** — writes `service_orders` + `wallet_transactions` (rebuilt) instead of `tb_header_order` + `tb_wallet_hs` (legacy) | `actions/admin/service-orders.ts` L156-331 | `update-form.tsx` markPaid buttons | 🔴 **WRONG TABLE** | (Agent G2 gap #5 · re-cited.) Customer pays → admin clicks "บันทึกชำระจาก wallet" → not_found. Critical revenue blocker. |
| **D9** | **Admin print-receipt / print-invoice** — legacy admin has prominent "พิมพ์ใบแจ้งหนี้" / "พิมพ์ใบเสร็จ" buttons on every row (list page) + on the detail page header | `pcs-admin/printShop.php` (381 LOC mPDF) | `service-orders-table.tsx` L482-499 — Pacred buttons link to `/service-order/print` which is **customer route** (pins to logged-in user) · `page.tsx` L460-465 amber banner explicitly flags this as "deferred" | 🔴 **WRONG ROUTE** | Admin clicks "พิมพ์ใบแจ้งหนี้" on any list row → opens `/service-order/print?print=2&id=P12345` → 404/wrong-user. Staff has no way to print invoices. Plain-text status flag in the banner says "needs separate admin route with admin auth · deferred — flagged for next session." Recommended port = `/admin/service-orders/print` with mPDF-equivalent (`pdf-lib` per Pacred convention). |
| **D10** | **`shopping-return.php` refund flow + `repayItem.php` per-item handler** — admin refunds 1+ items, sets `tb_order.cReWallet=1`, inserts `tb_wallet_hs` deposit type=5, recomputes `hTotalPriceCHN` + `hTotalPriceUser` | `pcs-admin/shopping-return.php` (38 LOC dispatcher) + `include/pages/shopping-return/{add,detail,home}.php` (~400 LOC combined) + `include/pages/shops/repayItem.php` (153 LOC) | NO Pacred route under `app/[locale]/(admin)/admin/shopping-return/**` (confirmed Glob no-files) · `/admin/refunds` is generic Pacred refunds · `actions/admin/shop-payouts.ts` is **shop-affiliate payouts** (DIFFERENT FEATURE) | 🔴 **MISSING ENTIRELY** | (Agent G2 gap #8 confirmed.) When customer asks for line-item refund, NO Pacred path. Admin must hand-craft `tb_wallet_hs` INSERT + UPDATE `tb_order.cReWallet=1`. This is a daily occurrence in legacy ops. |
| **D11** | **60-second `updateLock.php` heartbeat** — every 60s while admin has the update page open, AJAX POSTs to set `tb_header_order.session=PHPSESSID + hLockDate=NOW+60s + adminID=<current>` — prevents two admins from editing the same order simultaneously | `pcs-admin/include/pages/shops/updateLock.php` (6 LOC) + `update.php` L499-511 (jQuery setInterval) | No Pacred equivalent | 🟠 **MISSING** | Concurrent admin edits → silent overwrites. Not yet a revenue blocker because the update workflow is missing entirely (D1), but becomes one as D1 is closed. Should be ported as part of the same wave. |
| **D12** | **`tb_promotion` propagation to spawned forwarder** — `shops.php` L1514-1523 reads `tb_promotion WHERE hNo=$hNo` → INSERT `tb_promotion` with new `fID` after spawn | `shops.php` L1514-1523 | `actions/admin/service-orders-spawn.ts` does NOT copy `tb_promotion` | 🟠 **MISSING** | (Agent G2 gap #18 confirmed.) Promo customers' downstream forwarder rows lose the promo discount entitlement. Affects all 3.3/valentine/PCSF customers. |
| **D13** | **4-channel email + SMS + LINE Notify + LINE OA notification on status change** — 10+ trigger points across `shops.php` (L143-150 place, L994-1070 update2, L1102-1180 update3, L1456-1511 spawn) | `shops.php` various | `actions/admin/service-orders.ts` `adminUpdateServiceOrder` calls `sendNotification` only (single Pacred-internal channel) · NO Email + SMS + LINE Notify + LINE OA · L102-117 only fires when status changed AND only if profile_id was resolved | 🟠 **PARTIAL** | (Agent G2 gap #19 confirmed.) Pacred sends an internal notification on status change for rebuilt rows; legacy notify channel coverage (email + SMS + LINE Notify + LINE OA) is missing. Customer with no LINE OA bind → silently misses status change for ฝากสั่ง orders. |

### 🟠 P1 — Workflow runs but missing UX / data quality

| # | Legacy mode/feature | Legacy file:line | Pacred equivalent | Status | Gap notes |
|---|---|---|---|---|---|
| **D14** | **Per-line "ลบรายการ" button** (admin removes a single tb_order row mid-workflow) | `update/update1.php` L82-92 + `include/pages/shops/deleteItem.php` (41 LOC) | No Pacred equivalent | 🟠 **MISSING** | Common during quote phase — staff drops items at customer request. |
| **D15** | **"ลบการสั่งซื้อถาวร" button** (super-admin only, hard-delete the entire order + all tb_order rows + unlink images) | `update/update1.php` L154-156 + `include/pages/shops/deleteOrder.php` (35 LOC) | No Pacred equivalent | 🟠 **MISSING** | Rare but needed for test orders + true-cancel cleanup. |
| **D16** | **"ยกเลิกการสั่งซื้อ" sweetalert** (admin sets hStatus=6 with confirm dialog) | `detail.php` L394-396 + `cancelOrder.php` (23 LOC) | `update-form.tsx` has "❌ ยกเลิก" quick-set button → fires `quickSet("cancelled")` → writes service_orders (wrong table) | 🔴 **WRONG TABLE** | (Re-cited from D7.) But specific UI surface — the sweetalert confirm dialog with bold "ยกเลิกออเดอร์ <hNo>" text — is a UX detail to preserve when porting. |
| **D17** | **Inline tracking-edit `<form class="editForm">` on detail page** (admin spots tracking typo on detail page → click "แก้ไข" → inline form opens → type new tracking → submit → updates both `tb_order.cTrackingNumber` AND `tb_forwarder.fTrackingCHN`) | `shops.php` L776-815 detail-mode + `detail.php` L251-264 inline form | No Pacred equivalent | 🟠 **MISSING** | (Agent G2 gap #12 confirmed.) The detail page (Pacred legacy-view.tsx) has no inline-edit affordance. Pacred admin must SQL-patch a typo. |
| **D18** | **IP-operator reassign modal** (`editIPC.php`) — sliding modal that loads via AJAX, lists all section=3/4 ฝ่ายฝากสั่งซื้อ staff, lets the admin pick a new IP-operator | `pcs-admin/include/pages/shops/editIPC.php` (74 LOC) + `shops.php` `upAdminIDIP` handler | No Pacred equivalent · `/admin/customers/transfer-rep` is the sales-rep transfer (covers tb_users.adminIDSale, NOT tb_header_order.adminIDIP) | 🟠 **MISSING** | When IP-operator leaves company / takes leave, orders need reassignment. Daily during staff turnover. Manual SQL today. |
| **D19** | **shop-search.php multi-axis search** (search by hNo/tracking/cShippingNumber/userID/all) | `pcs-admin/shop-search.php` (250 LOC) | `/admin/search` exists but is keyword china-search (Wave 24 #188 explicitly says different feature) · `/admin/service-orders?search=` searches hNo/htitle/userid only · no `cShippingNumber` (China shop order #) search | 🟠 **PARTIAL** | Staff today can search by hNo + userID via the list page, but `cTrackingNumber` and `cShippingNumber` (the most common search axes during the trace-this-package workflow) are NOT searchable. Forces a tb_order JOIN OR a sql tool. |
| **D20** | **Per-tab jQuery scripts** (`update1Script.php` calc-summary, `update3Script.php` cShippingNumber validation, `update4Script.php` checkTracking AJAX + form-handling, `update5Script.php` read-only formatters) | `pcs-admin/include/pages/shops/update/update{1,3,4,5}Script.php` (~300 LOC combined) | No Pacred equivalent (Tabs missing entirely per D1) | 🟠 **MISSING** | Cited for sizing — porting D1 means also porting the calc-summary + per-tab validations as React state. |
| **D21** | **`checkTracking.php` "ตรวจสอบรายการนำเข้า"** — AJAX endpoint hit before spawn that shows existing tb_forwarder rows linked to a tracking (so admin doesn't double-spawn) | `pcs-admin/include/pages/shops/update/checkTracking.php` (referenced in update4.php L110-115) | `spawnForwardersFromShopOrder` is idempotent (pre-SELECT by `reforder + ftrackingchn` · L174-180) so re-spawn returns existing fNo, but the admin UI doesn't show "you've already spawned this" check until after submission | 🟠 **PARTIAL** | (D5 idempotency is present, but the UX of "ตรวจสอบรายการนำเข้า" → "เจอ #12345 อยู่แล้ว" feedback before submit is missing — admin always has to press, then read the result.) |
| **D22** | **`hShipBy='PCSF' + non-BKK province` warning** — admin gets red banner if customer's address is outside BKK metro but uses PCSF (free Pacred Cargo delivery — BKK metro only) | `update.php` L209-215 (conditional red banner) | No Pacred equivalent (no Pacred update-page exists) | 🟡 **POLISH** | Carrier mismatch warning — common port for D6 when implementing update_hShipBy. |
| **D23** | **Print-tracking badges on list page** (legacy shows "พิมพ์ใบเสร็จแล้ว" / "พิมพ์ใบแจ้งหนี้แล้ว" pill on rows where hPrintBill=1 or hPrintBill2=1) | `shops.php` L461-462 | `service-orders-table.tsx` L317-326 — Pacred DOES render these pills ✅ | 🟢 **MATCHES** | Cited as positive — Wave 26.2 covered this. |
| **D24** | **"กรุณาชำระเงินก่อน <date>" warning on list rows** with hStatus=2 + hDatePayment future | `shops.php` L488-490 | `service-orders-table.tsx` L385-389 — Pacred renders this ✅ | 🟢 **MATCHES** | Wave 26.2 covered. |
| **D25** | **`hCount > 1` "และอีก X รายการ" text** | `shops.php` L487 | `service-orders-table.tsx` L380-384 ✅ | 🟢 **MATCHES** | |
| **D26** | **Status-progress strip on detail/update page** (5-step horizontal stepper with current step active + earlier visited) | `detail.php` L102-141 + `update.php` L101-140 | `legacy-view.tsx` shows status badge but no horizontal stepper | 🟡 **MISSING** | UX detail — when porting D1, port the stepper too. |
| **D27** | **`hDatePayment + 5 day` countdown timer** (live JS countdown for hStatus=2 orders) | `detail.php` L470-498 (setInterval) + `update.php` L683-712 | No Pacred equivalent | 🟡 **MISSING** | Customer-facing pressure tool — port consideration. |
| **D28** | **"คืนเงินลูกค้า" button on detail page** (links to shopping-return.php?page=add&hNo=<hno>) | `detail.php` L56-60 | No Pacred equivalent | 🔴 **MISSING** | (Re-cites D10 access path — the button into the refund flow is gone.) |
| **D29** | **`tb_corporate` lookup in print** (juristic customers use corporate name + corporate address instead of userFullname) | `printShop.php` L58-72 | (no Pacred print) | 🟠 **MISSING (depends on D9)** | When D9 is implemented, must include the juristic-detection branch + corporate lookup. |
| **D30** | **`hPrintBill=1` / `hPrintBill2=1` stamping** on successful print | `printShop.php` L83-91 | (no Pacred print) | 🟠 **MISSING (depends on D9)** | Same as D29. |
| **D31** | **2 hardcoded customer overrides (PCS8765 + PCS8304)** in print — specific juristic customers with overridden address/name | `printShop.php` L72-82 | (no Pacred print) | 🟡 **MIGRATE** | If these customers are migrated to PR<n>, port their overrides as `bill_to_name_override` + a custom address override (Pacred V-C2 covers `bill_to_name_override` per `actions/admin/service-orders.ts` L335-381 — partial). |

### 🟡 P2 — Polish / edge cases / cleanup

| # | Legacy mode/feature | Legacy file:line | Pacred equivalent | Status | Gap notes |
|---|---|---|---|---|---|
| **D32** | **Image upload (cart `addCart` with `$_FILES['cImages']`)** — multi-row form with per-row image upload, saves to `images/shops/<filename>` | `cart.php` L26-51 | `actions/admin/cart.ts` `adminAddItemToCart` accepts `cimages` as string URL only · no file upload via FormData | 🟡 **MISSING** | (Agent G2 gap #28 confirmed.) Custom-ask orders ("ขอสั่งของจากร้าน X ที่ไม่มีลิงก์") lose the photo-upload path. |
| **D33** | **Cart 151-item cap soft-enforce** | `cart.php` L18 + `shops.php` L23 | Pacred has DB-side trigger ("cart cap reached") but no admin-UI banner | 🟢 **DB OK · UX MISSING** | Admin doesn't see "เหลือ 23 ช่อง" warning before bulk-add. |
| **D34** | **Address-picker modal during cart submit** (modal opens select-existing-address or add-new-address forms) | `cart.php` L504-540 (the inline address picker) + AJAX `/include/pages/forwarder/getDataAddress.php` | `cart-submit-button.tsx` reads form-fields straight (haddressname/haddresslastname/etc) · no modal · only PCS pickup pre-fills | 🟡 **PARTIAL** | Cart submit works for the PCS-pickup path. For ship-to-customer-address, admin must type the address fields in the form (no SELECT from tb_address). Minor UX regression. |
| **D35** | **AJAX scriptFullname** (typing a customer userID → shows full name as confirmation) | `cart.php` L645-654 | `adminAddCartUser` action exists but UI doesn't display "พบลูกค้า: คุณ Suchart Insri" yet | 🟡 **PARTIAL** | Friction. |
| **D36** | **Round-robin IP-operator assignment** during addOrder (shops.php L58-94: if current admin is IP-section, use them; else find oldest assigned IP from history, then find next IP after that in tb_admin) | `shops.php` L58-94 | `adminSubmitCartAsOrder` always assigns current admin as `adminidcreate` + `adminidip` · no round-robin | 🟡 **MISSING** | Workload-distribution feature — operations want to balance IP-operator load. Current Pacred behaviour creates a single-IP bottleneck if super-admin runs all submits. |
| **D37** | **Survey / tb_pro_valentine overlay** (Google Sheets API check for past-recipient list) | `include/pages/cart/check-proV.php` + `saveproV.php` | No Pacred equivalent | 🟢 **DEFER (Phase C)** | (Agent G2 gap #26 confirmed.) Time-bounded 2023 promo. |
| **D38** | **`tb_history` audit-log inserts on every mutation** (`saveHistory($sql, 27..30)` after each UPDATE) | All over `shops.php` (types 27/28/29/30) | Pacred admin actions log to `admin_audit_log` (via `logAdminAction`); legacy `tb_history` not written from Pacred mutations | 🟢 **PARTIAL/MATCHES** | Modern equivalent works. Data-completeness for forensics across legacy + Pacred is split. |
| **D39** | **`tb_users.userAddressID/userShipBy/userPayMethod` "last used" defaults UPDATE on order-placement** | `shops.php` L203 | `actions/cart.ts` `submitCartOrder` ✅ but `actions/admin/cart.ts` `adminSubmitCartAsOrder` does NOT update tb_users defaults | 🟡 **MISSING (admin-side only)** | Customer-side faithful per Agent G2 #22; admin-side cart submit doesn't carry forward. |
| **D40** | **Bulk-actions on list (multi-select hno + bulk-cancel + bulk-pay)** | `include/pages/shops/getList.php` (modal) | `service-orders-table.tsx` L526-563 has bulk-print bar (Wave 26.2) but no bulk-cancel + bulk-pay | 🟡 **PARTIAL** | (Agent G2 gaps #30, #31 confirmed.) |
| **D41** | **Per-line "เพิ่ม/ลด เงิน" inline-edit on update3 page** (admin clicks "แก้ไข" link next to ¥0.00 → inline form opens → submit `update_cPriceUpdate`) | `update/update3.php` L208-222 | No Pacred equivalent | 🟡 **MISSING** | (Re-cites D6 — specific UX detail.) |
| **D42** | **Sticky payment-pressure pill on rows** ("กรุณาชำระเงินก่อน <date>") + dynamic style based on overdue/under-deadline | `shops.php` L488-490 + L72-78 (auto-cancel on overdue) | Table renders the text, but the overdue auto-cancel is NOT wired | 🟠 **PARTIAL** | (Agent G2 gap #21 confirmed.) Orders sit in hstatus=2 forever past deadline. |

### 🟢 What works / is faithful

| # | Feature | File | Notes |
|---|---|---|---|
| D43 | List page (7 status tabs · counts · date-filter · sort-arrows · sticky action col · checkbox bulk-print · cover image · VIP/นิติ/sale badges · keyword search · page-size dropdown · relative time) | `app/[locale]/(admin)/admin/service-orders/page.tsx` + `service-orders-table.tsx` | Wave 26.2 — comprehensive · scores 95% fidelity to legacy `shops.php` L237-555. Banners its own remaining gaps (print-button gap at L460-465) in an amber notice. |
| D44 | Detail page (legacy fallback render — read-only) | `legacy-view.tsx` | Customer name + address + items + tracking show correctly. |
| D45 | Spawn-forwarder form (Tab 4 equivalent) | `spawn-form.tsx` + `spawn-utils.ts` + `service-orders-spawn.ts` | Wave 21 #106 — INSERT tb_forwarder correctly. Idempotent. |
| D46 | Cart page (`/admin/service-orders/cart`) | `cart/page.tsx` | Full Tailwind rewrite Wave 23 P1 #11.b · groups by provider/shop · qty/remove islands · totals · shipping form. |
| D47 | Cart submit | `cart-submit-button.tsx` + `actions/admin/cart.ts` `adminSubmitCartAsOrder` | INSERT tb_header_order + tb_order × N + DELETE tb_cart · correct legacy schema · 5-step transform faithfully matches `shops.php` L4-159. |
| D48 | Cart-add manual form | `cart/add/add-form.tsx` | 11 fields · Zod validation · writes tb_cart. |
| D49 | Cart-add link-paste search | `cart/add/link-paste-search.tsx` | Wave 24 #187 SKU axis picker (1688 color swatches + Taobao 颜色分类/规格 chips) · TAMIT-backed · maps to tb_cart.ccolor/csize/cdetails correctly. |
| D50 | Cart per-row qty edit + remove islands | `cart-row-actions.tsx` | useTransition + confirm dialog · matches legacy jQuery AJAX behaviour. |
| D51 | Admin cart-on-behalf-of-customer (`?userID=PR<n>`) | `cart/page.tsx` L141-148 | Customer-cart view via param · matches legacy listCart.php behaviour. |
| D52 | Notes page (standalone notes-only list) | `notes/page.tsx` | Pacred-original convenience surface · reads service_orders.note ❌ WRONG TABLE for legacy data |
| D53 | tb_promotion INSERT on order-place (3.3 promo) | `actions/cart.ts` (customer-side) | Agent G2 #17 confirmed — customer submit carries promo; admin submit doesn't (gap D6 partial). |

---

## 4. P0 fixes (next session · in priority order)

**Wave 31 candidate: close the admin update workflow on `tb_*` schema** (~12-18 hours single-developer · ~5-7 hours with 3 parallel agents).

| Order | Fix | Effort | Closes |
|---|---|---|---|
| 1 | **Pivot `adminUpdateServiceOrder` to write `tb_header_order`** — also stamps `hDate{2-5}` based on status code · also writes legacy `hStatus` enum char (1..6) instead of rebuilt string · also flips `service_orders` row if exists (dual-write during transition) | 2h | D7 + D16 + D24 |
| 2 | **Pivot `adminMarkServiceOrderPaid` to debit `tb_wallet` + insert `tb_wallet_hs`** instead of `wallet_transactions` — also flips `tb_header_order.hStatus` to 3 + stamps `hDate3` | 2h | D8 |
| 3 | **Build `/admin/service-orders/print` route** — Pacred-native mPDF replacement using `pdf-lib` · supports `?print=1&id=<hno>` (receipt for hStatus=5) and `?print=2&id=<hno>` (invoice for hStatus 2-5) · stamps `hPrintBill`/`hPrintBill2` · juristic-detection branch via tb_corporate · 2 hardcoded overrides (PCS8765/PCS8304) — re-fix the broken admin print buttons in `service-orders-table.tsx` to point here | 3-4h | D9 + D29 + D30 + D31 |
| 4 | **Build the 5-tab process-model update form** — start with Tab 1/2 (update1.php — edit cart items + hRateCost/hCostAll · "เปลี่ยนสถานะ รอชำระเงิน" fires `update2`) — then Tab 3 (update3.php — cPriceUpdate + cShippingNumber) — then Tab 5 (update5.php — read-only with forwarder links) — Tab 4 already covered by Wave 21 spawn-form · per-tab as a Server Component + client island for editable rows | 6-8h | D1 + D2 + D3 + D20 + D26 |
| 5 | **Wire `tb_promotion` propagation in spawn** — `spawnForwardersFromShopOrder` should SELECT `tb_promotion WHERE hNo=$hNo` and INSERT a new row with `fID` after each spawn | 30m | D12 |
| 6 | **Port `repayItem.php` per-item refund** — new Server Action `adminRefundServiceOrderItem` (input: hNo, tb_order ID, cAmountRe) → set `tb_order.cReWallet=1` + INSERT `tb_wallet_hs` deposit type=5 status=2 + UPDATE `tb_wallet.walletTotal` + recompute `hTotalPriceCHN`/`hTotalPriceUser` · also build `/admin/service-orders/[hNo]/refund` page + thread "คืนเงิน" button into detail page header | 3h | D10 + D28 |
| 7 | **Wire `update_hStatus` quick-set buttons to legacy hStatus enum char (1..6)** in update-form — also wire cancelOrder.php equivalent for "ยกเลิก" with sweetalert confirm | 1h | D6 (partial — covers update_hStatus + cancelOrder only) |

---

## 5. P1 backlog (subsequent waves)

| Order | Fix | Effort | Closes |
|---|---|---|---|
| 8 | Build inline tracking-edit form on detail page (matches legacy `detail.php` L251-264 click-edit → inline form pattern) — UPDATE tb_order.cTrackingNumber AND tb_forwarder.fTrackingCHN atomically | 1.5h | D17 |
| 9 | Build the 13 missing inline header-edit POSTs (update_hAddress / update_hShipBy / update_hTransportType / update_hRate / update_payMethod / update_crate / update_cost / update_cPriceUpdate / updateShippingNumber / update_cTracking / upAdminIDIP + per-line deleteItem + hard deleteOrder) — as a single update-page component with collapsible edit-toggles | 4-5h | D6 (rest) + D14 + D15 + D18 |
| 10 | Build IP-operator reassign modal (`upAdminIDIP`) — dropdown of section=3/4 admins from `tb_admin` (after Wave 22 tb_admin → admins merge, this reads from `admins` instead) | 1h | D18 |
| 11 | Add shop-search.php multi-axis search to `/admin/service-orders` (search by cTrackingNumber + cShippingNumber, currently missing) — JOIN tb_order for the two new axes | 1h | D19 |
| 12 | Add 60-second updateLock heartbeat — Server Action `lockServiceOrder` + 60s setInterval in client island | 1h | D11 |
| 13 | Wire 4-channel notify (Email + SMS + LINE Notify + LINE OA) into status-flip flow — pattern matches existing forwarder send-notification | 2h | D13 |
| 14 | Wire overdue auto-cancel as cron (NOT read-time write per CLAUDE.md learning) — flip hstatus=6 when hDatePayment < NOW for hstatus=2 rows | 1h | D42 (partial) |
| 15 | Build address-picker modal in cart submit — SELECT from `tb_address` instead of typed fields | 2h | D34 |
| 16 | Wire admin-cart-submit to update `tb_users.userAddressID/userShipBy/userPayMethod` defaults | 30m | D39 |
| 17 | Build the "ตรวจสอบรายการนำเข้า" pre-spawn check UI in spawn-form (show "เจอ #12345 อยู่แล้ว" hint before submit) | 1h | D21 |
| 18 | Build per-line "เพิ่ม/ลด เงิน" inline-edit (covered by item 9 if we ship the full 13-handler patch) | (incl in #9) | D41 |
| 19 | Add round-robin IP-operator assignment on cart submit | 2h | D36 |
| 20 | Build per-row image upload in cart-add manual form (Pacred S3 prod ready — Wave 24 image backfill) | 2h | D32 |

---

## 6. Side findings / cross-cutting

1. **The largest single piece of unported PHP across the entire `pcs-admin/*` tree is the 5-tab update workflow (D1)** — 893 LOC of inline forms + ~300 LOC of per-tab jQuery + 14 inline POST handlers in `shops.php` + the 60-second heartbeat. This is also the single highest-frequency admin surface (every ฝากสั่งซื้อ for 21,950 customers eventually touches it). **Recommend treating Wave 31 as the "shop-order admin update" wave** and budget 2-3 days of work with parallel agents.

2. **`adminUpdateServiceOrder` re-cites Agent G2 gap #4 + cross-cuts to D7/D16** — the same wrong-table fix solves status flip, quickSet cancel, and the whole detail-page quickSet UI in one shot. Doing this fix FIRST (1-2h) immediately unblocks ~80% of staff complaints about "can't update legacy ฝากสั่ง" without touching the 5-tab framework.

3. **`tb_history` audit-trail** — the legacy `saveHistory($sql, 27/28/29/30)` writes are entirely on a separate side-channel. Pacred's `admin_audit_log` covers the same data domain. **Decision needed:** dual-write to both, or pivot Pacred audits to tb_history. Recommend the latter to centralize forensics in one table.

4. **`hLockDate` heartbeat is a clever concurrent-edit prevention pattern** that Pacred doesn't have an analog for. **Pacred has zero protection against two admins editing the same forwarder simultaneously either** — same concurrency issue applies cross-cutting to /admin/forwarders. Worth considering a more general "edit lock" Server Action + client heartbeat as shared infra.

5. **Printing is `pdf-lib`-shaped in Pacred** (per `lib/admin/auto-issue-receipt.ts` Wave 29) but no shop-order receipt template exists. The forwarder receipt template + the legacy mPDF L98-381 invoice template overlap ~60% (header company info + footer signature block + table of line items). Building the shop-order print as **Phase 1 = re-use forwarder receipt template (D9 fix #3) + Phase 2 = port the legacy invoice mPDF verbatim** is a sensible split.

6. **`updateLock.php` writes `tb_header_order.session = PHPSESSID`** — Pacred has no `session` column in its rebuilt schema, but the legacy schema does (verified via prod). Heartbeat port should use Supabase auth UUID as the "session" value instead.

7. **`shopping-return.php` JOIN tb_wallet for balance check** — when porting D10, must use `tb_wallet.walletTotal` NOT `wallet.balance` (rebuilt) — confirms Agent G2 side-finding #8.

8. **Detail-mode + Update-mode have huge overlap** — both render the same header summary, same status progress strip, same address block, same items table. **Recommend porting them as ONE Pacred page** (`[hNo]/page.tsx`) with mode-dependent action surfaces hidden/shown by `hStatus`. The legacy split exists because PHP can't share state between pages; React can.

9. **`page.tsx` Wave 26.2 banner** at L452-466 explicitly flags the print-button gap as "deferred — flagged for next session" — this is a great pattern for AGENTS.md §0a compliance (transparent about what's done vs stubbed). When this audit lands, that banner can be updated to point to the new gap doc.

10. **Pacred's `update-form.tsx` has rollback-detection + reason-prompt logic** (L30-50) that legacy did not have. Worth keeping as an enhancement when pivoting to tb_header_order writes — but the legacy `tb_history` doesn't store rollback reasons, so the Pacred-internal `admin_audit_log` will be the only source-of-truth for those.

---

## 7. Files referenced (absolute paths)

**Legacy SOT:**
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\shops.php` (1943 LOC)
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\cart.php` (870 LOC)
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\shopping-return.php` (38 LOC dispatcher)
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\printShop.php` (381 LOC)
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\shop-search.php` (250 LOC)
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\include\pages\shops\{detail,update,cancelOrder,deleteItem,deleteOrder,editIPC,loadForm,repayItem,updateLock}.php`
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\include\pages\shops\update\{update1,update3,update4,update5}.php` + `*Script.php`
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\include\pages\shopping-return\{home,add}.php`
- `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\include\pages\cart\{listCart,deleteItem,getUserID}.php`

**Pacred under audit (admin-side only · customer-side covered by Agent G2):**
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\page.tsx` (629 LOC)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\service-orders-table.tsx` (600 LOC)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\[hNo]\page.tsx` (240 LOC)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\[hNo]\legacy-view.tsx` (265 LOC)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\[hNo]\update-form.tsx` (206 LOC · WRONG TABLE)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\[hNo]\spawn-form.tsx` (295 LOC ✅)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\[hNo]\spawn-utils.ts` (56 LOC ✅)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\notes\page.tsx` (210 LOC · WRONG TABLE for legacy data)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\cart\page.tsx` (547 LOC ✅)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\cart\cart-submit-button.tsx` (123 LOC ✅)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\cart\cart-row-actions.tsx` (112 LOC ✅)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\cart\add\page.tsx` (145 LOC ✅)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\cart\add\add-form.tsx` (306 LOC ✅)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\service-orders\cart\add\link-paste-search.tsx` (577 LOC ✅)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\actions\admin\service-orders.ts` (382 LOC · WRONG TABLE — pivot per Wave 31 #1, #2)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\actions\admin\service-orders-spawn.ts` (374 LOC ✅)
- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\actions\admin\cart.ts` (588 LOC ✅)

**Pacred missing entirely:**
- `app/[locale]/(admin)/admin/service-orders/[hNo]/{tab1,tab3,tab4,tab5}/` — the 5-tab framework (D1)
- `app/[locale]/(admin)/admin/service-orders/[hNo]/refund/` — the refund flow entry (D10)
- `app/[locale]/(admin)/admin/service-orders/print/` — the print endpoint (D9)
- `actions/admin/service-orders-update-quote.ts` (update2 handler) (D2)
- `actions/admin/service-orders-update-ordered.ts` (update3 handler) (D3)
- `actions/admin/service-orders-update-header.ts` (13 inline POSTs) (D6 / D14 / D15 / D18)
- `actions/admin/service-orders-refund.ts` (repayItem.php) (D10)
- `actions/admin/service-orders-lock.ts` (updateLock.php heartbeat) (D11)
- `lib/admin/print-service-order-invoice.ts` + `print-service-order-receipt.ts` (D9)
- `lib/notifications/templates/service-order-status-change.ts` (4-channel notify expansion) (D13)

---

## 8. Severity recap

| Severity | Count | Top items |
|---|---|---|
| 🔴 P0 (revenue blocker / 21,950 orders unworkable) | **13** | D1 5-tab workflow · D2-D4 update handlers · D6 13 header-edit POSTs · D7-D8 wrong-table writes · D9 print broken · D10 refund missing · D13 notify partial · D16 cancel wrong-table · D28 refund button missing |
| 🟠 P1 (works but missing UX / data quality) | **17** | D11 heartbeat · D14-D18 inline edits · D19 search · D20-D24 polish · D27 countdown · D29-D31 print juristic |
| 🟡 P2 (polish / edge / cleanup) | **11** | D32 image upload · D34 address modal · D36 round-robin · D40 bulk actions · D41 inline edits · D42 auto-cancel |
| 🟢 What works (faithful) | **11** | D43-D53 (list/cart/spawn/notes Wave 26.2 + Wave 21 + Wave 23 P1 + Wave 24 #187) |

**Aggregated estimate vs Agent G2 (customer-side):** admin-side detail/update = ~15-25% complete · admin-side cart = ~70% complete · combined service-orders admin surface area = ~25-35% complete (worse than Agent G2's 35-45% which factored in the customer-side working read paths).

---

**End of audit.** Recommend Wave 31 = "shop-order admin update workflow on tb_* schema" — 12-18h single-developer, ~5-7h with 3 parallel agents. Highest-leverage P0s (Wave 31 #1 + #2 in §4) unblock 80% of "ฝากสั่งซื้อ admin can't operate" complaints within 4 hours of dev work.
