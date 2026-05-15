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
