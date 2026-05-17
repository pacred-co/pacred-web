# 📂 Pacred briefs — agent reading map

> **Force-read instruction (for Claude Code agents):** before any work,
> open YOUR developer brief from this list. Read it top to bottom. Then
> open the cross-linked canonical docs it tells you to read.
>
> ทุก agent ใช้ Claude Code Windows — ทำงาน async. การอ่าน brief ให้ตรงกัน
> = ทุกคนทำงานไปในทิศทางเดียวกัน

> 🚀 **POST-LAUNCH (production live since 2026-05-17)** — the emergency
> cargo sprint is behind us. Current work is sequenced in
> [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) (the post-launch roadmap).
> Each brief still opens with its role's current pickup list — read
> your brief, then the UPGRADE_PLAN work-split for your role.

Last reviewed: 2026-05-18 (post-launch revision)

---

## 🧑‍💻 Which brief do you open?

Decide by who YOU are (the human running this Claude Code session):

| If you are… | Open your brief | Then continue with these canonical docs |
|---|---|---|
| **ก๊อต** (Senior Advisor / Production Watcher) | [`got.md`](got.md) | [`../team.md`](../team.md) → [`../PORT_PLAN.md`](../PORT_PLAN.md) Part S |
| **เดฟ** (Project Lead / Integrator) | [`dave.md`](dave.md) | [`../team.md`](../team.md) → [`../PORT_PLAN.md`](../PORT_PLAN.md) Part S → [`../decisions/0010-v2-v3-version-strategy.md`](../decisions/0010-v2-v3-version-strategy.md) |
| **ภูม** (Backend / Cargo Port / Admin) | [`poom.md`](poom.md) | [`../team.md`](../team.md) → [`../architecture/container-centric-model.md`](../architecture/container-centric-model.md) → [`../integrations/momo-jmf.md`](../integrations/momo-jmf.md) |
| **ปอน** (Frontend / SEO / Marketing) | [`podeng.md`](podeng.md) | [`../team.md`](../team.md) → [`../conventions.md`](../conventions.md) → [`../decisions/0007-analytics-and-ab-testing.md`](../decisions/0007-analytics-and-ab-testing.md) |
| **System designer** (anyone designing admin workspaces / RBAC / workflows for STAFF roles) | [`ops-roles.md`](ops-roles.md) | [Container model](../architecture/container-centric-model.md) → [ADR-0009 ERP schema](../decisions/0009-erp-schema-sketch.md) |

---

## 🗺️ Brief structure (per dev brief)

Each developer brief follows the same shape so agents can rely on knowing where to look:

1. **Who you are** — role + branch + scope boundaries
2. **Force-read links** — canonical docs you must read top of session
3. **Current state** — what's shipped + what's in-flight in your domain
4. **Your next pickups** — concrete backlog you can pull from
5. **Blockers + alternatives** — what's waiting on whom; what to do instead
6. **Hand-offs out** — what you produce that other people consume

The shape is identical across briefs to make scanning fast.

---

## 🧩 ops-roles.md — STAFF role briefs (14 roles)

`ops-roles.md` is ONE file with sections per staff role. Each section describes:

- What the role does in the real world (Pacred operations)
- What admin workspace pages they use (`/admin/...`)
- What data they read + edit
- What workflows they own
- What RBAC role gates them
- Status of their workspace in the current build (🟢 / 🟡 / 🔴)

This file informs **system design** (admin UIs, RBAC) — not your daily coding rhythm. ภูม consults it when planning new admin pages; ก๊อต consults it when locking RBAC granularity.

---

## 🔁 How to use these briefs in a Claude Code session

When you open Claude Code in your worktree, paste this as your first message:

> "Read `docs/briefs/<your-name>.md` first. Then continue
> with the canonical docs it links. Tell me what's at the top of my
> pickup list."

The agent will:
1. Open your brief
2. Open the canonical docs your brief points to
3. Surface the highest-priority pickup
4. Wait for your go-ahead before implementing

This pattern is now **mandatory** per [`/CLAUDE.md`](../../CLAUDE.md) "Read briefs first" section.

---

## 🆕 Onboarding new dev (someone joining the 4-person team)

1. Read [`HANDBOOK.md`](../HANDBOOK.md) (10 min overview)
2. Read [`team.md`](../team.md) (roles + branches + workflow)
3. Read [`conventions.md`](../conventions.md) (code style + commit format)
4. Read [`env.md`](../env.md) (env vars + production checklist)
5. Open YOUR developer brief here (`got.md` / `dave.md` / `poom.md` / `podeng.md`)
6. `cp .env.example .env.local` + ask เดฟ for shared values
7. `pnpm install --frozen-lockfile`
8. `pnpm verify` (all 4 gates: lint + tsc + tests + audits)
9. Ask เดฟ for first task

---

## 📜 Authority + decision rules

- **Owner (พี่ป๊อป)** = ultimate scope authority for V2 (per [ADR-0010](../decisions/0010-v2-v3-version-strategy.md))
- **เดฟ + ก๊อต = second-tier owners** with decision authority below owner (per memory `project_authority`)
- **ปอน + ภูม** focus on their domain; escalate scope expansion to เดฟ
- All architectural decisions = ADR in [`docs/decisions/`](../decisions/) (lock + iterate; don't relitigate in chat)

---

## 📚 Cross-doc map

| Doc | Purpose |
|---|---|
| [`../STRATEGY.md`](../STRATEGY.md) | **Master strategic single-read** — all briefs/ADRs/plans condensed (use as session warm-up) |
| [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) | **Post-launch roadmap** — the canonical forward plan (phase/stage + work-split) |
| [`../../.claude/skills/INDEX.md`](../../.claude/skills/INDEX.md) | Skills kit — 12 playbooks for repeatable patterns |
| [`../learnings/_index.md`](../learnings/_index.md) | Compounding learnings — scan at session start |
| [`../HANDBOOK.md`](../HANDBOOK.md) | Master index — start of everything |
| [`../team.md`](../team.md) | Role + branch + workflow rules |
| [`../conventions.md`](../conventions.md) | Code style + commit format |
| [`../env.md`](../env.md) | Every env var explained + production checklist |
| [`../PORT_PLAN.md`](../PORT_PLAN.md) | Sprint history + cargo/gap-hunt backlogs (Parts O–W) |
| [`../sprints/archive-a-to-n.md`](../sprints/archive-a-to-n.md) | Historic survey + earlier sprint plans (Parts A–N) |
| [`../architecture/container-centric-model.md`](../architecture/container-centric-model.md) | Warehouse + container + shipment data spine |
| [`../integrations/momo-jmf.md`](../integrations/momo-jmf.md) | MOMO partner API spec |
| [`../decisions/`](../decisions/) | ADRs (locked decisions — 0001..0016 + V3 drafts) |
| [`../research/_index.md`](../research/_index.md) | R&D / gap-hunt / audit evidence base behind the UPGRADE_PLAN |
| [`../audit/owasp-2026-05.md`](../audit/owasp-2026-05.md) | Pre-launch security posture audit |
| [`../audit/php-pcscargo-integrations.md`](../audit/php-pcscargo-integrations.md) | Deep legacy PHP audit |
| [`../runbook/`](../runbook/) | Operational runbooks (PCS scrub / OTP rotation / Vercel cron / launch monitoring) |
