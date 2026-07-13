# 🔴 WIP → next session: ใบวางบิล↔ใบเสร็จ PART 2 (money live-view/freeze) — NOT verified, NOT on main

**Owner 2026-07-13 core complaint (still open):** "แก้ใบวางบิลให้ถูก พอเสร็จ ใบเสร็จก็เป็นอีก · แก้ยอดทีหลัง ข้อมูลในใบต้องเปลี่ยนตาม · ทำไมต้องยกเลิกอีก" — editing a bill/forwarder **AMOUNT** after issue must propagate to BOTH ใบวางบิล + ใบเสร็จ (no cancel+reissue), and the two must never drift on money. Workflow found **19/74 prod bill↔receipt pairs disagree** (mao/WHT asymmetry).

**PART 1 (address) = DONE + on main** (`85060c40` + `9861643a` · mig 0253): แก้ที่อยู่จัดส่ง → propagate ทั้ง 2 ใบ (single-slot rule). #61 fixed.

**PART 2 (money) = implemented but STOPPED mid-verify (owner stopped · 1h09m/1.7M tok · limit).** The full implementation is in **`part2-bill-receipt-money-liveview.patch`** (this dir · tracked-file diff + the 3 new files appended). **NOT applied to main** (unverified money code — no build/money-review passed).

## Design (money live-view → freeze → pin · G1 preserved)
Money is **LIVE-VIEW while the bill is UNCOMMITTED** (status=issued + no slip + no receipt yet → a source edit auto-reflows into bill + QR; no receipt exists so ZERO drift, no cancel needed), then **FREEZE at the commit boundary** (slip-submit / mark-paid) into `total_thb`, and **PIN the receipt** to that frozen value (G1 unchanged). After commit both docs are immutable; a stale source edit shows a **DRIFT BANNER** (screen-only, `.no-print`) + reconciles only non-money fields; a real money correction goes through refund/reissue (surfaced, never silent). Live-view is confined to the pre-receipt window → G1 "receipt == amount paid" is never violated.

## What the patch contains
- **NEW `lib/billing/resolve-bill-amounts.ts`** (+ test) — pure resolver extracted from the create math (billing-run.ts ~1431-1524): live forwarder rows + stored adjustments + mao override → {subtotal, maoFee, total}. COD domestic-leg exclusion (via the new outstanding.ts paymethod fix) + mao-once + WHT.
- `lib/billing/load-billing-run-document.ts` — amount-live → resolver over live rows; else frozen. `frozenVsLive` flag.
- `actions/admin/billing-run.ts` — freeze total at mark-paid/slip-submit + pin receipt; route getInvoiceList/getInvoiceDetail through resolver.
- `actions/admin/customer-rate.ts` — drop the "skip open-bill re-price" ONLY for amount-live bills.
- `billing-run/[id]/page.tsx` + `print/page.tsx` + `(public)/b/[token]/page.tsx` + `billing-run-paper.tsx` — drift banner (screen-only) + amount-live routing.
- **`supabase/migrations/0254_billing_invoice_item_amount_override.sql`** — NOT applied to any DB.

## To resume (next session · fresh limit)
1. `git apply docs/wip/part2-bill-receipt-money-liveview.patch` (or re-implement from the design above — the design is sound).
2. Gate: `node scripts/tsc-check.mjs` (0) + `npx tsx lib/billing/resolve-bill-amounts.test.ts` + outstanding/collect/debit/billing tests + full `next build`.
3. **MONEY-REVIEW (adversarial):** G1 — a PAID receipt's amount == its bill, always? all surfaces (bill paper · list · /b/token QR · receipt) agree after a mid-flight edit? no silent paid-amount change? resolver Σ === old create math on an unedited bill (no regression)?
4. Apply mig 0254 prod+dev (`apply-migration-generic.mjs` + `reconcile-migrations.mjs`) — NEXT FREE = **0254**.
5. Only push to main after build 0 + money-review PASS.
