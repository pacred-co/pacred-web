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
