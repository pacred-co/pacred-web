# 🔴🔴🔴 URGENT → เดฟ (2026-07-13) — MOMO cargo แทรคซ้ำ/กล่องเกิน · ต้อง "รัน script" ไม่ใช่แค่ deploy code

## ⚠️ อ่านตรงนี้ก่อน — ทำไม "อัพแล้วยังเหมือนเดิม"
พี่เดฟ deploy **CODE** ไปแล้ว แต่ **แถวข้อมูลซ้ำยังอยู่ใน DB ครบ** (ผม probe prod ยืนยัน: `1783051207` ยัง **39 แถว / 149 กล่อง** · 18 แถวใต้ตู้หลอก PR20260701-EK01 ยังอยู่). **โค้ดลบข้อมูลเก่าที่ซ้ำไม่ได้ — ต้องรัน script data-fix บน prod.** นี่คือเหตุผลเดียวที่ยังเหมือนเดิม.

report-cnt (19) vs forwarders/52327 (39) ต่างกันเพราะ report-cnt กรองตู้เดียว (ซ่อนตัวซ้ำที่อยู่ตู้หลอกอีกใบ). **รัน script แล้ว = ทั้ง 2 หน้าเป็น 20 เท่ากัน.**

---

## ✅ รัน script ตัวเดียวจบ (dry-run verified บน prod แล้ว)

`scripts/fix-momo-cargo-rows-2026-07-13.mjs` — dry-run default · backup JSON · skip billed (5/6/7) · owner เคาะ dry-run ก่อน `--apply`.

```bash
# 1) DRY-RUN ดูก่อน (ไม่เขียน) — ให้ภูม/พี่ป๊อป ดูยอด
PROD_DB_PW='<prod pw จาก chat>' node scripts/fix-momo-cargo-rows-2026-07-13.mjs

# 2) owner เคาะแล้ว → apply
PROD_DB_PW='<prod pw จาก chat>' node scripts/fix-momo-cargo-rows-2026-07-13.mjs --apply
```

**Dry-run บน prod ตอนนี้ = แก้ auto 30 · flag 20:**
- **PHASE 1 · ลบตู้หลอกซ้ำ = 19 แถว** (PR075 · 1783051207 · เก็บตู้จริง GZE · ข้าม billed) → แก้ 1783051207-type (39→20)
- **PHASE 2 · แถวหลักซ้ำแถวย่อย = 11 แถว MONEY-NEUTRAL** (เช่น 1782103385-type: แถวหลักก้อนรวม + แถวย่อย → นับซ้ำ). แก้ให้แถวหลัก="กล่อง 1" โดยลบส่วนแถวย่อยออก (`base -= Σsiblings` · Σ รวม**คงเดิม**) + zero ราคาแถวหลัก → **re-price ที่ /review** (ราคาเป็น 0 รอคิดใหม่)
- **⚠️ FLAG 20 แถว = ต้องแต้ม** (MOMO ให้เลขมั่ว · แถวย่อยหนักเกินก้อนรวม เช่น 52137: sib 19,991kg > base 150 · 52132: sib 1268 > base 185) → **auto ไม่ได้ · อัพ packing list แต้มต่อตู้**

---

## หลัง --apply เดฟ ทำ 2 อย่าง
1. **re-price 11 แถว PHASE 2** ที่ราคาเป็น 0 — เข้า `/review` หรือ re-run pricing (11 แถว · เร็ว)
2. ส่ง list 20 FLAG ให้ ภูม → อัพ packing list แต้มต่อตู้

## Root cause (กันไม่ให้เกิดใหม่ · CODE · เดฟ)
`lib/admin/commit-momo-row-core.ts:391` — `cabinetForDisplay = container_batch_no ?? momo_container_no` → fallback ไป placeholder เมื่อตู้ยังไม่ปิด. **แก้: ถ้า `isMomoRoutingPlaceholder(momo_container_no)` → เขียน `""` แทน** (helper: `lib/admin/momo-container-resolve.ts:46`). + re-add cross-cabinet dedup ที่ revert (`232943b2`) เวอร์ชันฉลาดขึ้น (เช็ค exact ftrackingchn ทุกตู้).

**สรุป: ภูมิไม่ต้องแก้ทีละออเดอร์ — เดฟ รัน script 1 ครั้ง = แก้ 30 ออเดอร์. เหลือ 20 ที่ MOMO มั่วจริงๆ = แต้ม.**
