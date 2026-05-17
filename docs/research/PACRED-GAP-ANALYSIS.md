# 🎯 Pacred — Gap Analysis & Next-Phase Roadmap

> **Synthesis of 8 R&D docs** in [`docs/research/`](_index.md), produced 2026-05-17.
> **Purpose:** turn the legacy decode + pre-launch audits into one gap-analysis +
> prioritized build roadmap so the team can plan the functional system build-out
> **after the 2026-05-18 launch.**
>
> **This extends, does not replace:** [`../PORT_PLAN.md`](../PORT_PLAN.md) Part V
> (cargo backlog `V-A..V-H`) + [`../STRATEGY.md`](../STRATEGY.md). Where a leak hole
> already has a Part-V task, this doc cites it; new items are flagged **NEW**.
>
> **Read the source evidence:** every claim traces to a research doc — `DI-#`
> (dev/IT chat) · `OT-#` (ops/transport chat) · `SP-#` (sales/pricing chat) ·
> money-audit `P0-#/P1-#` · accounting-decode `§9` risks.

---

## 0. TL;DR

The legacy operation ran on **humans relaying status, prices, and money through
~25 LINE/WeChat groups + a stack of Google Sheets + a one-freelancer PHP
monolith.** Eight R&D docs decode where that leaked. Pacred-web already replaces
the *spine* (cargo flow, wallet, admin, freight V-E document suite) and launches
2026-05-18 with a **GO verdict** ([`audit-system`](audit-system-2026-05-17.md)) —
but with **2 P0 money-loss bugs** to fix first ([`audit-money-billing`](audit-money-billing-2026-05-17.md)).

The next phase is **bringing every external system in-house** (เดฟ's list:
MOMO, ship tracking, PEAK, NetBay, Customs Trader Portal, fuel calc, driver
scheduling, status board, warehouse intake) **and making the monitoring tools
ก๊อต signed up genuinely usable in-product** (GTM, Clarity, Sentry, Upstash,
hCaptcha — all SDK-wired but credential-pending and dashboard-less).

**The single highest-leverage build:** the **customer + staff shipment status
board** (one container record → public "track my shipment" + internal board +
proactive notifications). It deletes the #1 leak across *every* legacy chat —
"ของอยู่ไหน" (where is my container) — and is the strongest proof of Pacred's
"นำเข้าได้ง่ายๆ แค่ปลายนิ้ว" promise.

---

## 1. Leak holes — every operational gap the legacy companies hit

The legacy operation lost money, goods, and customers in predictable places.
Each leak below is cross-referenced to the research doc that found it.

### 1.1 Status invisibility — "ของอยู่ไหน" (the #1 leak)

**The dominant failure mode in every ops chat.** A container's state lives only
as the last LINE message a staffer happened to type; it is re-typed daily from
memory across ~8 groups. There is no shared shipment record, no ETA field, no
history. The customer has **zero self-service visibility** — every status check
is a staff ticket, and a staff member can only answer by pinging the next human
upstream (customer → sales → warehouse → route auditor → China broker → truck
dispatcher). Two staff give two answers.

- Found by: [`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md) `OT-1`, `OT-3`, §4 ("ของอยู่ไหน" relay) · [`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md) `DI-2` (web down hides status further)
- Pacred status: **partly covered** — `cargo_shipments` / `cargo_containers` schema exists; a customer `/shipments` route exists. **Missing:** a full China→TH status enum, a public lookup keyed on shipment code, an internal container board, and proactive notifications. → roadmap **R-1**.

### 1.2 Slow 3-human quote relay

Every freight quote was a hand-typed multi-field block; pricing was deliberately
split across **three roles** (SALE fills D/O + offered/target price · DOC/AUDIT
fills HS code + permits + tax · PRICING fills clearance-officer fee + freight +
TH transport). A quote was "done" only when all three filled their slice — which
**serialized everything** into hours-to-a-day round trips. The owner's #1
self-diagnosed leak: *"ตอบเร็ว / อย่ารอ / งานถ้ารอไม่ได้งาน"* (speed wins,
waiting loses).

- Found by: [`legacy-chat-sale-pricing-people.md`](legacy-chat-sale-pricing-people.md) `SP-1`, §2.2 · cargo-side calculator decoded in [`ttp-cargothai-decoded.md`](ttp-cargothai-decoded.md) §4 (`booking.php`)
- Pacred status: **not covered** — no freight quote builder, no lead inbox. Freight V-E6 quotation workflow shipped V1 (admin-side `freight_quotes`) but the **3-bucket assembly form + the `booking.php` weight×rate calculator** are not ported. → roadmap **R-3, R-5**.

### 1.3 Billing freeze when no container number

The most-repeated *operational* revenue failure. Goods physically arrive, MOMO
closes the container, but the PCS system still shows "เข้าโกดังจีน" / no
container number → **"กดให้ลูกค้าชำระเงินไม่ได้เลยครับ"** (can't press
charge-customer). Until a container number is attached, the order cannot be
billed — **revenue frozen at the finish line.** The fix today is a chat ticket to
the one developer.

- Found by: [`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md) `DI-4`, `DI-5` (status ≠ container number) · [`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §7 bug 5
- Pacred status: **partly covered** — `V-A2/A3` (status rollback + reconciliation), `V-D3` (link Pacred code ↔ carrier container no) exist as Part-V tasks but unbuilt. **Missing:** an admin "rebind tracking → container" screen + a billing model that can attach a container the moment data arrives. → roadmap **R-1, R-6**.

### 1.4 Lost / missing goods surface late

Shrinkage is invisible until a customer complains. There is no per-box
scan-in/scan-out at each transload, so "ตกหล่น" (missing items — "5 shipped, 4
arrived") only surfaces days later, manually, resolved 100% in chat (photograph,
ask the warehouse, hope). The Vietnam-transit group carries an explicit
lost-goods bulletin of parcels that "went with the truck but aren't at
destination and aren't at origin." Related: container splits collapse quantity
to `1` (a TH-receiving-app limit).

- Found by: [`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md) `OT-2` · [`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md) `DI-6` (qty→1), `DI-7` (ตกหล่น) · [`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §7 bugs 1-2
- Pacred status: **partly covered** — `V-D4` split-receipt schema shipped (migration 0037); UI unwired. **Missing:** `expected_qty`/`received_qty` first-class everywhere, a discrepancy/"ตกหล่น" record (photos + status searching/found/written-off + customer notification), warehouse intake scanning. → roadmap **R-9, R-1**.

### 1.5 Accounting profit double-count

The legacy ERP carries **two independent records of the same outflows**: the ACC
sheet's `cost` column *and* the AP ("เบิก") ledger. `getFinancialSummary`
computes `net_profit = profit_ar − ap_total`, but `profit_ar` already subtracted
`cost`. If `cost ≈ Σ AP`, the cost is **double-deducted** — profit silently
misstated, and commission with it. Worse, `profit` and `cost` are **staff-typed
cells**, not computed; and the join key (Shipment ID) is dirty free-text, so a
typo makes an AP cost an **orphan** dropped from its job's profit entirely.

- Found by: [`legacy-accounting-billing-workflow.md`](legacy-accounting-billing-workflow.md) §4, §9.2 risks 1-3
- Pacred status: **NOT covered** — Pacred's freight specs model only the **AR** side (`freight_invoices`). There is **no AP / cost ledger, no `net_profit`, no billing-vs-cost reconciliation.** → roadmap **R-7** (NEW — needs its own ADR + table).

### 1.6 กองกลาง (central fund) float with no audit

The AP side is paid out of a revolving **central-fund float (กองกลาง)** — a
19 MB spreadsheet reconciled with the customs agent **by hand**. No double-entry,
no audit trail, no "who approved this เบิก", no computed running balance. The
accounting decode flags this verbatim as a **"high embezzlement / leakage
surface."** Each disbursement (ค่า D/O, duty, ค่าเร้น/demurrage, carrier
freight) is a row with a loose status lifecycle and no approver.

- Found by: [`legacy-accounting-billing-workflow.md`](legacy-accounting-billing-workflow.md) §5, §9.2 risk 4
- Pacred status: **NOT covered** — no central-fund ledger specced. → roadmap **R-7** (NEW).

### 1.7 Gray-channel HS / declared-value engineering

The legacy revenue leaned heavily on a **deliberate gray-area workflow**: the
NNB "เหมาภาษี" (all-in tax-included, **no documents to the customer**) product;
HS-code re-coding to dodge permits ("เปลี่ยนชื่อ เปลี่ยนพิกัด", declaring whole
phones as "phone components"); two-track tax figures ("ทำราคา / ไม่ทำราคา" — same
shipment, ฿300k vs ฿30k tax, customer picks the risk); declared-value
engineering (real goods 7,200 USD, declaration summed to 525 USD); and ตั๋วพ่วง
(piggyback declarations onto another importer's spare customs quota).

- Found by: [`legacy-chat-sale-pricing-people.md`](legacy-chat-sale-pricing-people.md) §4.2, §4 boundary note · [`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md) §4.3 ("แผน VAT") · [`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md) `OT-9` §2.4 (ตั๋วพ่วง)
- Pacred status: **explicitly out of scope — see §4 guardrail.** This is a *legacy revenue stream catalogued as evidence*, **NOT** a Pacred feature. Pacred's brand is the opposite. The roadmap builds quote/declaration/tax tooling for the **legitimate, document-complete** path only.

### 1.8 Other recurring leaks (catalogued, lower individual severity)

| Leak | Evidence | Pacred status |
|---|---|---|
| **Single-developer bottleneck** — every config change (add courier, top up SMS, fix receipt, rebind tracking) is a chat ticket | `DI-1` | Partly — admin CRUD exists for some; `carriers` table + receipt re-gen + rate-adjust missing → **R-6** |
| **OTP SMS credit runs dry → silent registration failure** (~14 h dead signups during an ad push) | `DI-3` | Not covered — needs SMS-balance cron + alert → **R-15 / R-M3** |
| **No central document store** — China manifests are loose files; a disputed parcel has no retrievable source doc | `DI-14` · `OT-7` | Partly — Supabase Storage buckets exist; per-container documents bucket not wired → **R-1, R-10** |
| **Customs random inspection ("โดนเปิดตรวจ")** unmodelled but routine — re-orders the plan, can re-export a container | `OT-4` | Not covered — needs `held / under inspection` status → **R-1** |
| **Tractor / transload capacity** is the silent throughput cap ("รถเต็มเลยครับ") — no booking system, no calendar | `OT-5`, `OT-11`, `OT-12` | Not covered → **R-8** (driver scheduling) |
| **Demurrage / container-rental clock** is reactive — fees accrue before anyone warns | `OT-6` | Not covered → **R-8 / R-1** |
| **Loading-manifest CBM never reconciles** with billed CBM (3 different CBM numbers) | `OT-10` · forensics D1 | Partly — `V-D1` (CBM per source) is a Part-V task, unbuilt |
| **Withholding-tax receipt breaks** — receipt fails to apply the customer's WHT deduction | `DI-8` | **Covered** — WHT model (ADR-0015 / migration 0044) shipped + receipt gate verified ✅ |
| **PDF receipt renders Thai as squares** (□□□) — mPDF font bug | `DI-9` | **Covered** — `@react-pdf/renderer` + Sarabun, unit-tested ✅ |
| **No lead ownership / dedup** — "ลูกค้าใคร" asked weekly; owner becomes the human router | `SP-2`, `SP-3` | Not covered → **R-3** |
| **Slow / unstable legacy web** — "เว็ปล่ม" ~20× in 6 weeks | `DI-2` | **Covered** — Vercel + Supabase managed scaling ✅ (add public uptime page → minor) |
| **PEAK ↔ ERP books drift** — reconciled by exporting Excel → `ภพ.30` off by ฿15,192 | accounting §6.4, §9.2 risk 9 | Not covered → **R-4** (PEAK integration) |
| **Two legal entities, billing-entity ambiguity** — AXELRA (`0105564077716`) + NNB (`0115567039173`) | accounting §9.2 risk 7 | Partly — needs explicit `billing_entity` on every invoice |
| **Open partner webhook** — legacy CargoThai webhook accepts any unauthenticated POST | accounting §9.2 risk 8 · momo §8.6 | Design rule for R-2 — verify signature on every webhook |

### 1.9 Pacred-web's own pre-launch leaks (from the two audits)

The audits of `pacred-web` itself found the launch is **GO**, but with money
bugs that must be fixed before the cargo revenue path takes real customers:

| Bug | Severity | Source |
|---|---|---|
| **P0-1** — forwarder cost-adjustment wallet-tx shares the main-payment idempotency tuple → main payment silently skipped, Pacred under-collects a full forwarder bill | **P0 launch-blocker** | [`audit-money-billing`](audit-money-billing-2026-05-17.md) §2 |
| **P0-2** — yuan wallet-paid debit is RLS-blocked on the user client, error ignored → customer's wallet never debited, Pacred ships the transfer free | **P0 launch-blocker** | [`audit-money-billing`](audit-money-billing-2026-05-17.md) §2 |
| **P1-1** — no negative-balance floor on `wallet` → concurrent pay-from-wallet on two orders overdraws | P1 launch-week | money-audit §2 |
| **P1-2** — `recordFreightPayment` has no double-submit guard → invoice flips to `overpaid` | P1 (freight is Phase I2) | money-audit §2 |
| **P1-4** — `requestTaxInvoice` can create duplicate pending tax invoices → RD Code 86 numbering risk | P1 launch-week | money-audit §2 |
| **P1-3 / P1-5** — yuan refund→re-complete state machine gap; wallet-tx transition guard missing | P1 launch-week | money-audit §2 |
| **BUG-1** — `/api/dbd/[taxId]` orphan route always 502s (DBD WAF) — dead code, **no UI consumer**, contained | P2 cleanup | [`audit-system`](audit-system-2026-05-17.md) §3 |

> **These pre-launch bugs are tracked by เดฟ for the launch / launch-week fix
> pass** (money-audit §6 priority list). They are listed here for completeness;
> the roadmap below is the *post-launch functional build-out*. **P0-1 + P0-2
> must land before the cargo path takes real money.**

---

## 2. Pacred coverage map — what's built vs what's missing

Pacred-web has shipped the **spine**. The gap is the **external integrations** and
the **operational tooling** that the legacy team ran in chat + sheets.

### 2.1 ✅ Already covered (shipped + audit-verified)

| Capability | Where | Verified by |
|---|---|---|
| **Cargo flow** — ฝากสั่งซื้อ / ฝากโอน / ฝากนำเข้า customer modules | `/service-order`, `/service-payment`, `/service-import` | system-audit §2.3 (all routes 200/307) |
| **Wallet** — deposit (PromptPay slip) / withdraw / history / pay-from-wallet | `/wallet/*`, `wallet_transactions` ledger | money-audit §3.9, §5 (math correct) |
| **Admin back-office** — 95 routes, RBAC two-tier gate | `/admin/*`, `is_admin(roles[])` | system-audit §2.4 |
| **Withholding tax (WHT)** — gross→WHT→net, receipt gated on 50-ทวิ cert | ADR-0015, migration 0044 | money-audit §3.1-3.2 ✅ |
| **Tax invoice** — RD Code 86, serial numbering, WHT-gated issuance | ADR-0006, migration 0034 | money-audit §3.3 ✅ |
| **Freight V-E document suite (V1)** — Commercial Invoice + Packing List (`V-E1`), quotation workflow (`V-E6`) | `freight_shipments`/`_quotes`/`_invoices` | PORT_PLAN Part V (shipped 2026-05-17) |
| **Freight value model** — landed-cost (commercial value + duty + VAT) | ADR-0016, `freight-shipment` validator | money-audit §3.5 ✅ |
| **Forwarder price engine** — rate waterfall, tiered general rate, juristic discount | `lib/forwarder/calc-price.ts` | money-audit §3.7 ✅ (50 tests pass) |
| **Sales commission (basic)** — `team_leaders` + `/admin/sales-payouts`, idempotent accrual | migration 0013 | money-audit §3.8 ✅ |
| **MOMO sync scaffold** — typed client, 9-status enum + Pacred map, sync skeleton | `lib/integrations/momo-jmf/` | momo-decode §8 |
| **Production hardening** — Vercel + Supabase managed scaling, no "เว็ปล่ม" class | infra | system-audit §1, §4 |
| **Monitoring SDKs wired** — Sentry, GTM, Clarity, Upstash rate-limit, hCaptcha (code present) | `sentry.*.config.ts`, `lib/{analytics,rate-limit,hcaptcha}.ts` | system-audit §4.6 (SDK present, **creds pending**) |

### 2.2 🟡 Partly covered (schema or scaffold exists, build incomplete)

| Capability | What exists | What's missing |
|---|---|---|
| Container / shipment model | `cargo_containers`/`cargo_shipments` tables, `/shipments` route | full China→TH status enum, public tracking page, internal board, notifications → **R-1** |
| MOMO integration | client + types + sync skeleton | real `?api=` endpoints (need JS-bundle/DevTools capture), invoice/Pay-Later sync, defensive rebind UI → **R-2** |
| Volume / CBM integrity | `V-D1..D4` Part-V tasks, split-receipt schema (0037) | CBM-per-source diff, cargo-type canonical enum, container-no link, split-receipt UI |
| Order-lifecycle flexibility | `V-A2/A3/C1` Part-V tasks | status rollback, payment↔order reconciliation, post-lock refund — all unbuilt |
| Carriers / couriers | some admin CRUD | a `carriers` table (SPX/J&T/Flash/EMS/Lalamove) + receipt re-gen + manual rate-adjust → **R-6** |
| Commission | basic per-deal accrual | interpreter (ล่าม) role, withdrawal workflow, WHT 15% on >5k (`V-E8/H1/H2` specced, unbuilt) |
| Payment gateways | manual PromptPay-slip + wallet only | `payment_intents` + webhooks for Xendit/K-Biz/K-Shop (decision matrix, T+30d, **out of launch scope**) |
| Monitoring | SDKs wired | **credentials + in-product dashboards + alert wiring** → **R-M1..R-M5** |

### 2.3 🔴 Missing entirely (no schema, no scaffold)

| Capability | Why it matters | Roadmap |
|---|---|---|
| **AP / cost ledger + กองกลาง float** | no `net_profit`, no billing-vs-cost check, no float audit — leaks §1.5 + §1.6 | **R-7** (NEW — needs ADR) |
| **In-house quote calculator** (`booking.php` 8-tab + 3-bucket freight builder) | the 3-human relay (§1.2) has no system | **R-3, R-5** |
| **Lead inbox / CRM** | no lead ownership → owner is the human router (§1.2) | **R-3** |
| **Real-time ship tracking** (vessel name + voyage no.) | sea-route opacity; customers ask "ของอยู่ไหน" | **R-2b** |
| **PEAK accounting integration** | books drift, `ภพ.30` gap | **R-4** |
| **NetBay customs e-declaration** ("ยิงใบขน") | declarations fired by hand, batch zip files | **R-11** |
| **Customs Trader Portal registration** (จับคู่ลงทะเบียนกรมศุล) | ecosystem service #1, net-new | **R-12** |
| **Fuel-cost calculator** | fuel surcharge ฿100/CBM done as a manual button | **R-13** |
| **Driver scheduling / จัดเที่ยวส่ง** | truck booking is a free-text LINE message | **R-8** |
| **Warehouse intake queue** (จัดคิวรับของเข้าโกดัง) | no scan-in → shrinkage invisible (§1.4) | **R-9** |
| **HS-code lookup workspace + VAT calculator** | the HS/VAT desk runs entirely in LINE + Sheets | **R-14** (post-launch, legitimate-path only) |

---

## 3. Next-phase roadmap — prioritized build items

Two groups, as เดฟ scoped:
**(a) Integrations** — bring every external system in-house.
**(b) Monitoring** — make the tools ก๊อต signed up genuinely usable in-product.

Effort: **S** ≤3 d · **M** 1–2 wk · **L** 2–4 wk · **XL** > 4 wk (one engineer).
Launch-blocker = must precede the cargo revenue path taking real customers.

### 3.1 Group A — Integrations (bring external systems in-house)

#### R-1 🥇 — Container status board: customer tracking + internal board + notifications
- **What:** One `cargo_containers`/`cargo_shipments` record as the single source
  of truth, with (a) a **full China→TH status enum** (`packing → closed (ปิดตู้)
  → China customs export → China inspection (held) → Vietnam transit → Laos
  transit → at Mukdahan → released, in transit TH → at TH warehouse → customs
  declaration → out for delivery → delivered`; sea swaps border legs for `at TH
  port → D/O exchange`; explicit `held` + `delayed` flags), (b) a **public
  "track my shipment" page** keyed on the shipment code, (c) an **internal
  container board** (every in-transit container, status, ETA, destination
  warehouse, which are held/delayed), (d) **proactive LINE-OA / in-app
  notifications** on every status change.
- **Why:** kills the #1 leak — "ของอยู่ไหน" — present in *every* ops chat
  ([`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md) `OT-1`, §4;
  [`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md) `DI-4`). Also the
  strongest "นำเข้าได้ง่ายๆ แค่ปลายนิ้ว" landing proof-point. **Highest-leverage
  item in this roadmap.**
- **Effort:** L. **Deps:** none to start (status enum + board + page); the
  notification piece needs LINE OA push (ADR-0001 — creds set).
- **Launch:** **post-launch, P0 first wave.** Builds on shipped schema; extends Part-V `V-D3`.

#### R-2 🥇 — MOMO JMF integration: real sync + Pay-Later invoice gating + defensive rebind
- **What:** Finish `lib/integrations/momo-jmf/`. (1) **Capture ground truth** —
  pull `main-es2015.*.js` or DevTools-record the live MOMO panel to confirm the
  `?api=` endpoint names + JSON shapes (this single step unblocks the wiring).
  (2) Implement the 15-min sync against `api-cn.alilogisticshub.com` (JWT bearer,
  read-only, tolerant of field-name drift). (3) **Wire the 2026-05-15 Pay-Later
  pivot:** MOMO now bills the partner on a **credit ledger** that issues
  *invoice + goods-receipt note + due date*; **parcel release is gated on the
  transport invoice being paid** — so sync the invoice/payment status, not just
  physical status, and block customer "ready for pickup" until the container's
  transport invoice is `paid`. (4) **Defensive layer:** admin "rebind tracking →
  container" screen, `last_synced_at` shown on every container, absurd-CBM flag
  (catches the `299` typo class), group split siblings (`-2`) by root, reconcile
  `transport_mode` vs `code` prefix.
- **Why:** MOMO is Pacred's *only* digital source of container + per-tracking
  status; the legacy "borrow" pattern must become native
  ([`momo-jmf-api-decoded.md`](momo-jmf-api-decoded.md) §0, §4.3, §7, §8). The
  Pay-Later gating directly fixes the "billing freeze" leak (§1.3). Read-only +
  no MOMO write-back is a hard constraint — Pacred can only annotate locally.
- **Effort:** L. **Deps:** the JS-bundle/DevTools capture (§8.1 of the decode) +
  the MOMO-1 call; cross-references E7 freight receipt/payment (migration 0052).
- **Launch:** **post-launch, P0 first wave.** Pairs with R-1 (board reads the synced data).

#### R-2b — Real-time ship tracking (vessel name + voyage no.)
- **What:** A MarineTraffic-style lookup — search by **vessel name + voyage
  number** to surface live sea-container position/ETA. Integrate a vessel-tracking
  data source (MarineTraffic / vessel API) and join it to the `GZS` sea-container
  record so the sea leg stops being a black box.
- **Why:** the sea route (`GZS`) is opaque — D/O exchange + หัวลาก booking happen
  blind ([`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md) §2.5, §4
  "China leg invisible"). Customers ask "ของอยู่ไหน" for sea containers and staff
  cannot answer. เดฟ named this explicitly.
- **Effort:** M. **Deps:** R-1 (the container record it attaches to); a chosen
  vessel-tracking provider.
- **Launch:** post-launch, second wave.

#### R-3 🥈 — Lead inbox / CRM + quote-as-a-record
- **What:** (1) **Lead inbox** — every inbound (LINE OA / FB / web form) becomes
  a lead record with an **owner, source-channel, first-touch timestamp**. (2)
  **Quote = a record, not a chat message** — provisional vs confirmed status, a
  **price-validity window**, one-click "re-quote / refresh rate", two price
  fields built in (`offered` + `target`).
- **Why:** ends "ลูกค้าใคร" asked weekly and stops the owner being the human
  router ([`legacy-chat-sale-pricing-people.md`](legacy-chat-sale-pricing-people.md)
  `SP-2`, `SP-3`, `SP-5`). The team *self-identified* "ระบบงาน CRM หลังบ้าน" as
  the scale unlock.
- **Effort:** L. **Deps:** none. **Launch:** post-launch, P1.

#### R-4 🥈 — PEAK accounting integration (ใบเสนอราคา / ใบแจ้งหนี้ / วางบิล / ใบหัก ณ ที่จ่าย / ลงสต็อกขาย)
- **What:** Wire the real PEAK API (`api.peakaccount.com/api/v1`) — push
  quotation, invoice, receipt; pull invoices/quotations/receipts/journal/withheld.
  Cover the legacy "วางบิล" billing-pack assembly + ใบหัก ณ ที่จ่าย (WHT cert) +
  ลงสต็อกขาย (sales stock posting). **Until the API is live**, replicate the
  legacy `parsePeakReport` — import the PEAK Excel export and **diff it against
  Pacred's own invoices/receipts** so the `ภพ.30` gap is caught, not discovered
  at audit.
- **Why:** PEAK is the **system of record for the actual books**; the legacy ERP
  ran a *parallel* set of AR/AP sheets reconciled by hand-exporting Excel → the
  `฿15,192 ภพ.30 gap` ([`legacy-accounting-billing-workflow.md`](legacy-accounting-billing-workflow.md)
  §6.4, §9.2 risk 9). PEAK invoice body shape decoded in §6.5. Extends Part-V `V-F2`.
- **Effort:** L. **Deps:** R-7 (the AP/cost ledger PEAK reconciles against);
  PEAK API key.
- **Launch:** post-launch, P1 (the Excel-diff fallback can ship first, S effort).

#### R-5 — In-house quote calculator (port `booking.php` 8-tab + freight 3-bucket builder)
- **What:** (1) Port the **`booking.php` 8-tab estimator** (LCL · FCL · Truck ·
  Air · Customs · Sourcing · Export · Remit) — the formulas are decoded *exactly*
  in [`ttp-cargothai-decoded.md`](ttp-cargothai-decoded.md) §4 (greater-of
  weight×rate, dimensional weight `W×L×H/6000`, additive customs lookup). (2) The
  **freight 3-bucket quote builder** — SALE / DOC / PRICING form sections,
  `SALE_LCL + SALE_CUSTOMS + SALE_DOC`, two-price negotiation model
  ([`legacy-chat-sale-pricing-people.md`](legacy-chat-sale-pricing-people.md)
  §2.1; [`legacy-accounting-billing-workflow.md`](legacy-accounting-billing-workflow.md)
  §3.1). (3) **Move every rate table out of code into an admin-editable DB table**
  (`quote_rates` — `mode`, `key`, `kg_rate`, `cbm_rate`, `base`, `valid_from`) —
  kills the "stale hardcoded rate" + "+฿200 ทุกเจ้า by decree" pattern. (4) Keep
  the **range output + "sales confirms"** lead-gen behavior.
- **Why:** the 3-human quote relay (§1.2) has no system; the legacy calculators
  had all rates hardcoded in JS. The owner's own plan: "put pricing rules on the
  website so reps stop re-deriving them."
- **Effort:** L. **Deps:** R-3 (a quote should record a lead). The follow-up
  Excel-extraction pass (accounting-decode §10) supplies the remaining rate
  numbers.
- **Launch:** post-launch, P1.

#### R-6 — Self-serve admin: `carriers` table, receipt re-gen, audited rate engine
- **What:** Replace every ไอแต้ม chat-ticket with admin self-serve: (1) a
  `carriers` table with CRUD (SPX / J&T / Flash / EMS / Lalamove). (2) **Receipt
  re-generation** button. (3) An **audited rate engine** — a price-change history
  table that *keeps old→new value, who, when* (trivial in Postgres — the legacy
  refusal was a PHP-effort issue) + a rates dashboard showing current group rates
  and the list of per-customer overrides. (4) Wallet-rule toggles + manual
  tracking entry.
- **Why:** every one of these is a recurring chat ticket — "add a courier" asked
  **5×** in 6 weeks ([`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md)
  `DI-1`, `DI-16`). The migration's success metric is *"the IT chat goes quiet."*
- **Effort:** M. **Deps:** none. **Launch:** post-launch, P1.

#### R-7 — AP / cost ledger + กองกลาง central-fund ledger + billing-vs-cost reconciliation (NEW — needs ADR)
- **What:** (1) An **AP / cost ledger** (`job_costs` / `freight_disbursements`) —
  one row per outflow `{job, vendor, category (D/O · duty · freight · rent ·
  service), amount, status (requested → approved → paid), slip, paid_from,
  approver}`. (2) A **central-fund (กองกลาง) ledger** — fund top-ups,
  disbursements out, recoveries in, **computed running balance**, every
  disbursement audit-rowed with an approver. (3) **Profit must be derived**
  (`revenue − Σ confirmed AP`), never a staff-typed cell. (4) A
  **billing-vs-cost reconciliation view** — `invoice_total − Σ job_costs` per
  job, flag jobs billed below cost (automates the legacy manual "C9" control). (5)
  A **commission model** keyed to derived profit.
- **Why:** the legacy ERP modelled only the **AR** side; Pacred inherits that gap.
  No AP ledger → no `net_profit`, no margin visibility, profit double-count
  (§1.5), and the กองกลาง float is a 19 MB unaudited spreadsheet — flagged a
  **"high embezzlement / leakage surface"**
  ([`legacy-accounting-billing-workflow.md`](legacy-accounting-billing-workflow.md)
  §9.1, §9.2 risks 1-4).
- **Effort:** XL. **Deps:** **a new ADR** to lock the AP/cost data model + the
  profit-derivation rule (no current ADR covers it). PEAK integration (R-4)
  reconciles against this.
- **Launch:** post-launch, P1 — but the **ADR should be drafted launch-week**
  because R-4 and the commission work both depend on it.

#### R-8 — Driver scheduling + จัดเที่ยวส่ง + fuel-cost calculator
- **What:** (1) **Truck/tractor booking as a record** — `{container, route,
  pickup/POD, destination + GPS pin, requested date/time, driver+vehicle, status
  (requested → confirmed → picked up → delivered)}`, with photo checkpoints
  (รับตู้ / ถึงหน้างาน / เปิดตู้ / ลงเสร็จ). (2) A **driver / vehicle directory**
  — reusable driver+plate records; booking picks from the list; validated GPS
  pins (stops "ไปผิดที่"). (3) **จัดเที่ยวส่ง** — assign/sequence delivery runs.
  (4) A **fuel-cost calculator** — replace the manual ฿100/CBM surcharge button
  with a calculator (distance × fuel rate or CBM-based). (5) A **demurrage clock**
  warning before fees accrue.
- **Why:** tractor capacity is the silent throughput cap ("รถเต็มเลยครับ"
  recurs constantly); booking is a free-text LINE message; drivers re-keyed every
  trip ([`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md) `OT-5`,
  `OT-11`, `OT-6`). Fuel surcharge done by decree
  ([`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md) §4.4). เดฟ named
  driver scheduling + fuel calc explicitly.
- **Effort:** L. **Deps:** R-1 (booking attaches to a container). `/admin/drivers`
  + `/admin/driver-runs` routes already exist as scaffolds (system-audit §2.4).
- **Launch:** post-launch, P2.

#### R-9 — Warehouse intake queue (จัดคิวรับของเข้าโกดัง) + per-box scan + discrepancy record
- **What:** (1) A **warehouse intake queue** — incoming containers/parcels
  queued for receiving at the TH warehouse. (2) **Per-box scan-in** at each
  transload (China pack, Mukdahan transload, TH receive) → `expected_qty` vs
  `received_qty` per container surfaces shrinkage *immediately*. (3) A
  **discrepancy / "ตกหล่น" record** — expected-vs-received counts, photos, status
  (searching / found / written-off), customer notification. (4) Wire the
  split-receipt UI (`V-D4` schema shipped).
- **Why:** shrinkage is invisible until a customer complains (§1.4); container
  splits collapse qty to `1` ([`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md)
  `OT-2`; [`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md) `DI-6`,
  `DI-7`). เดฟ named warehouse intake queue explicitly.
- **Effort:** L. **Deps:** R-1 (the container record). `/admin/warehouse` +
  `/admin/inventory` scaffolds exist.
- **Launch:** post-launch, P2.

#### R-10 — Container/product/driver status board (unified ops view)
- **What:** A single unified **status board** across containers, products
  (parcels), and drivers — the at-a-glance operational view staff currently
  reconstruct from LINE scrollback. Auto-generate the legacy LINE-pastable daily
  bulletin (`สรุปรายการ / #ค้าง / ##ใหม่` format). Every container gets a
  documents bucket (manifest, invoice, packing list, Form E, D/O).
- **Why:** staff have no single screen — they re-type the daily status block from
  memory ([`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md) `OT-1`,
  P1 item 5; [`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md) §3.4,
  `DI-14`). เดฟ named "container/product/driver status board" explicitly.
- **Effort:** M (mostly composition once R-1, R-2, R-8, R-9 exist).
- **Deps:** R-1, R-2, R-8, R-9. **Launch:** post-launch, P2 — the *aggregation*
  of the above.

#### R-11 — NetBay customs e-declaration ("ยิงใบขน")
- **What:** Integrate NetBay (`api.netbay.co.th`, SOAP/XML) to fire customs
  declarations (ใบขน) and read declaration status. Generate the declaration from
  the shipment record; parse the NetBay declaration export for `Declaration No,
  Importer, DutyRate, DutyAmt, VatAmt`.
- **Why:** declarations are fired by hand in batches of 17-22 PDF drafts + zip
  files ([`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md) §2.4;
  [`legacy-accounting-billing-workflow.md`](legacy-accounting-billing-workflow.md)
  §6.4 — NetBay was a stub). Extends Part-V `V-E11` (customs declaration UI).
  เดฟ named NetBay explicitly.
- **Effort:** L. **Deps:** `V-E11` customs declaration UI; NetBay credentials.
  **Build the legitimate declaration only** — see §4.
- **Launch:** post-launch, P2 (Phase I2 freight stack).

#### R-12 — Customs Trader Portal registration (จับคู่ลงทะเบียนกรมศุล)
- **What:** Ecosystem service #1 — a workflow to **register a customer as a
  customs trader / pair them with a licensed broker (ตัวแทนออกของ)** via the Thai
  Customs Trader Portal. Net-new build.
- **Why:** ecosystem service #1, no PHP predecessor (STRATEGY §4 catalogue).
- **Effort:** M. **Deps:** Customs Trader Portal access/process research.
- **Launch:** post-launch, P3 (ecosystem expansion).

#### R-13 — (folded into R-8) Fuel-cost calculator
- See **R-8** part (4). Listed separately in เดฟ's brief; grouped with driver
  scheduling because both are the trucking-cost surface.

#### R-14 — HS-code lookup workspace + VAT calculator (legitimate path only)
- **What:** (1) An **HS-code lookup workspace** — product photo + Thai/Chinese
  name in → HS code + duty % + Form-E eligibility + tax-invoice/ใบขน flag out;
  keep the senior-doc human in the loop, cache by product, **make it a searchable
  shared record** (the team explicitly wants this, not DMs). (2) A **VAT /
  landed-cost calculator** for the legitimate freight money math — `value × rate
  × duty% × 7%`, deposit-split when the rate moves between payments.
- **Why:** the HS/VAT desk runs entirely in LINE + Google Sheets with zero system
  support ([`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md) §4.3).
- **⚠️ Scope guard:** build the **legitimate** lookup + calculator only. The
  legacy desk also did HS re-coding to dodge permits and two-track tax figures
  (§1.7) — **those patterns must NOT be built.** See §4.
- **Effort:** M. **Deps:** R-5 (shares the rate tables). **Launch:** post-launch, P3.

#### R-15 — (folded into R-M3) OTP SMS-balance alert
- The OTP-credit-dry leak (`DI-3`) is fixed by an SMS-balance cron + alert —
  see **R-M3** (it is a monitoring/alerting wiring item).

### 3.2 Group B — Monitoring tools (make ก๊อต's signups usable in-product)

ก๊อต has already signed up for / SDK-wired five tools. The audit confirms each is
**code-present but credential-pending, with no in-product dashboard, no alert
wiring, and no surfacing where staff actually work** (STRATEGY §9 — all 🟡; the
legacy lesson is "signed-up-and-forgotten" tools deliver nothing). These items
make them *genuinely usable*.

#### R-M1 — Sentry: live error visibility wired to where the team works
- **What it is:** error/exception tracking SDK (`sentry.*.config.ts`,
  `instrumentation*.ts` present). **Make it usable:** (1) set `SENTRY_DSN` +
  `NEXT_PUBLIC_SENTRY_DSN` in Vercel (currently unset → SDK is a **no-op**). (2)
  Wire a **Sentry → LINE alert** for new prod errors so the team learns of a
  break *before the customer does*. (3) Surface a **recent-errors widget on
  `/admin`** (or `/admin/learning`) so staff see error health without opening
  Sentry. (4) Fix the two deprecation warnings (`disableLogger`,
  `automaticVercelMonitors` → `webpack.*`). (5) Add the §10 alert: **webhook
  signature-mismatch → Sentry** once gateways are wired.
- **Why:** the legacy team treated outages as "routine weather" with a "รอ 1-2
  นาที" bot ([`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md) `DI-2`) —
  no error visibility at all. The DBD-502-class silent failure (system-audit
  BUG-1) is exactly what Sentry catches. A no-op SDK catches nothing.
- **Effort:** S. **Deps:** ก๊อт sets the DSN (`T-G5`). **Launch:** **wire the DSN
  for launch** (zero-cost, catches launch-day breakage); the LINE alert + admin
  widget = launch-week.

#### R-M2 — GTM + GA4: conversion tracking proven end-to-end
- **What it is:** Google Tag Manager container loads GA4 + future ad pixels
  (`lib/analytics.ts`, ADR-0007). **Make it usable:** (1) set `NEXT_PUBLIC_GTM_ID`
  in Vercel. (2) **Verify conversion events flow GTM → GA4** (signup, lead,
  order, wallet top-up — STRATEGY §9 K-12 is "code shipped, awaits GTM_ID"). (3)
  Confirm the funnel events the landing pages need fire (the cargo revenue path's
  ad-quality depends on conversion tracking). (4) Wire Meta Pixel + TikTok Pixel
  *through* GTM once GA4 is verified.
- **Why:** the emergency state is *"Google Ads ยิงไม่ติด"* (STRATEGY §2). Ad
  spend without verified conversion tracking is blind spend — the legacy team
  "fired ad spend across FB/Line/TikTok/IG/YouTube/Google at once" with no
  measurement ([`legacy-chat-sale-pricing-people.md`](legacy-chat-sale-pricing-people.md)
  `SP-7`).
- **Effort:** S. **Deps:** ก๊อт sets the GTM ID (`T-G4`). **Launch:** **wire for
  launch** — conversion tracking on the cargo path from day one or the ad budget
  is wasted.

#### R-M3 — Operational alerting: SMS-balance cron + uptime + cron-health → LINE
- **What:** A small set of **operational alerts surfaced to LINE** (the channel
  the team lives in): (1) **daily OTP SMS-balance check** → alert when low (fixes
  `DI-3` — ~14 h of silently-dead registration during an ad push). (2) A
  **public uptime page** + a down-alert. (3) **Cron-health** — alert if any of
  the 6 cron routes (incl. the MOMO 15-min sync) fails or stalls. (4) A
  **stale-data alert** if the MOMO `last_synced_at` goes cold.
- **Why:** the single worst silent leak — OTP credit running dry — bounced
  registrations for hours with **no signal**
  ([`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md) `DI-3`). The MOMO
  sync going stale silently is the same class of failure (momo-decode §7 bug 5).
- **Effort:** S–M. **Deps:** an alert sink (LINE OA push — creds set; or Sentry
  from R-M1). **Launch:** **SMS-balance alert for launch** (registration is the
  top of the funnel); rest launch-week.

#### R-M4 — Microsoft Clarity: heatmap/session-replay surfaced for the landing team
- **What it is:** session-replay + heatmap (`ClarityScript`, `clarityTag()` /
  `clarityEvent()` helpers in `lib/analytics.ts`). **Make it usable:** (1) set
  `NEXT_PUBLIC_CLARITY_ID` in Vercel (unset → renders nothing). (2) Tag the key
  funnel steps with `clarityEvent()` (landing CTA, signup, quote-calculator
  use). (3) Give ปอน (landing/SEO owner) a documented workflow: which Clarity
  recordings/heatmaps to review when an ad's landing-page quality score is low.
- **Why:** the landing pages drive Google Ads quality score → bad LCP / bad UX =
  pay-more-per-click = revenue drain (the `performance-hunter` skill's Pacred
  lens). Clarity shows *where* visitors drop — but only if it has an ID and the
  team knows to look.
- **Effort:** S. **Deps:** ก๊อт sets the Clarity ID. **Launch:** post-launch
  (analytics, not launch-blocking) — but set the ID early so replay data
  accumulates from launch day.

#### R-M5 — Upstash Redis rate-limit + hCaptcha: turned on and monitored
- **What they are:** Upstash Redis rate-limiting (`lib/rate-limit.ts`) +
  hCaptcha invisible bot-prevention (`lib/hcaptcha.ts`). **Make them usable:** (1)
  set `UPSTASH_REDIS_REST_URL/TOKEN` + `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` /
  `HCAPTCHA_SECRET_KEY` in Vercel. **Note:** hCaptcha **fails-closed in prod** if
  unset — so this is effectively launch-blocking for any captcha-gated form. (2)
  Confirm rate-limit covers the abuse-prone endpoints (OTP request, login,
  registration). (3) Surface **rate-limit-hit / captcha-fail counts** on `/admin`
  so a bot attack is *visible*, not silent.
- **Why:** the legacy registration path had no bot protection and no rate
  limiting; an ad push that draws bots + a credential-dry OTP gateway is a
  compound failure. hCaptcha failing closed silently would *block real
  registrations* — exactly the kind of launch-day surprise to pre-empt.
- **Effort:** S. **Deps:** ก๊อт sets the creds (`T-G5`). **Launch:** **verify
  the hCaptcha + rate-limit creds before launch** (fail-closed risk); the admin
  monitoring widget = launch-week.

### 3.3 Roadmap at a glance — ranked

| Rank | Item | Group | Effort | Launch timing |
|---|---|---|---|---|
| **1** | **R-1** Container status board (tracking + board + notifications) | A | L | Post-launch P0 |
| 2 | **R-2** MOMO integration + Pay-Later gating + rebind | A | L | Post-launch P0 |
| 3 | **R-7** AP/cost ledger + กองกลาง float + reconciliation | A | XL | ADR launch-week, build P1 |
| 4 | **R-M1** Sentry live + LINE alert + admin widget | B | S | DSN for launch |
| 5 | **R-M2** GTM/GA4 conversion tracking verified | B | S | For launch |
| 6 | **R-3** Lead inbox / CRM + quote-as-a-record | A | L | Post-launch P1 |
| 7 | **R-M3** SMS-balance + uptime + cron-health alerts | B | S–M | SMS alert for launch |
| 8 | **R-5** Quote calculator (`booking.php` + 3-bucket) | A | L | Post-launch P1 |
| 9 | **R-4** PEAK accounting integration | A | L | Excel-diff first, P1 |
| 10 | **R-6** Self-serve admin (`carriers`, rate engine) | A | M | Post-launch P1 |
| 11 | R-2b Real-time ship tracking (vessel/voyage) | A | M | Post-launch 2nd wave |
| 12 | R-8 Driver scheduling + จัดเที่ยวส่ง + fuel calc | A | L | Post-launch P2 |
| 13 | R-9 Warehouse intake queue + per-box scan | A | L | Post-launch P2 |
| 14 | R-M5 Upstash + hCaptcha turned on + monitored | B | S | **Creds for launch** (fail-closed) |
| 15 | R-10 Unified container/product/driver status board | A | M | Post-launch P2 |
| 16 | R-M4 Clarity surfaced for landing team | B | S | ID early, review post-launch |
| 17 | R-11 NetBay customs e-declaration | A | L | Post-launch P2 |
| 18 | R-12 Customs Trader Portal registration | A | M | Post-launch P3 |
| 19 | R-14 HS-code workspace + VAT calc (legit only) | A | M | Post-launch P3 |

**Launch-blocker / launch-day items** (small, do them now): R-M1 DSN · R-M2
GTM ID · R-M3 SMS-balance alert · R-M5 hCaptcha + rate-limit creds (fail-closed).
Plus the **money-audit P0-1 + P0-2** fixes (§1.9) — those gate the cargo revenue
path taking real money.

---

## 4. Pacred identity guardrail — lessons to ADAPT, not a system to copy

> **This is the most important section. Read it before building anything above.**

The 8 research docs decode a real, working legacy operation — and that operation
**leaned on gray-channel revenue**. The docs catalogue it as *evidence of how the
business ran*, **not as a specification for Pacred.** Specifically, the following
patterns appear in the legacy chats and **must NEVER enter Pacred code:**

- **NNB "เหมาภาษี" (all-in tax-included, no documents to the customer)** — a
  product designed so the customer receives *no* documents precisely so the
  tax/declaration engineering is invisible
  ([`legacy-chat-sale-pricing-people.md`](legacy-chat-sale-pricing-people.md)
  §1, §4.2).
- **HS-code / declared-name re-engineering to dodge permits** — "เปลี่ยนชื่อ
  เปลี่ยนพิกัด", declaring whole phones as "phone components" to avoid อย./มอก.
  control ([`legacy-chat-sale-pricing-people.md`](legacy-chat-sale-pricing-people.md)
  §4.2; [`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md) §4.3).
- **Two-track tax figures ("ทำราคา / ไม่ทำราคา")** — the same shipment quoted
  with ฿300k vs ฿30k tax, the customer picking the risk/price tradeoff
  ([`legacy-chat-sale-pricing-people.md`](legacy-chat-sale-pricing-people.md) §4.2).
- **Declared-value engineering ("แผน VAT")** — real goods worth 7,200 USD
  declared as 525 USD, the gap "made up" under a chosen HS code, checked against
  a duty threshold ([`legacy-chat-dev-it-momo.md`](legacy-chat-dev-it-momo.md)
  §4.3).
- **ตั๋วพ่วง (piggyback declarations)** — extra declared value attached onto a
  *different* importer's container that has spare customs quota
  ([`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md) §2.4).

**Pacred's stated identity** (CLAUDE.md DNA, STRATEGY §1) is the **opposite** of
all of this: a **legitimate, document-complete, "เกราะป้องกันสรรพากร 100%"**
service — the customer gets *every* document, correct and complete. The brand
*is* legitimacy.

**Therefore, every roadmap item that touches declarations / HS codes / tax /
value (R-5 quote calculator, R-11 NetBay, R-14 HS workspace, R-4 PEAK):**

1. Builds tooling for the **legitimate, fully-documented path only** — real HS
   code, real declared value, complete Form E / ใบขน / tax invoice.
2. **Does NOT** implement any "no-document", "tax-included", two-track-tax,
   value-gap, or quota-borrowing logic. The HS lookup (R-14) returns the *correct*
   code; it never suggests a code to dodge a permit.
3. If a "no-document / tax-included" product is ever kept for revenue continuity
   (a business decision above the engineering team — owner + ก๊อต), it must be an
   **explicitly bounded, separately-owned service line with its own risk
   ownership** — **never** wired into the shared quote / declaration / tax-invoice
   code. The default and the brand is the legitimate path.

The legacy operation's *operational* lessons — status visibility, quote speed,
the AP/cost ledger, the float audit, warehouse scanning — are **gold, adapt them
all.** Its *compliance shortcuts* are a liability — **leave them in the legacy
system that is being retired.**

---

## 5. Cross-references

- 📚 This folder's index → [`_index.md`](_index.md)
- 📋 Cargo task backlog (Part V `V-A..V-H`) → [`../PORT_PLAN.md`](../PORT_PLAN.md) — new items R-1..R-19 are candidates for a **Part W**
- 🎯 Master strategy + monitoring-tool status table → [`../STRATEGY.md`](../STRATEGY.md) §9
- 🤝 MOMO partner-API spec → [`../integrations/momo-jmf.md`](../integrations/momo-jmf.md) · MOMO-1 call prep → [`../integrations/momo-1-call-prep.md`](../integrations/momo-1-call-prep.md)
- 🔬 Prior audits this synthesis builds on → [`../audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) · [`../audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md) · [`../audit/php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md)
- 💸 Money decisions → ADR-0006 (tax invoice) · ADR-0015 (WHT) · ADR-0016 (freight value) · `d7-payment-gateway-decision-matrix.md`
- 🔁 State-change audit pattern (R-1, R-7) → [`../decisions/0014-customer-self-service-state-transitions.md`](../decisions/0014-customer-self-service-state-transitions.md)
- 📊 Analytics decision (R-M2, R-M4) → [`../decisions/0007-analytics-and-ab-testing.md`](../decisions/0007-analytics-and-ab-testing.md)
- ⚠️ Don't scrub PCS/TTP/ไอแต้ม/CargoThai refs before API switchover → [`../runbook/pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md)

**End — `PACRED-GAP-ANALYSIS.md`.** Synthesis of 8 R&D docs; roadmap extends
PORT_PLAN Part V. The build order is revenue-first: status visibility (R-1) and
the MOMO money loop (R-2) before everything else.
