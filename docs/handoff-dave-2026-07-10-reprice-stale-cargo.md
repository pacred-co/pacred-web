# 🔴 Handoff → เดฟ (2026-07-10) — re-price stale cargo (money · prod)

**Branch:** `Poom-pacred` (pull ก่อน) · tip มี `scripts/reprice-stale-cargo-comparison-2026-07-10.mjs`
**สรุปให้พี่เดฟ:** ภูม เจอบั๊กราคาบนหน้ารายการนำเข้า — order เก่าบางอันเก็บเงินลูกค้า **ขาด** เพราะตั้งราคาก่อนกฎ "ค่าเทียบ 250" (2026-07-08). **โค้ดปัจจุบันถูกแล้ว** (order ใหม่ราคาถูก) — เหลือแค่ **re-price ข้อมูลเก่าที่ค้าง stale บน prod** ตัวนี้แหละที่ต้องพี่เดฟรัน (money · แตะ ftotalprice ที่ลูกค้าจะโดนเรียกเก็บ).

---

## 1. ปัญหา (ภูม flag)

หน้า `/admin/forwarders/[fNo]` — ตาราง **"รายการสินค้า"** (ยอดเก็บลูกค้าจริง · stored) โชว์ **ค่านำเข้าจีน-ไทย คิดตามปริมาตร (ถูกกว่า)** ทั้งที่กล่อง preview (per-tracking editor) คำนวณ **ถูก = คิดตามน้ำหนัก**.

ตัวอย่าง **#52184 (LJ20464732 · PR10190):** 110kg / 0.29952คิว = **367 KGPerCBM**
- stored: CBM `0.29952 × 3,700 = ฿1,108.22` (frefprice='2') ← **ผิด (เก็บขาด)**
- ถูก: KG `110 × 15 = ฿1,650.00` (367 > 250 → คิดน้ำหนัก) ← กล่อง preview โชว์ตัวนี้

## 2. ราก (แกะแล้ว · ไม่ต้องแก้โค้ด)

- Order ตั้งราคา **ก่อน 2026-07-08** ใช้กฎเก่า "default คิดตามคิว/CBM" (2026-06-23) → dense cargo โดนคิด CBM (ถูกกว่า) แล้ว **ค้าง stale**.
- **โค้ดปัจจุบันถูก:** `lib/forwarder/live-rate.ts :: computeAndFillForwarderImportRate` (เรียกตอน MOMO commit) ใช้ `comparisonEnabled = true` เสมอ + threshold `clampComparison(250)` → order ใหม่ dense คิดน้ำหนักเอง. **verify แล้ว: order หลัง 8/7 = 0 อันที่ CBM ผิด.**
- ⚠️ script เดิม `backfill-momo-forwarder-rates.mjs` **ใช้ไม่ได้กับเคสนี้** — (1) fill เฉพาะแถว frefrate=0 (นี่ frefrate มีแล้ว) (2) resolver mirror ข้างในมัน **stale** (ยังเป็น "ราคามากสุด" ไม่มีกฎ 250-always). อย่าใช้ตัวเก่า.

## 3. Fix — `scripts/reprice-stale-cargo-comparison-2026-07-10.mjs`

Replay กฎ **ปัจจุบัน** (comparisonEnabled=true · clamp→250) บนแถว **already-priced un-billed** แล้วเขียนเฉพาะ `frefrate / frefprice / ftotalprice`.

**Money-safety ในตัว script:**
- ข้าม `fstatus IN (0,5,6,7)` — **ไม่แตะ order ที่ออกบิลแล้ว/ยกเลิก** (บิลอิง ftotalprice เดิม)
- ข้าม `customrate='1'` — **ไม่แตะราคาที่แอดมินกรอกเอง**
- แก้เฉพาะแถวที่ราคาใหม่ **ต่างจากเดิม > ฿0.01**
- ข้ามแถวที่หา rate ไม่เจอ (ไม่เขียน ฿0)
- dry-run default · idempotent (รันซ้ำหลัง apply = ไม่เจอ diff)
- ⚠️ **ไม่รวม** doc-tier discount (ฝากโอน+ใบกำกับ · −฿800/คิว) — order พวกนั้นให้ pricer กด "บันทึก" เอง (มีน้อย)

## 4. รันบน prod (พี่เดฟ · owner เคาะ)

```bash
git checkout Poom-pacred && git pull

# 1) dry-run — ดู list + Σ delta ก่อน (ไม่เขียนอะไร)
node --env-file=.env.local scripts/reprice-stale-cargo-comparison-2026-07-10.mjs

# 2) ถ้า owner โอเค → apply (เขียนจริง)
node --env-file=.env.local scripts/reprice-stale-cargo-comparison-2026-07-10.mjs --apply

# (option) เจาะ 1 order ก่อนถ้าอยากลองทีละอัน:
node --env-file=.env.local scripts/reprice-stale-cargo-comparison-2026-07-10.mjs --only 52184 --apply
```

**ผล DEV (อ้างอิง · prod จะต่างตัวเลข):** candidates 120 · **stale 45** · Σ **+฿128,321** (บวก = เก็บขาด ได้คืน). #52184 apply แล้ว verify หน้าเว็บ ตาราง = **฿1,650** ✓.

## 5. 🔴 owner ต้องเคาะก่อน apply

- นี่ **ขึ้นบิลลูกค้า** — dense cargo เก่าจะโดนเรียกเก็บ **เพิ่ม** (เดิมเก็บขาด). ยอด +฿ ต่อ order + Σ ให้ owner ดูจาก dry-run ก่อน.
- แถวที่ **ออกบิลไปแล้ว** (fstatus ≥ 5) script **ไม่แตะ** โดยตั้งใจ — พวกนั้นถ้าเก็บขาดจริงคือ decision บัญชี (เก็บเพิ่ม/ปล่อย) ไม่ใช่ bulk rewrite. ถ้า owner อยากรวมพวกนั้นด้วย = งานแยก.
- แนะนำ backup ก่อน apply (dump `id, frefrate, frefprice, ftotalprice` ของแถวที่จะแก้ เผื่อ rollback).

## 6. โค้ด UI ที่ push มาด้วย (Poom-pacred · เกี่ยวเนื่อง)

- `4886b89d` — กล่องราคานำเข้า: บรรทัด **"หาค่าเทียบ"** โชว์เสมอ (อธิบายว่าเลือกน้ำหนัก/ปริมาตรเพราะอะไร) + เปิด section ต้นทุน/กำไร default. **ไม่กระทบ money** (display).
- `19f50214` — script ตัวนี้.
