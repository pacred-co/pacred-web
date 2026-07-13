# 🧾 SAVE-POINT (ภูม · 2026-07-13 · กลับไปทำต่อที่บ้าน) — MOMO cargo แทรคซ้ำ/กล่องเกิน + จัดหน้า MOMO

**Branch `Poom-pacred` = HEAD (push ครบ · origin==local).** คอมบ้าน resume: `git fetch && git pull origin Poom-pacred`. sync จาก dave-pacred แล้ว (มี mig 0252/0253 ของเดฟ). prod pw chat-only `DqOzfEZVXfMHIryz`. localhost = **DEV** (`lozntlidlqqzzcaathnm`). gate เขียวทุก commit (tsc 0 · eslint 0).

## ✅ ทำเสร็จวันนี้ (commit บน Poom-pacred)
- `4a63cdcb` จัดหน้า `/admin/api-forwarder-momo` เป็น 3 กลุ่ม + "วิธีใช้" ทุกเครื่องมือ
- `73b9b095` /sync ปุ่มเดียวจบ "ดึงทั้งหมดเดี๋ยวนี้" + ยุบ 3 รอบเป็นขั้นสูง
- `56a743a7` **forwarder detail หัวข้อ "จำนวน" โชว์กล่องรวมทั้งชิปเมนต์** (52585: 1→2 · verify แล้ว)
- `444ed2f2` **script รวม `scripts/fix-momo-cargo-rows-2026-07-13.mjs` + handoff เดฟ**

## 🔴 ค้าง / ต้องทำต่อ
1. **เดฟ ต้อง "รัน" script บน prod (ไม่ใช่แค่ deploy code)** — `docs/handoff-dave-2026-07-13-MOMO-DUP-CLEANUP-URGENT.md`. probe ยืนยัน: แถวซ้ำ 39/149 ของ 1783051207 ยังอยู่ใน DB. รัน `node scripts/fix-momo-cargo-rows-2026-07-13.mjs --apply` (dry-run + owner เคาะก่อน) = auto แก้ 30 ออเดอร์ (19 dedup + 11 base-reconcile money-neutral). หลัง apply: re-price 11 แถว Phase-2 ที่ราคา=0.
2. **~12 ออเดอร์ flag = ต้องแต้ม** (MOMO เลขมั่ว sib>base · เช่น 52137 sib 19,991 > base 150). อยู่ 5-6 ตู้ → อัพ packing list แต้มต่อตู้.
3. **เพิ่ม Phase 3 ให้ script (ยังไม่ทำ · ภูม จะเคาะ):** auto-ลบ "ก้อนรวมซ้ำเป๊ะ" (base kg == sib kg · 8 ออเดอร์: 52399/52398/52380/52429/52418/52559/52433/52510) → เหลือ ~12 ที่ต้องแต้มจริง.
4. **code fix กันซ้ำใหม่ (เดฟ · prod-deploy):** `commit-momo-row-core.ts:391` ถ้า `isMomoRoutingPlaceholder(momo_container_no)` → เขียน `""` แทน (helper momo-container-resolve.ts:46) + re-add cross-cabinet dedup ที่ revert `232943b2`.
5. **(offer ค้าง) sweep หน้าอื่นหาบั๊กเลขกล่องแบบเดียวกัน** — list `/admin/forwarders`, report-cnt, หน้าลูกค้า (anchor-row vs shipment-total).

## 💡 ข้อสรุปสำคัญ (ที่พิสูจน์แล้ววันนี้)
- **cron MOMO ไม่ได้พัง** — prod ดึงทุก 5 นาที (291 ครั้ง/24ชม.). "261 ชม." บน localhost = artifact ของ DEV (dev ไม่มี cron รัน).
- **commit เช้า `9f329765` ไม่ได้ทำให้ซ้ำ** — แถวซ้ำ fdate 07-05/07-10 (ก่อน deploy วันนี้). **ห้าม revert.**
- **ต้นตอ "เละ" = MOMO API เน่า** ตั้งแต่แก้ API (น้ำหนักไม่ตรงกันเอง). ทางแก้ระยะยาว: **ใช้แต้มเป็น source หลักของน้ำหนัก/กล่อง · MOMO แค่สถานะ.**
- `famountcount` (การรวมกล่อง) = legacy จริง (forwarder.php:1936 `$fAmountCount==1//รวมกล่อง`) — ปล่อยไว้.
