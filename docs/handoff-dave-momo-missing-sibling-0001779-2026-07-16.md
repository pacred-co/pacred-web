# 🔧 HANDOFF (เดฟ · PROD data-fix) — MOMO แตกกล่องหาย: fwd 52135 `0001779` ขาดพี่น้อง `0001779-2`

> **ผู้ส่ง:** ภูม (branch Poom-pacred) · **ผู้รับ:** เดฟ (เจ้าของ prod · ภูม read-only)
> **วันที่:** 2026-07-16
> **ระดับ:** money-adjacent (aggregate ที่ยังไม่แตก → เสี่ยง mis-bill ถ้าถูกวางบิลเป็นก้อน). **UNBILLED (fstatus 4) → ยังไม่มีบิล → ไม่ต้อง refund/re-bill.** แต่ **ทุก step = dry-run + backup ก่อน --apply** เสมอ.
>
> **เคสที่ ภูม แจ้ง (prod pacred.co.th/admin/forwarders/52135):** tb_forwarder id **52135** · ftrackingchn `0001779` · famount **18** กล่อง · fweight **254** · fvolume **0.880144** · โกดัง กวางโจว (MOMO) · fstatus **4 (ถึงไทย)** · **UNBILLED**. **MOMO Live โชว์ 2 แทรค** (`0001779` + `0001779-2`) แต่ **ระบบเรามีแถวเดียว** (aggregate 18 กล่อง) — แถว `0001779-2` หายไป.

---

## 0) สรุปสั้น (ให้ ภูม อ่านก่อน — ภาษาพูด)

- **แถว `0001779-2` หายเพราะ**: ระบบสร้าง "แถวลูก" (พี่น้องที่แตกกล่อง) จากตาราง `momo_box_detail` เท่านั้น. ตารางนี้เติมกล่องจากการ scrape กระดาน MOMO Live ฝั่งจีน — พอพัสดุเดินสถานะถึงไทยแล้ว มันหลุดจากกระดานจีน กล่องที่ 2 เลย **ไม่เคยถูกเก็บลง `momo_box_detail`** → ระบบมองไม่เห็นว่ามันมี 2 กล่อง → เลยไม่แตกให้ (จำนวน 18 มาจากอีกที่นึงที่รู้ว่ามี 18 ชิ้น แต่ไม่ได้เติมกล่องลง box_detail).
- **แก้ยังไง (เดฟ ทำบน prod)**: ต้อง **เติมกล่องกลับเข้า `momo_box_detail` ก่อน** (จากข้อมูล MOMO ที่ยังเก็บถาวรใน `momo_container_closed.raw.track_details`) แล้วค่อยสั่งแตก. **ทำ dry-run + backup ก่อนเสมอ · ยอดรวม (18 กล่อง / 254 กก. / 0.880144 คิว) ต้องคงเดิมเป๊ะ (money-neutral).**
- **กันเกิดซ้ำ (โค้ด)**: มี spec ให้เดฟ ใน §5 — เติม `momo_box_detail` จาก `track_details` ตอน sync (แหล่งถาวร ไม่พึ่งกระดานจีน). **ยังไม่ได้เขียนโค้ดนี้** เพราะมันแตะ pipeline ที่คิดเงิน + มีคำถาม convention (per-piece vs box-total) ที่ต้องดูข้อมูล prod จริงก่อน — เดฟ มี prod ตรวจได้ (ผม read-only เลยไม่เดา).
- **ผม (ภูม-session) ทำแล้ว + push Poom-pacred**: สคริปต์ audit อ่านอย่างเดียว (read-only) หา **ทุกเคส**ที่อยู่ในสภาพเดียวกันนี้ → `scripts/audit-momo-missing-siblings-2026-07-16.mjs`. เดฟ รันดูก่อนว่านอกจาก 0001779 มีตัวอื่นอีกไหม.

---

## 1) WHY `0001779-2` หาย (root cause · ยืนยันจาก 3-agent source trace)

การสร้างพี่น้อง `-N` มี **ทางเดียว** = `splitAggregatedMomoBoxRows()` (`lib/integrations/momo-web/split-box-rows.ts:192`), เรียกจาก 3 จุด:
- commit — `lib/admin/commit-momo-row-core.ts:773`
- cron pass 5 — `lib/integrations/momo-web/propagate-live-data.ts:552`
- backfill — `scripts/split-aggregated-momo-boxes-2026-07-02.ts`

**ทั้ง 3 ตัดสิน "base นี้มี >1 กล่องไหม" จากตาราง `momo_box_detail` เท่านั้น** (ไม่ได้อ่านจาก `famount` / container_closed):
- `findMultiBoxBases()` (`split-box-rows.ts:157`) → คืนเฉพาะ base ที่ `COUNT(box_tracking) > 1` ใน `momo_box_detail`.
- `splitAggregatedMomoBoxRows()` filter `rows.length > 1` (`split-box-rows.ts:229`).

**`momo_box_detail` มี auto-populator ตัวเดียว = การ scrape กระดาน MOMO Live ฝั่งจีน** (`box-detail.ts:297 fillMomoBoxDetails`). ⚠️ `sync.ts` step 2.5 (`lib/integrations/momo-isolated/sync.ts:341-408`) **ไม่เขียน** `momo_box_detail` — เขียนแค่ `container_batch_no` + aggregate weight/cbm ลง `momo_import_tracks`.

**→ ราก (most-likely):** 52135 อยู่ **fstatus 4 (ถึงไทย)** = หลุดจากกระดานจีนแล้ว → ตอน `0001779-2` เดินสถานะพ้นกระดานก่อน pass 3 จะเก็บ → `momo_box_detail` **ไม่เคยมีแถว `0001779-2`** → base `0001779` ไม่เคยเป็น candidate ของ pass 5/6 → aggregate ค้างเป็นแถวเดียว. (durable-union fix 07-14 ช่วยไม่ได้ เพราะ `findMultiBoxBases` ก็ derive จาก `momo_box_detail` เอง.)

**Second-order (เฉพาะถ้า box_detail มี 2 แถวจริง):** Σ(box weight/cbm) ของ 2 กล่องไม่ตรง aggregate 254/0.880144 ภายใน 2% → guard REFUSE (`weight/cbm_mismatch` · `split-box-rows-plan.ts:333-361`) → ปล่อย aggregate ไว้. **Query A ข้างล่างชี้ขาดว่าเป็นเคสไหน.**

---

## 2) VERIFY-ON-PROD (read-only · รันก่อนแตะอะไร)

> เชื่อม prod แล้วรันเรียงตามนี้ อ่านผลก่อนไป §3. (ใช้ prod pw แชทเท่านั้น — อย่าเขียนลงไฟล์)

```sql
-- A. THE DECIDER — box_detail มี "0001779-2" ไหม? (root gate) · บั๊กจริง ⇔ คืน 0 หรือ 1 แถว
SELECT base_tracking, box_tracking, quantity, weight_kg, cbm,
       width, length, height, last_synced_at
FROM momo_box_detail
WHERE base_tracking = '0001779'
ORDER BY box_tracking;

-- B. tb_forwarder — ยืนยัน 1 aggregate ไม่มี -2, unbilled, reforder ว่าง
SELECT id, ftrackingchn, fstatus, famount, famountcount,
       fweight, fvolume, ftotalprice, reforder, userid, fcabinetnumber
FROM tb_forwarder
WHERE ftrackingchn = '0001779' OR ftrackingchn LIKE '0001779-%'
ORDER BY ftrackingchn;

-- C. staging — มี ptr ค้างไหม (committed_forwarder_id ต้องชี้ 52135)
SELECT id, momo_tracking_no, quantity, weight_kg, cbm,
       committed_at, committed_forwarder_id, shipment_status, container_batch_no
FROM momo_import_tracks
WHERE momo_tracking_no = '0001779' OR momo_tracking_no LIKE '0001779-%';

-- D. ⭐ container_closed — แหล่ง DURABLE (มี track_details รายกล่องครบไหม + convention)
--    ดู kg/cbm/width/height/length/total_quantity ของแต่ละ reTrack (0001779 + 0001779-2)
SELECT momo_container_no,
       jsonb_array_length(raw->'track_details') AS n_details,
       jsonb_path_query_array(raw->'track_details', '$[*] ? (@.reTrack like_regex "^0001779")') AS boxes_0001779
FROM momo_container_closed
WHERE raw::text LIKE '%0001779%';

-- E. ถ้า A คืน ≥2 แถว → เช็ค guard ว่า Σ ตรง 254 / 0.880144 ภายใน 2% ไหม
SELECT base_tracking, count(*) AS boxes,
       round(sum(coalesce(weight_kg,0)*greatest(quantity,1))::numeric,2)  AS sum_w,
       round(sum(coalesce(cbm,0)     *greatest(quantity,1))::numeric,6)  AS sum_cbm,
       sum(greatest(coalesce(quantity,1),1))                             AS sum_pcs
FROM momo_box_detail
WHERE base_tracking = '0001779'
GROUP BY base_tracking;
```

**หรือรันสคริปต์ audit (ทำ §2 + §6 ให้ในตัวเดียว · อ่านอย่างเดียว):**
```bash
node --env-file=.env.local scripts/audit-momo-missing-siblings-2026-07-16.mjs
```
→ ส่วน **FOCUS · base 0001779** จะพิมพ์ tb_forwarder / momo_box_detail / track_details เทียบกันบรรทัดต่อบรรทัด (เห็น convention ทันที).

**สิ่งที่ควรเห็น:** B = **1 แถว** (52135, unbilled, reforder=''); A = **0/1 แถว** (root gate) หรือ **2 แถว** (มีแต่ไม่แตก). D บอกว่ามี track_details `0001779` + `0001779-2` ให้ rebuild ไหม.

---

## 3) DECISION TREE

```
Query A (momo_box_detail base 0001779)
│
├─ CASE 1 — A = 2 แถว (0001779 + 0001779-2)  AND  E: Σ_w≈254 & Σ_cbm≈0.880144 (ภายใน 2%)
│      → box_detail สมบูรณ์ แค่ split ไม่เคยยิง
│      → §4 BRANCH A: รัน split backfill (dry-run → --apply)
│
├─ CASE 2 — A = 0/1 แถว (ขาด 0001779-2)  ← เคสที่คาดว่าเป็น
│      → source ไม่ครบ · ห้าม split blind (split script จะข้าม เพราะไม่ใช่ multi-box candidate)
│      → §4 BRANCH B: rebuild momo_box_detail จาก track_details ก่อน → ยืนยัน A=2 & Σ ตรง → แล้ว BRANCH A
│
└─ CASE 3 — A = 2 แถว แต่ E: Σ ไม่ reconcile (MOMO มั่ว)
       → dry-run จะขึ้น SKIP weight/cbm_mismatch → ห้ามฝืน
       → ถ้า dims (w×l×h×qty) reconcile ≈0.880144 → ใช้ปุ่มแตกกล่อง (มือ · allowPriced dims-fallback)
       → ถ้าไม่ → flag owner (คลาส "billed-lump แตกไม่ได้" / ต้อง MOMO Live re-scrape)

เพิ่ม: ถ้า B พบว่า billed (fstatus∈{5,6,7} หรือมี invoice_item) → STOP, ยกเลิกบิล+คืนเงินก่อน (owner/บัญชี).
      (split script จะ REFUSE billed อยู่แล้ว — แต่เช็คก่อนเพื่อความชัวร์.)
```

---

## 4) DATA-FIX RECIPE (money-neutral · Σ 18 กล่อง / 254 กก. / 0.880144 คิว ต้องคงเดิม)

**สคริปต์จริง:** `scripts/split-aggregated-momo-boxes-2026-07-02.ts`
- **dry-run เป็น default** · เขียน backup JSON `scripts/_backup-split-momo-<ts>.json` ก่อน `--apply` · **1 base = 1 txn (ATOMIC)** · guard Σ-drift ≤ 0.005 → drift เกิน abort เอง.
- **⚠️ ไม่มี flag `--tracking`** — มันประมวลผล **ทุก base** ที่มี >1 กล่องใน `momo_box_detail` (dry-run พิมพ์ `SPLIT <base>` / `SKIP <base>` ทีละตัว). อ่าน plan ทั้งชุดก่อน --apply เสมอ (จะแตกทุก base ที่แตกได้ ไม่ใช่แค่ 0001779).
- Naming: **anchor เก็บ base เปล่า `0001779` (keep id 52135 + committed_forwarder_id + เหมาๆ suffix-0)**, sibling = box_tracking verbatim `0001779-2`. **ไม่ใช่** `0001779-1/2 + 0001779-2/2`.

### BRANCH A — box_detail ครบ + Σ reconcile (CASE 1 หรือหลัง rebuild ใน BRANCH B)

```bash
# 1) DRY-RUN — อ่าน plan · หาบรรทัด "SPLIT 0001779 fid=52135 → 2 rows (1 anchor + 1 new)"
#    ต้องเห็น anchor 0001779 + INSERT 0001779-2 · Σ wt=254 cbm=0.880144 · Σ ftotalprice คงเดิม
SUPABASE_DB_PASSWORD='<prod pw · แชทเท่านั้น>' \
  tsx scripts/split-aggregated-momo-boxes-2026-07-02.ts | grep -A6 '0001779'

# 2) ตรวจ plan:
#    - SPLIT 0001779 → 2 rows · [anchor→UPDATE] '0001779' + [INSERT] '0001779-2'
#    - ถ้าขึ้น SKIP 0001779 (weight_mismatch/cbm_mismatch/qty_mismatch) → ไป CASE 3 (อย่าฝืน)
#    - ถ้าไม่เห็น 0001779 เลยใน dry-run → box_detail ไม่มี >1 กล่อง = CASE 2 → BRANCH B

# 3) APPLY — priced (ftotalprice>0): --priced --apply · unpriced: --apply เฉยๆ
#    (มันแตะ 52135 เพราะเป็น aggregate ที่แตกได้ · backup JSON เขียนก่อนอัตโนมัติ)
SUPABASE_DB_PASSWORD='<prod pw · แชทเท่านั้น>' \
  tsx scripts/split-aggregated-momo-boxes-2026-07-02.ts --priced --apply
```
> ⚠️ `--apply` จะแตก **ทุก base** ที่ plan บอก SPLIT (ไม่ใช่แค่ 0001779). ถ้าต้องการทำเฉพาะ 0001779: เพิ่ม `--tracking`/`--only` filter ในสคริปต์ก่อน (ตอนนี้ยังไม่มี — เดฟ เพิ่มได้ 1 บรรทัดที่ query `bases` ให้ `AND base_tracking = '0001779'`), หรือรีวิว dry-run ให้ครบว่าทุก base ที่จะแตกนั้น OK.

### BRANCH B — box_detail ขาด `0001779-2` (CASE 2 · เคสที่คาด)

Split ยิงไม่ได้ (ไม่มี >1-box candidate) → **rebuild `momo_box_detail` ก่อน**:

1. **Backup** `momo_box_detail` (base 0001779) + tb_forwarder row 52135 → JSON dump.
2. **แหล่งปลอดภัยสุด = Query D `container_closed.track_details`** (มี reTrack + kg + cbm + w/l/h + total_quantity รายกล่อง ถาวร). INSERT 2 แถว `momo_box_detail`:
   - `base_tracking='0001779'`, `box_tracking='0001779'` และ `box_tracking='0001779-2'`
   - **⚠️ convention (สำคัญ — อ่าน §5):** `momo_box_detail.weight_kg`/`cbm` = **PER-PIECE** (split เอาไป ×quantity). แต่ `track_details.kg`/`cbm` = **box-total** (Σ ข้าม reTrack ได้ = fweight/fvolume). ดังนั้นเวลา seed ต้อง:
     - `weight_kg = track_details.kg / total_quantity` (per-piece)
     - `cbm = track_details.cbm / total_quantity` (per-piece)
     - `quantity = total_quantity` · `width/length/height = track_details.* verbatim`
   - **ตรวจก่อน INSERT:** Σ(weight_kg × quantity) ต้อง ≈ 254 และ Σ(cbm × quantity) ต้อง ≈ 0.880144 (money-neutral). ถ้าไม่ตรง → convention อาจต่างจากที่ผมเดา → **หยุด + ยืนยันจาก FOCUS dump ของ audit script ก่อน** (ดู track_details.kg÷qty เทียบ box_detail ของ base ที่มีทั้งคู่).
3. รัน Query A + E ซ้ำ → ยืนยัน A=2 & Σ reconcile → รัน **BRANCH A**.

> ⚠️ **อย่า hand-edit tb_forwarder เพิ่มแถว `0001779-2` ดิบ ๆ** โดยไม่มี box_detail — จะ bypass guard Σ-preservation แล้วเสี่ยง mis-bill. ต้อง seed box_detail แล้วให้ split script ทำ.
> ⚠️ **แต้ม packing list อย่างเดียวไม่พอ** — packing-reconcile สร้างได้แค่ base ใหม่ทั้งแถว ไม่ได้ split aggregate เป็น `-N` (เว้นไฟล์ระบุ `0001779-2` เป็น base แยก).

### VERIFY หลัง --apply
รัน Query B ซ้ำ → ต้องได้ **2 แถว** (`0001779` + `0001779-2`) · Σ fweight=254 / Σ fvolume=0.880144 / Σ famount=18 · หน้า `/admin/forwarders/52135` เรนเดอร์ทั้ง 2 tracking.

---

## 5) CODE-FIX (กันเกิดซ้ำ · Poom-lane โค้ด · vs data-only) — ⭐ SPEC สำหรับเดฟ

**สำหรับ 52135 = data-only, ไม่ต้องแก้ code** (split logic ถูกอยู่แล้ว — แค่ถูก starve เพราะ box_detail ไม่มีกล่องที่ 2).

**Root recurrence-fix (แนะนำ) — seed `momo_box_detail` จาก durable feed แทนที่จะพึ่ง Live scrape จีนอย่างเดียว:**

- **จุดแก้:** `lib/integrations/momo-isolated/sync.ts` step 2.5 (`:341-408`) — loop นี้เดิน `container_closed.raw.track_details[]` (reTrack + kg + cbm + width + height + length + total_quantity) รายกล่องอยู่แล้ว. มี mapper พร้อม: `extractContainerClosedTracks(raw)` (`lib/integrations/momo-isolated/mapper.ts:466`) คืนรูปนี้ครบ.
- **ทำอะไร:** UPSERT `momo_box_detail` 1 แถวต่อ reTrack (`base_tracking = baseTrackingOf(reTrack)`, `box_tracking = reTrack`) แบบเดียวกับ `fillMomoBoxDetails`. แล้ว `findMultiBoxBases` (`split-box-rows.ts:157`) จะเห็น `0001779-2` แม้พัสดุถึงไทยแล้ว → pass 5 auto-split. **ปิดคลาส "aggregate ค้างเพราะหลุดกระดาน" ถาวร.**

- **🔴 คำถาม CONVENTION ที่เดฟ ต้องเช็คกับข้อมูล prod จริงก่อนเขียน (ผมไม่เดา เพราะ read-only):**
  `momo_box_detail.weight_kg` ถูกอ่านเป็น **PER-PIECE** (`split-box-rows.ts:287` `weightKgPerPiece: n(b.weight_kg)` แล้วคูณ quantity). แต่ `track_details.kg` **น่าจะเป็น box-total** (เพราะ `aggregateTrackDetailMetrics` SUM `kg` ข้าม reTrack ได้ = `momo_import_tracks.weight_kg` = fweight รวม 254 — ถ้าเป็น per-piece การ SUM คงไม่ได้ 254). ⇒ **สมมติฐานผม: seed ต้อง `weight_kg = kg / total_quantity`** (per-piece). **ยืนยันด้วย FOCUS dump ของ audit script** — หา base ที่มีทั้ง box_detail (จาก Live) และ track_details (จาก container_closed) แล้วเทียบ `track_details.kg ÷ qty` กับ `box_detail.weight_kg`. ถ้าเท่ากัน = per-piece ยืนยัน. ถ้า `track_details.kg` = `box_detail.weight_kg` ตรง ๆ = box-total ทั้งคู่ (แปลว่า Live ก็เก็บ box-total → ต้องไปดู `fillMomoBoxDetails`/`MomoLiveParcel.weightKg` ว่าจริง ๆ ต่อชิ้นหรือต่อกล่อง — plan comment `split-box-rows-plan.ts:317-332` เตือนว่า MOMO มั่ว convention ราย box ได้).

- **safety ของการ seed:** ทำ **FILL-WHEN-MISSING (INSERT-only · ห้าม upsert-overwrite)** — seed เฉพาะ box ที่ `(base_tracking, box_tracking)` ยังไม่มีใน `momo_box_detail` → **ห้าม clobber** ค่าที่ Live scrape หรือพนักงานแก้มือ (`upsertEditedBoxDetails`) เก็บไว้. เพราะ box_detail = display-only (ไม่มี money path ไหนอ่าน) + split มี money-neutral guard เอง → seed ผิดนิดหน่อยอย่างมาก split ก็ REFUSE (Σ mismatch) = ไม่มีเงินขยับ. แต่ INSERT-only กัน regression ของ dims ที่ดีอยู่แล้ว.
- **scope:** seed เฉพาะ base ที่ track_details มี >1 reTrack (multi-box) พอ — single-box ไม่ต้อง (dims อยู่บน tb_forwarder อยู่แล้ว).
- **test:** เขียน unit test ให้ตัว pure builder (mirror `fillMomoBoxDetails` test).

- **ไม่ต้องแก้** `split-box-rows.ts` / `planBoxRowSplit` / `box-detail-reconcile.ts` — ถูกอยู่แล้ว. **อย่า** เพิ่ม row-creation ใน pass 6 self-heal (สร้างแถว billable บน cron จากข้อมูล MOMO ที่อาจมั่ว = ผิด charter money-safety).

- **ALTERNATIVE (ถ้าอยากใช้ Live boards เป็นแหล่ง):** ขยาย `collectLiveBoardParcels` ให้ scrape กระดาน arrival/ถึงไทยด้วย เพื่อจับ split ที่เพิ่งถึง (fstatus 4) ก่อนหลุดกระดาน.

---

## 6) BLAST-RADIUS SWEEP (หาเคสอื่นที่อยู่ในสภาพเดียวกัน · ไม่ใช่แค่ 0001779)

ไม่มี invariant ไหนเช็ค "# tb_forwarder sibling rows == # box_detail/track_details boxes" → aggregate ค้างแบบนี้ **มองไม่เห็นจนกว่าจะ mis-bill**.

**วิธีเร็วสุด — รันสคริปต์ audit ที่ผม push ไว้ (read-only · ไม่เขียนอะไร):**
```bash
node --env-file=.env.local scripts/audit-momo-missing-siblings-2026-07-16.mjs
```
มันแบ่งเป็น:
- **MS-A · SPLITTABLE-NOW** — `momo_box_detail` มี >1 กล่อง แต่ tb_forwarder ยังเป็น aggregate แถวเดียว (ไม่มี `-N`) · unbilled. → BRANCH A batch (split script รับทั้งชุด).
- **MS-B · BOX_DETAIL-INCOMPLETE (= คลาส 0001779)** — durable `track_details` บอก >1 กล่อง แต่ box_detail ≤1 · famount>1 · unbilled. → BRANCH B (rebuild box_detail ก่อน).
- **OWNER-REVIEW** — stranded แต่ billed (fstatus 5/6/7) → ห้ามแตะ · ยกเลิกบิลก่อน.
- **FOCUS** — dump 0001779 (และ FOCUS=… ที่ส่งเพิ่ม) เทียบ 3 แหล่งบรรทัดต่อบรรทัด (ไว้ยืนยัน convention ใน §5).

> **NEXT-FREE migration** ยังไม่ต้องใช้ (งานนี้ data-fix + code seed · ไม่มี schema เปลี่ยน).

---

## 7) เช็คลิสต์ให้เดฟ (เรียงตามลำดับ)

- [ ] รัน `scripts/audit-momo-missing-siblings-2026-07-16.mjs` (read-only) → ดู 0001779 อยู่ MS-A หรือ MS-B + มีเคสอื่นไหม.
- [ ] รัน Query A–E (§2) ยืนยัน CASE 1/2/3.
- [ ] **CASE 1** → BRANCH A: dry-run split → รีวิว plan → `--priced --apply` (backup อัตโนมัติ).
- [ ] **CASE 2 (คาดว่าใช่)** → BRANCH B: backup → seed box_detail จาก track_details (per-piece convention · ยืนยัน Σ ตรง) → Query A/E ซ้ำ → BRANCH A.
- [ ] **CASE 3** → ปุ่มแตกกล่องมือ (allowPriced dims-fallback) หรือ flag owner.
- [ ] VERIFY: Query B ได้ 2 แถว · Σ 254/0.880144/18 · หน้า 52135 โชว์ทั้ง 2 tracking.
- [ ] (กันซ้ำ) พิจารณา code seed ใน `sync.ts:341-408` ตาม §5 (ยืนยัน convention ก่อน) → push Poom-pacred/dave.
- [ ] แจ้ง ภูม ว่าเสร็จ + มีเคสอื่นที่ต้องเก็บอีกกี่ตัว (จาก audit script).

---

**ไฟล์อ้างอิง (relative paths):**
- `scripts/audit-momo-missing-siblings-2026-07-16.mjs` — 🆕 audit อ่านอย่างเดียว (ผม push ไว้แล้ว)
- `scripts/split-aggregated-momo-boxes-2026-07-02.ts` — split backfill (dry-run default · `--apply` · `--priced`)
- `lib/integrations/momo-web/split-box-rows.ts` (`:157 findMultiBoxBases` · `:192 splitAggregatedMomoBoxRows`)
- `lib/integrations/momo-web/split-box-rows-plan.ts` (`:234 planBoxRowSplit` — money-neutral guard · `:317-332` convention-mix warning)
- `lib/integrations/momo-web/box-detail.ts` (`:297 fillMomoBoxDetails` — box_detail auto-populator ตัวเดียว)
- `lib/integrations/momo-isolated/sync.ts` (`:341-408 step 2.5` — จุดแก้ recurrence)
- `lib/integrations/momo-isolated/mapper.ts` (`:466 extractContainerClosedTracks` — track_details → รูปกล่องครบ)
- `lib/admin/momo-raw-helpers.ts` (`:521 aggregateTrackDetailMetrics` · `:40 baseTrackingOf`)

**Bottom line:** `momo_box_detail` ไม่มีกล่อง `0001779-2` (หลุดกระดานจีนก่อน scrape เพราะถึงไทยแล้ว) → split ไม่มี candidate. **Query A ชี้ขาด** → คาดว่า CASE 2 (rebuild box_detail จาก track_details แล้วค่อย split). Data-only fix สำหรับ 52135; code root = seed box_detail จาก durable feed ใน `sync.ts:341-408` (ยืนยัน convention per-piece/box-total ก่อน). Sweep ทั้งคลาสด้วย audit script. **ทุก apply = dry-run + backup ก่อนเสมอ · Σ 18/254/0.880144 ต้องคงเดิม.**
