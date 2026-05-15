# Learnings — i18n pitfalls (next-intl + Pacred)

Topics: TH/EN parity, namespace conventions, rich-tag substitution, intentional-same-value allowlist.

---

## [2026-05-15] `pnpm audit:i18n` enforces TH/EN parity — both must match key-count

**Context:** Adding new translations.

**Symptom:** Adding a TH key but forgetting to add the EN equivalent → next-intl crashes at runtime on EN visit because the key is undefined.

**Root cause:** next-intl doesn't fall back gracefully by default. Key must exist in both locales.

**Fix:** Always edit `messages/th.json` AND `messages/en.json` in the same commit. Run `pnpm audit:i18n` before push to verify parity.

The audit also classifies "same-value" pairs (where TH == EN) into:
- Intentional (per allowlist patterns / KEY_INTENTIONAL_PATTERNS in script) — OK
- Needs review — likely missing translation

**Why this matters next time:** Every i18n PR check is `pnpm audit:i18n`. If it fails, fix before push or CI red.

**Cross-links:**
- [`scripts/i18n-audit.mjs`](../../scripts/i18n-audit.mjs) — the auditor
- [`messages/th.json`](../../messages/th.json) + [`messages/en.json`](../../messages/en.json)

---

## [2026-05-15] Rich tags in i18n use `t.rich()` with element map, NOT inline HTML strings

**Context:** ปอน's customs page v2 needed inline yellow accent on price stamp ("เริ่มต้น 2,800 บาท" with "เริ่มต้น" + "2" in yellow).

**Symptom (anti-pattern):** Putting `<span class='text-yellow-300'>เริ่มต้น</span>` literally in the JSON value → HTML rendered as escaped text on page.

**Root cause:** next-intl messages are plain strings. Rich formatting needs `t.rich()` with named element handlers.

**Fix:** In `messages/th.json`:
```json
{ "customs": { "hero": "เริ่มต้น <hl>2</hl>,800 บาท" } }
```
In TSX:
```tsx
const t = useTranslations("customs");
<p>{t.rich("hero", {
  hl: (chunks) => <span className="text-yellow-300">{chunks}</span>
})}</p>
```

Or for inline emphasis: `<em>` / `<nowrap>` / `<hl>` named handlers (see Pacred BookingHero pattern in `99656d2` commit).

**Why this matters next time:** Any time the design needs partial-string styling → use `t.rich()` with handlers, NOT raw HTML in the JSON value. Add the tags to both TH + EN versions.

**Cross-links:**
- [`components/booking/BookingHero.tsx`](../../components/booking/BookingHero.tsx) — example
- [next-intl rich docs](https://next-intl-docs.vercel.app/docs/usage/messages#rich-text)

---

## [2026-05-15] Namespace by section, not by component

**Context:** Where to put new translation keys.

**Symptom (anti-pattern):** Naming a key after the React component (e.g., `BookingHero.title`) → if the component renames or splits, keys become orphans.

**Fix:** Namespace by **page section** / **feature** / **service**, not implementation:
- ✅ `customs.banner.h1`
- ✅ `home.hero.cta`
- ✅ `register.juristic.step1.taxId`
- ❌ `BookingHero.title`

**Why this matters next time:** Components refactor; keys persist. Naming by domain makes keys forward-compatible.

**Cross-links:**
- [`docs/conventions.md`](../conventions.md) §7 i18n rules
- ปอน brief P1 task `L-9b namespace normalize`

---

## [2026-05-15] Default locale = `th`, prefix = `as-needed` (no `/th` in URLs)

**Context:** Generating sitemap / canonical URLs.

**Symptom:** Generating both `pacred.co/about` and `pacred.co/th/about` in sitemap → Google sees as duplicate content.

**Root cause:** `i18n/routing.ts` sets `localePrefix: 'as-needed'` — the default locale (TH) has NO prefix, only `/en/*` for English.

**Fix:** Sitemap should output:
- `https://pacred.co/about` (TH, no prefix)
- `https://pacred.co/en/about` (EN, with prefix)

Use `localizedUrls()` helper from `components/seo/site.ts`.

**Why this matters next time:** Don't generate `pacred.co/th/...` — it doesn't exist as a valid URL. Use the helper or manually omit the TH prefix.

**Cross-links:**
- [`i18n/routing.ts`](../../i18n/routing.ts)
- [`components/seo/site.ts`](../../components/seo/site.ts) — `localizedUrls()`

---
