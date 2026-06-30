# 🚚 Freight workflow — full status model + current-code map + gap analysis (2026-06-30)

> Read-only analysis. Sources: the owner's freight brief (`Desktop/บรีฟเวิคโฟลว งานเฟรท/` · 6 txt),
> the summary already in `docs/research/accounting-3account-freight-workflow-2026-06-30.md` §3, and a
> source-grounded read of the live freight code (migrations 0048-0167 · `actions/admin/freight*.ts` ·
> `app/[locale]/(admin)/admin/freight/**` · the customer `(protected)/freight/**` views · the public
> `/freight-quote` wizard · `lib/freight/*` + `lib/validators/freight-*`).
>
> **Headline finding:** the freight DB spine + admin scaffold is real and ~80% built — BUT the
> shipment **status model in code is a flat 6-state machine** (`draft → confirmed → in_progress →
> cleared → delivered / cancelled`). The brief asks for a **per-transport-flavour journey status
> model** (15-19 ordered sub-statuses each, 3 phases, internal-vs-customer split, RED-overlay flags).
> **That journey model does not exist anywhere in the code.** The 4-stage AX-JOB cockpit (PRICING /
> SALES / DOC / ACC) that DOES exist is an orthogonal *workflow-ownership* layer, not the *journey*
> status the brief specifies. This is the single biggest gap.

---

## 1. THE FULL STATUS MODEL (from the brief) — what it SHOULD be

The brief defines TWO orthogonal status axes that must coexist:

### 1a. The MAIN status (พนักงาน) — the dashboard overview rollup

`สถานะหลักของพนักงาน.txt` — 13 stages shown as the top-of-page summary chips on the "รายการ
Shipment ทั้งหมด" list. This is the **staff-facing** coarse rollup (one chip the job sits in):

| # | สถานะหลัก (staff) | phase |
|---|---|---|
| 1 | รอดำเนินการ | ORIGIN (pre) |
| 2 | รอลูกค้าคอนเฟิร์ม | ORIGIN (pre) |
| 3 | เตรียมเอกสาร | ORIGIN (pre) |
| 4 | ดำเนินการขนส่ง ‹ต้นทาง› | ORIGIN |
| 5 | พิธีการตรวจปล่อยสินค้าขาเข้า ‹กรมศุลขาเข้า› | TRANSIT/DEST |
| 6 | Port of Loading ‹POL› | TRANSIT |
| 7 | Port of Discharge ‹POD› | TRANSIT |
| 8 | พิธีการตรวจปล่อยสินค้าขาออก ‹กรมศุลขาออก› | ORIGIN/TRANSIT |
| 9 | อยู่ระหว่างขนส่ง | TRANSIT |
| 10 | ถึงปลายทาง | DESTINATION |
| 11 | รอวางบิล | DESTINATION (internal) |
| 12 | ปิดงาน | DESTINATION (internal) |
| 13 | ยกเลิก | terminal |

> ⚠️ The brief's main-status numbering 4-8 is NOT a strict linear order (steps 5-8 list customs/ports
> out of journey order). It's a **bucket set** for the filter chips, not a state machine. The真 ordered
> journey is the per-flavour sub-status list (§1c).

### 1b. The MAIN status (ลูกค้า) — the customer overview rollup

Same idea, collapsed to **9 buckets** (customers don't see POL/POD/customs detail as separate stages):

| # | สถานะหลัก (customer) |
|---|---|
| 1 | รอดำเนินการ |
| 2 | รอลูกค้าคอนเฟิร์ม |
| 3 | เตรียมเอกสาร |
| 4 | ดำเนินการขนส่ง ‹ต้นทาง› |
| 5 | อยู่ระหว่างขนส่ง |
| 6 | ถึงปลายทาง |
| 7 | รอวางบิล |
| 8 | ปิดงาน |
| 9 | ยกเลิก |

### 1c. The DETAIL sub-status — the journey pipeline (per transport flavour)

`สถานะย่อย แยกตามประเภท.txt` + `สรุป Workflow.txt` + `workflow สถานะ ลูกค้า.txt` define **5 transport
flavours**, each with its own ordered pipeline of sub-statuses, grouped into **3 phases** (ORIGIN →
TRANSIT → DESTINATION). The brief gives BOTH a staff-facing pipeline (สรุป Workflow) and a
customer-facing simplified timeline (workflow สถานะ ลูกค้า) — they differ in which steps show.

The 5 flavours = **TRUCK×{FCL,LCL} · SEA×{FCL,LCL} · AIR(Cargo)**. (No TRUCK and AIR don't split
FCL/LCL the same way; AIR is "Cargo" only.)

#### TRUCK + FCL (staff 15 · customer 13)
```
ORIGIN:   รับตู้เปล่าเข้าจุดโหลด → กำลังโหลดสินค้าขึ้นตู้ → ปิดตู้+ซีล
TRANSIT:  เคลียร์ศุลกากรจีน → รถออกเดินทาง → ระหว่างทาง → ถึงด่านมุกดาหาร → ผ่านศุลกากรไทย
DEST:     ถึงโกดังไทย → รอชำระเงิน → เตรียมจัดส่ง → กำลังจัดส่ง → ส่งสำเร็จ →
          [วางบิล (ภายใน) → ปิดงาน (ภายใน)]
```

#### TRUCK + LCL (staff 16 · customer 14)
```
ORIGIN:   รับสินค้าจากร้านค้า → ถึงโกดังจีน → รวมสินค้า → ปิดตู้รถ
TRANSIT:  เคลียร์ศุลกากรจีน → รถออกเดินทาง → ระหว่างทาง → ถึงมุกดาหาร → ผ่านศุลกากรไทย
DEST:     ถึงโกดังไทย → รอชำระเงิน → เตรียมจัดส่ง → กำลังจัดส่ง (กระจายส่ง) → ส่งสำเร็จ →
          [วางบิล (ภายใน — เริ่มได้ตั้งแต่ถึงโกดังไทย) → ปิดงาน (ภายใน)]
```

#### SEA + FCL (staff 18 · customer 15)
```
ORIGIN:   รับตู้เปล่า → โหลดสินค้าขึ้นตู้ → ปิดตู้+ซีล
TRANSIT:  ศุลกากรต้นทาง → เข้าท่าเรือต้นทาง (POL) → ETD (กำหนดเรือออก) → ATD (เรือออกจริง) →
          เดินเรือ [Tranship | Direct] → ETA (กำหนดถึง) → ATA/POD (เรือถึงจริง) → แลก D/O →
          ผ่านศุลกากรไทย
DEST:     ลากตู้ส่ง (Haulage) → รอชำระเงิน → ส่งสำเร็จ → คืนตู้ →
          [วางบิล (ภายใน) → ปิดงาน (ภายใน)]
```

#### SEA + LCL (staff 19 · customer 17)
```
ORIGIN:   รับสินค้าจากร้านค้า → เข้า CFS/โกดังจีน → รวมตู้
TRANSIT:  ศุลกากรต้นทาง → เข้าท่าเรือต้นทาง → ETD → ATD → เดินเรือ [Tranship|Direct] → ETA →
          ATA/POD → แลก D/O → ผ่านศุลกากรไทย
DEST:     เปิดตู้แยกสินค้า → รอชำระเงิน → เตรียมจัดส่ง → กำลังจัดส่ง → ส่งสำเร็จ →
          [วางบิล (ภายใน) → ปิดงาน (ภายใน)]
```

#### AIR + Cargo (staff 17 · customer 15)
```
ORIGIN:   รับสินค้าจากร้านค้า → จองไฟลท์ → เตรียมเอกสาร AWB
TRANSIT:  ศุลกากรต้นทาง → เข้าสนามบินต้นทาง → ETD → ATD → ระหว่างบิน → ETA → ATA สนามบินปลายทาง →
          ผ่านศุลกากรไทย
DEST:     รอชำระเงิน → เตรียมจัดส่ง → กำลังจัดส่ง → ส่งสำเร็จ →
          [วางบิล (ภายใน) → ปิดงาน (ภายใน)]
```

### 1d. INTERNAL vs SHOW-CUSTOMER

`workflow สถานะ ลูกค้า.txt` "ข้อมูลที่ลูกค้าเห็น" table + สรุป Workflow §หมายเหตุ:

| ลูกค้าเห็น (show_customer = true) | ซ่อนจากลูกค้า (internal-only) |
|---|---|
| POL – POD | internal container/routing code (SEA0x etc.) |
| ETD – ETA | CY / LOAD / RE (รับตู้/โหลด/คืนตู้) |
| ATD – ATA | วางบิล / billing |
| T/T (transit time) | ปิดงาน / closed |
| Tracking no. | คืนตู้ / return |

So **every detail sub-status needs a `show_customer` boolean.** The two internal steps that appear at
the end of EVERY flavour — **วางบิล (ภายใน)** + **ปิดงาน (ภายใน)** — are `show_customer = false`; the
customer's last visible step is "ส่งสำเร็จ / Delivered". `คืนตู้` (SEA FCL) and the CY/LOAD/RE origin
mechanics are also internal.

### 1e. The RED-OVERLAY flag (NOT a status)

Critical brief rule (`สรุป Workflow.txt` §หมายเหตุ + `workflow สถานะ ลูกค้า.txt`):

> **RED ไม่ใช่ step แยก แต่เป็น flag ทับสถานะปัจจุบันได้** — e.g. `IN_TRANSIT + DELAY`,
> `CUSTOMS_TH + HOLD`. On the customer timeline it renders as "On the water 🔴 Delayed".

So the model needs a **separate `issue_flag` + `issue_note`** that overlays the current status — NOT a
status value. 4-colour badge scheme: 🟢 เสร็จ/ถึงแล้ว · 🟡 รอดำเนินการ (action needed) · 🔵 กำลังทำ ·
🔴 Delay/ปัญหา (the overlay). The customer "รอชำระเงิน / Payment" 🟡 must be visually emphasised
(customer action required).

### 1f. Proposed UNIFIED canonical status enum

The clean way to model this (avoids 5 separate enums + keeps the rollup derivable):

```
freight_shipment:
  transport_mode    ∈ {truck_fcl, truck_lcl, sea_fcl, sea_lcl, air}   ← EXPAND from current 4
  journey_status    text   ← the current DETAIL sub-status code (canonical key, flavour-aware)
  main_status       text   ← DERIVED rollup (1a) — computed, not stored, OR a generated column
  issue_flag        ∈ {none, delay, hold, problem}   ← the RED overlay (NOT a status)
  issue_note        text
```

A canonical journey-status **key catalogue** (one SOT table or a TS const map) keyed by
`(transport_mode, code)` with: `code`, `label_th`, `label_en`, `phase ∈ {origin,transit,destination}`,
`seq` (order within flavour), `show_customer` (bool), `customer_label_th/en` (the simplified label),
`main_status` (which 1a bucket it rolls up to), `default_role` (which workspace owns it · §4),
`milestone_field` (which date field it stamps: ETD/ATD/ETA/ATA/POL/POD/cutoff/...).

Canonical journey codes (cross-flavour superset — each flavour subscribes to a subset):
```
ORIGIN:   PICKUP_EMPTY, LOADING, SEALED, RECEIVE_GOODS, AT_CN_WAREHOUSE,
          CONSOLIDATING, DISPATCH_CLOSED, ENTER_CFS, CONSOLIDATE_CONTAINER,
          BOOK_FLIGHT, AWB_PREP
ORIGIN-CUSTOMS: CN_CUSTOMS, FORM_E, CN_INSPECT, CN_CLEARED, CN_NOTIFY_CUSTOMER
TRANSIT:  DEPARTED (รถออก/ATD), IN_TRANSIT, AT_BORDER (มุกดาหาร),
          AT_POL, ETD, ATD, ON_WATER (Tranship|Direct), IN_FLIGHT, ETA,
          AT_POD/ATA, ENTER_PORT, CUTOFF
TH-CUSTOMS: DO_EXCHANGE (แลก D/O), TH_CUSTOMS_ENTRY (ใบขน), TH_INSPECT,
            TH_CLEARED
DESTINATION: HAULAGE (ลากตู้), OPEN_CONTAINER (เปิดตู้แยก SEA-LCL),
             AT_TH_WAREHOUSE, AWAIT_PAYMENT 🟡, PREPARING, OUT_FOR_DELIVERY,
             DELIVERED, RETURN_CONTAINER (คืนตู้)
INTERNAL-END: BILLING (วางบิล · internal), CLOSED (ปิดงาน · internal)
TERMINAL:    CANCELLED
```

The MAIN rollup (1a/1b) becomes a pure function `mainStatusOf(journey_status, mode)`.

---

## 2. CURRENT FREIGHT CODE STATE — what exists, what works, what's stub

### 2a. Migrations (the schema layer — all applied prod+dev)

| mig | table(s) | what | status-relevant content |
|---|---|---|---|
| 0048 | `freight_quotes` + `freight_quote_items` + `freight_quote_seq` | admin B2B quotation (plural) | status: `draft → pending_approval → approved → sent → accepted/rejected/expired`. quote_no `FQYYMMDD-NNNN`. |
| 0050 | `freight_shipments` + `freight_parties` + `freight_job_seq` | **THE spine** (one job/consignee) | ⚠️ **status only `draft → confirmed → in_progress → cleared → delivered / cancelled`** (6 states). `transport_mode ∈ {sea_fcl, sea_lcl, truck, air}` (4). job_no `A{YY}{NNNNN}`. ADR-0016 value block (commercial/declared/duty/VAT/Form-E). |
| 0051 | `freight_invoices` + `freight_invoice_lines` + seq | Commercial Invoice | status `draft → issued → cancelled`. invoice_no `FI{YYMMDD}-{NNNN}`. one issued / shipment. |
| 0052 | `freight_invoice_payments` | payment ledger | recorded/voided · payment_status derived. |
| 0053 | `freight_invoice_wht` (withholding_tax_entries) | WHT 1%/3% gate | cert_status pending/received/waived gates issuance. |
| 0057 | `customs_declarations` + lines + seq | ใบขนสินค้า (internal) | status `draft → submitted → accepted → released / cancelled`. import/export/transit. declaration_no `CD-{YYMMDD}-{NNNN}`. NetBay deferred. |
| 0134 | `freight_quote` (singular) | **public RFQ lead** (AX BOOKING funnel) | status `new → contacted → quoted → won/lost/spam`. ref `AX-YYYY-NNNNN`. anon-insertable. transport `{sea,air,truck}` · service `{import,export,customs,nondoc,clearance}`. |
| 0145 | `tb_freight_rate` | China-freight COST table + FX + markup tiers | admin-editable cost catalogue (sea_fcl/sea_lcl/air). `business_config freight.fx_rate_thb_per_usd` + `markup_tiers_pct` + `margin_cap_thb` (15k). |
| 0148 | (RLS) | freight doc PDF RLS roles | — |
| 0161/0162 | `tb_cargo_taxdoc_job` + customs cargo-link | cargo tax-doc job (separate from freight) | — |
| 0163 | **`freight_job_operations`** | **AX-JOB ops cockpit state layer** | the **4-stage** PRICING/SALES/DOC/ACC pipeline (`*_status ∈ {'', in_progress, done}`) + section assignments + read-only P&L snapshot + `is_urgent`. **One row over one shipment.** |
| 0164 | `freight_stage_checklists` | per-stage checklist items | stage ∈ {pricing,sales,docs,acc}. |
| 0165 | (ALTER) | freight P&L + margin-guard persistence | persists cost/profit/margin-cap flags on quotes/shipments + per-line commission breakdown. DISPLAY/ANALYTICS only. |
| 0166 | (RLS) | customs_declarations RLS roles | super/accounting/freight_import_doc/pricing. |
| 0167 | `freight_commission_*` ×4 | FREIGHT staff commission ledger | DORMANT behind `commission.freight_enabled` (OFF). tiers/accruals/withdrawals/items. AX-JOB rates (1%/5%/5%/flat 20฿) seeded `is_owner_confirmed=false`. |

### 2b. Actions (`actions/admin/freight*.ts` — 8 files)

| file | exports | works? |
|---|---|---|
| `freight-leads.ts` | list/triage public RFQ leads + `convertLeadToQuote` (BK-1 idempotent guard) | ✅ functional |
| `freight-quotes.ts` | create/edit draft · submit · approve/reject (super) · send · accept · expire · **convertQuoteToShipment** | ✅ functional (real, not stub — convert inserts a freight_shipments row) |
| `freight-shipments.ts` | create (reserves job_no) · update header+value-block · upsert party · the 5 status flips (`confirm/in_progress/cleared/delivered/cancel`) · auto-draft invoice on delivery | ✅ functional — but the status machine is the flat 6-state one |
| `freight-invoices.ts` | create draft · issue (WHT/serial gate) · cancel | ✅ functional |
| `freight-invoice-payments.ts` | record/void payments | ✅ functional |
| `freight-rates.ts` | CRUD `tb_freight_rate` + FX control | ✅ functional |
| `freight-commission.ts` | accrue/withdraw (gated by DORMANT flag) | ⚠️ ships DORMANT (no-ops until owner enables) |
| `freight-ops-cockpit.ts` | ensure ops row · set 4-stage status · record cost snapshot · assign owner · toggle urgent · checklist upsert · list board · get detail | ✅ functional — but this is the 4-stage AX-JOB layer, NOT the journey model |

### 2c. Admin pages (`app/[locale]/(admin)/admin/freight/**`)

| route | what | works? |
|---|---|---|
| `/freight/leads` + `/[ref]` | RFQ lead inbox + triage + convert | ✅ |
| `/freight/quotes` + `/new` + `/[id]` | B2B quotation list / create / detail (approve/send) | ✅ |
| `/freight/shipments` + `/new` + `/[id]` (+ value-block-editor, declaration-create-button) | shipment list / create / detail / status flips | ✅ (6-state) |
| `/freight/shipments/[id]/p-and-l` | P&L view | ✅ (reads 0165 snapshots) |
| `/freight/operations` + `/[id]` | **AX-JOB cockpit Kanban** (PRICING/SALES/DOC/ACC) + detail | ✅ |
| `/freight/rates` (+ fx-control) | cost-rate + FX maintenance | ✅ |
| `/freight/declarations` + `/[id]` | ใบขนสินค้า list / detail | ✅ |
| (nav) `/admin/commission/freight` | commission queue | ⚠️ DORMANT |

Sidebar entries all wired (`lib/admin/sidebar-menu.ts` — leads/rates/operations/commission/declarations/accounting-freight).

### 2d. Customer + public pages

| route | what | works? |
|---|---|---|
| `/(public)/freight-quote` | public RFQ wizard → writes singular `freight_quote` lead | ✅ |
| `/(protected)/freight` | customer freight hub | ✅ |
| `/(protected)/freight/shipments` + `/[id]` | customer shipment list + detail (status badge + value block + invoice PDFs + payment + WHT) | ✅ — but shows the flat 6-state badge, **no journey timeline** |
| `/(protected)/freight/quotes/[quote_no]` | customer view a sent quotation | ✅ |
| `/(protected)/freight/invoice/[id]` · `/receipts/...` | invoice + receipt PDFs | ✅ |

### 2e. Lib (`lib/freight/*` + `lib/validators/freight-*`)

- `rate-model.ts` / `rate-engine.ts` / `rate-lookup*.ts` — the AXELRA-grounded pricing engine
  (incoterm scope → line items → sell tiers → net margin). ✅ real, tested.
- `public-estimate.ts` — customer-safe rough estimate for the wizard. ✅
- `lead-status.ts` — lead lifecycle + BK-1 convert guard. ✅
- `commission-tier-select.ts` + `lib/freight-commission/calc-v2.ts` — commission calc (DORMANT). ✅
- `validators/freight-shipment.ts` — **the status + transport-mode label maps** (the flat 6 + 4).
- `validators/freight-ops.ts` — the 4-stage AX-JOB enums + `deriveBoardColumn`.

---

## 3. THE GAP — brief vs code

| # | brief requires | code today | gap severity |
|---|---|---|---|
| **G1** | **5 transport flavours** (truck_fcl, truck_lcl, sea_fcl, sea_lcl, air) | only **4 modes** (`sea_fcl, sea_lcl, truck, air`) — TRUCK doesn't split FCL/LCL | 🔴 — TRUCK FCL vs LCL have **different pipelines** (รับตู้/โหลด/ปิดตู้ vs รับสินค้า/รวม/ปิดรอบ) |
| **G2** | **per-flavour journey sub-status** (15-19 ordered steps, 3 phases) | flat **6-state** machine on `freight_shipments.status` | 🔴 **the core gap** — the entire journey model is absent |
| **G3** | **MAIN status rollup** (13 staff / 9 customer buckets) as top-of-list filter chips | none — the list shows the raw 6-state | 🔴 |
| **G4** | **internal vs `show_customer`** per sub-status (POL/ETD/ATD visible · CY/LOAD/RE/วางบิล/คืนตู้ hidden) | none — customer sees the same 6-state badge as staff | 🟠 |
| **G5** | **RED-overlay flag** (`IN_TRANSIT+DELAY`, `CUSTOMS_TH+HOLD`) as an overlay, not a status | none | 🟠 |
| **G6** | **milestone date fields** ETD/ATD/ETA/ATA/POL/POD/cutoff capturable + editable, surfaced in the customer timeline + the table header (ETD-ETA / ATD-ATA columns) | spine has `vessel_voyage/bl_no/port_*` but **no ETD/ATD/ETA/ATA/cutoff date columns** | 🔴 — the brief's table header (`ETD-ETA / ATD-ATA`) + customer timeline both need these |
| **G7** | **4-colour status badge** (🟢🟡🔵🔴) driven by the journey step's phase/state | customer page hard-codes a 6-colour map; admin similar | 🟠 — cosmetic until G2 lands |
| **G8** | **customer Timeline UI** (3-phase: ต้นทาง → ระหว่างทาง → ปลายทาง · 🟢 past / 🔵 current / เทา future) | customer page is a flat header + value/invoice cards, no timeline | 🟠 |
| **G9** | **"รอชำระเงิน" emphasised** as a customer-action 🟡 step | customer detail shows payment card but it's not a journey step | 🟡 |
| **G10** | the brief's new **table header** (SHIPMENT / SALE / ลูกค้า / สินค้า / ประเภท / สถานะ / POL-POD / ETD-ETA / ATD-ATA / ACTION) | the shipment list has a simpler header | 🟡 |
| **G11** | **วางบิล** can start as early as "ถึงโกดังไทย" (internal), runs in parallel with the journey end | accounting/billing is a separate invoice flow, not modeled as a journey step | 🟡 — works today via invoices, but not surfaced as the brief's status |

**What is NOT a gap (already good):**
- The **8-role permission model** the brief wants is largely already encoded — see §4.
- The 3-stage workflow-OWNERSHIP layer (PRICING/SALES/DOC/ACC cockpit, 0163) is a genuinely useful
  layer the brief's role table implies; it's just **not the journey status** (different axis).
- Quote → shipment → invoice → payment → customs-declaration spine is complete and money-safe.
- The pricing engine (rate-model/rate-engine) is real, AXELRA-grounded, tested.
- The commission ledger exists (DORMANT, awaiting owner rate confirm).

**Key insight on the two existing "status-like" systems:**
1. `freight_shipments.status` (6-state) = a coarse lifecycle (draft/confirmed/in_progress/cleared/
   delivered/cancelled). This is what the brief calls the MAIN status — but the brief wants 13/9
   buckets, not 6, and wants them DERIVED from the journey step.
2. `freight_job_operations.*_status` (4-stage AX-JOB) = WHO is working the job (which back-office
   section owns it now). This is orthogonal to the journey — a SEA shipment can be "ON_WATER" (journey)
   while DOC stage is "in_progress" (a section finishing the ใบขน). **Don't conflate them.**

The journey status (§1c) is the missing third axis. Recommended: add it as a new
`journey_status` column on `freight_shipments` + a canonical key catalogue (§1f), keep the existing 6-state
as a derived/legacy coarse field (or migrate it into the rollup function), and keep the 4-stage cockpit
untouched (it's the section-ownership axis).

---

## 4. FREIGHT STATUS ↔ 8-ROLE WORKSPACE alignment

The brief's 8 roles (`สิทธิ์การใช้งานตามตำแหน่ง.txt`) map to which journey sub-statuses each role may
ADVANCE. The code already has a granular role catalogue (`AdminRole` #16-28) that is a SUPERSET of the
brief's 8 — they collapse cleanly:

| brief role | code AdminRole(s) | owns journey steps | may set status (brief) |
|---|---|---|---|
| **1. Sales** | `freight_sales`, `freight_sales_manager`, `sales`/`sales_admin` (cargo), CS roles | intake / booking | รอดำเนินการ · รอลูกค้าคอนเฟิร์ม · ลูกค้าคอนเฟิร์มแล้ว. ❌ แก้ราคาหลังอนุมัติ · ปิดงาน · วางบิล |
| **2. Pricing** | `pricing` | quote/cost | รอประเมินราคา · เสนอราคาแล้ว · แก้ราคาแล้ว |
| **3. Document / CS** | `freight_export_cs`/`freight_import_cs`, `freight_export_doc`/`freight_import_doc`, `freight_clearance_both`, messengers | เตรียมเอกสาร → FORM E → ใบขน → แลก D/O → พิธีการ | เตรียมเอกสาร · เอกสารครบ · แลก D/O แล้ว · ยื่นใบขนแล้ว · ผ่านพิธีการแล้ว |
| **4. Operation / Transport** | `ops`, `freight_export_clearance`/`freight_import_clearance` (+ warehouse/driver cargo) | รับตู้/โหลด/ปิดตู้ · จองรถ-เรือ-ไฟลท์ · tracking ETA · ส่งปลายทาง · คืนตู้ | รับตู้ · โหลด · ระหว่างขนส่ง · ถึงปลายทาง · ส่งลูกค้าแล้ว · คืนตู้แล้ว |
| **5. Accounting** | `accounting` | ตั้งเบิก · รวมค่าใช้จ่าย · ออก Invoice · วางบิล · รับชำระ | รอวางบิล · วางบิลแล้ว · รอชำระ · ชำระแล้ว · ปิดงาน |
| **6. Manager** | `freight_*_manager`, `manager`, `super` | approve price · override status · assign · KPI | any (override) |
| **7. CEO / Admin** | `ultra`, `super` | everything | any · delete · restore |
| **8. Customer Portal** | (RLS `profile_id = auth.uid()`) | read-only own + แจ้งชำระ + แชท | none (read) |

**Alignment design (how journey-status ↔ role should wire):**

1. **Each canonical journey code carries a `default_role` / `allowed_roles`** (the section that
   advances it). The brief's "เปลี่ยนสถานะได้" lists per role ARE that mapping — encode them as the
   `allowed_roles` set per journey code. ADR-0014 state-transition pattern (the cargo side already
   does this with `canAnyRoleFlipFstatus`).
2. **The 4-stage AX-JOB cockpit (0163) is the workspace LENS over the journey.** A natural alignment:
   PRICING stage = Sales+Pricing journey steps (intake→quote→confirm) · DOC stage = Document/CS steps
   (เอกสาร→FORM E→ใบขน→แลก D/O→พิธีการ) · the journey TRANSIT/DEST steps = Operation/Transport ·
   ACC stage = Accounting (วางบิล→ปิดงาน). So the cockpit's 4 columns and the journey's role-owned
   step ranges are the SAME partition, viewed differently.
3. **`show_customer` per journey code** feeds the Customer Portal (role 8) timeline — it sees only the
   `show_customer=true` codes, collapsed to the 9 customer main-buckets (1b).
4. **Manager/CEO bypass** = `isGodRole` (ultra/super) + manager → may set ANY journey code (override) +
   set the RED issue_flag. This already matches `isGodRole` usage in `freight-shipments.ts`.
5. **RLS** already enforces role 8 (customer reads own). The journey-status advance actions should
   gate on the journey code's `allowed_roles` (new) the same way `freight-ops-cockpit.ts` gates each
   stage on `ROLES_PRICING/SALES/DOC/ACC`.

**Recommended build order (to close the gap without breaking the working spine):**
1. **Expand `transport_mode`** to 5 flavours (add `truck_fcl`/`truck_lcl`; migrate existing `truck` →
   keep as legacy alias or backfill). (G1)
2. **Add `journey_status` + `issue_flag` + `issue_note`** columns to `freight_shipments` + the canonical
   key catalogue (TS const SOT keyed by `(mode, code)` with phase/seq/show_customer/labels/main_status/
   allowed_roles/milestone_field). (G2, G4, G5)
3. **Add milestone date columns** (etd/atd/eta/ata/cutoff/cn_cleared_at/th_cleared_at/...) — editable
   per the brief ("ETD-ETA แก้ไขหรืออัพเดตสถานะได้"). (G6)
4. **Derive `main_status`** (the 13/9 buckets) via a pure function for the list filter chips. (G3)
5. **Journey-advance action** gated by `allowed_roles` per code (ADR-0014 pattern) + a RED-flag toggle. (G5)
6. **Customer 3-phase timeline UI** reading only `show_customer` codes + 4-colour badges + emphasised
   "รอชำระเงิน". (G7, G8, G9)
7. **New shipment-list table header** + ETD-ETA / ATD-ATA columns. (G10)
8. Keep the 0163 4-stage cockpit as the section-ownership lens; optionally wire it to derive from the
   journey step ranges so the two stay consistent.

Net: **the spine, money, docs, pricing, commission, and role catalogue are all built and safe. The
missing piece is the per-flavour JOURNEY status axis (codes + phases + show_customer + RED flag +
milestone dates) and the customer timeline that renders it.** That is a contained, additive build
(no rebuild of the spine) — the brief's status model layers ON TOP of the existing freight_shipments.
