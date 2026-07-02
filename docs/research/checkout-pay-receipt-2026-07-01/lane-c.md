# LANE C — ใบเสร็จ (receipt) drops ค่าส่งเหมาๆ (PRF flat shipping)

**Owner bug (PR7429 · `/admin/accounting/forwarder-invoice/15124`):** the ใบเสนอราคา/ใบแจ้งหนี้ (bill/invoice) SHOWS the ค่าส่งเหมาๆ line (~฿100 · mao_fee) but the ใบเสร็จ (receipt) omits it — the cargo receipt comes out ฿100 short of its bill and has no เหมาๆ line.

**Status:** FIXED (code) · tsc = 0 · NOT committed/pushed. One data backfill FLAGGED (not applied) for receipts already issued via the buggy path.

---

## Root cause

There are **two** `tb_receipt` INSERT writers on the cargo path (grep `from("tb_receipt").insert`, `actions/` + `lib/`):

| Writer | File | เหมาๆ handled? |
|---|---|---|
| Auto-issue on payment-land | `lib/admin/auto-issue-receipt.ts` (`autoIssueReceiptOnPaymentLand`) | ✅ CORRECT — computes `maoFeeThb` via `computeForwarderDebitBatch`, folds into `totalbeforewithholding`/`ramount`, stores `mao_fee_thb` (L285-304, L399) |
| **Manual issue / bill-flip source** | **`actions/admin/forwarder-invoice.ts` (`adminIssueForwarderInvoice`)** | ❌ **BUG — dropped it** |

`adminIssueForwarderInvoice` computed the receipt total from `perRowRaw()` **only** (the base outstanding buckets = `calcForwarderOutstanding`, which EXCLUDE the เหมาๆ), and its `tb_receipt` INSERT omitted the `mao_fee_thb` column (→ DB default `0`):

- `pricePayAll = rows.reduce((s, r) => s + perRowRaw(r), 0)` (old L319) — no maoFee.
- `totalbeforewithholding` / `ramount` derived from that base → ฿100 short.
- INSERT (old L345-369) had no `mao_fee_thb` → stored `0`.

The read/render side is **already correct** and was never the problem:
- `lib/receipt/load-receipt-document.ts` reads `mao_fee_thb`, sets `lineSumWithMao = totalLineSum + maoFee`, passes `maoFee` in `commonProps` (L399-403, L487-506).
- `lib/receipt/receipt-frozen-totals.ts` renders the FROZEN header figures (`totalbeforewithholding`/`ramount`) verbatim — these INCLUDE the เหมาๆ **when written correctly**.
- `components/receipt/receipt-paper.tsx` renders the "รวมค่าส่งเหมาๆ (PRF)" line when `maoFee > 0` (L504-509).

So the receipt was faithfully rendering **what was written** — and what was written by the manual path was: `mao_fee_thb = 0` and totals ฿100 short. The bill (`tb_forwarder_invoice`, written by `createBillingRunInvoice` in `actions/admin/billing-run.ts` L1237-1252) DID store `mao_fee_thb` → the mismatch.

### Why 15124's receipt specifically dropped it
`/admin/accounting/forwarder-invoice/15124` is a billing-run invoice. Its receipt is created one of two ways, both landing on the buggy manual path:
1. Manual "ออกใบเสร็จ" → `adminIssueForwarderInvoice` (creates receipt at `rstatus='3'`).
2. `markBillingRunPaid` (`actions/admin/billing-run.ts` L1421-1497) flips that pre-existing `rstatus='3'` receipt → `'1'` (the "FRG…-00001 stuck at รอชำระ" sync, L1485-1489). It only calls the correct `autoIssueReceiptOnPaymentLand` (L1507) **when no receipt exists yet** (idempotency `alreadyIssued` → no-op). If a manual receipt was already issued, that correct path is skipped and the ฿100-short manual receipt stands.

---

## Fix (files changed)

**`actions/admin/forwarder-invoice.ts`** — bring `adminIssueForwarderInvoice` in line with the auto-issue path:
1. Import `computeForwarderDebitBatch` from `@/lib/forwarder/forwarder-debit-total`.
2. Add `fshipby` to `ForwarderRowForReceipt` type + to the `tb_forwarder` SELECT (the carrier code that, with `ftrackingchn`, anchors the once-per-shipment เหมาๆ).
3. Totals: `pricePayBase` = Σ `perRowRaw` (unchanged base), then compute `maoFeeThb` from `computeForwarderDebitBatch(rows, { userId, isCorporate: corporate===1 })` (`Σ line.breakdown.maoFee`, rounded 2dp), then `pricePayAll = pricePayBase + maoFeeThb`. `totalbeforewithholding`, the juristic-1% test, and `ramount` all flow from the new `pricePayAll` (so เหมาๆ is in the WHT base too — consistent with the bill + auto-issue).
4. INSERT: add `mao_fee_thb: maoFeeThb`.

This mirrors `lib/admin/auto-issue-receipt.ts` L285-304 exactly (same engine, same anchor semantics, same `isCorporate` flag), so both receipt writers now produce byte-identical เหมาๆ handling.

No changes needed to the loader / frozen-totals / receipt-paper — they already read + render `mao_fee_thb`.

---

## Confirmation

- **Receipt shows ค่าส่งเหมาๆ:** `mao_fee_thb` is now written (> 0) on the manual path → loader passes `maoFee` → `receipt-paper.tsx` renders "รวมค่าส่งเหมาๆ (PRF) — {fee} บาท" (L504-509). ✅
- **Total == invoice (to the satang):** the receipt's `totalbeforewithholding`/`ramount` now include `maoFeeThb` via the SAME `computeForwarderDebitBatch` engine the bill uses (`createBillingRunInvoice` maoFeeTotal, and the create-preview `listEligibleForwarders` L550-552). Both docs anchor the flat ฿100 once-per-shipment (base tracking) with the same `isCorporate` 1% base → they reconcile. ✅
- **tsc:** `node scripts/tsc-check.mjs` → exit 0, no `error TS` (excluding `.next`). ✅
- **No regression to the auto path:** untouched; the two writers are now consistent.

> Note: this is a money/admin-auth server-action path — verified from source + tsc, not authed-click-tested (no admin login · §0c). To live-verify: issue a receipt for a PRF/เหมาๆ shipment via "ออกใบเสร็จ", open its /admin/accounting/forwarder-invoice/[id] receipt, confirm the "รวมค่าส่งเหมาๆ (PRF)" line renders and จำนวนเงินที่ชำระ == the bill's total_thb.

---

## Data backfill needed for EXISTING receipts — FLAGGED, NOT APPLIED

Receipts already issued via `adminIssueForwarderInvoice` **before this fix** are frozen ฿100-short with `mao_fee_thb = 0` (15124's receipt is one, if it was manually issued). Because the receipt renders the FROZEN header (by design — a receipt is a document-of-record), the fix does NOT retroactively correct them; they still print short.

**Backfill plan (owner decision — do NOT auto-apply · money · immutable-document concern):**
- **Identify:** `tb_receipt` rows where `mao_fee_thb = 0` AND ≥1 covered forwarder (via `tb_receipt_item.fid` → `tb_forwarder`) is a PRF/PCSF เหมาๆ shipment (i.e. `computeForwarderDebitBatch` over its fids yields `maoFee > 0`), AND the matching `tb_forwarder_invoice.mao_fee_thb > 0`.
- **Match each receipt to its bill** by shared forwarder ids (`tb_receipt_item.fid` ↔ `tb_forwarder_invoice_item.forwarder_id`) and confirm the bill carries the fee.
- **For each hit:** set `mao_fee_thb` = the (once-per-shipment) fee AND bump `totalbeforewithholding` + `ramount` by the same amount (recompute the juristic-1% net consistently). Dry-run + JSON backup first; the number MUST equal the bill's — never guess.
- **⚠️ Caveat:** a re-printed/already-delivered ฿100-short receipt is a document-of-record already handed to the customer/accounting — bumping its stored total changes an issued doc. Owner/accounting must decide re-issue vs. amend vs. leave-as-legacy per receipt (same judgment call as the ภูม 2026-06-24 `mao_fee_thb` receipt-backfill carryover). Scope the backfill to receipts NOT yet acted-on if that policy is chosen.

(Not applied here — LANE C is a code fix; the backfill is a separate gated prod data-op.)
