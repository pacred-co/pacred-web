# 🚚 Pacred — Complete End-to-End Operational Flow (the REAL flow, from staff LINE chats)

> **Source:** 6 real LINE chat exports (24/4–29/6/2026) that the owner dropped 2026-06-29
> as *"data ทรงคุณค่าทั้งหมด … เป็น flow งานทั้งหมดอย่างละเอียด"* — plus a WeChat
> backup (China-warehouse side · **encrypted RMFH container, content not recoverable**).
> **Purpose:** the canonical, source-grounded reference for HOW Pacred actually
> operates day-to-day — every role, every document, every status, every China-partner
> interaction, the daily-rate matrix — then a **concrete system-gap map** against the
> current Pacred build (`actions/admin`, `lib/forwarder`, `lib/admin`, the
> forwarder/shop/payment/cnt/billing/HS-library surfaces).
>
> **This is descriptive (what staff do in chat), not prescriptive.** Most of this
> coordination happens in LINE/WeChat TODAY — the gap section is about pulling that
> coordination INTO the software so it stops living in chat threads.

**Chat sources (all on the owner's Desktop):**
1. `HS.CODE - VAT - PCS - PACRED` — the HS/พิกัด/VAT consult thread (Sale/CS ↔ Doc)
2. `ถามพิกัด Pacred` — a second HS-consult thread (same pattern)
3. `Chek เรท ฝากโอน Pacred` (1282 lines) — the daily yuan-rate + ฝากโอน/กดจ่าย slip loop
4. `Momo+Pacred เช็คสถานะ` — the GZS container status loop with the China partner (MOMO benz/Bonus/Aong + โกดังจีน 林云云)
5. `อภิรัตน์ อินดัสตรีส์ จำกัด & PACRED` — a juristic (นิติบุคคล) freight customer (FCL · ใบหัก · วางบิล · ตู้ตรวจ อย.)
6. `PCS999 VVVIP` — the VVVIP daily per-tracking bill flow
7. `All wechat.zip` — China-warehouse/supplier WeChat backup (encrypted, unreadable)

---

## 0. The cast — every ROLE seen in the chats

| Role (chat handle) | What they do in the real flow |
|---|---|
| **Sale** (`Pacred Sale-May`, `Sale Ploy-PCS`, `Pacred Sale - Pee`, `Sale-Camin`, `Sale-Giff`, `Sale_PcsFreight`, `Pacred sale - Toey`, `Pacred Sale-Pupu`) | Front the customer. Collect product photos/specs, **ask Doc for พิกัด/อากร/ภาษี**, quote (cargo/freight/ฝากสั่ง/ฝากโอน), ask Pricing for the daily yuan rate, post the THB amount + company bank acct, collect the customer slip. A Sale and a CS are interchangeable on most of these tasks. |
| **CS** (`Pacred CS Ploy`, `Pacred CS Mild`, `CS IMPORT`, `CS EXPORT`) | Same toolkit as Sale (ask พิกัด, ask rate, post bill, collect slip) **plus** runs the MOMO container-status loop, chases the China warehouse for missing/มาผิด parcels, coordinates ตรวจปล่อย / pickup with the customer, requests แมส (messenger) to fetch documents. CS IMPORT/EXPORT specialize in ใบขน workflow. |
| **Doc / พิกัด team** (`Pacred Doc`, `เวฟ.` / `Pacred Doc(EK) Wave`, `Pacred Doc Gring`/`gring`) | **THE HS-code authority.** Given a photo + Thai name, replies with: พิกัด (HS, often 8–10 digit), อากร% (duty), Form-E/ฟรอมอี%, รหัสสถิติ (stat 000/090/etc.), Thai+English product name, and **"ออกใบกำกับได้/ไม่ได้"**. Crucially does **license-avoidance / "เลี่ยงพิกัด"** — reclassifying to dodge มอก / อย / ใบอนุญาต / ทุ่มตลาด (anti-dumping). Also drafts/edits the ใบขน. |
| **AUDIT DOC** (`AUDIT DOC ~Win`) | Senior Doc — sets policy ("บริษัทไม่ขายใบกำกับ", "ไม่รับบุคตู้สินค้าเสี่ยงลุกไหม้", "ติดทุ่ม เคลียเจ้าหน้าที่ไป"), teaches the juniors, handles the hard/risky พิกัด. |
| **AUDIT PCS - MEW** | Audit / confirm role on the freight side; relays line counts + asks for พิกัด. |
| **Pricing** (`Pacred Pricing Web`, `Pacred Pricing Manow`, `NAT💙`) | Publishes the **daily yuan-rate matrix** (4 lines, see §4). Runs the **กดจ่าย 1688/Taobao** path (posts order id + 店铺 account + ¥ amount). Computes per-order ฝากสั่ง totals (¥ × rate × qty, +7% VAT). |
| **ACC-AR** (`PACRED ACC-AR Aom`, `Aom`, `AUDIT ACC-PCS Koy`) | Accounts **Receivable.** Posts the customer's THB bill + company bank acct, sends ใบหัก-address + tax id, handles วางบิล (billing visit) for juristic, logs every transfer into the sheet ("ต้องบันทึกยอดในชีท"). |
| **ACC-AP** (`Pacred ACC-AP-Jane`, `Jane💕🐳`) | Accounts **Payable** = the one who actually **transfers CNY to the Chinese factory/shop** (Alipay / China bank acct / QR), returns the China-side slip ("สลิปค่ะ"). Handles refunds when a transfer fails ("เลขบัญชีโอนไม่ได้" → โอนคืน). |
| **Warehouse (TH)** (`Warehouse - Keetar`/`KeeTaR`, `จ๊าบหลาย`) | Drives to the MOMO/นครปฐม warehouse, picks up the parcels after "กดจ่ายในระบบ", confirms PR ownership of boxes. |
| **Owner** (`Pop_visit` = พี่ป๊อป Visit) | Escalation + China-partner relationship. Pings benz for stuck containers, approves "เลี่ยงพิกัด"/risk calls, delegates ("ดูงานให้พี่เขาหน่อย"). |
| **China partner — MOMO** (`benz`, `Bonus`, `Aong.`, `B o o M`) | The forwarding partner. **benz/Bonus** = sea-leg + container status (give the real container number per GZS code, ETD/ETA, แหลมฉบัง ตรวจปล่อย status, "เคลียร์ปล่อยตู้"). **Aong** = the **Thai (นครปฐม) warehouse** side — unloads the container, นำเข้าระบบ (enters parcels into the system), then says **"กดจ่ายในระบบให้หน่อยครับ รถมาถึงแล้ว"**. |
| **China warehouse** (`☁️林云云☁️` Lin Yunyun) | The Chinese consolidation warehouse. Maps a tracking → which GZS container it shipped out in, flags ตู้ที่ด่านจีนตีกลับ (returned by China customs), asks Pacred for its own Chinese phone number to tag PR parcels (can't reuse PCS's). |
| **Juristic customer contacts** (`คุณพัด/คุณชัย อภิรัตน์`, `tik`, `🍒 PAE🍒` = PR999) | The customer end of the loop. |

**Key org fact (matches the codebase's flexible model):** Sale ⇄ CS is fluid; a "เซล/CS" can do most front-office tasks. The DOC team is the bottleneck and the differentiator (พิกัด + เลี่ยง + ใบขน). Pricing owns rate + กดจ่าย. ACC splits AR (collect THB) vs AP (pay CNY). MOMO owns the physical China→TH leg.

---

## 1. The complete end-to-end flow (stages)

```
┌─ A. ENQUIRY ──────────────────────────────────────────────────────────────┐
│  Customer → Sale/CS with product photo + rough specs (qty/weight/CBM/value)│
│  Service is one of: ฝากสั่งซื้อ · ฝากโอน(ชำระ) · ฝากนำเข้า Cargo(LCL) ·       │
│  Freight FCL/LCL(ปิดตู้) · ส่งออก · เคลียร์ติดด่าน · ใบขน/ใบกำกับ-only        │
└────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ B. HS / พิกัด / VAT CONSULT (the daily heartbeat — chats 1 & 2) ───────────┐
│  Sale/CS posts photo → "เช็คพิกัด/ขอพิกัด/เปิดใบขน/เปิดใบกำกับ" → @Doc       │
│  Doc replies: HS code · อากร% · ฟรอมอี% · stat(000/090) · TH+EN name ·       │
│               "ออกใบกำกับได้/ไม่ได้"                                          │
│  If สินค้าติด (มอก/อย/ใบอนุญาต/ทุ่มตลาด/เกษตร/DG): Doc "เลี่ยงพิกัด" →        │
│      reclassify to a free/lower code (AUDIT DOC approves the risky ones)     │
│  → from this, Sale/CS computes ภาษี (duty+VAT) for the customer total-cost.  │
└────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ C. QUOTE + RATE ──────────────────────────────────────────────────────────┐
│  Freight FCL: Sale → @Pricing "ขอราคาปิดตู้" (20'/40'/45' · เหมาภาษี/ไม่เอกสาร│
│      · pickup จีน + delivery ไทย) → ราคาประมาณการรวมทุกอย่าง (e.g. 330,000)  │
│  ฝากสั่ง/ฝากโอน: Sale/CS → @Pricing "ขอเรทหยวนวันนี้" → 4-line matrix (§4)   │
│      → quote = ¥ × rate (+7% if VAT/ใบกำกับ)                                 │
└────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ D. PAYMENT (two halves) ──────────────────────────────────────────────────┐
│  D1 customer→Pacred (AR): Sale/ACC-AR posts THB total + kbank 225-2-91144-0 │
│      (บจก. แพคเรด ประเทศไทย) → customer transfers → sends slip               │
│  D2 Pacred→China (AP): ACC-AP transfers CNY (Alipay/China bank/QR) to the   │
│      shop/factory → returns the China slip. (กดจ่าย path: Pricing presses    │
│      pay on 1688/Taobao with order id + 店铺 account.)                       │
└────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ E. CHINA PURCHASE / WAREHOUSE / CONSOLIDATION (WeChat — encrypted) ────────┐
│  Goods bought/transferred → arrive 林云云 China warehouse → tagged to PR via │
│  the Pacred Chinese phone number (shipping-mark fallback) → consolidated     │
│  into a GZS container.                                                       │
└────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ F. CONTAINER → SEA/ROAD → แหลมฉบัง CUSTOMS (chat 4, the MOMO loop) ─────────┐
│  CS asks benz/Bonus: GZS<code> → real container no (e.g. GZS260519-1 →       │
│      IAAU1695308) · ชื่อเรือ/BL · ส่งออกวันไหน                               │
│  Sea: เรือถึงไทย → แหลมฉบัง → "ตรวจปล่อย" (5-7 days) → ปล่อยตู้               │
│  EDGE: ตู้ติด (กองปราบสแกน/ด่านจีนตีกลับ/customs hold) → owner escalates      │
└────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ G. THAI WAREHOUSE (นครปฐม · Aong) ────────────────────────────────────────┐
│  ตู้เข้าโกดังนครปฐม → Aong unloads + คัดแยก → "นำเข้าระบบ" (enters parcels)   │
│  → "กดจ่ายในระบบให้หน่อยครับ รถมาถึงแล้ว"                                    │
│  EDGE: ของหาย/ขาดกล่อง · ของมาผิด PR (สลับ) · แตก · ไม่ใช่ของลูกค้า          │
└────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ H. กดจ่ายในระบบ + PICKUP ─────────────────────────────────────────────────┐
│  ACC-AP/CS "กดจ่ายในระบบ" (the in-app pay-press that releases the parcel)    │
│  → Warehouse (Keetar) drives to MOMO/นครปฐม → picks up → confirms PR boxes   │
│  → delivers to customer (own driver / รับเอง / external carrier)             │
└────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─ I. DOCUMENTS + BILLING (juristic + freight) ──────────────────────────────┐
│  ใบขน (customs declaration) drafted by Doc → customer reviews/edits (ชื่อ    │
│      ผู้นำเข้า, บ้านเลขที่, จำนวน ct, พิกัด) → "ยิงใบขน" when ตู้ปกติ          │
│  ใบกำกับภาษี (tax invoice, +7% VAT) · ใบเสร็จ (receipt) · ใบหัก (50-ทวิ WHT  │
│      1% for juristic) · Form E · packing-list+invoice                        │
│  วางบิล (billing visit): juristic batches several ตู้ into one เช็ค          │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Every DOCUMENT seen + when it is issued

| Document | Who issues | When / why | Chat evidence |
|---|---|---|---|
| **ใบเสนอราคา (quote)** | Sale/Pricing | At enquiry. Freight = "ราคาปิดตู้รวมทุกอย่าง"; ฝากสั่ง = ¥×rate(+7%). | "ราคประมาณ 330,000 บาท" · "เสนอราคา 20260520-011" |
| **ใบขน (customs declaration)** | Doc drafts → customer confirms → "ยิงใบขน" | Per shipment, FCL/cargo with docs. Heavily revised (ชื่อนำเข้า, บ้านเลขที่, จำนวน ct, พิกัด, exchange rate). Issued only when "รถเข้าสู่ภาวะปกติ" + customer-confirmed. | "ดราฟใบขน REF:QEUT010001118 ได้คิวยิงวันไหน" · "ในใบขนลงพิกัด 9026.20.90 แต่เวฟแจ้ง 9026.10.50 recheck" |
| **ใบกำกับภาษี (tax invoice, VAT 7%)** | ACC/Doc | When customer wants VAT doc + นำเข้าในนามลูกค้า. **Only for domestic Thai sale**, NOT for ใบขน/ฝากโอน-only. "บริษัทไม่ขายใบกำกับ — ต้องสั่งซื้อกับเรา นำลงใบขนจริง". | "ออกใบกำกับได้ครับ" / "ไม่ออกใบกำกับ" repeated per ฝากโอน job |
| **ใบเสร็จ (receipt)** | ACC-AR | After payment lands. Customer chases it ("รบกวนขอใบเสร็จ"). | "ผมรบกวนขอใบเสร็จด้วย … บัญชีตามมา" |
| **ใบหัก ณ ที่จ่าย (50-ทวิ, WHT 1%)** | customer→Pacred (juristic) | Juristic deducts 1% WHT; needs Pacred's address + tax id. | "ขอที่อยู่เขียนในใบหัก กับเลขผู้เสียภาษี" · "ฝากใบหักไปด้วย" |
| **Form E (ACFTA C/O)** | Doc | 1,500/shipment. Preferential duty (ฟรอมอี%). | "FORM E: 1,500 บาท / shipment" |
| **Packing list + Invoice (PI-CL)** | customer / Doc | Needed to draft ใบขน + แลกดีโอ. | "packinglist + invoice" · "PI-CL ตัวจริง" |
| **BL (Bill of Lading) + D/O (ดีโอ)** | shipping line ↔ CS | CS collects BL (ตัวจริง) + แคชเชียร์เช็ค + ใบเซอร์ → แลกดีโอ at port. | "รับ BL พร้อมแลกดีโอ … 1.BL ตัวจริง 2.แคชเชียร์เช็ค 3.ใบเซอร์ 4.PI-CL 5.เงิน200" |
| **Certificate (ใบเซอร์ / health cert)** | customer / origin | อย. ท่าเรือ demands an ORIGINAL ปั๊มสด (notarized copy rejected). | "อย ขอดูลิ้งค์ตรวจสอบใบ Certificate … ประกาศกระทรวง ฉบับ 420" |
| **ใบลงทะเบียนกรมศุล** | Doc | First-time-only, 1,500. | "ลงทะเบียนกรมศุลกากร: 1,500 (ครั้งแรก ครั้งเดียว)" |
| **บิลค่านำเข้า / per-tracking daily bill** | Sale | Daily for VVVIP — list of trackings + "ยอดค่านำเข้า X บาท". | PR999: "ยอดค่านำเข้า 90,163.53 บาท" |
| **China-side slip (สลิปหยวน/โอนจีน)** | ACC-AP | Proof Pacred paid the Chinese shop. Returned per ฝากโอน job. | "สลิปหยวนค่ะ" everywhere in chat 3 |

**The ใบขน service price card (verbatim, chat 1 L345):**
- ลงทะเบียนกรมศุลกากร: 1,500 (ครั้งแรก ครั้งเดียว) · พิธีการศุลกากร (ใบขน): 1,500/shipment · FORM E: 1,500/shipment · ค่าส่งตั๋ว: 350/shipment · ค่าธรรมเนียมกรมศุล: 200/shipment · + ภาษี (variable).

---

## 3. The HS / พิกัด / VAT consult (chats 1 & 2) — the daily heartbeat

**Pattern (dozens of times/day):**
1. Sale/CS posts a product **photo** + Thai name → "รบกวนเช็คพิกัด / ขอพิกัด / เปิดใบขน / เปิดใบกำกับ" → `@Pacred Doc(EK) Wave` or `@Pacred Doc Gring`.
2. Doc replies with a structured block:
   ```
   <HS code, 8–10 digit>
   <product name TH>
   stat 000 (รหัสสถิติ)
   อากร <n>     (import duty %)
   ฟรอมอี <n>   (Form-E preferential duty %)
   [ออกใบกำกับได้/ไม่ได้]
   ```
   Example (L44): `เครื่องใช้บนโต๊ะอาหารทำด้วยเซรามิก / 7013.100000 / 000 / อากร20 / ฟรอมอี0 / ออกใบกำกับได้ครับ`.
3. Sale/CS then asks for the **English name** (needed for the ใบขน), often per line.
4. Sale/CS uses อากร + VAT to compute **total-cost** for the customer.

**license-avoidance (เลี่ยงพิกัด) — a core, deliberate competency:**
- ขาปลั๊ก ติดใบอนุญาต → "หาพิกัด เลี่ยงอากร" → `8538.90.19 ส่วนประกอบอุปกรณ์วงจรไฟฟ้า` (chat 2 L14).
- ยางรถเทรลเลอร์ ติด มอก → reclassified to `7607.190001` (aluminium packaging) อากร1 (chat 2 L243).
- พัดลมมีแบต ติด มอก → "เลี่ยงเป็น ส่วนประกอบพัดลม 841490 อากร0" (chat 2 L802).
- สเปรย์ ติด อย → "เลี่ยงพิกัดเป็น Surface Coating Spray 3405.90.90" (chat 2 L896).
- DIMMER ติด มอก → "เลี่ยงเป็น 85372019" · Plastic injection machine → "8485.20.00".
- ติดทุ่มตลาด (anti-dumping, e.g. ประตูอลูมิเนียม) → AUDIT DOC: "ติดทุ่มนะตัวนี้ เคลียเจ้าหน้าที่ไป" (chat 2 L404).
- **Policy line (AUDIT DOC, chat 2 L375):** "บอกลูกค้าว่าเราทำแค่ใบขนกับใบกำกับ. พิกัดติดเกษตรเราจะไม่มีบริการทำไฟโต. ไม่รับบุคตู้ สินค้าเสี่ยงลุกไหม้ (DG)."
- **Policy line (NAT, chat 3 L886):** "บริษัทเราไม่ได้ขายใบกำกับ … ขอเราสั่งซื้อกับเรา นำลงใบขนให้จริง" → ใบกำกับ requires a real domestic sale, not a paper-only sale.

**VAT rule emergent from the chats:** VAT 7% / ใบกำกับ applies to a **domestic Thai sale** (ฝากสั่งซื้อ where Pacred sells to the customer · "คิด +7%"). The **ใบขน** path carries duty + the customer's own import VAT (no Pacred ใบกำกับ line). ฝากโอน (pure CNY transfer) is mostly "ไม่เอาใบกำกับ".

---

## 4. The daily yuan-rate matrix + ฝากโอน/กดจ่าย loop (chat 3)

**Every morning Pricing publishes a 4-line rate card** (valid window 10:30–20:30), pasted into LINE:

| Line | Meaning | Example (varies daily 4.81–5.01) |
|---|---|---|
| **โอนอาลีเพย์ ไม่เกินหมื่น** | Alipay transfer, ≤ 10,000 ¥ | 4.92 |
| **โอนอาลีเพย์ เกินหมื่น** | Alipay transfer, > 10,000 ¥ (cheaper) | 4.89 |
| **ฝากจ่าย** | pay-on-behalf | 4.91 |
| **กดจ่าย 1688 & Taobao** | press-pay on 1688/Taobao (dearest) | 4.92 |

Rate is **published only after Pricing computes it** ("รอสักครู่ เรทยังไม่ออก"). Big amounts (แสน+) get a special negotiated rate ("เรทแสนขอต่อรองคนแลก").

**ฝากโอน job lifecycle (the CNY-transfer slip loop):**
1. Sale/CS: "เช็คเรท <ยอด> หยวน" → Pricing gives the rate for that band.
2. Sale/CS posts the job in a fixed pattern (Jane's required template, L529):
   ```
   PR### (รหัส/ชื่อลูกค้า)
   ฝากโอน / กดจ่าย 1688
   ออเดอร์ <order id>   (for กดจ่าย)
   ยอด <n> หยวน
   เรท ขาย <r>
   [ออกใบกำกับ ไหม]
   + รูปสลิป + รูป QR/เลขบัญชี
   ```
3. Customer transfers THB to kbank 225-2-91144-0 → posts slip.
4. **ACC-AP transfers CNY** to the Chinese shop (Alipay 13632035680 / China bank acct / QR) → returns "สลิปค่ะ".
5. **กดจ่าย path:** Pricing presses pay on 1688 with `order id` + `แอคเค้า tb4499018666` + `ยอดจ่ายร้านค้า X หยวน` (one block PER order id — a big PR043 order had ~15 order lines, each its own block, L1118-1243).
6. **Refund/fail edge:** China acct rejects → "เลขบัญชีโอนไม่ได้" → either retry another acct or "ทำเรื่องโอนคืนลูกค้า"; partial = "ฝากไว้". QR scan limits force splitting a 100k+ ¥ transfer into many sub-transfers.
7. ACC-AR logs every transfer into a sheet ("ต้องบันทึกยอดในชีท … โอนเรทเท่าไหร่ + เรทซื้อ/เรทขาย + เปิดใบกำกับไหม + ลูกค้าคือใคร").

**ฝากสั่งซื้อ worked example (Web, L245):** order 9 bottles/3 colours @ ¥30.75, rate 4.95 = ฿152.21, +7% = ฿162.86. One colour sold out → re-priced to 6 bottles/2 colours @ ¥20.5 = ฿101.47 +7% = ฿108.57; the over-transferred difference becomes a **ค่าเฟรท discount** (the over-paid CNY is credited against freight, not refunded).

---

## 5. The MOMO container status loop (chat 4) — the GZS lifecycle

**Container code grammar:** `GZS<YYMMDD>-<n>` = sea container opened on that China date, sequence n. A split shipment gets `-2`, `-3` suffixes (overflow into the next container). `GZE`/`EK` = road, `GZS`/`SEA` = sea (matches `lib/forwarder/cabinet-transport.ts`).

**The loop (CS ↔ benz/Bonus/Aong/林云云):**
1. **Resolve container:** CS gives the GZS code → benz/Bonus return the **real container number** (`GZS260519-1 → IAAU1695308`) + ชื่อเรือ/BL.
2. **Sea status:** "เรือถึงไทยวันที่ 6/6 ใช้เวลาปล่อยตู้ 5-7 วัน" → reaches **แหลมฉบัง** → "ตรวจปล่อย" → "เคลียร์ปล่อยตู้".
3. **Stuck container:** "กองปราบสแกนตู้และตรวจตู้ คาดว่าปล่อยปลายสัปดาห์หน้า" · "ด่านจีนยังไม่ปล่อยตู้ออกมา (GZS260509-2)" — owner escalates to benz.
4. **Thai warehouse (Aong, นครปฐม):** ตู้เข้าโกดังนครปฐม → unload + คัดแยก → "นำเข้าระบบ" (enters parcels into the system, posts photos) → **"จ่ายเงินในระบบได้เลย / กดจ่ายในระบบให้หน่อย รถมาถึงแล้ว"**.
5. **กดจ่ายในระบบ (the release press):** ACC-AP/CS presses pay in-app → "เรียบร้อยค่ะ" → Warehouse (Keetar) drives to MOMO/นครปฐม to pick up → confirms PR ownership of the boxes → delivery.
6. **Tracking → container map:** 林云云 maps a tracking to its GZS container (`1778749951 ส่งออกแล้ว เลขตู้ GZS260516-1`; later corrected to `-3` after split).

**The split-container reality (L177):** a tracking expected in `GZS260516-1` actually shipped in `GZS260516-3` (the carrier split it across 3 containers). CS must reconcile per-tracking, not per-container. A 48-box parcel was "แบ่งตู้มา 12 กล่อง" (12 in this container, rest in `GZS260530-1`).

**Edge cases that recur:**
- **ของหาย/ขาดกล่อง:** "PR10601 ขาด 1 กล่อง", "PR005 ขาด 12 กล่อง" → warehouse คัดแยก → found.
- **ของมาผิด PR (สลับ):** "จีนสินค้าติดชิปปิ้งมาผิด PR017 มาติดให้ PR107 → ลูกค้าได้ของสลับกัน → แก้ไขยังไง" (L511, **no system support**).
- **ไม่มี Shipping Mark:** จีนต้องใช้ **เบอร์โทรของ PACRED** เพื่อแยกของแต่ละบริษัท (can't reuse PCS's number) — the PCS→PR brand split is physically tagged by phone number.
- **PCS→PR migration of in-flight parcels:** "สินค้าทั้งหมดหลังจากนี้ PCS99 จะถูกเปลี่ยนเป็น PR99 … รบกวนแก้ไขรหัส PCS50 → PR50 … ลูกค้าเปลี่ยนมานำเข้ากับ PACRED" (L151).

---

## 6. The VVVIP daily per-tracking bill (chat 6, PR999)

A top customer (PR999/PCS999, "พี่เป้") runs a **daily** loop:
1. Sale (Ploy) posts every morning: "วันนี้มีตู้เข้า N แทรคกิ้งนะคะ" → then the **per-tracking list** (e.g. 29 trackings, each `<tracking> N/N`) + a **bill**: "ยอดค่านำเข้า 90,163.53 บาท".
2. Customer replies "เอา" (take today) / "ฝากไว้ก่อน เอาวันเสาร์" (hold) per day.
3. On take-day: customer pays → posts slip ("จ่ายแล้วคะ") → goods delivered ("กำลังจัดส่งสินค้าไป").
4. **not-mine handling:** customer "ไม่ใช่ของพี่ แก้ไขบิล มารับสินค้าคืนด้วย" → Sale "แก้ไขบิลให้เลย / ยกเลิกบิล" → warehouse retrieves the wrong parcel.
5. **broken (แตก):** "82570215442 รายการนี้เป็นกระเบื้องสินค้าแตก" — flagged inline, photo.
6. **container returned (ตีกลับ):** "สินค้าอยู่ในตู้ที่ถูกด่านจีนตีกลับ GZS260526-1 … รอ ส่งออกใหม่".
7. **cross-warehouse lookup:** Yiwu(อี้อู) vs Guangzhou(กวางโจว) — Sale routes the tracking-not-found to the right China warehouse.

---

## 7. The juristic FCL customer (chat 5, อภิรัตน์) — the วางบิล + ใบหัก loop

A นิติบุคคล FCL importer (multiple ตู้ 002/003/004/005):
1. Per ตู้: CS gives ETD/ETA estimate → "เรือเข้าแหลม 11-12" → BL ready → CS แลกดีโอ → แพลนตรวจปล่อย → ส่งสินค้า.
2. **ตู้ตรวจ อย. fail (L250):** ตรวจปล่อยไม่สำเร็จ — อย.ท่าเรือ wants an ORIGINAL ปั๊มสด Certificate (ฉบับ 420), the notarized copy rejected → blocks the whole container until Monday.
3. **ยอดภาษี per ตู้:** CS posts "ยอดภาษี 269,154 บาท +200" (the +200 = ค่าธรรมเนียมกรมศุล).
4. **ใบหัก (WHT 1%):** customer needs Pacred's address + tax id to write the 50-ทวิ.
5. **วางบิล (billing visit):** customer batches several ตู้ into ONE เช็ค ("ตู้ 2 กับ 3 มาวางพร้อมกัน ตีเช็คใบเดียว ยอด 47,272.58"); a แมส (messenger) drives the documents/cheque between offices.
6. **Pickup logistics:** customer driver จอดรอที่ปั๊ม → CS gives พี่คนขับ's เบอร์ + ทะเบียน → 9 โมง pickup.

---

## 8. SYSTEM GAPS — what the software does NOT yet support (actionable)

> Cross-referenced against the current build: `actions/admin/*`, `lib/forwarder/*`,
> `lib/admin/*`, the forwarder/shop/payment/cnt/billing/HS surfaces (see §"current
> build" inventory below). Each gap = a coordination loop that lives in LINE today
> and could/should be pulled into the app. Ordered by leverage.

### G1 🔴 — HS-consult queue (ad-hoc, photo-first, pre-order)
- **Real flow:** the #1 daily volume is "ส่งรูป → ขอพิกัด → Doc ตอบ HS/อากร/FE/stat/EN-name/ใบกำกับได้ไหม", **before any order exists**, and the answer is reused (Doc: "สินค้าชนิดเดียวกัน รวมเป็นชุดเดียว"). Plus **เลี่ยงพิกัด** (license avoidance) with an AUDIT-approval step.
- **Current build:** `/admin/accounting/hs-triage` exists but is **order-bound** — `listHsTriage` lists existing forwarder/shop LINE ITEMS that lack `hs_code`. There is NO ad-hoc, photo-in/HS-out consult queue, no Sale→Doc request object, no reuse-search of past consults.
- **Gap / build:** a **HS-consult ticket** entity: Sale/CS uploads photo + Thai name + intended service → routes to Doc → Doc replies the structured block (HS, อากร, ฟรอมอี, stat, TH/EN, ใบกำกับได้ไหม, **avoid-flag + avoided-from-code + risk note**) → answer is saved + **searchable** (so "ผ้าม้วน 52085990" is reused). Link a resolved consult to a future order line (feeds `hs-triage`/the cost editor). The `hs_codes` library (`form_e_duty_pct`/`other_forms`/`default_stat_code`/`hs_note` — mig 0180/0181) is the right backing dictionary; it just needs the **request/answer workflow** on top + a "เลี่ยงพิกัด" field set (license flags: มอก/อย/ใบอนุญาต/ทุ่มตลาด/เกษตร/DG, and the avoided-to code).

### G2 🔴 — Daily yuan-rate matrix: publish + consume in-app
- **Real flow:** Pricing publishes a 4-line matrix (โอนอาลีเพย์ ≤/>หมื่น · ฝากจ่าย · กดจ่าย 1688/Taobao) once/day, valid 10:30–20:30, pasted into LINE; Sale/CS reads it off chat all day; แสน+ gets a negotiated rate.
- **Current build:** `tb-settings.ts` stores only THREE scalar rates (`rsdefault`/`rpdefault`/`rgdefault`) with a range guard — NOT the 4-band matrix, no per-band (≤/>หมื่น), no validity window, no "เรทยังไม่ออก" gate, no negotiated-tier, no publish-to-customer surface.
- **Gap / build:** a **daily rate-matrix publish** (`rate_matrix_daily`: date · band[alipay_le10k/alipay_gt10k/fakjai/kotjai_1688_taobao] · rate · valid_from/to · published_by · status[pending/published]) + a read API the quote tools and a customer-facing display consume. Today the rate is invisible to the system — a ฝากโอน job's rate is only ever a number typed into LINE.

### G3 🔴 — ฝากโอน / กดจ่าย CNY-transfer slip loop (AR↔AP two-slip)
- **Real flow:** a ฝากโอน job = (a) customer pays THB + slip [AR], (b) Pacred transfers CNY to the Chinese shop + returns the China slip [AP], with rate, band, ใบกำกับ-flag, order ids (for กดจ่าย, one block per 1688 order), QR/acct, refund-on-fail, and an ACC sheet log.
- **Current build:** `yuan-payments.ts`/`yuan-payments-tb.ts` exist (a yuan-payment with cost capture, dup-gate, refund), and `createYuanPayment` is direct-cut slip-only. But it is **single-slip** (no explicit China-side AP slip as a first-class artifact), has **no rate-band capture** (≤/>หมื่น/ฝากจ่าย/กดจ่าย), no multi-order กดจ่าย block (PR043 had ~15 order lines), no over-transfer→ค่าเฟรท-credit, and no "transfer failed → refund/ฝากไว้" state.
- **Gap / build:** model the ฝากโอน/กดจ่าย job with **two slips** (customer-THB-in, China-CNY-out) + rate-band + 1688 order-id list + the over-pay→freight-credit + a failed-transfer/refund state. Replace the LINE template (Jane's pattern, §4) with a form. This is money-adjacent → gate + test.

### G4 🟠 — Container customs-status timeline (the MOMO loop)
- **Real flow:** CS asks benz/Bonus per GZS code for: real container no, BL/ชื่อเรือ, ส่งออกวันไหน, เรือถึงไทย, **แหลมฉบัง ตรวจปล่อย**, เคลียร์ปล่อยตู้, ตู้เข้าโกดังนครปฐม, นำเข้าระบบ. This is a multi-step **physical+customs timeline** per container, all chased in chat.
- **Current build:** `momo-container-resolve.ts` resolves container_batch_no + ETD/ETA (แต้ม-primary/MOMO-fallback, mig 0195); `report-cnt` groups by `fcabinetnumber`; `fstatus` is a single overloaded column. There is NO **per-container customs-status timeline** (ส่งออกจีน → เรือออก → ถึงแหลมฉบัง → ตรวจปล่อย/กองปราบ-hold → ปล่อยตู้ → เข้าโกดังนครปฐม → นำเข้าระบบ) with timestamps + a "stuck/ติด" flag.
- **Gap / build:** a **container status timeline** table keyed on container_no (statuses above + แหลมฉบัง vs นครปฐม legs + a hold/ตีกลับ flag + the responsible China partner). Feed it from the MOMO sync where possible; let CS update the manual legs. Surface it on `report-cnt`/forwarders so CS stops re-asking benz the same questions.

### G5 🟠 — Split-container per-tracking reconciliation
- **Real flow:** a tracking is promised in `GZS260516-1` but actually ships in `-2/-3` (carrier splits across containers); a 48-box parcel arrives 12-now / 36-later; CS reconciles **per tracking, per box-count (N/N)**, not per container.
- **Current build:** `momo-container-resolve.ts` knows about `-N` split codes and `momo-bill-header.ts` drops the bare bill-header from box Σ — partial support. But there is no first-class **"this tracking's boxes are split across containers X(12)/Y(36)"** view or a partial-arrival state per tracking.
- **Gap / build:** a per-tracking arrival ledger (tracking → {container, boxes_in_this_container, boxes_expected, arrived_at}) so a partially-arrived parcel is visible without chat.

### G6 🟠 — VVVIP daily per-tracking bill
- **Real flow:** PR999 gets a DAILY message: "วันนี้มีตู้เข้า N แทรคกิ้ง" + the tracking list (each `N/N`) + "ยอดค่านำเข้า X บาท"; customer replies เอา/ฝากไว้ per day; pays per take-day; not-mine/แตก/ตีกลับ → แก้บิล + รับคืน.
- **Current build:** billing-run (`billing-run.ts`, `/admin/billing-run`) is invoice-batch oriented (per customer, eligible forwarders), NOT a **daily per-tracking incoming digest** with a take/hold toggle per tracking, nor an in-bill "ไม่ใช่ของลูกค้า → แก้บิล + ส่งคืน" action.
- **Gap / build:** a **daily incoming-tracking bill** generator per VVVIP (today's arrived trackings + box counts + ยอดค่านำเข้า) with a per-tracking **take/hold** state and a **not-mine→amend-bill+return** action.

### G7 🟠 — not-mine / แตก(broken) / ตู้ตีกลับ(returned) handling
- **Real flow:** recurs across chats 4 & 6: "ไม่ใช่ของพี่ มารับสินค้าคืน" · "สินค้าแตก" · "ตู้ถูกด่านจีน/กองปราบตีกลับ" · "ของมาผิด PR สลับกัน".
- **Current build:** **NONE** — grep for ไม่ใช่ของ/ตีกลับ/แตก/broken/return/reject across `lib/admin`, `lib/forwarder`, `actions/admin` returns nothing relevant.
- **Gap / build:** a parcel **exception state** (not-mine / damaged / returned-by-customs / wrong-PR-mismap) on the forwarder/tracking row, with: remove-from-bill, return-to-warehouse, re-tag PR (the PR017↔PR107 swap), and a container-level "ตีกลับ → รอส่งออกใหม่" status. This is a real operational hole.

### G8 🟡 — Freight FCL quote (ปิดตู้) tool
- **Real flow:** "ขอราคาปิดตู้ 20'/40'/45' เหมาภาษี/ไม่เอกสาร · pickup จีน(address) + delivery ไทย · สินค้าคือ X" → Pricing returns "ราคาประมาณการรวมทุกอย่าง 330,000".
- **Current build:** `/admin/freight/quotes` + `composeFreightQuote` + `tb_freight_rate` exist (freight quote engine). Confirm it covers the **ปิดตู้ เหมาภาษี / ไม่เอกสาร / ไม่นำเข้านามลูกค้า** variants and the pickup-จีน→delivery-ไทย all-in price the chats quote. Likely a labeling/coverage gap rather than missing infra.

### G9 🟡 — ใบหัก (50-ทวิ WHT) + วางบิล batching for juristic
- **Real flow:** juristic deducts 1% WHT (needs Pacred address+taxid), batches several ตู้ into ONE เช็ค at a วางบิล visit, with a แมส courier moving documents.
- **Current build:** WHT-1% is computed on the วางบิล (`computeBillWht`, billing-run) and the 50-ทวิ cert gate exists on receipts (mig 0175/0198). But the **วางบิล-visit batching** (multiple ตู้ → one cheque, schedule a visit, courier the docs) and the **customer-issued ใบหัก** receipt-back are still chat-driven.
- **Gap / build:** a วางบิล-appointment object (customer · ตู้ ids batched · เช็ค no · visit date · courier) + capture of the customer's returned ใบหัก against the invoice.

### G10 🟡 — แมส (messenger) document-runner dispatch
- **Real flow:** CS repeatedly "รบกวนเรียกแมสมารับเอกสาร" + ขอโลเคชั่น + เบอร์ — an ad-hoc internal courier for BL/เช็ค/เอกสาร.
- **Current build:** driver-batches exist for delivery, but no **document-courier (แมส) dispatch** with pickup location + contact.
- **Gap / build:** a lightweight messenger-task (pickup addr + contact + what-to-fetch + status). Low effort, high daily friction removed.

### G11 🟢 — Chinese-phone-tag / shipping-mark identity (PCS→PR split)
- **Real flow:** จีน needs **a Pacred Chinese phone number** to tag PR parcels (can't reuse PCS's); in-flight PCS parcels get re-coded PCS→PR by hand.
- **Current build:** the coID PCS→PR rebrand is done in DB (mig 0182), but the **physical tag** (Chinese phone / shipping-mark per shipment) and the **re-tag-in-flight** action are not modeled.
- **Gap / build:** store the Pacred-China contact tag on the company/shipment and a "re-tag PCS→PR / fix-wrong-PR" admin action (also serves G7's wrong-PR swap).

---

## 9. Current Pacred build — relevant surfaces (inventory, for cross-ref)

- **HS:** `/admin/accounting/hs-library` (dictionary CRUD · form_e/other_forms/stat) · `/admin/accounting/hs-triage` (order-line HS assign · bulk) · `actions/admin/cnt-hs.ts` · `actions/admin/hs-triage.ts`. → **G1 gap = no ad-hoc consult queue.**
- **Rate:** `actions/admin/tb-settings.ts` (3 scalar rates + guard) · `/admin/settings/legacy-rates` · `/admin/rates/{general,vip,custom-hs,custom-user}` · `lib/forwarder/resolve-rate.ts`. → **G2 gap = no 4-band daily matrix/publish.**
- **Yuan/ฝากโอน:** `actions/admin/yuan-payments{,-tb}.ts` · `/admin/yuan-payments[/new]` · `/admin/reports/yuan-profit`. → **G3 gap = single-slip, no band, no multi-1688-block, no fail/refund.**
- **MOMO/container:** `lib/admin/momo-container-resolve.ts` · `commit-momo-row-core.ts` · `auto-commit-momo.ts` · `/admin/api-forwarder-momo/{sync,review,warehouse-reconcile,invoice-cost,history}` · `taem-etd-eta.ts` (mig 0195) · `/admin/report-cnt`. → **G4/G5 gap = no customs-status timeline, partial split support.**
- **Billing/docs:** `actions/admin/billing-run.ts` · `/admin/billing-run` · `combine-bill.ts` · `forwarder-invoice.ts` · `cargo-declarations.ts`/`customs-declarations.ts` · `/admin/accounting/{etax,cargo-declarations,customs-doc-kit}` · WHT `computeBillWht` + receipt 50-ทวิ gate. → **G6/G9 gap = no daily per-tracking VVVIP bill, no วางบิล-visit batching object.**
- **Freight:** `/admin/freight/{quotes,operations,shipments,rates,leads,declarations}` · `composeFreightQuote` · `tb_freight_rate`. → **G8 = verify ปิดตู้/เหมาภาษี coverage.**
- **Exceptions:** **NONE** for not-mine / broken / returned / wrong-PR. → **G7 gap.**
- **Messenger:** delivery driver-batches only; no document-courier dispatch. → **G10 gap.**

---

## 10. One-line takeaways

1. **Doc's พิกัด consult (incl. เลี่ยงพิกัด) is the daily-volume heartbeat and the differentiator** — and it is the LEAST-systematized part of the app (G1). Build the consult queue first.
2. **The yuan rate is invisible to the software** — it lives entirely in a daily LINE paste (G2). A published 4-band matrix unlocks G3 and customer-facing rate display.
3. **Container status + parcel exceptions are 100% chat-driven** (G4/G5/G7). A container timeline + an exception state would remove the highest-frequency CS chatter ("ตู้ถึงไหน", "ของหาย", "ไม่ใช่ของพี่").
4. **"กดจ่ายในระบบ" is the real release gate** between Aong's "รถมาถึงแล้ว" and warehouse pickup — already in the app; keep it as the chokepoint.
5. **VAT/ใบกำกับ = domestic Thai sale only**; ใบขน carries the customer's own import VAT; ฝากโอน is mostly no-VAT. Policy: "บริษัทไม่ขายใบกำกับ — ต้องสั่งซื้อจริง นำลงใบขนจริง."
6. The **WeChat (China-supplier) side is encrypted and unreadable** here — Stage E (China purchase/warehouse) is only visible via its downstream LINE traces (林云云's tracking→container maps).
