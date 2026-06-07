# Learnings — parallel-agent sprints (Sprint-9..16)

> 4 patterns captured from running 18 parallel worktree-isolation agents across 6 sprints in one day. Each pattern cost real time to learn — the second time we ran into it, the prompt was rewritten. The third time, it stopped happening.

Audience: any operator running multi-agent batches via `Agent({ isolation: "worktree" })`. Cross-link from `ci-and-deploy-gotchas.md` (the older single-issue debugging notes) and `agent-orchestration.md` (if/when added).

---

## L-PAS-06 · ปอน refreshes brand-asset image FILES in-place (same filename, new content) — never auto-rewrite her image src paths without checking her latest podeng commit first

**Trigger.** 2026-05-27 brand-leak scrub: an agent saw `<img src="https://pcscargo.co.th/wp-content/uploads/.../shop-2-300x300.png">` and `<img src="/legacy/pcs/shop-2-300x300.png">` rendering on customer pages — looked like a PCS-branded leak that needed cleanup. The agent swapped 10 image refs across 6 files: `/legacy/pcs/shop-2-300x300.png` → `/images/customertheme/pacredmonkey2.png` (the obvious Pacred-branded mascot in ปอน's customertheme folder) and `/legacy/pcs/theme/free50-3.png` → `/images/customertheme/free50-3.png`. Shipped + pushed to prod.

The next day ปอน merged her own brand-asset refresh (`e21fd2e1 chore(assets): brand asset updates + cleanup`):

```
M  public/legacy/pcs/shop-2-300x300.png       Bin 69278 -> 218856 bytes
M  public/legacy/pcs/theme/free50-3.png       Bin 193056 -> 446819 bytes
M  public/images/bannermobile/bannermobilemain.png Bin 192784 -> 1218707 bytes
D  public/images/customertheme/free50-3.png   (consolidated to theme/)
```

She HAD refreshed the legacy/pcs files in place with Pacred-branded content — the legacy paths were never a leak in her plan, just unrefreshed images. The agent's swap was well-intentioned but unaware — and broke ปอน's intent. Worse, the file she deleted (`customertheme/free50-3.png`) is the exact path the agent had just swapped TO — so the merge produced 6 image-src refs pointing at a now-404 file. The fix was reverting the agent's path swaps + accepting ปอน's refreshed files.

**Rule — before swapping any image src that ปอน has touched in `public/`:**

1. `git fetch origin && git log origin/podeng -10 --stat | head -50` — read the last 10 commits on `podeng` for any binary changes under `public/` (especially `public/legacy/pcs/` and `public/images/`).
2. If ปอน has touched the file in the last week, the rule is: **she owns it. Take her version. Don't move the path, don't change the filename, don't relocate it to a different folder.** Even when the surrounding code (server-side comment, lint rule, brand-cleanup intent) says the path should change.
3. The corollary: when ปอน's diff shows a binary file `M`-marked, the `git diff` shows nothing useful — `Bin 69KB -> 218KB` is the whole signal. The file content is materially different even though the diff is silent. Trust the byte-count change as the signal that she updated the asset.

**Why this happens.** ปอน's workflow is image-edit-in-place: she refreshes the binary, commits, doesn't rename. Pacred's docs say "ปอน owns brand assets" but don't say "and she refreshes filenames in place" — so an agent that's scrubbing brand leaks reasonably assumes the legacy path is a leak. It isn't — it's just an asset slot ปอน hasn't refreshed yet.

**Anti-pattern.** Treating `/legacy/pcs/*.png` as automatically PCS-branded. The folder name is a transcription artifact (assets live under that path because the legacy markup hard-codes them); the FILE CONTENT inside can be — and increasingly is — Pacred-themed.

**What the docs/runbook should say** (TODO: thread into `briefs/podeng.md` + `runbook/faithful-port-plan.md`): "ปอน refreshes brand-asset image files in place under `public/` (any folder). Other lanes MUST NOT move, rename, or swap any image filename ปอน has touched in the last week. Brand-leak scrubs are CODE-level only (rewriting `https://pcscargo.co.th/...` URLs in JSX) — never relocate a `public/` file ปอน owns."

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

## L-PAS-05 · Migrations in repo ≠ migrations in prod (Sprint-16 cargo-spine recovery)

**Trigger.** Sprint-16 was supposed to be W-2 container-propagation work. Pre-audit query `\dt cargo_*` against prod returned only 2 orphan child tables (`cargo_container_status_history`, `cargo_shipment_tracking`) — the canonical PARENTS `cargo_containers` + `cargo_shipments` were missing. Same for the legacy `containers` table from migration 0016. But:

- Migrations 0016 (containers), 0033 (cargo_containers + cargo_shipments), 0059 (container-unify) **all exist in the repo**.
- Other tables from 0016 (`admin_contact_extras`, `dashboard_banners`) **are present in prod** — so 0016 ran at some point.
- Sprint-11 MOMO sync, Sprint-13 V-E10 QA + V-E11 customs code all reference these missing tables — would 500 at runtime if hit.

Most likely sequence: 0016 + 0033 applied → cargo_containers + cargo_shipments + containers later **dropped manually** (Supabase dashboard or a one-off psql) → status_history + tracking child tables (no FK to parent) survived because nobody noticed they're now orphan.

**This is a stealth-failure pattern** — the codebase + migrations look complete, the team thinks the schema matches the repo, but prod silently disagrees. The discrepancy hid until someone (me, in Sprint-16) ran a direct `\dt` query.

**Fix — Sprint-16 recovery.** Re-applied 0016 → 0033 → 0059 to prod via psql. All idempotent (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`, etc.). All tables were empty (no legacy data to migrate). Backfill in 0059 ran with `UPDATE 0` (0 legacy rows to mirror). Clean recovery, zero data risk.

**Prevention — periodic schema-drift audit.** The team needs a `pnpm migrations:audit` script (or similar) that:

```bash
# Pseudocode
for migration in supabase/migrations/*.sql; do
  for table in $(grep "create table.*public\." $migration | extract_names); do
    if ! psql -c "\dt $table" | grep -q "$table"; then
      echo "MISSING IN PROD: $table (from $migration)"
    fi
  done
done
```

Run weekly. Catches dropped-from-prod tables before the next agent's code crashes against them.

**Cheap version for now** — every pre-audit (L-PAS-01) of a sprint that touches a domain (cargo / freight / wallet / commission) should `\dt <domain>_*` against prod before spawning agents. 5 seconds. Catches "table exists in repo but not prod" same-day. Sprint-16 caught it after months because no prior agent thought to verify the parent of an FK column they were writing to.

**Cross-link.** L-PAS-01 (pre-audit before spawning) — this is the schema-side companion to that pattern.

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

---

## [2026-05-26] Cherry-pick over merge when the source branch is BEHIND on critical work — `git merge origin/podeng` would have reverted 7 production files

**Context:** ปอน (frontend) pushed 2 new commits to `origin/podeng` (cart Tailwind rebuild + mobile polish, total 6 files). เดฟ asked "ไปเอาของน้องมาให้ครบเลย" (bring all of ปอน's stuff). The intuitive move was `git merge origin/podeng` into `dave-pacred`.

**Symptom — what a blind merge would have done:** `git diff --stat HEAD..origin/podeng` showed **43 files changed** even though ปอน only made 2 commits. The reason: `origin/podeng` was behind `dave-pacred` on three independent backend workstreams that landed today:

| Workstream | Files podeng would REVERT |
|---|---|
| Dead-LINE-Notify purge (commit `67fc018e`) | `actions/line-notify.ts` · `lib/notifications/line-notify.{ts,test.ts}` · `app/api/cron/dispatch-line-notify/route.ts` · `app/api/linenotify/callback/route.ts` · `vercel.json` (cron entry) — would COME BACK from the dead |
| Task L LIFF replacement (commit `af4bebe9`) | `actions/line-settings.ts` · `app/[locale]/(protected)/line-settings/{page.tsx,line-settings-actions.tsx}` — would be DELETED |
| Track 2 product-search (commit `356edcb2`) | `actions/product-search.{ts,test.ts}` · `app/[locale]/(protected)/service-order/add/link-paste-search.tsx` · `lib/china-search/url-allow-list.ts` — would be DELETED |

A `git merge origin/podeng -X theirs` (or even just default merge with `podeng` "ahead" of the merge-base on those files) would have wiped ~1,800 lines of shipped backend work in one commit and re-introduced 1,099 lines of dead code that we'd just purged.

**Root cause:** When the team works on parallel branches and one branch (ปอน's `podeng`) hasn't pulled the others' recent commits, the merge from that stale branch carries DELETIONS of files the source branch never knew about. Git merge is symmetric: it doesn't know that `dave-pacred` having `line-settings.ts` is "newer than" `podeng` not having it — it just sees "podeng deletes this file relative to merge-base, dave-pacred has it" and resolves by deleting.

**Fix — `git log <merge-base>..origin/<source-branch>` first; cherry-pick the N actual new commits**:

```bash
# 1. Find what's ACTUALLY new on the source branch since divergence
git fetch origin
git merge-base HEAD origin/podeng                 # → a08e7290 (last common)
git log a08e7290..origin/podeng --oneline         # → 2 commits (the work)
git diff --stat HEAD..origin/podeng | wc -l       # → 43 files (the LIE)

# 2. Cherry-pick those N commits — clean, no reverts
git cherry-pick <commit1> <commit2>
```

The cherry-picks may conflict if `dave-pacred` also touched those files — resolve in favour of preserving both sets of changes (in our case ปอน's only conflict was `service-order/page.tsx` which she'd modified once; merged cleanly because `dave-pacred`'s changes were elsewhere in that file).

**Why this matters next time:**
- **Always check `git log <merge-base>..` before a merge from a teammate's branch** — the diff stat is misleading when the source branch is behind. The TRUE delta is the commit list since merge-base, not the file count.
- A teammate's branch being "behind on backend work" is the norm in this team (ปอน focuses on frontend, ภูม on V3, เดฟ on integration). Default integration strategy is cherry-pick (or rebase the teammate's branch onto current `dave-pacred` first), never blind merge.
- The DESTRUCTIVENESS of a blind merge scales with team velocity. With 4 active branches (`podeng`/`dave-pacred`/`Poom-pacred`/`main`) and dozens of commits per day, the "behind" cost compounds — a merge that's safe on Monday morning has 30 file-reverts in it by Monday evening.
- **The `branch-integrate-loop` skill** ([`.claude/skills/branch-integrate-loop/SKILL.md`](../../.claude/skills/branch-integrate-loop/SKILL.md)) is the canonical playbook for this — "integrate → verify → distribute" with cherry-pick as default and merge only when source IS up-to-date with target. Today's session followed it; this entry documents the diagnostic step that justified the choice.

**Cross-links:**
- Commits `c8e06e92` + `fb7939f1` — the cherry-picks (ปอน's cart Tailwind rebuild)
- `.claude/skills/branch-integrate-loop/SKILL.md` — the skill that codified this
- AGENTS.md §13 — "Worktree base is stale" (related: same root cause, different surface)

---

## 2026-06-07 — Workflow fan-out traps: worktree split-brain + `{schema}` fragility

Ran many `Workflow` fan-outs (10–32 agents) to add CSV export to ~70 admin
surfaces + reconstruct i18n keys. Two recurring failure modes:

1. **Worktree split-brain.** The session shell's cwd is a `.claude/worktrees/*`
   checkout, NOT the main `/Users/dev/pacred-web`. Some spawned agents resolved
   RELATIVE paths (or a bare `cd`) against that worktree → their new files landed
   in the WRONG checkout. One batch wrote 3 export actions + 2 page edits into the
   worktree while a sibling page-edit (importing them) landed in main → broken
   import in main. **Fix:** in every fan-out prompt, make it a hard rule — EVERY
   Read/Edit/Write path ABSOLUTE starting with `/Users/dev/pacred-web/`, and
   `cd /Users/dev/pacred-web` for Bash. After the workflow, RECONCILE: `git
   status` in main is the source of truth; copy any misplaced files out of the
   worktree. After the rule was added, 11- and 7- and 32-agent batches all landed
   clean.

2. **`agent({schema})` is fragile at scale.** Whole batches returned `null`
   ("subagent completed without calling StructuredOutput after 2 nudges") — the
   agents did the work but didn't emit the structured tool call; one 11-agent
   batch even returned 0 tokens (transient spawn glitch). **Fix:** for
   file-EDITING fan-outs, drop the schema — have agents reply one plain line and
   treat **git status + the gate (typecheck/build) as the source of truth**, not
   the agent reports. Re-running the same batch without schema succeeded. (Keep
   schema only for pure read/return DATA workflows like the review pass.)

**General rule:** an agent's report says what it INTENDED; verify the working
tree + gate before trusting it. trust-but-verify, every fan-out.
