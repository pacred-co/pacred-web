# 04 · Admin / Employee Portal — R&D audit, 2026-05-19

> **Audit by:** Dr. Admin-Portal (sub-agent, frosty-bhaskara worktree). **Scope:**
> the staff side of `pacred-web` — `app/[locale]/(admin)/admin/*`, `actions/admin/*`,
> `components/sections/admin-sidebar.tsx`, `lib/admin/sidebar-menu.ts`,
> `lib/auth/require-admin.ts`. Baseline: `dave` HEAD `2b800fb` (D1 Phase B agent-wave
> merged: agent-aa61 RBAC sidebar + agent-a7f8 `tb_cnt` payment ledger).
>
> **Lens (owner ask, 2026-05-19):** *"ระบบงานพนักงานครบครัน — บันทึก เบิก จ่าย ติดต่อ
> ทำงานง่ายจากมือถือ"* — the staff use this 8 hours/day; the workspace must be fast,
> mobile-tolerant, and let every department see + act on its own work without phoning
> a teammate.
>
> **Companion docs (do not duplicate, link only):**
> [`../../briefs/ops-roles.md`](../../briefs/ops-roles.md) — the 14-role bible ·
> [`../capability-tools-strategy-2026-05-18.md`](../capability-tools-strategy-2026-05-18.md)
> — Tier 0/1/2/3 roadmap · [`../operating-system-analysis-2026-05-18.md`](../operating-system-analysis-2026-05-18.md)
> — the 8 internal-department gaps · [`../d1-fidelity-admin.md`](../d1-fidelity-admin.md)
> — D1 PCS-fidelity admin gaps · [`../gap-admin.md`](../gap-admin.md) — pre-launch
> admin gap-hunt (G-1..G-10 + H-1..H-7) · [`../../audit/chat-analysis-2026-05-16.md`](../../audit/chat-analysis-2026-05-16.md)
> — workflows W-1..W-9 · [`../../audit/cargo-ops-forensics-2026-05-16.md`](../../audit/cargo-ops-forensics-2026-05-16.md)
> — A1..F3 cargo ops pain · [`../../audit/php-deep-sweep-2026-05-16.md`](../../audit/php-deep-sweep-2026-05-16.md)
> — AP1..AP24 polish items · [`../../decisions/0002-admin-architecture.md`](../../decisions/0002-admin-architecture.md)
> — admin RBAC + `is_admin()` · [`../disbursement-system-2026-05-18.md`](../disbursement-system-2026-05-18.md)
> — เบิก/จ่าย design · [`../internal-chat-system-2026-05-18.md`](../internal-chat-system-2026-05-18.md)
> — IC-1 work-chat design.

---

## TL;DR

The admin portal is **broad and increasingly thoughtful** — 128 `page.tsx` routes,
54 `actions/admin/*` files, all mutations go through `withAdmin([roles]) + logAdminAction()`.
The D1 Phase B agent-wave landed two **load-bearing** pieces this week: the per-role
sidebar with live-count badges (`lib/admin/sidebar-menu.ts` + `actions/admin/sidebar-counts.ts`)
and the `tb_cnt` container-payment ledger (`actions/admin/pcs-container-payments.ts`).
The cross-department work-board (`/admin/board` + `/admin/board/inbox`) + IC-1 chat
(`work_item_messages`) are the **second** load-bearing piece. Together, those four
systems are the foundation of the "ระบบงานพนักงานครบครัน" promise.

**But four shipped systems plus 60+ routes do not yet equal a finished ระบบงานพนักงาน.**
Of the 14 STAFF roles in [`ops-roles.md`](../../briefs/ops-roles.md), only **HR (100%)
and developers (meta)** have a complete workspace. **6 roles have no dedicated module
at all** — CS, docs, AP, messenger, marketing, interpreter — and **6 more share a
single overloaded `ops` role** because the `admins.role` enum is stale (the workshop
splits the people but the database does not). Mobile readiness is **un-audited** —
the admin sidebar is desktop-first (`lg:ml-64`); 8 hr/day staff include the warehouse
loader and driver who never sit at a desk. The "ปุ่มเดียววางบิล" bulk-bill pattern
owner mentioned is **not built**. There is **no staff-direct chat** (IC-1 is per-job,
not person-to-person), **no attendance clock from the admin app** (it lives under HR
but staff need a 1-tap mobile button), and **no per-staff performance dashboard**
beyond `/admin/kpi` which is company-wide.

This document maps the 14 roles to current routes, names the 18 highest-value gaps,
and proposes a sequenced AP-portal v2 roadmap.

---

## 1. Current state — what is built, role by role

> Counts collected by walking `app/[locale]/(admin)/admin/` on `dave@2b800fb`. The
> "live" column is grounded in `lib/admin/sidebar-menu.ts` (the per-role menu the
> agent-aa61 D1 wave installed) — that file is the **canonical answer** to "what
> does role X see?" today. The "owner asked for" column is verbatim from
> [`ops-roles.md`](../../briefs/ops-roles.md).

### 1.1 The 60+ admin routes inventory

`find app/[locale]/(admin)/admin -name page.tsx` returns **128 pages** (the prior
"60+" number is stale — `dave` has nearly doubled it since launch). Grouped:

| Cluster | Routes (selected) | State |
|---|---|---|
| **Dashboard + KPI** | `/admin` (revenue cards + queue strip), `/admin/dashboard` (alias), `/admin/kpi` (exec rollup, Tier-1) | 🟢 live |
| **Work-board (Tier 2)** | `/admin/board` + `/admin/board/inbox` (3 tabs: mine/waiting/mentions) | 🟢 IC-1 shipped |
| **Incident triage (IO-1)** | `/admin/incidents` + `incident-triage-panel` | 🟢 shipped |
| **Cargo customer loop** | `/admin/service-orders` (+ `[hNo]` + `search`), `/admin/forwarders` (+ `[fNo]` + `bulk-search` + `search` + `notes` + `combine-bill` + `warehouse-history`), `/admin/yuan-payments` (+ `new`), `/admin/wallet` (+ `deposit` + `history` + `pay-user` + `add`), `/admin/withdrawals`, `/admin/refunds` (+ `new` + `[id]`) | 🟢 shipped post-launch U1/U2 |
| **Warehouse** | `/admin/warehouse/containers` (canonical 0033 spine), `/admin/warehouse/bulletin`, `/admin/warehouse/qa-inspections`, `/admin/barcode` (intake/prepare/box modes), `/admin/barcode/driver` | 🟢 partial (no inbound/outbound scan optimised) |
| **Container model** | `/admin/containers` (legacy 0016) + `/admin/warehouse/containers` (spine 0033) — **both alive** (H-3 in gap-admin) | 🟡 silent data drift |
| **Driver** | `/admin/drivers` (+ `[id]`), `/admin/driver-runs` (CT-7 "งานของฉัน", self-row enforced), `/admin/barcode/driver` | 🟢 desktop only |
| **Sales** | `/admin/customers` (+ `[id]` + `pending` + `recently-active` + `transfer-rep` + `convert-to-juristic` + `[id]/transfer-rep`), `/admin/sales-payouts`, `/admin/team-leaders`, `/admin/forwarder-sales`, `/admin/commissions` (+ `[id]`), `/admin/broadcasts` (+ `new` + `[id]`), `/admin/bookings` (+ `[bookingNo]`), `/admin/contact-messages` | 🟢 broad, no opportunity pipeline |
| **Accounting** | `/admin/accounting` (+ `closing` + `periods/[yyyymm]` + `reconcile` + `container-costs` + `container-payments/[id]` + `disbursements`), `/admin/tax-invoices` (+ `[id]`), `/admin/payment` | 🟢 strong post-U2 |
| **Freight** | `/admin/freight/shipments` (+ `new` + `[id]`), `/admin/freight/quotes` (+ `new` + `[id]`), `/admin/freight/declarations/[id]`, `/admin/carriers` | 🟢 V-E shipped |
| **HR** | `/admin/hr` + `employees` (+ `[id]`) + `recruitment` (+ `new` + `[id]`) + `attendance` (+ `leaves`) + `training` + `policies` + `audit` + `org-chart` + `org-table` | 🟢 **100% — strongest non-customer module** |
| **Rates** | `/admin/rates/general`, `/vip`, `/custom-user`, `/custom-hs` | 🟢 |
| **Reports** | `/admin/reports/*` — 12 screens (monthly-orders, forwarder-volume, sales-by-rep, user-sales-history, hs-code-revenue, pending-payments, credit-pending, containers-awaiting-th, containers-hs, debtors, refunds) | 🟢 kills B1 dev-ticket pain |
| **Settings** | `/admin/settings` + `business-config` + `contacts` + `notifications` + `tos-versions` | 🟡 thin (G-10) |
| **System / IT** | `/admin/audit`, `/admin/admins`, `/admin/system/crons`, `/admin/system/notifications`, `/admin/migration/pcs-customers`, `/admin/csv-imports` (+ `[id]` + `upload`), `/admin/search` (global search) | 🟢 |
| **Misc** | `/admin/juristic-check`, `/admin/learning`, `/admin/inventory`, `/admin/forwarder` (legacy duplicate) + `/admin/forwarder/pending` | 🟡 forwarder duplicate routes |

### 1.2 The 14 staff roles vs routes

| # | Role | RBAC enum | Has dedicated menu? | Has dedicated workspace? | Owner-defined workflows covered |
|---|---|---|---|---|---|
| 1 | **Developer** | (no row) | meta — IDE/Repo/Supabase | n/a | n/a |
| 2 | **Marketing** | ❌ missing | ❌ no | ❌ — runs on external tools | 0/4 (analytics + campaigns + content cal + UTM) |
| 3 | **Sales** | ✅ `sales_admin` | 🟢 `menuSalesAdmin` (customers + payouts + broadcasts + bookings) | 🟢 `/admin/customers` + `/admin/sales-payouts` | 2/4 (no opportunity pipeline; no quote-generator integration; commission OK) |
| 4 | **Pricing** | folded into `accounting` | 🟡 via `blockSettingsCargo` (rates) | 🟢 `/admin/rates/*` (4 tiers) | 2/3 (no effective-date versioning; no carrier rate-sheet sync) |
| 5 | **Planning** | folded into `ops` | ❌ no `/admin/planning/*` | 🟡 partial — `/admin/forwarders` lists, no drag-drop board | 0/4 — assignment is ad-hoc |
| 6 | **CS** | folded into `ops` | ❌ no `/admin/cs/*` | 🟡 `/admin/contact-messages` exists (4-state, no assignee) | 0/4 — no ticket queue, no customer 360°, no escalation, no SLA |
| 7 | **Docs** | folded into `accounting` | ❌ no `/admin/docs/*` | 🟡 — `tax-invoices` + `freight/declarations` exist as siloed list pages | 1/4 — no unified docs queue, no Form-E generator, no D/O generator, no Invoice+PL generator |
| 8 | **Acc AR** | ✅ `accounting` | 🟢 `menuAccounting` (wallet + accounting Cargo + accounting Freight) | 🟢 `/admin/wallet/deposit` + `/admin/refunds` | 3/4 — daily reconciliation manual, no AR aging report |
| 9 | **Acc AP** | folded into `accounting` | 🟡 via `blockWithdrawalList` | 🟡 — `container-disbursements` ledger (U2-2) covers container costs only; **no general vendor-payment desk** | 1/4 — no PND.53, no general AP, no WHT cert issuance (covered by `disbursement-system` design) |
| 10 | **HR** | folded into `super` | 🟢 `blockHrHumanResource` + `blockHrCorporateAssets` | 🟢 `/admin/hr/*` (100%) | 4/4 |
| 11 | **Messenger** | ❌ missing | ❌ no | ❌ no `/admin/logistics/*` | 0/4 — booking, route, POD, tier untracked |
| 12 | **Warehouse** | ✅ `warehouse` (0033) | 🟢 `menuWarehouse` (5 items + barcode) | 🟢 `/admin/warehouse/*` | 3/4 — China side missing |
| 13 | **Driver** | ✅ `driver` (0033) | 🟢 `menuDriver` (3 items only) | 🟢 `/admin/driver-runs` + `/admin/barcode/driver` | 2/3 — desktop-only, no route optimisation, no multi-shipment |
| 14 | **Sub-driver** | folds into `driver` | 🟡 same as driver | 🟡 same | 0/3 — schema can't split primary/sub commission |

**Score:** of the 14 roles, **2 are complete (developer meta, HR), 5 are reasonably
covered (sales, AR, warehouse, driver, pricing as a sub-role of accounting), 7 are
🟡 partial or 🔴 missing** (marketing, planning, CS, docs, AP, messenger, sub-driver).
This matches the [`ops-roles.md`](../../briefs/ops-roles.md) "RBAC summary" — 6 of
the role-enum values are still 🔴 *add* (marketing, cs_admin, docs_admin, logistics_admin,
plus optionally hr_admin and pricing_admin).

### 1.3 The two big shipped wins (this week)

**Win 1 — Per-role sidebar with live badges (D1 Phase B, agent-aa61).** Reproduces
the legacy PCS shape from [`d1-fidelity-admin.md`](../d1-fidelity-admin.md) §1: 7
per-role assembled menus (super / ops / accounting / sales_admin / warehouse / driver
/ interpreter), nested accordion, **25 live-count badge keys** computed in one batched
`Promise.all` in `actions/admin/sidebar-counts.ts`. **This was the #1 daily-workflow
regression** ("staff navigate by the badges") and it is now closed. Pacred is *better*
than legacy at the badge UX because the count function is one query + a fail-soft
fallback to `{}` (no count failure can break the chrome).

**Win 2 — Work-board + IC-1 chat (Tier-2 spine).** `/admin/board` renders a Kanban
of `work_items` columns (open / in_progress / blocked) with role chips, status chips,
waiting-reason chips. `/admin/board/inbox` has **3 tabs that actually answer the
right questions**:
- 🙋 *งานของฉัน* — `assigned_to = me` OR (`assigned_role ∈ my_roles` AND `assigned_to IS NULL`)
- 🔴 *รอฉันจัดการ* — `blocked_on_role ∈ my_roles` OR `blocked_on_admin = me`
- 💬 *@ฉัน* — unseen `work_item_message_mentions` for me

This is the operating-system §1.4 build. Combined with `work_item_messages` (per-job
chat with `@mention`, `status_note` "set waiting", `clearWaiting` role-gated unblock),
the *staff* side of the DNA promise (every dept sees the work) is now real for the
8 entity types `work_items` indexes — *if* domain status changes call
`ensureWorkItemForEntity()`. **Coverage of that hook across the 60+ admin actions is
the next unsolved problem (§2.7).**

**Win 3 — `tb_cnt` payment ledger (D1 Phase B, agent-a7f8).** The legacy container-payment
queue (`ตารางจ่ายเงินค่าตู้`, 2-state ตู้-รอจ่าย → ตู้-จ่ายแล้ว) is now a real Pacred
ledger at `/admin/accounting/container-payments/[id]` with `actions/admin/pcs-container-payments.ts`.
This closes the [`d1-fidelity-admin.md`](../d1-fidelity-admin.md) §6 gap.

### 1.4 The action surface

`actions/admin/*` is **54 files** (`commissions, container-costs, containers,
contact-messages, disbursements, employees, forwarders, freight-*, incidents,
pcs-container-payments, refunds, sales-payouts, sidebar-counts, wallet, warehouse,
work-items, work-item-messages, …`). Every mutation in every file passes through
`withAdmin([roles], async ({adminId}) => …)` and emits `logAdminAction(adminId, action,
target_type, target_id, payload)`. The action layer is genuinely **the strongest part
of the codebase** — see [`gap-admin.md`](../gap-admin.md) opening verdict: "the action
layer is genuinely solid". The remaining authz hole is read-side (§2.1).

### 1.5 RBAC posture summary

- **Roles in CHECK constraint (`lib/auth/require-admin.ts` line 22):** `super | ops |
  accounting | sales_admin | warehouse | driver | interpreter` — **7 values**, extended
  by migrations 0033 (`warehouse`, `driver`) and 0054 (`interpreter`).
- **Roles referenced in `lib/admin/sidebar-menu.ts` per-role menus:** all 7 above
  get a hand-built menu. `super` outranks; `ROLE_PRECEDENCE` selects when an admin
  holds multiple roles.
- **Roles still missing per [`ops-roles.md`](../../briefs/ops-roles.md):** `marketing`,
  `cs_admin`, `docs_admin`, `logistics_admin`, (optionally `hr_admin`, `pricing_admin`).
- **Page-level `requireAdmin([…])` coverage:** 97 of 128 admin `page.tsx` files call
  it; **31 do not** (rely on `(admin)/layout.tsx` "is *some* admin"). Worst offenders
  are the same as `gap-admin.md` H-1 (financial pages with no read-side gate).
- **`adminId = profiles.id`** by ADR-0002 (admins is a satellite of profiles). The
  IC-1 chat code (`actions/admin/work-item-messages.ts`) leans on this — `author_admin_id`,
  `blocked_on_admin`, `mentioned_admin_id` are all `profiles.id` values that ALSO
  appear in `admins` with `is_active=true`.

---

## 2. Gaps — what the 8-hour-a-day workspace is missing

Severity: 🔴 launch-week pain · 🟠 operational pain · 🟡 polish. Effort: S ≤1d ·
M 1-3d · L 1wk+. **Numbers map onto the proposed AP-portal v2 backlog at §3.**

### 2.1 RBAC enum is stale + 31 pages have no page-level gate · 🔴 · M

**What:** 6 of 14 owner-defined roles (marketing, cs_admin, docs_admin, logistics_admin,
optionally hr_admin/pricing_admin) cannot be assigned because the `admins.role` CHECK
omits them. Today CS, docs, messenger, and the marketing person — if Pacred hired
one — all hold `ops` or `accounting` (or, worse, `super`). Combined with the 31
pages that have no `await requireAdmin([…])` and only rely on the layout's "is
*some* admin" check (H-1 in [`gap-admin.md`](../gap-admin.md)), the practical RBAC
posture is **"any admin sees everything"** — including page-level reads of wallet,
accounting, customers, yuan-payments, tax-invoices, sales-payouts, withdrawals.
Sidebar filtering hides the menu item but URLs are stable.

**Why:** [`operating-system-analysis-2026-05-18.md`](../operating-system-analysis-2026-05-18.md)
§7 — the operating-system substrate every cluster leans on. [`gap-admin.md`](../gap-admin.md)
H-1 is verified in the source: `/admin/wallet/page.tsx` and 10 siblings call
`createAdminClient()` (RLS-bypass) with no role gate.

**Fix:**
1. Migration: extend `admins.role` CHECK to add `marketing`, `cs_admin`, `docs_admin`,
   `logistics_admin`. `hr_admin` + `pricing_admin` optional.
2. Sweep: add `await requireAdmin(["accounting"])` to the 11 financial pages and
   `requireAdmin(["ops","sales_admin","accounting"])` to `/admin/customers*`.
3. Add a `/admin/admins` capability matrix view + a "all current supers" review
   screen (G-2 in [`gap-admin.md`](../gap-admin.md)).
4. Extend `lib/admin/sidebar-menu.ts` with `menuMarketing`, `menuCsAdmin`,
   `menuDocsAdmin`, `menuLogisticsAdmin`.

**Effort:** M (1-3 days). **Depends on:** nothing. Already named as `P-38 / ADR-0011`.

### 2.2 No CS workspace + no omni-channel inbox · 🔴 · L

**What:** `/admin/contact-messages` is a 4-state list with **no assignee, no priority,
no SLA timer, no escalation, no internal-note thread, no customer-360° side panel**.
CS staff can mark "read/replied/closed" but cannot run a ticket queue. Inbound LINE
OA messages, phone calls, and emails are 3 separate streams off-system. Pacred has
**no `cs_admin` role** so a CS hire shares `ops`.

**Why:** [`operating-system-analysis-2026-05-18.md`](../operating-system-analysis-2026-05-18.md)
§5 (gap #3 in the ranking, 🔴). [`chat-analysis-2026-05-16.md`](../../audit/chat-analysis-2026-05-16.md)
L-7 (lead-routing) + customer pain themes 1-2 (every "ตู้ X เข้าเมื่อไหร่" customer
call lands on a sales rep, not a CS triage).

**Fix:** extend `contact_messages` (add `assigned_to`, `priority`, `sla_due_at`,
optional `severity`) → CS tickets are `work_items` (entity_type='contact_message'
already wired) → IC-1 thread per ticket → customer-360 panel pulls
`/admin/customers/[id]` data on the right rail. Build a webhook receiver at
`app/api/webhooks/line/route.ts` that drops inbound LINE messages into
`contact_messages` (the `U3-6` harness). Add a `searchAdminsForMention`-style
"assign to CS agent" picker.

**Effort:** L (1 week). **Depends on:** 2.1 (cs_admin role).

### 2.3 No general Acc-AP vendor-payment desk + no WHT cert issuance · 🔴 · L

**What:** Pacred's **money-OUT** side is fragmentary. `container_disbursements`
(U2-2, migration 0069) is great for container costs but `cargo_container_id` is
`not null` — **a เบิก for office fuel, a labourer, a freight job without a container,
the China-warehouse float, a broker fee — none can be recorded**. `commission_*`
(0054) only pays earned commission. No claim modes (เบิกขาด / เบิกเกิน / เบิกด่วน).
No per-recipient line breakdown ("this เบิก pays 3 people"). **No outbound WHT
certificate** — `0044/0053` only records WHT customers withhold from Pacred.

This is the owner's #1 daily-pain system, per
[`disbursement-system-2026-05-18.md`](../disbursement-system-2026-05-18.md) §1
("the one that always has problems"). The design doc exists; the build does not.

**Why:** [`disbursement-system-2026-05-18.md`](../disbursement-system-2026-05-18.md)
§§2-3 — the gap table is brutal. [`cargo-ops-forensics-2026-05-16.md`](../../audit/cargo-ops-forensics-2026-05-16.md)
A6 ("withholding tax completely unmodelled — most-repeated complaint").
[`ops-roles.md`](../../briefs/ops-roles.md) §9 (Acc AP — 🔴 no workspace yet).

**Fix:** build the unified `disbursement_requests` + `disbursement_lines` +
`disbursement_allocations` + `disbursement_fund` (กองกลาง) + outbound `wht_certificates`
(50-ทวิ, 1%/3%) per the design doc. Lifecycle: `requested → pending_approval →
approved → paid → wht_issued`. Money-OUT safeguards: ceiling guard (copy
`checkRefundCeiling`), overdraw guard (copy 0064), idempotency partial-unique
(copy 0061), audit on every state change.

**Effort:** L (2-3 weeks — biggest single net-new build). **Depends on:** 2.1.

### 2.4 No mobile-optimised admin / 8 hr/day warehouse + driver experience · 🔴 · L

**What:** The admin shell is **desktop-first**. `(admin)/layout.tsx` uses
`flex` + `lg:ml-64` (the sidebar pushes content right only at `lg`+ breakpoints).
The barcode scan flows (`/admin/barcode?mode=scan-all` etc.) are listed but rendered
as desktop pages — no zero-network camera scan PWA, no offline buffering.

**Owner ask:** *"ทำงานง่ายจากมือถือ"*. The warehouse loader, the driver, and the
QA inspector are NEVER at a desk. Today they have:
- `/admin/barcode/driver` (a page, not a PWA)
- `/admin/driver-runs?tab=mine` (a desktop table with cards)
- `/admin/warehouse/qa-inspections` (desktop table)
- no attendance clock-in button (HR has `/admin/hr/attendance` but it's a daily-summary
  dashboard, not a 1-tap clock)

The customer surfaces are mobile-first ([`mobile-first-playbook.md`](../../mobile-first-playbook.md));
the admin app **was never asserted at 360/390px**.

**Why:** owner literal ask 2026-05-19. [`ops-roles.md`](../../briefs/ops-roles.md)
§12-13 (warehouse + driver). [`chat-analysis-2026-05-16.md`](../../audit/chat-analysis-2026-05-16.md)
W-5 (WeChat-to-Supabase ingestion — China warehouse posts 100+ trackings; staff
should not need a laptop to log this).

**Fix (sequenced):**
1. **Audit + fix the sidebar** — drawer/sheet pattern at `<lg`, full-screen content,
   bottom-nav for the 4 most-used items per role at `<sm`. The `<X menu>` button
   the agent-aa61 sidebar already has at line 116 is half-built — make it a
   real bottom drawer.
2. **Barcode scan PWA** — `/admin/scan` with camera-first UX, offline buffer
   (IndexedDB), sync-on-reconnect. The 6 scan modes the sidebar already names
   (`mode=scan-all`, `mode=camera-all`, `mode=intake`, `mode=scan-prepare`,
   `mode=camera-prepare`, `mode=scan-box`, `mode=camera-box`) become 6 sheets in
   one PWA-installable shell.
3. **Mobile-first inbox** — `/admin/board/inbox` already renders cards in a single
   column at `<sm` but the `<WorkItemCard>` component has not been mobile-asserted.
4. **1-tap attendance** — a `/admin/clock` button page (location + IP captured by
   `actions/admin/attendance.ts`) on every admin page header at `<sm` viewports.
5. **Push notifications** — currently `sendNotification()` fires LINE OA + in-app
   only. Add Web Push (already wired? `actions/admin/work-item-messages.ts`
   imports `sendNotification` from `@/lib/notifications`) for mobile staff.

**Effort:** L (split across the 5 items). **Depends on:** nothing — can start now.

### 2.5 The work-board hook is wired in only 2 of the 8 entity types · 🟠 · M

**What:** `ensureWorkItemForEntity()` exists (`actions/admin/work-items.ts:317-344`)
and is **the additive cascade hook** every domain status-change action should call
after its own status mutation. Today (audited via grep), the hook is invoked by
contact-messages and incidents only. The remaining 6 work_item entity types
(`forwarder`, `service_order`, `freight_shipment`, `customs_declaration`,
`freight_invoice`, `refund_request`, `qa_inspection`) **do not yet fire the hook
on their own status changes**. So the work-board surfaces work-items only when
someone *manually* clicks "Create work item" on `/admin/board`.

**Why:** [`operating-system-analysis-2026-05-18.md`](../operating-system-analysis-2026-05-18.md)
§1.4 — "every status-change action also writes the `work_item` hop". The DNA promise
holds only if the board actually fills up.

**Fix:** in each of the 6 domain actions
(`adminAdvanceForwarder`, `adminMarkServiceOrderShipped`,
`adminMarkFreightShipmentDelivered`, `adminAcceptCustomsDeclaration`,
`adminIssueFreightInvoice`, `adminApproveRefund`, `adminCloseQaInspection`), call
`await ensureWorkItemForEntity({ entityType: '<x>', entityRef: <ref>, type:
'<x>_<stage>', title: …, assignedRole: <next>, priority: 'normal' })` **after** the
status change, **best-effort** (a hook failure must not roll back the domain
change). The action template is already laid out in §1.4 (the spec doc Agent A's
work-items.ts cites in its comment header).

**Effort:** M (1-2 days, mostly mechanical). **Depends on:** nothing.

### 2.6 No staff-direct chat (IC-1 is per-job, not person-to-person) · 🟠 · M

**What:** IC-1 (`work_item_messages`) is **per-job**. There is no "DM ภูม"
or "broadcast to all sales" surface. When a piece of org-wide info doesn't belong
on any job ("we're switching MOMO endpoint at 2 pm — log out and re-login"), staff
still escape to LINE. The IC-1 design doc explicitly anti-pattern'd a global chat
(§5.4 in [`internal-chat-system-2026-05-18.md`](../internal-chat-system-2026-05-18.md))
but **a `staff_broadcasts` table + a tiny per-role announcement bar** is missing.

**Why:** the IC-1 design + the bulletin pattern in
[`chat-analysis-2026-05-16.md`](../../audit/chat-analysis-2026-05-16.md) W-1 (daily
container summary bulletin).

**Fix:** a `/admin/staff-board` lightweight bulletin (separate from `/admin/warehouse/bulletin`
which is customer-facing). One table: `staff_announcements (id, body, target_roles[],
posted_by, expires_at, created_at)`. Render in `<AdminSidebar>` chrome as a thin
strip across the top when an unexpired announcement targets one of the viewer's
roles. **Not** a chat — explicitly a notice board (one-way, ephemeral).

**Effort:** M (1-2 days). **Depends on:** nothing.

### 2.7 The work-board has no "ปุ่มเดียววางบิล" bulk-bill pattern · 🟠 · M

**What:** Owner mentioned a "ปุ่มเดียววางบิล" — checkbox-select forwarders or
containers, then *one button* posts the bills, marks them ready-to-bill, and notifies
accounting. Today: `/admin/forwarders` has bulk-action checkboxes
(`adminBulkUpdateForwarderStatus`), `/admin/withdrawals` and `/admin/wallet` have
bulk-approve actions. But these are **status changes**, not **bill posting** — there's
no "select 30 forwarders that have arrived but haven't been billed, click *Post all
bills*, and an invoice PDF + customer notification + accounting hand-off fires for
each".

**Why:** [`chat-analysis-2026-05-16.md`](../../audit/chat-analysis-2026-05-16.md)
W-2 (truck booking template — staff manually paste the same fields N times),
[`cargo-ops-forensics-2026-05-16.md`](../../audit/cargo-ops-forensics-2026-05-16.md)
A2/A3 (paid-but-unpaid desync — bills posted at the wrong time). The pattern owner
wants is "the system batches the repetitive thing".

**Fix:** extend `/admin/forwarders` bulk-action to support `kind: 'bill-post'`:
1. Select N rows (status = `arrived_thailand` AND `bill_posted_at IS NULL`)
2. Click "วางบิลทั้งหมด"
3. Server action loops: generates the bill, posts to customer, opens a `work_item`
   for accounting (entity = `forwarder`, type = `bill_review`), notifies. Audit
   row per forwarder.
4. Returns a summary toast + a persisted bulk-run row (H-6 in `gap-admin.md` —
   the existing bulk patterns lose partial-failure info).

Same pattern for `/admin/containers` ("ปิดตู้ทั้งหมด"), `/admin/yuan-payments`
("อนุมัติทั้งหมด" — already exists, just needs the persist-bulk-run polish).

**Effort:** M (2-3 days incl. testing). **Depends on:** 2.5 (the work_item hook
must fire on bill-post so accounting sees it).

### 2.8 No staff performance dashboards beyond company-wide `/admin/kpi` · 🟠 · M

**What:** `/admin/kpi` (Tier-1) shows company-wide revenue + container throughput
+ signups. But there's **no per-sales-rep dashboard** (a sales manager cannot see
"how is วิน doing this month — leads handled, deals closed, commission earned"),
**no per-warehouse-staff dashboard** (scan rate, error rate, batches packed), **no
per-driver dashboard** (runs completed, on-time %), **no per-CS-agent dashboard**.
The KPI page is for the CEO/super; not for a team leader.

**Why:** the `audit-kpi-dashboard` skill names this pattern. The legacy `report-user-sales-history`
+ `sales-by-rep` cover sales — but as full-screen reports, not a personal dashboard.

**Fix:** generate per-role personal dashboards:
1. `/admin/me` — landing for any admin: "your N open work_items, your overdue count,
   your @ mentions, your last week of activity".
2. `/admin/customers/[id]` + `?as=team-leader` view — drill-down to "this customer's
   touchpoints this month, owned by which rep, current open work_items".
3. `/admin/hr/employees/[id]?tab=performance` — extend the existing employee detail
   page with a per-employee work_item throughput chart.

Reuse the `/admin/kpi` `force-dynamic` + `Promise.all` query pattern; no migration
needed if work_items + audit_log are queried.

**Effort:** M (1 week). **Depends on:** 2.5 (the hook must be wired or counts are empty).

### 2.9 No section-scoped RBAC (every role sees a whole module or nothing) · 🟠 · M

**What:** A `sales_admin` sees **every** customer; there's no "your reps' customers
only" scoping. A `warehouse` role sees **every** container; no "your warehouse only"
when Pacred opens a 2nd warehouse. A `cs_admin` (when added per 2.1) will see every
ticket, not "yours-and-unclaimed". This is the legacy `companyType/department/section`
triple that the legacy PCS sidebar uses to render 22 different menus — Pacred
flattened it to a role enum.

**Why:** [`ops-roles.md`](../../briefs/ops-roles.md) "RBAC summary" mentions
`hr_admin` and `pricing_admin` as optional splits. Real growth makes section-scoping
necessary — at 50 staff, "every sales sees every customer" is a PDPA hole.

**Fix:** add an optional `admins.scope_json` column (e.g.
`{warehouse_ids: ['gz', 'th'], rep_id: '<uuid>'}`). RLS policies on customer-facing
admin reads consult this. Sidebar menu can also gate items by scope, not just role.
Defer the full implementation but ship the **column + a `scopeMatches()` helper +
2 sample uses** (warehouse, sales rep) so the pattern is in place.

**Effort:** M (2-3 days for the scaffolding; per-table rollout incremental). Depends
on: nothing.

### 2.10 No customer impersonation / view-as-customer · 🟠 · M

**What:** `actions/admin/impersonation.ts` exists (199 LOC, so the harness is there)
— but I could not find a UI surface that calls it. Support staff cannot see the
customer's portal as the customer sees it. Every "ลูกค้าบอกว่าหน้าจอขึ้นแบบนี้" is
debugged blind. G-4 in [`gap-admin.md`](../gap-admin.md).

**Why:** G-4 evidence + [`legacy-chat-dev-it-momo.md`](../legacy-chat-dev-it-momo.md)
DI-2 (support reconciling customer-side state by hand).

**Fix:** add an "👁 View as customer" button on `/admin/customers/[id]`. Calls
`startImpersonation(profileId)` from the existing action, sets a short-TTL
service-role-attested cookie, redirects to `/dashboard?impersonating=…`. The
public layout reads the cookie + shows a red "🔴 IMPERSONATING <member_code>"
banner across the top. Audit row. Auto-clear on logout or after 1 hour. Super+ops
gated.

**Effort:** M (2-3 days). **Depends on:** verifying the existing action is wired
correctly.

### 2.11 Settings is thin · 🟡 · M

**What:** `/admin/settings` covers contacts + TOS + notifications + business-config.
Missing admin-editable: OTP TTL / rate-limit numbers, wallet min-deposit, feature
flags, cashback %, deposit bank accounts, sender numbers, SLA thresholds. Each is
a code constant or env today → a dev ticket to change. G-10 in `gap-admin.md`.

**Fix:** a `system_config` key/value table + a small admin editor + a `getConfig(key,
default)` helper that prefers env over DB over default. Cache + invalidate on edit.

**Effort:** M (2 days). **Depends on:** nothing.

### 2.12 The notification outbox is invisible to admins · 🟡 · S

**What:** `sendNotification()` fires fire-and-forget. A failed LINE push (token
expired, user blocked OA, SMS credit ran out) is silently lost. G-5 in
[`gap-admin.md`](../gap-admin.md).

**Fix:** `/admin/system/notifications` already exists — extend it to show the
per-message delivery status (notification_status row added by migration 0070).
A "resend" button. Filters by channel / status / date. Surface the SMS-balance
alert (R-M3).

**Effort:** S (1 day). **Depends on:** nothing.

### 2.13 No admin global "act on customer" toolkit · 🟡 · M

**What:** Staff can't (without SQL) force-logout a customer, view their active
sessions, force-clear OTP rate-limit, regenerate a token, recompute wallet
balance, manually fire a notification. Each is an action that ad-hoc happens once
a week and goes to the dev. The actions exist in `actions/admin/*` — but there's
no unified "support panel" on `/admin/customers/[id]`.

**Fix:** add a right-rail "Support actions" panel on `/admin/customers/[id]`:
- Recompute wallet
- Reset OTP rate-limit
- Resend last notification
- Force logout
- View 360°: latest 5 forwarders, 5 orders, 3 yuan payments, wallet balance, last
  3 contacts
- 👁 View as customer (2.10)

All super+ops gated, all audited.

**Effort:** M (2-3 days). **Depends on:** 2.10.

### 2.14 Container model has two parallel tables · 🟡 · M

**What:** H-3 in [`gap-admin.md`](../gap-admin.md): `/admin/containers` writes the
legacy `containers` table; `/admin/warehouse/containers` writes the canonical
spine `cargo_containers`. Both live, both have "create container" forms. Data
drift.

**Fix:** pick spine as canonical. Convert `/admin/containers` to a read-only
redirect (or delete after verifying no writer). Already specced — execute.

**Effort:** M (1 day to verify, 1 day to write the redirect).

### 2.15 No org-chart / reporting structure visible inside daily admin · 🟡 · S

**What:** `/admin/hr/org-chart` and `/admin/hr/org-table` exist (HR module). But
when a CS agent wants to know "who is the team leader for sales-คาร์โก this month"
or "who do I escalate a customs issue to", they navigate to HR — a different mental
space. No tooltip-on-name, no escalation chain on a `work_item`.

**Fix:** small mod — when rendering an admin's name on the work-board card, the
inbox, the audit log, hover shows {department, team leader, contact} pulled from
the org_table. Or click → mini-card. Reuse the `employees` data.

**Effort:** S (1 day). **Depends on:** nothing.

### 2.16 The QA / SLA-breach queue module is missing · 🟡 · L

**What:** Legacy PCS has 11 SLA-breach queues (รอชำระเกิน 1 วัน · รอชำระค่านำเข้าเกิน
2 วัน · ยกเลิกออเดอร์ · เครดิตเกินกำหนด · สั่งซื้อรอเกิน 10 นาที · รอร้านจีนส่ง
เกิน 2 วัน · รอเข้าโกดังจีนเกิน 2 วัน · กำลังมาไทยเกิน · สินค้าไม่มีเจ้าของ · เตรียมส่งเกิน ·
ไม่ติดต่อลูกค้าใหม่เกิน 2 วัน). [`d1-fidelity-admin.md`](../d1-fidelity-admin.md) §11
flags this as the biggest QA & QC gap. Pacred has a few in `/admin/reports/*`
but no unified QA module.

**Fix:** the `blockQA` block in `lib/admin/sidebar-menu.ts` already lists these 11
items as nav links. But each href today is a `/admin/reports/...?sla=...` query
filter — there is **no QA dashboard surfacing them all at once with red/yellow/green
SLA cards**. Build `/admin/qa` with one card per queue, count + age-of-oldest +
"open" button. The data sources are mostly already there in the reports.

**Effort:** L (the dashboard is M; per-queue tuning is L).

### 2.17 The Tier-2 menu has Pacred-only modules above legacy fidelity · 🟡 · S

**What:** [`d1-fidelity-admin.md`](../d1-fidelity-admin.md) §11 calls out — `/admin/board`,
`/admin/kpi`, `/admin/incidents`, `/admin/bookings`, `/admin/broadcasts` are
Pacred-additions. They are good additions, but visually they sit alongside the
legacy menu families in `lib/admin/sidebar-menu.ts` (see `blockReport` adding
`/admin/kpi` as `report.web`, `blockExtIncidents` in the Extension section). The
owner reaction was partly "there's stuff here that isn't in our system" —
prominence is itself a fidelity miss.

**Fix:** group the Pacred-additions under one "ส่วนเสริม / Enhancements" section
below `Extension`. Easy edit to `lib/admin/sidebar-menu.ts`.

**Effort:** S (4 hours).

### 2.18 Action-layer bulk operations lose partial-failure data · 🟡 · S

**What:** H-6 in [`gap-admin.md`](../gap-admin.md). `adminBulkApproveDeposits`
caps at 50, returns `errors[]` for a toast — once dismissed, the partial-failure
list is gone. No "which 3 of 50 failed" surface.

**Fix:** every bulk action also logs a single `*.bulk_*` audit row with the
failed-id list in the payload, surfaced via `/admin/audit` (G-1 search/filter).

**Effort:** S (1 day).

---

## 3. Recommendations — AP-portal v2 roadmap

> The phasing mirrors the Tier 0/1/2/3 vocabulary from
> [`capability-tools-strategy-2026-05-18.md`](../capability-tools-strategy-2026-05-18.md).
> Effort labels: S ≤1d, M 1-3d, L 1wk+. Owner column = who in the team owns the build.

### Phase AP-1 — RBAC + auth-z hygiene (the foundation, ~1 week)

| # | Item | Severity | Effort | Owner | Depends |
|---|---|---|---|---|---|
| AP-1.1 | Extend `admins.role` CHECK: + marketing, cs_admin, docs_admin, logistics_admin | 🔴 | S | ภูม | — |
| AP-1.2 | Sweep 31 ungated pages → add `requireAdmin([…])` | 🔴 | M | ภูม | AP-1.1 |
| AP-1.3 | RLS belt-and-braces on `wallet_transactions`, `yuan_payments`, `tax_invoices` | 🟠 | M | ภูม | AP-1.1 |
| AP-1.4 | `/admin/admins` capability matrix + "all supers" review | 🟠 | S | ภูม | AP-1.1 |
| AP-1.5 | Per-role sidebar entries for the 4 new roles (`menuMarketing`, …) | 🟠 | S | เดฟ | AP-1.1 |

**Exit:** the practical RBAC posture matches the documented posture; no admin can
read financial pages by URL-guessing if they shouldn't.

### Phase AP-2 — Mobile-first admin shell (the owner ask, ~1.5 weeks)

| # | Item | Severity | Effort | Owner | Depends |
|---|---|---|---|---|---|
| AP-2.1 | Sidebar → drawer at `<lg`, bottom-nav (4 most-used per role) at `<sm` | 🔴 | M | ปอน + เดฟ | — |
| AP-2.2 | `mobile-first-verify` skill run on the 12 highest-traffic admin pages | 🔴 | M | (Claude agent) | AP-2.1 |
| AP-2.3 | `/admin/scan` PWA — camera-first, offline-buffer, 6 modes in one shell | 🔴 | L | ปอน + ภูม | AP-2.1 |
| AP-2.4 | `/admin/clock` 1-tap attendance button (location + IP) | 🟠 | S | ภูม | — |
| AP-2.5 | Web Push notifications for mobile staff (mention, blocked-on-me, urgent) | 🟠 | M | ภูม | — |

**Exit:** the warehouse loader, driver, and QA inspector can run their full day
from a phone.

### Phase AP-3 — Connect the work-board to every domain action (~3 days)

| # | Item | Severity | Effort | Owner | Depends |
|---|---|---|---|---|---|
| AP-3.1 | Wire `ensureWorkItemForEntity()` into `adminAdvanceForwarder` | 🟠 | S | ภูม | — |
| AP-3.2 | … into `adminMarkServiceOrderShipped`, `adminMarkFreightShipmentDelivered` | 🟠 | S | ภูม | — |
| AP-3.3 | … into `adminAcceptCustomsDeclaration`, `adminIssueFreightInvoice` | 🟠 | S | ภูม | — |
| AP-3.4 | … into `adminApproveRefund`, `adminCloseQaInspection` | 🟠 | S | ภูม | — |
| AP-3.5 | `qa-flow-simulator` skill run: customer order → board card → CS pick-up | 🟠 | S | (Claude) | AP-3.1..4 |

**Exit:** the board actually fills with work; the §1 DNA promise is operational.

### Phase AP-4 — CS workspace + omni-channel inbox (~2 weeks)

| # | Item | Severity | Effort | Owner | Depends |
|---|---|---|---|---|---|
| AP-4.1 | Extend `contact_messages` schema: `assigned_to`, `priority`, `sla_due_at` | 🔴 | S | ภูม | AP-1.1 |
| AP-4.2 | `/admin/cs/*` workspace — queue, assignee picker, customer-360 panel | 🔴 | L | ภูม + ปอน | AP-4.1 |
| AP-4.3 | LINE OA inbound webhook → `contact_messages` | 🟠 | M | ภูม + ก๊อต | — |
| AP-4.4 | CS escalation → `work_item` hand-off (already wired by AP-3) | 🟠 | S | ภูม | AP-3 |

**Exit:** all customer touchpoints land in one queue; CS can run a real ticket
desk.

### Phase AP-5 — เบิก/จ่าย disbursement system (~3 weeks)

Per [`disbursement-system-2026-05-18.md`](../disbursement-system-2026-05-18.md) —
the full design exists, just needs build:

| # | Item | Severity | Effort | Owner | Depends |
|---|---|---|---|---|---|
| AP-5.1 | Migration: `disbursement_requests`, `disbursement_lines`, `disbursement_allocations`, `disbursement_fund` | 🔴 | M | ภูม | AP-1.1 |
| AP-5.2 | Migration: outbound `wht_certificates` (1%/3%) | 🔴 | M | ภูม | AP-5.1 |
| AP-5.3 | Lifecycle `requested → pending_approval → approved → paid → wht_issued` + audit | 🔴 | L | ภูม | AP-5.1 |
| AP-5.4 | Money-OUT safeguards (ceiling, overdraw, idempotency) | 🔴 | M | ภูม | AP-5.1 |
| AP-5.5 | `/admin/accounting/disbursements` v2 — claim modes, per-recipient lines | 🔴 | L | ภูม + ปอน | AP-5.3 |
| AP-5.6 | WHT cert PDF generator (50-ทวิ template) | 🟠 | M | ภูม | AP-5.2 |

**Exit:** the legacy "the one that always has problems" is fixed.

### Phase AP-6 — Bulk-bill + performance dashboards (~1.5 weeks)

| # | Item | Severity | Effort | Owner | Depends |
|---|---|---|---|---|---|
| AP-6.1 | "ปุ่มเดียววางบิล" — `/admin/forwarders?action=bulk-post-bill` | 🟠 | M | ภูม | AP-3 |
| AP-6.2 | `/admin/me` personal landing — your inbox, your audit, your KPI | 🟠 | M | ปอน | AP-3 |
| AP-6.3 | `/admin/hr/employees/[id]?tab=performance` per-employee throughput | 🟡 | M | ภูม | AP-3 |
| AP-6.4 | Per-rep / per-warehouse dashboards (filtered KPI views) | 🟡 | M | ภูม | AP-3 |
| AP-6.5 | Bulk-action partial-failure persisted audit rows | 🟡 | S | ภูม | — |

### Phase AP-7 — Polish + visibility (~1 week)

| # | Item | Severity | Effort | Owner | Depends |
|---|---|---|---|---|---|
| AP-7.1 | Customer impersonation UI (the action already exists) | 🟠 | M | ภูม | — |
| AP-7.2 | Right-rail "Support actions" panel on `/admin/customers/[id]` | 🟠 | M | ปอน | AP-7.1 |
| AP-7.3 | Staff-direct notice board (`staff_announcements`) | 🟠 | M | ภูม | — |
| AP-7.4 | Notification outbox UI extend | 🟡 | S | ภูม | — |
| AP-7.5 | System-config table + admin editor | 🟡 | M | ภูม | — |
| AP-7.6 | Org-chart hover on every admin name (across surfaces) | 🟡 | S | ปอน | — |
| AP-7.7 | `/admin/qa` SLA-breach dashboard (11 cards) | 🟡 | L | ภูม | AP-3 |
| AP-7.8 | Container model dedupe (kill `/admin/containers` legacy) | 🟡 | M | ภูม | — |
| AP-7.9 | Group Pacred-only modules under "Enhancements" section in sidebar | 🟡 | S | เดฟ | — |
| AP-7.10 | Section-scoping scaffolding (`admins.scope_json` + helper) | 🟡 | M | ภูม | AP-1.1 |

### What NOT to build (anti-recommendations)

- **A bigger global chat.** IC-1 design §5.4 already rejects this. The notice board
  in AP-7.3 is the bounded version.
- **A SaaS helpdesk (Zendesk / Freshdesk) for CS.** Customer-360° is the value
  proposition; SaaS would split it. Build per AP-4.
- **A standalone TMS for the dispatch board.** The §2.5 hook + a filtered
  `/admin/board?role=warehouse` view is the dispatch board.
- **A separate mobile-only admin app.** The web is the app; PWA-installable is
  enough (AP-2.3).
- **An ERP front-end (V3 redesign).** Per ADR-0010 V2 vs V3 — append to
  `docs/v3-wishlist.md` instead.

---

## 4. Deeper research questions

Things this audit did not have time to settle. Owner / ก๊อต / เดฟ decision needed,
not more code.

1. **`hr_admin` vs `super` split.** HR data is sensitive (salaries, PII). Today
   HR is gated to `super` and so is every other system surface. Should there be
   a dedicated `hr_admin` role? If yes, the HR module already exists — add the
   role + 1 migration. If no, document why HR is `super`-tier (audit + compliance
   answer for the founder).

2. **Section-scoping for sales reps.** "วิน's customers vs แนท's customers" — is
   this a hard wall (RLS-enforced, ม-ทำได้ never sees ฌ-customer) or a soft default
   filter (the queries default to "mine" but a sales manager toggles "all")? At
   Pacred's stage (4 humans) the soft default is fine. At 50 sales reps it isn't.
   When does the hard wall switch on? Encode this in ADR-0011.

3. **Sub-driver commission split.** `forwarder_driver` table has one role per
   forwarder. The owner-defined "sub-driver paired with a driver, gets X% of the
   commission" is unmodelled. Build a `forwarder_driver_pairings` mini-table now,
   or wait for revenue to demand it? Likely defer to V3.

4. **The interpreter (ล่ามจีน) workspace.** China-side translation work (supplier
   chat, product Q&A) is a real role. Today `/admin/commissions` lets the interpreter
   see their pay. But the *work* (translating a customer order) has no module —
   it sits in the China-shop flow as a manual side-process. Is this a build target
   for AP-portal v2, or part of `china-ops-container-closing` (volume-gated)?
   [`ops-roles.md`](../../briefs/ops-roles.md) §11/§12 leans toward later.

5. **Marketing role: build now or never?** Pacred has no marketing person today.
   If the future hire is months away, building `/admin/marketing/*` is premature.
   But the role-enum extension (AP-1.1) is cheap, and a placeholder menu prevents
   the next sidebar overhaul. Recommendation: ship the role + an empty `menuMarketing`
   that points to existing analytics-external links; build the actual workspace
   when there's a marketing person to use it.

6. **The U3 "BUY only the rails" stack — MarineTraffic + PEAK + NetBay + Customs
   Trader Portal + LINE Messaging API.** These all touch admin workflows. Sequence
   them against AP-2..AP-5. ก๊อต-call.

7. **Web Push browser support on Thai iOS Safari (< 16.4).** Critical mass of
   Pacred staff use iPhone. iOS 16.4+ supports Web Push when the app is added to
   the home screen. iOS < 16.4 cannot. The AP-2.5 plan assumes a fallback to
   LINE OA push for unsupported devices. Confirm staff iOS distribution before
   committing to Push-only flows.

8. **Print artefacts (legacy mPDF receipts vs new react-pdf).** D1 says the legacy
   PDFs are the binding visual spec. The disbursement system needs new PDFs
   (50-ทวิ). Decide: re-skin react-pdf to look mPDF-identical, or build new visual
   identity for the new artefacts. Owner-design call.

9. **The 22-legacy-sidebar fidelity question (D1 Phase B open question 1).** Today
   we have 7 per-role menus; legacy has 22. The intermediate path (richer roles +
   one-menu-per-role) is mid-flight. Keep at 7 (current state) or drive to the
   legacy 22 incrementally? Per ADR-0017, drive toward legacy fidelity — but the
   ROI on the 8th-22nd menu drops sharply.

10. **Long-term: a real admin event bus.** Today the work-board hook is "every
    action calls `ensureWorkItemForEntity()` post-mutation". This works but is
    fragile — adding a new domain status forgets the hook. A DB trigger on
    `*.status` updates would auto-fire. Cost: more SQL complexity, harder to
    test. Decide when 5+ domain types are wired.

---

## 5. Surprise finding (for the exec summary)

**The admin app has 128 page routes — 2x the prior "60+" count cited at session
start.** Of those:
- **31 still have no page-level role gate** (only the layout's "is some admin" check)
- **97 do** — about 76%
- The **30+ growth since launch** is mostly the Tier 0/1/2 capability waves +
  the D1 Phase B fidelity rework (per-role sidebar, `tb_cnt` ledger, board, inbox,
  incidents, KPI)

So Pacred's admin portal is **much bigger than its docs say** — and the read-side
authz hole (H-1) covers proportionally **more** pages than the original audit found.
AP-1.2 is bigger than the prior gap-admin estimate.

A second surprise: **the action layer is universally `withAdmin([roles]) +
logAdminAction` compliant** (the codebase grep found zero exceptions in 54 files).
This is genuinely uncommon and means the page-level fix in AP-1.2 is purely
defense-in-depth — the underlying mutations are safe. The lift on AP-1.2 is ~1
line per page × 31 pages ≈ 1 day, not the M estimate. Re-rate AP-1.2 to S.

---

## 6. References

- [`docs/briefs/ops-roles.md`](../../briefs/ops-roles.md) — the 14-role bible
- [`docs/research/capability-tools-strategy-2026-05-18.md`](../capability-tools-strategy-2026-05-18.md) — Tier 0/1/2/3 roadmap
- [`docs/research/operating-system-analysis-2026-05-18.md`](../operating-system-analysis-2026-05-18.md) — 8 internal-department gaps
- [`docs/research/d1-fidelity-admin.md`](../d1-fidelity-admin.md) — D1 fidelity gaps (admin side)
- [`docs/research/gap-admin.md`](../gap-admin.md) — admin gap-hunt G-1..G-10 + H-1..H-7
- [`docs/research/disbursement-system-2026-05-18.md`](../disbursement-system-2026-05-18.md) — เบิก/จ่าย design
- [`docs/research/internal-chat-system-2026-05-18.md`](../internal-chat-system-2026-05-18.md) — IC-1 chat design
- [`docs/audit/chat-analysis-2026-05-16.md`](../../audit/chat-analysis-2026-05-16.md) — workflows W-1..W-9
- [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../../audit/cargo-ops-forensics-2026-05-16.md) — A1..F3 cargo ops pain
- [`docs/audit/php-deep-sweep-2026-05-16.md`](../../audit/php-deep-sweep-2026-05-16.md) — AP1..AP24
- [`docs/decisions/0002-admin-architecture.md`](../../decisions/0002-admin-architecture.md) — admin RBAC + `is_admin()`
- [`docs/decisions/0017-pacred-faithful-pcs-port.md`](../../decisions/0017-pacred-faithful-pcs-port.md) — D1 faithful-port mandate

### Code paths surveyed

- `lib/admin/sidebar-menu.ts` (702 LOC) — per-role menus
- `actions/admin/sidebar-counts.ts` (158 LOC) — live-count badge query
- `actions/admin/work-items.ts` (344 LOC) — board mutations + hook
- `actions/admin/work-item-messages.ts` (919 LOC) — IC-1 chat
- `actions/admin/disbursements.ts` (231 LOC) — container disbursement actions
- `actions/admin/impersonation.ts` (199 LOC) — exists, unwired UI
- `actions/admin/pcs-container-payments.ts` — `tb_cnt` ledger (agent-a7f8 wave)
- `lib/auth/require-admin.ts` (71 LOC) — RBAC gate
- `app/[locale]/(admin)/layout.tsx` (46 LOC) — admin chrome
- `app/[locale]/(admin)/admin/board/page.tsx` (404 LOC) — work-board
- `app/[locale]/(admin)/admin/board/inbox/page.tsx` (499 LOC) — 3-tab inbox
- `app/[locale]/(admin)/admin/page.tsx` — main dashboard
- `app/[locale]/(admin)/admin/kpi/page.tsx` — exec KPI
- `app/[locale]/(admin)/admin/incidents/page.tsx` — IO-1 triage
- `components/sections/admin-sidebar.tsx` (321 LOC) — sidebar UI
- `components/admin/work-item-thread.tsx` — IC-1 thread panel

**End — `04-admin-employee.md`.** Centrepiece: the 14-role workspace map (§1.2);
biggest gap: the RBAC enum is stale + 31 pages have no page-level gate (§2.1);
biggest *missing* system: the unified เบิก/จ่าย disbursement workflow (§2.3); biggest
*owner-facing* miss: the admin shell is desktop-first (§2.4) — 8 hr/day staff
need a phone.
