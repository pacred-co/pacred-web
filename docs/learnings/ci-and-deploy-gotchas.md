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

**Root cause hypothesis (top 3, untested locally):**
1. **IPv6 resolution preference** — Node.js 18+ defaults to `--dns-result-order=verbatim` which can return AAAA (IPv6) records first. If user's network has broken IPv6 (common on home ISPs in TH), Node tries IPv6 → 10s timeout → Node should fall back to IPv4 but doesn't always reliably in `undici` (the fetch impl).
2. **Sentry SDK doubling fetch retries** — Sentry's `instrumentNodeFetch` wraps every fetch with span tracking. If Sentry's own ingest endpoint (also Cloudflare-routed via 104.18.x.x) is unreachable, every primary fetch may double-up retries.
3. **Local firewall/AV** silently dropping outbound TLS to specific hosts — Trend Micro / Bitdefender behavior. Curl uses different TLS lib than Node.

**Workarounds (try in order):**
1. **Fastest test for theory 1:** restart dev with IPv4-first DNS:
   ```powershell
   $env:NODE_OPTIONS="--dns-result-order=ipv4first"
   pnpm dev
   ```
   If timeouts disappear → IPv6 was the issue → consider committing `NODE_OPTIONS` to a `package.json` script for the team.
2. **Test for theory 2:** temporarily unset `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` in `.env.local` + restart. If timeouts disappear → Sentry is the doubler.
3. **Test for theory 3:** add `*.supabase.co` to firewall/AV allowlist OR temporarily disable AV.

**Why this matters next time:** If multiple devs hit ConnectTimeout on Pacred dev servers but Vercel prod works fine → bias toward (1) IPv6 first; ipv4first flag is the cheapest fix. Don't chase code changes for what's an environmental issue.

**Cross-links:** `proxy.ts` (Supabase session refresh runs here) · `lib/supabase/server.ts` · `instrumentation.ts` (Sentry hook) · `docs/learnings/nextjs-16-quirks.md` (Turbopack route cache — different but related diagnostic skill)

---
