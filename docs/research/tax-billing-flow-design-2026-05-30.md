# 🧾 Tax-document + billing flow — design (research → Pacred-adapted)

**Date:** 2026-05-30 · **By:** เดฟ · **Owner directive:** live path must issue ใบกำกับภาษี (with VAT) + track WHT certs · customer picks VAT / tax-invoice **or** ใบขนสินค้า at cart/booking **and** at payment · WHT has **both 1% and 3%** · cargo first (cover ALL legacy) then freight · "research the international/standard logic flow, then adapt to our ecosystem".
**Companion audit:** [`docs/audit/juristic-billing-tax-flow-2026-05-30.md`](../audit/juristic-billing-tax-flow-2026-05-30.md) (the 2-disconnected-worlds finding this design fixes).

---

## 1. The standard Thai tax rules (researched + cited — ground truth)

### WHT (ภาษีหัก ณ ที่จ่าย) — rate depends on the CHARGE TYPE, not the customer
| Charge type | WHT rate | Note |
|---|---|---|
| **ค่าขนส่ง / ค่าระวาง** (pure transport/freight) | **1%** | juristic carrier |
| **ค่าบริการ / ค่าจ้างทำของ / ค่าดำเนินการ** (service: customs clearance, ฝากนำเข้า fee, packing, ฝากสั่ง/ฝากโอน fee) | **3%** | (temporarily 1% via e-Withholding Tax 2566–2568; assume 3% now, make CONFIGURABLE) |
| **ค่าขนส่งพ่วงบริการ** (transport bundled with service in one line) | **3%** | the whole bundled line is treated as service |
- **WHT base = the charge amount EXCLUSIVE of VAT** (both PwC + Sherrings + RD confirm). Never compute WHT on a VAT-inclusive figure.
- WHT applies when the **payer is a juristic person** (นิติบุคคล) — i.e., our juristic customers withhold from us. (legacy gated juristic AND ≥฿1,000 — keep the ≥1,000 threshold per legacy `grenrateReceiptF`.)
- → **This is the owner's "1% และ 3%": classify each bill line as transport (1%) or service (3%).** The current live path's flat-1%-on-total is WRONG by Thai rules.

### VAT (ภาษีมูลค่าเพิ่ม) 7%
- 7% (reduced rate, currently to 30 Sep 2026). International transport sub-contracted = **0%**; domestic sub-contract reimbursement = VAT-exempt **only if billed separately** (freight-forwarder rule). Make VAT rate + per-line VAT-applicability CONFIGURABLE.
- **Tax point (จุดความรับผิด) for services = when payment is received** (or when a tax invoice is issued / service is used — whichever is FIRST). For Pacred (ฝากนำเข้า = service) the tax point = **on payment** → **issue the ใบกำกับภาษี at payment-land** (exactly where our auto-receipt already fires).

### ใบกำกับภาษี (tax invoice, RD Code 86)
Must be issued at the tax point with: seller name/address/**13-digit tax id**, buyer name/address/tax-id, running number, date, line description + amount, **VAT amount shown separately**. (Pacred's World-A `tax_invoices` system already does all this — it just isn't wired to the live path.)

### ใบขนสินค้า (customs import/export declaration)
A customs document (พิธีการศุลกากร), separate from VAT. Needed by importers for their records / duty. Pacred's `customs_declarations` exists (freight). The owner wants it for cargo too.

**Sources:** [accprotax — ค่าขนส่ง vs ค่าบริการ](https://accprotax.com/logistic-service-taxdiff/) · [dst — ค่าบริการขนส่ง หัก 1 หรือ 3](https://magazine.dst.co.th/column/CPD-transportation-charges) · [PwC Thailand other taxes](https://taxsummaries.pwc.com/thailand/corporate/other-taxes) · [Sherrings — freight forwarder VAT](https://sherrings.com/freight-forwarders-vat-thailand.html) · [PEAK — tax point](https://www.peakaccount.com/blog/tax/gen-tax/tax-taxpoint) · [getInvoice — tax point](https://www.getinvoice.net/tax-point/) · [RD — Value Added Tax](https://www.rd.go.th/english/6043.html)

---

## 2. The universal billing logic flow (what good systems do)

```
BOOKING/ORDER  →  customer declares tax-doc preference up front
   "ต้องการเอกสารภาษีแบบไหน?"  ┌ ใบกำกับภาษี (VAT) → needs tax-id + address
                               ├ ใบขนสินค้า (customs)  → needs importer details
                               └ ใบเสร็จธรรมดา (none)
        │  (pre-fill from juristic profile · editable)
        ▼
BILLING (วางบิล)  →  charges split into LINES, each tagged transport|service
        │  per-line: amount → (+VAT 7% if doc=tax-invoice & line is VATable)
        │            → WHT computed on the pre-VAT amount at the line's rate (1%|3%)
        ▼
PAYMENT (tax point)  →  customer reconfirms/changes the doc choice, pays net-of-WHT
        │  net = Σ(line + VAT) − Σ(WHT per line)
        ▼
ISSUE DOCUMENT (at tax point)
   ├ tax-invoice chosen → mint ใบกำกับภาษี (RD running no.) + record WHT entries (chase 50-ทวิ cert)
   ├ customs chosen     → mint ใบขนสินค้า
   └ none               → ใบเสร็จรับเงิน "(ไม่ใช่ใบกำกับภาษี)" (today's default)
```
Key universal principles Pacred currently violates: (1) tax-doc choice belongs at ORDER time, not after; (2) WHT rate is per-line-type; (3) WHT base excludes VAT; (4) tax invoice issues at the tax point (payment).

---

## 3. Pacred-adapted flow ("กินเรียบ ecosystem")

**Single source of truth = the live `tb_*` lane.** Bridge the existing World-A tax machinery to it (don't run two worlds).

### 3a. Choose at cart/booking (NEW — `/cart`, service-order, service-import booking)
Add a **"เอกสารภาษี / Tax document"** selector on the order/cart + the service-import booking:
- `tax_doc_pref` ∈ { `tax_invoice` (เอา VAT + ใบกำกับภาษี) · `customs` (ใบขนสินค้า) · `receipt` (ใบเสร็จธรรมดา) }
- Default from the customer: juristic → `tax_invoice`; personal → `receipt`. Editable.
- If `tax_invoice`/`customs` → capture/confirm tax-id + billing address (pre-fill juristic `corporate`).
- Store on the order (`tb_header_order` / `tb_forwarder` — add a column or a side table `order_tax_pref`).

### 3b. Bill lines carry a charge type (NEW classification)
Each charge component maps to a WHT class:
| Pacred charge | class | WHT |
|---|---|---|
| `fTransportPrice`, `fTransportPriceCHNTHB`, ค่าระวาง | **transport** | 1% |
| `fShippingService`, `priceCrate`, ฝากนำเข้า/ฝากสั่ง/ฝากโอน fee, customs service | **service** | 3% |
| `fTotalPrice` (สินค้า cost pass-through) | (pass-through / per accountant) | classify w/ owner |
- Compute: `vat = vatable ? line×0.07 : 0` (only if doc=tax_invoice) · `wht = round(line × rate, 2)` (rate by class, on pre-VAT) · `net = Σ(line+vat) − Σwht`.

### 3c. Issue at payment (bridge to World A)
At payment-land (`autoIssueReceiptOnPaymentLand`), branch on `tax_doc_pref`:
- `tax_invoice` → call the existing `issueTaxInvoice` (made to accept a `tb_forwarder`/`tb_receipt` source) + create `withholding_tax_entries` (per line, 1%/3%) → chase 50-ทวิ cert.
- `customs` → mint ใบขนสินค้า (port the legacy/`customs_declarations` for cargo).
- `receipt` → today's `tb_receipt`.
Customer can still change the choice at payment (re-confirm step).

### 3d. Unify juristic detection (fix the audit's secondary bug)
One helper `getCustomerTaxIdentity(memberCode)` returning {isJuristic, taxId, name, address} from a single precedence (corporate → tb_corporate → tb_users.userCompany). All WHT/VAT/tax-invoice code uses it.

---

## 4. Data model changes (sketch)
- `tb_forwarder` / `tb_header_order`: + `tax_doc_pref` (enum) + `tax_billing_taxid` + `tax_billing_address` snapshot (or a `order_tax_pref` side table keyed by order id).
- `tax_invoices` + `withholding_tax_entries`: relax the source FK to also accept the live legacy ids (a `source_kind` + `source_ref` text pair, instead of FK to `forwarders.f_no` only).
- `business_config`: WHT rates (transport_pct=1, service_pct=3) + VAT pct=7 — CONFIGURABLE (rates change by law).
- WHT entry per LINE (not per bill) so 1% transport + 3% service co-exist on one bill.

---

## 5. Phase plan (cargo FIRST — cover everything legacy had + the new tax layer)

> Legacy cargo had ONLY: 1% WHT (flat) + ใบเสร็จ + ใบส่งสินค้า. Owner wants cargo to also do: per-line 1%/3% WHT, VAT, ใบกำกับภาษี, ใบขนสินค้า — all NEW. "ต้องทำได้หมดทุกอย่างที่เขามี" = keep the legacy receipt/WHT/delivery-note intact AND add the tax layer.

- **P0 — foundation (cargo):** unify juristic-identity helper · WHT 1%/3% per-line engine (config-driven, pre-VAT base) · `business_config` rates. *(no UI change yet; fixes correctness of the current flat-1%.)*
- **P1 — cart/booking choice (cargo):** `tax_doc_pref` selector on `/cart` + service-import booking + store on order.
- **P2 — bridge tax invoice to live (cargo):** make `issueTaxInvoice`+`createWhtEntry` accept `tb_*` source · trigger from payment-land when pref=tax_invoice · VAT 7% · 50-ทวิ cert chase on the live path.
- **P3 — ใบขนสินค้า for cargo:** port a cargo customs-declaration doc (or extend `customs_declarations` to cargo) · trigger when pref=customs.
- **P4 — freight parity:** wire the same flow into the freight (FCL/LCL) lane (freight already has `customs_declarations` + `freight_invoices`).

Each phase: `pnpm verify` + browser click-through + owner sign-off.

---

## 6. Owner answers (2026-05-30) — ANSWERED ✅ (baked into the engine)

| # | คำถาม | คำตอบ owner | ผลต่อระบบ |
|---|---|---|---|
| 1 | สินค้า (goods) VAT/WHT? | **VAT: ใช่ (อยู่ในฐาน) · WHT: ไม่หัก** (Q2 "บริการที่ไม่ใช่สินค้า หัก 3" → สินค้าไม่ใช่บริการ) | engine: goods อยู่ในฐาน VAT 7% · `goodsPct=0` (migration 0128 แก้ 3→0) |
| 2 | WHT rate ต่อประเภท | **ขนส่ง 1% · บริการ(ที่ไม่ใช่สินค้า)ทั้งหมด 3% · ค่าเช่า 5%** | engine: transport 1 · service 3 · **rental 5 (bucket ใหม่)** · goods 0 |
| 3 | ขนส่งระหว่างประเทศ VAT 0%? | **ใช่** (zero-rated ม.80/1) | engine: ตัด `ftransportpricechnthb` (CN→TH leg) ออกจากฐาน VAT · ยังหัก WHT 1% |
| 4 | ใบกำกับ + ใบขน ใช้ทั้ง 2 ใบในออเดอร์เดียว? | **ใช้** (ต้องได้ทั้งคู่) | ❗ แก้ design: ใบขน ≠ either/or กับ ใบเสร็จ/ใบกำกับ — เป็นคนละแกน. cart selector (P1) ต้องเพิ่มแกน "ต้องใบขนด้วย" ใน import flow (P3) |
| 5 | e-WHT ใช้รึยัง (service ลด 1%)? | **ใช่ ใช้** | service nominal = 3% · e-WHT reduction = จัดการตอน **remit** (P2 · ไม่ฝังใน nominal rate) |

**tax point (Q ที่ owner งง — อธิบาย):** จุดที่ Pacred **ต้องออกใบกำกับภาษี + รับรู้ VAT ขาย** = **ตอนรับชำระเงิน** (บริการ · ม.78/1 ประมวลรัษฎากร — "ความรับผิด VAT ของบริการเกิดเมื่อได้รับชำระราคา"). ไม่ใช่ตอนสร้างออเดอร์/ตอนทำงานเสร็จ. ในระบบเรา = **payment-land** (ลูกค้าจ่าย/หัก wallet สำเร็จ) → trigger ออกใบกำกับ + บันทึก VAT. WHT ก็หักจุดเดียวกัน (ลูกค้านิติหัก ณ จุดจ่าย → ออก 50-ทวิ ให้ Pacred). → ยืนยัน design P2: ออกใบกำกับ/บันทึก VAT/WHT ที่ payment ไม่ใช่ booking.

### Engine state (lib/tax/wht.ts · P0 refined 2026-05-30)
`transport 1% · service 3% · rental 5% · goods 0% (in VAT base) · VAT 7% (intl leg 0%)`. 45 unit tests pass. business_config (prod) = migration 0126 + **0128**. ยังเป็น pure lib **ไม่ wire เข้า live billing** — รอ P2 (ต้อง sign-off · กระทบราคา live + printed receipt).

### ค้างคำถามเดียว (ไม่ block · ยืนยันตอน P2)
- **50-ทวิ direction:** Pacred **รับ** จากลูกค้านิติ (chase/track) — owner ยังไม่ระบุชัดว่าออกเองด้วยไหม. P2: track การรับ cert เป็นหลัก (legacy หักเฉยๆ ไม่ออกอะไร).
