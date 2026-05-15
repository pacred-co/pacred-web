<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Pacred — agent behavior rules

> AGENTS.md is loaded into every Claude Code session via `@AGENTS.md` at the top of `CLAUDE.md`. Keep this file narrow: rules that change *how* agents behave, not project facts (facts live in CLAUDE.md / docs/).

## 1. Session-start handshake (MANDATORY — do BEFORE asking what to work on)

After `git fetch` + branch sync at the top of a session, run this handshake **proactively** — do not wait for the user to ask. Skipping = wandering session + forcing the user to re-explain context they already encoded in docs.

**Step 1 — Read your role brief** ([`docs/briefs/<your-name>.md`](docs/briefs/) — routing in [`docs/briefs/INDEX.md`](docs/briefs/INDEX.md)).

**Step 2 — Scan canonical context** (parallel reads):
- [`docs/STRATEGY.md`](docs/STRATEGY.md) — master single-read consolidation (~350 lines)
- [`docs/learnings/_index.md`](docs/learnings/_index.md) — new entries since last session (immortal-scholar — `.claude/skills/scholar-immortal/`)
- Your brief's "Force-read" cross-links (e.g. PORT_PLAN Part T, relevant ADRs)

**Step 3 — Surface a state summary to the user** (don't ask first — present it):
- 🟢 **Shipped** — what's behind us (1-3 lines, latest sprint)
- 🟡 **Your pickup list** — top 3-5 P0/P1 from your brief
- 🔴 **Critical blockers** — who you're blocked on, who's blocked on you
- **Recommended first task** — highest-leverage P0 with effort estimate

**Step 4 — Wait for user go-ahead** before implementing. They may redirect to a different pickup.

**Triggers:** any session that starts with sync ("ต่อที่ทำงาน", "เปิดมาใหม่", new worktree, machine change, fresh Claude Code window). Per memory `session_start_handshake`.

## 2. Revenue-first lens (emergency mode active)

The company is burning runway (per `cash_burning_p0_emergency` memory). Default to the question: **"งานนี้ส่งผลให้รับลูกค้า cargo ได้เร็วขึ้นไหม?"**

- Yes → do it now (P0)
- No → defer or hand off (don't do mid-emergency)

Cargo system getting customers > everything else (V3 prep, refactors, "nice-to-have" features, broad cleanup).

📋 The decoded cargo revenue backlog = [`docs/PORT_PLAN.md`](docs/PORT_PLAN.md) **Part V**, sourced from [`docs/audit/cargo-ops-forensics-2026-05-16.md`](docs/audit/cargo-ops-forensics-2026-05-16.md) (8 months of legacy-system pain + 10 real cargo documents decoded into tasks `V-A1…V-F3`). Start cargo work there.

## 3. Don't preempt brand cleanup

Pacred is splitting from **PCS CARGO + TTP + ไอแต้ม**. References to these survive in code because some APIs are still "borrowed" interim. **Do not scrub these references** until ก๊อต confirms the matching API switchover. The rule lives in [`docs/runbook/pcs-scrub-plan.md`](docs/runbook/pcs-scrub-plan.md).

## 4. V2 ≠ V3 — don't refactor mid-flight

This repo (`pacred-web`) is **V2 owner-pleaser**. V3 lives in a separate future repo (`pacred-DPX`) per [ADR-0010](docs/decisions/0010-v2-v3-version-strategy.md). When tempted to refactor toward your ideal architecture, append to `docs/v3-wishlist.md` instead. Don't ship V3 redesigns into V2.

## 5. Push at save-points only

Commit local freely. Push only when: end of session · before sleep · machine change · location change · big batch done. Per [memory: push_frequency_strict] + [`docs/team.md`](docs/team.md) §3.0. Vercel build cost + push churn distracts the team.

## 6. Customer-visible surfaces have a voice

Slogan: **"เร็ว ไว ไม่มีคำว่าทำไม่ได้"**. Mobile-first. Copy ตรงเป้า ไม่อ้อม. Every service has a landing page (even if backend not ready → use "ติดต่อทีม" CTA fallback). Don't ship dry copy.

## 7. Constants live in `components/seo/site.ts`

Company info (phone / email / address / legal name / tax ID / slogan / LINE OA / social) **must be imported** from this single source. Never hardcode. If you spot hardcoded values, flag them via `L-contact-refactor` tracker in PORT_PLAN.

## 8. Never break the autonomous run

When the user says "จัดมาเลย / รันยาวๆ / ลุยเลย" → pick recommended defaults, don't ask mid-run, save-points-only pushes (per `autonomous_long_runs` memory). The check-in pattern is `AskUserQuestion` only when there's a load-bearing branch you can't infer.

---

## 9. Skills are playbooks — invoke them

The `.claude/skills/` directory contains 9 starter skills (see [`.claude/skills/INDEX.md`](.claude/skills/INDEX.md)):

- `phase-verify-loop` — close every phase with assume → check → verify → analyze → fix
- `bug-swarm-loop` — hard bug? Spawn 4-5 hunter sub-agents in parallel
- `audit-kpi-dashboard` — generate dashboards from operational data
- `test-coverage-writer` — write unit + integration tests systematically
- `refactor-readability` — refactor without behavior change
- `performance-hunter` — measured perf fixes, never blind
- `scholar-immortal` — capture every learning to `docs/learnings/` (knowledge compounds)
- `copyist-unlimited` — clone templates at scale (N variants)
- `legacy-php-sweep` — port from `D:\xampp\htdocs\pcscargo` to Pacred Next.js

When a situation matches a skill's description → invoke via the Skill tool (`skill: <name>`). Or describe the situation and let the harness match.

## 10. Capture learnings (immortal scholar)

Every time you learn something tricky — a Next 16 gotcha, a Vercel surprise, a working solution after debugging, a partner-API quirk — write to `docs/learnings/<topic>.md` per the `scholar-immortal` SKILL.md protocol. Even small entries compound. Pacred-specific knowledge that no LLM training has = our moat.

---

For project facts (architecture, schema, env, branches, decisions): see [CLAUDE.md](CLAUDE.md) and the linked docs.
For master strategic single-read: see [docs/STRATEGY.md](docs/STRATEGY.md).
