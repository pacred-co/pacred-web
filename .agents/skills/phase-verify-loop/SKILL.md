---
name: phase-verify-loop
description: Use this skill at the end of every phase, batch, sprint, or "feature done" moment — basically any time the agent is tempted to say "looks good, ready to push". Triggers when the user says "verify", "make sure nothing broke", "ตรวจสอบให้ดี", "เสร็จ phase แล้ว", "เช็คอีกที", or after finishing a multi-step task. Runs an assume-check-verify-analyze-fix loop with theory-of-failure hypothesis generation, executes, and iterates until every gate is green. Don't skip this even if changes look small — silent breakage in CI / Vercel / runtime is exactly what this catches before the team finds out the hard way.
---

# Phase Verify Loop

> **Why this exists.** "It compiles" is not "it works". "Tests pass locally" is not "it works in CI". "Looks fine in dev" is not "Vercel builds cleanly". This skill walks the gap between "I think I'm done" and "I actually know I'm done". The user (เดฟ) explicitly asked for this: *"ลอง assume เช็ค แล้ว verify ทุกรอบ วิเคราะห์ แล้วไปแก้ตามทฤษฏีที่สามารถจะจินตนาการได้เลย ทำรัน verify จนสมบูรณ์ แล้วให้วน loop"*.

## The loop

```
┌─ Phase change detected ──────────────────────────────────────────┐
│  (you finished a batch · feature · refactor · merge)             │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌─ 1. ASSUME — list what should be true now ──────────────────────┐
│  Write down 5-10 concrete claims that must hold post-change.    │
│  Examples:                                                       │
│  · "pnpm lint exits 0"                                          │
│  · "pnpm exec tsc --noEmit exits 0"                              │
│  · "pnpm test:unit shows N pass / 0 fail (N >= prev)"           │
│  · "pnpm audit:all exits 0"                                      │
│  · "no new hardcoded values per pacred-info.md L-contact tracker"│
│  · "i18n th key count == en key count (= 1804 right now)"        │
│  · "every new env var declared in .env.example"                  │
│  · "every new ADR cross-linked from STRATEGY.md §8"              │
│  · "CI workflow file syntactically valid yaml"                   │
│  · "Vercel build would succeed (no Server-Component using        │
│    'use client' helpers / no client-imported server-only)"      │
│  · "if a migration added/changed an admin ROLE, every RLS        │
│    predicate + requireAdmin() gate was re-checked vs the role    │
│    model — 'RLS enabled' ≠ 'RLS predicate matches the roles'"    │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌─ 2. CHECK — execute each assumption ────────────────────────────┐
│  Run the corresponding command for each claim. Capture stdout +  │
│  stderr + exit code into a verify log (mental or scratch file).  │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌─ 3. VERIFY — assumption met OR broken? ─────────────────────────┐
│  For each: pass / fail. If everything green → DONE. Push.        │
│  If any red → continue to ANALYZE.                               │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌─ 4. ANALYZE — theory of failure ────────────────────────────────┐
│  For each red item, write 2-3 candidate explanations BEFORE     │
│  diving into the code. Imagine: "what could have caused this?".  │
│  Don't just chase the first stack trace. Examples:               │
│  · CI fail with ERR_PNPM_BAD_PM_VERSION:                        │
│    (a) action-setup version conflicts with package.json         │
│    (b) corepack mismatch                                         │
│    (c) lockfile drift                                            │
│    → Test (a) first because it matches the error message verbatim│
│  · 200 lint warnings appearing:                                  │
│    (a) new eslint rule active after dep update                   │
│    (b) prior PR introduced bad patterns                          │
│    (c) tsconfig path mapping broke                               │
│    → Test (a) — `git log -- eslint.config.mjs` recent changes?   │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌─ 5. FIX — apply the most-likely theory ─────────────────────────┐
│  Make the minimal change consistent with theory. Don't rewrite. │
│  Don't fix adjacent unrelated issues "while I'm here" — track   │
│  those separately (TodoWrite / pacred-info L-* tracker).         │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌─ 6. RE-VERIFY — back to step 2 ─────────────────────────────────┐
│  Run the same checks. If the fix worked + nothing else broke →   │
│  next red item. If fix didn't work → back to ANALYZE with a new  │
│  theory.                                                          │
│  Loop bound: 5 iterations max. If still red after 5 → escalate   │
│  (ask user · open issue · ping เดฟ/ก๊อต).                         │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌─ 7. CAPTURE — what did we learn? ───────────────────────────────┐
│  Before declaring done, ask: did any of the fixes reveal a       │
│  recurring class of problem? If yes → write to                   │
│  `docs/learnings/<topic>.md` via `scholar-immortal` skill.       │
│  Future agents (and future you) avoid the same trap.             │
└──────────────────────────────────────────────────────────────────┘
                              ↓
                           DONE
```

## Verify commands cheatsheet (Pacred-specific)

```bash
# The umbrella — runs all 4 gates in sequence
pnpm verify

# Or individually
pnpm lint                              # eslint flat config
pnpm exec tsc --noEmit                 # typecheck (ignore .next/dev/types/* artifacts)
pnpm test:unit                         # env-independent test chain (240+ assertions)
pnpm audit:all                         # md links + env-var refs + i18n parity

# Smoke gates for Pacred specifically
git log dave..HEAD --oneline           # commits about to ship
git status --short                     # working tree state
pnpm exec next build                   # only if a route boundary changed (slow)
```

## Production smoke gate — MANDATORY before any deploy to `main`

`pnpm verify` + `pnpm build` passing does NOT prove pages work in production.
A dynamic route can 500 at request time while `build` exits 0, and `next dev`
masks it (dev always renders dynamically). The 2026-05-16 `DYNAMIC_SERVER_USAGE`
500 reached production exactly this way — see [`docs/learnings/ci-and-deploy-gotchas.md`](../../../docs/learnings/ci-and-deploy-gotchas.md).

Before promoting `dave → main`:

1. `pnpm build` — must pass.
2. `pnpm start` (= `next start`) — production server on the built output.
3. `curl` every NEW or CHANGED route — **especially dynamic `[param]` routes**:
   `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/<route>`
4. Every route returns 200 (or an intended 3xx / 404). **A 500 here = a production 500.**
5. Stop the server when done.

`next dev` returning 200 is NOT a substitute — `next start` is the source of truth
for "will production work".

## Anti-patterns (don't do)

- **"Tests pass locally, ship it"** — CI runs in clean env. Always re-check after merge.
- **First-theory-fix without considering alternatives** — leads to fixing symptom not cause.
- **Fixing "while I'm here"** — scope creep. Track + defer.
- **Skipping ANALYZE for "obvious" failures** — your obvious is sometimes wrong.
- **Running verify gates in parallel when output matters** — pipe each output cleanly so you can diagnose.

## When to escalate (don't loop forever)

- After **5 iterations** with same gate still red → write up the 5 theories tried + ask the user
- When a **production deploy** is affected → ก๊อต gate, not engineer judgment
- When a fix requires a **dependency upgrade** → consult `AGENTS.md` Next 16 rules first

## Example: CI ERR_PNPM_BAD_PM_VERSION (2026-05-15, captured)

Pattern: GitHub Action push triggers CI, install step fails immediately with `ERR_PNPM_BAD_PM_VERSION`, all later steps show 0s and skip.

- **Assume:** install step should complete in ~30s and unlock lint/tsc/test
- **Check:** GitHub Actions log → install fails at second 9 → "Multiple versions of pnpm specified"
- **Analyze:** error message says exactly the cause — version in action's `with:` block AND `packageManager` in package.json. Top theory: action-setup@v4 now rejects double-specification.
- **Fix:** remove `with: version: 11` from `.github/workflows/ci.yml`; keep `packageManager: "pnpm@11.0.9"` in package.json as single source.
- **Re-verify:** push fix → CI rerun → install completes → green.
- **Capture:** added to `docs/learnings/ci-and-deploy-gotchas.md` so the next agent / dev who edits ci.yml sees the rule.

This whole loop took ~10 minutes. Without it the bug would have shipped silently — all CI runs red but no one notices because dev gates are local.

## Cross-links

- [`scholar-immortal`](../scholar-immortal/SKILL.md) — for step 7 capture
- [`docs/team.md`](../../../docs/team.md) §10.4 "ready to push main" checklist — 8 must-pass boxes
- [`docs/PORT_PLAN.md`](../../../docs/PORT_PLAN.md) Part T5 revenue-ready DoD — 11 boxes for production
- [`AGENTS.md`](../../../AGENTS.md) — agent behavior rules feeding into verify
