# 🏛 Pacred — Global Trade Group: org + business/accounting model + launch plan (2026-06-04)

Captured from the CEO brief + owner directive (2026-06-04). Extends — does not replace — [`ceo-directives-2026-06-01.md`](ceo-directives-2026-06-01.md) + the freight master plan. This is the canonical **business-model** reference (the code must serve this).

---

## 1. Holding structure — Global Trade Group

```
Pacred Holding
├─ Pacred Service          — freight + customs + tax-refund + pay-facilitation + labour
├─ Pacred Logistics        — domestic transport (cargo + in-country) · WHT 1%
├─ Pacgold Trading         — buy-from-us / VAT-7% invoice + domestic transport (WHT 1%)
├─ PacBrand Thailand       — build brands, sell on the Pacred platform
├─ Pacred Marketplace      — consignment + service (domestic/export), retail/wholesale, B2B-first, SEO-driven
└─ Pacgreen Manufacturing  — OEM / ODM manufacturing
```

Legal note (from earlier audits): the operating entity today = **`0105564077716` (AXELRA = Pacred)**, one tax entity, two product lines historically (CARGO = ported PCS · FREIGHT = AXELRA/Sheets, un-built). The 6-entity holding above is the **target operating model** — accounting + invoicing must be attributable per entity.

## 2. Service catalogue + accounting treatment (per entity)

### Pacred Service (freight / customs / facilitation)
- **Freight นำเข้า** — DDP / EXW / FOB · FCL-LCL · Sea/Truck/Air · booking service
- **Freight ส่งออก** — DDP door-to-door · CIF · FCL-LCL · Sea/Truck/Air
- **พิธีการกรมศุล ขาเข้า** — clear CIF · Sea/Truck/Air · เปิดใบขนพ่วงทางรถ (counted as พิธีการ/customs)
- **พิธีการกรมศุล ขาออก** — clear FOB · Sea/Truck/Air · specify country
- **ขอคืน/ชดเชยภาษีอากร** — tax refund (China side 13%) + Thai + other countries
- **อำนวยความสะดวกโอนชำระค่าสินค้า** — 1688 / Taobao / Alipay (NON-VAT) = **ฝากสั่ง + ฝากโอน** all counted here
- **แรงงาน ขึ้น/ลง สินค้า** — loading/unloading labour

### Pacgold Trading
- **สั่งซื้อสินค้ากับเรา / เปิดใบกำกับ VAT 7%**
- **ขนส่งภายในประเทศ** (cargo + in-country) · **WHT 1%**

### Pacred Logistics
- **ขนส่งภายในประเทศ** (cargo + in-country) · **WHT 1%**

### PacBrand Thailand — brand-building + selling on the Pacred platform
### Pacgreen Manufacturing — OEM / ODM
### Pacred Marketplace — consignment + service · domestic/export · retail/wholesale · sales team · SEO (Google) · "made in Thailand" emphasis · **B2B-first** (e.g. aluminium install)

## 3. The 3 tax-document modes (accounting) — THE billing logic

Per order, the customer picks one of 3 document modes:

| Mode | Applies to | Treatment |
|---|---|---|
| **ใบกำกับ (tax invoice)** | ฝากสั่ง · ฝากโอน+ฝากนำเข้า | "สั่งซื้อสินค้ากับเรา" — **VAT 7% on goods value**; goods imported under OUR name (we pay import tax + stock-in) → issue tax invoice. ⚠️ To open ใบกำกับ on ฝากโอน, the customer MUST ฝากโอน with us only (treated as buying the goods from us in Thailand). |
| **ใบขน (customs declaration)** | ฝากสั่ง · ฝากโอน+ฝากนำเข้า | **service** = customs brokerage (พิธีการ ขาเข้า); collect **VAT 7% on the service fee**. |
| **ไม่รับเอกสาร (no document)** | ฝากสั่ง · ฝากโอน+ฝากนำเข้า | **service** = payment-facilitation; take the margin as taxable profit (no doc to customer). |

(Aligns with the earlier "3 tax-doc modes" — ใบกำกับ / ใบขน / ไม่รับเอกสาร — in the master plan; this is the authoritative definition.)

## 4. Launch stage order (functions, in sequence)

1. **ฝากสั่ง · ฝากโอน · ฝากนำเข้า** (cargo core — mostly built)
2. **ออกใบขนสินค้า · ออกใบกำกับภาษี** (the tax-doc engine for the above)
3. **Freight นำเข้า — FCL/LCL all terms · เคลียร์สินค้าติดด่าน** — fold **cargo + LCL together** (cargo IS a kind of LCL). 
4. Every department gets its **own workspace**.

## 5. Pricing / shipping settings system (build target)

- **ค่าเทียบ (chargeable basis):** compute by **CBM (คิว) OR kg** — whichever.
- **ตั้งราคา:** price by **CBM or kg**.
- **Sales min-sell guardrail:** define the lowest a sales rep may quote — e.g. **2,900 / 4,900** (กว่างโจว / อี้อู) **+ เรือ 300**.
- **Profit cap (CEO):** ≤ **15,000 ฿/ตู้** (container). 
- **Sales quote-comparison tool:** compare รถ/เรือ/แอร์ + add-on services for the rep to present.

## 6. Customer acquisition (start now)

- **Phase 1:** call ALL old **AXELRA** customers + the **big PCS** accounts (PCS won't issue ใบกำกับ/ใบขน → pull those customers).
- **Phase 2:** ads (page/LINE) + web signups + **TTP** ใบกำกับ/ใบขน (after the system is complete).
- Rule: from the first day a customer drops a phone number, **call to close** (again).

## 7. The 3 scale-gaps (CEO — to scale in 3-4 months)

1. **CRM** — whole-workflow CRM.
2. **Marketing** — SEO / ads / content clips + keyword images.
3. **Training** — onboard + set sales & teams to follow the standard workflow.

> North star: **"ทำธุรกิจโดยไม่มีพี่ลงไปทำ"** — a self-running business.

## 8. Org chart + per-service workflow chains

CEO → Commercial&Growth (Sales·Marketing·CS) · Commercial Ops (Pricing·China Trade) · Customs&Compliance (Customs Specialist·Shipping Doc·Customs Clearance) · Freight Ops (Freight Doc·Freight Coordination) · Transportation (Fleet·Logistics Eng) · Warehouse · Technology · Finance&Admin · Future Business (Sourcing·Export Dev).

Per-service workflow chains (who touches what):
- เฟรท: `sale → cs → doc → acc` (FCL sea/air/truck · takes time)
- คาร์โก้: `sale → cs → acc → โกดัง/ขนส่ง` (clear method + price)
- เคลียร์: `sale → doc` (must be fast — quick price, close fast)
- ฝากสั่ง: `sale → สั่งซื้อ → acc` (price + spec match)
- ฝากโอน: `cs → acc` (price / fast)
- ใบขนพ่วง (รถ): `sale → cs → doc → acc`
- ใบกำกับ: `sale → cs → ฝากสั่ง/doc → acc`
- **Commission:** whoever owns the service gets its commission · stay in your lane.

**Sales↔CS handoff rules (CEO brief 2026-06-10 — additions over the chains above):**
- **Quote-link signup funnel:** เซลทำให้ลูกค้าสมัคร — ส่งลิงก์ให้ลูกค้าโดยแจ้งว่าคือ "ใบเสนอราคา" (เนียนๆ หลอกสมัครเข้าระบบ) → ปิดการขายแล้ว CS เห็นงาน + ทำงานต่อ. ข้อยกเว้น: งานเคลียร์/แอร์ ทะลุข้าม CS ได้เลย (ตรงกับ bypass checkbox ที่ ship แล้ว `c6ce6e73`).
- **CS ไม่คุยกับสายเรือ** — เอาสถานะจาก Doc; แต่ถ้าได้เบอร์คนรถแล้ว CS ตามสถานะ/โทรต่อเองได้เลย. (เซลขาย → CS ส่งวิธีการ.)
- **Tag self-serve:** เซล + CS เลือก tag ลูกค้าเองได้ (ระบบ tag = mig 0154).
- **Flexible ownership:** ลูกค้ามีทั้ง sale และ cs · CS ปิดงานเต็มคนเดียวได้ (ไม่มี CS แยกก็ได้) และ sales ก็แย่งทำหน้าที่ CS ได้เหมือนกัน — กติกา commission "ใครเซอร์วิสคนนั้นได้ค่าคอม" ยังคุมอยู่.
- **Customer-chase order (ละเอียดกว่า §6):** 1) AXELRA ลูกค้าเก่าทั้งหมด → 2) PCS เจ้าใหญ่ + ใบกำกับ/ใบขน ดึงมาให้หมด (ฝั่งนั้นไม่เปิดแน่นอน) → 3) Pacred ad leads (ยิงแอด/ทิ้งเบอร์ → เซลไล่โทร/แอดไลน์/สมัครเข้าระบบ) → 4) TTP ใบกำกับ/ใบขน (รอระบบสมบูรณ์). ไล่ตามตั้งแต่วันแรกที่ลูกค้าส่งเบอร์มา — โทรปิดการขายซ้ำ.

## 9. 🔴 Branding cleanup mandate (owner — high priority)

- **Pacred stamp/logo** must replace the old (PCS) one on EVERY document: ใบเสร็จ (receipt), ใบกำกับภาษี (tax invoice), ใบเสนอราคา (quotation), ใบตามหนี้/วางบิล (invoice/billing), ใบส่งสินค้า, etc. ⚠️ stamp image needed as a FILE to wire in.
- **"PCS" text leaks** to customers + staff in many flow surfaces → find + replace with Pacred.
- **Self-pickup address** still shows PCS / the old **"77"** location in places → Pacred address (สมุทรสาคร warehouse) everywhere.
- SOT for company constants: `components/seo/site.ts` (never hardcode).

---
Cross-refs: [`ceo-directives-2026-06-01.md`](ceo-directives-2026-06-01.md) · [`freight-knowledge-2026-06-01/_MASTER-FREIGHT-PLAN.md`](freight-knowledge-2026-06-01/_MASTER-FREIGHT-PLAN.md) · [`big-audit-2026-06-01/_MASTER-PLAN.md`](big-audit-2026-06-01/_MASTER-PLAN.md) · ADR-0015/0016 (WHT + freight value).
