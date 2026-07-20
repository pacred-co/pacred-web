---
name: performance-hunter
description: Use this skill whenever something feels slow OR measurement says it is — "the page is slow", "LCP > 3s", "query takes forever", "ตอนยิงโหลดเป็นนาน", "ad quality score ต่ำเพราะหน้าโหลดช้า", "find perf bottlenecks", "optimize <X>". Pacred-specific lens: landing page LCP affects Google Ads quality score → bad LCP = pay-more-per-click = revenue drain. Backend slow query → admin staff waits → fulfillment bottleneck. This skill hunts the root cause (network · render · DB · bundle size · cache miss) systematically before suggesting a fix. Never optimize blind — always measure before and after.
---

# Performance Hunter

> **Why this exists.** Pacred is running ads. Slow landings = wasted ad budget. Slow admin pages = staff bottleneck. The user said *"คอยหาวิธี performance ด้วย"*. This skill systematizes the hunt so we never guess.

## When to invoke

- ✅ Web Vitals (LCP / FID / CLS / INP) red on top-5 cargo landings
- ✅ Supabase query > 500ms in admin log
- ✅ Bundle size > 200KB on any landing route
- ✅ "Build takes forever" on Vercel — analyze .next/analyze output
- ✅ Ad quality score < 6/10 on Google Ads (almost always page-experience)
- ❌ "Pre-emptive optimization" without a measurement — no measurement = no fix
- ❌ Optimizing dev-mode timings — production performance differs significantly

## The pattern (PROFILE → DIAGNOSE → FIX → MEASURE)

```
1. MEASURE current state — get a number
   · Frontend: Lighthouse CI (npx unlighthouse / web.dev/measure)
       LCP / FID / CLS / TBT / TTFB
   · Backend: Supabase query log + EXPLAIN ANALYZE
   · Bundle: pnpm next build → analyze .next/server / .next/static
   · Memory: node --inspect / Chrome devtools heap snapshot
   Record the number. Without before-number you can't claim improvement.

2. CLASSIFY the bottleneck type
   · NETWORK   (TTFB > 800ms / waterfall shows blocking req)
   · RENDER    (LCP > 3s / big hero image not optimized)
   · JS WEIGHT (TBT > 300ms / FID > 100ms / 200KB+ JS bundle)
   · DB        (PostgREST query > 500ms / N+1 pattern)
   · CACHE     (every request rebuilds same data / no CDN cache hit)

3. DIAGNOSE — find the smallest unit of waste
   · NETWORK   → Network tab: which req? blocking? not-preloaded?
   · RENDER    → Performance tab: which paint is slow? <img> sized wrong?
   · JS WEIGHT → Bundle analyzer: largest dependency? tree-shake friendly?
   · DB        → EXPLAIN ANALYZE: missing index? sequential scan?
   · CACHE     → headers: Cache-Control? stale-while-revalidate? CDN edge hit?

4. FIX — apply the targeted change
   See "common Pacred perf fixes" below.

5. RE-MEASURE — same tool, same conditions
   Did the number actually improve? By how much? Was the fix worth it?

6. CAPTURE — docs/learnings/perf-patterns.md
   What pattern caused this? Will it happen again elsewhere? Document.
```

## Common Pacred perf fixes (battle-tested catalog)

### Frontend / landing
- **Hero image too heavy** → `<Image>` with `priority` prop + WebP/AVIF + sized via CSS aspect ratio. Don't ship 3MB JPG.
- **Web Font flash (FOUT/FOIT)** → `next/font` (Pacred uses Prompt) with `display: swap` and preconnect.
- **Server vs Client mismatch** → if a Server Component does what could be static → make it static. `force-dynamic` is expensive.
- **Bundle bloated by lucide-react** → individual imports `import { Phone } from "lucide-react"` (Pacred convention) NOT default barrel.
- **Mobile FOMC** (first-of-many-components) — defer non-critical sections below the fold with `<Suspense>` boundaries.
- **No preconnect to LINE / analytics** — add `<link rel="preconnect" href="https://www.googletagmanager.com">` in root layout.

### Backend / Supabase
- **N+1 query in admin list** → join via `.select("*, related(*)")` PostgREST syntax, not `for each row: query related`.
- **Missing index on date filter** → `CREATE INDEX ON header_orders (created_at DESC)` if filtered by date often.
- **RLS policy expensive** → review with `EXPLAIN ANALYZE` — if `is_admin()` SECURITY DEFINER fires N times → cache result per request.
- **`profiles` join everywhere** → consider materialized view `mv_customer_summary` refreshed hourly.

### Build
- **Vercel build time > 5 min** → check `next.config.ts` for unnecessary `experimental: { ... }` flags. Profile with `NEXT_BUILD_PROFILE=1`.
- **Type-check is bottleneck** → split `tsconfig.json` into `tsconfig.build.json` (excludes test files / scripts).

### Cache
- **Pages re-rendering every request** → `revalidate: 60` or static. Default to static unless user-specific.
- **PostgREST query refetching** → use `react-cache` per request boundary.
- **Static assets not on CDN** — Vercel auto-CDNs `/public/*`; if it's not happening, check `vercel.json` headers.

## Pacred perf targets (cargo revenue sprint baseline)

| Surface | Metric | Target | Why |
|---|---|---|---|
| Landing top-5 cargo pages | LCP (mobile 4G) | < 2.5s | Ad quality score ≥ 7/10 |
| Landing | CLS | < 0.1 | Stable layout |
| Landing | INP | < 200ms | Tap responsiveness |
| Landing | JS bundle | < 150KB gz | 4G mobile budget |
| `/dashboard` | TTFB | < 800ms | Logged-in pace |
| Admin list views | Supabase query | < 500ms | Staff productivity |
| `/api/cron/*` | Total cron runtime | < 10s (Vercel limit) | Cron health |

## How to measure (Pacred toolchain)

```bash
# Frontend Web Vitals (4G mobile)
npx unlighthouse --site https://pacred.co --debug

# Bundle analysis (after pnpm build)
ANALYZE=true pnpm build   # if @next/bundle-analyzer wired (TODO ก๊อต)

# Supabase EXPLAIN
psql $SUPABASE_DB_URL -c "EXPLAIN ANALYZE SELECT ..."

# Production diff (mobile vs desktop)
chrome --headless --enable-gpu \
  --no-sandbox --disable-software-rasterizer \
  --no-default-browser-check \
  --autoplay-policy=no-user-gesture-required \
  --window-size=375,812 \
  --user-agent="..." \
  https://pacred.co/<path>

# Or just open Chrome DevTools → Lighthouse → mobile / 4G slow → run
```

## Anti-patterns

- **"Just add caching"** without understanding why it's slow — caching the wrong thing makes invalidation a nightmare.
- **Optimizing before measuring** — feels productive, isn't.
- **Premature codesplit** — chunking before bundle analysis shows real waste = added complexity for no gain.
- **Ignoring CLS / layout shift** — bad CLS tanks Ad quality score even if LCP is fine.
- **"It's fast enough on my MacBook"** — Pacred customers browse on TH mobile. Always test with throttled 4G.

## Cross-links

- [`audit-kpi-dashboard`](../audit-kpi-dashboard/SKILL.md) — track perf metrics over time
- [`phase-verify-loop`](../phase-verify-loop/SKILL.md) — verify fix didn't break behavior
- [`docs/PORT_PLAN.md`](../../../docs/PORT_PLAN.md) Part T2 ปอน T-N2 "Ad landing quality" — this skill executes T-N2
- [`docs/decisions/0007-analytics-and-ab-testing.md`](../../../docs/decisions/0007-analytics-and-ab-testing.md) — GTM/Clarity already wired (use for perf data)
