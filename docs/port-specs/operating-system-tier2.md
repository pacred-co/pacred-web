# Port-spec — Operating-System Tier 2 (work-board · MOMO sync · department workspaces)

> **Status:** 🟢 work-board BUILT (this spec's §1 — `work_items` migration `0080` + `/admin/board` + actions) · 🟡 §2 (MOMO sync) + §3 (department workspaces) SPEC-ONLY, not built.
> **Date:** 2026-05-18 · **Owner:** เดฟ (work-board done) · ภูม (MOMO sync — touches `lib/cron/*`) · TBD (workspaces).
> **Source:** [`docs/research/operating-system-analysis-2026-05-18.md`](../research/operating-system-analysis-2026-05-18.md) §1.4 / §2-7 · [`docs/research/capability-tools-strategy-2026-05-18.md`](../research/capability-tools-strategy-2026-05-18.md) Tier 2.
>
> **Read with:**
> [`docs/research/momo-jmf-api-decoded.md`](../research/momo-jmf-api-decoded.md) (MOMO behaviour decode — §2 below builds on it) ·
> [`docs/briefs/ops-roles.md`](../briefs/ops-roles.md) (14 staff-role workspaces — §3 below scopes 4 of them) ·
> [`supabase/migrations/0080_work_items.sql`](../../supabase/migrations/0080_work_items.sql) (the work-board spine, shipped).

---

## 0. Context

The operating-system analysis found Pacred-web at launch is a **deep but un-joined** operating system: every department has its own list, no shared board, so a cross-department hand-off is still a LINE message. Tier 2 of the capability roadmap is the set of "big internal-operating-system builds" that close that:

1. **The cross-department work-board** — the centrepiece. **BUILT** (§1, this is a record of what shipped).
2. **The MOMO sync engine** — the China-warehouse partner-data ingest that keeps every container/parcel status true. **SPEC ONLY** (§2) — it touches `lib/cron/*` which is ภูม's active area; ภูม implements.
3. **Per-department workspaces** — CS · Acc-AP vendor-payment desk · planner/dispatch · docs queue. **SPEC ONLY** (§3) — each is a facet of the §1 board plus a department-specific surface.

---

## 1. ✅ The cross-department work-board — BUILT (record of shipped work)

> This section documents what was **already built** so the follow-on builds (§2/§3) can reuse it. The board is **live + verify-green**.

### 1.1 What shipped

| Artefact | Path |
|---|---|
| Migration `0080` — `work_items` table + RLS + `ensure_work_item()` helper | [`supabase/migrations/0080_work_items.sql`](../../supabase/migrations/0080_work_items.sql) |
| Validator + shared constants (enums, labels, transition map, helpers) | `lib/validators/work-item.ts` |
| Validator unit test (47 assertions — enum/label completeness · transition map · all 4 schemas · helpers) | `lib/validators/work-item.test.ts` |
| Server Actions — create / assign / advance / set-priority / `ensureWorkItemForEntity` | `actions/admin/work-items.ts` |
| Cross-department board UI | `app/[locale]/(admin)/admin/board/page.tsx` |
| Per-role "my inbox" | `app/[locale]/(admin)/admin/board/inbox/page.tsx` |
| Board-card client component (assign/advance/priority) | `app/[locale]/(admin)/admin/board/work-item-card.tsx` |
| Manual-create panel | `app/[locale]/(admin)/admin/board/create-work-item.tsx` |
| Sidebar entries ("กระดานงานข้ามแผนก" + "งานของฉัน") | `components/sections/admin-sidebar.tsx` |

### 1.2 The `work_items` model (shipped)

`work_items` is a **thin additive overlay** — it does NOT replace the domain tables (`forwarders`, `service_orders`, `cargo_*`, `freight_*`, `customs_declarations`, `contact_messages`, `refund_requests`, `freight_qa_inspections`). Each row points `(entity_type, entity_ref)` at a domain row (a `text` natural key — `f_no` / `h_no` / `code` / `shipment_code` / `uuid::text`) and carries the assignment + lifecycle state the domain row lacks:

- `type` — work category (10 values: `intake_review`, `payment_followup`, `warehouse_action`, `doc_issue`, `customs_clearance`, `delivery_dispatch`, `cs_followup`, `refund_process`, `qa_check`, `general`).
- `status` — `open → in_progress → done` (terminal) | `→ cancelled` (terminal); `blocked` = non-terminal hold.
- `assigned_role` (the department — always set) + `assigned_to` (optional pin to a person).
- `priority` · `due_at` (SLA) · `started_at` / `closed_at` lifecycle stamps.

**RLS** follows the `0062` role-pin keystone — every policy uses an explicit `is_admin(array[...])`, never bare `is_admin()`. SELECT is broad (all 7 operational roles — cross-department visibility *is* the point); WRITE is pinned to `super`+`ops` (other roles mutate via the `requireAdmin`-gated actions). No customer access.

**Optimistic locking** — every status/assign/priority write carries `.eq("status", expectedFrom)` so two admins on the same card cannot silently clobber each other (the second write hits 0 rows → `conflict_retry`).

### 1.3 The additive cascade hook — `ensure_work_item()` / `ensureWorkItemForEntity()`

§1.4 of the source analysis says the board should be **fed by the same status-change events the U1-2 cascade already fires on**. Rather than a DB trigger across 10 heterogeneous domain tables, the build exposes ONE idempotent path:

- DB: `ensure_work_item(entity_type, entity_ref, type, title, assigned_role, priority, due_at)` — SECURITY DEFINER; find-or-create (returns the existing open/in_progress/blocked item for the domain row, else inserts a fresh `open` one).
- Action: `ensureWorkItemForEntity({...})` in `actions/admin/work-items.ts` — wraps the RPC; **best-effort by contract** (a board-hook failure must NEVER roll back the domain status change).

**Follow-on wiring (NOT done — deliberately deferred, it touches domain action files):** a domain Server Action that changes a status should call `ensureWorkItemForEntity` afterwards. Highest-value call sites, in priority order:

| Call site (domain action) | When to open a work_item | Suggested `type` / `assigned_role` |
|---|---|---|
| `actions/admin/warehouse.ts` — container → `arrived` | container landed in TH, needs unload + billing | `warehouse_action` / `warehouse` |
| `actions/contact.ts` — `submitContactMessage` (new ticket) | a customer message lands | `cs_followup` / `ops` (→ `cs_admin` once §3.1 ships) |
| `actions/admin/freight-shipments.ts` — shipment created | a new freight job needs doc work | `doc_issue` / `accounting` (→ `docs_admin`) |
| `actions/refunds.ts` — refund request created | a refund needs processing | `refund_process` / `accounting` |
| order-placement actions (`forwarder` / `service_order` first paid) | a new paid order needs first-touch | `intake_review` / `ops` |

> **Why deferred:** wiring these is a one-line addition per call site but spans ~6 domain action files (some in ภูม's hot set). The board works fully via **manual create** today; the auto-hook is a clean follow-up once the call sites are owned. The `ensure_work_item()` function + `ensureWorkItemForEntity()` action are **already shipped and tested** — only the call-site `await` lines remain.

### 1.4 Verify status

`work_items` validator test added to `pnpm test:unit`. The board pages carry `export const dynamic = "force-dynamic"` (they render `<NavBar>`-class chrome + read cookies via `requireAdmin` — the Next-16 rule from `docs/learnings/nextjs-16-quirks.md`).

---

## 2. 🟡 SPEC — the MOMO sync engine

> **Build owner: ภูม** — this touches `lib/cron/*` + adds `app/api/cron/*` + fills `lib/integrations/momo-jmf/sync.ts`, all ภูม's active area. Do NOT build from this spec without ภูม; this is the implementation brief.

### 2.1 Why

MOMO is Pacred's China-warehouse + container-closing + cross-border-transport partner. **MOMO's API is the only digital source of container + per-parcel status.** Without a sync, every `cargo_containers` / `cargo_shipments` row goes stale the moment goods move — the customer shipment timeline (the §1.1 "strong" customer-facing layer) silently lies, and the legacy "ของอยู่ไหน / ในระบบไม่ขึ้น" complaint class returns. The sync is the data feed that keeps the whole status-visibility layer **true**.

This is a **BUILD** (per the build-vs-buy verdict — buy only the rails, build the workflow): the sync *engine* is Pacred code; MOMO is the upstream rail.

### 2.2 Hard prerequisite — get ground truth first (blocks all wiring)

Per [`momo-jmf-api-decoded.md`](../research/momo-jmf-api-decoded.md) §0 + §8.1: the decoded `?api=` query-router host (`api-cn.alilogisticshub.com`) is **WRONG** — reconstructed from a data-less SPA shell. The launch-eve correction ([`legacy-chat-datanew-2026-05-17.md`](../research/legacy-chat-datanew-2026-05-17.md) §0 / DN-1) gives the **real** surface:

- Base: `https://api.momocargo.com:8080`
- REST paths: `GET /api/func/get/import/track/{range}` · `GET /api/func/get/container/closed/{range}` · `GET /api/sack/get/info/{code}`
- Date range param: `YYYY-MM-DD+YYYY-MM-DD`

**Step 0 of the build is to re-confirm these against a live DevTools capture / the JS bundle and re-decode the response JSON shapes.** Until the response field names are confirmed, `lib/integrations/momo-jmf/types.ts` field names stay provisional. The behavioural model (§2.3-2.5) is solid regardless.

### 2.3 Architecture

```
Vercel Cron (every 15 min — legacy cadence)
  → app/api/cron/momo-jmf-sync/route.ts
      → wrapped by lib/cron/instrument.ts (writes cron_invocations — 0070)
      → lib/integrations/momo-jmf/sync.ts  ← THE ENGINE (fill the skeleton)
          → momo-jmf/client.ts   (typed fetch, Bearer JWT, demo-mode)
          → upsert into cargo_containers / cargo_shipments / cargo_*_tracking
          → log transitions to cargo_container_status_history
          → (Tier-2 tie-in) call ensureWorkItemForEntity() on a
            container → 'arrived' transition  →  a warehouse work_item
```

The engine is **idempotent** (re-running a 15-min window must not double-write) and **incremental** (poll by a stored `momo_jmf_last_sync` watermark in `public.settings`, query the date-range param).

### 2.4 The sync loop (fill `lib/integrations/momo-jmf/sync.ts`)

1. **Read watermark** — `momo_jmf_last_sync` from `public.settings` (default: 7 days back on first run).
2. **Fetch closed containers** — `GET /api/func/get/container/closed/{range}`. For each:
   - Upsert `cargo_containers` keyed on `code` (the `GZE…`/`GZS…` code).
   - Map MOMO container status (9-state) → Pacred `cargo_containers.status` (6-state) via `MOMO_STATUS_TO_PACRED` in `types.ts`.
   - On a status **change**, append a `cargo_container_status_history` row.
   - Reconcile `transport_mode` against the `code` prefix (`GZE`=truck, `GZS`=sea) — flag mismatches (§2.6 bug #4).
3. **Fetch import tracking** — `GET /api/func/get/import/track/{range}`. For each parcel:
   - Resolve `customer_ref` (`PR001`-series) → `profile_id`.
   - Group split siblings (`<tracking>-2`, `-3`) by tracking-root — a split is NOT a new shipment (§2.6 bug #2).
   - Normalize `cargo_type` via `toCanonicalCargoType()`.
   - Store `expected_qty` + `received_qty` **separately** — never trust a lone `qty=1` (§2.6 bug #1).
   - Upsert `cargo_shipments` keyed on `shipment_code`; map MOMO tracking-stage → `cargo_shipments.status` (8-state).
   - Append `cargo_shipment_tracking` events.
4. **Sub-fetch sack info** — `GET /api/sack/get/info/{code}` to enrich `cargo_sacks` (migration `0068`) where a sack code is present.
5. **Write watermark** — update `momo_jmf_last_sync`.
6. **Tier-2 tie-in** — when step 2 transitions a container to `arrived`, call `ensureWorkItemForEntity({ entityType: "cargo_container", entityRef: code, type: "warehouse_action", title: "ตู้ <code> ถึงไทย — รอลงตู้ + วางบิล", assignedRole: "warehouse" })`. This is the additive hook from §1.3 — it makes an arrived container *appear* on the warehouse board instead of being *noticed*.
7. **Cron-health** — the `lib/cron/instrument.ts` wrapper already writes a `cron_invocations` row (success/partial/failure + `result_summary`) — surfaced on `/admin/system/crons`. The sync route just needs the wrapper; no new health code.

### 2.5 Invoice / payment sync (the 2026-05-15 credit pivot)

MOMO shifted to a **partner credit ledger** — container/transport charges are billed as invoices with a due date, and **parcel release is payment-gated** (a container can be physically `arrived` but its parcels stay blocked until the transport invoice is settled — `momo-jmf-api-decoded.md` §5).

The sync MUST read an **invoice/payment-status field**, not only physical status. Surface unpaid container invoices on `/admin/warehouse`, and **block "ready for pickup"** on the customer side until the container's transport invoice is `paid`. Cross-reference the shipped E7 freight receipt + payment ledger (migration `0052`).

### 2.6 Defensive layer — design against these known MOMO data bugs

From `momo-jmf-api-decoded.md` §7 — recurring failures the engine must absorb:

1. **`qty` collapses to `1` on container splits** (pre-`GZS260429-1`) → store `received_qty` vs `expected_qty` separately; never trust a lone `qty=1`.
2. **Split parcels = sibling tracking numbers** (`-2`/`-3`) → group by tracking-root.
3. **Measurement errors → over-billing** (a typo'd `299` cm) → reject/flag absurd CBM (any dimension > 250 cm → admin review); admin dims/weight override.
4. **Status ≠ container-number mismatch** → reconcile `transport_mode` vs `code` prefix.
5. **"ในระบบไม่ขึ้น"** (physically arrived, not in system) → show **sync freshness** on every container/shipment view ("last MOMO sync: 4 min ago" — the customer freshness pill already exists; mirror it staff-side); admin "rebind tracking → container" tool.
6. **Payment-gated release** → §2.5.

> **Warehouse-staff override wins.** Treat MOMO data as advisory — a warehouse-staff manual status override beats a MOMO status (per `container-centric-model.md` open-question #3). Log the divergence.

### 2.7 Webhook (only if MOMO offers push)

`app/api/webhooks/momo-jmf/route.ts` — verify signature + IP allowlist; same upsert path; idempotent by `event_id`. If MOMO is pull-only, skip — the 15-min cron suffices. (Open MOMO-1 question.)

### 2.8 Effort + sequencing

- **M** once §2.2 ground truth is in hand; **blocked** until then.
- The `client.ts` / `types.ts` scaffold exists; `sync.ts` is a skeleton to fill.
- Sequence: (a) confirm API surface → (b) fill `client.ts` REST paths → (c) extend `types.ts` (tracking-status enum + map, `MomoInvoice` / `MomoWalletTxn`) → (d) fill `sync.ts` loop → (e) add the cron route + `vercel.json` entry → (f) wire the §2.5 invoice/payment join + §2.6 defensive layer.

---

## 3. 🟡 SPEC — per-department workspaces

> Each workspace is a **facet of the §1 work-board** (the board filtered to that department's `work_items`) **plus** a department-specific domain surface. They share the board's spine — none rewrites domain tables. Build order: CS → Acc-AP → planner/dispatch → docs. Each is **S–M** effort.

### 3.0 Shared prerequisite — the role enum (RBAC §7 of the source analysis)

Three of the four workspaces want a **new `admins.role` value** (`cs_admin`, `docs_admin`; planner reuses `ops`/a new `logistics_admin`). The role enum is currently the 7-value set (`super`, `ops`, `accounting`, `sales_admin`, `warehouse`, `driver`, `interpreter` — extended by `0033` + `0054`). A migration in the **`0081`+ เดฟ-reserved block** extends the `admins.role` CHECK with the new roles **before** any of these workspaces ship — same drop-constraint + add-constraint pattern as `0033`/`0054`. The `work_items.assigned_role` CHECK + `lib/validators/work-item.ts WORK_ASSIGNABLE_ROLES` must be extended in lockstep.

### 3.1 CS workspace — `/admin/cs/*`

**Gap (source §5):** CS is a 4-state `contact_messages` list — **no assignee, no priority, no SLA, no customer-360, no internal-note thread**. CS is the customer's front door and today it is a flat list.

**Build:**
- **Schema** (`0081`+ block): add to `contact_messages` — `assigned_to` (uuid → profiles), `priority`, `sla_due_at`, and a new `contact_message_notes` table (internal-note thread: `contact_message_id`, `author_admin_id`, `body`, `created_at`).
- **Role:** add `cs_admin` to the enum (§3.0).
- **Pages:** `/admin/cs` — ticket queue grouped by assignee + status + priority (reuse the board-card pattern); `/admin/cs/[id]` — ticket detail with a **customer-360 side-panel** (wallet balance, recent orders, containers, notifications — the data already exists on `/admin/customers/[id]`, embed it) + the internal-note thread.
- **Board tie-in:** every CS ticket opens a `cs_followup` work_item (via `ensureWorkItemForEntity` on `submitContactMessage`); escalation routes a `work_item` to `ops`/`accounting`.
- **Omni-channel (follow-up):** a LINE Messaging API webhook receiver drops inbound LINE OA messages into `contact_messages` so all channels share one queue (BUY only the LINE API — already Pacred's channel; build the connector).
- *Measured:* first-response time, resolution time, % within SLA.

### 3.2 Acc-AP vendor-payment desk — `/admin/accounting/ap/*`

**Gap (source §4):** U2-2 shipped the **container-cost ledger** (`container_costs` / `container_disbursements`, migration `0069`) — but there is **no general vendor-invoice → approve → pay → mark-paid workflow** for non-container payees (customs broker, fumigation, messenger, office). The money-OUT side is a stub.

**Build:**
- **Schema** (`0081`+ block): a `vendor_invoices` table — `vendor_name` (or FK to `org_contacts`), `invoice_no`, `amount_thb`, `wht_amount_thb`, `status` (`recorded → approved → paid` | `→ rejected`), `due_at`, `approved_by` / `paid_by` + timestamps, optional link to a `freight_shipment` / `cargo_container`. Mirror the `container_disbursements` shape + the `refund_requests` `*_consistent` CHECK discipline.
- It MUST link to the **same WHT model** the AR/freight side uses (`withholding_tax_entries`, migration `0044`) — splitting AP off would double-key every payee.
- **Pages:** `/admin/accounting/ap` — vendor-invoice list by status + aging; `/admin/accounting/ap/new` — record an invoice; per-invoice approve/pay actions (each `requireAdmin(["super","accounting"])`-gated, optimistic-locked).
- **Board tie-in:** a recorded vendor invoice opens a `payment_followup` work_item for the approver.
- **PND.53 aggregation:** a monthly view summing AP-side WHT for the filing.
- *Measured:* invoice→paid cycle time, unpaid-vendor aging, PND.53 figure auto-aggregated.

### 3.3 Planner / dispatch board — `/admin/planning/*`

**Gap (source §2):** matching shipments→containers, scheduling pickups, assigning drivers to runs is ad-hoc — there is no planner board. (`/admin/driver-runs` exists but is the driver's own view, not a dispatcher's.)

**Build:**
- **No new core table** — this is the §1 board filtered to **fulfilment-stage** `work_items` (`warehouse_action`, `delivery_dispatch`) plus a thin scheduling surface. Reuse `forwarder_driver` (migration `0028`) for run assignment.
- **Role:** reuse `ops`, or add `logistics_admin` if least-privilege is wanted (§3.0).
- **Pages:** `/admin/planning` — a board of containers awaiting unload + orders awaiting a delivery run, with assign-driver actions; a calendar/day view of scheduled pickups.
- **Driver mobile view (follow-up, BUILD not buy):** `/admin/driver-runs` + `/admin/barcode/driver` made mobile-first (responsive PWA) — a 2-screen field view, no SaaS.
- **Live vessel GPS (BUY the feed):** MarineTraffic API for sea-leg position — the one genuine BUY (Pacred cannot generate ship GPS); display in-house. Already `U3-3`.
- *Measured:* containers awaiting assignment, avg pickup-to-delivery days, on-time %.

### 3.4 Docs-team queue — `/admin/docs/*`

**Gap (source §3):** `customs_declarations` (`0057`) + `freight_invoices`/`tax_invoices` each have their own list — but there is **no "all documents awaiting action" view**. The docs team cannot see, in one place, every invoice / Form-E / declaration that is stuck.

**Build:**
- **No new core table** — the §1 board filtered to `doc_issue` + `customs_clearance` `work_items`, joining across `customs_declarations` / `freight_invoices` / `tax_invoices`.
- **Role:** add `docs_admin` to the enum (§3.0).
- **Pages:** `/admin/docs` — every document in `draft`/un-issued state, by type + age; quick links to each document's existing detail page.
- **Document generators (separate BUILD, already specced):** Form-E / D-O / Commercial-Invoice+Packing-List PDF generators — see [`freight-document-suite.md`](freight-document-suite.md); same `components/pdf/*` pattern as the shipped receipt PDFs.
- *Measured:* draft→issued cycle time, count issued/day, documents stuck in `draft` > N days.

---

## 4. Sequencing summary

| # | Build | Status | Owner | Effort | Blocks |
|---|---|---|---|---|---|
| 1 | Work-board (`work_items` + `/admin/board` + inbox + actions) | ✅ **shipped** | เดฟ | L | — |
| 1b | Wire `ensureWorkItemForEntity` into ~6 domain action call-sites | follow-up | TBD | S | — (board works via manual create) |
| 2 | MOMO sync engine | 🟡 spec | ภูม | M | §2.2 API ground-truth capture |
| 3.0 | `admins.role` enum extension (`0081`+) | 🟡 spec | เดฟ | S | gates 3.1 / 3.4 |
| 3.1 | CS workspace | 🟡 spec | TBD | M | 3.0 |
| 3.2 | Acc-AP vendor desk | 🟡 spec | TBD | M | — |
| 3.3 | Planner / dispatch board | 🟡 spec | TBD | S–M | — |
| 3.4 | Docs-team queue | 🟡 spec | TBD | S | 3.0 |

**The pattern:** every Tier-2 piece either *is* the work-board (§1) or is a *facet of it* (§3 = the board filtered to a department) — plus the MOMO sync (§2) that keeps the data the board indexes **true**. None rewrites a domain table; all are additive. That is the correct application of เดฟ's "build the workflow, buy only the rails" rule — the only BUYs in this whole spec are the MOMO API feed (§2) and MarineTraffic GPS (§3.3).

---

## 5. Cross-references

- 🎯 The synthesis → [`docs/research/capability-tools-strategy-2026-05-18.md`](../research/capability-tools-strategy-2026-05-18.md)
- 🧭 The full operating-system audit → [`docs/research/operating-system-analysis-2026-05-18.md`](../research/operating-system-analysis-2026-05-18.md)
- 🔬 MOMO behaviour decode → [`docs/research/momo-jmf-api-decoded.md`](../research/momo-jmf-api-decoded.md) · real API surface → [`docs/research/legacy-chat-datanew-2026-05-17.md`](../research/legacy-chat-datanew-2026-05-17.md) §0
- 👷 The 14 staff-role workspaces → [`docs/briefs/ops-roles.md`](../briefs/ops-roles.md)
- 🏗 Container spine → [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md)
- 📄 Freight document generators → [`docs/port-specs/freight-document-suite.md`](freight-document-suite.md)
- 🧱 The work-board migration → [`supabase/migrations/0080_work_items.sql`](../../supabase/migrations/0080_work_items.sql)

**End — operating-system Tier-2 spec.** §1 (the work-board) is built + verify-green; §2 (MOMO sync) and §3 (department workspaces) are implementation briefs for ภูม + the dev team.
