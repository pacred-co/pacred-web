# MOMO cargo — the DATA-TRUTH hierarchy + the money rules that fall out of it (2026-07-13/14)

Two owner-driven days of MOMO cargo money bugs (over-bill, under-bill, double-count, wrong box counts) all trace to ONE thing: **we kept trusting the wrong data source.** This is the hierarchy, and the money rules that follow.

## 1. The truth hierarchy (highest → lowest)

| Source | What it is | Trust |
|---|---|---|
| **แต้ม packing list (.xlsx per container)** | The warehouse's PHYSICAL count — per-box tracking, weight, CBM, dims, CG box-mark, real container | ✅ **GROUND TRUTH** |
| `tb_forwarder` rows | Our billable rows (base + `-N` siblings) | The billable state — but only as good as what fed it |
| `momo_import_tracks.weight_kg/cbm/quantity` | MOMO's container-close AGGREGATE | ⚠️ often inflated / stale / **0** |
| `momo_box_detail` | MOMO's per-box breakdown (PER-PIECE metrics × quantity) | ⚠️ can disagree with the aggregate AND with itself |
| MOMO Live web scrape | Current MOMO display | ⚠️ better than the partner feed, still not physical |

**MOMO's own numbers contradict each other.** Real prod: tracking `1782555393` (PR067) — sibling rows summed **19,991 kg** while the aggregate said **150 kg**; `momo_box_detail` for `800206224068` summed 218 kg while the aggregate said 249 kg. When MOMO's numbers fight each other, **no derivation can save you** — you need the แต้ม packing list. (52137-class rows are `flagged`, never auto-guessed.)

## 2. Money rules (each was a real bug)

**R1 — Before re-valuing a base row, CHECK FOR `-N` SIBLING ROWS.** My backfill re-valued 3 base rows UP to the full-shipment weight after only corroborating `momo_box_detail`. They already had sibling rows (the base was box-1 of a split) → `base + siblings` **double-counted** (52095: Σ 1388 kg billed for a 971 kg shipment). Query `ftrackingchn = base OR ~ '^base-[0-9]'` FIRST. `momo_box_detail` corroboration is necessary but NOT sufficient — it's a display table; the billable truth is the tb_forwarder rows. → memory [[momo-backfill-check-siblings-first]]

**R2 — Never FAN an aggregate onto N split rows.** Writing the shipment Σ onto every sibling multiplies the charge N×. A split shipment must be written PER-BOX (each sibling gets ITS box), so `Σ(siblings) === the shipment total`. The `planBoxRowSplit` / packing-ingest guards enforce this; the reconcile action refuses (`multi_row`) rather than guess.

**R3 — เหมาๆ (PRF ฿100) is ONE fee per DELIVERY, not per tracking.** It was anchored per base-tracking → a customer with 2 trackings in the SAME container (arrived + shipped together) was charged ฿200. The key is the **delivery batch = `fcabinetnumber`** (`deliveryKey = fcabinetnumber || baseTracking || id`, deduped). Different containers = different deliveries = ฿100 each (still correct). Thread the cabinet into EVERY consumer (debit · invoice · pay-user · receipt) so bill == receipt == collect-total.

**R4 — A box with a PRICE is a real box, even at 0 kg.** The `momo-bill-header` drop (which removes MOMO's phantom ฿0/0-kg declared-count header to stop a double-count) must also check MONEY: a bare row with `ftotalprice > 0` is a genuine box that just hasn't been weighed → dropping it under-counts (the owner's 74-vs-75). Drop only when `money === 0 AND weight === 0`.

**R5 — Billed rows are FROZEN.** Every backfill/ingest/split guards `fstatus NOT IN ('5','6','7')` in the WHERE (not just in JS) — a row that races into billing between read and write must update 0 rows.

**R6 — Weight changed ⇒ zero the price and re-price through the ENGINE.** Never hand-write a rate. Zero `frefrate/frefprice/ftotalprice`, then run the proven `backfill-momo-forwarder-rates.mjs` (it re-prices blank-rate non-billed MOMO rows from the corrected dims via the real waterfall). Check the blank-rate count BEFORE zeroing so you know exactly which rows the re-price will touch.

## 3. Ingesting the แต้ม packing list — what actually works

- **USE THE REAL PARSER** (`lib/admin/momo-packing-xlsx-parser.ts`). A naive inline xlsx read looks fine and is WRONG — it grabs the summary block, the repeated data-header rows, and the `CBX…-EK07` routing rows as if they were parcels. The real parser skips them + handles Format A/B + GZE/GZS. It imports `server-only` transitively → to use it from a script, port it (inline `baseTrackingOf`) and **prove the port with a selftest** against a known fixture (`GZS260624-1` → `1782110296` = 6 boxes / 82.5 kg).
- **The filename IS the real container** (`GZS260624-1.xlsx`) — that's how you resolve the routing-batch placeholder cabinets (`PR20260701-EK01`) and link the shipment to its real ตู้.
- **CG = เลขกล่อง (box mark), NOT the sack number** (owner correction 2026-07-14).
- **Cross-container is real** — one tracking's boxes can ship on SEVERAL sailings (`1783582423` appears in 3 packing files, its portions summing to the fw total). Collapsing per-file would clobber the other sailings and LOSE weight. Detect (base appears in >1 file) → report for manual handling, never write.

## 4. Process lessons

- **Two workflows must never edit the same tree concurrently** — a cargo audit and a bill/receipt audit both wrote `actions/admin/billing-run.ts`; they happened not to clobber, but the later writer's read-time decided the outcome. Serialize.
- **Never run two `next build`s at once** — the second fails with "another build is already running" and reports a FALSE `BUILD_EXIT=1`. Read the log, not just the exit.
- **A teammate's handoff script is a hypothesis, not a fix.** ภูม's blanket "re-value 21 rows to the MOMO aggregate" would have destroyed 15 of them (agg=0 → zero the bill; agg<current → lower a staff-measured truth). Classify + corroborate before running someone else's money script — and dry-run it. (It also had a real `id = any($1::text[])` type bug on a bigint PK that only fires on the apply path.)
