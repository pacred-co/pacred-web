---
name: bug-swarm-loop
description: Use this skill when a bug is hard to repro, intermittent, cross-cutting, or you've tried 1-2 things and they didn't stick. Triggers when the user says "บัค repro ไม่ได้", "intermittent", "flaky", "cross-cutting bug", "ทำไมมัน...", "ลองหลายอย่างแล้วยังไม่หาย", "spawn agents to find", or when phase-verify-loop hits its 5-iteration ceiling. Spawns parallel hunter sub-agents to attack the bug from different angles (reading symptom site / reading dependency chain / reproducing minimally / bisecting git history / checking similar past bugs in docs/learnings) and converges their findings before fixing. Don't try to think through hard bugs sequentially — parallel exploration beats serial almost every time.
---

# Bug Swarm Loop

> **Why this exists.** Hard bugs eat hours when chased linearly. They yield in minutes when 4-5 angles attack at once and you triangulate the findings. The user (เดฟ) called this *"แก้บัคใน loop และ swarm agent"* — same idea: parallel exploration + convergence.

## When to invoke

- ✅ Bug that didn't yield to first 1-2 fix attempts (you have 2 strikes — invoke before strike 3)
- ✅ Bug appears intermittently / non-deterministic / "works on my machine"
- ✅ Bug touches multiple files / packages / layers (frontend + backend + DB)
- ✅ Production-only bug you can't repro locally
- ✅ `phase-verify-loop` hit its 5-iteration ceiling
- ❌ Simple syntax error / clearly-stated stack trace — just fix it
- ❌ Bug that's a P0 emergency fire — call the user immediately, don't swarm

## The swarm

```
┌─ Bug report ──────────────────────────────────────────────────┐
│  Symptom: ...                                                 │
│  Reproduce: ...                                               │
│  Expected: ...                                                │
│  Actual: ...                                                  │
│  Env: dev / staging / prod                                    │
│  When started: commit hash / time / "after X"                 │
└───────────────────────────────────────────────────────────────┘
                          ↓
         Spawn 4-5 hunter agents IN PARALLEL (same turn)
                          ↓
┌───────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐
│ Hunter 1  │ │ Hunter 2   │ │ Hunter 3   │ │ Hunter 4   │ │ Hunter 5 │
│           │ │            │ │            │ │            │ │          │
│ Symptom   │ │ Dep chain  │ │ Minimal    │ │ Git bisect │ │ Prior    │
│ site read │ │ trace      │ │ repro      │ │ history    │ │ art      │
│           │ │            │ │            │ │            │ │          │
│ Read file │ │ Walk every │ │ Build the  │ │ git log    │ │ Grep     │
│ producing │ │ import of  │ │ smallest   │ │ around the │ │ docs/    │
│ the error │ │ the bad    │ │ failing    │ │ first      │ │ learnings│
│ + caller  │ │ symbol;    │ │ test case  │ │ symptom    │ │ + ADRs   │
│ + caller's│ │ identify   │ │ that still │ │ date;      │ │ + past   │
│ caller    │ │ where it   │ │ shows the  │ │ identify   │ │ closed   │
│           │ │ goes wrong │ │ bug        │ │ suspect    │ │ issues   │
│           │ │            │ │            │ │ commit     │ │          │
└───────────┘ └────────────┘ └────────────┘ └────────────┘ └──────────┘
                          ↓
                Converge findings — write 1 paragraph
                "Hunter 1 saw X · Hunter 2 saw Y · ..."
                          ↓
                Form fix theory (single most-likely cause)
                          ↓
                  Apply minimal fix
                          ↓
                Run phase-verify-loop on the fix
                          ↓
                       DONE (capture learning)
```

## How to spawn hunters (in this codebase)

Use the `Agent` tool with `subagent_type: "Explore"` (read-only, fast) for hunters 1-2 and 5. Use `subagent_type: "general-purpose"` for hunters 3-4 (need to write minimal repro / run git commands).

**Hunter 1 — Symptom-site read:**
```
prompt: "Bug symptom: <symptom>. Read the file at <error-location> and trace
        up the call stack for 3 levels. Identify what could produce this
        symptom locally. Report under 150 words. Do not modify any code."
```

**Hunter 2 — Dependency-chain trace:**
```
prompt: "The function/component <name> at <path> is involved in bug <symptom>.
        Trace every place it's imported from and what those callers pass.
        Find any caller that violates the function's preconditions. Report
        under 200 words."
```

**Hunter 3 — Minimal repro:**
```
prompt: "Build the smallest failing test case for bug: <symptom>. Use the
        repo's existing test harness (lib/*.test.ts pattern). Write it
        to /tmp/bug-repro.test.ts. Try `pnpm exec node --test /tmp/...`.
        Report: did the bug repro? what was the minimum input?"
```

**Hunter 4 — Git bisect:**
```
prompt: "Bug <symptom> started after <date or commit hash>. Run
        `git log --oneline --since=<date>` and identify commits most likely
        to have introduced it (touch the relevant files / functions).
        Pick the top 3 suspects. Report each with 1-line theory."
```

**Hunter 5 — Prior art:**
```
prompt: "Grep `docs/learnings/`, `docs/decisions/`, and `docs/PORT_PLAN.md`
        for any past mention of <symptom keywords>. Report any past bug
        with similar symptom + how it was resolved. Under 200 words."
```

Then write the convergence yourself based on the 5 reports.

## Convergence patterns (when hunters disagree)

- **Agreement on 1 cause** → fix that. Easy.
- **Two unrelated causes pointed at** → likely a compound bug. Fix the deeper-stack one first, retest.
- **All 5 reports inconclusive** → bug is in code you didn't think to look. Run a 2nd swarm with different angles: race condition? state mutation? cache invalidation? OS / browser specific?
- **Hunter 5 finds an exact match in learnings** → apply that fix immediately, then `scholar-immortal` to note the re-occurrence (signals systemic issue).

## Anti-patterns

- **Spawning 1 hunter and waiting** — defeats the purpose. Spawn 4-5 together.
- **Spawning then ignoring some reports** — read all of them. The "irrelevant" one often holds the clue.
- **Skipping convergence** — letting one hunter's report drive the fix without checking the others = risks fixing wrong layer.
- **Not capturing the learning** — the next agent will hit the same bug and waste the same time.

## Cross-links

- [`phase-verify-loop`](../phase-verify-loop/SKILL.md) — invoke this after the swarm's fix lands
- [`scholar-immortal`](../scholar-immortal/SKILL.md) — capture what worked
- [`docs/learnings/`](../../../docs/learnings/) — prior bug archive
