---
name: audit-kpi-dashboard
description: Use this skill whenever the user asks "how are we doing on X", "what's our KPI", "I want a dashboard for", "audit Y", "visualise metric Z", "ดูว่างานเป็นยังไง", "อยากเห็น dashboard", or any request that wants a quantitative picture of operational state. Generates KPI dashboards from Pacred's existing data (Supabase tables + GA4 events + admin module tables) — can output as Next.js admin page, markdown report, or one-shot SQL+CSV. Covers cargo revenue KPIs (orders/day, wallet topup volume, container in-transit count, customer signup conversion) and team-process KPIs (sprint velocity, push frequency, integration cycle health). Make sure to use this skill even if the user doesn't explicitly say "dashboard" — anytime they want to know "how is X doing" with numbers, this is the right tool.
---

# Audit KPI Dashboard

> **Why this exists.** Pacred runs decisions on owner intuition + ad inquiries today. To scale, every decision needs data. This skill establishes the pattern: name a metric → identify source → query → render. Repeat per KPI. Output is the dashboard, the SQL view that feeds it, and a refresh-cadence note.

## When to invoke

- ✅ "How many cargo orders this week vs last week?"
- ✅ "What's our signup → first-order conversion rate?"
- ✅ "Show me wallet topup volume by day"
- ✅ "I want a dashboard for ก๊อต to see ADR landings"
- ✅ "Audit how many landing pages have CTA above the fold"
- ❌ One-shot "what's X right now" — just query directly without dashboard scaffolding
- ❌ "Will this metric look good?" — speculation. This skill is for measured reality, not forecasts.

## The pattern

```
1. NAME the metric — be precise.
   Bad:  "customer activity"
   Good: "Distinct customers placing at least 1 service-import order in the
          last 7 days, vs same 7-day window 1 week prior. Trend = delta %."

2. CLASSIFY the metric type — different types want different visualization:
   · COUNT       (number of orders today)        → bar chart by day OR big number + delta
   · RATE        (signup-to-first-order %)        → line trend + current value
   · DURATION    (time-from-order-to-fulfillment) → histogram + p50/p90/p99
   · INVENTORY   (containers in-transit right now) → big number + by-status breakdown
   · COMPOSITION (orders by service type)         → stacked area / pie

3. IDENTIFY data source:
   Pacred has 3 sources of metric truth:
   a) Supabase tables — operational data (orders / wallet / users / containers)
      Use:  createAdminClient() + SQL via PostgREST OR direct SQL via psql
   b) GA4 / Clarity — web events (signup, cta_click, generate_lead)
      Use:  GA4 Reporting API OR Clarity export
   c) Admin module tables — internal ops (hr_employees / hr_attendance / etc)
      Use:  same Supabase, but with admin RLS bypass

4. WRITE the query — start as SQL or PostgREST. Keep it readable.
   Define a Supabase view if reused:
   `CREATE VIEW kpi_<metric_name> AS SELECT ...`
   Then dashboard reads from view, not raw query.

5. RENDER — pick output format:
   · `/admin/dashboard/<metric>` page — for ก๊อต / เดฟ / Pacred owner daily review
   · Markdown report in `docs/audits/<date>-<topic>.md` — for one-shot ad-hoc
   · CSV export route `app/api/exports/<metric>.csv` — for Pacred owner Excel review

6. CAPTURE the refresh cadence:
   · Real-time (live SQL on page load)
   · Hourly cron (Vercel cron, refresh materialised view)
   · Daily digest (sales-daily-digest pattern already in vercel.json)
   · Manual (run when needed)

7. CROSS-LINK from STRATEGY.md §9 or HANDBOOK.md "Current state":
   When a KPI flips from "we don't measure" to "we measure" — document it.
```

## Recommended starter dashboard (Pacred — cargo revenue sprint)

Goal: pacred owner + เดฟ + ก๊อต see daily what's happening with revenue path.

| KPI | Source | Why it matters |
|---|---|---|
| **Daily signups (last 30d)** | `auth.users` + GA4 `sign_up` | Are Ads converting? |
| **Daily orders (last 30d, by service)** | `header_orders` + `forwarders` | Revenue proxy |
| **Wallet topup volume (last 30d, ฿)** | `wallet_history` where `type='deposit'` | Cash in |
| **Containers in-transit (live count)** | `containers` where `status IN (...)` | Service load |
| **Time order→fulfillment (p50/p90)** | `forwarders` timestamps | Service quality |
| **Signup → first-order rate (rolling 7d)** | `auth.users` LEFT JOIN orders | Funnel health |
| **CTA click rate per page (GA4)** | GA4 `cta_click` event | Landing quality |
| **Sentry error count (last 24h)** | Sentry API | Production stability |

Target page: `/admin/dashboard/revenue-pulse` — single-page, mobile-readable, refresh on visit.

## Recommended starter audit (team process)

Goal: เดฟ sees integration health weekly.

| KPI | Source | Why |
|---|---|---|
| Commits per role per day | `git log --author=<dev>` | Pace |
| Pushes to own-branch per role per day | `git log --remotes=origin/<branch>` | Push frequency rule |
| dave→main integrations per day | `git log --grep="Merge.*dave\\|main"` | Integration cycle health |
| Avg time commit → push | git timestamp diff | Save-point discipline |
| CI green rate (last 50 runs) | GitHub Actions API | Stability |
| ADRs landed (last 30d) | `docs/decisions/0*.md` mtime | ก๊อต velocity |
| Brief P0 items completed (per role) | parse briefs/*.md strike-through | Sprint velocity |

Target: `docs/audits/team-pulse-<YYYY-WW>.md` weekly markdown report.

## Recommended starter audit (i18n / SEO / landing quality)

| KPI | Source | Why |
|---|---|---|
| TH key count vs EN key count | `scripts/i18n-audit.mjs` | Parity (already running in audit:all) |
| Same-value pairs needing review | i18n-audit output | EN copy quality |
| Pages with h1 + meta description | grep `app/[locale]/(public)/*/page.tsx` | SEO completeness |
| Pages with JSON-LD | grep `<script type="application/ld+json">` | Rich-snippet eligibility |
| Pages with LCP <2.5s on 4G | Lighthouse CLI batch | Ad quality score |
| Pages without phone+LINE CTA above fold | manual sweep | Mobile conversion |

## Output template

When generating a dashboard page, follow this structure:

```tsx
// app/[locale]/(admin)/admin/dashboard/<metric>/page.tsx
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-auth";

export const dynamic = "force-dynamic"; // disable static cache for live KPIs

export default async function Page() {
  await requireAdmin(["super", "ops"]);
  const supa = createAdminClient();
  const { data } = await supa.from("kpi_<metric_name>").select("*");
  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">{/* metric name */}</h1>
      <p className="text-sm text-muted-foreground">{/* one-line "what this is" */}</p>
      {/* Big number block · trend chart · breakdown table */}
    </main>
  );
}
```

Match Pacred theme (Tailwind v4 utilities + `@theme inline` colors). Admin sidebar bg = white per เดฟ brief 2026-05-16.

## Anti-patterns

- **Vanity metrics** — "page views" without conversion. Always tie to revenue or process.
- **Real-time everything** — expensive. Default = hourly cron + materialised view unless the user explicitly says live.
- **Pretty chart over readable number** — for owner reviews, big number + delta % beats sparkline.
- **No baseline** — every metric needs "vs last week / month / quarter" to mean anything.

## Cross-links

- [`docs/PORT_PLAN.md`](../../../docs/PORT_PLAN.md) Part T2 ก๊อต T-G1 "API borrow audit" — model audit, this skill is the generic version
- [`docs/decisions/0007-analytics-and-ab-testing.md`](../../../docs/decisions/0007-analytics-and-ab-testing.md) — GTM + Clarity events to draw from
- [`docs/architecture/container-centric-model.md`](../../../docs/architecture/container-centric-model.md) — schema for cargo KPIs
- [`/admin/hr/dashboard/page.tsx`](../../../app/) — existing pattern to copy
