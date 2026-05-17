# Whole-System Pre-Launch Audit — 2026-05-17

> **Scope:** full pre-launch system audit of `pacred-web` (Next.js 16.2.6 · React 19.2.4 · TypeScript strict · Supabase · Tailwind v4). Launch to production is scheduled for the following day.
> **Mode:** READ-ONLY audit. No app code was changed. Auditor ran build + verify gates and HTTP-smoked every route against a production `next start` server.
> **Auditor branch:** `worktree-agent-a5a81238566cc111d` (isolated worktree off `dave`).

---

## TL;DR — Launch verdict

**🟢 GO for launch.** No P0 blockers. `pnpm build` and `pnpm verify` both pass clean. All ~155 page routes and 21 API routes return correct status codes under a real production server. **Zero crash-class 500s.** One `502` was found and traced — it is a *correctly-handled* upstream-WAF failure on an **orphan, unused** API route (`/api/dbd/[taxId]`), not a customer-facing break. Findings below are P1/P2 polish + cleanup, none gate the launch.

---

## 1. Build + Verify gate results

| Gate | Command | Result | Notes |
|---|---|---|---|
| **Build** | `pnpm build` | ✅ **PASS** | Turbopack. Compiled in ~15s, TypeScript in ~25s, 19/19 static pages generated. Route manifest emitted cleanly. |
| **Lint** | `pnpm lint` (eslint 9) | ✅ **PASS** | No errors, no warnings. |
| **Typecheck** | `tsc --noEmit` (via `pnpm verify`) | ✅ **PASS** | Strict mode, no type errors. |
| **Unit tests** | `pnpm test:unit` | ✅ **PASS** | Full `tsx` test chain green (calc-price, validators ×11, china-search ×4, warehouse ×4, analytics, experiments, cargo-type — 33/33 on the last suite shown, all suites green). |
| **Audit — md links** | `pnpm audit:md` | ✅ **PASS** | 1380 local links across 108 md files, all resolve. |
| **Audit — env** | `pnpm audit:env` | ✅ **PASS** | All *used* env vars are declared. 12 declared-but-unused vars (see §4.4) — informational, not a failure. |
| **Audit — i18n** | `pnpm audit:i18n` | ✅ **PASS** | th 1860 keys = en 1860 keys. 0 missing either side. 91 allow-listed intentionally-same. |

**Build warnings (non-blocking, noted for hygiene):**
- `[@sentry/nextjs] DEPRECATION WARNING: disableLogger is deprecated` — use `webpack.treeshake.removeDebugLogging`.
- `[@sentry/nextjs] DEPRECATION WARNING: automaticVercelMonitors is deprecated` — use `webpack.automaticVercelMonitors`.
- `[WARN] Unsupported engine: wanted node >=24.0.0 (current v20.20.1)` — `package.json` `engines` pins Node ≥24; the audit machine runs Node 20. Build/test still succeed. **Confirm the Vercel project is set to a Node 24 runtime** so prod matches the declared engine. (See §4.5.)

---

## 2. Production route smoke — full status table

**Method:** `pnpm build` then `pnpm start` (real production server, port 3000). Every route enumerated from `find "app/[locale]" -name page.tsx` + `find app -name route.ts*`. Each route hit with `redirect: 'manual'` (so 3xx is visible, not followed). Dynamic `[param]` routes hit with a fake id. **Production mode was used deliberately** — `next dev` masks `DYNAMIC_SERVER_USAGE`; `next start` does not.

Legend: **200** OK · **307/308** redirect (expected) · **401** unauthorized (expected for protected APIs) · **404** not-found (expected for fake ids) · **405** method-not-allowed (expected — `GET` on a `POST`-only route) · **502** upstream-gateway.

### 2.1 Frontend — public (no auth)

| Route | Status | Note |
|---|---|---|
| `/` | 200 | home (960ms first render — cold) |
| `/services` | 200 | service grid |
| `/services/china-shopping` | 200 | |
| `/services/customs-clearance` | 308 → `/customs-clearance-shipping-suvarnabhumi` | intentional permanent redirect |
| `/services/export-worldwide` | 200 | |
| `/services/import-china` · `/import-china-fcl` · `/import-china-lcl` | 200 | |
| `/about` `/booking` `/contact` `/faq` `/holidays` `/how-to-use` `/join-us` `/knowledge` `/news` `/privacy` `/terms` `/delivery-areas` `/status` | 200 | all OK. `/status` = 7.1s first render (see §4.2) |
| `/line` | 307 → `/Yg3fU0I` | redirects to LINE OA short link — intentional |
| `/payment/1688` · `/payment/alipay` · `/payment/taobao` | 200 | |
| `/warehouses/china` · `/guangzhou` · `/thailand` · `/yiwu` | 200 | |
| `/customs-clearance-shipping-suvarnabhumi` | 200 | customs landing index |
| `/customs-clearance-shipping-suvarnabhumi/fake-port-xyz` | 404 | dynamic `[port]`, bad slug → `notFound()` ✓ |
| `/knowledge/fake-slug-xyz` | 404 | dynamic `[slug]` → `notFound()` ✓ |
| `/news/fake-slug-xyz` | 404 | dynamic `[slug]` → `notFound()` ✓ |

### 2.2 Auth tier (guests-only / entry)

| Route | Status | Note |
|---|---|---|
| `/login` `/register` `/forgot-password` | 200 | |
| `/reset-password` | 307 → `/forgot-password` | no recovery token → bounce. Expected. |
| `/complete-profile` | 307 → `/login` | un-authed → login. Expected. |
| `/liff/link` | 307 → `/login` | un-authed → login. Expected. |

### 2.3 Customer backend — protected (`requireAuth` gate)

All 26 protected routes (incl. dynamic) returned **307 → `/login`** when un-authed. **No 500s.** Sample:

`/dashboard` `/addresses` `/notifications` `/profile` `/profile/security/change-phone` `/orders` `/orders/new` `/sales` `/sales/history` `/sales/report` `/sales/report/add` `/service-import` (+`/add` `/pending` `/receipts` `/warehouse-addresses`) `/service-order` (+`/add` `/cart` `/pending`) `/service-payment` (+`/add`) `/shipments` `/wallet/deposit` `/wallet/history` `/wallet/withdraw` → **all 307 → /login** ✓

Dynamic protected: `/service-import/FAKE123` `/service-import/FAKE123/receipt` `/service-order/FAKE123` `/service-order/FAKE123/receipt` `/shipments/FAKE123` → **all 307 → /login** ✓ (the auth guard in the `(protected)` layout fires before the page body, so a bad id never reaches page code while un-authed — correct).

### 2.4 Admin backend (`requireAdmin` gate)

All 95 admin routes (incl. 17 dynamic `[id]`/`[fNo]`/`[code]`/etc.) returned **307 → `/login`** when un-authed. **No 500s.** Covers `/admin` + `/admin/accounting/*` `/admin/admins` `/admin/audit` `/admin/barcode/*` `/admin/carriers` `/admin/contact-messages` `/admin/containers/*` `/admin/csv-imports/*` `/admin/customers/*` `/admin/dashboard` `/admin/driver-runs` `/admin/drivers/*` `/admin/forwarder*` `/admin/freight/*` `/admin/hr/*` `/admin/inventory` `/admin/juristic-check` `/admin/learning` `/admin/orders/*` `/admin/payment` `/admin/rates/*` `/admin/reports/*` `/admin/sales-payouts` `/admin/service-orders/*` `/admin/settings/*` `/admin/tax-invoices/*` `/admin/team-leaders` `/admin/wallet/*` `/admin/warehouse/*` `/admin/withdrawals` `/admin/yuan-payments` — **all 307 → /login** ✓

`requireAdmin()` (`lib/auth/require-admin.ts`): un-authed → `redirect("/login")`; authed-non-admin → `notFound()` (404, route invisible to customers). Correct two-tier gate.

### 2.5 API routes & handlers

| Route | Status | Verdict |
|---|---|---|
| `/api/china-search` | 401 | auth-gated ✓ |
| `/api/settings-rate` | 401 | auth-gated ✓ |
| `/api/china-search/image` | 405 | `GET` on POST-only route ✓ |
| `/feed.xml` | 200 | RSS ✓ |
| `/robots.txt` `/sitemap.xml` `/icon.png` | 200 | ✓ |
| `/opengraph-image` | 404 | **expected** — real path is `/opengraph-image.png` (Next 16 appends ext). File `app/opengraph-image.tsx` builds fine. Not a bug. |
| `/auth/callback` | 307 → `/login?error=missing_code` | no OAuth `code` param → graceful bounce ✓ |
| `/auth/signout` | 405 | `GET` on POST-only signout ✓ (CSRF-safe) |
| `/line` (`app/line/route.ts`) | 307 → `/Yg3fU0I` | LINE OA redirect ✓ |
| `/api/dbd/0105564077716` | **502** | ⚠️ see **BUG-1** below |
| `/api/freight-invoice/FAKE123` (+`/packing-list`) | 401 | auth-gated ✓ |
| `/api/freight-receipt/FAKE123` | 401 | auth-gated ✓ |
| `/api/pdf/forwarder/FAKE123` | 404 | bad id → not-found ✓ |
| `/api/pdf/shop-order/FAKE123` | 401 | auth-gated ✓ |
| `/api/tax-invoice/FAKE123` | 401 | auth-gated ✓ |
| `/api/cron/*` (6 routes) | 401 | all reject without `CRON_SECRET` Bearer / `x-vercel-cron` ✓ |

---

## 3. BUGS FOUND

### BUG-1 — `/api/dbd/[taxId]` is an orphan endpoint that always 502s (DBD upstream is WAF-blocked)

| Field | Detail |
|---|---|
| **Severity** | **P2** (cleanup / dead-code). NOT a launch blocker — no code path reaches this route, and it never 500s. |
| **Route / file** | `app/api/dbd/[taxId]/route.ts` |
| **Repro** | `GET /api/dbd/0105564077716` → `502 {"error":"fetch_failed","detail":"Unexpected token '<', \"<html><hea\"... is not valid JSON"}` |
| **Root cause** | The route calls DBD Open Data CKAN API `https://opendata.dbd.go.th/api/3/action/datastore_search`. That host sits behind an **Incapsula WAF** which returns **HTTP 200 with an HTML "Request Rejected" body** for programmatic calls. The route's guard is `if (!res.ok)` — but `res.ok` is `true` for a 200, so the guard passes. The next line `await res.json()` then throws on the HTML body (`Unexpected token '<'`). The `catch` returns `502 {error:"fetch_failed"}`. So the route degrades *gracefully* (502, no crash) but the DBD lookup it implements **can never succeed**. (Verified directly: a raw fetch to the DBD CKAN endpoint from a clean network returned `200` + `<html><head><title>Request Rejected</title>…`.) |
| **Impact** | **None on customers.** A repo-wide search (`app/`, `components/`, `actions/`, `lib/`) found **zero consumers** of `/api/dbd`. The customer juristic-registration auto-fill in `app/[locale]/(auth)/register/page.tsx` does **not** use this route — it calls the *different* `opendata.dbd.go.th/api/v1/*` endpoints directly from the browser, and **already handles the WAF/404 failure correctly** (falls into an `unavailable` state and shows an honest "ระบบค้นหาไม่พร้อม กรอกด้วยตนเอง" notice — see register/page.tsx lines 452-457, which document this exact situation). |
| **Recommended fix** | (Post-launch, P2.) Either (a) **delete `app/api/dbd/[taxId]/route.ts`** — it is dead code; or (b) if it is intended as the future server-side replacement for the client-side register lookup, fix the guard to detect the HTML body (`const ct = res.headers.get("content-type"); if (!ct?.includes("application/json")) return 502`) AND route the request through a WAF-tolerant path (server-side fetch with a browser-like header set still gets blocked — a proper proxy or the official DBD API key is needed). Track under the existing `pcs-scrub`/cleanup backlog. Do **not** wire any UI to it until DBD access is actually working. |

> **No other non-2xx/3xx was a defect.** Every `401`/`404`/`405` in the table is the intended response (auth gate, fake-id, wrong HTTP method). Every protected/admin `307 → /login` is the auth guard working. The DBD `502` above is the *single* anomaly, and it is contained.

---

## 4. Structural concerns (non-blocking)

### 4.1 `force-dynamic` on dynamic + cookie pages — COMPLIANT ✓
AGENTS.md §11 / `docs/learnings/nextjs-16-quirks.md` warn that a page under a dynamic segment that renders `<NavBar>` (reads auth cookies) must export `dynamic = "force-dynamic"` or it 500s with `DYNAMIC_SERVER_USAGE`. **Verified clean:** the highest-risk public dynamic route, `app/[locale]/(public)/customs-clearance-shipping-suvarnabhumi/[port]/page.tsx`, explicitly has `export const dynamic = "force-dynamic"` (with a comment citing the NavBar cookie read). The production `build` route table additionally marks **every** route as `ƒ (Dynamic)` (server-rendered on demand) — so there is no static-prerender-vs-dynamic-data mismatch anywhere, and `DYNAMIC_SERVER_USAGE` is not a live risk for this build. The smoke confirmed it: zero 500s across all dynamic routes.

### 4.2 `/status` page — slow first render (P2)
`app/[locale]/(public)/status/page.tsx` took **7.1s** on its first (uncached) hit. It has `export const revalidate = 60`, so subsequent renders serve from a 60s cache and are fast — but the *first* visitor after each cache expiry waits on a live Supabase `profiles` ping. The page is correctly try/catch-wrapped (renders even if Supabase is down). Mildly ironic for an "is the site up?" page; acceptable for launch. **P2 suggestion:** consider `revalidate` longer (e.g. 120-300s) or move the DB ping to a cron that writes a cached snapshot row, so no user request ever blocks on the ping.

### 4.3 `proxy.ts` middleware — sound
Middleware (`proxy.ts`, Next 16 rename of `middleware.ts`) runs i18n + visitor-cookie assignment + Supabase token refresh. `supabase.auth.getUser()` failure is silent by design. Matcher correctly excludes `/api`, `/_next`, static assets. No concerns.

### 4.4 12 declared-but-unused env vars (informational)
`pnpm audit:env` lists 12 vars declared in `.env.example` but not referenced in code: `CARGOTHAI_*` (3), `JMF_CARGO_*` (2), `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_LOGIN_CLIENT_ID`, `LINE_LOGIN_CLIENT_SECRET`, `PACRED_RCGROUP_API_URL`, `PACRED_TAMIT_API_URL`, `SENTRY_AUTH_TOKEN`. Most are intentionally-forward-declared (future carrier APIs, LINE login not yet built, Sentry source-map token). `PACRED_RCGROUP_API_URL` / `PACRED_TAMIT_API_URL` are explicitly marked DEAD in `.env.example`. No action needed for launch; these are tracked by the legacy-scrub plan.

### 4.5 Node engine mismatch (verify before deploy)
`package.json` declares `engines.node >=24.0.0`. The audit ran on Node v20.20.1 (build/test still pass). **Action:** confirm the Vercel project's Node version is set to 24.x so production runtime matches the declared engine — a silent Node-version drift can surface runtime-only differences not caught by a Node-20 build.

### 4.6 Sentry deprecation warnings (housekeeping)
Two `@sentry/nextjs` config options (`disableLogger`, `automaticVercelMonitors`) are deprecated and print on every build. They still work. Update the Sentry config to the `webpack.*` equivalents at the next convenient point (post-launch P2).

---

## 5. Launch-readiness verdict

| Question | Answer |
|---|---|
| Does it build? | ✅ Yes — `pnpm build` clean. |
| Does `pnpm verify` pass? | ✅ Yes — lint, tsc, test:unit, audit:all all green. |
| Any route 500s in production mode? | ✅ **No crash-class 500s.** 1 contained `502` on an unused orphan API route (BUG-1). |
| Public pages load? | ✅ All 200 (or intended 308/307/404). |
| Auth gates work? | ✅ Protected + admin tiers all 307 → /login un-authed; `requireAdmin` 404s non-admins. |
| Dynamic routes safe with bad ids? | ✅ All 404 or 307 — never 500. |
| `DYNAMIC_SERVER_USAGE` risk? | ✅ None — every route is `ƒ Dynamic`; high-risk pages carry explicit `force-dynamic`. |

### Verdict: 🟢 **GO for launch.**

No P0. The single `502` (BUG-1) is a self-contained, gracefully-handled failure on a dead-code route with **no UI consumer** — it cannot reach a customer. Recommended pre-deploy checks that are quick and worth doing: **(1)** confirm Vercel runtime = Node 24 (§4.5); **(2)** confirm all production env vars are real values, not `.env.example` `<placeholders>` (the `/status` page will surface any that are still placeholders). Everything else (BUG-1 cleanup, `/status` first-render, Sentry deprecations) is safe to defer to post-launch P2.

---

## Appendix — audit method notes

- **Smoke harness:** routes enumerated from the filesystem, hit via `fetch(..., {redirect:'manual'})` against `next start` on `localhost:3000`. Production server (`pnpm start`) used rather than `pnpm dev` because `next dev` always renders dynamically and would mask `DYNAMIC_SERVER_USAGE` and other prod-only failures (this is the exact failure mode AGENTS.md §11 calls out).
- **502 root-cause verification:** confirmed by an independent direct fetch to the DBD CKAN upstream, which returned `200` + an Incapsula "Request Rejected" HTML page — proving the route's `!res.ok` guard is bypassed and `res.json()` is what throws.
- **Consumer search:** a full-tree text search over `app/`, `components/`, `actions/`, `lib/` for `api/dbd` and `dbd` confirmed `/api/dbd/[taxId]` has zero callers and the register page uses a separate (also-broken-but-gracefully-handled) DBD v1 endpoint.
- **Not changed:** no application source file was modified. This report is the sole deliverable.
