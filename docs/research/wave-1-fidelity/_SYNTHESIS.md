# Wave 1 Fidelity Audit — Synthesis (ภูม → เดฟ)

> **Audit run:** 2026-05-19 evening by ภูม via 4 parallel shadow-clone reviewers.
> **Sources:** the 4 per-slice audit docs in this folder (`audit-b{1,3,4,6}-*.md`).
> **Lens:** the D1 fidelity bar — owner's verbatim rule: *"copy the original to
> 100% sameness FIRST, then improve"* + the save-point-2026-05-19 §4 finding
> ("`B-0` is the missing layer").
>
> **TL;DR for เดฟ:** Wave 1 chrome is **good** — layouts / status enums /
> section IA are faithful 3-of-4 slices, the 4th (`B-6`) is genuinely faithful
> end-to-end. **The single blocker is data routing** — 3 of 4 slices read
> rebuilt-era tables (`profiles` · `service_orders` · `forwarders` · `wallet*`
> · `yuan_payments` · `cart_items`) where the migrated 8,898 customers have
> **zero rows**. A migrated PCS customer logs in (B-auth ✅) and sees a
> beautiful empty UI. **Wave 2 = B-0 data foundation** (re-point reads to
> `tb_*`), bundled with **B-2 status-vocab** (per Agent A — re-pointing without
> re-keying badge maps would break the recent-activity labels). ภูม recommends
> **ship Wave 1 chrome as-is, do not rebuild — queue B-0+B-2 as a bundled
> Wave 2 immediately**.

---

## 1. Verdict matrix

| Slice | Layout fidelity | Data fidelity (B-0) | Severity | Recommendation |
|---|---|---|---|---|
| **B-1** 9-icon launchpad | 🟢 EXCELLENT (icons · wallet card · sales-rep) | 🔴🔴 0 `tb_*` refs | 🔴 paradigm | Ship chrome · B-0 bundles fix |
| **B-3** customer order-flow | 🟢 strong (6 tabs + Thai labels + 151-cap + link-paste) | 🔴 0 `tb_*` refs (`service_orders` / `cart_items` instead of `tb_header_order` / `tb_cart`) | 🔴 paradigm | Same — B-0 bundles fix · +4 secondary gaps for Wave 2.1 |
| **B-4** admin RBAC sidebar+badges | 🟢 structure faithful (17 OOP blocks · 7 hand-assembled menus · 6 EN headers Cargo&Freight/Freight/Cargo/Settings/Learning/Extension) | 🔴 14 of 14 badge queries hit rebuilt-era | 🔴 paradigm (badges = 0 = lose work radar) | Same — B-0 bundles fix · 1 stale `cnt = 0` line ภูม patches now |
| **B-6** `tb_cnt` container payments | 🟢 reads all 4 legacy tables + faithful fan-out + `report-cnt.php` loop | 🟢 ALL `tb_*` (the exception) | 🟡 ship-as-is + 2 plumbing | Ship · ภูม patches 2 trivial menu issues |

**The pattern is striking:** the slice ภูม's save-point already flagged as
faithful (`B-6`) IS faithful end-to-end (Agent D confirms). The 3 flagged-as-
gap slices ARE the same kind of gap (data routing, not architecture).

---

## 2. The B-0 fix — what Wave 2 must do

Per Agent A's concrete swap list (verified vs `0081_pcs_legacy_schema.sql`),
the canonical re-pointings for the 3 affected slices:

| Rebuilt-era → Legacy (`tb_*`) | Used by |
|---|---|
| `profiles` (joined to `wallet`) → **`tb_users`** + **`tb_wallet`** | B-1 wallet card · B-1 sales-rep · B-4 customers count |
| `service_orders` (status enum strings) → **`tb_header_order`** (`hStatus tinyint(4)` 1-6) | B-1 recent activity · B-3 list · B-4 order-stage badges |
| `service_order_items` / `cart_items` → **`tb_cart`** + **`tb_header_order_item`** | B-3 cart + per-order line items |
| `forwarders` (rebuilt status enum) → **`tb_forwarder`** (`fStatus` 1-7 + `fStatusCarOn/Off`) | B-1 forwarder count · B-4 forwarder stage badges |
| `yuan_payments` → **`tb_payment`** | B-1 recent activity · B-4 yuan-payment badges |
| `wallet_transactions` → **`tb_deposit`** + **`tb_withdraw_*`** | B-4 deposit/withdraw badges |
| `commissions` / `sales_payouts` → (TBD — check legacy `tb_commission*`) | B-4 sales-rep badges |
| `refund_requests` → (TBD — check legacy `tb_refund*` if exists) | B-4 refund badge |

**Pairing requirement (Agent A's call):** B-0 re-points the data reads · B-2
re-keys the status vocabularies (rebuilt-era enum strings → legacy integer
codes). They MUST land together — re-pointing reads without re-keying badge
maps will mis-label `hStatus=3` ("สั่งสินค้า") as a string the badge query
doesn't know about, so the recent-activity strip would render the wrong
Thai labels.

---

## 3. Secondary findings (Wave 2.1 — not blocking the B-0 swap)

### B-3 sub-gaps (Agent B)
- **Address selector** — edits the prefilled default address instead of letting customer SWITCH to a saved address from `tb_user_address`. Legacy has a saved-addresses picker.
- **Sticky pay bar** gated to single-row — no bulk pay (legacy lets you bulk-pay multiple `hStatus=2` orders).
- **`tb_shop` master missing** — `shop_name` is free-text instead of FK to `tb_shop`. Legacy has a curated shop list.
- **Status column type mismatch** — `hStatus tinyint(4)` in `tb_header_order` vs text-enum reads in Pacred actions (the B-2 reconcile fixes this).

### B-6 sticky-fixes (Agent D — ภูม can patch in 10 min)
1. **Sidebar entry on agent worktree, not `dave`** — commit `71f4737` (add `/admin/accounting/container-payments` to sidebar) only lives on the worktree branch, never merged to `dave`. Result: page reachable only by URL — no menu link. Fix: merge or re-commit on `dave`.
2. **`sidebar-counts.ts` L119** hard-codes `const cnt = 0` → legacy `cnt-hs ⑤` unpaid-badge never lights. The actual query is already inside `listPcsContainerPayments` L109-112 — one lift fixes it.

### B-4 stale comment (Agent C)
- `cntDrawMoney = 0` comment says "tb_cnt not yet ported" but B-6 shipped the ledger this wave. One-line cleanup.

---

## 4. Recommendation to เดฟ — concrete next-wave brief

**Send-back package:**

> เดฟ — Wave 1 fidelity audit done (`docs/research/wave-1-fidelity/`).
> Chrome verdict: **3/4 ship-as-is**, do not rebuild — layouts/IA/section
> headers are faithful. The 4th (`B-6` container payments) is the gold
> standard — fully `tb_*`-backed.
>
> **The single common blocker** — 3 of 4 slices (B-1 launchpad · B-3 order
> flow · B-4 admin badges) read the rebuilt-era schema where the 8,898
> migrated customers have zero rows. A migrated PCS customer logs in via
> B-auth ✅ and sees a beautiful empty UI.
>
> **Asks for Wave 2:**
>
> 1. **B-0 + B-2 bundled as one wave** (re-point + re-key together, per Agent A
>    — splitting them would break badge labels mid-wave). Concrete swap list
>    in `_SYNTHESIS.md` §2.
> 2. **Sequencing:** B-0+B-2 swap → re-verify each of B-1/B-3/B-4 vs the
>    migrated data → then Wave 3 attacks B-5 (ship→arrive→THEN-pay forwarder)
>    + B-7..B-9 with the data foundation already in place.
> 3. **Hold B-6** — don't touch, it's faithful. Just fix the 2 menu-plumbing
>    stickies (sidebar link + the hardcoded `cnt = 0` badge lift) — ภูม will
>    patch those himself.
> 4. **Secondary B-3 gaps** (address selector · bulk pay · `tb_shop` master ·
>    status column type) — schedule for Wave 2.1, not blocking.

**For ก๊อต — still hanging:** Q2 auth-bridge posture ratification (B-auth is
provisional). Ping when ready.

---

## 5. What ภูม does next (this session)

1. **Patch B-6 plumbing** (10-min fixes) — lift the `sidebar-counts.ts` L119 hardcode + the B-4 stale comment. Do NOT touch the B-1/B-3/B-4 data-source issues (that's เดฟ's B-0 wave).
2. **Push this synthesis + the 4 audits** so เดฟ sees them.
3. **LINE-ping เดฟ** with the §4 summary so the next wave starts informed.
4. Optional: smoke-test on `http://localhost:3000` — log in as a migrated PCS customer (B-auth) and visually confirm the empty-UI symptom on `/dashboard` + `/service-order` + `/admin/board` (validates the audit findings on real dev data).

---

## 6. Cross-references

- 🧭 D1 ADR → [`../../decisions/0017-pacred-faithful-pcs-port.md`](../../decisions/0017-pacred-faithful-pcs-port.md)
- 🚀 Phase plan → [`../../UPGRADE_PLAN.md`](../../UPGRADE_PLAN.md)
- 🗺 Gap maps → [`../d1-phase-b-gap-map.md`](../d1-phase-b-gap-map.md) · [`../d1-fidelity-admin.md`](../d1-fidelity-admin.md) · [`../d1-fidelity-customer.md`](../d1-fidelity-customer.md) · [`../d1-fidelity-workflow.md`](../d1-fidelity-workflow.md)
- 📝 ภูม save-point that started this → [`../poom-save-point-2026-05-19.md`](../poom-save-point-2026-05-19.md) §4 "Wave 1 — landed on dave"
- ❓ Open questions (Q2 pending ก๊อต) → [`../poom-d1-open-questions.md`](../poom-d1-open-questions.md)
- 📂 Per-slice audits → `audit-b1-launchpad.md` · `audit-b3-order-flow.md` · `audit-b4-admin-sidebar.md` · `audit-b6-container-payments.md`
