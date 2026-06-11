# 🚀 Pacred Roadmap — the D1 master phase plan (faithful PCS port)

> ## 2026-05-19 — Direction shift to 1:1 transcription (method still applies; branch loop superseded)
>
> Team pivoted to **literal 1:1 transcription** of legacy PHP → Next.js per the
> owner's "100% sameness FIRST" rule. The phases below (A migration · B
> workflow fidelity · C enhancements) still apply, and the transcription
> *method* ([`runbook/faithful-port-transcription.md`](runbook/faithful-port-transcription.md))
> remains the Phase-B way of working.
>
> ⟦superseded⟧ The branch loop described then (`… → faithful-port → main`) is
> **gone** — `faithful-port` was deleted 2026-05-24. **Current model
> ([`team.md`](team.md) §0):** ภูม `Poom-pacred` + ปอน `InwPond007` → เดฟ
> integrates on **`dave-pacred`** (the trunk) → `main` on the owner's go
> (ก๊อต reviews; Vercel auto-deploys `main`).

> **The single canonical forward plan** — current state, stages, and
> who-owns-what for `pacred-web` under **D1**. The doc CLAUDE.md / AGENTS.md /
> the role briefs point at as "the D1 phase plan." Updated each save-point.
>
> **D1 (2026-05-18)** — the owner reviewed the rebuilt-from-scratch Pacred app
> and **rejected it**: UI *and* logic-loop look nothing like the legacy **PCS
> Cargo** system the business runs on. The decision: **Pacred *becomes* the
> legacy PCS Cargo system, faithfully — rebranded `PCS` → `PR`.** A faithful
> port, not a reinterpretation. Canonical decision SOT:
> [ADR-0017](decisions/0017-pacred-faithful-pcs-port.md).
>
> **⚠️ Owner mandate (2026-05-19, verbatim):** *"ต้องเอาของเดิมมา copy ให้ได้
> ให้เหมือนทั้งหมด 100% ก่อน แล้วเราค่อยพัฒนาให้เหนือยิ่งกว่า"* — copy the
> original to **100% sameness FIRST**, then improve. The owner scolded the team
> on 2026-05-19 for screens still diverging from legacy PCS. Faithful first;
> improvements are Phase C. Every Phase-B port runs through the
> [`legacy-fidelity-check`](../.claude/skills/legacy-fidelity-check/SKILL.md) skill.
>
> **Scope = V2 `pacred-web`.** V3 is a separate repo (`pacred-DPX`,
> [ADR-0010](decisions/0010-v2-v3-version-strategy.md)) — unaffected by D1, out
> of scope here; append V3 ideas to `v3-wishlist.md`. Master single-read:
> [`STRATEGY.md`](STRATEGY.md).

---

## 0. Master plan at a glance — current state (refreshed 2026-06-10)

**DIRECTION** — Pacred = a faithful port of legacy PCS Cargo. Owner rule: copy
the original to 100% sameness FIRST, then improve.

> **📍 Live state lives elsewhere — don't duplicate it here (conventions §13):**
> the dated save-points at the top of [`/CLAUDE.md`](../CLAUDE.md) (canonical
> session state) + [`STRATEGY.md`](STRATEGY.md) §9 (shipped-vs-pending
> snapshot, refreshed 2026-06-10) + [`runbook/migration-ledger.md`](runbook/migration-ledger.md)
> (migration numbering SOT).

**STATE (one-glance, 2026-06-10):**
- **Phase A — data migration — ✅ DONE** (117/117 tables on dev + prod ·
  images on S3 prod · auth bridge live). Detail in §2.
- **Phase B — workflow fidelity — well past wave 1.** The faithful-port era
  largely closed: legacy `tb_*` is canonical, the money loop is closed, and
  the June-2026 build waves (tax-invoice platform P1–P4 · freight ERP cockpit/
  P&L/commission · warehouse worker-app · customs doc-kit · W1-W11) shipped on
  top of it — several DORMANT behind owner flags. ~9 customer screens remain
  un-transcribed 1:1 (briefs/dave.md pickup list).
- **Phase C — Pacred enhancements** — much of the June build is effectively
  early Phase-C work layered on the faithful base; the formal Tier 0/1/2/3
  appendix (§7) remains the deferred idea bank.

**STAGES** — `A-final` ✅ → `B-0` ✅ → `B-waves` (tail: fidelity-verify +
remaining screens) → `C`. Detail in §2–§4 below.

**WORK LANES** (canonical: [`team.md`](team.md) §0): **เดฟ** = `dave-pacred`
trunk/integrator + release gate · **ภูม** = backend/admin/accounting
(`Poom-pacred`) · **ปอน** = frontend/UI (`InwPond007`) · **ก๊อต** = `main`
review + delegated (Supabase Pro + แต้ม handover ✅ done; Google-Sheets creds
still pending). Full who-owns-what in §5.

---

## 1. How to read this

- **Phase** = a band of work (A / B / C). **Stage** = a shippable increment
  inside a phase (`A-final`, `B-0`, a B-wave, …).
- A stage is DONE only when verified: `pnpm verify` + a production build smoke
  + a [`qa-flow-simulator`](../.claude/skills/qa-flow-simulator/SKILL.md)
  functional pass (see [AGENTS.md §11](../AGENTS.md)). A Phase-B stage **also**
  passes the [`legacy-fidelity-check`](../.claude/skills/legacy-fidelity-check/SKILL.md)
  skill — the executable form of the owner's "copy 100% first" mandate.
- **Mobile-first is cross-cutting** — every customer-visible stage is built +
  checked at a phone viewport. See [`conventions.md` §11](conventions.md) +
  [`mobile-first-playbook.md`](mobile-first-playbook.md). It is not a phase; it
  applies to all of them.
- **The three D1 phases run in order: A → B → C.** Phase A is one stage from
  done; Phase B is the bulk of forward work; Phase C is deferred.

### What this plan supersedes

The previous `UPGRADE_PLAN.md` was the **pre-D1 roadmap**: Phase 0 foundation →
Phase 1 release → Phase 2 the six owner systems → Phase 3 future, built around
the Tier 0/1/2/3 capability synthesis. **D1 supersedes that whole framing** —
that content is preserved as the clearly-labelled **deferred Phase-C appendix
(§6)**. The deliverable is now a **faithful port of PCS Cargo**, rebranded
`PCS` → `PR`. [ADR-0010](decisions/0010-v2-v3-version-strategy.md)'s "V2 =
rebuilt owner-pleaser" is superseded — **V2 is now "faithful PCS port"**.

---

## 2. Phase A — 🗄 DATA MIGRATION  ·  stage `A-final`

Port the entire legacy MySQL database `pcsc_main` — **117 tables, ~3.78M rows,
~8,898 customers** — into Pacred's PostgreSQL / Supabase. `PCS<n>` → `PR<n>`,
keeping the exact running number. Custom auth so migrated customers sign in
with their **existing password — no reset**.

> **Runbook (canonical):** [`runbook/pcs-data-migration.md`](runbook/pcs-data-migration.md)
> — full approach, artifacts inventory, the production-load procedure, and the
> open/pending items. This plan tracks the *sequence*; the runbook holds the
> *how*.

**Done** — the pipeline (MySQL → pgloader → PostgreSQL → `PCS`→`PR` rebrand →
migrations) is built and validated; the schema is committed (`0081` 117 tables
+ RLS · `0082` indexes · `0083` `next_pr_member_code()`); the auth bridge
(`lib/auth/pcs-legacy-password.ts`) is verified against real hashes; the
business data was loaded to BOTH the dev and prod Supabase projects;
**ก๊อต completed the Supabase Pro upgrade**, after which the **3 oversized log
tables (`tb_web_hs` · `tb_history_key` · `tb_history`, 779 MB) were backfilled**
— prod now carries **all 117 tables loaded** with row counts reconciling
MySQL ↔ Supabase. **ภูม uploaded the customer image + storage files** into
Supabase S3 production (`pcsracgo/public/member`) on 2026-05-24. Migrations
`0081`-`0083` + `0087` are on `main`. Member-code numbering was further refined
post-launch via `0095`-`0103` (sequence drift / numeric-pad collisions —
lowest-vacant + min-3-digit pad + legacy-anchor restore).

**Stage `A-final` — ✅ COMPLETE.**

| Item | What | Status |
|---|---|---|
| **Supabase Pro upgrade** | Free tier capped DB at 500 MB; legacy data was 1.02 GB → upgrade to Pro. | ✅ done (ก๊อต) |
| **3 log tables backfill** | `tb_web_hs` (657 MB) · `tb_history_key` (62 MB) · `tb_history` (59 MB), 779 MB. | ✅ backfilled post-Pro |
| **Customer image/file backfill** | Legacy `images/users` · `images/shops` · `storage/file` · `storage/slip` → Supabase Storage. | ✅ uploaded to S3 prod (`pcsracgo/public/member`) by ภูม 2026-05-24 |
| **Reconcile 117/117** | Prod row counts ↔ source MySQL match all 117 tables. | ✅ |

**Phase-A open decisions — ✅ all DECIDED** (runbook §7): the 8 special
userIDs (`PCS<letters>` rewritten to `PR<letters>`; `PW`/`JET`/`FCL`/`AIGA`
verbatim) and new-customer numbering (lowest-vacant — first signups land
`PR1`-`PR5`, refined to min-3-digit pad post-launch).

**Phase-A exit criteria — ALL MET:** Pro upgrade done ✅ · 3 log tables +
customer images backfilled ✅ · prod row counts reconcile all 117 tables ✅ ·
migrated customers sign in with their legacy password ✅ · `tb_*` schema
coexists with Pacred's existing tables (nothing dropped) ✅.

⚠️ **Remaining cleanup (internal — NOT a legacy gap):** the prod Supabase
project (`yzljakczhwrpbxflnmco`) has internal table-naming conflicts between
rebuilt-era and legacy `tb_*` schemas — our cleanup, owners เดฟ + ภูม.

> The pre-D1 PCS-customer-migration scaffolding — migration
> `0067_pcs_customer_migration.sql`, the `u2-1-pcs-customer-migration.md`
> runbook, `actions/admin/pcs-migration.ts` — is **superseded** by this
> full-system port (all 117 tables · custom auth · no reset). เดฟ decides the
> fate of the superseded files.

---

## 3. Phase B — 🎯 WORKFLOW FIDELITY (the bulk of forward work)

Rework the Pacred app — **customer portal + admin back-office** — so its menus,
job statuses, container (ตู้) flow, and end-to-end logic-loop **match the
legacy PCS Cargo system exactly**. The goal is the D1 promise: staff and
customers (~8,898 of them, plus every operating role — warehouse, scanners,
receiving/shipping, accounting, audit) need **zero retraining**.

This is the **bulk of forward work** under D1. Phase A moves the data; Phase B
makes the app behave like the system everyone already knows.

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

### Stage `B-0` — wave 1: DONE + integrated

Phase B opened with **wave 1**, now done and integrated on `dave` (2026-05-19):

- Customer **9-icon launchpad** home (`components/sections/pcs-*`).
- Customer **order flow** reworked toward the legacy logic-loop.
- Admin **per-role RBAC sidebar + live-count badges** (`lib/admin/sidebar-menu.ts`).
- Admin **container `tb_cnt` payment ledger** (`actions/admin/pcs-container-payments.ts`).
- The **legacy-auth bridge** (`lib/auth/pcs-legacy-bridge.ts`) — migrated PCS
  customers sign in with their existing password.

> ⚠️ **Wave 1 is FIRST-PASS — not yet fidelity-verified.** Before it can be
> called done it must pass the **`legacy-fidelity-check`** skill against the
> legacy originals (the owner's "copy 100% first" gate). Re-verifying wave 1 is
> part of the `B-waves` work below.

### Stage `B-waves` — the remaining rework

Derived from the legacy-vs-Pacred fidelity gap maps —
[`research/d1-fidelity-customer.md`](research/d1-fidelity-customer.md) ·
[`research/d1-fidelity-admin.md`](research/d1-fidelity-admin.md) ·
[`research/d1-fidelity-workflow.md`](research/d1-fidelity-workflow.md)
(overview: [`research/d1-phase-b-gap-map.md`](research/d1-phase-b-gap-map.md)) —
the **canonical Phase-B input**. The earlier pre-D1 hunts (`gap-customer.md` /
`gap-admin.md` / `gap-revenue-flow.md` + the legacy decode docs) are supporting
evidence, re-read as *fidelity gaps to close*, not enhancements.

The customer track and the admin track run **in parallel**:

| Track / stage | What | Gap | Owner |
|---|---|---|---|
| **B-waves customer** | Remaining customer screens — login · register · payment · wallet · address · account · shipment — reworked to the legacy PCS look + logic-loop; the three divergent status vocabularies reconciled onto the legacy set; the tab-per-status order list restored. | §1·§2·§4 | ปอน (frontend) + ภูม (backend) |
| **B-waves admin** | Forwarder status workflow restored (ship→arrive→**then**-pay + truck load/unload sub-states); the `tb_cnt` ledger fan-out (`tb_cnt_pay_*`); warehouse + the 8-variant barcode-scan family; accounting (รวมบิล bill consolidation · container-payment screen · รับรู้รายได้); the `tb_check_forwarder` QA queue · note queues · Learning centre · Extension tools · member segmentation. | §1·§2·§3·§4·§6 | ภูม (backend) |
| **B-0 data foundation** | The app's data layer (`lib/supabase/*`, server actions, queries) re-pointed at the ported `tb_*` 117-table schema. Prerequisite for every B-stage backend; the `tb_*` schema is now in dev + prod (Phase A) so this is unblocked. | — | ภูม + เดฟ |

**Sequencing:** the customer track (ปอน-led) and the admin track (ภูม-led) run
in parallel on the `tb_*` foundation. A stage is done only when its
fidelity-gap item no longer diverges **and** it passes `legacy-fidelity-check`.

> **Phase-B open questions — ✅ answered.** ภูม's 6 blocking questions
> (migration split · auth-bridge pattern · special-userID + numbering rules ·
> Phase-C apply order · `userType`) are resolved —
> [`research/poom-d1-open-questions.md`](research/poom-d1-open-questions.md).

**Phase-B exit criteria:** the customer portal + admin back-office menus,
statuses, container flow, and logic-loop match the legacy PCS system — verified
by walking the fidelity gap maps to zero remaining divergences, every screen
passing `legacy-fidelity-check`, plus a `qa-flow-simulator` pass on the
end-to-end cargo loop.

> **Identity guardrail still holds.** The legacy PCS/TTP operation leaned on
> gray-channel practice (no-document "เหมาภาษี", HS-code / declared-value
> engineering). A *faithful port of the workflow* is **not** a port of those
> shortcuts — port the operational loop (statuses, container flow, the job
> lifecycle), never the compliance shortcuts. Pacred builds the legitimate,
> document-complete path only. Full statement:
> [`research/PACRED-MASTER-STRATEGY.md`](research/PACRED-MASTER-STRATEGY.md) §5.5
> and [`research/PACRED-GAP-ANALYSIS.md`](research/PACRED-GAP-ANALYSIS.md) §4.

---

## 4. Phase C — 🔭 PACRED ENHANCEMENTS  ·  stage `C` (deferred)

**Only after the faithful port works** (Phase A reconciled 117/117 + Phase B
fidelity verified) does Pacred layer its own improvements on top. Stage `C` is
**deferred, not cancelled** — re-sequenced *after* the faithful port per
[ADR-0017](decisions/0017-pacred-faithful-pcs-port.md). The full scope is the
**deferred Phase-C appendix (§6)**.

A genuine improvement idea spotted during Phase B → **record it for Phase C**;
never ship it inside a port diff (it hides divergence inside a good-looking
change). The 8-specialist R&D stream's output —
[`research/r-and-d-2026-05-19/`](research/r-and-d-2026-05-19/_synthesis.md) — is
the Phase-C idea bank.

---

## 5. Work-split — who owns what under D1

Per [ADR-0017 §Work-split](decisions/0017-pacred-faithful-pcs-port.md) + the
master plan. Priority order: **เดฟ + ก๊อต first, then ปอน + ภูม.** All four
roles re-task under D1 — see the updated briefs in [`docs/briefs/`](briefs/).

| Role | D1 work lane |
|---|---|
| **เดฟ** | Integrator + **Phase-A driver** (drive `A-final` to 117/117) + **Phase-B integration** (consolidate ปอน + ภูม work into `dave`, verify, distribute) + the **`dave→main` deploy gate**. |
| **ก๊อต** | **Production gate** + the **Supabase Pro purchase** + the **แต้ม handover** + the **JMF API** (Phase C) + production watch. |
| **ปอน** | **Phase-B frontend** — rework the customer-facing screens to match the legacy PCS look + flow. |
| **ภูม** | **Phase-B backend** — rework the admin + customer-portal backend onto the ported `tb_*` schema + the legacy PCS workflow. |

---

## 6. Cross-cutting — applies to every phase

- **Mobile-first** — Pacred's customers arrive mostly on phones. Every
  customer-visible change is designed + verified at a phone viewport
  (360 / 390px) FIRST, then scaled up. [`conventions.md` §11](conventions.md) ·
  [`mobile-first-playbook.md`](mobile-first-playbook.md) · the
  `mobile-first-verify` skill. The faithful port is no exception — match the
  legacy *workflow*, but render it mobile-clean.
- **Quality gate** — no stage ships without `pnpm verify` + a production build
  smoke + a `qa-flow-simulator` functional pass ([AGENTS.md §11](../AGENTS.md));
  a Phase-B stage also passes `legacy-fidelity-check`. D1 plans work properly —
  don't ship half-built to chase a deadline.
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

## 7. Deferred Phase-C appendix — the Tier roadmap + the six systems

> **Everything below is deferred — stage `C`.** It is the pre-D1 roadmap,
> preserved for Phase-C scope. **Not the current "what's next"** — the current
> plan is §2–§3 (Phase A `A-final` → Phase B `B-waves`).

### C.1 — The Tier 0/1/2/3 capability roadmap (deferred)

The pre-D1 capability synthesis
([`research/capability-tools-strategy-2026-05-18.md`](research/capability-tools-strategy-2026-05-18.md)).
Parts of Tier 0/1/2 were *built* on the rebuilt app pre-D1 — under D1 they are
revisited *after* Phase B, re-fitted onto the faithful-port app.

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

## 8. Cross-references

- 🧭 **D1 decision (canonical SOT)** → [ADR-0017](decisions/0017-pacred-faithful-pcs-port.md)
- 🗄 **Phase-A runbook** → [`runbook/pcs-data-migration.md`](runbook/pcs-data-migration.md)
- 🔬 **Phase-B input — legacy-vs-Pacred fidelity gap maps** →
  [`research/d1-fidelity-customer.md`](research/d1-fidelity-customer.md) ·
  [`research/d1-fidelity-admin.md`](research/d1-fidelity-admin.md) ·
  [`research/d1-fidelity-workflow.md`](research/d1-fidelity-workflow.md) ·
  overview [`research/d1-phase-b-gap-map.md`](research/d1-phase-b-gap-map.md)
- 📘 Entry point → [`HANDBOOK.md`](HANDBOOK.md) · master single-read → [`STRATEGY.md`](STRATEGY.md)
- 🧑‍💻 Role briefs (re-tasked under D1) → [`briefs/INDEX.md`](briefs/INDEX.md)
- 📋 Legacy port history + backlogs → [`PORT_PLAN.md`](PORT_PLAN.md) Part V (cargo) + Part W (gap-hunt)
- 🗃 Deferred Phase-C capability synthesis → [`research/capability-tools-strategy-2026-05-18.md`](research/capability-tools-strategy-2026-05-18.md)
- 🧪 Phase-C idea bank (8-specialist R&D) → [`research/r-and-d-2026-05-19/_synthesis.md`](research/r-and-d-2026-05-19/_synthesis.md)
- 🧭 V3 (separate repo — NOT this plan, unaffected by D1) → [ADR-0010](decisions/0010-v2-v3-version-strategy.md)

---

**End — `UPGRADE_PLAN.md`.** The D1 master phase plan: Phase A 🗄 data migration
(stage `A-final` ✅ COMPLETE — Pro upgrade done · 3 log tables backfilled ·
customer images on S3 prod · 117/117 reconciled) → Phase B 🎯 workflow fidelity
(the bulk of forward work — `B-0` wave-1 integrated, customer 1:1 lane on
`dave-pacred` + admin 1:1 lane on ก๊อต + V3 continuation on `Poom-pacred` in
parallel) → Phase C 🔭 Pacred enhancements (Tier 0/1/2/3 + the six systems —
deferred, §7). Mobile-first + the quality gate ( + `legacy-fidelity-check` for
Phase B) apply across all of them.
