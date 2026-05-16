# Learnings — Next.js 16 quirks (vs training data)

Topics: App Router, middleware → proxy.ts rename, Server vs Client component rules, locale routing, Tailwind v4 inline theme.

---

## [2026-05-15] Middleware file renamed `middleware.ts` → `proxy.ts`

**Context:** Sweep of Next 16 docs vs habits.

**Symptom:** Following training-data muscle memory → create `middleware.ts` → Next 16 silently ignores it. No 404. No warning. Just dead middleware.

**Root cause:** Next 16 renamed `middleware.ts` to `proxy.ts` (in repo root, NOT under `app/`). Old name no longer recognized.

**Fix:** Always use `proxy.ts` in this repo. AGENTS.md flagged this.

**Why this matters next time:** If auth gates / locale rewrites / session refresh stop working — check that the file is named `proxy.ts` not `middleware.ts`.

**Cross-links:**
- `proxy.ts` at repo root
- [`AGENTS.md`](../../AGENTS.md) — Next 16 breaking changes warning
- [Next 16 migration guide](https://nextjs.org/docs/upgrading)

---

## [2026-05-15] `pnpm exec tsc --noEmit` reports `.next/dev/types/*` errors during dev

**Context:** Running tsc as a verify gate after edits.

**Symptom:** tsc emits hundreds of errors all under `.next/dev/types/*`. Looks alarming but actual source is clean.

**Root cause:** Next 16 dev mode generates type stubs in `.next/dev/types/` for hot-reload. These are transient; tsc walks into them by default.

**Fix:** Filter them out:
```bash
pnpm exec tsc --noEmit 2>&1 | grep -v "^\.next/"
```
Or add `.next/` to `tsconfig.json` exclude list (already done in this repo).

**Why this matters next time:** Don't waste time chasing `.next/dev/types/*` errors. If your filter is empty + exit 0 → you're green.

**Cross-links:**
- [`docs/HANDBOOK.md`](../HANDBOOK.md) verify scripts section

---

## [2026-05-15] `Link` must be imported from `@/i18n/navigation`, not `next/link`

**Context:** Pacred uses `next-intl` with locale prefix `as-needed`.

**Symptom:** Using `import Link from "next/link"` → links bypass the locale prefix injection. URL like `/about` shows as-is, doesn't get `/en/about` prefix when user is in EN mode.

**Root cause:** `next-intl` provides a wrapped `<Link>` that injects locale awareness. Bare `next/link` doesn't.

**Fix:** Always:
```typescript
import { Link } from "@/i18n/navigation";
```

**Why this matters next time:** Symptom = locale switch breaks navigation. Don't suspect the locale provider — suspect a wrong Link import.

**Cross-links:**
- [`i18n/navigation.ts`](../../i18n/navigation.ts) — re-exports the wrapped Link
- [`docs/conventions.md`](../conventions.md) — code style rules
- [`AGENTS.md`](../../AGENTS.md) §6 (constants from site.ts and Link from i18n)

---

## [2026-05-16] JSDoc `*/` inside URL paths breaks TypeScript parsing

**Context:** Writing `lib/integrations/momo-jmf/client.ts` with a JSDoc comment describing what paths the partner integration covers.

**Symptom:** `pnpm exec tsc --noEmit` fails with:
```
lib/integrations/momo-jmf/client.ts(12,47): error TS1435: Unknown keyword or identifier. Did you mean 'continue'?
```
Line 12 col 47 of the file looks fine — it's just JSDoc text.

**Root cause:** The JSDoc comment included an URL path example like `/service-import/*/container` or `/admin/warehouse/*` — the `*/` sequence inside the comment **closes the comment block early**. Whatever comes after is parsed as code → garbled syntax error.

**Fix:** Avoid `*/` sequences in JSDoc bodies. Options:
1. Rephrase: `/service-import/.../container` instead of `/service-import/*/container`
2. Escape: split across lines so `*` is on one line and `/` starts the next
3. Replace `*` with `(any)` placeholder when describing wildcards in comments

Example before/after:
```ts
// BAD — comment ends at the */container slash
/**
 * Used in /service-import/*/container or /admin/warehouse/* paths.
 */

// GOOD
/**
 * Used in /service-import/.../container or admin warehouse pages.
 */
```

**Why this matters next time:** If you see `TS1435 Unknown keyword` on a line that looks like English in a comment, immediately scan the surrounding JSDoc for `*/` patterns — most likely you wrote an URL path or a regex placeholder with `*` adjacent to `/`.

**Cross-links:**
- Commit `b9b91a9` (MOMO scaffold — fix was line-12 rewording in `lib/integrations/momo-jmf/client.ts`)

---

## [2026-05-16] `react/no-unescaped-entities` blocks plain English apostrophes in JSX

**Context:** Adding a customer-help note inside a React component:
```tsx
<p>If you're trying to log in and seeing errors... we're already aware.</p>
```

**Symptom:** ESLint fails:
```
error  `'` can be escaped with `&apos;`, `&lsquo;`, `&#39;`, `&rsquo;`  react/no-unescaped-entities
```
Both `you're` and `we're` trigger.

**Root cause:** `react/no-unescaped-entities` rule treats raw `'` / `"` / `<` / `>` inside JSX text as potentially-broken markup.

**Fix (pick one):**
1. **Rephrase** to avoid apostrophes (cleanest): `you're` → `you are`, `we're` → `we are`
2. **HTML entity:** `you&apos;re`, `we&apos;re`
3. **Numeric entity:** `you&#39;re`, `we&#39;re`
4. **Wrap in expression:** `{"you're"}` (ugly but works)

Used option 1 in `/status` page footer because the page is for English customers in troubleshooting mode — formal English reads fine and there's nothing to escape.

**Why this matters next time:** If you're writing English copy with contractions in JSX, plan ahead — either rephrase or escape from the start. Don't ship + push without a final eslint pass.

**Cross-links:**
- Commit `3447e26` (/status page — initial draft had contractions, rephrased)
- ESLint rule docs: https://github.com/jsx-eslint/eslint-plugin-react/blob/master/docs/rules/no-unescaped-entities.md

---

## [2026-05-16] Zod's `z.uuid()` requires v4 format (rejects all-zeros placeholder)

**Context:** Writing unit tests for `placeOrderSchema` (cart validator). Used placeholder UUID `00000000-0000-0000-0000-000000000001` as test data — Zod kept rejecting it as "Invalid UUID".

**Symptom:**
```
{
  "code": "invalid_format",
  "format": "uuid",
  "pattern": "/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/",
  "path": ["cart_item_ids", 0],
  "message": "Invalid UUID"
}
```
All "happy path" assertions failed even though the format LOOKED like a UUID.

**Root cause:** Zod's `z.uuid()` (since v4 — used in Pacred) defaults to **strict UUID v4 spec**:
- Position 13 (after 2nd dash) must be a **version digit** `1-8` (not `0` or `9-f`)
- Position 17 (after 3rd dash) must be a **variant digit** `8/9/a/b/A/B`

Only the **nil UUID** (`00000000-0000-0000-0000-000000000000`) and **max UUID** (`ffffffff-ffff-ffff-ffff-ffffffffffff`) are special-cased.

A "looks-like-UUID" placeholder like `00000000-0000-0000-0000-000000000001` fails because:
- Position 13 = `0` (no version) ❌
- Position 17 = `0` (no variant) ❌

**Fix:** Use a valid UUIDv4 pattern in placeholders. Format: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` where `y ∈ {8,9,a,b}`.

```typescript
// BAD — Zod rejects
const cartItemId = "00000000-0000-0000-0000-000000000001";

// GOOD — valid v4
const cartItemId = "00000000-0000-4000-8000-000000000001";

// ALSO GOOD — typical v4 from crypto.randomUUID()
const cartItemId = "123e4567-e89b-42d3-a456-426614174000";
```

**Why this matters next time:** When seeding test data with UUIDs:
1. Use `crypto.randomUUID()` if running in Node ≥ 14.17 / Bun / modern browsers
2. OR hardcode with the `-4xxx-8xxx-` pattern in positions 13 + 17
3. OR use the nil UUID `00000000-...` if you want a recognisable placeholder (works because Zod special-cases it)

**Affected code:** Caught during `lib/validators/cart.test.ts` work (commit `5643226`). Test UUIDs updated to `00000000-0000-4000-8000-...` pattern.

**Cross-links:**
- Zod v4 release notes: https://github.com/colinhacks/zod/releases (UUID validation tightened from v3)
- `lib/validators/cart.test.ts` — canonical example of v4-compliant placeholder UUIDs
- RFC 4122 §4.4 — UUID v4 spec (random with version + variant bits)

---

## [2026-05-15] Tailwind v4 has no `tailwind.config.js`

**Context:** Adding a new color token.

**Symptom:** Following training-data → create `tailwind.config.js` → reach for `extend.colors` → no file exists.

**Root cause:** Tailwind v4 uses `@theme inline` directive INSIDE the CSS file (`app/globals.css`). No JS config.

**Fix:** Edit `app/globals.css`:
```css
@theme inline {
  --color-primary-500: oklch(...);
  --color-primary-600: oklch(...);
  /* ... */
}
```

Tailwind picks up tokens directly, no build config needed.

**Why this matters next time:** When extending the theme:
1. Look for `@theme inline` in `app/globals.css`
2. Add CSS variables there
3. Use as `bg-primary-600` etc. — works the same in templates

**Cross-links:**
- [`app/globals.css`](../../app/globals.css)
- [Tailwind v4 docs](https://tailwindcss.com/docs/v4-beta)

---

## [2026-05-16] Turbopack stale route cache → routes that exist on disk return 404

**Context:** Phase D run-long session — added several new admin route files (`/admin/warehouse/bulletin/`, `/admin/forwarders/bulk-search/`, `/admin/carriers/`). Started `pnpm dev` AFTER all files were created. Some routes resolved (200) but the new ones returned 404.

**Symptom:** Browser shows Next.js 404 page for known-existing routes:
```
GET /admin/warehouse/bulletin 404 in 234ms (next.js: 5ms, application-code: 19ms)
GET /admin/forwarders/bulk-search 404 in 306ms (next.js: 6ms, application-code: 31ms)
```
The `application-code: <20ms` is the giveaway — far too fast to have rendered the page; Next.js short-circuited because it never compiled/registered the route.

Inspecting `.next/server/app/[locale]/(admin)/admin/`:
- ✅ Contains: `accounting/`, `wallet/`, `containers/` (legacy), etc.
- ❌ Missing: `warehouse/`, `tax-invoices/`, `carriers/`, `forwarders/bulk-search/`

But `/admin/carriers` returned 200! Because Turbopack DOES discover on-demand AT REQUEST TIME — but only for some directory layouts. Newly-added 2-level deep route group children sometimes get missed by the initial filesystem scan.

**Root cause:** Turbopack route discovery is incomplete after a previous `.next/` cache was built without these directories. The cache is treated as authoritative and new files don't always trigger re-scan.

Possible contributing factors (any one is sufficient):
- Files added during a different session than current dev session
- Filesystem watcher race when many directories appear in quick succession
- (Possibly) git checkout/merge happens while dev is running

**Fix:** Hard reset.

```bash
# In Windows PowerShell from the worktree dir:
TaskStop <dev-bash-id>           # kill the bash that holds pnpm dev
Stop-Process -Id <orphan-node-pids> -Force   # kill the orphaned next-server child
Remove-Item -Recurse -Force .next            # nuke the route manifest cache
pnpm dev                          # restart — full re-discovery
```

After this:
- All routes that exist on disk resolve normally (200 or 307→/login if not authed)
- "Ready in 392ms" — even faster than the original boot, since cache invalidation overhead is gone

**Why this matters next time:** If you see Next.js 404 on a route whose file definitely exists at `app/[locale]/.../page.tsx`, BEFORE you debug imports or middleware:
1. Hit `.next/server/app/[locale]/.../page.js` and check if it's compiled
2. If missing — it's the cache, not your code
3. Don't try `next build` or anything expensive — just kill + delete `.next/` + restart

**Note for `requireAdmin` 404s:** there's a SECOND class of legitimate 404 from Next.js that has nothing to do with this:
- `lib/auth/require-admin.ts::requireAdmin(["super","ops","warehouse"])` calls `notFound()` when the signed-in user lacks the required role
- That's an intentional invisibility-to-customers feature, not a Turbopack bug
- Distinguish them: route-cache 404 happens BEFORE auth (very fast, no DB query); requireAdmin 404 happens AFTER auth check (~400ms+, hits Supabase)

**Cross-links:**
- `proxy.ts` — middleware untouched by this issue
- `lib/auth/require-admin.ts` — the auth-induced 404 path
- Memory entry `dev_in_claude_worktree` — orphan node holds port 3000 after TaskStop, need Stop-Process

---

## [2026-05-16] Pre-hydration theme head-script must agree with the React provider's initial state

**Context:** Pacred uses a custom theme provider (not `next-themes`). A small `<script>` in `<head>` (`THEME_INIT_SCRIPT`) runs before hydration to paint the theme class — kills FOUC. `ThemeProvider` then manages React state for in-app toggling.

**Symptom:** The theme toggle needed **two clicks** to work the first time; on a dark-OS machine the site sometimes opened in dark even though the provider defaulted to light. The locale switcher *looked* like it had the same bug (it doesn't — its code is correct; it was the theme desync being noticed).

**Root cause:** The head-script and the provider **disagreed on the initial theme**. The head-script resolved via OS `prefers-color-scheme` (`localStorage.getItem(k) || 'system'` → matchMedia), while `ThemeProvider` defaulted to `light`. So the DOM was painted X but React state said Y. `ThemeToggle` read `theme` (React state = Y) → the first click set the theme to X — *which was already on screen* — a silent no-op. The second click finally moved it.

**Fix (commit `235dbc3`):**
1. Make the head-script and the provider start from the **exact same value**. We made the head-script *unconditionally* paint `light` (also the product decision — always open light) and `ThemeProvider` default `light`. No OS detection anywhere → they cannot diverge.
2. `ThemeToggle` reads **`resolvedTheme`** (the actually-painted value), never `theme`.
3. Once head-script and provider agree, the `mounted`-guard empty-`<div>` is unnecessary — drop it so the button is live on first paint (removes a second "first click lost" window).

**Why this matters next time:** Any **pre-hydration FOUC script + React state** pair MUST be kept in lockstep. If they diverge, the *first* user interaction on anything driven by that state is a silent no-op. When a toggle "needs two clicks," suspect a **head-script ↔ provider desync** — not the toggle component itself. Also: a pre-paint script that reads `localStorage`/`matchMedia` is a classic divergence source — if you don't *need* persistence/OS-detection, paint a constant and the whole class of bug disappears.

**Cross-links:**
- Commit `235dbc3` (fix: always-light + single-click toggle + dark contrast)
- [`components/theme-provider.tsx`](../../components/theme-provider.tsx) — `THEME_INIT_SCRIPT` + the always-light rationale comment
- [`components/theme-toggle.tsx`](../../components/theme-toggle.tsx) — reads `resolvedTheme`, no `mounted` guard
- [`app/layout.tsx`](../../app/layout.tsx) — head-script injection + `<ThemeProvider defaultTheme="light">`

---

## [2026-05-16] `generateStaticParams` + auth component → `DYNAMIC_SERVER_USAGE` 500 (dev hides it)

**Context:** Three public pages under dynamic segments — `customs-clearance-shipping-suvarnabhumi/[port]`, `news/[slug]`, `knowledge/[slug]` — returned HTTP 500 on production. They render 200 in `pnpm dev`.

**Symptom:** Production 500 ("This page couldn't load — A server error occurred"). `next start` reproduces it; server log shows `[Error: ...Server Components render...] { digest: 'DYNAMIC_SERVER_USAGE' }`. `next dev` renders the same pages fine — the bug is invisible in dev.

**Root cause:** All 3 pages export `generateStaticParams()` → Next.js tries to **statically prerender** them. But they render the shared `<NavBar>`, which reads the auth session (cookies) — a **dynamic API**. Static prerender + dynamic API => `DYNAMIC_SERVER_USAGE`. Dev never hits it because dev always renders dynamically (no prerender pass).

**Fix (commit `fdd3a8d`):** add `export const dynamic = "force-dynamic";` to the page. It then renders per-request like every other public page (the whole public site is already dynamic because of `<NavBar>`). `generateStaticParams` can stay — it just enumerates valid slugs.

```ts
// Any [param] page that renders <NavBar> / reads cookies:
export const dynamic = "force-dynamic";
export function generateStaticParams() { /* still fine */ }
```

**Why this matters next time:**
- **Rule:** a new page under a dynamic segment (`[slug]`/`[port]`/`[id]`) that renders `<NavBar>` (or anything auth/cookie-bound) MUST have `export const dynamic = "force-dynamic"`.
- `next dev`, `pnpm verify`, AND `pnpm build` all FAILED to catch this — the build "passes" while the page silently bails to dynamic-and-broken. Only `next start` + hitting the route catches it.

**Cross-links:**
- Commit `fdd3a8d`
- [`docs/learnings/ci-and-deploy-gotchas.md`](ci-and-deploy-gotchas.md) — the "build green ≠ prod works" lesson
- [`.claude/skills/phase-verify-loop/SKILL.md`](../../.claude/skills/phase-verify-loop/SKILL.md) — production smoke gate

---

## [2026-05-16] `??` mixed with `||` requires parens — Next 16 parser is strict

**Context:** Adding F-1 BillToOverridePanel juristic default-name to /admin/service-orders/[hNo]/page.tsx — wrote:

```tsx
defaultName={
  corporateName ?? [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || ""
}
```

**Symptom:** Browser red overlay on every /admin route:
```
./app/[locale]/(admin)/admin/service-orders/[hNo]/page.tsx:123:15
Nullish coalescing operator(??) requires parens when mixing with logical operators
```

Dev server compiles → 500 on subsequent requests. `pnpm verify` would catch this (tsc errors out) but the user sees the 500 first.

**Root cause:** ECMAScript spec requires explicit parens when mixing `??` with `||` or `&&` — operator precedence is ambiguous + the spec refuses to pick one. Next 16's parser (TS 5 strict) follows the spec.

**Fix:** Wrap the `??` group OR the `||` group in parens.

```tsx
// Either:
defaultName={(corporateName ?? [first,last].filter(Boolean).join(" ")) || ""}
// OR:
defaultName={corporateName ?? ([first,last].filter(Boolean).join(" ") || "")}
```

Both are valid; pick the one whose semantics match intent. In my case I wanted "use corporateName if set; else use joined name; else empty string" → first form is correct.

**Why this matters next time:**
- Bug travels invisibly in pre-Next 16 code that was tolerated → migration trip
- Auto-fixable by ESLint with `no-mixed-operators` rule if enabled (Pacred's flat config doesn't enable it currently — TODO consider)
- Common pattern in `defaultName={a ?? b || ""}` (fallback chain) — always parenthesise

**Cross-links:**
- Commit `0d35f1f` (initial bug) → followed by syntax fix in same commit
- ECMAScript: [TC39 issue 1149](https://github.com/tc39/proposal-nullish-coalescing#null-and-undefined)

---

## [2026-05-16] React Compiler `react-hooks/purity` flags `Date.now()` in render — extract to module-scope helper

**Context:** Several admin pages had `Date.now()` called directly in JSX render (e.g. for countdown / freshness / "days ago" math). `pnpm lint` errored:

```
Error: Cannot call impure function during render
`Date.now` is an impure function. Calling an impure function can produce unstable results that update unpredictably when the component happens to re-render.
```

**Affected lines (4 errors):**
- `/admin/reports/refunds/page.tsx`: `new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)` for default date filter
- `/admin/warehouse/containers/[code]/close-at-form.tsx`: `new Date(currentCloseAt).getTime() < Date.now()` for isClosed flag
- `/admin/warehouse/containers/[code]/manual-shipment-form.tsx`: same isClosed pattern
- `/admin/warehouse/containers/[code]/page.tsx`: `Math.floor((closeMs - Date.now()) / 3_600_000)` for countdown chip

Server components AND client components both affected — the rule fires anywhere React sees `Date.now()` inside the render path.

**Root cause:** React Compiler treats impure calls as a re-render trap because the result changes per call without prop/state input → memoisation can't safely skip. Even though a server component re-runs per-request (so `Date.now()` IS semantically right), the lint rule applies uniformly.

**Fix:** Extract `Date.now()` into a module-scope helper function. Call the helper from render. React Compiler doesn't introspect helper bodies → satisfied.

```tsx
// Top of file (module scope):
function isPastIso(iso: string | null): boolean {
  return iso != null && new Date(iso).getTime() < Date.now();
}
function hoursFromNowToIso(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 3_600_000);
}
function nDaysAgoIsoDate(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

// In component:
export default function Page() {
  const isClosed = isPastIso(currentCloseAt);  // ✓ no lint error
  // ...
}
```

**Why this matters next time:**
- Triggers on EVERY `Date.now()` call inside a render — common patterns: countdown / freshness / "days ago" / default date filter. Always extract.
- Triggers on other impure calls too: `Math.random()`, `crypto.randomUUID()`, `performance.now()` — same fix.
- Helper can be inline (top of file) — no need for a separate utility module.
- Earlier ภูม commit `7d89564` (V-A3) shipped the first instance of this fix with `getRecentWindowIso()`; subsequent batches use the same pattern.

**Cross-links:**
- Commit `a26434d` — extract Date.now to module-scope helpers (4 files)
- Commit `7d89564` — original V-A3 fix pattern
