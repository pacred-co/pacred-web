# Combo-flow continuity audit — รายการตู้→ตรวจตู้→ออกบิล→จ่าย→ยืนยันสลิป→จัดส่ง (2026-07-08)

> Owner (พี่ป๊อป · URGENT · "แก้มาหลายวันไม่จบ · จะส่งงาน"): the container→bill→pay→dispatch
> combo is still disconnected vs PCS legacy — **เอกสาร·ข้อมูล·profile·เรทขาย ไม่ต่อเนื่องเชื่อมโยง**.
> Source-grounded audit (§0b · legacy PHP = SOT · 4 parallel readers + synthesis).

## 🎯 ROOT CAUSE — legacy CARRIES, we RE-DERIVE

The **status chain is faithful** (fStatus 4→5→6→7 auto-drives each next queue). But legacy threads
everything on **ONE frozen `tb_forwarder` row reduced by ONE function (`calPriceForwarderMain`
function.php:1864) + fID-keyed link tables**. Identity/credit/VIP/นิติ is re-JOINed from
`tb_users`/`tb_credit` on the `userID` FK **the same way every render**. → one row · one number ·
one selection · one status-chain. **Ours re-queries + re-computes at every hop → the number and the
selection DRIFT.** That is the entire "ไม่เชื่อมโยง" complaint.

## GAP TABLE (ranked)

### 🔴 CRITICAL
- **G1 · ใบเสร็จ total re-computed LIVE, not carried from the paid ใบวางบิล.** `autoIssueReceiptOnPaymentLand`
  (lib/admin/auto-issue-receipt.ts L276-375) re-reads `tb_forwarder` live + recomputes + derives WHT
  from live `tb_corporate`; the bill's frozen `total_thb`/`is_juristic` are ignored (only เหมาๆ pinned,
  mig 0209). Any row edit between issue and pay drifts the ใบเสร็จ off the paid ใบวางบิล. **FIX:** carry
  `bill.total_thb`/`net_payable`/`is_juristic` into the receipt (markBillingRunPaid billing-run.ts
  L1511-1522) → reconcile-not-recompute, PREFER the paid bill, `console.error` drift.
- **G2 · sell total DRIFTS across 3 surfaces.** notify SMS = `calcForwarderOutstanding` (per-row NET, no
  เหมาๆ, per-row 1% · forwarder-check.ts L331) ≠ ใบวางบิล = `calcForwarderGross` + separate เหมาๆ line +
  1% header (billing-run.ts L1112) ≠ portal = `computeForwarderCollectTotal` batch-เหมาๆ-once + batch-1%
  (forwarder-collect-total.ts L118). **FIX:** make `computeForwarderCollectTotal` the single SOT; route
  SMS + bill line-builder through it + a unit test asserting SMS==portal==bill (cash+นิติ+PCSF).
- **G3 · ตรวจตู้ selection (`tb_check_forwarder`) does NOT carry into ออกบิล.** report-cnt ticks it
  (`adminReportCntAddCheck`) but `listEligibleForwarders` (billing-run.ts L418) re-derives by
  userid+fstatus=5. **FIX:** billing-run/add sources + pre-ticks the check-queue.
- **G4 · bill needs fstatus=5 but ตรวจตู้ leaves 4 → 4-hop + blank container shortcut.** `resolveCabinetBillingTarget`
  filters `.eq("fstatus","5")` (billing-run.ts L611) → fresh (4) rows → blank form. **FIX:** the bill
  lifts its own rows 4→5 (fold the guarded flip into createBillingRunInvoice) + the shortcut includes 4.

### 🟠 IMPORTANT
- **G5 · no customer pay affordance on an issued bill** → `/b/[token]` read-only, plain-text bank, no
  amount-QR, slip upload staff-only → staff re-keys the transfer. FIX: amount-QR (LOGISTICS lane) +
  customer slip-upload staging a pending slip (settle still round-1 gated).
- **G6 · advance-paid row invisible to dispatch** — flips fstatus=6 but keeps `paydeposit='1'`, excluded
  by `countPendingDispatch`/`createDriverBatch`. Owner-decision (changes "pending dispatch" meaning).
- **G7 · "ยืนยันสลิปจบการ" optional for no-slip bills** — round-1 enforced only when slip pending. FIX:
  require an explicit "ชำระนอกระบบ/ยืนยัน" stamp before settling a no-slip bill.
- **G8 · profile re-fetched with divergent logic** — step1 `resolveBillingIdentity`; forwarder-check
  re-fetches; createBillingRunInvoice re-fetches AGAIN with its own inline นิติ logic (billing-run.ts
  L1026-1095). FIX: route through the shared SOT + snapshot onto the bill, carry into the receipt.

### 🟢 LOOK
- **G9 · `report-cnt` missing the 11-tab exception strip** (legacy `top-menu-report.php`:
  ประวัติเข้าโกดังไทย·รายงานตู้·NoteShop·Note·ไม่ถ่ายสินค้า·ไม่ใส่ค่าขนส่ง·ไม่ใส่เบอร์ตู้·ไม่ใส่วันปิดตู้·
  ไม่เลือกขนส่งฟรี·เลือกขนส่งผิด·เครดิตเกินกำหนด). (forwarder-check's own 3-tab already matches.)
- **G10 · context:** legacy mints NO ใบวางบิล doc at step 3 (it's a status-flip 4→5 + notify; the doc is
  the ใบเสร็จ minted at payment). Pacred's FRI ใบวางบิล is an enhancement. The owner's ask = the
  status-chain + one-number continuity, not a missing doc.

## SELL-RATE VERDICT
ตรวจตู้→บิล ✅ (reads stored `ftotalprice`, no re-resolve). บิล→เสร็จ 🔴 (G1). SMS/portal/บิล 🔴 (G2).
Fix G1+G2 → the number is identical end-to-end.

## FIX ORDER (biggest owner-visible continuity win first)
1. **G1** — pin the ใบเสร็จ to the paid ใบวางบิล. 2. **G2** — one sell-total SOT. 3. **G3+G4** — the
check-queue carries + the bill lifts 4→5. → then G5-G8 (second wave), G9 (LOOK finish).

**STATUS 2026-07-08:** G1+G3+G4 in progress (workflow · money-reviewed). G2 next (needs the SMS==portal==bill
unit test). G5-G9 queued. All on `dave-pacred` (owner merges main).
