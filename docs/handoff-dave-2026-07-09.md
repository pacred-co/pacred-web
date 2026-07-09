# 📋 Handoff → เดฟ · 2026-07-09 (จากงาน ภูม กลุ่มรายการเบิกเงิน C + MOMO user_group fix)

Branch: `claude/adoring-chandrasekhar-0f8ad7` (integrate → Poom-pacred ตามปกติ) · gate เขียวทุก commit (tsc 0 · eslint 0 · test 180/180).
**ไม่มี migration ใหม่ session นี้** (NEXT FREE ยังคง 0236). prod = read-only (เดฟ owns).

Commits session นี้:
- `bd78a3b0` — C1 money-loop เบิกค่าคอมเซล/ล่าม (create+pay) + C2 driver-runs rebuild + C3 nav + sidebar dup-key
- `d3286e75` — fix ค้นหา error `column tb_forwarder.fid does not exist`
- `7a679ef6` — fix MOMO `user_group "PR+PR"` → รหัส PR#### ถูกต้อง (+ 10 tests)

---

## 🔴 1. C1 money-WRITE ยังไม่ได้ test จ่ายจริง — owner ต้อง test 1 รายการก่อนใช้จริง
`actions/admin/withdraw-comm-batch.ts` — สร้าง batch + จ่ายเงิน (แนบสลิป) ค่าคอมเซล + ล่าม.
- Build + gate + adversarial-review เสร็จ · live-verified: หน้า list + create modal (dropdown 5 เซลจริง) + ค้นหา ทำงาน.
- **แต่ผม test การเขียนเงินจริง (create INSERT + pay UPDATE) บน prod ไม่ได้** (กฎ owner verify เอง).
- **Action needed:** owner/เดฟ ลอง **สร้าง + จ่ายค่าคอม 1 รายการทดสอบ** บน prod → เช็คว่า:
  - เงินสุทธิ = ก่อนหัก − WHT 3% ตรง
  - status flip '1' รอดำเนินการ → '2' จ่ายแล้ว (ไม่จ่ายซ้ำ)
  - รายการเข้า tb_withdraw_comm_sale_h/_item ถูก customer
- money-safety review แล้ว: TOCTOU-safe (`.eq(status,'1')` in WHERE + 0-row abort) · ไม่มี DB delete · commission ผ่าน computeCommission SOT · re-verify ownership + dup ก่อน insert.

## 🔴 2. ฝั่งล่าม (interpreter) เบิกไม่ได้จนกว่าจะ seed ข้อมูล — owner-input
- prod `tb_set_comm_interpreter` = **0 แถว** → interpreter create fail-closed ("ล่ามยังไม่ได้ตั้งค่า %").
- prod `tb_header_order.adminidip` = มีแค่ 'customer' / 'admin_web' (placeholder ไม่ใช่ล่ามจริง).
- **Action needed (owner):** (a) ตั้ง % ค่าคอมต่อล่าม ใน `tb_set_comm_interpreter` (adminid + percom) · (b) แก้ data adminidip ในออเดอร์ให้เป็นล่ามจริง.
- ฝั่งเซล (sale) **ใช้ได้เลย** (1% fix + fallback ดึงเซลจริงจาก tb_users.adminIDSale 5 คน).

## 🟡 3. Payee dropdown fallback (เผื่อ เดฟ อยากทำให้ถาวร)
- migrated `tb_admin` companyType/department/section **ไม่ match legacy filter** → dropdown เลือกเซลว่าง.
- ผมทำ fallback: sale → distinct `tb_users.adminIDSale`. **ถาวรกว่า** = ตั้ง org fields บน tb_admin ให้ตรง legacy codes (owner/HR).

## 🟠 4. MOMO tracking ตกหล่น "หายขาดมั้ย" (ภูม ถาม) — แยกจาก user_group fix
- **user_group "PR+PR" fix = คนละเรื่อง** กับ tracking ตกหล่น (นั่นผมแก้ให้แล้ว commit `7a679ef6`).
- **tracking ตกหล่น (฿294k drift)** = MOMO API ทิ้งพัสดุ 30-40% ตั้งแต่ 16/06 (memory `momo-api-endpoint-limits`). MOMO บอกแก้แล้ว แต่**ยังพิสูจน์ไม่ได้ว่าหายขาด** — ต้องเทียบ API vs แต้ม (iTAM packing list) ต่อเนื่องหลายรอบ.
- recovery queue มีอยู่: `/admin/api-forwarder-momo/drift` (มิก 0226 taem_packing_line · apply ผ่าน reconcile เดิม audited).
- **ยังต้อง:** เดฟ ตรวจว่า drift ลดลงจริงไหมหลัง MOMO อ้างว่าแก้ + Vercel `MOMO_WEB_USER/PASS` creds (ถ้ายังไม่ตั้ง).

## ⚠️ 5. เหตุการณ์ dev-server session นี้ (บันทึกไว้ · ไม่กระทบ prod/commit)
- ผม `rm -rf .next/dev/types` ตอน dev server รัน → ทำ build cache เพี้ยน → ทุกหน้า admin 404 → ล้าง `.next` + restart แก้แล้ว. **โค้ด commit ไม่กระทบ.** บทเรียน: ห้าม rm .next/* ตอน dev รัน + เช็คหน้าจริงซ้ำหลังแตะ server.

## 🔴 6. FRI2607-00015 (PR086 ฮก ออโต้พาร์ท ฿703.50) — บิล "รับชำระแล้ว" แต่ใบเสร็จไม่ออก (ภูม flag · ต้อง diagnose บน PROD)

**อาการ (ภูม prod):** วางบิล FRI2607-00015 → แนบสลิป → กดรับชำระ (บิลขึ้น "รับชำระแล้ว") **แต่ใบเสร็จไม่สร้างอัตโนมัติ + ค้นหาแมนนวลก็ไม่เจอ**.

**วินิจฉัยจากโค้ด (ผมเห็นแค่ DEV · row จริงอยู่ prod = เดฟ):**
- โค้ดถูกต้อง + deploy ครบแล้ว: `936dc243` (fix PR086 re-issue-after-void บุคคล→นิติ) + G1/G7/G8 อยู่บน main/prod หมด.
- **`createBillingRunInvoice` ไม่สร้างใบเสร็จตอน issue** → ใบเสร็จของบิลนี้ขึ้นกับ `autoIssueReceiptOnPaymentLand` ตอน "ตัดจ่าย" สำเร็จล้วนๆ. มันเป็น **best-effort** (อยู่ใน try/catch · fail ไม่ roll back paid flip) → บิลขึ้น "รับชำระแล้ว" ได้ทั้งที่ใบเสร็จเงียบไม่ออก. **ตรงอาการเป๊ะ.**
- PR086 = ลูกค้าเคส void→re-bill (บุคคล→นิติ) พอดี → มีโอกาสสูงว่า fids ของบิลนี้ยังติดใบเสร็จเก่า (ยกเลิก '2' หรือ pending '3'/'0') อยู่ → auto-issue คืน `already_issued` หรือ insert 23505 → ไม่มีใบเสร็จใหม่.

**สาเหตุที่เป็นไปได้ (เรียงตามน่าจะเป็น) + query เช็ค prod (READ-ONLY · ปลอดภัย):**
```sql
-- (0) หา invoice + userid + items ของ FRI2607-00015
select id, doc_no, status, userid, total_thb, is_juristic, mao_fee_thb, slip_status, slip_reviewed_at, paid_at
  from tb_forwarder_invoice where doc_no = 'FRI2607-00015';
select forwarder_id from tb_forwarder_invoice_item where invoice_id = <id ข้างบน>;   -- S3: ถ้าว่าง = ไม่มี items → auto-receipt ข้ามทั้งก้อน

-- (1·S1 most-likely) มีใบเสร็จเก่าคลุม fids พวกนี้ที่สถานะไหน? ('2'=ยกเลิก '3'=รอชำระ '1'=ออกแล้ว '0'=ร่าง)
select ri.fid, ri.rid, r.rstatus, r.rdatecreate
  from tb_receipt_item ri join tb_receipt r on r.rid = ri.rid
 where ri.fid in (<forwarder_ids จาก item ข้างบน>) order by r.rdatecreate desc;
--   → ถ้ามี rstatus '3'/'0'/'1' (ไม่ใช่ '2') คลุม fid ≥1 → auto-issue คืน already_issued → ไม่สร้างใหม่
--     (ถ้าเป็น '3' = ใบเสร็จมีอยู่แต่ "รอชำระ" · manual search แท็บ "ออกแล้ว" เลยไม่เจอ → กด sync/ออกใบเสร็จให้เป็น '1')

-- (2·S2) forwarder rows userid ตรงกับ invoice.userid ไหม (ถ้าไม่ตรง → no_matching_forwarder_rows → error เงียบ)
select id, userid, fstatus from tb_forwarder where id in (<forwarder_ids>);

-- (3) audit log บอกผลจริง
select action, target_id, payload, created_at from admin_audit_log
 where action in ('billing_run.receipt_auto_created','billing_run.mark_paid')
   and payload->>'invoice_id' = '<id>' order by created_at desc;
```
**วิธีแก้ (เดฟ บน prod ตาม scenario):**
- S1 เจอใบเสร็จ '3'/'0' คลุม fids → กด "ออกใบเสร็จ/sync" ให้ flip เป็น '1' (มีอยู่แล้วแค่ค้าง) · หรือถ้าใบเสร็จเก่าผิด → void แล้ว re-run รับชำระ.
- S1 เจอเฉพาะใบเสร็จ '2' (ยกเลิก) → ควร re-issue ได้เอง; ถ้าไม่ได้ = insert ชน UNIQUE(fid) → ดู server log `[auto-receipt: tb_receipt_item insert] failed` → ปลด item เก่าออกแล้ว re-run.
- S3 items ว่าง / S2 userid ไม่ตรง → แก้ linkage ก่อนแล้วออกใบเสร็จเอง.

**ฝั่งโค้ด (ผมทำแล้ว commit นี้ · Poom-pacred lane):** เพิ่มการ **surface warning** — ตอนนี้ถ้า auto-receipt พลาด/ข้าม `markBillingRunPaid` จะคืน `receiptWarning` → หน้า billing-run โชว์ "✓ รับชำระแล้ว · ⚠️ ระบบออกใบเสร็จอัตโนมัติไม่สำเร็จ (...) — กรุณาออกใบเสร็จเอง" (เดิมเงียบ · staff ไม่รู้ตัว = ต้นเหตุที่ ภูม เจอ). ปลอดภัย · ไม่แตะเงิน · ไม่ roll back paid flip. gate เขียว (tsc 0 · lint 0). ⚠️ ยัง **ไม่ได้ authed-test สด** (headless ไม่ authed · ผมอยู่ DEV) — เดฟ/owner verify บน prod ตอนตัดจ่ายบิลจริง.

## ⚠️ 7. หมายเหตุ: session นี้ผม query อยู่ DEV ไม่ใช่ prod
`.env.local` บนเครื่องนี้ = **DEV** (`lozntlidlqqzzcaathnm`) ไม่ใช่ prod. ที่ผมเคยรายงานว่า "prod มี 0 batch / tb_set_comm_interpreter ว่าง / เซล 5 คน" = **ตัวเลข DEV** (โค้ด fix ยังถูกต้อง). row จริงเช่น FRI2607-00015 อยู่ prod ผม query ไม่เห็น — เลย diagnose จากโค้ด + ส่ง query ให้เดฟ (prod = โดเมนเดฟ).

---
Standing carryover เดิม (ยังอยู่): #52089 · RECEIPT_TOKEN_SECRET ใน Vercel · commission 50/50 policy · yuan OCR/packing-upload authed-test.
