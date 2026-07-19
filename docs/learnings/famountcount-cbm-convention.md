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
