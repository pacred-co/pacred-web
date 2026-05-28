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

---

## [2026-05-17] A `server-only` module reaching a Client Component (transitively) → Turbopack build fail · `tsc`/`verify` do NOT catch it

**Context:** Vercel `pnpm run build` exited 1. `pnpm verify` (lint + tsc + test + audit) was fully green. `next build` failed with:
> `'server-only' cannot be imported from a Client Component module`

**Root cause:** `lib/tos.ts` was given a DB-read helper that imports `createAdminClient` from `lib/supabase/admin.ts` — which starts with `import "server-only"`. That marks the WHOLE `lib/tos.ts` module server-only. But `components/tos-gate.tsx` is a `"use client"` component that imports `lib/tos.ts` (only for the `CURRENT_TOS_VERSION` constant). The chain is transitive — client → `lib/tos.ts` → `lib/supabase/admin.ts` (`server-only`) — and Turbopack rejects it.

**Why `tsc` / `pnpm verify` miss it:** `import "server-only"` is a *runtime/bundler* boundary marker, not a type. `tsc --noEmit` type-checks fine; ESLint does not trace the import graph across the client/server boundary. Only `next build` (Turbopack) walks the graph and enforces the rule → **green verify, red build**.

**Fix — split the module by boundary, not by feature:**
- Keep the client-safe surface (constants, types, pure sync helpers) in the original module — NO server imports.
- Move anything touching a server-only API (DB client, `cookies()`, secrets) into a sibling `*-server.ts` with its own `import "server-only"` at the top.
- Server callers import `*-server.ts`; Client Components import the client-safe module.

**Why this matters next time:**
- Adding a DB read to a `lib/*.ts` "utility" is the trap — if ANY Client Component imports that util (even for one constant), the build breaks.
- Rule of thumb: a `lib/*.ts` module imported by a Client Component must stay free of server-only imports. When in doubt, put server logic in `*-server.ts`.
- `pnpm verify` green is necessary, not sufficient — the `pnpm build` gate (AGENTS.md §11) is the only thing that catches client/server boundary breaks.

**Cross-links:**
- Commit `ccf109e` — the split fix (`lib/tos.ts` client-safe + new `lib/tos-server.ts`)
- [`docs/learnings/ci-and-deploy-gotchas.md`](ci-and-deploy-gotchas.md) — "verify + build green ≠ prod" family

---

## [2026-05-25] Server Action cookie write → layout revalidation → `requireGuest()` kicks user out mid-multi-step-flow

**Context:** Every juristic register signup in PROD was stalling — 138 profiles with `status='incomplete'`, 0 rows in `documents` table, 0 corporate rows. Users said "พอกดอัพโหลด ภพ20+ใบรับรอง เด้งออก".

**Symptom:** User completes Step 1 of `/register` (juristic tab) → never reaches Step 2 → orphan auth.user + orphan profile row with `status='incomplete'` left in DB. Phone number permanently blocked from re-signup (auth.users unique constraint).

**Root cause — a 4-link chain:**
1. `app/[locale]/(auth)/layout.tsx` calls `await requireGuest()` (redirects signed-in users to `/`).
2. Step 1 server action `registerJuristicStep1()` calls `supabase.auth.signInWithPassword(...)` — needed because Step 2/3 use the user-context server client + RLS, not the admin client. This writes auth cookies.
3. Next.js auto-revalidates the current path after ANY server action that mutates `cookies()` (which `signInWithPassword` does via `@supabase/ssr`). The `(auth)` layout re-runs.
4. `requireGuest()` now sees a signed-in user → `redirect("/")`. User never sees Step 2.

The bug was latent for ~2 weeks because:
- Personal signup doesn't sign-in until AFTER Step 1 completes successfully (no multi-step) — unaffected.
- Local dev without strict revalidation timing rarely repro'd.
- The redirect happened so fast users assumed "site is broken" not "I got logged out".

**Fix — make `requireGuest()` boundary-aware:**
```ts
// lib/auth/require-auth.ts
export async function requireGuest(): Promise<void> {
  const data = await getCurrentUserWithProfile();
  // Mid-signup users have status='incomplete' — they ARE signed in
  // but must stay on /register to finish Step 2/3.
  if (data?.user && data.profile?.status !== "incomplete") redirect("/");
}
```

Verified end-to-end on dev server: signed-in `incomplete` → `/register` HTTP 200 · same user `active` → HTTP 307 → `/`.

**Why this matters next time:**
- **Server Actions that write cookies trigger an automatic layout revalidation** on the current path. If your layout has any auth gate, it runs again — often within the same `startTransition`. Treat cookie mutations as "the layout will re-render with the new auth state in milliseconds".
- **Multi-step forms that sign the user in mid-flow** must guard their layout against the freshly-signed-in state. Two patterns: (a) gate by `profile.status` (this fix), or (b) don't sign in until the FINAL step (refactor — personal signup does this).
- **Symptom detection:** if a multi-step form yields ZERO completed signups but lots of `status='incomplete'` orphans, suspect a layout redirect mid-flow before assuming the form code is broken.
- **Test harness:** can't repro with personal signup; need a juristic signup OR a script that signs in an `incomplete`-status user + curls the form route. The curl test confirmed both branches in <30s.

**Cross-links:**
- Commit `091380a2` — the 1-line `requireGuest()` fix
- `app/[locale]/(auth)/layout.tsx` — the layout that calls `requireGuest()`
- `actions/auth.ts:300-306` — Step 1 `signInWithPassword` call
- `actions/auth.ts:380-425` — `uploadJuristicDoc()` that never ran in prod for 2 weeks
- [`docs/learnings/supabase-rls-patterns.md`](supabase-rls-patterns.md) — RLS contexts (why Step 2/3 needs the user-context client)

---

## [2026-05-25 2nd] No `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` → every deploy breaks active tabs

**Context:** Right after the P0 #4 deploy (bodySizeLimit + CSP expand · commit `f6c2ab1d`), a user mid-juristic-signup who had `/register` open in a tab from BEFORE the deploy tapped "ถัดไป" on Step 2. The form button spun forever. No error in console, no failing network call surfaced to the user — but `saveJuristicStep2` never ran on the server.

**Symptom:** Server Action invocation hangs silently. Button shows `Loader2 animate-spin` indefinitely. No `setError` call. DevTools Network panel may show the POST but with no useful response, or nothing at all (depends on browser).

**Root cause:** Server Actions in Next 15+ work by encrypting a reference to each action with a per-build key. The client bundle ships that encrypted ID; the server decrypts it on receipt to know WHICH action to run. **Without `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` set, Next.js generates a fresh random key on every build** — and Vercel rebuilds on every git push. So:

1. User opens `/register` at deploy A → browser caches JS chunks with action IDs encrypted under key K_A.
2. We push a fix → deploy B promoted on Vercel → server now decrypts with key K_B ≠ K_A.
3. User's stale tab POSTs `Next-Action: <K_A-encrypted-id>` → server can't decrypt → returns an error that `useTransition` does NOT surface to the UI → `pending` stays `true`.

The action wasn't called at all — but the client thinks it's still running.

**Fix — set the key once and never rotate:**
```bash
openssl rand -base64 32
# paste into Vercel → Project → Settings → Environment Variables
#   NEXT_SERVER_ACTIONS_ENCRYPTION_KEY = <generated value>
# apply to Production + Preview (NOT Development unless you want it stable across local restarts)
```

Once set, every deploy uses the SAME key → action IDs stay valid across deploys → users with open tabs from yesterday can still submit forms today.

**User-side workaround when this happens:** Hard-refresh the tab (Ctrl+Shift+R / Cmd+Shift+R) to fetch fresh HTML + JS chunks with the new key.

**Why this matters next time:**
- This is **invisible** to the developer doing the deploy — every dev tab is fresh post-deploy. Only mid-flow customers feel it.
- The longer-running the form, the worse — multi-step signups, large CSV uploads, anywhere `useTransition` wraps an action call.
- Vercel does NOT auto-stabilize this key; setting the env var is a one-time action and easy to forget.
- Validate by `curl -I https://yzljakczhwrpbxflnmco.supabase.co/auth/v1/health` (Supabase fast) + checking Vercel function logs for `Failed to decrypt action ID` near the user's hang time.

**Cross-links:**
- [`docs/env.md`](../env.md) §9.6 — operational instructions
- [Next.js docs — Server Actions encryption key](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions)
- Vercel deploy `dpl_HB3MAU3TGBoFykvCLBPy1BHoTxQS` (the P0 #4 deploy that surfaced this)

---

## [2026-05-25 3rd] Server Action default body-size limit is **1 MB** — anything over is rejected at the platform layer SILENTLY

**Context:** Juristic signup Step 3 has 3 file uploads (ภพ20 / company affidavit / national-ID card), each up to 10 MB per the action validator `MAX_SIZE`. Customers tapped "สมัครสมาชิก" → page just sat there. No error in browser console. No Sentry capture. No Vercel function log.

**Symptom:** Server Action invocation silently does nothing. `useTransition` `pending` flips to `false` like the action returned — but the action body never ran, the validator never fired (so `file_too_large` error never surfaced), no DB row was written. The action's internal `console.error` for catch-blocks doesn't fire because the action body wasn't reached.

**Root cause:** Next.js 16's default `experimental.serverActions.bodySizeLimit` is `'1 mb'`. The platform parses the multipart body BEFORE the action function runs; if the request body exceeds the limit, Next.js rejects it with an internal error that — depending on the deploy target — surfaces to the client as either a generic 413, a malformed response, or (on Vercel) a swallowed error that triggers React's transition-resolved branch without the expected return value. None of these surface to the user as an error UI.

**The "empty table over time" fingerprint:** if a feature has shipped + users are visibly clicking through it + the corresponding DB table shows **zero rows after weeks of traffic**, the feature is silently broken at the platform layer. The earlier you query `select count(*) from <table>` against prod, the faster you diagnose. For juristic signup it was:
```sql
select count(*) from documents;   -- expected: hundreds, actual: 0 for 2 weeks
```
That single query collapsed a "weird intermittent register bug" into "it has literally NEVER worked in production."

**Fix — raise the limit ABOVE the app-level validator:**
```ts
// next.config.ts
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",   // > MAX_SIZE (10 MB) so app-level errors surface cleanly
    },
  },
  // ...
};
```

The 2-MB headroom matters: if the limit equals MAX_SIZE, a file exactly at the boundary still trips the platform reject before the validator can return a friendly `file_too_large`. Always raise the platform limit a comfortable margin above the app limit.

**Why this matters next time:**
- The default 1 MB is hostile to **any** file upload feature — profile pictures, payment slips, freight docs, anything CSV-import-shaped. Audit every Server Action that takes a `FormData` with files and ensure the platform limit > validator limit + margin.
- The bug is **invisible during local dev** unless you actually upload a file > 1 MB. Smoke tests with 5 KB stub PNGs pass; real customer uploads with 2-3 MB phone-camera scans fail.
- A `console.error` inside the action's `catch (e)` block won't fire because the action body never ran. Don't trust action-internal observability — the rejection happens upstream of your code.
- Diagnostic: `select count(*) from <feature-table> where created_at > '<deploy-date>'` is the cheapest, fastest "is this feature actually working in prod?" check there is. Run it weekly on launch-week features.

**Cross-links:**
- Commit `f6c2ab1d` — the next.config.ts change
- [Next.js docs — `serverActions.bodySizeLimit`](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions#bodysizelimit)
- This entry is paired with the [`requireGuest()` cookie-revalidation entry above](#2026-05-25-server-action-cookie-write--layout-revalidation--requireguest-kicks-user-out-mid-multi-step-flow) — both were "juristic signup zero documents in prod" with different root causes; first fix exposed the second.

---

## [2026-05-25 4th] Multi-step signup resume pattern — async Server-Component wrapper, NOT client-side state recovery

**Context:** After fixing requireGuest() (let mid-signup users stay on `/register`), users hit a NEW trap: the client form started at Step 1 of 3, asked for their phone again, and `registerJuristicStep1` rejected the now-duplicate phone with `signup_failed`. The user couldn't get past Step 1 of a flow they were already past.

**Symptom:** Signed-in user with `status='incomplete'` lands on the multi-step signup page → form opens at Step 1 → all Step 1 fields are blank → submitting fails because the row already exists → user is locked out forever (phone uniqueness on `auth.users`).

**Wrong fixes attempted (don't):**
- ❌ `useEffect` on mount → fetch user state → setStep — causes a Step-1-flash before the effect resolves, plus a hydration mismatch warning.
- ❌ URL `?step=2` param + client read — works for inbound deep links from `/complete-profile` but doesn't cover direct nav from a bookmark / hard refresh.
- ❌ Move the multi-step state into URL search params — breaks back/forward, exposes incomplete-signup state in browser history.

**Right fix — refactor page.tsx to an async Server Component that fetches the partial state and passes it down as props:**

```tsx
// app/[locale]/(auth)/register/page.tsx — Server Component
export default async function RegisterPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tabParam = params.tab === "juristic" ? "juristic" : "personal";

  const data = await getCurrentUserWithProfile();

  let juristicResume: RegisterResumeState | null = null;
  let initialTab: TabId = tabParam;

  if (
    data?.user &&
    data.profile?.status === "incomplete" &&
    data.profile?.account_type === "juristic"
  ) {
    // Check Step 2 completion by querying the canonical row
    const supabase = await createClient();
    const { data: corp } = await supabase
      .from("corporate")
      .select("tax_id, company_name, company_address")
      .eq("profile_id", data.user.id)
      .maybeSingle();

    juristicResume = {
      step: corp ? 3 : 2,                          // skip to Step 3 if corporate already saved
      taxId: corp?.tax_id ?? "",
      companyName: corp?.company_name ?? "",
      companyAddress: corp?.company_address ?? "",
    };
    initialTab = "juristic";
  }

  return <RegisterClient initialTab={initialTab} juristicResume={juristicResume} />;
}

// register-client.tsx — Client Component (rename of the original RegisterPage)
"use client";
export function RegisterClient({
  initialTab = "personal",
  juristicResume = null,
}: { initialTab?: TabId; juristicResume?: RegisterResumeState | null }) {
  const [tab, setTab] = useState<TabId>(initialTab);
  // pass juristicResume down to <JuristicForm resume={juristicResume} />
}

function JuristicForm({ resume }: { resume: RegisterResumeState | null }) {
  const [step, setStep] = useState<JuristicStep>(resume?.step ?? 1);
  const [taxId, setTaxId] = useState(resume?.taxId ?? "");
  // ...
}
```

**Pattern characteristics:**
- Server reads DB → decides initial state → no client-side flash, no hydration mismatch.
- Client state still owns subsequent user input (the resume is just an initial value).
- Guests (no session) and active users (status='active' redirected by requireGuest) pass through with `initialTab='personal'` + `juristicResume=null` → normal full-flow.
- Detection key is the canonical row that the previous step writes (here: `corporate`). For any multi-step form, the table the FIRST step writes is your "did Step 1 complete?" signal; the table the LAST step writes is your "is this whole flow done?" signal.

**When to reach for this:**
- Multi-step auth flows where Step 1 already has DB side-effects (auth.users + profile row insert).
- Anything where a customer can close the tab mid-flow and the app must let them resume without restarting.
- KYC / verification workflows that span multiple sessions.

**When NOT to use this:**
- Single-step forms — overkill.
- Forms where Step 1 is purely client-state (no DB write yet) — resume is automatic from state being preserved across navigation.

**Cross-links:**
- Commit `a8db8b2e` — the refactor
- File: `app/[locale]/(auth)/register/page.tsx` (server wrapper, ~60 lines) + `register-client.tsx` (the original 1137-line client moved + propified)

---

## [2026-05-26] Route-group chrome leak — `<FloatingTabs />` in `[locale]/layout.tsx` rendered on every route

**Context:** Sprint-25. The owner reviewed the customer portal + admin + auth pages and said *"footter หลุดเข้ามาเยอะอยู่นะ ในหลังบ้านอะ มันไม่ควรหลุดเข้ามานะ"* — the marketing LINE chat bubble + mobile CTA quick-tabs (`<FloatingTabs />`) and the big marketing `<Footer />` were rendering on protected portal pages, admin pages, and auth pages where they shouldn't appear. Commit `691940b`.

**Symptom:** On `/dashboard`, `/service-order`, `/wallet`, `/admin/*`, `/login`, `/forgot-password`, `/complete-profile`, `/reset-password` etc., users saw at the bottom: (a) a floating LINE chat-bubble + mobile CTA quick-tabs (`<FloatingTabs />`), AND (b) the marketing Footer with all the sales contact info / social media / sitemap. Neither belongs on internal/transactional surfaces.

**Root cause — two distinct leaks:**

1. **`<FloatingTabs />` was mounted in `app/[locale]/layout.tsx`** — i.e. at the locale level, the parent of EVERY route group. The Next App Router renders the chain `[locale]/layout > (group)/layout > page` for every page, so any chrome component placed in the locale layout shows on every page under that locale. **Route groups don't isolate parent chrome** — they only nest their own. A common misconception is that "the `(public)` group is sandboxed from `(protected)`" — they're sandboxed for **layouts they declare**, but they all share whatever the locale layout renders.

2. **`<Footer />` was hard-coded in 17 individual page files** — every protected page (`(protected)/notifications/page.tsx`, `(protected)/orders/page.tsx`, etc.), the auth `/forgot-password`, and the root-locale `/complete-profile` + `/reset-password` each ended with `<Footer />`. There was no architectural gate; each page author duplicated the import.

**Fix (the route-group-as-chrome-scope pattern):**

```tsx
// app/[locale]/layout.tsx — REMOVE <FloatingTabs /> from here
// ❌ Before: import { FloatingTabs } from "@/components/sections/floating-tabs";

return (
  <NextIntlClientProvider messages={clientMessages}>
    <LocaleHtmlLang />
    {/* ❌ Before: <FloatingTabs /> here = renders on EVERY locale route */}
    {children}
  </NextIntlClientProvider>
);

// app/[locale]/(public)/layout.tsx — NEW FILE, mount marketing chrome here
import { FloatingTabs } from "@/components/sections/floating-tabs";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <FloatingTabs />
    </>
  );
}
```

For `<Footer />` we deleted the 17 hard-coded imports + JSX usages from non-public pages. The marketing `(public)/page.tsx` etc. keep theirs — they're inside the right group. `(protected)/layout.tsx` keeps `<PcsFooterNav />` because that's the LEGACY mobile bottom-nav for the customer portal, a separate component from the marketing Footer, and it IS at the right layer.

**Why this matters next time:**

- **Rule: components that render visible chrome (header / footer / floating widgets / CTA bars) must live in a route-group layout, not in `[locale]/layout.tsx`** — unless they're truly global (the auth-aware `<NavBar />` is the canonical exception since it lives in every group's layout independently and is auth-aware).
- **Early-warning sign:** if you're tempted to add `if (pathname.startsWith('/admin'))` or `if (!isPublicRoute)` inside a layout-level chrome component to "conditionally hide" — STOP. That's a smell that the component is mounted at the wrong layer. Move it down into the route group that actually wants it.
- **Detection grep:** `grep -rn 'from "@/components/sections/footer"' app/\[locale\]` should show ONLY `(public)/*` matches. Anything else outside `(public)` is a leak.
- **The hard-coded-per-page anti-pattern** (cause #2) is its own smell — when 17 files import the same chrome component at the bottom of their JSX, the chrome belongs in the layout, full stop. A single edit gates 17 pages.

**Cross-links:**
- Commit `691940b` — Sprint-25 fix (20 files changed, 32+/38−)
- Files: `app/[locale]/layout.tsx`, NEW `app/[locale]/(public)/layout.tsx`, 17 page files (mostly `(protected)/*/page.tsx`)
- Sibling rule (admin chrome): `app/[locale]/(admin)/layout.tsx` already mounts its own admin chrome at the group level — that's the correct pattern; the marketing-side just hadn't caught up.

---

## [2026-05-26] Customer-table mobile-collapse without DataTables-Responsive JS

**Context:** Sprint-26. Owner: *"ทำ responsive mobile"*. On 4G mobile the customer's `/service-order` list (the ฝากสั่งซื้อสินค้า table) overflowed 360-390px viewports — Chinese product titles wrapped vertically character-by-character because each of 7 cols got squeezed to ~50px, and every row sprouted a "คลิกดูเพิ่มเติม" hint that promised an expand-on-tap which never fired. Commit `fd1ffd9`.

**Symptom triad:**
1. 7-column table, total intrinsic width ~570px, painting in full inside a 375px viewport with horizontal overflow.
2. `<th class="none">` columns (date / orderno / status / price) still visible despite the class — that class is meant to mark "hideable on small screens".
3. The legacy `.tr1::after { content: " \A คลิกดูเพิ่มเติม"; }` pseudo painted on every ID cell promising tap-to-expand, but tapping did nothing.

**Root cause:** the legacy PHP page was built around the **DataTables-Responsive jQuery plugin** which, at runtime, would (a) read `<th class="none">` and hide those columns under the responsive breakpoint, (b) add a `+` widget bound to a click handler that expands the hidden cols inline below the row. Pacred is server-rendered + no jQuery → the plugin never runs. But the plugin's CSS shipped in 5 stylesheets (`shops.css`, `cart.css`, `service-import.css`, `payment.css`, `forwarder.css`) and those rules are now dead promises:

- The `<th class="none">` class is a plain class with no default browser meaning → cols stay visible.
- The `.tr1::after` content is decorative — without the JS handler, it's a misleading hint.

**Fix — pure-CSS emulation in `legacy-overrides.css` §11 (the canonical D1 override sheet):**

```css
/* Kill the dead-promise hint globally — all 5 stylesheets shadow this. */
.pcs-legacy .tr1::after,
.pcs-legacy-body .tr1::after { content: none !important; }

@media (max-width: 767.98px) {
  /* Honour the `<th class="none">` semantic — the legacy markup is right,
     the plugin just isn't there to enforce it. */
  .pcs-legacy table.dataTable thead th.none { display: none !important; }

  /* CSS can't reach a `td` from its `th` — there's no parent/sibling
     selector that walks the column. So per-page modifier classes
     (`.pcs-shops-page`) wrap the page and we spell out which td positions
     correspond to the `th.none` cols on THAT page. shops.php has cols
     2/3/5/6 = none; payment.php has cols 2/3/4/5 = none (different
     mapping → different rule under a different modifier). */
  .pcs-shops-page table#myTable tbody td:nth-child(2),
  .pcs-shops-page table#myTable tbody td:nth-child(3),
  .pcs-shops-page table#myTable tbody td:nth-child(5),
  .pcs-shops-page table#myTable tbody td:nth-child(6) {
    display: none !important;
  }
}
```

The page wrapper picks up the modifier: `<div className="pcs-legacy pcs-shops-page">`. Information isn't lost because each legacy page's "main column" (col 4 on shops.php) already has a `<div className="d-block d-sm-none">` block that duplicates date / orderno / status / price inline — that was the legacy's manual fallback for the collapsed-row "details" view, designed to be visible alongside whatever the plugin painted. With the cols collapsed, the inline block becomes the SOLE mobile renderer of that data → no duplicate.

**Bonus fix in the same media query — the status-tab strip:**

Legacy `style.css` line 1015 forces `.tab-sm-center { width: 50% }` at `<578px` — 7 status tabs into a 2-column grid leaves the 7th hanging on its own row. Override to single-row horizontal `scroll-snap-type: x mandatory; flex-wrap: nowrap; overflow-x: auto` — customer swipes through tabs (iOS Mail / Calendar pattern). Hides scrollbar via `scrollbar-width: none` + `::-webkit-scrollbar { display: none }`.

**Why this matters next time:**

- **When you port a legacy DataTables / Bootstrap-Responsive table** to React + SSR (no jQuery), the chain to look for is: `<table class="dataTable dtr-inline">`, `<th class="all|none">`, `.tr1::after { content: "...คลิกดูเพิ่มเติม" }`. ALL THREE are dead promises. Search legacy-overrides.css §11 for the canonical pure-CSS replacement.
- **Selector limitation:** CSS can't say "td under a th with class X". You have two options: (a) add a class to each td server-side at render time (verbose markup), or (b) use a per-page modifier wrapper + spell out `td:nth-child(N)` positions. The codebase uses (b) for D1 because the legacy markup is unchanged.
- **Faithful-port intent intact** — only the CSS layer changes. `<th class="none">`, `<th class="all">`, `class="tr1"`, the `.d-block.d-sm-none` mobile-summary block — all preserved 1:1 with the legacy PHP, so the next 1:1 audit (`legacy-fidelity-check` skill) still passes.
- **Detection grep:** `grep -rn 'tr1::after' public/legacy` will find the 5 dead rules; `grep -rn '<th class="none"\|<th className="none"' app` will find the dataTables-Responsive-expecting markup. If either grep returns hits AND a customer reports a mobile overflow → you've hit this.

**Cross-links:**
- Commit `fd1ffd9` — Sprint-26
- Files: `public/legacy/pcs/legacy-overrides.css` §11 + `public/legacy/pcs/shops.css` mobile media query + `app/[locale]/(protected)/service-order/page.tsx` (wrapper className gains `pcs-shops-page`)
- Same pattern applies to `/service-payment` (cols 2/3/4/5 = none), `/service-import/pending` (cols 2/4/5/6 = none), `/wallet/history` — when those get the responsive treatment, add `.pcs-payment-page` / `.pcs-forwarder-page` / `.pcs-wallet-page` modifiers + per-page `td:nth-child` rules in legacy-overrides.css §11 (already comment-stubbed there).

---

## [2026-05-26] `export { x } from "./other"` inside a `"use server"` file BREAKS Next 16's Server-Action AST walker — module reports "no exports" at build

**Context:** Task L (LIFF + Messaging API replacement). Refactored two LINE-related server actions from `actions/profile.ts` into a new dedicated `actions/line-settings.ts`. Tried the obvious clean re-export pattern in `actions/profile.ts`:

```ts
"use server";
// ...
export { linkLineAccount, disconnectLineAccount } from "./line-settings";
```

**Symptom:** `pnpm build` fails. The error is misleading: Next 16's Server-Action validator reports the *entire* `actions/profile.ts` module as having "no exports at all", which transitively breaks every other action exported from that file (`completeProfile`, `updateProfileField`, etc.) — the dormant `profile-form.tsx` (which imports half a dozen of them) explodes with "Module has no exported member" errors for actions that *are* defined inline in the same file.

**Root cause:** Next 16's Server-Action handler walks the module's export *AST* (not the resolved JS exports) to register each `"use server"` function with the action-ID encryption table. Re-exports from another file aren't in the AST as function declarations; they're a `ExportNamedDeclaration` pointing at another module. The walker treats this as "this file has no inline server-action exports" and zeroes the registry for the file, which cascades into a confusing "missing exports" error elsewhere.

**Fix — wrap, don't re-export:**
```ts
"use server";
import {
  linkLineAccount     as linkLineAccountImpl,
  disconnectLineAccount as disconnectLineAccountImpl,
} from "./line-settings";

export async function linkLineAccount(lineUserId: string, displayName: string) {
  return linkLineAccountImpl(lineUserId, displayName);
}
export async function disconnectLineAccount() {
  return disconnectLineAccountImpl();
}
```

The local `async function` declarations land as inline AST nodes, the walker sees them, the action-IDs register, and the body just delegates. ~4 extra lines per action.

**Why this matters next time:**
- Re-exports are the natural refactor move for splitting a fat action file. Next 16 makes them a bear trap.
- The error message points at the *consumer* file ("missing export") not the *defining* file ("re-export rejected"). Looking at the consumer is a 30-minute dead end.
- Same pitfall applies to `export * from "./other"` and `export { x as y } from "./other"` — anything where the AST node is a re-export.
- Allowed: `import { x } from "./other"; export { x }` — that registers `x` as a local binding first; the walker treats it as an inline export. (Verified — `tsc` AND `next build` both accept this form.) But the wrapper pattern is clearer + lets you add cross-cutting concerns (logging, rate-limit, etc.) at the wrapper level.

**Cross-links:**
- Commit `af4bebe9` — task L, `actions/profile.ts` lines updated with the wrapper pattern
- Adjacent files: `actions/line-settings.ts` (canonical home for the two LINE actions)
- This is a documented Next.js issue: search GitHub for "use server re-export AST" — multiple maintainer comments confirm the wrapper is the intended pattern.
