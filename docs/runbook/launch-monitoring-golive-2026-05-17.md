# 🟢 Launch-Monitoring Go-Live Checklist — UPGRADE_PLAN U1-8

> **Date:** 2026-05-17 (T-1 before Mon launch) · **Audience:** เดฟ · ภูม
> **Scope:** flip-readiness for UPGRADE_PLAN item **U1-8 "launch-monitoring env live"**.
> **Verdict:** all 5 tools are **code-ready and wired**. Every integration **degrades gracefully** when its var is unset (no crash). Every env-var name in code **matches** [`.env.example`](../../.env.example) + [`docs/env.md`](../env.md) — **no mismatches found**. This is purely a Vercel-dashboard task: set the vars below, redeploy, run the verify steps.
>
> **Source-of-truth cross-links:** [`docs/env.md`](../env.md) §12–14, §17–18 (per-var detail) · [`docs/decisions/0007-analytics-and-ab-testing.md`](../decisions/0007-analytics-and-ab-testing.md) (ADR for GTM/Clarity).

---

## How to set a var in Vercel

Vercel Dashboard → project `pacred-web` → **Settings → Environment Variables** → **Add**. Set **Environment = Production** (also tick **Preview** for GTM/Clarity/Sentry if you want preview deploys instrumented). After adding all vars, **Deployments → ⋯ → Redeploy** the latest `main` build — env vars are only read at build/cold-start, not hot-swapped.

`NEXT_PUBLIC_`-prefixed vars are **inlined into the client bundle at build time** → a redeploy is mandatory for them to take effect.

---

## 1. Sentry — error tracking 🟡

| Vercel env var | Required? | Value source |
|---|---|---|
| `SENTRY_DSN` | recommended | sentry.io → Settings → Projects → `pacred-web` → **Client Keys (DSN)** → copy DSN |
| `NEXT_PUBLIC_SENTRY_DSN` | recommended | **same DSN value** as above (browser needs the `NEXT_PUBLIC_` copy) |
| `SENTRY_AUTH_TOKEN` | optional | sentry.io → Settings → **Auth Tokens** → org-level, `project:write` scope. Enables source-map upload → readable prod stack traces. Without it errors still arrive, stacks point at minified output |
| `SENTRY_ORG` / `SENTRY_PROJECT` | optional (needed only if `SENTRY_AUTH_TOKEN` set) | org slug `pacred` / project slug `pacred-web` |
| `SENTRY_ENV` / `NEXT_PUBLIC_SENTRY_ENV` | optional | `production` — overrides `NODE_ENV` for the env tag |

**Consuming code:**
- Server/Edge init: [`sentry.server.config.ts:10`](../../sentry.server.config.ts) + [`sentry.edge.config.ts:11`](../../sentry.edge.config.ts) — `Sentry.init` only runs `if (dsn)`.
- Client init: [`instrumentation-client.ts:14-16`](../../instrumentation-client.ts) — `Sentry.init` only runs `if (dsn)`.
- Register hook: [`instrumentation.ts:14-29`](../../instrumentation.ts) — `onRequestError` auto-captures Server Component / Route Handler / Server Action errors.
- Logger bridge: [`lib/logger.ts:97-113`](../../lib/logger.ts) — every `logger.error()` also calls `Sentry.captureException` (wrapped in `try/catch`).
- Build wrapper: [`next.config.ts:89-99`](../../next.config.ts) — `withSentryConfig`; `org`/`project` read from env, passthrough when unset.

**Graceful degradation: ✅ SAFE.** DSN unset → `Sentry.init` is skipped entirely; the SDK's capture calls become no-ops. `withSentryConfig` is a passthrough when `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` are absent (confirmed: `pnpm build` green with all Sentry vars unset). `logger.error` Sentry-forward is `try/catch`-wrapped so it never throws.

**Post-deploy verify:**
1. After redeploy, hit a route that throws — e.g. browse to a non-existent dynamic id, or temporarily add a `throw new Error("sentry-smoke")` in a server action (revert after).
2. Open sentry.io → project `pacred-web` → **Issues**. The error should appear **within ~1 min**.
3. Confirm the event's `environment` tag = `production` and `request.cookies` / `authorization` header are **absent** (the `beforeSend` PII strip in `sentry.server.config.ts:28-37`).
4. Note: events tunnel through `/api/monitoring` (ad-blocker bypass) — confirm that route returns 200, not 404.

---

## 2. Google Tag Manager — conversion tracking 🟡

| Vercel env var | Required? | Value source |
|---|---|---|
| `NEXT_PUBLIC_GTM_ID` | recommended for prod | tagmanager.google.com → container → copy ID `GTM-XXXXXXX` |

**Consuming code:**
- Loader: [`components/analytics/gtm-script.tsx:3,12-13`](../../components/analytics/gtm-script.tsx) — `GtmScript()` returns `null` when `GTM_ID` unset; `GtmNoscript()` (line 38-39) same.
- Injection: [`app/layout.tsx:95`](../../app/layout.tsx) (`<GtmScript />` in `<head>`) + [`app/layout.tsx:102`](../../app/layout.tsx) (`<GtmNoscript />` in `<body>`).
- Event helper: [`lib/analytics.ts:27,47-48`](../../lib/analytics.ts) — `track()` pushes to `window.dataLayer`; `console.log` in dev when unset.

**Graceful degradation: ✅ SAFE.** Unset → both script components render `null`, no GTM script tag emitted; `track()` is a console log (dev) / silent (prod). No throw path.

**Post-deploy verify:**
1. Install the **Tag Assistant** browser extension (or use GTM → Preview mode), then open `https://pacred.co`.
2. View page source → confirm the inline `gtm.js` loader is present and contains your `GTM-XXXXXXX`.
3. In GTM Preview, trigger a `sign_up` / `login` / `lead` action → confirm the `dataLayer` event fires in the Tag Assistant timeline.

---

## 3. Microsoft Clarity — heatmap & session replay 🟡

| Vercel env var | Required? | Value source |
|---|---|---|
| `NEXT_PUBLIC_CLARITY_ID` | recommended for landing pivot | clarity.microsoft.com → New Project → copy the **10-char project ID** |

**Consuming code:**
- Loader: [`components/analytics/clarity-script.tsx:3,17-19`](../../components/analytics/clarity-script.tsx) — `ClarityScript()` returns `null` when `CLARITY_ID` unset.
- Injection: [`app/layout.tsx:96`](../../app/layout.tsx) (`<ClarityScript />` in `<head>`).
- Tag helpers: [`lib/analytics.ts:134,144,154`](../../lib/analytics.ts) — `clarityTag()` / `clarityEvent()` / `clarityIdentify()` use optional-chaining `window.clarity?.(...)`, so they no-op when the tag never loaded.

**Graceful degradation: ✅ SAFE.** Unset → `ClarityScript` renders `null`; the `window.clarity?.()` optional chaining means helper calls silently no-op. No throw path.

**Post-deploy verify:**
1. After redeploy, open `https://pacred.co`, browse 2–3 pages, then close the tab.
2. Open clarity.microsoft.com → project dashboard. Recordings + heatmap data appear **within ~15 min** of first traffic (not instant — Clarity batches).
3. View page source → confirm the inline `clarity` loader with your 10-char ID is present.

---

## 4. hCaptcha — invisible bot protection 🟡

| Vercel env var | Required? | Value source |
|---|---|---|
| `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` | recommended | hcaptcha.com → Sites → New Site (**Type: invisible**) → copy **site key** (public) |
| `HCAPTCHA_SECRET_KEY` | recommended | hcaptcha.com → same site detail → copy **secret key** (server-only, different value) |

**Consuming code:**
- Server verify: [`lib/hcaptcha.ts:48,55-63`](../../lib/hcaptcha.ts) — `verifyHcaptcha()` reads `HCAPTCHA_SECRET_KEY`.
- Client widget: [`components/hcaptcha-invisible.tsx:58,80`](../../components/hcaptcha-invisible.tsx) — `HCaptchaInvisible` reads `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`; renders `null` + `execute()` resolves `null` when unset.
- Wired into: [`actions/auth.ts:130,199,393,478`](../../actions/auth.ts) (signup ×2, password reset ×2), [`actions/contact.ts:46`](../../actions/contact.ts) (contact form). Widget rendered in `register/page.tsx`, `forgot-password/page.tsx`, `components/contact-form.tsx`.

**Graceful degradation: ✅ SAFE — but note this one degrades OPEN by design.** Secret unset → `verifyHcaptcha` returns `{success:true}` (request allowed) and, in production only, emits a loud `logger.warn` ([`lib/hcaptcha.ts:56-62`](../../lib/hcaptcha.ts)). Signup stays protected by phone OTP + IP rate-limiting. This is an intentional 2026-05-16 decision (fail-closed was hard-blocking 100% of real signups while keys were unconfigured — see `docs/env.md` §12). No crash. **Action implication:** if these two vars are NOT set at launch, bot protection is silently degraded — set them to close the gap.

**Post-deploy verify:**
1. After redeploy, open `https://pacred.co/register` → DevTools Network tab.
2. Submit the signup form → confirm a request to `api.hcaptcha.com/siteverify` fires (invisible challenge — usually no visible popup for legit users).
3. If `HCAPTCHA_SECRET_KEY` is set, grep production logs for the string `HCAPTCHA_SECRET_KEY unset` — it should be **absent** (its presence means the secret didn't take).
4. Confirm CSP allows it: `next.config.ts` `script-src` + `frame-src` already include `hcaptcha.com` — no header change needed.

---

## 5. Upstash Redis — distributed rate-limit store 🟡

| Vercel env var | Required? | Value source |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | **recommended for prod** | console.upstash.com → create Redis DB → **REST API** tab → `https://<region>.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | **recommended for prod** | same REST API tab → REST token (read+write) |

(Exact names confirmed against code — [`lib/rate-limit.ts:69-70`](../../lib/rate-limit.ts) reads `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.)

**Consuming code:**
- Backend selection: [`lib/rate-limit.ts:68-78`](../../lib/rate-limit.ts) — builds a `Redis` client only if both vars present; `try/catch` around `new Redis(...)` falls back to memory on init failure.
- Limiter + fallback: [`lib/rate-limit.ts:145-170`](../../lib/rate-limit.ts) — `rateLimit()` uses Upstash when configured, else the in-memory `Map` ([`memoryCheck`](../../lib/rate-limit.ts), line 120); an Upstash runtime error also falls through to memory.
- Wired into: [`actions/auth.ts`](../../actions/auth.ts) (login/signup/passwordReset/otpVerify), [`actions/contact.ts:42`](../../actions/contact.ts), [`actions/security.ts:151`](../../actions/security.ts) — all via `checkRateLimit()`.

**Graceful degradation: ✅ SAFE.** Both vars unset → in-memory `Map` per server process (the `redis` const is `null`, no client built). **Caveat (operational, not a bug):** the memory fallback is **dev-only-appropriate** — on Vercel, multiple function instances each keep their own `Map`, so an attacker can multiply allowed volume across cold starts. Set the two vars before customer launch so the limiter is actually distributed. No crash either way.

**Post-deploy verify:**
1. After redeploy, hit a rate-limited endpoint past its budget — e.g. submit the contact form 6× from one IP (limit = 5/hour, [`RATE_LIMITS.contact`](../../lib/rate-limit.ts)).
2. The 6th submit should return the `rate_limit` error.
3. Open console.upstash.com → your DB → **Data Browser** → confirm keys prefixed `pacred:rl:contact` exist (proves Redis, not memory, is serving).
4. Repeat from a 2nd device/IP → confirm the count is shared (memory fallback would not share).

---

## ✅ Flip checklist (the ~5-minute task)

Set in Vercel → Settings → Environment Variables (Environment = **Production**):

- [ ] `SENTRY_DSN`
- [ ] `NEXT_PUBLIC_SENTRY_DSN` (same value)
- [ ] `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` *(optional — readable stack traces)*
- [ ] `NEXT_PUBLIC_GTM_ID`
- [ ] `NEXT_PUBLIC_CLARITY_ID`
- [ ] `NEXT_PUBLIC_HCAPTCHA_SITE_KEY`
- [ ] `HCAPTCHA_SECRET_KEY`
- [ ] `UPSTASH_REDIS_REST_URL`
- [ ] `UPSTASH_REDIS_REST_TOKEN`
- [ ] **Redeploy** latest `main` (mandatory — `NEXT_PUBLIC_` vars inline at build time)
- [ ] Run all 5 post-deploy verify blocks above

**Safety net:** every one of these vars is optional in code — setting a wrong value, or forgetting one, **disables only that one tool** and never crashes the app. The risk is silent inactivity, not an outage — which is exactly what the per-tool verify steps catch.
