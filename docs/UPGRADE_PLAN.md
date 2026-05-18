# 🚀 Pacred Roadmap — D1 phase plan (faithful PCS port)

> **The single canonical forward plan** — phases, stages, and who-owns-what for
> `pacred-web` under **D1**. Updated each save-point.
>
> **D1 (2026-05-18)** — the owner reviewed the rebuilt-from-scratch Pacred app and
> **rejected it**: UI *and* logic-loop look nothing like the legacy **PCS Cargo**
> system the business runs on. The decision: **Pacred *becomes* the legacy PCS
> Cargo system, faithfully — rebranded `PCS` → `PR`.** A faithful port, not a
> reinterpretation. Canonical source of truth: [ADR-0017](decisions/0017-pacred-faithful-pcs-port.md).
>
> **This doc owns the SEQUENCE.** Per-phase detail lives in the runbook / gap-map
> docs (linked per item) — this plan does not duplicate them. Master single-read:
> [`STRATEGY.md`](STRATEGY.md).
>
> **Scope = V2 `pacred-web`.** V3 is a separate repo (`pacred-DPX`,
> [ADR-0010](decisions/0010-v2-v3-version-strategy.md)) — unaffected by D1, out of
> scope here; append V3 ideas to `v3-wishlist.md`.

---

## What changed — this plan supersedes the pre-D1 roadmap

The previous `UPGRADE_PLAN.md` was the **pre-D1 roadmap**: Phase 0 foundation →
Phase 1 release → Phase 2 the six owner systems → Phase 3 future, built around
the Tier 0/1/2/3 capability synthesis. **D1 supersedes that whole framing.**

- The rebuilt-from-scratch app is not the deliverable. The deliverable is a
  **faithful port of PCS Cargo**, rebranded `PCS` → `PR`.
- The Tier 0/1/2/3 capability work and the six Phase-2 systems are **not
  cancelled** — they are **deferred to Phase C**, re-sequenced *after* the
  faithful port works. See [Phase C](#phase-c--pacred-enhancements-deferred).
- In-flight pre-D1 feature work (e.g. BK-1 booking flow, freight V-E1.1)
  **pauses**; the team pivots to Phase B.
- [ADR-0010](decisions/0010-v2-v3-version-strategy.md): "V2 = rebuilt
  owner-pleaser" is superseded — **V2 is now "faithful PCS port"**.

---

## How to read this

- **Phase** = a band of work. **Stage** = a shippable increment inside a phase.
- A stage is DONE only when verified: `pnpm verify` + a production build smoke
  + a [`qa-flow-simulator`](../.claude/skills/qa-flow-simulator/SKILL.md)
  functional pass (see [AGENTS.md §11](../AGENTS.md)).
- **Mobile-first is cross-cutting** — every customer-visible stage is built +
  checked at a phone viewport. See [`conventions.md` §11](conventions.md) +
  [`mobile-first-playbook.md`](mobile-first-playbook.md). It is not a phase; it
  applies to all of them.
- **The three D1 phases run in order: A → B → C.** Phase A is nearly done;
  Phase B is the bulk of forward work; Phase C is deferred.

---

## Phase A — 🗄 DATA MIGRATION (legacy `pcsc_main` → Pacred Postgres)

Port the entire legacy MySQL database `pcsc_main` — **117 tables, ~3.78M rows,
~8,898 customers** — into Pacred's PostgreSQL / Supabase. `PCS<n>` → `PR<n>`,
keeping the exact running number. Custom auth so migrated customers sign in with
their **existing password — no reset**.

> **Runbook (canonical):** [`runbook/pcs-data-migration.md`](runbook/pcs-data-migration.md)
> — full approach, artifacts inventory, the production-load procedure, and the
> open/pending items. This plan tracks the *sequence*; the runbook holds the
> *how*.

| Stage | What | Status | Owner |
|---|---|---|---|
| **A-1 Schema port** | 117 tables MySQL → PostgreSQL — faithful (legacy names / types / even typos kept); `tb_` prefix so no collision with Pacred's own tables. | ✅ **done** | เดฟ |
| **A-2 Converter** | `PCS` → `PR` rebrand on member-code columns (`userID`, `userIDMain`) only; 3,780,238 rows → COPY format; 2,288,128 `PCS→PR` transforms; zero-dates → NULL; NUL bytes stripped; encoding handled. | ✅ **done** | เดฟ |
| **A-3 Dry-run validated** | Loaded into a throwaway PostgreSQL 17.10 — all 117 tables load clean; every table's row count reconciles MySQL ↔ PostgreSQL exactly (0 load failures · 0 mismatches). Auth bridge (`lib/auth/pcs-legacy-password.ts`) verified against 7 real hashes + 5 vectors. New-customer member-code gap-fill SQL written. | ✅ **done** | เดฟ |
| **A-4 Customer-file migration** | Migrate the legacy customer upload folders (`images/users`, `images/shops`, `storage/file`, `storage/slip`) into Supabase Storage. | 🔴 **pending** — the files live on the legacy production server, held by **แต้ม**; requested via the hand-over list. Blocked until แต้ม provides them. | เดฟ + แต้ม |
| **A-5 Production load** | Fresh final `pcsc_main` dump from แต้ม at cutover → reconvert → apply the 117-table schema as migration `0081_pcs_legacy_schema.sql` (confirm next free number) → load each COPY file via `psql` → apply the member-code generator → reconcile prod row counts ↔ source MySQL across all 117 tables. | 🔴 **pending** — gated on **เดฟ's go** + a final fresh dump. | เดฟ · gate by ก๊อต |

**Phase-A open decisions** (carried in the runbook §7 — need เดฟ):
- **8 special userIDs** — `PCSTT` / `PCSCARGO` / `PCSARNON` / `PCSFAM` (PCS +
  letters) and `PW` / `JET` / `FCL` / `AIGA` (no PCS prefix). Carried as-is.
  Decide: rewrite the `PCS<letters>` ones to `PR<letters>`?
- **New-customer numbering** — the lowest vacant numbers are `PR1`–`PR5`, so the
  fill-vacant rule gives the next signups `PR1`, `PR2`, … Confirm intended.

**Phase-A exit criteria:** A-4 + A-5 complete · prod row counts reconcile all
117 tables · migrated customers can sign in with their legacy password · the
`tb_*` schema coexists cleanly with Pacred's existing tables (nothing dropped).

> The pre-D1 PCS-customer-migration scaffolding — migration
> `0067_pcs_customer_migration.sql`, the `u2-1-pcs-customer-migration.md`
> runbook, `actions/admin/pcs-migration.ts` — is **superseded** by this
> full-system port (all 117 tables · custom auth · no reset). เดฟ decides the
> fate of the superseded files.

---

## Phase B — 🎯 WORKFLOW FIDELITY (the bulk of forward work)

Rework the Pacred app — **customer portal + admin back-office** — so its menus,
job statuses, container (ตู้) flow, and end-to-end logic-loop **match the legacy
PCS Cargo system exactly**. The goal is the D1 promise: staff and customers
(~8,898 of them, plus every operating role — warehouse, scanners,
receiving/shipping, accounting, audit) need **zero retraining**.

This is the **bulk of forward work** under D1. It is the phase that makes the
faithful port real — Phase A moves the data, Phase B makes the app behave like
the system everyone already knows.

### Scope (what "match exactly" covers)

- **Menus & navigation** — the customer portal and admin sidebar match the
  legacy PCS information architecture (the legacy member dashboard tiles, the
  ~85 admin modules under `pcs-admin/include/pages/`).
- **Job statuses** — the legacy status enums and their transitions, for orders,
  shipments, and the cargo flow — not Pacred's reinterpreted state machines.
- **Container (ตู้) flow** — the legacy receive → measure → close-sack →
  close-container → ship → arrive → release loop, as PCS staff run it.
- **End-to-end logic-loop** — the full quote → order → pay → ship → bill →
  close cycle behaves the way the legacy system behaves at every step.

### Stage breakdown — TODO (gap-map-driven)

> **Phase B is not yet broken into stages.** It needs a **gap-map-driven
> breakdown**: walk the legacy-vs-Pacred workflow gap map, group the divergences
> into shippable stages, assign owners, and slot them here. That breakdown is
> the first Phase-B task once Phase A clears (or runs in parallel — it needs no
> prod data).
>
> **Phase-B input — the legacy-vs-Pacred gap map** lives in
> [`docs/research/`](research/_index.md). The most directly relevant docs are
> the workflow gap-hunts that already compare Pacred's code against the legacy
> PCS member portal + admin:
> - [`research/gap-customer.md`](research/gap-customer.md) — customer-side
>   walk vs the PCS legacy member portal.
> - [`research/gap-admin.md`](research/gap-admin.md) — admin/back-office walk
>   vs the PCS legacy admin (~85 modules).
> - [`research/gap-revenue-flow.md`](research/gap-revenue-flow.md) — the
>   quote → order → billed → closed loop and its missing edges.
> - [`research/PACRED-GAP-ANALYSIS.md`](research/PACRED-GAP-ANALYSIS.md) +
>   [`research/PACRED-MASTER-STRATEGY.md`](research/PACRED-MASTER-STRATEGY.md) —
>   the syntheses; note these predate D1 and frame gaps as *enhancements* —
>   under D1, re-read them as **fidelity gaps to close**, not new capability.
> - The legacy decode docs (`legacy-chat-*.md`, `cargo-ops-forensics`, the PHP
>   deep-sweep audits) — evidence for how PCS actually behaves.
>
> When the breakdown is written, the stages land here as `B-1`, `B-2`, … with
> owners and gates, the same shape as Phase A.

**Phase-B owners** (per [ADR-0017](decisions/0017-pacred-faithful-pcs-port.md)
work-split — see the [work-split table](#work-split--who-owns-what-under-d1)):
- **ภูม** — Phase B *backend*: rework the admin + customer-portal backend onto
  the ported `tb_*` schema + the legacy workflow.
- **ปอน** — Phase B *frontend*: rework the customer-facing UI to match the
  legacy PCS look + flow.
- **เดฟ** — coordinates Phase B; integrates; carries Phase A to production.

**Phase-B exit criteria:** the customer portal + admin back-office menus,
statuses, container flow, and logic-loop match the legacy PCS system — verified
by walking the legacy-vs-Pacred gap map to zero remaining divergences, plus a
`qa-flow-simulator` pass on the end-to-end cargo loop.

> **Identity guardrail still holds.** The legacy PCS/TTP operation leaned on
> gray-channel practice (no-document "เหมาภาษี", HS-code / declared-value
> engineering). A *faithful port of the workflow* is **not** a port of those
> shortcuts — port the operational loop (statuses, container flow, the job
> lifecycle), never the compliance shortcuts. Pacred builds the legitimate,
> document-complete path only. Full statement:
> [`research/PACRED-MASTER-STRATEGY.md`](research/PACRED-MASTER-STRATEGY.md) §5.5
> and [`research/PACRED-GAP-ANALYSIS.md`](research/PACRED-GAP-ANALYSIS.md) §4.

---

## Phase C — 🔭 PACRED ENHANCEMENTS (deferred)

**Only after the faithful port works** (Phase A loaded + Phase B fidelity
verified) does Pacred layer its own improvements on top. Everything below is
**deferred, not cancelled** — it is re-sequenced *after* the faithful port per
[ADR-0017](decisions/0017-pacred-faithful-pcs-port.md).

### C.1 — The Tier 0/1/2/3 capability roadmap (deferred)

The pre-D1 capability synthesis
([`research/capability-tools-strategy-2026-05-18.md`](research/capability-tools-strategy-2026-05-18.md)).
Note: parts of Tier 0/1/2 were *built* on the rebuilt app pre-D1 — under D1 they
are revisited *after* Phase B, re-fitted onto the faithful-port app.

- **Tier 0 — lead funnel & conversion visibility** — `ContactForm` on `/contact`;
  the monitoring dashboard go-live (analytics env vars · Google Search Console +
  sitemap · Google Business Profile · Meta Business Suite).
- **Tier 1 — buy-bridge** — `/start-order` + `QuoteCTA` calculator→buy bridge;
  the CI `pnpm build` step; the `/admin/kpi` executive dashboard.
- **Tier 2 — internal OS** — the `work_items` cross-department work-board
  (`/admin/board` + `/admin/inbox`); MOMO sync + per-department workspaces.
- **Tier 3** — see C.2 (the six owner systems were the Tier-3 batch).

### C.2 — The six Phase-2 systems (deferred)

Six systems designed pre-D1 — four the owner (พี่ป๊อป) named + two for the
customer-acquisition push. Each has a design doc in
[`research/`](research/_index.md). **All deferred to Phase C** — sequenced after
the faithful port.

| # | System | Design doc |
|---|---|---|
| 1 | **Booking flow** — the Trip.com-style "เปิดออเดอร์ / กดซื้อ" surface | [`booking-flow-system`](research/booking-flow-system-2026-05-18.md) |
| 2 | **Customer intelligence** — LINE webhook + customer-360 + web behavior tracking | [`customer-intelligence-system`](research/customer-intelligence-system-2026-05-18.md) |
| 3 | **Internal org-chat** — shipment/job-scoped work-comms | [`internal-chat-system`](research/internal-chat-system-2026-05-18.md) |
| 4 | **Disbursement** (เบิก-จ่าย) | [`disbursement-system`](research/disbursement-system-2026-05-18.md) |
| 5 | **China-ops** (ปิดตู้) — volume-gated | [`china-ops-container-closing`](research/china-ops-container-closing-2026-05-18.md) |
| 6 | **Platform observability** (รายงานสถานะ Platform) | [`platform-observability-system`](research/platform-observability-system-2026-05-18.md) |

> Some of these (e.g. platform-observability IO-1, booking BK-1) had pre-D1
> in-flight work. Under D1 that work **pauses** — the team finishes the faithful
> port first, then resumes Phase C against the ported app.

### C.3 — Further future (signposted, not scheduled)

- **Native apps — Android + iOS** — most Pacred customers are on phones; a
  native app is a surface to consider once the faithful-port web is solid.
- **The 9 expansion ecosystem services** — customs-broker matching · tax-refund ·
  export · fumigation · consignment · pay-on-behalf · logistics/messenger (the
  service catalogue in [`../CLAUDE.md`](../CLAUDE.md) marked TBD).
- **U3 partner-integration tools** — MOMO JMF sync · NetBay ใบขนสินค้า · Customs
  Trader Portal · PEAK accounting · real-time ship tracking · fuel-surcharge
  calculator. Each is partner-credential-scheduled.
- **V3 (`pacred-DPX`)** — the employee-masterpiece rebuild, a separate repo
  ([ADR-0010](decisions/0010-v2-v3-version-strategy.md)). Unaffected by D1. The
  owner signals when to start; append ideas to `v3-wishlist.md`.

---

## Work-split — who owns what under D1

Per [ADR-0017 §Work-split](decisions/0017-pacred-faithful-pcs-port.md). All four
roles re-task under D1 — see the updated briefs in [`docs/briefs/`](briefs/).

| Role | D1 work |
|---|---|
| **เดฟ** | **Phase A** — drive the data migration to production (A-4 file migration + A-5 prod load) · integrate · **coordinate Phase B** (own the gap-map-driven stage breakdown). |
| **ภูม** | **Phase B backend** — rework the admin + customer-portal backend onto the ported `tb_*` schema + the legacy PCS workflow. |
| **ปอน** | **Phase B frontend** — rework the customer-facing UI to match the legacy PCS look + flow. |
| **ก๊อต** | **Ratify [ADR-0017](decisions/0017-pacred-faithful-pcs-port.md)** · clear the JMF API spec with แต้ม · the **production-load gate** (A-5). |

---

## Cross-cutting — applies to every phase

- **Mobile-first** — Pacred's customers arrive mostly on phones. Every
  customer-visible change is designed + verified at a phone viewport
  (360 / 390px) FIRST, then scaled up. [`conventions.md` §11](conventions.md) ·
  [`mobile-first-playbook.md`](mobile-first-playbook.md) · the
  `mobile-first-verify` skill. The faithful port is no exception — match the
  legacy *workflow*, but render it mobile-clean.
- **Quality gate** — no stage ships without `pnpm verify` + a production build
  smoke + a `qa-flow-simulator` functional pass. [AGENTS.md §11](../AGENTS.md).
  D1 plans work properly — don't ship half-built to chase a deadline.
- **Save-point pushes** — commit freely; push at save-points only
  ([`team.md` §3.0](team.md)).
- **Pacred-identity guardrail** — port the legacy *operational* loop, never the
  legacy *compliance shortcuts*. Every money / tax / declaration / customs
  surface builds the legitimate, document-complete, fully-audited path only.
  Full statement: [`research/PACRED-MASTER-STRATEGY.md`](research/PACRED-MASTER-STRATEGY.md) §5.5.
- **Don't preempt brand cleanup** — references to PCS / TTP / ไอแต้ม survive in
  code because some APIs are still "borrowed" interim; do not scrub them until
  ก๊อต confirms the matching API switchover ([`runbook/pcs-scrub-plan.md`](runbook/pcs-scrub-plan.md)).
  Note D1 changes member codes `PCS<n>` → `PR<n>` in *migrated data* — that is
  the migration, not the scrub.

---

## Cross-references

- 🧭 **D1 decision (canonical SOT)** → [ADR-0017](decisions/0017-pacred-faithful-pcs-port.md)
- 🗄 **Phase-A runbook** → [`runbook/pcs-data-migration.md`](runbook/pcs-data-migration.md)
- 🔬 **Phase-B input — legacy-vs-Pacred gap map** → [`research/_index.md`](research/_index.md)
  — esp. [`gap-customer.md`](research/gap-customer.md), [`gap-admin.md`](research/gap-admin.md),
  [`gap-revenue-flow.md`](research/gap-revenue-flow.md), and the legacy decode docs
- 📘 Entry point → [`HANDBOOK.md`](HANDBOOK.md) · master single-read → [`STRATEGY.md`](STRATEGY.md)
- 🧑‍💻 Role briefs (re-tasked under D1) → [`briefs/INDEX.md`](briefs/INDEX.md)
- 📋 Legacy port history + backlogs → [`PORT_PLAN.md`](PORT_PLAN.md) Part V (cargo) + Part W (gap-hunt)
- 🗃 Deferred capability synthesis → [`research/capability-tools-strategy-2026-05-18.md`](research/capability-tools-strategy-2026-05-18.md)
- 🧭 V3 (separate repo — NOT this plan, unaffected by D1) → [ADR-0010](decisions/0010-v2-v3-version-strategy.md)

---

**End — `UPGRADE_PLAN.md`.** The D1 phase plan: Phase A 🗄 data migration
(nearly done — A-4 files + A-5 prod load pending) → Phase B 🎯 workflow fidelity
(the bulk of forward work — needs a gap-map-driven stage breakdown) → Phase C
🔭 Pacred enhancements (Tier 0/1/2/3 + the six systems — deferred, sequenced
after the faithful port). Mobile-first + the quality gate apply across all of
them.
