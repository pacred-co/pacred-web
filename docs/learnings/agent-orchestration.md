# Learnings — agent orchestration (parallel sub-agents on worktrees)

Patterns discovered while running 8+ parallel `Agent({ isolation: "worktree" })` calls
during Wave 20 (2026-05-26). Each pattern came at the cost of ~10-30 min of confusion;
capture saves the next agent / dev / claude session from re-deriving.

---

## [2026-05-26] Stale worktree base — agents cut from `main`, not `Poom-pacred`

**Context:** Dispatched 3 parallel agents for Wave 20 P0-4 reports rewrite. All 3 reported merge conflicts on 5-6 UNRELATED files (admin/audit · forwarders · forwarders-table · admin/page · sidebar · learnings/_index) on their initial resync attempt.

**Symptom:**
```
git merge origin/Poom-pacred --no-edit
CONFLICT (content): Merge conflict in app/[locale]/(admin)/admin/audit/page.tsx
CONFLICT (content): Merge conflict in app/[locale]/(admin)/admin/forwarders/[fNo]/page.tsx
... 4 more files
fatal: merge failed
```

**Root cause:** When you call `Agent({ isolation: "worktree" })`, the harness creates a worktree from **the current branch's ancestor on `main`**, NOT from the current `Poom-pacred` HEAD (or `dave-pacred`, or whatever the team branch is). For Pacred specifically, `main` lags `Poom-pacred` by 150+ commits because production-gate work doesn't merge to main daily — so the agent's worktree is dozens of commits behind, with its OWN unique commits from the parallel-V3 history. `git merge` then tries to reconcile both directions and explodes on unrelated divergent files.

**Fix — use `git reset --hard` in every agent prompt**, not `git merge`:

```bash
# WRONG (causes 5-6 conflicts on unrelated files)
git fetch origin && git merge origin/Poom-pacred --no-edit

# RIGHT (clean reset to the live integration branch)
git fetch origin --prune
git reset --hard origin/Poom-pacred
git log --oneline -3  # verify HEAD is at expected commit
```

The agent's 45+ "ahead" commits from `main` lineage are NOT needed for Wave 20 P0/P1 work — they're orthogonal V3 history. Hard reset drops them cleanly.

**Why this matters next time:** Every new `Agent({ isolation: "worktree" })` call needs the `git reset --hard origin/<integration-branch>` line up front, OR the agent will spend its first turn fighting merge conflicts on files it doesn't even touch. Bake this into agent prompts as a CRITICAL REQUIRED step before any analysis.

**Cross-links:** [`AGENTS.md`](../../AGENTS.md) §13 (worktree base resync) · 3 agents independently hit this on the same morning (a37f9a6 image research · a0876890 reports v1 · a9b053635 refunds).

---

## [2026-05-26] Agent dual-write — files land in MAIN worktree too

**Context:** Wave 20 P1 batch 1 — 3 agents in parallel for admins / combine-bill / warehouse-history. After agents reported "done · NOT pushed per instructions", I checked my main worktree and found 3 of the 6 target files **already dirty in my working tree** — agents had written there too.

**Symptom:** After agent completes, `git status` in MAIN worktree shows:
```
 M app/[locale]/(admin)/admin/admins/page.tsx        (from admins agent)
 M app/[locale]/(admin)/admin/admins/[id]/page.tsx   (from admins agent)
 M app/[locale]/(admin)/admin/forwarders/warehouse-history/page.tsx  (from warehouse-history agent)
```
Files are byte-identical to what the agent committed on its own worktree.

**Root cause:** Agent prompts in this repo reference files by **absolute path** (e.g. `C:\Users\Admin\pacred-web\.claude\worktrees\adoring-chandrasekhar-0f8ad7\app\[locale]\(admin)\admin\admins\page.tsx`). The agent's `Edit` / `Write` tools resolve the absolute path to the literal location on disk, which is the MAIN worktree (not their own isolated copy). So they "dual-write" — once via Write to the main worktree, then they `Read` what they wrote, then they replicate it on their own worktree by `Write` again, then commit. Two locations end up identical.

**Confirmed by** 4 agents this session (accounting · kpi · admins · warehouse-history) — every one whose prompt referenced absolute paths.

**Fix — neither (a) avoid absolute paths nor (b) tell agent "DON'T dual-write" works reliably.** What DOES work:

1. **Trust but verify** — after agent reports done, check main worktree `git status`. If files dirty + byte-identical to agent's commit → commit from main worktree directly (skip the cherry-pick).
2. **Cherry-pick only if main worktree clean** — agent kept everything on its own worktree branch.
3. **Diff to confirm equivalence** when in doubt:
   ```bash
   git diff <agent-commit-sha> -- <file-path>
   # empty = byte-identical = safe to commit from main
   ```

**Why this matters next time:** Don't redundantly cherry-pick. Don't waste time chasing "where did this dirt come from?" — it's the agent. Same root cause every time.

**Cross-links:** Wave 20 accounting agent (`a87800680410a2b9f` · commit `ae242f3`) · KPI agent (`a913f29e4b48cbf9b` · commit `2e25ec8`) · admins agent (`a519e8ac63d9dc048` · commit `c49822a`) · warehouse-history agent (`a32f0c5982c6b1501` · explicitly admitted to dual-writing in its final report).

---

## [2026-05-26] Agent API timeout on big multi-step prompts

**Context:** combine-bill agent v1 (`ab376578342a8b052`) ran for 9 min then failed with "Stream idle timeout — partial response received". The prompt asked for: rewrite UI + wire 4 server actions (create-bill · delete · print PDF · per-row detail link). Too much scope for one agent.

**Symptom:**
```
<status>completed</status>
<result>API Error: Stream idle timeout - partial response received</result>
```
0 deltas in agent's worktree — agent didn't get to commit before timeout.

**Root cause:** Anthropic API stream has a per-request idle timeout (~9-10 min). Large prompts that require lots of reading + writing + multiple file edits + back-and-forth tool calls eventually exceed this window. The work gets thrown away.

**Fix — SCOPE-CUT every agent prompt**:

1. **One responsibility per agent** — UI rewrite OR action wiring, never both.
2. **HARD STOP at 30 min** — instruct agent: "If you can't finish in 30 min, commit what you have with a clear `// TODO Wave X: ...` for the rest."
3. **Limit file count** — 1-2 page.tsx + 0-1 server action max per agent.
4. **Pre-read for them** — list the reference patterns in the prompt so the agent doesn't burn 5 min discovering them.
5. **Stub deferred work** — explicitly tell agent to leave buttons disabled with banner "Wave 21: ..." instead of trying to implement them.

**Concrete fix that worked:** combine-bill v2 (`af1449d01eef74b4c`) — re-dispatched with "SCOPE CUT for this round: UI rewrite only" + "LEAVE AS STUBS (don't try to wire): สร้างบิลรวม · Delete · Print PDF · Per-row link". Finished in ~7 min, 2 files committed cleanly (-428 LOC).

**Why this matters next time:** Don't ask an agent to do 4 things. The maximum reliable scope is "rewrite UI of these 2 related files + verify TSC + commit". Anything more = high timeout risk = work thrown away.

**Cross-links:** Wave 20 P1 batch 1 combine-bill (v1 timeout · v2 succeeded) · pattern reused for the 3 parallel agents that came after.

---

## [2026-05-26] PostgREST 1000-row silent cap on `select` queries

**Context:** KPI agent (`a913f29e4b48cbf9b`) discovered the orders-by-status panes on `/admin/kpi` were stuck at exactly 1,000 in some buckets — not the true count.

**Symptom:** A query like:
```ts
const { data } = await admin
  .from("tb_forwarder")
  .select("fstatus");
// then count locally: data.length
```
Returns AT MOST 1,000 rows even when the table has 47,587. Reducer-based counts (`reduce((acc, r) => ...)`) silently truncate. No error, no warning.

**Root cause:** PostgREST defaults to `max-rows: 1000` on `SELECT` queries. Returning all rows for a count is an anti-pattern anyway.

**Fix — use `count: 'exact', head: true`** for true totals:

```ts
// WRONG — capped at 1000
const { data } = await admin.from("tb_forwarder").select("fstatus");
const total = data.length;  // ≤ 1000

// RIGHT — true count, no rows transferred
const { count } = await admin
  .from("tb_forwarder")
  .select("fstatus", { count: "exact", head: true })
  .eq("fstatus", "7");
// count = 23,456 (the real number)
```

For per-enum breakdowns, run N parallel count queries (one per status) and reduce in JS:

```ts
const statuses = ["1", "2", "3", "4", "5", "6", "7"];
const results = await Promise.all(
  statuses.map((s) =>
    admin.from("tb_forwarder")
      .select("fstatus", { count: "exact", head: true })
      .eq("fstatus", s)
  )
);
const breakdown = Object.fromEntries(
  statuses.map((s, i) => [s, results[i].count ?? 0])
);
```

**Why this matters next time:** ANY dashboard / report page that shows a count from a `tb_forwarder` / `tb_header_order` / `tb_wallet_hs` (47K · 22K · 105K rows respectively) MUST use the `count: 'exact'` pattern. A reduce-based count is a bug waiting to ship a wrong number to the owner.

**Cross-links:** Commit `248bf60` (KPI dashboard fix · the 1000-row catch is in commit body) · `/admin/page.tsx` Wave 6 P0 (commit `9c0ffd6` · same pattern · prior art) · `/admin/accounting/page.tsx` Wave 20 P0-2.

---

## [2026-05-26] PEAK-style admin hub chrome — pi-pop's preferred pattern

**Context:** ภูม flagged 2026-05-26: my P0-2 rewrite put the new financial dashboard at `/admin/accounting`, but sidebar "ระบบบัญชี" lands on `/admin/accounting/cargo` (the old static card-grid hub). Pi-Pop wants ONE landing — the dashboard wrapped in the cargo hub's chrome (PageTopMenubar + AccountingSegmentPills tabs + sub-page card grid).

**The PEAK chrome pattern** (extracted into `lib/admin/accounting-menubar.ts`):

```tsx
<main className="p-6 lg:p-8 space-y-5">
  {/* 1. Header: h1 + Cargo/Freight segment pills */}
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p className="text-xs font-semibold tracking-widest text-primary-500">ADMIN</p>
      <div className="mt-1 flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">ระบบบัญชี</h1>
        <AccountingSegmentPills active="cargo" />
      </div>
      <p className="mt-2 text-sm text-muted">Cargo · ฝากสั่ง · ฝากนำเข้า · ...</p>
    </div>
    <Link href="/admin/accounting/closing" className="rounded-lg border ...">
      📋 ปิดงบรายเดือน →
    </Link>
  </div>

  {/* 2. PageTopMenubar — purple bar with cascading dropdowns (รายรับ/รายจ่าย/...) */}
  <PageTopMenubar items={CARGO_MENUBAR} activeHref="/admin/accounting" />

  {/* 3. Main content (dashboard cards / data tabs / etc.) */}

  {/* 4. Quick-access card grid at bottom — links to sub-pages */}
  <section>
    <h2 className="text-sm font-bold uppercase tracking-wider mb-3">
      🗂 หน้าบัญชีที่ใช้ได้ตอนนี้
    </h2>
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {ACCOUNTING_HUB_CARDS.map(card => <Link key={card.href} ...>)}
    </div>
  </section>
</main>
```

**Why it works:**
- Header carries identity (h1 + segment pills) → user knows where they are
- Menubar carries depth (cascading dropdowns for รายรับ / รายจ่าย / etc.) → frees sidebar
- Main carries data (the dashboard) → most useful surface front-and-center
- Card grid at bottom carries navigation to sub-pages → no dead-end

**When to apply this:** Any admin "hub" page that the sidebar lands on directly. Examples already using it: `/admin/accounting` · `/admin/reports` · `/admin/forwarders` · `/admin/service-orders`. Anti-pattern: dashboard data at one URL + chrome at another URL = sidebar lands on the wrong one = user confused.

**Cross-link rule:** if you have 2 URLs serving the same conceptual surface (`/admin/accounting` + `/admin/accounting/cargo`), pick ONE as canonical and make the other redirect — `/admin/accounting/cargo` now does `redirect("/admin/accounting")`. Pattern in commit `64577d3`.

**Cross-links:** Commit `64577d3` (the unification) · `lib/admin/accounting-menubar.ts` (shared config) · `/admin/accounting/page.tsx` (canonical implementation).

---

## [2026-05-26] §0c verify-deep-flow — route smoke is NOT sufficient

**Context (already in AGENTS.md §0c but worth re-stating with concrete numbers):** Today's 23-page verification effort showed all 23 returned 307 (auth redirect) from `curl` — meaningless signal for whether the page actually works. Only Chrome MCP with a logged-in session reveals real state.

**Concrete cases:**
- `/admin/customers/PR10899` — `curl 200` BEFORE the BUG #1 fix (the page returned an error PAGE, but with status 200 because Next renders error.tsx at 200)
- `/admin/forwarders/notes` — `curl 307` both BEFORE my schema-swap fix (rendered 0 rows on rebuilt) AND AFTER (renders 500 rows on tb_*). Curl can't tell the difference.
- `/admin/accounting` — `curl 307` whether cards show ฿0 or ฿35M — same status code.

**Rule:** route smoke (curl) catches `DYNAMIC_SERVER_USAGE` 500s + missing routes. Click-through (Chrome MCP) catches everything else — wrong schema · broken rendering · stale data · missing links · etc.

**Cheap pattern that works:** for any list page, after the rewrite, navigate via Chrome MCP and assert:
```ts
new Promise(r => setTimeout(r, 1500)).then(() => ({
  url: location.href,
  h1: document.querySelector("h1")?.textContent?.trim(),
  rows: document.querySelectorAll("tbody tr").length,    // not 0
  hasMoney: !!document.body.textContent.match(/฿[1-9]/),  // real ฿
  is500: !!document.body.textContent.match(/Server Error/),
}));
```
4 checks · ~3 seconds. If any fail (rows=0, no money, 500 detected) → the rewrite is shipping a broken page even though TSC + lint are clean.

**Why this matters next time:** ภูม stressed verbatim: "อย่าบอกคลีนแล้วระบบใช้ไม่ได้จริงนะ" (don't say it's clean when the system doesn't actually work). Use this 4-check pattern after every rewrite. Don't trust "TSC + lint clean + route 200" alone.

**Cross-links:** AGENTS.md §0c · [`docs/learnings/verify-deep-flow.md`](verify-deep-flow.md) · today's session (23 click-through verifies before claiming Wave 20 batch done).

---

## [2026-05-30] A file-mutating background Agent MUST use `isolation: "worktree"` — else it tangles your working tree

**What happened.** เดฟ spawned a background `general-purpose` Agent to do the cust-03 forwarder cluster while continuing to edit files in the main session — but forgot `isolation: "worktree"`. The agent ran `git checkout -b claude/cust03-forwarder` **in the shared working directory** and started editing `forwarder.ts` + `service-import/**`. Meanwhile เดฟ was editing `service-order.ts` + `delivery-ack-panel.tsx` for an unrelated ack-removal. Result: ONE branch, ONE working tree, BOTH changesets intermixed + uncommitted (the agent had even staged a file deletion). A `pnpm typecheck` "passed" — but on the *contaminated* tree, so the green signal was meaningless for either change alone.

**Why it tangles.** `git checkout -b` carries uncommitted changes onto the new branch. A background Agent without worktree isolation shares your `cwd` + `.git` index. Two writers, one index = races + a diff that's neither person's clean work. The agent was killed mid-edit ("replace section 3+4 with the picker") → its half-written files would not have built.

**Recovery (clean, no work lost).**
1. `TaskStop` the agent (halt concurrent writes) — do this FIRST, before any git op.
2. `git status --short` → split files by lane (mine vs agent's, by path).
3. Restore the agent's files to clean HEAD: `git restore --staged <staged-deletes>` then `git checkout HEAD -- <agent tracked files>` + `rm <agent untracked files>`. Verify only YOUR files remain changed.
4. Re-run the FULL gate on the now-clean tree (the contaminated run doesn't count).
5. Commit your work; ff-merge to the integration branch; delete the agent branch.
6. Re-spawn the agent **with `isolation: "worktree"`** + the same spec.

**Rule.** ANY background Agent that writes files → `isolation: "worktree"` (the spawn cost ~200-500ms is nothing vs an hour untangling). The ONLY safe non-isolated background agents are read-only (Explore, audits). If you'll keep editing in the main session while it runs, isolation is mandatory, not optional. Bonus: an isolated agent's branch is reviewable as a clean diff before you integrate.

**Cross-links:** AGENTS.md §13 (stale-base / worktree discipline) · the Agent tool's own note: "opts.isolation: 'worktree' … use ONLY when agents mutate files in parallel" — "in parallel" includes *you* editing concurrently, not just sibling agents.
