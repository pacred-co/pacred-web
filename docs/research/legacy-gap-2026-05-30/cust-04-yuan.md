# cust-04-yuan — ฝากโอน / yuan transfer (CUSTOMER view) — legacy-vs-Pacred gap audit

2026-05-30 · D1 Phase-B faithful-port · "ห้าม death" · legacy = spec · flow-ORDER must match
Owner of this lane (เดฟ — customer-backend / integration spine).

> **Scope (customer side ONLY):** the customer-facing ฝากโอนหยวน / ฝากชำระเงิน flow.
> Legacy entry = `member/payment.php` (default + `?page=add` + `?page=detail&id=N` branches)
> + `member/include/pages/payment/QRPay.php` (the live AJAX endpoint).
> Pacred target = `app/[locale]/(protected)/service-payment/*` + `actions/payment.ts`.
> The ADMIN back-office side (approve/reject/refund/reports/rate-config) is a SEPARATE
> lane — already audited in `docs/audit/yuan-payments-fidelity-2026-05-30-evening.md`
> (ภูม). This doc CONFIRMS + EXTENDS that prior art for the customer slice and does
> not re-litigate the admin P0s except where they break the customer loop.

---

## 0. Source-of-truth caveat (read first)

The customer dispatcher `member/payment.php` is **NOT on disk** in this Mac extract
(`/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/member/` has only
`include/`, `pcs-admin/`, `api/`… — no top-level customer `.php`). The May-21 snapshot
`/Users/dev/Desktop/pcscargo/` is also absent. The canonical customer flow was therefore
reconstructed from THREE on-disk artifacts that are mutually consistent + match the prior
art's line references:

1. **`member/include/pages/payment/QRPay.php`** (6,648 B · the live customer AJAX endpoint — the shortfall-QR partial) — READ IN FULL.
2. **`member/pcs-admin/payment.php` L1-95** — the admin "add payment on behalf of customer" handler, which is a 1:1 mirror of the customer `?page=add` create logic (same INSERT shape, same wallet-debit sequence) — READ IN FULL.
3. **`app/[locale]/(protected)/service-payment/page.tsx` docblock** — Pacred's own meticulous transcription of `member/payment.php` carries exact legacy line refs (L4-540, L256-452, L457-530), confirming the file existed at the prior agent's audit time and pinning the gate/list logic.

Where I cite "legacy payment.php L<n>" below, the line numbers are from the prior-art
transcription docblock + admin-mirror, not a file I could re-open. Every Pacred claim is
TRUST-BUT-VERIFIED against the actual file on `dave-pacred` HEAD.

---

## Overview

**Legacy customer ฝากโอน scope (the spec):**
- A gated list screen (`member/payment.php` default branch): two hard gates before the feature is usable.
- An add-payment modal (`?page=add`) that creates a `tb_payment` row, **debits the wallet immediately**, writes `tb_wallet_hs` history, and fires LINE to both admin + customer.
- A live AJAX shortfall partial (`QRPay.php`): when the wallet does NOT cover the amount, show a PromptPay QR + KBank account + slip upload to pay the difference (the wallet is topped up first, then the payment proceeds).
- A per-row detail screen (`?page=detail&id=N`).
- `tb_payment.paystatus` enum 1/2/3 (รอดำเนินการ / สำเร็จ / ไม่สำเร็จ).

**Pacred customer scope (what's built on `dave-pacred`):**
- `service-payment/page.tsx` — faithful 1:1 transcription of the list + gates (Bootstrap-4 `.pcs-legacy` markup). Reads `tb_payment` ✅.
- `service-payment/add/page.tsx` + `yuan-payment-form.tsx` — a **Pacred-styled** (NOT verbatim-legacy) create form. Writes `tb_payment` ✅ via `actions/payment.ts → createYuanPayment`.
- `service-payment/[id]/page.tsx` — Pacred-styled detail + tax-invoice request panel. Reads `tb_payment` ✅.
- `actions/payment.ts` — `getCurrentYuanRate` (reads `tb_settings.rpdefault` ✅), `getYuanPayment`, `listYuanPayments`, `createYuanPayment`.

**% complete (customer lane): ~62%.**
The read/list/detail/gate surfaces are faithful and wired to the right `tb_*` tables (the
big F2 fix on 2026-05-29 killed the old `yuan_payments` dead-write). **But the MONEY LOOP is
broken**: the customer-create writes a *pending* debit to the REBUILT `wallet_transactions`
ledger that is **never settled to completed** by any admin approve path, so the customer's
displayed wallet balance never actually drops even after the transfer succeeds. Legacy
debits `tb_wallet.wallettotal` synchronously on submit. This is the same A1 flag as open
task #38 — still unresolved. Two more flow-order divergences (slip-only bypass; gate moved
off /add) and two notify gaps complete the picture.

---

## Canonical legacy customer flow (step ORDER — the spec)

**LIST screen (`payment.php` default branch):**
1. **Gate A — juristic pending (L448-451):** if customer has a `tb_corporate` row with `corporateStatus=1` → render ONLY a red "รอเจ้าหน้าที่อนุมัตินิติบุคคล ภายใน 24 ชม." block. Feature blocked.
2. **Gate B — never-paid (L278-280):** else if NOT (`usedShop` AND `usedForwarder`) → render ONLY a red "คุณต้องเคยชำระเงินบริการ ฝากสั่งซื้อ หรือ ฝากนำเข้าสินค้ามาก่อน ถึงจะสามารถทำฝากโอนหยวน/ฝากชำระเงินได้" block. Feature blocked. (`usedShop` = `tb_header_order hStatus>3 AND <>6`; `usedForwarder` = `tb_forwarder fStatus>5`.)
3. Else render the list: header + "เพิ่มรายการ" → opens `#add-payment` modal · 4 status tabs (ทั้งหมด/รอดำเนินการ/สำเร็จ/ไม่สำเร็จ with counts) · `#myTable` DataTable of `tb_payment` rows. `?q=1/2/3` filters by paystatus.

**CREATE (`?page=add` modal POST, mirrored by admin `payment.php` L1-95):**
4. Validate `payType`, `payDetail`, `payYuan` all non-empty.
5. **Wallet pre-check: `walletTotal > 0`** (else `eWallet` alert).
6. Rate `payRate = $_POST['rateYuan']` (pre-filled from `tb_settings.rpDefault`); `payTHB = payRate × payYuan`.
7. **Wallet-sufficiency check: `payTHB <= walletTotal && payTHB > 0`** (else `eWallet`). → **the payment is ALWAYS funded from the wallet; there is no slip-only path in the create.**
8. INSERT `tb_payment` — NO explicit paystatus → DB default `'1'` (รอดำเนินการ). `paydeposit` set, slip column = the customer's `imagesSlip`.
9. **Debit wallet SYNCHRONOUSLY: `walletTotal -= payTHB`; UPDATE `tb_wallet`.**
10. `lineNotify($adminGroup, "มีรายการฝากชำระสินค้าใหม่ #<id> จากคุณ <PR>")` — to the ADMIN/staff LINE group.
11. INSERT `tb_wallet_hs` (`type='6'` ชำระเงินฝากโอน, `status='1'`, `refOrder=<id>`).
12. `sendLine($userLineNotify, "...มีรายการฝากโอน/ชำระใหม่...สถานะ: รอดำเนินการ")` — to the CUSTOMER's LINE.

**SHORTFALL top-up (`QRPay.php`, AJAX on the create modal):**
- When `payWallet = (rpDefault × payYuan) − walletTotal > 0` → render PromptPay QR (`ppID 0105560160694`) + KBank acct `064-174-3836` + a REQUIRED `imagesSlip` upload for the difference. The customer pays the shortfall to PCS, uploads the slip; the wallet is topped up first, then the payment can be made wallet-funded.

**Confirm dialog (getListPay.php L274 pattern, shared modal JS):** `confirm("ระบบจะหักเงินจากกระเป๋าสตางค์ของคุณ กรุณายืนยันก่อนทำรายการ")` before submit.

**Status semantics:** 1=รอดำเนินการ (warning) · 2=สำเร็จ (info/blue) · 3=ไม่สำเร็จ (danger). Approve/reject happen ADMIN-side; the customer only ever creates `paystatus='1'` rows and watches the badge change.

---

## Workflow-by-workflow gap table

| # | Legacy flow (spec) | Pacred equivalent | Status | Flow-order correct? | Owner |
|---|---|---|---|---|---|
| C-01 | List read from `tb_payment` scoped to userid | `service-payment/page.tsx` reads `tb_payment` by `userid=member_code` | ✅ | ✅ | เดฟ |
| C-02 | Gate A — juristic pending block (`tb_corporate.corporatestatus=1`) | transcribed L333-348 (`!statusCheckJuristic`) | ✅ | ✅ on list | เดฟ |
| C-03 | Gate B — never-paid block (`usedShop && usedForwarder`) | transcribed L349-367 (`showNeverPaidBlock`) | ✅ | ✅ on list | เดฟ |
| C-04 | 4 status tabs + counts + `?q=` filter | transcribed L432-482; server-side `?q=` filter | ✅ | ✅ | เดฟ |
| C-05 | `#myTable` columns (date/id/detail/type/amount/status/option) | transcribed L491-541; `-N` red amount, `countText(120)`, payType/payStatus badges 1:1 | ✅ | ✅ | เดฟ |
| C-06 | DataTables sort/paginate/search/export JS | static table only (no DataTables JS) | 🟡 | n/a | ปอน |
| C-07 | "เพิ่มรายการ" opens in-page modal | `<Link>` to `/service-payment/add` page (modal removed F2) | 🟡 | divergent UI, same workflow | เดฟ |
| C-08 | CREATE → INSERT `tb_payment` paystatus='1' | `createYuanPayment` INSERTs `tb_payment` paystatus='1' | ✅ | ✅ | เดฟ |
| C-09 | CREATE wallet pre-check `walletTotal > 0` | **no `>0` pre-check** (only sufficiency on wallet-paid path) | 🟡 | divergent | เดฟ |
| C-10 | CREATE wallet-sufficiency `payTHB <= walletTotal` + ALWAYS wallet-funded | binary radio: **wallet OR slip-only** — slip-only bypasses wallet entirely | ❌ | **WRONG paradigm** | เดฟ |
| C-11 | CREATE debits `tb_wallet.wallettotal` SYNCHRONOUSLY on submit | writes a **pending** `wallet_transactions` debit (rebuilt ledger); `tb_wallet.wallettotal` untouched | 💀 | **WRONG order** | เดฟ |
| C-12 | CREATE writes `tb_wallet_hs` type='6' | **no `tb_wallet_hs` write** (uses rebuilt `wallet_transactions` instead) | 💀 | divergent table | เดฟ |
| C-13 | CREATE LINE-notifies ADMIN group | `createYuanPayment` only notifies the **customer**; no admin-group ping | 🟡 | partial | เดฟ |
| C-14 | CREATE LINE-notifies CUSTOMER ("สถานะ: รอดำเนินการ") | `sendNotification(category yuan_payment)` → LINE push (when linked) | ✅ | ✅ | เดฟ |
| C-15 | SHORTFALL: PromptPay QR + KBank + slip when wallet < amount (`QRPay.php`) | **absent** — Pacred routes shortfall to a separate `/wallet/deposit` link, no in-flow QR | ❌ | missing flow | เดฟ |
| C-16 | "เลขฝากจ่าย" = `tb_settings.numberPaymemt` shown on modal | `yuan-payment-form.tsx` shows a CLIENT-random `YP<date>-<rand>` ref (cosmetic, not the legacy sequence) | 🟡 | cosmetic drift | ปอน |
| C-17 | Confirm dialog "ระบบจะหักเงินจากกระเป๋าสตางค์ของคุณ" | **no confirm dialog** on the Pacred form | 🟡 | missing | ปอน |
| C-18 | Rate = `tb_settings.rpDefault` | `getCurrentYuanRate` reads `tb_settings.rpdefault` (A6 fix) ✅ | ✅ | ✅ | เดฟ |
| C-19 | DETAIL screen `?page=detail&id=N` (own row) | `service-payment/[id]/page.tsx` reads `tb_payment` scoped to member_code | ✅ | ✅ | เดฟ |
| C-20 | DETAIL shows status / amounts / slip / detail | Pacred KV card + slip view + tax-invoice panel (Pacred-styled, NOT verbatim) | ✅ | ✅ (superset) | เดฟ |
| C-21 | `payType` enum 1/2/3 (จ่ายผ่านเว็บไซต์จีน / Alipay / อื่นๆ) | form offers Alipay/WeChat/bank → maps to 1/2/3; **labels mismatch the legacy enum** | 🟡 | semantic drift | เดฟ |
| C-22 | Status labels: list=สำเร็จ (info/blue) | list page (transcription) keeps สำเร็จ ✅; detail page says "สำเร็จ" but green not blue | 🟡 | minor color/label drift | ปอน |
| C-23 | Future-spend safety vs stacked pending debits | `getWalletAvailableBalance` counts open pending debits (0064 trigger backstop) | ✅+ | Pacred improvement | เดฟ |
| C-24 | Wallet-paid insert failure must not show success | `createYuanPayment` rolls back the orphan `tb_payment` row on wallet-insert error | ✅+ | Pacred improvement | เดฟ |

Legend: ✅ in-parity · 🟡 partial/divergent-but-works · ❌ missing · 💀 present-but-dead/wrong (the loop silently breaks).

---

## Death-flows (P0/P1 detailed)

### 💀 P0-1 — wallet-paid yuan debit NEVER settles → customer balance never drops (money-hole)
**This is task #38's A1 flag. Confirmed live + unresolved.**

Legacy debits `tb_wallet.wallettotal` synchronously inside the create POST (`payment.php` admin-mirror L51-52). The customer's balance drops the instant they submit; the row sits `paystatus='1'` waiting for admin verification, but the money is already reserved.

Pacred's `createYuanPayment` (`actions/payment.ts` L400-421) instead INSERTs a row into the
REBUILT `wallet_transactions` ledger with `status='pending'`, `kind='yuan_payment'`,
`amount=-thb`. The 0007 `wallet_recompute_balance` trigger sums **only `status='completed'`**
rows (`0007_wallet.sql` L117-118), so:

- On create → `wallet.balance` does NOT change (the debit is pending).
- On admin approve → `adminBulkApproveYuanPayments` (`actions/admin/tb-bulk.ts` L295-333) flips `tb_payment.paystatus 1→2` and **explicitly does NOT touch `wallet_transactions`** (its comment L281: *"No wallet adjustment — yuan payments don't credit wallet (they're an outflow already debited at create)"* — but it was NEVER debited from `wallet.balance`, only parked as pending).
- Net: the pending `wallet_transactions` debit is **orphaned forever** — no code path flips it to `completed`. `wallet.balance` never drops, even after สำเร็จ.

**Effect:** a customer pays ¥X from their wallet, the transfer completes, and their displayed
wallet balance is unchanged. They can spend the same THB again on a shop order / another
yuan transfer / a withdrawal. `getWalletAvailableBalance` (counts open pending debits) is the
ONLY thing stopping immediate double-spend — and it stops counting the moment anyone
manually completes/cancels the stale pending row, OR if a future refactor trusts
`wallet.balance`. The legacy `tb_wallet.wallettotal` (where the 8,898 migrated customers' real
balances live) is **completely untouched by the customer yuan flow**.

**Two-sided table split confirmed:** customer wallet reads/writes the rebuilt
`wallet`/`wallet_transactions`; admin manual-create (`yuan-payments-tb.ts` L271) + admin
wallet adjustments (`wallet-hs.ts` L209) read/write legacy `tb_wallet.wallettotal` +
`tb_wallet_hs`. **The customer wallet and the admin/legacy wallet are split-brain** —
no sync trigger exists (grepped `supabase/migrations/`).

**Fix (the load-bearing one for this lane):** on yuan approve (`adminBulkApproveYuanPayments`
+ any future per-row approve), find the matching pending `wallet_transactions` row
(`reference_type='yuan_payment' AND reference_id=tb_payment.id AND status='pending'`) and flip
it to `completed` so the trigger debits `wallet.balance`. Mirror the same on reject →
`cancelled` (release the reservation). **Decide the wallet SOT first** (เดฟ + ก๊อต): either
(a) make the rebuilt `wallet` the single SOT and stop dual-writing `tb_wallet`, or (b) keep
`tb_wallet.wallettotal` authoritative and have the customer flow debit IT (true 1:1) — the
current half-and-half is the root defect.

### ❌ P0-2 — slip-only create bypasses the wallet entirely (paradigm divergence)
Legacy yuan-transfer create is **always wallet-funded**: `walletTotal > 0` AND
`payTHB <= walletTotal` are hard gates; if the wallet is short, `QRPay.php` makes the customer
**top up the shortfall first** (PromptPay), THEN the payment proceeds wallet-funded. There is
**no path** in legacy to submit a yuan transfer by attaching a slip without the wallet covering it.

Pacred's `yuan-payment-form.tsx` (L227-255) offers a binary radio — **"แนบสลิป" OR
"ตัดจากกระเป๋า"** — and `createYuanPayment` (L350-352) accepts `!paid_via_wallet && slip_url`
as a complete submission that **never touches the wallet at all**. This is a different business
rule: the customer can now create a yuan transfer that the wallet ledger has no record of,
funded by an un-reconciled slip. Combined with P0-1, the wallet stops being the spine of the
yuan flow. **Fix:** restore the legacy paradigm — wallet-funded always; show the shortfall
PromptPay QR (P1-3) when balance < amount; drop the slip-only radio (or keep it only as the
shortfall-slip, matching `QRPay.php`).

### 🟡 P1-3 — never-paid + juristic gates not enforced on `/service-payment/add`
The two hard gates (juristic-pending block; must-have-used-shop-AND-forwarder block) are
faithfully rendered on the LIST page (`service-payment/page.tsx` L333-367) but the **create
page `/service-payment/add` has NO gate** (grepped — zero `usedShop`/`corporate`/`statusCheck`
refs). A customer who is blocked on the list can navigate directly to `/add` (or via a stale
link) and submit a yuan transfer they should not be able to. Legacy gated the modal trigger
behind the same conditions because the modal lived ON the gated list. **Fix:** replicate the
gate check on the `/add` page (and ideally in `createYuanPayment` server-side) — redirect
blocked customers back to the list with the legacy message.

### 🟡 P1-4 — no admin-group LINE notification on customer create
Legacy fires TWO notifications on create: `sendLine` to the customer AND `lineNotify` to the
**admin/staff LINE group** ("มีรายการฝากชำระสินค้าใหม่ #<id>") so staff know a request landed
and can verify it. Pacred's `createYuanPayment` only fires the customer-facing
`sendNotification`. Staff get no ping → verification latency. **Fix:** add an admin-group
notification (or the Pacred admin-inbox/board equivalent) on create.

---

## Flow-order divergences (summary)

1. **Wallet debit timing (P0-1):** legacy = synchronous on customer submit; Pacred = pending ledger row that never settles. The ENTIRE money-movement order is inverted and then dropped.
2. **Funding source (P0-2):** legacy = wallet-always (top-up shortfall first); Pacred = wallet-or-slip either/or. The step "ensure wallet covers it" is replaced by an optional bypass.
3. **Gate placement (P1-3):** legacy gates the create at the same screen as the list; Pacred gates only the list, leaving `/add` open.
4. **Notification fan-out (P1-4):** legacy notifies customer + admin-group on create; Pacred notifies customer only.
5. **Status color (C-22):** legacy "สำเร็จ" = badge-info (blue); Pacred detail uses green. Minor, but the SAME row reads differently across customer screens.

---

## Modals / AJAX / cron / print inventory (customer side)

| Legacy artifact | Type | Purpose | Pacred equivalent | Status |
|---|---|---|---|---|
| `payment.php` `#add-payment` modal | Bootstrap modal | create form (wallet card + payType/payDetail/certifiedTrueCopy/payYuan) | replaced by `/service-payment/add` page | 🟡 UI diverges, workflow kept |
| `include/pages/payment/QRPay.php` | AJAX partial | PromptPay shortfall QR + KBank acct + slip upload when wallet < amount | **none** (routes to `/wallet/deposit`) | ❌ missing |
| `payment.php` confirm JS | inline JS | `confirm("ระบบจะหักเงินจากกระเป๋าสตางค์ของคุณ...")` | **none** | 🟡 missing |
| `payment.php` `#myTable` | DataTables | sort/paginate/search/export of the list | static table (server `?q=` filter only) | 🟡 partial |
| `payment.php` `?page=detail&id=N` | sub-route | per-row detail | `/service-payment/[id]` | ✅ (Pacred-styled) |
| cron | — | none specific to customer yuan flow (admin-side overdue-expiry runs in `header.php`, out of customer scope) | n/a | ✅ |
| print/PDF | — | none on the customer yuan flow (tax-invoice issuance is a separate U4-3b panel) | tax-invoice panel on `[id]` | ✅+ |

**Note on `getListPay.php` / `20260311-getListPay.php`:** these two on-disk handlers are the
**shop-order** payment modal (ชำระเงินออเดอร์ฝากสั่งซื้อ — `tb_header_order`), NOT the
yuan-transfer flow. They share the identical PromptPay-shortfall pattern with `QRPay.php`,
which is why the shortfall flow (P1-3 / C-15) is a recurring legacy idiom worth porting once
as a reusable component for both lanes.

---

## Recommended fixes (ranked, with owner)

1. **🔴 P0 — settle the wallet-paid debit on yuan approve/reject (เดฟ).** First decide the wallet SOT (เดฟ + ก๊อต architecture call): rebuilt `wallet` vs legacy `tb_wallet`. Then: on `adminBulkApproveYuanPayments` (+ future per-row approve) flip the matching `wallet_transactions` row pending→completed; on reject flip pending→cancelled. This closes the money-hole and is the single highest-leverage fix for this lane. ~3-4h.
2. **🔴 P0 — restore the wallet-always funding paradigm (เดฟ).** Remove the slip-only bypass in `yuan-payment-form.tsx` + `createYuanPayment`; require `walletBalance >= thb` (and `walletTotal > 0`) like legacy. Pair with fix #4 (shortfall QR). ~2-3h. (Depends on the SOT decision in #1.)
3. **🟡 P1 — gate `/service-payment/add` (เดฟ).** Replicate the juristic-pending + never-paid (`usedShop && usedForwarder`) gates on the create page and inside `createYuanPayment` (defence-in-depth). ~1-2h.
4. **🟡 P1 — shortfall PromptPay QR in-flow (เดฟ + ปอน).** Port `QRPay.php`: when wallet < amount, show the PromptPay QR + bank acct + shortfall-slip upload, top up the wallet, then proceed. Reusable for the shop-order lane too. ~3h.
5. **🟡 P1 — admin-group notification on customer create (เดฟ).** Add a staff-group ping (LINE group or admin inbox/board row) in `createYuanPayment` so staff see new requests. ~1h.
6. **🟡 P2 — polish (ปอน):** confirm dialog before submit (C-17); DataTables sort/export on the list (C-06); status-color parity สำเร็จ=blue on the detail (C-22); surface `tb_settings.numberpaymemt` as the real "เลขฝากจ่าย" instead of a client-random ref (C-16); reconcile the `payType` enum labels to the legacy 1/2/3 wording (C-21). Cumulative ~4-6h, not launch-blocking.

---

## Cross-references
- Prior art (admin slice + the F2/P0 history): `docs/audit/yuan-payments-fidelity-2026-05-30-evening.md`
- 5-system master audit: `docs/audit/master-fidelity-2026-05-30-evening.md`
- Wallet ledger architecture: `supabase/migrations/0007_wallet.sql` + `lib/wallet/balance.ts`
- Legacy `tb_payment` schema: `supabase/migrations/0081_pcs_legacy_schema.sql` L3611-3648
- Open tasks this confirms: #38 (verify customer-submit debits wallet — A1 flag) + #39 (notify gap)
