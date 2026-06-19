# Forwarder collect — money-model audit + fix plan (2026-06-19)

Triggered by the owner: #52051 showed ฿45.10 on the detail but ฿95.10 on จ่ายแทนลูกค้า —
"why different? buggy elsewhere? remember juristic WHT." Verified by an adversarial
workflow (`wf_d06a2ddc`, 7 agents, all findings source-cited).

## The model — what the customer actually pays (แจงรายละเอียด)

Per forwarder row, the collect amount =

```
freight (ftotalprice = rate × kg/cbm)
+ otherCharges (ftransportprice + fpriceupdate + fshippingservice + pricecrate + ftransportpricechnthb + priceother)
+ ค่าส่ง PCSF เหมาๆ ฿50   ← only the FIRST PCSF-zero row in a pay-batch (fshipby='PCSF' & ftransportprice=0),
                            and NOT for the userNotPCS50 allowlist / หนองแขม district
− ส่วนลด (fdiscount)
− หัก ณ ที่จ่าย นิติ 1%    ← only when juristic AND the batch total ≥ ฿1,000  (owner-CONFIRMED)
= ยอดเก็บจริง
```

- **PCSF = "PCS เหมาๆ (Flash promo)" delivery — NOT self-pickup** (self-pickup = `PCS`).
  The ฿50 is a flat per-batch delivery fee, added at PAY time. So #52051: freight 45.10
  + PCSF เหมาๆ 50 = **95.10 = the correct collect** (personal → no WHT).
- The forwarder DETAIL shows `ftotalprice` = freight only (45.10) until the ฿50 is
  persisted to `ftransportprice` at pay. That's why the detail < the pay amount pre-payment.

**Canonical money fn:** `lib/forwarder/forwarder-debit-total.ts` `computeForwarderDebitBatch`
— now returns a labeled `ForwarderCollectBreakdown` per row (shipped this session; the
pay-user page renders it under each amount).

## ✅ Admin จ่ายแทนลูกค้า path = END-TO-END CORRECT (collect with confidence)

`actions/admin/pay-user.ts` both branches persist `ftransportprice=50` on the first
PCSF-zero row at pay (`:615`, `:1314`) before the ledger/receipt. So charge = the stored
row = receipt (`auto-issue-receipt.ts` re-reads the row) = AR (`calcForwarderOutstanding`)
= **95.10** everywhere. ✅

## ✅ WHT — owner CONFIRMED: นิติ 1% only on ยอด ≥ ฿1,000

Already correct in practice: `tb_forwarder.fusercompany='1'` is stamped only at pay-time
AFTER the ≥฿1,000 gate passes, so `calcForwarderOutstanding` (which keys off that stamp)
never over-discounts an unpaid sub-฿1,000 juristic row. **No change to
`calcForwarderOutstanding` (wide blast radius).** Documented, confirmed-correct.

## 🔴 Open bugs (customer SELF-PAY only — NOT the admin path the owner uses)

### BUG-1 — self-pay auto-receipt under-states the PCSF ฿50 (HIGH)
`actions/forwarder.ts submitForwarderPayment` folds the ฿50 into `tb_wallet_hs.amount`
(`:556`) but never persists `ftransportprice=50`; the slip-approve
(`adminApproveWalletHs`/`adminBulkApproveWalletHs`) only flips fstatus, then
`autoIssueReceiptOnPaymentLand` RE-COMPUTES from the row (`:268`, ftransportprice still 0)
→ receipt + AR show freight-only while the customer paid freight+50.
**Fix (preferred, faithful):** mirror admin — persist `ftransportprice=50` on the first
PCSF-zero row at the moment of settle. ⚠️ Attribution nuance: the self-pay splits the ฿50
across N PCSF rows (`50/count`) while admin puts 50 on one; persist must reconcile to the
paid `tb_wallet_hs` total regardless of approve granularity (else a 2-PCSF order approved
in 2 single-approves double-counts). **Cleanest:** make `autoIssueReceiptOnPaymentLand`
honor the settled `tb_wallet_hs.amount` sum instead of recomputing perRowRaw. Needs a
design call + a test-login browser verify before shipping.

### BUG-2 — self-pay shown ≠ charged (MEDIUM)
`submitForwarderPayment` (charge) drifted from `calculateForwarderTotal` (the display the
customer saw one click earlier):
- drops the `userNotPCS50` allowlist + `'หนองแขม'` ฿50 exemption (`forwarder.ts:117-168`
  has it; the charge doesn't) → an exempt customer is shown ฿X, charged ฿X+50.
- gates the 1% on `tb_corporate` existence, while the display + legacy gate on
  `tb_users.userCompany==='1'`.
**Fix:** extract ONE shared pure helper `computeForwarderCollectTotal(rows, {userId,
userCompany})` (PCSF-count + หนองแขม/PCS-list exemption + 50-flat + 1%-if-userCompany-&-≥1000)
and call it from BOTH `calculateForwarderTotal` AND `submitForwarderPayment` — killing the
drift at the root. + a regression test asserting display == charge for: an exempt-list
user, a หนองแขม user, a `userCompany='1'`-no-`tb_corporate` user, a sub-฿1,000 juristic.

## 🟠 Owner UX directives (2026-06-19) — design + impl plan

### #2 — "ทำไมแถวซ้ำๆ เบิ้ลๆ" (consolidate duplicate wallet rows)
The pair = the faithful legacy slip-top-up-and-pay 2-step: one slip → a top-up row
(type='1' ชำระเงิน, with slip) + N pay rows (type='4' ชำระจากกระเป๋า), linked by
`reforder2 = topup.id`. Net = the customer pays once.
**Fix:** in `transactions-view.tsx`, GROUP the top-up + its `reforder2` pay siblings into
ONE logical "payment" row (whose / what / status / total), with the in/out movement kept
in the backend (the rows still exist for the ledger — just collapsed in the UI). Owner:
"log ไว้เก็บหลังบ้านพอ."

### #3 — สถานะเดินเชื่อม + ยกเลิกถอยสเต็ป (reversible status flow)
Owner: cancel step 5 → fstatus back to 4; finishing 4 → 5 → flow to 6, automatically;
cancellable; make it easy for staff. Today the forwarder fstatus advances forward-only;
there's no "cancel a step → revert" path. **Plan:** a guarded `revertForwarderStep`
(N→N-1, money-safe: block if billed/paid downstream; audit-logged) + auto-advance wiring
on step completion. Touches the order lifecycle — design carefully, money-review, test.

## Shipped this session
- `computeForwarderDebitBatch` → `ForwarderCollectBreakdown` (single source of truth) +
  the pay-user itemized breakdown render. +11 test assertions (51 total).
