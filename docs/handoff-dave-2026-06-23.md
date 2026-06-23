# 📋 Handoff for เดฟ — 2026-06-23 (from ภูม · Poom-pacred)

> **For เดฟ's agent:** these are the carryover items from ภูม's 2026-06-23 work-machine session.
> The fixes ภูม shipped are already on **Poom-pacred** (navbar narrow-xl · driver-detail legacy 3-zone ·
> forwarder ยอดเก็บจริง scope-fix · billing backfill script · learnings). The items below are what's
> **left for เดฟ** — each is self-contained so you can act without re-deriving context.
>
> 🔑 **Money note up front:** TASK A's freight number is **already CORRECT** (legacy-verified). Do **NOT**
> change the price math. It is a DISPLAY clarity fix only. ภูม was explicit: "ยังไม่ต้องแก้ · เดี๋ยวพี่เดฟตรวจ
> งานจัดการต่อ".

---

## ✅ TASK A — freight-price edit-page is confusing ("มั่ว") — DISPLAY-ONLY fix (money is correct)

**Where:** `/admin/forwarders/[fNo]/edit` · component `app/[locale]/(admin)/admin/forwarders/[fNo]/per-tracking-editor-client.tsx`

**Symptom (ภูม flagged, real order 1780103566 · 6 trackings · custom rate 11฿/kg, 3300฿/CBM):** the page
shows THREE freight numbers and you can't tell which is the charge —
  - คิดตามน้ำหนัก (whole order): 306 × 11 = **3,366.00**
  - คิดตามปริมาตร (whole order): 1.23756 × 3300 = **4,083.96**
  - "ระบบเลือก คิดตามราคาสูงสุดต่อแทรคกิง (รวมทุกแทค)" → **4,324.05**  ← the one actually used

**Legacy-verified truth (read from source — DO NOT re-litigate the math):**
- The SAVE path (`pcs-admin/.../forwarder.php update_data` L1983-2010 · ported faithfully in
  `lib/forwarder/resolve-rate.ts` `resolveForwarderRate` L400-409) = **"ราคามากสุด"**: per tracking, compute
  `priceKg = weight×rateKg` and `priceCbm = cbm×rateCbm`, **pick the MAX** (ties → CBM); when comparison is
  ON it switches to `KGPerCBM > threshold`. PER ROW; a split order = N tb_forwarder rows priced
  independently, summed.
- The legacy live PREVIEW (`pcs-admin/.../calPriceNew.php` L197-209) uses `KGPerCBM > 250` instead — so
  **legacy's own preview and save DISAGREE** (a legacy quirk).
- → **`4,324.05` is the correct, legacy-faithful charged amount.** The stored Σ ftotalprice already equals
  it. The customer was NOT mis-charged.

**Why it LOOKS มั่ว = display only:** the editor prints the WHOLE-ORDER weight (3,366) and WHOLE-ORDER volume
(4,083.96) reference lines, but the chosen value is the PER-TRACKING-max SUM (4,324.05) — which matches
**neither** whole-order line → reads like a bug.

**What to do (DISPLAY only · NO money-math change):**
1. In `per-tracking-editor-client.tsx`, replace/augment the confusing whole-order "คิดตามน้ำหนัก / คิดตาม
   ปริมาตร" reference lines with a **per-tracking breakdown** — each tracking row showing `weight-price` vs
   `volume-price` and which one won (max) — so the 4,324.05 total is self-justifying.
2. Keep the chosen-total label clear ("รวม max ต่อแทรคกิง = ฿4,324.05 · ตรงกับที่ระบบเซฟ").
3. Leave `lib/forwarder/resolve-rate.ts` UNTOUCHED (the math is correct & legacy-faithful).

**Verify:** open `/admin/forwarders/51998` or any multi-sibling order on DEV; the breakdown should add up to
the chosen total with no orphan whole-order number. (Full finding: `docs/learnings/pacred-domain-knowledge.md`
[2026-06-23] "China→Thailand freight price: legacy has TWO formulas".)

---

## 🟡 TASK B — เหมาๆ (PCSF flat fee) charge-path — needs an OWNER/ภูม decision before coding

**ภูม's rule (stated 2026-06-23):** ค่าเหมาๆ = **1 ครั้งต่อ 1 ออเดอร์/shipment**. ตู้ปิดมาไม่พอต่อ 1 คำสั่งซื้อ
(split) → เรารับเอง · ห้ามเกิน 1 ต่อออเดอร์. แต่ลูกค้าเดียวกันสั่ง 2 ออเดอร์/2 shipment → เก็บเหมาๆ 2 ครั้งได้
(แยก shipment).

**State now:**
- **Detail page (ยอดเก็บจริง)** — ✅ already fixed (`60702110`): aggregates one order's siblings (by
  baseTracking) → `computeForwarderDebitBatch` adds the ฿100 เหมาๆ **once per order**. Matches ภูม's rule.
- **Actual CHARGE path** (`lib/forwarder/forwarder-collect-total.ts` `computeForwarderCollectTotal` customer
  self-pay · `lib/forwarder/forwarder-debit-total.ts` admin pay-on-behalf) — still **legacy** = ฿100 once
  per PAY-SELECTION (the ticked rows · `calPrice.php` L40-41). Normal flow (pay a whole order together) =
  1 per order = matches. **Edge cases diverge from ภูม's rule:** 2 orders paid together → legacy charges 1
  (ภูม wants 2) · a split order paid in pieces → legacy charges multiple (ภูม wants max 1).

**Decision needed (ภูม dismissed the question — undecided):** keep legacy (per-pay-selection) OR change the
charge math to **฿100 per distinct order (baseTracking)** to enforce "1 per order" exactly. The latter
**diverges from legacy** (improvement) and is a money-math change → get an explicit yes before touching
`forwarder-collect-total.ts` / `forwarder-debit-total.ts`.

---

## 🔧 TASK C — prod actions เดฟ runs (after deploying Poom-pacred → prod)

1. **Deploy Poom-pacred → prod** (the billing 3-link sync + the detail fixes are forward-only / not yet on
   prod).
2. **Run the billing backfill** to clear receipts/forwarders stuck from bills paid BEFORE the sync fix:
   ```
   node --env-file=<prod-env> scripts/backfill-paid-invoice-status-sync-2026-06-23.mjs        # dry-run → see counts
   node --env-file=<prod-env> scripts/backfill-paid-invoice-status-sync-2026-06-23.mjs --apply  # write
   ```
   It flips paid-invoice forwarders `fstatus 5→6` and fully-covered receipts `rstatus 3→1`. SAFE: status-only,
   guarded (`.eq('5')`/`.eq('3')`), dry-run by default. DEV dry-run = 0 (DEV has no paid invoices).

---

### Commits on Poom-pacred this session (for review)
- `dc6503a5` billing 3-link backfill script
- `2c778b18` navbar LocaleSwitcher narrow-xl clip fix (+ learning)
- `22d9f27d` driver detail → legacy 3-zone rebuild (+ `lib/admin/forwarder-siblings.ts`)
- `60702110` forwarder ยอดเก็บจริง vs รายการสินค้า scope-mismatch fix (money · the shared sibling helper)
- `3d3db6f6` learnings (freight 2-formula · navbar) + CLAUDE.md save-point

Gate: tsc 0 · eslint 0 on every commit (the only tsc noise is `.next/dev/types/*` from a running preview
server — a documented false-positive, not source).
