# Status must roll back linearly on cancel (owner rule · 2026-07-13)

> Owner: "เมื่อใดก็ตามที่สถานะขยับไปข้างหน้า แล้วมีการยกเลิก สถานะงานก็ต้องถอยตามด้วย ตาม
> flow เป็นเส้นตรง · ยกเว้นว่าอัปเดตแก้ไขเฉยๆ อันนั้นก็แค่เปลี่ยนข้อมูล live กันสดๆ ได้เลย."

## The rule (systemic invariant)
Every status field on the platform is a **linear flow** (shop hstatus 1→2→3→4→40→5;
forwarder fstatus 1→2→3→4→5→6→7; etc.). Two classes of mutation:
- **ADVANCE** (forward move — quote, pay, arrive, bill, ship, credit-grant, driver-assign):
  each is well-covered.
- **REVERSE** (cancel / reject / void / refund / delete / unassign): MUST also roll the
  status field back to the correct prior linear state — the platform historically only
  wired the advances, leaving stuck rows that can't be re-billed/re-worked.
- **NOT a rollback case:** a plain field EDIT (address, price, note, qty). That is a live
  data change — no status move, so nothing to reverse.

## The gaps this session closed (workflow-audited · adversarial-verified)
1. `billing-run.ts` cancel/void (UNPAID) → linked forwarder `fstatus 6→5` + clear fdatestatus6.
2. `forwarder-delete.ts` → best-effort `advanceLinkedShopOrder` re-derives the linked shop
   hstatus from the REMAINING forwarders (demotes 40→4 when the deleted row was the last arrival).
3. `forwarders-bulk.ts bulkCancel` → (a) REFUSE a credit row (fcredit='1') — cancelling to '99'
   orphaned the AR (tb_credit debt never reversed); (b) delete open driver stops so the batch
   can auto-complete.
4. `reject-cancelled-order-slips.ts` → include type='8' (direct ฝากสั่งซื้อ slip) so a cancelled
   order's slip drops out of the "ชำระเงิน" review queue (status 1→3).

## The invariant that keeps rollback money-safe (do NOT weaken)
A rollback must **never re-open a money-settled / completed state.** The load-bearing guards:
- `advanceLinkedShopOrder` L84: `cur ∈ {5,6,99} → no-op` (a สำเร็จ/cancelled order is never
  re-derived down). It re-derives PURELY from `deriveShopStatus(countShopArrivals)` — so it
  both advances AND demotes within the {4,40} band, but never touches 5/6/99.
- billing cancel/void: revert forwarder **only when the invoice is UNPAID** (`paid_at` null).
  A PAID void keeps rows advanced — reversing would need to unwind the payment + receipt.
- credit rows: don't silently cancel — REFUSE (the AR reversal is a separate credit-withdraw
  flow). Auto-cancelling would leave `tb_credit.creditvalue` overstated with no drift-detector
  to catch it (the reconcile cron sums by `fcredit='1'` regardless of fstatus).
- every rollback is **best-effort** (wrapped try/catch · never fails the cancel it follows) and
  **TOCTOU-guarded** (the UPDATE re-asserts the from-status in its WHERE, e.g. `.eq("fstatus","6")`).

## How to find these (method that worked)
A per-surface Workflow audit: for each status-bearing surface, one agent maps the linear flow +
lists every ADVANCE and every REVERSE action, then flags REVERSE actions that don't roll back;
a second agent adversarially verifies each claimed gap is real (the cancel truly leaves it
advanced AND a rollback is semantically correct — not a paid/edit case). 5 surfaces → 13 agents →
4 confirmed (the yuan surface's mapped gap was a verified false-positive). Related:
[[systemic-status-sync-db-trigger]] (the arrival-side is a DB trigger; the cancel-side is
per-action rollback) · [[combo-flow-carry-not-rederive]].
