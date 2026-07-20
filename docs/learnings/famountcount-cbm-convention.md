# fvolume มี 2 convention (famountcount) — ทุก Σ/cost ต้องผ่าน quantities.ts SOT (2026-07-19)

> Owner: "ตอนเอา คิว กิโล จำนวนกล่อง แต่ละแทรคกิ้งมารวมเข้าชิปเม้น ต้องบวกรวมให้ตรง
> ไม่ใช่หายหรือบัค" — งาน PR172/GZS260625-5T ขาดทุน + "ราคาแต่ละจุดไม่ตรงกัน" มาจาก
> convention เดียวที่ครึ่งระบบเคารพ ครึ่งระบบไม่.

## The rule (legacy forwarder.php L1935-1941 "CBMProduct")

`tb_forwarder.fvolume` เก็บ 2 แบบ discriminated ด้วย `famountcount`:
- `famountcount='1'` → fvolume = **row TOTAL** CBM (MOMO commit เขียนแบบนี้เสมอ)
- อื่นๆ (null/''/'0') → fvolume = **ต่อกล่อง** → row total = fvolume × famount
  (แถวคีย์มือ / legacy / TTW keyed rows)

`fweight` = row total เสมอ · `famount` = จำนวนกล่อง เสมอ (ไม่มี convention split).
**TS SOT: `lib/forwarder/quantities.ts` (`totalCbmOf`/`sumQuantities`) · SQL mirror:
mig 0263 (get_container_summary sum_volume CASE expression). Keep in lockstep.**

## What broke (2026-07-19 · all fixed)

ฝั่ง SELL เคารพกติกา (resolve-rate/live-rate "cbmProduct") แต่ที่อื่นใช้ fvolume ดิบ:
1. **COST resolver** (`resolve-cost.ts` + report-cnt-detail inline ×2) → per-box row
   under-costed ×famount → TTW กำไรตู้เกินจริง (฿20,547 แทน ฿5,119).
2. **Container Σ** — RPC `get_container_summary` (fixed mig 0263) + list JS fallback +
   [fNo] detail (live cost AND live sell + client sums) + container-bulletin +
   forwarder-check volume_cbm + receipt/billing doc CBM columns + data-health
   group_cost_ratio.
3. 🔴 **THE REVERT ENGINE — per-tracking editor client** (`per-tracking-editor-client.tsx`
   `calc`): summed the per-box CBM inputs raw → ค่าเทียบ = 261÷0.704 = **370 > 250** →
   the save passed that as `comparisonKgPerCbm` → the server re-priced the bulky
   shipment **by WEIGHT** every time staff hit บันทึกขนาด. This silently reverted a
   correct CBM re-price within the hour. Fix: server passes `volumeIsTotal` per row;
   client multiplies per-box rows × boxes. **Lesson: when a data-fix reverts, hunt the
   WRITER loop before re-applying — staff surfaces re-derive on every save.**

## Also learned
- ใบส่งของ TTW ตัวจริงพิมพ์ "เลขที่ตู้/Packing ID: SEA0625-8211YW" (MOMO SEA-batch id) —
  โกดัง/สตาฟยิงตามป้ายนั้น → re-stamp ตู้ทับของถูก (GZS260625-5T จากชื่อไฟล์แพคกิ้งลิสต์).
  แก้: rename ทุกตารางที่ถือรหัสเก่า (tb_cost_container ด้วย — เรทบัญชีต้องตามไป) + **ตั้ง
  `fcabinet_locked=true`** (mig 0150 — กลไกที่มีไว้กันเคสนี้พอดี).
- shipment-level ค่าเทียบ: `computeAndFillForwarderImportRate` now fetches same-base
  siblings → passes shipment-total density as `comparisonKgPerCbm` (single-tracking
  unchanged). ทุก fill path จึง "คิดเป็นชิปเม้น" อัตโนมัติ.
- Supabase direct host `db.<ref>:5432` ตายแล้ว (IPv6-only) — pooler aws-1 เท่านั้น;
  dry-run ผ่าน host เก่าเคยอ่าน replica ค้าง (โชว์ 39 แถวที่ primary มี 0).

## 📛 THE TRACKING PATTERN (owner 2026-07-19 · canonical — ห้ามตีความอื่น)

MOMO (และโกดังจีนทุกเจ้า) ใช้แพทเทิร์นเดียว:

```
710092508207          ← เลขชิปเม้น = เลขออเดอร์ = เลขหัวบิล (ถ้าส่งมาโดดๆ = แทรคกิ้งในตัว)
710092508207-1/2      ← แทรคกิ้งกล่องที่ 1 ของชิปเม้นนั้น
710092508207-2/2      ← แทรคกิ้งกล่องที่ 2
```

- **ตัด `-N` / `-N/M` ท้ายออก = ตัวตนของชิปเม้น** — แม้ MOMO ส่งมาแต่ -1/2,-2/2
  (ไม่มีเลขเปล่า) หัวบิล/ออเดอร์ก็คือเลขที่ตัดแล้ว. SOT = `baseTracking()`
  (lib/admin/momo-bill-header.ts) / `baseOf()` (split-box-rows-plan) — ทุก grouping
  ต้องผ่านตัวนี้ ห้าม parse เอง.
- **โกดังสแกนเลขชิปเม้น = รับทั้งครอบครัว** — `warehouseArriveThScan` resolve ทั้ง
  family จาก member ใดก็ได้ (รวมเคสไม่มีแถวเปล่า) แล้ว flip ทุกแถว eligible พร้อมกัน.
- **1 ชิปเม้น = 1 บิล active** — billing ครอบทุกแถวของ base เดียวกัน; ใบยกเลิก
  = ประวัติ (ขีดฆ่าในจอ) ไม่ใช่บิลซ้ำ. Verified prod: 0 แถวอยู่บนบิล active >1 ใบ.
- **จอทุกตัวจับกลุ่มตาม base** — report-cnt · pay-modal · ตรวจตู้ (momo-containers
  family grouping 2026-07-19) · ห้าม render แถว -N เป็นหัวอิสระ.
### ชั้นที่ 3 — เลขกล่อง CG (owner 2026-07-19)

```
ชิปเม้น 908007156796
  └─ แทรคกิ้ง 908007156796    → กล่อง CG84280723002-CG84280723007  (ช่วงต่อเนื่อง = 6 ใบ)
  └─ แทรคกิ้ง 908007156796-2  → กล่อง CG84280723008-CG84280723010  (3 ใบ)
  └─ แทรคกิ้ง 908007156796-5  → กล่อง CG84280723015                (เดี่ยว = 1 ใบ)
```

- **CG = ป้ายกล่องจริงรายใบ** — ช่วง CG ต้องนับได้เท่า Total Parcel (famount) ของแทรคนั้น
  เสมอ; ไม่ตรง = ข้อมูล MOMO ขัดกันเอง (flag ⚠ CG≠กล่อง บนหน้า ตรวจตู้ · ห้าม silently trust).
- **SOT = `lib/forwarder/cg-range.ts`** (`parseCgRange`/`cgMatchesQty` · 17 tests) — ห้าม
  parse ช่วง CG เอง.
- **เก็บที่ `tb_forwarder.fbox_mark`** (คอลัมน์เดิมที่สาย แต้ม reconcile ใช้อยู่แล้ว — ไม่มี
  migration ใหม่) · MOMO commit (`commit-momo-row-core` → `extractCgFromMomoRaw` จาก
  raw.CG_NO) เติมตอนนำเข้าระบบ → ตัวตนกล่องไม่หายอีก.
