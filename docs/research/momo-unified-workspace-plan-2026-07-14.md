# 🗂 แผนงาน: รื้อหน้า MOMO → "MOMO ตรวจตู้" หน้าเดียว (container-centric) — 2026-07-14 (ภูม)

> **สั่งโดย:** พี่ป๊อป (ผ่านภูม) — "เวลา sync จาก MOMO หรืออัพ packing list มันงง กระจายหลายหน้า เละเทะ อยากได้แบบไอแต้ม (ALI Logistics) ให้ทั้ง API และ packing list อยู่หน้าเดียว เทียบกันได้เลยว่าถูกไหม รูปแบบเหมือนหน้ารายงานตู้"
> **สถานะ:** แผน (ยังไม่ลงโค้ด · รอ ภูม/พี่ป๊อป เคาะ open questions ก่อน)
> **Reference ไอแต้ม:** `D:\Tam web alilogistics\` (HTML dump + screenshot) · หน้า `alilogisticshub.com/backoffice/table-container-lcl/{in-transit, detail/<cabinet>}`

---

## 1. โจทย์ (พูดสั้นๆ)

ทุกวันนี้ข้อมูล MOMO เข้าระบบ 2 ทาง — **API sync** (ดึงเข้า staging → review → commit เข้า `tb_forwarder`) กับ **อัพไฟล์ packing list** (XLSX) — แต่ 2 ทางนี้อยู่คนละหน้า คนละ data model **ไม่มีหน้าไหนยึด "ตู้" เป็นหลัก** เลย → พนักงาน**เทียบไม่ได้ว่า API กับ packing list ตรงกันไหม** ก่อน commit → เกิดปัญหา **แทร็กหาย / แทร็กซ้ำ / น้ำหนัก-ขนาดหาย**

**เป้าหมาย:** ทำ **หน้าเดียว ยึดตู้เป็นหลัก** (เหมือนหน้ารายงานตู้ `/admin/report-cnt` ที่พี่ป๊อปชอบ) — เปิดตู้เข้าไปเห็น "API ว่าไง / packing list ว่าไง" เทียบกันต่อแทร็ก **เจอที่ไม่ตรงทันที** แล้ว commit ได้จากหน้านั้นเลย

---

## 2. สภาพปัจจุบัน — 12 หน้า MOMO กระจัดกระจาย

(map จาก deep-audit 2026-07-14 · `app/[locale]/(admin)/admin/api-forwarder-momo/**`)

| หน้า | ทำอะไร | เขียนตารางไหน |
|---|---|---|
| `/api-forwarder-momo` (hub) | dashboard + การ์ด nav 10 อัน | อ่าน momo_sync_logs / momo_import_tracks |
| `/sync` | ดึง API ตามช่วงวัน → เข้า staging | `momo_import_tracks` (+ container_closed / sack) |
| `/review` | review grid → กด "สร้าง" ทีละแถว/ทั้งหมด | INSERT `tb_forwarder` |
| `/packing-upload` | อัพ XLSX → จับคู่ tracking → apply น้ำหนัก/CBM/กล่อง | UPDATE `tb_forwarder` (ข้าม staging) |
| `/warehouse-reconcile` | วางชีตแต้ม → เทียบ → apply | `tb_forwarder` + `taem_container_etd_eta` |
| `/drift` | คิว drift (อ่านอย่างเดียว) แทร็กหาย ~฿294k | อ่าน `taem_packing_line` ↔ tb_forwarder |
| `/missing` | พัสดุที่ขาด → คีย์รหัส → สร้างแถว | INSERT `tb_forwarder` |
| `/live` | กระดาน MOMO Live (scrape เว็บ MOMO) | — |
| `/discovery` | diff Live กับ tb_forwarder → commit | INSERT `tb_forwarder` |
| `/invoice-cost` | วาง invoice supplier → ลงต้นทุน | UPDATE `tb_forwarder.fcosttotalprice` |
| `/history` | ประวัติคิว CBM ต่อลูกค้า | อ่าน momo_import_tracks |
| `/manual` | ฟอร์มคีย์ forwarder มือ | INSERT `tb_forwarder` |
| `/admin/momo-lcl` (แยก top-level) | ติดตามกระสอบ LCL | — |

**เดินงาน happy path = ≥4 หน้า** (`/sync`→`/review`→ดูที่ hub/`/history`→`/packing-upload`) · **แก้ปัญหา +3 หน้า** (`/drift`→`/warehouse-reconcile`/`/missing`/`/discovery`) → พนักงานแตะ **6–8 หน้า** ต่อ 1 รอบตู้ · sidebar โผล่แค่ 3 อัน (`sidebar-menu.ts:518-524`) ที่เหลือเข้าจากการ์ด hub เท่านั้น

**ต้นตอที่มันงง (concrete):**
1. **ไม่มี view ยึดตู้เลย** — แต่ละหน้า key คนละอย่าง (`/sync`+`/review` key ที่ `momo_tracking_no` · packing/reconcile key ที่ base-tracking→tb_forwarder · `/drift` key ที่ taem_packing_line) → ไม่มีที่ไหนจับกลุ่มด้วย `container_batch_no`
2. **ทาง API กับทาง packing-list แยกหน้า แยก data model** — เห็นพร้อมกันไม่ได้ว่า "API มีแทร็กพวกนี้ / packing list มีพวกนั้น" สำหรับตู้เดียวกัน
3. **review/commit หลุดจากการเช็ค packing list** — `/review` commit จาก staging (API) ก่อน แล้วค่อยเอา packing list (ความจริงเรื่องน้ำหนัก/CBM) ไป apply ทีหลังคนละหน้า → **commit แถวเข้าบิลก่อนที่จะยืนยันน้ำหนัก** = ต้นตอ "น้ำหนักหาย" ที่ hub มาเตือนทีหลังว่า drift

---

## 3. Reference ที่ยึด

### 3.1 ไอแต้ม ALI Logistics (สิ่งที่พี่ป๊อปอยากได้ · จาก screenshot 1–5)

**หน้า LIST** (`table-container-lcl/in-transit` · = หน้ารายงานตู้ของเขา):
- **Tabs ตามสถานะ:** รายการทั้งหมด · กำลังขึ้นตู้ · **กำลังเดินทาง (17)** · กำลังลงตู้ที่ไทย · ลงตู้ใน 7 วันข้างหน้า · **ลงตู้เสร็จแล้ว (305)**
- **ค้นหา:** ช่วงวัน (วันปิดตู้/封柜日期) · รูปแบบขนส่งจีน→ไทย · โกดังเมือง · keyword
- **คอลัมน์ต่อตู้:** ☑/👁/✏ · โกดังเมือง (กวางโจว/อี้อู badge) · **ชื่อคอนเทนเนอร์** (GZS260703-1) · หมายเลขตู้ (BMOU…) · ขนส่งทาง (SEA/EK) · สถานะตู้ · วันปิดตู้ · คาดถึงไทย · อาลีคาดถึง/ถึงจริง · **กล่อง · ปริมาตร · น้ำหนัก** (ทั้งตู้) · **กล่องอาลี · ปริมาตรอาลี(CBM) · น้ำหนักอาลี(กก.)** (เฉพาะส่วนของอาลี) · ใบแพ็คกิ้งลิสต์ · หมายเหตุ · ตัวเลือก
- **แถวรวมท้ายหน้า** (Σ กล่อง/ปริมาตร/น้ำหนัก ทั้งหน้า)
- 💡 **จุดสำคัญ:** โชว์ทั้ง **ยอดทั้งตู้** และ **ยอดเฉพาะแบรนด์ตัวเอง (อาลี)** เพราะ 1 ตู้ = หลายแบรนด์รวมกัน

**หน้า DETAIL** (`detail/<cabinet>` · กดเลขตู้เข้าไป):
- **การ์ดหัว:** เลขตู้ · หมายเลขตู้ · badge ขนส่ง · โกดัง · น้ำหนัก X/28,000 kg · ปริมาตร X/90 CBM · วันเดินทาง · ปุ่มโหลด packing list · progress สถานะปัจจุบัน · สร้าง/แก้โดยใคร
- **การเดินทางของตู้** (ladder 4 สเต็ป): ① กำลังขึ้นตู้ → ② กำลังเดินทาง → ③ กำลังลงตู้ที่ไทย → ④ ลงตู้เสร็จแล้ว
- **การ์ดวันที่:** วันปิดตู้ · คาดถึงไทย · อาลีคาดถึง · ถึงจริง
- **ข้อมูลสรุปในตู้** (ตารางแยกตามบริษัท): ยอดรวมทั้งหมด (896 กล่อง / 17,241 kg / 87.98 CBM) แล้วแตกเป็น ALI · SP · PCS · MOMO · PACRED · BUDDY · JMF (กล่อง/น้ำหนัก/ปริมาตร ต่อแบรนด์)
- **เอกสารการทำงาน:** ปุ่มไปใบ packing list ส่งลูกค้า · วิเคราะห์ข้อมูล PCS JMF
- **โน๊ต · ค่าใช้จ่าย · ข้อมูลคนขับ**
- **ประวัติแก้ packing list** (Date/Admin/Action)
- **Tabs ล่าง:** ตารางรายการทั้งหมด · รายการแบบกราฟฟิก · **รายการแบบตาราง** · **รูปภาพสินค้าในตู้** · **สถานะการเก็บเงินลูกค้า**
- **ตารางรายละเอียดสินค้า** (ต่อพัสดุ = หัวใจการตรวจ): SM Date · SM Number · Branch · Product · Dum · Type · Code · **Tracking** · W · L · H · Total Parcel · **Wt · Vol · Total Wt · Total Vol** · Rem · **CG** · Note · Service Fee · Status · Return → เห็นกล่องแตก (`KK…-2/-3`) ต่อแทร็ก

### 3.2 report-cnt ของเรา (ยืมโครงได้เลย · map จาก audit)

- **List:** `app/[locale]/(admin)/admin/report-cnt/page.tsx` + `cnt-list-table.tsx` — 1 แถว/ตู้ (group `fcabinetnumber`) · tabs รอเข้าไทย/เข้าไทยแล้ว (`report-cnt-bucket.ts` MIN(fstatus)) · tabs ขนส่ง (รถ/เรือ/อากาศ) · ค้นหา cabinet/warehouse/date · **แถวรวมท้ายหน้า** · คอลัมน์ box/vol/weight (+เงิน gated)
- **Aggregation:** RPC `get_container_summary` (GROUP BY fcabinetnumber · SUM) + fallback JS `groupByContainer`
- **Completeness (ครบ/ขาด):** `container-completeness.ts` — expected(Σfamount) vs scanned(Σfi2amount) · **`filterCountableForwarderRows` ตัดหัวบิล MOMO ออก** (กันนับกล่องซ้ำ)
- **Detail:** `report-cnt/[fNo]/**` — journey panel (`buildContainerJourney`) · ตารางต่อพัสดุ · ครบ/ขาด badge · box-breakdown expandable · ETD/ETA (แต้ม primary จุดเขียว / MOMO fallback จุดเทา)
- **MOMO container resolve:** `momo-container-resolve.ts` — จับ placeholder `PR/MO/PCS\d{8}-(SEA|EK|AIR)\d{2}` (= routing batch ไม่ใช่ตู้จริง) · ตู้จริงจาก `container_batch_no` · ETD/ETA จาก `taem_container_etd_eta`

> **สรุป:** report-cnt ของเรา = ไอแต้ม's table-container-lcl อยู่แล้ว (list→detail ยึดตู้) แค่มันอ่าน **หลัง commit** (tb_forwarder) — สิ่งที่ขาดคือ view **ก่อน commit** (staging + packing list) แบบยึดตู้ที่เทียบกันได้

---

## 4. สถาปัตยกรรมที่เสนอ

**หลักคิด:** สร้าง **"MOMO ตรวจตู้" (MOMO container workspace)** = หน้าใหม่ ยึดตู้ ใช้ **ภาษา/โครงเดียวกับ report-cnt** (ยืม component + style) แต่ dataต่างกัน — รวม **3 แหล่งต่อ 1 ตู้**:

```
ต่อ 1 ตู้ (container_batch_no / cabinet):
  (A) API staging   = momo_import_tracks         → "MOMO ว่าไง"  (แทร็ก/กล่อง/น้ำหนัก/CBM)
  (B) Packing list  = taem_packing_line / XLSX   → "แต้ม/packing ว่าไง"
  (C) Committed     = tb_forwarder               → "ในระบบมีแล้ว" (แถวที่ออกบิลได้)
        ↓
   Reconcile ต่อแทร็ก → flag: ✅ ตรง · ⚠️ ซ้ำ · 💗 หาย(อยู่แหล่งเดียว) · ⚖️ น้ำหนัก/CBM ไม่ตรง
```

**หน้าตา 2 ระดับ (เหมือนไอแต้ม/report-cnt):**
1. **LIST ตู้** — 1 แถว/ตู้ · tabs สถานะ · ค้นหา/กรอง · คอลัมน์ box/vol/weight (ทั้งตู้ + ส่วนเรา) · **คอลัมน์ใหม่ "สถานะตรวจ"** (✅ครบ / 💗ขาด N / ⚠️ซ้ำ M / ⚖️น้ำหนักหาย K)
2. **DETAIL ตู้** — การ์ดหัว + journey ladder + สรุปตามลูกค้า/บริษัท + **ตารางเทียบต่อแทร็ก (A vs B vs C)** ไฮไลต์ที่ไม่ตรง + **ปุ่ม action ในตัว** (commit / apply packing / สร้างที่ขาด) + tab รูปสินค้า + tab สถานะเก็บเงิน

**หลักเหล็ก — WRAP ไม่ REWRITE:** action commit ยังเรียก **`commitMomoRowCore` ตัวเดิม** (พี่เดฟเพิ่ง hardening Fix F dedup เมื่อวาน — ห้ามเขียนใหม่) · packing apply ยังเรียก `momo-packing-reconcile.ts` เดิม · หน้าใหม่แค่ห่อ UI ยึดตู้ครอบของเดิม

### 4.1 🆕 ประวัติ packing list + พรีวิว (ภูม-directive 2026-07-14)

ปัญหาปัจจุบัน: อัพ packing list ได้ แต่ **ไม่เก็บไฟล์/ประวัติ** → ย้อนดูไม่ได้ว่าเคยอัพอะไรไป และเทียบไม่ได้เวลา **แทร็กมีใน packing list แต่ไม่มีใน API MOMO**

**ที่จะทำ:**
- **ตารางใหม่ `momo_packing_upload`** (migration ใหม่ · next-free = `0236`): เก็บ `id`, `file_path` (ไฟล์ต้นฉบับใน Supabase storage), `uploaded_by`, `uploaded_at`, `container_batch_no`/cabinet ที่ครอบ, `row_count`, `parsed_rows jsonb` (snapshot ที่ parse ได้ = พรีวิวได้โดยไม่ต้อง parse ซ้ำ), `date_range`, `status`
- **เก็บไฟล์ต้นฉบับ** ลง storage ตอนอัพ (ตอนนี้ parse แล้วทิ้ง) → **กดพรีวิว/ดาวน์โหลดย้อนได้**
- **ประวัติต่อตู้** โชว์บน detail: ไฟล์ไหนอัพเมื่อไหร่ ใครอัพ กี่แถว + ปุ่มพรีวิว
- **Reverse-check** (สิ่งที่ภูมิเน้น): ต่อตู้ → แทร็กที่ **อยู่ใน packing list แต่ไม่มีใน momo_import_tracks (API)** → ติดธง "💗 มีใน packing list · MOMO ไม่มี" (คู่กับ drift เดิมที่เช็คทางกลับ)
- ⚠️ additive ล้วน · ไม่แตะ logic apply เดิม (`momo-packing-reconcile.ts`) — แค่ **เพิ่มการเก็บไฟล์+ประวัติ** ก่อน/หลัง apply

---

## 5. แผนเป็นเฟส (ไม่ big-bang · กันงานหาย)

| เฟส | ทำอะไร | ผลลัพธ์ |
|---|---|---|
| **0. Data layer + ประวัติ packing** | (a) `lib/admin/momo-container-view.ts` — resolver: cabinet → รวม (A)staging+(B)packing+(C)tb_forwarder → per-แทร็ก reconcile + flag (ยืม `momo-container-resolve`/`container-completeness`/`get_container_summary`) · (b) **migration `0236` `momo_packing_upload`** + เก็บไฟล์ลง storage + reverse-check "packing มี · API ไม่มี" (§4.1) | มี view ยึดตู้ + ประวัติ packing เก็บ/พรีวิวได้ + test (ยังไม่มี UI หลัก) · **ปลอดภัย/additive · ไม่ชนพี่เดฟ** |
| **1. LIST** | หน้า `/admin/momo-containers` (ชื่อชั่วคราว) — ยืมโครง `cnt-list-table` · tabs/ค้นหา · +คอลัมน์ "สถานะตรวจ" (✅ครบ/💗ขาด/⚠️ซ้ำ/⚖️น้ำหนักหาย) | เห็นทุกตู้ MOMO + สถานะตรวจในหน้าเดียว |
| **2. DETAIL** | `/admin/momo-containers/[cabinet]` — การ์ดหัว + ladder + **ตารางเทียบ A/B/C** ไฮไลต์ไม่ตรง + สรุปต่อ **ลูกค้า PR** + **ประวัติ packing + พรีวิว** + ปุ่ม commit/apply ในตัว (wrap ของเดิม) + tab รูป + tab เก็บเงิน | เปิดตู้เดียวจบ — เทียบ + แก้ + commit |
| **3. รวมหน้าเก่า + nav** | ปุ่ม sync/อัพ packing → มาไว้บน workspace · fold `/review` `/packing-upload` `/warehouse-reconcile` `/drift` `/missing` `/discovery` → deep-link เข้า detail ช่วงเปลี่ยนผ่าน · sidebar เหลือ entry เดียวชัดๆ | 12 หน้า → 1 workspace · **พนักงานคนไหนก็ทำได้** |
| **4. Polish + verify** | ไฮไลต์ discrepancy · alert แทร็กซ้ำ/หาย · mobile · gate tsc/lint · qa-flow ยิงจริง | ส่งมอบ |

> **หมายเหตุ next-free migration:** ledger บอก `0236` ว่าง — ต้อง `ls supabase/migrations | tail` ยืนยันก่อนสร้างจริง (เคยชนกันมาแล้ว)

**retire หน้าเก่าเฉพาะเมื่อ workspace ครอบ function นั้น + verify ผ่านแล้ว** (ห้ามลบก่อน)

---

## 6. หน้าเก่า 12 หน้า → จะทำยังไง

| หน้าเดิม | แผน |
|---|---|
| `/sync` | → **ปุ่ม sync** บน workspace (เก็บ action เดิม) |
| `/review` | → **fold** เข้า detail (ปุ่ม commit ต่อแทร็ก) |
| `/packing-upload` | → **fold** เข้า detail (อัพ+apply ในตู้) |
| `/warehouse-reconcile` | → **fold** เข้า detail (เทียบแต้มในตู้) |
| `/drift` | → กลายเป็น **คอลัมน์/tab "สถานะตรวจ"** บน list |
| `/missing` | → **fold** (ปุ่มสร้างที่ขาดในตู้) |
| `/discovery` | → **fold** หรือ tab ในตู้ (❓ scrape live คนละแหล่ง — เคาะ) |
| `/live` | → **คงไว้** (กระดาน scrape · แหล่งต่าง) หรือ embed |
| `/invoice-cost` | → **คงไว้** (งานต้นทุน คนละ concern) หรือ tab |
| `/history` | → **fold** เป็น filter/รายงานใน list |
| `/manual` | → **คงไว้** (คีย์มือ · fallback) |
| `/admin/momo-lcl` | → เคาะ (กระสอบ LCL อยู่ในโมเดลนี้ไหม) |

---

## 7. ความเสี่ยง + กันพลาด

- 🔴 **MONEY-adjacent:** momo_import_tracks → tb_forwarder → บิล · **ห้ามแตะ logic commit/ราคา** — หน้าใหม่ห่อ UI ครอบ action เดิมเท่านั้น (§0f "ห้ามทำงานบัค งานหาย")
- 🔴 **ชนงานพี่เดฟ (team-collision):** พี่เดฟเพิ่งแก้ `commit-momo-row-core.ts` (Fix F) + `sync.ts` + `propagate.ts` เมื่อวาน → **reuse ตัวเขา ห้าม rewrite** · แจ้งพี่เดฟก่อนเริ่ม (ตกลง boundary: เขา = ท่อ ingest/commit, เรา = UI ยึดตู้ครอบ)
- 🟠 **§0e dead-write:** ระวัง read/write ให้ตรงตาราง (staging vs tb_forwarder vs taem_packing_line) — probe DB ยืนยันก่อนเชื่อ query
- 🟠 **ไม่ big-bang:** build ข้างๆ ของเดิมยังใช้ได้ → retire เมื่อ verify ผ่าน
- 🟠 **หัวบิล MOMO:** ต้องใช้ `filterCountableForwarderRows` กันนับกล่องซ้ำ (มีของเดิม)

---

## 8. ✅ ข้อสรุปที่เคาะแล้ว (ภูม 2026-07-14)

1. **แยกจาก report-cnt แน่นอน** — หน้านี้ = ฝั่ง **"sync ข้อมูลเข้าระบบ" (ingest)** · report-cnt = ฝั่ง **"รายงานผลออกมา" (output)** คนละเรื่องกัน · ใช้ component/style ร่วมได้ แต่เป็นคนละหน้า
2. **สรุปในตู้แตกตาม "ลูกค้า PR" ล้วนๆ** — ตู้เราเป็นของ PR เราเอง ไม่แชร์แบรนด์อื่นแบบไอแต้ม (ตัด ALI/PCS/JMF breakdown ทิ้ง → ใช้ per-PR-customer แทน)
3. **packing list ชนะ** เมื่อ API vs packing list ต่างกันเรื่องน้ำหนัก/CBM (packing = ตัวเลขชั่ง/วัดจริง)
4. 🆕 **เก็บประวัติไฟล์ packing list ที่อัพ + กดพรีวิวย้อนดูได้** (ดู §4.1) — เพราะบางแทร็ก **ไม่มีใน API (MOMO) แต่ดันมีใน packing list** → ต้องเช็คเทียบ 2 ทางได้
5. 🎯 **ต้อง "จบในหน้าเดียว" + คนอื่นทำแทนภูมได้** — งาน sync/verify/commit ต้อง self-contained + UX ง่ายพอที่พนักงานคนไหนก็ทำได้ (ไม่ผูกกับภูม) = design principle หลัก

### ยังต้องเคาะเพิ่ม (ไม่บล็อกเฟส 0)
- **`/live` `/discovery` (scrape เว็บ MOMO):** fold เข้า workspace หรือคงแยก? (แหล่งข้อมูลคนละทาง — ค่อยตัดสินเฟส 3)

---

## 9. ประเมินขนาดงาน (คร่าวๆ)

งานใหญ่ · ~4 เฟส · แต่ละเฟส gate เขียว + verify ก่อนไปต่อ · ของที่ยืมได้เยอะ (report-cnt layout + commit core + resolvers เดิม) → ไม่ได้เขียนใหม่หมด ส่วนใหญ่ = **ห่อ UI ยึดตู้ + data layer รวม 3 แหล่ง + เทียบ/ไฮไลต์**. เฟส 0+1 (data layer + list) เห็นผลเร็วสุด ควรทำก่อน
