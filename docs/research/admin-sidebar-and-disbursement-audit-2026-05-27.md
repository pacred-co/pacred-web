# Admin sidebar + disbursement audit — 2026-05-27

> Agent M · READ-ONLY pass on `Poom-pacred@05ce7a8`. ภูม flagged: (1) missing
> sidebar icons (notably "รายการเบิกเงิน") and (2) "รายการเบิกเงิน" sub-pages
> "เพี้ยน" (deviate from Pacred design).

## TL;DR

**Root cause of the missing icons is a single bug:** the icon-name string
registry in `components/sections/admin-sidebar.tsx` L88-98 (`ICONS`) is missing
**4 lucide names** that `lib/admin/sidebar-menu.ts` references. Whenever a
menu item carries one of those names, `Icon` renders a blank 18×18 spacer
(`return <span className="w-[18px] h-[18px] shrink-0" />` L102) — the row
looks iconless. The "รายการเบิกเงิน" parent + all its Cargo children are
the most visible victims because they all use `Banknote`.

**Disbursement drift:** 8 surfaces under "รายการเบิกเงิน" — 5 use modern
Pacred Tailwind chrome (consistent), 2 are tombstones with Bootstrap
`.pcs-legacy` chrome that diverges, and 1 (`cnt-hs`) is a deliberate
faithful-port using Bootstrap. The legacy parent has **9 leaf rows**, the
sidebar surfaces **8**; one leaf ("พนักงานขับรถ" sub of cargo) maps to
`/admin/driver-runs` but the legacy was a placeholder `href="#"` anyway.

---

## Part 1 — Sidebar icon audit

### The bug — icons referenced but NOT in the ICONS registry

Source of truth: `components/sections/admin-sidebar.tsx` L88-98 imports +
registers these lucide names. `Icon()` L100-104 returns an empty 18×18 span
when the name is unknown — visually identical to "no icon".

| Icon name | Used in `sidebar-menu.ts` line(s) | Affected menu items |
|---|---|---|
| **`Banknote`** | 416, 421, 437, 520, 707, 847 | 🔴 **`blockWithdrawalList` parent (รายการเบิกเงิน)**, `withdrawal.cargo` child, `withdrawal.freight` child, `blockExtWithdrawalsAll` (extension dup), `withdrawal.titleSales` (sales_admin dropdown), `withdrawal.titleSales` (sales) |
| **`KanbanSquare`** | 511 | `blockExtWorkboard` (`/admin/board`) |
| **`Smartphone`** | 597, 800 | super's "ดูงานคนขับ (มือถือ)" + driver's "งานวันนี้" leaf |
| **`Save`** | 489 | `blockExtHistory` (`/admin/audit`) — extension section |

Note: `lib/admin/sidebar-menu.ts` is a plain non-JSX module that holds
icon NAMES as strings — that file isn't broken; the registry in the
client component just never got these 4 names added.

### Items WITH icon (working)

Counted from `Grep` of `icon: "..."` in `sidebar-menu.ts`: **~120 usages**
across 25 distinct icon names — all 25 distinct names except the 4 above
ARE present in the ICONS registry. Examples that render correctly:
`LayoutDashboard`, `Package`, `Wallet`, `Users`, `Truck`, `Search`,
`ShoppingCart`, `BarChart3`, `Landmark`, `BellRing`, etc.

### Sidebar groups / parent rows

All section HEADERS render as plain TH/EN text (no icons by design — legacy
PCS does the same). Parent accordion rows that have children DO get icons
where one is set in `sidebar-menu.ts` — but a parent with `icon: "Banknote"`
silently renders blank too. **The "รายการเบิกเงิน" parent + the cargo
sub-parent are both affected** — that's the most visible bug (each takes
one full row in every accounting / sales_admin / sales / super menu).

---

## Part 2 — "รายการเบิกเงิน" / disbursement flow audit

Surfaces reachable from `blockWithdrawalList` (`sidebar-menu.ts` L414-439)
plus the closely-related `/admin/withdrawals` + `/admin/withdrawal/freight-th`
+ `/admin/accounting/disbursements` + `/admin/shop-payouts`.

### Per-surface scorecard

| Route | Source | Chrome | Header | Empty | Actions | Filters |
|---|---|---|---|---|---|---|
| `/admin/sales-payouts` (เบิกค่าสินค้า ?kind=shop-goods · โบนัสเซลล์) | `sales-payouts/page.tsx` | ✅ Tailwind (`p-6 lg:p-8`) | ⚠️ inline `<h1>` only (no `PageTopMenubar`) | ✅ "ไม่มีคำขอ" | ✅ `SalesPayoutActions` cell | ⚠️ chip strip (not menubar) — kind+status |
| `/admin/cnt-hs` (ค่าตู้สินค้า) | `cnt-hs/page.tsx` | ❌ `.pcs-legacy` Bootstrap | ✅ uses `<TopMenuReport>` (cluster-shared) + breadcrumb | ⚠️ depends on Bootstrap table empty state | ⚠️ READ-only — addPay deferred to detail pilot | ✅ status tabs `?q=1/2` |
| `/admin/withdrawal/freight-th` (ค่าขนส่งไทย) | `withdrawal/freight-th/page.tsx` | ❌ `.pcs-legacy` Bootstrap stub | ✅ breadcrumb (legacy style) | n/a (placeholder) | ❌ stub only | ❌ none — points to `/admin/accounting/disbursements?kind=trucking` |
| `/admin/reports/user-sales-history` (รายงานลูกค้าตัวแทน) | (not opened in this pass) | — | — | — | — | — |
| `/admin/sales-payouts` (default = โบนัสเซลล์) | same file as row 1 | same | same | same | same | same |
| `/admin/commissions` (โบนัสล่ามจีน) | `commissions/page.tsx` | ✅ Tailwind (`p-6 lg:p-8 max-w-6xl`) | ⚠️ inline `<h1>` (no `PageTopMenubar`) | ✅ "ไม่มีคำขอเบิก..." | ✅ row-level via `WithdrawalActionsClient` | ⚠️ chip strip (status only) |
| `/admin/driver-runs` (พนักงานขับรถ) | `driver-runs/page.tsx` | ✅ Tailwind | ⚠️ inline header | ✅ | ✅ `DriverActionButtons` | ⚠️ minimal |
| `/admin/forwarder-sales` (รายการเบิกเงิน → freight side) | `forwarder-sales/page.tsx` | ✅ Tailwind | ⚠️ inline | ✅ | ✅ leader picker + CSV | ✅ status + date + leader |
| `/admin/withdrawals` (extension dup) | `withdrawals/page.tsx` | ✅ — pure redirect to `/admin/wallet?kind=withdraw&status=pending` | n/a | n/a | n/a | n/a |
| `/admin/accounting/disbursements` | `accounting/disbursements/page.tsx` | ✅ Tailwind tombstone | ✅ inline | ✅ amber alert | ❌ tombstone — module deferred to Phase C | ❌ |
| `/admin/shop-payouts` (sibling of sales-payouts) | `shop-payouts/page.tsx` | ✅ Tailwind | ⚠️ inline | ✅ | ✅ `ShopPayoutActions` | ⚠️ chip strip |

Legend: ✅ Pacred-style consistent · ⚠️ inconsistent with the
hub-page pattern · ❌ legacy Bootstrap drift OR not implemented.

### Drift summary

**Two pages break Pacred design hard:**

1. **`/admin/withdrawal/freight-th`** — a `<div className="pcs-legacy">` +
   `card / card-body / alert alert-warning` Bootstrap layout. No
   `PageTopMenubar`, no Tailwind utilities, fonts inherit the legacy CSS.
   File comment admits "faithful 1:1 of `freight-th` will land in a
   follow-up port pilot" — so this is intentional but worth a Wave 21
   banner in the sidebar ("placeholder — pending port").
2. **`/admin/cnt-hs`** — a deliberate 1:1 transcription of `cnt-hs.php`
   per the comment block at L1-108. Uses `<link rel="stylesheet"
   href="/legacy/pcs/admin/admin-base.css">` + Bootstrap-4 markup. This
   is on-spec for the faithful-port lane but visually is the loudest
   drift inside the "รายการเบิกเงิน" cluster — staff click in and the
   chrome flips.

**5 surfaces are Pacred-style but inconsistent with each other:**
sales-payouts / commissions / driver-runs / forwarder-sales / shop-payouts
each have their own header shape (no shared `PageTopMenubar`, different
chip-strip patterns, slightly different status-badge color tokens —
amber-50 vs yellow-50, the SHADES). Not a bug, but a hub-page wrapper
would unify them.

### Legacy missing-features (per PHP cross-reference)

Source: `D:\REALSHITDATAPCS\pcsc\public_html\member\pcs-admin\include\pages\left-menu\OOP\CargoAndFreight\menu-withdrawal-list.php` (the canonical menu file).

The legacy parent **"รายการเบิกเงิน"** has TWO top-level branches Pacred
collapses into one:

- 🔴 **`PCS Freight` branch (legacy L4-10)** — Pacred sidebar exposes this only
  via `withdrawal.freight` leaf pointing at `/admin/forwarder-sales`. Legacy
  had two children: `report-shops-profit-pay.php` (ทำรายการเบิกเงิน) +
  `report-shops-profit-pay-history.php` (ประวัติการทำรายการ). **Both routes
  do NOT exist in Pacred** (no `app/.../report-shops-profit-pay*`).
  Pacred substitutes the forwarder-sales commissions page — DIFFERENT data
  source (`sales_commissions` table, not the legacy `tb_*` shop-profit-pay
  flow). This is a semantic gap, not just chrome.
- ⚠️ **"PCS Cargo" branch (legacy L11-60)** — the 6 cargo children DO have
  Pacred equivalents (some are stubs/Phase-2). Pacred adds nothing the legacy
  doesn't have, EXCEPT the parent badge `withdrawalAll` count is computed
  Pacred-side and not from legacy `($countDrawMoneyAll+$wcshS1+$wcihS1)`.
- ⚠️ **Per-sales-rep leaves** (legacy L39-42 — `THADAVIP / SINVIP / OOAEOMVIP
  / SWAN`) — Pacred dropped these in favour of generic `/admin/reports/user-sales-history`.
  Acceptable for one-company brief, but staff who used to click "OOAEOM.VIP"
  for the daily report have to filter manually now.
- ⚠️ **`withdraw-commission-sale.php` / `withdraw-commission-interpreter.php`**
  exist as standalone legacy pages (top-level `.php` files, not menu-only) —
  Pacred merges them into `/admin/sales-payouts` and `/admin/commissions`
  which is fine, BUT the legacy detail flow (`?page=detail&id=`) had a
  slip-upload form (`tb_withdraw_comm_sale_h.imagesSlip`) — Pacred's
  `commissions/[id]/withdrawal-actions-client.tsx` does cover this. ✅

---

## Part 3 — Cross-page consistency drift (5 random pages)

Checked: `/admin/customers`, `/admin/reports`, `/admin/accounting`,
`/admin/refunds`, `/admin/audit`, `/admin/board`.

| Page | PageTopMenubar | Status banner | Button style | Card grid | Layout |
|---|---|---|---|---|---|
| `/admin/customers` | ✅ `CUSTOMERS_MENUBAR` (4 items) | n/a | bg-primary-600 | n/a | hub |
| `/admin/reports` | ✅ `REPORTS_MENUBAR` | n/a | bg-primary-500 | ✅ quick-link cards | hub |
| `/admin/accounting` | ✅ `CARGO_MENUBAR` + `AccountingSegmentPills` | n/a | bg-primary-500 | ✅ `ACCOUNTING_HUB_CARDS` | hub |
| `/admin/refunds` | ❌ none — inline `<h1>` | n/a | (rendered in row actions) | n/a | list |
| `/admin/audit` | ❌ none — inline header | n/a | — | n/a | list |
| `/admin/board` | ❌ none — work-board specific | n/a | — | ✅ column-per-status | board |

Drift patterns:
- **Hub pages** (`customers`/`reports`/`accounting`) ALL use `PageTopMenubar` —
  good consistency.
- **List pages** (`refunds`/`audit`/`sales-payouts`/`commissions`/`shop-payouts`)
  use inline `<h1>` headers + per-page chip filters — **no shared component**.
  Each rolls its own chip strip with subtly different styling (some `rounded-full`,
  some `rounded-lg`, some `bg-primary-500`, some `bg-primary-600`).
- **Button color drift**: `bg-primary-500` (`accounting/disbursements` tombstone,
  `reports`, `sales-payouts` chips) vs `bg-primary-600` (`customers` actions,
  sidebar active state, `commissions` chips). Two shades of brand red in the
  same admin sweep — choose one and stick.
- **Status badge palette**: `bg-amber-50` (`commissions`, `refunds`) vs
  `bg-yellow-50` (`sales-payouts`, `shop-payouts`) for "pending" — both
  Pacred-style but they look subtly different next to each other.

---

## Suggested fixes (top 10)

| # | File | What's missing/wrong | Estimate |
|---|---|---|---|
| 1 | `components/sections/admin-sidebar.tsx` L26-36 + L88-98 | Add `Banknote, KanbanSquare, Smartphone, Save` to both the lucide import AND the `ICONS` map. Fixes 6+ blank icons including the รายการเบิกเงิน parent. | XS (5 min) |
| 2 | `app/[locale]/(admin)/admin/withdrawal/freight-th/page.tsx` | Rewrite chrome to Pacred Tailwind (drop `.pcs-legacy`, drop `card / card-body`, use the same `p-6 lg:p-8` shell as `sales-payouts`). Add a banner explaining the stub status. | S (1 h) |
| 3 | `app/[locale]/(admin)/admin/sales-payouts/page.tsx` + `commissions/page.tsx` + `shop-payouts/page.tsx` + `driver-runs/page.tsx` + `forwarder-sales/page.tsx` | Add a unified `WITHDRAWAL_MENUBAR` (the 6 cargo leaves from legacy) as `PageTopMenubar` so staff can hop between disbursement queues without scrolling the sidebar. Mirror the `/admin/customers` pattern. | M (3 h) |
| 4 | `lib/admin/sidebar-menu.ts` L414-439 | Wave 16 audit (CLAUDE.md §0b) — the legacy `PCS Freight` branch (`report-shops-profit-pay.php`) has no Pacred equivalent. Wire to a real page or banner the gap explicitly. | M (4 h — depends on Phase C scoping) |
| 5 | `components/sections/admin-sidebar.tsx` L100-104 | Make `Icon()` log a dev-only `console.warn` when a name is unknown — so the next time someone references `Stamp` or `Crown`, it surfaces in dev console instead of silently rendering blank. | XS (5 min) |
| 6 | `lib/admin/sidebar-menu.ts` L597 | Driver "mobile" leaf uses `Smartphone` icon — works only after fix #1. Sub-finding: super-only oversight of any driver is currently a top-level sidebar item (L592-597). Consider moving under a single "งานคนขับ" parent. | XS (5 min) |
| 7 | All status-badge maps (5+ files) | Standardize on one shade per status — pick `amber-50` (current `commissions`/`refunds`) or `yellow-50` (current `sales-payouts`/`shop-payouts`). Extract to `lib/admin/status-badges.ts`. | S (1 h) |
| 8 | `lib/admin/sidebar-menu.ts` L414 | `blockWithdrawalList` has TWO `withdrawal.cargo` sub-children with the SAME `Banknote` icon (parent L416 + child L421). After fix #1, both render the icon — consider differentiating the inner with `HandCoins` so the user reads them as parent + child. | XS (5 min) |
| 9 | `components/sections/admin-sidebar.tsx` L88-98 | Add a unit test (or runtime invariant): assert that every `icon` string referenced in `lib/admin/sidebar-menu.ts` exists in the `ICONS` registry. This bug class will recur otherwise. | S (1-2 h) |
| 10 | `app/[locale]/(admin)/admin/cnt-hs/page.tsx` L298 | Page is deliberate faithful-port Bootstrap — adds a "ภายใต้พัฒนา (faithful port)" banner OUTSIDE `.pcs-legacy` so staff arriving from Pacred chrome see the transition is intentional. | S (30 min) |

---

## Notes / loose ends

- Existing audit `docs/research/sidebar-pairing-audit-2026-05-20.md` covered
  ROUTE-LEVEL pairing (sidebar items pointing at wrong URLs). This audit
  is the next layer down — ICON registry + per-leaf chrome drift.
- The sidebar config split (NAMES in `sidebar-menu.ts`, REGISTRY in
  `admin-sidebar.tsx`) is intentional per L86-87 comment so the menu module
  stays JSX-free for SSR. But it means a quiet
  `(string) => undefined → blank-span` whenever a name is missed. Fix #5
  closes that observability gap.
- `withdrawalAll` badge key is fetched but `withdrawalAll` count math
  Pacred-side is at `actions/admin/sidebar-counts.ts` (not re-audited here).
- Nothing in this pass triggers a §0c bug (no DB error swallowing observed
  in the 8 disbursement files I read).
