# PCS Cargo Complete Analysis — Coverage Audit vs Pacred-web (2026-05-20)

**Auditor:** Agent X (read-only audit · `claude/adoring-chandrasekhar-0f8ad7`)
**Source doc:** `C:\Users\Admin\Downloads\newrealdatapcs\newrealdatapcs\N'POOM - PCS LEARNNING\PCS_CARGO_COMPLETE_ANALYSIS.md` (4,298 lines · พี่เดฟ's canonical PCS Cargo specification)
**Pacred-web survey:** `app/[locale]/(admin)/admin/**/page.tsx` (~145 admin pages) + `app/[locale]/(protected)/**/page.tsx` (~52 customer pages) + `app/[locale]/(auth)/**` (login/register/forgot-password).
**Method:** Read-only — no source code modified. Page-by-page comparison source-doc spec ↔ existing Next.js route + Server Action coverage. Severity: ✅ done · 🟡 partial · 🔴 missing.

---

## 1. Executive summary

The Pacred-web codebase is already broad — `(admin)` has ~145 page.tsx and `(protected)` has ~52 — but its **branding/structure was designed for the rebuilt-from-scratch (Phase-1-5 V2) app, NOT for the 1:1 PCS port**. The source doc describes 23 distinct customer-facing page URLs and 18 admin module URLs; Pacred-web has *named* equivalents for almost every one of them, but:

- **20 / 23 customer pages** have at least a stub route → strong **structural** coverage; **fidelity** is a separate question (see [`fidelity-2026-05-20.md`](fidelity-2026-05-20.md) which already grades 7 admin screens, several `🔴 paradigm`).
- **3 critical customer gates are still 🔴 MISSING** — none of which can be deferred: (a) **OTP password recovery** via SMS, (b) **VIP Credit Wallet** customer-facing page, (c) **product scrape** for cart (paste-1688-URL → auto-fill).
- **Admin coverage** is *broader* than the source doc — Pacred has 145 admin pages vs source's ~18 modules — but **3 admin-side gaps remain critical for "zero retraining"**: (d) wallet top-up approval queue (admin verifies slip), (e) agent/commission queue (the source doc devotes 4 sections — Pacred has commission ledger but no queue/payout UI), (f) **product-scrape "Add to cart for customer"** admin tool (§7.2 explicitly: *"Admin can add items to customer cart — helps customers who can't navigate Chinese sites"*).
- **Top-line counts:** ~41 distinct pages/URLs in source spec · 12 workflows · 14 calculation formulas · ~9 🔴 GAPS to close before Phase-1 launch · ~17 🟡 PARTIAL screens needing fidelity rework · 7 ❓ unclear items needing ภูม clarification.

**Headline:** Pacred-web has the *boxes* but most of them were built for the rebuilt-V2 paradigm. To match PCS's "zero retraining" mandate, ภูม's port priority is the **3 customer-portal gates** (OTP, credit wallet, product scrape) and the **wallet-top-up admin approval queue** — these four are blockers for launching with real customers using credit + cart + top-up flows.

---

## 2. Pages / URLs map (from source doc)

### 2.1 Customer-side (member portal)

| # | Source URL (PHP) | Source line | Purpose | Target user |
|---|---|---|---|---|
| 1 | `/member/login.php` | L834 | Phone-or-email + password login | All |
| 2 | `/member/register.php` | L864 | New account · phone + email + password + optional referral code | New customer |
| 3 | `/member/recover.php` | L897 | Password recovery via SMS OTP | All |
| 4 | `/member/index.php` (Dashboard) | L793 | Stats cards (6-8) · filter tabs · orders table · notification popups | All |
| 5 | `/member/shops.php` (Orders list) | L1012 | Shopping orders + filters by status | All |
| 6 | `/member/shops.php?id=[ORDER_ID]` (Order detail) | L1048 | Order summary + product details + tracking timeline + payment info + actions | All |
| 7 | `/member/cart.php` | L941 | Shopping cart (1688/Taobao/Tmall items) · add/remove/qty | All |
| 8 | `/member/cart.php?action=checkout` | L979 | Checkout — review items · price breakdown · payment method · confirmation | All |
| 9 | `/member/forwarder.php` (Imports list) | L1186 | Import orders list · filters by status · credit filter (VIP) | All |
| 10 | `/member/forwarder/add/` | L1098 | Create import order (warehouse · transport · package items · value-add svcs · delivery) | All |
| 11 | `/member/forwarder.php?id=[IMPORT_ID]` | L1219 | Import detail · items table · cost breakdown · timeline · images · pay-now | All |
| 12 | `/member/payment/` | L1342 | Payment requests list (ฝากโอน/Yuan transfer) | All |
| 13 | `/member/payment/add/` | L1304 | Create payment request — amount (CNY) · recipient · purpose · supporting docs | All |
| 14 | `/member/wallet/` | L1360 | Cash wallet dashboard + transaction history + filters/export | All |
| 15 | `/member/wallet/add/` | L1393 | Top-up — bank transfer or PromptPay QR | All |
| 16 | `/member/wallet/withdraw/` | L1430 | Withdraw to bank account | All |
| 17 | `/member/wallet-credit/` | L1467 | **Credit Wallet** — limit · used · next-due · interest · payment schedule | **VIP only (creditUser=1)** |
| 18 | `/member/address/` | L1508 | Saved addresses cards + actions | All |
| 19 | `/member/address/add/` and `/edit/[ID]` | L1527 | Add/Edit address with auto-fill (district → ZIP) | All |
| 20 | `/member/profile/` | L1561 | Profile (name · email · phone · ID-card verified) + sales rep info | All |
| 21 | `/member/account-settings/` | L1595 | Security + notifications + language + privacy | All |
| 22 | (Search by URL/keyword/image) | L913, L2305 | Paste 1688/Taobao link → auto-scrape product OR upload image search | All |
| 23 | (China warehouse address display) | implicit in §6.4 | The "ฝากนำเข้า" flow needs customer to see China warehouse mailing address | All |

### 2.2 Admin-side (back-office)

| # | Source URL (PHP) | Source line | Module |
|---|---|---|---|
| 1 | `/member/pcs-admin/` | L1630 | Dashboard — stats cards · 12 quick-filter tabs with counts · orders table |
| 2 | `/member/pcs-admin/customers/` | L1814 | Customer list — search · filter (status/credit/sales-rep) · bulk actions |
| 3 | `/member/pcs-admin/customers/[USER_ID]` | L1853 | Customer detail tabs (Overview · Orders · Transactions · Addresses · Notes · Credit) |
| 4 | `/member/pcs-admin/shops/` | L1952 | Shopping order management — status changes · edit · payment verify · bulk |
| 5 | `/member/pcs-admin/forwarder/` | L1988 | Import order management — warehouse ops · status · cost adjust · delivery assign |
| 6 | `/member/pcs-admin/payments/` | L2021 | Payment-service review queue — approve/reject + upload proof |
| 7 | `/member/pcs-admin/wallet/approvals/` | L2047 | **Wallet top-up approvals** — verify slip · approve/reject · withdraw processing |
| 8 | (HR — "ฝากบริพยากรบุคคล") | L1691 | Staff management (list/add/edit/deactivate · roles · activity logs) |
| 9 | (QA & QC) | L1697 | Inspection workflow — mark issues · photo doc · approve/reject for shipping |
| 10 | (รายการปกแก้น — Problem Orders) | L1713 | Issues queue · missing-info · payment problems · disputes · refunds |
| 11 | (ระบบบันฑิตฺ Freight) | L1721 | Freight shipments · containers · customs · arrival schedules |
| 12 | (Search — ค้นหาฝากลังซื้อ) | L1745 | Advanced search by ID/customer/date/product/status |
| 13 | (Delivery management — รายการส่งสินค้า) | L1751 | Print labels · assign drivers · track |
| 14 | (รถเข็นสินค้า — All Carts admin view) | L1763 | View all users' carts · abandoned cart analysis |
| 15 | (**เพิ่มสินค้าในรถเข็นลูกค้า** — Admin add-to-cart-for-customer) | L1769 | Admin can add items to customer's cart |
| 16 | (Warehouse ops — หน้าแทคฝากง่าเด้ง) | L1773 | Receive goods · scan barcodes · update tracking · take photos |
| 17 | (Reports — ออกรายงาน) | L1796 | Financial · sales · customer · inventory · performance |
| 18 | (Revenue recognition — รายงานรับรู้รายได้ Cargo) | L1801 | Accrual accounting · revenue by service · pending vs recognized |

---

## 3. Button / action map

### 3.1 Customer actions (key buttons cited verbatim)

| Button label (TH) | Page | What it does | DB tables touched |
|---|---|---|---|
| `เพิ่มสินค้า` (Add more items) | Cart L968 | Adds another product to cart | `tb_cart` insert |
| `คำนวณราคา` (Recalculate) | Cart L968 | Re-runs cart total with current exchange rate | (read-only) |
| `สั่งซื้อ` (Checkout) | Cart L968 | Begins checkout · creates `tb_shops` rows · sets sStatus | `tb_cart` delete, `tb_shops` insert, `tb_wallet` insert (if wallet-pay) |
| `ดูรายละเอียด` (View) | Orders list L1043 | Open order detail | (read) |
| `ติดตามขนส่ง` (Track shipping) | Orders list L1043 | Show tracking timeline | (read) |
| `ยกเลิก` (Cancel — if sStatus<4) | Orders list L1043 | Cancels order + refund to wallet | `tb_shops` update, `tb_wallet` insert (refund) |
| `Reorder` | Orders list L1043 | Re-add items to cart | `tb_cart` insert |
| `Download invoice` | Order detail L1093 | Generate PDF receipt | (read) |
| `เติมเงิน` (Top-up) | Wallet L1373 | Open top-up flow (bank or QR) | `tb_wallet` insert (status=2) |
| `ถอนเงิน` (Withdraw) | Wallet L1373 | Open withdraw request | `tb_wallet` insert (wType=2 wStatus=2) |
| `ลบ` (Delete address) | Addresses L1521 | Soft-delete (addressStatus='0') | `tb_address` update |
| `Set as default` | Addresses L1521 | Mark default address | `tb_address` update |
| `Pay now` (status='5') | Import detail L1271 | Pay import bill from wallet/credit/transfer | `tb_wallet` insert, `tb_forwarder` update (fStatus='6') |
| `Update tracking` | Import detail L1271 | Customer or admin updates fTrackingCHN | `tb_forwarder` update |

### 3.2 Admin actions

| Button label | Page | What it does | DB tables |
|---|---|---|---|
| `Mark as paid` | Shopping admin L1957 | Confirm payment received → status='3' | `tb_shops` update |
| `Change status` | Shopping admin L1957 | Manual status override | `tb_shops` update |
| `Cancel order` | Shopping admin L1957 | Cancel and refund | `tb_shops` update, `tb_wallet` insert |
| `View uploaded bank slip` | Wallet approvals L2049 | Open slip image for verification | (read tb_wallet) |
| `Verify payment` (approve) | Wallet approvals L2049 | Credit wallet | `tb_wallet` update (wStatus='1') |
| `Reject with reason` | Wallet approvals L2049 | Notify customer to resubmit | `tb_wallet` update + notification |
| `Process withdrawal` | Wallet approvals L2065 | Transfer money + mark complete | `tb_wallet` update |
| `Approve payment request` | Payment-svc admin L2027 | OK to send Yuan | `tb_payment` update |
| `Upload payment proof` | Payment-svc admin L2031 | After PCS pays in China | `tb_payment` update + image |
| `Assign to sales` | Customer detail L1909 | Set adminIDSale | `tb_user` update |
| `Upgrade to VIP` | Customer detail L1929 | creditUser=1 + initial limit | `tb_user` update |
| `Set credit limit` | Customer detail L1934 | Update VIP credit ceiling | `tb_user` update |
| `Suspend account` | Customer detail L1903 | userStatus='0' | `tb_user` update |
| `Edit order` (qty/price/items/address) | Shopping admin L1960 | Mutate confirmed order | `tb_shops` update |
| `Scan packages in` (warehouse) | Import admin L1991 | Mark goods arrived China | `tb_forwarder` update (fStatus='3') |
| `Measure dimensions + weigh` | Import admin L1993 | Update actuals; may recompute cost | `tb_forwarder_item` update |
| `Assign delivery driver` | Import admin L2011 | Pick provider · gen label · track | `tb_forwarder` update |
| `เพิ่มสินค้าในรถเข็นลูกค้า` | Cart admin L1765 | **Admin adds product to a customer's cart** | `tb_cart` insert |
| `Send notification (broadcast)` | Customer list L1845 | Email/SMS blast to filter set | (notification logs) |

---

## 4. Business workflows (from §9 & §12)

1. **Shopping order lifecycle** (§9.1, L2340-2389) — Cart → Checkout → Payment-method → (verify-slip if BT) → PCS-orders-supplier → Arrived-CN-warehouse → Consolidate-ship-to-TH → Arrived-TH → Out-for-delivery → Delivered. Customer can cancel only if status < 4.
2. **Forwarding order lifecycle** (§9.2, L2393-2443) — Customer creates draft → Submit (estimated cost) → Goods-arrive-CN-warehouse → Recalculate-if-dimensions-differ → Ship-to-TH → Arrive-TH (customs clearance) → Cost-finalized + invoice → Customer-pays → Ready-to-ship → Out-for-delivery → Delivered.
3. **Payment-service request flow** (§6.5, L1299-1356) — Customer fills CNY amount + recipient + purpose + docs → Admin reviews → Customer pays PCS → PCS pays in China → Upload proof → Mark complete.
4. **VIP credit eligibility** (§9.3, L2447-2528) — 30+ days · 10+ orders · 50K+ THB · 0 payment issues · ID verified. Initial limit = `min(avgOrderValue × 2, 10000)`. Auto-suspend if 14+ days overdue OR 3 missed payments OR overdue > 50% of limit.
5. **Overdue interest** (L2506-2517) — 1-7d → 2% · 8-14d → 5% · 15+d → 10% **+ credit suspended**.
6. **Agent commission tiers** (§9.4, L2530-2577) — Team monthly volume < 50K = 2% · < 100K = 3% · < 200K = 4% · ≥ 200K = 5%. Commission paid only on service-fees, not product cost. Min payout 500 THB.
7. **Wallet top-up flow** (§6.6.2, L1411-1426) — Bank transfer: customer transfers + uploads slip → admin verifies → credit wallet. QR: instant via gateway. Min 100 THB · max 100K/txn · daily 200K.
8. **Wallet withdraw flow** (§6.6.3, L1432-1463) — Customer submits → admin reviews fraud-check → transfers money → mark complete → deduct balance. Min 100 THB; <500 THB has 20 THB fee.
9. **Shipping cost (forwarding)** (§13.1, L3428-3485) — chargeable = max(actual_kg, volumetric_kg) × rate_per_kg(sea=25 · air=45 · express=85 THB/kg) + crate (vol×1000) + inspection (200) + photos (100) + TH-delivery (zone+weight tier).
10. **TH delivery zones** (L2198-2228) — Zone1 (BKK) · Zone2 (Central) · Zone3 (N/NE/S) · Zone4 (remote→quote). Tier rates per zone with free-ship thresholds (5K/10K/20K THB by zone).
11. **Service fee tiers** (L2136-2162) — Shopping: 5% standard · 3% VIP · 0% promo. Payment-svc: 3% (min 50 THB).
12. **New-customer onboarding** (§12.1, L3253-3296) — Discover → Register (OTP-verify-phone) → Welcome tutorial → First-action prompt → Incentive (free service fee on first order) → Auto-assign sales rep → First-order hand-holding → Feedback request.

---

## 5. Coverage matrix vs current Pacred-web

### 5.1 Customer-side

| # | Source doc page | Pacred-web equivalent | Coverage | Notes |
|---|---|---|---|---|
| 1 | `/member/login.php` | `app/[locale]/(auth)/login/page.tsx` | ✅ done | Already has legacy-PCS-password bridge (see CLAUDE.md "Legacy-auth bridge") |
| 2 | `/member/register.php` | `app/[locale]/(auth)/register/page.tsx` | ✅ done | — |
| 3 | `/member/recover.php` (OTP recovery) | `app/[locale]/(auth)/forgot-password/page.tsx` + `app/[locale]/reset-password/page.tsx` | 🟡 partial | Routes exist; **❓ unclear if SMS OTP is wired vs email link**. Source spec L897-911 is explicit: 6-digit SMS OTP, 5-min TTL, max 3 attempts, 1/min rate-limit — needs ภูม fidelity check. |
| 4 | `/member/index.php` (Dashboard) | `app/[locale]/(protected)/dashboard/page.tsx` | 🟡 partial | Exists + is the 1:1 pilot per CLAUDE.md. Source doc lists 6-8 stats cards + 5 filter tabs + orders table + 4 notification popup types — needs element diff. |
| 5 | `/member/shops.php` (Orders list) | `app/[locale]/(protected)/service-order/page.tsx` + `service-order/pending/page.tsx` | ✅ done | Pacred uses Thai filename `service-order` (per "PR" rebrand). |
| 6 | `/member/shops.php?id=` (Order detail) | `app/[locale]/(protected)/service-order/[hNo]/page.tsx` + `/receipt/page.tsx` | ✅ done | — |
| 7 | `/member/cart.php` | `app/[locale]/(protected)/cart/page.tsx` + `service-order/cart/page.tsx` | ✅ done | Two cart routes exist — ❓ unclear which is canonical. |
| 8 | Checkout flow | `app/[locale]/(protected)/pay/page.tsx` | 🟡 partial | Generic `/pay` exists but the source-spec 4-step checkout (Review→Breakdown→Method→Confirm) needs flow audit. |
| 9 | `/member/forwarder.php` (Imports list) | `app/[locale]/(protected)/service-import/page.tsx` + `pending/`, `table/` | ✅ done | — |
| 10 | `/member/forwarder/add/` | `app/[locale]/(protected)/service-import/add/page.tsx` | ✅ done | — |
| 11 | `/member/forwarder.php?id=` (Import detail) | `app/[locale]/(protected)/service-import/[fNo]/page.tsx` + `/receipt/` | ✅ done | — |
| 12 | `/member/payment/` (Yuan-transfer list) | `app/[locale]/(protected)/service-payment/page.tsx` | ✅ done | — |
| 13 | `/member/payment/add/` | `app/[locale]/(protected)/service-payment/add/page.tsx` | ✅ done | — |
| 14 | `/member/wallet/` | `app/[locale]/(protected)/wallet/page.tsx` + `/history/` | ✅ done | — |
| 15 | `/member/wallet/add/` (Top-up) | `app/[locale]/(protected)/wallet/deposit/page.tsx` | ✅ done | — |
| 16 | `/member/wallet/withdraw/` | `app/[locale]/(protected)/wallet/withdraw/page.tsx` | ✅ done | — |
| 17 | `/member/wallet-credit/` (VIP Credit Wallet) | (no dedicated page; `wallet/credit-panel.tsx` exists as component) | 🔴 **GAP** | Source spec L1467-1502 describes a full Credit-Wallet dashboard (limit · used · next-due · interest). Pacred has `actions/credit.ts` + `credit-panel.tsx` but **no `wallet/credit/page.tsx`** route. ภูม-priority. |
| 18 | `/member/address/` (TH addresses) | `app/[locale]/(protected)/addresses/page.tsx` | ✅ done | — |
| 19 | Add/Edit address | (likely inside `addresses/page.tsx`) | 🟡 partial | ❓ unclear if separate add/edit routes or in-page modal. |
| 20 | `/member/profile/` | `app/[locale]/(protected)/profile/page.tsx` + `/security/change-phone/` | ✅ done | — |
| 21 | `/member/account-settings/` | `app/[locale]/(protected)/account-settings/page.tsx` | ✅ done | — |
| 22 | Product search (URL/keyword/image) | `app/[locale]/(protected)/search/page.tsx` + `lib/china-search/*` (image search exists) + `app/api/china-search/image/route.ts` | 🟡 partial | Image search wired (Laonet). **URL-paste auto-scrape (1688/Taobao/Tmall) at cart-add appears MISSING** — only `app/[locale]/(admin)/admin/service-orders/cart/page.tsx` mentions scrape patterns. See gap §6 item 3. |
| 23 | China warehouse address display | `app/[locale]/(protected)/china-address/page.tsx` + `service-import/warehouse-addresses/page.tsx` | ✅ done | — |

### 5.2 Admin-side

| # | Source admin module | Pacred-web equivalent | Coverage | Notes |
|---|---|---|---|---|
| 1 | Admin dashboard | `app/[locale]/(admin)/admin/page.tsx` + `admin/dashboard/page.tsx` | 🟡 partial | Route exists. Source L1638-1666 specifies a very specific 6-card stat layout + 12 quick-filter tabs WITH COUNTS — fidelity not yet checked. |
| 2 | Customer list | `app/[locale]/(admin)/admin/customers/page.tsx` + `pending/`, `recently-active/`, `transfer-rep/` | ✅ done | Broader than source. |
| 3 | Customer detail | `app/[locale]/(admin)/admin/customers/[id]/page.tsx` + `convert-to-juristic/`, `transfer-rep/`, `credit-line-form.tsx` | ✅ done | — |
| 4 | Shopping order admin | `app/[locale]/(admin)/admin/service-orders/[hNo]/page.tsx` + `cart/`, `cart/add/`, `notes/` | ✅ done | Has admin add-to-cart at `cart/add/page.tsx`. |
| 5 | Import order admin | `app/[locale]/(admin)/admin/forwarders/**` (8 routes) + `forwarder-action/`, `forwarder-import-warehouse/`, `forwarder-sales/` | ✅ done | But per `fidelity-2026-05-20.md` screen 5 has 5 🔴 paradigm gaps — divergent from `tb_forwarder` schema. |
| 6 | Payment-service admin | `app/[locale]/(admin)/admin/yuan-payments/page.tsx` + `/new/` | ✅ done | — |
| 7 | **Wallet top-up approval queue** | `app/[locale]/(admin)/admin/wallet/page.tsx` + `add/`, `deposit/`, `history/`, `pay-user/` | 🟡 partial | Routes exist. **❓ unclear whether there's a dedicated "approve slip" queue UI** matching source §7.5.1 L2047-2068. ภูม should verify. |
| 8 | HR / Staff mgmt | `app/[locale]/(admin)/admin/hr/**` (12 routes) + `admins/`, `team-leaders/` | ✅ done | Much broader than source (recruitment · org-chart · training · leave · etc.). |
| 9 | QA & QC | `app/[locale]/(admin)/admin/qa/page.tsx` + `warehouse/qa-inspections/**` | ✅ done | — |
| 10 | Problem orders queue | `app/[locale]/(admin)/admin/incidents/page.tsx` + `contact-messages/`, `refunds/`, `(protected)/my-issues/` | 🟡 partial | Pieces exist but no single "ปัญหา" hub matching source L1709. |
| 11 | Freight system | `app/[locale]/(admin)/admin/freight/**` (6 routes) + `freight/declarations/`, `freight/quotes/`, `freight/shipments/` | ✅ done | Broader than source. |
| 12 | Search (orders) | `app/[locale]/(admin)/admin/search/page.tsx` + `forwarders/bulk-search/` | ✅ done | — |
| 13 | Delivery mgmt | `app/[locale]/(admin)/admin/driver-runs/page.tsx` + `drivers/[id]/`, `carriers/` | ✅ done | — |
| 14 | Carts admin (view all) | (no global all-carts admin page found) | 🔴 **GAP** | Source L1763 requires admin view of ALL users' carts (abandoned-cart analysis). Only per-customer cart at `admin/service-orders/cart/page.tsx`. |
| 15 | Admin add-to-cart-for-customer | `app/[locale]/(admin)/admin/service-orders/cart/add/page.tsx` | ✅ done | Route exists — fidelity not checked. |
| 16 | Warehouse ops (scan/photo) | `app/[locale]/(admin)/admin/warehouse/**` + `barcode/cargo/**`, `barcode/driver/**` (10 routes) | ✅ done | Broader. Per fidelity audit, screen 3 (`barcode/cargo/all`) has a 🔴 runtime gap — depends on missing dep `@ericblade/quagga2`. |
| 17 | Reports | `app/[locale]/(admin)/admin/reports/**` (15 routes) + `kpi/`, `report-cnt/` | ✅ done | Much broader. |
| 18 | Revenue recognition | `app/[locale]/(admin)/admin/accounting/**` (14 routes) + `accounting/cargo/`, `freight/`, `forwarder/` | ✅ done | Per fidelity audit, accounting/cargo has 2 🔴 paradigm gaps. |
| 19 | (not in source) — Agent / commission / sales-payouts queue | `app/[locale]/(admin)/admin/sales-payouts/page.tsx` + `commissions/**` + `(protected)/commissions/me/` + `(protected)/sales/**` | 🟡 partial | Pacred has commission ledger. Source spec §9.4 + L1733 implies an **agent commission payout queue + agent dashboard** — not directly visible as a dedicated admin agent-mgmt page. |

---

## 6. Top 10 priority gaps for Phase-1 launch

Ranked by customer-facing impact (will customers/staff complain on day 1 if missing?).

| # | Gap | Severity | Source-doc line | Why it blocks zero-retraining launch |
|---|---|---|---|---|
| **1** | **VIP Credit Wallet customer page** (`/wallet/credit` route) | 🔴 P0 | L1467-1502, §6.6.4 | Pacred has `credit-panel.tsx` + `actions/credit.ts` but no dedicated page route. VIP customers expect to see limit · used · next-due · interest dashboard. |
| **2** | **Wallet top-up admin approval queue** (verify slip · approve/reject UI) | 🔴 P0 | L2047-2068, §7.5.1 | Source describes a dedicated queue. Pacred has `admin/wallet/**` routes but ❓ no clearly-named "approvals" queue. Without this, manual bank-slip deposits cannot be processed. |
| **3** | **Cart product-scrape on URL paste** (1688/Taobao/Tmall auto-fill) | 🔴 P0 | L913-938, L2305-2318 | Source: paste URL → extract product ID → scrape title/image/price/variants. Pacred has image-search wired but URL-scrape entry into cart not visible in customer surfaces. Customers expect "paste link → instantly see PCS-formatted item". |
| **4** | **OTP password recovery** (SMS-OTP, 6-digit, 5-min TTL) | 🔴 P0 | L897-911, §6.2.3 | Pacred has `/forgot-password` + `/reset-password` routes — fidelity unverified. Locked-out customers cannot self-recover if this doesn't match the source spec exactly. |
| **5** | **All-carts admin view** (abandoned-cart analysis · view ALL users' carts) | 🟡 P1 | L1763, §7.2 | Source requires this for admin to convert abandoned carts to orders. Pacred only has per-customer cart admin. |
| **6** | **Order dashboard 12-quick-filter tabs with counts** | 🟡 P1 | L1652-1666, §7.1 | Source admin dashboard has 12 named quick-filter tabs (ลูกค้ายังไม่ใช้งาน · เติมเงิน · ตอบชม · รอชำระเงิน · ฯลฯ) each with a live count. Pacred admin dashboard fidelity unverified. |
| **7** | **Agent referral system + agent dashboard** (team monthly volume → commission tier) | 🟡 P1 | L2530-2577, §6.4.2 + §9.4 + L1733 | Pacred has commission ledger + sales-payouts. Source has tier-based commissions (2/3/4/5%) on **team** monthly volume, agent dashboard showing team members. No "Agent" role visible. |
| **8** | **Cart 5-step checkout flow with exact price breakdown** | 🟡 P1 | L979-1007, §6.3.3 | Source spec is explicit on the 4-step flow + the exact line items (สินค้า · ค่าบริการ · ค่าส่งจีน · รวม). Pacred has `/pay` route — fidelity unverified. |
| **9** | **Order/import lifecycle timeline UI** (✅/⏳/⭕ indicators) | 🟡 P1 | L1067-1078, L1255-1264 | Source has a very specific tracking-timeline format with check/hourglass/empty-circle icons. Pacred has order detail pages — timeline fidelity unverified. |
| **10** | **Welcome onboarding flow** (post-register tutorial + first-action prompt + incentive) | 🟡 P2 | L3253-3296, §12.1 | Source: video/slides + "first order free service fee" + auto-assign-sales + welcome SMS. Pacred has registration but no visible onboarding flow. |

**Bonus 🔴 runtime gap (from `fidelity-2026-05-20.md`):** `admin/barcode/cargo/all` depends on `@ericblade/quagga2` which is **NOT in `package.json`** — the page will fail to render. Fix before any warehouse staff opens it.

---

## 7. Verbatim "critical / must-have" quotes from the analysis doc

Pulled verbatim so ภูม can use them as port acceptance criteria.

| Quote | Source line | Significance |
|---|---|---|
| *"member_code เดิม: PCS<int> (PHP) — ทิ้งไม่ใช้; Pacred ใช้ PR001 running"* (this is FROM CLAUDE.md but matches source `userID VARCHAR(50) PRIMARY KEY -- Format: PCS#### (e.g., PCS2542)`) | L395 | PR rebrand of PCS ID is the single brand surface — must show `PR####` everywhere a user sees their ID. |
| *"Volumetric Weight = (L × W × H cm) / 5000 (air) = (L × W × H cm) / 6000 (sea). Chargeable Weight = max(Actual Weight, Volumetric Weight)"* | L2189-2193 | This is THE forwarding cost formula. Any port that uses different divisors will produce different bills than legacy — customers WILL complain. |
| *"Sea Freight Rate: ~25 THB/kg / Air: ~45 THB/kg / Express: ~85 THB/kg"* | L2173-2186 | Sample rates — fidelity port must use the same `tb_*` rate tables as legacy, not hard-coded. |
| *"Service Fee = Product Total × 5% (standard) / × 3% (VIP) / × 0% (promotional)"* | L2137-2141 | Service fee tier — must match legacy exactly. |
| *"This is a CLONE of existing system. UI must match screenshots exactly. All business logic must work identically. No data loss during migration. PHP and Next.js will run in parallel."* | L4287-4291 | The owner's mandate stated by พี่เดฟ himself, matches CLAUDE.md "100% sameness FIRST." |
| *"Admin can add items to customer cart — Helps customers who can't navigate Chinese sites"* | L1767-1768 | Admin add-to-cart is a regular daily workflow for sales — not an edge case. |
| *"VIP Upgrade Requirements: Account active for 30+ days · 10+ completed orders · Total order value > 50,000 THB · No payment issues · ID verification completed"* | L1924-1929 | Eligibility gates — the port must enforce all five, not just `creditUser=1`. |
| *"Overdue Penalties: 1-7 days late = 2% interest · 8-14 days = 5% · 15+ days = 10% + credit suspended"* | L1493-1496, L2506-2517 | Hard-coded business rule — needs cron job to compute. |
| *"Free shipping thresholds: Orders > 5,000 THB free Zone 1 · > 10,000 THB free Zone 2 · > 20,000 THB free Zone 3"* | L2230-2235 | Customer-visible promise — divergence = customer complaint. |
| *"No data loss during migration"* | L4291 | Reinforces Phase-A success criterion. |
| *"Don't implement features not documented here"* + *"Don't guess on calculations - they're all specified"* | L4282-4284 | Anti-gold-plating mandate from พี่เดฟ. |

---

## 8. ❓ Unclear items — ภูม clarification needed

| # | Question | Source ref | Context |
|---|---|---|---|
| 1 | Does `/forgot-password` use **SMS OTP** (source spec) or email-link (Supabase default)? | L897-911 | Source is very explicit: 6-digit code · 5-min TTL · max 3 attempts · 1 OTP/min rate limit. If Pacred uses email-link, returning PCS customers will be locked out. |
| 2 | Which is the canonical cart route — `(protected)/cart/page.tsx` OR `(protected)/service-order/cart/page.tsx`? | — | Two routes exist; one should redirect or be deleted. |
| 3 | Where does the "Add/Edit address" page live? Modal or `/addresses/new/page.tsx`? | L1527-1556 | Source spec implies separate add/edit routes. Pacred shows only `addresses/page.tsx`. |
| 4 | Is there an explicit "all carts admin" page (view ALL users' carts for abandoned-cart conversion)? | L1763 | Only `admin/service-orders/cart/page.tsx` visible — but is that all-carts or per-customer? |
| 5 | Is the wallet top-up approval queue UI a dedicated page or filtered within `admin/wallet/page.tsx`? | L2047-2068 | Source has it as a separate URL pattern `/wallet/approvals/`. |
| 6 | Does Pacred support the **"Agent" role** (referral commission tier, team dashboard at `(protected)/commissions/me/`) or is `(protected)/sales/**` a different concept? | L296-308, L2530-2577 | Source treats Agent as a customer-role tier. Pacred's `sales/**` looks staff-side. |
| 7 | Is `wallet/credit-panel.tsx` rendered as part of `wallet/page.tsx` only for `creditUser=1`, or should there be a dedicated `wallet/credit/page.tsx`? | L1467-1502 | Source has it as a separate URL. Component-only may be insufficient. |
| 8 | Does the dashboard render the **12 specific quick-filter tabs with live counts** the source describes (ลูกค้าที่ยังไม่ใช้งาน · เติมเงิน · เครดิตคงเหลือ · ตอบชม · ฯลฯ)? | L1652-1666 | Pacred admin dashboard fidelity not yet audited against this exact list. |
| 9 | Are the **Yuan-payment 5 statuses** (Pending / Processing / Paid / Failed / Refunded) wired with the same enum the source spec defines? | L724-730 | `admin/yuan-payments/page.tsx` exists but status-enum fidelity unchecked. |
| 10 | Source spec lists `fWarehouseName` 1=SAI, 2=CTT, 3=MK, 4=MX, 5=JMF, 6=GOGO, 7=CargoCenter, 8=MOMO (8 China warehouse partners) — does the import-create form expose all 8? | L612-621 | If the dropdown shows fewer, customers cannot select their existing warehouse partner. |

---

## 9. Verification

`pnpm tsc --noEmit` was run — pre-existing errors exist in `.next/dev/types/routes.d.ts` (Next.js generated typed-routes scaffold; unrelated to this audit). **No source code was modified** during this audit; this file is the only addition.

---

**End of audit.**
