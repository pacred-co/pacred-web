# Handoff + เดฟ↔ภูม re-split — 2026-05-30 night

> **Purpose:** consolidate everything shipped across the parallel sessions, then re-split the REMAINING gap-audit work so **เดฟ and ภูม never touch the same file**. ปอน is left to run their own frontend project (not re-tasked here). Canonical work-source = [`legacy-gap-2026-05-30/_MASTER.md`](legacy-gap-2026-05-30/_MASTER.md) §6 — this doc updates it for what's now DONE + tightens the ownership boundary.
>
> **Branch state:** `dave-pacred` = `ba641ca5` (23 ahead of main, behind ก๊อต money-loop gate). `Poom-pacred` = `bbfd525e` — **0 commits dave-pacred doesn't have**; ภูม's Wave 27-30 / MOMO work is already in dave-pacred (59c585ac is an ancestor). **ภูม: just `git merge origin/dave-pacred` to get current — nothing of yours is lost.**

---

## 1. What SHIPPED (don't redo — verified in code)

| Area | Status | Where |
|---|---|---|
| **ADR-0018 wallet SOT** | ✅ `tb_wallet`+`tb_wallet_hs` canonical + settle contract (debit-on-submit, approve/reject, withdraw debit-hold, refund=balance-bump) | `docs/decisions/0018-wallet-sot.md` |
| **P0-2** yuan wallet-paid settle | ✅ | `actions/payment-tb.ts` |
| **P0-6** pay-from-wallet on shop order | ✅ A1 | `actions/service-order.ts::payServiceOrderFromWallet` |
| **P0-7 + P1-25/26** withdraw vertical | ✅ A2 (debit-hold submit + admin approve/reject/refund + `/admin/wallet/withdrawals` queue) | `actions/wallet-tb.ts` + `actions/admin/wallet-hs.ts` |
| **P0-8** wallet history | ✅ D-3 balance repoint → tb_wallet | `lib/wallet/balance.ts` |
| **P0-9** admin top-up approval + paydeposit cascade | ✅ | `actions/admin/wallet-hs.ts` |
| **P0-10** yuan bulk-approve UUID | ✅ resolveLegacyAdminId on yuan path | `actions/admin/tb-bulk.ts` |
| **P0-17** edit customer identity | ✅ B (`tb_users`, orphan editCustomer deleted) | `actions/admin/customers.ts::adminUpdateUserIdentity` |
| **P0-18** juristic verify/reject/lookup/convert | ✅ B (`tb_corporate`, corporatestatus 1/2/3) | `actions/admin/customers.ts` + `/admin/juristic-check` |
| **Tier-A1..A6** revenue holes | ✅ earlier (`0e13f56a`) | yuan create-debit / service-order mark-paid / forwarder bulkCancel / etc |
| **OTP** | ✅ env-gated default-false | `actions/otp.ts` |
| **MOMO Wave 27-30** + accounting receipt + barcode | ✅ ภูม (in dave-pacred) | various |
| **D-4 qa-flow gate** | ✅ ran 8/8 GREEN prod (pre A1/A2) | `tests/qa-flows/wallet-delta.ts` — **needs re-run incl A1/A2 paths** |

**Sprint-1 money loop = effectively closed** (only P1-27 paydeposit batch-settle remains).

---

## 2. THE เดฟ↔ภูม OWNERSHIP BOUNDARY (the no-collision rule)

The recurring collision is service-orders + wallet + yuan, where a customer file and an admin file live close. The rule:

| Domain | เดฟ owns (customer write-path) | ภูม owns (admin backend) | Shared contract |
|---|---|---|---|
| **Orders** | `actions/service-order.ts` · `actions/cart.ts` · `(protected)/service-order/*` + `/cart` UI | `actions/admin/service-orders*.ts` · `(admin)/admin/service-orders/[hNo]/*` | The `[hNo]` detail-page **id model (UUID-vs-legacy) = เดฟ DECIDES**, ภูม builds admin handlers on top |
| **Wallet** | `actions/wallet-tb.ts` · `actions/payment-tb.ts` (customer submit) · `lib/payment/wallet-math.ts` | `actions/admin/wallet-hs.ts` · `wallet-trans.ts` · `tb-bulk.ts` (admin approve/reject) | ADR-0018 D-2 settle contract |
| **Yuan** | `actions/payment.ts`/`payment-tb.ts` (customer create) | `actions/admin/yuan-payments*.ts` (admin approve) | type='6' wallet-paid; status flow per legacy |
| **Customers** | — | `actions/admin/customers.ts` (ภูม can extend; เดฟ doesn't touch) | — |
| **Crons / reports / forwarders / drivers / cnt** | — | **all ภูม** | — |
| **`tb_users.userActive`** | register-write (P1-16) | queue-filter (P1-17) | **pair-review the `''` value in ONE sitting** |

**Iron rule:** เดฟ never edits `actions/admin/*`; ภูม never edits the customer `(protected)/*` write-path or `actions/{cart,service-order,wallet-tb,payment-tb}.ts`. If a task needs both sides, split by FUNCTION across the two files — never co-edit one file.

---

## 3. ภูม PICKUP LIST (ordered — cheap landmines first, no เดฟ dependency)

> Start top-down. Items 1-4 are isolated dead-write retargets — highest correctness-per-minute, zero wait on any decision.

1. ✅ **P0-22 — 4 cron retargets — DONE 2026-05-30 sitting-D (`7318ee67`).** All 4 routes rewritten against `tb_*` with per-route schema citation to `0081_pcs_legacy_schema.sql` + legacy PHP autorun line-by-line verify. Test `route.test.ts` (21/21) locks down `tb_users.useractive='1'` UPDATE + idempotency. ★ **2 decisions deferred to ภูม:** (a) `sales-daily-digest` "order_payment" classifier uses `tb_wallet_hs.type='2'` (column-comment-canonical) vs legacy raw JOIN-without-type-filter on `tb_header_order` — swap if exact-legacy preferred; (b) `expire-driver-assignments` uses per-row `endtime<NOW` (legacy detail-handler path) vs the 17h-fixed fallback in `check-apprentice/index.php` — cron is hourly so equivalent coverage. Both marked in route docblock NOTEs.
2. ✅ **P1-1/P1-2 — task#41 forwarder list-bar — DONE 2026-05-30 sitting-E (`cf96571b`).** `bulkUpdateStatus` is now a thin delegate to faithful `adminBulkUpdateForwarderTbStatus`; input schema flipped rebuilt-string enum → legacy numeric chars (`'1'..'7','99'`). `bulkAssignDriver` modelled on `driver-batches.ts::createDriverBatch` — parent INSERT `tb_forwarder_driver` (fdname/fdadminid/fdadmincreator var(20) per 0081 L1981-2 + fdstatus='1' + endtime=NOW+Nh) + child INSERT `tb_forwarder_driver_item` (fid not forwarderid per 0081 L2014) + Tier-A rollback. Test (83/83) locks parent + child shape + rollback. ⚠️ **FLAGGED:** the polished `bulk-actions-toolbar.tsx` is NOT mounted anywhere — `forwarders-table.tsx` already has its own inline bulk-bar calling `adminBulkUpdateForwarderTbStatus` directly (AGENTS.md §0d reachability gap pre-exists; task#41 fix is "correct when mounted"). Plus `resolveLegacyAdminId` duplicate-helper consolidation worth ~10min (master-fidelity audit L147). Plus `bulkAssignDriver` doesn't pre-group by recipient-address (driver-batches has the same simplification).
3. ✅ **P0-14 — render `AdminServiceOrderUpdateForm` in legacy-view — DONE 2026-05-30 sitting-D (`9b4030bc`).** `LEGACY_TO_REBUILT_KEY` mapping char↔string with round-trip invariant test (18/18). 21,950 real orders now reach status-flip/cancel/saveNote handlers. ⚠️ **FOLLOW-UP flagged:** `update-form.tsx` ships its own "บันทึกชำระจาก wallet" button (visible when `st=='pending' || 'awaiting_payment'`) that still hits the dead rebuilt `adminMarkServiceOrderPaid` — two mark-paid panels visually stack on the legacy path. Recommend: add `hideMarkPaidPanel` prop to update-form OR merge into `MarkPaidTbForm`. Out of scope per lane-discipline (didn't touch update-form.tsx).
3a. ✅ **P0-10 — yuan bulk-approve UUID one-liner — DONE 2026-05-30 sitting-D (`7d753241`).** `resolveLegacyAdminId()` guard before `tb_payment` UPDATE (varchar(10) per 0081 L3626). Test (21/21) locks the column-width regression guard.

3a-followup. 🚨 **P0-10c surfaced 2026-05-30 sitting-E** during P0-10b investigation: `adminBulkApproveCustomers` at `actions/admin/tb-bulk.ts:407-413` writes 3 columns:
   - ✅ `userActive: "1"` — column exists (post-0113 camelCase rename)
   - ❌ `adminidupdate: adminId` — **column DOES NOT EXIST on `tb_users`** per 0081 schema dump (`tb_users` only has `adminid` + `adminidsale`; `adminidupdate` exists on tb_payment / tb_forwarder / tb_header_order, NOT tb_users)
   - ❌ `userdateactive: nowIso` — **column DOES NOT EXIST on `tb_users`** either (no timestamp-on-approval column in legacy)

   ⇒ PostgREST would error "column does not exist" → entire bulk approve fails BEFORE the UUID truncation matters. P0-10b (the UUID issue I flagged) is **moot until P0-10c is fixed**. The fix per legacy `users.php` faithful = REMOVE the 2 nonexistent column writes (legacy approval only flips `userActive`; no admin tracking column on `tb_users`). After removing them, no admin-column write remains → P0-10b also moot. **Needs ภูม confirm before edit (could be a typo for a different column I missed).**

3b. ✅ **chore — `wallet-hs.test.ts` ESM-mode side-fix — DONE 2026-05-30 sitting-D (`f7f7395b`).** Adds trailing `export {}` so pnpm typecheck no longer fails on TS 2393/2451 collision between sibling .test.ts top-level helpers. Side-help to เดฟ (pre-existing on `dave-pacred` from P0-7/P0-9 batch; gate hadn't run).

3c. ✅ **P1-17 — userActive pending filter alignment — DONE 2026-05-30 sitting-E (`d6fc8319`).** Per ADR-0019 D-C transitional: queue + 2 sidebar badge counts + 2 deriveStatus helpers + 1 deletePending guard all flipped from `.eq("0")` to `.in(["", "0"])` so the 8,898 migrated pending rows (`userActive=''`) now surface in admin queue/counts. SKIPPED: tb-bulk.ts L391/L415 bulk-approve guards (intertwined with P0-10c above) + lib/auth register-write (เดฟ P1-16 lane).
3b. ✅ **chore — `wallet-hs.test.ts` ESM-mode side-fix — DONE 2026-05-30 sitting-D (`f7f7395b`).** Adds trailing `export {}` so pnpm typecheck no longer fails on TS 2393/2451 collision between sibling .test.ts top-level helpers. Side-help to เดฟ (pre-existing on `dave-pacred` from P0-7/P0-9 batch; gate hadn't run).
4. **P0-11/12 — yuan per-row form + manual-create status.** Mount `YuanPaymentActions` on `/admin/yuan-payments/[id]` (action correct, no UI); flip manual-create `paystatus='2'`→`'1'` + customer notify. Delete the rebuilt `yuan-payments.ts` twin after wiring `-tb`.
5. **P0-20 — 5 reports → tb_*.** `actions/admin/reports.ts` forwarder/shops/yuan/sales-monthly/otp fetchers read rebuilt; rewrite to `tb_forwarder`/`tb_header_order`/`tb_payment`/`tb_users_otp`/`tb_users`. Remove the invented `vat7` column + restore the daily-profit graph (fidelity).
6. **P0-21 — closing → tb_receipt.** `/admin/accounting/closing` key off issued `tb_receipt` by `rDate`, not forwarders-delivered.
7. **P0-16 — per-item refund (`repayItem`).** NEW `actions/admin/service-orders-refund.ts`: partial-qty split `tb_order`, INSERT `tb_wallet_hs` type='5', credit `tb_wallet`. **Reuse the ADR-0018 contract + `lib/payment/wallet-math.ts` — the wallet writer now exists.**
8. **P1-27 — paydeposit batch-settle.** 1 slip → N `tb_wallet_hs` rows + flip each order/forwarder. Admin approve side (the wallet writer + cascade from A2/Settle-2 give you the pattern).
9. **P0-13 — 5-tab shop UPDATE workflow (biggest build).** ⚠️ **WAIT on เดฟ's `[hNo]` UUID-vs-legacy decision (§4 handshake A)** before the page surgery. Then quote handler (1→2) + ordered handler (3→4) + 4→5 auto-flip + 4-channel notify.
10. **P1-5 — `tb_user_sales` earn-trigger.** ⚠️ **WAIT on เดฟ's commission architecture decision (§4 handshake B).**
11. **Tail:** P1-6/7/9 forwarder detail handlers · P1-10/11/12 adm-10 shop header-edits · P1-13 yuan refund modal · P1-17 userActive queue (pair w/ เดฟ).

**Every task ships its entry-point (AGENTS.md §0d) + a `tb_*`-delta unit test, not a route-200.**

---

## 4. The 3 เดฟ↔ภูม handshakes — ✅ ALL RESOLVED 2026-05-30 in [ADR-0019](../decisions/0019-customer-backend-arch-decisions-2026-05-30.md)

> **ภูม: these are no longer blockers — read ADR-0019 and proceed.**

- **A — `[hNo]`/`[fNo]` detail-page id model** → ✅ **legacy `hNo`/`fNo` canonical; retire the rebuilt-UUID-first dual mode.** Read `tb_header_order`/`tb_forwarder` directly, full editor on the legacy path. **Unblocks P0-14 (render the form in legacy-view — it's now THE view) + P0-13 + P1-3.** (ADR-0019 D-A)
- **B — commission architecture** → ✅ **Path A `tb_user_sales` canonical; retire rebuilt `sales_commissions`/`sales_payouts`.** Earn-trigger spec for ภูม P1-5 in ADR-0019 D-B (INSERT `tb_user_sales` on `fStatus→'7'` for the 4 agent codes — READ legacy `takePhoto.php`+`getListForwarder.php` for the codes + %, don't guess). (ADR-0019 D-B)
- **C — `tb_users.userActive` value** → ✅ **native signups write `''` (legacy-faithful); queue filters `WHERE userActive=''`.** Pair: เดฟ P1-16 register-write `'0'→''`, ภูม P1-17 queue filter. Align the value in one sitting. (ADR-0019 D-C)

---

## 5. เอาของดีๆของกันและกัน — cross-pollination (reuse, don't reinvent)

**ภูม: reuse เดฟ's newly-landed patterns** (they're the ADR-0018 spine):
- The **`*-tb.ts` file convention** — `payment-tb.ts` / `wallet-tb.ts` / `service-orders-tb.ts`: the faithful `tb_*` writer lives in `-tb.ts`, the dead rebuilt twin retires cleanly. Mirror for new admin writers.
- **`lib/payment/wallet-math.ts`** (`canDebit` / `computeNewBalance`) + **`lib/service-order/debit-total.ts`** (`computeShopOrderDebitTotal`) — reuse READ-ONLY for any money math; don't duplicate.
- **`resolveLegacyAdminId()`** (in `wallet-hs.ts` / `tb-bulk.ts`) — the UUID→legacy-slug guard before any `varchar(10)` admin column write (prevents the 22001 that bit P0-10).
- **The idempotency-probe + rollback discipline** from A1/A2 (SELECT-for-terminal-status before mutate; DELETE the hs row if the balance UPDATE fails). Apply to every approve/reject you build.
- **trust-but-verify + grep-schema-before-typing** — every column grepped against `0081_pcs_legacy_schema.sql`; READ the legacy `.php` before claiming a value (the withdraw debit-timing + refund-mechanism were BOTH resolved this way, not guessed). "ห้ามเดา."

**เดฟ: reuse ภูม's patterns** — the MOMO isolated-layer structure, `mint-receipt-doc-no` minter, the legacy-view dual-path render, and ภูม's §0c verify-deep-flow discipline (click the row, don't trust 200).

---

## 6. Open gates / risks

- **ก๊อต money-loop gate** — re-run `tests/qa-flows/wallet-delta.ts` (now incl A1 pay-from-wallet-shop + A2 withdraw delta) asserting real `tb_wallet` deltas BEFORE `dave-pacred → main`. The 8/8 GREEN was pre-A1/A2.
- **A2 flag** — the legacy customer-side withdraw *create* handler wasn't in the 2026-05-24 extract; the submit contract is ADR-derived (verified vs the admin approve/reject side). Browser click-test the withdraw submit on prod before launch.
- **P0-3/4/5 cart** is เดฟ's biggest remaining customer task (the live `/service-order/cart/cart-manager.tsx` still calls the dead `placeServiceOrder`; the faithful `submitCartOrder` is wired only to the orphan `/cart`). Not ภูม's lane — flagged so ภูม doesn't touch it.

---

_Distribute: ภูม pulls `dave-pacred`, reads this + their updated [`briefs/poom.md`](../briefs/poom.md). เดฟ owns §3-excluded customer write-path + the 3 decisions. ปอน runs their own project._
