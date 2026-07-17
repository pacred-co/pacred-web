# เหมาๆ on a split-box shipment — dropped, then hand-patched into the wrong column (RESOLVED 2026-07-17)

> Owner 2026-07-16: "จ่ายแทนลูกค้า /admin/forwarders/52474 เอกสารไม่แจงค่าเหมาๆ · ระวังไป
> เก็บซ้ำ เหมาๆ อย่าให้เกิดอีก."
> **STATUS: FIXED + prod-reconciled 2026-07-17.** Diagnosed 2026-07-16 and deliberately
> deferred (the naive fix double-charges); the correct per-SHIPMENT anchor is now built,
> tested (10 assertions incl. both double-charge shapes) and wired.

## The bug (prod-verified)
- **#52474** = PR139 · fshipby=**PCSF** (เหมาๆ) · ftransportprice=**0** ·
  ftrackingchn=**`JYM800120650588-1/4`** — a `-N/M` **split box**. Its whole shipment is
  4 rows (`-1/4 … -4/4`); **no bare base row exists** (MOMO split at commit).
- `computeForwarderDebitBatch` anchored the ฿100 on the **BASE row (suffix 0)**, and by the
  2026-06-23 กันเก็บตังเบิ้ล rule **"a -N box sub-row NEVER anchors"** → a batch of only
  `-N` rows had **no anchor → maoFee = 0 → the fee vanished**.
- Blast radius measured on prod: **7 of 60** PCSF shipments have no base row
  (1783051207 19 rows · JYM800120650588 4 · X9002769 3 · LJ20503022 2 · X9002751 2 · …).

### The three symptoms were ONE root
| symptom the owner saw | mechanism |
|---|---|
| จ่ายแทนลูกค้า collects **1,085.55** vs the bill's **1,184.54** (−฿98.99 = ฿100 − 1% WHT) | `maoFee=0` → the debit is ฿100 short |
| **"เอกสารไม่แจงค่าเหมาๆ"** | `autoMaoFee=0` → staff hand-typed ฿100 into the free-text **"ค่าขนส่งไทย"** → it landed in `delivery_th_thb` while `mao_fee_thb=0`; the papers itemise เหมาๆ **from mao_fee_thb** → the line never rendered and the fee hid inside "ค่าขนส่งในไทย" |
| **"ระวังไปเก็บซ้ำ"** | `billing-run.ts` totals `subtotal + maoFeeTotal + … + deliveryThThb` — **two slots that both add**. Fixing the engine without moving the hand-patched ฿100 would bill ฿200 of เหมาๆ. (Prod check: **0 invoices had both** — the hole never fired.) |

## Why the naive fix is wrong (the reason it was deferred)
"Let the lowest `-N` **in the batch** anchor when no base is present" fixes the drop and
re-opens the fear: bill A(-1,-4) → ฿100 · bill B(-3,-4) → ฿100 = **฿200 for one ลอบส่ง**.
The election must not depend on how the batch is sliced.

## The fix — elect the carrier from the SHIPMENT, not the batch
**`lib/forwarder/mao-anchor.ts` · `resolveMaoAnchorIds(admin, trackings)`** reads EVERY
sibling of each base in `tb_forwarder` and elects ONE carrier fid per shipment:

    the bare base row (suffix 0) if the shipment has one   ← identical to legacy
    else the LOWEST-suffix เหมาๆ-eligible sibling           ← the previously-dropped case

`computeForwarderDebitBatch(rows, { …, maoAnchorIds })` then charges ฿100 iff the batch
**contains** that one row. Omit the option → unchanged legacy behaviour (back-compat).

    shipment HAS a base:  bill(base,-2) → ฿100 · bill(-3,-4) → ฿0     (= legacy)
    no base (MOMO split): bill(-1,-4)   → ฿100 · bill(-3,-4) → ฿0     (was ฿0 · ฿0)
    every box paid SOLO                 → ฿100 total, once

**Double-charge is impossible BY CONSTRUCTION** — two batches can never both contain the
same single carrier row. The per-BILL rule (owner 2026-07-15 · one ฿100 per collection
event even across containers) is untouched: the engine still takes at most ONE anchor out
of whatever is eligible.

Wired: `pay-user-view.ts` (the view) · `pay-user.ts` ×3 (the real debit) ·
`billing-run.ts` (so the fee lands in `mao_fee_thb` and the "ค่าส่งเหมาๆ (PCSF)" line
renders — the itemisation ask). Locked by `lib/forwarder/mao-anchor-split.test.ts` (10).

Fails safe: a DB error in the resolver returns an empty set → the engine falls back to
base-only → under-charge, **never** double-charge. Residual: a shipment with neither a base
nor a `-1` (prod: 1783051207 only, minSuffix=2, already billed) still drops — fails closed.

## Prod data reconcile (`scripts/reconcile-mao-fee-column-2026-07-16.mjs` · applied)
Moved the hand-patched fee `delivery_th_thb → mao_fee_thb` on **4 invoices** — **money-neutral**
(`total_thb` untouched; the script asserts every invoice still foots before COMMIT):

    FRI2607-00080 ฿100 · FRI2607-00032 ฿100 · FRI2606-00022 ฿100 · FRI2606-00006 ฿50

Correctly **SKIPPED** (the ฿100 there is NOT เหมาๆ): FRI2607-00019 (carrier `PCS` =
รับเองที่โกดัง) · FRI2607-00029 (blank carrier) · FRI2606-00008 (Flash — its rows carry
฿165 of real Thai shipping). Eligibility requires every billed row to be a เหมาๆ carrier
with `ftransportprice = 0`.

## Follow-ups
- `delivery_th_thb` is still a free-text field with no cross-check against the auto เหมาๆ.
  The drop is gone (so the workaround has no reason to recur) but a **guard** — warn when
  staff type ≈the flat fee on a PCSF-only bill that already has an auto fee — would close
  the slot-collision for good.
- 1783051207 (19 rows, minSuffix=2, no base, fstatus=6/billed) — owner call whether to
  re-bill the missed ฿100.

See [[momo-container-per-box-not-per-tracking]] · [[money-doc-chain-cod-and-linkage]] ·
`lib/forwarder/forwarder-debit-total.ts` · `lib/forwarder/mao-anchor.ts`.
