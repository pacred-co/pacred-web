---
name: scholar-immortal
description: Use this skill whenever the agent learns something new mid-session — a Next.js 16 gotcha, a Vercel deploy surprise, a working-solution-after-debugging, a refactor that paid off, a "this looks weird but it's correct" idiom, an API quirk in a partner service, a regex that handles a hairy case. Triggers on "I learned that...", "เพิ่งรู้ว่า", "จดไว้หน่อย", "เก็บไว้ใน learnings", or at the end of any complex bug-fix / phase-verify-loop / bug-swarm. Captures the learning to docs/learnings/<topic>.md in append-only format so future agents (and future devs) read once and skip the rediscovery. This skill is the "นักปราชญ์ผู้เป็นอมตะ" (immortal scholar) pattern the user requested — knowledge compounds, never resets.
---

# Scholar Immortal — knowledge compounds

> **Why this exists.** Every Codex session starts cold. Every time we hit a tricky bug, we burn minutes-to-hours rediscovering. The user (เดฟ) explicitly said: *"ทุกครั้งที่ลองอะไรใหม่ๆให้เขียนลงไฟล์ ให้เรียนรู้เองได้เลย ตรงนี้เรียนรู้อะไรจด ... อันนี้จดไว้ เวิคนะจำไว้ ทีนี้ คลอทเราก็จะมีหลายสกิลมากขึ้นเรื่อยๆ"*. This is the compounding-knowledge skill. Use it liberally — even "small" learnings save the next agent 5 minutes, and over months that's hours.

## When to invoke

- ✅ A bug took > 15 min to diagnose → capture the symptom + cause + fix
- ✅ A partner API behaved differently than docs → capture the difference
- ✅ A Next.js 16 / Tailwind v4 idiom worked when training-data guess didn't
- ✅ A refactor changed perf measurably → capture the before/after
- ✅ A team-process pattern emerged (e.g., "always run audit:all after merging branches")
- ✅ At the end of any `phase-verify-loop` or `bug-swarm-loop` — even if nothing surprising — confirm and move on

## What to capture (template per entry)

Each learning is a section in a topic file under `docs/learnings/<topic>.md`. Topics are organic — don't over-categorize upfront. Suggested seeds:

- `docs/learnings/_index.md` — table of all topics + 1-line summary each
- `docs/learnings/ci-and-deploy-gotchas.md`
- `docs/learnings/nextjs-16-quirks.md`
- `docs/learnings/supabase-rls-patterns.md`
- `docs/learnings/i18n-pitfalls.md`
- `docs/learnings/perf-patterns.md`
- `docs/learnings/testing-patterns.md`
- `docs/learnings/partner-apis-quirks.md` (MOMO JMF, TAM, ThaiBulkSMS, etc.)
- `docs/learnings/pacred-domain-knowledge.md` (cargo flow gotchas, juristic rules, etc.)

### Per-entry template

```markdown
## [<DATE>] Short title — 1 line

**Context:** what we were doing when this came up (link to commit / PR / brief)

**Symptom / question:** what looked weird / didn't work / surprised us

**Root cause:** what was actually happening

**Fix / answer:** the working solution (with code snippet if useful)

**Why this matters next time:** what future condition will trigger the same trap?
What's the early-warning sign that you're about to hit it?

**Cross-links:** related ADRs / skills / files
```

### Example entry

```markdown
## [2026-05-15] CI fails with ERR_PNPM_BAD_PM_VERSION

**Context:** Pushed commit `f06c394` to `main`; GitHub Actions CI run #23 failed immediately.

**Symptom:** Install step throws `Error: Multiple versions of pnpm specified`. All subsequent steps show 0s.

**Root cause:** `.github/workflows/ci.yml` had `with: version: 11` AND `package.json` had `"packageManager": "pnpm@11.0.9"`. `pnpm/action-setup@v4` rejects double-specification.

**Fix:** Remove `with: version: 11` from ci.yml; keep `packageManager` in package.json as single source.

**Why this matters next time:** If you ever bump pnpm in package.json, the workflow doesn't need a matching change. Conversely, if you see this error → check both places + dedupe.

**Cross-links:** commit `fa9dc5f` · `phase-verify-loop` example section · GitHub issue [pnpm/action-setup#xxx](https://github.com/pnpm/action-setup)
```

## How to invoke (mechanics)

```
1. Open `docs/learnings/<topic>.md`. Create it if it doesn't exist.
   If creating new: add 1-line entry to `docs/learnings/_index.md` pointing here.

2. Append (don't replace) a new entry at the END of the file.
   Use the template above. Date prefix lets readers scan chronologically.

3. If the learning is so important it affects how the team works going forward
   → consider also updating:
   - `docs/HANDBOOK.md` "things that bite" list
   - `AGENTS.md` if it's an agent-behavior rule
   - A specific skill's SKILL.md if it's a pattern the skill should know
   - A relevant ADR if it's an architectural decision

4. Commit:
   docs(learnings): <topic> — <short summary>
```

## What NOT to capture

- ❌ "Today we wrote a feature." — that's commit history, not a learning.
- ❌ "Bug X fixed." — capture only if the diagnosis path or surprise was non-obvious.
- ❌ Personal preferences ("I like this naming better") — code conventions go in `conventions.md`.
- ❌ Anything that's already in the ADRs / brief — don't duplicate.

## How learnings get re-read (the closing the loop)

This is the part most projects skip — capturing is only half. Re-reading is the other half.

1. **Session start handshake** — every brief now includes "check `docs/learnings/_index.md` for new entries since you last read". 1 minute scan.
2. **Bug Swarm hunter 5** (`bug-swarm-loop`) — specifically grep `docs/learnings/` for prior art before fixing.
3. **Weekly digest** (future) — automate a Friday summary commit listing this week's learnings.
4. **Onboarding** — new devs read `_index.md` as part of HANDBOOK.

## The bigger pattern (immortal scholar)

The user described it as: *"นักปราชญ์ผู้เป็นอมตะ"* — scholar who never dies, always learning. The implementation:

```
Session N:    learns X, captures to learnings/
Session N+1:  reads learnings/ at start, inherits X, never re-learns
Session N+10: 10 sessions of accumulated X1..X10, agent gets smarter
Session N+100: enough captured knowledge that some bugs never even start
```

This compounds. Even slow capture (1 entry/week) yields a ~50-entry corpus by year-end. Pacred-specific knowledge that no LLM training has = competitive moat.

## Cross-links

- [`docs/learnings/_index.md`](../../../docs/learnings/_index.md) — the seed index this skill writes to
- [`phase-verify-loop`](../phase-verify-loop/SKILL.md) — invokes this at step 7
- [`bug-swarm-loop`](../bug-swarm-loop/SKILL.md) — invokes this at convergence step + reads at hunter-5 step
- [`AGENTS.md`](../../../AGENTS.md) §1 — agent rule: read learnings first
