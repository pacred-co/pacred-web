# 📦 Cargo Workflow Handbook — คู่มือพนักงาน CS ฝากนำเข้า

> **เป้าหมาย:** พนักงาน CS / Ops คนใหม่อ่านจบฉบับนี้ → ลงมือทำได้ทันที โดยไม่ต้องไปไล่ legacy PHP เอง.
>
> **ที่มา:** ภูม flag (2026-05-27 บ่าย live walkthrough): *"เพราะภูมิก็ไม่ค่อยรู้ซะด้วยว่าโฟลการทำงานพนักงาน"*. handbook นี้ปิดช่องว่างนั้น.
>
> **อ่านคู่กับ:**
> - [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) — decoded ops model (GZE/GZS · A-M-X-O-Z · Form E · D/O)
> - [`docs/learnings/pacred-order-taxonomy.md`](../learnings/pacred-order-taxonomy.md) — ฝากสั่งซื้อ ↔ ฝากนำเข้า ↔ ฝากโอน relationship

---

## 0. หลักการอย่างย่อ — ข้อมูลอยู่ที่ไหน

ระบบฝากนำเข้าหมุนรอบ table เดียว: **`tb_forwarder`** — 1 row = 1 ใบฝากนำเข้า (1 พัสดุ / 1 ชิ้น / 1 รายการ). ทุกอย่างที่ admin ทำ (ผูกตู้ · เปลี่ยนสถานะ · ใส่ tracking · พิมพ์บิล) ในที่สุดก็ลงเขียนตรงนี้.

**Columns ที่ load-bearing:**

| Column | ความหมาย | Update ตอนไหน |
|---|---|---|
| `fstatus` | สถานะ 1..7 / 99 (ดู §1) | ทุกครั้งที่ flow ก้าวหน้า |
| `fcabinetnumber` | เลขตู้ GZE / GZS | เมื่อโกดังจีนปิดตู้ + แจ้งกลับ (status 2→3) |
| `ftrackingchn` | tracking จีน (จากร้านจีน) | กรอกตอนสร้างหรือ shop spawn |
| `ftrackingth` | tracking ไทย (Kerry/Flash/J&T) | กรอกตอน status 6 (assign driver) หรือ 7 |
| `fdatestatusN` | timestamp ของแต่ละ status | auto-stamp พร้อม fstatus |
| `adminidupdate` | admin คนล่าสุดที่แก้ไข | auto-stamp ทุก update |
| `userid` | legacy customer id (`PR10000`) | คงที่ตั้งแต่สร้าง |
| `reforder` | hNo ของ ฝากสั่งซื้อต้นทาง (ถ้ามี) | คงที่ — บอกว่ามาจาก shop spawn |
| `ftotalprice` | ราคารวมที่ลูกค้าต้องจ่าย | กรอกตอน status 4→5 (forwarder-check) |

⚠️ **ห้ามแก้ผ่าน SQL ตรงๆ** — เพราะ audit log (`tb_log_admin`) จะไม่บันทึก. ใช้ Pacred admin UI เท่านั้น.

---

## 1. The 7-status lifecycle

```
[1] รอเข้าโกดังจีน → [2] ถึงโกดังจีน → [3] กำลังส่งมาไทย → [4] ถึงไทยแล้ว
                                                                  ↓
                                  [7] ส่งแล้ว ← [6] เตรียมส่ง ← [5] รอชำระเงิน
```

แต่ละ status มี date column ของตัวเอง (`fdatestatus2..7`) — auto-stamp พร้อมการเปลี่ยนสถานะ. status `1` ไม่มี date column (ใช้ `fdate` = วันที่สร้าง row).

### 1.1 ตารางสรุป 7 transition

| → | ใครทำ | ที่ไหน (URL + control) | Trigger event | DB columns ที่ write | Notify ลูกค้า | Enforcement gap (ปัจจุบัน) |
|---|---|---|---|---|---|---|
| **1 → 2** | warehouse จีน (พนง.จีน confirm) | `/admin/forwarders/[fNo]` → action panel → status `2` | พนง.จีนตอบ confirm รับของ + ชั่งน้ำหนัก/วัด CBM | `fstatus='2'`, `fdatestatus2=NOW()`, `adminidupdate`, (ถ้ามี) `fweight/fvolume/fwidth/flength/fheight` | LINE OA push (`forwarder.status_changed`) — ถ้า profile bridge resolve ได้ | ไม่บังคับใส่ขนาด/น้ำหนัก ก่อน flip (ภูมิ์ flag — เพิ่ม validator ในอนาคต) |
| **2 → 3** | warehouse จีน + admin TH | `/admin/forwarders` → bulk-tick rows + ปุ่ม "อัพเดตสถานะ" ใส่เลขตู้ (GZE/GZS) | จีนปิดตู้ + ออกตู้ส่งทางรถ/เรือ | `fstatus='3'`, `fdatestatus3=NOW()`, `fcabinetnumber='GZE-YYMMDD-N'`, (auto) `fdatecontainerclose` | LINE OA push | **🟠 ยังไม่ enforce** ว่าต้องผูกตู้ก่อน flip — ปัจจุบัน admin "ลืม" ใส่เลขตู้ได้ (UI hint แต่ไม่ block) |
| **3 → 4** | warehouse ไทย | `/admin/forwarders/[fNo]` → action panel → status `4` (หรือ bulk จากหน้า list) | ตู้ถึงไทย + เปิดตู้ + ตรวจของจริง | `fstatus='4'`, `fdatestatus4=NOW()`, (auto) `fdatetothai`, `adminidupdate` | LINE OA push | ต้องมี `fcabinetnumber` ก่อน (legacy เช็ค — port ยังไม่เช็ค strict) |
| **4 → 5** | accounting (audit ราคา) | `/admin/forwarder-check` → tick rows + "แจ้งชำระเงินลูกค้า" | accounting ตรวจราคา/ค่าขนส่ง/ต้นทุน เสร็จ + พร้อมเรียกเก็บลูกค้า | `fstatus='5'`, `fdatestatus5=NOW()`, `ftotalprice=<calculated>`, `adminidupdate`, **+ remove from `tb_check_forwarder`** | **SMS (real · ThaiBulkSMS)** "ออเดอร์ฯ พร้อมชำระเงิน" | ราคาต้อง > 0 (legacy) — ไม่ block แต่ค่าจะติด 0 ถ้าลืมกรอก |
| **5 → 6** | accounting (รับชำระ + assign) | wallet trigger: ลูกค้าจ่ายผ่าน `/wallet` หรือ admin หัก `/admin/wallet/pay-user` → ระบบ flip `fstatus='6'` อัตโนมัติ | เมื่อ wallet deduction สำเร็จ (พอจ่ายทั้งหมด) | `fstatus='6'`, `fdatestatus6=NOW()`, `paymethod='1'`, `paydeposit=<wallet tx id>` | LINE OA push + email confirm | partial-pay ไม่ flip (ต้องจ่ายเต็ม) |
| **6 → 7** | driver (พนักงานส่ง) | `/admin/driver-runs` → driver กด "รับงาน" → "ส่งงานเสร็จ" | driver scan barcode ที่หน้าลูกค้า OR กด complete ใน UI | `fstatus='7'`, `fdatestatus7=NOW()`, `ftrackingth=<TH code>`, `forwarder_driver.completed_at=NOW()` | LINE OA push "ของถึงแล้ว — กรุณายืนยันรับสินค้า" | ต้องมี driver assignment (forwarder_driver row) ก่อน flip |
| **99 (สถานะพิเศษ)** | super-admin | `/admin/forwarders/[fNo]` → action panel → status `99` | row ผิดปกติ (ลูกค้ายกเลิก · สินค้าหาย · refund) — ใช้ as escape hatch | `fstatus='99'`, `adminidupdate`, `fnote=<reason>` | ❌ ไม่ notify (manual ที่ admin คุยกับลูกค้าเอง) | super-admin เท่านั้น |

### → Test recipe ทั่ว lifecycle

ใช้ order #51973 (PR10000 · cabinet `GZE-2026-001`):

1. เปิด `/admin/forwarders/51973` — ตรวจ status เริ่มต้น (สมมุติ `1`)
2. ใน action panel ขวา-ล่าง — เลือก `2 · ถึงโกดังจีนแล้ว` → "💾 บันทึก" → confirm dialog แสดง diff → OK
3. ผลลัพธ์: timeline เปลี่ยน 1 → 2, `fdatestatus2` stamp, banner เขียว "✓ บันทึกสำเร็จ — #51973"
4. ทำซ้ำ → status `3` พร้อมใส่ `GZE-2026-001` ใน input "เลขตู้"
5. หลังจาก status `3` — กดปุ่ม "📦 ดูตู้คอนเทนเนอร์ →" → ระบบไป `/admin/report-cnt/GZE-2026-001`
6. ดำเนิน status `4` → ไป `/admin/forwarder-check` → row ของเราอยู่ที่นั่น
7. tick row + "แจ้งชำระเงินลูกค้า" → status flip เป็น `5` + SMS ถูกยิงไปเบอร์ลูกค้า

---

## 2. Downstream — flows ที่แยกย่อยออกไป

### 2.1 Cabinet payment (cnt-hs) — จ่ายค่าตู้ให้สายเรือ/สายรถ

**ทำที่:** `/admin/cnt-hs` (list) + `/admin/cnt-hs/[id]` (detail)
**ทำเมื่อไหร่:** หลังตู้ถึงไทย — admin ต้องโอนค่าตู้ให้ carrier (GZE = สายรถ · GZS = สายเรือ).
**ใครทำ:** accounting

**Flow:**

1. ที่ `/admin/report-cnt/[fCabinetNumber]` → กด "ทำรายการเบิกเงินค่าตู้" (Wave 17 wording)
2. สร้าง row ใน `tb_cnt` (cnt header) + `tb_cnt_item` (fan-out 1 row ต่อ cabinet)
3. `tb_cnt.cntstatus='1'` (รอตรวจ)
4. accounting ไปที่ `/admin/cnt-hs/[id]` → upload slip โอนเงิน → auto flip `cntstatus='2'` (จ่ายแล้ว)

**สถานะ `tb_cnt.cntstatus`:**
- `1` = รอตรวจ (slip ยังไม่ upload)
- `2` = อนุมัติ/จ่ายแล้ว
- `3` = ปฏิเสธ

**Cabinet column overflow** (Wave 23 P1 fix): list page cap visible chips 3 ตัว + "+N more" toggle (ไม่ดู modal).

### → Test recipe (cnt-hs)

1. เปิด `/admin/report-cnt/GZE-2026-001` → กด "ทำรายการเบิกเงินค่าตู้"
2. กรอก amount + ชื่อ bank/account/no → submit → row ใหม่ใน `/admin/cnt-hs`
3. กดเปิด row → upload slip (jpg/pdf · ≤ 10MB) → status auto-flip เป็น "จ่ายแล้ว"

---

### 2.2 Customer billing (forwarder-check) — เรียกเก็บเงินลูกค้า

**ทำที่:** `/admin/forwarder-check`
**ทำเมื่อไหร่:** หลัง status `4` (ถึงไทย + audit ราคาเสร็จ)
**ใครทำ:** accounting

**3 tabs:**
- `?q=` (default) — ทั้งหมด
- `?q=c` — จ่ายแบบเครดิต (`usercredit='1'`)
- `?q=n` — จ่ายแบบปกติ

**Flow:**
1. accounting tick rows + กด "แจ้งชำระเงินลูกค้า"
2. confirm modal → ระบบ flip `fstatus 4→5` + SMS ลูกค้า + remove จาก `tb_check_forwarder`
3. Money columns (ต้นทุน · กำไร · 1%) เห็นเฉพาะ role `super/ops/accounting`

⚠️ Bulk billing 100+ rows ใน 1 click ได้ แต่ระวัง SMS rate-limit (ThaiBulkSMS quota).

### → Test recipe (forwarder-check)

1. เปิด `/admin/forwarder-check?q=` → tick row #51973
2. กด "แจ้งชำระเงินลูกค้า" (สีแดงล่างจอ) → confirm → "ดำเนินการ"
3. SMS ส่งไปเบอร์ที่ลงทะเบียน + status flip `5` ที่ `/admin/forwarders/51973`

---

### 2.3 Combine bill — รวมบิลพิมพ์เดียว

**ทำที่:** `/admin/forwarders/combine-bill` (list) + `/admin/forwarders/combine-bill/add` (new) + `/admin/forwarders/combine-bill/print/[id]` (print A4)
**ทำเมื่อไหร่:** ลูกค้าคนเดียวมี forwarder rows หลายรายการ → อยากพิมพ์รวมเป็น 1 ใบ
**ใครทำ:** super-admin (role gate)

**Flow:**
1. `/admin/forwarders/combine-bill/add` → เลือกลูกค้า + tick rows ที่จะรวม
2. submit → สร้าง `tb_bill` (header) + `tb_bill_item` (fan-out)
3. กด "พิมพ์" → `/admin/forwarders/combine-bill/print/[id]` → A4 print ใบส่งสินค้า

**Filter URL:**
- `?historyTableAll=true` — ทั้งหมด (ไม่กรอง)
- `?date=YYYY-MM-DD - YYYY-MM-DD` — date range
- (default) — last 90 days

### → Test recipe (combine-bill)

1. `/admin/forwarders/combine-bill/add` → เลือก PR10000 → tick forwarder rows ที่ status ≥ 5 → submit
2. ระบบกลับไป `/admin/forwarders/combine-bill` → row ใหม่ on top
3. กดปุ่มเครื่องพิมพ์ → A4 view → Ctrl+P

---

### 2.4 Driver assignment — มอบหมาย driver ส่งของ

**ทำที่:** `/admin/driver-runs` (driver landing) + `/admin/forwarders/[fNo]` → `<DriverAssignForm>` panel
**ทำเมื่อไหร่:** status `6` (เตรียมส่ง) → assign driver → status `7` (ส่งแล้ว)
**ใครทำ:** admin assign · driver execute

**Driver statuses (`forwarder_driver.status`):**
- `1` = มอบหมายแล้ว — รอ driver รับงาน
- `2` = driver รับงานแล้ว — กำลังส่ง
- `3` = หมดเวลารับงาน
- `4` = ส่งงานเสร็จ → trigger `tb_forwarder.fstatus='7'`

**Driver landing flow:**
1. driver login → `/admin/driver-runs` → เห็น assignments ของตัวเอง (status 1/2) + completed-today (4)
2. กด "รับงาน" (status 1→2) → ระบบ stamp `accepted_at`
3. ออกไปส่งของ + scan barcode ที่หน้าลูกค้า (`/admin/barcode/driver`)
4. กลับมา → "ส่งงานเสร็จ" → status 2→4 + main forwarder fstatus 6→7

### → Test recipe (driver)

1. login เป็น driver → ไป `/admin/driver-runs` → ดู assignment ของ #51973
2. กด "รับงาน" → status badge เปลี่ยนเป็น "กำลังส่ง"
3. ไป `/admin/barcode/driver` → scan barcode `51973` → ระบบ flip ทั้ง 2 statuses

---

### 2.5 Wallet flow — กระเป๋าเงินลูกค้า

**ทำที่:** `/admin/wallet` (admin) + `/wallet` (customer)
**ทำเมื่อไหร่:** ลูกค้าจ่าย forwarder bill — wallet หักเงิน → flip status 5→6
**ใครทำ:** ลูกค้า self-serve + accounting backup

**Tables:**
- `tb_wallet` — 1 row ต่อ user · `walletTotal` = ยอด balance
- `tb_wallet_hs` — history (deposit/withdraw/pay/refund)

**Admin pages:**
- `/admin/wallet` — default `?view=balance` (per-user balance summary)
- `/admin/wallet?view=tx` — transactions list (deposit/withdraw/pay/refund)
- `/admin/wallet/add` — admin manual topup
- `/admin/wallet/pay-user` — admin หักเงิน user แทน (จ่ายแทน)

**Flow customer pay:**
1. ลูกค้าเปิด `/wallet` → top-up ผ่าน PromptPay QR / bank transfer
2. ลูกค้าเปิด forwarder ตัวเอง (`/service-import/[fNo]`) → "ชำระเงิน"
3. ระบบหัก `tb_wallet.walletTotal` + เขียน `tb_wallet_hs` + auto-flip forwarder `fstatus 5→6`
4. paymethod='1' (หักเงินในกระเป๋า), paydeposit=<tx id>

### → Test recipe (wallet)

1. `/admin/wallet?view=balance` → search PR10000 → ดู balance
2. `/admin/wallet/add` → top-up ฿1000 → balance update
3. login เป็น PR10000 → `/wallet` → balance ตรง
4. `/service-import/51973` → "ชำระเงิน" → status flip 5→6

---

## 3. Gotchas — บั๊กที่เจอวันนี้ + วิธีกัน

### 3.1 varchar(10) overflow — `value too long for type character varying(10)`

**Symptom:** server action return `{ok: false}` + UI ขึ้น generic error · staff งง.
**Root cause:** legacy `pcsc_main` declare `adminid*` columns เป็น `varchar(10)` — แต่ Pacred `resolveLegacyAdminId()` คืน strings ยาวกว่า (e.g. `"admin_pasit_pappornpisit"`).
**Fix (Wave 23 P0):** ใช้ helper `safeLegacyAdminId(rawId)` ที่ `lib/auth/safe-legacy-admin-id.ts` — clip ก่อนเขียน + log warning ถ้า truncate.
**Audit query:** `grep "safeLegacyAdminId(" actions/` — ทุก INSERT/UPDATE site ที่เขียน adminid* ต้อง wrap.
**Files ที่ patch แล้ว:** combine-bill · cart · admin-profile · forwarder-check · cnt-hs · barcode-import.

### 3.2 bodySizeLimit — 10MB cap สำหรับ upload

**Symptom:** upload slip/cover/PDF ใหญ่ → action throw silently.
**Root cause:** Next 16 default `bodySizeLimit: "1mb"` — Pacred ตั้งเป็น `"10mb"` ใน `next.config.ts`.
**Workaround สำหรับ user:** ถ้า iPhone HEIC > 10MB → ใช้ "Mail" → "Actual size" → save → upload (HEIC compress).

### 3.3 ดูตู้คอนเทนเนอร์ URL — segment, ไม่ใช่ query param

**Symptom:** ก่อน Wave 23 P0 — กด "📦 ดูตู้คอนเทนเนอร์ →" → ระบบไป list page (ไม่ใช่ detail).
**Root cause:** legacy link เขียนเป็น `/admin/report-cnt?id=GZE-2026-001` แต่ Pacred port ใช้ URL segment.
**Fix (Wave 23 P0 — commit `d0825bb`):** ต้องเป็น `/admin/report-cnt/GZE-2026-001`.

### 3.4 Stale-state silent failure — รัวกดบันทึก

**Symptom:** staff กด "บันทึก" 2 ครั้งติด — second click ดูเหมือนไม่ทำอะไร (no banner) แต่จริงๆคือ first action ยัง pending.
**Workaround:** **รอ green banner "✓ บันทึกสำเร็จ"** ก่อนกระทำต่อ. ปุ่ม disable ขณะ pending — แต่ถ้าเปลี่ยน input ระหว่างนั้น state จะ desync.
**Long-term:** plan เพิ่ม toast queue + optimistic UI (Wave 24+).

### 3.5 Status enforcement gap — ผูกตู้ก่อน 2→3

**Current behavior:** UI hint "ใส่เลขตู้" แต่ไม่ block submit ถ้าเว้นว่าง. tb_forwarder.fcabinetnumber อาจเป็น `""` ตอน fstatus=3 → downstream report-cnt page ไม่เห็น row.
**Workaround:** **staff discipline** — ใส่เลขตู้ทุกครั้งตอนเปลี่ยน 2→3.
**Enhancement opportunity (Wave 24+):** เพิ่ม Zod validator ใน `adminBulkUpdateForwarderTbStatus` — refuse `fstatus='3'` if `cabinet_number=''`.

### 3.6 LINE notification ไม่ได้ส่ง — profile bridge gap

**Symptom:** flip status ใน UI สำเร็จ + log บอก "notification sent" → แต่ลูกค้าไม่ได้ LINE message.
**Root cause:** notification ใช้ `resolveProfileIdsForLegacyUserids()` — แต่ถ้า legacy `tb_users.userid` ยัง map ไม่ทันกับ `profiles.id` (UUID) → notification ข้าม (silent skip · log: "no profile").
**Workaround:** ตรวจ logger output ที่ `forwarder.bulk_update_tb` — ถ้า `no_profile > 0` → ต้องไปแก้ที่ `lib/auth/tb-users-resolver.ts`.

---

## 4. RBAC role gate quick reference

| Page | Roles ที่เห็น | Money columns |
|---|---|---|
| `/admin/forwarders` | super · ops | super · ops · accounting |
| `/admin/forwarders/[fNo]` | super · ops · accounting | super · ops · accounting |
| `/admin/forwarder-check` | super · ops · accounting | super · ops · accounting |
| `/admin/cnt-hs` | super · ops · accounting | (no money col) |
| `/admin/report-cnt/[fNo]` | super · ops · accounting · warehouse | super · ops · accounting (warehouse hide) |
| `/admin/wallet` | super · ops · accounting | super · ops · accounting |
| `/admin/driver-runs` | super · ops · driver | (no money col) |
| `/admin/forwarders/combine-bill` | super (delete/add) · ops · accounting (read) | super · ops · accounting |

---

## 5. ปลีกย่อยที่ดี-to-know

- **Cabinet code scheme:** `GZE-YYMMDD-N` = Guangzhou ทางรถ · `GZS-YYMMDD-N` = Guangzhou ทางเรือ · `A-YYNNN` = freight single-consignee
- **Warehouse codes (`fwarehousename`):** 1=แสง · 2=CTT · 3=MK · 4=MX · 5=JMF · 6=GOGO · 7=Cargo Center · 8=MOMO
- **Transport modes (`ftransporttype`):** 1=รถ · 2=เรือ · 3=อากาศ
- **Source tags (UI badge):** `reforder != ''` = ฝากสั่งซื้อ spawn (sky blue) · `adminidcreator != ''` = admin manual (amber) · ทั้ง 2 empty = customer self-submit (gray)
- **Credit customers** (`fcredit='1'`): badge แดง "💳 เครดิตสินค้า" — ออกของก่อน เก็บเงินทีหลัง (รออดน้อย)

---

## 6. Onboarding checklist สำหรับ CS ใหม่

- [ ] login เข้า Pacred admin → ไป `/admin/forwarders` → กรอง `?create=user` → เปิด 1 row ดู detail page
- [ ] ลอง click "ดูออเดอร์ต้นทาง" (ถ้ามี) → ตามไปดู shop order spawn
- [ ] เปิด `/admin/forwarder-check` → ดูคอลัมน์ + tab `?q=c` (credit)
- [ ] เปิด `/admin/cnt-hs` → ดู cabinet chips overflow handling
- [ ] เปิด `/admin/report-cnt/[anyCabinet]` → ดู timeline + cost breakdown
- [ ] เปิด `/admin/wallet?view=balance` → search ลูกค้า → ดู balance
- [ ] อ่าน [`docs/learnings/pacred-order-taxonomy.md`](../learnings/pacred-order-taxonomy.md) ทั้งไฟล์
- [ ] อ่าน [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) §3 (decoded model)

ถ้าทำครบ → พร้อมรับงาน CS ฝากนำเข้าได้.

---

**Maintainer note:** เพิ่ม section เมื่อ workflow เปลี่ยน (Wave 24+). ถ้าเจอ workflow gap ที่ handbook อธิบายไม่ครบ → flag ใน `docs/learnings/` แล้ว link กลับมาที่นี่.
