---
name: branch-integrate-loop
description: Consolidate teammate branches into the integration branch safely — the daily integrate → verify → distribute cycle. Fires on — "merge ภูม/ปอน's work", "consolidate the branches", "ดึงงานทุก branch มารวม", "integrate + distribute", "เอามารวมที่ dave", before any dave→main deploy, or whenever a teammate has pushed and dave has drifted. The most-repeated multi-step task in an async multi-dev repo — this is its playbook so it never loses work, breaks the build, or ships a half-state.
---

# Branch Integrate Loop

> **Why this exists.** Pacred runs async: เดฟ owns the integration branch `dave`; ภูม works on `Poom`, ปอน on `podeng`; spawned agents work on worktree branches. They all drift constantly. Consolidating them — *without losing a commit, without breaking `verify`, without shipping a half-built state* — is a repeatable cycle with a handful of traps that each cost real time the first time. This skill is that cycle.

## The loop

```
FETCH → SURVEY → MERGE (one branch at a time) → RESOLVE → VERIFY
      → [SMOKE — only before dave→main] → PUSH dave → DISTRIBUTE → CLEAN UP
```

1. **FETCH** — `git fetch origin --prune`.
2. **SURVEY** — for each teammate/agent branch: `git rev-list --left-right --count dave...origin/<b>` → the right number > 0 means unmerged work. Then `git log dave..origin/<b> --oneline` + `git diff --stat <merge-base> origin/<b>` — see *what* changed and **whether it carries a migration** (load-bearing for the deploy gate, step 6).
3. **MERGE — one branch at a time** (`git merge origin/<b> --no-edit`). One-at-a-time so any conflict localises to one source.
4. **RESOLVE** — see "Gotchas" below; the recurring one is the `package.json` test-script list.
5. **VERIFY** — after the merges: `{ pnpm verify; } > /tmp/v.log 2>&1; echo "EXIT=$?"` then `pnpm build`. **Read the output** — a `| tail` pipe masks the exit code, and a `verify` failure can sit above a wall of `N pass, 0 fail` test lines. Confirm by content, not by a trusted exit 0.
6. **SMOKE — only for a `dave→main` deploy** — `pnpm build && pnpm start` + curl, or run the `qa-flow-simulator` skill. A route smoke alone can't detect a dead DB (see `phase-verify-loop`).
7. **PUSH** — `git push origin dave` (save-point — a coherent integrated batch).
8. **DISTRIBUTE** — fast-forward dave back to each teammate branch: `for t in Poom podeng; do git merge-base --is-ancestor origin/$t dave && git push origin dave:$t; done`. A non-FF rejection = that teammate pushed again → re-survey that branch.
9. **CLEAN UP** — remove finished agent worktrees: `git worktree remove --force --force <path>` + `git branch -D <branch>` + `git worktree prune`.

## Gotchas — each one cost real time the first time

- **`package.json` test-list conflict.** Every `test-coverage-writer` pass appends a `tsx lib/...test.ts` entry to `test` + `test:unit`. Two in flight → a merge conflict on those two long lines. **Resolve by keeping BOTH sides' entries** — never pick a side (you'd silently drop a test). `git checkout --ours package.json` then re-add the other side's new entries is the cleanest.
- **Worktree-isolation agents branch from `origin/HEAD`** (= `origin/main`, which on this team is the *held* production branch — stale). A spawned agent must `git fetch origin && git merge origin/dave` before working, or it surveys/fixes a stale snapshot. Brief every spawned agent to resync first.
- **`| tail` masks exit codes.** `pnpm verify | tail` always exits 0. Capture to a file (`> /tmp/v.log 2>&1`) and read it, or use `{ cmd; }; echo "EXIT=$?"`.
- **Migration-ordering gate for `dave→main`.** `dave` runs ahead of `main` with migrations not yet on prod Supabase. **Never push `dave→main` carrying a migration that isn't confirmed-applied to prod** — the new routes 500 in production. `main` only advances when the integrator confirms the migration set is on prod.
- **The chase.** Teammates push faster than you integrate. Do *one clean round*; if a branch moves again mid-round, that's normal live-dev, not a loose end — note it, finish, re-survey next round. Don't loop forever trying to hit a zero-divergence freeze.
- **Trust-but-verify agent output.** An agent's report says what it *intended*. Before integrating money/security code, read the actual diff.

## When to run

- The daily integration window. · After any teammate pushes. · Before every `dave→main` deploy. · After a batch of spawned agents completes.

## Cross-links

- [`phase-verify-loop`](../phase-verify-loop/SKILL.md) — the verify gate in step 5 + the prod smoke in step 6.
- [`qa-flow-simulator`](../qa-flow-simulator/SKILL.md) — the functional gate before `dave→main`.
- [`docs/team.md`](../../../docs/team.md) §10 — the "ready to push main" checklist.
- [`docs/learnings/ci-and-deploy-gotchas.md`](../../../docs/learnings/ci-and-deploy-gotchas.md) — the worktree-base + dead-DB + `| tail` traps in full.
