# Legacy-gap audit — `cust-05-wallet` (Wallet · credit · shop · topup · withdraw · history)

> Side: **customer** · Owner-mandate lens: "ห้าม death" · legacy is the spec · flow-ORDER must match.
> Audited 2026-05-30 against legacy `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/` and Pacred `dave-pacred` HEAD.
> Auditor lane: cust-05-wallet. Builds on `docs/audit/master-fidelity-2026-05-30-evening.md` (ภูม) §"Pattern 3: WALLET LEDGER NOT DEBITED" + `docs/research/d1-customer-backend-gap-2026-05-24.md` §J/§K (which over-rated wallet at "90%" — this audit corrects it).

---

## Overview

### Legacy scope (the spec)
The legacy cash wallet is the spine of the whole money-loop. Tables:
- **`tb_wallet`** (`userID`, `walletTotal`) — the per-customer cash balance (source of truth shown everywhere).
- **`tb_wallet_hs`** (`ID`, `date`, `status`, `amount`, `type`, `refOrder`, `refOrder2`, `wUserCredit`, `imagesSlip`, `dateSlip`, `depositNameBank`, `nameUserBank`, `noUserBank`, `adminID`, `adminCreate`, `LockDate`, `session`, `note`) — the cash-wallet ledger.
- **`tb_credit`** (`userID`, `creditValue`) — outstanding credit-debt; `tb_users.userCreditValue` = the credit LIMIT.
- **`tb_cash_back`** (`userID`, `cbTotal`) + **`tb_cash_back_hs`** — cashback wallet.
- **`tb_wallet_paydeposit`** (`whID`, `hNo`) — links one topup slip to N pending order-payments (batch-settle).
- **`tb_wallet_shop`** (balance) + **`tb_wallet_shop_hs`** (`type`,`status`,`amount`) — the affiliate/shop wallet.

Legacy `tb_wallet_hs.type` enum (canonical — `function.php::nameWallet` L161-174):
| type | meaning | sign |
|---|---|---|
| **1** | เติมเงิน (topup) | + credit |
| **2** | ชำระเงินฝากสั่งสินค้า (pay shop order) | − debit |
| **3** | ถอนเงิน (withdraw) | − debit |
| **4** | ชำระเงินฝากนำเข้า (pay import/forwarder) | − debit |
| **5** | คืนเงิน (refund) | + credit |
| **6** | ชำระเงินฝากชำระ (pay bill / yuan-transfer) | − debit |
| **7** | ชำระเงินแบบเติมเพิ่ม (pay top-up-extra) | − debit (special cascade) |

Legacy `status`: **1**=รอตรวจสอบ(pending) · **2**=สำเร็จ(approved) · **3/other**=ไม่สำเร็จ(rejected).

Legacy customer pages & routes (from `member/include/left-menu.php` + `.htaccess` friendly URLs):
- `wallet/` → cash wallet landing: balance card + 4-tab history (เดินบัญชี/เติมเงิน/ชำระเงิน/ถอนเงิน). 4 AJAX loaders in `include/pages/wallet/`.
- `wallet/add/` → topup modal (`wallet.php?page=add`): amount + PromptPay QR + slip → INSERT `tb_wallet_hs` type=1 status=1.
- `wallet/withdraw/` → withdraw form: **DEBIT `tb_wallet.walletTotal` immediately** + INSERT `tb_wallet_hs` type=3 status=1.
- `wallet-credit/` → credit wallet: วงเงินใช้ได้ = `userCreditValue − creditValue`, ค้างชำระ = `creditValue`, single history tab (`tb_wallet_hs WHERE wUserCredit=1`).
- `wallet-credit/withdraw/` → credit-withdraw + **#wallet-login password-confirm modal** (`wallet-credit.php?page=withdraw` L535-803).
- `wallet-shop/` → affiliate shop wallet: balance + 4 tabs over `tb_wallet_shop_hs`.

Legacy admin approval engine (`pcs-admin/wallet.php` + `include/pages/wallet/w-s-deposit-detail.php` + `w-s-withdraw-detail.php`):
- `wallet/deposit/{id}` **approve** (status 1→2): `tb_wallet.walletTotal += amount`; cascades to `tb_wallet_paydeposit`-linked order rows (type 2/4) + `tb_header_order`/`tb_forwarder`; **reject** (status→3): refund of any type=7 top-up-extra rows + `DELETE tb_wallet_paydeposit`.
- `wallet/withdraw/{id}` **approve** (status 1→2): requires slip + dateSlip; **NO balance change** (money already held at request time); **reject** (status→3): **REFUND** `tb_wallet.walletTotal += amount`.
- Record-locking: `LockDate` + `session` so two admins can't double-process the same row.
- LINE Notify on submit (admin channel) + on status change (customer).

### Pacred scope (what exists)
- `(protected)/wallet/page.tsx` + `/wallet/deposit/page.tsx` + `/wallet-credit/page.tsx` — **read-side faithful transcriptions** off legacy `tb_wallet`/`tb_wallet_hs`/`tb_credit` (correct tables, correct join key `userid===member_code`). ✅
- `/wallet/deposit` topup → `<LegacyDepositForm>` → `actions/wallet.ts::submitLegacyWalletDeposit` → INSERT `tb_wallet_hs` type=1 status=1. ✅ (right table)
- `/wallet/withdraw/page.tsx` + `withdraw-form.tsx` → `actions/wallet.ts::createWithdraw` → **REBUILT `wallet_transactions`** (wrong). ❌💀
- `/wallet/history/page.tsx` → `getWallet()`+`listWalletTransactions()` → **REBUILT `wallet`/`wallet_transactions`** (wrong). ❌💀
- Admin: `actions/admin/wallet-trans.ts` (`adminApproveWalletHs`/`adminRejectWalletHs`) + `tb-bulk.ts` + `wallet-hs.ts` → write legacy `tb_wallet`/`tb_wallet_hs`. ✅ table, ⚠️ enum/refund bugs.
- `/wallet-shop/page.tsx` + `actions/affiliate-shop-wallet.ts` → **REBUILT `tb_wallet_shop`+`tb_shop_transactions`** (migrations 0104/0105, keyed by `profile_id`), NOT legacy `tb_wallet_shop_hs`. ❌💀

### % complete (honest)
**≈ 48%.** The read-side of the cash + credit wallet is a high-fidelity transcription against the real `tb_*` data (the hard part — done well). But the **withdraw** money-flow, the **history page**, and the **entire affiliate shop wallet** are wired to rebuilt empty tables (split-brain dead-writes), and the admin approval enum/refund logic diverges from the legacy spec. Because money-correctness is the wallet's whole job, the dead paths drag the real completeness well below the "90%" the pre-D1 audit claimed.

---

## Workflow-by-workflow gap table

| # | Legacy flow | Pacred equivalent | status | flow-order correct? | owner |
|---|---|---|---|---|---|
| W1 | `wallet/` balance card (`tb_wallet.walletTotal`) | `/wallet/page.tsx` reads `tb_wallet.wallettotal` | ✅ | ✅ | ปอน |
| W2 | `wallet/` 4-tab history (`tb_wallet_hs`, per-type filters) | `/wallet/page.tsx` filters `tb_wallet_hs` by type 1,5 / 2,4,6,7 / 3 | ✅ | ✅ | ปอน |
| W3 | `wallet/add/` topup → INSERT `tb_wallet_hs` type=1 status=1 + slip + PromptPay QR | `submitLegacyWalletDeposit` → `tb_wallet_hs` type=1 status=1, slip→`slips` bucket, QR via `getDepositQr` | ✅ | ✅ | เดฟ |
| W4 | `wallet/withdraw/` → **DEBIT `tb_wallet` now** + INSERT `tb_wallet_hs` type=3 status=1 | `createWithdraw` → REBUILT `wallet_transactions` (negative amount); reads REBUILT `wallet.balance` | 💀 | ❌ wrong table + wrong status model | เดฟ |
| W5 | `wallet/` history page consistency | `/wallet/history/page.tsx` → REBUILT `wallet`+`wallet_transactions` (empty for migrated 8,898) | 💀 | ❌ disagrees with `/wallet` | เดฟ |
| W6 | Admin `wallet/deposit/{id}` approve (status 1→2 + `walletTotal += amount`) | `adminApproveWalletHs` (status 1→2, delta on type 1/2=+, 4/7=−) writes `tb_wallet` | 🟡 | 🟡 enum wrong for type 3 & 7 (see FO-1) | ภูม |
| W7 | Admin `wallet/deposit/{id}` **reject** (status→3 + refund type=7 + DELETE paydeposit) | `adminRejectWalletHs` (status→3, **no refund, no paydeposit cleanup**) | 🟡 | ❌ no refund/cascade | ภูม |
| W8 | Admin `wallet/withdraw/{id}` approve (slip+dateSlip required, **no balance change**) | — (no withdraw rows reach `tb_wallet_hs`; approval engine treats type=3 delta=0) | ❌ | ❌ missing | ภูม |
| W9 | Admin `wallet/withdraw/{id}` **reject → REFUND `walletTotal += amount`** | — (no refund path exists) | ❌ | ❌ missing | ภูม |
| W10 | `tb_wallet_paydeposit` batch-settle (1 slip → N pending order-payments, cascade type 2/4 + `tb_header_order`) | none in app code (column read on `/admin/wallet/[id]` only) | ❌ | ❌ missing | ภูม |
| W11 | `wallet-credit/` balance (วงเงิน = `userCreditValue−creditValue`, ค้างชำระ, cash) + credit history | `/wallet-credit/page.tsx` reads `tb_credit`+`tb_users.userCreditValue`+`tb_wallet`+`tb_wallet_hs WHERE wusercredit=1` | ✅ | ✅ | ปอน |
| W12 | `wallet-credit/` topup → INSERT `tb_wallet_hs` `wUserCredit=1` | `<LegacyDepositForm kind="credit">` → `submitLegacyWalletDeposit` with `wUserCredit='1'` | ✅ | ✅ | เดฟ |
| W13 | `wallet-credit/withdraw/` credit-withdraw + **#wallet-login password-confirm modal** | — (route does not exist) | ❌ | ❌ missing | เดฟ |
| W14 | `wallet-shop/` affiliate balance + 4-tab history (`tb_wallet_shop`+`tb_wallet_shop_hs`) | `/wallet-shop` + `affiliate-shop-wallet.ts` → REBUILT `tb_wallet_shop`+`tb_shop_transactions` (profile_id-keyed) | 💀 | ❌ wrong tables, no legacy data link | เดฟ |
| W15 | Transfer cash→shop wallet (`tb_wallet → tb_wallet_shop`) | `transferFromPersonalToShopWallet` debits REBUILT `wallet_transactions`, credits `tb_wallet_shop` | 💀 | ❌ debits wrong wallet | เดฟ |
| W16 | Record-locking on admin approval (`LockDate`+`session`) | none (relies on `.eq("status","1")` race-guard only) | 🟡 | partial | ภูม |
| W17 | LINE Notify customer on topup/withdraw status change | in-app `sendNotification` on submit (deposit only); **none on approve/reject** | 🟡 | ❌ no notify on status flip | เดฟ |
| W18 | Cashback wallet (`tb_cash_back`/`tb_cash_back_hs`) display + spend | read only (parity query in wallet-credit; never rendered/spent) | 🟡 | n/a (legacy display largely commented out) | ภูม |

Legend: ✅ done & faithful · 🟡 present but diverges · ❌ missing · 💀 present-but-dead (writes/reads a rebuilt empty table = the 8,898 customers' real data is bypassed).

---

## Death-flows (P0/P1, detailed)

### 💀 P0-1 — Customer WITHDRAW writes to the rebuilt `wallet_transactions`, not legacy `tb_wallet_hs` (SPLIT-BRAIN)
- **Where:** `app/[locale]/(protected)/wallet/withdraw/page.tsx` L9 passes `getWallet().balance`; `withdraw-form.tsx` L51 calls `createWithdraw`; `actions/wallet.ts::createWithdraw` (L174-243) inserts into `wallet_transactions` and checks `getWalletAvailableBalance` (= rebuilt `wallet` table).
- **Why it's dead:** the 8,898 migrated customers have their balance in `tb_wallet.walletTotal` and zero in the rebuilt `wallet` table. So:
  1. The withdraw page shows **฿0** "ยอดที่สามารถถอนได้" for every migrated customer → they cannot withdraw at all.
  2. If a launch-era customer (who happens to have a rebuilt `wallet` row) does withdraw, the request lands in `wallet_transactions` — it **never appears in their `tb_wallet_hs` history**, **never debits `tb_wallet.walletTotal`**, and the **admin (whose queue reads `tb_wallet_hs`) never sees it**. The money is neither held nor paid; the request vanishes.
- **Legacy spec it violates:** `wallet/withdraw/` must DEBIT `tb_wallet.walletTotal` immediately + INSERT `tb_wallet_hs` type=3 status=1 (held), so the admin withdraw queue (`pcs-admin/wallet.php?page=withdraw`) can approve (payout, no balance change) or reject (refund). Flow-order is debit→hold→approve/refund.
- **Owner:** เดฟ (customer-backend, integration spine). **Severity: P0.**

### 💀 P0-2 — `/wallet/history` reads the rebuilt `wallet`/`wallet_transactions` (disagrees with `/wallet`)
- **Where:** `app/[locale]/(protected)/wallet/history/page.tsx` L2,65-66 → `getWallet()` + `listWalletTransactions(200)` → rebuilt tables.
- **Why it's dead:** a migrated customer sees their **real balance + full ledger** on `/wallet` (legacy `tb_wallet`/`tb_wallet_hs`) but an **empty wallet with ฿0 and no transactions** on `/wallet/history` — two pages in the same portal contradict each other. The `/wallet` breadcrumb even links to `/wallet/history` ("กระเป๋าสตางค์"), so customers will hit the dead page routinely.
- **Owner:** เดฟ. **Severity: P0** (customer-trust + support-load; same root cause as P0-1 — retire `getWallet`/`listWalletTransactions` onto `tb_*`).

### 💀 P0-3 — Affiliate SHOP WALLET is 100% rebuilt tables; legacy `tb_wallet_shop_hs` data orphaned
- **Where:** `actions/affiliate-shop-wallet.ts` (`getShopWalletSummary`, `listShopWalletTransactions`, `transferFromPersonalToShopWallet`, `requestShopWalletWithdraw`) + migrations `0104_shop_wallet.sql` / `0105`. They use NEW tables `tb_wallet_shop` + `tb_shop_transactions` keyed by `profile_id = auth.uid()`, and `transfer` debits the rebuilt `wallet_transactions`.
- **Why it's dead:** legacy customer shop-wallet lives in `tb_wallet_shop` + `tb_wallet_shop_hs` keyed by `userID` (PR-code). The legacy `tb_wallet_shop_hs` table is **not even present in the ported schema** (`grep tb_wallet_shop_hs supabase/migrations/0081` = 0). So every affiliate with a real shop-wallet balance sees **฿0** and cannot see/withdraw legacy earnings. Migration 0104's header openly states it follows the rebuilt `wallet` pattern — confirming this is a fresh feature, not a faithful port.
- **Legacy spec:** `wallet-shop/` balance + 4 tabs over `tb_wallet_shop_hs` (type 1=topup,2=pay,3=withdraw,4=transfer,5=refund); transfer moves `tb_wallet → tb_wallet_shop`.
- **Owner:** เดฟ (customer-backend; needs a data-bridge decision — is the legacy shop balance being migrated, or is this intentionally a new feature? Architecture call). **Severity: P0** if affiliates have real balances; **P1** if shop-wallet was never live in legacy prod (verify with ก๊อต/owner).

### 🟡 P1-4 — Admin reject does NOT refund (withdraw + type-7 cascade missing)
- **Where:** `actions/admin/wallet-trans.ts::adminRejectWalletHs` (L303-361) flips status→3 only; `adminApproveWalletHs` (L195-197) maps type 3 → delta 0 and type 7 → debit.
- **Why it's wrong:** legacy reject of a **withdraw (type 3)** must REFUND `walletTotal += amount` (the money was held at request time). Legacy reject of a **deposit with type-7 top-up-extra** rows also refunds + `DELETE tb_wallet_paydeposit`. Pacred does neither — so once W4/W8 are fixed, a rejected withdraw would silently keep the customer's money debited. **This bug is currently masked only because no withdraw rows reach `tb_wallet_hs` (P0-1).**
- **Owner:** ภูม (admin back-office backend). **Severity: P1** (becomes P0 the moment P0-1 is fixed — fix together).

### 🟡 P1-5 — `tb_wallet_paydeposit` batch-settle entirely missing
- **Where:** no app code writes `tb_wallet_paydeposit` (only read as a column on `/admin/wallet/[id]/page.tsx`).
- **Why it matters:** legacy lets a customer pay **multiple pending orders with one topup slip** — admin approves the slip and it cascades to all linked type 2/4 rows + flips `tb_header_order.hStatus`/`tb_forwarder.fStatus`. Without it, multi-order batch payment (a common ops workflow) cannot be reproduced; each order must be paid 1:1.
- **Owner:** ภูม. **Severity: P1.**

### ❌ P1-6 — `/wallet-credit/withdraw` + password-confirm modal missing
- **Where:** only `wallet-credit/page.tsx` exists; the legacy `wallet-credit.php?page=withdraw` (L535-803) branch with the `#wallet-login` re-auth modal is not ported.
- **Why it matters:** legacy gates credit-withdraw behind a password re-confirm (a money-movement security step). Customers on credit terms have no port path. The `wallet-credit/page.tsx` header even documents this branch as "a separate screen (not the target of this menu link)" — it was deferred, never built.
- **Owner:** เดฟ. **Severity: P1.**

---

## Flow-order divergences

- **FO-1 — withdraw status model inverted.** Legacy: customer request = immediate DEBIT (hold) → admin approve = payout-proof (no balance change) → reject = refund. Pacred `createWithdraw` writes a rebuilt-table pending row (no legacy debit), and the admin engine treats type=3 as delta=0 with no refund. The whole debit→hold→refund order is absent/wrong. (P0-1 + P1-4)
- **FO-2 — wallet `type` enum mismatch in admin delta rule.** `wallet-trans.ts` L195-197 + `tb-bulk.ts` L148-149 + `wallet-hs.ts` L187 treat **type 7 = withdraw/debit**, but legacy type 7 = "ชำระเงินแบบเติมเพิ่ม" (pay-top-up-extra) and **type 3 = withdraw**. Withdraw (type 3) gets delta 0 (no debit/refund), and a real type-7 cascade is reduced to a plain debit. `wallet-hs.ts` also INSERTs admin-manual withdraw as **type='7'** instead of legacy **type='3'** — so admin-created withdraws land in the wrong history tab on the customer page (the customer `/wallet` filters type=3 into the ถอนเงิน tab; a type-7 row falls into the ชำระเงิน tab).
- **FO-3 — deposit-approval cascade absent.** Legacy approve/reject cascades through `tb_wallet_paydeposit` to settle/rollback linked order-payments + flip `tb_header_order`/`tb_forwarder` status; Pacred approves the single `tb_wallet_hs` row only (auto-receipt hook exists for `typeservice=2`, but the multi-order paydeposit batch cascade does not). (P1-5)
- **FO-4 — `/wallet` vs `/wallet/history` read different ledgers.** Same portal, two balance sources (legacy `tb_wallet` vs rebuilt `wallet`). (P0-2)
- **FO-5 — no customer notification on status flip.** Legacy fires LINE Notify to the customer on every topup/withdraw approve/reject (`sendLine($userLineNotify,…)` in `wallet.php` L688). Pacred notifies only on submit (deposit); approve/reject in `wallet-trans.ts`/`tb-bulk.ts` send nothing to the customer. (W17)

---

## Modals / AJAX / cron / print inventory

**Legacy AJAX endpoints (customer):**
- `include/pages/wallet/load_wallet_hs.php` — main history infinite-scroll, per-type SQL branches (`all` / `c` / `2,4,6,7` / `1,5` / single). → Pacred renders all rows server-side (scroll-to-load not reproduced — acceptable).
- `load_wallet_hs_add.php` (type=1), `load_wallet_hs_payments.php` (type=2), `load_wallet_hs_withdraw.php` (type=3) — per-tab loaders. → covered by `/wallet/page.tsx` filters.
- `load_wallet_hs_credit.php` (`wUserCredit=1`) — credit history. → covered by `/wallet-credit/page.tsx`.
- `wallet-shop/load_wallet_hs*.php` (4 files, `tb_wallet_shop_hs` type 1,5 / 2 / 3 / all) — affiliate history. → **dead** (Pacred uses rebuilt `tb_shop_transactions`).
- `include/pages/index/getListPay.php` + `getListPayForwarder.php` — the "pay N pending orders from wallet" batch modal (`tb_wallet_paydeposit` writer). → **missing** (P1-5).
- `include/pages/payment/QRPay.php` — yuan-transfer pay-from-wallet QR (cust-yuan lane, cross-links here via wallet debit).

**Legacy modals:**
- `#wallet-add` (topup, PromptPay QR + slip + dropify) — transcribed 1:1 in `/wallet/deposit` + `/wallet-credit` (renders static; QR via `getDepositQr`, submit via `submitLegacyWalletDeposit`). ✅
- `#wallet-login` (credit-withdraw password re-confirm, `wallet-credit.php?page=withdraw`) — **not ported** (P1-6).
- `#list-payment` (`getListPay` batch-pay) — **not ported** (P1-5).

**Legacy admin modals/handlers:**
- `pcs-admin/wallet.php?page=add` (admin tops up customer + QR + slip) → `actions/admin/wallet-hs.ts::adminCreateWalletHsManual` + `/admin/wallet/add`. ✅ table (enum bug FO-2).
- `pcs-admin/wallet.php?page=deposit&id=…` (approve/reject + `updateDate` + paydeposit cascade) → `/admin/wallet/[id]` + `wallet-trans.ts`. 🟡 (no cascade, no refund-on-reject).
- `pcs-admin/wallet.php?page=withdraw&id=…` (approve w/ slip+dateSlip / reject→refund) → **missing** (W8/W9).
- `pcs-admin/wallet.php?page=history` + `history-cash-back` → `/admin/wallet/history`. (not deeply audited — admin lane.)

**Cron:** none specific to the cash wallet in the legacy extract. (`header.php` runs an auto-expire `UPDATE tb_header_order` on every page-load — deliberately NOT reproduced in the Server-Component reads, correctly flagged in the page headers; that belongs to the orders lane.)

**Print/PDF:** withdraw-approval issues a payout slip in legacy (`grenrateReceiptF` path for forwarder-payment approvals); Pacred wires `autoIssueReceiptOnPaymentLand` on `typeservice=2` approval (forwarder receipts) — present. No wallet-specific PDF beyond receipts.

---

## Recommended fixes (ranked, with owner)

1. **[P0 · เดฟ] Re-wire customer WITHDRAW + HISTORY onto legacy `tb_*`.** Replace `createWithdraw` to: read `tb_wallet.walletTotal`, INSERT `tb_wallet_hs` type=**3** status=1, and **debit `tb_wallet.walletTotal`** immediately (pending-aware overdraw guard against `tb_wallet_hs` type-3 status-1 rows). Repoint `/wallet/withdraw/page.tsx` to the legacy balance, and rewrite `/wallet/history` to read `tb_wallet_hs` (drop `getWallet`/`listWalletTransactions`, or repoint them at `tb_*`). Retire the rebuilt `wallet`/`wallet_transactions` reads from the customer surfaces. (Fixes P0-1 + P0-2 + FO-1 + FO-4.)
2. **[P1→P0 · ภูม] Fix admin withdraw approve/reject + refund + enum.** Add the `wallet/withdraw/{id}` approve (require slip+dateSlip, status→2, **no balance change**) and reject (status→3, **refund `walletTotal += amount`**) paths. Fix the delta map everywhere (`wallet-trans.ts`, `tb-bulk.ts`, `wallet-hs.ts`): **type 3 = withdraw**, type 7 = pay-top-up-extra; admin-manual withdraw must INSERT type=**3** not 7. Ship together with fix #1 so a rejected withdraw refunds. (Fixes W7/W8/W9 + FO-2.)
3. **[P0/P1 · เดฟ + ก๊อต] Decide the affiliate shop-wallet data model.** Confirm with owner whether legacy `tb_wallet_shop`/`tb_wallet_shop_hs` had live balances (the table isn't even in the ported `0081` schema). If yes → port the legacy tables + repoint `affiliate-shop-wallet.ts` at them (and `transfer` debits legacy `tb_wallet`). If shop-wallet was never live → label the rebuilt 0104/0105 tables a Phase-C feature (not a faithful-port gap) and document it. (Resolves P0-3.)
4. **[P1 · ภูม] Port the `tb_wallet_paydeposit` batch-settle.** Build the "pay N pending orders with one topup" flow + the deposit-approval cascade (link rows, flip `tb_header_order`/`tb_forwarder`, cleanup on reject). (Fixes W10/P1-5 + FO-3.)
5. **[P1 · เดฟ] Build `/wallet-credit/withdraw` + password-confirm modal** (`wallet-credit.php?page=withdraw`). (Fixes W13/P1-6.)
6. **[P1 · เดฟ] Notify customer on topup/withdraw status flip.** Add `sendNotification(walletTxStatusChanged)` to `adminApproveWalletHs`/`adminRejectWalletHs`/`tb-bulk` (replacing legacy customer LINE Notify with the in-app feed). (Fixes W17/FO-5.)
7. **[P2 · ภูม] Add record-locking** equivalent to legacy `LockDate`+`session` on the admin approval detail (or document the `.eq(status,'1')` race-guard as sufficient). (W16.)

---

### Cross-references
- ภูม's `docs/audit/master-fidelity-2026-05-30-evening.md` §"Pattern 3" already flagged wallet-ledger-not-debited on the **payment-approval** side (yuan/service-order); this audit extends the same split-brain diagnosis to the **withdraw + history + shop-wallet** customer surfaces.
- `docs/research/d1-customer-backend-gap-2026-05-24.md` §J rated wallet "90% COMPLETE" treating `createWithdraw`/`listWalletTransactions` as DONE — **superseded here**: those are dead-writes against rebuilt tables.
