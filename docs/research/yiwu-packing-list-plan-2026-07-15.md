# Yiwu (อี้อู) 2-upload flow — วิเคราะห์ + แผน build (grounded 2026-07-15)

โกดัง **อี้อู ไม่มี API** → ทำ manual **2 อัพ** ที่หน้าเดียวกับ packing-upload.
verify กับโค้ดจริงแล้ว + owner ภูม เคาะครบทุกข้อ (2026-07-15).

> ## 🏁 SAVE-POINT / RESUME (2026-07-15 · ภูม ย้ายไปทำต่อคอมบ้าน)
> **Branch = `Poom-pacred`** (push แล้ว · worktree branch `claude/adoring-chandrasekhar-0f8ad7` = tip เดียวกัน). resume คอมบ้าน: `git fetch && git pull origin Poom-pacred` + copy `.env.local` จาก main repo + connect browser.
>
> **✅ เสร็จ + push แล้ว = Phase 1 (ปลอดภัย · ไม่แตะเงิน · gate เขียว tsc0/eslint0/build0 · test 11/11 · MOMO 14 regression):**
> - `lib/admin/yiwu-packing-xlsx-parser.ts` — ตัวแกะไฟล์ packing อี้อู (sheet 收货 · หัวจีน · แตกต่อ 单号 · return `MomoPackingParse` shape เดิม)
> - `lib/admin/packing-xlsx-dispatch.ts` — `parsePackingXlsx()` auto-detect Yiwu vs MOMO
> - `lib/admin/yiwu-packing-xlsx-parser.test.ts` + fixture `__fixtures__/yiwu-packing-data.xlsx` (ไฟล์จริง GZS260625-5T · slim 81KB)
> - `momo-packing-xlsx-parser.ts` export `deriveTransportHint` (additive) + package.json test registration
>
> **❌ REVERTED (สำคัญ · money-safety):** เคยลอง wire dispatcher + LIKE `<base>-*` เข้า `momo-packing-reconcile.ts` เพื่อจับ split rows → **adversarial review (3 skeptics) เจอ money-unsafe** (LIKE ดึง `<base>-N` นอกไฟล์ → เปลี่ยน verdict/writeFid → MOMO คิดเงินผิด/ซ้ำ/ขาด + ชนข้ามลูกค้า). **`git checkout` reconcile กลับ pristine แล้ว — ห้าม re-add LIKE แบบเดิม.**
>
> **▶️ NEXT = Phase 3 (money core · ยังไม่เริ่ม):** create action สร้างออเดอร์**แตกกล่อง** `<单号>-N` จากใบส่งของ ที่ **ถึงโกดังจีน (fstatus='2')** — clone `createMissingMomoForwarderRow` + PR direct จาก column Customer ID + weights/dims จริงต่อกล่อง + est. price · GUARD1/GUARD2. **แล้วต่อ upload-2 = DEDICATED money-free reconcile** (match base+userid-guard → ผูกตู้ + advance 2→3 · ไม่เขียน basis ไม่ reprice · ดู §4). **money code → adversarial review ก่อนปิดเสมอ.**
>
> **🔴 owner input ค้าง 1:** รหัสโกดังอี้อู (คนละที่กับกวางโจว · ภูมยืนยัน) → `fwarehousechina` แยก + `fwarehousename` ใหม่ (≠'8'=MOMO) + label "อี้อู" (propose ตอน Phase 3).
>
> **💡 UI Phase 2a ✅ DONE (2026-07-16 · owner "ลุยเลย" → เลือก option ก):** เพิ่ม **toggle กวางโจว/อี้อู** (pill แบบหน้าตรวจตู้) เข้าหน้า `packing-upload` เดิม + **rename MOMO→กวางโจว** (breadcrumb/header/label/tooltip) + อี้อู = **preview-only** (dispatcher auto-detect · `previewMomoPacking` คืน `format` · client ซ่อนปุ่มนำเข้า/ติ๊กสร้าง + banner "โหมดพรีวิว" · ไม่บันทึกประวัติ MOMO). **money-safe:** `applyMomoPacking` guard ปฏิเสธไฟล์ Yiwu (server) + `hasWork` gate (client) · reconcile คง **pristine** (ไม่มี LIKE broadening) · กวางโจว(MOMO) flow เดิม byte-identical. gate eslint0/tsc0/route-smoke307. ⚠️ ยัง**ไม่ authed-click-test** (ไม่มี admin login + Chrome MCP read glitch) → ภูม กดจริง: pill toggle · MOMO ทำงานครบ · Yiwu โชว์ตารางแตกกล่อง+banner+ไม่มีปุ่มนำเข้า. **NEXT = Phase 3** (create action แตกกล่องจากใบส่งของ → upload-2 dedicated money-free reconcile · §3-4).
>
> **💡 (เดิม) UI ยังไม่ได้ทำ** — Phase 1 = backend ล้วน · option (ข) หน้าใบส่งของ+OCR = ยังไม่เริ่ม (Phase 3).

## 0. Flow (owner เคาะแล้ว · ทุกข้อ)
1. **อัพใบส่งของ (รูป) ก่อน** → OCR อ่าน**อัตโนมัติ แยกเป็นช่องให้ถูก** (เลขออเดอร์/PR/กล่อง/น้ำหนัก/ขนาด) → **พนักงานแก้เฉพาะช่องที่เพี้ยน** → กด "เอาเข้าระบบ" → สร้างออเดอร์ **แตกกล่อง** ที่ **"ถึงโกดังจีน"** + เก็บรูปไว้กับ shipment
2. **อัพ packing list (Excel) ตาม** → จับคู่เลขออเดอร์ → ผูกตู้ + advance → **"กำลังส่งมาไทย"**

## 1. ใบส่งสินค้า (ใบส่งของ · รูป) — ถอดจากภาพจริง SEA0625-8211YW
> **🔑 2 จุดที่เปลี่ยนแผน (ดีขึ้น):**
> - **ใบส่งของมี `CUSTOMER ID = PR172` ตรงๆ** (ไม่ใช่มาร์ค 唛头) → **ปัญหา "มาร์ค→ลูกค้า" หายไปเลย** · OCR อ่าน column Customer ID = ได้ PR ตรง
> - **ใบส่งของมีน้ำหนัก+ขนาด ราย "กล่อง" ครบ** → สร้างแถวแตกกล่อง**พร้อมน้ำหนัก/ขนาดจริง**ได้ทันที (ไม่ใช่น้ำหนัก=0)

- header: **เลขที่ตู้/Packing ID** (SEA0625-8211YW = batch อี้อู) · **CUSTOMER ID (PR)** · "1 จาก N"
- ตาราง: **Bill No**(单号→ftrackingchn) · **Customer ID**(PR) · Description(สินค้า) · **Pack**(กล่อง→famount) · **WEIGHT** · **LENGTH/WIDTH/HEIGHT** · **CBM** · AVG · TYPE(PH) · FROM(YW)
- **1 Bill No = หลายแถว = หลายกล่อง** (ตัวอย่าง X9002653 มี 4 แถว: 5กล่อง/45kg/1.2814 · 4กล่อง/36kg/0.77 · 19กล่อง/171kg/3.4327 · 1กล่อง/9kg/0.0748)
- footer: จำนวนชิ้นรวม · น้ำหนักรวม · CBMรวม
- ช่อง ชื่อ/ที่อยู่/เบอร์/ประเภทลูกค้า/การจัดส่ง/ขนส่ง = **ว่าง** (เติมภายหลัง)

## 2. packing list อี้อู (Excel · staff-made) — sheet 收货
- SheetJS อ่านได้ตรง (มี sharedStrings) · เลขตู้ R0/C2 = `GZS260625-5T` (GZS=เรือ · **ตู้จริงมาที่นี่**)
- หัวจีน: 单号 · 唛头 · 件数 · 总重量 · 长/宽/高 · 材积 · 品名/英文 · 日期/类别/备注
- 1 单号 หลายบรรทัด → aggregate ต่อ 单号 · skip footer/DISPIMG

## 3. UPLOAD 1 — ใบส่งของ OCR→auto-split→ตรวจ→สร้าง (money core)

### UI (mirror หน้า MOMO review)
route ใหม่ `.../api-forwarder-momo/yiwu-delivery-note/` — upload รูป + กริดแก้รายแถว (จาก review-client: state/แก้/commit/confirm/disable-after-submit). source = client state · commit เฉพาะกด "เอาเข้าระบบ" · รูปแนบ lightbox

### OCR (auto ให้มากสุด · staff แก้เฉพาะเพี้ยน — ตามที่ภูมสั่ง)
`recognizeImage` (`lib/ocr/recognize.ts`) คืน text/lines (ไม่มีพิกัด). แต่**ใบส่งของเป็นฟอร์มคงที่** (คอลัมน์ตำแหน่งเดิมทุกใบ) → เปิด engine **tsv/bbox** อ่านพิกัดคำ → **จัดกลุ่มตามคอลัมน์ (x-position) = auto แยกช่องได้** (Bill No/PR/Pack/Weight/L/W/H/CBM) → เติมกริดอัตโนมัติ → พนักงานแก้เฉพาะช่องเพี้ยน (=แบบ B).
- fallback: ถ้า OCR เละ → คีย์มือ (กริดเดิม) · staff review = gate กันเงินเพี้ยนเสมอ
- ⚠️ traineddata โหลด CDN นอก (offline โกดัง OCR ล้ม) → Phase 5 self-host

### Create action — **แตกกล่อง** (money · reuse box-split)
`actions/admin/yiwu-delivery-note.ts` — clone `createMissingMomoForwarderRow` (`momo-add-missing.ts` · GUARD ครบ) + **สร้างเป็นหลายแถว `<单号>-N`** (X9002653-1/-2/-3/-4) **ตามจำนวนแถวในใบส่งของ** — reuse โมเดล box-split เดิม (owner: ขนาดกล่องต่าง → ราคาต่อกล่องต่าง (max น้ำหนัก vs ปริมาตร) → ต้องแยกแถวให้ถูก).

| field | ค่า (ต่อกล่อง) |
|---|---|
| `fstatus` | **`"2"` ถึงโกดังจีน** (`forwarder-status.ts:52`) |
| `fdatestatus2` | วันจากใบส่งของ |
| `ftrackingchn` | **`<单号>-N`** (X9002653-1 …) |
| `userid` | **PR จาก column Customer ID** (ตรงๆ · validate tb_users) |
| `famount` | Pack (กล่อง) แถวนั้น |
| `fweight` · `fwidth/flength/fheight` · `fvolume` | **จริงจากใบส่งของ** (staff-confirmed) |
| address ×11 · `fshipby` · `fcabinetnumber` | ว่าง (เติมภายหลัง) |
| `fwarehousechina` · `fwarehousename` | 🔴 Yiwu code (≠'8'=MOMO) — **propose ค่าใหม่ + label "อี้อู"** |
| ราคา (frefrate/price) | est. ผ่าน `computeAndFillForwarderImportRate` (บนน้ำหนัก staff-confirmed · เป็น**ประมาณการ** · บิลจริงเกิดที่ billing-run) |

**image storage:** เก็บรูปใบส่งของกับ shipment (`tb_forwarder.fimages` jsonb · mig 0176) → ดึงโชว์ตั้งแต่ถึงโกดังจีน (owner #5)
**money-safe:** GUARD1 dedup `<单号>-N` fail-closed · GUARD2 validate PR · ไม่มี wallet/credit/commission/bill · mig 0235 trigger no-op · box-split Σ preserved · logAdminAction · bulk serial

## 4. UPLOAD 2 — parser อี้อู + dispatcher + reuse reconcile

### parser `lib/admin/yiwu-packing-xlsx-parser.ts` (pure)
SheetJS → sheet `收货` → map หัวจีนตามชื่อ → **return `MomoPackingParse` เดิม** · reuse `aggregatePackingRowsByBase`/`deriveTransportHint` · aggregate ต่อ 单号 · skip footer/DISPIMG · container GZS→'2'

### dispatcher `parsePackingXlsx(buf)` ✅
detect sheet `收货`/หัว `单号`+`总重量` → Yiwu · ไม่งั้น MOMO.

### 🔴 upload-2 = **DEDICATED money-free path** (NOT reuse reconcile ตรงๆ)
> **บทเรียน (adversarial review 2026-07-15 · จับได้ก่อน ship):** เอา Yiwu ยัดเข้า `momo-packing-reconcile` แล้วเพิ่ม LIKE `<base>-*` เพื่อจับ split rows = **money-unsafe** — LIKE ดึง `<base>-N` ที่**ไม่อยู่ในไฟล์**เข้ามา → เปลี่ยน sibling set → เปลี่ยน verdict/writeFid → MOMO เขียนน้ำหนักผิด row/คิดซ้ำ/under-bill + ชนข้ามลูกค้า (baseTrackingOf ตัด `-N` มั่ว). **REVERTED · reconcile กลับ pristine.**

Yiwu upload-2 ต้องเป็นฟังก์ชันแยก (สร้างพร้อม upload-1 · test end-to-end ได้):
- **money-free ล้วน** — ไม่เขียน basis (fweight/fvolume) · ไม่ reprice (น้ำหนัก+ราคามาจาก upload-1 แล้ว) → ตัดช่อง mis-price ทั้งหมด
- match base 单号 → `<base>` OR `<base>-N` · **guard userid-consistency** (split siblings จาก upload-1 = PR เดียว · ถ้า LIKE ดึง row คนละ PR = ชน → skip/flag) → กันชนข้ามลูกค้า
- ทำแค่: ผูกเลขตู้ (empty-guard) + advance 1/2→"3" (money-neutral · guarded)

## 5. ✅ owner เคาะแล้ว / 🔴 เหลือ input เดียว
1. ✅ **อี้อู** — 🔴 เหลือแค่: propose `fwarehousename` code ใหม่ + `fwarehousechina` (อี้อู=โกดังจีนคนละที่กับกวางโจวใช่มั้ย) → ผมตั้ง default + label "อี้อู" ให้ ภูม ยืนยัน
2. ✅ **แตกกล่อง** `<单号>-N` ตามแถวใบส่งของ (ขนาดต่าง→ราคาต่าง)
3. ✅ **auto ทุกอย่าง** (OCR แยกช่อง) · staff แก้เฉพาะเพี้ยน
4. ✅ **มาร์ค→PR = ไม่ต้อง** — ใบส่งของมี Customer ID (PR) ตรงๆ
5. ✅ อัพใบส่งของก่อนเสมอ
6. ✅ เก็บรูปกับ shipment · โชว์ตั้งแต่ถึงโกดังจีน
7. ✅ K=X · เลขตู้อยู่ packing เท่านั้น
8. 🔴 residual money: dup create (ftrackingchn ไม่มี UNIQUE) → v1 กัน serial+button-disable+GUARD1 · Phase 5 UNIQUE (dup-precheck prod ก่อน)

## 6. ลำดับ build
1. ✅ **parser + dispatcher** (pure · no money) — test ไฟล์จริง 11/11 · MOMO regression pass · tsc/eslint 0
2. ❌ ~~wire dispatcher + LIKE เข้า reconcile~~ — **REVERTED** (money-unsafe · ดู §4) · reconcile pristine
3. **create action แตกกล่อง** (money core · Phase 3) — split `<单号>-N` + PR จากใบส่งของ + weights จริง + GUARD1/2 + price est.
4. **upload-2 dedicated money-free reconcile** (สร้างพร้อม #3 · test E2E) — match base+userid-guard → ผูกตู้ + advance status
5. **review UI + OCR column-extract + image storage** — E2E: รูป→auto-split→แก้→commit→ถึงโกดังจีน→packing→กำลังมาไทย
6. **hardening**: Yiwu warehouse label · UNIQUE ftrackingchn (dup-precheck prod) · self-host traineddata

*ทุก phase: gate จริง (tsc/eslint/test + `pnpm build`) + browser-verify · money code → adversarial review*

## 7. Money-safety
- OCR client read-only · staff review = gate
- create แตกกล่อง = น้ำหนัก/ขนาดจริง (staff-confirmed) · ราคา = ประมาณการ (บิลจริงที่ billing-run) · Σ preserved · GUARD1/2
- upload-2 = reuse reconcile guard เดิม
- residual: TOCTOU dup create → serial+disable+GUARD1 → Phase 5 UNIQUE
