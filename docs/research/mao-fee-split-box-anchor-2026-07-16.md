# เหมาๆ dropped on จ่ายแทนลูกค้า for split-box shipments (2026-07-16 · #52474 · MONEY)

> Owner: "จ่ายแทนลูกค้า /admin/forwarders/52474 เอกสารไม่แจงค่าเหมาๆ · ระวังไปเก็บซ้ำ
> เหมาๆ อย่าให้เกิดอีก." Precisely diagnosed; NOT yet fixed — the correct fix is a
> cross-batch per-shipment anchor (double-charge-critical) that needs careful work,
> not a rush. Continues the prior `mao-fee-pay-on-behalf-audit` (hit usage limit mid-design).

## The bug (prod-verified)
- **#52474** = `tb_forwarder` PR139 · fshipby=**PCSF** (เหมาๆ) · ftransportprice=**0** ·
  ftrackingchn=**`JYM800120650588-1/4`** (a **-N/M SPLIT box** sub-row) · fstatus=5.
- `computeForwarderDebitBatch` (`lib/forwarder/forwarder-debit-total.ts`) charges เหมาๆ
  ฿100 **once per batch**, anchored to the **BASE tracking** (no `-N` suffix). Rule L183
  (owner 2026-06-23 กันเก็บตังเบิ้ล): **a `-N` box sub-row NEVER anchors.** So a batch that
  contains ONLY `-N` boxes (the base tracking isn't an eligible row) has **no anchor →
  maoFee=0 → the จ่ายแทนลูกค้า total drops the ฿100** (shows subtotal×0.99 = 1085.55 instead
  of the correct 1184.54; the ฿98.99 gap = ฿100 − 1% WHT).
- The **BILL is correct** (FRI2607-00080 total_thb=1196.50 = subtotal 1096.50 + 100), but the
  ฿100 sits in **`delivery_th_thb`, with `mao_fee_thb=0`** — the pay-on-behalf recompute never
  sees it.

## Two facets (do NOT conflate)
1. **DROP (owner's complaint):** split-box batches lose เหมาๆ on จ่ายแทนลูกค้า (above).
2. **DOUBLE-CHARGE (owner's fear):** the CURRENT anchor is **per-batch** (forwarder-debit-total.ts
   L176 "exactly ONE anchor across the entire batch"). If a shipment is split across **two bills**,
   each batch could anchor its own ฿100 → ฿200 for one ลอบส่ง. The naive "let -N boxes anchor when
   no base present" fix REINTRODUCES this — two -N batches of the same shipment both anchor.

## The correct fix = per-SHIPMENT anchor (spanning batches)
Anchor เหมาๆ to the **base tracking of the shipment** (`baseTracking(ftrackingchn)` strip `-N/M`),
charged **once per shipment regardless of how the bill is sliced**. This needs cross-batch state
(which forwarder/base already carries the เหมาๆ) — `computeForwarderDebitBatch` is a pure per-batch
fn, so the anchor decision must move up to a shipment-scoped resolver (or a stored `is_mao_anchor`
flag on the anchor forwarder, set once at bill/commit time). The prior audit's design table:
`[A-bare,B-1/2]→anchor A-bare ฿100 · [B-1/2,B-2/2] (no base)→anchor B-1/2 ฿100 · [B-2/2] alone→฿0
(no re-charge) · billA(-1,-4)+billB(-3,-4)→100+0` — i.e. the anchor is one row per shipment, and a
split that separates the anchor from a batch must NOT re-anchor.

## Data (prod · owner-gated · money)
6 active invoices carry เหมาๆ in `delivery_th_thb` with `mao_fee_thb=0` (the misfiled column):
**FRI2607-00080 / 00032 / 00029 / 00019 (100) · FRI2606-00022 (100) · FRI2606-00006 (50)**. These
BILL correctly (total includes it) but any recompute-based surface (จ่ายแทนลูกค้า) drops it. Backfill
= move the value delivery_th_thb→mao_fee_thb where it's the เหมาๆ (owner reviews · money).

## Why not rushed this session
The fix is cross-batch money-anchor logic with a real ฿200 double-charge failure mode — exactly what
the owner said "อย่าให้เกิดอีก". Verifying it needs the shipment-scoped resolver + a test matrix over
split/merge/re-bill (the prior audit was building this when it hit the limit). Rushing it on a
constrained budget would risk the money bug. Safe next step: build the per-shipment anchor resolver
+ its test matrix, then wire pay-user + the bill through it, then the 6-invoice backfill. See
[[status-rollback-on-cancel]] · `lib/forwarder/forwarder-debit-total.ts` · `lib/admin/momo-bill-header.ts` (baseTracking).
