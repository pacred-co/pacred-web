# เดฟ — Project Lead / Integrator / Customer-backend 1:1

Last reviewed: 2026-05-24 (strategy reset — V3 unlocked, faithful-port branch deleted, ก๊อต takes admin lane)
Branch: **`dave-pacred`** → merges to `main` (ก๊อต gates) · Authority: second-tier owner

> ## 🚨 2026-05-24 STRATEGY RESET (READ FIRST)
>
> Owner cleaned up branch model and unlocked V3 for parallel work. New lane split:
>
> | Role | Lane | Branch |
> |---|---|---|
> | **เดฟ (you)** | 1:1 **customer-backend** portal — `(protected)/*` screens + Server Actions onto `tb_*` · integrate ปอน frontend | `dave-pacred` |
> | **ก๊อต** | **1:1 admin back-office** lane (NEW — was ภูม pre-reset) · 187 `pcs-admin/*.php` files | (own commits) |
> | **ปอน** | Customer-facing frontend + brand-asset swap | `podeng` |
> | **ภูม** | **V3 backend continuation (UNLOCKED)** — DPX ERP enhancements; merges *after* 1:1 ships | `Poom-pacred` |
>
> **Deleted 2026-05-24:** `faithful-port` (direct-to-main pattern now) · all stale `claude/*` remotes · `hotfix/auth-unblock` (cherry-picked).
>
> **Just merged into `dave-pacred`:** `podeng` (4 commits — home polish + (protected) chrome rebuild in Tailwind + dropped legacy CSS leak). Verify before pushing main.
>
> **READ FIRST:**
> - [`docs/research/d1-deep-audit-2026-05-24.md`](../research/d1-deep-audit-2026-05-24.md) — 10 critical gaps from the deep audit (Google Sheets, JMF/TTP/CN APIs, LINE Notify, TAMIT, MOMO LCL, etc.)
> - [`docs/runbook/faithful-port-plan.md`](../runbook/faithful-port-plan.md) — updated branch model + work-split

## 🎯 Direction — D1: Pacred is a faithful PCS Cargo port

🔴 The owner rejected the rebuilt Pacred app — its UI *and* its workflow look
nothing like the legacy **PCS Cargo** system that staff + ~8,898 customers run
on daily. **D1:** Pacred *becomes* the legacy PCS Cargo system, faithfully —
rebranded `PCS` → `PR`. Owner rule (verbatim): **"copy the original to 100%
sameness FIRST, then improve."** Canonical SOT →
[`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
— read it in full. It supersedes the Tier 0/1/2/3 framing of
[`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md).

Three phases: **A** data migration · **B** workflow fidelity · **C** Pacred
enhancements (the old Tier roadmap, *deferred not cancelled*).

## 🟢 Where the project is now

- 🟢 **Phase A** — legacy `pcsc_main` (117 tables · 8,898 customers) business
  data **LOADED to dev + prod Supabase**; migrations `0081`-`0083` + `0087` on
  `dave`. *Remaining:* 3 oversized log tables + customer images — backfill
  after the Supabase Pro upgrade (imminent).
- 🟢 **Phase B** — **wave 1 done + integrated**: customer 9-icon launchpad ·
  customer order flow · admin per-role RBAC sidebar + badges · admin container
  `tb_cnt` payment ledger · ภูม's legacy-auth bridge. Wave 1 is a *first pass* —
  not yet element-by-element fidelity-verified.
- ⚪ **Phase C** — deferred (Tier roadmap · ads/marketing · 8-specialist R&D).

## 🧭 Your lane (post-2026-05-24)

You're the **1:1 customer-backend lead + ปอน integrator**. ก๊อต takes the admin 1:1 lane. ภูม keeps V3 alive on Poom-pacred (UNLOCKED 2026-05-24). Concretely you:

- **Own customer-portal `(protected)/*` 1:1 fidelity** — 15/24 screens transcribed; ~9 remaining (login/register fidelity check, forgot-password, regis-tam, line-notify, etc.). Drive these to done.
- **Wire missing customer-side integrations** — TAMIT verification, LINE Notify per-user OAuth (gaps #3 + #5 in deep audit).
- **Integrate ปอน's frontend** — merge `podeng` into `dave-pacred`, run `pnpm verify`, smoke-test, push to main.
- **Coordinate with ก๊อต** on the admin lane — agree on which routes are 1:1-ported (ก๊อต) vs V3-enhanced (ภูม merges later from Poom-pacred).
- **Phase A close-out** — wait for ก๊อต's Supabase Pro upgrade, then backfill 3 log tables + customer images (need REALSHITDATAPCS.rar extraction).

## 🟡 Your pickup list (priority order, post-reset)

1. **Verify the just-merged podeng work** on `dave-pacred` — `pnpm lint && pnpm build`, smoke `/dashboard` + `/wallet` + `/service-order` for the chrome rebuild side-effects, then push to main if clean. (Just merged: `d7b1758` containing `5097a2b` home polish + `fbb63fe` chrome rebuild in Tailwind.)
2. **Gap #5 — TAMIT integration stub** — port `member/regis-tam.php` flow (~1 day · S effort). Replace the DBD/RD stub.
3. **Gap #3 — LINE Notify per-user OAuth** — port `member/line-notify.php` + `member/api/linenotify/callback/` to Next.js Route Handlers + dispatcher cron (~3-5 days · M effort). Customer-visible.
4. **Customer screens still NOT 1:1 transcribed** — login/register fidelity check (need post-OTP-emergency verification), forgot-password, wallet-normal/wallet-credit split if owner wants legacy two-page UX.
5. **Coordinate ก๊อต admin lane kickoff** — pick from `poom-save-point-2026-05-19-night.md` §10 top-5 admin pilots (index.php dashboard, users-search, forwarder.php, wallet family).
6. **Phase A close-out** — once ก๊อต upgrades Supabase Pro + extracts customer images, backfill 3 log tables + reconcile 117/117 tables.
7. **Retire pre-D1 scaffolding** — `0067_pcs_customer_migration.sql` + `actions/admin/pcs-migration.ts` + `u2-1-pcs-customer-migration.md` superseded by Phase A. Decide when rebuilt `profiles`-era schema retires.

## ✋ Non-collision rule

ปอน = customer-facing frontend surfaces. ภูม = backend (admin routes + server
actions + `tb_*` queries). You integrate. **One owner per surface** — anyone
taking a fresh surface coordinates through you first.

## 🔒 Force-read before any work

1. [`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
   — ADR-0017, the canonical D1 SOT
2. [`runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md) — the
   Phase-A runbook (the backfill you drive to done)
3. The fidelity gap maps — [`d1-fidelity-customer.md`](../research/d1-fidelity-customer.md) ·
   [`d1-fidelity-admin.md`](../research/d1-fidelity-admin.md) ·
   [`d1-fidelity-workflow.md`](../research/d1-fidelity-workflow.md) — your
   Phase-B work-split input
4. [`team.md`](../team.md) §3 (daily workflow) + §3.0 (push frequency)
5. [`pacred-info.md`](../pacred-info.md) — company DNA SOT
6. Memory: `pacred_company_dna` · `feedback_faithful_port_priority` ·
   `push_frequency_strict` (load via /memories)

## Who you are

**Project Lead + Integrator.** You operate from `dave`. You consolidate ปอน +
ภูม work into `dave`, drive Phase A to完成, spawn + sequence the Phase-B waves,
hold the deploy gate with ก๊อต, and cover ปอน + ภูม when blocked. Hand the
decision-heavy / partner / security items to ก๊อต — don't do everything yourself.

## Blockers + alternatives

| Blocked on | Alternative work |
|---|---|
| ก๊อต's Supabase Pro upgrade not done → can't backfill | Phase B-0: fidelity-verify wave 1; sequence the next wave from the gap maps |
| Waiting on แต้ม's customer image files | Backfill the 3 log tables once Pro is live; integrate staged `dave` Phase-B work |
| No teammate push to integrate | Spawn the next Phase-B wave agent; retire the superseded `0067` scaffolding |

**Note back to ก๊อต when:** the owner sends creds, a partner needs a decision,
or a security concern surfaces.

## Hand-offs

**IN** — ก๊อต ADRs + external creds (you action) · ปอน `podeng` frontend PRs
(you merge) · ภูม `Poom` backend PRs (you merge) · owner ad-hoc requests (you
triage). **OUT** — Phase-B wave specs → ปอน + ภูม · merged `dave` → ก๊อต
reviews + merges to `main`.

## Push discipline (per memory `push_frequency_strict`)

Commit local freely; **push to `origin/dave` only at save-points** (end of
session / before sleep / machine change / big batch done). 1 push max per
session. All 4 teammates follow the same discipline.

## Cross-links

- [`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md) — D1 SOT
- [`team.md`](../team.md) §3 — daily flow
- [`runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md) — Phase-A runbook
- [`research/d1-phase-b-gap-map.md`](../research/d1-phase-b-gap-map.md) — Phase-B gap map overview
- [`../../.claude/skills/branch-integrate-loop/SKILL.md`](../../.claude/skills/branch-integrate-loop/SKILL.md) — your integration playbook
- [`briefs/ops-roles.md`](ops-roles.md) — staff role contexts informing admin design
