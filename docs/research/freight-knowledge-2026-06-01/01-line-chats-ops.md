# 01 — LINE/WeChat chats: the REAL freight operational model (2026-06-01)

> **Cluster:** the ~30 LINE/WeChat `.txt` chat exports at `/Users/dev/Desktop/olddata dev/data งานเก่า/` root.
> **What it decodes:** the day-to-day operating reality of the OLD FREIGHT business (AX / Axelra / NNB / TTP / CargoThai / MOMO / JMF / PCS) — the part of the business our ported PCS *cargo* system does **not** cover: int'l FCL/LCL sea+air freight, customs brokerage (ใบขน/ใบกำกับ/Form E), and **cross-border China→Lao→Mukdahan truck "EK" import**.
> Analysis only. Sister docs: `_CONTEXT.md` (method), and the XLSX/HTML/code clusters.

---

## 0. The headline relationships (decoded from the chats)

**THE biggest finding — AX = Axelra = Pacred are the SAME legal entity.** In `AXELRA CHECK RATE` (lines 145–148) and `จองรถหัวลากแหลม` (l.79–84), the company that issues freight receipts is:

> **AXELRA (THAILAND) CO., LTD.** · 12 Soi Phetkasem 77 Yaek 3-6, Nong Khangphlu, Nong Khaem, Bangkok 10160 · **Tax ID `0105564077716`**

That tax ID is **identical to "Pacred (Thailand) Co., Ltd. `0105564077716`"** in `CLAUDE.md` → Pacred-DNA. So the rename chain is **AX/Axelra → Pacred** (same juristic person; brand pivot only). The `axelra.global` email domain (`document@axelra.global`) is their doc address. The pricing-bot account literally renamed itself mid-history from `AXELRA Pricing` → `Pacred Pricing - Web` (visible in `จองรถ-แจ้งแพลน`, l.529 onward, Feb 2026).

Other entities, as they actually behave in the chats:

| Entity | Real role in the chats | Tax ID / contact |
|---|---|---|
| **AX / Axelra / Pacred** | Us. The freight forwarder + customs broker + sales. Books trucks, fires status, drafts customs docs. | `0105564077716` |
| **NNB** (เดอะ เอ็น เอ็น บี เทรดดิ้ง) | The **importer-of-record / billing name** on the customs entry + the hauler invoice for sea-FCL jobs. "เปิดใบขนในนาม NNB". | `0115567039173`, 166 Moo 1, Bang Prong, Muang, Samut Prakan · Tel 061-403-7866 |
| **TTP** (+ คุณนัท / Nutwara) | Thai destination **warehouse/consignee** for the EK truck + sea jobs ("ส่ง TTP", "เข้า TTP, ลงตู้เสร็จ"). Was the partner that closed containers WITH us; later split. | dest warehouse, Chiang Saen gate marker |
| **CargoThai / EK** | The **China-origin freight + cross-border-truck** arm ("ตู้รถ EK CARGOTHAI", GZ-คุณอาลี่). Runs the China warehouse + the EK route. | China side |
| **MOMO** (PRINCE เจ้าของ / benz / Aong / BBOY) | The **replacement** for TTP — now Pacred closes containers + does Thai-warehouse intake WITH MOMO. Runs its own China warehouse (江高镇, Guangzhou), its own status-web + IT team. | China WH 江高镇沙溪东路18号3-1 |
| **JMF (= ไอแต้ม / TISO)** | ไอแต้ม's place — a **Thai destination warehouse** ("ส่ง JMF") AND the **dev shop (TISO Tech Solutions / `Tam TISO-ai.com`)** that built/operates the PCS web + the MOMO status-API sync. | TISO-ai.com |
| **NINESPEED / KMC / CRT / คุณแบงค์ / คุณนา / เอ็ม** | **3rd-party หัวลาก (truck-head) carriers** Pacred sub-contracts for port→customer haulage. Quote per-container by destination. | per-carrier LINE |
| **柏盛 (Bai Sheng) / Tran Ngoc / thavone / ຄຳປະເສີດ** | The **China origin agent + Vietnam + Lao transit** chain for the EK cross-border truck route. | CN/VN/LA |

**Two parallel China→Thai pipelines run side-by-side** and our chats span both:
1. **CARGO (PCS, consolidated parcels)** — small-parcel consolidation into containers, status synced into `pcscargo.co.th` by TISO. Now landed via **MOMO** (China WH → close container → Mukdahan/sea → MOMO Thai WH → customer picks up). This is the part our current system ports.
2. **FREIGHT (AX/Axelra/Pacred, whole-container)** — FCL/LCL sea + air + cross-border EK truck for *company* importers, with full customs brokerage. **This is the gap.** TTP/NNB/CargoThai/NINESPEED orbit this pipeline.

---

## 1. PRICING / QUOTING flow (sea / air / truck)

### 1a. Freight quote request — the structured "check mark / sparkles" form
Sales drops a quote request into the Pricing group using a rigid template (`AX Pricing + SALE + DOc`, many examples l.18–298). Canonical fields:

```
✅ AXELRA  ชื่อลูกค้า <customer/nickname> ✅
  IMPORT | EXPORT
  TERM:  EXW | FOB | CIF | DDP
  FCL <20ft|40ft|40HQ> | LCL
  SEA | AIR
  ชื่อสินค้า: <product>
  มูลค่าสินค้า: <value, if known>
  ที่อยู่ต้นทาง: <China origin / factory addr or city e.g. กว่างโจว/อี้อู>
  ที่อยู่ปลายทาง: <Thai delivery addr + maps pin>
  **ขนถ่ายหน้าตู้ / รถที่ใช้ (6ล้อ/10ล้อ/18ล้อ), # คัน, เข้าซอยได้ไหม**
  (attach รูป product + INV/PL if available)
```
- **EXW needs a China origin address** (or at least city) to price; FOB/CIF can price from port. Pricing replies a **freight-cost matrix per origin-port** (`AX Pricing`, l.54–64):
  ```
  XIAMEN→BKK 20"15,000/40"25,000 · SHEKOU 20"8,000/40"14,000 · NANSHA 8,000/12,000
  NINGBO 10,000/15,000 · GUANGZHOU 8,000/15,000 · SHANGHAI 15,000/27,000 ...
  "ราคาประมาณการ — ระบุ PORT ที่ต้องการ"
  ```
- Quote carries **explicit carve-outs** (`ตามงาน SALE`, l.56–61): *"ราคานี้ยังไม่รวมค่า Export ลายเส้น (+100-200 USD ถ้าโรงงานไม่มี)"* and *"ไม่รวมค่านายตรวจ ถ้าสินค้าติดอะไร +30,000–60,000 บาทเพื่อเคลียร์"*. So a freight quote = **freight leg + (conditional) export-cert + (conditional) นายตรวจ/inspection clearance fee**.

### 1b. Customs / "เหมาภาษี" quote — the second structured form
For "NNB เหมาตู้ภาษี" (tax-included whole-container import via NNB's name), DOC replies a different template (`AX Pricing`, l.222–259):
```
✅ NNB เหมาตู้ภาษี IM-CHINA ✅
  ลูกค้า = <e.g. PCS>
  สินค้า = <product>
  พิกัด (HS) = <code>
  ใบอนุญาต = ติด/ไม่ติดใบอนุญาต (+ how to เลี่ยงชื่อเข้า)
  ราคาเจ้าหน้าที่ = <e.g. 3000*3 / 5000*3>  ← "นายตรวจ" bribe/facilitation, per container
  สเตตัส = ลากตู้ 20ft / 40ft
  ขนส่ง = รถ10ล้อพื้นเรียบ / รถ18ล้อ
  ภาษี = ตามจริง | 30,000-40,000 (flat "เหมา")
```
This is the **"cargo/เหมาภาษี" model** vs the **"freight/เปิดเอกสารจริง" model** — owner spelled it out (`ตามงาน SALE`, l.276): *"เอกสาร เฟรท / ไม่เอกสาร คาร์โก้ชื่อชิปปิ้งนำเข้าเหมาภาษี"*.

### 1c. CARGO yuan/Alipay rate + per-CBM transport rate (the PCS retail side)
Two separate live rates run the cargo side:
- **Yuan/Alipay transfer rate** (`HS.CODE-VAT`, l.5–12, 63–71): a daily rate, time-windowed, tier-by-amount — *"โอนอาลีเพย์ ไม่เกินหมื่น 4.85 / เกินหมื่น 4.84"*; sales negotiates down (4.84→4.83) and the "Web" account is the single source that publishes it.
- **Per-CBM / per-kg transport rate** with basic/VIP/SVIP tiers (`Project Approval PCS`, l.95–100, owner-set):
  ```
  ทั่วไป(เริ่มต้น):  รถ 3500/15(บาท/คิว ที่ 15kg เกณฑ์) · เรือ 5500/20 ... อย/มอก = +พิเศษ
  พิเศษ:  รถ 7500/45 · เรือ 6500/40
  อี้อู floor: รถ 5000, เรือ 3000  · กว่างโจว floor: รถ 4700, เรือ 2700
  ```
  Owner killed the VIP *rate-band* ("ลบ vip ออก เหลือ 3500/5500") but kept VIP as a **label** to mark customers who need special care; live rate is now **per-individual override on the profile** (200–300 customers have custom rates). A temporary **fuel surcharge of +100 บาท/คิว** is applied via a button (`ทีม IT PCS`, l.134–142) — "ปรับคิวละ 100 จนกว่าน้ำมันจะลด".
- **Hard pricing doctrine from owner** (`ตามงาน SALE`, l.141–145): *"เรทหยวนขอที่พี่เท่านั้น · ต้องขายให้ได้ทุกเจ้า · เรทสู้ทุกเจ้า · ถ้าไม่สู้ทุกเรทเพื่อให้ได้งาน งานหลุดทั้งยวง"* — and a standing **+200 บาท margin on every customer** (l.127). Open-a-tax-invoice (เปิดใบกำกับ) customers get a different/higher rate than non-invoice (l.293–295: 4900 vs 4700).

### 1d. Truck-head (หัวลาก) quoting
Carrier groups (KMC/คุณแบงค์, NINESPEED/คุณนา, CRT/เอ็ม). Request = origin port + dest pin + container size + (sometimes) tonnage:
```
รบกวนสอบถามราคาหัวลาก ตู้ 1x20 1x40
ต้นทาง: ท่าเรือแหลมฉบัง | ท่าเรือกรุงเทพ
ปลายทาง: <maps pin>  สินค้า: <x>  น้ำหนัก: <kg>
```
Carrier replies a flat per-container baht (e.g. 3500, 10500, 13000, 22000), with surcharges: *"เกิน 25 ตัน +1000"*, *"ท่า C3 +2000 (congestion)"*. Tonnage and GPS pin are the price drivers. BKK 20ft ≈ 4500/40ft ≈ 5500 (NINESPEED, `PR PRICING`, l.10).

---

## 2. TRANSPORT BOOKING (จองรถ / แจ้งแพลน / ติดตามสถานะ)

### 2a. The booking form (sea-FCL → customer)
Once a container clears, DOC posts a booking to the carrier group (`AXELRA CHECK RATE`, l.151–163; `จองรถหัวลากแหลม`, l.8–62). Canonical fields:
```
จองรถ  งาน FCL 40HQ
SHIPMENT : <GZS… / A26… / PR…>      ← internal job code
ตู้ : <container no>                 BL/Booking : <BL no>
Dimension : <CBM>   จำนวน : <Cartons>   น้ำหนัก : <KGs>
POD : <แหลมฉบัง ท่า D1/KERRY/C3 | ท่าเรือกรุงเทพ T1 | B.3>
ตรวจปล่อย: <date>    ต่อเร้นถึง : <date>   วันส่ง : <date> <time>
ส่งที่ : <TTP | JMF | โกดังอาลี่ | customer addr>
เบอร์หน้างานลูกค้า: …   เบอร์ชิปปิ้ง: …   หมุดโลเคชั่น: <maps>
```
Carrier confirms → fixes the truck ("ฟิกตู้ ฟิกเวลา") → on dispatch returns **driver name + head/tail plates + phone** (`จองรถหัวลากแหลม`, l.108–128). "การ์ด" = the port pickup gate-pass; the workflow puts it in a numbered locker ("ตู้เหลืองเบอร์13, รหัส 4321") for the driver. Carrier also asks for **billing name + tax addr** to issue the receipt — almost always **NNB** as bill-to, **Axelra** as doc-delivery addr.

### 2b. The internal "จองรถ" intake template (for the back-office booker)
The owner standardized a fill-in form (`จองรถ-แจ้งแพลน`, l.273–281, 417–447):
```
จองรถวันนี้
ชิปเม้น : __   เลขตู้ : __   วัน/เวลาส่ง : __   ท่าเรือ : __
ที่อยู่โลเคชั่น : __   เบอร์หน้างาน : __   หมุดโลเคชั่น : __
ตรวจวันที่ : __   ต่อเร้นถึงวันที่ : __   แรงงาน: รับ/ไม่รับ (กี่คน)
```
Notable booking realities: labor (แรงงาน) is a line item ("รับ 4-6 คน", "ขนขึ้นชั้น18 มีลิฟต์"); r"ต่อเร้น" = container free-time extension; truck type by cargo (4ล้อ/6ล้อ/10ล้อพ่วงคอก/18ล้อ/รถเฮี๊ยบ for machinery/เทรลเลอร์). The whole back-and-forth is **manual LINE chat** — no booking system.

### 2c. Status tracking (the part customers actually feel)
Two flavors:
- **Sea FCL → TTP/JMF:** the destination WH (Nutwara@TTP, Aong@MOMO) posts *"ตู้รถ GZE… เข้า TTP/ลงตู้เสร็จเรียบร้อย + รูป"* and DOC pushes daily plan ETAs to mukdahan (`Project Approval PCS`/EK chat is wall-to-wall this). Sales relay to customers.
- **Cargo via MOMO:** customers ask AUDIT-MEW → MEW asks the MOMO group → benz/Aong give per-container status in plain text. **Statuses observed** (MOMO x PCS): สินค้าถึงโกดังจีน → ปิดตู้ (วันที่) → ออกจากด่านเวียดนาม → ถึงด่านลาว → ถึงด่านมุกดาหาร (รอคอนเฟิร์มรถขนถ่าย) → ลงตู้/คัดแยก → ยิงเข้าระบบ → เข้ารับได้. Truck = **EK / GZE-prefixed via Mukdahan**; sea = **GZS-prefixed via แหลมฉบัง/กรุงเทพ**.

---

## 3. CUSTOMS-DOC REQUEST flow (ใบกำกับ / ใบขน / INV-PL-CI · HS-code + VAT)

This is the **deepest gap** — a full, multi-party customs brokerage workflow that our system has zero of.

### 3a. HS-code + VAT-eligibility check (the `HS.CODE-VAT-PCS-PACRED` + `DOC SHIPPING` groups)
Sales/audit posts a product photo + name → the **DOC/CS team (PR.CS&DOC-PLOY, gring, Aom, Pacred Shipping)** replies a structured ruling:
```
<English product name> / <Thai name>
HS <8–10 digit พิกัด>   อากร <duty %>   [ขอ FE/Form E <0%|5%>]
→ "ออกใบขน + ใบกำกับได้" | "ออกใบกำกับได้" | "ของกินติด อย." | "ติดใบอนุญาต"
```
Real examples (`HS.CODE-VAT`, l.88–232): Polyester Ribbon `9612.10.90` อากร10% ขอFE0%; Artificial Flowers `6702.90.90` อากร20%; Shoe Insoles `6406.9099` 10% FE0%; Current Sensor `9030.3390` 0%; Laser Welding `8515.80.90`. **Duty-avoidance is explicit**: re-name the product to a lower/zero-duty heading ("แนะนำเลี่ยงชื่อเข้า — NET/ตาข่าย 5608.19 แทน Fish-tap 5608.11", DOC SHIPPING l.83–89; "เลี่ยงเป็นถุง" for อย.-controlled items). **Form E** (China-ASEAN CO) is requested to zero out duty when the heading still carries อากร.

### 3b. Tax-invoice (ใบกำกับ) value + VAT math (the "เปิดใบกำกับ" workflow)
For cargo customers who want a Thai VAT invoice, DOC computes from the yuan paid (`HS.CODE-VAT`, l.13–39, 72–77):
```
yuan_amount × alipay_rate = THB base
THB base × 7/100 = VAT
base + VAT = invoice total
(× 50% if customer pays in two installments → TWO invoices, one per rate-date)
```
Rule surfaced: if the two installments fall on **different daily rates**, you must **split into two ใบกำกับ** (l.30: *"เรทวันจ่าย50%แรกกับวันนี้ต่างกันเยอะ → 2 ใบ"*). The customer's declared **มูลค่าสินค้า on the ใบขน is engineered** to match a target duty+VAT — e.g. l.43–46: they *back-out* the goods value to hit a target (declare 6675 USD so duty+VAT lands at a number), and pick the HS heading (`84813040`) to suit. This is "วิศวกรรมมูลค่า" — declared value/HS chosen for tax outcome, not literal.

### 3c. The TTP·NNB·CargoThai cross-border doc workflow (the `เอกสารปิดตู้ คุณบี`, `Tran Ngoc`, `WECHAT DOC EK` chains)
For the **EK cross-border truck** (China→Vietnam→Lao→Mukdahan), the doc flow is a 3-country relay:
1. **China origin agent (柏盛/Bai Sheng)** closes the container, posts the packing list + a Chinese container manifest. Barcode/小包号 on each parcel must reconcile to the declared 唯一单号 (`WECHAT เฟรทเรา`, whole file — they debug why customs scanners read some tracking numbers and not others).
2. **VN/Lao transit (Tran Ngoc / thavone / ຄຳປະເສີດ)** posts the cross-border movement record (`Tran Ngoc`, l.27–43):
   ```
   45大 (45ft) · Date · CN Truck 粤ABU698 · Cont No WTLU2025511 · VN Truck 15H06489
   Mooc 15RM01358 · Seal H/25.0620980 · 口岸 CHALO-扎罗-穆达汗 (SAVAN)
   芒街出发 (Mong Cai depart) → 预计到达 (ETA Mukdahan) · 反空柜 (empty return) · 接货电话
   ```
3. **Thai customs broker (คุณบี / 🐝B•E•E — the NNB doc team)** receives, per container: the **INV/PL (invoice+packing), the ใบขน draft, the Form-E (or "ถอยฟอม" = no-form), and the container/seal no**, then **"ยิงใบขน"** (files the import entry in Thai customs e-system), reconciling unit = **CT (cartons)**, and ties each entry to a "ศบ.####" (customs entry seq). Win/gring (Axelra DOC) draft the INV_PL + ใบขน PDFs (`QEUT0100004xx_GZE…pdf`) and hand off; B•E•E confirms form-use Y/N, fixes invoice headers, and emails the finished bundle. The owner promises *"รถออกจากจีน ผมรีบส่งเอกสารให้เลย"* — docs must precede the truck so customs + transload are ready (`Tran Ngoc`, l.156–159).
- **Air import (`AIR IMPORT-สุวรรณภูมิ`)**: a parallel customs flow — get the **D/O** (delivery order) from the airline/forwarder (UPS/FedEx/Leo), pay D/O fee, customer signs **ใบมอบอำนาจ (power of attorney) original**, draft ใบขน, customer "ตัดภาษี" (pays duty), attach Form-E + TISI cert, release ("ปล่อยล่วงเวลา"/OT), photograph every box, Lalamove the docs to the airport agent.

### 3d. ใบขนพ่วง (piggyback entries) — the volume game
Owner's standing push (`ตามงาน SALE`, l.151–152; `MOMO x PCS`, l.33–43): *"ใบขนพ่วงเต็มระบบ จัดมาเลย · 10% จากค่าบริการ = ค่าคอม ล่าใบขนพ่วงมาได้เลย"*. A "ใบขนพ่วง" = attach a small customer's goods onto a main importer's customs entry to share the entry/clear under one company's name. To open an entry under a borrowed company (e.g. NNB), **the aggregate value must reach a threshold** ("ต้องใช้ยอดจำนวนมากเพื่อเปิดใบขน · เร่งสั่งซื้อด่วน ไม่งั้นเปิดเจ้านี้ไม่ได้เพราะยอดไม่ถึง", `ตามงาน SALE`, l.88–91). Sales are commissioned 10% to hunt piggyback-entry demand.

---

## 4. CONTAINER-CLOSING + STATUS-API (MOMO×PCS · who fires what)

The `MOMO x PCS` + `ทีม IT PCS CARGO` + `Project Approval PCS x TISO` chats expose the actual data pipeline:

- **MOMO China WH** receives PCS parcels at `江高镇沙溪东路18号3-1` (Guangzhou Baiyun), consignee labeled `รหัสลูกค้า/PCS` + `/EK`, phone `15017594003` (`MOMO x PCS`, l.6–11). It **closes containers** and emits a per-container close file (the long tracking-number lists in `ทีม IT`, l.28–128, 166–309 — 100+ tracking numbers per close).
- **TISO/ไอแต้ม (`Tam TISO-ai.com`)** runs the **status-API sync**: pulls MOMO's API **every 15 minutes** into `pcscargo.co.th`, plus a manual **daily evening summary** (`MOMO x PCS`, l.66–72). He alone can: add a courier (SPX/Flash/J&T/SPX), fix container-number mismatches, force-update a tracking that "ไม่ขึ้นในระบบ", split a tracking across two warehouses ("ขีด 2" — e.g. 60 boxes old WH + 40 boxes MOMO), top up SMS credit for registration, fix receipt formatting/WHT, and patch the member-register bug. He is a **single point of failure** — "เว็บล่ม" + "TISO Tech Solutions: รอ 1-2 นาที" appears **dozens of times** across days (`ทีม IT`, l.417–589). His receipt URL: `pcscargo.co.th/member/pcs-admin/printReceipt.php?id=FRC2604-00039&type=1`; multi-search: `forwarder-search-muti.php?fTracking=...`.
- **Who fires status:** the **China warehouse keys arrival** ("ทางจีนยังไม่คีย์ → API ไม่มี"); **TISO's cron** moves it into PCS; the **Thai WH (MOMO/Aong)** keys the "ลงตู้/คัดแยก/ยิงโค้ด" intake that flips `fStatus` to received. The **dimension/weight is measured at the MOMO China WH** and that drives the customer charge — and is a recurring dispute source ("วัดได้ 41×299×26 vs จริง 41×29×26 → ลูกค้าจ่ายเกิน", `MOMO x PCS`, l.985–998; QTY shows "1" instead of "40" — "ข้อจำกัดของแอปรับเข้าไทย", l.1093–1096).
- **MOMO has its OWN status web + own IT** that Pacred does NOT control ("รายการที่ไม่มีในเว็บเขา momo มีทีม IT ของเขาเอง พี่จะไม่ได้ดูแล", `ทีม IT`, l.433). Two sources of truth (MOMO web vs TISO's API copy) **routinely disagree** — the #1 operational pain.
- The migration was abrupt and owner-driven (`MOMO x PCS`, l.16–30, Apr 2 2026): *"ขอวีแชทเขาตั้งกลุ่ม เริ่มย้ายเลยต้องแต่วันนี้ · แจ้งเปลี่ยนเลขบ้าน · เอาเบอร์ PCS"* — i.e. they re-pointed the China-WH address/phone from the old (TTP-era) setup to MOMO's, and migrated all the WeChat status groups.

**Container code grammar (confirmed across every chat):**
- `GZE` + `yymmdd` + `-N` = **EK truck (รถ)** out of Guangzhou via Mukdahan. `GZS` = **sea (เรือ)** via แหลมฉบัง/กรุงเทพ. Suffix `-T`/`-B`/`-2` = sub-batch/route variant. (`GZS251110-1`, `GZE260406-1`.)
- `A26…` / `A25…`, `AS26…`, `PR26…` = **freight job/invoice numbers** (Axelra/Pacred internal). `PR26050006` etc. are the new Pacred-branded job codes (`PR PRICING`, `LCB`).
- `FRC`/`FRG` `{yyMM}-{NNNNN}` = PCS receipt doc numbers (matches our ported `mint-receipt-doc-no`).

---

## 5. SALES follow-up (ตามงาน SALE workflow)

- All inbound leads funnel into a **LINE OA** ("ไลน์แอด") watched by one person (BbamM/แบม "เฝ้าแอด รันคิว"); sales are then assigned by chasing in the `ตามงาน SALE` group. Owner repeatedly yanks specific leads to handle himself ("ลูกค้าใคร · โทรไปด่วน · ถ้าแก้ปัญหาไม่ได้พี่จะเอามาดูแลเอง").
- Open problems the owner flags as systemic (`ตามงาน SALE`, l.183–191): *"ลูกค้าเข้าไลน์แอดแล้วจะแยกงานกันยังไง · คิดแผนการรับลูกค้าแบบไม่ส่งงาน (ติดต่อคนรับงานโดยตรงจบเลย) · หน้าระบบควรโชว์ใครทำบริการอะไร + เบอร์โทรตอนเลือกเซล · ไลน์แอดควรแยกไหม"* — i.e. **lead-routing / rep-assignment / no-handoff** is an unsolved design problem he wants the system to solve.
- Sales doctrine: never ask the customer for info, just send a price and chase ("ห้ามถามข้อมูลลูกค้า · ส่งราคาไปอย่างเดียวแล้วติดตามผล · ถามแค่เอา/ไม่เอาเอกสาร", l.271–273). Quote-or-lose-them culture; +200 margin + tax-invoice surcharge baked in.
- Recurring rebrand/naming churn (PESELA/Pacxis/PACSZA/Ppop cargo votes) shows the AX→Pacred pivot was live during this window.

---

## 6. What Pacred LACKS to run this (gap vs current cargo system)

Our ported PCS system handles **cargo retail** (consolidated parcels, wallet, yuan-transfer, forwarder tracking, MOMO sync). It has **nothing** for the freight/customs/cross-border business above:

1. **No quote/RFQ engine.** The structured freight + เหมาภาษี quote forms (§1a/1b) live only in LINE. No FCL/LCL rate table per origin-port, no นายตรวจ/Form-E/export-cert cost components, no quote→job conversion.
2. **No transport-booking module.** §2 booking (carrier dispatch, driver/plate capture, การ์ด/gate-pass, ต่อเร้น free-time, labor lines, POD-by-port, maps pin) is 100% manual chat across NINESPEED/KMC/CRT.
3. **No customs-doc workspace.** No HS-code/duty/Form-E ruling store, no INV-PL-CI / ใบขน drafting, no value-engineering calculator, no ใบขนพ่วง aggregation, no ศบ.-entry tracking, no D/O + power-of-attorney air flow, no NNB-as-importer billing split.
4. **No multi-leg cross-border tracking.** The China→VN→Lao→Mukdahan EK relay (CN/VN truck plates, seals, 口岸, ETA) and the dual MOMO-web-vs-API reconciliation have no home; current "tracking" is single-status, parcel-level.
5. **No freight-grade entity model.** We model `tb_users` customers; freight needs **importer-of-record vs delivery-consignee vs bill-to** split (Axelra↔NNB↔customer), per-shipment FCL/LCL/AIR mode, BL/booking, container, CBM/cartons/weight, POD/port, Form-E flag, declared-value-engineering.
6. **No lead-routing / rep ownership.** Owner's explicit ask (§5) — LINE-OA omni-inbox → assign-by-service → direct rep contact, no-handoff — is unbuilt.
7. **Resilience + single-vendor risk.** The whole status pipeline depends on TISO/ไอแต้ม (web "ล่ม" constantly) and on MOMO's separate IT. Pacred owns neither today.

---

## 7. Max-potential — how to build it BETTER (the CEO "expand + improve")

1. **Unified RFQ → Quote → Job.** Turn the two LINE templates into one structured **quote builder**: mode (FCL/LCL/AIR/EK-truck), INCOTERM, origin-port, dest pin, product→HS lookup, auto-attach freight-rate-card + conditional cost lines (export-cert, นายตรวจ, Form-E, duty/VAT estimate, haulage). Versioned, customer-shareable, one-click → job. (Feeds, and is fed by, the XLSX rate sheets in the sibling cluster.)
2. **Customs-doc workspace** = the real moat. HS-code knowledge base (with the *legit* duty-optimization: Form-E eligibility, heading alternatives) + INV/PL/CI/ใบขน generation + value/VAT calculator (the §3b math, incl. split-by-rate-date) + ใบขนพ่วง aggregation engine + ศบ./entry register + air D/O & POA workflow. Make Axelra↔NNB↔customer the explicit 3-party model so the right name prints on the entry vs the receipt.
   - ⚠️ Note for the team: several practices in these chats are **duty-avoidance/value-engineering and "ราคาเจ้าหน้าที่" (facilitation) payments**. When productizing, build the *compliant* core (HS lookup, Form-E, genuine WHT/VAT) and treat the gray-area mechanics as data we record, not features we automate-and-advertise.
3. **Transport-booking + carrier marketplace.** Digitize §2: carrier directory with per-lane rate cards (LCB/BKK/CRT/NINESPEED/KMC), booking form → carrier confirm → driver/plate/gate-pass capture → live POD, ต่อเร้น timer, labor line items. Auto-build the carrier's receipt bill-to (NNB) + doc-delivery (Axelra) addresses.
4. **Public multi-leg `/track`** spanning China-WH → close → CN/VN/Lao transit → Mukdahan/port → Thai-WH → delivery, **reconciling MOMO-API vs MOMO-web** automatically and surfacing dimension-dispute + QTY-mismatch flags proactively (the top operational pains). This is also the CargoThai blueprint (Theme 7).
5. **Omni LINE-OA inbox + rep routing** answering the owner's §5 ask: capture every lead, auto-assign by service, show "who does what + their direct line", no-handoff.
6. **De-risk the pipeline:** bring the status-sync + receipt/doc generation in-house (replace the fragile TISO single-point), keep the MOMO/JMF/CargoThai partner APIs as *inputs* not the *system of record*.

---

### Source map (filenames → what they prove)
- `MOMO x PCS` — China-WH address/phone migration, daily container status, dimension/QTY disputes, ปิดตู้ confirmation.
- `ทีม IT PCS CARGO` + `Project Approval PCS x TISO` — TISO 15-min API sync, single-vendor "เว็บล่ม", rate-button (basic/VIP/SVIP), per-customer rate overrides, courier add, split-warehouse "ขีด 2".
- `AX Pricing + SALE + DOc` — the freight RFQ form, the NNB-เหมาภาษี form, origin-port freight matrix, export-cert/นายตรวจ carve-outs.
- `HS.CODE-VAT-PCS-PACRED` + `DOC SHIPPING` — HS-code/duty/Form-E rulings, value+VAT math, duty-name-avoidance, two-invoice split rule.
- `AXELRA CHECK RATE`, `จองรถหัวลากแหลม-CRT`, `PR PRICING+NINESPEED`, `หัวลากกรุงเทพ ninespeed`, `LCB-คุณเอ็ม` — truck-head quoting + sea-FCL booking form + driver/plate/การ์ด capture + **Axelra=Pacred tax-ID `0105564077716`** + **NNB bill-to `0115567039173`**.
- `จองรถ-แจ้งแพลน-ติดตาม` — the internal จองรถ intake template, labor/ต่อเร้น lines, AX→Pacred Pricing rename.
- `ตู้รถ EK CARGOTHAI…ขาเข้า` + `Project Approval PCS` (EK plan) — EK truck → TTP/JMF destination, daily Mukdahan ETA plan, driver/plate.
- `เอกสารปิดตู้ คุณบี EK มุขดาหาร` + `Tran Ngoc…มุกดาหาร` + `WECHAT DOC EK ทางรถ` + `WECHAT เฟรทเรา` — China→VN→Lao→Mukdahan cross-border relay data, NNB customs-broker (คุณบี) ใบขน/Form-E "ยิงใบขน" flow, China barcode/小包号 reconciliation.
- `AIR IMPORT-สุวรรณภูมิ` — air D/O + power-of-attorney + ตัดภาษี + Form-E/TISI release flow.
- `ตามงาน SALE` — LINE-OA lead funnel, rep-routing pain, +200 margin / quote-or-lose doctrine, ใบขนพ่วง 10% commission.
