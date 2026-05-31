# Re-sweep A1 — admin customers/accounting/settle · 2026-05-31

> **Slice:** ADMIN customers / juristic / identity + accounting + the money-SETTLE paths (admin approve/verify steps that close customer slip loops).
> **Method:** read-only. Every claim verified against live code at `dave-pacred` HEAD `6f570b53`, NOT trusted from the 2026-05-30 `_MASTER.md`.
> **Legacy SOT:** `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/member/pcs-admin/`.

## Honest verdict

**The 2026-05-30 master gap audit is ~80% STALE for this slice — the customers/accounting/settle area has been largely closed since.** Of the 9 P0s the master assigned to my lane (P0-9, P0-10, P0-11, P0-12, P0-17, P0-18, P0-19, P0-20, P0-21, P0-23), **all but P0-12 are now FIXED and wired to the live UI.** I independently re-verified each:

- **Cash-INFLOW holes are CLOSED.** Admin top-up-slip approve credits `tb_wallet` (`adminApproveWalletDeposit`/`adminBulkApproveWalletHs` → `tb_wallet_hs` status→'2' + `tb_wallet.wallettotal += amount`). Admin yuan-approve settles `tb_payment` (`adminUpdateYuanPayment` per-row + `adminBulkApproveYuanPaymentsTb` bulk, with the P0-10 `resolveLegacyAdminId()` fix in place). Customer-withdraw approve/reject queue (`/admin/wallet/withdrawals`) is real (`adminApproveWithdraw` 1→2, `adminRejectWithdraw` 1→3 refund). **No verified live cash-inflow dead-write remains in this slice.**
- **`pay-users.php` pay-on-behalf is BUILT, not a stub** — `pay-user.ts` (70KB · 5 real functions) debits `tb_wallet`, writes `tb_wallet_hs` type 2/4, flips `hstatus` 2→3 / `fstatus` 5→6, notifies. Reachable from the wallet menubar ("จ่ายแทนลูกค้า").
- **Edit-customer-identity writes `tb_users`** (not the dead `profiles`), and is wired (`profile-sections.tsx`). **Juristic verify/reject/DBD/convert all write `tb_corporate`** (not the dead `corporate`), and `/admin/juristic-check` reads `tb_corporate` — the 8,898 migrated juristic customers are now visible + verifiable.
- The whole **`acc-*` report family + accounting hub + closing + the 5 profit reports** read `tb_*` faithfully.

**What's left in this slice is small and mostly P1/P2:** one genuine **💀 dead-write that is currently UNREACHABLE on prod** (forwarder `adminMarkForwarderPaid`, gated behind the empty rebuilt `forwarders` table — a latent landmine, not a live leak), the **P0-12 yuan self-approve + missing notify** (still open · ภูม lane), a **missing auto-receipt on pay-on-behalf** (legacy mints `tb_receipt` on `sPay`; Pacred's `pay-user.ts` does not), and the **P1-3 dual-mode forwarder detail** (real rows fall to a near-read-only legacy view). None of these lose customer money silently except in the latent/unreachable sense.

> ⚠️ **Scope note:** the worst forwarder-ops items below (P1-3 detail editor, P0-12 yuan, the forwarder dead-write) sit on the adm-09/adm-11 ภูม lanes; I include them because they intersect the settle paths I was asked to audit. The customers/identity/juristic/accounting/wallet-settle items are the เดฟ-owned core of this slice.

---

## Ledger — gaps only (❌ / 💀 / ⚠️ / 🔌)

| feature | legacy file:line | Pacred file | status | writes which table | reachable? | sev | 1-line fix |
|---|---|---|---|---|---|---|---|
| Yuan manual-create self-approve (`paystatus='2'` one-click) + NO customer notify | `payment.php` L34-95 (inserts `'1'` pending + 2× `sendLine`) | `actions/admin/yuan-payments-tb.ts:201` (`adminCreateYuanPaymentManual`) | ⚠️PARTIAL | `tb_payment` (correct table; wallet-debit Tier-A1 done) | ✅ `/admin/yuan-payments/new` | **P1** | insert `paystatus='1'` (await 2nd admin) + fire `notifyStaffGroup()`/customer notify; OR keep self-approve as deliberate Pacred call (owner decision) |
| Pay-on-behalf does NOT mint `tb_receipt`/`tb_receipt_item` | `pay-users.php` L492-554 (`if($sweetalert=='sPay')` → INSERT `tb_receipt` + `tb_receipt_item`, doc `FR{yyMM}-{NNNNN}`) | `actions/admin/pay-user.ts` (0 `tb_receipt` refs) | ⚠️PARTIAL | money settles correctly (`tb_wallet`/`tb_wallet_hs`/`tb_header_order`/`tb_forwarder`); receipt absent | ✅ `/admin/wallet/pay-user` | **P1** | after the fStatus 5→6 flip in `adminPayForwardersOnBehalf`, call `autoIssueReceiptOnPaymentLand(admin, {userid, fids, dateSlip, source})` (the lib already exists, used by `tb-bulk.ts`) |
| `adminMarkForwarderPaid` writes the REBUILT empty `forwarders` table (UUID) | `forwarder.php?page=update` (pay → `tb_forwarder` fStatus 5→6 + wallet) | `actions/admin/forwarders.ts:257` → imported by `forwarders/[fNo]/update-form.tsx` | 💀DEAD-WRITE (but 🔌UNREACHABLE on prod — see note) | rebuilt `forwarders` (empty) | 🔌 only rendered for rebuilt-UUID rows; real rows fall to `renderLegacyForwarderView` (no such button) | **P1** | repoint to `tb_forwarder` by `id`/legacy-id + debit `tb_wallet` (or delete the dead form once `[fNo]` is made legacy-canonical — P1-3) |
| Forwarder `[fNo]` detail editor reads rebuilt `forwarders` first → every real row degrades to near-read-only legacy view | `forwarder.php?page=detail` (full edit/driver/cost/bill on `tb_forwarder`) | `forwarders/[fNo]/page.tsx:42-70` (`.from("forwarders")` then `renderLegacyForwarderView`) | ⚠️PARTIAL | reads rebuilt `forwarders` (empty) → legacy fallback | ✅ reachable but mega-edit panels (update-form/cost/driver/bill) hidden on real rows | **P1** | make legacy-id the canonical lookup (read `tb_forwarder` first) so `TbForwarderActionPanel` + cost/driver panels render for real rows = adm-09 P1-3 |
| 3 orphan wallet components call TOMBSTONED stubs (would no-op-error if ever rendered) | n/a (Pacred dead twins) | `wallet/{slip-review-modal,actions-cell,bulk-approve-bar}.tsx` → `adminUpdateWalletTransaction`/`adminBulkApproveDeposits` (both `return {ok:false,"TOMBSTONED"}`) | 🔌UNREACHABLE | rebuilt `wallet_transactions` (tombstoned → no write) | 🔌 NOT rendered by any page (live path = `tb-bulk-bar.tsx` + `[id]/edit-form.tsx`) | **P2** | delete the 3 dead components + drop the tombstoned exports (Phase-C cleanup) |
| `sales-payouts.ts` (non-tb) writes dead rebuilt `sales_payouts`/`sales_commissions` | n/a | `actions/admin/sales-payouts.ts` (self-labeled ⚰️ TOMBSTONE) | 🔌UNREACHABLE | rebuilt (empty) | 🔌 unwired; live path = `sales-payouts-tb.ts` | **P2** | delete with rebuilt schema in Phase-C (only `lib/validators/commission.ts` type-imports it) |
| `acc-system-cargo` (ระบบบัญชี Cargo) hub | `acc-system-cargo.php` + `include/pages/acc-system-cargo/home.php` | — (no `/admin/accounting/cargo` equivalent beyond the income redirect) | ⚠️PARTIAL | n/a | partial — `accounting/cargo/income/[type]/...` exists but the legacy cargo-accounting landing isn't a 1:1 | **P2** | confirm coverage vs `acc-system-cargo/home.php`; likely subsumed by the accounting hub — verify before claiming done |

---

## Cash-inflow / settle holes (VERIFIED)

I specifically hunted for any admin approve/verify step that credits/settles **nothing** (the master's dominant failure mode). **Result: none remain live in this slice.** Per-path verification:

| Settle path | Live action (UI-imported) | Writes | Verdict |
|---|---|---|---|
| **(a) Admin top-up-slip approve → credit `tb_wallet`?** | `/admin/wallet?view=tx` → `tb-bulk-bar.tsx` → `adminBulkApproveWalletHs` (tb-bulk.ts); detail `[id]/edit-form.tsx` → `adminApproveWalletDeposit` (wallet-hs.ts:396) | `tb_wallet_hs` status→'2' + **`tb_wallet.wallettotal += amount`** (type 1/2) | ✅ **YES, credits `tb_wallet`.** P0-9 (MS-1) FIXED. |
| **(b) Admin yuan-approve → settle `tb_payment`?** | `/admin/yuan-payments/[id]` → `YuanPaymentActions` → `adminUpdateYuanPayment` (yuan-payments.ts:73); bulk → `adminBulkApproveYuanPaymentsTb` (tb-bulk.ts) | `tb_payment` paystatus '1'→'2' + `adminid`(resolved)+`paydateadmin`; reject→'3' mints `tb_wallet_hs` type 5 refund + credits `tb_wallet` | ✅ **YES, settles `tb_payment`.** P0-10 + P0-11 FIXED. |
| **(c) pay-users pay-on-behalf — built or stub?** | `/admin/wallet/pay-user` → `PayUserClient` → `adminPayOrdersOnBehalf` / `adminPayForwardersOnBehalf` (+ `…WithTopUp` variants) | debit `tb_wallet` · `tb_wallet_hs` type 2/4 · flip `hstatus` 2→3 / `fstatus` 5→6 · customer notify | ✅ **BUILT** (was a redirect stub in the master). One gap: no `tb_receipt` mint (P1 above). |
| **(d) Edit customer identity → `tb_users` or dead?** | `/admin/customers/[id]` → `profile-sections.tsx` → `adminUpdateUserIdentity` (customers.ts:54) | **`tb_users`** by `userID` (camelCase: userName/userLastName/userEmail/userTel/userSex/userBirthday/userLineID/userFacebook; senior: adminIDSale/coID) | ✅ **`tb_users`, wired.** P0-17 FIXED (master said dead `profiles`, unimported — no longer true). |
| **(e) Juristic verify/reject/DBD/convert** | `/admin/juristic-check` (reads `tb_corporate`) + `customers/page.tsx` + `convert-to-juristic-form.tsx` → `verifyJuristic`/`rejectJuristic`/`lookupDbdJuristic`/`adminConvertToJuristic` | **`tb_corporate`** by `userid` (corporatestatus 1/2/3) + `tb_users.userCompany='1'` | ✅ **`tb_corporate`, wired.** P0-18 FIXED. |
| **(f) Customer withdraw approve/reject** | `/admin/wallet/withdrawals` → `withdraw-row-actions.tsx` → `adminApproveWithdraw` (1→2, no double-debit) / `adminRejectWithdraw` (1→3, refund hold) | `tb_wallet_hs` type='3'; reject credits `tb_wallet` back | ✅ Admin side of P0-7/P1-25/P1-26 done. (Customer-side write path = cust-05, out of this slice.) |
| **(g) Month-end closing** | `/admin/accounting/closing` | reads **`tb_receipt`** (keyed on receipt date) + `tb_users` | ✅ P0-21 FIXED (master said dead `forwarders` + wrong key). |
| **(h) Admin manual top-up** | `/admin/wallet/add` → `adminCreateWalletHsManual` | `tb_wallet_hs` type '1' + `tb_wallet` | ✅ faithful. |

**The only money-correctness softness in this slice** is the missing auto-`tb_receipt` on pay-on-behalf (the cash *moves* correctly; the receipt document just isn't auto-cut) and the latent forwarder dead-write (gated behind an empty table, so it can't fire on real rows today).

---

## Newly-found (not in 2026-05-30 `_MASTER`)

1. **Pay-on-behalf missing `tb_receipt` mint** — `_MASTER` P0-19 only flagged the redirect stub. Now that pay-user is fully built, the *next* fidelity gap surfaces: legacy `pay-users.php` L492-554 mints `tb_receipt`+`tb_receipt_item` (`FR{yyMM}-{NNNNN}`) on the forwarder `sPay` path; Pacred `pay-user.ts` settles money but never calls `autoIssueReceiptOnPaymentLand` (which exists and is used elsewhere). **P1.** Fix is ~5 lines (call the existing lib after the 5→6 flip).
2. **`adminMarkForwarderPaid` is a live-imported dead-write** — `forwarders/[fNo]/update-form.tsx` imports it and it writes the empty rebuilt `forwarders` table. It only escapes being a live cash-leak because the `[fNo]` page reads rebuilt `forwarders` first and **every real prod row falls through to `renderLegacyForwarderView`**, which never renders that button. So it's a 💀 dead-write that's currently 🔌 unreachable — a latent landmine that becomes a real leak the moment anyone repoints `[fNo]` to read `tb_forwarder` (P1-3) without also fixing this action. **P1** (fix in the same change as P1-3).
3. **3 orphan wallet components wired to tombstoned stubs** — `slip-review-modal.tsx`, `actions-cell.tsx`, `bulk-approve-bar.tsx` (under `/admin/wallet/`) call `adminUpdateWalletTransaction` / `adminBulkApproveDeposits`, both of which are explicit ADR-0018 tombstones returning `{ok:false}`. They reference only each other and are rendered by no page (live path uses `tb-bulk-bar` + `[id]/edit-form`). Harmless today but confusing dead code. **P2** (delete in Phase-C cleanup).

---

## Count

**P0: 0 · P1: 4 · P2: 3** *(this slice only)*

- **P0 (0):** every customers/identity/juristic/accounting/wallet-settle P0 from `_MASTER` is verified FIXED + wired. (`_MASTER` P0-12 yuan self-approve is re-graded **P1** here — the wallet-debit hole it bundled is already closed; what remains is the self-approve SOD bypass + missing notify, a workflow/notify gap, not a money-loss death-flow. Owner may even rule self-approve intentional.)
- **P1 (4):** yuan self-approve+notify (`yuan-payments-tb.ts:201`) · pay-on-behalf missing `tb_receipt` mint (`pay-user.ts`) · forwarder `adminMarkForwarderPaid` dead-write coupled to P1-3 (`forwarders.ts:257`) · forwarder `[fNo]` dual-mode detail (`forwarders/[fNo]/page.tsx`).
- **P2 (3):** delete 3 orphan tombstoned wallet components · delete tombstoned `sales-payouts.ts` · confirm/close `acc-system-cargo` hub coverage.
