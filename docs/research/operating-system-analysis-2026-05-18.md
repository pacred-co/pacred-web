# 🧭 Pacred Internal Operating-System Analysis — every role + department

> **Produced 2026-05-18** for เดฟ. **What this is:** a per-cluster audit of
> Pacred's *internal operating system* — the work-system every department uses
> to do its job — grounded in the shipped code (`app/[locale]/(admin)/admin/*`,
> the customer portal `app/[locale]/(protected)/*`, `actions/*`, the 70+
> migrations) as of the 2026-05-17 production launch.
>
> **What this is NOT:** a re-spec of the gap-hunt. It **extends**
> [`PACRED-MASTER-STRATEGY.md`](PACRED-MASTER-STRATEGY.md) (the 4 chains),
> [`../audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md)
> (the legacy ops model), [`../briefs/ops-roles.md`](../briefs/ops-roles.md)
> (the 14-STAFF-role workspace doc), [`../PORT_PLAN.md`](../PORT_PLAN.md)
> Part V/W and [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md). Where those docs own
> a fact, this links — it does not duplicate.
>
> **The lens.** Pacred's DNA promise is a **full-loop service where every
> department's work is visible in one system** — "ทุกคนเห็นงานผ่านระบบ ไม่ต้อง
> ตาม". §1 (the status-visibility layer) is the centrepiece; the per-cluster
> sections (§2–§7) feed it.
>
> **Build-vs-buy rule (เดฟ).** *If it costs money and Pacred can build it,
> build it — keep everything inside the Pacred ecosystem.* Every gap below
> gets a verdict: **BUILD** (in `pacred-web`) or **BUY** (named external tool,
> justified). No vanity tools. Each recommendation states *how it is used*,
> *how it is monitored*, *how results are measured*.

---

## 0. TL;DR

Pacred-web at launch is a **deep but un-joined** operating system. Two-thirds
of the 14 staff roles ([`../briefs/ops-roles.md`](../briefs/ops-roles.md)) have
a real workspace; HR is 100%, the cargo customer loop is ~88%, and 130+ admin
routes are shipped. **But the work-system has four operating-level holes:**

1. **🔴 The status-visibility layer — Pacred's headline promise — is half-true.**
   The customer *can* see a shipment timeline; **staff cannot see a
   cross-department work-board**. There is no single screen where a CS / sales /
   warehouse / accounting person sees "every job and its current owner". Each
   department reads its own table. The "no follow-up needed" promise holds
   *inside* a department and breaks *between* departments. Verdict in §1.
2. **🔴 Six of the 14 roles have no role identity at all.** The `admins.role`
   CHECK is still the original 4 values (`super, ops, accounting, sales_admin`)
   — migration `0015` line 20. `warehouse`/`driver` are referenced in RLS
   arrays but **were never added to the enum** (so a real warehouse/driver
   login cannot even be created with the correct role); `cs_admin`,
   `docs_admin`, `logistics_admin`, `marketing` do not exist. Today CS, docs,
   warehouse, driver, messenger all share `ops`. No least-privilege, no
   per-role inbox, no "my work" filter. BUILD — §2/§4/§6.
3. **🟠 Three departments run with zero workspace** — Acc-AP, messenger /
   logistics, and marketing. AP is the bigger hole: Pacred records money *in*
   (wallet/AR) but the *pay-vendors* side is a stub. BUILD — §3/§5.
4. **🟠 The work-assignment / hand-off mechanic is missing.** A job moves
   between departments by *someone noticing* — there is no "assign to", no
   per-role queue, no SLA timer, no escalation. This is the operating-system
   reason the legacy team lived in LINE. BUILD — §1.4.

The single highest-leverage build is **the cross-department work-board + a
job-assignment spine** (§1.4). It is the operating-system embodiment of the DNA
promise and it is almost entirely unbuilt.

---

## 1. 🎯 CENTREPIECE — the status-visibility layer

> *"Everyone in every department can understand and see the work through our
> system without needing to follow up."* This section assesses that promise
> hard, in three parts: (1.1) what a **customer** sees, (1.2) what **staff**
> see, (1.3) the verdict, (1.4) the build.

### 1.1 Customer-facing status visibility — 🟢 strong

This is the **best-built** part of the operating system. Concretely shipped:

- **Per-shipment tracking timeline** — `app/[locale]/(protected)/shipments/[code]/page.tsx`
  renders an 8-state status ladder (`received_cn → … → delivered`), a
  newest-first scan-event timeline, container card (mode / origin / ETA /
  B-L no / `close_at` countdown), a received-vs-expected box progress bar
  (U1-5), a QA-inspection panel (V-E10), and — notably — a **data-freshness
  pill** ("🔄 อัพเดท 2 ชม.ที่แล้ว") with an explicit stale-data nudge. That
  freshness signal directly closes legacy leak `L-4` (customer cannot tell if
  a frozen status is real).
- **Order detail pages** — `service-order/[hNo]`, `service-import/[fNo]`,
  `freight/shipments/[id]` each show status + history.
- **Container-centric customer view** — per
  [`../architecture/container-centric-model.md`](../architecture/container-centric-model.md)
  "View A": the customer's shipments hang off a container they can open.
- **Status propagation IS wired** — U1-2 (`UPGRADE_PLAN` §1, commit `d4339bd`)
  cascades container status → shipment → order. The frozen-status bug the
  gap-hunt found (`gap-revenue-flow` Stage 4) is **fixed**. The customer page
  is now *true*.

**Customer verdict: 🟢.** A customer can self-answer "ของฉันอยู่ไหน" without
phoning. This is the DNA promise delivered — for the customer.

### 1.2 Staff-facing status visibility — 🔴 the real hole

The promise says *every department*. For **staff**, the system is a set of
**per-department lists with no shared board**:

| What staff CAN see today | Where |
|---|---|
| Orders in my module, filtered by status | `/admin/orders/*`, `/admin/service-orders`, `/admin/forwarders` |
| Containers + who is inside | `/admin/warehouse/containers/[code]` |
| A driver's own runs | `/admin/driver-runs` (CT-7 — self-row only) |
| Contact tickets | `/admin/contact-messages` (4-state, no assignee) |
| An 8-entity global *search* | `/admin/search` (U4-1, commit `85741bb`) |
| An admin-action audit feed | `/admin/audit` + `/admin/hr/audit` |
| Cron health | `/admin/system/crons` (U4-1) |

**What does NOT exist — and is the operating-system gap:**

1. **No cross-department work-board.** There is no screen that answers *"show
   me every live job, its stage, and which department/person owns it right
   now"*. `/admin/search` finds a *known* id; it does not present the *flow*.
   A CS agent answering "where is order X" must know which of 6 order tables to
   open. A warehouse staffer cannot see that an arrived container has 3 orders
   still un-billed by accounting. **The board the customer effectively has,
   staff do not.**
2. **No per-role inbox / "my work" queue.** Only `/admin/driver-runs` has a
   "งานของฉัน" view. CS has no ticket queue grouped by assignee; docs has no
   "invoices to issue"; AR has the wallet-approval list but not a unified
   "needs me" inbox; accounting cannot see "containers arrived, awaiting my
   billing". Every other role re-derives its worklist by eyeballing a filtered
   table.
3. **No job hand-off mechanic.** Nothing assigns a job from department A to
   department B. A container arriving does not *appear* on accounting's desk;
   accounting *notices*. This is precisely the legacy "ของอยู่ไหน" status-relay
   failure ([`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md)
   OT-series) — and it is **rebuilt inside Pacred** at the staff layer even
   though the customer layer fixed it.
4. **No document-status visibility for staff as a class.** `customs_declarations`
   (migration `0057`) and `freight_invoices`/`tax_invoices` each have a status,
   and each has its own list page — but there is no "all documents awaiting
   action" view. The docs team cannot see, in one place, every invoice / Form-E
   / declaration that is stuck.
5. **No SLA / age signal on staff work.** The customer page has a freshness
   pill; the staff side has nothing equivalent — no "this job has sat 4 days",
   no escalation. Stale work is invisible until a customer complains.

### 1.3 The status-visibility verdict

**🔴 Half-delivered.** The customer-facing half is genuinely strong and is the
template for what good looks like. The **staff-facing half — the part the DNA
sentence is actually about ("every department") — is the single biggest
operating-system gap.** Today the honest answer to *"can each role see what it
needs without phoning / LINE-ing someone?"* is:

- **Within one department** — mostly yes (filter your own table).
- **Across departments** — **no.** A hand-off is a phone call or a LINE message.
  The system shows *state*; it does not surface *"this is now your job"*.

This is not a missing feature — it is the missing **spine**. Every per-cluster
gap below (CS inbox, docs queue, AP desk, planner board) is a *facet* of the
same absent layer.

### 1.4 BUILD — the cross-department work-board + job-assignment spine

**Verdict: BUILD. Highest-leverage item in this entire analysis.** This is core
ecosystem IP — no external tool can join Pacred's own order / container /
invoice / declaration tables, and routing a SaaS (below) around them would
fragment the very system the DNA promises to unify.

Two builds, sequenced:

**(a) `work_items` assignment spine** — a thin join/overlay table:

```
work_items: id · entity_type ('forwarder'|'service_order'|'freight_shipment'
  |'customs_declaration'|'freight_invoice'|'contact_message'|'refund_request'
  |'qa_inspection') · entity_id · current_stage · assigned_role · assigned_to
  (admins.profile_id, nullable) · sla_due_at · priority · opened_at · closed_at
```

A DB trigger opens / advances / closes a `work_item` whenever the underlying
entity changes stage (reuse the U1-2 cascade hooks — they already fire on
status change). It does **not** replace the domain tables — it *indexes* them
into one assignable, queryable flow.

- **How used:** every status-change action also writes the `work_item` hop;
  staff act on the domain page as today, but the *board* and the *inbox* read
  `work_items`.
- **How monitored:** a `super`/`ops` panel — open items by stage/role, count
  over SLA, oldest item per department. Reuse the `/admin/audit` feed pattern.
- **How measured:** median stage-dwell time per department, % closed within
  SLA, count of items idle > N days. These become the team-process KPIs in
  [`../briefs/ops-roles.md`](../briefs/ops-roles.md)-style dashboards (see
  `audit-kpi-dashboard` skill).

**(b) `/admin/board`** — the cross-department work-board UI: a column-per-stage
(or per-department) view of `work_items`, each card linking to the domain
detail page, filterable by assignee, age, customer. Plus a per-role landing —
`/admin` shows *"your N open items"* (generalise the `/admin/driver-runs`
"งานของฉัน" pattern to every role).

This is the operating-system embodiment of the DNA promise. It is *additive*
(no domain-table rewrite), it reuses shipped cascade hooks, and it converts
"phone someone to hand off" into "the job appears on their board". Effort: **L**
— but it is the change that makes "every department sees the work" *true*.

> **Relation to existing plan.** `R-1` (status board,
> [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md)) plans a *container*
> board; `W-6`/`U4-1` shipped audit-search + global search. **None of them is
> the cross-department, per-role, assignable work-board described here** — they
> are pieces of its data layer. This section names the missing whole. Schedule
> as a new lead item under [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) Phase U4
> (supervisory layer) — it is the supervisory layer's centrepiece.

---

## 2. 🚚 Fulfilment & transport cluster

**Roles:** warehouse · transport / planning · driver · sub-driver · express ·
delivery · airport / seaport / land-port · shipping · messenger · cargo+freight.

### What exists

- **Warehouse** — `/admin/warehouse/containers` (+ `[code]` detail, "View B"
  of [`../architecture/container-centric-model.md`](../architecture/container-centric-model.md)),
  `/admin/warehouse/qa-inspections` (V-E10 QA/QC flow), `/admin/warehouse/bulletin`,
  `/admin/inventory`. The container spine (`cargo_containers` /
  `cargo_shipments` / `cargo_shipment_tracking`) is canonical post-U1-1 unify
  (migration `0059`). The `cargo_sacks` entity (U2-5, migration `0068`) models
  the legacy `CBX…-EK…` sack.
- **Driver** — `/admin/drivers` (+ `[id]`), `/admin/driver-runs` (CT-7
  "งานของฉัน" with accept/complete, self-row enforced), `/admin/barcode/driver`
  (pre-delivery + delivered scan). `forwarder_driver` table (migration `0028`).
- **Container barcode scan** — `/admin/barcode` (warehouse inbound) +
  `/admin/barcode/driver` (outbound). Per-box `CG…` barcode model.
- **Freight (FCL/LCL)** — `/admin/freight/shipments` + `quotes` + `declarations`
  (migrations `0048`/`0050`/`0051`/`0057`); customer side `freight/*`.
- **Transport / planning** — partial: `/admin/forwarders`, `/admin/carriers`
  (migration `0036`), `/admin/forwarder` legacy cargo screen.

### What is missing

| Gap | Severity |
|---|---|
| **No `warehouse` / `driver` role in the `admins.role` enum** — `0015` CHECK is 4 values; RLS arrays reference `warehouse`/`driver` but no such admin row can be created. A real warehouse/driver login today must be mis-typed as `ops` → full back-office reach. | 🔴 |
| **No planner / dispatch board** — `/admin/planning/*` ([`../briefs/ops-roles.md`](../briefs/ops-roles.md) §5) does not exist. Matching shipments→containers, scheduling pickups, assigning drivers to runs is ad-hoc. | 🟠 |
| **No driver-side mobile view** — `/admin/driver-runs` is desktop-admin; a driver in the field has no route/manifest mobile screen. | 🟠 |
| **No messenger / last-mile module** — see §5. | 🟠 |
| **No multi-modal port handling** (airport / seaport / land-port as distinct ops surfaces) — only the truck/sea/air *enum* exists; no port-operations workspace. | 🟡 |
| **No sub-driver split** — primary/sub is one role; commission split unmodelled. | 🟡 |

### Build-vs-buy

- **Role enum + planner board + driver "my work" + multi-port handling →
  BUILD.** All of it joins Pacred's own container/shipment tables; a SaaS TMS
  cannot. The planner board is a *facet of §1.4's `work_items` board* filtered
  to fulfilment stages — build it as a board view, not a separate system.
  *Used:* warehouse/planner assign at `/admin/board`; driver sees own runs.
  *Monitored:* containers awaiting assignment, runs over SLA. *Measured:*
  in-transit container count, avg pickup-to-delivery days, on-time %.
- **Driver mobile view → BUILD (responsive PWA), do NOT buy.** It is a 2-screen
  view (`driver-runs` + `barcode/driver`) made mobile-first — a route SaaS
  would sit outside the ecosystem and re-charge per seat.
- **Live vessel/truck GPS tracking → BUY the data feed, surface in-house.**
  This is the one place to buy: real ship position is a data product Pacred
  cannot generate. Recommend **MarineTraffic API** (sea) — best coverage of
  the Nansha→Laem Chabang lane, REST, pay-per-call so cost scales with volume.
  Land-leg GPS: defer (truck partners rarely expose it). Already on the plan
  as `U3-3` ([`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) §3) — keep it BUY-feed,
  BUILD-display. *Measured:* ETA-accuracy delta (predicted vs actual arrival).

---

## 3. 📋 Customs & docs cluster

**Functions:** customs clearance · customs-declaration form (ใบขนสินค้า) ·
tax invoice (ใบกำกับภาษี) · privilege certificates + licences · document
handling.

### What exists

- **Customs declaration (ใบขนสินค้า)** — `customs_declarations` +
  `customs_declaration_lines` (migration `0057`, V-E11), admin pages
  `/admin/freight/declarations` (+ `[id]`), 5-state workflow
  `draft→submitted→accepted→released` (+ `cancelled`). Internal-only V2: PDF +
  structured JSON export, NetBay/Customs-Trader-Portal upload deferred to U3.
- **Tax invoice (ใบกำกับภาษี)** — `tax_invoices` (migrations `0034`/`0035`),
  `/admin/tax-invoices` (+ `[id]`), per [ADR-0006](../decisions/0006-tax-invoice-flow.md).
- **Freight invoices** — `freight_invoices` + payments + WHT (`0051`/`0052`/`0053`).
- **WHT (หัก ณ ที่จ่าย)** — `withholding_tax` (migration `0044`); freight WHT
  receipt-gate wired (U2-3, `getFreightReceiptGate`).
- **Receipt PDFs** — `components/pdf/*` (forwarder + shop-order receipts).
- **HS-code data** — `hs_codes` (migrations `0030`/`0031`), `/admin/freight`
  HS lookups.

### What is missing

| Gap | Severity |
|---|---|
| **No docs-team workspace / queue** — `/admin/docs/*` ([`../briefs/ops-roles.md`](../briefs/ops-roles.md) §7) does not exist. The docs team has no single "documents awaiting issue / stuck" inbox; each doc type has a separate list. | 🟠 |
| **No `docs_admin` role** — docs work runs under `accounting`/`ops`. | 🟠 |
| **No Form-E (ASEAN-China FTA C/O) generator** — `cargo-ops-forensics` `E3`; the 12-box form is unbuilt. | 🟠 |
| **No D/O exchange-letter generator** — `cargo-ops-forensics` `E4`. | 🟡 |
| **No Commercial Invoice + Packing List generator** — `cargo-ops-forensics` `E1`. | 🟠 |
| **No privilege-certificate / licence issuance** — TIS / FDA / controlled-goods cert tracking is unmodelled (service #1 `customs-broker-matching` is TBD). | 🟡 |
| **No `tax_id` DBD-verification gate** before tax-invoice issuance — `gap-schema-security` G-7. | 🟡 |

### Build-vs-buy

- **Docs-team queue + `docs_admin` role → BUILD.** The queue is the §1.4
  board filtered to document `work_items`. *Used:* docs staff open
  `/admin/board?dept=docs`, see every invoice / declaration / Form-E awaiting
  action. *Monitored:* documents in `draft` > N days. *Measured:* draft→issued
  cycle time, count issued/day.
- **Form-E / D/O / Invoice+PL generators → BUILD.** These are templated PDFs
  off Pacred's own freight data — same pattern as the shipped receipt PDFs
  (`components/pdf/*`). Buying a doc-generation SaaS would mean exporting
  shipment data out and back. *Measured:* manual-doc-prep time eliminated.
- **NetBay (ใบขนสินค้า e-filing) + Customs Trader Portal → BUY/integrate.**
  These are Thai-government clearance rails — Pacred *cannot* build them.
  Already `U3-1`/`U3-2`. Integrate; do not rebuild. *Monitored:* declaration
  acceptance rate, rejection reasons. *Measured:* submission→released days.

---

## 4. 🗄 Back-office & finance cluster

**Functions:** admin · acc-AP · acc-AR · billing · purchase / sourcing ·
pricing · partner management.

### What exists

- **AR (money in)** — `/admin/wallet` (+ `deposit`), `/admin/yuan-payments`,
  `/admin/payment`, `/admin/withdrawals`, `/admin/refunds` (refund-request
  flow, U1-6, migration `0058`). Slip-verify + wallet-credit shipped.
- **Billing / accounting** — `/admin/accounting` (+ `periods`, `closing`,
  `reconcile`, `container-costs`, `disbursements`). `accounting_periods`
  (`0056`), `container_costs` + `container_disbursements` (U2-2, migration
  `0069`) — the **per-container cost basis + AP-style disbursement ledger
  shipped 2026-05-18**. `lib/cost/container-margin.ts` computes margin.
- **Pricing** — `/admin/rates/*` (general / VIP / custom-user / custom-HS),
  `lib/forwarder/calc-price.ts`.
- **Partner management** — `/admin/carriers`, `/admin/forwarders`, partner
  `org_contacts` (migration `0046`).
- **Commissions** — `/admin/commissions` (+ `[id]`), `/admin/sales-payouts`,
  `commissions` table (`0054`).
- **Reports** — `/admin/reports/*` — 12 report screens (pending-payments,
  credit-pending, debtors, refunds, monthly-orders, containers-awaiting-TH,
  sales-by-rep, HS-code-revenue, forwarder-volume, user-sales-history). These
  directly kill the legacy `cargo-ops-forensics` `B1` "every Excel is a dev
  ticket" pain.
- **Customer credit line** — U4-2 (migration `0071`): `credit_limit_thb`,
  outstanding-credit view, charge/pay-credit actions. Shipped.

### What is missing

| Gap | Severity |
|---|---|
| **Acc-AP vendor-payment desk** — U2-2 shipped the *container-cost ledger*; there is still **no general vendor-invoice → approve → pay → mark-paid workflow** for non-container payees (broker, fumigation, messenger, office). `/admin/accounting/ap/*` ([`../briefs/ops-roles.md`](../briefs/ops-roles.md) §9) does not exist. | 🟠 |
| **No PND.53 / monthly WHT-filing aggregation** for AP-side withholding. | 🟡 |
| **No purchase / sourcing module** — sourcing (finding suppliers, purchase orders) has no workspace; folded informally into the China-shop flow. | 🟡 |
| **Pricing has no effective-date versioning** — `cargo-ops-forensics` `A4` (rate-entry errors); [`../briefs/ops-roles.md`](../briefs/ops-roles.md) §4. | 🟡 |
| **No accounting export to PEAK** — `U2-4` pending; legacy team already migrating to PEAK (`cargo-ops-forensics` `F2`). | 🟠 |
| **No AR aging report** — overdue-invoice aging is not a screen. | 🟡 |

### Build-vs-buy

- **Acc-AP vendor desk → BUILD.** Extend the shipped `container_disbursements`
  ledger pattern to a general `vendor_invoices` table + approve/pay workflow.
  It must link to the same WHT model the AR/freight side uses — splitting AP
  to a SaaS would double-key every payee. *Used:* vendor invoice recorded →
  approval → bank transfer → mark-paid; appears on the §1.4 board for the
  approver. *Monitored:* unpaid-vendor aging, WHT withheld this period.
  *Measured:* invoice→paid cycle time, PND.53 figure auto-aggregated.
- **PEAK integration → BUY/integrate (do not rebuild accounting).** PEAK is a
  mature Thai accounting product; the legacy team already chose it. Build a
  *one-way sync* of issued invoices/receipts into PEAK (`U2-4`). Pacred owns
  *operations*; PEAK owns *the statutory books*. *Measured:* re-keying
  eliminated, ภพ.30 reconciliation delta (legacy was off ฿15,192 —
  `cargo-ops-forensics` `A8`).
- **Purchase / sourcing module → BUILD (later).** Low urgency; a lightweight
  purchase-order entity inside the ecosystem beats a procurement SaaS at
  Pacred's scale.
- **Pricing effective-date versioning, AR aging → BUILD.** Small schema +
  screen additions to existing `/admin/rates` and `/admin/accounting`.

---

## 5. 👥 People & service cluster

**Functions:** HR · CS (customer service) · interpreter (ล่ามจีน) · sales.

### What exists

- **HR — 🟢 100% complete.** `/admin/hr/*` — org chart + org table, employees
  (+ `[id]`), recruitment (+ `[id]`, 6-stage pipeline), attendance (+ leaves),
  training, policies, audit. Migrations for recruitment / attendance /
  employee-audit. The strongest non-customer module in the system.
- **Sales** — `/admin/customers` (+ `[id]`, `pending`, `recently-active`,
  `transfer-rep`, `convert-to-juristic`), `/admin/forwarder-sales`,
  `/admin/team-leaders`, `/admin/commissions`. Customer side: `/sales/*`
  (history, report). `sales_admin` role exists.
- **CS — minimal.** `/admin/contact-messages` — a 4-state list (new / read /
  replied / closed) off the `contact_messages` table. That is the entire CS
  surface.

### What is missing

| Gap | Severity |
|---|---|
| **No CS workspace** — `/admin/cs/*` ([`../briefs/ops-roles.md`](../briefs/ops-roles.md) §6) does not exist. `contact_messages` has **no assignee, no priority, no SLA, no escalation, no customer-360 quick view, no internal-note thread**. CS cannot run a ticket queue; it shares `ops`. | 🔴 |
| **No `cs_admin` role.** | 🟠 |
| **No interpreter (ล่ามจีน) workspace** — China-side translation work (supplier chat, product Q&A) has no module; runs entirely off-system. | 🟡 |
| **No sales opportunity pipeline** — `/admin/sales/*` opportunities ([`../briefs/ops-roles.md`](../briefs/ops-roles.md) §3, ADR-0009 M13) is Phase-2; lead→won/lost is untracked. | 🟡 |
| **No omni-channel inbox** — LINE OA, phone, email, the web contact form are 4 separate streams; only the web form lands in `contact_messages`. | 🟠 |

### Build-vs-buy

- **CS ticket workspace → BUILD.** A SaaS helpdesk (Zendesk / Freshdesk) is
  tempting but **wrong here**: the value of Pacred CS is the *customer-360*
  (wallet, orders, containers, notifications all in one system) and a SaaS
  cannot reach those tables without a fragile sync — and re-charges per agent.
  Build `contact_messages` up: add `assigned_to`, `priority`, `sla_due_at`,
  internal-note thread, and a customer-360 side-panel (the data already exists
  on `/admin/customers/[id]`). CS tickets become `work_items` on the §1.4
  board. *Used:* ticket assigned → CS resolves with 360 context → escalation
  routes a `work_item` to ops/accounting. *Monitored:* open tickets by agent,
  tickets over SLA. *Measured:* first-response time, resolution time, % within
  SLA.
- **Omni-channel inbox → BUILD the connector, in-house.** The one external
  dependency is the **LINE Messaging API** (already Pacred's channel — ADR-0001,
  LINE OA `lin.ee/Yg3fU0I`). Build a webhook receiver (`U3-6` harness) that
  drops inbound LINE messages into `contact_messages` so all channels share one
  queue. Do not buy a social-inbox SaaS — it would sit outside the customer-360.
- **Interpreter workspace → BUILD (light).** A simple translation-request /
  supplier-Q&A entity tied to a `service_order`; low urgency.
- **Sales opportunity pipeline → BUILD.** Already scoped (ADR-0009 M13);
  CRM-as-a-SaaS would split customer data from the portal that *is* the CRM.

---

## 6. 📥 Order intake cluster

**Functions:** place-an-order · consignment-sale (ฝากขาย).

### What exists

- **Place-an-order — 🟢 strong.** Customer self-service across all live
  services: `service-order` (China shop — cart, add, pending, `[hNo]` detail +
  receipt), `service-import` (FCL/LCL/cargo — add, pending, `[fNo]`, receipts,
  warehouse-addresses), `service-payment` (yuan transfer — add). Admin intake:
  `/admin/orders/*` (shop / import / transfer / pending), `/admin/service-orders`.
  `/admin/juristic-check` + `convert-to-juristic` handle juristic onboarding.
  `/admin/csv-imports` bulk-loads orders.

### What is missing

| Gap | Severity |
|---|---|
| **Consignment-sale (ฝากขาย) — entirely unbuilt.** Service #11 `consignment` in the [CLAUDE.md](../../CLAUDE.md) catalogue is "❌ ใหม่ทั้งหมด" — no table, no intake page, no workspace. A customer cannot place a consignment job; staff have no consignment desk. | 🟠 |
| **No order-intake triage** — a new order does not surface on a per-role board for the next department to pick up (the §1.4 hand-off gap, seen from the intake end). | 🟠 |
| **bill-payment (ฝากจ่าย, service #12) also unbuilt** — adjacent intake type, same status. | 🟡 |

### Build-vs-buy

- **Consignment-sale module → BUILD.** Net-new ecosystem service — no external
  tool exists for a Thai import/export consignment flow. Follow the established
  "add a new feature" pattern (migration + Zod validator + Server Action +
  `(protected)` pages + i18n). *Used:* customer lists goods for consignment →
  staff price + market → sale → settlement. *Monitored:* consignment items by
  stage on the §1.4 board. *Measured:* listing→sold days, consignment GMV.
- **Order-intake triage → covered by §1.4** — a new order opens a `work_item`
  routed to the first department; no separate build.

---

## 7. RBAC / role-identity layer (cross-cutting)

This is not a department — it is the **operating-system substrate** every
section above leans on, and it is the second-biggest gap after §1.

### What exists

`admins` table + `is_admin(role[])` SECURITY DEFINER helper
([ADR-0002](../decisions/0002-admin-architecture.md)). Migration `0062` (W-1)
correctly **role-pins** every money/PII RLS policy — a genuine, shipped
security win. 72 admin pages now pass a role array to `requireAdmin([...])`.

### What is missing

| Gap | Severity |
|---|---|
| **The role enum is stale.** `0015` line 20: `check (role in ('super','ops','accounting','sales_admin'))`. Migrations reference `warehouse` + `driver` in RLS arrays, but **the enum was never extended** — a correctly-typed warehouse/driver admin row cannot be inserted. `cs_admin`, `docs_admin`, `logistics_admin`, `marketing` do not exist. ([`../briefs/ops-roles.md`](../briefs/ops-roles.md) "RBAC summary" lists all 8 as 🔴 add.) | 🔴 |
| **31 admin `page.tsx` files have no `requireAdmin` at all** — they rely on the `(admin)/layout.tsx` "is *some* admin" check only. Combined with the stale enum, role granularity is largely notional. | 🟠 |
| **No section-scoping** — a role sees a whole module or nothing; no "this CS agent, these customers". | 🟡 |

### Build-vs-buy

**BUILD — and it gates §2/§4/§5/§6.** This is pure in-house RBAC; no external
IAM product understands Pacred's roles. Scope (already named as ADR-0011 /
`P-38` in [`../briefs/ops-roles.md`](../briefs/ops-roles.md)):

1. Extend the `admins.role` CHECK to all needed roles (`warehouse`, `driver`,
   `cs_admin`, `docs_admin`, `logistics_admin`, `marketing`; optional
   `hr_admin`, `pricing_admin`).
2. Add `requireAdmin([...])` to the 31 ungated pages.
3. Per-role landing + inbox (§1.4 (b)).

*Monitored:* the U4-1 staff-RBAC console (`/admin/search`-adjacent, commit
`85741bb`) already shows role distribution — extend it to flag ungated pages
and over-`super` proliferation. *Measured:* % admin pages role-gated (target
100%), count of accounts on each role.

> **Sequencing.** [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) §5 rule 4: W-1 RLS
> role-pin must be live before any `warehouse`/`driver` account is created. The
> enum extension here is the *other half* of that — without it, the account
> cannot be created with the right role in the first place. Do both together.

---

## 8. The operating-system gaps, ranked

| # | Gap | Cluster | Verdict | Why this rank |
|---|---|---|---|---|
| 1 | **No cross-department work-board + job-assignment spine** (`work_items` + `/admin/board` + per-role inbox) | §1 status-visibility | **BUILD** | It *is* the DNA promise for staff; every other gap is a facet of it. |
| 2 | **Role enum stale + 6 roles missing + 31 ungated pages** | §7 RBAC | **BUILD** | Gates clusters §2/§4/§5/§6; a security + operating hole. |
| 3 | **No CS workspace** (ticket queue, assignee, SLA, customer-360, omni-channel) | §5 people/service | **BUILD** (+ BUY: LINE Messaging API connector) | CS is the customer's front door; today it is a 4-state list. |
| 4 | **No Acc-AP vendor-payment desk** | §4 finance | **BUILD** (+ BUY: PEAK sync) | Money-out side is a stub; container-cost ledger shipped but general payees are not covered. |
| 5 | **No planner / dispatch board + no driver mobile view** | §2 fulfilment | **BUILD** (+ BUY: MarineTraffic feed) | Fulfilment is high-volume; assignment is ad-hoc. |
| 6 | **No docs-team queue + Form-E / D-O / Invoice generators** | §3 customs/docs | **BUILD** (+ integrate: NetBay / Customs Trader Portal) | Freight doc work runs on Excel today. |
| 7 | **No consignment-sale / bill-payment intake** | §6 order intake | **BUILD** | Net-new ecosystem services, currently zero. |
| 8 | **No messenger / logistics last-mile module** | §2/§5 | **BUILD** | Last-mile + C2C delivery has no workspace. |

**The pattern:** of 8 operating-system gaps, **all 8 are BUILD** — every one
joins or extends Pacred's own tables, and routing any of them to a SaaS would
fragment the single-system promise. The only BUYs are *data feeds and
statutory rails Pacred cannot itself produce* — MarineTraffic (ship position),
PEAK (statutory books), NetBay + Customs Trader Portal (government clearance),
and the LINE Messaging API (already Pacred's channel). That split — **build the
workflow, buy only the rails** — is the correct application of เดฟ's rule.

---

## 9. Cross-references

- 🎯 The 4 chains this extends → [`PACRED-MASTER-STRATEGY.md`](PACRED-MASTER-STRATEGY.md)
- 🗺 The R-1..R-19 roadmap → [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md)
- 🔬 Legacy ops model decoded → [`../audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md)
- 👷 The 14 staff-role workspaces → [`../briefs/ops-roles.md`](../briefs/ops-roles.md)
- 🏗 Container spine → [`../architecture/container-centric-model.md`](../architecture/container-centric-model.md)
- 📋 Task scheduling → [`../PORT_PLAN.md`](../PORT_PLAN.md) Part V + Part W · [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md)
- 💬 Legacy status-relay failure → [`legacy-chat-ops-transport.md`](legacy-chat-ops-transport.md)
- 🔐 RBAC ADR → [ADR-0002](../decisions/0002-admin-architecture.md) · admin RBAC granularity = ADR-0011 (`P-38`, in [`../briefs/ops-roles.md`](../briefs/ops-roles.md))
- ⚠️ Pacred-identity guardrail (legitimate-path-only) → [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md) §4

**End — `operating-system-analysis-2026-05-18.md`.** Centrepiece: §1 — the
status-visibility layer is delivered for customers, missing for staff; the fix
is the §1.4 cross-department work-board. 8 ranked gaps, all BUILD; buy only the
data feeds and statutory rails Pacred cannot produce.
