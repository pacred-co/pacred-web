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

## ⚠️ v1 limitations (next increments)
1. **Freight COST side** — the model has accurate Thai-local costs but the
   China-freight *cost* (carrier rate) isn't transcribed yet (sell only) → freight
   profit is currently overstated. Add the per-POL/POD/carrier cost cards
   (`AXELRA Cost & Profit & Com.xlsx` FRE-IM-SEA-FCL/LCL/AIR sheets · per-month
   exchange) for true margin. Then an admin-editable `tb_freight_rate_*` table
   (the cargo `tb_rate_g_*` pattern).
2. **Transport = "เช็คตามระยะทางจริง"** — the per-distance Thai truck rate is a
   representative default; a distance/zone table would refine it.
3. SEA-FCL/AIR rate cards are partial (representative) — extend from the xlsx.

Compliance: the off-book "ปิดตรวจ จ่ายเจ้าหน้าที่" line is **not** modelled (priced 0
in the sheets too) — compliant core only (freight cluster doc §5).
