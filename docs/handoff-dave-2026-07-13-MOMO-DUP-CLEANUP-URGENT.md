# 🔴🔴 URGENT Handoff → เดฟ (2026-07-13) — MOMO แทรคหาย/ซ้ำเละบน prod · batch cleanup ทั้ง platform

**Branch:** `Poom-pacred` (pull ก่อน) · ภูม flag บน prod รูป 52305 / 52327 / MOMO Live 800206224068.
**สรุปให้พี่เดฟ 1 บรรทัด:** MOMO แตกกล่องซ้ำ (คนละตู้) + บางแถวไม่แตก/น้ำหนักเพี้ยน. **ไม่ใช่จาก commit วันนี้** (พิสูจน์ด้วยวันที่ข้างล่าง) — แต่ต้อง batch cleanup + แก้โค้ดกันซ้ำ. **ทำทีเดียวทั้ง platform ตาม 4 ส่วนนี้.**

---

## 🔬 พิสูจน์ก่อน: commit เช้าวันนี้ (`9f329765`) ไม่ได้ทำให้ซ้ำ
- แถวซ้ำ 1783051207 สร้าง **fdate 2026-07-05 + 07-10** (ก่อน deploy วันนี้ 13 ก.ค.)
- แถวสร้าง **วันนี้ 12 แถว = unique หมด ไม่มี dup** (probe ยืนยัน)
- → **ห้าม revert `9f329765`** — มัน innocent + fix valuation ถูก. revert = fix หายเปล่า

---

## 🐛 3 บั๊ก (root ต่างกัน)

### Bug A — กล่องเดียวกัน 2 แถว คนละตู้ (ซ้ำ · รูป 52327 = 39 แถวจาก 20 tracking)
กล่องถูกสร้าง 2 ทางไม่เช็คกัน:
- **ทาง A:** ปิดตู้ → แตกกล่องใต้ **ตู้จริง** (GZE260704-1) ✅
- **ทาง B:** MOMO import-track คืนกล่องย่อยใต้ **routing placeholder** (`PR20260701-EK01`) → commit เป็นแถวใหม่ ❌ = "ตู้หลอก"
- **Scope prod:** 3 base tracking · 1783051207 (19 dup) + 302162248998 + JYM188058949964 (⚠️ JYM มี 1 billed)

### Bug B — ไม่แตกกล่อง + น้ำหนักเพี้ยน (รูป 52305 = 800206224068 ขึ้นแทรคเดียว 46.5kg ทั้งที่ 8 กล่อง 249kg)
- commit ก่อน fix ผม → เป็นแถวเดียว เอาน้ำหนักกล่องแรก
- **Scope prod:** 21 แถว (fstatus 1-4) ที่ momo_box_detail >1 กล่อง แต่ fweight ≠ aggregate

### 🔴 ความจริงที่ต้องบอก owner: **MOMO เชื่อไม่ได้ทั้ง box-1 และ aggregate**
21 แถว Bug B — MOMO aggregate ก็มั่ว: บางอัน agg=0 (52320/52433/52510/52559), บางอัน fweight **สูงกว่า** agg (52426: 958 vs 553 · 52434: 987 vs 247 → re-value ลง = **ลดบิล เสียเงิน**), 52137: 5780 vs 150. **→ re-value อัตโนมัติจาก MOMO ไม่ได้** ต้องใช้ **แต้ม packing list** เป็นตัวจริง. นี่คือรากของ "ไม่จบซักที" — source (MOMO) มันเสีย

---

## ✅ วิธีแก้ — 4 ส่วน (ทำทีเดียวทั้ง platform)

### ส่วนที่ 1 · Bug A dedup — SAFE BATCH (script ผมเขียนให้ · ลบตัวซ้ำใต้ placeholder)
`scripts/dedup-momo-placeholder-cabinet-2026-07-13.mjs` — ลบแถว placeholder ที่มี exact-ftrackingchn twin ใต้ตู้จริง · **เก็บตู้จริง** · skip billed · backup JSON.
```
dry:   PROD_DB_PW='<prod>' node scripts/dedup-momo-placeholder-cabinet-2026-07-13.mjs
apply: PROD_DB_PW='<prod>' node scripts/dedup-momo-placeholder-cabinet-2026-07-13.mjs --apply
```
- dry-run verified: 19 แถว (PR075 1783051207) → ลบ placeholder · เก็บ GZE. 0 billed.
- ⚠️ owner ดู dry-run เคาะก่อน `--apply` (ลบ billable row บน prod)

### ส่วนที่ 2 · Bug B แตกกล่องให้โกดังยิงได้ — SAFE (money-neutral · script เดิม)
`scripts/split-aggregated-momo-boxes-2026-07-02.ts --priced` → แตก aggregate เป็น N กล่อง (Σ = aggregate เป๊ะ · บิลไม่เปลี่ยน) → โกดังยิง -N ได้. **ไม่แก้ under-bill** (แค่แตก).
```
dry:   SUPABASE_DB_PASSWORD='<prod>' tsx scripts/split-aggregated-momo-boxes-2026-07-02.ts --priced
apply: SUPABASE_DB_PASSWORD='<prod>' tsx scripts/split-aggregated-momo-boxes-2026-07-02.ts --priced --apply
```

### 🔴 ส่วนที่ 3 · Bug B re-value under-bill (21 แถว) — ทำ auto ไม่ได้ · ต้องแต้ม+owner
MOMO มั่ว → **ต้องอัพ packing list แต้มต่อตู้** ที่ `/admin/api-forwarder-momo/warehouse-reconcile` (หรือ packing-upload) → อัพเดตน้ำหนัก/CBM จริง → re-price. **batch by ตู้ ไม่ใช่ทีละออเดอร์** (1 ตู้ = 1 อัพ). 21 แถวที่ต้องทำ (id · tracking · ตู้):
52095/52109/52110/52111/52115/52128/52132/52137/52305/52320/52368/52370/52401/52403/52421/52422/52426/52433/52434/52510/52559 — grep container จาก probe หรือ `select id,ftrackingchn,fcabinetnumber from tb_forwarder where id in (...)`. **⚠️ 52426/52434 fweight สูงกว่า MOMO → เช็คแต้มว่าตัวไหนถูกก่อนแก้ (อย่าลดบิลมั่ว).**

### ส่วนที่ 4 · CODE FIX กันซ้ำอีก (เดฟ เขียน · เพราะ prod deploy + revert history = ของเดฟ)
2 จุดใน `lib/admin/commit-momo-row-core.ts`:
1. **กัน placeholder เป็นตู้** — L391 `cabinetForDisplay = container_batch_no ?? momo_container_no ?? ""` → fallback ไป `momo_container_no` = placeholder (`isMomoRoutingPlaceholder` มี helper ที่ `lib/admin/momo-container-resolve.ts:46`). **ถ้าเป็น placeholder → เขียน `""` (ยังไม่มีตู้) แทน** ไม่ให้ commit ใต้ตู้หลอก.
2. **re-add cross-cabinet dedup** — commit "dedup by exact ftrackingchn" ถูก revert (`232943b2`). ทำเวอร์ชันฉลาดกว่า: ก่อน INSERT เช็คว่า **exact ftrackingchn มีในระบบแล้วไหม (ไม่สนตู้)** → ถ้ามี = skip/merge (ไม่สร้างซ้ำ). ⚠️ เดฟ รู้ว่าทำไม revert เดิม → ทำให้ไม่พังแบบเก่า.
- (ผม ภูม/Claude ทำ ส่วน 1+2 script แล้ว · ส่วน 4 code ให้เดฟ เพราะแตะ prod-deploy + revert history)

---

## สรุปให้ owner เคาะ
1. Bug A dedup (ส่วน 1) → รัน dry-run โชว์ 19+ แถว → เคาะ → apply
2. Bug B แตกกล่อง (ส่วน 2) → money-neutral รันได้เลย (dry ก่อน)
3. Bug B re-value (ส่วน 3) → อัพ packing list แต้มต่อตู้ (owner/ภูม) — **ไม่มีทาง auto เพราะ MOMO มั่ว**
4. Code fix (ส่วน 4) → เดฟ deploy กันซ้ำใหม่
