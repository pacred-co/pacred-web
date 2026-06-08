# Pacred CARGO tax-invoice (ใบกำกับภาษี) flow — the 3-number model + 4-role workflow

**Date:** 2026-06-09 · **Source:** owner (พี่ป๊อป) spec + the AXELRA Google-Sheet template (`PACRED ใบกำกับภาษี.xlsx`, 70+ filled sheets) + the `olddata dev/data งานเก่า` chats (AX Pricing+SALE+DOC, PR PRICING+NINESPEED) + the AXELRA "ใบประหน้า Sale and Pricing" examples + AX JOB/BOOKING. **Built artifact:** `/Users/dev/Downloads/PACRED-ใบกำกับภาษี-form-v2-pricing.xlsx` (build script captured below). **Why durable:** this is the spec for building the in-platform tax-invoice + cost workflow ("เสร็จโปรเจคนี้ เอามาใส่ใช้จริงใน platform"). PCS + ไอแต้ม both failed at this — root cause was conflating the three numbers below.

## The big picture — CARGO *is* Freight-LCL with a consolidated ใบขน

A CARGO import (ฝากสั่งซื้อ / ฝากนำเข้า) is a **Freight LCL job where Pacred issues ONE consolidated customs declaration (ใบขนรวม) under the shipping company's own name** (AXELRA / NNB). The customer therefore **never sees the ใบขน — they only get a ใบกำกับภาษี (tax invoice).** The doc-mode at order entry is the switch:
- **เอาเอกสาร** → customer pays **+VAT 7%** → gets the tax invoice (this form's case).
- **ไม่เอาเอกสาร** (NNB / เหมาภาษี) → **no VAT, no documents**, goods only; duty is a negotiated flat figure.
- **อยากได้ใบขนในชื่อตัวเอง** → it stops being CARGO and becomes a **FREIGHT LCL** job (full INV/PL/CI/Form-E set in the customer's name).

## ⭐ The 3-number model (the load-bearing insight — do NOT conflate)

The recurring failure (PCS, ไอแต้ม, and the original template) was using ONE price for everything. There are **three distinct numbers**, owned by three different roles:

| # | Number | Owner | Drives | Default / source |
|---|---|---|---|---|
| 1 | **ราคาขาย (SELLING)** | CS | the **tax invoice** + **VAT 7%** base | CS enters RMB/PCS × เรทหยวน(ขาย) |
| 2 | **ราคาต้นทุน (COST)** | Pricing | **PEAK stock-in** + **gross profit** | Pricing enters RMB/PCS × เรทหยวน(ต้นทุน, จ่ายจีนจริง) |
| 3 | **มูลค่าสำแดง (DECLARED)** | Docs | the **ใบขน** value (duty + import-VAT base) | defaults to COST, but Docs **edits it down** per the สำแดง/value-engineering plan |

The original template's bug: its ใบขน section pulled the **ex-duty SELLING price** (`ราคา-อากร` = selling ÷ (1+duty)) as the declared value — i.e. it declared the customer's selling price to customs because there was **no cost field**. The fix is the Pricing role: capture the real China cost, feed it to PEAK + to the ใบขน base, and keep DECLARED as a separately-editable Docs field.

## The 4-role workflow (each role = one section of the form)

1. **CS** — copy the form → fill customer + product rows (รูป/HS/ชื่อ/จำนวน) + **RMB/PCS ขาย** (THB/PCS, ยอดสุทธิ, VAT 7% auto) → confirm with customer → attach the **Thai slip** (income, incl VAT).
2. **PRICING** (the role that was MISSING) — fill **RMB/PCS ต้นทุน** + เรทหยวนต้นทุน → cost-THB / total-cost / **profit / %margin auto** → attach the **China slip** (expense). Cost flows to Docs (สำแดง base) + Account (PEAK stock).
3. **DOCS** — set **USD RATE** (customs monthly rate, customs.go.th ≈ 31.5) + **Form E / RCEP** (→ ACFTA duty 0%) + ใบอนุญาติ → review/adjust **มูลค่าสำแดง** → build Invoice + Packing List + request Form E → key the **ใบขน in NETBAY** → "ยิงใบขน" → set up the duty/VAT billing with Account.
4. **ACCOUNT** — take the closed ใบขน → record line items at **COST into PEAK stock** → issue the **ใบกำกับภาษี at SELLING + VAT 7% in PEAK** → send to customer → close the job set.

## Domain constants (grounded from the chats / sale sheets — examples, verify current)

- **FX:** เรทหยวน (THB/¥) — selling vs cost can differ (cost = the actual China-pay rate). Customs duty uses the **monthly customs USD rate** (customs.go.th), separate from both.
- **Markup tiers:** เฟรท + ขนส่ง **30 / 25 / 20 / 15 / 10 %** by customer size (big customer → lower tier). PROFIT = SELL − COST per line; pass-throughs (VAT/duty/RENT/overtime) carry **no margin** (`วางบิลตามใบเสร็จ`).
- **Volumetric:** 1 CBM = 300 KG (cargo) / 167 (air). **Form E / RCEP** under ACFTA zero-rates MFN duty.
- **Shipment codes:** `GZE######-#` (Guangzhou-truck/EK), `GZS######-#` (Guangzhou-sea). One container holds many invoices; `ตั๋วหลัก / ตั๋วพ่วง` for truck consolidations.
- **Service cost floors:** individual-name job ฿800, company-name ฿1500, ใบขน-check ฿650.
- **Gaps that need a human (not in any source):** PEAK account/chart-of-accounts codes → fill from accounting (NAT); NETBAY field list → from Docs (Win/Gring). Do NOT fabricate these.

## Build notes (for when this becomes a platform feature OR the next Excel rev)

- Built with the `xlsx` skill + openpyxl. No LibreOffice on this Mac → verified formulas with **`pip install --user formulas`** then `formulas.ExcelModel().loads(f).finish().calculate()` + scan for `#REF/#DIV0/#VALUE/#NAME` (1107 formula cells, **0 errors**). Functional-tested the tea-equipment example end-to-end: selling 95.55 (=19.5×4.9, matches the real sheet), cost 73.5, margin 28.2%, สำแดง defaults to cost, invoice=selling+VAT.
- Faithful styling: font **Bai Jamjuree**; header `E06666` red, `073763` blue section bars, `274E13` green for accounting, cyan FX cells, `990000` maroon for the new Pricing section, yellow inputs for COST + DECLARED.
- When porting to the platform: model it as one job with `selling_price` / `cost_price` / `declared_value` per line + a `doc_mode` (cargo-shipping-name / freight-customer-name / no-docs) + the role-gated sections. The tax invoice already has infra (ADR-0027 `tb_forwarder_tax_invoice`); the NEW piece is the **cost (pricing) capture** + the **declared-value field** distinct from both selling and cost.
