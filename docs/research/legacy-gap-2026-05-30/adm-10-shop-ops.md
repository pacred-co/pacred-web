# Lane adm-10-shop-ops — Admin ฝากสั่งซื้อ ops (shop orders · pay · print)

**Side:** admin · **Owner-of-record for fixes:** mostly **ภูม** (admin back-office backend), with **เดฟ** on the cross-cutting workflow architecture (5-tab framework + edit-lock infra).
**Legacy SOT:** `…/pcsc/public_html/member/pcs-admin/{shops.php, printShop.php, shop-search.php, shopping-return.php}` + `include/pages/shops/*` (detail / cancelOrder / deleteItem / deleteOrder / editIPC / loadForm / repayItem / updateLock / update.php) + `include/pages/shops/update/update{1,3,4,5}.php` (+ `*Script.php`).
**Pacred under audit:** `app/[locale]/(admin)/admin/service-orders/**` + `actions/admin/{service-orders.ts, service-orders-tb.ts, service-orders-spawn.ts, cart.ts}` · branch **dave-pacred** (HEAD `3a464689`).
**Prior art (built on, confirmed + extended):** `docs/audit/service-orders-fidelity-2026-05-30-evening.md` (Agent B · the admin-detail-deep companion, audited on stale worktree `bc81a78`) + `docs/audit/master-fidelity-2026-05-30-evening.md` (Pattern 1/2/3/4/5/6) + `docs/research/legacy-gap-2026-05-30/cust-02-shop.md` (the customer-side sibling).

> **Headline:** Since the prior audit (worktree `bc81a78`), TWO Tier-A fixes landed on dave-pacred: (1) `adminUpdateServiceOrder` was **pivoted to `tb_header_order`** (no longer a dead-write), and (2) a NEW `adminMarkServiceOrderPaidTb` (in `service-orders-tb.ts`) correctly debits `tb_wallet` + `tb_wallet_hs` + flips 2→3 — and it IS wired to the legacy-path UI (`legacy-view.tsx` → `MarkPaidTbForm`). **So the two worst revenue holes from the prior audit (D7/D8) are CLOSED on the legacy path.** But the **entire admin update workflow** (the 5-tab nerve center: quote 1→2, ordered 3→4 cShippingNumber, 4→5 auto-flip, the 13 header-edit handlers, refund, print, IP-reassign, edit-lock) is **still missing for the 21,950 real `tb_header_order` orders** — and the status-flip/cancel/saveNote form that WAS pivoted (`AdminServiceOrderUpdateForm`) is rendered **only on the rebuilt `service_orders` path** (empty on prod), so for real orders it never shows.

---

## Overview

### Legacy scope (the admin ฝากสั่งซื้อ operational surface)

`pcs-admin/shops.php` is **1,942 LOC** and is the **single heaviest admin surface in the entire `pcs-admin/` tree**. It dispatches by `?page=`:

- **`?page=add` (default / list):** 6 status tabs + counts + DataTables + the `addOrder` POST handler (L4-159) that turns the admin cart into an order.
- **`?page=detail`:** read-only detail (`detail.php`, 569 LOC) + 2 inline POSTs (`saveNote` L709, `update_cTracking` L776) + inline jQuery `cancelOrder()` + inline tracking-edit form.
- **`?page=update`:** the **5-tab process-model workflow** (`include/pages/shops/update.php` 890-LOC framework → switches by `hStatus` to `update1/3/4/5.php`) + **15 inline POST handlers** + a 60-second `updateLock` heartbeat.

Plus standalone admin pages: `printShop.php` (381 LOC mPDF receipt/invoice), `shop-search.php` (250 LOC multi-axis search), `shopping-return.php` (refund dispatcher → `repayItem.php` 153 LOC).

**Canonical status enum (`tb_header_order.hstatus`) — verified in `shops.php` L256-264 + `cancelOrder.php` L8:**
`1`=รอดำเนินการ · `2`=รอชำระเงิน · `3`=สั่งสินค้าแล้ว · `4`=รอร้านจีนจัดส่ง · `5`=สำเร็จ · `6`=ยกเลิก.
**Shop-order cancel = `6`, NOT `99`** (forwarder/yuan use `99`; shop uses `6`). Admin cancel (`pcs-admin/.../cancelOrder.php`) is **unconditional**; the customer cancel (`member/.../cancelOrder.php`) is guarded `hStatus<3`.

**Canonical flow + step ORDER (the spine):**
```
addOrder (admin cart→order)  → hStatus 1   [round-robin adminIDIP · email · saveHistory 27]
update2  (quote)             → hStatus 2   [per-line cPrice/cAmount/cShippingCHN · hCostAll·hRateCost · hTotalPriceCHN/hTotalPriceUser · hDate2 · hDatePayment=NOW+5d · saveHistory 29 · 4-CH NOTIFY: email+SMS+LINE Notify+LINE OA]
(customer pays OR admin mark-paid) → hStatus 3 [tb_wallet debit + tb_wallet_hs type=2 refOrder=hNo · hDate3 · paydeposit=1]
update3  (ordered)          → hStatus 4   [per-shop cShippingNumber + per-line cPriceUpdate · hDate4 · saveHistory 30 · 3-CH NOTIFY: email+LINE Notify+LINE OA]
saveTarcking/arrSaveTarcking → (per tracking) INSERT tb_forwarder(refOrder=hNo) + carry tb_promotion + forwarder 4-CH notify; THEN if every cShippingNumber has a cTrackingNumber → hStatus 5 [hDate5 · email+LINE notify]
```
Side-flows: 13 header-edit POSTs (`update_hAddress/hShipBy/hTransportType/hRate/payMethod/crate/cost/cPriceUpdate/updateShippingNumber/update_cTracking/upAdminIDIP/update_hStatus`), `repayItem` per-item refund (→ tb_wallet_hs type=5), `deleteItem` (per-line, keeps ≥1), `deleteOrder` (super-admin hard-delete), `printShop` (receipt/invoice + juristic), `updateLock` (60s edit-lock heartbeat).

### Pacred scope (what's shipped on dave-pacred)

- **List** `/admin/service-orders/page.tsx` + `service-orders-table.tsx` — comprehensive (7 tabs, counts, sort, print-badges, payment-pressure text). ~95% faithful to the list. ✅
- **Detail dispatcher** `[hNo]/page.tsx` — reads **rebuilt `service_orders` FIRST** (L28-40); on miss falls back to `renderLegacyServiceOrderView` (`legacy-view.tsx`). For the 21,950 real orders the **legacy fallback always renders**.
- **Legacy view** `legacy-view.tsx` — read-only header/address/items/cover + `MarkPaidTbForm` (✅ tb mark-paid) + `SpawnForwarderForm` (✅ Tab-4 spawn). **No** quote/ordered/cShippingNumber/header-edit/cancel/saveNote/refund/print/IP-reassign/lock.
- **Rebuilt-path forms** (rendered only when a `service_orders` row exists — empty on prod): `AdminServiceOrderUpdateForm` (status-flip+note → now writes `tb_header_order` ✅), `BillToOverridePanel`.
- **Actions:** `service-orders.ts` (`adminUpdateServiceOrder` ✅ tb_header_order · `adminMarkServiceOrderPaid` 💀 still rebuilt · `adminSetOrderBillToOverride`), `service-orders-tb.ts` (`adminMarkServiceOrderPaidTb` ✅), `service-orders-spawn.ts` (`spawnForwardersFromShopOrder` ✅ tb_forwarder), `cart.ts` (cart-add + submit ✅).
- **Cart** `/admin/service-orders/cart/**` — ~70% (add-manual + link-paste SKU + submit→tb_header_order all ✅; address modal / image upload / round-robin IP / promo-carry missing).

### % complete (admin ฝากสั่งซื้อ ops surface)

| Sub-surface | % | Note |
|---|---:|---|
| List page | ~95% | Wave 26.2 — faithful except print-button target (D9) + bulk-cancel/bulk-pay |
| Detail **read** | ~90% | legacy-view renders header/address/cover; **line items NOT shown** on legacy path |
| Detail **mutate** (the nerve center) | **~20%** | only mark-paid (2→3) + spawn (Tab 4) work on real orders |
| Cart | ~70% | submit faithful; modal/image/round-robin/promo missing |
| Print | **0%** | no admin print route; buttons point at user-pinned customer route |
| Refund | **0%** | `repayItem` + `shopping-return` entirely unported |
| Search (multi-axis) | ~40% | hNo+userid only; no cTrackingNumber/cShippingNumber axis |
| **Lane overall** | **≈ 30-35%** | up from prior audit's 25-35% — two revenue holes closed, workflow still missing |

---

## Workflow-by-workflow gap table

Status legend: ✅ faithful · 🟡 partial · ❌ missing · 💀 present-but-dead (dead-write / unreachable on prod data).

| # | Legacy flow (file:line) | Pacred equiv | Status | Flow-order correct? | Owner |
|---|---|---|---|---|---|
| **LIST — `shops.php?page=add`** | | | | | |
| S1 | List + 6 status tabs + counts + DataTables (L237-555) | `page.tsx` + `service-orders-table.tsx` | ✅ | yes | — |
| S2 | `addOrder` admin cart→order: hNo=`P`+(maxID+1) · round-robin adminIDIP (L58-94) · INSERT tb_header_order(hstatus=1)+tb_order×N · DELETE tb_cart · hRate=rsDefault · email · saveHistory(27) | `cart.ts adminSubmitCartAsOrder` | 🟡 | **flow-order ok BUT round-robin adminIDIP not ported** (static current-admin · cart.ts L41-43) | ภูม |
| S3 | Print-badges (`hPrintBill`/`hPrintBill2`) on rows | `service-orders-table.tsx` L289-326 | ✅ | yes | — |
| S4 | "กรุณาชำระก่อน <date>" + overdue auto-cancel (L72-78, L488-490) | table renders the text; **overdue auto-cancel NOT wired** | 🟡 | partial | ภูม |
| S5 | Bulk-select → bulk-cancel + bulk-pay | only bulk-**print** bar (Wave 26.2) | 🟡 | partial | ภูม |
| **DETAIL — `shops.php?page=detail` + `detail.php`** | | | | | |
| S6 | Read-only detail (customer · address · items · cover · status strip) | `legacy-view.tsx` | 🟡 | **line items NOT rendered on legacy path** (page.tsx items query reads rebuilt `service_order_items`, empty on prod) | ภูม |
| S7 | `saveNote` (L709/838): hNote + hNoteUser visibility flag + hNoteUserRead + 3-channel push (admin-LINE-group / customer LINE Notify+OA) · saveHistory(28) | `adminUpdateServiceOrder` writes hnote+hnotedate **but only on rebuilt path UI**; NO visibility flag, NO hNoteUserRead, NO LINE push | 💀 | **unreachable on real orders** (form not rendered by legacy-view) + missing visibility/push | ภูม |
| S8 | `update_cTracking` (L776): fix typoed tracking in **BOTH** tb_order.cTrackingNumber **AND** tb_forwarder.fTrackingCHN (+back-fill fCover) | — | ❌ | — | ภูม |
| S9 | inline `cancelOrder()` sweetalert → `cancelOrder.php` hStatus=**6** (admin: unconditional) · saveHistory(23) | `update-form.tsx` "❌ ยกเลิก" → `adminUpdateServiceOrder(status:"cancelled"→'6')` ✅ map | 💀 | **map correct BUT form unreachable on real orders** (rendered only on rebuilt path) | ภูม |
| **UPDATE — `shops.php?page=update` + `update.php` 5-tab framework** | | | | | |
| S10 | **Tab framework** `update.php` (890 LOC): header summary · status-progress strip · 6 inline edit-toggles · editIPC button · 60s lock heartbeat · switch by hStatus → update1/3/4/5 | — | ❌ | **entire framework missing** | เดฟ |
| S11 | **Tab1/2** `update1.php`: edit cart items (per-line cAmount/cPrice/cShippingCHN) + hRateCost+hCostAll + "เปลี่ยนสถานะ รอชำระเงิน" | — | ❌ | — | ภูม |
| S12 | **`update2` quote handler** (L916-1070): idempotency guard (tb_wallet_hs) → per-line UPDATE tb_order → tb_header_order(hStatus=2, hDate2, hDatePayment=NOW+5d, hCostAllTH, hTotalPriceCHN/User) → saveHistory(29) → **4-CH NOTIFY (email+SMS+LINE Notify+LINE OA)** | — | ❌ | **MISSING — order can never be quoted/marked ready-for-payment** | ภูม |
| S13 | **Tab3** `update3.php` + handler (L1071-1185): per-shop cShippingNumber + per-line cPriceUpdate → hStatus=4, hDate4 → saveHistory(30) → 3-CH NOTIFY | — | ❌ | **MISSING — China shop order # cannot be recorded** | ภูม |
| S14 | **Tab4** `update4.php` + `saveTarcking`/`arrSaveTarcking` (L1363-1791): per-shop cTrackingNumber · multi-parcel split · INSERT tb_forwarder(refOrder=hNo) · carry tb_promotion (L1514-1523) · forwarder 4-CH notify · then if last-tracking → hStatus=5+hDate5 | `spawn-form.tsx` + `service-orders-spawn.ts` | 🟡 | **spawn + split ✅, fires sendNotification; BUT (a) NO hStatus 4→5 auto-flip, (b) NO tb_promotion carry, (c) notify is internal-only not 4-channel** | ภูม |
| S15 | **Tab5** `update5.php`: read-only, shows linked tb_forwarder.ID per cTrackingNumber | — | ❌ | — | ภูม |
| S16 | `checkTracking.php` / `loadForm.php` "ตรวจสอบรายการนำเข้า" pre-spawn dedup preview | spawn action idempotent (re-spawn returns existing fNo) but **no pre-submit preview** | 🟡 | partial | ภูม |
| **13 header-edit POSTs (`?page=update`)** | | | | | |
| S17 | `update_hAddress` (L1268): re-pick from tb_address (block if hShipBy=PCS) | — | ❌ | — | ภูม |
| S18 | `update_hShipBy` (L1309): change carrier (+auto PCS-pickup address) · saveHistory(35) | — | ❌ | — | ภูม |
| S19 | `update_hTransportType` (L1225): car/sea/air · saveHistory(32) | — | ❌ | — | ภูม |
| S20 | `update_hRate` (L1238): override yuan rate + recompute hTotalPriceUser · saveHistory(33) | — | ❌ | — | ภูม |
| S21 | `update_payMethod` (L1341): origin/destination | — | ❌ | — | ภูม |
| S22 | `update_crate` (L1352): toggle ตีลังไม้ | — | ❌ | — | ภูม |
| S23 | `update_cost` (L1186): hRateCost+hCostAll standalone + recompute hTotalPriceUser | — | ❌ | — | ภูม |
| S24 | `update_cPriceUpdate` (L1806): per-line ¥ adjust when China shop changes price | — | ❌ | — | ภูม |
| S25 | `updateShippingNumber` (L1793): fix typoed cShippingNumber per shop | — | ❌ | — | ภูม |
| S26 | `update_hStatus` (L905): direct status override (admin "ใช้เฉพาะคืนเงิน/ทำสำเร็จ") | `adminUpdateServiceOrder` (rebuilt-path form only) | 💀 | map ok, unreachable on real orders | ภูม |
| S27 | `upAdminIDIP` (L1847) + `editIPC.php` modal: reassign Chinese-interpreter operator (section 3/4) — guard: blocked if adminIDCreate set | `/admin/customers/transfer-rep` is sales-rep (DIFFERENT) | ❌ | — | ภูม |
| **Per-item / hard-delete AJAX** | | | | | |
| S28 | `deleteItem.php`: drop one tb_order row (keeps ≥1) · recompute hTotalPriceCHN+hCount · unlink image · saveHistory(24) | — | ❌ | — | ภูม |
| S29 | `deleteOrder.php`: super-admin hard-delete header+all tb_order+unlink · saveHistory(25) | — | ❌ | — | ภูม |
| **Mark-paid (2→3)** | | | | | |
| S30 | Admin mark-paid: tb_wallet debit + tb_wallet_hs(type=2, refOrder=hNo) + hStatus 2→3 + hDate3 + paydeposit=1 | `service-orders-tb.ts adminMarkServiceOrderPaidTb` ← `MarkPaidTbForm` (legacy-view) | ✅ | **yes — CORRECT TABLE, idempotency-guarded, debits wallet, flips 2→3** | — |
| S31 | (latent) old `adminMarkServiceOrderPaid` → rebuilt `service_orders` + `wallet_transactions` | imported by `update-form.tsx` (rebuilt-path) | 💀 | **dead-write IF ever a service_orders row exists** | ภูม |
| **Refund — `shopping-return.php` + `repayItem.php`** | | | | | |
| S32 | Per-item refund: partial-split tb_order · INSERT tb_wallet_hs(type=5 deposit, status=2, refOrder) · UPDATE tb_wallet.walletTotal(+) · tb_order.cReWallet=1+cNote · recompute hTotalPriceCHN/User · saveHistory(26) | — | ❌ | **MISSING ENTIRELY** | ภูม |
| S33 | Refund list/detail/add pages (3 status tabs · wallet balance · line-item refund-qty inputs) | — | ❌ | — | ภูม |
| S34 | "คืนเงินลูกค้า" button on detail (→ shopping-return) | — | ❌ | — | ภูม |
| **Print — `printShop.php`** | | | | | |
| S35 | `print=1` ใบเสร็จ (hStatus=5 only, stamp hPrintBill=1) + `print=2` ใบแจ้งหนี้ (hStatus>1 & <>6, stamp hPrintBill2=1) · mPDF THSarabunNew | `service-orders-table.tsx` buttons → **`/service-order/print` (CUSTOMER route, `requireAuth()`+userid-pinned)** | 💀 | **WRONG ROUTE — admin can only print own orders; dead for 21,950 customer orders** | เดฟ |
| S36 | Juristic branch: userCompany=1 → tb_corporate name/number/address | (no admin print) | ❌ | depends on S35 | เดฟ |
| S37 | 2 hardcoded juristic overrides (PCS8765, PCS8304) | `bill_to_name_override` partial | 🟡 | migrate if those PR<n> exist | ภูม |
| **Search — `shop-search.php`** | | | | | |
| S38 | Multi-axis: hNo / cTrackingNumber / cShippingNumber / userID / all | `?search=` on list = hNo+userid only | 🟡 | **cTrackingNumber + cShippingNumber axes missing** (the trace-this-package workflow) | ภูม |
| **Concurrency — `updateLock.php`** | | | | | |
| S39 | 60s heartbeat: tb_header_order.hLockDate=NOW+60s + session + adminID — prevents 2 admins editing same order | — | ❌ | becomes a real risk once S10-S26 land | เดฟ |
| **Notes convenience page** | | | | | |
| S40 | (Pacred-original) `/admin/service-orders/notes` | `notes/page.tsx` L63 reads rebuilt `service_orders` | 💀 | empty on prod (reads dead table) | ภูม |
| **Cart polish** | | | | | |
| S41 | Address-picker modal (SELECT tb_address) on cart submit | typed fields only | 🟡 | partial | ภูม |
| S42 | Per-row image upload (`$_FILES['cImages']`) | URL string only | ❌ | — | ภูม |
| S43 | tb_promotion-aware addOrder (3.3 promo carry) on admin submit | customer-side has it; admin submit doesn't | 🟡 | partial | ภูม |
| S44 | Update tb_users last-used defaults (userAddressID/ShipBy/PayMethod) on admin submit | customer-side ✅; admin submit ❌ | 🟡 | partial | ภูม |

---

## Death-flows (P0 / P1 — detailed)

### 💀 P0-1 — The entire 5-tab admin UPDATE workflow is missing for 21,950 real orders (S10–S15, S12, S13)
**Legacy:** `shops.php?page=update` → `update.php` (890 LOC) → `update1/3/4/5.php` + the `update2`/`update3`/`saveTarcking` handlers. This is the operational nerve center — every ฝากสั่งซื้อ order is advanced 1→2→3→4→5 here.
**Pacred:** for real `tb_header_order` orders, `legacy-view.tsx` renders only `MarkPaidTbForm` (2→3) + `SpawnForwarderForm` (Tab 4 spawn). There is **no quote step (1→2)** — so an order can never be priced and moved to "รอชำระเงิน"; **no ordered step (3→4)** — the China shop order number (`cShippingNumber`) can't be recorded; **no Tab 5 read view**.
**Why P0:** Without the **quote (update2)** step, a freshly-created order (hStatus=1) **cannot reach the payment state at all** — the customer is never told a price, never billed, `hTotalPriceUser` is never computed, `hDatePayment` never set. This blocks the revenue path for every NEW ฝากสั่งซื้อ order, and forces hand-SQL for the entire 1→2→3→4 lifecycle of the migrated base. **Flow-order issue: yes — the whole forward sequence is absent.**
**Fix:** Build the update workflow on `tb_header_order` (mode-driven by `hstatus`, single React page; legacy split exists only because PHP can't share state). Sequence: update2 (quote) first → update3 (ordered) → then header-edits. Each writes `tb_order`/`tb_header_order` with the exact field set + date-stamp + saveHistory parity (see flow spine above). Owner: ภูม (handlers) + เดฟ (framework/page architecture).

### 💀 P0-2 — Admin print receipt/invoice points at the user-pinned customer route (S35/S36)
**Legacy:** `printShop.php?print=1|2&id[]=<hNo>` — admin prints any customer's ใบเสร็จ/ใบแจ้งหนี้, stamps hPrintBill/hPrintBill2, juristic via tb_corporate.
**Pacred:** `service-orders-table.tsx` L482-498 link to `/service-order/print` — verified **`requireAuth()` + `userid = profile.member_code`** filter. An admin clicking "พิมพ์ใบเสร็จ" on a customer row gets `notFound()` (order isn't theirs). **No `/admin/service-orders/print` route exists** (only `/admin/forwarders/print` does).
**Why P0:** Print is the physical handoff (invoice to bill the customer, receipt as proof of payment). Staff have **zero** way to print a ฝากสั่งซื้อ invoice/receipt for any of the 21,950 migrated orders. **Flow-order issue: no (route target), but a hard operational dead-end.**
**Fix:** Build `/admin/service-orders/print` (admin auth, `createAdminClient`, no userid pin) mirroring `printShop.php` (print=1 receipt hStatus=5 + hPrintBill=1; print=2 invoice hStatus 2-5 + hPrintBill2=1; juristic branch via `corporate`). Re-point the table buttons. Pacred print convention = `pdf-lib` (or the transcribed-HTML+CSS pattern already used by the customer `/service-order/print`). Owner: เดฟ.

### 💀 P0-3 — Per-item refund (`repayItem` / `shopping-return`) entirely unported (S32–S34)
**Legacy:** `repayItem.php` (153 LOC) — partial-quantity split of the tb_order row, INSERT `tb_wallet_hs` (type=5 deposit, status=2, refOrder), credit `tb_wallet.walletTotal`, set `tb_order.cReWallet=1` + note, recompute `hTotalPriceCHN`/`hTotalPriceUser`, saveHistory(26). Reached via the "คืนเงินลูกค้า" button + `shopping-return.php` list/add pages.
**Pacred:** **no route** under `/admin/service-orders/**` or `/admin/shopping-return/**`. `/admin/refunds` is the generic Pacred refunds surface (different); `actions/admin/shop-payouts.ts` is shop-**affiliate** payouts (different feature).
**Why P0:** China shops cancel/short items daily → customer is owed a wallet credit. With no path, staff hand-craft a `tb_wallet_hs` INSERT + `tb_wallet` UPDATE — error-prone money movement, the exact class of bug the "ห้าม death" mandate targets. **Flow-order issue: no, but a money-correctness hole.**
**Fix:** `adminRefundServiceOrderItem(hNo, tb_order.id, cAmountRe)` Server Action transcribing `repayItem.php` exactly (partial-split → tb_wallet_hs type=5 → tb_wallet credit → cReWallet=1 → recompute → audit). Add a "คืนเงิน" entry + a refund page. Owner: ภูม.

### 💀 P0-4 — Status-flip / cancel / saveNote form is unreachable on real orders (S7, S9, S26)
**Legacy:** admin can cancel (→6, unconditional), save a note (admin-only vs customer-visible, with read flag + LINE push), and override status from the update page — for any order.
**Pacred:** `AdminServiceOrderUpdateForm` **was pivoted to write `tb_header_order` correctly** (`adminUpdateServiceOrder`, status map cancelled→'6' verified, date-cols correct) — **but `page.tsx` renders it only on the rebuilt-`service_orders` path** (L207). Real orders fall to `legacy-view.tsx`, which does **not** render it. So a correct, working action is **wired to a UI that the 21,950 orders never see.**
**Why P0:** Admin cannot cancel or change the status of a real migrated order from the UI (only mark-paid 2→3 + spawn work). Cancel is a daily action. **Flow-order issue: no, but a wiring dead-end — the fix is small.**
**Fix:** Render `AdminServiceOrderUpdateForm` (status + note + cancel) inside `legacy-view.tsx` too (it already targets tb_header_order by hNo). Add the saveNote visibility flag + customer LINE push to match `saveNote`. Owner: ภูม.

### 🟡 P1-5 — Tab-4 spawn doesn't auto-flip 4→5, doesn't carry tb_promotion, notify is internal-only (S14)
**Legacy:** `saveTarcking` (a) INSERTs tb_forwarder, (b) carries `tb_promotion` (L1514-1523: SELECT promoID WHERE hNo → INSERT with new fID), (c) when **every** cShippingNumber has a cTrackingNumber → flips `tb_header_order.hStatus=5`+hDate5, (d) fires 4-channel forwarder + order notify.
**Pacred:** `service-orders-spawn.ts` does (a) ✅ + an internal `sendNotification` — but **not** (b) promo carry, **not** (c) the 4→5 auto-flip (order stays at 4 forever until manual mark), **not** (d) the legacy 4-channel coverage.
**Why P1:** Order completion (status 5) never happens automatically → list "สำเร็จ" tab under-counts, customers never get the "สำเร็จ" notification, promo customers (3.3/Valentine/PCSF) lose downstream forwarder discount entitlement.
**Fix:** In the spawn action, after the last tracking, run the legacy "all cShippingNumber have cTrackingNumber?" check → set hstatus='5'+hdate5; SELECT/INSERT tb_promotion; expand notify channels. Owner: ภูม.

### 🟡 P1-6 — update2/update3/saveNote notify is single-channel, not the legacy 4-channel (S7, S12, S13, S30)
**Legacy:** status changes fan out to **Email + SMS (skip PCS2000) + LINE Notify (userLineNotify) + LINE OA (userLineIDOA, templated card w/ image + CTA button)**.
**Pacred:** `adminUpdateServiceOrder` fires only the internal `sendNotification` (one Pacred channel). `adminMarkServiceOrderPaidTb` (2→3) fires **no customer notify at all**. The quote (1→2) and ordered (3→4) handlers don't exist yet, so their notify is moot until P0-1 lands — but when it does, it must carry the 4 channels.
**Why P1:** Customers without LINE-OA bind silently miss "ready to pay" / "ordered" / "completed" — the trust + payment-prompt path legacy depended on (SMS payment-link especially).
**Fix:** Reuse the forwarder send-notification pattern (Email + SMS + LINE Notify + LINE OA); wire into the quote/ordered handlers (P0-1) + mark-paid. Owner: ภูม.

### 🟡 P1-7 — 13 header-edit handlers + IP-reassign + per-item delete missing (S17–S29, S38)
**Legacy:** the 13 single-field UPDATE handlers (`update_hAddress/hShipBy/hTransportType/hRate/payMethod/crate/cost/cPriceUpdate/updateShippingNumber/update_cTracking`), `upAdminIDIP` (reassign Chinese-interpreter operator via `editIPC.php` modal), `deleteItem`, `deleteOrder` — plus multi-axis search by cTrackingNumber/cShippingNumber.
**Pacred:** none.
**Why P1:** "เปลี่ยนที่อยู่", "เปลี่ยนเป็นเรือ", "ขอจ่ายปลายทาง", "ขอตีลังไม้", "ตามรอยพัสดุด้วย tracking", "ย้ายล่ามจีน" — all daily customer/ops asks → all go to SQL today.
**Fix:** Build as collapsible edit-toggles inside the update page (P0-1); IP-reassign as a dropdown of section 3/4 admins; add cTrackingNumber/cShippingNumber search axes (JOIN tb_order). Owner: ภูม.

---

## Flow-order divergences (where pieces exist but the sequence/state-machine differs)

1. **No quote→pay→order sequence on real orders.** Legacy: 1→2 (update2, sets price+deadline) precedes payment (2→3) which precedes ordered (3→4). Pacred legacy-path can only do **2→3** (mark-paid) and the **Tab-4 spawn** — there is **no way to reach state 2 from state 1** (no quote handler) and **no way to reach state 4 from state 3** (no cShippingNumber handler). The middle of the state machine is unreachable. **(P0-1)**
2. **4→5 transition never auto-fires.** Legacy flips to 5 when the last tracking is entered; Pacred spawn leaves the header at 4. The "สำเร็จ" terminal state is only reachable by manual override (which itself is unreachable on real orders — P0-4). **(P1-5)**
3. **adminIDIP assignment order differs.** Legacy round-robins the Chinese-interpreter operator across section 3/4 staff on `addOrder` (workload balancing); Pacred always assigns the current admin → single-operator bottleneck. **(S2)**
4. **saveNote visibility ordering lost.** Legacy decides hNoteUserRead based on hNoteUser (admin-only vs customer-visible) and pushes to different channels accordingly; Pacred stores hnote flatly with no visibility flag + no push. **(S7)**
5. **Print stamping side-effect missing.** Legacy stamps hPrintBill/hPrintBill2 on render (so the list shows "พิมพ์แล้ว"); Pacred's table reads those columns ✅ but nothing ever writes them (no admin print) → the badges can never turn on for real orders. **(S35)**

---

## Modals / AJAX / cron / print inventory

| Kind | Legacy | Trigger | Pacred status |
|---|---|---|---|
| POST handler | `addOrder` | cart submit | 🟡 `adminSubmitCartAsOrder` (no round-robin IP) |
| POST handler | `update2` (quote 1→2) | "เปลี่ยนสถานะ รอชำระเงิน" | ❌ missing |
| POST handler | `update3` (ordered 3→4) | "เปลี่ยนสถานะ รอร้านจีนจัดส่ง" | ❌ missing |
| POST handler | `saveTarcking` / `arrSaveTarcking` (4→5) | "บันทึก และสร้างรายการฝากนำเข้า" | 🟡 spawn ✅, no 4→5 flip / promo / 4-ch notify |
| POST handler | `saveNote` | note save | 💀 unreachable on legacy path |
| POST handler | `update_cTracking` | inline tracking-typo fix (tb_order + tb_forwarder) | ❌ missing |
| POST handler | `update_hStatus` | status override | 💀 unreachable on legacy path |
| POST handler | 13× header edits (hAddress/hShipBy/hTransportType/hRate/payMethod/crate/cost/cPriceUpdate/updateShippingNumber) | inline edit-toggles | ❌ missing |
| POST handler | `upAdminIDIP` | editIPC modal confirm | ❌ missing |
| AJAX | `cancelOrder.php` (→6, admin unconditional) | sweetalert | 💀 action exists (map ok) but UI unreachable on real orders |
| AJAX | `deleteItem.php` (per-line, keep ≥1, recompute, unlink) | per-row "ลบ" | ❌ missing |
| AJAX | `deleteOrder.php` (super-admin hard-delete + unlink) | "ลบถาวร" | ❌ missing |
| AJAX | `editIPC.php` (IP-operator modal, section 3/4, guard) | "แก้ไขผู้ดูแล" | ❌ missing |
| AJAX | `loadForm.php` / `checkTracking.php` (pre-spawn dedup preview) | update4 "ตรวจสอบรายการนำเข้า" | 🟡 idempotent but no preview |
| AJAX | `repayItem.php` (per-item refund → tb_wallet_hs type=5) | shopping-return add | ❌ missing |
| AJAX | `updateLock.php` (60s heartbeat: hLockDate+session+adminID) | setInterval on update page | ❌ missing |
| Print | `printShop.php` print=1 receipt (hStatus=5, hPrintBill=1) | "พิมพ์ใบเสร็จ" | 💀 → user-pinned customer route |
| Print | `printShop.php` print=2 invoice (hStatus 2-5, hPrintBill2=1) + juristic tb_corporate | "พิมพ์ใบแจ้งหนี้" | 💀 → user-pinned customer route |
| Cron | (none specific to shop-ops in legacy; overdue auto-cancel is read-time in `shops.php` L72-78) | — | overdue auto-cancel not wired (recommend cron per CLAUDE.md learning) |
| saveHistory | types 23 (cancel) / 24 (deleteItem) / 25 (deleteOrder) / 26 (refund) / 27 (addOrder) / 28 (saveNote) / 29 (update2) / 30 (update3) / 32-35 (header edits) | every mutation | replaced by `admin_audit_log` for the few ported mutations; most unported |

> **Note on lane-title file refs:** `printAll.php` + `printBill.php` (named in the lane brief) are the **forwarder/container** box-label + forwarder-bill prints (tb_forwarder, format 100×75 / A4) — they belong to the adm-09-forwarder lane, NOT shop-ops. The shop-order print is **`printShop.php`** only.

> **Duplicate action files (Rule 4):** `service-orders.ts` `adminMarkServiceOrderPaid` (💀 rebuilt `service_orders` + `wallet_transactions`) vs `service-orders-tb.ts` `adminMarkServiceOrderPaidTb` (✅ tb_wallet + tb_wallet_hs + tb_header_order). **The tb_ one is wired to the live legacy-path UI (`MarkPaidTbForm`)**; the rebuilt one is reachable only via `update-form.tsx` (rebuilt path, empty on prod). Recommend renaming/retiring the rebuilt `adminMarkServiceOrderPaid` to `*-legacy-deprecated` or deleting once the rebuilt path is removed.

---

## Recommended fixes (ranked, with owner)

| # | Fix | Closes | Owner | Effort |
|---|---|---|---|---:|
| 1 | **Render `AdminServiceOrderUpdateForm` (status+note+cancel) inside `legacy-view.tsx`** — it already targets tb_header_order; this single wire-up makes cancel + status-override + note work for all 21,950 orders | P0-4 (S7/S9/S26) | ภูม | 1h |
| 2 | **Build `/admin/service-orders/print`** (admin auth, no userid pin) transcribing `printShop.php` (receipt hStatus=5 + invoice hStatus 2-5 · juristic via `corporate` · stamp hPrintBill/2) + re-point table buttons | P0-2 (S35/S36) | เดฟ | 3-4h |
| 3 | **Build the quote handler `update2`** (`adminQuoteServiceOrder`): idempotency guard → per-line tb_order UPDATE → tb_header_order(hStatus=2, hDate2, hDatePayment=NOW+5d, hCostAllTH, hTotalPriceCHN/User) → 4-ch notify. This unblocks the revenue path for NEW orders | P0-1 (S12) | ภูม | 3h |
| 4 | **Port `repayItem` per-item refund** (`adminRefundServiceOrderItem`) + refund entry/page | P0-3 (S32-34) | ภูม | 3h |
| 5 | **Build the ordered handler `update3`** (cShippingNumber + cPriceUpdate → hStatus=4 + 3-ch notify) + Tab-1/2 item-edit + Tab-5 read view (the rest of the 5-tab workflow as a single hstatus-driven page) | P0-1 (S10/S11/S13/S15) | เดฟ (framework) + ภูม (handlers) | 6-8h |
| 6 | **Spawn completion side-effects:** 4→5 auto-flip (all-tracking check) + tb_promotion carry + 4-ch notify in `service-orders-spawn.ts` | P1-5 (S14) | ภูม | 1.5h |
| 7 | **13 header-edit handlers + IP-reassign + deleteItem/deleteOrder** as collapsible edit-toggles on the update page; IP-reassign modal (section 3/4) | P1-7 (S17-29, S27) | ภูม | 4-5h |
| 8 | **Wire 4-channel notify** (Email+SMS+LINE Notify+LINE OA) into mark-paid + the quote/ordered handlers; add saveNote visibility flag + customer LINE push | P1-6 (S7/S30) | ภูม | 2h |
| 9 | **Multi-axis search** — add cTrackingNumber + cShippingNumber axes to `/admin/service-orders` (JOIN tb_order) | S38 | ภูม | 1h |
| 10 | **Retire the dead `adminMarkServiceOrderPaid`** (rebuilt) — rename `*-legacy-deprecated` or delete; fix `notes/page.tsx` to read tb_header_order | S31/S40 | ภูม | 30m |
| 11 | **60s edit-lock heartbeat** (`lockServiceOrder` + client setInterval) — ship with the update workflow to prevent concurrent-admin overwrites (Supabase auth UUID as the `session` value) | S39 | เดฟ | 1h |
| 12 | **Round-robin adminIDIP on cart submit** + address-picker modal + per-row image upload + promo-carry + tb_users defaults | S2/S41-44 | ภูม | 4h |

**Sequencing note:** #1 (1h) is the single highest-leverage fix — it makes cancel + status-override + note operable on real orders immediately. #2 + #3 + #4 are the revenue/operations P0s. The full 5-tab workflow (#5) is the largest single piece — budget it as its own wave with เดฟ on the page architecture + ภูม on the per-handler transcription.
