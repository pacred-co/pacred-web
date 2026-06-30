# Pacred service catalog → DB mapping + `service_catalog` design (2026-06-30)

> READ-ONLY analysis. Goal: define the real **7–8 services Pacred runs**, split by
> the owner's axes (FCL/LCL × รถ/เรือ/แอร์ × คาร์โก้/เฟรท), map each to the CURRENT
> live DB, find the GAP, and propose a `service_catalog` table + per-service dashboard.

---

## 0. TL;DR

- The public site advertises **13–14 service cards** (`app/[locale]/(public)/services/page.tsx`),
  but only **6 are `status: "live"`** with a real order surface. The rest are `"soon"`.
- The business actually **runs and bills 4 core "service-type" lanes today** (the accounting
  taxonomy already encodes them — see §1A): **ฝากสั่งซื้อ (shop) · ฝากนำเข้า เรท (forwarder-rate) ·
  ฝากนำเข้า รายการ (forwarder-item) · ฝากโอนหยวน (payment)** — all CARGO (จีน→ไทย).
- The **FREIGHT** lanes (import FCL/LCL/air, export, customs-clearance) are **scaffolded but
  near-empty** — `freight_quotes`/`freight_shipments`/`customs_declarations` exist, low/no rows.
- **There is NO `service_catalog` table.** "Which service is this order" is **implicit** —
  inferred from *which table the row lives in* + a few discriminator columns
  (`ftransporttype`, `fproductstype`, `fshipby`, container-code prefix, `transport_mode`,
  `tax_doc_pref`). This is the core GAP: services are not first-class, so a clean
  per-service dashboard / catalog cannot be built without joins-by-convention.

**Two coexisting DB worlds** (CLAUDE_TECHNICAL.md): the **rebuilt** tables (`service_orders`,
`forwarders`, `freight_*`) are mostly **0-row in prod**; the **legacy `tb_*`** tables hold all
live customer data. Everything below maps to the **live `tb_*` source** unless noted.

---

## 1. The canonical service list (8 services)

Picking the real 8 the business runs/sells (collapsing the marketing 13). Each service =
one **billable lane** with its own order surface and sub-dimensions.

| # | Service (TH) | service_key | Group | Live? | Sub-dimensions |
|---|---|---|---|---|---|
| 1 | **ฝากสั่งซื้อสินค้า** (China shopping cart) | `shop_order` | cargo | ✅ live | provider 1688/taobao/tmall; transport รถ/เรือ/แอร์; crate; pay origin/dest |
| 2 | **ฝากโอนชำระ / โอนหยวน** (Yuan/Alipay transfer) | `yuan_transfer` | cargo | ✅ live | — (pure money transfer; no transport) |
| 3 | **ฝากนำเข้า — คาร์โก้** (China→TH cargo, LCL consolidated) | `import_cargo` | cargo | ✅ live | **transport รถ/เรือ/แอร์**; rate-basis kg/cbm; product general/tisi/fda/special; crate/qc; FCL/LCL (defaults LCL) |
| 4 | **ฝากนำเข้า — เฟรท FCL/LCL** (intl freight, full/part container) | `freight_import` | freight | 🟡 soon/scaffold | **FCL vs LCL**; **mode sea/truck/air**; incoterm EXW…DDP; POL/POD |
| 5 | **ส่งออกสินค้า** (Export worldwide) | `freight_export` | freight | 🟡 soon/scaffold | mode sea_fcl/sea_lcl/truck/air; incoterm; POL/POD; export doc-kit |
| 6 | **เคลียร์สินค้าติดด่าน / ตัวแทนออกของ** (Customs clearance) | `customs_clearance` | service | 🟡 soon/scaffold | mode รถ/เรือ/แอร์ (port); HS/พิกัด; Form-E; ใบขน |
| 7 | **ใบกำกับ / ใบขนสินค้า** (Tax-invoice + customs declaration issuing) | `tax_documents` | service | 🟡 partial (dormant flag) | doc-mode ใบกำกับ/ใบขน/ไม่รับ; per cargo/freight |
| 8 | **ขนส่งในไทย + แมสเซ็นเจอร์** (Domestic logistics) | `domestic_logistics` | service | 🟡 soon | last-mile driver / Flash / Kerry / J&T / pickup |

> **Why these 8 (and not the 13 cards):** ขอคืนภาษี (tax-refund), ฟูมิเกชัน (fumigation),
> ฝากขาย (consignment), ฝากจ่าย (bill-payment), จับคู่ลงทะเบียนกรมศุล (broker-matching) are
> all marketing `"soon"` cards with **no DB home, no order surface, no billing path** — they
> belong in the catalog as `active=false` placeholders (lead-capture only), not as run services.
> Keep them as catalog rows so the public grid + future build are driven by ONE table.

### Sub-dimension matrix (the owner's FCL/LCL × รถ/เรือ/แอร์ × คาร์โก้/เฟรท axes)

| service_key | คาร์โก้/เฟรท | FCL/LCL | รถ (truck) | เรือ (sea) | แอร์ (air) |
|---|---|---|---|---|---|
| `shop_order` | cargo | LCL only | ✅ | ✅ | ✅ |
| `yuan_transfer` | cargo | n/a | n/a | n/a | n/a |
| `import_cargo` | cargo | LCL (consolidated) | ✅ | ✅ | ✅ |
| `freight_import` | freight | **FCL + LCL** | ✅ | ✅ | ✅ |
| `freight_export` | freight | **FCL + LCL** | ✅ | ✅ | ✅ |
| `customs_clearance` | service | n/a (entry per mode) | ✅ | ✅ | ✅ |
| `tax_documents` | service | n/a | n/a | n/a | n/a |
| `domestic_logistics` | service | n/a | ✅ (TH only) | — | — |

**Key business distinction (cargo vs freight):**
- **คาร์โก้ (cargo)** = Pacred is the *importer-of-record*, consolidates many customers' goods
  in one container, bills by kg/cbm rate-card. China→TH only. = `shop_order` + `import_cargo`.
- **เฟรท (freight)** = customer owns the goods, Pacred is the *forwarder/broker*; FCL or LCL,
  any origin/destination, incoterm-driven, bills per-JOB/quote. = `freight_import` + `freight_export`.
- The split also drives the **tax document**: cargo → mostly ใบเสร็จ/ใบกำกับ (we imported);
  freight → ใบขน + service VAT (customer owns goods). See §1B.

### 1A. The taxonomy ALREADY exists in code (accounting menubar)

`app/.../accounting/cargo/income/[type]/[service]/[[...slug]]/page.tsx` already enumerates the
4 live service lanes verbatim — this is the de-facto current service split:

```
SERVICE_LABEL = {
  "shop":           "ฝากสั่งซื้อสินค้า",        // = shop_order
  "forwarder-rate": "ฝากนำเข้า แบบเรทราคา",    // = import_cargo (rate-priced)
  "forwarder-item": "ฝากนำเข้า แบบรายการ",     // = import_cargo (itemised)
  "payment":        "ฝากโอนหยวน",              // = yuan_transfer
}
```
`forwarder-rate` and `forwarder-item` are **two pricing modes of the same `import_cargo` service**,
not two services. The proposed `service_catalog` collapses them to `import_cargo` + a
`pricing_mode` flag.

### 1B. The 3 tax-document modes (already a SOT) — drives tax-invoice eligibility

`lib/tax/tax-doc-mode.ts` defines the canonical per-order doc mode (`tb_*.tax_doc_pref`):

| mode | pref | issues | VAT-7% base |
|---|---|---|---|
| `tax_invoice` (ใบกำกับ) | `tax_invoice` | ใบกำกับภาษี | goods value (we are importer) |
| `customs` (ใบขน) | `customs` | ใบขนสินค้า | **none on bill** — 7% on internal margin |
| `none` (ไม่รับฯ) | `receipt` | ใบเสร็จรับเงิน (not a tax invoice) | none on bill — margin VAT internal |

→ **tax-invoice eligibility is per-ORDER (the `tax_doc_pref` column), not per-service**, but the
**default** doc mode differs by service (cargo defaults receipt/ใบกำกับ; freight defaults ใบขน).
The shop+yuan tax-invoice issuance is **flag-gated dormant** (`tax_invoice.shop_yuan_enabled` =
OFF, migration 0152 / `lib/tax/shop-yuan-flag.ts`).

---

## 2. Per-service → current DB mapping + 3-account routing + tax-invoice eligibility

> "3-account routing" = the SELLING / COST / DECLARED 3-number model (CLAUDE.md cargo-acct epic;
> `lib/forwarder/cargo-cost-autofill.ts` + `lib/tax/tax-doc-mode.ts`). Each service routes to a
> selling account, a cost account, and (for freight/customs) a declared-value (มูลค่าสำแดง).

### 1. `shop_order` — ฝากสั่งซื้อ
- **Live table(s):** `tb_header_order` (header, `hno` PK, `hstatus` 1–6 + '40' ถึงโกดังจีน) +
  `tb_order` (line items) + `tb_cart` (cart). Rebuilt twin `service_orders` = **0-row, do not use**.
- **Discriminator:** lives in `tb_header_order`; provider in `tb_order.cprovider`.
- **3-account:** SELLING = `tb_header_order.htotalpriceuser`; COST = `hcostall`/`hcostallth`
  (cost_unit per line via cargo-cost editor); DECLARED = n/a (goods bought, declared only if it
  spawns an import). PEAK GL: selling 410101 / cost 510103 (migration 0177).
- **Tax-invoice:** `tax_doc_pref` on `tb_header_order` (migration 0127). Default receipt;
  ใบกำกับ issuance **dormant** until `tax_invoice.shop_yuan_enabled` flips.
- **Spawn link:** a shop order that becomes physical import links to a `tb_forwarder` row
  (`reforder` OR `tb_order.ctrackingnumber = tb_forwarder.ftrackingchn`); status syncs via DB
  trigger (migration 0215/0216).

### 2. `yuan_transfer` — ฝากโอนหยวน
- **Live table(s):** `tb_payment` (`paystatus`, `payrate`, `paythbcost`, `payprofitthb`).
- **3-account:** SELLING = customer THB charged at sell yuan-rate; COST = `paythbcost` (cost
  rate `hRateCostDefault`); PROFIT = `payprofitthb`. DECLARED = n/a.
- **Tax-invoice:** `tb_payment.tax_doc_*` columns; same dormant flag as shop.

### 3. `import_cargo` — ฝากนำเข้า (คาร์โก้)
- **Live table(s):** `tb_forwarder` (`fno` PK, `fstatus` 1–7) + `tb_forwarder_item` +
  `tb_forwarder_img` + container ledger `tb_cnt`/`tb_cnt_item`/`tb_cnt_pay_*`. Rebuilt twin
  `forwarders` = **0-row, do not use**.
- **Discriminators:**
  - transport mode = **container-code prefix** (`fcabinetnumber` → GZS=เรือ/GZE=รถ/GZA=แอร์,
    `lib/forwarder/cabinet-transport.ts`; the stored `ftransporttype` is unreliable).
  - `fproductstype` (1 char) = general/tisi/fda/special; `fshipby` = TH delivery carrier.
  - pricing mode (rate vs item) = whether `customrate`/rate-card vs per-line `fcosttotalprice`.
  - **FCL/LCL = not stored explicitly today** → currently always treated as LCL/consolidated.
- **3-account:** SELLING = `ftransportprice`+composite (`calcForwarderOutstanding`); COST =
  `fcosttotalprice` (MOMO 2,500/CBM, migration 0194) + cargo-cost editor; DECLARED =
  `tb_forwarder_item.declared_value_thb` (migration 0179, USD/CNY-anchored customs FX).
- **Tax-invoice:** `tb_forwarder.tax_doc_pref` (migration 0127). Forwarder ใบกำกับ issuance is
  the live one (`tb_forwarder_tax_invoice`). ใบขน via `customs_declarations` cargo branch
  (`/api/customs-declaration/[id]`, migration 0162).

### 4. `freight_import` — เฟรท นำเข้า FCL/LCL
- **Live table(s):** `freight_quotes` + `freight_quote_items` (mig 0048) → `freight_shipments`
  (mig 0050) → `freight_invoices`/`freight_invoice_payments` (mig 0051/0052). **Low/near-zero rows.**
- **Discriminators:** `freight_shipments.transport_mode` ∈ {`sea_fcl`, `sea_lcl`, `truck`, `air`}
  — **this is the only place FCL/LCL is a first-class column** + `incoterm` + `port_loading`/`port_discharge`.
- **3-account:** SELLING = quote `total` (Σ items per-JOB/CBM/KGM); COST = `freight_shipments`
  cost snapshot + P&L (mig 0050/0165); DECLARED = `customs_declarations` lines.
- **Tax-invoice:** freight defaults ใบขน + service VAT 7% (customer owns goods); freight
  commission ledger dormant (`commission.freight_enabled`, mig 0167).

### 5. `freight_export` — ส่งออก
- **Live table(s):** SAME `freight_quotes`/`freight_shipments` stack — **no direction column
  distinguishes import vs export today**. Public route `services/export-worldwide`. **GAP** below.
- **3-account / tax:** same freight stack; export doc-kit (DO/Form-E) via `/api/freight-invoice/[id]/*`.

### 6. `customs_clearance` — เคลียร์ติดด่าน / ตัวแทนออกของ
- **Live table(s):** `customs_declarations` + `customs_declaration_lines` (mig 0057) +
  HS dictionary `hs_codes` (mig 0030/0180/0224) + HS-consult queue `hs_consult_ticket` (mig 0225).
- **3-account:** SELLING = brokerage service fee; COST = port/agent costs; DECLARED =
  declaration line values (มูลค่าสำแดง).
- **Tax-invoice:** ใบขน (`customs` mode) — VAT 7% on the service fee / internal margin.

### 7. `tax_documents` — ใบกำกับ / ใบขน issuing
- **Live table(s):** `tb_forwarder_tax_invoice` (forwarder, LIVE) · `tb_shop_tax_invoice`
  (shop+yuan, DORMANT) · `tax_invoices` (mig 0034 = **0-row dead twin**, redirected to
  `/admin/accounting/etax`) · `customs_declarations` (ใบขน). NOT really a "service" the customer
  orders — it's a **cross-cutting doc layer** (kept as a catalog row for the public grid + the
  4-role taxdoc workspace `tb_cargo_taxdoc_job`, mig 0161).

### 8. `domestic_logistics` — ขนส่งในไทย + แมสเซ็นเจอร์
- **Live table(s):** `tb_forwarder_driver` + `tb_forwarder_driver_item` + `tb_forwarder_tran_th_h`/
  `_sub` (TH transport batches). Driven by `fshipby` carrier code. Last-mile only — not an
  independently-ordered service today (rides on `import_cargo`).

---

## 3. The GAP — what has no DB home / no first-class representation

1. **No `service_catalog` table at all.** Service identity is inferred from *which table the row
   is in*. → can't list services, can't drive the public grid from data, can't tag an order's
   service cleanly, can't aggregate "all orders of service X" without table-specific queries.

2. **No `service_key` column on any order table.** `tb_header_order`, `tb_forwarder`,
   `tb_payment`, `freight_shipments` have NO column saying "this is service N". The split is
   by-table + by-discriminator-convention only.

3. **FCL vs LCL is only first-class for FREIGHT** (`freight_shipments.transport_mode` has
   `sea_fcl`/`sea_lcl`). For CARGO (`tb_forwarder`) there is **no FCL/LCL flag** — cargo is
   implicitly always LCL/consolidated. Owner wants the split explicit across all services.

4. **Import vs Export not distinguished in the freight stack.** `freight_quotes`/`freight_shipments`
   have `transport_mode` but **no `direction` (import/export) column**. `freight_import` and
   `freight_export` currently share the same rows with no discriminator → export "service" has
   no DB identity beyond a public marketing page.

5. **`pricing_mode` (rate vs item) is implicit** for `import_cargo` (forwarder-rate vs
   forwarder-item) — derived, not stored.

6. **5 marketing services have ZERO DB home:** tax-refund, fumigation, consignment,
   bill-payment, broker-matching — only `"soon"` cards, lead-capture only.

7. **transport-mode for cargo is decoded from the container-code string**, not a stored enum on
   the order — fragile, only resolves AFTER a container is assigned (`cabinet-transport.ts`).

---

## 4. Proposed `service_catalog` table

A small, mostly-static reference table that makes services first-class. Drives: the public
service grid, the per-service dashboard, order tagging, and the tax-doc default.

```sql
-- migration 0232 (next free = 0232 after 0231)
create table if not exists public.service_catalog (
  id                 uuid primary key default gen_random_uuid(),
  service_key        text unique not null,            -- 'shop_order' | 'import_cargo' | ...
  name_th            text not null,                   -- 'ฝากนำเข้า — คาร์โก้'
  name_en            text,
  group_kind         text not null
                       check (group_kind in ('cargo','freight','service')),
  -- which transport modes this service can use (subset of รถ/เรือ/แอร์)
  transport_modes    text[] not null default '{}',    -- e.g. '{truck,sea,air}'
                       -- elements ∈ {'truck','sea','air'} ; '{}' = n/a (yuan/tax-doc)
  -- FCL/LCL applicability
  fcl_lcl            text not null default 'na'
                       check (fcl_lcl in ('fcl','lcl','both','na')),
  direction          text not null default 'import'   -- distinguishes freight_import vs freight_export
                       check (direction in ('import','export','both','na')),
  pricing_mode       text                              -- 'rate' | 'item' | 'job' | null
                       check (pricing_mode in ('rate','item','job') or pricing_mode is null),
  issues_tax_invoice boolean not null default false,   -- can produce ใบกำกับ?
  default_tax_doc    text not null default 'receipt'   -- default tax_doc_pref for new orders
                       check (default_tax_doc in ('receipt','tax_invoice','customs')),
  -- the SELLING/COST account routing (3-account model + PEAK GL)
  default_gl_selling text,                             -- e.g. '410101'
  default_gl_cost    text,                             -- e.g. '510103'
  requires_declared  boolean not null default false,   -- needs มูลค่าสำแดง (freight/customs)
  -- which live table holds this service's orders (documentation/aggregation hint)
  order_table        text,                             -- 'tb_header_order' | 'tb_forwarder' | 'tb_payment' | 'freight_shipments'
  public_href        text,                             -- '/services/import-china' (null = soon)
  active             boolean not null default true,     -- false = marketing-only / coming soon
  sort               int not null default 100,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
```

### Seed (the real lanes)

| service_key | group | modes | fcl_lcl | direction | pricing_mode | tax_inv | default_doc | order_table | active |
|---|---|---|---|---|---|---|---|---|---|
| `shop_order` | cargo | truck,sea,air | lcl | import | item | ✔ (dormant) | receipt | tb_header_order | ✔ |
| `yuan_transfer` | cargo | — | na | na | — | ✔ (dormant) | receipt | tb_payment | ✔ |
| `import_cargo` | cargo | truck,sea,air | lcl | import | rate/item | ✔ | receipt | tb_forwarder | ✔ |
| `freight_import` | freight | truck,sea,air | both | import | job | ✔ | customs | freight_shipments | ✔ |
| `freight_export` | freight | truck,sea,air | both | export | job | ✔ | customs | freight_shipments | ✔ |
| `customs_clearance` | service | truck,sea,air | na | both | job | ✔ | customs | customs_declarations | ✔ |
| `tax_documents` | service | — | na | na | — | ✔ | — | (cross-cutting) | ✔ |
| `domestic_logistics` | service | truck | na | na | — | ✘ | receipt | tb_forwarder_driver | ✔ |
| `tax_refund` | service | — | na | na | — | ✘ | — | (none) | ✘ |
| `fumigation` | service | — | na | na | — | ✔ | customs | (none) | ✘ |
| `consignment` | cargo | — | na | na | — | ✘ | receipt | (none) | ✘ |
| `bill_payment` | service | — | na | na | — | ✘ | receipt | (none) | ✘ |
| `broker_matching` | service | — | na | na | — | ✘ | — | (none) | ✘ |

> The `active=false` rows are the marketing "soon" cards — keep them in the catalog so the public
> grid renders from ONE table and a future build flips `active=true` + sets `public_href`.

### How existing orders link to a service

Two safe, additive options (no destructive rewrite):

- **Option A (recommended, additive):** add a nullable `service_key text references
  service_catalog(service_key)` column to each order table (`tb_header_order`, `tb_forwarder`,
  `tb_payment`, `freight_shipments`) + a **backfill** that sets it from the table identity:
  - all `tb_header_order` → `shop_order`
  - all `tb_payment` → `yuan_transfer`
  - all `tb_forwarder` → `import_cargo` (no current FCL/LCL split, all LCL)
  - all `freight_shipments` → `freight_import` (or `freight_export` once a `direction` column
    is added to that table — see GAP #4; until then default import)
  New orders set `service_key` at creation. This makes "all orders of service X" a single
  indexed `WHERE service_key = ...` per table.

- **Option B (view-only, zero schema change to order tables):** a SQL view
  `vw_service_orders_unified` that UNIONs the 4 order tables, tagging each row with a literal
  `service_key`, normalised columns (`order_no`, `customer_id`, `status`, `selling_thb`,
  `cost_thb`, `transport_mode`, `created_at`). Cheapest for a dashboard; doesn't let new orders
  self-tag. **Best done alongside Option A** (A for tagging, B for the dashboard rollup).

To make FCL/LCL + direction explicit for cargo/freight (GAP #3/#4): add `fcl_lcl text` to
`tb_forwarder` and `direction text` to `freight_shipments` (both additive, default lcl/import),
then UI can set them. The catalog's `fcl_lcl`/`direction` columns define the *allowed* values;
the order columns store the *chosen* value.

---

## 5. What a per-service DASHBOARD needs

One dashboard per `service_catalog` row (or one dashboard with a service selector). For each
service, compute from its `order_table` (+ the unified view from §4 Option B). KPIs:

**Volume / pipeline**
- **Order count** (total · this month · today) — `COUNT(*)` per service.
- **Status breakdown** — group by the service's status enum:
  - shop: `tb_header_order.hstatus` (1 pending → 6 cancelled, '40' ถึงโกดังจีน).
  - cargo: `tb_forwarder.fstatus` (1 รอชำระ → 7 ส่งสำเร็จ).
  - freight: `freight_shipments.status` (draft → delivered/cancelled).
  - yuan: `tb_payment.paystatus`.
- **In-transit count** — service-specific "physically moving" statuses (cargo fstatus 2/3;
  freight in_progress; shop status '40').
- **Awaiting-payment / overdue count** — `awaiting_payment` + `payment_due_at` past.

**Revenue / money (3-account)**
- **Revenue (SELLING) this period** — Σ selling per service (`htotalpriceuser` /
  `calcForwarderOutstanding` / quote `total` / yuan THB).
- **Cost** — Σ `fcosttotalprice` / `hcostall` / freight cost snapshot / `paythbcost`.
- **Margin / profit** — selling − cost (the cargo-acct 3-number model already computes this).
- **Declared value Σ** (freight/customs) — Σ `declared_value_thb`.
- **Outstanding AR / unbilled** — orders delivered but not billed/paid.

**Mix / split (the owner's axes)**
- **By transport mode** (รถ/เรือ/แอร์) — derived from container-code (`cabinet-transport.ts`)
  for cargo, `transport_mode` for freight.
- **By FCL/LCL** (once the explicit column exists).
- **By cargo vs freight** (group_kind).
- **By tax-doc mode** (ใบกำกับ/ใบขน/ไม่รับ) — `tax_doc_pref` distribution.

**Operational**
- **Avg cycle time** per status step (date_pending → date_completed timestamps exist on every
  table).
- **Per-rep / per-sales** breakdown (sales referral columns).
- **Top customers / repeat rate** per service.

**Source of truth note for the dashboard builder:** query the **`tb_*`** tables (live data),
NOT the rebuilt `service_orders`/`forwarders`/`freight_shipments` twins where those are 0-row.
For freight the `freight_*` tables ARE the live ones (no `tb_` twin) but are near-empty today —
the dashboard will read ~0 until freight volume grows.

---

## 6. File references (for the next agent)

- Public service grid (13 cards, 6 live): `app/[locale]/(public)/services/page.tsx`
- Service routes built: `app/[locale]/(public)/services/{china-shopping,yuan-transfer,import-china,import-china-fcl,import-china-lcl,customs-clearance,export-worldwide}`
- Accounting service taxonomy (shop/forwarder-rate/forwarder-item/payment): `app/[locale]/(admin)/admin/accounting/cargo/income/[type]/[service]/[[...slug]]/page.tsx`
- Tax-doc 3-mode SOT: `lib/tax/tax-doc-mode.ts` · shop-yuan dormant flag: `lib/tax/shop-yuan-flag.ts`
- Transport-mode decode (container code): `lib/forwarder/cabinet-transport.ts`
- Legacy live schema (117 `tb_*`): `supabase/migrations/0081_pcs_legacy_schema.sql`
  - shop: `tb_header_order` + `tb_order` + `tb_cart`
  - cargo: `tb_forwarder` (`ftransporttype`/`fproductstype`/`fshipby`/`fcabinetnumber`) + `tb_forwarder_item` + `tb_cnt*`
  - yuan: `tb_payment` · receipts: `tb_receipt`/`tb_receipt_item`
- Rebuilt (mostly 0-row) twins: `service_orders` (mig 0011) · `forwarders` (mig 0010)
- Freight stack: `freight_quotes` (0048) · `freight_shipments` (0050 · only `transport_mode`
  has `sea_fcl`/`sea_lcl`) · `freight_invoices` (0051) · `customs_declarations` (0057)
- 3-account / cargo-cost: `lib/forwarder/cargo-cost-autofill.ts` · PEAK GL seed: mig 0177 ·
  MOMO cost 2,500/CBM: mig 0194 · declared customs-FX: mig 0179 · HS library: mig 0030/0180/0224
- **Next free migration = 0232** (last applied = 0231).
