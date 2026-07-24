# จับความรู้จากผลิตภัณฑ์ภายนอก มาเป็นพิมพ์เขียวของเราเอง (PEAK · 2026-07-20 → 07-24)

**งาน:** พี่ป๊อปให้ทีมกลับไปทำ billing แมนนวลบน **PEAK** ไปก่อน — เราถือโอกาสเก็บความรู้ระบบบัญชีของเขา ไว้สร้างระบบบัญชี Pacred เอง. เก็บครบ core 4 ไฟล์ที่ `docs/research/peak-accounting/` (revenue · expense · tax · accounting/GL).

นี่คือ pattern ที่ใช้ได้กับ **การถอดความรู้ผลิตภัณฑ์ภายนอกทุกเจ้า** ไม่เฉพาะ PEAK.

---

## L-1 · ต้องดู "รูปหน้าจอจริง" ไม่ใช่แค่ข้อความบทความ

ภูมย้ำตั้งแต่ต้น: **ต้องอ่านบทความ + ดูรูปหน้าจอจริง**. เหตุผลพิสูจน์ตัวเองระหว่างทาง — สิ่งที่ได้จาก**รูป**เท่านั้น ข้อความไม่เคยบอก:

- **stepper สถานะจริง** ของเอกสาร (ร่าง → รออนุมัติ → อนุมัติ → ...) — บทความเขียนแค่ "อนุมัติแล้วระบบจะบันทึกบัญชีให้"
- **GL account ผูกราย line item** (เห็นในฟอร์มสร้างเอกสาร) — นี่คือหัวใจของทั้งระบบ ("ออกเอกสาร = ลงบัญชีเอง") และไม่มีบทความไหนพูดตรงๆ
- **รหัสเอกสาร + running series แยกต่อชนิด** (`QO/IV/RE/BN/PO/EXP/JVTX` · `<CODE>-YYYYMM#####`)
- **เลข GL จริง** ที่กลายเป็น chart-of-accounts ตั้งต้นของเรา (215102 ภาษีขายรอเรียกเก็บ → 215101 ภาษีขาย ภ.พ.30 ฯลฯ)

**กติกา:** ต่อบทความ ให้เปิดดูรูป **workflow-critical ~3-6 รูป** (ฟอร์มสร้าง · ปุ่ม · dialog · แถบสถานะ) และ**ข้ามรูป header ที่ซ้ำทุกบทความ**. เขียนโน้ตจากสิ่งที่ **เห็นจริง** ไม่ใช่จากที่บทความเคลม.

---

## L-2 · กับดักเทคนิค 2 อันที่กินเวลาเปล่า

**(ก) URL แบบ ID-only วน redirect ใน WebFetch** — `intercom.help/peak/en/articles/5966405` → "too many redirects". ต้อง resolve เป็น encoded URL ก่อนเสมอ:

```bash
URL=$(curl -sIL -o /dev/null -w '%{url_effective}' "https://intercom.help/peak/en/articles/<id>")
# แล้วค่อย WebFetch "$URL"   (collection ก็ต้อง resolve เหมือนกัน)
```

โหลดรูป: `curl -sL "$URL" -o a.html` → `grep -oE 'https://downloads\.intercomcdn\.com/[^" ]*\.(png|jpg|jpeg)' a.html | sort -u`

**(ข) bash `/tmp` ≠ node `C:\tmp`** บน Windows Git Bash — เขียนไฟล์ให้ node อ่าน ต้อง `cygpath -w` หรือใช้ scratchpad path ตรงๆ ไม่งั้น "ไฟล์หาย" ทั้งที่เขียนสำเร็จ

---

## L-3 · แยก core ออกจาก peripheral ก่อนยิง — ไม่งั้นเผา token ฟรี

collection ของผลิตภัณฑ์ใหญ่มักมีบทความ 56-90 บทความ แต่ **ส่วนใหญ่เป็น variant/edge/settings ที่ลงบัญชี pattern ซ้ำ core**.

ตัวอย่างจริง — collection "ข้อมูลการเงิน-บัญชี" มี **56 + 14 sub** แต่ core จริง = **~15 บทความ**: ผังบัญชี · สมุดรายวัน (auto-post) · โอนปิดภาษี manual · งบการเงิน · กำไรสะสม/ปิดปี · XBRL. ที่เหลือ ~40 = banking ops (เช็ค/กระทบยอด/e-wallet/EDC/statement import) = **peripheral**.

**กติกา:** ลิสต์บทความทั้ง collection ก่อน → คัด core (ตัวที่ *เปลี่ยนโครงระบบ* หรือ *แตะเงิน/GL*) → ยิงเฉพาะ core. peripheral เก็บเป็น **map-only** ท้ายไฟล์ (ชื่อ+id) ไว้ยิงทีหลังถ้าจำเป็น. ผลจริง: 4 ไฟล์ core ครบพิมพ์เขียว โดยไม่ต้องแตะ ~140 บทความ peripheral.

---

## L-4 · workflow ภาพหนัก = ชนลิมิต session — ต้อง bounded

17-agent image workflow กิน **~5M subagent token** → **ชนลิมิต session** (เจอจริง 2 ครั้ง: 07-20 reset 15:00 → เลื่อน 20:00 · 07-24 ชนตอนกำลังจะปิด session)

**กติกา:**
- ยิง **ทีละ 5-8 agent** (แบ่ง capture เป็น 2-3 รอบเล็ก) — ที่พิสูจน์แล้ว: 5 agent / 15 บทความ / 1.74M tok = จบสวย
- ≤7 บทความ/agent · schema `{key, docType, markdown, imagesViewed, articlesFailed}` แล้วมี assemble agent รวมเป็นไฟล์เดียว
- **fallback ตอนลิมิตใกล้หมด:** main-loop WebFetch เก็บทีละบทความ (ได้แค่ข้อความ ไม่มีรูป — เคยเก็บ 4 บทความสำเร็จแบบนี้)
- **เขียนไฟล์ผลลัพธ์ให้เสร็จก่อน** แล้วค่อยทำ learning/memory/push — เพราะถ้าชนลิมิตกลางทาง ไฟล์ที่เขียนแล้วยังอยู่บนดิสก์ กู้ต่อได้ (รอบนี้กู้ `accounting-documents.md` ที่เขียนเสร็จ 17:42 แล้วชนลิมิตทันที)

---

## L-5 · เขียน RESUME-HERE ทุกครั้งที่ capture ยังไม่จบ

งานเก็บความรู้กินหลาย session ข้ามเครื่อง. ไฟล์ [`docs/research/peak-accounting/RESUME-HERE.md`](../research/peak-accounting/RESUME-HERE.md) เป็นตัวที่ทำให้ต่องานได้จริง — มีครบ: ตารางเสร็จ/ยังไม่เสร็จเรียงลำดับ · **วิธี capture ที่พิสูจน์แล้ว** (พร้อมกับดัก) · คำสั่ง resume · และ **"สิ่งที่ล็อกได้แล้ว"** (พิมพ์เขียวสะสม) เพื่อไม่ต้องอ่านไฟล์ใหญ่ซ้ำ

รอบนี้ session ใหม่เปิดมาแล้วต่อได้ทันทีเพราะไฟล์นี้ — ไม่ต้องเดาว่าค้างตรงไหน

---

## 💎 ของที่ได้กลับมา (พิมพ์เขียวระบบบัญชี Pacred)

สิ่งที่ capture นี้ให้ ไม่ใช่ "คู่มือ PEAK" แต่คือ **โครงกระดูกระบบบัญชีที่เราจะสร้างเอง**:

1. **ทุกเอกสารมี doc-code + running series แยกต่อชนิด** (`<CODE>-YYYYMM#####`)
2. **GL account ผูกทุก line item → post อัตโนมัติตอนอนุมัติ** ← หัวใจ ("ออกเอกสาร = ลงบัญชีเอง" · ร่าง/รออนุมัติ = ยังไม่เข้า GL)
3. **2 บัญชี VAT ขาย:** 215102 ภาษีขายรอเรียกเก็บ → 215101 ภาษีขาย ภ.พ.30 (ย้ายตอนออกใบกำกับ)
4. **ใบวางบิล (BN) = billing-run ของเรา** · ใบแจ้งหนี้ = ใบส่งของ = บันทึกลูกหนี้ (ใบเดียว)
5. **ใบลดหนี้/เพิ่มหนี้ = ของที่เรายังไม่มี ต้องเพิ่ม** · มัดจำพัก 212104 แล้วตัดตอนออกบิลจริง
6. ฝั่งจ่าย = mirror ฝั่งรับ (PO↔QO · บันทึกซื้อ↔IV · จ่ายชำระ↔RE · ใบกำกับซื้อ↔TIV · ใบรวมจ่าย↔BN)
7. **🔑 สถาปัตย์ 2-layer:** *bookkeeping GL* (post ตอนออกเอกสาร) **แยกจาก** *tax-filing form-prep* (ดึง SOT มาประกอบแบบ · **ไม่ post ซ้ำ**) — **ยกเว้น closing-JV ตอนปิดงวด** ที่ post จริง. นี่คือคำตอบว่าทำไมออกใบกำกับแล้วยอดภาษียังไม่ไปโผล่ที่ ภ.พ.30 จนกว่าจะปิดงวด
8. **VAT period-close (JVTX):** Dr 215101 / Cr 115401 / Cr 215351 เจ้าหนี้สรรพากร ภพ.30 รอชำระ (สุทธิ) → จ่าย Dr 215351/Cr ธนาคาร · input>output = ยกไปเดือนหน้า หรือขอคืน
9. **WHT period-close:** reclass 215201-204 ค้างจ่าย → 215352/353/355 รอชำระ ตอนปิดแบบ ภ.ง.ด. → จ่าย · ใบ 50-ทวิ = form-only ไม่ post
10. **งบการเงิน = view-layer roll-up** (งบทดลอง → งบฐานะ/กำไรขาดทุน) ไม่ใช่ตารางที่เขียนเก็บ · **ปิดปี:** กำไรสุทธิ → กำไรสะสม (auto ขึ้นปีใหม่)

---

## Cross-links
- [`docs/research/peak-accounting/RESUME-HERE.md`](../research/peak-accounting/RESUME-HERE.md) — สถานะ + วิธี capture + คำสั่ง resume
- [`README.md`](../research/peak-accounting/README.md) · [`revenue-documents.md`](../research/peak-accounting/revenue-documents.md) · [`expense-documents.md`](../research/peak-accounting/expense-documents.md) · [`tax-documents.md`](../research/peak-accounting/tax-documents.md) · [`accounting-documents.md`](../research/peak-accounting/accounting-documents.md)
- [`parallel-agent-sprints`](parallel-agent-sprints.md) — กติกาการยิง agent ขนาน + ต้อง re-gate ผลเสมอ
