# Model-evolution debt — when a helper outlives the data model it assumed

**2026-07-20 · owner: "ทำไมบัคเบิ้ลกระจุยขนาดนั้น · ทำไมยังเกิดขึ้นอีก"**

## The incident

`/admin/report-cnt` showed PR179 shipment `1783582423` as **2,580 กล่อง · 44,692 กก. ·
352.28 คิว · ต้นทุน ฿880,712 · กำไร −฿868,580**. The truth: **116 กล่อง · 2,007.28 กก. ·
15.82 คิว**. 22 of the 23 sibling rows each carried the **whole-shipment Σ**.

## The root cause is not a typo — it is a stale ASSUMPTION

`fillLiveDataForParcels` (MOMO Live pass 2) was written **2026-07-01** and its header
said, correctly for that day:

> tb_forwarder holds ONE row per BASE tracking carrying the whole-tracking AGGREGATE

**One day later (2026-07-02) the box-split model shipped**: a shipment now becomes **N
sibling rows** (`<base>-2`, `<base>-3/7`, …), one per physical box. Nobody revisited
pass 2. Its behaviour was unchanged and still "correct" by its own docstring — but the
world it described no longer existed. It looked rows up by base **and** by every exact
suffixed tracking (so it found all 23 siblings) and then filled each of them from
`aggregateLiveMetricsByBase` — the family Σ.

**A stale assumption does not throw. It writes confidently.**

## Why it stayed hidden for ~3 weeks

Three guards each *looked* sufficient and together produced a long fuse:

1. **fill-when-empty** — pass 2 only writes where `fweight` is 0. Split rows are born
   weightless (MOMO ยังไม่ชั่ง), so the bomb only armed when Live later weighed the
   shipment. Most families never hit that exact ordering.
2. **the cost was already right** — cost had been computed earlier from each row's real
   per-suffix คิว, so `fcosttotalprice` looked sane in the DB. The report computes
   container cost **live** (`Σ CBM × rate`), so only the *screen* exploded
   (352.2848 × 2,500 = ฿880,712 — exactly the number on the owner's screen).
3. **the audit trail lied by omission** — `adminidupdate` read `sys-live`, which is
   stamped by the *status* pass. The metric writers stamp nothing, so the fingerprint
   pointed at the wrong suspect.

## Why the self-heal (the layer built for exactly this) refused

`planBoxDetailReconcile` (cron pass 6) knew two bare shapes: a pure aggregate header,
and a priced anchor. This family is the **proper-split** shape the owner taught on
2026-07-18 — *"กล่อง 1 อยู่บน bare เสมอ · sibling เริ่ม -2"*. `trueBoxTotals` drops the
bare's own box from Σ, so the corroboration `bare.fweight ≈ Σ(boxes)` compared
2,007.28 against 1,760.28 → `momo_does_not_reconcile_aggregate` → **all 21 rows
refused, silently, every cron cycle**.

> A conservative guard that refuses *the one shape you actually have* is
> indistinguishable from having no heal at all. Replay the pure plan against the real
> broken rows before believing a heal covers a class.

That replay is cheap and was decisive here: running `planBoxDetailReconcile` on the
prod rows printed `22 reviews / 0 fixes` and named the refusal reason.

## The fix (all four layers — a fix without layer 4 is a recurrence waiting)

1. **write guard** — the fill is now **family-aware**: family size is counted from the
   **database** (not from what Live happens to list); a split-family row fills from its
   **own** parcel (`aggregateLiveMetricsByExact`), never the base aggregate. Fails
   **closed** (unknown family size ⇒ treated as split ⇒ exact-only).
2. **cron heal** — the plan learned the proper-split shape; a fanout row converges to
   its own box truth, **including the bare** (converge, never zero). The corroboration
   is bare-independent so a partially-healed family still converges.
3. **sweep** — a plan-driven script (same brain as the cron) healed the 22 rows.
4. **standing check** — `aggregate_fanout_siblings` in data-health, calibrated on prod.

## Transferable rules

- **When a data model gains cardinality (1 row → N rows), grep every consumer that
  aggregates by the OLD key.** The dangerous ones are the writers that still look
  *correct in isolation*. Their docstring is the tell: if it states the old invariant
  as fact, it is a suspect.
- **Prefer "count the family from the DB" over "infer it from the feed."** The feed
  shows what a partner happens to return today; the DB is what the money actually is.
- **A guard whose refusal is silent must be audited by replay**, not by reading it.
  `refused because <reason>` and `no work to do` look identical from outside.
- **`fill-when-empty` delays a bug, it does not prevent one.** It converts an
  immediate, loud failure into a rare, late, confusing one.
- **Trust the arithmetic, not the audit column.** `352.2848 × 2,500 = 880,712` pinned
  the writer in one step; `adminidupdate` pointed elsewhere.
