# ADR-0025 — Cashback at checkout: customer requests, admin slip-approve debits `tb_cash_back` + logs `tb_cash_back_hs`

**Status:** ✅ ACCEPTED + IMPLEMENTED (spend-side) 2026-06-01 (owner approved; shipped main `1fb8ee6f`). spendCashbackAtCheckout debits `tb_cash_back` + writes `tb_cash_back_hs` (cbhstatus='2'=spend, prod-verified) idempotent on cbhrefid; rollback/refund on reject. shop/yuan/deposit pay paths settle fully. ⚠️ forwarder SLIP-approve path (wallet-trans.ts/tb-bulk.ts — outside the disjoint scope) carries the `[CB:]` tag but does NOT yet debit (no double-spend) → **chip filed** to wire spendCashbackAtCheckout there.
**Source:** 2026-06-01 big audit — [`docs/research/big-audit-2026-06-01/03-shop-order-money.md`](../research/big-audit-2026-06-01/03-shop-order-money.md) §3b gap C + §4 U2 + [`_MASTER-PLAN.md`](../research/big-audit-2026-06-01/_MASTER-PLAN.md) §3 P1 #4 ("Cashback unspendable"). Builds on [`legacy-resweep-2026-05-31/m2-money-loop.md`](../research/legacy-resweep-2026-05-31/m2-money-loop.md) #3.
**Domain:** spending cashback (`tb_cash_back`) at checkout. The earn side already works; the spend side is unbuilt on all three pay surfaces (shop / yuan / forwarder).
**Companion ADRs:** ADR-0018 (wallet SOT — the slip-approve cascade this rides on) + ADR-0023 (credit-line — the sibling "use other balance at checkout" concern).

> ⚠️ This ADR is a PLAN. No SQL or code change has been run. The data points + legacy mechanics below were gathered read-only on prod `yzljakczhwrpbxflnmco` + the legacy PHP (`pcsc/public_html/member/`) during the 2026-06-01 audit.

---

## Context

### The data exists; the spend loop doesn't

| Table | Rows | What it is |
|---|---:|---|
| `tb_cash_back` | 8,810 | Current cashback balance per customer (`userid`, `cbtotal`). **6 have `cbtotal>0`.** Seeded at signup (`lib/auth/legacy-bridge-tb-users.ts` — idempotent, `cbtotal=0`). |
| `tb_cash_back_hs` | 3,741 | Cashback movement history. Cols: `cbhid, cbhdate, cbhstatus, cbhamount, userid, cbhrefid`. **`cbhstatus` enum (migration 0081 comment): `'1'=บวกเพิ่ม (earn)` · `'2'=ชำระเงิน (spend)`.** |

**The gap (verified):** `grep tb_cash_back` across the pay actions (`actions/service-order.ts`, `cart.ts`, `payment-tb.ts`, `forwarder.ts`) → **NONE read or debit it**. `tb_cash_back` is read only for *display* (`lib/legacy/pcs-chrome.ts` badge, `wallet-credit/page.tsx`). So customers **earn cashback they can never spend** — inert capital + a silent retention leak. (The earn side fires elsewhere — e.g. the per-item refund's cashback-credit path and the signup seed — so the history has 3,741 rows, almost all `cbhstatus='1'`.)

### How the legacy cashback-at-checkout actually works (the model to match)

Traced through `member/include/pages/index/getListPayForwarder.php` + admin `pcs-admin/pay-users.php` + `pcs-admin/wallet.php`:

1. **Display (customer pay screen, `getListPayForwarder.php` L16-22, L188-203):** read `cbTotal` from `tb_cash_back`. Cap the usable cashback to the bill (`if totalPriceAll-cbTotal < 0 → cbTotal = totalPriceAll`). Render a `cashBackKey` input (`min=0 max=cbTotal step=0.01`).
2. **The customer enters `cashBackKey`** = how much cashback to apply. The displayed slip amount = `totalPriceAll − walletTotal − cashBackKey − totalNiTi` (wallet + cashback both reduce what they slip; `totalNiTi` = the juristic 1% allowance).
3. **The DEBIT is NOT at customer submit — it's at admin slip-approve.** The customer submit records the intent (the cashback amount rides as a `tb_wallet_hs type='7'` "pay-from-this-topup" sibling row, alongside the wallet pre-apply). The actual `tb_cash_back` decrement + `tb_cash_back_hs` write happen when the **admin approves the slip** (`pcs-admin/wallet.php` L580-594):
   - INSERT `tb_cash_back_hs (cbhDate, cbhStatus='2' (spend), cbhAmount, userID, cbhRefID)`
   - `UPDATE tb_cash_back SET cbTotal = cbTotal − cbhAmount WHERE userID`
   - *(Note: in the current legacy snapshot this exact block is inside a `/* ... */` comment at `wallet.php` L596 — the legacy had it disabled — but the mechanism + enum are authoritative and `pay-users.php` L300-309 still folds `cashBackKey` into the customer's available-balance math at admin pay-on-behalf time.)*
4. **`cbhRefID`** = the order/forwarder the cashback was spent on (the spend trail's anchor — also the idempotency key).

So the legacy treats cashback exactly like a **second wallet that reduces the slip shortfall**, debited on the same admin slip-approve transition as the wallet topup, with a spend row in `tb_cash_back_hs` (`cbhstatus='2'`).

### Why this is the same shape as wallet + credit

The slip-approve cascade in `actions/admin/wallet-hs.ts::adminApproveWalletDeposit` already:
- flips the topup row + `type='7'` sibling pending-pay rows,
- and (for the credit branch) decrements `tb_credit.creditvalue`.

Cashback fits the **identical pattern**: a cashback-applied amount is another component of the slip that, on approve, debits its source table (`tb_cash_back`) and writes its history (`tb_cash_back_hs`). The infrastructure to do this on approve already exists — the gap is (a) capturing the cashback amount at submit, (b) carrying it as a sibling/marked row, (c) debiting `tb_cash_back` + writing `tb_cash_back_hs` on approve, (d) refunding on reject.

---

## Decision

### D-1 — Model: cashback is a slip-reducing balance, debited on admin slip-approve (faithful)

Cashback-at-checkout follows the legacy "second wallet" model on all three pay surfaces (forwarder / shop / yuan):

- **At customer submit:** accept an optional `cashBackApplied` amount (the `cashBackKey` analogue), validated `0 ≤ cashBackApplied ≤ min(tb_cash_back.cbtotal, billRemainder)`. It reduces the slip the customer must upload. **Do NOT debit `tb_cash_back` at submit** — record the intent (see D-2). (Mirrors the legacy: the customer screen only *displays* the reduced amount; the money moves on approve.)
- **At admin slip-approve:** debit `tb_cash_back.cbtotal −= cashBackApplied`, INSERT `tb_cash_back_hs (cbhdate=NOW, cbhstatus='2', cbhamount=cashBackApplied, userid, cbhrefid=<order/forwarder ref>)`. This is the spend transition.
- **At admin slip-reject:** refund — `tb_cash_back.cbtotal += cashBackApplied` (the held cashback returns) and either DELETE the spend `tb_cash_back_hs` row or write a compensating earn row (`cbhstatus='1'`) — **see D-5 #2**. Mirrors the wallet refund on reject (ADR-0018 D-2 rule 3).

**SOT:** `tb_cash_back.cbtotal` = current cashback balance (the authority). `tb_cash_back_hs` = the movement trail (NOT a second balance source — the balance is the column). `cbhstatus` strictly `'1'`=earn / `'2'`=spend per the schema enum.

### D-2 — Where the "applied cashback" lives between submit and approve

The legacy carries the cashback amount as part of the `tb_wallet_hs type='7'` "pay-from-this-topup" sibling math, so it's reconciled at approve alongside the wallet pre-apply. Pacred's customer forwarder-pay (`submitForwarderPayment`) is currently **slip-only** (it records `tb_wallet_hs` pending rows but does NOT pre-apply wallet or cashback — m2 #3). Two ways to carry the applied cashback to approve:

- **D-2a (recommended) — stamp the applied cashback on the pending `tb_wallet_hs` topup row.** When the customer submits with `cashBackApplied > 0`, record it on the topup/pay row (a dedicated column, or reuse an existing numeric field with a clear convention, or a paired `type='7'`-style sibling tagged as cashback). On approve, `adminApproveWalletDeposit` reads it and runs the D-1 debit. This keeps the whole "what funded this order" picture in the wallet-hs cascade where the approve logic already lives. **Requires a small schema/convention addition** (a column or a tagged sibling row to hold the cashback portion).
- **D-2b — debit cashback at submit (status='2' immediately), refund on reject.** Simpler to wire (no carry needed) but **diverges from legacy** (legacy holds, doesn't debit-at-submit) and means a pending-but-not-yet-approved order has already drained cashback — which then needs a reject refund + a cancel refund path. Higher money-safety surface.

Recommendation: **D-2a** — it matches the legacy hold-then-settle model, keeps the debit on the same approve transition as the wallet (one place to get idempotency + rollback right), and avoids draining cashback for slips that get rejected. The cost is one column/convention to carry the applied amount.

> **Coupling note:** D-2a is cleanest if implemented **together with m2 #3 / ADR-0018's "wallet pre-apply + slip-shortfall" restoration** — both are "fund part of the bill from a stored balance, slip the remainder, settle on approve". If the wallet pre-apply is restored first, cashback rides the same `type='7'` sibling machinery for near-free. Sequencing: do the wallet pre-apply (m2 #3) and cashback (this ADR) as one coordinated change on the forwarder pay surface.

### D-3 — Interaction with wallet + credit (the precedence)

When a customer pays a bill, the funding sources stack in this order (legacy `getListPayForwarder.php` math + owner intent):

1. **Wallet** (`tb_wallet.wallettotal`) — applied first (the legacy `totalPriceAll − walletTotal`).
2. **Cashback** (`tb_cash_back.cbtotal`, up to `cashBackKey`) — applied next, reducing the remainder further.
3. **Juristic 1% allowance** (`totalNiTi`) — for corporate customers.
4. **Slip (PromptPay)** — covers whatever shortfall remains.

Credit (ADR-0023) is a **different mechanism** (pay-later, not pay-now) — a credited order does NOT also consume wallet/cashback at grant time; it's settled later. So cashback stacks with wallet + slip, NOT with a credit-out. The "apply cashback" UI is shown only on the pay-now path (slip/wallet), not the credit-out path.

**Partial use:** explicitly supported (the legacy `cashBackKey` is any value `0..cbTotal` capped to the bill). A customer with ฿500 cashback and a ฿2,000 bill can apply ฿200 and slip ฿1,800-minus-wallet. The applied amount is clamped server-side to `min(cbtotal, billRemainderAfterWallet)`.

### D-4 — Money-safety (idempotency · no double-spend · rollback)

The cashback debit rides the existing slip-approve money-safety discipline (ADR-0018):

- **Idempotency:** the approve path already idempotency-guards on the topup row's terminal status. The cashback debit is gated by the **`cbhrefid` uniqueness** — before INSERT-ing the `tb_cash_back_hs` spend row, SELECT for an existing `cbhstatus='2'` row with the same `cbhrefid` (+ the topup id); if present → already settled, skip the debit. This prevents a re-approve (or a retry) from double-debiting `tb_cash_back`.
- **No debit at submit (D-2a):** so a double-submit can't drain cashback; only the single approve transition moves it.
- **Clamp at write:** `cbtotal −= applied` must not go negative — re-read `cbtotal` at approve, clamp the applied amount to the current balance (a customer can't spend more cashback than they have, even if the held amount was stale).
- **Rollback:** if the `tb_cash_back` decrement succeeds but a sibling update fails (or vice versa), the action owns the rollback (PostgREST has no real tx) — restore `cbtotal`, delete the spend `tb_cash_back_hs` row. Same pattern `adminApproveWalletDeposit` uses for the wallet/credit legs.
- **Reject = refund** (D-1) with the same guard (only refund if the spend actually happened).

### D-5 — Exact changes (the fix-list)

**Customer submit (capture the applied cashback):**
1. `actions/forwarder.ts::submitForwarderPayment` — already accepts `cashBackKey` as input but **ignores it** (L1063-1066 comment: "accepted but not applied"). Wire it: validate `0 ≤ cashBackKey ≤ min(tb_cash_back.cbtotal, billRemainder)`, and carry it to approve per D-2a (stamp on the pending row / sibling). Pair with the m2 #3 wallet pre-apply.
2. Shop pay (`actions/service-order.ts` / `payServiceOrderFromWallet` / `cart.ts` checkout) — add the same optional `cashBackApplied` capture on the shop pay path.
3. Yuan pay (`actions/payment-tb.ts` / `createYuanPaymentFromWallet`) — add the same on the ฝากโอน pay path.

**Admin slip-approve (the debit):**
4. `actions/admin/wallet-hs.ts::adminApproveWalletDeposit` — in the linked-slip cascade, read the applied-cashback amount (from D-2a's carry), and run the D-1 debit: `tb_cash_back.cbtotal −= applied` + INSERT `tb_cash_back_hs (cbhstatus='2', cbhamount, userid, cbhrefid)`, with the D-4 idempotency guard. Add a `tb_cash_back` row to the `CascadedRow` audit (it already tracks `tb_credit`).
5. `adminRejectWalletDeposit` — add the cashback refund (`cbtotal += applied`) + the reject history handling (D-5 #2), guarded.

**UI (reachability · §0d):**
6. Customer pay screens (forwarder pay-bar, shop pay, yuan pay) — render the "ใช้แคชแบ็ก ฿X" input (the `cashBackKey` analogue), capped to `cbtotal`, showing the reduced slip total live. This is the entry point — without it the feature is invisible.

**Owner decisions captured (do not silently pick):**
- **D-5 #1 — schema carry (D-2a):** add a dedicated `tb_wallet_hs` column for the cashback portion, OR a tagged sibling row, OR reuse a field by convention? (Recommend: a tagged `type='7'`-style sibling marked as cashback, so the existing approve cascade picks it up with minimal schema change — verify the `nameWallet()`/history filters render it sensibly first.)
- **D-5 #2 — reject history:** on reject, DELETE the spend `tb_cash_back_hs` row (clean) OR write a compensating `cbhstatus='1'` earn row (auditable "refunded")? (Recommend: compensating earn row — preserves the full trail; deletion loses the "this was applied then refunded" history.)
- **D-5 #3 — scope:** ship all three surfaces (forwarder + shop + yuan) at once, or forwarder-first (the legacy `getListPayForwarder` is the only one with a real `cashBackKey` UI)? (Recommend: forwarder-first as the reference, then shop + yuan in the same wave — the audit lists cashback missing on all three.)
- **D-5 #4 — earn policy:** this ADR is **spend-side only**. The earn side already fires (signup seed + refund credit), but a coherent "earn % on what / when" policy (Theme-4 U10 "cashback as retention engine") is a separate Phase-C decision — out of scope here.

### D-6 — Earn side is NOT changed by this ADR

The cashback **earn** loop (`cbhstatus='1'` rows — signup seed, the per-item refund cashback-credit, any promo cashback) already exists and writes `tb_cash_back`/`tb_cash_back_hs` correctly. This ADR only builds the **spend** side. Do not touch the earn writers; just make sure the spend debit reads the same `tb_cash_back.cbtotal` they credit.

---

## Consequences

**Positive:**
- 6 customers with `cbtotal>0` (and every future earner) can finally spend cashback → closes the retention leak; cashback becomes a real lever (Theme-4 U10).
- Rides the existing slip-approve cascade + money-safety discipline (ADR-0018) — one place gets idempotency/rollback right for wallet + credit + cashback.
- Faithful to the legacy hold-then-settle model (debit on approve, not submit).

**Negative / risks (mitigated):**
- **Schema addition (D-2a):** carrying the applied cashback to approve needs a column or a tagged sibling row — a small migration/convention. Mitigated by reusing the `type='7'` sibling pattern (minimal change) — but verify the history-tab rendering first (D-5 #1).
- **Money-safety:** cashback is real spendable value — the debit MUST be idempotent (`cbhrefid` guard), clamped (no negative `cbtotal`), and rollback-safe. A double-debit or a debit-without-reducing-the-bill is a real loss. The D-4 guards are non-negotiable.
- **Coupling with m2 #3:** cashback-at-pay is cleanest done WITH the wallet pre-apply restoration — doing cashback alone on a still-slip-only forwarder pay surface means building the carry machinery for cashback that the wallet pre-apply would also need. Sequence them together (D-2 coupling note).
- **Casing:** `tb_cash_back`/`tb_cash_back_hs` are lowercase (`cbtotal`, `cbhstatus`, `cbhamount`, `cbhrefid`); quote exactly (the existing read code in `pcs-chrome.ts` + `wallet-credit/page.tsx` has the column strings).

**Does NOT change:**
- The cashback **earn** side (D-6) — only the spend side is built.
- The wallet SOT (ADR-0018) — cashback is a separate table; it only adds a debit leg to the existing approve cascade.
- Credit-line (ADR-0023) — credit is pay-later, a different mechanism; cashback stacks with wallet/slip on the pay-now path only.

---

## Alternatives considered

- **A — Customer requests at submit, admin slip-approve debits `tb_cash_back` + logs `tb_cash_back_hs` (chosen).** Faithful to legacy (hold-then-settle on approve); rides the existing slip-approve cascade + money-safety; one place for idempotency.
- **B — Debit cashback at customer submit (immediate), refund on reject/cancel.** Rejected as the primary model: diverges from legacy (legacy holds), drains cashback for slips that get rejected, and widens the refund surface (reject + cancel both must refund). Kept as the fallback (D-2b) only if the carry-to-approve schema work (D-2a) is judged too costly.
- **C — Build cashback spend on a rebuilt `wallet_transactions bucket='cashback'` model.** Rejected: same anti-pattern as the dead credit twin (ADR-0023) — `tb_cash_back`/`tb_cash_back_hs` are the live tables with 8,810/3,741 real rows; a rebuilt cashback ledger would be a fourth dead twin.
- **D — Leave cashback display-only (don't build spend).** Rejected: customers earn value they can't use — a silent retention leak the audit ranks P1; the data + earn loop already exist, only the spend door is missing.
