# Learnings — parallel-agent sprints (Sprint-9..16)

> 4 patterns captured from running 18 parallel worktree-isolation agents across 6 sprints in one day. Each pattern cost real time to learn — the second time we ran into it, the prompt was rewritten. The third time, it stopped happening.

Audience: any operator running multi-agent batches via `Agent({ isolation: "worktree" })`. Cross-link from `ci-and-deploy-gotchas.md` (the older single-issue debugging notes) and `agent-orchestration.md` (if/when added).

---

## L-PAS-01 · Pre-audit BEFORE spawning agents (or pay for 3 "already-done" reports)

**Trigger.** Sprint-13 spawned 3 agents to ship V-E3 / V-E4 / V-E7 / V-E9 / V-E10 / V-E11. All 3 came back with the same finding: "already shipped on dave-pacred, no work needed." The 3 agent-runs (~600s + ~250s + ~600s = ~25 min of agent time, plus my tokens for reviewing each report) produced exactly **one** real fix (V-E10 QA-gate wire, ~15 minutes if I'd done it myself).

The reason: my Sprint-13 backlog was sourced from `docs/PORT_PLAN.md` which marked these items `⬜ open` — but they'd all landed weeks earlier (`98a4c85`, `0052+0053`, `0056`, `0045`, `0057`) and PORT_PLAN was never updated.

**Fix — pre-audit takes 30 seconds and prevents 25 minutes of agent run cost.** Before *every* parallel-agent batch, the integrator runs a quick grep round:

```bash
# For each P-item the batch will spawn for:
git log --oneline --all | grep -iE "<keyword from task spec>"
grep -rn "<canonical symbol — table name / fn name>" actions/ lib/ supabase/migrations/ | head
ls app/\[locale\]/\(admin\)/admin/<feature> 2>/dev/null
```

Findings go into the spawn prompt itself as a "## ⚠️ Pre-audit findings" block — the agent then skips work that exists and focuses on real gaps. Sprint-14 used this pattern; Agent P (V-E2) confirmed all ADR-0016 fields present (zero columns added) and spent its run on V-E5 range guards; the integrator's pre-grep saved hours.

**When this fires again.** Any time a spawn prompt says "build feature X" — first grep for the noun that feature would create. If it exists, the prompt should be "audit X completeness, fill gaps". The cost asymmetry (30s integrator vs 600s agent × N agents) means erring on the side of pre-audit always wins.

---

## L-PAS-02 · `PORT_PLAN.md` (and any backlog doc) goes stale silently — sync after every ship

**Trigger.** Sprint-13 + Sprint-14 + Sprint-15-prelude all discovered the same shape: the PORT_PLAN status column showed `⬜ open` for items that were ✅ shipped weeks earlier. Affected items (audited 2026-05-25): **V-E3, V-E4, V-E7, V-E9, V-E10, V-E11, V-A6 + ADR-0015 status** — 6 V-E rows and 1 ADR. Each `⬜` cost a follow-up agent run before being corrected.

The pattern is the silent-failure kind: nobody NOTICES a stale row, because the team is heads-down shipping the next thing. The row stays wrong until someone (an agent, in our case) spends real time discovering the discrepancy.

**Fix — Definition-of-Done on every ship includes the status sync.** When a sprint ships an item:

1. Edit the PORT_PLAN row to `✅ V1 SHIPPED` (or whatever status applies).
2. Add: commit hash + file paths the item lives at + audit date + agent reference.
3. Commit as part of the same push.

Pattern in `4a724f8 docs(PORT_PLAN): mark V-E3/E4/E7/E9/E10/E11 ✅ V1 SHIPPED — sync audit` — single doc commit at the end of an integration, batched for multiple items at once. Future agents `grep` PORT_PLAN as part of pre-audit (L-PAS-01) and immediately see the file paths + audit dates.

**When this fires again.** When you see "wait, this is already done?" findings stacking up, the docs are stale. A 5-minute doc-sync commit at the END of a sprint pays for itself the next sprint.

Same applies to ADR status (DRAFT → Accepted): ADR-0015 was actually locked 2026-05-16 but PORT_PLAN still called it `🟡 DRAFT`. Two truths drifted apart, the older one stayed visible.

---

## L-PAS-03 · Migration-number collision in parallel worktrees — rename on merge, never edit history

**Trigger.** Sprint-12 spawned 3 admin-accounting agents (J = V-A1/A4, K = V-A3, L = V-A5/A7). Each agent worked in its own worktree, each ran `ls supabase/migrations/` to find the next-free number — and all three saw `0108` as the latest, so all three independently named their new migration `0109_*.sql`:

```
0109_tb_payment_slip_transfer_time.sql    (J)
0109_payment_reconciliation_state.sql     (K)
0109_invoice_adjustments.sql              (L)
```

Git did NOT conflict on merge because the **filenames are different** — `git merge` happily took all three. But project convention says migration numbers are unique + applied in numeric order, so the post-merge state had three files at `0109` which `ls` then sorted alphabetically with no meaningful "first applied" order.

**Fix — rename in the integrator's checkout, by merge order, in a single chore commit.** Don't try to coordinate worktrees ahead of time (the agents are isolated from each other by design). The rename is a one-liner per file:

```bash
git mv supabase/migrations/0109_payment_reconciliation_state.sql \
       supabase/migrations/0110_payment_reconciliation_state.sql
git mv supabase/migrations/0109_invoice_adjustments.sql \
       supabase/migrations/0111_invoice_adjustments.sql
git commit -m "chore(migrations): resolve 3-way 0109 collision → 0109/0110/0111"
```

Apply via psql in the renamed order. Reference the resolving commit `82cae42` for the canonical recipe.

**When this fires again.** Any parallel-agent batch where ≥2 agents will write a migration. Heads-up to add to the spawn prompt: "next migration number is 01NN (per `ls` at integrator), but other agents may also pick 01NN — integrator will renumber on merge." That sets correct expectation.

The cheaper alternative is *reserving numbers* in the integrator before spawn ("Agent J = 0112, Agent K = 0113, Agent L = 0114") and writing that into each prompt. Either works; the rename-on-merge approach lets agents work fully independently without coordination state to maintain.

---

## L-PAS-04 · Agent worktree leaks edits to the parent checkout — the prompt fix

**Trigger.** Sprint-9 Agents B + C (service-import + service-order) BOTH wrote edits to BOTH their worktree AND the parent checkout `/Users/dev/pacred-web/`. The integrator (me) saw `git status` in the parent showing 11 untracked / modified files that didn't belong on `dave-pacred`. The worktree commits were canonical and clean; the parent leak was orphan work that had to be `git restore` + `rm`-ed before the merges could land.

The technical cause: when an Edit/Write tool uses an absolute path like `/Users/dev/pacred-web/actions/...`, it always writes to the parent — even if `pwd` is the worktree. Some agents prefer absolute paths (more "reliable"); the leak follows.

**Fix — prompt-level prevention.** Sprint-10 onwards every spawn prompt opens with the same hard rule:

```
## ⚠️ CRITICAL — work ONLY in your worktree

Do NOT use absolute `/Users/dev/pacred-web/...` paths. All file paths
relative from `pwd` (worktree root). Verify with `git status` between
edits — changes must be in the worktree, never the parent.
```

Sprint-10 through Sprint-15 (12 agents): **zero leaks.** Single prompt-block change, measurable behavior shift.

**Recovery if a leak happens anyway.** Wait for ALL parallel agents to finish (because the still-running ones may be reading from the leaked-parent state). Then:

```bash
git restore <list of M files>           # revert modified parent files
rm <list of ?? files>                   # remove untracked parent files
# Now merge the canonical worktree branches sequentially.
```

The agent's worktree commit is the source of truth — the parent leak is always stale and can be discarded.

**When this fires again.** First sign: `git status` in `/Users/dev/pacred-web/` while agents are running shows files that aren't on `dave-pacred`. Don't panic. Don't stash. Wait for ALL agents to land their commits. Then clean.

---

## Cross-links

- [`ci-and-deploy-gotchas.md`](ci-and-deploy-gotchas.md) — single-issue CI debugging notes (older, pre-parallel-agent style)
- [`testing-patterns.md`](testing-patterns.md) — Pacred-specific test harness quirks
- [`docs/STRATEGY.md`](../STRATEGY.md) §11 — the `branch-integrate-loop` skill
- [`.claude/skills/branch-integrate-loop/`](../../.claude/skills/branch-integrate-loop/) — the canonical "spawn → wait → merge → verify → push" recipe

---

## When to revisit

These 4 patterns matter for any future operator running 3+ parallel agents in a sprint. If the team adopts a different orchestration style (one big agent · sequential agents · MCP-driven agents) the patterns may not all apply — but the cost asymmetries (agent time vs pre-audit time; doc-stale cost compounding; rename-on-merge cheap, coordinate-up-front expensive; prompt-block prevents class of bug) do generalize.

Last entry: 2026-05-25 (4 patterns captured from Sprint-9..15 retrospective)
