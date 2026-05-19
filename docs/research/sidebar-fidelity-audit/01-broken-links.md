# Admin sidebar fidelity audit — 15 broken sidebar links (no `page.tsx`)

> **Scope:** the 15 confirmed broken sidebar `href`s in `lib/admin/sidebar-menu.ts` that have no `app/[locale]/(admin)/admin/<href>/page.tsx`. **Read-only audit · no files modified.**
> **Sources:** `lib/admin/sidebar-menu.ts` (sidebar intent + label keys + OOP block) · `docs/research/d1-fidelity-admin.md` (legacy spec, §1-12) · `docs/research/d1-phase-b-gap-map.md` §1/§4 (workflow gaps) · `docs/briefs/poom.md` D1 rule "**copy original 100% sameness FIRST, then improve**".
> **Fix legend:** 🅰 STUB (placeholder, keep link clickable) · 🅱 FILTER-REWIRE (point href at existing page with `?param=`) · 🅲 BUILD (real page) · 🅳 DELETE (legacy doesn't have it).

---

### /admin/customers/search

**Legacy equivalent:** `pcs-admin/users-search.php` (separate page, on `OOP/Cargo/menu-user.php` as `ค้นหารหัส`).
**What legacy shows:** A dedicated page with a single search box ("ค้นหารหัสสมาชิก") + result list with name/tel/email/รหัส.
**Intended Pacred behavior:** `userCargo.search` / `userCargo.searchTop` — top-of-menu quick-find for a customer. d1-fidelity-admin.md §10 row "ค้นหารหัสสมาชิก" notes "*inline search bar; Acceptable; legacy has it as a sidebar item*".
**Fix recommendation:** 🅱 FILTER-REWIRE → `/admin/customers?focus=search` (or `?q=`). `/admin/customers` already has an inline search bar; auto-focus it. Faithful enough; saves a page.
**Effort:** ~0.5h (sidebar href change + a `focus={searchParams.focus==='search'}` on the input).
**Severity:** 🟠 weekly-used (every staffer hits it daily but redirect satisfies).

---

### /admin/forwarders/combine-bill

**Legacy equivalent:** `pcs-admin/forwarder-bill.php` ("รวมบิลสินค้า") on `OOP/Cargo/menu-forwarder.php`.
**What legacy shows:** Multi-select forwarder rows → consolidate into ONE printed bill (mPDF, THSarabunNew). d1-fidelity-admin.md §7 + §11 highlight "**Missing** — multi-order bill consolidation" as a daily-flow gap.
**Intended Pacred behavior:** `forwarder.combineBill` icon `Printer`, no badge — staff click to start a bill-consolidation print job.
**Fix recommendation:** 🅲 BUILD — there is no Pacred equivalent. Needs a row-selector list (existing `ForwardersTable` checkboxes can drive it) + a `combineBill` server action + a PDF route reusing `components/pdf/*`.
**Effort:** ~6h (list selector page + action + PDF template).
**Severity:** 🔴 daily-flow blocker — invoices/bills are revenue-touching; called out as a top fidelity gap in §13 sequencing #5.

---

### /admin/forwarders/container-cost-check

**Legacy equivalent:** `pcs-admin/check-sang-cost.php` ("เช็คต้นทุนตู้ Sheet") on `OOP/Cargo/menu-forwarder.php`.
**What legacy shows:** Reconcile container cost vs a Google Sheet (cost audit). d1-fidelity-admin.md §6.3 row `เช็คต้นทุนตู้ Sheet` says "*None. Build or defer (Phase C) — but it IS a legacy sidebar item.*"
**Intended Pacred behavior:** `forwarder.checkCntCost` icon `Calculator`, no badge — Sheet-based cost-vs-actual sanity check.
**Fix recommendation:** 🅰 STUB — Phase C eligible per the spec. Stub with "เร็วๆนี้ / pending Sheets API integration" so the menu item stays where staff expect.
**Effort:** ~0.5h stub.
**Severity:** 🟡 monthly-or-rare (cost-audit / accountant tool).

---

### /admin/forwarders/new

**Legacy equivalent:** `pcs-admin/forwarder/add/` (admin-create forwarder), referenced d1-fidelity-admin.md §4.1 row "Add forwarder" — "*admin creates a row; `fShipBy='PCS'` auto-fills the PCS BKK warehouse address.*"
**What legacy shows:** A form: customer search → goods description → `fAmount`, `fShipBy` (PCS auto-fills warehouse address) → save → row at `fStatus=1`. Lives at the bottom of the `รายการนำเข้า` accordion as `เพิ่ม`.
**Intended Pacred behavior:** `forwarder.listAdd` icon `PackagePlus` — staff onboard a parcel that arrived offline (customer phoned in / walked in).
**Fix recommendation:** 🅲 BUILD — no Pacred admin-create-forwarder route exists today; spec explicitly flags "*Verify admin-create-forwarder exists with the warehouse-address auto-fill.*" Needs a form + `createForwarder` action + the `fShipBy='PCS'` auto-fill.
**Effort:** ~5h (form + Zod + action + redirect to `/admin/forwarders/[fNo]`).
**Severity:** 🔴 daily-flow blocker — without it staff can't onboard walk-in/phone parcels.

---

### /admin/forwarders/notes

**Legacy equivalent:** `pcs-admin/forwarder-action.php?action=Note` ("หมายเหตุนำเข้า") — d1-fidelity-admin.md §4.1 row "หมายเหตุนำเข้า": "*Add the note queue (`fNote<>'' AND fStatus<>7`).*"
**What legacy shows:** A queue of forwarder rows that have a non-empty `fNote` and aren't delivered yet (staff need to follow up on customer remarks). Badge-counted.
**Intended Pacred behavior:** `forwarder.note` icon `MessageSquare`, badge `forwarderNote` — work queue that staff clear daily.
**Fix recommendation:** 🅱 FILTER-REWIRE → `/admin/forwarders?q=note` (extend `ForwardersTable` to filter `f_note IS NOT NULL AND status <> 'delivered'`). Faithful to the legacy query semantics + reuses the existing list UI. Add the `forwarderNote` badge count to the existing query.
**Effort:** ~1.5h (query branch in the existing page + sidebar href).
**Severity:** 🔴 daily-flow blocker — note-queue is a workflow staff run *from the badge*.

---

### /admin/forwarders/search

**Legacy equivalent:** `pcs-admin/forwarder-search.php` (separate page on `OOP/Cargo/menu-forwarder.php` as `ค้นหา`).
**What legacy shows:** A page with one search box for a single forwarder code/tracking. d1-fidelity-admin.md §4.1 row "Search" — "*Acceptable — both capabilities exist. Match: legacy exposes them as 2 sidebar items.*"
**Intended Pacred behavior:** `forwarder.search` icon `Search` — sibling of `forwarder.searchMulti` (`/admin/forwarders/bulk-search` which DOES exist).
**Fix recommendation:** 🅱 FILTER-REWIRE → `/admin/forwarders?focus=search` (auto-focus inline search). The bulk variant has its own page; the single-search is fine inline.
**Effort:** ~0.5h.
**Severity:** 🟠 weekly-used.

---

### /admin/forwarders/warehouse-history

**Legacy equivalent:** `pcs-admin/forwarder-import-warehouse.php` ("ประวัติเข้าโกดังไทย") — d1-fidelity-admin.md §4.2 + §6.3 row "Warehouse-in history".
**What legacy shows:** A re-link/correct screen for `tb_forwarder_import2` (scan record) ↔ `tb_forwarder` (parcel) — staff fix wrong scans + view shelf history. Badge `forwarderWhError`.
**Intended Pacred behavior:** `forwarder.whHistory` icon `PackageCheck`, badge `forwarderWhError` — daily warehouse-error reconciliation.
**Fix recommendation:** 🅲 BUILD — explicitly "*Not present*" per spec §6.3; spec §13 sequencing #6 places it in cleanup. List + relink form + audit log.
**Effort:** ~6h.
**Severity:** 🔴 daily-flow blocker for warehouse role — the badge feeds their queue.

---

### /admin/service-orders/cart

**Legacy equivalent:** `pcs-admin/cart/` ("รถเข็น") on `OOP/Cargo/menu-purchasing.php`. d1-fidelity-admin.md §5 row "Admin cart-build" — "*Not in the admin route tree. Add the admin cart screens.*"
**What legacy shows:** The customer's 151-item cart **as the admin sees it** — staff can review/edit a customer's cart before placing the order on their behalf.
**Intended Pacred behavior:** `purchasing.cart` icon `ShoppingCart` — staff-side cart view.
**Fix recommendation:** 🅲 BUILD — paired with `cart/add` below. Needs customer-picker → cart table + edit/remove + "place order" button calling `addOrder`. Reuses the customer cart logic.
**Effort:** ~5h.
**Severity:** 🟠 weekly-used — sales reps + CS use it to handle phone orders.

---

### /admin/service-orders/cart/add

**Legacy equivalent:** `pcs-admin/cart/add/` ("เพิ่มสินค้าในรถเข็น") on `OOP/Cargo/menu-purchasing.php`. d1-fidelity-admin.md §5 row "Admin cart-build" — "*staff assembles a 101/151-item cart FOR a customer, then `addOrder`*".
**What legacy shows:** An add-item form (URL / shop ID / qty / size / colour) the admin uses to push items into a customer's cart.
**Intended Pacred behavior:** `purchasing.cartAdd` icon `Plus` — sibling of `cart` above.
**Fix recommendation:** 🅲 BUILD — paired with `cart` above; same effort estimate is shared. Implementation: form + Zod + server action + redirect to `/admin/service-orders/cart`.
**Effort:** ~3h (≈8h for the pair if done together).
**Severity:** 🟠 weekly-used — required for the staff-place-order flow above.

---

### /admin/service-orders/notes

**Legacy equivalent:** `pcs-admin/forwarder-action.php?action=NoteShop` ("หมายเหตุฝากสั่ง") — d1-fidelity-admin.md §5 row "หมายเหตุฝากสั่ง": "*Add the shop-note queue.*"
**What legacy shows:** Order queue filtered to rows with `hNote<>'' AND hStatus NOT IN (5,6)`. Badge-counted.
**Intended Pacred behavior:** `purchasing.note` icon `MessageSquare`, badge `shopNote` — sibling of `forwarder.note`; staff daily follow-up queue.
**Fix recommendation:** 🅱 FILTER-REWIRE → `/admin/service-orders?q=note` (extend the existing list query). Same pattern as `forwarders/notes`. Compute `shopNote` badge from the same query.
**Effort:** ~1.5h.
**Severity:** 🔴 daily-flow blocker (badge-driven workflow).

---

### /admin/service-orders/search

**Legacy equivalent:** `pcs-admin/shop-search.php` ("ค้นหาฝากสั่งซื้อ") on `OOP/Cargo/menu-purchasing.php`. d1-fidelity-admin.md §5 row "ค้นหาฝากสั่งซื้อ" — "*Acceptable; legacy has it as its own sidebar item.*"
**What legacy shows:** Dedicated search page for an order by `hNo` (P-number) / customer / status.
**Intended Pacred behavior:** `purchasing.search` icon `Search` — top of the purchasing accordion.
**Fix recommendation:** 🅱 FILTER-REWIRE → `/admin/service-orders?focus=search` (auto-focus the existing inline search bar — same pattern as customers/forwarders).
**Effort:** ~0.5h.
**Severity:** 🟠 weekly-used.

---

### /admin/wallet/add

**Legacy equivalent:** `pcs-admin/wallet/add/` ("เพิ่มรายการเติมเงิน") on `OOP/Cargo/menu-wallet.php`. d1-fidelity-admin.md §8 row "Menu items" lists it; "*Add … if missing.*"
**What legacy shows:** A form for staff to MANUALLY add a deposit (e.g. cash received in office, bank transfer not auto-matched) — picks customer + amount + bank + memo, INSERTs `tb_topup`.
**Intended Pacred behavior:** `wallet.add` icon `Plus` — staff-side manual topup, sibling of the auto-deposit approval queue.
**Fix recommendation:** 🅲 BUILD — money-touching, can't be filter-rewired. Form + Zod + `createTopup` server action with `created_by_admin_id` audit field. Approval auto-marked (admin = approver). PDF receipt downstream.
**Effort:** ~4h (form + action + receipt hook + audit-log row).
**Severity:** 🔴 daily-flow blocker — accounting + CS need it for cash/manual-bank topups.

---

### /admin/wallet/history

**Legacy equivalent:** `pcs-admin/wallet/history/` ("ประวัติรายการ") on `OOP/Cargo/menu-wallet.php`. d1-fidelity-admin.md §8 lists it.
**What legacy shows:** Unified wallet-ledger history (all topups + withdrawals + pay-on-behalf + refunds + adjustments, by date / customer / type). The complete `tb_wallet_log` viewer.
**Intended Pacred behavior:** `wallet.history` icon `History` — the audit/lookup pane for any wallet enquiry.
**Fix recommendation:** 🅲 BUILD — there's no unified wallet history page (the per-customer wallet detail at `/admin/customers/[id]` shows a sub-list, but no global view). Query `wallet_ledger` table + filter UI (date / customer / type / direction).
**Effort:** ~5h.
**Severity:** 🟠 weekly-used (CS lookups, accounting recon).

---

### /admin/wallet/pay-user

**Legacy equivalent:** `pcs-admin/pay-users.php` ("จ่ายแทนลูกค้า") on `OOP/Cargo/menu-wallet.php`. d1-fidelity-admin.md §8 row "จ่ายแทนลูกค้า" — "*verify; Confirm the pay-on-behalf page exists and is reachable from the wallet menu.*"
**What legacy shows:** Staff debit a customer's wallet to pay a service charge (ค่าตู้, ค่าขนส่ง, ค่าซ่อม) on their behalf — picks customer → amount → memo → confirm.
**Intended Pacred behavior:** `wallet.payUser` icon `HandCoins` — second item in the wallet menu, used multiple times daily.
**Fix recommendation:** 🅲 BUILD — `/admin/payment/page.tsx` currently *redirects* to `/admin/yuan-payments`, so there is no real pay-on-behalf page. Needs customer-picker → amount + memo + reference → wallet debit action + ledger row + receipt.
**Effort:** ~5h.
**Severity:** 🔴 daily-flow blocker — daily-use accounting tool, money-touching.

---

### /admin/yuan-payments/new

**Legacy equivalent:** `pcs-admin/payment/add/` ("เพิ่มรายการ") on `OOP/Cargo/menu-payment.php`. d1-fidelity-admin.md §9 row "Menu" — "*add `เพิ่มรายการ` (admin-create).*"
**What legacy shows:** Admin-create form for a yuan-transfer / MOMO payment on a customer's behalf — picks customer → amount (CNY) → recipient (Alipay/WeChat/bank) → slip upload → INSERT to `tb_payment` at `pStatus=1`.
**Intended Pacred behavior:** `payment.add` icon `Plus` — second item in the yuan-payments menu, lets staff queue a transfer phoned-in by a customer.
**Fix recommendation:** 🅲 BUILD — no admin-create yuan-payment route exists. Form + Zod (CNY amount, recipient channel, slip) + `createYuanPayment` action + redirect to `/admin/yuan-payments/[id]`.
**Effort:** ~5h.
**Severity:** 🟠 weekly-used — operators handle phone-in transfers throughout the day.

---

## 16. SUMMARY

| # | href | Recommendation | Effort | Severity |
|---|---|---|---|---|
| 1 | `/admin/customers/search` | 🅱 rewire `?focus=search` | 0.5h | 🟠 |
| 2 | `/admin/forwarders/combine-bill` | 🅲 build (multi-row bill consolidator + PDF) | 6h | 🔴 |
| 3 | `/admin/forwarders/container-cost-check` | 🅰 stub (Phase-C, Sheets API) | 0.5h | 🟡 |
| 4 | `/admin/forwarders/new` | 🅲 build (admin-create forwarder + PCS auto-fill) | 5h | 🔴 |
| 5 | `/admin/forwarders/notes` | 🅱 rewire `?q=note` + wire `forwarderNote` badge | 1.5h | 🔴 |
| 6 | `/admin/forwarders/search` | 🅱 rewire `?focus=search` | 0.5h | 🟠 |
| 7 | `/admin/forwarders/warehouse-history` | 🅲 build (re-link/correct screen + audit) | 6h | 🔴 |
| 8 | `/admin/service-orders/cart` | 🅲 build (admin-side cart viewer) | 5h | 🟠 |
| 9 | `/admin/service-orders/cart/add` | 🅲 build (paired with #8 — ~3h marginal) | 3h | 🟠 |
| 10 | `/admin/service-orders/notes` | 🅱 rewire `?q=note` + wire `shopNote` badge | 1.5h | 🔴 |
| 11 | `/admin/service-orders/search` | 🅱 rewire `?focus=search` | 0.5h | 🟠 |
| 12 | `/admin/wallet/add` | 🅲 build (manual topup form + audit) | 4h | 🔴 |
| 13 | `/admin/wallet/history` | 🅲 build (unified ledger viewer) | 5h | 🟠 |
| 14 | `/admin/wallet/pay-user` | 🅲 build (pay-on-behalf form, supersedes `/admin/payment` redirect) | 5h | 🔴 |
| 15 | `/admin/yuan-payments/new` | 🅲 build (admin-create yuan transfer) | 5h | 🟠 |

**Totals:** 4 rewires (≈4h) · 1 stub (0.5h) · 10 builds (≈45h) · 0 deletes. Grand total ≈ **49.5h** for full faithfulness.

---

## 17. EXECUTION ORDER (recommended for ภูม)

**Wave A — 4h of cheap wins (do these first, today):**
1. The four 🅱 filter-rewires + the 🅰 stub: #1, #5, #6, #10, #11, #3.
   - All ≤1.5h each. **Eliminates 6/15 broken links + restores 2 badge counts** (`shopNote`, `forwarderNote`) which are §1.4 "#1 daily-workflow regression". After Wave A, 9 broken links remain — but every staffer's daily badge-driven queues work.

**Wave B — daily blockers (next, ~17h):**
2. `/admin/forwarders/notes` + `/admin/service-orders/notes` badge wiring is already in Wave A; now build the rest of the 🔴 set in this order:
   - #14 `/admin/wallet/pay-user` (5h) — money-touching, called multiple times/day.
   - #12 `/admin/wallet/add` (4h) — manual topup; CS + accounting need it daily.
   - #4 `/admin/forwarders/new` (5h) — onboard walk-in/phone parcels.
   - #7 `/admin/forwarders/warehouse-history` (6h) — warehouse-role 🔴 block (badge-driven).

**Wave C — revenue/print (next, ~6h):**
3. #2 `/admin/forwarders/combine-bill` (6h) — รวมบิล is one of the top fidelity gaps (d1-fidelity-admin.md §7 + §13 #5). Customers receive these bills.

**Wave D — 🟠 weekly-used (last, ~18h):**
4. #15 yuan/new (5h) → #13 wallet/history (5h) → #8 + #9 admin cart pair (~8h).

**Stop after Wave A if time-boxed** — that single sub-day spend zeroes out 6 broken links + restores the badge-driven workflow, which is the most-felt daily regression.
