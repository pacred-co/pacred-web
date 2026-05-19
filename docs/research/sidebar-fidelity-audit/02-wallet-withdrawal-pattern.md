# 02 — Wallet + withdrawal menu pattern: split vs filter

Last reviewed: 2026-05-19 · D1 Phase-B fidelity audit · audited from `dave`-synced worktree (read-only).

**Question:** Pacred currently splits "wallet" and "withdrawal-list" into two top-level sidebar groups. Should each `รายการเบิกเงิน` sub-item be a **separate page** (split) or a **filter on a shared page** (`?kind=X`)? Which matches legacy?

**Short answer:** legacy is **already split at the menu** — six sub-items, six different PHP files, six different DB tables. Pacred's current shape (one menu, items point at different existing pages with `?kind=` discriminators for shared pages) is the *right concept*, but the `?kind=` values are wrong — they don't match the destination pages' filter vocabularies and the links are dead. Fix the values, don't restructure.

---

## 1. Legacy structure (per `docs/research/d1-fidelity-admin.md`)

Two **separate** OOP menu blocks, in two different navigation-headers:

### 1.1 `OOP/Cargo/menu-wallet.php` — กระเป๋าสตางค์ (under header "Cargo")

| Legacy menu item     | Legacy file                  | Underlying table |
|---|---|---|
| เป๋าตังทั้งหมด        | `wallet/`                    | `tb_wallet` (all kinds, all statuses)            |
| จ่ายแทนลูกค้า         | `pay-users.php`              | `tb_wallet` (kind=payment, staff-initiated)      |
| ประวัติรายการ          | `wallet/history/`            | `tb_wallet` (completed only)                     |
| รายการถอนเงิน ③       | `wallet/withdraw/`           | `tb_wallet_withdraw` (pending count = badge)     |
| รายการเติมเงิน ③       | `wallet/deposit/`            | `tb_wallet_topup` (pending count = badge)        |
| เพิ่มรายการเติมเงิน    | `wallet/add/`                | `tb_wallet_topup` insert                          |

### 1.2 `OOP/CargoAndFreight/menu-withdrawal-list.php` — รายการเบิกเงิน (under header "Cargo & Freight")

Per `d1-fidelity-admin.md:122` and the i18n keys at `messages/th.json:2568`:

| Legacy menu item        | Legacy file (PHP)                   | Underlying table          |
|---|---|---|
| PCS Freight             | `forwarder-sales`/`acc-freight-*`   | `tb_forwarder_*`          |
| ↳ เบิกเงินค่าสินค้า ③    | `acc-shop-refund.php` (payouts)     | `tb_sale_*` shop-goods    |
| ↳ ค่าตู้สินค้า ③          | `acc-system-cargo`/`tb_cnt`         | `tb_cnt` disbursements    |
| ↳ ค่าขนส่งไทย             | `acc-forwarder.php` (TH leg)        | `tb_forwarder_truck`      |
| ↳ รายงานลูกค้าตัวแทน      | `user-history.php` (agent CST view) | `tb_user`                 |
| ↳ โบนัสเซลล์ ③            | `withdraw-commission-sales`         | `tb_sales_commission`     |
| ↳ โบนัสล่ามจีน ③          | `withdraw-commission-interpreter`   | `tb_inter_commission`     |
| ↳ พนักงานขับรถ            | `report-driver*.php`                | `tb_driver_run`           |

**Pattern:** legacy keeps these as one menu but each sub-row navigates to a **distinct PHP file** writing to a **distinct table**. It is *not* one page that internally filters; it is a navigation tree where the menu groups conceptually-related queues that happen to live in different modules.

---

## 2. Current Pacred structure (per `lib/admin/sidebar-menu.ts`)

Two blocks today — both faithful in *shape*:

`blockWallet` (lines 93-106) — 6 children matching the legacy 6 wallet items.

`blockWithdrawalList` (lines 343-365) — 1 nested PCS-Cargo group with 7 children matching the 7 legacy รายการเบิกเงิน sub-items, plus a PCS-Freight leaf.

**Live routes today:**

| Pacred sidebar `href`                                       | Page exists?                          | How it handles filter                                                                       |
|---|---|---|
| `/admin/wallet`                                             | ✅ `app/[locale]/(admin)/admin/wallet/page.tsx`           | Reads `?kind=` + `?status=`, filters `wallet_transactions` (chips inline)                   |
| `/admin/wallet/pay-user`                                    | ❌ none                                | —                                                                                            |
| `/admin/wallet/history`                                     | ❌ none                                | —                                                                                            |
| `/admin/withdrawals`                                        | ✅ but stub — `redirect("/admin/wallet?kind=withdraw&status=pending")` | Just bounces                                                                                 |
| `/admin/wallet/deposit`                                     | ✅ but stub — `redirect("/admin/wallet")`                | Just bounces                                                                                 |
| `/admin/wallet/add`                                         | ❌ none                                | —                                                                                            |
| `/admin/sales-payouts?kind=shop-goods` (เบิกค่าสินค้า)        | ✅ `/admin/sales-payouts/page.tsx`     | **Only reads `?status=`** — silently ignores `?kind=`. Renders ALL sales_payouts rows.       |
| `/admin/accounting/disbursements?kind=container` (ค่าตู้)     | ✅ `/admin/accounting/disbursements/page.tsx` | Reads `?kind=` but **enum is `freight\|customs_duty\|handling\|fuel\|storage\|trucking\|other`** (per migration `0069` line 139-147). `container` is not a value → query returns 0 rows. |
| `/admin/accounting/disbursements?kind=thai-freight`         | ✅ same page                           | Same problem — `thai-freight` not in enum → 0 rows.                                          |
| `/admin/reports/user-sales-history` (ลูกค้าตัวแทน)             | ✅                                     | Different page entirely (per-customer report).                                               |
| `/admin/sales-payouts` (โบนัสเซลล์)                            | ✅                                     | Renders ALL rows — collides with #1 because no `?kind`.                                      |
| `/admin/commissions` (โบนัสล่าม)                                | ✅                                     | Renders ALL rows — same collision risk if it ever gets `?kind`.                              |
| `/admin/driver-runs` (พนักงานขับรถ)                            | ✅                                     | Different page entirely.                                                                     |
| `/admin/forwarder-sales` (PCS Freight)                       | ✅                                     | Different page entirely.                                                                     |

---

## 3. The fidelity gap

| Legacy menu item               | Legacy page                          | Pacred sidebar today              | Route works?                  | Gap                                                  |
|---|---|---|---|---|
| เป๋าตังทั้งหมด                | `wallet/`                            | `/admin/wallet`                   | ✅ all OK                     | —                                                    |
| จ่ายแทนลูกค้า                  | `pay-users.php`                      | `/admin/wallet/pay-user`          | ❌ page missing                | 🔴 build (port `pay-users.php`)                       |
| ประวัติรายการ                   | `wallet/history/`                    | `/admin/wallet/history`           | ❌ page missing                | 🟠 build (or alias to `/admin/wallet?status=completed`)|
| รายการถอนเงิน ③                | `wallet/withdraw/`                   | `/admin/withdrawals`              | 🟡 redirects to `?kind=withdraw&status=pending` filter | 🟡 OK if we accept filter-on-shared; badge missing    |
| รายการเติมเงิน ③                | `wallet/deposit/`                    | `/admin/wallet/deposit`           | 🟡 redirects to `/admin/wallet` (loses filter!) | 🔴 redirect drops `?kind=deposit&status=pending` filter — user lands on unfiltered view |
| เพิ่มรายการเติมเงิน             | `wallet/add/`                        | `/admin/wallet/add`               | ❌ page missing                | 🟠 build (admin "add topup on behalf" form)          |
| เบิกค่าสินค้า ③                 | `acc-shop-refund.php`                | `…/sales-payouts?kind=shop-goods` | ❌ filter ignored              | 🔴 `?kind=` not honored — wrong rows shown            |
| ค่าตู้สินค้า ③                   | `tb_cnt` payments                    | `…/disbursements?kind=container`  | ❌ wrong enum value            | 🔴 0 rows shown — `container` ∉ enum                  |
| ค่าขนส่งไทย                     | `acc-forwarder.php` TH               | `…/disbursements?kind=thai-freight` | ❌ wrong enum value          | 🔴 0 rows shown — `thai-freight` ∉ enum               |
| รายงานลูกค้าตัวแทน              | `user-history.php`                   | `/admin/reports/user-sales-history` | ✅ partial                    | 🟡 verify the "agent" lens exists                     |
| โบนัสเซลล์ ③                    | `withdraw-commission-sales`          | `/admin/sales-payouts`            | 🟡 mixes with shop-goods       | 🟠 needs `?kind=` discriminator OR split              |
| โบนัสล่ามจีน ③                  | `withdraw-commission-interpreter`    | `/admin/commissions`              | ✅ dedicated                   | —                                                    |
| พนักงานขับรถ                    | `report-driver*.php`                 | `/admin/driver-runs`              | ✅ dedicated                   | —                                                    |
| PCS Freight                     | `forwarder-sales`                    | `/admin/forwarder-sales`          | ✅ dedicated                   | —                                                    |

**Summary:** 5 routes 🔴 broken (wrong filter contract), 3 routes 🟠 missing pages, 4 routes ✅ fine.

---

## 4. Decision — split vs filter

**Recommendation: Option C (hybrid) — keep legacy menu shape as it is, fix the broken `?kind=` contracts, build the 3 missing pages.**

### Option scoring

| Option | Zero-retraining | Build effort | Maintain | Faithful-port purity |
|---|---|---|---|---|
| **A — Split everything** (separate route per sidebar row, even where one DB table covers many rows) | ⚠️ same UX | 🔴 high (~9 new routes) | ⚠️ duplication | 🟢 closest URL-fidelity to legacy 1-PHP-file-per-link |
| **B — Filter-only on `/admin/wallet`** (every wallet & withdrawal link is `/admin/wallet?kind=X`) | ⚠️ same UX | 🟢 low | 🟢 single page | 🔴 wrong — withdrawal-list items live in different tables (sales_payouts, container_disbursements, commissions, driver-runs) — can't share one page |
| **C — Hybrid (CURRENT shape, fixed contracts)** | 🟢 same UX | 🟡 medium (fix 5 filter wires + build 3 small pages) | 🟢 each page owns its own table query | 🟢 mirrors legacy (one menu, many backend modules) |

**Why C wins:**
1. **Legacy is already hybrid.** `menu-withdrawal-list.php` collects six links that each open a *different* PHP file writing a *different* table. There is no single "withdrawals" PHP — the menu just groups them. So Option B (one shared filtered page) actively *breaks fidelity* — it'd merge data that legacy keeps separate.
2. **Within one table, the legacy queues are filter views.** Within `tb_wallet`, the items "ทั้งหมด · ประวัติ · เติม · ถอน" are all the same table with different `WHERE` clauses. That's already a filter-on-shared, which Pacred replicates correctly on `/admin/wallet?kind=…`.
3. **Same precedent elsewhere in Pacred:** `/admin/board?waiting=…` (board page already uses filter-on-shared) — so Pacred has consensus on filter-where-table-is-shared. And `/admin/orders/shop` vs `/admin/orders/import` (split-where-tables-differ) — same logic, different table, different route.
4. **Owner rule:** "copy original to 100% sameness FIRST." Current shape is *already faithful in shape* — it just has broken wires. Restructuring would burn 2x the effort for the same UX.

---

## 5. Concrete fix plan

### 5.1 Fix the 5 🔴 broken wires (small, do first)

**a) `/admin/wallet/deposit` redirect drops the filter.** Edit `app/[locale]/(admin)/admin/wallet/deposit/page.tsx`:
```ts
redirect("/admin/wallet?kind=deposit&status=pending"); // was: redirect("/admin/wallet")
```

**b) `/admin/sales-payouts` ignores `?kind=`.** Edit `app/[locale]/(admin)/admin/sales-payouts/page.tsx`:
   - Extend `SP` to include `kind?: "shop-goods" | "sales-bonus"`.
   - Distinguish: `?kind=shop-goods` (เบิกค่าสินค้า — payout of customer goods value) vs `?kind=sales-bonus` (default — commission bonus). Either filter by a new `payout_kind` column on `sales_payouts` OR split into two queries against different source tables. **ภูม decides** based on whether `sales_payouts` already distinguishes these two — if not, this needs a migration adding the column.

**c) `/admin/accounting/disbursements` enum missing `container` + `thai-freight`.** Two paths:
   - **Simpler:** rewrite the sidebar `href`s to use existing enum values — `?kind=trucking` (for ค่าขนส่งไทย) and a new `?kind=container` once added.
   - **More faithful:** extend the enum in `supabase/migrations/00NN_disbursement_kinds_extension.sql` to add `'container_lease'` and re-tag sidebar to `?kind=container_lease`. Then `?kind=trucking` for thai-freight (already in enum — line 145 says "domestic THB trucking").
   - **ภูม picks** — adding `container_lease` is the more honest fit since "ค่าตู้" ≠ trucking semantically.

**d) Sidebar link `/admin/wallet/pay-user` is 404.** Add the redirect-only page first to avoid the dead link:
```ts
// app/[locale]/(admin)/admin/wallet/pay-user/page.tsx
import { redirect } from "next/navigation";
export default function PayUserPage() { redirect("/admin/payment"); } // until ported
```
Then build the real `pay-users.php` port as a separate Phase-B slice.

**e) Add the `?kind=shop-goods`/`sales-bonus` discriminator filter chips** to `/admin/sales-payouts` so staff arriving from either menu item lands on the right pre-filtered view (mirrors how `/admin/wallet` shows `kind` chips today).

### 5.2 Build the 3 🟠 missing pages (own Phase-B slice each)

| New route                                  | Legacy source                | Skeleton                                                  |
|---|---|---|
| `app/[locale]/(admin)/admin/wallet/pay-user/page.tsx`  | `member/pcs-admin/include/pages/.../pay-users.php` | Staff-initiated "pay a service FROM customer wallet" — port the form (search customer → pick service → confirm → write `wallet_transactions` debit). |
| `app/[locale]/(admin)/admin/wallet/history/page.tsx`   | `wallet/history/`           | Wallet read-only history view — same query as `/admin/wallet` but force `?status=completed`. Could literally be `redirect("/admin/wallet?status=completed")` if pixel-fidelity is not needed yet. |
| `app/[locale]/(admin)/admin/wallet/add/page.tsx`       | `wallet/add/`               | Admin "create topup on behalf" form — same as customer `/wallet/deposit/new` but staff-side, writes `wallet_transactions` with `kind='deposit'`/`status='pending'` and triggers the slip-approval flow. |

### 5.3 Add the live-count badges (separate slice — d1-fidelity-admin §1.4)

Legacy shows ③ pills on `รายการถอนเงิน`, `รายการเติมเงิน`, `เบิกค่าสินค้า`, `ค่าตู้`, `โบนัสเซลล์`, `โบนัสล่าม`. Pacred already has `actions/admin/sidebar-counts.ts` — extend it with the 6 new counters and wire them into the existing `badge:` keys on the sidebar items (`walletWithdraw`, `walletTopup`, `shopPayout`, `cntDrawMoney`, `salesPayout`, `interpreterPayout`).

---

## 6. Precedent in Pacred

- **Filter-on-shared (precedent for Option B-within-one-table):**
   - `/admin/board?waiting=…&role=…&status=…&overdue=…` (`app/[locale]/(admin)/admin/board/page.tsx:58-118`) — one page, four filter dims, sidebar passes different combos.
   - `/admin/wallet?kind=…&status=…` (already implemented correctly).
   - `/admin/forwarders?q=6` / `?q=c` (lines 170-171 of sidebar) — three sidebar rows, one page.
   - `/admin/service-orders?q=1` (line 116) — pending filter.

- **Split (precedent for Option A-where-different-table):**
   - `/admin/orders/shop` vs `/admin/orders/import` vs `/admin/orders/transfer` — 3 separate pages because 3 different domain tables.
   - `/admin/freight/quotes` vs `/admin/freight/shipments` vs `/admin/freight/declarations` — separate tables → separate pages.
   - `/admin/sales-payouts` vs `/admin/commissions` vs `/admin/driver-runs` — already split today.

**Conclusion:** Pacred already consistently applies the rule "share-page-where-table-is-shared, split-where-table-is-different." The withdrawal-list sidebar honors that rule; only the 5 broken wires need a one-line fix each.

---

## Appendix — files referenced

- `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\lib\admin\sidebar-menu.ts` — lines 93-106 (wallet), 343-365 (withdrawal-list)
- `app/[locale]/(admin)/admin/wallet/page.tsx` — the working filter-on-shared example
- `app/[locale]/(admin)/admin/wallet/deposit/page.tsx` — stub redirect (drops filter — bug)
- `app/[locale]/(admin)/admin/withdrawals/page.tsx` — stub redirect (OK)
- `app/[locale]/(admin)/admin/accounting/disbursements/page.tsx` — kind enum at line 21-29; query at 72
- `app/[locale]/(admin)/admin/sales-payouts/page.tsx` — only `status` filter at line 38
- `supabase/migrations/0069_container_costs_disbursements.sql` line 139-147 — `kind` CHECK constraint
- `messages/th.json:2447-2454` (wallet) + `messages/th.json:2568-2581` (withdrawal) — i18n keys
- `docs/research/d1-fidelity-admin.md` — §1.1 row 122 + §8 wallet section + §1.4 badge gap
- `docs/briefs/poom.md` — owner rule: "copy original to 100% sameness FIRST, then improve"
