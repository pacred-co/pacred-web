# ADR-0023 — Customer credit-line SOT = legacy `tb_users.userCreditValue` (limit) + `tb_credit.creditvalue` (outstanding)

**Status:** PROPOSED 2026-06-01 (เดฟ — plan for owner review; **nothing executed**). Awaiting เดฟ/owner approval before any code change.
**Source:** 2026-06-01 big audit — [`docs/research/big-audit-2026-06-01/03-shop-order-money.md`](../research/big-audit-2026-06-01/03-shop-order-money.md) §3a (m2 #9) + §2 (`v_customer_credit_outstanding` = DEAD) + [`_MASTER-PLAN.md`](../research/big-audit-2026-06-01/_MASTER-PLAN.md) §3 P1 #5.
**Domain:** the customer credit-line ("เครดิตสินค้า" / pay-later). Sits next to, but is **separate from**, the wallet SOT decided in [ADR-0018](0018-wallet-sot.md) (cash balance) and the cashback decision in [ADR-0025](0025-cashback-at-checkout.md).
**Companion ADRs:** ADR-0018 (wallet SOT · `tb_wallet`/`tb_wallet_hs`) — this ADR is the credit-line analogue: ratify the legacy half that is already live, retire the rebuilt twin.

> ⚠️ This ADR is a PLAN. No SQL or code change has been run. The data points below were gathered read-only on prod `yzljakczhwrpbxflnmco` during the 2026-06-01 audit.

---

## Context

### Two parallel credit-line worlds exist in the codebase

| | **Legacy model (LIVE for real data)** | **Rebuilt model (DEAD for real data)** |
|---|---|---|
| **Limit** | `tb_users.userCreditValue` (per-customer cap, camelCase) | `profiles.credit_limit` (+ `credit_days` + `credit_enabled`) |
| **Outstanding** | `tb_credit.creditvalue` (lowercase · `tb_credit` keyed by `userid`) | `wallet_transactions` rows `bucket='credit'` (sum) |
| **Available** | `userCreditValue − creditvalue` (computed) | view `v_customer_credit_outstanding.available_credit_thb` |
| **Real rows on prod** | **`tb_credit` = 76 rows · 24 with `creditvalue>0`** | `v_customer_credit_outstanding` = **0 rows** · `wallet_transactions` = **0 rows** |
| **Customer READ** | `app/[locale]/(protected)/wallet-credit/page.tsx` (faithful 1:1 of `wallet-credit.php`) — reads `tb_users.userCreditValue` − `tb_credit.creditvalue`, history `tb_wallet_hs WHERE wusercredit=1` | `actions/credit.ts::getMyCredit` → reads empty view → renders ฿0 in `wallet/credit-panel.tsx` (on `/wallet/history`) |
| **GRANT (credit-out)** | `actions/admin/forwarders-field-edits.ts::adminMarkForwarderCredit` — gate `headroom = userCreditValue − creditvalue >= pricePay`, then `tb_credit.creditvalue += pricePay` (UPSERT). Reachable at `/admin/forwarders/[fNo]`. ✅ shipped | `actions/admin/credit.ts::adminChargeToCredit` → writes `wallet_transactions bucket='credit'` (dead) |
| **SET LIMIT** | (legacy set `userCreditValue` directly on `tb_users`) | `actions/admin/credit.ts::adminSetCustomerCreditLimit` → writes `profiles.credit_limit` (dead) |
| **SETTLE** | the forwarder credit-pay slip-approve: `actions/admin/wallet-hs.ts` L772-797 decrements `tb_credit.creditvalue -= sibAmount` when the pay row's `wusercredit='1'`. ✅ shipped | `actions/credit.ts::customerPayCreditFromWallet` → writes paired `wallet_transactions` rows (dead) |

### The symptom (verified)

**24 real customers carry a `tb_credit.creditvalue > 0`** (an outstanding pay-later debt). The customer-facing credit panel that renders on `/wallet/history` (`credit-panel.tsx`) reads `getMyCredit()` → the empty `v_customer_credit_outstanding` view → shows them **฿0 limit / ฿0 outstanding / ฿0 available** and the "ชำระยอดค้างเครดิต" button is hidden (the panel returns `null` when `credit_limit_thb <= 0`). So those 24 customers **cannot see or pay** their real credit balance through that surface.

It **fails safe** (no wrong debit — the dead path writes a table nobody reads), but it is a dead feature on real money for 24 customers, and a textbook "Potemkin twin" (the audit's Pattern B): the live editor + the real data are in the legacy plane; the rebuilt plane is empty and wired to the customer read.

### How the legacy credit-line actually behaves (the model we must match)

Verified against legacy `member/wallet-credit.php` + `forwarder.php` L1395-1435 + admin `wallet.php`:

1. **Limit** is a flat per-customer number on `tb_users.userCreditValue`. Zero = no credit line.
2. **Outstanding** lives in `tb_credit.creditvalue` (one row per credit customer; **may be missing** — only 76/8,898 have a row; the legacy `UPDATE tb_credit` silently dropped the debt for customers with no row, which Pacred's `adminMarkForwarderCredit` already fixes with an UPSERT).
3. **Available = `userCreditValue − creditvalue`** (computed live; never stored).
4. **The credit is EXTENDED** when an admin "credits out" a forwarder bill (`adminMarkForwarderCredit`): gate on headroom, flip `tb_forwarder.fcredit='1'` + `fcreditdate=<due>`, and `creditvalue += pricePay`.
5. **The credit is SETTLED** when the customer later pays that credited forwarder (the pay-bar lists `fcredit='1'` rows; the slip-approve in `wallet-hs.ts` decrements `creditvalue -= amount`). **There is NO standalone "pay my credit balance from wallet" flow in the legacy** — credit is settled by paying the specific credited order, not by a generic balance paydown.
6. **History** of credit movements = `tb_wallet_hs WHERE wusercredit=1` (already rendered by `wallet-credit/page.tsx`).

So the legacy "credit-line" is **limit − outstanding, both legacy columns, settled per-credited-order** — there is no separate credit ledger table; the movement trail is the `wusercredit=1` slice of `tb_wallet_hs`.

---

## Decision

### D-1 — Canonical credit-line SOT: legacy `tb_users.userCreditValue` (limit) + `tb_credit.creditvalue` (outstanding)

For every credit-line read, limit-set, grant (charge), and settle in Pacred:

- **Limit** = `tb_users.userCreditValue` (`numeric`, per `userID`). 0 = feature off.
- **Outstanding** = `tb_credit.creditvalue` (`numeric`, per `userid`; treat a missing row as 0; always UPSERT on write — never UPDATE-only, per the 76/8,898-row reality).
- **Available** = `userCreditValue − creditvalue`, computed (never stored).
- **Movement trail** = `tb_wallet_hs WHERE wusercredit='1'` (display only — it is NOT a second ledger of truth; the truth is the two columns above).

This is **option A (faithful)** from the task. The rebuilt model (`profiles.credit_limit/credit_days/credit_enabled`, `wallet_transactions bucket='credit'`, the `v_customer_credit_outstanding` view, the `0007` recompute trigger's credit bucket, the `0064` overdraw guard for the credit bucket) is **frozen** — no new writes, no new readers — and retires when the last reader is migrated (a follow-up cleanup, NOT a launch blocker).

**Why A over B (backfill the rebuilt model) or C (hybrid):**
- The live editor (`adminMarkForwarderCredit`), the live customer read (`wallet-credit/page.tsx`), and the live settle (`wallet-hs.ts` decrement) are **already on the legacy columns** — three of the five touchpoints already speak `tb_credit`. Only the `/wallet/history` panel + its two unused admin actions speak rebuilt. A repoints the minority; B would require migrating 24 customers' balances + rewriting the three already-faithful surfaces backward onto the dead model. A is strictly less work and matches ADR-0018's "ratify the half that already works" precedent.
- B (backfill `profiles.credit_limit`/`v_customer_credit_outstanding` from `tb_credit`) would create a **second writable SOT** that the legacy editor doesn't update — every future `adminMarkForwarderCredit` would silently drift the rebuilt view out of sync (the exact split-brain ADR-0024 is trying to kill for config). Rejected.
- C (hybrid — read legacy, keep rebuilt for "Pacred-native" credit) adds a sync burden for a feature that already has one faithful home. Rejected.

### D-2 — Semantics (limit / outstanding / available), restated for the codebase

- **`credit_limit_thb`** ← `tb_users.userCreditValue`. The ceiling. Admin-set. Feature is "on" iff > 0.
- **`outstanding_thb`** ← `tb_credit.creditvalue` (missing row ⇒ 0). What the customer currently owes on credit. Goes UP on grant, DOWN on settle. **Never negative** (a settle clamps at 0).
- **`available_credit_thb`** = `credit_limit_thb − outstanding_thb`. May be displayed negative only if a data anomaly pushed outstanding past limit (the grant gate prevents this going forward); the UI shows it red but does not block reads.
- **`credit_terms_days`** ← the legacy used `tb_forwarder.fcreditdate` (a per-order due date), not a global "terms days". There is **no global terms-days column on the legacy customer**. → The credit panel drops the "terms days" chip OR sources it from `business_config` as a display default (owner's call, D-5). The per-grant due date stays on `tb_forwarder.fcreditdate` as today.

### D-3 — The READ: rewrite `getMyCredit()` onto the legacy columns

`actions/credit.ts::getMyCredit()` changes from "read `v_customer_credit_outstanding` by `profile_id`" to:

1. Resolve the caller's `member_code` (PR-code) from their profile (the same join key `wallet-credit/page.tsx` already uses: `tb_*.userid === profile.member_code`).
2. `SELECT userCreditValue FROM tb_users WHERE userID = member_code` → `credit_limit_thb`.
3. `SELECT creditvalue FROM tb_credit WHERE userid = member_code` (maybeSingle, missing ⇒ 0) → `outstanding_thb`.
4. Return `{ credit_limit_thb, outstanding_thb, available_credit_thb: limit − outstanding, credit_terms_days }`.

The `CustomerCreditState` shape is unchanged, so `credit-panel.tsx` keeps working — it just receives real numbers and the panel stops returning `null` for the 24 customers. (The two surfaces — `/wallet/history` panel and the standalone `/wallet-credit` page — now agree, both reading the legacy columns.)

> **De-dup note:** with both surfaces reading the same legacy columns, `wallet-credit/page.tsx` and the `credit-panel.tsx` are redundant reads of the same data. Keep both (each has a distinct entry point), but they should share one read helper (`getMyCredit`) so there is one query shape — the page should call the action rather than re-querying inline. Minor, do it in the same change.

### D-4 — The SETTLE: choose the faithful model, drop the dead standalone paydown

The legacy settles credit **by paying the credited order**, not by a generic "pay my balance". Two options for the customer "ชำระยอดค้างเครดิต" button that `credit-panel.tsx` currently renders:

- **D-4a (recommended) — keep a standalone wallet→credit paydown, but write the LEGACY columns.** Rewrite `customerPayCreditFromWallet` to: pre-check `tb_wallet.wallettotal >= amount` (the ADR-0018 available-balance helper, pending-aware), then in one logical unit: (1) `tb_wallet.wallettotal −= amount` + INSERT a `tb_wallet_hs` settle row (`type` per the matrix — a credit-settle is a wallet debit; use the legacy "ชำระเงินเครดิต" convention — see open question D-5 #2 — with `wusercredit='1'` so it lands in the credit-history tab), (2) `tb_credit.creditvalue −= amount` (UPSERT, clamp at 0). Idempotent: anchor on the inserted `tb_wallet_hs.id`; on retry re-SELECT and return `alreadyDone`. Rollback on partial failure (delete the inserted hs row + restore balance), per the ADR-0018 "action owns the rollback" pattern (PostgREST has no real tx). This preserves the convenience feature (which is a genuine Pacred improvement over legacy) **on the correct columns**.
- **D-4b (strict-faithful) — drop the standalone paydown entirely** and let credit settle only through paying the credited forwarder (the existing `wallet-hs.ts` decrement on slip-approve). Then `credit-panel.tsx` shows the balance read-only with a "ชำระโดยจ่ายรายการที่ติดเครดิต" link to `/service-import?q=c` (exactly what `wallet-credit/page.tsx` already does at its "ชำระเงินเครดิต" button). `customerPayCreditFromWallet` is deleted.

**Recommendation: D-4a.** It keeps a useful customer-facing feature, costs ~one action rewrite, and is money-safe with the same idempotency/rollback discipline ADR-0018 already established. D-4b is cleaner/faithful-er but removes a real convenience; pick it only if the owner wants zero Pacred-additions on the credit lane. **Either way the dead `wallet_transactions`-backed body must go** — the only question is whether its replacement is a legacy-column paydown (4a) or nothing (4b).

### D-5 — Exact code changes (the fix-list)

**Repoint (3 surfaces onto legacy columns):**
1. `actions/credit.ts::getMyCredit` — rewrite per D-3 (read `tb_users.userCreditValue` + `tb_credit.creditvalue` by member_code; drop the `v_customer_credit_outstanding` read).
2. `actions/credit.ts::customerPayCreditFromWallet` — rewrite per **D-4a** (debit `tb_wallet`/`tb_wallet_hs`, decrement `tb_credit.creditvalue`, idempotent, rollback) **or delete per D-4b**.
3. `app/[locale]/(protected)/wallet-credit/page.tsx` — call `getMyCredit()` instead of the inline `tb_users`/`tb_credit` queries (de-dup; same numbers, one query shape).

**Repoint the two admin credit actions (they write the dead model today):**
4. `actions/admin/credit.ts::adminSetCustomerCreditLimit` — write `tb_users.userCreditValue` (the limit) instead of `profiles.credit_limit/credit_enabled`. (Resolve `profile_id → member_code` first; `userCreditValue>0` is the "enabled" signal — no separate boolean needed.)
5. `actions/admin/credit.ts::adminChargeToCredit` — either repoint to the legacy grant model (UPSERT `tb_credit.creditvalue += amount`, gate on `userCreditValue` headroom — i.e. converge with `adminMarkForwarderCredit`) **or** mark it deprecated in favour of `adminMarkForwarderCredit` (the real, reachable grant path) and remove it. Recommended: deprecate `adminChargeToCredit` — the live, faithful grant is `adminMarkForwarderCredit`; a second generic "charge to credit" on the dead model is a re-route landmine.

**Freeze / retire (follow-up, not a blocker):**
6. Mark `v_customer_credit_outstanding` (view), the `wallet_transactions bucket='credit'` slice, and the credit branch of the `0064` overdraw guard as frozen; drop in a later cleanup migration once #1/#2/#4/#5 land and no reader remains.

**Owner decisions captured (do not silently pick):**
- **D-5 #1 — `credit_terms_days`:** there is no legacy global terms-days column. Drop the chip, or read a `business_config` default for display? (Recommend: read `business_config` default for display only; the binding due date stays per-order on `fcreditdate`.)
- **D-5 #2 — the `tb_wallet_hs` `type` for a standalone credit paydown (D-4a):** the legacy has no exact precedent (it never had this flow). Use `wusercredit='1'` + a `type` chosen to read correctly in the credit-history tab (`type='5'` คืนเงิน reads green; a paydown is a debit so likely a new convention) — **verify against the `load_wallet_hs.php` `type='c'` filter + the `nameWallet()` map before writing** (do not guess; the wrong type makes the row mislabel or hide). If D-4b is chosen this question is moot.
- **D-5 #3 — keep `customerPayCreditFromWallet` (4a) or drop it (4b)?**

### D-6 — Reachability (AGENTS.md §0d)

Both customer entry points already exist and are reachable: the standalone `/wallet-credit` page (sidebar "กระเป๋าสตางค์เครดิต") and the `credit-panel.tsx` on `/wallet/history`. The admin limit-set lives on `/admin/customers/[id]`; the grant on `/admin/forwarders/[fNo]`. The fix is a repoint — no new nav needed — but the change MUST verify (click-through, §0c) that the 24 real `tb_credit>0` customers now see their balance on both surfaces.

---

## Consequences

**Positive:**
- 24 real customers immediately see + (D-4a) can pay their real credit balance. The dead-feature-on-real-money is closed.
- One SOT for credit (limit = `userCreditValue`, outstanding = `tb_credit.creditvalue`); the live grant/settle already speak it, so no drift.
- Converges the two admin grant paths (`adminChargeToCredit` deprecated in favour of the faithful `adminMarkForwarderCredit`).

**Negative / risks (mitigated):**
- **Casing trap:** `tb_users` is camelCase (`userCreditValue`, `userCompany`); `tb_credit` is lowercase (`userid`, `creditvalue`). The repoint must quote/select the exact cases (the existing live code already does — copy its column strings).
- **Missing `tb_credit` row = 0, write = UPSERT:** never UPDATE-only (the 76/8,898 reality). `adminMarkForwarderCredit` already UPSERTs; the settle path must too.
- **Money-safety on D-4a:** the standalone paydown moves real money — it MUST carry the ADR-0018 idempotency + rollback discipline (anchor on inserted hs id; restore balance + delete hs row on partial failure). A half-state (balance debited but `creditvalue` not decremented, or vice versa) is worse than the current dead state.
- **Profiles columns become orphaned:** `profiles.credit_limit/credit_days/credit_enabled` stop being read. Leave them in place (harmless) and drop in the retire migration; do NOT delete in this change.

**Does NOT change:**
- ADR-0018 wallet SOT (`tb_wallet`/`tb_wallet_hs`) — credit is a separate concern; this ADR only touches the credit columns + the wallet debit leg of a paydown.
- The forwarder credit-out grant (`adminMarkForwarderCredit`) — already faithful; it is the reference implementation this ADR repoints the others toward.

---

## Alternatives considered

- **A — Repoint everything to the legacy `tb_credit`/`userCreditValue` model (chosen).** Matches the already-live grant + read + settle; least work; no drift; faithful (D1).
- **B — Keep the rebuilt model + backfill it from `tb_credit`.** Rejected: creates a second writable SOT the legacy grant doesn't update → guaranteed drift; requires rewriting three already-faithful surfaces backward; migrates 24 balances for no gain.
- **C — Hybrid (read legacy, keep rebuilt for Pacred-native credit).** Rejected: the feature already has one faithful home; a hybrid just re-introduces the split-brain.
- **D — Delete the credit feature entirely.** Rejected: 24 real customers have live credit balances; the feature is in active use on the legacy plane.
