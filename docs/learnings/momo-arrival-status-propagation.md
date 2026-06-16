# MOMO arrival → status propagation → customer-visible status

> Captured 2026-06-16 (owner P0: "ของถึงไทย/ถึงจีน แต่สถานะไม่ขยับ → เก็บเงินไม่ได้ + ออเดอร์ค้าง · ทำเลินนิ่งดักการใช้งานไว้ด้วย").
> This is the canonical map of the MOMO ingest → propagate → customer-status chain,
> the 3 places it breaks, and the exact criteria to safely flip from
> Option-B (manual review) to Option-A (auto-collect).

---

## The chain (3 hops · each was a break)

```
MOMO API (container_closed raw.is_arrival=true)
   │  hop 1: stamp the arrival onto a per-PARCEL row
   ▼
momo_import_tracks.shipment_status = 'AT_WAREHOUSE_TH'
   │  hop 2: propagate to the forwarder (gate-controlled)
   ▼
tb_forwarder.fstatus = '4' (ถึงไทยแล้ว)   ← admin SEES it, reviews, collects
   │  hop 3 (shop orders only): advance the linked ฝากสั่งซื้อ order
   ▼
tb_header_order.hstatus = '40' (ถึงโกดังจีน) on china-warehouse arrival
```

### Break 1 — the arrival flag never reached a propagatable row
`container_closed.raw.is_arrival === true` → `AT_WAREHOUSE_TH` (mapper.ts:286-289)
lives on the **container** record, whose `trackingNo` is `null`. The per-parcel
propagator (`propagateMomoToForwarders`, propagate.ts) filters to
`records.filter(r => r.trackingNo)` (propagate.ts:171) → the arrival container is
dropped. So nothing ever advanced.

**Fix:** the existing step-2.5 cabinet walk in `sync.ts` already iterates every
`container_closed` raw and `UPDATE`s the matched `momo_import_tracks` rows (by
`reTrack` → `momo_tracking_no`). We EXTENDED that same `.update().in(...)`: when
`c.is_arrival === true`, also set `shipment_status:'AT_WAREHOUSE_TH'` +
`momo_updated_at` on those per-parcel rows (both columns exist since migration
0116). Now the arrival rides the per-parcel rows the propagator already reads.
(`lib/integrations/momo-isolated/sync.ts` ~228-250)

### Break 2 — the ฿0 bill
`extractMetricsFromMomoRaw` (momo-raw-helpers.ts:520-528) read ONLY per-parcel
`r.kg`/`r.cbm`. At arrival those are frequently 0 (the weight/cbm live on the
container aggregate `total_kg`/`total_cbm`). 0 metric → ฿0 bill.

**Fix:** fall back to the container aggregate, mirroring the consumer pattern at
momo-raw-helpers.ts:167-168 → `weight: num(r.kg) || num(r.total_kg)`,
`cbm: num(r.cbm) || num(r.total_cbm)`. The "never persist a silent ฿0" guard
(`lib/forwarder/live-rate.ts:310`) is INDEPENDENT and still holds: if BOTH are 0
the row stays unpriced for the admin to fill — we never bill ฿0.

### Break 3 — the shop order had no "ถึงโกดังจีน" status + nothing advanced it
`tb_header_order.hstatus` (legacy `varchar(1)`, no CHECK) had only
1 รอดำเนินการ · 2 รอชำระเงิน · 3 สั่งสินค้า · 4 รอร้านจีนจัดส่ง · 5 สำเร็จ · 6 ยกเลิก.
No value for "goods reached the china warehouse", and no code advanced the order
when a linked forwarder (reforder→hno) arrived.

**Fix:**
- Migration `0185` widens `hstatus` varchar(1)→varchar(2) (NOT a CHECK change —
  there was none) so the new value **`'40'` = "ถึงโกดังจีน"** fits. `'40'` is
  string-orderable BETWEEN '4' and '5' (`'4' < '40' < '5'`), so the one ordering
  query `.gt("hstatus","2").neq("hstatus","6")` (shop-disbursement.ts:286) keeps
  it correctly disbursement-eligible. DISPLAY order is array-controlled, so '40'
  renders right after "4 รอร้านจีนจัดส่ง" regardless of the digit.
- `lib/legacy-status-map.ts` is the SOT: added `'40'` →
  `{ key:"arrived_china_warehouse", thai:"ถึงโกดังจีน" }` + an explicit
  `LEGACY_ORDER_DISPLAY_ORDER` (because `Object.keys` sorts the integer-like key
  '40' to the END — 1,2,3,4,5,6,40 — which is wrong).
- The advance fires in `lib/admin/commit-momo-row-core.ts` (step 6b, after the
  tb_forwarder INSERT): if the forwarder's `reforder` is non-empty AND
  `fStatusNew >= "2"` (china-warehouse arrival or later), `UPDATE
  tb_header_order SET hstatus='40' WHERE hno=reforder AND hstatus='4'`.
  FORWARD-ONLY + idempotent (the `.eq("hstatus","4")` fold → 0-row no-op on
  5/6/already-40), BEST-EFFORT (never fails the commit). NOTE: the MOMO commit
  path currently inserts `reforder=""`, so this is a no-op for MOMO-only parcels
  and fires only for forwarders that carry a shop-order link.

### The "disappeared label" trap (LANE B step 4)
Any status→label map that hardcodes only "1".."6" will render a NEW value as a
fallthrough — `"ไม่พบข้อมูล"` (accounting/shop switch default), the raw code
(`legacyOrderStatusThai` returns `code` on miss), or a wrong "visited" step.
A subtle one: a step strip computing `Number(status) > Number(step.code)` ranks
`Number("40") = 40` AFTER สำเร็จ → marks "สำเร็จ" visited while only at ถึงโกดังจีน.
Fix = an explicit `STATUS_ORDER_RANK` ({...,"4":4,"40":5,"5":6}) instead of
`Number()`. We swept ALL ~16 order-status label/badge/step/tab/enum maps to
include '40' (see the commit diff).

---

## Option-B FIRST (what we built) vs Option-A (the future)

**Option B — MANUAL-REVIEW-FIRST (shipped 2026-06-16, owner's locked decision).**
Arrival advances the forwarder to **fstatus='4' (ถึงไทยแล้ว)** — the admin SEES
it in the existing queue and reviews/prices/collects via the EXISTING manual
path. NO auto-advance to '5', NO "pay now / รอชำระเงิน" customer notification.

**Option A — AUTO-COLLECT (do NOT enable yet).** Would advance arrival straight
to **fstatus='5' (รอชำระเงิน)** + fire a pay-now notify. This is `propagate.ts:87`
(`WAITING_PAYMENT → "5"`) territory — but MOMO arrival maps to `AT_WAREHOUSE_TH`
→ '4', and we KEEP it at '4'. Switching to auto-collect is a deliberate, gated
future step, NOT a code default.

### Criteria to safely switch B → A
1. **Price is ALWAYS computed (never ฿0).** With the aggregate fallback +
   `computeAndFillForwarderImportRate` + the `live-rate.ts:310` zero-guard,
   confirm in prod that arrived rows carry a real `ftotalprice`. An auto pay-now
   on a ฿0 bill is the worst case.
2. **Dry-run `statusAdvanceSkippedByGate` reviewed.** The propagator counts how
   many rows WOULD advance with the gate ON (`PropagationResult
   .statusAdvanceSkippedByGate`, propagate.ts:316). Run a sync with
   `MOMO_SYNC_PROPAGATE_STATUS` still OFF, read that count, eyeball the rows
   before flipping the env.
3. **Notifications verified.** Confirm the arrival/pay-now notify wording +
   audience are right BEFORE any auto-fire (Option B intentionally adds none).

### The env gate (integrator owns this — NOT the build agent)
`MOMO_SYNC_PROPAGATE_STATUS === "true"` (propagate.ts:168) gates whether the
forwarder fstatus actually advances. We left it OFF. The integrator dry-runs,
reviews `statusAdvanceSkippedByGate`, then flips it in Vercel. With it ON, an
arrived row advances forward-only to fstatus='4' (Option B); it never jumps to 5.

---

## Recurring rules
- **An arrival flag on a CONTAINER record won't propagate** — propagation keys on
  per-PARCEL `trackingNo`; stamp the flag onto the matched import-track rows.
- **Per-parcel metrics can be 0 at arrival** — fall back to the container
  aggregate, but keep the "never persist a silent ฿0" guard.
- **A new status code that isn't a single digit** breaks `Object.keys` ordering
  AND `Number()` rank comparisons AND every hardcoded "1".."6" label map — sweep
  them, use an explicit display-order + rank, and widen the `varchar(1)` column.
- **Status advance must be FORWARD-ONLY + idempotent + best-effort** off an
  ingestion path — fold the from-status into the UPDATE WHERE, never fail the
  parent transaction.
