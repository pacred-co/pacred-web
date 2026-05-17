# 🧰 Pacred — Master Tools Strategy: have / lack / build-vs-buy

> **Produced 2026-05-18** for เดฟ. **What this is:** the cross-cutting tools
> decision matrix. The growth-strategy and operating-system parallel agents feed
> into this — it answers, for every capability Pacred needs, **keep · buy/connect
> · or build in-house**.
>
> **The load-bearing rule (เดฟ).** *"อะไรที่มันเสียตังแล้วเราทำได้เอง ก็ทำเองดีกว่า —
> อยากให้ทุกอย่างอยู่ใน ecosystem ของ Pacred."* — if a capability costs money and
> Pacred can build it, **build it**. External tools are for the things that are
> free, or genuinely not worth rebuilding (a browser engine, an error-grouping
> backend, a CDN). Every kept tool must be **genuinely used + monitored + produce
> measurable results** — anything that fails that test is flagged for removal.
>
> **Grounded in the repo**, not roadmap prose. Builds on
> [`gap-integrations-tools.md`](gap-integrations-tools.md) (the "5 installed-and-
> forgotten" finding — verified + extended here),
> [`frontend-tooling-2026-05-18.md`](frontend-tooling-2026-05-18.md) (the
> frontend-role slice), [`PACRED-MASTER-STRATEGY.md`](PACRED-MASTER-STRATEGY.md)
> (the 4-chain synthesis) and the launch-monitoring runbook
> [`../runbook/launch-monitoring-golive-2026-05-17.md`](../runbook/launch-monitoring-golive-2026-05-17.md).
>
> **Read order:** §1 inventory (what we have) → §2 tech-role tooling → §3 data &
> BI → §4 the named candidates → §5 the build-vs-buy decision matrix → §6 roadmap.

---

## 0. TL;DR

Pacred's tool problem is **not "we lack tools"** — it is **"the tools we have are
not switched on, and the tools we lack are mostly things we should build, not
buy."**

- **CONNECT now (free, external, not worth rebuilding):** the 9 monitoring env
  vars (Sentry / GTM+GA4 / Clarity / Upstash / hCaptcha — all 5 already code-
  wired, zero-effort to activate) · **Google Search Console** · **Google
  Business Profile** · **LINE OA Manager** · **Meta Business Suite**. All free.
  Three of these are the literal "Search หา pacred.co ไม่เจอ" emergency fix.
- **BUILD in-house instead of paying:** the **BI / KPI dashboard** (the
  `audit-kpi-dashboard` skill + admin tables already exist — do not buy Looker /
  Metabase) · the **MOMO sync engine** (`R-2`/`W-4` — the skeleton exists) · a
  **CI pipeline** on free GitHub Actions minutes · the **CPC / ad-spend tracker**
  as an admin page fed by GTM→GA4 conversions. And **do not buy Empeo** — Pacred
  already runs a 9-page in-house HR module; an external HR SaaS would fragment
  the ecosystem and duplicate built code.
- **KILL / fix:** no tool is purely dead, but **5 are "installed-and-forgotten"**
  (env-gated no-ops) — they are *liabilities until activated* because the team
  believes it has monitoring it does not. The dead **legacy carrier env stubs**
  (`JMF_*`, `CARGOTHAI_*` — incl. a live-looking token in a comment) are hygiene
  debt: flag, do **not** scrub yet (AGENTS.md §3 — pre-switchover).

The single highest-ROI action in this whole doc is **§4.1 — set 9 Vercel env
vars (~15 min)**: it converts 5 "installed-and-forgotten" tools into 5 working
ones and lights up the ad-conversion tracking the company is burning runway
without.

---

## 1. Tool inventory — what Pacred USES today

> Legend — **Wired:** code present + mounted · **Active:** actually does
> something in production right now · **Monitored:** someone sees its output /
> there is a review workflow.

### 1.1 Core platform stack

| Tool | Role | Wired | Active | Monitored | Cost | Notes |
|---|---|---|---|---|---|---|
| **Next.js 16.2.6** | App framework | ✅ | ✅ | n/a | free (OSS) | App Router · `proxy.ts` middleware (Next-16 rename). Pinned exact version. |
| **React 19.2.4 + TypeScript 5 strict** | UI + types | ✅ | ✅ | n/a | free | `tsc --noEmit` in `pnpm verify`. |
| **Supabase Cloud** | Postgres + Auth + Storage + RLS | ✅ | ✅ | 🟡 partial | free tier → paid | DB of record. 58+ tables, RLS on all. No external uptime monitor on it (relies on Supabase status page). |
| **Vercel** | Host + CDN + cron + edge | ✅ | ✅ | 🟡 partial | free tier → paid | 7 cron jobs in `vercel.json`. Deploy logs only — no alerting wired. |
| **GitHub** | Source control | ✅ | ✅ | n/a | free | **No CI** — see §1.5 gap. |
| **pnpm 11** | Package manager | ✅ | ✅ | n/a | free | `onlyBuiltDependencies` allowlist incl. `sharp`. |
| **Tailwind CSS v4** | Styling | ✅ | ✅ | n/a | free | `@theme inline`, no `tailwind.config.js`. |

**Verdict:** the core stack is sound, all genuinely used. The two gaps are
*observability of the platform itself* (no external uptime ping on Supabase /
Vercel — see §3 / §5) and *no CI* (§1.5).

### 1.2 Monitoring & analytics — the "installed-and-forgotten" five

`gap-integrations-tools.md` §2 found all 5 are real SDK installs, code-wired and
mounted, but **every one is env-gated to a no-op**. Re-verified against
`package.json` + the launch-monitoring runbook — **confirmed, all 5 still
inactive** as of this doc:

| Tool | Role | Wired | Active | Monitored | Cost | Gap |
|---|---|---|---|---|---|---|
| **Sentry** (`@sentry/nextjs@10`) | Error tracking | ✅ full (`sentry.*.config.ts`, `instrumentation*.ts`, `withSentryConfig`, `logger.error` bridge) | ❌ `SENTRY_DSN` unset → `Sentry.init` skipped | ❌ no LINE alert, no admin widget | free tier (5k err/mo) | 1 env var from working. 2 deprecation warns still in `next.config.ts` (`disableLogger`, `automaticVercelMonitors`). |
| **GTM + GA4** | Tag mgmt + web analytics | ✅ (`gtm-script.tsx`, `lib/analytics.ts` 9 typed events) | ❌ `NEXT_PUBLIC_GTM_ID` unset → renders `null` | ❌ no one reads GA4 | free | **Conversion tracking = 0** on the exact ad path the company burns money on. |
| **Microsoft Clarity** | Heatmap + session replay | ✅ (`clarity-script.tsx`) | ❌ `NEXT_PUBLIC_CLARITY_ID` unset → `null` | ❌ no review workflow for ปอน | free (unlimited) | No heatmap data accruing on landing pages. |
| **Upstash Redis** | Distributed rate-limit store | ✅ (`lib/rate-limit.ts`, 5 buckets, sliding window) | 🟡 falls back to in-memory `Map` | ❌ no admin visibility of rl hits | free tier (10k cmd/day) | Memory fallback = per-instance on Vercel → quota leaks across cold starts. Functional, not prod-safe. |
| **hCaptcha** | Bot protection | ✅ (`lib/hcaptcha.ts`, wired into 5 auth/contact actions) | ❌ `*_HCAPTCHA_*` unset → degrades **OPEN** | ❌ no visibility of captcha fails | free tier | Degrades open by design (intentional 2026-05-16 decision — OTP + rate-limit still gate signup). |

**Verdict — none is dead scaffold; all 5 are one env var from working.** But
"installed-and-forgotten" is *worse than not having them* in one respect: the
team's mental model says "we have error tracking / analytics / bot protection"
when it has none. **They are liabilities until §4.1 flips them on.**

### 1.3 Auth & messaging

| Tool | Role | Wired | Active | Monitored | Cost | Notes |
|---|---|---|---|---|---|---|
| **Supabase Auth** | Email/phone + OAuth | ✅ | ✅ | 🟡 | free | Google + Facebook OAuth live; LINE OAuth mocked. |
| **ThaiBulkSMS** | OTP delivery | ✅ (`lib/sms/gateway.ts`) | ✅ (`OTP_BYPASS=false` in prod) | ✅ **cron `sms-balance-check`** pings daily, LINE-alerts on low balance | pay-per-SMS | The one tool with a real monitoring loop wired. Good pattern — replicate it. |
| **LINE Messaging API + LIFF** | Push notifications + account link | ✅ (`@line/liff`, `lib/notifications/`) | 🟡 `LINE_PUSH_BYPASS` flag; creds set 2026-05-14 | 🟡 | free tier (push quota) | Replaced LINE Notify (EOL Apr 2025). LIFF link page pending. |
| **Resend** | Transactional email fallback | ✅ (`lib/notifications/index.ts`, `RESEND_API_KEY`) | 🟡 used when LINE push fails / QA inspections | 🟡 | free tier (3k/mo) | DKIM TBD per STRATEGY. Genuinely used — keep. |
| **promptpay-qr + qrcode** | PromptPay QR generation | ✅ | ✅ | n/a | free (OSS) | Wallet deposit QR. Pre-beta payment path (ADR-0004). |

### 1.4 Partner / data integrations

| Integration | Role | Wired | Active | Cost | Notes |
|---|---|---|---|---|---|
| **MOMO / JMF** (`lib/integrations/momo-jmf/`) | Container + tracking sync — Pacred's *only* digital container feed | 🟡 typed client + types exist; **`sync.ts` body is a stub, zero callers, no cron** | ❌ | free (partner) | `R-2`/`W-4`. Container board fed only by manual `NewContainerForm`. **Top unbuilt integration.** |
| **TAMIT-cloud / AkuCargo / Laonet** | China product search (URL→cart, keyword, image) | ✅ (`lib/china-search/`) | ✅ | free (unauth borrowed) | Powers `/service-order/add`. Borrowed legacy endpoints — keep until switchover (AGENTS.md §3). |
| **Legacy carrier APIs** (`JMF_*`, `CARGOTHAI_*` in `.env.example`) | — | ❌ commented out, no code consumes | ❌ | — | **Dead stubs. A live-looking token sits in a `.env.example` comment.** Flag, do not scrub (G-13). |
| **PEAK / NetBay** | Accounting / customs e-declaration | ❌ zero code references repo-wide | ❌ | SaaS (PEAK) / per-use (NetBay) | Roadmap prose only (`R-4`/`R-11`). Unplanned. |

### 1.5 Dev / test / quality tooling

| Tool | Role | Wired | Active | Monitored | Cost | Notes |
|---|---|---|---|---|---|---|
| **`pnpm verify`** (`lint` + `tsc` + `test:unit` + `audit:all`) | Pre-deploy gate | ✅ | ✅ (run manually) | n/a | free | ~45 `tsx` unit-test files. Solid. But **manual** — see CI gap. |
| **`audit:md` / `audit:env` / `audit:i18n`** | Custom repo guards | ✅ | ✅ | n/a | free | In-house scripts (`scripts/*.mjs`). Exactly the "build-it-ourselves" pattern — good. |
| **ESLint 9 (flat config)** | Linting | ✅ | ✅ | n/a | free | `eslint-config-next`. |
| **The 11 `.claude/skills/`** | Agent playbooks | ✅ | ✅ | n/a | free | `phase-verify-loop`, `bug-swarm-loop`, `audit-kpi-dashboard`, etc. In-house process IP. |
| **CI/CD pipeline** | Auto-run `verify` on push/PR | ❌ **`.github/workflows/` does not exist** | ❌ | ❌ | free (GH Actions) | **Real gap.** `verify` only runs when a dev remembers. See §2 devops + §5. |
| **Prettier** | Code formatting | ❌ no `.prettierrc`, not a dep | ❌ | n/a | free | Minor — ESLint covers most. `frontend-tooling` §6 notes the Tailwind class-sort plugin would help; team decision. |

**The one structural gap in dev tooling: no CI.** `pnpm verify` + `pnpm build`
pass locally only. AGENTS.md §11 even documents how a 500 reached prod because
the smoke gate is manual. CI is **free** on GitHub Actions and is a BUILD item.

---

## 2. The tech-role tooling layer

What each technical role needs to work fast + well, and what is missing. The
frontend slice is covered in depth by
[`frontend-tooling-2026-05-18.md`](frontend-tooling-2026-05-18.md) — summarized
here, not repeated.

| Role | Has today | Missing — and the verdict |
|---|---|---|
| **Frontend** (ปอน) | Next 16 + Tailwind v4 + `audit:i18n` | Per `frontend-tooling-2026-05-18.md`: data-driven landing template, in-repo `/preview` route, image optimization, Tailwind IntelliSense. All **BUILD / free editor tooling** — nothing to buy. |
| **Backend** (ภูม) | Supabase + Zod validators + `actions/` pattern + ~45 unit tests | **Local Supabase / branch DBs** for safe migration testing (Supabase CLI — free, BUILD into workflow). A **migration-apply tracker** (partly exists in `supabase/migrations/README.md`). No paid tool needed. |
| **Fullstack** (เดฟ) | Worktree-based parallel dev, `branch-integrate-loop` skill | A **CI gate** so integration doesn't rely on manual `verify`. **BUILD** on GH Actions. |
| **DevOps** | Vercel auto-deploy, 7 crons | **CI pipeline** (BUILD, free) · **deploy-failure + cron-failure alerting** — Vercel can email; or a `/api/cron` self-check that LINE-alerts (BUILD, mirrors the `sms-balance-check` pattern) · **uptime monitor** on `/status` (CONNECT — free tier of UptimeRobot / Better Stack; not worth building a global prober). |
| **Cloud engineer** | Supabase + Vercel dashboards | **Backup / PITR verification** (Supabase paid tier feature — a real BUY-when-revenue decision) · cost-alerting on Vercel + Supabase usage (CONNECT — both have free budget alerts). |
| **UX/UI design** | — | **Figma** (free tier — CONNECT; designing a UI system in-house is not Pacred's business) · Clarity heatmaps (already installed — just activate, §4.1). |
| **Data analyst** | Admin reports + `audit-kpi-dashboard` skill | A **real BI dashboard** — see §3. Verdict: **BUILD** (skill + tables exist). |
| **QA / software tester** | `qa-flow-simulator` skill, `test:unit` | **CI to run tests automatically** (BUILD) · optionally Playwright for E2E (BUILD when a dedicated QA role exists — `frontend-tooling` §3 correctly scopes it out for solo devs now). |
| **Editor** (content / copy) | `messages/{th,en}.json`, MDX-capable | A **content workflow** — for 2 locales maintained by devs, no CMS needed. If marketing later needs to edit landing copy without a deploy, that is a **BUILD** (MDX-per-service, already contemplated in CLAUDE.md) before a **BUY** (Sanity/Payload). |
| **Director** (พี่ป๊อป / oversight) | Owner intuition + ad inquiry counts | **The business KPI dashboard** (§3) — the single most valuable missing artifact for this role. **BUILD.** |

**Cross-role conclusion:** every technical-role gap resolves to either *free
editor tooling*, *free external tier* (Figma, an uptime pinger), or a **BUILD**
on infrastructure Pacred already owns. **No technical role needs a paid SaaS
purchase today.** The one shared, repeatedly-named gap is **CI** — build it once,
every role benefits.

---

## 3. Data & analytics — can Pacred answer "how is the business doing"?

**Today: partially, and only by hand.** The repo has:

- **`/admin` dashboard** — live data, the real overview (the old `/admin/dashboard`
  is now just a redirect stub).
- **14+ report pages** under `/admin/reports/*` (`monthly-orders`, `debtors`,
  `sales-by-rep`, `hs-code-revenue`, `pending-payments`, `forwarder-volume`, …) —
  each a focused operational table with CSV export.
- **The `audit-kpi-dashboard` skill** — a documented pattern (name metric →
  source → query → render) for producing dashboards from Supabase + GA4 + admin
  tables.

**What is missing:** a single **business-health dashboard** that answers the
director-level questions in one view — **revenue/day, orders/day, container
throughput, signup→first-order conversion, wallet top-up volume, customer
acquisition cost**. The reports are *operational* (one slice each); there is no
*executive* roll-up. And **CAC is unanswerable today** because ad-spend
conversion data does not exist — GTM/GA4 are inactive (§1.2).

### Build vs buy for BI

| Option | Verdict | Why |
|---|---|---|
| **Looker Studio / Metabase / Power BI** | ❌ do not adopt | Looker Studio is free but pulls Pacred's data into Google's surface and needs a connector to Supabase; Metabase self-hosted is another service to run. Both **fragment the ecosystem** — the opposite of เดฟ's rule. |
| **BUILD: a `/admin/insights` (or extend `/admin`) executive dashboard** | ✅ **BUILD** | The `audit-kpi-dashboard` skill is *literally the playbook for this*. The data is in Supabase already. A handful of SQL views + one Next.js admin page (the team builds admin pages every sprint) = a dashboard that lives **inside Pacred**, respects RLS, needs no connector, costs ฿0. Once GA4 is active (§4.1), CAC + conversion join in. |

**Verdict: BUILD the executive KPI dashboard.** It is a few SQL views + one
admin page, the skill already specifies how, and buying BI would violate the
ecosystem rule for zero gain.

---

## 4. The named candidates (เดฟ's list) — assessed

### 4.1 The free external accounts — CONNECT all (this is the emergency fix)

These are **free**, **not rebuildable** (they are Google's / Meta's / LINE's own
surfaces), and three of them *directly address* the "Search หา pacred.co ไม่เจอ /
Google Ads ยิงไม่ติด" emergency.

| Candidate | Verdict | Why · cost · effort |
|---|---|---|
| **Google Search Console** | ✅ **CONNECT now** | Free. The diagnostic for "pacred.co ไม่เจอ" — shows indexation, coverage errors, query impressions. The SEO audit ([`../audit/seo-audit-2026-05-17.md`](../audit/seo-audit-2026-05-17.md) §B) already flags it pending. Verify domain (DNS TXT) — ~10 min. **P0 for the SEO emergency.** |
| **Google Business Profile** | ✅ **CONNECT now** | Free. Local-pack presence + the map/knowledge panel for "Pacred shipping". Pure win, no downside. ~20 min to create + verify. |
| **LINE Business / LINE OA Manager** | ✅ **CONNECT (already have OA)** | Free. The OA (`lin.ee/Yg3fU0I`) exists. The Manager console gives broadcast, rich menu, and **inbound chat handling** — the FB-ads cargo inquiries are landing in LINE; the OA Manager is where staff answer them. Already partly in use; formalize the workflow. |
| **Meta Business Suite** | ✅ **CONNECT now** | Free. Central console for the FB Page + Instagram + **the Meta Pixel** for ad-conversion tracking. FB ads are *already running* — the Pixel (via GTM, §1.2) closes the conversion loop. |
| **Google Keyword Planner** | ✅ **CONNECT (comes with Google Ads)** | Free with a Google Ads account. Keyword research for the cargo-landing SEO + ad copy. Use it; nothing to build. |
| **CPC / ad-spend tracking** | 🟡 partial — **CONNECT + BUILD** | The *raw* CPC data lives in **Google Ads + Meta Ads Manager** (free, already there) — connect those. A *unified Pacred-side view* of cost-per-acquisition across both ad channels is a **BUILD**: an `/admin/insights` panel that joins GA4 conversions (once active) with ad-spend. Don't buy a 3rd-party ad-tracking SaaS — Pacred's own admin page, fed by free data, keeps it in-ecosystem. |
| **The 9 monitoring env vars** (Sentry ×2, GTM, Clarity, hCaptcha ×2, Upstash ×2) | ✅ **CONNECT now — ~15 min, highest ROI in this doc** | All free-tier, all code-wired. Set them in Vercel → Settings → Environment Variables → redeploy. Procedure: [`../runbook/launch-monitoring-golive-2026-05-17.md`](../runbook/launch-monitoring-golive-2026-05-17.md). Resolve the hCaptcha fail-mode doc contradiction first (G-3) so the checklist is honest. |

### 4.2 Empeo (HR SaaS) — **do NOT buy — BUILD / already built**

**Verdict: ❌ do not adopt. Pacred already has an in-house HR module.** The repo
has `app/[locale]/(admin)/admin/hr/` with **9 sub-pages**: `employees`,
`attendance`, `org-chart`, `org-table`, `policies`, `recruitment`, `training`,
`audit`. STRATEGY puts the HR module at **~98% complete**.

Adopting Empeo would:
- **duplicate built, working code** — paying monthly for what exists;
- **fragment the ecosystem** — employee data split between Empeo and Supabase,
  the exact thing เดฟ's rule forbids;
- **add an integration burden** — payroll/attendance would need a sync back into
  Pacred anyway.

If the in-house HR module has *gaps* (e.g. payroll calculation, tax/social-
security filing), the verdict is **BUILD the missing slice** into the existing
module — not buy a SaaS that obsoletes the 98% already done. The *only* case for
a narrow external tool is a **statutory e-filing channel** (e.g. social-security
/ revenue-department submission) that legally must go through a government
portal — that is a CONNECT-to-government, not a BUY-Empeo.

### 4.3 Other tools worth connecting (not on เดฟ's list)

| Tool | Verdict | Why |
|---|---|---|
| **GitHub Actions CI** | ✅ **BUILD (free)** | Run `pnpm verify` + `pnpm build` on every push/PR. Closes the manual-gate hole AGENTS.md §11 documents. Free minutes cover this repo easily. |
| **Uptime monitor** (UptimeRobot / Better Stack free tier) | ✅ **CONNECT (free)** | Ping `/status` + the homepage every 5 min, alert to LINE/email. A global prober is not worth building. Closes the "PHP web outages went unnoticed" legacy leak (chat audit L-1). |
| **Vercel + Supabase budget alerts** | ✅ **CONNECT (free)** | Both platforms have free spend/usage alerting — turn it on so a runaway bill is caught early (relevant: company is burning runway). |
| **Figma** (free tier) | ✅ **CONNECT (free)** | For any UX/UI design work. Not Pacred's business to build a design tool. |
| **Dependabot / `pnpm audit`** | ✅ **CONNECT (free, GitHub-native)** | Automated dependency-vulnerability alerts — free, zero-maintenance. |

---

## 5. The build-vs-buy decision matrix

> One row per capability. **Have?** = exists in repo today. **Verdict** applies
> เดฟ's rule: BUY/CONNECT only when free or genuinely not worth rebuilding;
> otherwise BUILD in-ecosystem. **Monitored-how** is mandatory — a tool with no
> monitoring story is flagged.

| Capability | Have? | Verdict | Why (the rule applied) | Cost | How monitored |
|---|---|---|---|---|---|
| App framework / hosting / DB | ✅ Next+Vercel+Supabase | **KEEP** | Industry-standard, free tier, not rebuildable | free→paid at scale | 🔴 **gap** — add uptime ping + budget alerts (below) |
| Source control | ✅ GitHub | **KEEP** | Free, standard | free | n/a |
| CI — auto-run `verify`/`build` | ❌ | **BUILD** | Free on GH Actions; manual gate already let a 500 reach prod | ฿0 | CI status checks on every PR |
| Error tracking | 🟡 Sentry wired, inactive | **CONNECT** (activate) | Sentry free tier; rebuilding error-grouping is not Pacred's business | ฿0 (free tier) | Sentry Issues + (build) a LINE alert on new issue |
| Web analytics | 🟡 GTM+GA4 wired, inactive | **CONNECT** (activate) | Free; GA4 is Google's, not rebuildable | ฿0 | GA4 dashboard; surfaced into §3 BI page |
| Heatmap / session replay | 🟡 Clarity wired, inactive | **CONNECT** (activate) | Free unlimited; rebuilding session-replay is absurd | ฿0 | Clarity dashboard — assign ปอน a weekly review |
| Distributed rate-limit store | 🟡 Upstash wired, memory-fallback | **CONNECT** (activate) | Upstash free tier; building a distributed store is not the business | ฿0 (free tier) | (build) admin panel of rate-limit hits |
| Bot protection | 🟡 hCaptcha wired, degrades-open | **CONNECT** (activate) | Free tier; building CAPTCHA is not the business | ฿0 | (build) admin visibility of captcha fails |
| OTP / SMS delivery | ✅ ThaiBulkSMS active | **KEEP** | A telco gateway — must buy; pay-per-use | per-SMS | ✅ `sms-balance-check` cron + LINE alert — **the model pattern** |
| Push notifications | ✅ LINE Messaging API | **KEEP** | LINE's own API; free tier | free tier | (build) notification delivery log (`W-6`) |
| Transactional email | ✅ Resend active | **KEEP** | Free tier covers volume; building SMTP+deliverability is not the business | ฿0 (free tier) | Resend dashboard; finish DKIM |
| Container / tracking sync | 🟡 MOMO skeleton | **BUILD** (the sync engine) | The *engine* is Pacred code (`W-4`); MOMO is the free partner feed | ฿0 | (build) "last sync N min ago" on `/admin` |
| China product search | ✅ TAMIT/Aku/Laonet active | **KEEP (borrowed)** | Free unauth endpoints; switchover later (AGENTS.md §3) | ฿0 | per-call error handling exists |
| Business KPI / BI dashboard | 🟡 reports exist, no roll-up | **BUILD** | `audit-kpi-dashboard` skill + Supabase data already there; buying BI fragments the ecosystem | ฿0 | the dashboard *is* the monitor; refresh-cadence note per skill |
| CPC / ad-spend tracking | ❌ | **CONNECT + BUILD** | Raw data = free in Google/Meta Ads; the *unified CAC view* = a Pacred admin page | ฿0 | `/admin/insights` panel |
| Search indexation diagnostics | ❌ | **CONNECT** — Google Search Console | Free; it is Google's index — cannot be built | ฿0 | GSC dashboard; weekly check |
| Local-business presence | ❌ | **CONNECT** — Google Business Profile | Free; cannot be built | ฿0 | GBP dashboard |
| Ad-conversion pixel (Meta) | 🟡 via GTM | **CONNECT** — Meta Business Suite | Free; Meta's own | ฿0 | Meta Events Manager |
| Keyword research | ❌ | **CONNECT** — Google Keyword Planner | Free with Google Ads | ฿0 | used ad-hoc, no monitoring needed |
| Inbound social/chat handling | 🟡 LINE OA exists | **CONNECT** — LINE OA Manager + Meta Suite | Free consoles for channels Pacred owns | ฿0 | response-time, tracked in-console |
| HR (employees/attendance/org/payroll) | ✅ in-house module ~98% | **BUILD** (finish gaps) — **do NOT buy Empeo** | Paying for built code + fragmenting employee data violates the rule | ฿0 | the HR module's own `audit` page |
| Uptime monitoring | ❌ | **CONNECT** — UptimeRobot/Better Stack free tier | A global prober is not worth building | ฿0 | alert → LINE/email |
| Platform cost alerting | ❌ | **CONNECT** — Vercel + Supabase native budget alerts | Free, built into the platforms | ฿0 | platform-native email |
| Dependency vuln scanning | ❌ | **CONNECT** — Dependabot + `pnpm audit` | Free, GitHub-native | ฿0 | Dependabot PRs/alerts |
| UX/UI design | ❌ | **CONNECT** — Figma free tier | Not Pacred's business to build | ฿0 | n/a |
| Code formatting | ❌ Prettier absent | **OPTIONAL BUILD** (config) | Free; ESLint already covers most — team decision (`frontend-tooling` §6) | ฿0 | n/a |
| Accounting integration (PEAK) | ❌ zero code | **DEFER → then BUILD the bridge** | PEAK is the books' system of record; build the *reconciliation bridge* (`R-4`), don't rebuild accounting | PEAK = existing SaaS cost | post-launch |
| Customs e-declaration (NetBay) | ❌ zero code | **DEFER → CONNECT** (govt-adjacent) | NetBay is a regulated e-declaration channel — connect, don't build (`R-11`) | per-use | post-launch |
| E2E browser testing | 🟡 `qa-flow-simulator` skill | **BUILD when QA role exists** | Playwright is free; scope-out for solo devs now (`frontend-tooling` §3) | ฿0 | CI |

### 5.1 Tools flagged for KILL / cleanup

No tool is purely dead-and-harmful, but:

- **The 5 installed-and-forgotten monitoring tools** — *not* kill, but they fail
  the "genuinely used + monitored + measurable results" test **until activated**.
  Either flip them on (§4.1 — the recommendation) or, if a deliberate decision is
  made not to use one, **remove its SDK** so the codebase doesn't carry a false
  signal of capability. Do not leave them half-on indefinitely.
- **Legacy carrier env stubs** (`JMF_CARGO_TOKEN/BASE_URL`, `CARGOTHAI_TTP_TOKEN`
  with a live-looking value, `CARGOTHAI_CN_TOKEN`, `CARGOTHAI_BASE_URL`) in
  `.env.example` — **dead** (no code consumes them) and the committed token
  string is a hygiene issue. **Flag, do NOT scrub** — AGENTS.md §3 / `pcs-scrub-
  plan.md` forbid removal before ก๊อต confirms the API switchover. Tracked as
  `gap-integrations-tools.md` G-13.
- **`PACRED_RCGROUP_API_URL` / `PACRED_TAMIT_API_URL`** — already commented as
  `DEAD` in `.env.example`; remove once `lib/china-search` is confirmed rewired.

---

## 6. Prioritized adoption / build roadmap

Ordered by the revenue-first lens (AGENTS.md §2) — does it get cargo customers
faster, stop money/blindness leaking, or unblock a role?

### Tier 0 — now, ~1 day total, mostly free clicks

1. **Set the 9 monitoring env vars in Vercel** (~15 min) — Sentry, GTM, Clarity,
   Upstash, hCaptcha. Highest ROI in this doc. Resolve the hCaptcha fail-mode
   doc contradiction (G-3) first. → activates 5 tools, lights up ad-conversion
   tracking.
2. **Connect Google Search Console** (~10 min) — the direct diagnostic for the
   "pacred.co ไม่เจอ" emergency.
3. **Connect Google Business Profile** (~20 min) — local-pack presence.
4. **Connect Meta Business Suite + confirm Meta Pixel via GTM** — close the
   conversion loop on the FB ads already running.
5. **Turn on Vercel + Supabase budget alerts** (~5 min) — runway protection.
6. **Connect an uptime monitor** (UptimeRobot free) on `/status` + homepage.

### Tier 1 — launch-week / first weeks, BUILD on owned infra

7. **CI pipeline** (GitHub Actions) — `verify` + `build` on every PR. Free.
   Closes the manual-gate hole. ~half a day.
8. **MOMO sync engine** (`W-4`) — fill `sync.ts` upsert loop, add
   `app/api/cron/momo-jmf-sync/route.ts`, add the 7th cron. The container board's
   only digital data source.
9. **Executive KPI dashboard** (`/admin/insights`) — use the `audit-kpi-dashboard`
   skill: SQL views for revenue/day, orders/day, container throughput,
   signup→first-order conversion, wallet top-up volume; CAC once GA4 has data.
10. **CPC / CAC panel** — extend #9 to join GA4 conversions with Google/Meta ad
    spend. The "are the ads working" answer the company needs.
11. **Enable Dependabot** — free, GitHub-native.

### Tier 2 — post-launch, as roles/revenue grow

12. **Admin visibility panels** for rate-limit hits + captcha fails + Sentry-issue
    LINE alerts + notification delivery log (`W-6`) — make the monitoring tools
    *monitored*, not just active.
13. **Finish the in-house HR module gaps** (payroll/statutory) — **not Empeo**.
14. **PEAK reconciliation bridge** (`R-4`) and **NetBay e-declaration connect**
    (`R-11`) — build the bridge / connect the channel; don't rebuild accounting
    or customs filing.
15. **Playwright E2E** in CI — when a dedicated QA role exists.
16. **Figma + a content/MDX workflow** — if/when dedicated design + editor roles
    need them.

### 6.1 Sequencing notes

- Tier 0 #1–#4 are **prerequisites for #9–#10** — there is no CAC dashboard
  without active GA4 + ad pixels.
- **CI (#7) before** heavy post-launch feature work — every later BUILD item is
  safer behind an automated gate.
- The MOMO sync (#8) is also `W-4` in [`PACRED-MASTER-STRATEGY.md`](PACRED-MASTER-STRATEGY.md)
  §4 — coordinate so it is not double-built.

---

## 7. Cross-references

- 🔌 The "5 installed-and-forgotten" finding this verifies + extends →
  [`gap-integrations-tools.md`](gap-integrations-tools.md)
- 🎨 The frontend-role tooling slice this builds on →
  [`frontend-tooling-2026-05-18.md`](frontend-tooling-2026-05-18.md)
- 🎯 The 4-chain synthesis (W-4 MOMO sync, security/wallet chains) →
  [`PACRED-MASTER-STRATEGY.md`](PACRED-MASTER-STRATEGY.md)
- 🟢 The 9-env-var activation procedure →
  [`../runbook/launch-monitoring-golive-2026-05-17.md`](../runbook/launch-monitoring-golive-2026-05-17.md)
- 📊 The dashboard-build playbook → [`../../.claude/skills/audit-kpi-dashboard/SKILL.md`](../../.claude/skills/audit-kpi-dashboard/SKILL.md)
- 🔍 SEO state (Search Console pending) → [`../audit/seo-audit-2026-05-17.md`](../audit/seo-audit-2026-05-17.md)
- 🤝 Legacy integration credential inventory → [`../audit/php-pcscargo-integrations.md`](../audit/php-pcscargo-integrations.md)
- ⚠️ Don't scrub legacy carrier env stubs before switchover → [`../runbook/pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md)
- 📋 Roadmap items (`R-2`/`R-4`/`R-11`) → [`PACRED-GAP-ANALYSIS.md`](PACRED-GAP-ANALYSIS.md) · [`../PORT_PLAN.md`](../PORT_PLAN.md) Part W
- 📚 Research-folder index → [`_index.md`](_index.md)

**End — `tools-strategy-build-vs-buy-2026-05-18.md`.** The rule applied
everywhere: free + not-rebuildable → CONNECT; costs money + buildable → BUILD
in-ecosystem. Top CONNECT now = the 9 monitoring env vars + Search Console +
Google Business + Meta Suite (all free). Top BUILD instead of buy = the KPI
dashboard, the MOMO sync engine, CI, the CAC panel — and **finish the in-house
HR module rather than buy Empeo**. Nothing to kill; 5 tools to *activate* and
dead carrier env stubs to flag (not scrub).
