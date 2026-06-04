# 🚢 Freight rate engine — Phase D increment 1 (2026-06-04)

First concrete Phase-D build (owner "ลุยเลย"). The freight admin ERP is already
scaffolded (quotes · shipments · invoices · declarations · QA — migrations
0045-0063 + actions + validators), but the freight quote-builder priced line
items **manually** (`computeQuoteTotals` just sums hand-typed `unit_price_thb`).
The §5.2 gap = a **rate engine** that auto-prices from the real rate cards.

## What shipped
- **`lib/freight/rate-model.ts`** — the rate data, transcribed verbatim from the
  REAL AXELRA `แบบฟรอมออกราคา IMPORT .xlsx` (the `/Users/dev/Desktop/olddata dev`
  realdata the owner gave): the Thai-local line items (Customs Registration
  1500/cost 800 · Clearance 3500/500 · Declaration 350/200 · D/O 421 · Gate ·
  Labor · Overtime · Rent · Stamp · Transport 4W/6W), the China-side freight +
  origin-doc lines (SEA-LCL per-CBM 3-tier 2200/1800/1600 · B/L · DOC · FORM-E ·
  SEA-FCL per-container · AIR per-KG), the **incoterm → scope** map (`เงื่อนไข term`:
  CIF/FOB = Thai customs+transport · CFR/CPT/CIP = +freight · EXW/FCA = +origin ·
  DDP = +import-tax), VAT 7%, the CEO ≤15k/ตู้ margin cap, the commission split.
- **`lib/freight/rate-engine.ts`** — `composeFreightQuote(spec)` (pure, no IO):
  incoterm → scope → pick the in-scope Thai + freight lines for the mode → price
  each (truck-size 4W/6W · sell-tier ปลีก/ขาประจำ/ส่ง · per-CBM/KG/container) →
  subtotal cost/sell → profit → VAT → **≤15k margin-guard flag** → commission
  (1% freight + 5% customs + 5% doc − 3% WHT).
- **`lib/freight/rate-engine.test.ts`** — 23 tests, **grounded in the real sheet
  totals**: reproduces `IM CIF AIR` รวมราคา **10,211** (4W) / **13,301** (6W) and
  `IM CIF SEA LCL` **13,511** / **14,801** exactly — proof the model is faithful.

## ✅ increment 2 — wired into the quote-builder UI (SHIPPED)
The engine is now reachable + usable, not just a library:
- **`actions/admin/freight-quotes.ts` → `adminComposeQuoteFromRateCard`** — same
  role gate (`super/ops/sales_admin/accounting`) + draft-only guard + audit log
  as the manual add. Calls `composeFreightQuote()`, bulk-inserts the in-scope
  lines into `freight_quote_items`, aligns the header (mode/incoterm/vat),
  recomputes totals. Append OR replace-existing. **Internal only — adds draft
  line items, zero customer comms.**
- **`/admin/freight/quotes/[id]` → `RateCardAutoFill`** panel (draft only): pick
  mode / incoterm / 4W-6W / sell-tier / CBM·KG·ตู้ → **🧮 เติมราคา** → styled
  confirm-before-mutate (กันคนลั่น) → fills the line-item table + shows
  `เติม N รายการ · ยอดขาย · กำไร` and a ⚠️ flag if profit > 15k/ตู้. Sales review
  + edit + submit-for-approval afterwards (the existing flow is unchanged).

## ✅ increment 3 — honesty flag for the un-modelled China cost (SHIPPED)
We examined the COST workbook (`AXELRA Cost & Profit & Com.xlsx`) to add the
China-freight cost. **Finding: it can't be honestly hardcoded** — the cost side
is a **monthly, FX-dependent, per-port × per-carrier USD matrix** (`FRE IM SEA
FCL/LCL/AIR` sheets: explicit `35 /USD` exchange column · "เรทเดือน เมษายน /
มิถุนายน 2568" cards · per-carrier RCL/CUL/TSL/WHL rows · rate-expiry dates) plus
a **markup-tier policy** (`เงื่อนไข จ๊อบการทำงาน!A23 "อัตราการ+กำไร" → เฟรท
30%/25%/20%/15%/10%`). Snapshotting volatile USD carrier rates into a TS constant
would go stale immediately and **violate the owner's "อย่ามั่ว"** bar.

So instead of fabricating a cost: `composeFreightQuote()` now returns
**`chinaCostPending`** — true when the quote bills a freight/origin line whose
cost isn't modelled (EXW/CFR/etc.), false for CIF/FOB (Thai-only scope → those
costs ARE modelled → profit reliable). The auto-fill UI then labels the figure
**"กำไรขั้นต้น"** + "ยังไม่รวมต้นทุนค่าเฟรท/ต้นทางจีน" so no one mistakes a gross EXW
margin for net. (CIF/FOB still show a true "กำไร".)

## 🔴 HANDOFF — the cost side needs an admin rate table + accounting input
The true China-freight margin is **not** a hardcode job; it's a build that
touches accounting policy. Needs an owner/ภูม decision before เดฟ wires it:
- **monthly FX** — the sheet uses `35 ฿/USD`; who sets/refreshes it + cadence?
- **per-port/carrier cost cards** — `FRE IM SEA FCL/LCL/AIR` (USD, per POL/carrier,
  with expiry) → an admin-editable `tb_freight_rate_*` table (the cargo
  `tb_rate_g_*` pattern) so staff maintain it, not a code deploy.
- **markup tiers** — 30/25/20/15/10% (`เงื่อนไข` sheet): which tier applies to
  whom (volume? customer class?) → config, not a guess.
- **`COST` + `Profit AXELRAPRICING` sheets** = per-job actuals ledgers (realized
  cost/sell/กำไร/com per real shipment) — these belong in the freight P&L /
  commission reporting (ภูม lane), not the quote engine.

## ⚠️ v1 limitations (smaller next increments)
1. **Transport = "เช็คตามระยะทางจริง"** — the per-distance Thai truck rate is a
   representative default; a distance/zone table (the `Transport` sheet) refines it.
2. SEA-FCL/AIR sell cards are partial (representative) — extend from the xlsx.

Compliance: the off-book "ปิดตรวจ จ่ายเจ้าหน้าที่" line is **not** modelled (priced 0
in the sheets too) — compliant core only (freight cluster doc §5).
