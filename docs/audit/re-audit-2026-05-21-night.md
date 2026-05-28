# Re-audit — bugs / wrong-looking / orphan pages — 2026-05-21 night

**Author:** ภูม (Claude session on `claude/adoring-chandrasekhar-0f8ad7` · sibling of `Poom-pacred`)
**Trigger:** ภูม brief — *"รีเช็คเลยว่ามีอันไหนยังติด ยังบัค · มีอันไหนหน้ายังอยู่มั่ว มีอันไหนหน้ายังไม่มีทางเข้าไปหน้านั้นๆ"*
**Scope:** every `app/[locale]/(admin)/admin/**/page.tsx` route (145 files) + sidebar `lib/admin/sidebar-menu.ts` + every `<PageTopMenubar>` config + every dashboard tab link.
**Method:** 3 parallel agents (Chrome MCP browser-verify · entry-point mapping · button-wiring audit) + main-thread schema cross-reference.

> 🚨 **TL;DR — two cross-cutting findings dominated**:
> 1. **Five `/admin/dashboard` row-click 404 bugs** — most-clicked operator buttons (customer / service-order / yuan-payment / sales-payout row "ดู/แก้ไข" + the forwarder menubar "มอบงานคนขับ") all 404'd. All 5 **fixed in this session** (see §F).
> 2. **43 admin pages still query the rebuilt-schema tables** (`profiles` / `forwarders` / `service_orders` / `yuan_payments` / `wallet_transactions` / etc) which are empty on prod under D1 — the real customer + order + container data lives in the migrated legacy `tb_*` tables. Most legacy-port pages on staff's daily path now have a legacy fallback (added today); the rest are flagged P1/P2.

---

## A. P0 — Fixed tonight (5 broken row clicks)

| # | File:line | Symptom | Fix |
|---|---|---|---|
| 1 | `app/.../admin/forwarders/page.tsx` L61 | Menubar "งาน → มอบงานคนขับ" → `/admin/forwarders/drivers` (404) | Pointed at `/admin/drivers` |
| 2 | `app/.../admin/service-orders/[hNo]/page.tsx` L30 | `notFound()` on miss; rebuilt `service_orders` empty on prod → every dashboard "shop1/shop2/shop4" tab click 404 | Added `legacy-view.tsx` fallback reading `tb_header_order` |
| 3 | `app/.../admin/customers/[id]/page.tsx` L71 | `notFound()` on miss; list passes `r.userid` (legacy text `PR10691`) but page queries `profiles.id` (uuid) → every customer row 404 | Added `legacy-view.tsx` fallback reading `tb_users` + recent `tb_forwarder` / `tb_header_order` / `tb_payment` / `tb_wallet.wallettotal` |
| 4 | `app/.../admin/yuan-payments/[id]/page.tsx` (didn't exist) | Dashboard "payment" tab row link → 404 | Created — read-only view of `tb_payment` joined to `tb_users` w/ slip image |
| 5 | `app/.../admin/sales-payouts/[id]/page.tsx` (didn't exist) | Dashboard "payShop" tab row link → 404 | Created — read-only view of `sales_payouts` (Pacred-only; tab is empty on prod but the route now exists) |

---

## B. P1 — Bugs to fix this week (active surface, wrong schema)

### Schema-cross — high-visibility rebuilt-schema readers (still bugs)

| # | Route | Status | Action |
|---|---|---|---|
| 1 | `/admin/wallet` (list) | sidebar leaf · reads `wallet_transactions` (empty) | Two operators looking at the wallet from two angles see two different sets of pending approvals → rewrite to `tb_wallet_hs` (matches the dashboard + the wallet/[id] page we shipped today) |
| 2 | `/admin/reports/sales-by-rep` | in `REPORTS_MENUBAR` · reads `profiles.sales_admin_id` / `forwarders` / `service_orders` / `yuan_payments` | Rewrite to `tb_users.userid_sales` + tb_* aggregates, OR replace with "module under rework" placeholder |
| 3 | `/admin/reports/forwarder-volume` | in `REPORTS_MENUBAR` · reads `forwarders` | Rewrite to `tb_forwarder` group by `fwarehousename` / `ftypeservice` |
| 4 | `/admin/reports/user-sales-history` (+ `[customer_id]`) | in `REPORTS_MENUBAR` "ลูกค้า" · reads `profiles` / `forwarders` / `service_orders` | Daily-use; rewrite first |
| 5 | `/admin/customers/recently-active` | sidebar leaf · reads `profiles.last_seen` | Rewrite to `tb_users.lastlogindate` |
| 6 | `/admin/customers/transfer-rep` (+ `[id]/transfer-rep`) | sidebar leaf · reads `profiles.sales_admin_id` | Rewrite to `tb_users.userid_sales` |
| 7 | `/admin/customers/pending` | sidebar leaf · reads `profiles.status='pending'` | Rewrite to `tb_users.useractive='0'` (legacy approval queue) |
| 8 | `/admin/yuan-payments` (list) | sidebar leaf · reads rebuilt `yuan_payments` | Rewrite to `tb_payment` (the new `[id]` detail page already reads tb_payment) |
| 9 | `/admin/rates/custom-user` · `/admin/rates/custom-hs` | sidebar leaves · read rebuilt rate tables | Rewrite to `tb_priceuser_*` |
| 10 | `/admin/audit` · `/admin/settings/notifications` · `/admin/system/notifications` | sidebar leaves · read rebuilt | Verify per-page; mix is fine, but staff-facing must read tb_* |

### Minor wiring issues (Agent C report)

| # | File:line | Bug | Fix |
|---|---|---|---|
| 1 | `service-orders/page.tsx` L17–24 | `PURCHASING_MENUBAR` "สถานะ → รอดำเนินการ" uses `?q=1` but page reads `?status=...` (L40, L53) → chip is silent no-op | Swap menubar to `?status=...` |
| 2 | `report-cnt/page.tsx` L380 | Container code link adds `?id=` but page never reads `sp.id` → click is silent no-op | Either read `sp.id` (drill-in) or remove the link wrapper |
| 3 | `/admin` L132, L549–571 | `payShop` tab queries empty rebuilt `sales_payouts`; header note "TODO Phase C" — badge always 0 | Either retire tab or wire to `tb_user_sales_admin_pay` (Phase C) |

---

## C. P2 — Phase-C OK (Pacred-only features correctly use rebuilt schema)

No action needed; these are not bugs.

- `/admin/refunds` (+ `new`, `[id]`) — Pacred refund flow, no legacy equivalent
- `/admin/freight/declarations` · `/admin/freight/quotes` · `/admin/freight/shipments` — Pacred new freight stack
- `/admin/sales-payouts` (list) · `/admin/commissions` (+ `[id]`) · `/admin/team-leaders` — Pacred sales commission engine
- `/admin/kpi` — Pacred-only KPI dashboard
- `/admin/board` (+ `inbox`) — Pacred kanban
- `/admin/tax-invoices` (+ `[id]`) — Pacred tax-invoice flow
- `/admin/bookings` (+ `[bookingNo]`) — Pacred booking flow
- `/admin/contact-messages` — Pacred lead funnel
- `/admin/broadcasts` (+ `new`, `[id]`) — Pacred messaging
- `/admin/withdrawals` — Pacred unified withdraw view (redirects to wallet)
- `/admin/incidents` — Pacred incident triage
- `/admin/admins` (+ `[id]`) — Pacred admin-user manager
- `/admin/hr/*` (except `audit`) — Pacred HR rebuilt
- `/admin/learning` — Pacred learning hub
- `/admin/dashboard` — redirect to `/admin` (intentional)
- `/admin/migration/pcs-customers` — Phase-A one-shot migration tool

---

## D. Orphan pages — no UI entry point (10 confirmed by Agent B)

| Route | Suggested fix |
|---|---|
| `/admin/system/crons` | Wire under Settings menubar as "ระบบ → Cron jobs" |
| `/admin/system/notifications` | Same as above |
| `/admin/csv-imports` (+ `upload`, `[id]`) | Wire under Settings menubar as "ระบบ → Bulk import" |
| `/admin/migration/pcs-customers` | Acceptable as super-only utility (one-shot) — leave orphan |
| `/admin/organization-email` | Wire to Settings menubar OR delete (clarify with team) |
| `/admin/accounting/periods` (+ `[period_yyyymm]`) | Wire to `/admin/accounting/cargo` menubar "การบัญชี → งวด" |
| `/admin/accounting/reconcile` | Same — `/admin/accounting/cargo` menubar |
| `/admin/accounting/container-costs` | Wire under `/admin/forwarders` menubar "งาน" group |
| `/admin/forwarders/container-cost-check` | Same — `/admin/forwarders` "งาน" group |
| `/admin/refunds` (+ `new`, `[id]`) | **TRUE ORPHAN** — wire to Wallet menubar "จัดการ → คืนเงิน" or Accounting hub-cards |
| `/admin/reports/containers-hs` | No inbound link found — verify; wire to Reports menubar or delete |

### Tombstone redirects (intentional — verified)

- `/admin/dashboard` → `/admin`
- `/admin/inventory` → `/admin/barcode`
- `/admin/warehouse/containers` → `/admin/report-cnt` (Option C tombstone)
- `/admin/containers` → `/admin/warehouse/containers` → `/admin/report-cnt` (double-hop — works but consider collapsing)
- `/admin/containers/[id]` → `/admin/report-cnt`
- `/admin/withdrawals` → `/admin/wallet?kind=withdraw`
- `/admin/wallet/deposit` → `/admin/wallet?kind=deposit&status=pending`
- `/admin/wallet/pay-user` → `/admin/wallet?kind=order_payment`
- `/admin/yuan-payments/new` → `/admin/yuan-payments`
- `/admin/forwarders/new` → `/admin/forwarders`

### Dead chain (consider deleting)

- `/admin/containers/[id]/hs` — lives under the fully-tombstoned `/admin/containers` route; pre-spine-retirement file; likely safe to delete

---

## E. Browser-render verification

> *Agent A still running — results merged here when it completes.*

---

## F. Files changed in this session (5 P0 fixes shipped)

```
app/[locale]/(admin)/admin/forwarders/page.tsx                     — 1-char URL swap
app/[locale]/(admin)/admin/service-orders/[hNo]/page.tsx           — wire legacy fallback
app/[locale]/(admin)/admin/service-orders/[hNo]/legacy-view.tsx    — NEW (tb_header_order view)
app/[locale]/(admin)/admin/customers/[id]/page.tsx                 — wire legacy fallback
app/[locale]/(admin)/admin/customers/[id]/legacy-view.tsx          — NEW (tb_users view + recent forwarders/orders/payments)
app/[locale]/(admin)/admin/yuan-payments/[id]/page.tsx             — NEW (tb_payment detail)
app/[locale]/(admin)/admin/sales-payouts/[id]/page.tsx             — NEW (sales_payouts detail · Pacred-only)
```

---

## G. Recommended next session (P1 sprint)

1. **Wallet list rewrite** — `/admin/wallet` reading `wallet_transactions` while everything else reads `tb_wallet_hs` is the single biggest "wrong data" gap.
2. **Customers sidebar leaves** — `pending`, `recently-active`, `transfer-rep` rewrites to tb_users.
3. **Yuan-payments list** — rewrite to tb_payment (the `[id]` already does).
4. **Reports menubar trio** — sales-by-rep + forwarder-volume + user-sales-history.
5. **Wire 10 true orphans** into menubars per §D suggestions.

Estimated effort: ~6-8 hours for the P1 sprint.
