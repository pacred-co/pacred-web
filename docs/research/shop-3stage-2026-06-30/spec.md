# ฝากสั่งซื้อ multi-shop 3-stage status — exact spec (2026-06-30)

> Owner rule: a ฝากสั่งซื้อ order's status is a **PURE FUNCTION of its shops'
> arrivals** — NOT a one-way latch that flips สำเร็จ the moment the first shop
> arrives. Three stages: `4` รอร้านจีนจัดส่ง → `40` ถึงโกดังจีน → `5` สำเร็จ.
> The re-derive must be **two-way inside {4,40}** (so a wrongly-`40` order drops
> back to `4` when not-all-arrived — the P22328 bug) and forward-only out of `5`.
>
> Scope: STATUS-ONLY. No money / sell / receipt change. The sell re-stamp on →5
> stays the existing `recomputeSell` path (unchanged).

---

## 0. Grounding — what the source actually says

### Forwarder `fstatus` meaning (SOT `lib/forwarder/forwarder-status.ts` FSTATUS_CFG)
| fstatus | label | meaning for the gate |
|---|---|---|
| `1` | รอเข้าโกดังจีน | NOT arrived |
| `2` | ถึงโกดังจีนแล้ว | **arrived** (เข้าโกดังจีน) — the `arrived` threshold |
| `3` | กำลังส่งมาไทย | arrived + **past container** (ออกจากจีนแล้ว) → done |
| `4` | ถึงไทยแล้ว | done |
| `5` | รอชำระเงิน | done |
| `6` | เตรียมส่ง | done |
| `7` | ส่งแล้ว | done |
| `99` | (cancelled / void) | excluded everywhere |

- `arrived(forwarder)` ⇔ `fstatus ∈ {2,3,4,5,6,7}` (≥ 2).
- `fcabinetnumber` = **เลขตู้** assigned at container close. A non-empty
  `fcabinetnumber` means the parcel was loaded into a closed container — a stronger
  "done" signal than fstatus alone (the row may still read `2`/`3` for a beat while
  the cabinet number is already stamped). Confirmed: `container-box-breakdown.ts`
  fetches by `.eq("fcabinetnumber", …)` and `hasContainer = fcabinetnumber !== ""`
  is the existing `countShopArrivals` semantics.

### One shop = one `tb_order` row
`tb_order` row carries `cnameshop` (ร้าน), `ctitle`, `cimages`, `ctrackingnumber`
(the China-side tracking the seller hands us per shop, comma-bag possible) — linked
to `tb_forwarder` by `ctrackingnumber = ftrackingchn`. A "real shop" = a row with a
ร้าน OR สินค้า OR tracking (fully-empty junk rows skipped).

### Current state of the 3 mirrors (all already ALL-shops aware, ภูม 2026-06-30)
- `lib/admin/shop-order-arrivals.ts` `countShopArrivals` — per-shop roll-up
  (`allArrived`, `allDone`). **DONE threshold today** = `hasContainer || fstatus∈{3..7}`.
- `lib/admin/maybe-complete-shop-order.ts` — app gate (tracking-complete + `allDone`
  → flip `{4,40}`→`5`). Forward-only via `.in("hstatus",["4","40"])`.
- `lib/admin/advance-linked-shop-order.ts` — per-forwarder-write advance
  (`allDone`→`5`, `allArrived`→`40`). Called from MOMO `propagate.ts` + the manual
  `forwarders.ts` bulk-status path.
- DB trigger `supabase/migrations/0234_shop_all_shops_arrival_gate.sql`
  `advance_shop_order_on_forwarder_arrival()` — fires AFTER INSERT/UPDATE OF
  fstatus,fcabinetnumber ON tb_forwarder; all_done→`5` (from {4,40}), all_arrived→`40`
  (from `4` only), else stay.

### THE TWO BUGS this spec closes
1. **No down-correction.** Trigger/TS only ever advance `4→40→5`; `all_arrived→40`
   guard is `.eq("hstatus",'4')`. An order at `40` whose state later regresses
   (a forwarder reverted, a new not-yet-arrived shop added, data-drift) — or that was
   wrongly stamped `40` — is **never re-derived back to `4`**. Owner P22328.
2. The same applies inside {4,40}: status must re-compute as a pure function on EVERY
   forwarder change, not only when it can advance.

---

## 1. THE pure status function (the deliverable)

Add to `lib/admin/shop-order-arrivals.ts` (alongside `countShopArrivals`):

```ts
/**
 * The OWNER's 3-stage rule as a pure function of the per-shop arrival roll-up.
 * STATUS-ONLY. Maps a ShopArrivalSummary → the status the order SHOULD be at,
 * within the active set {4,40} (the only statuses this gate governs).
 *
 *   allDone     → '5'  สำเร็จ            (ทุกร้านได้เลขตู้ / ออกจากจีนแล้ว)
 *   allArrived  → '40' ถึงโกดังจีน        (ทุกร้านถึงโกดังจีน แต่ยังมีร้านไม่ได้เลขตู้)
 *   otherwise   → '4'  รอร้านจีนจัดส่ง    (ยังมีร้านที่ยังไม่ถึง / ยังไม่ส่ง)
 *
 * Note allDone ⇒ allArrived (done is a superset of arrived), so the order
 * (allDone first) is correct.
 */
export function deriveShopStatus(s: ShopArrivalSummary): "4" | "40" | "5" {
  if (s.totalShops === 0) return "4";   // no real shop yet → stay at 4 (never auto-5)
  if (s.allDone)    return "5";
  if (s.allArrived) return "40";
  return "4";
}
```

### `hasCabinet` (DONE) definition — make it robust
The per-shop `done` in `countShopArrivals` (and the trigger's all_done subquery)
**must** treat as done a shop with ANY forwarder that has:

```
COALESCE(btrim(f.fcabinetnumber),'') <> ''   -- เลขตู้ assigned (container close)
OR f.fstatus IN ('3','4','5','6','7')         -- clearly past container
```

This is exactly the existing `DONE_FS = {3,4,5,6,7}` + `hasContainer` in the TS, and
the `(COALESCE(btrim(o ... fcabinetnumber),'') <> '' OR f.fstatus IN ('3','4','5','6','7'))`
clause in the 0234 trigger. **No change to the DONE definition** — keep it. The
fstatus≥4 OR-clause is the robustness against a missing cabinet number on an
arrived-and-past parcel.

`arrived` (≥2) stays `fstatus IN ('2','3','4','5','6','7')`. Unchanged.

---

## 2. KEY CHANGE — allow `40 → 4` (the two-way re-derive)

The re-derive must compute the target with `deriveShopStatus(summary)` and write it
whenever it differs from the current status, **for any order currently in {3,4,40}**,
with these guards:

- **Never auto-demote FROM `5`.** Past-completion is forward-only. A `5` order is
  NOT re-derived live (it is excluded from the live re-derive scope). A wrongly-`5`
  order is surfaced for **manual review** (see §4 backfill), never auto-reverted.
- **`6` ยกเลิก untouched** — excluded from every re-derive (and from `5`).
- **`3` (สั่งสินค้า · ชำระแล้ว)** is included in the scope only so that a forwarder
  arriving before the order reaches `4` still pulls it forward to `40`/`5` if every
  shop is already arrived/done — but in practice `3` advances to `4` via the
  shop-tracking flow, so the common case is {4,40}. The write target is still one of
  {4,40,5}; a `3` order with `deriveShopStatus()==='4'` stays `3` (do NOT write `3→4`
  here — that's the shop-tracking handler's job). Concretely:

```
current ∈ {4,40}        → write deriveShopStatus(summary) if it differs
current == 3            → write ONLY if deriveShopStatus(summary) ∈ {40,5} (forward pull); never demote 3
current == 5 / 6 / 99   → never touched by the live re-derive
```

### 2a. Rewrite the three TS mirrors to use `deriveShopStatus` + allow demotion

**`advance-linked-shop-order.ts`** — replace the "advance-only" body:
```ts
const summary = await countShopArrivals(admin, hno);
const target = deriveShopStatus(summary);   // '4' | '40' | '5'

// Read current status (forward-only out of 5/6).
const { data: hdr } = await admin
  .from("tb_header_order").select("hstatus").eq("hno", hno).maybeSingle<{hstatus:string|null}>();
const cur = (hdr?.hstatus ?? "").trim();
if (cur === "5" || cur === "6" || cur === "99") return null;       // forward-only / cancelled

// allowed live set + the 3→ forward-pull rule
const writable =
  (cur === "4" || cur === "40")              // {4,40} → any of 4/40/5
  || (cur === "3" && (target === "40" || target === "5"));  // 3 → forward pull only
if (!writable || cur === target) return null;

const { data: advRows, error } = await admin
  .from("tb_header_order")
  .update({ hstatus: target, hdateupdate: nowIso })
  .eq("hno", hno)
  .in("hstatus", cur === "3" ? ["3"] : ["4","40"])   // TOCTOU guard on the read value
  .select("hno");
```
This now writes `40→4` (demotion) as well as `4→40`, `4→5`, `40→5`. The `.in()`
WHERE keeps it idempotent + race-safe.

**`maybe-complete-shop-order.ts`** — after the existing tracking-complete check
(`slotCount===trackingCount`), replace the `if(!arrivals.allDone) return` early-exit +
the hard-coded `hstatus:'5'` flip with a `deriveShopStatus` re-derive so the same call
can settle the order to `40` (or leave `4`) when not all done, AND flip to `5` when
done. Keep the existing `recomputeSell` re-stamp ONLY on the `→5` branch (that is the
only branch that completes). Guard `.in("hstatus",["4","40"])`. Returns
`completed=true` only when it wrote `5`.

**The 0234 trigger** — add the `40→4` (and `40` stays / drops) down-correction:
replace the two one-directional UPDATEs with a single derive-and-write that also
demotes. New trigger body core:

```sql
-- compute all_done / all_arrived exactly as today (unchanged subqueries), then:
IF all_done THEN
  UPDATE public.tb_header_order SET hstatus='5', hdateupdate=now()
   WHERE hno=target_hno AND hstatus IN ('4','40');
ELSIF all_arrived THEN
  UPDATE public.tb_header_order SET hstatus='40', hdateupdate=now()
   WHERE hno=target_hno AND hstatus='4';        -- 4 → 40 (advance)
ELSE
  -- KEY CHANGE: not-all-arrived → an order sitting at 40 must DROP BACK to 4
  -- (P22328). Never touch 5/6/99 (forward-only / cancelled).
  UPDATE public.tb_header_order SET hstatus='4', hdateupdate=now()
   WHERE hno=target_hno AND hstatus='40';        -- 40 → 4 (demote)
END IF;
```
Ship as a NEW migration (next free number — verify ledger; the repo's last is `0234`,
so **`0235_shop_arrival_gate_allow_demote.sql`**) that `CREATE OR REPLACE`s the
function. The trigger binding (AFTER INSERT/UPDATE OF fstatus,fcabinetnumber) is
unchanged.

> ⚠️ Migration discipline: DEV-apply + reconcile to prod per the DEV-SYNC rule
> (`SUPABASE_DB_PASSWORD=… node scripts/reconcile-migrations.mjs --ref … --from 0235 --to 0235`).
> Confirm `0235` is free in the ledger before writing (CLAUDE_TECHNICAL.md says next
> free was 0229, but 0229–0234 have since landed; verify).

---

## 3. Re-derive SCOPE (what fires, and which orders it touches)

- **Trigger (DB)** — fires on EVERY `tb_forwarder` write of fstatus/fcabinetnumber;
  resolves the linked `hno` (reforder, else by `ctrackingnumber`); re-derives that one
  order if its `hstatus ∈ {4,40}` (advance/demote) — `5/6/99` untouched. This is the
  systemic SOT and covers every path (MOMO sync, manual edit, bulk).
- **TS mirrors** — same logic, best-effort, so the in-action result + audit line match
  immediately (the trigger then guarantees correctness even on stale read).
- **Order set per forwarder change:** only the ONE order linked to the written
  forwarder (by reforder/tracking) — never a table scan. Re-derive it on every such
  change.

---

## 4. ONE-TIME backfill plan

Goal: bring existing orders into line with the pure function, **without** blindly
demoting completed orders.

Script `scripts/backfill-shop-3stage-2026-06-30.mjs` (dry-run default → `--apply`):

1. Select candidate orders: `tb_header_order` where `hstatus IN ('3','4','40','5')`
   AND not cancelled. (Pull `hno`, `hstatus`.)
2. For each, compute `summary = countShopArrivals(hno)` + `target = deriveShopStatus(summary)`.
3. Bucket:
   - **`{4,40}` → target differs** → safe to write live (incl. `40→4`). Apply on `--apply`.
   - **`3` → target ∈ {40,5}** → forward-pull, safe. Apply.
   - **`5` → target ≠ '5'** (i.e. NOT all shops done — a wrongly-`5` order): **DO NOT
     write.** Emit to a review list (`hno`, totalShops, doneShops, arrivedShops,
     which shops are missing เลขตู้) for OWNER decision. The owner decides per order
     whether to revert (manual) — the script never auto-demotes a `5`.
   - **`5` → target == '5'** → already correct, no-op.
4. Print: counts per bucket + the full `5`-mismatch review list. On `--apply`, write
   only the safe buckets (never the `5`-mismatch).
5. Idempotent (re-run writes nothing once converged · `.in()` guards on update).
6. Money: NONE. Status-only. (The `→5` sell re-stamp is the live `recomputeSell` path,
   not part of this status backfill — the backfill writes only `hstatus`+`hdateupdate`.
   If a backfilled `→5` order needs its sell re-stamped, that is the existing app flow.)

---

## 5. GROUPING spec — collapse items by `ctrackingnumber` on the edit page

### Why
Today `shop-fields-board.tsx` groups by **`cnameshop`** (ร้าน). The owner wants items
that share the **SAME `ctrackingnumber`** to collapse into ONE collapsible dropdown
whose HEADER summarizes that tracking — mirroring the report-cnt box-breakdown
dropdown (`cnt-list-table.tsx` `BoxBreakdownPanel` + the chevron-expand row).

### Mount point
- **Page:** `app/[locale]/(admin)/admin/service-orders/[hNo]/edit/page.tsx` — builds
  `shopFields` (grouped by cnameshop, L327-359) + mounts `<ShopFieldsBoard shops={shopFields} … />`
  (L735). Add a SECOND grouping pass keyed by `ctrackingnumber` from the same
  `itemsRaw`/normalized items, and pass it as a new optional prop
  `trackingGroups={…}` to the board.
- **Component:** `app/[locale]/(admin)/admin/service-orders/[hNo]/shop-fields-board.tsx`
  — render the tracking-grouped collapsible dropdowns. Reuse the chevron-expand
  pattern (`ChevronDown`/`ChevronRight` + `expanded` Set state) from
  `cnt-list-table.tsx`. The status-aware per-shop INPUT cards stay as they are (they
  are the edit surface); the tracking grouping is an at-a-glance SUMMARY view (it can
  sit above the per-shop cards, or be a toggle "จัดกลุ่มตามแทรคกิ้ง").

### Data shape (server-built in edit/page.tsx)
```ts
export type TrackingGroup = {
  tracking: string;            // ctrackingnumber ("" = ยังไม่ส่ง → its own group)
  itemCount: number;           // จำนวนรายการ in this tracking
  totalQty: number;            // จำนวนรวม (Σ camount, skip crewallet==='1')
  subtotalCny: number;         // ¥รวม (Σ camount×cprice + cshippingchn, skip refunded)
  // arrival status of the tracking (from countShopArrivals shop rows / forwarder):
  fstatus: string;             // linked forwarder status ("" = no forwarder)
  hasContainer: boolean;       // เลขตู้ assigned
  arrived: boolean;            // fstatus ≥ 2
  done: boolean;               // hasContainer || fstatus ≥ 3
  fNo: number | null;          // linked tb_forwarder id (deep link #fNo)
  items: ShopFieldsItem[];     // the rows folded into this tracking
};
```
Build by reducing the normalized items into a `Map<string, TrackingGroup>` keyed by
`(ctrackingnumber ?? "").trim()`; resolve arrival per tracking from the SAME
`countShopArrivals`/`shopArrivals.shops` data (each `ShopArrival` already carries
`tracking`, `fstatus`, `hasContainer`, `arrived`, `done`) so the SUMMARY and the
gate agree to the satang.

### Header summary fields (what the dropdown header shows — mirror report-cnt)
Per tracking group header (one row, collapsible):
1. **แทรคกิ้ง** — `tracking` (mono) · `"— ยังไม่ส่ง"` when empty.
2. **arrival pill** — derive from the group's `done`/`arrived`/`fstatus` via
   `fstatusBadge` (SOT): `รอร้านจีนจัดส่ง` / `ถึงโกดังจีนแล้ว` / `กำลังส่งมาไทย` … with
   the next-action hint (`badge.next`). Owner's 3-stage shows here per-tracking.
3. **จำนวนรวม** — `totalQty` (ลูกน้ำ).
4. **¥รวม** — `subtotalCny` (2dp).
5. **รวม (THB est.)** — optional, only if a rate is available (display-only, NOT a
   new money write).
6. **#fNo link** — if `fNo != null`, an `<ExternalLink>` "ฝากนำเข้า #fNo" (reuse the
   per-shop spawn-resolved link pattern already in the board L327-352).
7. **chevron** — expand → the items table (image · title/link · variant · จำนวน ·
   ¥/ชิ้น · ค่าส่งจีน · รวม ¥), same columns as the existing per-shop items table.

This is STATUS/display-only — it reads `countShopArrivals` output, never writes.

---

## 6. Confirmations (per the ask)

- **hasCabinet def** = `fcabinetnumber` (เลขตู้, non-empty) **OR** `fstatus ∈ {3,4,5,6,7}`.
  Unchanged from current `countShopArrivals` / 0234 trigger. ✅
- **STATUS-ONLY** — the re-derive + trigger + backfill write only
  `hstatus` (+ `hdateupdate`). No money / sell / receipt change. ✅
- **Sell re-stamp on →5** = the existing `recomputeSell` in `maybeCompleteShopOrder`
  (live `→5` branch only) — unchanged. The backfill does NOT re-stamp sell. ✅
- **`6` ยกเลิก** untouched everywhere. ✅
- **Never auto-demote FROM `5`** (live) — `5` is excluded from the live re-derive;
  a wrongly-`5` order is reported in the backfill review list for owner decision, not
  auto-reverted. ✅

---

## FINAL — the status function

```ts
// pure · status-only · governs {4,40} live, allows 40→4 (down-correct), forward-only out of 5/6/99.
function deriveShopStatus(s: ShopArrivalSummary): "4" | "40" | "5" {
  if (s.totalShops === 0) return "4";
  if (s.allDone)    return "5";   // ทุกร้านได้เลขตู้/ออกจากจีน
  if (s.allArrived) return "40";  // ทุกร้านถึงโกดังจีน
  return "4";                     // ยังมีร้านไม่ถึง/ยังไม่ส่ง
}
// where (per shop): arrived = fstatus∈{2..7} ; done = fcabinetnumber≠'' OR fstatus∈{3..7}
// all* = every real shop (ร้าน/สินค้า/tracking present) meets the level.
// Apply target only to orders in {4,40} (write any of 4/40/5) + 3→{40,5} forward-pull;
// never write 5→lower live; 6/99 untouched.
```
