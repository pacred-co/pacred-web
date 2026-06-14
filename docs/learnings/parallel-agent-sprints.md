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

---

## L-PAS-09 · A worktree-isolation agent that hits the ACCOUNT session limit mid-run loses its ENTIRE worktree if it hasn't committed — instruct every lane to commit incrementally

**Trigger.** 2026-06-10: spawned 4 `Agent({ isolation: "worktree", run_in_background })` lanes. All 4 hit `"You've hit your session limit · resets 3pm (Asia/Bangkok)"` at ~12 min in. Outcome by lane on completion notification:
- Lane A — had made **1 commit** → branch + worktree survived; that commit was salvageable.
- Lane B — had **uncommitted working-tree changes** (no commit) → the worktree happened to still exist, so the integrator could `git add -A && git commit` it from outside. Survived by luck.
- Lanes C & D — **no commits, worktree auto-removed** (the harness cleans an *unchanged* worktree on agent exit) → `git worktree list` no longer shows them, the branch never existed, **all work lost**. Had to re-run from scratch.

**Rule.** Every worktree-lane spawn prompt MUST say: *"Commit your work incrementally as you finish each logical chunk — do NOT batch all commits for the end. If you're interrupted, only committed work survives."* The re-runs with this instruction (Lanes C & D round 2) each landed 4–5 incremental commits and survived cleanly. An uncommitted worktree is not a save-point; a session/usage limit can end a lane at any token.

**Recovery when it happens:** for a lane whose worktree still exists with uncommitted changes, commit it from the integrator side (`git -C <worktree> add -A && git -C <worktree> commit`) BEFORE doing anything else — that converts "survived by luck" into "safe". For lanes whose worktree is gone, the work is unrecoverable; re-spawn after the limit resets (check the wall-clock vs the stated reset time first — at 15:35 the 3pm reset had already passed, so re-spawn succeeded immediately).

---

## L-PAS-10 · `next build` in the SAME worktree as a running `next dev` corrupts the shared `.next` and kills the dev server

**Trigger.** 2026-06-10: dev server (`preview_start` → `next dev`, :3000) was running from the integration worktree. I ran the production-build gate (`node next build`) in that *same* worktree. Both write `.next/`; the build clobbered the dev server's build state → the server went from `200` to `Unable to connect to the remote server` (process dead). A subsequent customer-surface browser-verify failed with `Frame ID 0 is showing error page` until I restarted dev.

**Rule.** Before running `next build` as a deploy gate, **stop the dev server first** (`preview_stop`), optionally `rm -rf .next` for a clean build, run the build, then `preview_start` again for any post-build browser-verify. Never run `dev` and `build` against the same `.next` concurrently. (Companion to the older note in `ci-and-deploy-gotchas.md`: don't `rm -rf .next` while dev is live, and the shared :3000-from-main-checkout gotcha — same root cause: one `.next` dir, two writers.)
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

---

## [2026-06-09] The wave pattern at scale + the template-literal i18n gate-gap

**Wave-based worktree-agent sprints work flawlessly when the integrator owns the merge.**
A 7-wave autonomous run (5 build waves + nav-fix + a self-audit) shipped to prod
with zero lost work and zero broken merges using this exact loop, repeated per wave:

1. Spawn **3 worktree-isolation agents** (Agent tool, `isolation: "worktree"`) on
   DISJOINT files, each: resync to `dave-pacred` → build ONE feature → self-gate
   (`pnpm typecheck` + `lint`, NOT full build — too slow per agent) → **commit in
   its worktree** → report `BRANCH:`/`COMMIT:`.
2. Integrator (you) merges each agent's worktree branch into the main checkout
   **serially** (`git merge worktree-agent-<id> --no-edit`), runs the FULL gate
   ONCE (`pnpm verify` + `pnpm build`), pushes the wave as one save-point, FFs the
   teammate branches, then `git worktree remove --force` + `git branch -D` cleanup.
3. i18n JSON + `lib/admin/sidebar-menu.ts` auto-merged cleanly every time even when
   two agents both added a key/leaf (different insertion points). When they DON'T,
   resolve keep-BOTH (the package.json-test-list pattern).

Agents are good at **scope honesty** when told to be: of 15 wave-agents, 3 returned
"already done / NEEDS-MORE / REPORT-ONLY" instead of force-building (e.g. the
freight cost-lookup was already wired; `tb_api_china_hs` had a different schema
than the prompt assumed → built against the real columns). Always give the escape
hatch ("if scope is bigger/different, report — don't force a half-build").

**The gate gap that a self-audit caught (do NOT rely on the i18n audits alone):**
A `t(\`service.${val}.label\`)` template-literal key on the public freight wizard
rendered the RAW key path in prod because `freightQuoteWizard.service` was missing
from BOTH locales. **Neither i18n gate caught it:** `audit:i18n` only checks th↔en
PARITY (both equally empty = "parity OK"), and `i18n-key-audit.mjs` **skips
template-literal keys by design** (can't statically resolve `${val}`). So a whole
dynamic-key namespace can be absent and the gate stays green. **Rules:** (a) any
`t(\`ns.${x}.key\`)` dynamic key MUST be manually verified against the message files
(or add a next-intl `getMessageFallback` so a miss is visible, not silent); (b) run
a periodic self-audit (§0c/§0d/§0e/§0f/i18n/money) over a session's shipped work
BEFORE moving on — it found this 🔴 + 4 🟠 that all passed `pnpm verify`. The audit
also re-confirmed the money/customer-safety surfaces, which is the higher-value half.

---

## L-PAS-07 · 2026-06-09 — the deep-source-build harness + 5 gotchas it surfaced (ultracode workflow run)

Owner gave the full `olddata dev` cargo+freight deep-source + "พัฒนาส่วนที่ขาดทั้งหมด · ทำเลินนิ่ง" (ultracode). Ran it as a **3-stage workflow harness** that worked very well — reuse it for any "build everything that's missing from a large spec" task:

1. **Stage 1 — MINE + AUDIT + SYNTHESIZE (one workflow · 9 mine + 6 audit agents → 1 synthesizer).** Mine agents (read-only, `agentType:'Explore'`, one per deep-source asset cluster) extract build-ready specs; audit agents (read-only, one per code-stream) report shipped-vs-missing in the CURRENT repo; the synthesizer reconciles them → writes a prioritized **build-backlog doc** (waves) + **learnings files**. **The reconciliation is the gold:** it found "the freight stack is ~80% already scaffolded" (freight_quotes/shipments/invoices/customs_declarations/tb_freight_rate all existed) — so the "build the freight ERP (XL)" item collapsed to a few narrow gaps. Without the audit half, the build agents would have rebuilt existing tables.
2. **Stage 2 — BUILD waves (one workflow · N worktree build agents in parallel, reserved migration numbers per agent).** Each agent: resync to dave-pacred → READ the backlog+learnings → **VERIFY-FIRST** (don't rebuild) → build → commit on its worktree branch (do NOT push, do NOT gate — no node_modules). Verify-first paid off: agents reported W1/W3/W7 "already built" instead of duplicating them.
3. **Stage 3 — integrate serially + gate + apply migrations + push (the human/integrator does this, NOT the agents).**

**Pair the build with an ADVERSARIAL REVIEW in the same workflow** (build agent ∥ 2-3 read-only reviewers trying to REFUTE the money/RLS-isolation claims). It caught real signal AND a false-positive — see gotcha #2.

The 5 gotchas (each cost time; written here so the next run pre-empts them):

- **#1 — ALWAYS run the prod BUILD (Turbopack), not just `tsc`, on every agent-built wave.** Agents can't gate (no node_modules). `pnpm verify` (tsc) passed but `next build` FAILED twice: (a) a freight-cockpit page destructured `res.data` from `AdminActionResult` where `data?` is OPTIONAL → 5 TS errors tsc *did* catch but the agent shipped anyway; (b) `export const FREIGHT_FX_KEY = "..."` in a **`"use server"` file** — the documented gotcha (only async fns may be value-exported) — tsc passed, Turbopack threw 13 errors with the misleading cascade *"The module has no exports at all"* + `Export adminCreateFreightRate doesn't exist` (the ONE bad const-export nukes EVERY export of the module). Fix: drop `export` (module-local const). **Gate = `tsc` AND `next build`, every wave.**
- **#2 — an adversarial reviewer's "CRITICAL" can be a FALSE POSITIVE — verify the finding before acting.** A reviewer flagged "CRITICAL: customs_declarations RLS only allows super/accounting but the action uses 4 roles → silent failures." But the action uses `createAdminClient()` (**service-role · bypasses RLS**), gated by `withAdmin([...])` — so the RLS set never blocks it. The finding was harmless. I still applied the RLS broadening as a cheap DEFENSIVE migration (aligns policy with the role set · future-proofs any user-session read) but correctly downgraded it from "blocker" to "defensive." Lesson: per ultracode, adversarially verify the *reviewer's* claim too — `createAdminClient` bypasses RLS, so any "RLS blocks this admin write" finding is usually moot.
- **#3 — a teammate pushing DURING your integration = a convergence race; loop fetch→merge→gate→push until their branch is stable.** ภูม pushed 4 times while I integrated (5+2+1+1 commits across rounds). Each `git push origin HEAD:main HEAD:Poom-pacred ...` rejected the Poom-pacred ref ("remote contains work you don't have") while main/dave/InwPond007 succeeded. Resolution: re-fetch → `git log HEAD..origin/Poom-pacred` (their new commits) → merge → gate → push again. Converged after 4 rounds. **main got each successful push (prod stayed current); only the teammate ref lagged.** Don't panic at the partial-push rejection — check which refs actually updated (`git rev-list --left-right --count origin/<b>...HEAD`).
- **#4 — a teammate handoff doc can name a WRONG load-bearing infra fact (prod Supabase project) — STOP and confirm with the owner, never guess + deploy.** ภูม's handoff doc claimed prod had moved to a NEW Supabase project `lozntlidlqqzzcaathnm` (with a new DB password) and told to switch the prod Vercel `SUPABASE_DB_PASSWORD` to it. But `.env.local` + CLAUDE.md + the ledger + ALL my migrations target `yzljakczhwrpbxflnmco`. **Both projects were LIVE** (each `/auth/v1/health` → 401, so liveness can't distinguish them), and the **Vercel API would NOT return the decrypted `NEXT_PUBLIC_SUPABASE_URL`** (encrypted envelope · the `VERCEL_TOKEN` lacks decrypt scope) — so it was UNRESOLVABLE by me. I held the main deploy + asked. Owner: `yzljakczhwrpbxflnmco`=PROD, `lozntlidlqqzzcaathnm`=ภูม's DEV. Following the doc would have pointed prod's direct-DB at dev creds. **Rule: a teammate doc that contradicts `.env.local`/CLAUDE.md on which Supabase project is prod is a STOP-and-ask; do not deploy on the guess.** (Captured in memory `prod-env-debugging`.)
- **#5 — scrub committed secrets before they reach `main`, and re-add any §0d nav a teammate's redesign dropped.** ภูม committed a live DB password in the handoff doc → scrubbed (it's gitignored in `.env.local`; owner to rotate). ปอน's customer-sidebar redesign auto-merged cleanly but **dropped the `/my-issues` link** I'd wired earlier (the route still existed → §0d unreachable) — the "diff-stat lies" check (grep the actual nav routes post-merge, don't trust "merged clean") caught it; re-added the one link on top of ปอน's redesign (keeps her work + restores reachability).

---

## L-PAS-08 · 2026-06-09 (round 2) — integrating 4 parallel build-waves: the conflict-marker trap + the gate-cascade + the persistent teammate-race

Integrated 4 parallel worktree build-waves (W6 commission · W9 tax-workspace · W10 warehouse · W11 customs) serially into one branch, then to main. Three lessons sharper than L-PAS-07's:

- **THE CONFLICT-MARKER-REMOVAL TRAP (cost a committed-markers break).** When N waves each add a `MenuItem` const + wire it into several role-menus in `lib/admin/sidebar-menu.ts` + add a key in `messages/{th,en}.json`, you get predictable conflicts at the SAME few spots — resolution is always "keep ALL sides." I resolved by *marker-removal edits* (match the conflict text, drop the `<<<<<<<`/`=======`/`>>>>>>>` lines). **The trap:** for conflicts 2/3/4 my `old_string` started at the HEAD-side CONTENT (`itemTaxdocWorkspace,\n=======\n…`) and dropped only `=======` + `>>>>>>>` — leaving the **opening `<<<<<<< HEAD` line dangling**. `git add -A && commit` then committed a file containing 3 bare `<<<<<<< HEAD` lines (invalid TS). **Rules:** (a) when marker-removing, the `old_string` MUST include the OPENING `<<<<<<< HEAD` too (or do a dedicated edit for it); (b) ALWAYS `grep -rnE '^(<<<<<<<|=======|>>>>>>>)'` over the code (or `git diff --check`) AFTER resolving and BEFORE `git add` — a clean-looking `git diff --diff-filter=U` (index state) is NOT the same as a marker-free working tree; (c) for a "take HEAD entirely + tweak" file (e.g. package.json where HEAD had calc-v2 test, theirs had customs-kit test), `git checkout --ours -- <file>` then re-add the one missing line beats hand-merging a 200-test mega-string.
- **PARALLEL BUILD AGENTS CANNOT GATE → the integrator's `pnpm verify` + `next build` is the ONLY gate; budget 2–5 fixes per agent-built wave.** The agents have no `node_modules`, so they ship plausible-but-unbuilt code. This integration's gate caught, in order: (1) committed conflict markers; (2) `react-hooks/set-state-in-effect` (a run-once deep-link `useEffect` calling a `setState`-ing `prefill()` synchronously → fix: `queueMicrotask(prefill)`); (3) `react/no-unescaped-entities` (literal `"` in JSX text across 3 wave files → file-level `eslint-disable`, and for `@react-pdf` use `{'"'}`/curly quotes NOT `&quot;` which react-pdf renders literally); (4) `TS2322` optional-vs-required-nullable (a Zod-parsed `splitSets[]` with `field?: string|null` passed where `field: string|null` required → `.map()` each element with `?? null`). NONE were caught by the agents' own review. Run `verify` AND `build` (Turbopack catches the "use server" const-export + module-resolution that tsc misses).
- **THE TEAMMATE-RACE CAN PERSIST THE WHOLE SESSION — converge, don't block.** ภูม pushed ~8 times across the bug-fix + 4-wave-integration rounds (each a 1–4 commit receipt-PDF iteration). Every multi-ref push `HEAD:main HEAD:Poom-pacred …` landed main/dave/InwPond007 (FF) but rejected Poom-pacred (diverged). The loop — `fetch → git log HEAD..origin/Poom-pacred → merge → gate → push` — converged each time; **main stayed current after every round** (the urgent bug fixes + the waves deployed promptly), only the teammate ref lagged a round. Don't treat the partial-push rejection as failure; it's the expected steady state when a teammate is actively iterating. If it never settles, ship main with everything-up-to-X and note "teammate's newest N on their branch, integrate next."

## L-PAS-11 · 2026-06-12 — a backlog/audit SURVEY workflow can emit FALSE or HARMFUL recommendations; gate every claim through source-verification before acting

Ran two analysis workflows this session: a 5-agent "next-wave backlog survey" and a 4-agent "money-config dead-write sweep." Both produced confident, file:line-cited output. **Both were partly wrong — and acting on them blindly would have caused harm.** The discipline that saved it: treat a survey's output as *leads to verify*, never as *facts to act on* (AGENTS.md §0b — the source on disk is truth, not an agent's summary).

- **The next-wave survey's top recs were 2/3 false or HARMFUL, caught only by a 1-command source check each:** (1) "orphaned commission-payout batch readers — wire them" → the readers were **already imported by 4 live pages** + reachable via `accounting-menubar.ts:254-255` (`grep -rln withdraw-comm-batch app/` settled it in seconds). (2) "wire the container-costs rate-card into the sidebar" → the page is an **intentional reference-only DEAD-WRITE** (writes the rebuilt 0-row `container_costs` no engine reads · its own amber banner says so) — wiring it would have made a §0e dead-write MORE reachable, the exact opposite of the goal. (3) Its "rank #1 — the cargo cost editor passes RAW `z.coerce.number` to the DB" overstated the premise (the schema already had `.min(0).max(99_999_999)`); the *real* gap was narrower (loose RATE bounds) — reading the actual schema reshaped the fix.
- **The money-config sweep's SYNTHESIS even self-corrected its own mappers** (downgraded 9 "trap" findings to "intentional" because the editor already banners them) — good — **but its surviving SOT claims still had 2 inaccuracies** my hand spot-check caught: it cited the business_config banner at a path my first grep missed (real, just mis-pathed), and it named `tb_rate_vip_*` as the VIP live-read store when the engine actually reads **3 tier stores** (`tb_rate_custom_*` SVIP / `tb_rate_g_*` general / `tb_rate_vip_*` VIP-group · `forwarders-edit.ts:230-296`). Reading the full function confirmed the vip write IS consumed (clean) — but only a full read, not the grep snippet, showed all three branches.
- **The rule:** after any survey/sweep, before building OR writing a fix/ADR as fact, **spot-verify each load-bearing claim from source** (`grep -rln` the importers · `Read` the actual function across all its branches · check for an existing banner/redirect/tombstone before calling a surface a "trap"). Budget ~2-4 verification greps/reads per actioned claim. A survey that says "0 traps / X orphans / Y is canonical" is a hypothesis; the file is the proof. This is cheap insurance against the worst outcome — *confidently shipping the wrong/harmful change because an agent said so*.
- **Why it still pays to run the survey:** it fans out reading I couldn't hold in one context and surfaces the *candidates* fast; the verification gate is far cheaper than the discovery. Survey to find leads → verify from source to act. Never collapse the two.

## L-PAS-12 · 2026-06-12 (LATE-2) — the conflict-FREE parallel-build pattern + "check the backend before building" + deep-read-from-source beats the menu audit

Ran two clean parallel build waves (Wave 1 read-only tools/reports · Wave 2 freight money surfaces) with ZERO merge conflicts between agents and a clean integrator gate each. The structural choices that made it conflict-free + the judgment lessons:

- **THE CONFLICT-FREE RULE: agents build ONLY disjoint NEW route dirs + RETURN their nav/i18n needs as DATA; the integrator wires the shared files afterward.** Every prior wave (L-PAS-08) fought conflicts at the same 3 spots — `lib/admin/sidebar-menu.ts`, `messages/{th,en}.json`, the menubar. This time the agent prompt FORBADE editing any shared file and told each agent to return `{navLabelTh, navLabelEn, iconName}` in its structured result; page bodies use **inline Thai (no t() keys)** so the i18n parity/key-existence audit never trips on un-seeded keys. Result: 8 + 4 = 12 new routes across 9 agents, **0 conflicts**, and I did ONE deliberate nav-wiring pass per wave. Far cheaper than resolving 12 three-way merges. (The cost I keep: the §0d wiring + the icon-map registration — a 10-line edit, not a merge.)
- **BEFORE building a "missing" feature, GREP whether the backend already exists — the gap is often only the UI.** Wave 2 looked like "build the freight money system." But `actions/admin/freight-*.ts` already had 8 action files + the `freight_quotes/invoices/shipments` tables existed; only the ADMIN UI was a catch-all stub. So the wave became "**surface the existing audited actions into pages**" — 4 surfaces, **0 new write-paths** (every mutation calls an existing `adminIssue/Cancel/Approve…` action behind a §0f confirm). Faster AND safer (no new money logic · §0e auto-satisfied because the existing actions already target the canonical tables). The grep that reframed the wave: `ls actions/admin/ | grep -i freight` + `grep -rhoiE 'create table.*freight' supabase/migrations/`. **A "missing feature" with an existing backend is a UI task, not a system build — verify which before scoping.**
- **A 99k-line rendered-HTML DEEP-READ from source corrects a high-level menu audit.** The 10-auditor menu gap-audit reported forwarder/shops/MOMO as "BUILT" at leaf level — true but unconvincing. Reading the actual 99k-line forwarder-list + 50k shops + MOMO HTMLs (extract STRUCTURE not the repeated rows: `python` regex over `<th>`/`<select>`/`<option>`/badge/`?q=` tabs/AJAX, deduped → UTF-8 file because Windows console cp1252 can't print Thai) proved field-by-field Pacred has all 13 columns + ~25 carriers + the exact status flow + the live MOMO API pull (`commit-momo-row-core.ts` + `momo-isolated/client.ts`). **Reframed the answer from "is the page built" to "the customer workflow is faithful; the gap-death is the back-office money/HR side" — what the owner actually needed.** A high-level "BUILT" is a hypothesis until you read the page's real structure.
- **The freight-quote review BLOCKER was a FALSE POSITIVE — trace the WRITE PATH, not the button label (echoes L-PAS-11/#2).** Reviewer flagged "approve button has no commission-policy gate." But `adminConvertQuoteToShipment` stores a `commission_*` **display-only snapshot** (the field comment says so); the real accrual `adminAccrueFreightCommission` is gated by `isFreightCommissionEnabled()` (dormant) elsewhere. Approving a quote moves NO money. Two greps settled it. **"No money gate on button X" is moot if X doesn't write money — trace the action's table writes + flag checks before treating it as a blocker.**
- **Owner-supplied PDF/XLSX/HTML on Windows:** `pip install pypdf openpyxl` reads the gov-rate PDF + PEAK ledger xlsx; the console is cp1252 and **cannot `print()` Thai** → write extracted text to a gitignored `.tmp-*` UTF-8 file and `Read` it. The Read tool's PDF path needs `pdftoppm` (poppler · absent here) so pypdf is the fallback.

---

## [2026-06-14] "แยกร่าง" at scale — the agent-recovery + re-gate discipline (10 agents this session)

Ran ~10 worktree-isolation build agents across the forwarder-fidelity + juristic-credit waves. Patterns that held up + the traps:

- **Worktree agents routinely END TRUNCATED, uncommitted.** ~6 of 10 finished with a final message like "typecheck still running · I'll wait for the monitor event" and **never committed** — their work sat UNCOMMITTED in the agent worktree. RECOVERY: `git -C <agent-worktree> diff > /tmp/x.patch && git apply` (for tracked) + `cp -R` any untracked new files; OR if it DID commit, `git cherry-pick <hash>`. Don't assume the agent's branch tip == its work — check `git -C <wt> status --short`. Have the spec say "COMMIT before reporting" (helps but doesn't guarantee it).
- **NEVER trust an agent's "gate green" — re-gate yourself.** Two agents reported clean but: (a) one's `applyActionFilter<T>` generic typed `qb` as the pre-`.select()` builder → 8 `TS2339` errors its self-gate somehow missed; (b) one DROPPED a §0c `error`-banner in a refactor (lint flagged it as unused-var on integration). Always run typecheck + scoped-lint on the agent's changed files in YOUR tree before committing. For MONEY diffs, read line-by-line (the W3 billing-composite + W4 settlement + the 23505 handler each got a full read — all clean, but that's the point: you verified).
- **Full `pnpm lint` DEADLOCKS under concurrent agent gates** (5-6 tsc/eslint runs at load-avg ~16 → a lint hung >75 min). Workaround: lint the CHANGED files directly — `node node_modules/eslint/bin/eslint.js <files>` (the flat-config resolves; ~10s) — which also catches the §0c `pacred/no-bare-supabase-data-destructure` rule that matters most. Run the full typecheck once (it's the cross-file authority) but scope the lint.
- **File-disjoint partitioning = clean integration.** Splitting agents by non-overlapping file sets (page vs actions vs nav vs cron) made every cherry-pick/patch apply clean + let me gate them together. The one shared-file hazard is `messages/*.json` — tell agents to use INLINE Thai (the admin pages already do) so no i18n-JSON merge contention.
- **Money agents are fine to delegate IF the spec names the canonical helper.** W3 (billing leak) + W4 (settlement) reused `calcForwarderOutstanding` (the spec said "do NOT invent a formula") → the diffs were mechanical + correct. The agent even out-reasoned the prompt once (chose the legacy pure-wallet fcredit-clear shape — no `paydeposit` — over my prompt's example, citing pay-users.php:469).
- **`node node_modules/.bin/tsx` ≠ runnable** — `.bin/tsx` is a shell wrapper; run `./node_modules/.bin/tsx <file>` (sh shebang) or `corepack pnpm exec tsx`, never `node .bin/tsx` (it parses the shell script as JS → "missing ) after argument list").
