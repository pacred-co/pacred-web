# 🛠 Pacred Skills Kit — index

> **What's a skill?** A playbook the agent follows when triggered. Each `<skill-name>/SKILL.md` has frontmatter (`name` + `description` = when to fire) and a body (instructions on how to execute). The harness surfaces these via the Skill tool.

> **How they fit into Pacred's workflow:** The role briefs say WHAT to work on. ADRs say WHAT was decided. Skills say HOW to execute repeatable patterns — bug hunts, audits, refactors, ports, knowledge capture — without the agent reinventing the approach each time.

Last reviewed: 2026-05-18 (+mobile-first-verify — the render-at-360/390px customer-surface mobile check; +branch-integrate-loop — the integrate→verify→distribute consolidation cycle; +qa-flow-simulator — agent-driven end-to-end flow verification) · 2026-05-19 (+legacy-fidelity-check — the D1 owner-mandate fidelity gate; +landing-conversion-audit — the pre-ads landing CRO + tracking check)

---

## The skill set (14 skills — all `.claude/skills/<name>/SKILL.md`)

| Skill | Trigger keywords / context | One-line purpose |
|---|---|---|
| **phase-verify-loop** | "เสร็จ phase / batch / sprint" · "verify everything" · "make sure nothing broke" | Assume → check → verify → analyze → fix loop until clean |
| **bug-swarm-loop** | "บัค repro ไม่ได้" · "intermittent failure" · "cross-cutting bug" · "spawn agents to find" | Spawn parallel hunter agents to isolate intermittent / wide bugs |
| **audit-kpi-dashboard** | "KPI" · "dashboard" · "how are we doing on X" · "visualise metric" | Generate a metrics dashboard from existing data tables |
| **test-coverage-writer** | "write tests for" · "no tests on this function" · "raise coverage" | Write unit + integration tests to repo coverage target |
| **refactor-readability** | "this is hard to read" · "deeply nested" · "refactor for humans" | Refactor without behavior change for readability |
| **performance-hunter** | "slow page" · "LCP > 3s" · "query > 500ms" · "optimize" | Systematic perf bottleneck hunt + measured fix |
| **scholar-immortal** | "I learned X today" · "this gotcha bit me" · end of any session | Capture learning to `docs/learnings/<topic>.md` for future agents |
| **copyist-unlimited** | "9 landing pages" · "N variants of this template" · "scaffold X for each service" | Clone + adapt templates at scale |
| **legacy-php-sweep** | "port the X feature from old PHP" · "find how PHP did Y" | Sweep `D:\xampp\htdocs\pcscargo` for feature source + extract logic |
| **qa-flow-simulator** | "run test cases" · "did the flow actually work" · "functional verification" · "§0 gate" · before a dave→main deploy | Agent simulates a real user journey end-to-end + asserts the observable outcome (not just a 200) |
| **branch-integrate-loop** | "consolidate the branches" · "merge ภูม/ปอน's work" · "ดึงงานทุก branch มารวม" · "integrate + distribute" · before a dave→main deploy | The daily integrate → verify → distribute cycle — consolidate teammate branches into dave without losing work or shipping a half-state |
| **mobile-first-verify** | "check this on mobile" · "is this responsive" · "phone QA" · "ดูบนมือถือ" · before pushing a customer surface | Render a page at the 360/390px reference viewports + assert no horizontal scroll · tap targets ≥ 44px · text ≥ 16px · CTA thumb-reachable |
| **legacy-fidelity-check** | "fidelity check" · "เหมือนของเดิมไหม" · "ตรงกับ PCS เก่าไหม" · before pushing a D1 Phase-B rework | Audit a port screen element-by-element against its legacy PCS original — the owner's "copy 100% first" gate |
| **landing-conversion-audit** | "พร้อมยิงแอดยัง" · "conversion audit" · "CRO check" · before ads point at a page | Pre-flight a landing for CONVERT + TRACK + Quality-Score so paid traffic converts AND is measured |

---

## How to invoke

```
User says: "ใช้ skill <name>" or "run the <name> playbook"
or: just describe the situation — the skill's description should match
```

Skills are progressively-disclosed: only `name` + `description` stay in context until triggered. When triggered, the full `SKILL.md` body loads. References inside the skill folder (e.g. `references/*.md`) load on-demand from there.

---

## How to extend (ก๊อต hand-off)

This is a **seed set**. ก๊อต extends:

1. **Test each skill** — use `anthropic-skills:skill-creator` to run the test/eval/iterate loop on each one. Refine descriptions for trigger accuracy.
2. **Add new skills** as patterns emerge from real Pacred work. Examples we expect:
   - `customs-clearance-pipeline` — port the PHP customs flow
   - `tax-invoice-generator` — wrap the ADR-0006 flow as repeatable
   - `migration-writer` — Supabase migration template
   - `landing-shell-cloner` — clone Phase I service landing shells
   - `daily-integration-window` — automate เดฟ's daily merge cycle
3. **Promote stable skills** to org-wide registry (future — when Pacred has multiple repos).

---

## Cross-links

- [`/docs/STRATEGY.md`](../../docs/STRATEGY.md) §11 — strategic role of skills
- [`/docs/learnings/_index.md`](../../docs/learnings/_index.md) — where `scholar-immortal` writes
- [`anthropic-skills:skill-creator`](https://github.com/anthropics/claude-code-skills) — eval/iterate harness ก๊อต uses to refine these
- [`AGENTS.md`](../../AGENTS.md) — agent behavior rules (force-read your brief, revenue-first lens, etc.)
