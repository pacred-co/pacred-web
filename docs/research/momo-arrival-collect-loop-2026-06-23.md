# 📦 MOMO arrival → pickup → bill-MOMO → collect-customer loop — legacy dig + automation plan (2026-06-23)

> Owner ask: *"ไปไล่เจาะ legacy ให้หน่อยว่าเขารู้ได้ยังไงว่าของถึง MOMO แล้ว ไปเอาของได้เมื่อไหร่ ต้องรอ MOMO บอกในแชทเองหรอ ไม่น่าใช่ มันควรมีตัวรู้ตัวบอกไหม ว่าของอยู่ MOMO แล้วนะ ตู้ไหน แทรคกิ้งไหน กี่คิว กี่กล่อง ต้องเอารถอะไรไปเอา วางบิล MOMO เลยมั้ยตอนไหน แล้วกดยิงเปรี้ยงเดียวไปเก็บตังลูกค้าได้ตอนไหน ขอให้จบจริงๆสักที"*
>
> Dig = 3-agent source sweep over legacy PCS (`/Users/dev/Desktop/pcs-realshit/...`) + the Pacred MOMO integration.

## TL;DR — answering each question

| คำถาม | คำตอบ (จาก source) |
|---|---|
| **เขารู้ได้ยังไงว่าของถึง MOMO?** | **Legacy = MANUAL.** ไม่มี auto-poll — แอดมินเข้า `api-forwarder-momo.php?page=updateAPI` กดดึงเอง (proxy `tiso-ai.com`) หรือพิมพ์มือจากที่ MOMO บอกในแชท. **ใช่ — legacy รอแชท/กดดึงเอง.** |
| **Pacred ดีกว่า legacy แล้วมั้ย?** | **ใช่ส่วนหนึ่ง.** มี cron `/api/cron/momo-sync` ดึงทุก 10 นาที → ลง `momo_import_tracks`/`momo_container_closed` (ตู้/tracking/คิว/กล่อง/น้ำหนัก/วันเข้า-ออกโกดัง). **แต่ดึงเงียบๆ — ไม่มีตัว "บอก" ใคร.** |
| **ตัวรู้/ตัวบอก ว่าของถึง MOMO แล้ว — ตู้ไหน tracking ไหน กี่คิว กี่กล่อง?** | **ยังไม่มี (GAP 1).** ข้อมูลครบใน `momo_import_tracks` แต่ไม่มี LINE-alert/การ์ดเด่นที่ "ดีดบอก" ตอนของถึง. นี่คือสิ่งที่ต้องสร้าง. |
| **ต้องเอารถอะไรไปเอา (China→TH)?** | **MOMO เป็นคนเลือกรถ/ตู้เอง** (Sang/MK/… ตามขนาดตู้/ETA ของเขา). Pacred แค่ "อ่าน" รหัสตู้ที่ MOMO กำหนด (GZS=เรือ / GZE,EK=รถ / GZA=อากาศ) แล้ว auto-decode โหมด (`cabinet-transport.ts`). **รถที่ Pacred เลือกเอง = รถส่งในไทย** (driver-batch ตอน fstatus 6 — มีแล้ว). |
| **วางบิล MOMO ตอนไหน?** | **คนละเรื่องกับเก็บเงินลูกค้า.** "วางบิล MOMO" = จ่าย **supplier** (ต้นทุน 2,500/คิว · ฮุย-ไท่ต๋า) → เป็น **supplier-AP/เจ้าหนี้** ตามรอบ agreement (เช่น จ่ายตอนปิดตู้/NET-x) ไม่ผูกกับ fstatus. วันนี้ต้นทุน MOMO เก็บได้ทาง **paste invoice PDF** (เครื่องมือที่ทำไว้แล้ว) เท่านั้น — ยังไม่มีหน้า "วางบิล MOMO" รวมยอด. → **accounting lane (ภูม · B5 supplier AP).** |
| **เก็บเงินลูกค้า "ยิงเปรี้ยงเดียว" ตอนไหน?** | **เมื่อของถึงไทย (fstatus 4)** → ตั้งราคา → วางบิล (fstatus 5) → ลูกค้าจ่าย → 6 → ส่ง → 7. **เก็บก่อนของถึงไทยไม่ได้** (ยกเว้นลูกค้าเครดิตจ่ายล่วงหน้า). คือ trigger เก็บเงิน = **ถึงไทย (4)** ไม่ใช่ถึงโกดังจีน (2). |

## The full state machine (where money + the truck sit)

```
fstatus 1 รอเข้าโกดังจีน
   │  MOMO scan-in (kodang)        ← cron ดึงรู้ · แต่ไม่มีตัวบอก  (GAP 1)
fstatus 2 ถึงโกดังจีนแล้ว = "ของถึง MOMO แล้ว"   ← ตู้/tracking/คิว/กล่อง รู้ครบที่นี่
   │  MOMO ปิดตู้ + เลือกรถ/ตู้เอง (China→TH)   ← Pacred อ่านรหัสตู้ + decode โหมด
fstatus 3 กำลังส่งมาไทย
   │  ของถึงโกดังไทย (is_arrival=true → AT_WAREHOUSE_TH)  ← cron stamp · gate MOMO_SYNC_PROPAGATE_STATUS
fstatus 4 ถึงไทยแล้ว   ← ★ จุดเริ่ม "เก็บเงินลูกค้า" : ตั้งราคา → วางบิล
   │  createBillingRunInvoice (มีแล้ว · calcForwarderOutstanding = ยอดจริง 7 คอลัมน์)
fstatus 5 รอชำระเงิน   ← SMS/LINE ลูกค้า
   │  ลูกค้าจ่าย (wallet/สลิป·ตรวจ 2 รอบ)  → auto 5→6
fstatus 6 เตรียมส่ง   ← createDriverBatch (มีแล้ว · เลือกคนขับ/รถไทย)
   │  คนขับส่ง + อัปรูป  → auto 6→7
fstatus 7 ส่งแล้ว = จบ

[แยกขนาน · ไม่ผูก fstatus]  วางบิล MOMO = จ่าย supplier 2,500/คิว ตามรอบ  → accounting (ภูม)
```

## GAPS (สิ่งที่ขาด เพื่อให้ "จบ")

- **GAP 1 — ไม่มี "ตัวบอก" ตอนของถึง MOMO / ถึงไทย.** ข้อมูลลงเงียบๆ ใน `momo_import_tracks`. ต้องมี (ก) LINE-alert ดีดเข้ากลุ่ม staff ตอนตู้ถึง + (ข) การ์ด/คิว "📦 ของถึง MOMO/ถึงไทย — รอจัดการ" เด่นๆ (ตู้·tracking·คิว·กล่อง·น้ำหนัก·โหมด·วันถึง + ปุ่มไปเก็บเงิน). **(my lane · ไม่แตะเงิน · `notifyStaffGroup` มี helper พร้อม)** — dedup ต้องใช้ committed_at หรือ mig 0206 `notified_at` กันยิงซ้ำทุก 10 นาที.
- **GAP 2 — ไม่มีหน้า "วางบิล MOMO" (supplier-AP).** ต้นทุน MOMO เก็บได้แค่ paste invoice. ต้องมีหน้ารวมยอดจ่าย MOMO ต่อเดือน/ต่อตู้ + ออกใบ. **→ accounting lane (ภูม · B5).**
- **GAP 3 — auto-flip gates ต้อง verify** (เคยทำหลาย session แล้ว — ยืนยันอีกครั้ง): barcode 3→4 · wallet/slip-pay 5→6 · driver-photo 6→7. ถ้าขาดข้อไหน = สถานะค้าง.
- **GAP 4 — ยังไม่มี "ยิงเปรี้ยงเดียว" chain เดียวจบ** จาก logistics board: ติ๊กของถึงไทย → วางบิล → (ลูกค้าจ่าย) → จัดรถ. ชิ้นส่วนมีหมด (billing-run · driver-batch) แค่ยังไม่ร้อยเป็น one-click.

## Build plan (sequenced · lane-tagged)

| # | สิ่งที่สร้าง | lane | mig? | เสี่ยงเงิน? |
|---|---|---|---|---|
| 1 | **"ของถึง MOMO/ถึงไทย — รอจัดการ" surface** (อ่านอย่างเดียว · logistics board) — ตัวบอกที่ glance | เดฟ | ไม่ | ไม่ |
| 2 | **LINE arrival alert** (`notifyStaffGroup` ตอนตู้ถึง · dedup) | เดฟ | อาจ 0206 notified_at | ไม่ (ต้อง test ไม่ให้ spam กลุ่มจริง) |
| 3 | **One-click collect chain** (logistics board: ติ๊ก fstatus4 → วางบิล → จ่าย → จัดรถ) | เดฟ | ไม่ | ใช่ (verify auto-flip + money) |
| 4 | **วางบิล MOMO supplier-AP** (รวมยอด 2,500/คิว · ออกใบ) | **ภูม (accounting B5)** | อาจ | ใช่ |

**ต้องการจากเจ้าของ:** (ก) กลุ่ม LINE ปลายทางของ arrival-alert (#2) · (ข) #4 วางบิล MOMO — owner 2026-06-23 บอก **"ผมทำเอง" (เดฟ ทำ ไม่ใช่ภูม)** · (ค) เลือกลำดับ build.

---

## 🧾 2026-06-23 — money audit (PR106 order 1780103566) + owner's advance-billing brief

### Audit verdict (9-agent · adversarial-verified)
- **คำนวณ CBM vs KG (เรื่องที่ 1) = CORRECT_BY_DESIGN.** `lib/forwarder/resolve-rate.ts:359-435`. comparison ON → bill KG เมื่อ kg/คิว > ค่าเทียบ, ไม่งั้น CBM. PR106: cbm 3300 / kg 11 (ค่าเทียบ≈300). บรรทัด 4-6 (kg/คิว 673·540·346) คิด KG = ถูกตามโมเดล. **ไม่ใช่บั๊ก.**
- **🔴 OWNER DECISION 2026-06-23: "ยึดคิด ตามคิว (CBM) เป็นค่าเริ่มต้น เพราะ momo เก็บเราเป็นคิว."** → ต้องเปลี่ยน default basis เป็น CBM (เลิก auto-switch KG). **= pricing-engine change · money · ต้องเคาะ scope ก่อนแตะ** (ทุกลูกค้า? เฉพาะ order ใหม่? เก็บ override KG ไว้ไหม?).
- **🔴 เหมาๆ double-charge (เรื่องที่ 2) = REAL_BUG ×2 (verified):**
  - **(ก) FIXED 2026-06-23 `4e88e41d`** — customer `/service-import/[fNo]` คิด ยอดเก็บจริง บน single-row batch → split shipment โชว์ ฿100 เหมาๆ ทุกบรรทัด (6×). แก้: fetch siblings → batch เดียว = ฿100 ครั้งเดียว (mirror ภูม's admin fix).
  - **(ข) ยังไม่แก้ — line-by-line PAY** (`forwarder-debit-total.ts` isPcsfFirst reset ต่อ batch): จ่ายทีละบรรทัด → แต่ละ solo-pay เติม ฿100 ใหม่ = เก็บ เหมาๆ ซ้ำ. **แก้จริง = per-shipment "เก็บรอบเดียว"** (ไม่ band-aid · = บรีฟล่างนี้).

### Owner advance-billing brief (2026-06-23) — "วางบิลล่วงหน้าตอน MOMO ยิงของ"
ตู้ถึง MOMO → ลงตู้เย็น → MOMO สแกนรับของเข้าระบบ เย็น-มืด (เรายังไม่ได้รับของ). อยากให้:
1. **MOMO ยิงของตอนลงตู้ = ยืนยัน "ของไม่หาย อยู่ที่ MOMO"** (กันเก็บตังมั่ว ถ้าของหาย/ไม่มาจากต้นทาง).
2. admin **วางบิล + เก็บเงิน ล่วงหน้าได้เลย** (ทั้ง **ค่าขนส่งไทย-จีน + ค่าขนส่งในไทย พร้อมกัน · ครั้งเดียว/ชิปเมนต์**) จากรายการที่ MOMO ยิงแล้ว.
3. **เช้า** โกดังไปรับของ → สแกนเข้าระบบเรา + ถ่ายรูป → **จ่ายงานคนขับไปส่งได้เลย** ไม่ต้องรอเก็บเงินใหม่.

**= the per-shipment "ยิงเปรี้ยงเดียว" redesign** ที่รวม: collect-once-per-shipment (แก้ FIX 2ข) + bill China-TH + in-TH together + trigger = MOMO-scan-confirmed (ไม่ใช่ของถึงไทย). build นี้แทนที่ per-line pay model. **NEXT BUILD (เดฟ · careful · money).**

### 🔧 CBM-default + manual basis toggle — precise spec (owner 2026-06-23: "ยึดตามคิวเป็น default · คนสลับ คิว↔กิโล ได้เอง")
**Engine fact (must not get wrong):** `lib/forwarder/live-rate.ts:249` `comparisonEnabled = customComparisonSwitch || userComparison`. Two existing modes — **(A)** comparison ON → KG เมื่อ kg/คิว > ค่าเทียบ ; **(B)** comparison OFF → `max(คิว×rate, กิโล×rate)` (ราคามากสุด). **⚠️ ทั้ง 2 โหมด ของหนักออกมาเป็นกิโลอยู่ดี — ไม่มีโหมด "CBM ล้วน" วันนี้.** So owner's model needs:
1. **โหมดใหม่ force-CBM** = default basis = CBM เสมอ (ข้าม ค่าเทียบ + ข้าม max) — `resolve-rate.ts` รับ input ใหม่ `forcedBasis?: 'cbm'|'kg'` (เมื่อ set → ใช้ basis นั้นตรงๆ, refPrice ตาม basis).
2. **default = `forcedBasis='cbm'`** เมื่อไม่มี override (owner: ยึดคิว).
3. **ปุ่มสลับ คิว↔กิโล** ใน forwarder pricing editor (per-line หรือ per-order) → persist (คอลัมน์ใหม่ tb_forwarder e.g. `fbasis` หรือ reuse · mig) → staff กดสลับเอง.
4. **lock ด้วย `lib/forwarder/resolve-rate.test.ts`** (มีอยู่ · เพิ่มเคส forcedBasis) ก่อน apply · money review · NOT browser-test money on prod.
**= งานแก้เครื่องคิดเงินทั้งระบบ (ทุกลูกค้า) → ทำตอน context สด · มี test · ไม่รีบ.**

### ✅ FINAL spec A (owner 2026-06-23 turn 2 · LOCKED) — "ไม่ติ๊ก = คิว · ติ๊ก = ค่าเทียบ 250(default)–350(max)"
โมเดลที่เจ้าของยืนยัน (interpretation B):
- **ไม่ติ๊ก ค่าเทียบ (DEFAULT) → คิดตามคิว (CBM) ล้วน** — ของหนักก็คิดคิว (ไม่เด้งกิโล).
- **ติ๊ก "ใช้ค่าเทียบ" → คิดกิโลสำหรับของหนัก** (kg/คิว > ค่าเทียบ → KG, ไม่งั้น CBM) · ค่าเทียบ field **default 250 · clamp [250, 350]**.
- **per-order toggle** (staff กดติ๊ก/ปรับเองได้) · ทำ UI ให้ทุกคนเข้าใจง่าย (label ไทยชัด + hint).

**Engine change points (อ่านจริงแล้ว · resolve-rate.ts + live-rate.ts):**
1. `live-rate.ts:249` `comparisonEnabled = customComparisonSwitch === true ? true : userComparison` → **ตัด `: userComparison` fallback** → default OFF (ติ๊กต่อ-order เท่านั้นที่เปิด). ⚠️ blast: ลูกค้าที่ `userComparison=true` วันนี้ (เช่น PR106) จะ default CBM going-forward.
2. `resolve-rate.ts:400-435` comparison-OFF path **`max(คิว,กิโล)` → force CBM ล้วน** (เลิก ราคามากสุด). ⚠️ blast: ลูกค้า OFF วันนี้ ของหนักจะคิด CBM (เก็บได้น้อยลง · = เจตนาเจ้าของ MOMO เก็บเป็นคิว).
3. `resolve-rate.ts:341-344` threshold = `clamp(comparisonValue || 250, 250, 350)` (เลิก hardcode 200/150 customComparison override · แทนด้วย 250-350).
4. **UI** forwarder pricing editor: `☐ ใช้ค่าเทียบ (คิดกิโลสำหรับของหนัก)` + ค่าเทียบ field 250-350 เมื่อติ๊ก · default ไม่ติ๊ก = "คิดตามคิว". persist (custom_comparison/_value มีอยู่ · mig 0187) — reuse, อาจไม่ต้อง mig ใหม่.
5. **lock `resolve-rate.test.ts`** (OFF=CBM · ติ๊ก+ค่าเทียบ=KG-for-dense · clamp).
> ⚠️ **ship engine+UI พร้อมกัน** — ถ้า flip engine default โดยไม่มี UI ติ๊ก = ของหนักคิด CBM หมดทันที ไม่มีทาง override = บริษัทเสียมาร์จิ้น. ต้องมาคู่กัน = 1 coherent change · test-first · money-review · NOT browser-test money on prod.
