# ▶️ RESUME — เก็บความรู้ PEAK (อ่านก่อนทำต่อ · คอมบ้าน/session หน้า)

> **งาน:** เก็บความรู้ระบบบัญชี **PEAK** ให้ครบทุกฝั่ง (พี่ป๊อปให้ทีมกลับไปทำ billing แมนนวลบน PEAK ก่อน · เราเก็บไว้สร้างระบบบัญชีของ Pacred เองในอนาคต). **ต้องอ่านบทความ + ดูรูปหน้าจอจริง** (ไม่ใช่แค่ข้อความ · ภูมย้ำ).
> **branch:** ทุกไฟล์อยู่ **Poom-pacred** → คอมบ้าน: `git fetch origin && git checkout Poom-pacred && git pull origin Poom-pacred`
> **โฟลเดอร์:** `docs/research/peak-accounting/`

---

## ✅ เสร็จแล้ว (2026-07-20)
| ไฟล์ | สถานะ |
|---|---|
| [`README.md`](README.md) | ✅ index + document-model + 20-collection map + 68-revenue-article map + "ยืนยันจากภาพจริง" (stepper/doc-codes/GL-per-line) |
| [`revenue-documents.md`](revenue-documents.md) | ✅ **เต็ม · image-informed** — ฝั่งรับเงิน 8 หมวด (68 บทความ · ดูรูป 126+รูป) · รหัสเอกสาร QO/DR/DRT/IV/IVT/RE/RT/TIV/CN(T)/DBN(T)/BN · GL จริง (212104/215102↔215101/115403/113101/410101/510103) · ตาราง Dr/Cr · สรุปสร้างระบบเรา |
| [`expense-documents.md`](expense-documents.md) | ✅ **core money-flow เก็บเต็ม image-informed** (2026-07-24 · 15 บทความ · 1.68M tok) — GL Dr/Cr จริงทุกใบ (PO/DP/EXP/บันทึกซื้อ+FX¥/รับใบเสร็จ+VAT/WHT/เงินเดือน/ใบกำกับซื้อ/ใบรวมจ่าย/ลดหนี้-เพิ่มหนี้) + **chart of accounts (21 GL)** + สรุปพิมพ์เขียว · 🟡 peripheral ~77 บทความ ยัง map-only (map อยู่ท้ายไฟล์) |

## 🔴 ยังไม่เก็บ (ลุยต่อ · เรียงลำดับ)
1. ✅ **ฝั่งจ่าย core เก็บแล้ว** (2026-07-24) — เหลือ peripheral ~77 บทความ (variant/edge/settings · ลงบัญชี pattern ซ้ำ core · **optional** · map ท้าย `expense-documents.md`)
2. 🔴 **ภาษี PEAK Tax (36 บทความ) = priority ถัดไป** — คอลเลกชัน `collections/3474326-จัดการภาษี-peak-tax` (ภพ.30/ภงด/e-tax) → `tax-documents.md` · ⚠️ ปิด gap ที่ core expense เจอ: การ **offset 215101 ภาษีขาย vs 115401 ภาษีซื้อ → เจ้าหนี้สรรพากร ภพ.30** (ปิดงวด VAT) + กรณี input>output (ขอคืน)
3. **ข้อมูลการเงิน-บัญชี (56)** — ผังบัญชี/สมุดรายวัน/งบ/ปิดงวด (หา collection id จาก `intercom.help/peak/en/`)
4. (option) expense peripheral 77 · สินค้า/ผู้ติดต่อ/รายงาน/ตั้งค่า

---

## 🛠 วิธี capture (proven method · ทำซ้ำได้)

**แหล่ง:** ลิงก์ bit.ly ในคู่มือ flipbook (peakaccount.com/manual-peak-account) ทุกอันชี้เข้า **PEAK Help Center** = `intercom.help/peak/en/articles/<id>` (บทความ how-to + รูป + ฟิลด์ + สถานะ + การลงบัญชี).

**⚠️ กับดักสำคัญ 2 อัน:**
1. **URL แบบ ID-only วน redirect ใน WebFetch** (`.../articles/5966405` → "too many redirects"). **ต้อง resolve เป็น encoded URL ก่อน:**
   ```bash
   URL=$(curl -sIL -o /dev/null -w '%{url_effective}' "https://intercom.help/peak/en/articles/<id>")
   ```
   แล้วค่อย WebFetch `$URL`. (collection ก็เหมือนกัน — resolve ก่อน)
2. **bash `/tmp` ≠ node `C:\tmp`** (Windows Git Bash) → เวลาเขียนไฟล์ให้ node อ่าน ใช้ `cygpath -w` หรือ scratchpad path.

**ขั้นตอนต่อบทความ (agent ทำ):**
1. resolve URL (curl ข้างบน)
2. WebFetch `$URL` → ดึงข้อความ (ใช้ทำอะไร/ขั้นตอน/ฟิลด์/สถานะ/convert/การลงบัญชี Dr-Cr+GL/gotcha)
3. โหลดรูป: `curl -sL "$URL" -o a.html` → `grep -oE 'https://downloads\.intercomcdn\.com/[^" ]*\.(png|jpg|jpeg)' a.html | sort -u` → download
4. **Read (เปิดดู) รูป workflow-critical** (ฟอร์มสร้าง/ปุ่ม/dialog/สถานะ · ข้ามรูป header ที่ซ้ำทุกบทความ · ~3-6 รูป/บทความ)
5. เขียนโน้ตจากที่**เห็นจริง**

**รูปแบบ workflow (Ultracode · Workflow tool):** 16-17 agent แบ่ง batch ตามหมวดเอกสาร (≤7 บทความ/agent) · schema `{key,docType,markdown,imagesViewed,articlesFailed}` · แล้ว assemble agent รวมเป็นไฟล์เดียว (จัดกลุ่มตาม docType + workflow chain + ตารางการลงบัญชี + "สรุปสำหรับสร้างระบบเรา"). **ต้นแบบ = revenue workflow ที่รันสำเร็จ** (ดู commit 7dfcf86d).

**⚠️ ลิมิต session (สำคัญ):** 17-agent image workflow กิน ~5M subagent tokens → **ชนลิมิต session** ได้ (วันนี้ reset 15:00 → เลื่อนเป็น 20:00 หลังยิง 2 รอบ). **คอมบ้าน: ยิงทีละ ~6-8 agent (แบ่ง capture เป็น 2-3 รอบเล็ก)** หรือถ้าลิมิต ใช้ **main-loop WebFetch เก็บทีละบทความ** (ได้แค่ข้อความ ไม่มีรูป · เป็น fallback — เคยเก็บ 4 บทความแบบนี้สำเร็จ).

---

## 🧭 คำสั่ง resume (คอมบ้าน)
```bash
git fetch origin && git checkout Poom-pacred && git pull origin Poom-pacred
# อ่าน README.md + revenue-documents.md (ดู format เป้าหมาย) + expense-documents.md (article-ids)
# แล้ว: รัน Workflow เก็บ expense (ตาม method ข้างบน · batch จาก expense-documents.md) → เขียนทับ expense-documents.md
# ต่อด้วย tax (collections/3474326) → tax-documents.md
```
> **ก่อนเริ่ม:** `ls supabase/migrations | tail` (NEXT-FREE mig · ตอนนี้ 0265) · งานนี้ไม่แตะ code/mig — เก็บ docs อย่างเดียว push Poom-pacred.

## 💎 สิ่งที่ล็อกได้แล้ว (พิมพ์เขียวระบบบัญชี Pacred)
1. ทุกเอกสารมี **doc-code + running series แยกต่อชนิด** (`<CODE>-YYYYMM#####`)
2. **GL account ผูกทุก line item → ลงบัญชีอัตโนมัติตอนอนุมัติ** (หัวใจ: ออกเอกสาร = ลงบัญชีเอง)
3. **2 บัญชี VAT ขาย:** 215102 ภาษีขายรอเรียกเก็บ → 215101 ภาษีขาย ภ.พ.30 (ย้ายตอนออกใบกำกับ)
4. **ใบวางบิล (BN) = billing-run เรา** · **ใบแจ้งหนี้ = ใบส่งของ = บันทึกลูกหนี้** (ใบเดียว)
5. **ใบลดหนี้/เพิ่มหนี้** = ปรับยอดหลังออกเอกสาร (เราไม่มี — ต้องเพิ่ม) · **มัดจำ** พัก 212104 แล้วตัดตอนออกบิลจริง
6. ฝั่งจ่าย = mirror (PO↔QO · บันทึกซื้อ↔IV · จ่ายชำระ↔RE · ใบกำกับภาษีซื้อ↔TIV · ใบรวมจ่าย↔BN) + input VAT(ขอคืน) + WHT(หักคู่ค้า/ออกแทน/50ทวิ)
