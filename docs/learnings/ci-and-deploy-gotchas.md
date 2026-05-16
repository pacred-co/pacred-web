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
