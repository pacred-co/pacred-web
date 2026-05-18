# ภูม — Backend / Customer Portal / Admin Back-Office / Cargo Port

Last reviewed: 2026-05-18 (post-launch — production live since 2026-05-17)
Branch: `Poom` (working) — push to own branch only; เดฟ merges into `dave`

## 🎯 Current state — DIRECTION PIVOT "D1" (2026-05-18) — PIVOT YOUR WORK

🔴 **The owner rejected the rebuilt Pacred app** — its admin back-office *and* its customer-portal workflow look nothing like the legacy **PCS Cargo** system that staff + ~8,898 customers run on daily. **New direction (D1):** Pacred *becomes* the legacy PCS Cargo system, faithfully — rebranded `PCS` → `PR`. Read [`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md) in full — it is the canonical D1 source of truth and supersedes the Tier 0/1/2/3 / Phase-2-build-queue framing of [`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md).

> ⚠️ **PIVOT — pause the pre-D1 backlog.** The booking-flow backend (**BK-1**), the freight expansion (**V-E1.1** / V-E6..V-E12), the Tier-3 systems (internal-chat · disbursement · china-ops) and the customer-intel backend are all **Phase C now** — deferred, *not cancelled*, re-sequenced after the faithful port. Stop building them. Your new work is **Phase B backend**.

> ✅ **DB-1 done — Phase B is UNBLOCKED, start it directly.** A direct REST probe of prod Supabase on 2026-05-18 confirmed prod is **at `0080`** — the `0058`-`0080` migration backlog (incl. the launch-integrity money/security guards `0060`-`0064`) is **already applied**, no P0 hole. There is **no "apply the backlog first" gate** — start Phase B straight away: **B-0 → B-auth → the admin track B-4..B-9.** (`0084`-`0086` stay frozen for Phase C per Q5; next free for new Phase-B work = `0087`.)

> 🛠 **Phase-A data load = เดฟ + Claude — in progress (2026-05-19).** เดฟ + Claude run the full legacy migration end-to-end: `pcsc_main` (942 MB dump) → local MySQL → pgloader → Postgres → dev Supabase, the `PCS`→`PR` rebrand, and migrations `0081`-`0083`. **ภูม: don't run the Supabase data load, don't author `0081`-`0083`** — they reach `dave` via เดฟ. You build Phase B *on* that schema once it merges; until then work the fidelity gap maps + the rework that needs the schema *shape*, not live rows.

**ภูม now — pickup list (Phase-B backend, priority order):**

1. **Rework the admin back-office onto the ported legacy schema — TOP priority (Phase B).** Phase A loads the legacy `pcsc_main` (117 tables, faithfully ported as `tb_*` — legacy names/types kept) into prod Supabase. Your job: rework the 60+ admin routes so they **operate on the `tb_*` schema with the legacy PCS admin workflow exactly** — same menus, same job statuses, same container (ตู้) flow, same end-to-end logic-loop. Goal: warehouse / scanner / receiving / shipping / accounting / audit staff need *zero* retraining.
2. **Rework the customer-portal backend onto the ported schema (Phase B)** — server actions + queries behind `/service-order` · `/service-import` · `/service-payment` · `/wallet` · `/shipments` etc. read/write the `tb_*` tables and follow the legacy PCS customer logic-loop. ปอน reworks the customer-facing UI in parallel — coordinate the data contract.
3. **Custom legacy auth** — migrated customers sign in with their *existing* PCS password (no reset) via the "เชื่อมต่อบัญชี PCS CARGO" login. The auth bridge `lib/auth/pcs-legacy-password.ts` (`passTam` / `verifyLegacyPassword`) is built + verified — wire it into the login flow.
4. **The `tb_*` schema migration — lands via เดฟ, you consume it.** เดฟ + Claude author the 117-table legacy schema as migrations **`0081`-`0083`** (Phase A — see the callout above; you already freed `0081`-`0083` by renumbering your booking / credit-note / chat batch up to `0084`-`0086` in commit `a248696`). The `tb_*` tables coexist with the rebuilt `profiles`-era tables during the transition; nothing is dropped. The pre-D1 PCS-customer migration (`0067` · `actions/admin/pcs-migration.ts`) is **superseded** — don't extend it.

**Migration numbering:** files `0001`-`0086` exist (`0065` is a gap). `0081`-`0083` are reserved for the Phase-A legacy schema (you freed them via the `a248696` renumber); your booking/credit-note/chat batch is now `0084`-`0086`. Next free for new Phase-B work = **`0087`**. Full deploy sequencing → [`runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md) §9.

**Your 6 Phase-B open questions — ✅ answered** (เดฟ · 2026-05-18) — [`research/poom-d1-open-questions.md`](../research/poom-d1-open-questions.md). Q1·Q3·Q4·Q5·Q6 decided (legacy schema split `0081`-`0083` · special-userID rewrite · lowest-vacant numbering · Phase-C `0084`-`0086` frozen until Phase B · `userType` 1:1 carry). **Q2 (auth-bridge session pattern) carries เดฟ's lean but needs ก๊อต — ping ก๊อต on LINE to ratify before B-auth ships.** You're unblocked for B-0 + B-auth wiring now.

**Carried-over backlog (Phase C — not a current pickup):** the Tier-3 systems, the booking-flow backend, the Phase I2 freight expansion (V-E6..V-E12) + the V-G admin bulk-ops bundle in [`docs/PORT_PLAN.md`](../PORT_PLAN.md) **Part V** are all re-sequenced to **Phase C** — *after* the faithful port works. Don't pick them up until D1 Phase B is done.

---

## 🚀 D1 focus (read FIRST)

The owner rejected the rebuild on 2026-05-18 — Pacred pivots to a **faithful port** of the legacy PCS Cargo system (`PCS` → `PR`). **ภูม is the single biggest Phase-B lever** — the admin back-office + customer-portal backend must reproduce the legacy PCS workflow exactly so staff and customers need *zero* retraining.

**The lens for D1:** fidelity to the legacy PCS system, not reinterpretation. When the legacy system does something a way you'd design differently — reproduce the legacy way. Phase C is when Pacred's own improvements layer on top; Phase B is faithful reproduction. Never ship a stage before the quality gate is green.

**ภูม Phase-B priorities** — see the §"Current state" block above: rework the admin back-office onto the `tb_*` schema first, then the customer-portal backend, wire the legacy auth bridge. The pre-D1 Tier-3 / booking-flow / freight backlog is **Phase C**.

**Defer to Phase C:** the Tier-3 systems (internal-chat · disbursement · china-ops), the booking-flow backend, the customer-intel backend, the V-E6..V-E12 freight expansion. Phase I (9 new ecosystem services) stays deferred behind that.

---

## 🔒 Force-read before any work

1. **[`docs/decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)** — ADR-0017, the canonical D1 source of truth (faithful PCS port, Phase A/B/C)
2. **[`docs/runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md)** — the Phase-A migration runbook — describes the `tb_*` schema your Phase-B backend operates on
3. **[`docs/research/d1-fidelity-admin.md`](../research/d1-fidelity-admin.md) + [`d1-fidelity-workflow.md`](../research/d1-fidelity-workflow.md)** — the rigorous legacy-PCS-vs-Pacred fidelity gap maps (admin + workflow), your **Phase-B rework spec**. Overview → [`d1-phase-b-gap-map.md`](../research/d1-phase-b-gap-map.md). Pre-D1 hunts ([`PACRED-GAP-ANALYSIS.md`](../research/PACRED-GAP-ANALYSIS.md) + `gap-*.md`) = supporting evidence
4. [`docs/team.md`](../team.md) §1 (your scope) + §3 (daily flow) + §10 (integration cycle)
5. [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) — the warehouse + container + shipment data spine (reconcile against the legacy `tb_*` ตู้ model)
6. [`docs/decisions/0006-tax-invoice-flow.md`](../decisions/0006-tax-invoice-flow.md) + [`0015`](../decisions/0015-withholding-tax-model.md) + [`0016`](../decisions/0016-freight-value-model.md) — schema specs (reconcile against the legacy workflow under D1)
7. [`docs/pacred-info.md`](../pacred-info.md) — company DNA (tax ID + legal name for invoice/PDF templates)
8. [`.claude/skills/INDEX.md`](../../.claude/skills/INDEX.md) — skills kit; **`legacy-php-sweep`** is your bread-and-butter — Phase B is fidelity-porting the legacy PHP workflow
9. [`docs/learnings/_index.md`](../learnings/_index.md) — scan for any new gotcha entries since last session
10. [`docs/audit/cargo-ops-forensics-2026-05-16.md`](../audit/cargo-ops-forensics-2026-05-16.md) — the decoded cargo/freight ops model

## 📂 Legacy reference (your most-touched external source)

**`D:\xampp\htdocs\pcscargo\`** — read-only PHP source for everything in cargo. Use [`.claude/skills/legacy-php-sweep/SKILL.md`](../../.claude/skills/legacy-php-sweep/SKILL.md) before every port. Specifically:
- `member/include/function.php` — 2451 LOC business helpers
- `member/include/header.php` — auth + dashboard precompute
- `member/pcs-admin/` — 187 admin files
- DB schema dump `C:\Users\Admin\Desktop\SQLWPPCS\somedata-2026-03-19-1348-pcsc_main.sql` (`Grep` only, never `Read` whole)

---

## Who you are

**100% หลังบ้าน + customer portal + admin back-office + cargo port.** You operate from `Poom`. You:

- Build server actions + DB schema + RLS policies + admin UI
- Bridge frontend ↔ customer backend ↔ admin backend
- Port the PHP `pcs-cargo` legacy to Pacred Next.js + Supabase (Phase 1 = port; Phase 2 = DPX ERP)
- Make the back-office **usable** — UX/UI = easy access, easy understanding
- Build per the container-centric data model — container is the spine

Per เดฟ brief 2026-05-16: "**ทำระบบหลังบ้านต่อ ให้เชื่อมโยงและใช้งานได้จริง และเข้าถึงใช้งานได้เข้าใจง่ายๆ UX UI ลิงค์ Theme เดียวกับหน้าบ้านทั้งหมด ส่วนหน้าฝั่ง Admin sidebar ด้านซ้าย BG ให้ใช้เป็นสีขาว ส่วน พื้นที่ที่เหลือให้ใช้ theme เดียวกับหน้าบ้านทั้งหมด**"

---

## Scope boundaries (per `team.md` §1.3)

✋ **You don't touch:** `app/[locale]/(public)/`, `components/sections/`, `components/booking/`, `components/knowledge/`, `messages/*.json` (ปอน owns)

✋ **You don't touch (lead-only):** `CLAUDE.md`, `docs/team.md`, `docs/conventions.md`, `docs/env.md`, `docs/PORT_PLAN.md`, `package.json`, `.github/`, `next.config.ts`, `eslint.config.mjs`, `proxy.ts`, `vercel.json`

✅ **You own:** `actions/`, `lib/`, `app/[locale]/(auth|protected|admin)/`, `supabase/migrations/`, `app/api/`, `components/admin/`, `components/pdf/`

---

## Current state of your domain

### 🟢 Shipped + in production

- **Customer portal** — `/login`, `/register` (personal + juristic 3-step + OTP), `/dashboard`, `/addresses`, `/service-order` (+ /add /cart /[hNo]), `/service-import` (+ /add /[fNo] /receipt /receipts), `/service-payment` (+ /add), `/wallet` (deposit/withdraw/history, soft-degrade), `/refunds`, `/notifications`, `/liff/link`, `/shipments` (+/[code]), `/forgot-password`
- **Admin back-office (60+ routes)** — HR full (org-chart, employees, recruitment, attendance, leaves, training, policies, audit) · dashboard, customers, admins (RBAC grant/revoke), drivers, csv-imports, hs-codes, containers · accounting (incl. container-costs) · reports · barcode · disbursements · refunds · migration/pcs-customers · global search · system crons + notifications
- **Container-centric model** — the 4-table warehouse/container/shipment spine + customer + admin views (CT-1..CT-8) shipped at launch
- **Tax-invoice issuance** (per ADR-0006) · pay-from-wallet self-serve (shop + forwarder) · receipt PDF · customer credit line · staff RBAC console
- **V-ADM1 admin UI polish** — left sidebar white (`bg-white dark:bg-surface`) · shared theme tokens · public red-cloud body background on the `/admin` shell
- **U1/U2/U4 + Tier 0/1/2** — wire-the-flow · revenue/margin · supervisory layer · `work_items` work-board (`0080` + `/admin/board` + `/admin/inbox`) — shipped on `dave`

### 🟡 In-flight / follow-up (D1 Phase B)

- Rework the admin back-office onto the ported `tb_*` schema + legacy PCS workflow — pickup #1
- Rework the customer-portal backend onto the `tb_*` schema — pickup #2
- Wire the legacy-password auth bridge into the login flow — pickup #3
- ⚠️ The Phase-1-5 rebuilt back-office below shipped against the `profiles`-era schema — under D1 it is reworked to the legacy `tb_*` schema + workflow (kept here as a reference inventory of what exists, not as the D1 target)

### Deferred to Phase C (was in-flight pre-D1)

- MOMO JMF sync · Xendit + K-Biz + K-Shop payment-gateway wire-up · the Tier-3 systems · the booking-flow backend — all re-sequenced after the faithful port

---

## Blockers + alternatives

When you're blocked:

| Blocked on | Alternative work |
|---|---|
| Phase A not yet loaded → no `tb_*` schema in dev/prod yet | Map the legacy PCS admin workflow from the gap docs + the legacy PHP source — spec the rework before the schema lands |
| A legacy-workflow ambiguity you can't resolve from the PHP source | Move to a different admin module's rework, or note it back to เดฟ for ก๊อต to settle |
| Waiting on เดฟ's Phase-B work-split | Sweep the legacy PHP (`legacy-php-sweep`) to inventory the admin/customer logic-loop you'll reproduce |

**Note back to เดฟ + ก๊อต when:** a legacy-workflow detail is ambiguous, you need an architectural call on the `tb_*` ↔ rebuilt-schema coexistence, a new env var, or an external service.

---

## Hand-offs IN

- **ก๊อต** ADRs (locked design contracts) → you implement
- **เดฟ** schema spec drafts + ADR scaffolds → you finalise + apply
- **ปอน** theme tokens + landing components → you reuse in admin UI

## Hand-offs OUT

- Schema migrations (`supabase/migrations/00NN_*.sql`) → applied to production Supabase (gates the `dave→main` deploy)
- Backend feature PRs in `Poom` → เดฟ merges into `dave`
- DECISIONS log entries (in commit messages) → ก๊อต/เดฟ adjust retroactively per `team.md` §6

---

## Push discipline (STRICTER per memory `push_frequency_strict`)

- Commit local freely during long backend sessions
- **Push to `origin/Poom` only at save-points** — end of session / before sleep / machine change / big batch done
- Per session: 1 push max
- เดฟ pulls from `origin/Poom` periodically to consolidate

## Cross-links

- [`docs/team.md`](../team.md) §1.3 — your scope boundaries
- [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part V — cargo + freight backlog
- [`docs/architecture/container-centric-model.md`](../architecture/container-centric-model.md) — your data spine
- [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md) — partner spec (blocked on ก๊อต)
- [`docs/decisions/`](../decisions/) — ADRs you implement
- [`docs/conventions.md`](../conventions.md) — code style, action shape, migration rules
- [`docs/briefs/ops-roles.md`](ops-roles.md) — staff role → admin workspace mapping
