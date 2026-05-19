# 🛰 R&D — DevOps · Observability · Monitoring · Reliability — 2026-05-19

> **Author:** Dr. DevOps (R&D agent · `frosty-bhaskara-a38ced` worktree)
> **Audience:** เดฟ (primary) · ก๊อต (sign-off on cost + Sentry plan)
> **Scope:** the SRE / DevOps lens — error tracking, performance monitoring, uptime, log aggregation, DB health, deploy automation, cron monitoring, alert routing, cost monitoring, SLO/SLI, backup / DR, the production smoke gate.
> **Status:** survey + gap analysis + staged recommendations. No code in this doc — it informs a build, it does not perform one.
>
> **Read with:**
> - [`docs/research/platform-observability-system-2026-05-18.md`](../platform-observability-system-2026-05-18.md) — the IO-1..IO-4 design this doc EXTENDS toward the SRE / infra plane (it covers application-level capture; this covers reliability + cost + DR).
> - [`docs/research/capability-tools-strategy-2026-05-18.md`](../capability-tools-strategy-2026-05-18.md) — the build-vs-buy verdict.
> - [`AGENTS.md`](../../../AGENTS.md) §11 — the production deploy gate hard rule.
> - [`docs/learnings/ci-and-deploy-gotchas.md`](../../learnings/ci-and-deploy-gotchas.md) — the seven launch-day surprises that shaped these gaps.
> - [`docs/runbook/launch-monitoring-golive-2026-05-17.md`](../../runbook/launch-monitoring-golive-2026-05-17.md) — the env-var flip runbook.

---

## 0. Executive summary (TL;DR)

1. **IO-1 shipped — the auto-incident capture rail is live in the repo.** Migration `0077_platform_incidents.sql`, the React error boundaries (`app/global-error.tsx` + `app/[locale]/error.tsx`), the ingest API (`/api/observability/incident`), the Sentry-webhook ingest (`/api/observability/sentry-webhook`), `withObservability()` wrapper, `/admin/incidents` triage queue, `/my-issues` customer view, `actions/admin/incidents.ts` — all on `dave`. **This is genuinely good.** The owner's "no submit button + show me the status" ask is delivered.
2. **But the rails it depends on are still env-gated off in production.** `SENTRY_DSN` · `NEXT_PUBLIC_SENTRY_DSN` · `SENTRY_WEBHOOK_SECRET` · `NEXT_PUBLIC_GTM_ID` · `NEXT_PUBLIC_CLARITY_ID` · `UPSTASH_REDIS_REST_URL/TOKEN` · `HCAPTCHA_*` — every one of them is documented in `.env.example`, code-wired, gracefully degrading, and **switched off in Vercel prod**. This is a ~15-minute dashboard task (the [`launch-monitoring-golive`](../../runbook/launch-monitoring-golive-2026-05-17.md) checklist) — and **the single highest-leverage observability action available right now.** Until it lands: Sentry's cross-browser crash data, GA4 conversion data, Clarity session-replay data, and the cross-instance rate limit are all dark.
3. **The biggest production-blind-spots still open:** **(a) no Web Vitals capture** at all (LCP/INP/CLS — directly load-bearing on Google Ads quality score → cost-per-click), **(b) no synthetic uptime probe** (the launch-day "smoke passed against a deleted Supabase" learning is unmitigated except by the manual `/status` page check), **(c) `withObservability()` wrapper exists but is wrapped around ZERO Server Actions today** (every action's thrown errors are still invisible to `platform_incidents` — only client errors + Sentry webhooks land), **(d) no alert-rule engine yet** (only the seed dev-notify on new high-severity incidents — IO-1.10), **(e) no cost monitor** for Vercel + Supabase usage, **(f) no Supabase PITR confirmation** in any runbook, **(g) no preview / staging environment separate from prod** — every dev push that lands on `main` lights up prod.
4. **The IO-2..IO-4 design plan (platform_events log, per-dept KPI rollups, audience-scoped RLS, status page hardening, alert-rule engine) is the right next-3-month staging.** Sequence it after the Tier-0 env flip + the immediate-wins listed in §3.
5. **Build-vs-buy in this domain holds the same shape as the rest of the capability-tools synthesis:** connect free rails Pacred cannot rebuild (Sentry · GA4 · Clarity · Better Stack Uptime free tier or self-hosted cron probe · Vercel-native log drains); build everything else in-house so the data stays inside Pacred's ecosystem. The one borderline call is **uptime monitoring** — Better Stack's free tier covers ~10 monitors, deserves to be turned on as a belt-and-braces backstop while the in-house Vercel-cron probe (IO-4) is built. Detail in §3 + §4.
6. **One surprise, called out at the top:** the launch-day learning ([`ci-and-deploy-gotchas.md` 2026-05-17 entry "next start + curl smoke does NOT detect a dead database"](../../learnings/ci-and-deploy-gotchas.md)) — the production smoke gate **passed against a deleted Supabase project**. The current `/status` page does the right probe (live DB query), but it is **public, cached 60 s, and not part of any automated gate**. A `/status` rendering green in production today proves nothing about whether a dev sub-agent next week is checking it. The gate needs to become an *active* check inside the deploy pipeline, not a passive page humans visit. Detail in §3.B + §4.

---

## 1. Current state — what Pacred has, file-by-file

This section is the survey. Every claim cites a path. Read like a checkpoint inventory before §2's gap analysis.

### 1.1 The five external capture rails (env-gated, three off, two off-prod)

The state below mirrors [`platform-observability-system-2026-05-18.md`](../platform-observability-system-2026-05-18.md) §2.1 and was re-verified on `dave` at the time of writing.

| Rail | Capability | Code-wired? | Env-set in prod? | Gracefully degrades? | Evidence |
|---|---|---|---|---|---|
| **Sentry** | cross-browser crash capture + server error capture + performance traces | ✅ `@sentry/nextjs@^10.53.1`; `instrumentation.ts` → `sentry.server.config.ts` + `sentry.edge.config.ts`; `instrumentation-client.ts`; `next.config.ts` `withSentryConfig` | ❌ `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` empty in `.env.example` (lines 223-224) | ✅ `init` is `if (dsn)` — no-op when unset | `instrumentation.ts:14-21` · `lib/logger.ts:97` (forwards `logger.error` → `Sentry.captureException`) |
| **Sentry webhook** | enrich Pacred `platform_incidents` with Sentry's superior cross-browser grouping | ✅ `app/api/observability/sentry-webhook/route.ts` with HMAC-SHA256 signature verification | ❌ `SENTRY_WEBHOOK_SECRET` empty (`.env.example:236`) | ✅ returns 503 when unset (so Sentry retries once set), 401 on bad signature | `route.ts:79-95` |
| **GTM → GA4** | public-web analytics, conversion funnel (sign_up, login, generate_lead, place_order, wallet_deposit, …) | ✅ `components/analytics/gtm-script.tsx`; `lib/analytics.ts` with 9 typed GA4 event helpers; mounted in `app/layout.tsx` | ❌ `NEXT_PUBLIC_GTM_ID` empty (`.env.example:207`) | ✅ `GtmScript` returns `null`; `track()` early-returns | ADR-0007 |
| **Microsoft Clarity** | session replay + heatmaps | ✅ `components/analytics/clarity-script.tsx`; `clarityTag`/`clarityEvent`/`clarityIdentify` in `lib/analytics.ts`; mounted in `app/layout.tsx` | ❌ `NEXT_PUBLIC_CLARITY_ID` empty (`.env.example:215`) | ✅ tag returns `null`; helpers use `window.clarity?.()` optional chaining | ADR-0007 |
| **Upstash Redis** | cross-instance rate limit (replaces the per-process in-memory `Map`) | ✅ `lib/rate-limit.ts:68-78` builds an Upstash client when both vars are set; called from `actions/auth.ts`, `actions/contact.ts`, `actions/security.ts`, `/api/observability/incident/route.ts` | ❌ `UPSTASH_REDIS_REST_URL` + `_TOKEN` empty (`.env.example:187-188`) | ✅ memory `Map` fallback — operational caveat: per-Vercel-instance, an attacker can multiply allowed volume across cold starts | `launch-monitoring-golive-2026-05-17.md` §5 |

**Direct implication:** the IO-1 incident-capture system that *did* ship will store every browser render error that hits its `error.tsx` boundaries (good), but the cross-browser fleet of crashes that don't fire a render error (uncaught promise rejections in onClick handlers, async errors, etc.) is captured by **Sentry** — which is dark. Same for any server error that doesn't propagate up to Next's `onRequestError` (logger.error calls in catch blocks that "handle" the error). Until the DSN is set, the rate-limit on `/api/observability/incident` runs off the in-memory `Map` — every Vercel instance has its own quota, so a hostile client can flood the table cross-instance until Upstash is on.

### 1.2 IO-1 shipped — the in-house capture + triage system

This is the meaningful net-new SHIPPED work, on `dave`, and the part of observability Pacred genuinely owns end-to-end today.

| Artefact | Path | What it does |
|---|---|---|
| Schema | `supabase/migrations/0077_platform_incidents.sql` | the `platform_incidents` table — fingerprint dedup, lifecycle `open→acknowledged→in_progress→resolved/ignored`, 5 indexes, two RLS policies (admin SELECT broad / customer SELECT narrowed to `actor_ref = redactId(uid)`); `notifications.category` extended with `observability`; `notifications.reference_type` extended with `platform_incident`; `work_items.entity_type` extended with `platform_incident` |
| Validators | `lib/validators/platform-incident.ts` | typed enums (`IncidentSource` · `IncidentKind` · `IncidentSeverity` · `IncidentStatus`), the lifecycle transition whitelist, Thai labels + badge classes, the ingest Zod schema |
| Fingerprinter | `lib/observability/fingerprint.ts` | `normaliseMessage` (strips UUIDs / hex / ISO timestamps / numbers / quoted literals) · `normaliseRoute` (strips dynamic segments) · `computeFingerprint` (sha256, hex, truncated to 32 chars) |
| Capture core | `lib/observability/incident-store.ts` | `captureIncident()` — fingerprint + dedup-upsert with a race backstop on the unique violation (23505); `classifySeverity()` rule (money-path routes → `high`); `fireSeedAlert()` — IO-1.10 dev-notification on new `high`/`critical` via `sendNotification` |
| Client reporter | `lib/observability/client-report.ts` | browser-side `fetch` POST with `keepalive: true`, swallows errors |
| Action wrapper | `lib/observability/with-observability.ts` | `withObservability(name, fn)` — try/catch around an action body, `captureIncident` then re-throw |
| Root error boundary | `app/global-error.tsx` | renders its own `<html>/<body>` (Next 16 requires), auto-`POST`s on mount, mobile-first branded fallback, inline TH/EN bilingual copy (next-intl unreachable at this level) |
| Locale error boundary | `app/[locale]/error.tsx` | the common case — sits inside the locale segment so next-intl is mounted, uses the `error` message namespace |
| Ingest route | `app/api/observability/incident/route.ts` | POST sink — rate-limited per IP (`generic` bucket, 30/min), Zod-validates, resolves `actor_role` + `actor_ref` from session (defaults to `anon`), calls `captureIncident` — never throws, always 2xx-ish |
| Sentry webhook | `app/api/observability/sentry-webhook/route.ts` | HMAC-SHA256 verification of `Sentry-Hook-Signature`, maps Sentry levels → Pacred severities, deduped via the same `captureIncident` |
| Triage UI | `app/[locale]/(admin)/admin/incidents/page.tsx` + `incident-triage-panel.tsx` | filterable queue (source/kind/severity/status/date), incident-detail expand, triage buttons; READ is broad (every office + operational role), WRITE is super+ops only |
| Admin actions | `actions/admin/incidents.ts` | `acknowledgeIncident` · `markIncidentInProgress` · `resolveIncident` · `ignoreIncident` · `assignIncident` · `spawnFixWorkItem`; each validates the transition + uses the `.eq("status", expectedFrom)` race-guard; all log to `admin_audit_log` |
| Customer view | `app/[locale]/(protected)/my-issues/page.tsx` + `components/observability/my-incidents-panel.tsx` | the "ปัญหาที่ฉันแจ้ง" page — a user reads only their own incidents via the customer RLS (`actor_ref` self-match) |

→ The IO-1 system is genuinely shipped end-to-end. **It is also Pacred's first observability surface that survives a Sentry outage / a Sentry billing lapse / a Sentry account deletion** — the rows are in Pacred's own Postgres. This is a real strategic asset.

### 1.3 `admin_audit_log` — the admin-action trail

| Fact | Evidence |
|---|---|
| Table | `0015_admin_rbac.sql` |
| Writer | every admin Server Action → `logAdminAction` in `lib/auth/require-admin.ts` |
| Search UI | `app/[locale]/(admin)/admin/audit/page.tsx` |
| CSV export | `app/api/admin/audit/export/route.tsx` (≤10 k rows) |
| RLS | every admin reads (`is_admin()`) — read-only via PostgREST, writes via service-role |

→ Covers **deliberate admin actions** only. It does not capture errors, customer events, partner activity, or page-views — the IO-1 incident table + the IO-2 `platform_events` table (designed, not built) cover those.

### 1.4 `cron_invocations` + `/admin/system/crons` (U4-1 — shipped)

The cron-health panel — the most mature single-domain observability surface Pacred has, and the pattern IO-4 generalises.

| Fact | Evidence |
|---|---|
| Table | `cron_invocations` (migration `0070_supervisory_layer.sql`) — `cron_path, fired_at, finished_at, duration_ms, status (success/failure/partial), result_summary jsonb, error_message` |
| Registry | `lib/cron/registry.ts::CRON_REGISTRY` — 7 entries (auto-cancel-orders / sales-daily-digest / refresh-active-customers / expire-probation / expire-driver-assignments / sms-balance-check / send-scheduled-broadcasts) |
| Instrument | `lib/cron/instrument.ts::instrumentCron` — wraps every `/api/cron/*` handler, centralises auth (x-vercel-cron header or Bearer `CRON_SECRET`), measures duration, persists best-effort, **logs to the structured `logger`** on unhandled exception |
| Vercel cron config | `vercel.json` — 7 crons; schedules match the registry |
| Panel | `app/[locale]/(admin)/admin/system/crons/page.tsx` + `trigger-button.tsx` — last fire / 7-day success rate / last error / duration; orphan-cron detection |
| RLS | `cron_invocations` SELECT = super + ops |
| Manual trigger | `buildCronTriggerRequest()` helper for the panel "Trigger now" button |

→ This is **the working precedent for IO-4** at single-domain scale. Append-only log + status enum + a 7-day rollup UI + orphan detection. IO-4 generalises this pattern to uptime probes, health checks, alert rules.

### 1.5 `/status` — the public status page

`app/[locale]/(public)/status/page.tsx` — closed U1-1 from PORT_PLAN Part U.

| Fact | Evidence |
|---|---|
| Cache | `revalidate = 60` — DB ping runs at most once per minute regardless of traffic |
| Checks | `checkSupabase` (real query against `profiles` — measures ms) + 11 `checkConfig` env-var presence probes (Sentry, GTM, Clarity, hCaptcha, Upstash, MOMO_JMF, ThaiBulkSMS, PromptPay, Resend, LIFF, LINE) |
| Severity rollup | `down > degraded > ok > not_configured` |
| Public | no auth, mobile-first, customer-facing copy (TH primary + EN follow-up) |

→ **This is the right shape.** A customer-visible health snapshot that answers "is it me or them" honestly. **The gap is not the page — it is that no automated gate consumes it.** No CI step curls `/status` and asserts `overall=ok`; no alert fires when it goes red; no Better-Stack-style external probe pulls it. It is a passive page, not an active gate. §3.B / §4 close this.

### 1.6 The structured logger (`lib/logger.ts`)

| Fact | Evidence |
|---|---|
| Single entry point | `logger.{debug,info,warn,error}(scope, msg, ctx?)` — PII redaction via `redactPhone` / `redactEmail` / `redactId` |
| Dev | pretty console with scope tag |
| Prod | single-line JSON to stdout — Vercel ingests structured; Vercel's logs viewer can query by `scope`, `level`, `msg` |
| Sentry bridge | `logger.error` calls also call `Sentry.captureException` (no-op when DSN unset, wrapped in try/catch) |
| Server-only | `import "server-only"` at top |

→ **This is in good shape.** The structured JSON in prod means anybody querying Vercel logs gets a deterministic shape (`{ts, level, scope, msg, err, ctx}`). The PII-redact helpers (`redactPhone(phone)`, `redactEmail(email)`, `redactId(uuid)`) are used everywhere in the app, including `incident-store.ts`. The one missing piece is a **log drain** to a queryable store (Vercel logs ship to BetterStack/Logtail/Datadog when a drain is configured) — see §2.

### 1.7 The `audit-kpi-dashboard` skill + `/admin/kpi`

| Fact | Evidence |
|---|---|
| Page | `app/[locale]/(admin)/admin/kpi/page.tsx` — 8 parallel `Promise.all` queries live per visit |
| RBAC | `requireAdmin(["ops","accounting","sales_admin"])` — office roles only |
| Skill | `.claude/skills/audit-kpi-dashboard/SKILL.md` — the codified "name → classify → source → query → render" pattern |

→ One executive dashboard, one audience (office staff), live-recomputed each visit. The IO-2..IO-3 work moves to materialised views + per-department + audience-scoped surfaces. IO-2 deliberately re-points `/admin/kpi` at the rollup views so it stays fast.

### 1.8 CI (`.github/workflows/ci.yml`)

| Step | What it does |
|---|---|
| Checkout / pnpm / Node setup | `pnpm/action-setup@v4` (no `version` — reads from `packageManager` in `package.json`) |
| `pnpm install --frozen-lockfile` | lockfile-enforced install |
| `pnpm lint` | ESLint 9, flat config |
| `pnpm exec tsc --noEmit` | typecheck |
| `pnpm test:unit` | the env-independent unit suite |
| `pnpm audit:all` | `audit:md` (markdown link check) + `audit:env` (every `process.env.X` in code → must be in `.env.example`) + `audit:i18n` (TH+EN parity) |
| `pnpm build` | next build — catches build-only regressions; runs without `.env.local`, NEXT_PUBLIC vars fall back to placeholders |

**Triggers:** `pull_request` (main, dave) + `push` (main, dave). Concurrency cancels in-flight on a new push to the same ref.

**Gap:** the CI does NOT run the AGENTS.md §11 production smoke gate (`pnpm build && pnpm start` + curl every new route, plus the [`qa-flow-simulator`](../../../.claude/skills/qa-flow-simulator/SKILL.md) functional pass). That stays a manual pre-deploy step today — and the launch-day deleted-Supabase story is the receipt for the cost of "manual only". §3.B + §4 propose the CI extension.

### 1.9 The seven launch-day learnings shaping this report

From [`docs/learnings/ci-and-deploy-gotchas.md`](../../learnings/ci-and-deploy-gotchas.md), in order — every one is a real incident already paid for:

1. **`ERR_PNPM_BAD_PM_VERSION`** — already fixed (`fa9dc5f`); `pnpm/action-setup@v4` reads from `packageManager`.
2. **Vercel deploy lag vs push** — every "I pushed and it didn't update" must check the Vercel dashboard first.
3. **`git add` with literal brackets** — Next.js `[locale]` paths need `:(literal)` pathspec magic.
4. **CRLF/LF warnings on Windows** — informational; ignore.
5. **`pnpm audit` is reserved** — custom umbrella is `audit:all`.
6. **`pnpm audit:all` fails on undocumented `process.env.X`** — every var name in code must appear in `.env.example`.
7. **IPv6 → Supabase fetch timeouts on local Windows dev** — fixed by `node --dns-result-order=ipv4first` in the `dev` script.
8. **`pnpm verify` + `pnpm build` green ≠ production works** — needs `next start` + curl smoke (AGENTS.md §11).
9. **Worktree smoke needs `.env.local` + REBUILD** — `NEXT_PUBLIC_*` is build-time.
10. **Stale-worktree phantoms** — survey from a stale worktree mistakes `dave`-already-fixed for "still broken."
11. **Worktree-isolation sub-agents start at `origin/main`** — spawn prompts must instruct resync to `dave`.
12. **`next start` + curl smoke does NOT detect a dead database** — the 2026-05-17 launch-day blunder; a separate functional gate is required.

Items 8 + 12 are the load-bearing DevOps findings — both unmitigated except by manual discipline today, both are §3.B / §4 targets.

---

## 2. Gaps — the SRE / DevOps holes between "shipped" and "good"

The IO-1..IO-4 design doc names the **application-observability** gaps in detail. This section names the **infrastructure / SRE / deploy / cost / DR** gaps the design doc deliberately did not cover.

### 2.A The dark-rails gap (highest leverage; cheapest to close)

| Rail | Currently | Closes when |
|---|---|---|
| Sentry production | dark | `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` set in Vercel; `SENTRY_AUTH_TOKEN` + `_ORG` + `_PROJECT` set for source-map upload (≈readable stack traces) |
| Sentry webhook | dark | `SENTRY_WEBHOOK_SECRET` set + the Sentry integration "Issue alert webhook" pointed at `/api/observability/sentry-webhook` |
| GTM / GA4 | dark | `NEXT_PUBLIC_GTM_ID` set + GTM container published with GA4 measurement ID |
| Clarity | dark | `NEXT_PUBLIC_CLARITY_ID` set |
| Upstash | memory-fallback in prod | `UPSTASH_REDIS_REST_URL` + `_TOKEN` set |
| hCaptcha | degraded-open in prod | `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` + `HCAPTCHA_SECRET_KEY` set |

→ **All six are unblocked by the [`launch-monitoring-golive`](../../runbook/launch-monitoring-golive-2026-05-17.md) checklist** — a Vercel dashboard task of ~15-30 min, including the redeploy NEXT_PUBLIC_ vars require to inline. **Until this is done, every other Stage-2+ observability investment compounds against a darker baseline.** This is the lowest-hanging fruit in the entire SRE backlog.

### 2.B The production deploy gate is two steps short of safe

AGENTS.md §11 names two checks; one is shipped, one is documented-but-manual, one is missing.

| Check | Necessary? | Sufficient? | Today |
|---|---|---|---|
| `pnpm verify` (lint + tsc + unit + audit:all) | yes | no | ✅ runs in CI on every push to dave/main |
| `pnpm build` | yes | no | ✅ runs in CI |
| **`pnpm build && pnpm start` + curl every NEW/CHANGED route → 200/3xx (no 500)** | yes | NO (proves render+routing, NOT DB) | ❌ documented in AGENTS.md, executed by manual discipline only |
| **Functional gate — `qa-flow-simulator` (real DB row / balance delta) OR direct DB probe (`curl https://<ref>.supabase.co/auth/v1/health`)** | yes | yes | ❌ documented in AGENTS.md + qa-flow-simulator skill, executed by manual discipline only |

→ **The launch-day deleted-Supabase story (learning #12) is the proof** that `pnpm verify + build` green is insufficient. The route smoke is necessary but missed the dead DB because public pages degrade to 200 + protected pages 307-redirect before any DB query. **Both manual gates need to become automated** — see §3.B for the staging recommendation (a `pnpm verify:deploy` umbrella + a CI prod-smoke job + a functional check using the `/status` page's DB ping as the synthetic probe).

### 2.C No Web Vitals (LCP / INP / CLS) capture anywhere

```
$ grep -rln "web-vitals\|onCLS\|onINP\|onLCP\|reportWebVitals" app lib
(no results)
```

Pacred's customer-facing surfaces are **paying for Google Ads** ([`growth-acquisition-strategy-2026-05-18.md`](../growth-acquisition-strategy-2026-05-18.md)). Google's quality score reads page experience — and page experience reads Core Web Vitals (LCP < 2.5 s, INP < 200 ms, CLS < 0.1 are the "Good" thresholds). **Today nothing measures these in production.** Implications:

- **Cost lever, not a vanity metric.** A 1-point quality-score drop on a competitive Google Ads keyword is in the order of 20-50% higher CPC. The economic case for measuring this is direct.
- **No RUM data.** No per-page LCP histogram, no per-device-class regression alerting, no Chromium User Experience Report (CrUX) cross-check.
- **Sentry's `tracesSampleRate: 0.1` does NOT capture vitals.** Sentry performance traces capture span timing — not the W3C web-vitals event signals.

→ This is the single biggest application-level blind spot after the dark rails. It is also **cheap to close**: `web-vitals` npm package + a `lib/observability/vitals.ts` + a `<WebVitalsReporter />` client component mounted in `app/layout.tsx` that pushes each vital to either GA4 (via the existing `track()`) or a new `platform_events` row, or both. §3.C names this as IO-2.5 (an addition to the IO-2 phase).

### 2.D `withObservability()` is wrapped around ZERO Server Actions

```
$ grep -rln "withObservability\|with-observability" actions
(no results)
```

The wrapper is shipped — but nothing uses it. Today every Server Action's *thrown* error (a null-deref, a DB driver error, a programming bug) is:

- captured by Sentry (when on) via `instrumentation.ts::onRequestError`
- bridged to Sentry via `logger.error` if the action's catch block calls it
- **NOT** captured into `platform_incidents` unless the action explicitly threw past Next's runtime — which `actions/admin/common.ts::withAdmin`'s `try/catch` swallows into `{ ok: false, error }` by convention

→ The IO-1 design doc §6.3 explicitly calls out: "this captures THROWN errors only ... handled-and-reported failures are intentionally NOT captured." Correct as designed. **The gap is operator-side: there is no convention in the repo that says "when you write a Server Action, wrap it in `withObservability`."** Today no action does, so the Pacred-owned incident table gets only the client-side error boundary + the Sentry-webhook side. §3.D proposes the convention + a phased adoption.

### 2.E No synthetic uptime probe

Vercel's own deployment health is monitored by Vercel itself, but Pacred has **no third-party probe** (no Better Stack, no Pingdom, no UptimeRobot) and **no in-house uptime cron**. The IO-4 design doc §9.1 names this as the cure: a Vercel-cron health probe hitting `/api/health` + `https://<ref>.supabase.co/auth/v1/health` every few minutes, persisting to `cron_invocations` (and from there → SLA rollup views).

The current `/status` page is the manual surface; the IO-4 cron is its automatic complement. Note three things:

1. The page is **cached 60 s** — if the DB dies between minute 1:00 and minute 1:59 the page lies green for up to a minute. Acceptable for a customer-facing UI, **not** acceptable as a monitoring signal.
2. The page does not write its result anywhere — every render is throwaway. Without persistence, you cannot answer "what was our uptime last week."
3. Synthetic probing from inside Vercel measures Vercel-internal latency, not what a Bangkok customer's browser sees. A genuinely-external probe (Better Stack free tier from US/EU/SG datacentres) is the belt-and-braces.

§3.E proposes both: a Vercel-cron internal probe (in-house, ships data to `platform_events` for the SLA rollup) + a Better Stack free-tier external probe (5 monitors free, off-platform — survives "the whole Vercel project is broken").

### 2.F No alert-rule engine yet

`fireSeedAlert()` in `incident-store.ts` is the *only* automated alert in the entire platform observability system — it notifies super-role admins on a new `high`/`critical` `platform_incidents` row. Beyond that:

- no "same fingerprint spiked > N times in M minutes → war-room"
- no "uptime probe failed twice running → page on-call"
- no "funnel drop > X% trailing hour → notify เดฟ"
- no "MOMO sync errors stacking → notify ops"
- no "Supabase free-tier connection count > Y% → page ก๊อต"
- no cooldown / dedup on the seed alert (a 5-fingerprint burst will produce 5 LINE pushes)

§3.F proposes the IO-4 alert-rule engine (an `alert_rules` table + a Vercel cron evaluator + `sendNotification` delivery + per-rule cooldown).

### 2.G No cost monitor for Vercel / Supabase

Pacred runs on Vercel Pro + Supabase Pro (assumption — confirm with ก๊อต/เดฟ). Both have **usage-based billing components** that can surprise:

- Vercel — function invocations, edge middleware invocations, image optimisations, bandwidth, build minutes
- Supabase — DB egress, storage egress, Auth MAU, real-time concurrent connections, edge function invocations

**Today no Pacred surface shows these numbers.** No cron pulls Vercel/Supabase billing APIs into `platform_events`; no alert fires when monthly burn projects past a budget; no admin sees "we did $X this month, projected $Y."

For a post-launch startup paying for ads, "Vercel + Supabase + ad spend" are the three monthly bills and **only one is currently measurable inside the platform** (ad spend, via the GA4 CAC/CPC rollup that IO-3 designs). The other two are dark. §3.G proposes a `cost_snapshots` table + a daily cron + a `/admin/observability/cost` panel — and notes that **both Vercel and Supabase publish billing APIs** so this is real work, not a guess.

### 2.H Backup / DR — Supabase PITR is unconfirmed in any runbook

A grep of `docs/runbook/`:

```
$ grep -rln "PITR\|Point.in.time\|backup" docs/runbook/
(no results except generic backup references)
```

**Supabase Cloud's PITR (Point-In-Time Recovery)** is a paid add-on (~$100/mo at the team tier) that lets you restore the database to any second within the last 7-28 days. Without it, you have **daily snapshots only** (24-hour data loss window in a disaster). For a platform that takes money and stores customer documents (`member-docs` private bucket — `0001`), this is a non-trivial RPO decision that is currently undocumented.

The same is true for storage backups (member-docs · receipts · PDF assets). A Supabase Storage bucket loss is currently un-redundant (the same project that holds the DB).

§3.H proposes: confirm PITR status with Supabase support; if off, decide. Document RPO/RTO targets in a new `docs/runbook/disaster-recovery.md`. Add a quarterly drill (restore-to-staging-and-verify) to the cron registry.

### 2.I No preview / staging environment separate from prod

Today: every push to `main` → Vercel prod deploys. Every push to `dave` → no automatic deploy (`dave` is the integration branch, deployed-to-main on a manual cadence). There is **no `staging.pacred.co.th`** that mirrors prod, points at a non-prod Supabase, and lets the team test a fix against real-shape data before flipping.

Why this matters specifically for Pacred:

- The `dave→main` deploy is gated on ภูม applying migrations `0058`-`0080` to **prod Supabase**. There is no rehearsal of that migration application against a staging copy first. If `0080`'s polymorphic-FK validation triggers an unexpected interaction with existing data on prod, the team finds out on prod.
- The launch-day "deleted Supabase" learning was caught only by a manual `qa-flow-simulator` run after deploy. A staging env would have made that gate routine instead of manual.

→ §3.I proposes Vercel Preview Deployments (free on Pro plan) wired to a Supabase Branching project (also free for ~2 branches) for `dave` — every push to `dave` gets a unique preview URL pointing at a shallow-clone Supabase. This is a configuration task, not new code.

### 2.J No log drain — Vercel logs are not exported anywhere

Vercel ingests `process.stdout` JSON lines (`lib/logger.ts` is shaped for this). The logs viewer lets you read them — but **only for ~24 hours** on the Pro plan, with no query-by-context, no alerts on patterns.

**Vercel supports log drains** out-of-the-box: stream prod logs to Better Stack / Logtail / Datadog / S3 / a custom HTTP endpoint. Today no drain is configured. The structured-JSON log is plumbing waiting for a sink.

§3.J proposes a Better Stack Logs free-tier drain (3 GB/mo, retention 3 days) as the immediate win + an in-house `platform_events`-via-drain route as the long-term replacement (HTTP webhook → `platform_events` insert).

### 2.K The `OTP_BYPASS` / `LINE_PUSH_BYPASS` / smoke / debug flags have no central visibility

`docs/env.md` documents that `OTP_BYPASS=true` short-circuits ThaiBulkSMS in dev. The same is true for `LINE_PUSH_BYPASS` in `lib/notifications/index.ts`. There's **no panel that shows "in prod, these flags are: …"** — so the team can't quickly answer "did we accidentally ship with OTP_BYPASS on?"

Yes, the `/status` page lists env vars and their not-configured/configured state — but it does not differentiate "set to a value" from "set to true." A small extension to `/admin/status` (the IO-4 internal version) showing the resolved boolean of each toggle would close this.

### 2.L No SLO / SLI definitions on paper anywhere

Pacred has no documented:

- target uptime % (99.9? 99.5?)
- target Web Vitals (LCP p75 < 2.5 s? INP p75 < 200 ms?)
- target Web Vitals breach rate ("if INP p75 > 250 ms for > 1 h → alert")
- target deploy frequency / lead time / change-failure rate / mean-time-to-restore

→ This is the smallest gap by code, the biggest by leverage: **defining SLOs makes every other observability investment legible.** "Sentry is on" is hard to argue with; "Sentry is on and we will alert when our 5xx rate exceeds 0.5% for > 10 minutes" is operable. §3.L proposes a `docs/runbook/slo-sli-targets.md` aligned with IO-4's alert rules.

### 2.M The seven launch-day learnings are not codified as CI/lint checks

Two of the seven are real code-level traps that a `pnpm audit:` extension could catch:

- Learning 3 — `git add ':(literal)…'` for bracket paths: nothing prevents an agent from running `git add app/[locale]/...` and getting confused. A `pnpm audit:gitadd` could check the most recent staged-paths and warn.
- Learning 7 — IPv6 timeouts: the `node --dns-result-order=ipv4first` wrapper in `package.json` is in place; a `pnpm audit:dev-script` could assert it stays.

Smaller wins, but they convert tribal-knowledge into machine-checked. §3.M flags them as a stretch task for the audit umbrella.

---

## 3. Recommendations — stage them

The recommendations below are **sequenced by leverage-per-day-of-effort** — Tier 0 is do-now (hours-to-days), Tier 1 is do-next-sprint (~1-2 weeks each), Tier 2 is the longer-tail post-Phase-1 work that compounds. Every recommendation cites its gap (§2.X) and its dependency.

### Tier 0 — this week (hours, mostly dashboard clicks)

#### 3.A · The env-var flip (§2.A — closes the dark-rails gap)

Already specified in [`docs/runbook/launch-monitoring-golive-2026-05-17.md`](../../runbook/launch-monitoring-golive-2026-05-17.md). Set in Vercel → Settings → Environment Variables (Environment = Production):

1. `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` (same value) + optionally `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` for readable stack traces · **`SENTRY_WEBHOOK_SECRET`** + configure the Sentry "Issue alert webhook" pointed at `https://pacred.co.th/api/observability/sentry-webhook` · turn on `replaysOnErrorSampleRate` to ~0.1 (10% of error sessions get a replay — high triage value)
2. `NEXT_PUBLIC_GTM_ID` (after publishing the GTM container with the GA4 measurement ID inside it)
3. `NEXT_PUBLIC_CLARITY_ID`
4. `UPSTASH_REDIS_REST_URL` + `_TOKEN`
5. `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` + `HCAPTCHA_SECRET_KEY`

**Redeploy** to force `NEXT_PUBLIC_*` to re-inline. Run the per-tool verify blocks from the runbook. **Effort:** ~30 min. **Owner:** ก๊อต/เดฟ. **Unblocks:** every other observability investment compounds against a brighter baseline + IO-1's Sentry-webhook ingest activates + the in-prod rate limit becomes cross-instance.

#### 3.B · Make the smoke gate active (§2.B — closes the dead-DB blind spot)

Two-part fix. Goal: the dead-Supabase launch-day story can never repeat.

**B-1.** Add a `pnpm verify:deploy` umbrella script:
- runs `pnpm verify` + `pnpm build`
- spins up `pnpm start` in the background
- `curl` a small list of representative routes — root `/`, `/services`, `/login`, `/wallet` (protected, expect 307), `/admin/incidents` (admin, expect 307) — assert status codes
- **calls the `/status` page itself + parses the response — fails if `overall != ok` (or `degraded` if we accept that)**
- The `/status` page already does the `checkSupabase` query. Curling it asserts the DB is live. That closes learning #12 by *reusing* the page Pacred already built.

**B-2.** Add a CI job — `prod-smoke` — that runs `verify:deploy` against `dave` builds. It cannot run against `main` builds without prod env (NEXT_PUBLIC needs the prod values to inline correctly to match what Vercel will serve), so the realistic gate is: every push to `dave` runs the `dave`-flavoured smoke, and pushing `dave→main` requires a green run on the `dave` HEAD.

**Effort:** ~half a day (script + workflow file). **Owner:** เดฟ. **Reuses:** `/status` page, `pnpm verify`. **Dependency:** none (3.A unrelated).

#### 3.C · Web Vitals capture (§2.C — closes the page-experience-→-ad-cost blind spot)

Add `web-vitals` npm package + a thin client component:

- `lib/observability/vitals.ts` — server-side `recordVital()` that writes a `platform_events` row (kind=`page_vitals`, meta={name, value, route, browser, device}). Until IO-2 ships `platform_events`, write to a temporary `web_vitals` table or push directly into GA4 via the existing `track()`. Recommended: do both in parallel — GA4 immediately (free, no migration), then point at `platform_events` once IO-2 lands.
- `components/observability/web-vitals-reporter.tsx` — `"use client"`, subscribes via `useReportWebVitals` (Next 16 has a built-in helper) or `web-vitals` `onCLS/onINP/onLCP/onFCP/onTTFB`, debounces, calls `recordVital()`.
- Mount once in `app/layout.tsx`.

**Effort:** 1 day. **Owner:** เดฟ or ปอน. **Dependency:** GA4 active (3.A.2). **Unblocks:** real LCP/INP/CLS data for the IO-3 marketing-conquest dashboard; a basis for an LCP-regression alert in IO-4.

#### 3.D · Adopt `withObservability` for the high-value Server Actions (§2.D)

Don't boil the ocean — wrap the **revenue-path actions first**, then expand:

- Phase 1 (this week): wrap `actions/wallet.ts` mutations · `actions/payment.ts` · `actions/service-order.ts::placeOrder` · `actions/credit.ts` mutations · the admin `actions/admin/wallet.ts` / `disbursement` / `incident triage` actions. ~30 actions.
- Phase 2 (Tier 1): wrap every other Server Action via a lint rule that requires `withObservability(name, …)` for `"use server"` files matching `actions/**/*.ts`.

Pattern (the wrapper is shipped — adoption is a code-change PR):

```ts
// before
export async function depositWallet(input) { ... }

// after
export const depositWallet = withObservability("depositWallet", async (input) => { ... });
```

**Effort:** 1 day for Phase 1 (~30 wraps + a verification pass). **Owner:** เดฟ. **Dependency:** none. **Unblocks:** thrown errors in revenue actions show up in `platform_incidents` with a `failed_action` kind + an `action` name in `surface_meta`, dedup-counted across users.

### Tier 1 — next 2-4 weeks (the IO-2..IO-4 build, plus the infra wins)

#### 3.E · Synthetic uptime probe — internal + external (§2.E — closes the "is it up RIGHT NOW" gap)

Two probes, complementary.

**E-1 — Internal (in-house, ships next):**
- New cron: `vercel.json` + `lib/cron/registry.ts` + `app/api/cron/health-probe/route.ts`. Schedule `*/5 * * * *` (every 5 min).
- Probe targets: `https://<vercel-prod-url>/status` (parse the JSON), `https://<ref>.supabase.co/auth/v1/health` (assert 401-no-apikey), Vercel platform health (optional, polite).
- Writes a `platform_events` row (`event_type=health_probe`, `meta={surface, status, latency_ms, error}`).
- Reuses the cron-instrument harness + `cron_invocations` for self-health.
- The `/admin/status` page (IO-4) reads these rows for the SLA rollup.

**E-2 — External (Better Stack free tier, ships now):**
- Better Stack Uptime free tier — 5 monitors, 3-minute interval, US/EU/SG regions.
- Monitor 1: `https://pacred.co.th/` (root, 200 expected)
- Monitor 2: `https://pacred.co.th/status` (status page renders + does its own DB ping)
- Monitor 3: `https://pacred.co.th/api/health` (a new lightweight route — `app/api/health/route.ts` — returns 200 if DB ping + Sentry-DSN-set, 503 otherwise)
- Notify channels: LINE OA + email (free)
- This survives "the whole Vercel project is broken" — external probe, off-platform.

**Effort:** E-2 is ~30 min (Better Stack signup + monitor setup); E-1 is ~half a day (cron + payload). **Owner:** เดฟ. **Dependency:** GA4 in place is nice but not required. **Unblocks:** SLA tracking, the IO-4 status page, the alert-rule "uptime probe failed twice" condition.

#### 3.F · Alert-rule engine (§2.F — promotes IO-1's seed alert to the IO-4 engine)

Already designed in the IO-4 section of [`platform-observability-system-2026-05-18.md`](../platform-observability-system-2026-05-18.md) §9.3. Pull forward:

- Migration: `<NNNN>_alert_rules.sql` — `alert_rules(id, name, condition_sql, severity, target_roles[], cooldown_minutes, last_fired_at, is_active)`.
- Cron evaluator: `app/api/cron/alert-eval/route.ts`, `*/2 * * * *`. For each active rule, runs the `condition_sql` (defined as a SECURITY DEFINER view or a parameterised query — design check); if it matches and the cooldown has lapsed, fire `sendNotification` to each target role + bump `last_fired_at`.
- Starter rules:
  - `new_high_severity_incident` (replaces IO-1's hard-coded seed alert; same target = super)
  - `incident_spike` — same fingerprint > 20 occurrences in 10 min → super + ก๊อต
  - `uptime_double_fail` — 2 consecutive `health_probe` events `status != ok` → super (LINE push)
  - `funnel_drop` — `signup_completed` events this hour < 50% of the 7-day average for the same hour → เดฟ
  - `momo_sync_error` — > 3 `momo_sync_error` events in an hour → ops
  - `sentry_volume_spike` — Sentry events / minute > 10× rolling-baseline → super
- Cooldown ensures a 5-fingerprint burst sends ONE alert.

**Effort:** 2-3 days for the engine + 4 starter rules. **Owner:** เดฟ. **Dependency:** 3.E (uptime probe) + 3.D (action wrapping for the `failed_action` signal). **Reuses:** the cron harness, `sendNotification`.

#### 3.G · Cost monitor — Vercel + Supabase (§2.G — closes the "monthly burn" blind spot)

Pull both billing APIs into `platform_events` daily.

- Vercel: `https://api.vercel.com/v1/usage` + project / team scope — needs a Vercel personal token (env var `VERCEL_TOKEN`, scoped Read-only).
- Supabase: the [Supabase Management API](https://supabase.com/docs/reference/api/get-organization-billing) — `GET /v1/organizations/{slug}/billing/usage` — needs a Management API key.
- New cron: `*/0 7 * * *` (daily at 14:00 ICT after Vercel's UTC midnight rollup).
- Persists daily usage + cost snapshots to a new `cost_snapshots(date, source, line_item, units, usd_cents, projected_month_usd_cents)` table.
- New panel: `/admin/observability/cost` — current month MTD spend, projection, line-item breakdown, comparison vs last month.
- Alert: cost spike (today > 1.5× the 7-day average for this day-of-month) → ก๊อต.

**Effort:** 1.5 days (two integrations + table + page + alert). **Owner:** เดฟ. **Dependency:** alert engine (3.F) for the spike alert. **Unblocks:** real cost visibility for the post-launch budget decisions ก๊อต has to make.

#### 3.H · Disaster recovery posture (§2.H — documents + drills DR)

Three actions:

- **H-1 — Decide.** Confirm with Supabase support what PITR retention the prod project currently has. If "snapshots only," propose to ก๊อต whether to enable PITR (cost: ~$100/mo at team tier, value: 24-hour-disaster-recovery becomes 1-minute-recovery for the price of a Premium hCaptcha sub).
- **H-2 — Document.** New `docs/runbook/disaster-recovery.md`: target RPO (data loss tolerance — currently undefined, propose 1 hour with PITR, 24 hours without), target RTO (time to recovery — propose 4 hours), runbook for "Supabase is dead" (the recovery sequence: identify, restore-to-staging, validate, point Vercel at restored project, drain traffic).
- **H-3 — Drill.** Add a quarterly `disaster-recovery-drill` cron-instrumented manual run — run the recovery against the staging Supabase, record durations, prove RPO/RTO targets are met.

**Effort:** H-1 ~30 min (a Supabase support ticket); H-2 ~half a day; H-3 ~ongoing. **Owner:** ก๊อต (H-1 decision) + เดฟ (H-2 doc). **Dependency:** 3.I (staging env, for H-3 drill).

#### 3.I · Preview / staging environment (§2.I — closes the "every push lights up prod" gap)

Vercel Preview Deployments are free on Pro and a real working URL per branch. Supabase Branching (currently free for ~2 branches) gives a shallow-clone DB per Git branch.

Config:
- Vercel project settings: enable Preview deployments for `dave` (it is the integration branch — the value is highest there); ensure `dave` previews don't override `pacred.co.th` (they auto-get unique URLs).
- Supabase project settings: enable Branching; designate a `dave` branch that auto-creates on push.
- Vercel env vars: scope each `NEXT_PUBLIC_SUPABASE_URL` to environments — Production uses prod ref, Preview uses dave-branch ref.

The deploy gate becomes: deploy lands on `dave` → Vercel deploys to a preview URL pointing at the Supabase dave-branch → `qa-flow-simulator` runs against that URL → green → cleared for `dave→main`. This is the cure for "we never rehearse migrations against real-shape data."

**Effort:** half a day (mostly Vercel + Supabase dashboard config). **Owner:** ก๊อต + เดฟ. **Unblocks:** safer migration applications, removes "deploys lit up prod" risk, makes the H-3 DR drill possible.

#### 3.J · Log drain (§2.J — gives Pacred logs a sink + alertability)

Better Stack Logs free tier — 3 GB/mo, 3-day retention, structured-search.

- Vercel project settings → Log Drains → Add → Better Stack endpoint.
- Better Stack creates a "Pacred Production" source. Logs stream in.
- Saved searches: `level=error`, `scope=observability`, `scope=cron.instrument`, `scope=sms`, etc.
- Alerts: `level=error AND scope=incidents` → LINE (this duplicates IO-1's seed alert but at the log level — defence in depth).

**Effort:** ~20 min. **Owner:** เดฟ. **Long-term:** the IO-4 `platform_events` ingestion route may eventually accept a custom log drain so the same JSON line lands in Pacred Postgres too — but that's Tier 2.

### Tier 2 — the longer tail (compounding)

#### 3.K · Per-flag visibility panel (§2.K)

A small `/admin/system/flags` page reading `process.env` for the documented toggles (`OTP_BYPASS`, `LINE_PUSH_BYPASS`, `SENTRY_DSN`, `NEXT_PUBLIC_GTM_ID`, etc.) + each one's intended-in-prod value. Compares actual vs intended; red-flags drift. **Effort:** 2-3 h. Defers cleanly to the IO-4 admin status page.

#### 3.L · SLO / SLI doc (§2.L)

`docs/runbook/slo-sli-targets.md`:

- Availability SLO: 99.5% over 30 days (allows ~3.5 h/mo of unplanned downtime — realistic for a one-DevOps-engineer team)
- Performance SLO: LCP p75 < 2.5 s · INP p75 < 200 ms · CLS p75 < 0.1 across the customer-portal cohort
- Error-rate SLO: `failed_action` rate < 0.5% of action invocations
- 5xx-rate SLO: < 0.1% of HTTP requests
- Deploy frequency: ~3-5 per week (post-launch cadence)
- Lead time for change: P50 < 1 day, P95 < 3 days
- Change-failure rate: < 15% (deploys that need a rollback or hotfix)
- MTTR: < 1 h

Each SLI tied to an IO-4 alert rule. **Effort:** half a day. **Owner:** ก๊อต (numbers) + เดฟ (doc). **Unblocks:** alert thresholds + on-call expectations + a basis to argue against scope-creep ("does this work make us closer to SLO?").

#### 3.M · Codify the launch-day learnings (§2.M)

Audit-umbrella extensions:

- `audit:dev-script` — assert `package.json` `dev` is the IPv4-first wrapper.
- `audit:literal-pathspecs` — pre-commit hook (optional) checking staged paths with brackets.
- `audit:env-bypass-flags` — assert `OTP_BYPASS != "true"` in `.env.production` (or whatever the convention is).

**Effort:** ~half a day for the three smallest. **Owner:** เดฟ. **Defers cleanly** — none of these block production today.

#### 3.N · The IO-2..IO-4 build the design doc names

The big rocks already specified in [`platform-observability-system-2026-05-18.md`](../platform-observability-system-2026-05-18.md):

- **IO-2** — `platform_events` unified event log + per-department KPI panels + rollup views. **Effort: L.** Sequence after 3.A-3.E.
- **IO-3** — audience-scoped RLS + partner/customer/overseas KPI views + the marketing-conquest rollup (CAC/CPC fed by free Google/Meta ad data). **Effort: L-XL.** Depends on partner-scope decision (open question Q2 in IO-design §13) + the China-ops `warehouses` if regional scope rides on it (Q3).
- **IO-4** — always-on health monitoring (3.E adds the probe; IO-4 adds the SLA rollups) + status page hardening (the current `/status` + a new `/admin/status` deep view folding in the cron panel + `cost_snapshots` from 3.G) + the alert-rule engine (3.F).

The cleanest sequence is: 3.A immediately → 3.B-3.E in the next sprint → 3.F-3.J inside the IO-4 build → 3.K-3.M as stretch.

---

## 4. Deeper research — questions for ก๊อต/เดฟ + future paths

These are the questions the recommendations above are too small to answer alone. Each is named, framed, with the decision Pacred has to make.

### 4.1 Sentry tier — Free vs Team ($26/mo) vs Business ($80/mo)?

The free tier gets 5,000 errors / 100k transactions / 50 GB of replays per month. At Pacred's launch volume that is comfortably enough. **But** Sentry's Team tier adds:

- Cross-environment Issues + filtering
- 90-day retention (vs 30 free)
- Performance: Web Vitals at the per-page level (free does this too, just at the org level)
- Read-replica-friendly Insights
- Support for source-map upload at scale (Pacred uses this — `SENTRY_AUTH_TOKEN`)

**Decision input:** if Pacred's prod error volume goes above ~150/day or replay volume above ~30 sessions/day, Team becomes a forced upgrade. **Recommendation:** start Free; revisit in 30 days post-flip.

### 4.2 Better Stack vs Datadog vs Grafana Cloud vs Highlight vs PostHog?

The capability-tools-strategy synthesis prefers "build in-house anything that costs money and Pacred can build." For observability, the in-house surfaces (IO-1..IO-4) cover errors, events, incidents, KPIs, alerts, status. **What in-house cannot cheaply build:**

- **External uptime probing** — needs to run outside the Vercel platform. Better Stack free tier covers this (5 monitors, 3-min interval). Datadog is overkill at $30/mo+. Pingdom is similar to Better Stack. UptimeRobot is a free alternative but less polished.
- **Log retention + structured search** beyond what Vercel logs viewer offers natively (24 h, no query). Better Stack Logs free is 3 days / 3 GB. Logtail (now Better Stack) is the same product.

**Recommendation:** Better Stack covers both — Uptime (free) + Logs (free) on the same dashboard. The single-vendor consolidation is worth it for a small team.

**Anti-recommendation:**
- **Datadog** — feature-rich but $30-100/mo entry per host, optimised for big enterprise; overkill.
- **Grafana Cloud** — open-core, free tier (~10k series), but the operational burden of dashboard authoring + alert authoring + retention tuning is real for a one-DevOps-engineer team. The in-house `/admin/observability/*` already does the dashboard authoring inside Pacred — Grafana would split data out.
- **Highlight.io** — session-replay (overlaps with Clarity, which is free); errors (overlaps with Sentry); per-event pricing. Pacred is double-paying if it adds this.
- **PostHog** — product analytics + replay + feature flags + experiments. Real overlap with GA4 + Clarity but adds feature flags, which Pacred currently uses ADR-0007's typed `trackExperimentExposure` for. **A future option** if Pacred wants feature flags as a service; not Tier 0/1.

### 4.3 Self-hosted vs SaaS for the in-house surfaces?

The IO-1..IO-4 design is **inherently** self-hosted — `platform_incidents`, `platform_events`, `alert_rules` all live in Pacred Supabase Postgres. The question is only whether the *capture rails* are SaaS.

The current shape:
- Sentry — SaaS (free tier, easy to switch off, data exported via webhook into Pacred Postgres anyway)
- GA4 — SaaS (free, Google-only realistic option for ad attribution)
- Clarity — SaaS (free, no realistic in-house substitute)
- Better Stack — SaaS (free tier for uptime + logs)

→ **Every SaaS in the stack is on a free tier and exports its valuable data into Pacred's own store** (Sentry via webhook, GA4 via the BigQuery export for the IO-3 rollup, etc.). The "self-hosted vs SaaS" question is mostly settled by the free-tier ceilings. **Self-host only if Pacred outgrows them** — likely 12+ months out.

### 4.4 "One pane of glass" architecture — the owner ask

The owner explicitly asked: "ระบบ monitor ทุกอย่างอยู่ในระบบ platform Pacred" — every monitor inside Pacred's own platform. The IO-1..IO-4 design honours this: the system of record is Pacred Postgres + `/admin/observability/*`. The external SaaS rails are *inputs*, not the destination.

→ The "one pane of glass" is **`/admin/status`** in the IO-4 design — the internal deep status page. It should fold in:

- Live counts: open incidents (by severity), live `work_items`, live failed crons last 24 h, live `cron_invocations` failure rate
- Health: `/status` checks rolled up, uptime % last 24h/7d/30d, p50/p90 latency
- Cost: MTD Vercel spend + projection, MTD Supabase spend + projection (from §3.G)
- Performance: LCP/INP/CLS p75 over last 24 h, top-5 slowest routes
- Alerts fired last 7 days
- Sentry digest: deep-link out + a count widget

This single page is what answers "is Pacred healthy" without 8 browser tabs. It's also the page that — if you wanted to — could become a public-shareable owner-only URL.

### 4.5 Open IO-design questions still to decide (the IO-design §13 list)

The platform-observability design doc names 8 open questions. Of those, three intersect SRE / DevOps directly:

- **Q4 — IO-1 alert target.** Currently the seed alert fires to all active `super`-role admins. That's correct for the MVP. Tier 1 (§3.F) promotes it to a per-rule `target_roles[]`. **Decision input:** does Pacred want an on-call rotation? At a 3-person team, no — every super gets every alert is fine until growth justifies an OpsGenie / PagerDuty.
- **Q6 — Public status page detail.** "ดูที่ green/amber/red per surface, no detail" (the current `/status` does this) vs "full detail." **Recommendation:** keep the current coarse public view; put detail on `/admin/status` only. A public detailed status page is a competitor's intelligence map.
- **Q7 — Retention.** `platform_events` 90 days, resolved `platform_incidents` 1 year. **Decision input:** Thai PDPA + RD record-keeping wants some logs longer (financial actions in `admin_audit_log` should likely be 7 years per RD). Two retention regimes: ops-events 90 d (`platform_events`), audit-grade events 7 years (`admin_audit_log` already exists and is the right home). Keep them separate.

### 4.6 The Vercel-cron health-probe blind spot

Vercel crons run from Vercel's own infrastructure. A health probe from inside Vercel measures "the deployed function can reach the Supabase project" — which is exactly what failed on launch day (or rather, didn't fail because the dev project, not prod, was deleted). But a *new* failure mode it does NOT cover: "the Vercel region serving Bangkok is broken." For that, only Better Stack's external probe from multiple regions catches it. → **Both probes are needed**, not either-or. §3.E reflects this.

### 4.7 SLO budget burn — should Pacred track this?

The "error budget" framing (Google SRE book) — if availability target = 99.5% over 30 days, the team has 3.6 h of "downtime budget" per month. When 50% of that is consumed, deploy velocity should slow; when 100% is consumed, only fixes ship until the window resets. This is heavyweight at Pacred's current size — but the IO-4 SLA-rollup view + the `slo-sli-targets.md` doc are the **pre-requisites** to introducing it later, painlessly. Tier 2.

### 4.8 GA4 → BigQuery export — should Pacred enable it?

GA4 has a free daily BigQuery export. Once enabled, every GA4 event lands in a Pacred BigQuery dataset → can be joined against Pacred Postgres (via `platform_events`) for the IO-3 marketing rollup. This is the **canonical** way Google wants you to do CAC/CPC analytics at scale, and it's free. **Recommendation:** enable as part of 3.A.2 (GA4 turn-on).

### 4.9 Could Pacred use its IO-1 capture pattern for partner observability?

The IO-1 `platform_incidents` table has a `source = 'partner'` value already, and the Sentry webhook ingest demonstrates the pattern of "an external service POSTs into our store." → **Yes** — when MOMO syncs fail, when the LINE Messaging API returns 5xx, when ThaiBulkSMS returns rate-limit, these should land as `platform_incidents` (`source=partner`, `kind=api_error`). Today these are caught in the per-action catch blocks and `logger.error`-ed (which forwards to Sentry when on, but not to `platform_incidents`). A small extension to the action wrappers — or a partner-side helper `recordPartnerError(partner, err, meta)` — closes this. Tier 1.5.

---

## 5. References

### Internal — code

- `supabase/migrations/0077_platform_incidents.sql` — the IO-1 schema
- `supabase/migrations/0070_supervisory_layer.sql` — `cron_invocations`
- `supabase/migrations/0080_work_items.sql` — `work_items` + `ensure_work_item`
- `app/global-error.tsx` · `app/[locale]/error.tsx` — the error boundaries
- `app/api/observability/incident/route.ts` — the client-error sink
- `app/api/observability/sentry-webhook/route.ts` — the Sentry webhook ingest
- `app/[locale]/(admin)/admin/incidents/page.tsx` — the triage queue
- `app/[locale]/(protected)/my-issues/page.tsx` — the customer "ปัญหาที่ฉันแจ้ง" view
- `app/[locale]/(public)/status/page.tsx` — the public status page
- `app/[locale]/(admin)/admin/system/crons/page.tsx` — the cron-health panel
- `app/[locale]/(admin)/admin/audit/page.tsx` — the admin-action audit-log
- `app/[locale]/(admin)/admin/kpi/page.tsx` — the executive KPI dashboard
- `lib/observability/incident-store.ts` · `lib/observability/fingerprint.ts` · `lib/observability/client-report.ts` · `lib/observability/with-observability.ts`
- `lib/validators/platform-incident.ts` — types + lifecycle whitelist
- `lib/cron/instrument.ts` · `lib/cron/registry.ts` — cron harness
- `lib/logger.ts` — structured PII-redacted logger with Sentry bridge
- `lib/analytics.ts` — GA4 + Clarity helpers
- `lib/rate-limit.ts` — Upstash + memory fallback
- `actions/admin/incidents.ts` — triage Server Actions
- `instrumentation.ts` · `instrumentation-client.ts` · `sentry.server.config.ts` · `sentry.edge.config.ts` — Sentry init
- `next.config.ts` — `withSentryConfig` build wrapper + security headers
- `vercel.json` — 7 cron entries
- `.github/workflows/ci.yml` — the CI pipeline
- `package.json` — scripts (`dev` with `--dns-result-order=ipv4first`; `verify`; `audit:all`)

### Internal — design + runbooks + ADRs

- [`docs/research/platform-observability-system-2026-05-18.md`](../platform-observability-system-2026-05-18.md) — the IO-1..IO-4 design this report extends
- [`docs/research/capability-tools-strategy-2026-05-18.md`](../capability-tools-strategy-2026-05-18.md) — the build-vs-buy synthesis
- [`docs/research/tools-strategy-build-vs-buy-2026-05-18.md`](../tools-strategy-build-vs-buy-2026-05-18.md) — the tool inventory
- [`docs/research/gap-integrations-tools.md`](../gap-integrations-tools.md) — the "5 tools installed-and-forgotten" finding
- [`docs/runbook/launch-monitoring-golive-2026-05-17.md`](../../runbook/launch-monitoring-golive-2026-05-17.md) — the env-flip checklist
- [`docs/runbook/vercel-cron-plan.md`](../../runbook/vercel-cron-plan.md) — the cron runbook
- [`docs/runbook/cron-registry.md`](../../runbook/cron-registry.md) — the cron registry mirror
- [`docs/decisions/0007-analytics-and-ab-testing.md`](../../decisions/0007-analytics-and-ab-testing.md) — GTM/GA4/Clarity ADR
- [`docs/decisions/0002-admin-architecture.md`](../../decisions/0002-admin-architecture.md) — admin RBAC model
- [`AGENTS.md`](../../../AGENTS.md) §11 — the production deploy gate rule
- [`docs/learnings/ci-and-deploy-gotchas.md`](../../learnings/ci-and-deploy-gotchas.md) — the 12 launch-day learnings
- [`docs/learnings/nextjs-16-quirks.md`](../../learnings/nextjs-16-quirks.md) — Next 16 specifics
- [`.claude/skills/phase-verify-loop/SKILL.md`](../../../.claude/skills/phase-verify-loop/SKILL.md) — the verify-loop skill
- [`.claude/skills/qa-flow-simulator/SKILL.md`](../../../.claude/skills/qa-flow-simulator/SKILL.md) — the functional gate skill
- [`.claude/skills/audit-kpi-dashboard/SKILL.md`](../../../.claude/skills/audit-kpi-dashboard/SKILL.md) — the dashboard-build skill

### External — vendor docs + standards

- Sentry Next.js: <https://docs.sentry.io/platforms/javascript/guides/nextjs/>
- Sentry webhooks (HMAC-SHA256 signature): <https://docs.sentry.io/product/integrations/integration-platform/webhooks/>
- Sentry Replay sampling: <https://docs.sentry.io/platforms/javascript/session-replay/configuration/>
- GA4 + GTM custom events: <https://developers.google.com/tag-platform/tag-manager>
- GA4 BigQuery export: <https://support.google.com/analytics/answer/9358801>
- Microsoft Clarity: <https://learn.microsoft.com/en-us/clarity/>
- Better Stack Uptime (free 5 monitors): <https://betterstack.com/uptime>
- Better Stack Logs (free 3 GB/3 d): <https://betterstack.com/logs>
- Vercel log drains: <https://vercel.com/docs/observability/log-drains>
- Vercel cron: <https://vercel.com/docs/cron-jobs>
- Vercel usage API: <https://vercel.com/docs/rest-api/endpoints/usage>
- Supabase Branching: <https://supabase.com/docs/guides/platform/branching>
- Supabase PITR: <https://supabase.com/docs/guides/platform/backups#point-in-time-recovery>
- Supabase Management API (billing): <https://supabase.com/docs/reference/api/introduction>
- web-vitals (npm): <https://github.com/GoogleChrome/web-vitals>
- Next.js `useReportWebVitals`: <https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals>
- Google Search Console Core Web Vitals report (page-experience signal): <https://search.google.com/search-console/about>
- Google SRE Book — error-budget framing: <https://sre.google/sre-book/embracing-risk/>

### Cross-references inside this report

- §1 — Current state (the survey, file-by-file)
- §2.A — Dark rails (closes via 3.A)
- §2.B — Deploy gate gap (closes via 3.B)
- §2.C — Web Vitals (closes via 3.C)
- §2.D — `withObservability` adoption (closes via 3.D)
- §2.E — Synthetic uptime (closes via 3.E)
- §2.F — Alert engine (closes via 3.F)
- §2.G — Cost monitor (closes via 3.G)
- §2.H — DR posture (closes via 3.H)
- §2.I — Preview env (closes via 3.I)
- §2.J — Log drain (closes via 3.J)
- §2.K — Flag visibility (Tier 2 — 3.K)
- §2.L — SLO/SLI (Tier 2 — 3.L)
- §2.M — Codify learnings (Tier 2 — 3.M)
- §4 — Open questions for ก๊อต/เดฟ

**End of R&D.** Pacred's observability is *better than a startup-of-this-size typically is*: IO-1 is shipped end-to-end, the structured logger is good, the cron harness + the public status page are real, the capture rails are wired (just env-gated off). **The biggest single action available right now is the env-var flip** (3.A) — half an hour of dashboard clicks unlocks Sentry's production crash data, GA4's conversion data, Clarity's session replays, and the in-prod rate limit. The biggest gaps after that are **the dead-DB deploy gate** (3.B — `/status` becomes an active CI check, not a passive page), **Web Vitals capture** (3.C — directly drives ad-spend efficiency), **`withObservability` adoption** (3.D — currently shipped but unused), **synthetic uptime** (3.E — internal + external probes), and **cost monitoring** (3.G — the second-largest dark spend at Pacred today). The IO-2..IO-4 design names the longer build correctly; this report's job is to insert the SRE pieces around it.
