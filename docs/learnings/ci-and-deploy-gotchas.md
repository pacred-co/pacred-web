# Learnings — CI + Deploy gotchas

Topics: GitHub Actions, Vercel build/deploy, pnpm action-setup, Next 16 build outputs, edge cache.

---

## [2026-05-15] CI fails with `ERR_PNPM_BAD_PM_VERSION`

**Context:** Pushed commit `f06c394` to `main`; GitHub Actions CI run #23 failed immediately at the "Install pnpm" step.

**Symptom:** Install step throws:
```
Error: Multiple versions of pnpm specified:
  - version 11 in the GitHub Action config with the key "version"
  - version pnpm@11.0.9 in the package.json with the key "packageManager"
```
All subsequent steps (Setup Node / Install deps / Lint / Typecheck / Unit tests / Audit) show 0s — none ran.

**Root cause:** `pnpm/action-setup@v4` (current version on GitHub) rejects double-specification. `.github/workflows/ci.yml` had `with: version: 11` AND `package.json` had `"packageManager": "pnpm@11.0.9"`.

**Fix:** Removed `with: version: 11` from `.github/workflows/ci.yml`. Kept `packageManager` in `package.json` as single source of truth — Corepack reads from there too, so dev + CI use the same pnpm.

```yaml
# After fix
- name: Install pnpm
  uses: pnpm/action-setup@v4
  # No `version` — read from packageManager in package.json
```

Commit: `fa9dc5f`.

**Why this matters next time:** If you ever upgrade pnpm in `package.json`, the workflow needs **no** matching change. Conversely, if you see this error → check both places + dedupe (delete the `with: version`).

**Cross-links:**
- Commit `fa9dc5f` "fix(ci): drop pnpm version from action-setup"
- [`.claude/skills/phase-verify-loop/SKILL.md`](../../.claude/skills/phase-verify-loop/SKILL.md) — uses this as its worked example
- [pnpm/action-setup readme](https://github.com/pnpm/action-setup#version)

---

## [2026-05-15] Vercel deploy lag vs push (browser shows stale)

**Context:** Pushed merge `1d3e0d0` (podeng customs v2) → user immediately checked `pacred.co.th/customs-clearance-shipping-suvarnabhumi` → saw OLD banner without "1 ชม." stamp.

**Symptom:** Code in `main` clearly has the v2 banner. Production URL still serves v1.

**Root cause:** Vercel build is async — 2-5 min build + edge cache invalidation 1-2 min. The user checked before that finished.

**Fix (no code change needed):** Wait. Hard-refresh (`Ctrl+Shift+R`) clears browser cache. Check Vercel dashboard → Deployments → look for the commit hash + "Ready" status.

**Why this matters next time:** Whenever the user reports "I pushed and the page didn't update":
1. Check the commit ACTUALLY made it to `origin/main` (`git log origin/main`)
2. Check Vercel: is the corresponding deploy "Ready"? (could be Building / Error)
3. Hard-refresh the user's browser
4. Try incognito tab
5. Only then dig into code

Don't dive into the source first. 90% of the time it's deploy lag or cache.

**Why this matters for pacred.co.th specifically:** If `pacred.co.th` is on a SEPARATE Vercel project than `pacred.co`, they deploy independently. Check Vercel Domains tab → both should point to the same project.

**Cross-links:**
- `.claude/skills/phase-verify-loop/SKILL.md` — step 1 ASSUME should include "Vercel deploy completed for HEAD commit"

---

## [2026-05-16] `git add` with literal bracket paths needs `:(literal)` pathspec magic

**Context:** Pacred uses Next.js App Router with `[locale]` + `[hNo]` dynamic segments. Filenames like `app/[locale]/(protected)/service-order/[hNo]/page.tsx` literally contain `[` and `]` characters.

**Symptom:**
```bash
git add app/[locale]/(protected)/service-order/[hNo]/receipt/page.tsx
# fatal: pathspec '...' did not match any files
```
Git's default pathspec interprets `[locale]` as a CHARACTER CLASS (matches one of `l`,`o`,`c`,`a`,`l`,`e`) — but the literal directory is named `[locale]` not any single character of those. Match fails.

**Failed attempt:** `--literal-pathspecs` flag is GIT-LEVEL (before subcommand), not a `git add` option:
```bash
# Wrong (silently fails / wrong behavior depending on git version)
git add --literal-pathspecs '...'

# Wrong (subcommand-level flag — git add doesn't accept it)
git -C path add --literal-pathspecs '...'

# Correct as a global flag
git --literal-pathspecs add '...'
```

**Fix:** Use git's pathspec magic prefix `:(literal)`:
```bash
git -C C:/Users/Admin/pacred-web add ':(literal)app/[locale]/(protected)/service-order/[hNo]/receipt/page.tsx'
```
The `:(literal)` prefix tells git "treat this string as a literal path, no glob expansion". Works with `-C`, works inside heredoc, works in any git subcommand that accepts pathspecs.

**Alternative:** add the parent directory if it's all-new:
```bash
git add ':(literal)app/[locale]/(protected)/service-order/[hNo]/receipt'
```
Adds everything under that dir.

**Why this matters next time:** On Pacred-web (Next 16 App Router), every customer-facing route has at least one bracket pair. Plain `git add` on a new bracket-path file ALWAYS fails this way. Memorize `:(literal)`.

**Cross-links:**
- Commits where this was applied: `f410640` (receipt page), `323906b` (pay-from-wallet), `2be9eb5` (forwarder pay), `3447e26` (/status page)
- Git pathspec docs: https://git-scm.com/docs/gitglossary#Documentation/gitglossary.txt-aiddefpathspecapathspec

---

## [2026-05-16] LF→CRLF warnings on `git add` (Windows) are harmless

**Context:** Pacred is developed on Windows (เดฟ uses XAMPP setup) + deployed via Vercel on Linux.

**Symptom:** Every `git add` of a new .ts/.tsx/.sql file prints:
```
warning: in the working copy of 'lib/integrations/momo-jmf/client.ts', LF will be replaced by CRLF the next time Git touches it
```

**Root cause:** Windows git has `core.autocrlf=true` by default. Working copy uses CRLF; the index (and remote) uses LF. The warning fires whenever git is about to convert a file with LF endings to CRLF on the next checkout.

**Why this is OK:**
- Files committed to git are always LF (canonical)
- Vercel build runs on Linux, reads LF — works correctly
- Local Windows working copy may show CRLF — also works in VS Code / IDE
- No functional impact

**Fix:** None needed. Suppress mentally; not in commit output.

If you want to suppress globally:
```bash
git config --global core.safecrlf warn  # default
git config --global core.safecrlf false  # suppress entirely
```

But don't change this without confirming with the team — `safecrlf=true` is a safety net for line-ending issues that bite in mixed-OS teams.

**Why this matters next time:** Don't try to "fix" these warnings by changing line-ending tooling. They're informational. Real problems would be `error:` not `warning:`.

**Cross-links:**
- `.gitattributes` controls per-extension behavior if needed
- Existing repo doesn't customize — uses Windows defaults

---

## [2026-05-15] `pnpm audit` shadowed by built-in security audit

**Context:** Wrote custom audit script umbrella, named it `audit` in package.json scripts.

**Symptom:** `pnpm audit` ran pnpm's BUILT-IN security advisory check, not custom umbrella. Custom script never fired.

**Root cause:** `pnpm audit` is a reserved built-in command — it wins namespace over package.json scripts.

**Fix:** Renamed custom script to `audit:all`. All callers + CI workflow updated.

**Why this matters next time:** When naming custom scripts, avoid: `audit`, `install`, `add`, `remove`, `update`, `dlx`, `exec`, `run`, `publish`, `pack`, `version`, `view`, `link`, `unlink`. Use suffixes (`audit:all`, `install:strict`) when you want pnpm-namespace-safe.

**Cross-links:**
- Commit (in git history search for "rename audit to audit:all")

---

## [2026-05-16] `pnpm audit:all` fails when an env var is referenced in code but absent from `.env.example`

**Context:** Phase D verify-loop. Lint + tsc + tests all green, but `pnpm audit:all` (env-audit step) failed with:
```
⚠ Used but NOT in .env.example (2):
  CHINA_SEARCH_DEBUG
  VERCEL_GIT_COMMIT_SHA
[ELIFECYCLE] Command failed with exit code 1.
```

**Root cause:** `scripts/env-audit.mjs` walks all source files for `process.env.<NAME>` references, then cross-checks against `.env.example` declarations. Any name used in code MUST appear in `.env.example` (even commented-out — script just looks for the bare key name). Otherwise: exit 1 → entire `pnpm verify` fails.

**Fix paths (pick the most honest):**
- **Temporary debug var** → remove the `process.env.X` reference entirely. Don't hide debug behind env-only gates that get forgotten.
- **Vercel-injected** (`VERCEL_GIT_COMMIT_SHA`, `VERCEL_URL`, etc.) → add commented declaration in `.env.example` under "Vercel-injected (DO NOT SET MANUALLY)" section — locally-undefined is fine because consumers should fall back gracefully.
- **Legitimate optional** → add as `OPTIONAL_VAR=` (empty value) in `.env.example` with a comment explaining when to set it.

**Why this matters next time:** Whenever you add `process.env.NEW_VAR` to any source file (even one-shot debug logging), audit catches it. Saves a CI failure later. Quick check: `grep -rE "process\.env\.[A-Z_]+" <new-file>` and confirm each name is in `.env.example`.

**Cross-links:** `scripts/env-audit.mjs` · `.env.example` · `phase-verify-loop` step 4 (audit:all gate)

---

## [2026-05-16] Node.js fetch timeouts to Supabase while curl succeeds — IPv6 resolution suspect

**Context:** Phase D verify-loop. User reports "3 Issues + notifications page hangs" in browser. Dev server log shows constant 10-second `ConnectTimeoutError` to `*.supabase.co` and `104.18.38.10` (Cloudflare CDN) on every server-side fetch.

**Symptom:**
- Every page load takes ~21s (proxy.ts middleware Supabase session refresh = 10s timeout, then page-level Supabase data fetch = 10s timeout).
- Server log packed with:
  ```
  TypeError: fetch failed
    [cause]: Error [ConnectTimeoutError]: Connect Timeout Error
      (attempted address: <project>.supabase.co:443, timeout: 10000ms)
  ```
- Browser dev overlay shows "3 Issues" stack of these errors.
- Pages that don't need Supabase (login, /status without ping) load fine.

**Verification that it's NOT app code:**
- `curl -s -o /dev/null https://<project>.supabase.co/` → **404 in 0.12s** (DNS works, TLS works, Supabase is alive — root path 404 is correct behavior).
- All app code unchanged from a known-working state. Tests + lint + tsc all green.
- Issue persisted across `pnpm dev` restart + `.next/` cache nuke.

**Root cause CONFIRMED (2026-05-16 evening — second occurrence + targeted fix):** **Theory 1 — IPv6 resolution preference**.

**Confirmation:** ภูม's local dev server hit the SAME pattern again, this time degenerating into 7-minute page loads (POST `/notifications` showed `application-code: 7.1min`). Applied the IPv4-first fix → response time dropped to 0.5-1.4s on the FIRST request after restart. ZERO `ConnectTimeoutError` in subsequent log. Theory 2 (Sentry retry doubling) was a contributor maybe but theory 1 alone fixed it.

**Permanent fix (now committed for the team):**

`package.json` `dev` script changed from:
```json
"dev": "next dev",
```
to:
```json
"dev": "node --dns-result-order=ipv4first node_modules/next/dist/bin/next dev",
```

Whole team running `pnpm dev` automatically gets IPv4-first DNS resolution — no `NODE_OPTIONS` env to remember.

**Why `NODE_OPTIONS` env didn't work as a script alternative:** Windows `cross-env`-free scripts can't set NODE_OPTIONS reliably across PowerShell + cmd + bash. The `node --dns-result-order=ipv4first <bin>` form works on every shell.

**Why Vercel prod isn't affected:** Vercel's Linux build env has working IPv6 paths. The issue is local-Windows-network-specific.

**Symptom signature (recognise it next time in seconds):**
- Page loads taking minutes not ms
- `proxy.ts: 10000+ms` in dev server log
- `application-code: <huge>` per request
- `TypeError: fetch failed [ConnectTimeoutError]` to `*.supabase.co` or `104.18.x.x`
- curl to the SAME url works in <200ms

If you see those four → the fix is already in `package.json`. If a future dev hits this → likely they ran `next dev` directly bypassing the wrapper.

**Original 3 hypotheses left for posterity:**
1. ✅ IPv6 resolution preference — CONFIRMED
2. (Possibly contributing) Sentry SDK doubling fetch retries — didn't need to test once #1 fixed
3. (Possibly contributing) Local firewall/AV dropping outbound TLS — N/A, fix #1 was sufficient

**Cross-links:** `package.json` `dev` script · `proxy.ts` (Supabase session refresh runs here) · `lib/supabase/server.ts` · `instrumentation.ts` (Sentry hook) · `docs/learnings/nextjs-16-quirks.md` (Turbopack route cache — different diagnostic skill)

---

## [2026-05-16] `pnpm verify` + `pnpm build` both green ≠ production works

**Context:** The `dave → main` integration deploy (120 commits). `pnpm verify` ✅ and `pnpm build` ✅ both passed → deployed. Three new dynamic-segment pages then returned 500 in production. A customer found it before the team did.

**Root cause — two-layer false confidence:**
1. `pnpm verify` = lint + tsc + test:unit + audit. **None of these execute a real page render.** A runtime crash (`DYNAMIC_SERVER_USAGE`, a bad DB call, a null deref) is invisible to all four.
2. `pnpm build` exiting 0 doesn't mean every route works — a route that fails prerender can silently bail to dynamic and the build still passes; the error only fires at request time.
3. `next dev` renders everything dynamically → it masks static/prerender bugs that only exist in the prod build.

**Fix — the gate the team was missing:** before any deploy to `main`, run a **prod-mode smoke test**:
```bash
pnpm build && pnpm start          # next start serves the prod build
# for each NEW or CHANGED route (especially [param] dynamic routes):
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/<route>
# must be 200 (or intended 3xx/404). A 500 here = a 500 in production.
```

**Why this matters next time:**
- "lint/tsc/tests/build all green" is necessary, NOT sufficient. Rendering the page in prod mode is the only proof.
- Highest risk: NEW pages, dynamic `[param]` routes, big merges — untested render paths hide there.
- `next dev` 200 ≠ `next start` 200. `next start` is the source of truth.

**Cross-links:**
- Commits `5c6bb8a` (the deploy) · `fdd3a8d` (the fix)
- [`docs/learnings/nextjs-16-quirks.md`](nextjs-16-quirks.md) — `DYNAMIC_SERVER_USAGE` root cause
- [`.claude/skills/phase-verify-loop/SKILL.md`](../../.claude/skills/phase-verify-loop/SKILL.md) — production smoke gate (mandatory step)

---

## [2026-05-17] Production smoke test in a git worktree — copy `.env.local` + REBUILD first

**Context:** Running the `pnpm build && pnpm start` prod smoke gate (the entry above) inside a `git worktree` (`.claude/worktrees/...`). Every page returned 500. Server log: `"Your project's URL and Key are required to create a Supabase client"`.

**Root cause — two worktree-specific traps:**
1. **`.env.local` is git-ignored → it does NOT exist in a fresh worktree.** Only the main checkout has it. Without `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` the server-side Supabase client throws on every render → 500. Environment gap, not a code bug — but it looks exactly like a code bug in the stack trace.
2. **`NEXT_PUBLIC_*` vars are inlined at BUILD time**, not read at runtime. Copying `.env.local` in *after* `pnpm build` is not enough — the build already baked in `undefined`. Copy the env file, THEN rebuild.

**Fix — worktree smoke prep (step 0 of any smoke test in a worktree):**
```bash
cp /Users/dev/pacred-web/.env.local .env.local   # git-ignored, safe; never committed
pnpm build                                        # rebuild so NEXT_PUBLIC_* inline correctly
pnpm start                                         # now pages render
```

**Why this matters next time:**
- A worktree is a clean checkout — env setup is step 0, before `pnpm build`.
- "Copied the env file, still 500" → you skipped the rebuild. `NEXT_PUBLIC_*` is build-time, full stop.
- The 500 is in a stack trace so it reads like a code bug — check `.env.local` exists FIRST before chasing code.

**Cross-links:**
- The entry above — the prod smoke gate this happened during.
- [`docs/env.md`](../env.md) — env var reference.

---

## [2026-05-17] A "bug on branch `dave`" can be a stale-worktree phantom — verify against the LIVE `dave` worktree

**Context:** A task arrived describing a concrete defect — `supabase/migrations/README.md` "on branch `dave`" was missing the apply-table row for `0053_freight_invoice_wht.sql` (table jumped row 52 `0052` → row 53 `0060`). It asked to insert the row, renumber the sequence, and commit on the handed-out Claude worktree branch.

**Symptom / question:** The defect was real in the worktree the agent was handed (`.claude/worktrees/optimistic-hypatia-8e9c86`) — but that worktree did not even contain `0053_freight_invoice_wht.sql`. The task premise ("the file exists in the repo") failed on the spot: `ls` and `find` could not locate it.

**Root cause:** Three checkouts of the same repo, three different ages:
- `.claude/worktrees/optimistic-hypatia-8e9c86` (handed-out worktree) — ~20 commits behind `dave`; missing the `0053` file *and* its README row.
- `/Users/dev/pacred-web` (the **main worktree**, branch `main`) — **532 commits behind `dave`**; migrations dir held only `0002_orders.sql` and had no migrations README at all.
- `.claude/worktrees/recursing-meitner-d8aa71` (branch `dave`, the live integration branch) — current; README **already** had the `0053` row, correctly numbered and contiguous. The real fix had landed in commit `e3245e3` ("docs: F-1 fix — add 0053 to migrations/README").

`dave` even advanced mid-session (`c9b92a6` → `705edb0`) — another agent was committing to it in parallel — so an early `git rev-parse dave` and a later `git worktree list` disagreed until reconciled by an ancestry check.

The "bug" was a phantom: an artifact of reading a stale checkout. Hand-editing the README on the stale worktree would have re-derived an existing fix, produced a README linking a file absent from that branch, and set up a merge conflict against `dave`'s already-correct README.

**Fix / answer:** Before acting on any task phrased as "X is broken/missing on branch `dave`":
1. `git worktree list` → the line tagged `[dave]` is the path of the live `dave` checkout.
2. Inspect THAT path on disk (or `git show dave:<file>`), not the worktree you were handed.
3. `git rev-list --left-right --count <here>...dave` → `0   N` means `dave` is N commits ahead and you are a pure ancestor (a clean `git merge --ff-only dave` syncs you).
4. If the fix already exists on `dave` → do not re-create it. Sync, don't re-edit.

**Why this matters next time:** Claude worktree branches are cut from a point-in-time snapshot; `dave` keeps moving. A task author looking at the live `dave` and an agent looking at a stale handed-out worktree will describe the same repo in two incompatible ways. Early-warning signs you are on a stale checkout: a task asserts "file X exists" but `ls`/`find` can't see it; a README references migrations your `supabase/migrations/` dir doesn't have. When a task premise fails on the spot — stop and reconcile branch ages before editing. Don't "fix" a phantom.

**Cross-links:**
- `AGENTS.md` §1 — session-start handshake (`git fetch` + branch sync); this is the exact failure it exists to prevent.
- Commit `e3245e3` "docs: F-1 fix — add 0053 to migrations/README" — where the real fix landed.
- The entry above (worktree smoke prep) — another worktree-specific trap.

---

## [2026-05-17] Worktree-isolation agents you spawn start at `origin/main` — not your working branch

**Context:** Spawned a survey/fix sub-agent with `isolation: "worktree"` while the session was on branch `dave` (tip `ee95a84`, 19 migrations on disk). The agent's job: survey ภูม's domain and apply collision-safe fixes.

**Symptom:** The agent reported the repo held only **11 migrations** (`dave` has 19), claimed `docs/UPGRADE_PLAN.md` and `docs/research/prelaunch-verification-2026-05-17.md` "don't exist" (both are on `dave`), and re-derived **11 admin-page security gates** — 9 of which `dave` already carried from the W-1 pass. ≈14 min of agent time, mostly duplicate work.

**Root cause:** A worktree created for an `isolation: "worktree"` agent branches from `origin/HEAD`, which points at `origin/main`. On this team `main` is the *held* production branch; the live integration branch is `dave`. `git merge-base dave <agent-branch>` resolved to `2136ede` = `origin/main` — the agent surveyed and fixed a snapshot frozen well behind `dave`.

**Fix / rule — when spawning a worktree-isolation agent:**
1. The spawn prompt MUST state the base is stale: *"your worktree is branched from `origin/main`, which is behind — first run `git fetch origin && git merge origin/dave` so you work against the live integration branch."*
2. OR have the agent print `git merge-base HEAD origin/dave` + `git diff --stat HEAD origin/dave` before any survey, and resync if they differ.
3. Treat any "what exists / what's missing" survey from such an agent as suspect until its base commit is confirmed.

**Recovery when it already happened:** Do NOT cherry-pick the agent branch — it conflicts or re-applies stale work. Instead `git diff <merge-base>..<agent-branch> --stat`, then per touched file `git diff <merge-base> <integration-branch> -- <file>` to see if the integration branch already changed it. Port only the genuinely-new hunks by hand. Here: 2 of 11 gates + 3 new test files were real → ported; the other 9 gates + the survey doc (stale migration/doc counts) → discarded.

**Why this matters next time:** This is the spawn-side twin of the entry above (a *handed-out* stale worktree). Same failure, different door. Whenever `main` ≠ your integration branch, every worktree agent starts behind — brief them to resync, every time.

**Cross-links:**
- The entry above — the handed-out-worktree version of this same trap.
- `AGENTS.md` §1 — session-start handshake (the resync discipline that prevents it).

---

## [2026-05-17] A `next start` + curl smoke does NOT detect a dead database

**Context:** Launch day. The production smoke gate — `pnpm build && pnpm start` + curl ~24 routes (public · protected · admin · dynamic `[param]`) — returned **zero 500s**, and the `dave→main` deploy was cleared on that signal.

**Symptom:** A follow-up `qa-flow-simulator` agent found the dev Supabase project the smoke had run against (`gnortvyazfmocvcbvfbs` — the `.env.local` ref) was **DELETED** (DNS NXDOMAIN). The smoke had curled an app wired to a dead database the whole time and still showed zero 500s.

**Why the smoke missed it:**
- **Public pages** don't hard-depend on the DB — Server Components either skip it, or `@supabase/ssr` `auth.getUser()` swallows the network failure and returns `{user:null}`, so the page renders degraded-but-`200`.
- **Protected / admin pages** → `requireAuth()`/`requireAdmin()` → `getUser()` → no user → `redirect("/login")`. The **`307` fires before any data query** — a dead DB is never exercised.
- "curl every route → 200/307, zero 500s" proves the **render + routing layer**. It proves **nothing about the database.**

**Rule:** a route-level smoke is necessary but NOT sufficient. To gate a deploy, also assert the DB:
- Hit a route that **server-renders real DB data** and assert the *content*, not the status code.
- Or run the [`qa-flow-simulator`](../../.claude/skills/qa-flow-simulator/SKILL.md) skill — it asserts observable outcomes (a row, a balance delta), which is exactly what a dead/empty DB fails.
- Probe the project directly: `curl https://<ref>.supabase.co/auth/v1/health` — live → `401 no apikey`; deleted → NXDOMAIN; paused → a "paused" page.

**The launch was fine anyway** — production uses a *separate*, healthy Supabase project (`yzljakczhwrpbxflnmco`); only the *dev* project was deleted. But that was luck, not the gate working — the identical smoke would have passed against a dead *prod* DB too.

**Cross-links:**
- `.claude/skills/qa-flow-simulator/SKILL.md` — the functional layer above the route smoke.
- `AGENTS.md` §11 — the `next start` smoke rule this entry bounds.

---
