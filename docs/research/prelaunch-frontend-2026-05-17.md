# Pre-launch frontend audit — public / landing / SEO surface

**Date:** 2026-05-17 (T-1 day before launch 2026-05-18)
**Author:** launch-readiness pass covering ปอน's domain (Frontend / Landing / SEO)
**Scope audited:** `app/[locale]/(public)/` · `components/sections/` · `components/booking/` · `components/seo/` · `messages/{th,en}.json` · `app/sitemap.ts` · `app/robots.ts`
**Method:** read every public `page.tsx` + SEO infra + i18n SEO namespaces; cross-checked against ปอน T-N1..T-N5 and ADR-0007.

---

## §0 — Verdict

**The public surface IS launch-ready.** One concrete chrome gap was found and fixed; everything else is clean. No structural redesigns, no missing pages block launch.

### `[fix-before-launch]` — fixed in this pass

- **`/booking` page had no NavBar / SearchBar / Footer.** Every other public page renders these; `/booking` rendered only `<BookingCalculator />`. A visitor arriving from the sitemap (the route is listed, priority 0.7) or a search result was stranded — no top nav, no footer, no way to reach any other page. **Fixed:** added `NavBar` + `SearchBar` + `Footer`, matching the home-page pattern. The page already had a valid `<h1>` (via `BookingHero` inside `BookingCalculator`) and complete `generateMetadata`, so only the chrome was missing.

### `[clean]` — verified, no action needed

- **Metadata coverage** — all 31 content pages under `(public)` export `generateMetadata` (or static `metadata` for `/status`). `buildPageMetadata` (`components/seo/page-meta.ts`) emits title · description · canonical · hreflang (`th-TH`/`en-US`/`x-default`) · OpenGraph · Twitter `summary_large_image` consistently. The two redirect routes (`/line` → LINE OA 307, `/services/customs-clearance` → 308 to the canonical customs slug) correctly have no metadata — they never render.
- **One `<h1>` per page with intent keyword** — every landing/service page has exactly one `<h1>` carrying its target keyword ("นำเข้าสินค้าจากจีน", "เคลียร์ศุลกากร", etc.). Pages using `StubPage` (`/contact`, `/payment/*`, `/terms`, etc.) and `WarehouseDetail` (`/warehouses/*`) each render exactly one `<h1>` inside the shared component. The home page gets its `<h1>` from `BookingHero`.
- **JSON-LD** — the 4 main service pages + customs landing + per-port pages emit `serviceSchema` + `breadcrumbSchema` (+ `faqPageSchema` where an FAQ exists). The home page emits `serviceSchema` per featured service. Non-service informational pages emit `breadcrumbSchema`. Appropriate coverage.
- **`sitemap.ts` / `robots.ts`** — sitemap covers all 27 static public routes + dynamic knowledge/news/port detail pages, with hreflang alternates. `robots.ts` allows `/`, disallows all auth/admin/portal paths, explicitly allows AI crawlers, and points to `sitemap.xml`.
- **Service grid integrity (`/services`)** — every `status: "live"` card links to a real page: `import-china-fcl`, `import-china-lcl`, `import-china`, `china-shopping`, `payment/alipay`, `customs-clearance-shipping-suvarnabhumi`, `export-worldwide` — all resolve, no 404. `status: "soon"` cards link to `/services` itself (a benign self-link, not a 404) — see post-launch note below.
- **Ad-landing CTA quality** — every cargo/customs landing has a phone CTA + LINE CTA above the fold (in the hero or hero card). CTAs use `TrackedExternalLink` / `TrackedPhoneLink`, firing the `cta_click` GTM event per ADR-0007. `ContactSales` wires `sales_phone` / LINE CTAs the same way. GTM + Clarity scripts are mounted in `app/layout.tsx`.
- **Dynamic-segment 500 risk** — all 3 `[param]` routes (`knowledge/[slug]`, `news/[slug]`, `customs-…/[port]`) already declare `export const dynamic = "force-dynamic"`, so the `DYNAMIC_SERVER_USAGE` prerender 500 (AGENTS.md §11) cannot occur. `NavBar` is a `"use client"` component using the browser Supabase client — it does not read server cookies, so non-dynamic pages are also safe.
- **i18n** — the `seo.*` namespace is in full th/en parity (both files, identical key tree, lines 1960-2088). No keys were added in this pass, so `pnpm audit:i18n` is unaffected.

### `[post-launch]` — flagged, not fixed (out of scope / needs owner direction)

- **"Soon" service cards self-link to `/services`.** Five grid cards (ใบกำกับภาษี, จับคู่ตัวแทนออกของ, ขอคืนภาษี, ฟูมิเกชัน, ขนส่งในประเทศ) carry `status: "soon"` and `href: "/services"`. They render as non-clickable (`aria-disabled`, `cursor-default`) so the self-link is inert — not a bug. But these are real Pacred ecosystem services (#1, #5, #7, #10, #13) with no landing page yet. This is ปอน's **T-N4 / P1 "Phase I ecosystem landings"** backlog item and is explicitly blocked on Pacred-owner copy direction. Not a launch blocker — do NOT speculatively build placeholder pages on launch eve.
- **`/status` uses hardcoded (non-i18n) metadata.** Acceptable — it is an ops/diagnostics page, intentionally excluded from the sitemap, and serves a bilingual one-liner. Low priority; could move to the `seo.*` namespace post-launch for consistency.

---

## Per-area audit detail

### 1. SEO completeness (T-N1)

| Check | Result |
|---|---|
| `generateMetadata` on every content page | PASS — 31/31 (`/status` uses static `metadata`) |
| Canonical + hreflang | PASS — `buildPageMetadata` emits `th-TH`/`en-US`/`x-default`; per-port page builds them inline |
| OpenGraph + Twitter card | PASS — uniform via `buildPageMetadata` |
| Exactly one `<h1>` with intent keyword | PASS — landing pages inline; `StubPage`/`WarehouseDetail`/`BookingHero` each render one |
| JSON-LD on landing/service pages | PASS — service + breadcrumb + FAQ schemas |
| `sitemap` + `robots` cover all public routes | PASS |

### 2. Service grid integrity

`app/[locale]/(public)/services/page.tsx` — 12 cards. All 7 `live` cards resolve to real pages. 5 `soon` cards are inert (non-clickable) with a self-link `href` — no 404 reachable. **No broken links.**

### 3. Ad-landing quality (T-N2 / T-N3)

Cargo/customs landings (`import-china`, `import-china-fcl`, `import-china-lcl`, `china-shopping`, `export-worldwide`, `customs-clearance-shipping-suvarnabhumi`): each has a LINE attention banner + phone/LINE button row above the fold. All CTAs route through `TrackedExternalLink` / `TrackedPhoneLink` → `cta_click` event with `surface` + `position` props. GTM container + Clarity loaded in root layout. **Wiring correct per ADR-0007.**

### 4. Mobile-first (T-N5)

Landing pages reviewed use the established mobile-first system: `max-w-[...]` containers, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`, responsive `md:` type ramps, no fixed pixel widths without a `max-w` cap. No code-level overflow risk found in the pages read. (Real-device QA across the top-10 remains ปอน's standing P1 — not a code gap.)

### 5. i18n

`seo.*` namespace verified in both `messages/th.json` and `messages/en.json` — identical key tree, full TH/EN parity. No keys touched this pass.

---

## Fix applied

| File | Change |
|---|---|
| `app/[locale]/(public)/booking/page.tsx` | Added `NavBar` + `SearchBar` + `Footer` (was rendering bare `<BookingCalculator />` with no site chrome). |
