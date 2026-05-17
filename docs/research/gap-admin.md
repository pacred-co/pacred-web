# 🔎 Admin / back-office gap-hunt — "เจาะให้หมดเปลือก"

> **Produced 2026-05-17** for เดฟ. Deep walk of Pacred's `app/[locale]/(admin)/`
> + `actions/admin/*` against the PCS legacy admin
> (`pcs-admin/include/pages/` — ~85 business modules) and the chat research.
>
> **Scope rule:** this lists only admin functions Pacred **lacks AND has not
> planned**, plus **holes/bugs in shipped admin code**. Already-roadmapped items
> (`R-*` in [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md), `V-*` in
> [`../PORT_PLAN.md`](../PORT_PLAN.md) Part V, `AP1..AP24` in
> [`../audit/php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md))
> are **excluded** — see §4 for the cross-reference.

---

## 1. Summary

Pacred's admin is broad (95 routes, 38 action files) and the **action layer is
genuinely solid** — every mutation in `actions/admin/*` goes through
`withAdmin([roles])` + `logAdminAction()`. The gap is in **two places**:

1. **Read-side authorization is missing.** The `(admin)` layout only proves
   "is *some* admin"; financially sensitive **pages** (`/admin/wallet`,
   `/admin/accounting/*`, `/admin/yuan-payments`, `/admin/tax-invoices`, …)
   then call `createAdminClient()` (RLS-bypass) with **no page-level role
   gate**. The sidebar hides the menu item by role — but direct URL navigation
   by a `driver`/`warehouse` admin loads the full data. This is the scariest
   finding (§3 H-1).

2. **A cluster of legacy admin modules is neither built nor on the roadmap** —
   mostly *operational supervision* tools (audit-log search/export, staff
   permission editor, notification outbox, refund desk, container-cost ledger)
   that the AP1..AP24 sweep counted at entry-page granularity and missed.

The legacy back-office's hardest-won lesson — *every admin money/state action
is recorded and reversible* — Pacred mostly honors. The biggest *missing*
admin capability is **supervisory**: nobody can currently answer "who changed
this, and can I trust the team with RLS-bypass UI?"

---

## 2. Unbuilt + unplanned admin functions (ranked)

> Severity: 🔴 launch-week risk · 🟠 important · 🟡 polish.
> Effort: S ≤1d · M 1-3d · L 1wk+.

### G-1 🔴 — Admin audit-log is write-only: no search / filter / export UI · S
- **What:** `admin_audit_log` is written by every action (`logAdminAction`) and
  `/admin/audit` renders a flat recent list (super-only). There is **no filter
  by admin / target / action / date range, no per-target history view, no CSV
  export.** When money goes wrong the log exists but is not *queryable* by a
  human in the UI.
- **Why (legacy evidence):** PCS `pcs-admin/include/pages/admin/` + the
  per-table `admin_id_update` columns existed precisely so disputes were
  traceable. The accounting decode flags the central-fund as a *"high
  embezzlement / leakage surface"* — an unsearchable audit log defeats the
  control. `R-7` builds the AP ledger but assumes the audit trail is usable.
- **Severity:** 🔴 — it is the supervisory backstop for every other admin
  action; cheap to build, high leverage.
- **Effort:** S. **Dependency:** none (table + page already exist).

### G-2 🔴 — No staff permission/role editor beyond grant-one-role · M
- **What:** `/admin/admins` can grant/toggle a single role per profile.
  Missing: a **per-staff capability view** ("what can this person do"), a
  **section/department scoping** UI (legacy `companyType/department/section`
  triple drives interpreter detection — see deep-sweep §5.2), and any
  **review screen of who currently holds `super`**. `super` is all-powerful and
  ungated; today you cannot audit how many supers exist without SQL.
- **Why (legacy evidence):** PCS `admin-table/` (8 files) + `admin-profile.php`
  (152 KB) were a full RBAC console. `parity-admin-table.md` rated `/admin/admins`
  🟡 partial; the deep-sweep AP23 only asked to "verify RBAC config UI" — it is
  actually absent, not just unverified.
- **Severity:** 🔴 — unbounded `super` proliferation with no review surface is a
  standing insider-risk hole.
- **Effort:** M. **Dependency:** pairs with G-1.

### G-3 🟠 — Container-cost / per-job disbursement is AR-only — no admin cost entry · L
- **What:** Distinct from `R-7` (which is the *accounting-system* AP ledger):
  even at the **operational** admin level there is no screen to record what a
  *container* cost (ค่า D/O, ค่าเร้น/demurrage, carrier freight, ค่าหัวลาก)
  against the `cargo_containers` row. Ops staff cannot see container
  profitability; `/admin/accounting/closing` sums `forwarders.total_price`
  (revenue) only.
- **Why (legacy evidence):** `closingAccReportForwarder.php` + the legacy ACC
  sheet carried a `cost` column per job; `legacy-chat-ops-transport.md` `OT-6`
  (demurrage clock) + the cargo forensics show per-container costs are real and
  recurring. `R-7` is scoped as a *finance* build — the *ops-facing* cost-entry
  on the container detail is not in any task.
- **Severity:** 🟠. **Effort:** L. **Dependency:** overlaps `R-7`; could ship a
  thin `container_costs` table first.

### G-4 🟠 — No admin "impersonate / view-as customer" or customer-session tools · M
- **What:** Support staff cannot see what a customer sees. No read-only
  "view this customer's portal", no force-logout, no session list, no
  password-reset-on-behalf. Every "ลูกค้าบอกว่าหน้าจอขึ้นแบบนี้" is debugged
  blind.
- **Why (legacy evidence):** PCS `users/` + `verify-tel.php` + admin profile
  tools let staff act on a customer account. `legacy-chat-dev-it-momo.md` `DI-2`
  shows support constantly reconciling customer-side state by hand.
- **Severity:** 🟠 — support-cost + first-response-time hole.
- **Effort:** M. **Dependency:** none. **Security note:** must itself be
  audited + super/ops-gated.

### G-5 🟠 — Notification outbox / delivery log is invisible to admin · S
- **What:** `sendNotification()` fires in-app + LINE push on dozens of admin
  actions, all fire-and-forget (`void sendNotification(...)`). There is **no
  admin screen showing what was sent, to whom, delivered or failed.** A failed
  LINE push (token expired, user blocked OA) is silently lost.
- **Why (legacy evidence):** `DI-3` (OTP SMS dried up → 14 h of silent
  registration failure) is the exact failure class — a send channel dying with
  no signal. `R-M3` covers the *SMS-balance* alert but not a *notification
  delivery log*. PCS `notify/` + `admin-table-linenotify.php` tracked send
  subscriptions.
- **Severity:** 🟠. **Effort:** S (a `notification_log` table + list page).
- **Dependency:** none.

### G-6 🟠 — No customer-facing refund desk (shop + yuan + wallet) · M
- **What:** `AP9` (deep-sweep) flagged *shop* refund only. Broader gap: there
  is **no unified refund workflow** — yuan-payment refund is a status flip with
  no money-return record; wallet has `kind:'refund'` but no admin "issue
  refund" form; forwarder over-collection (`V-C1`, unbuilt) has none. Refunds
  happen as ad-hoc status edits, not a tracked, audited, customer-notified
  flow.
- **Why (legacy evidence):** `shopping-return.php` + subdir. `legacy-chat-ops-transport.md`
  `OT-4` (customs โดนเปิดตรวจ → re-export → refund) makes refunds routine.
- **Severity:** 🟠. **Effort:** M. **Dependency:** `V-C1` (forwarder
  post-lock refund) is the related Part-V task; the *generic* refund desk is
  unplanned.

### G-7 🟡 — No admin global search · S
- **What:** No omnibox to jump to a customer / order (h_no) / forwarder (f_no) /
  container by code. Each admin list has its own filter; cross-entity lookup
  ("customer phoned about f_no X") means guessing the right list first.
- **Why (legacy evidence):** the legacy ops chat is one long "หาด้วยเลข…"
  relay (`OT-1`, `OT-3`); a global search is the single-screen answer.
- **Severity:** 🟡 (productivity). **Effort:** S. **Dependency:** none.

### G-8 🟡 — No admin data-export / report-scheduling surface · S
- **What:** Individual report pages each have an ad-hoc CSV button, but there
  is no **central export hub** and no **scheduled/emailed report** (e.g.
  weekly debtors to finance). Owner-facing "how are we doing" still needs a
  human to open each page.
- **Why (legacy evidence):** PCS `report-*` family (~10 modules) + the Google
  Sheets sync cron the team relied on for periodic snapshots.
- **Severity:** 🟡. **Effort:** S–M. **Dependency:** none.

### G-9 🟡 — No system-health / cron-status panel inside admin · S
- **What:** 6 cron routes run (incl. MOMO sync); admin has no page showing
  last-run / success / failure per cron. `R-M3` proposes a LINE *alert* but no
  *in-admin* status board.
- **Why (legacy evidence):** `DI-3` + momo-decode §7 bug 5 (sync going stale
  silently). Staff live in the admin UI, not in Vercel logs.
- **Severity:** 🟡. **Effort:** S. **Dependency:** R-M3 (shares the checks).

### G-10 🟡 — `/admin/settings` is thin: no editable business config · M
- **What:** Settings covers contacts + TOS + notifications. Missing
  admin-editable: OTP TTL / rate-limit numbers, wallet min-deposit, feature
  flags (e.g. China-search demo mode), cashback %, deposit bank accounts. Each
  is a code constant or env today → a dev ticket to change.
- **Why (legacy evidence):** `DI-1` / `DI-16` — *"add a courier" asked 5×*; the
  migration success metric is "the IT chat goes quiet." `R-6` covers `carriers`
  + rate engine specifically; the *general* settings surface is unplanned.
- **Severity:** 🟡. **Effort:** M. **Dependency:** none.

---

## 3. Holes / bugs in existing admin code

### H-1 🔴 SCARIEST — Sensitive admin pages have no role gate (read-side authz hole)
- **Where:** `app/[locale]/(admin)/admin/{wallet,wallet/deposit,accounting,
  accounting/closing,yuan-payments,tax-invoices,sales-payouts,withdrawals,
  payment,customers,forwarders}/page.tsx` — 11 confirmed pages with **no
  `requireAdmin([roles])` call**.
- **The bug:** the `(admin)/layout.tsx` calls bare `requireAdmin()` (no roles)
  → only proves the user is *some* active admin. These pages then build a
  query with `createAdminClient()`, which **bypasses RLS entirely**. So a
  `driver` or `warehouse` admin who navigates directly to `/admin/wallet` sees
  **every customer's wallet transactions — bank name, account number, slip
  images** — and `/admin/accounting/closing` exposes month-end revenue. The
  *mutations* on these pages are correctly gated (`withAdmin(["accounting"])`),
  but the *page render / data read* is not.
- **Why it looks safe but isn't:** `components/sections/admin-sidebar.tsx`
  filters the menu (`/admin/wallet` shows only for `accounting`), so it is
  invisible in the nav — pure security-by-obscurity. The URL is guessable and
  stable.
- **Fix:** add `await requireAdmin([...])` at the top of each sensitive page
  (`["accounting"]` for wallet/accounting/yuan/tax/payouts/withdrawals,
  `["ops","sales_admin"]` for customers, `["ops"]` for forwarders). Cheap,
  ~1 line each. Then add an RLS policy on `wallet_transactions` /
  `yuan_payments` as defense-in-depth so even an `createAdminClient` misuse is
  contained (longer-term).
- **Severity:** 🔴 launch-week — real PII + financial-data exposure across the
  admin team the moment a non-finance role exists.

### H-2 🟠 — `/admin` real dashboard has no page-level gate either
- **Where:** `app/[locale]/(admin)/admin/page.tsx` — `createAdminClient()` +
  `Promise.all([...])` of revenue/order aggregates, no `requireAdmin([roles])`.
- **The bug:** same class as H-1 — every admin role (driver/warehouse) lands
  on the company revenue overview. Lower severity than H-1 (aggregates, not
  per-customer PII) but the same root cause.
- **Fix:** decide if the overview is all-admin-OK (then leave, but document the
  decision) or gate to `["super","ops","accounting","sales_admin"]`.
- **Severity:** 🟠.

### H-3 🟠 — Two parallel container systems: legacy `/admin/containers` vs spine `/admin/warehouse/containers`
- **Where:** `/admin/containers` (+`[id]`, `[id]/hs`) writes the legacy
  `containers` table via `actions/admin/containers.ts`; `/admin/warehouse/containers`
  is the container-centric spine (`cargo_containers`, migration 0033+) via
  `actions/admin/warehouse.ts`. Both are live, both have a "create container"
  form, both gated `["ops"]`/`["ops","warehouse","super"]`.
- **The bug:** staff can create a container in *either* model; the two never
  reconcile. `R-1` (status board) builds on the spine — every container made
  in the legacy screen is invisible to it. Data drift + "ของอยู่ไหน answered
  from the wrong table."
- **Fix:** pick the spine as canonical; convert `/admin/containers` to a
  redirect (the same pattern already used for `/admin/orders/*`) or a
  read-only legacy view. Confirm no remaining writer depends on legacy
  `containers`.
- **Severity:** 🟠 — silent data-integrity divergence on the table `R-1`
  depends on.

### H-4 🟡 — `adminAutoClearForwarderPayment` keys wallet_tx on `kind:'import_payment'`; bulk approve writes only status
- **Where:** `actions/admin/reconciliation.ts:57-67` matches the paid wallet_tx
  with `.eq("kind","import_payment")`. `actions/admin/wallet.ts` bulk-approve
  and `yuan-payments.ts` bulk-approve update `status` directly on the table
  without re-deriving balance.
- **The bug:** (a) if a forwarder was paid via a different `kind`
  (`import_top_up`, or wallet `adjustment`), reconcile says *"ไม่พบ wallet_tx
  completed"* and the mismatch can't be auto-cleared — a false negative that
  sends a clearable case back to manual SQL, the exact toil `V-A3` set out to
  kill. (b) Bulk-approve relies on a balance-recompute trigger; if that trigger
  is ever absent on an env, balances silently desync (it is correct *today* —
  flagged as a fragile coupling, not a live bug).
- **Fix:** widen the reconcile match to `kind in ('import_payment','import_top_up')`
  (or match on `reference_type/reference_id` only); add a comment asserting the
  recompute-trigger dependency.
- **Severity:** 🟡.

### H-5 🟡 — Audit-log insert is best-effort; a lost row is invisible
- **Where:** `actions/admin/common.ts:16-40` — `logAdminAction` swallows insert
  failures (logs to `logger.error` only). Correct *design* (don't roll back the
  business action) — but there is no counter, no alert, no admin-visible signal
  when audit rows are being dropped.
- **The bug:** if `admin_audit_log` insert starts failing (schema drift, RLS,
  disk), admin actions keep succeeding while the audit trail silently goes
  incomplete — and nobody knows until a dispute needs a row that isn't there.
- **Fix:** on insert failure, also emit a Sentry event (once `R-M1` DSN is set)
  or increment a health metric surfaced on the G-9 panel.
- **Severity:** 🟡 (becomes 🟠 once real disputes start).

### H-6 🟡 — Bulk actions cap at 50/500 with no resumability; partial failures only surface as a toast count
- **Where:** `adminBulkApproveDeposits` (≤50), `adminBulkApproveYuanPayments`
  (≤50), `adminBulkTransferSalesRep` (≤500), `adminBulkUpdateForwarderStatus`.
  Each loops per-row; per-row errors are collected into an `errors[]` returned
  for a toast.
- **The bug:** no persistent record of *which* rows failed in a bulk run — once
  the toast is dismissed the partial-failure list is gone. For a 50-row deposit
  batch where 3 fail, staff have no UI to find the 3. Not corruption, but an
  operational hole that recreates the "did that actually go through?" anxiety.
- **Fix:** log a single `*.bulk_*` summary row to `admin_audit_log` with the
  failed-id list in the payload (some actions already log per-row — make the
  summary consistent), surfaced via G-1.
- **Severity:** 🟡.

### H-7 🟡 — `/admin/customers` exposes all customer PII to every admin role
- **Where:** `/admin/customers/page.tsx` — no role gate; lists member_code,
  name, phone for all customers via `createAdminClient()`.
- **The bug:** a `driver` or `warehouse` admin can browse the full customer
  directory + PII. Distinct from H-1 (financial) — this is a PDPA/PII surface.
  Sidebar shows it to all admins by design, so this may be intentional — but it
  is undocumented and unbounded.
- **Fix:** decide + document the intended audience; gate to
  `["ops","sales_admin","accounting"]` if drivers should not see it.
- **Severity:** 🟡 (PDPA exposure — raise to 🟠 if driver headcount grows).

---

## 4. Chain notes — links to other domains

- **→ Revenue / money:** H-1 + H-3 directly touch the cargo revenue path
  (wallet read exposure; container model divergence under `R-1`). The money-bug
  P0-1/P0-2 (`audit-money-billing`) are *write*-side; H-1 is the *read*-side
  twin and is not on any list.
- **→ `R-7` (AP/cost ledger):** G-3 (ops-facing container cost entry) is the
  operational sibling of the finance-facing `R-7`. G-1 (audit-log search) is a
  hard prerequisite for `R-7`'s "who approved this เบิก" requirement.
- **→ `R-1` (status board):** H-3 must be resolved *before* `R-1` ships, or the
  board reads a table half the containers are missing from.
- **→ `R-M1/R-M3` (monitoring):** H-5 (lost audit rows) and G-9 (cron panel)
  are the in-product surfacing of what `R-M1`/`R-M3` alert on externally —
  build them together.
- **→ Customer domain:** G-4 (view-as-customer) and G-6 (refund desk) are the
  admin half of customer-facing flows; see the customer-side gap doc.
- **→ Integration domain:** G-5 (notification outbox) overlaps the LINE-OA push
  integration; G-9 overlaps the MOMO sync-freshness work in `R-2`.

### Already planned — explicitly NOT re-reported here
`R-1` status board · `R-3` lead inbox/CRM · `R-5` quote calculator · `R-6`
`carriers` + rate engine · `R-7` AP ledger · `R-8` driver scheduling · `R-9`
warehouse intake · `V-E6..E12` freight stack · `V-G1` bulk forwarder actions ·
`V-G3` admin push broadcast (`popup.php`) · `AP1/AP6/AP8/AP9/AP10..AP15`
deep-sweep polish items. Those remain valid — this doc is the *delta* on top.

---

**End — `gap-admin.md`.** Action layer is sound; the unplanned work is
supervisory (audit search, RBAC console, cost ledger, notification log) and the
top bug is the missing read-side role gate on financial admin pages (H-1).
