# 📤 ภูม → เดฟ/ก๊อต hand-off — 2026-05-16 night

> **Purpose:** open decisions + blockers + design choices ภูม จะ run ต่อ. เดฟ/ก๊อต อ่านแล้วตอบกลับใน commit ถัดไป (อัพไฟล์นี้พร้อม decision) หรือ ping ในแชท. **ภูม ไม่บล็อกตัวเอง** — ระหว่างนี้เดินงานที่ unblock ต่อ.
>
> Last updated: 2026-05-16 night (ภูม via Claude)
> Commits pushed since previous team-status: `93d23eb..00232fb` (11 commits — V-D2/D3 wiring · V-B1 reports · V-C2 bill-header · V-C3 ตัดตู้ · V-A1 slip time · V-A7 N/A docs · React-purity fix · polish · LP-1a/b/c1 rates UI).
>
> Cadence: ภูม อัพไฟล์นี้ทุก batch ที่มี decision หรือ blocker; ลบ entry เมื่อมีคำตอบ.

---

## 🟡 รอ decision จาก เดฟ / ก๊อต

### D-1 · LP-1c2 rate_custom_hs schema — UNIQUE constraint หรือไม่
**Context:** Migration `0009_rates.sql` สร้าง `rate_custom_hs` แต่ comment เขียนว่า "placeholder shape" + ไม่มี `UNIQUE (profile_id, hs_code, source_warehouse, transport_type, product_type, basis)`.

**ทางเลือก:**
- **(a) เพิ่ม UNIQUE constraint** ใน migration `0044_rate_custom_hs_unique.sql` → ใช้ `upsert(..., { onConflict: ... })` แบบเดียวกับ rate_general/vip/custom_user. คลีน. แต่เข้าเลน schema ของเดฟ.
- **(b) SELECT-then-UPDATE/INSERT** ใน admin action โดยไม่แตะ schema. ยุ่งกว่าหน่อย + race-window เล็กระหว่าง select กับ insert (low risk เพราะ admin tab เดียวที่แก้ตอนเดียว).

**ภูม proceed กับ (b)** ใน LP-1c2 รอบนี้ — ไม่ block. ถ้าเดฟต้องการ (a) แก้ทีหลังเป็น 1 migration + ลบ SELECT-then-write logic ได้.

**Owner of decision:** เดฟ (structural lane)
**By when:** ก่อนภูม pickup LP-1c2 ต่อ หรือ LP-1d ใหม่ (ไม่เร่ง — feature ทำงานได้ทั้ง 2 ทาง)

---

### D-2 · Migration numbering — ภูม ครอง 0041-0043 + WHT ต้องเลื่อน
**Context:** team-status night เคยบอกว่า WHT (ADR-0015 / V-A6) จะลง `0041+`. ภูม ใช้:
- `0041` bill_to_name_override (V-C2)
- `0042` cargo_containers.close_at (V-C3)
- `0043` slip_transferred_at (V-A1)

**เดฟ to take `0044+`** สำหรับ WHT migration เมื่อ ก๊อต lock ADR-0015.

**Owner:** เดฟ (heads-up only — ไม่มี decision)

---

## 🔴 รอ external (ก๊อต / พี่ป๊อป)

### E-1 · ADR-0015 WHT lock — block V-A6
ภูม ไม่ทำ V-A6 จนกว่า ก๊อต lock. ไม่ block อย่างอื่น.

### E-2 · ADR-0016 freight value model — block V-E2
ภูม ไม่ทำ V-E* freight document suite จนกว่า ก๊อต lock. ไม่ block.

### E-3 · MOMO endpoint inventory — block MOMO sync wire
`lib/integrations/momo-jmf/sync.ts` ยังเป็น skeleton. ภูม ไม่กรอกจนกว่า ก๊อต MOMO-1 confirm shape. ไม่ block.

### E-4 · Pacred owner Bundle 1 — block tax-invoice prod + LIFF + payment
ก๊อต/เดฟ คุยกับพี่ป๊อปเอง — ภูม ไม่เข้าไปยุ่ง.

---

## ⚪ Followup ที่ภูม ทำเอง (low priority, ไม่ block)

### F-1 · BillToOverridePanel "default name" สำหรับลูกค้านิติบุคคล
**Issue:** `/admin/service-orders/[hNo]` BillToOverridePanel แสดง "ชื่อเริ่มต้น = first_name + last_name" แต่ PDF จริงใช้ `corporate.company_name` ถ้า account_type=juristic.

**Fix:** ขยาย select profile ใน [page.tsx](../../app/[locale]/(admin)/admin/service-orders/[hNo]/page.tsx) ให้ join corporate + ส่ง company_name เป็น defaultName เมื่อ juristic.

**Effort:** ~15 นาที. ภูม จะทำใน batch ถัดไป.

### F-2 · LP-1c2 rate_custom_hs UI (after D-1 decision)
ใช้ pattern เดียวกับ LP-1c1 แต่เพิ่ม hs_code + rate_before column. รอ D-1.

---

## 🟢 ของพร้อมเทสต์ — ภูม จะลุยตาม [poom-test-playbook-2026-05-16.md](poom-test-playbook-2026-05-16.md)

ดูไฟล์ playbook สำหรับ step-by-step ลูกค้า + พนักงาน flow.

---

## เดฟ/ก๊อต reply ใส่ที่ไหน
- แก้ไฟล์นี้: เปลี่ยน 🟡/🔴 → ✅ พร้อม decision; commit `docs(handoff): D-X decided — <decision>`
- หรือ commit เลย structural piece (เช่น migration 0044) → ภูม ลบ entry นี้ใน batch ถัดไป.
