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

---
Standing carryover เดิม (ยังอยู่): #52089 · RECEIPT_TOKEN_SECRET ใน Vercel · commission 50/50 policy · yuan OCR/packing-upload authed-test.
