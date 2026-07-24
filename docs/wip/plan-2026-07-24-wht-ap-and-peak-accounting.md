# PLAN 2026-07-24 — (A) ฟอร์ม 50 ทวิ ฝั่งเราหัก (AP/vendor) → (B) ระบบบัญชี PEAK ให้ครบ

> owner (verbatim): *"ฝั่ง เราเป็นผู้หัก (จ่าย supplier/AP) … ทำแล้วต่อด้วย ระบบบัญชี PEAK
> ตามไกด์ที่ภูมิไปเรียนมา — ไล่ส่วนที่ขาด/ไม่เชื่อมโยง เอกสาร↔การใช้จริง ของทั้งบริษัท
> ลูกค้า และสำนักงานบัญชี … ตอนเราทำใบกำกับเราก็ต้องมี ลง stock เปิดใบกำกับด้วย"*
> savepoint นี้ = แผนกันงานหาย. Lane A ทำใน session นี้ · Lane B = session ถัดไป (งานใหญ่).

## Lane A — ฟอร์ม 50 ทวิ ฝั่ง Pacred เป็นผู้หัก (AP) ✅ ทำใน session นี้

ฐานที่มีแล้ว: ฟอร์มลูกค้า `/r/[token]/wht-form` (layout RD จริง · ลายเซ็น/ตรายาง mig 0278)
· AP = `ap_disbursement` (**0 แถว — write-side ยังรอ ก๊อต co-sign go-live**) มี `wht_pct` +
`wht_cert_no` + `payee_name` แต่ **ไม่มี payee_tax_id / payee_address** (ฟอร์มจริงต้องมี).

แผน:
1. **แยกฟอร์มเป็น component กลาง** `components/wht-form-paper.tsx` (fix-at-root —
   สองหน้าห้ามก๊อปกันเอง) · หน้า token เดิม = ผู้หัก=ลูกค้า/ผู้ถูกหัก=Pacred ·
   หน้า AP ใหม่ = สลับบทบาท.
2. **mig 0279** `ap_disbursement` += `payee_tax_id`, `payee_address` (additive · 0 แถว
   = ไม่มี backfill) + ฟอร์ม AP ใส่ช่องนี้ (ว่าง = จุดให้เขียนมือ).
3. **หน้าใหม่** `/admin/accounting/ap/[id]/wht-form` — gate super/accounting (AP =
   เลนบัญชี ไม่ใช่เลน sales/CS) · ประเภทเงินได้ตาม `wht_pct` (1% ขนส่ง · 3% บริการ ·
   5% เช่า · อื่นๆ = ระบุ) · ยอด = amount_gross · ภาษี = gross × pct.
4. **ตรายาง Pacred**: อ่าน `public/images/company/pacred-signature.png` + `pacred-stamp.png`
   (fs.existsSync — ยังไม่มีไฟล์ = เว้นช่องเซ็นมือ · **owner วางไฟล์ 2 รูปนี้เมื่อไรก็โผล่เอง**
   ห้ามลิงก์รูปที่ไม่มีจริง = broken-image trap).
5. ปุ่ม "📄 ฟอร์ม 50 ทวิ" บนหน้า AP detail เมื่อ wht_pct > 0 (§0d).
6. gate + print-verify (สูตรเดียวกับฟอร์มลูกค้า: วัด mm · title · ของลอย 0).

## Lane B — ระบบบัญชี PEAK (session ถัดไป · เริ่มหัวโล่ง)

**Method**: เอาไกด์ PEAK ที่ **ภูมิ** ไปเรียนมาเป็น checklist ตั้งต้น (ถามภูมิ/owner ว่าไฟล์
ไกด์อยู่ไหน — ใน repo ตอนนี้มีแต่ docs ฝั่งเรา) → audit 3 มุม: บริษัท · ลูกค้า ·
สำนักงานบัญชี → แจง "ขาด/ไม่เชื่อมโยง" → build เป็น wave เล็กๆ.

ของที่มีแล้ว (จุดต่อ):
- `business_config peak.gl_accounts` (mig 0177 · ขาย 410101 · ทุน 510103) + PEAK CSV export
- 3-account routing SOT `lib/payment/bank-accounts.ts` (SERVICE/LOGISTICS/TRADING+VAT)
- taxdoc workspace 4-role (`/admin/pricing/taxdoc-workspace`) + etax hub + ใบกำกับ
  tb_forwarder_tax_invoice (live) / tb_shop_tax_invoice (dormant flag)
- AP register (`ap_disbursement` 0 แถว รอ go-live) · MCS register (ตัดจ่าย MOMO)
- docs เดิม: `docs/research/accounting-b1-vat-plan-2026-06-29.md` ·
  `accounting-3account-freight-workflow-2026-06-30.md` · `pay-and-accounting-gap-2026-06-21.md`

งานที่รู้แล้วว่าขาด (จากคำ owner):
1. 🔴 **ลง stock ตอนเปิดใบกำกับ** — ยังไม่มี stock model เลย (ใบกำกับปัจจุบันออกจาก
   order โดยไม่แตะ stock). ต้องออกแบบ: ตาราง stock + movement ผูกใบกำกับ →
   PEAK สินค้า/บริการ mapping. **งานใหญ่สุดของ lane นี้ — ออกแบบก่อนลงมือ.**
2. เอกสารครบวงจรสำหรับสำนักงานบัญชี: ภพ.30 (VAT ขาย/ซื้อ) · ภ.ง.ด.53 สรุปรายเดือน
   (ตอนนี้มีใบหักรายใบแล้ว — ขาดรายงานรวมเดือนสำหรับยื่น) · ทะเบียนเอกสารต่อเนื่อง.
3. AR/AP เชื่อม PEAK: export/entry ที่บัญชีเอาไปลง PEAK ได้จริง (ตรวจ CSV เดิมว่า
   ตรง format ไกด์ภูมิไหม).
4. เชื่อม 50 ทวิ ↔ บัญชี: ใบหักที่ approve แล้ว → รายงาน เครดิตภาษีถูกหัก (ฝั่งโดนหัก)
   + ภ.ง.ด.53 นำส่ง (ฝั่งหัก · จาก AP wht_pct).

## สถานะ ณ savepoint
- Lane A: เริ่มทำต่อจากบรรทัดนี้ (component กลาง → mig 0279 → หน้า AP → ปุ่ม → gate)
- Lane B: ยังไม่เริ่ม — ต้องการไฟล์ไกด์ PEAK จากภูมิ (ถ้ามีไฟล์/รูป ส่งเข้ามาใน chat หรือ
  วางใน docs/research/ แล้วบอก path)
- dev DB = ตายถาวร (ก๊อตไล่ใหม่) — mig ทุกตัว apply prod เท่านั้น ห้าม reconcile dev
