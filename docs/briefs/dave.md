# เดฟ — Project Lead / Integrator

Last reviewed: 2026-05-19 (D1 — Phase A loaded · Phase B wave-1 integrated)
Branch: `dave` (integration) → merges into `main` via ก๊อต gate · Authority: second-tier owner

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

## 🧭 Your lane — INTEGRATOR + PHASE-A COMPLETION DRIVER (senior)

You + ก๊อต are the **senior lane**; ปอน + ภูม execute. You own the integration
spine and drive Phase A to done. Concretely you:

- **Drive Phase A to完成** — the Supabase Pro backfill of the 3 log tables +
  customer images, then reconcile 117/117 tables prod ↔ legacy.
- **Integrate Phase B** — consolidate ภูม / ปอน pushes into `dave`, verify,
  distribute back (the [`branch-integrate-loop`](../../.claude/skills/branch-integrate-loop/SKILL.md) skill).
- **Spawn the Phase-B wave agents** — execute the fidelity rework via worktree
  agents that land on `dave`, wave by wave, so the team works one direction.
- **Hold the `dave → main` deploy gate** with ก๊อต — nothing ships before the
  quality gate is green.

## 🟡 Your pickup list (priority order)

1. **Phase A — finish it.** After ก๊อต's Supabase Pro upgrade: backfill the 3
   oversized log tables (`tb_web_hs` · `tb_history_key` · `tb_history`,
   ~779 MB — free tier capped at 500 MB) + the customer image/file storage
   (ก๊อต fetches from แต้ม), then reconcile **117/117** tables prod ↔ legacy.
   Runbook → [`runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md).
2. **Phase B-0 — fidelity-verify wave 1.** Run the
   [`legacy-fidelity-check`](../../.claude/skills/legacy-fidelity-check/SKILL.md)
   skill on wave-1's 4 surfaces (launchpad · order flow · admin RBAC sidebar ·
   container ledger); close every gap before moving on. Wave 1 was first-pass.
3. **Phase B waves — sequence + spawn.** Break the fidelity gap maps
   ([`d1-fidelity-customer.md`](../research/d1-fidelity-customer.md) ·
   [`d1-fidelity-admin.md`](../research/d1-fidelity-admin.md) ·
   [`d1-fidelity-workflow.md`](../research/d1-fidelity-workflow.md); overview
   [`d1-phase-b-gap-map.md`](../research/d1-phase-b-gap-map.md)) into waves —
   ปอน takes the customer frontend screens, ภูม the admin/backend. Spawn the
   wave agents; keep one owner per surface.
4. **Integrate continuously** — merge ภูม / ปอน pushes into `dave`, verify, push.
5. **Retire the superseded scaffolding** — the pre-D1 PCS-customer migration
   (`0067_pcs_customer_migration.sql`, `actions/admin/pcs-migration.ts`, the
   `u2-1-pcs-customer-migration.md` runbook) is replaced by the Phase-A
   full-system port. Decide when/how the rebuilt `profiles`-era schema retires.

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
