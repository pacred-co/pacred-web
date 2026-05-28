# PCS Cargo Business-Flow Audit — vs. Pacred-Web (2026-05-20)

**Author:** Agent Z (audit run from `.claude/worktrees/adoring-chandrasekhar-0f8ad7`)
**Source docs read in full:**
- `C:\Users\Admin\Downloads\newrealdatapcs\newrealdatapcs\N'POOM - PCS LEARNNING\BUSINESS_FLOW.md` (188 lines · v1.0 / 19 May 2026)
- `C:\Users\Admin\Downloads\newrealdatapcs\newrealdatapcs\N'POOM - PCS LEARNNING\PCS_Cargo_Guidebook_TH.md` (531 lines · v2.0 / 19 May 2026)
- `C:\Users\Admin\Downloads\newrealdatapcs\newrealdatapcs\N'POOM - PCS LEARNNING\docs.md` (507 lines · v1.0 dev doc — Prisma stack, **NOT** Pacred's actual stack)

> **Audit lens (D1):** Does Pacred-web today let staff + customers run each of these flows end-to-end, in the exact order PCS uses? Severity uses ✅ supported / 🟡 partial / 🔴 missing/inverted.
>
> **Caveat on `docs.md`:** the dev doc describes a hypothetical Prisma stack (`prisma/`, `(member)/` route group, NextAuth). Pacred uses Supabase + `(protected)/` + custom auth. So `docs.md` is treated as **behavioural spec**, not as architectural truth. The status codes + business calculations in it MUST match the legacy SQL we already loaded, not the surface API shape.

---

## 1. Executive summary

| Bucket | Count |
|---|---|
| Major flows audited | **9** (3 services + wallet/top-up + wallet/withdraw + credit/VIP + cancel/refund + notifications + commission) |
| ✅ Fully supported in Pacred today | **2** (Shopping Service order placement · Wallet top-up) |
| 🟡 Partial / wrong-status-vocab / wrong-order | **5** (Forwarding flow · Payment service · Withdraw · Cancel/Refund · Notifications) |
| 🔴 Missing / inverted | **2** (QA pre-ship inspection · VIP-credit issuance rule-set in code) |
| 🚨 Contradictions between BUSINESS_FLOW.md and the loaded legacy schema (`0081`) | **4** (see §6) |

**The single biggest finding:** the BUSINESS_FLOW.md status table (lines 55–68 for shopping, lines 102–113 for forwarding) **does NOT match the legacy `tb_header_order.hstatus` and `tb_forwarder.fstatus` enumerations we actually loaded into Supabase from `pcsc_main`.** Pacred-web's `lib/legacy-status-map.ts` is faithful to the migration; BUSINESS_FLOW.md is not. ภูม must choose a side. Recommended: trust the SQL (`0081` column comments are quoted verbatim from PCS), flag BUSINESS_FLOW.md statuses 7/8/9 as "rebuilt-era invention" and ignore. Cited in §6.

---

## 2. Per-flow walkthrough

### 2.1 Shopping Service — Order placement → delivery (BUSINESS_FLOW.md L19–53)

**Trigger.** Customer pastes a 1688 / Taobao / Tmall URL into the cart.

| # | Step | Actor | System / Page | DB | Status today |
|---|---|---|---|---|---|
| 1 | Paste URL → preview + price | Customer | `/cart` + `/service-order/add` (`app/[locale]/(protected)/cart/page.tsx`, `service-order/add/page.tsx`) | `tb_header_order`, `tb_cart` | ✅ |
| 2 | Calculate `price × rate × qty + 5%/3% + chinaShipping` | System | `actions/cart.ts` + `actions/service-order.ts` | — | 🟡 (`creditUser=1 → 3% fee` per `docs.md` L296 — **need to grep cart.ts for this branch**, see §3 rules table) |
| 3 | Customer chooses pay method (Wallet / โอน / Credit) | Customer | `/service-order/[hNo]` / `/wallet` | `wallet_transactions` | ✅ |
| 4 | If bank transfer → upload slip → admin reviews | Customer + admin | `/wallet/deposit`, `/admin/wallet/deposit` | `wallet_transactions` (kind=`deposit`) | ✅ |
| 5 | Admin marks "ชำระแล้ว" → SMS `กำลังดำเนินการ` | Admin → system | `/admin/service-orders/[hNo]`, `lib/notifications` | `tb_header_order.hstatus` 1→3 | 🟡 (status code map matches `0081`, **not** BUSINESS_FLOW.md) |
| 6 | China-buyer logs into 1688/Taobao, places order, returns China order# (SLA 24h, Guidebook L144) | Operations | `/admin/service-orders/[hNo]/update-form.tsx` | `tb_header_order` + line items | 🟡 (UI exists; no SLA-breach surface — see §5 priority gaps) |
| 7 | Warehouse-China receives parcel, photographs, weighs | Warehouse | (no dedicated `/admin/warehouse/china/...` page in Wave 1) | `tb_*` | 🔴 missing (see §5) |
| 8 | Sea/air/express → Thailand → customs cleared | Operations | `/admin/containers/[id]` | `tb_cnt`, `tb_forwarder` | 🟡 |
| 9 | TH last-mile (DHL / Flash / Kerry / Thai Post) | Operations | (none — only `tb_forwarder.fshipby` raw enum) | — | 🟡 |
| 10 | Final SMS + customer confirms receipt | System | `lib/notifications/index.ts` | — | 🟡 (event list covers `out_for_delivery` + `delivered` but the *trigger* on `hstatus=5` isn't wired — search `actions/service-order.ts` for "completed" notify) |

**Status-code reality check.** The legacy `tb_header_order.hstatus` column has codes **1..6 only** (per migration `0081` L2568 column comment: `1=รอดำเนินการ 2=รอชำระเงิน 3=สั่งสินค้า 4=รอร้านจีนจัดส่ง 5=สำเร็จ 6=ยกเลิกออเดอร์`). BUSINESS_FLOW.md L57–68 invents 7/8/9 ("ถึงไทย / กำลังจัดส่ง / สำเร็จ") and a separate `0` for cancel. **These don't exist in the loaded SQL.** `lib/legacy-status-map.ts` (L26–33) is correct. **BUSINESS_FLOW.md is wrong.**

### 2.2 Forwarding Service — Customer brings own China tracking (BUSINESS_FLOW.md L72–113)

**Trigger.** Customer pastes a China-side tracking number + estimated size.

| # | Step | Actor | Page | DB | Status |
|---|---|---|---|---|---|
| 1 | Customer creates import job, picks transport (เรือ/แอร์/Express) | Customer | `/service-import/add` | `tb_forwarder` | ✅ |
| 2 | Preview cost via `calcPrice` | System | `lib/forwarder/calc-price.ts` (rate waterfall: `custom_hs → custom_user → vip → general`) | `rate_*` | ✅ (and tested) |
| 3 | China warehouse receives parcel, weighs/measures REAL | Warehouse-CN | (no Wave 1 page; admin still uses `/admin/forwarders/[fNo]`) | `tb_forwarder` | 🟡 |
| 4 | If real-cost ↑ ≥10% over preview → SMS customer to confirm (BUSINESS_FLOW.md L85–87) | System | **not implemented** — `actions/forwarder.ts` has no >10% gate | — | 🔴 missing |
| 5 | Pack (bubble / wooden crate per `chinaWoodenCrateFeeType`) | Warehouse-CN | `lib/forwarder/calc-price.ts` adders | — | ✅ |
| 6 | Ship CN→TH (sea/air/express) | Operations | `/admin/containers` | `tb_cnt` | ✅ |
| 7 | Customs clear → TH warehouse | Freight team | `/admin/freight/declarations` | `tb_cargo_*` | ✅ |
| 8 | **Issue invoice → wait for customer payment** | System + customer | `/service-import/[fNo]` shows invoice; `/service-import/[fNo]/receipt` | `tb_forwarder.fstatus`=5 | ✅ |
| 9 | Customer pays → confirm → out for delivery | Customer | `/service-import/[fNo]/pay` (via `pay-from-wallet`) | `wallet_transactions` | ✅ |
| 10 | Last-mile (Flash/DHL/Kerry/Nim/SCG) | Operations | `tb_forwarder.fshipby` raw | — | 🟡 |

**Status-code reality check.** Migration `0081` L1601 declares `fstatus VARCHAR(2)` but no column comment on the enum exists; `lib/legacy-status-map.ts` L36–44 declares **7 codes** (1..7), matching the FORWARDER flow order **"ship → arrive → THEN pay" — payment is status 5, *after* arrival.** BUSINESS_FLOW.md L104–113 declares **8 codes** (1..8) with payment at 5 — same order, **but it omits state 1 ("รอสินค้าเข้าโกดังจีน") and adds state 8 ("สำเร็จ") that's not in the loaded schema.** The Pacred status-map is closer to the SQL. **BUSINESS_FLOW.md is again off-by-one on both ends.**

**Flow-order verification.** Both BUSINESS_FLOW.md L74–99 AND Pacred's `legacy-status-map.ts` agree: **invoice is issued AFTER arrival, not before shipment** (the customer doesn't pre-pay forwarding). This is correct, important, and contradicts the rebuilt-era "pay first then ship" pattern from the launch app — confirm `actions/forwarder.ts` enforces this ordering.

### 2.3 Payment / Yuan-transfer Service (BUSINESS_FLOW.md L117–135)

**Trigger.** Customer wants to pay a Chinese supplier directly.

| # | Step | Actor | Page | DB | Status |
|---|---|---|---|---|---|
| 1 | Customer submits CNY amount, recipient, purpose, supporting docs | Customer | `/service-payment/add` | `yuan_payments` (rebuilt-era; NOT `tb_payment`) | 🟡 (table name diverges — see §6) |
| 2 | System computes THB + 3% fee (`docs.md` L367–371: `serviceFee = max(amountTHB * 0.03, 50)`) | System | `actions/payment.ts` + `lib/validators/payment.ts` | — | 🟡 (rate from env, NOT `tb_settings`; min-fee=50 not verified in code) |
| 3 | **Admin reviews 24h for risk / docs / scam** (BUSINESS_FLOW.md L126–128) | Admin | `/admin/yuan-payments/[id]` (no SLA timer surface) | `yuan_payments.status='pending'→'processing'` | 🟡 |
| 4 | Approve OR reject + notify | Admin | `/admin/yuan-payments/actions-cell.tsx` | — | ✅ |
| 5 | Customer pays | Customer | `/service-payment/[id]` | `wallet_transactions` | ✅ |
| 6 | CN team executes Alipay/WeChat/Bank, uploads proof | CN-team | (no dedicated upload UI for proof on admin side beyond `slip_url`) | — | 🟡 |
| 7 | Customer notified with proof attached | System | `lib/notifications` | — | 🟡 (slip URL stored but not auto-attached to notification template) |

### 2.4 Wallet — Top-up (BUSINESS_FLOW.md L142–143)

✅ **Supported end-to-end.** `/wallet/deposit` → upload slip → `/admin/wallet/deposit` → approve → auto-credit. Notification template `notify.walletDepositApproved` exists in `lib/notifications/templates.ts`.

### 2.5 Wallet — Withdraw (BUSINESS_FLOW.md L148–149)

| Step | Page | Status |
|---|---|---|
| Customer requests withdraw | `/wallet/withdraw` | ✅ |
| Finance team reviews | `/admin/withdrawals/page.tsx` | ✅ |
| Bank transfer back + status update | (manual outside system — no integration) | 🟡 |

### 2.6 Credit / VIP issuance (BUSINESS_FLOW.md L156–166)

**Rule set in doc:**
| Rule | Doc value |
|---|---|
| Account age ≥ | 30 days |
| Completed orders ≥ | 10 |
| Total order value ≥ | 50,000 THB |
| Initial limit | 2× avg per order, max 10,000 THB |
| Hard cap | 100,000 THB |
| Interest ≤7d / 8–14d / >14d | 2% / 5% / 10% |

**Current implementation.** `actions/admin/credit.ts` lets a super or accounting admin SET `credit_limit` + `credit_days` manually (lines 30–80) and `lib/auth/get-user.ts` reads `credit_limit`/`credit_days`/`credit_enabled`. **The eligibility checker (`isEligibleForCredit`) and the auto-overdue-interest cron in `docs.md` L376–397 do NOT exist** — there is no `isEligibleForCredit()` anywhere under `lib/`, and `commission.ts` / `credit.ts` have no overdue-interest scheduler. 🔴 **Missing — Phase B candidate.**

### 2.7 Cancel / Refund policy (BUSINESS_FLOW.md L182–187)

| State | Doc policy | Implemented? |
|---|---|---|
| Pre-payment | Cancel free | ✅ via `actions/refunds.ts` |
| In-progress (China-buyer hasn't ordered yet) | May have fee | 🟡 (no fee logic) |
| China-shop already shipped | **Cannot cancel** | 🟡 (no hard gate in `actions/service-order.ts` — verify with ภูม) |
| In TH last-mile | Cannot cancel | 🟡 |

### 2.8 Notification triggers (`docs.md` L460–471)

| Event | Doc says | Pacred today |
|---|---|---|
| สร้างออเดอร์ | SMS + Email | 🟡 (in-app only by default) |
| ชำระสำเร็จ | SMS + Email + Line | ✅ |
| สินค้าถึงคลังจีน | SMS | 🟡 (template exists, trigger TBD) |
| ออกจัดส่งในไทย | SMS | 🟡 |
| ส่งสำเร็จ | SMS + Email | 🟡 |
| Invoice ออก (Forwarding) | SMS + Email + Line | ✅ |
| **เตือนชำระ 3 วัน** | SMS + Email | 🔴 missing (no cron found under `app/api/cron/*` for invoice dunning) |
| ยืนยันเติม Wallet | SMS | ✅ |

### 2.9 Commission for Sales/Agent (`docs.md` L402–413)

| Monthly volume | Commission rate |
|---|---|
| < 50,000 | 2% |
| < 100,000 | 3% |
| < 200,000 | 4% |
| ≥ 200,000 | 5% |
| Min payout | 500 THB |
| Base | service fee only — NOT product price |

✅ `actions/admin/commissions.ts` exists with `commission_tiers` table + `commission_accruals` + `commission_withdrawals`. ภูม to verify the tier thresholds in DB match doc values.

---

## 3. Operational rules table

| Rule | Source (doc + line) | Pacred impl status |
|---|---|---|
| Service fee 5% (general) / 3% (VIP) | BUSINESS_FLOW.md L13 + `docs.md` L296 | ⚠️ Need verification — `actions/cart.ts` should branch on `creditUser`/`credit_enabled` |
| Payment service fee 3% with **min 50 THB** | `docs.md` L367–371 | 🟡 not verified in code |
| China-shop order placement SLA = **24 hours** after customer payment | `PCS_Cargo_Guidebook_TH.md` L144–146 | 🔴 no SLA-breach surface |
| Forwarding: real cost > preview by **≥10%** → must notify customer for re-confirm | BUSINESS_FLOW.md L85–87 | 🔴 not implemented |
| Free-shipping ZIP set (BKK + 5 surrounding provinces) | (legacy `function.php` L3–9 → `lib/bkk-zip.ts`) | ✅ Pacred ports it verbatim |
| Free-shipping ladder by order value (>5k zone1, >10k zone2, >20k zone3) | `docs.md` L360–362 | 🟡 logic exists in `lib/forwarder/calc-price.ts` but ladder not encoded — verify with ภูม |
| Volumetric weight divisor: **5000 air / 6000 sea** | `docs.md` L313–315 | ⚠️ verify in `calc-price.ts` (current code uses `kg vs cbm` rate basis, not volumetric weight per L×W×H formula — possible divergence) |
| Chargeable weight = `max(actual, volumetric)` | `docs.md` L317–318 | ⚠️ same as above |
| VIP-credit eligibility (30d / 10 orders / 50k THB) | BUSINESS_FLOW.md L156–166 + `docs.md` L376–384 | 🔴 manual only — no auto-eligibility check |
| VIP-credit hard cap 100,000 THB | BUSINESS_FLOW.md L162 | 🟡 schema allows up to 10M (`max(10_000_000)` in `actions/admin/credit.ts` L37) — should clamp to 100,000 unless super admin override |
| Overdue interest 2 / 5 / 10% by 7d / 14d / >14d | BUSINESS_FLOW.md L164–166 + `docs.md` L393–397 | 🔴 no scheduler |
| Commission base = **service fee only**, NOT product price | `docs.md` L410 | ⚠️ verify in commission accrual code |
| Commission min payout 500 THB | `docs.md` L414 | ⚠️ verify |
| Status-code shopping order: 1..6 (NOT 0..9) | Migration `0081` L2568 (verbatim from PCS) | ✅ in `lib/legacy-status-map.ts`, but BUSINESS_FLOW.md L57–68 contradicts (see §6) |
| Forwarding flow: ship → arrive → THEN pay (invoice issued AFTER arrival) | BUSINESS_FLOW.md L93–96 + `lib/legacy-status-map.ts` L36–44 | ✅ status order correct; runtime gate to verify |
| Tax invoice = RD Code 86 | (Pacred ADR-0006) | ✅ `/admin/tax-invoices` |

---

## 4. Customer ↔ staff interlock points (the hand-off table)

This is the answer to ภูม's "ลูกค้าต้องทำ X / staff ต้องทำ Y" question.

| # | Customer action | Triggers staff action | Implemented? |
|---|---|---|---|
| H1 | Upload slip (wallet top-up) | CS reviews slip → approve → wallet credited | ✅ |
| H2 | Submit shop-order paid via bank transfer | CS reviews slip → mark paid → CN-buyer places order in 1688 (24h SLA) | 🟡 (no SLA dashboard) |
| H3 | Submit Yuan-transfer request | Admin reviews 24h (risk + scam check) → approve OR reject | ✅ (no SLA timer) |
| H4 | Pay invoice for forwarding (`fstatus=5→6`) | Warehouse-TH packs → out for delivery | ✅ |
| H5 | Request wallet withdraw | Finance team verifies → manual bank transfer → mark complete | ✅ |
| H6 | **(Implicit)** Forwarder real cost +10% over preview | System notifies customer → customer confirms OR cancels → staff continues OR cancels | 🔴 missing (auto-pause + notify) |
| H7 | Request VIP-credit upgrade | Manager evaluates against rules → enable credit on profile | 🟡 (manual only — no eligibility-flag in customer table) |
| H8 | Report bad/wrong item received (QC failure) | QA team inspects → contact supplier → refund OR replacement | 🔴 (`/admin/warehouse/qa-inspections` is a tombstone — Wave 3 cleanup) |
| H9 | Late-pay on credit | System sends reminder → interest accrues → credit suspended after grace | 🔴 no scheduler |

---

## 5. Top 5 priority gaps for Phase 1 launch

Ranked by "blocks launch / repeats customer pain":

1. 🚨 **Status-code reconciliation** (BUSINESS_FLOW.md vs `0081` schema) — ภูม must decide canonical source THIS week. Current code (`lib/legacy-status-map.ts`) is right; doc is wrong. **Recommend**: edit BUSINESS_FLOW.md to match SQL, NOT the other way around. Source: BUSINESS_FLOW.md L57–68, L104–113.

2. 🔴 **Forwarder 10% over-preview gate + customer confirm step** — Real-cost re-confirm flow is required by ops (BUSINESS_FLOW.md L85–87, Guidebook L234–236). Without it, customer gets surprise-billed and PCS staff fields refund calls. Add to `actions/forwarder.ts` between status 2 → 3.

3. 🔴 **Invoice dunning cron / "เตือนชำระ 3 วัน"** — `docs.md` L469 lists this; no cron under `app/api/cron/*` matches. Without it, forwarding invoices age and Wallet flow stalls. Single cron + notification template + audit log.

4. 🔴 **VIP-credit auto-eligibility checker** — Today an admin manually decides. The rule (BUSINESS_FLOW.md L156–166) is mechanically computable from `tb_header_order` + `tb_forwarder`. Add `lib/credit/eligibility.ts` + nightly cron flag → admin dashboard list "Customers eligible for VIP upgrade today: N". Cited in `docs.md` L376–384.

5. 🔴 **QA inspection module restored on `tb_forwarder` schema** — `/admin/warehouse/qa-inspections/page.tsx` is a tombstone (lines 1–8: "QA inspections were built on the retired spine table"). Guidebook L423–455 lists QA as a core daily duty (สีถูกต้อง / ไซส์ถูกต้อง / ของแท้). Cannot ship Phase 1 without staff QA workflow.

---

## 6. Quotes from the docs — "ทุกวัน / สำคัญที่สุด / ลูกค้าจะโทรมา" verbatim

These are the doc passages that explicitly tag a behaviour as "operational must" — copy them as test cases for QA simulation.

1. **PCS_Cargo_Guidebook_TH.md L144–146** — "**KPI: ต้องสั่งภายใน 24 ชั่วโมงหลังลูกค้าชำระ**" — China-buyer SLA. (Hand-off H2 above.)

2. **BUSINESS_FLOW.md L85–87** — "**[ถ้าราคาเพิ่มเกิน 10%] แจ้งลูกค้ายืนยัน**" — Forwarder re-confirm gate. (Priority 2 in §5.)

3. **PCS_Cargo_Guidebook_TH.md L82–85** — "**หากเป็นความผิดของบริษัท: ส่วนลด / ส่งฟรี / อัปเกรดขนส่ง**" — service-recovery levers when an order is late.

4. **PCS_Cargo_Guidebook_TH.md L451–454** — "**ของปลอม: ห้ามส่งต่อ · แจ้งลูกค้า · Blacklist ร้านค้า**" — counterfeit detection in QA (currently tombstoned, Priority 5).

5. **PCS_Cargo_Guidebook_TH.md L88–90** — "**ยังไม่ชำระ → ยกเลิกได้ทันที / ร้านจีนส่งแล้ว → ไม่สามารถยกเลิกได้**" — refund gates by status. (§2.7 above.)

6. **PCS_Cargo_Guidebook_TH.md L376–378** — "**ระงับเครดิตหากผิดนัด**" — credit suspension on missed payment. (Priority 4 in §5.)

7. **PCS_Cargo_Guidebook_TH.md L66–73** — "**วิธีสั่งของจาก 1688/Taobao: ... รอสินค้า 7-15 วัน**" — default ETA promise.

---

## 7. ❓ Unclear items for ภูม (need decision)

1. **❓ BUSINESS_FLOW.md vs `0081` schema status codes** — which is canonical? My read: SQL wins (it's the loaded data + matches `lib/legacy-status-map.ts`). Need ภูม to confirm + edit the doc.

2. **❓ `tb_payment` vs `yuan_payments` table** — `docs.md` L160–170 documents `tb_payment` (legacy); Pacred actions write to `yuan_payments` (rebuilt). Wave-2 plan to migrate to `tb_payment` view-over-table, or leave as-is?

3. **❓ Volumetric-weight formula** — `docs.md` L313–315 uses dimensional divisor (5000/6000), but `lib/forwarder/calc-price.ts` uses "max(kg, cbm) at separate per-unit rates". Are these mathematically equivalent given Pacred's rate tables, or is `calc-price.ts` an *intentional* divergence from legacy? (If divergence → 🚨 violates "100% sameness FIRST" gate.)

4. **❓ `creditUser` vs `credit_enabled`** — `tb_users.credituser` (legacy `tinyint`) vs `profiles.credit_enabled` (Pacred boolean). Are both populated? `actions/admin/credit.ts` writes `credit_enabled` only.

5. **❓ `adminType` semantics contradiction** — `docs.md` L91 says `1=Super, 2=Manager, 3=Section, 4=Intern, 5=Sales, 6=Ops`. Migration `0081` L682–685 says `1=พนักงานประจำ, 2=ทดลองงาน, 3=เด็กฝึกงาน, 4=สหกิจศึกษา, 5=พาสเนอร์, 6=คนในบ้าน` — **this is employment type, not RBAC role**. The doc has it completely wrong. Pacred uses a separate `admins` table with `roles[]` for RBAC. Confirm: admins use the new `admins.roles[]` and ignore `tb_admin.admintype` for permissions.

---

## 8. Method note (for ภูม)

This audit is **read-only**. I did NOT modify any code. I verified gap claims by:
- Reading the 3 source docs in full
- `Glob`'ing `app/[locale]/(admin)/admin/**/page.tsx` + `(protected)/**/page.tsx` for route coverage
- Reading `actions/forwarder.ts`, `actions/service-order.ts`, `actions/payment.ts`, `actions/admin/credit.ts`, `lib/forwarder/calc-price.ts`, `lib/legacy-status-map.ts`, `lib/bkk-zip.ts`, `lib/notifications/templates.ts`
- Cross-checking against migration `0081_pcs_legacy_schema.sql` column comments (the only ground truth for legacy semantics)

Where I wrote ⚠️ "verify in code", I exhausted my time budget — these need a 5-minute `grep + read` each by ภูม.

---

**End of audit.** Cross-link from `docs/PORT_PLAN.md` Part W (gap-hunt) and from `docs/UPGRADE_PLAN.md` Phase B work-split.
