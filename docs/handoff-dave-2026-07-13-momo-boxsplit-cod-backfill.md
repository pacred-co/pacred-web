# 🔴 Handoff → เดฟ (2026-07-13) — MOMO box-split + COD ค่าส่งไทย (code deployed) + EXISTING-data backfill (money · prod)

---
## ✅ เดฟ ปิดงาน backfill (2026-07-13 · owner เคาะ "apply 6 SAFE + paymethod")
ตรวจงาน ภูม แล้ว: **โค้ด `9f329765` money-safe ผ่าน** (COD gate pure/testable · valuate จาก aggregate ถูก).
**แต่ handoff SQL BUG-1 หาแบบเหมารวม 21 แถว = อันตราย** — classify แล้ว (`scripts/momo-boxsplit-backfill-classify-2026-07-13.mjs`) ปลอดภัยจริงแค่ 6/21:
- **✅ APPLIED 6 SAFE** (agg > cur + box_detail ยืนยัน agg = under-bill box-1 จริง · unbilled fstatus 3/4):
  52109 PR021 · 52115 PR009 · 52128 PR10601 · 52111 PR102 · 52095 PR012 · 52305 PR079.
  re-value dims → aggregate + re-price ผ่าน `backfill-momo-forwarder-rates.mjs` (proven engine · rate จากการ์ดลูกค้าเอง).
  **Σ ฿20,271 → ฿71,083 (+฿50,811 ที่คิดขาด)** · scripts: `momo-boxsplit-backfill-apply-2026-07-13.mjs` (stage 1) → backfill (stage 2) · backup `momo-boxsplit-backfill-backup-2026-07-13.json`.
- **🔴 15 แถว DO-NOT-TOUCH** (re-value จะทำลาย/ลดบิล — ต้องโกดัง verify รายตัว):
  agg=0 (5886064 PR103 · PR7083 ×2 · PR086) · agg<cur+box_detail≈cur (staff วัดแล้ว: PR075 ฿34k · PR146 · PR179 ×2 · PR548 · PR543 · PR566 · PR10190) · box_detail≠agg stale (PR067 #52137 = packing-error เดิม · PR047 · PR179).
- **✅ paymethod normalize** 52577 → '2' (COD hygiene).
- **⏳ STAGE 3 (box-split เป็น N แถวยิง):** server-only lib → เกิดตอน measure/commit/cron ถัดไป (money-neutral · deferred).

**บทเรียน:** MOMO aggregate columns เชื่อไม่ได้เสมอ — บาง row ว่าง/stale/เล็กกว่าจริง + staff วัดแก้แล้ว. blanket re-value = พัง. ต้อง corroborate ด้วย Σ(momo_box_detail) ก่อน.
---


**Branch:** `Poom-pacred` @ `9f329765` (pull ก่อน) · ภูม flag 2 บั๊ก prod จากรูป (800206224068 / KY984284755).

## สรุปให้พี่เดฟ
ผม (ภูม/Claude) แก้ **โค้ด** 2 บั๊กแล้ว (commit `9f329765` · money-safe · tsc/eslint/tests เขียว · verify DEV):
1. **MOMO box-split** — commit valuate จาก aggregate columns (แก้ under-bill ~5×) + **split-at-commit** (แตกเป็น N แถวยิงได้จริงตั้งแต่ดึงเข้า) + **เอาปุ่ม "แตกกล่อง" ออก**.
2. **COD ค่าส่งไทย gate** — มองระดับชิปเมนต์ (sibling COD → ยกเว้นทั้งกลุ่ม) → COD กดออกบิลได้แล้ว.

**โค้ดกระทบเฉพาะ commit ใหม่ (going-forward)** — ตู้เก่าที่ commit ไปแล้วยังค้าง ต้องพี่เดฟ backfill บน prod (money · owner เคาะยอด).

---

## 🔴 1. Backfill BUG-1 — ตู้เก่าที่ under-bill + ยังไม่แตกกล่อง (owner เคาะก่อน · ขึ้นบิล)

**เคสตัวอย่าง (prod · read-only verified):** tb_forwarder **52305** `800206224068` (PR079 · fstatus 4)
- ปัจจุบัน: `fweight=46.50 · fvolume=0.087480 · famount=3 · ftotalprice=฿437.40` = **กล่องแรกกล่องเดียว**
- ที่ถูก: `momo_import_tracks.weight_kg=249 · cbm=0.426905 · quantity=13` (aggregate) · `momo_box_detail` มี **8 กล่อง** (box_tracking 800206224068,-2..-8 · Σ 218kg/0.3686CBM)
- → เก็บเงินขาด ~5 เท่า + โกดังยิง -3 ไม่ได้

**ทำไม self-heal ไม่ได้:** row priced บน 46.5 แล้ว → split เดิม refuse (weight_mismatch 218≠46.5).

**วิธี backfill (dry-run + backup ก่อน · เฉพาะ fstatus 1-4 · ข้าม 5/6/7 billed):**
1. **หา** unbilled multi-box aggregate ที่ fweight ≉ Σ(box_detail):
   ```sql
   SELECT f.id, f.ftrackingchn, f.fweight, f.fvolume, f.famount, f.ftotalprice, f.fstatus,
          m.weight_kg AS agg_kg, m.cbm AS agg_cbm, m.quantity AS agg_qty,
          (SELECT count(*) FROM momo_box_detail b WHERE b.base_tracking = f.ftrackingchn) AS n_boxes
     FROM tb_forwarder f
     JOIN momo_import_tracks m ON m.momo_tracking_no = f.ftrackingchn
    WHERE f.fstatus IN ('1','2','3','4')
      AND (SELECT count(*) FROM momo_box_detail b WHERE b.base_tracking = f.ftrackingchn) > 1
      AND abs(coalesce(f.fweight,0) - coalesce(m.weight_kg,0)) > greatest(1, m.weight_kg*0.02);
   ```
2. **Re-value** แต่ละแถว: `UPDATE tb_forwarder SET fweight=m.weight_kg, fvolume=m.cbm, famount=round(m.quantity) …` (จาก momo_import_tracks columns).
3. **Re-price**: เรียก `computeAndFillForwarderImportRate(admin, id)` (server-lib · "server-only" → รันผ่าน admin action/route หรือ tsx ที่ import ได้ · ไม่ใช่ plain .mjs).
4. **Split**: `splitAggregatedMomoBoxRows(admin, [base], undefined, { allowPriced: true })` → 8 แถวยิงได้ (dims-fallback จัดสรร Σ=aggregate เป๊ะ · money-neutral).
   - หรือ: extend `scripts/split-aggregated-momo-boxes-2026-07-02.ts` (มี pattern อยู่แล้ว) ให้ทำ 2-4 ในตัว.
5. **⚠️ owner เคาะยอด:** re-value = ยอดบิลขึ้น (แก้ under-charge บน live cargo) → ให้ ภูม/พี่ป๊อป ดู Σ delta จาก dry-run ก่อน `--apply`.

**หมายเหตุ 218 vs 249:** MOMO ให้เลขไม่ตรงกัน (aggregate column 249 · Σ box_detail 218). โค้ดใหม่ + backfill ใช้ **aggregate columns (249)** = basis ที่ระบบออกแบบไว้ (Σ track_details). split ใช้ dims-fallback จัดสรร 249 ลง 8 กล่อง money-neutral. **ถ้า ภูม อยากบิลตาม box_detail (218) แทน = เปลี่ยน FIX 1 ให้ valuate จาก Σ(momo_box_detail) — งานแยก · owner เคาะ.**

## 🟡 2. Backfill BUG-2 — normalize paymethod พี่น้อง (optional · data-hygiene · ไม่ขึ้นบิล)
gate ใหม่ปลดล็อกได้โดยไม่ต้องแก้ data. แต่เพื่อให้ surface อื่น (COD badge/collect-total) อ่านตรง:
```sql
-- dry-run count ก่อน · แล้ว --apply
UPDATE tb_forwarder s SET paymethod='2'
  FROM tb_forwarder b
 WHERE b.ftrackingchn = regexp_replace(s.ftrackingchn, '-[0-9]+(/[0-9]+)?$', '')
   AND b.paymethod='2' AND s.paymethod<>'2'
   AND s.fstatus IN ('1','2','3','4','5');   -- e.g. 52315 KY984284755-2/2 → '2'
```
**ห้ามแตะ ftransportprice** — ฿0 ถูกต้องสำหรับ COD (เอกชนเก็บปลายทาง).

## 🟢 3. Owner option (ไม่ได้ทำ · รอเคาะ)
flip cron `liveBoxSplit` (propagate-live-data.ts:427) → `{ allowPriced: true }` = auto-แยกตู้เก่า unbilled ทั้ง platform (money-neutral) แต่โค้ดเดิมเตือน "human-only ไม่ใช่ cron ไม่มีคนดู" (per-box weight เป็น dims-estimate). ผมเลย**ไม่ flip** — split-at-commit (ใหม่) + backfill (ข้อ 1) พอแล้ว. ถ้าอยาก mass-auto = เคาะ.
