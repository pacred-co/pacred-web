# ภูม — Backend / V3 backend continuation (UNLOCKED 2026-05-24)

Last reviewed: 2026-05-24 (strategy reset — **V3 UNLOCKED** · admin 1:1 lane moved to ก๊อต)
Branch: **`Poom-pacred`** (V3 continuation, active) — `Poom` (pre-1:1) is the FROZEN archive

> ## 🆕 2026-05-30 NIGHT — RE-SPLIT + HANDOFF (read FIRST, supersedes the audit-lane block below)
> **[`docs/research/handoff-2026-05-30-night-resplit.md`](../research/handoff-2026-05-30-night-resplit.md)** — consolidated status + the tightened เดฟ↔ภูม no-collision boundary + your ordered pickup list. **First: `git merge origin/dave-pacred`** (you're 7 commits behind; your Wave 27-30 work is already in there, nothing lost).
>
> **What's CLOSED since the audit** (don't redo): the whole money loop (P0-2/6/7/8/9/10 + P1-25/26 via ADR-0018), identity+juristic (P0-17/18), OTP. **Your START-HERE** (isolated dead-write retargets, zero wait): P0-22 4 crons · task#41 forwarder list-bar · P0-14 finish · P0-11/12 yuan per-row. **WAIT-on-เดฟ:** P0-13 5-tab shop (id-model decision) + P1-5 earn-trigger (commission decision).
>
> **The boundary:** you never edit the customer `(protected)/*` write-path or `actions/{cart,service-order,wallet-tb,payment-tb}.ts`; เดฟ never edits `actions/admin/*`. **Reuse เดฟ's ADR-0018 spine** (the `*-tb.ts` convention · `lib/payment/wallet-math.ts` · `resolveLegacyAdminId` · idempotency+rollback · grep-schema-before-typing). Full detail in the handoff §2-5.
>
> ## (superseded) 🎯 2026-05-30 MASTER GAP AUDIT — your lane
> Full audit: **[`docs/research/legacy-gap-2026-05-30/_MASTER.md`](../research/legacy-gap-2026-05-30/_MASTER.md)** §6 + §7 — still the canonical task-source; the handoff above re-orders it for what's now done.
>
> **Start with the cheap landmines (Sprint 0, zero wallet dependency, highest correctness-per-minute):**
> 1. **P0-10** yuan bulk-approve UUID one-liner — `resolveLegacyAdminId()` before the `tb_payment` UPDATE (`actions/admin/tb-bulk.ts:318`) — ship immediately.
> 2. **P0-22/P1-4** 4 cron retargets (refresh-active-customers · sales-daily-digest · expire-probation · expire-driver-assignments) → `tb_*` (~2-3h all four).
> 3. **P0-14** render `AdminServiceOrderUpdateForm` in `legacy-view.tsx` (~1h, unblocks cancel/status/note for 21,950 real orders).
> 4. **P1-1/P1-2 (=open task #41)** forwarder list-bar retargets → `tb_forwarder` (faithful actions already exist).
>
> Then the big builds: yuan per-row form (P0-11/12) · 5 reports→tb_* (P0-20) · closing→tb_receipt (P0-21) · **5-tab shop UPDATE workflow (P0-13 — biggest build)** · per-item refund · withdraw approve/refund (co-ship เดฟ P0-7). **Reachability (AGENTS.md §0d):** every action ships its UI button — `adminUpdateYuanPayment` is correct but mounted nowhere.

> ## 🚨 2026-05-24 STRATEGY RESET (READ FIRST)
>
> **V3 work is UNLOCKED.** You resume building DPX ERP enhancements + wave-17+ admin features on `Poom-pacred`. The 1:1 ports (เดฟ customer + ก๊อต admin) ship to main first; your V3 work merges in after.
>
> **Lane reshuffle:**
> - Previously you owned admin 1:1 transcription (187 `pcs-admin/*.php` files). **That moves to ก๊อต now.**
> - You return to V3-era backend continuation — the wave-16/17 work you've been doing on `Poom-pacred` is now first-class active work, not deferred.
> - `Poom` branch stays FROZEN as archive — keep using `Poom-pacred`.
>
> **Branch flow (post-reset):**
> ```
> ปอน (podeng)        ─┐
>                      ├─► เดฟ merges into dave-pacred → push main (ก๊อต gates)
> ก๊อต (admin 1:1)   ─┘                                                ▲
>                                                                       │
> ภูม (Poom-pacred V3) ── continues V3, merges in *after* 1:1 ships ───┘
> ```
>
> **Deleted 2026-05-24:** `faithful-port` (no longer the integration target) · all `claude/*` remotes (your Wave 10–13 work on `adoring-chandrasekhar` was confirmed already in `Poom-pacred`).
>
> **READ FIRST:**
> - [`docs/research/d1-deep-audit-2026-05-24.md`](../research/d1-deep-audit-2026-05-24.md) — gap analysis + sprint sequence
> - [`docs/runbook/faithful-port-plan.md`](../runbook/faithful-port-plan.md) — updated branch model
> - Your wave-17 save point: [`docs/research/poom-save-point-2026-05-19-night.md`](../research/poom-save-point-2026-05-19-night.md) (history) + check `git log Poom-pacred` for recent work

## 🎯 Direction — D1: Pacred is a faithful PCS Cargo port

🔴 The owner rejected the rebuilt Pacred app — its admin back-office *and* its
customer-portal workflow look nothing like the legacy **PCS Cargo** system that
staff + ~8,898 customers run on daily. **D1:** Pacred *becomes* the legacy PCS
Cargo system, faithfully — rebranded `PCS` → `PR`. Owner rule (verbatim):
**"copy the original to 100% sameness FIRST, then improve."** Canonical SOT →
[`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
— read it in full. It supersedes the Tier 0/1/2/3 / Phase-2-build-queue framing
of [`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md).

Three phases: **A** data migration · **B** workflow fidelity · **C** Pacred
enhancements. **Pause the pre-D1 backlog** — BK-1 booking flow, V-E1.1 / V-E6..
V-E12 freight, the Tier-3 systems, the customer-intel backend are all **Phase C
now** (deferred, *not cancelled*). Your work is **Phase B backend**.

## 🟢 Where the project is now

- 🟢 **Phase A — ✅ FULLY DONE.** Legacy `pcsc_main` migrated into Supabase
  **dev + prod**: **all 117 `tb_*` tables loaded** (~8,898 customers · orders ·
  wallets · ตู้ · forwarders · receipts · the `userpass` login hashes),
  `PCS`→`PR` rebrand applied, RLS on. Migrations `0081`-`0083` + `0087` on
  `main`. **The 3 oversized log tables** (`tb_web_hs` · `tb_history_key` ·
  `tb_history`) **are backfilled** post-ก๊อต's Supabase Pro upgrade — they hold
  real rows now, depend on them. **Your customer image upload** to Supabase S3
  production (`pcsracgo/public/member`) on 2026-05-24 closed Phase A storage
  parity. Develop against dev `pprrlabgebrnocthwdmg`; prod is `yzljakczhwrpbxflnmco`.
- 🟢 **Phase B — wave 1 integrated.** Customer 9-icon launchpad · customer
  order flow · **admin per-role RBAC sidebar + live-count badges** · **admin
  container `tb_cnt` payment ledger** · your legacy-auth bridge — all on
  `dave`. Wave 1 is a *first pass*, not yet element-by-element fidelity-verified.
- ⚪ **Phase C** — deferred (Tier-3 systems · booking-flow backend · V-E6..V-E12
  freight · customer-intel backend).

## 🧭 Your lane (post-2026-05-24)

You = **V3 backend continuation lead**. Build DPX ERP enhancements + advanced admin features on `Poom-pacred`. The 1:1 lanes (เดฟ customer · ก๊อต admin · ปอน frontend) ship to main first; your work integrates after.

**Scope split with ก๊อต (admin lane):**
- ก๊อต = 1:1 fidelity port of `pcs-admin/*.php` screens (e.g. `admin-table.php` → `/admin/admins`, `index.php` → `/admin`, `users-search.php` → `/admin/customers/search`)
- You = V3 enhancements on admin routes NOT being 1:1-ported (wave-17 MOMO/CN forms, barcode AJAX, accounting periods, etc.) — coordinate via เดฟ before touching the same route

✋ **Not your lane:** customer-facing UI (`(public)/*`, marketing — ปอน's). Admin screens that ก๊อต has claimed for 1:1 transcription — coordinate first. Integration to main (เดฟ).

## 🔱 Phase-B is wave-driven — review before you take a slice

เดฟ + Claude execute the Phase-B rework via spawned worktree agents that land
on `dave`, wave by wave, so the team works one direction. **Wave 1 is
integrated.** Your role on a landed slice: pull `dave` often → **review +
fidelity-verify** each backend slice against the legacy PCS system + the `tb_*`
schema — your cargo-domain expertise is the QC the agents can't self-do.
**Ping เดฟ before taking a fresh slice** so each surface has exactly one owner.

## 🟡 Your pickup list (Phase-B backend, priority order)

1. **Rework the admin back-office onto the `tb_*` schema — TOP priority.**
   Rework the 60+ admin routes so they **operate on the `tb_*` schema with the
   legacy PCS admin workflow exactly** — same menus, same job statuses, same
   container (ตู้) flow, same end-to-end logic-loop. Goal: warehouse / scanner /
   receiving / shipping / accounting / audit staff need *zero* retraining.
   Spec → [`research/d1-fidelity-admin.md`](../research/d1-fidelity-admin.md) +
   [`d1-fidelity-workflow.md`](../research/d1-fidelity-workflow.md).
2. **Rework the customer-portal backend onto `tb_*`.** Server actions + queries
   behind `/service-order` · `/service-import` · `/service-payment` · `/wallet`
   · `/shipments` etc. read/write the `tb_*` tables and follow the legacy PCS
   customer logic-loop. ปอน reworks the customer-facing UI in parallel —
   coordinate the data contract (the `tb_*` status values are canonical).
3. **Wire the legacy auth bridge into the login flow.** Migrated customers sign
   in with their *existing* PCS password (no reset) via the "เชื่อมต่อบัญชี
   PCS CARGO" login. The bridge `lib/auth/pcs-legacy-password.ts` /
   `pcs-legacy-bridge.ts` is built + verified — wire it in. **Gated on ก๊อต
   ratifying the session pattern (your open-question Q2)** — ping ก๊อต before
   B-auth ships.
4. **Fidelity-verify the wave-1 backend slices** — review the admin RBAC
   sidebar + the container `tb_cnt` payment ledger against legacy PCS via the
   [`legacy-fidelity-check`](../../.claude/skills/legacy-fidelity-check/SKILL.md)
   skill; flag gaps to เดฟ.

**Migration numbering:** files `0001`-`0111` exist (`0065` is a gap).
`0081`-`0083` = the Phase-A legacy schema; `0084`-`0086` = your booking/
credit-note/chat batch; `0087` = the `v_pcs_migration_status` security fix;
`0089`-`0090` + `0095`-`0103` = member-code refinements (sequence drift /
numeric-pad collisions); `0101` = LINE Notify per-user OAuth (Gap #3);
`0104`-`0106` = shop-wallet + LINE Notify dispatch; `0108` = PCS legacy hot
indexes (perf); `0109`-`0111` = payment slip / reconciliation / invoice
adjustments. **Next free for new work = `0112`.** Sequencing →
[`runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md) §9.

**Your 6 Phase-B open questions — ✅ answered** (เดฟ · 2026-05-18) →
[`research/poom-d1-open-questions.md`](../research/poom-d1-open-questions.md).
Q1·Q3·Q4·Q5·Q6 decided. **Q2 (auth-bridge session pattern) needs ก๊อต** — ping
him on LINE to ratify before B-auth ships.

**Carried-over backlog (Phase C — not a current pickup):** the Tier-3 systems
(internal-chat · disbursement · china-ops), the booking-flow backend, the
V-E6..V-E12 freight expansion + the V-G admin bulk-ops bundle
([`PORT_PLAN.md`](../PORT_PLAN.md) Part V) — all re-sequenced *after* the
faithful port. The pre-D1 PCS-customer migration (`0067` ·
`actions/admin/pcs-migration.ts`) is superseded — don't extend it.

## ✋ Non-collision rule

You = backend (admin routes + server actions + `tb_*` queries). ปอน = the
customer-facing frontend surfaces. เดฟ integrates + drives the Phase-A backfill.
**One owner per surface** — coordinate via เดฟ before taking a fresh surface.

## 🔒 Force-read before any work

1. [`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
   — ADR-0017, the canonical D1 SOT
2. [`runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md) —
   describes the `tb_*` schema your Phase-B backend operates on
3. [`research/d1-fidelity-admin.md`](../research/d1-fidelity-admin.md) +
   [`d1-fidelity-workflow.md`](../research/d1-fidelity-workflow.md) — the
   legacy-PCS-vs-Pacred fidelity gap maps, your **Phase-B rework spec**.
   Overview → [`d1-phase-b-gap-map.md`](../research/d1-phase-b-gap-map.md)
4. [`research/poom-d1-open-questions.md`](../research/poom-d1-open-questions.md)
   — your 6 Phase-B Qs (Q2 awaits ก๊อต)
5. [`team.md`](../team.md) §1 (your scope) + §3 (daily flow) + §10 (integration cycle)
6. [`architecture/container-centric-model.md`](../architecture/container-centric-model.md)
   — reconcile against the legacy `tb_*` ตู้ model
7. [`pacred-info.md`](../pacred-info.md) — company DNA (tax ID + legal name for PDFs)
8. [`../../.claude/skills/legacy-php-sweep/SKILL.md`](../../.claude/skills/legacy-php-sweep/SKILL.md)
   + [`legacy-fidelity-check`](../../.claude/skills/legacy-fidelity-check/SKILL.md)
   — your bread-and-butter Phase-B skills
9. [`learnings/_index.md`](../learnings/_index.md) — scan for new gotcha entries

## 📂 Legacy reference (your most-touched external source)

**`D:\xampp\htdocs\pcscargo\`** — read-only PHP source for everything cargo.
Use [`legacy-php-sweep`](../../.claude/skills/legacy-php-sweep/SKILL.md) before
every port: `member/include/function.php` (2451 LOC helpers) ·
`member/include/header.php` (auth + dashboard precompute) · `member/pcs-admin/`
(187 admin files) · the DB schema dump (`Grep` only, never `Read` whole).

## Who you are

**100% หลังบ้าน + customer portal + admin back-office + cargo port.** You
operate from `Poom`. You build server actions + DB schema + RLS policies +
admin UI, bridge frontend ↔ customer backend ↔ admin backend, and port the PHP
`pcs-cargo` legacy to Pacred Next.js + Supabase. Admin sidebar BG = white;
remaining area = the same theme as the public site.

## Scope boundaries (per `team.md` §1.3)

✋ **You don't touch:** `app/[locale]/(public)/`, `components/sections/`,
`components/booking/`, `components/knowledge/`, `messages/*.json` (ปอน owns).
✋ **Lead-only:** `CLAUDE.md`, `docs/team.md`, `docs/conventions.md`,
`docs/env.md`, `docs/PORT_PLAN.md`, `package.json`, `.github/`,
`next.config.ts`, `eslint.config.mjs`, `proxy.ts`, `vercel.json`.
✅ **You own:** `actions/`, `lib/`, `app/[locale]/(auth|protected|admin)/`,
`supabase/migrations/`, `app/api/`, `components/admin/`, `components/pdf/`.

## Blockers + alternatives

| Blocked on | Alternative work |
|---|---|
| A legacy-workflow ambiguity you can't resolve from the PHP source | Move to a different admin module's rework, or note it back to เดฟ for ก๊อต to settle |
| ก๊อต hasn't ratified the auth-bridge pattern (Q2) | Rework an admin module onto `tb_*`; fidelity-verify a wave-1 slice |
| Waiting on เดฟ to assign the next wave slice | Sweep the legacy PHP (`legacy-php-sweep`) to spec the admin logic-loop ahead |

**Note back to เดฟ + ก๊อต when:** a legacy-workflow detail is ambiguous, you
need an architectural call on `tb_*` ↔ rebuilt-schema coexistence, a new env
var, or an external service.

## Hand-offs

**IN** — ก๊อต ADRs (you implement) · เดฟ wave slices + schema specs (you
build). **OUT** — schema migrations (`supabase/migrations/00NN_*.sql`) →
applied to prod Supabase (gates the deploy) · backend PRs in `Poom` → เดฟ
merges into `dave`.

## Push discipline (per memory `push_frequency_strict`)

Commit local freely; **push to `origin/Poom` only at save-points** (end of
session / before sleep / machine change / big batch done). 1 push max per
session. เดฟ pulls from `origin/Poom` to consolidate.

## Cross-links

- [`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md) — D1 SOT
- [`team.md`](../team.md) §1.3 — your scope boundaries
- [`research/d1-phase-b-gap-map.md`](../research/d1-phase-b-gap-map.md) — Phase-B gap map
- [`architecture/container-centric-model.md`](../architecture/container-centric-model.md) — your data spine
- [`decisions/`](../decisions/) — ADRs you implement
- [`conventions.md`](../conventions.md) — code style, action shape, migration rules
- [`briefs/ops-roles.md`](ops-roles.md) — staff role → admin workspace mapping
