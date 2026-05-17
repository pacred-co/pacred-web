# Frontend tooling research — make ปอน faster (2026-05-18)

> **Audience:** ปอน (frontend / landing-page / SEO dev). **Status:** RESEARCH + RECOMMEND only.
> Nothing here is installed. **ยึดตามน้องปอน** — ปอน owns the frontend and decides what to adopt.
> No `package.json` change, no code change, no install was made producing this doc.

## Why this doc exists

ปอน's job on the `podeng` branch is the marketing site + service landing pages + ad-landing
pages. A scan of the last ~40 `podeng` commits shows a recurring, expensive workflow:

- **Visual tweak→commit→look→revert loop.** `components/sections/certs-slideshow.tsx` was
  touched in 5+ commits in 3 days — carousel → `1+2` collage + lightbox (`460d73b`) → 3-col
  (`d5e02d4`) → reverted to 2-col (`3571aab`) → relabel cells (`4867239`). Same story on
  `components/booking/BookingHero.tsx` and the customs banner mobile crop
  (`ffffec2`, `f96ebbe`, `6ee56d3`). Each iteration is a full `pnpm dev` reload + eyeball.
- **N near-identical landing pages.** The ecosystem has 13 services. Today there are 6+ hand-
  coded landing files (459–835 lines each): `services/customs-clearance` (8-line re-export),
  `services/china-shopping` (649), `services/import-china` (819), `services/import-china-fcl`
  (567), `services/import-china-lcl` (482), `services/export-worldwide` (561), plus the big
  ad-landing `customs-clearance-shipping-suvarnabhumi/page.tsx` (835). They repeat the same
  scaffold (`NavBar` → `SearchBar` → breadcrumb → hero → `ContactSales` → `Reviews` →
  `Footer` → `JsonLd`). The customs ad-landing even has the **LINE banner pasted twice
  verbatim** — ~70 identical lines (`page.tsx:338-409` and `:469-540`). Edit one, the other
  drifts.
- **Many mobile-crop tweaks.** Multiple commits exist *only* to rebalance a mobile layout
  (`f96ebbe` "rebalance mobile h3 wrap", `ffffec2` "visit01 mobile crop"). ปอน is testing
  responsive behavior by resizing a browser by hand.
- **Heavy unoptimized images.** `public/images/visit/visit01.png` is **1.48 MB** and
  `visit03.png` is **1.33 MB** — both rendered at 110–180px wide. 70+ PNGs in `public/images/`
  exceed 300 KB. `BookingHero.tsx` paints hero art via CSS `background: url(...)` which
  **bypasses the Next.js image optimizer entirely** — those bytes ship raw.
- **i18n parity by hand.** ปอน adds `messages/th.json` + `messages/en.json` keys per page;
  `pnpm audit:i18n` only catches missing keys *after* the fact.

Every recommendation below targets one of these. Each is scored for **Pacred-stack fit**
(must work with **Next 16.2.6 App Router + Tailwind v4 `@theme inline` + RSC** — conflicts
flagged), **adoption effort** (S/M/L), and **risk**.

---

## Ranked recommendations

### #1 — Data-driven landing-page template (HIGHEST LEVERAGE)

**What it is.** Stop hand-coding each `services/<slug>/page.tsx`. Define one section
**block library** (`<LandingHero>`, `<ServiceSteps>`, `<LineBannerCTA>`, `<WhyPacred>`,
`<RelatedTags>` — most already exist as ad-hoc JSX inside the customs page) plus a typed
**page-config** per service: `{ slug, h1, eyebrow, steps[], tagGroups[], featuredRep, … }`.
Each `page.tsx` becomes a thin file that imports its config and maps it through a shared
`<ServiceLanding config={…} />`. The 13-service catalogue then differs only in **data**,
not in 600 lines of copy-pasted JSX.

This is exactly the `.claude/skills/copyist-unlimited` skill's job — but `copyist` *generates*
N files that still drift after generation. A **shared component + per-page config** is
strictly better: a template fix propagates to all 13 pages with no re-run. Use `copyist`
only for the initial scaffold of the config stubs, then maintain via the shared component.

First, kill the duplication that already exists: the customs ad-landing's twice-pasted LINE
banner (`customs-clearance-shipping-suvarnabhumi/page.tsx:338-409` ≈ `:469-540`) should
become a single `<LineBannerCTA surface="…" />` used twice.

- **How it speeds ปอน up.** A new service landing goes from "copy 600 lines, find-replace,
  hope nothing broke" to "write a ~40-line config object." A design tweak (e.g. restyle the
  steps card) is **one edit, 13 pages updated**. Removes the whole class of copy-paste drift
  bugs. Fewer lines = faster review for เดฟ.
- **Pacred-stack fit.** ✅ Perfect. Pure React composition — Server Components stay Server
  Components, no client boundary added, Tailwind v4 classes unaffected. The codebase already
  leans this way (`SERVICES[]` array in `services/page.tsx`, `STEPS[]`/`TAG_GROUPS[]` arrays
  in the customs page, `components/sections/customs-port-data.ts`). This formalizes a pattern
  ปอน is already half-using.
- **Effort:** **M** — extract ~5 section components + define configs. Do it incrementally:
  one section component at a time, lowest-risk first (`<LineBannerCTA>`).
- **Risk:** Low. Behavior-preserving refactor. Pair with the `phase-verify-loop` skill and a
  `next build && next start` smoke per AGENTS.md §11 so no landing route 500s.
- **Watch-out:** keep configs **data only** (strings, icon refs, arrays). The moment a service
  needs genuinely unique JSX, let that page diverge — don't force a mega-prop API. Per
  AGENTS.md §6 every service still needs a real landing even if the backend isn't ready.

> **This is the single highest-leverage pick.** It compounds: it makes recommendation #2
> (visual iteration) cheaper (smaller files to preview) and #5 (i18n) cleaner (keys can be
> derived from one config), and it directly serves the revenue lens — more ad-landing pages,
> shipped faster, for the Google Ads cargo push.

---

### #2 — Component preview workbench (kills the tweak→revert loop)

**What it is.** A dedicated environment to render one component in isolation, in many
prop/viewport states **side by side**, without booting the whole page or clicking through
the site. ปอน is currently iterating `certs-slideshow.tsx` by editing → `pnpm dev` reload →
eyeballing the live customs page → reverting. A workbench shows "2-col vs 3-col" at once.

Three options, ranked for this stack:

1. **A plain in-repo `/preview` route (recommended first).** Add an app route like
   `app/[locale]/(dev)/preview/page.tsx` that imports the marketing components and renders
   them in a grid against several prop sets. Zero new dependency, zero `package.json` change,
   works natively with Next 16 App Router + RSC + Tailwind v4 (it *is* the app). Gate it out
   of production with an env check or a `noindex`. This is the lowest-risk way to get 80% of
   the benefit today.
2. **Ladle** — a fast, Vite-based stories runner, lighter than Storybook, good Tailwind
   support. **Fit caveat:** it runs components in its own Vite sandbox, *not* the Next
   runtime — so `next/image`, `next-intl` `useTranslations`, and the `@/i18n/navigation`
   `Link` need mocking/decorators. Workable but it's a second toolchain to keep alive.
3. **Storybook 9** — the most capable (a11y addon, viewport addon, interaction tests). Has a
   Next.js framework adapter, but **RSC support is still partial**: it renders Client
   Components first-class and *async* Server Components only with caveats. Most marketing
   pieces ปอน touches are leaf presentational components, so this is usually fine — but it's
   the heaviest install and the biggest `package.json` footprint.

- **How it speeds ปอน up.** Turns a ~30-second edit→reload→hunt→revert cycle into an
  instant multi-state view. The certs-slideshow 3-col-vs-2-col decision would have been one
  glance instead of three commits.
- **Pacred-stack fit.** Option 1 = ✅ native (no caveats). Options 2 & 3 = ⚠️ run components
  outside the Next runtime → must mock `next-intl`, `next/image`, themed `Link`. Flag this
  explicitly: a story that forgets the `next-intl` provider will throw, unlike the real page.
- **Effort:** Option 1 = **S**. Ladle = **M**. Storybook = **M–L**.
- **Risk:** Option 1 ≈ none (just another route — keep it `noindex`/env-gated). Ladle/Storybook
  carry maintenance + dependency-surface cost.
- **Recommendation:** ปอน should try the in-repo `/preview` route first. Only reach for
  Ladle/Storybook if the team later wants shareable component docs or automated interaction
  tests — for a solo frontend dev mid-emergency, the route is the right call.

---

### #3 — Responsive testing: device toolbar + a viewport-matrix preview

**What it is.** Two cheap habits, no install:
- **Chrome/Edge DevTools device toolbar** (Cmd-Shift-M) with Pacred's real target widths
  saved as custom devices (e.g. 360px, 390px, 768px, 1140px — the breakpoints actually used
  in the code: `max-w-[1140px]`, the `md:` Tailwind boundary). ปอน's mobile-crop commits
  show ad-hoc resizing; saved presets make it repeatable.
- **A viewport-matrix in the `/preview` route from #2** — render the component inside fixed-
  width frames (`<div class="w-[360px]">…</div>`, `w-[768px]`, `w-[1140px]`) stacked on one
  screen. ปอน sees mobile + tablet + desktop simultaneously instead of dragging the window.

A heavier option — **Playwright** screenshot snapshots across viewports to catch layout
regressions in CI — is worth noting but is **out of scope for ปอน solo**: it's QA-team
tooling, adds a `package.json` dependency, and the team already has a `qa-flow-simulator`
skill. Mention it to เดฟ, don't adopt it on `podeng`.

- **How it speeds ปอน up.** The customs banner "mobile crop" round-trips (`ffffec2`,
  `f96ebbe`, `6ee56d3`) collapse into one pass when all viewports are visible at once.
- **Pacred-stack fit.** ✅ DevTools is browser-native. The matrix is just Tailwind width
  utilities — fully Tailwind-v4 / RSC compatible.
- **Effort:** **S** (DevTools presets = minutes; matrix = part of the #2 route).
- **Risk:** None.

---

### #4 — Image optimization for CTA banners + hero art (revenue-linked)

**What it is.** Two concrete fixes ปอน controls:

1. **Convert heavy PNGs to WebP/AVIF.** `visit01.png` (1.48 MB) and `visit03.png` (1.33 MB)
   render at ≤180px wide — they should be a few KB. The CTA banners ปอน just added
   (`public/images/cta/pruksa.png`, `samak.png`, ~90 KB) are flat-color text banners that
   compress hard as WebP. Generate optimized variants with a one-off CLI (`sharp` ships in
   `pnpm.onlyBuiltDependencies` already, or `cwebp`, or **Squoosh** for a no-install GUI).
   This is an *asset* change, not a `package.json` change.
2. **Stop bypassing the Next image optimizer.** `BookingHero.tsx:46-54` paints hero art with
   CSS `background: url('/images/bannerdesktop/clearancedesktop.png')`. CSS backgrounds are
   **not** processed by `next/image` — the raw PNG ships at full weight on every landing's
   hero. Switching the hero background to a `<Image fill priority>` underlay lets Next serve
   resized AVIF/WebP automatically. (`next.config.ts` already sets `images.qualities: [75, 92]`
   and Next 16 auto-negotiates AVIF/WebP — the optimizer just needs the image to *go through*
   `<Image>`.)

- **How it speeds ปอน up (and earns money).** This is the **revenue lens**: hero/banner art
  is in the LCP element of every ad-landing. Shaving ~3 MB off the customs landing's image
  payload directly improves LCP → improves Google Ads quality score → lowers cost-per-click.
  Per CLAUDE.md emergency state, bad LCP literally drains runway.
- **Pacred-stack fit.** ✅ `<Image>` is the Next 16 first-class API; `sharp` is already an
  allowed built dependency. The only "conflict" is the current anti-pattern (CSS-bg art) —
  flagged above as the thing to fix.
- **Effort:** **S** for the PNG→WebP pass; **S–M** for the BookingHero `<Image>` swap (needs
  a layout check so the text overlay still sits correctly).
- **Risk:** Low. Verify visually after conversion (some PNGs with transparency need WebP
  alpha — `sharp`/`cwebp` handle it). Keep originals until the swap is confirmed.

---

### #5 — i18n key workflow: tighten `audit:i18n` into the loop + co-locate keys

**What it is.** `pnpm audit:i18n` already does fail-closed missing-key detection (see
`scripts/i18n-audit.mjs`) with a smart intentional-same allowlist. The gap is **timing** —
ปอน finds parity breaks only when running the audit manually. Two low-cost improvements ปอน
can suggest:

1. **Run `audit:i18n` on save / pre-commit**, so a missing `en` key surfaces the instant a
   `th` key is added — not at `pnpm verify` time. (Editor watch task or a git hook;
   harness-side hook config is a `.claude/settings.json` matter for เดฟ, not a code change.)
2. **Co-locate page keys with the page-config from #1.** If each landing's strings live in
   its config object, a typed `keyof` mapping makes a missing translation a *type error* in
   the editor — caught before the audit even runs.

A heavier route — Crowdin / Tolgee / a translation-management SaaS with in-context editing —
is real 2026 tooling and genuinely nice, but for a 2-locale (th/en) site maintained by the
same dev it adds an external dependency + account for little gain. Note it for the future;
don't adopt now.

- **How it speeds ปอน up.** Removes the "add a feature, `audit:i18n` fails at verify, go back
  and add the EN key" round-trip.
- **Pacred-stack fit.** ✅ Pure tooling/process around the existing next-intl + JSON setup;
  no runtime change.
- **Effort:** **S** (hook/watch) + folds into #1 for the typed-keys part.
- **Risk:** None.

---

### #6 — Tailwind v4 authoring aids (small but daily)

**What it is.** ปอน writes long Tailwind class strings (the certs-slideshow has 200-char
`className`s with arbitrary values like `shadow-[0_8px_22px_-10px_rgba(15,23,42,0.18)]`).
Two no-risk aids:
- **Tailwind CSS IntelliSense** VS Code extension — autocomplete + hover previews + color
  swatches. It reads Tailwind v4 `@theme inline` from `app/globals.css` (v4-aware versions
  support the CSS-first config — no `tailwind.config.js` needed, which matches this repo).
- **Prettier with `prettier-plugin-tailwindcss`** — auto-sorts class order so diffs are
  smaller and consistent across the 13 landing pages. (Editor-level; if added as a repo dev
  dependency that *is* a `package.json` change — so ปอน should run it editor-side, or raise
  it with เดฟ as a separate decision.)

- **How it speeds ปอน up.** Fewer typos in long class strings, instant feedback on the
  brand-token names (`primary-600` etc.), smaller and tidier diffs.
- **Pacred-stack fit.** ✅ IntelliSense is v4 + `@theme inline` aware. ⚠️ Note: adding the
  Prettier plugin to the repo touches `package.json` — out of scope for this doc; editor-only
  use is fine.
- **Effort:** **S** (editor-only).
- **Risk:** None for the extension. Repo-level Prettier is a team decision (defer to เดฟ).

---

## Summary table

| # | Recommendation | Speeds up | Fit | Effort | Risk |
|---|---|---|---|---|---|
| 1 | **Data-driven landing-page template** | N landing pages w/o copy-paste drift | ✅ native RSC | M | Low |
| 2 | Component preview workbench (in-repo `/preview` route first) | Visual tweak→revert loop | ✅ route native · ⚠️ Ladle/Storybook need next-intl/Image mocks | S (route) / M–L (SB) | Low / Med |
| 3 | Responsive testing (DevTools presets + viewport matrix) | Mobile-crop round-trips | ✅ | S | None |
| 4 | Image optimization (WebP/AVIF + stop CSS-bg art) | LCP → Ads quality score → CPC | ✅ `<Image>`/`sharp` | S–M | Low |
| 5 | i18n: `audit:i18n` on save + co-located typed keys | th/en parity round-trips | ✅ | S | None |
| 6 | Tailwind v4 authoring aids (IntelliSense) | Long class-string authoring | ✅ v4-aware | S | None |

## Highest-leverage pick

**#1 — the data-driven landing-page template.** It attacks ปอน's biggest structural cost
(13 services × 500–800 lines of duplicated JSX, already drifting — the customs page's
twice-pasted LINE banner proves it), it is a behavior-preserving refactor with low risk, it
is a perfect fit for Next 16 RSC (pure composition, no client boundary), and it **compounds**:
it shrinks the files #2's preview workbench has to render, gives #5 a clean home for typed
i18n keys, and directly serves the cargo-revenue emergency by making new ad-landing pages
fast to ship. The existing `.claude/skills/copyist-unlimited` skill can scaffold the initial
configs; the shared `<ServiceLanding>` component is what keeps them from drifting afterward.

## Suggested order for ปอน

1. **#4 image pass** — fastest measurable revenue win (LCP), can land today, S effort.
2. **#1 landing template** — start with `<LineBannerCTA>` (de-dupe the customs page), grow
   incrementally.
3. **#2 in-repo `/preview` route** — unblocks fast iteration; build #1's section components
   straight into it.
4. **#3, #5, #6** — fold in as habits / small process tweaks alongside the above.

---

## Caveats & cross-references

- **Nothing here was installed.** No `package.json`, no code touched. Every item is a
  proposal for ปอน to evaluate — **ยึดตามน้องปอน**.
- Anything adopted that changes a landing route must pass the **production smoke gate**
  (`next build && next start` + curl each route) per `AGENTS.md` §11 before a `dave→main`
  deploy. The `phase-verify-loop` skill covers this.
- Don't refactor toward a V3-ideal architecture — this repo is V2 (`AGENTS.md` §4). #1 is a
  *de-duplication* of what exists, not a redesign.
- Related skills: [`.claude/skills/copyist-unlimited/SKILL.md`](../../.claude/skills/copyist-unlimited/SKILL.md)
  (scaffold the configs), [`.claude/skills/INDEX.md`](../../.claude/skills/INDEX.md) (full skill kit).
- Files cited: [`components/sections/certs-slideshow.tsx`](../../components/sections/certs-slideshow.tsx) ·
  [`components/booking/BookingHero.tsx`](../../components/booking/BookingHero.tsx) ·
  [`app/[locale]/(public)/customs-clearance-shipping-suvarnabhumi/page.tsx`](../../app/[locale]/(public)/customs-clearance-shipping-suvarnabhumi/page.tsx) ·
  [`scripts/i18n-audit.mjs`](../../scripts/i18n-audit.mjs) ·
  [`next.config.ts`](../../next.config.ts) ·
  [`components/seo/site.ts`](../../components/seo/site.ts).
- Conventions: [`docs/conventions.md`](../conventions.md).
- If a measured LCP win lands from #4, capture it in
  [`docs/learnings/perf-patterns.md`](../learnings/perf-patterns.md) via the
  `scholar-immortal` skill.
- Research-folder index: [`docs/research/_index.md`](_index.md).
