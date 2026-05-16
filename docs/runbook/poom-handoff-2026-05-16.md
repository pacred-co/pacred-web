# 📤 ภูม → เดฟ/ก๊อต hand-off — 2026-05-16 night

> **Purpose:** open decisions + blockers + design choices ภูม จะ run ต่อ. เดฟ/ก๊อต อ่านแล้วตอบกลับใน commit ถัดไป (อัพไฟล์นี้พร้อม decision) หรือ ping ในแชท. **ภูม ไม่บล็อกตัวเอง** — ระหว่างนี้เดินงานที่ unblock ต่อ.
>
> Last updated: 2026-05-16 night (ภูม via Claude)
> Commits pushed since previous team-status: `93d23eb..00232fb` (11 commits — V-D2/D3 wiring · V-B1 reports · V-C2 bill-header · V-C3 ตัดตู้ · V-A1 slip time · V-A7 N/A docs · React-purity fix · polish · LP-1a/b/c1 rates UI).
>
> Cadence: ภูม อัพไฟล์นี้ทุก batch ที่มี decision หรือ blocker; ลบ entry เมื่อมีคำตอบ.

---

## 🟡 รอ decision จาก เดฟ / ก๊อต

### D-1 · LP-1c2 rate_custom_hs schema — UNIQUE constraint? (พร้อม shipped option b)
**Context:** Migration `0009_rates.sql` สร้าง `rate_custom_hs` แต่ comment เขียนว่า "placeholder shape" + ไม่มี `UNIQUE (profile_id, hs_code, source_warehouse, transport_type, product_type, basis)`.

**Status:** ✅ ภูม shipped LP-1c2 with **option (b) SELECT-then-write** ใน commit `0d35f1f`. Feature ทำงาน ได้ — race-window เล็กแค่ admin 2 คนแก้ตู้เดียวกันพร้อมกัน (ไม่ใช่ scale Pacred).

**ทางเลือก (a) UNIQUE constraint — เดฟ choose later:**
- ลง migration `0044_rate_custom_hs_unique.sql` แล้วแก้ `actions/admin/rates.ts::adminUpsertCustomHsRate` ให้ใช้ `.upsert({ onConflict: ... })` (ลบ SELECT-then-INSERT/UPDATE branch). 5-10 นาที.

**Owner of decision:** เดฟ — refactor optional. ไม่ block.

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

### F-1 · BillToOverridePanel "default name" สำหรับลูกค้านิติบุคคล ✅
**Status:** Shipped ใน commit `0d35f1f` — profile select เพิ่ม `account_type` + ถ้า juristic ดึง `corporate.company_name` มา feed `defaultName` prop.

### F-2 · LP-1c2 rate_custom_hs UI ✅
Shipped ใน commit `0d35f1f` พร้อม F-1 (เลือก option (b) ตาม D-1).

### F-3 · /admin/learning "training" decision ✅
**Decision:** KEEP /admin/learning as org-wide docs hub (rules/news/customer T&C). REDIRECT "การอบรม" card → /admin/hr/training (HR owns employee training per CLAUDE.md). Avoids duplicate code paths. Phase H ships the editor + sign-acknowledge flow for remaining 3 sections.

### F-4 · CT-7 driver self-serve runs ✅
Shipped `fe05c3a` — /admin/driver-runs + driverUpdateOwnAssignmentStatus action.

### F-5 · CT-8 container lifecycle integration test ✅
Shipped `58509f4` — lib/warehouse/lifecycle.test.ts (23 asserts, DB-backed).

### F-6 · LP-6 PDF spot-check ✅
Shipped `92fdb29` — extended render.test.tsx with 3 ShopOrderReceipt cases (paid/awaiting/juristic+override+edgeThai).

---

## 🟢 ของพร้อมเทสต์ — ภูม จะลุยตาม [poom-test-playbook-2026-05-16.md](poom-test-playbook-2026-05-16.md)

ดูไฟล์ playbook สำหรับ step-by-step ลูกค้า + พนักงาน flow.

---

## เดฟ/ก๊อต reply ใส่ที่ไหน
- แก้ไฟล์นี้: เปลี่ยน 🟡/🔴 → ✅ พร้อม decision; commit `docs(handoff): D-X decided — <decision>`
- หรือ commit เลย structural piece (เช่น migration 0044) → ภูม ลบ entry นี้ใน batch ถัดไป.
