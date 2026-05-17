# 📡 รายงานสถานะ Platform — Platform Observability & Status-Reporting System — survey + design

> **Captured:** 2026-05-18 · **By:** observability-systems analyst (research worktree) · **Status:** R&D design — survey of what exists + design for the gap. **No code in this doc.**
>
> **The ask (owner พี่ป๊อป, relayed by เดฟ — paraphrased Thai):** a
> **platform status-reporting system** (รายงานสถานะ Platform) that —
> (1) collects log/telemetry across **all surfaces** — the public marketing
> site, the customer portal, the admin back-office, **and partners**;
> (2) exposes **KPIs to everyone** — every person, every department, Thai
> staff **and** overseas staff ("ไทยและเทศ"), partners, **and customers
> themselves**; (3) is analysable to drive a **marketing-conquest plan**
> ("ออกแผนการพิชิตการตลาด"); (4) provides **analyze + monitor**,
> always-on, 24/7; (5) **auto-captures bugs/errors with NO submit button**
> — "ถ้าเจอก็ส่งเลย" (if it finds one, it sends it) — and every error has
> a **lifecycle status the user can see**: what the bug is, whether it has
> been **reported** ("ส่งเรื่องแล้ว") or is **being worked on**
> ("กำลังดำเนินการ"); (6) goal — a smooth "feel-good" experience usable
> anywhere/anytime; (7) **pick what FITS Pacred's existing structure, and
> STAGE the build.**
>
> **Read with:**
> [`capability-tools-strategy-2026-05-18.md`](capability-tools-strategy-2026-05-18.md) — the master synthesis this is the 4th owner-system of ·
> [`internal-chat-system-2026-05-18.md`](internal-chat-system-2026-05-18.md) — owner system 1 (the `work_items` thread layer this borrows the "lifecycle-status-the-user-sees" pattern from) ·
> [`disbursement-system-2026-05-18.md`](disbursement-system-2026-05-18.md) — owner system 2 ·
> [`china-ops-container-closing-2026-05-18.md`](china-ops-container-closing-2026-05-18.md) — owner system 3 ·
> [`gap-integrations-tools.md`](gap-integrations-tools.md) — the **"5 tools installed-and-forgotten"** finding, directly load-bearing here ·
> [`tools-strategy-build-vs-buy-2026-05-18.md`](tools-strategy-build-vs-buy-2026-05-18.md) — the build-vs-buy matrix ·
> [ADR-0007 analytics + A/B](../decisions/0007-analytics-and-ab-testing.md) — the GTM/GA4/Clarity decision this extends ·
> [ADR-0002 admin architecture](../decisions/0002-admin-architecture.md) — `is_admin()` + the `admins` role model the audience-scoped RLS builds on.

---

## 0. TL;DR

1. **The capture *rails* are already wired — the *system* is missing.** Sentry,
   GTM/GA4, and Microsoft Clarity are all `npm`-installed, code-wired, and
   mounted in `app/layout.tsx` / `instrumentation*.ts` — but **every one is
   env-gated to a no-op** ([`gap-integrations-tools.md`](gap-integrations-tools.md)
   §2: "installed-and-forgotten"). And `admin_audit_log` (migration `0015`),
   the `/admin/kpi` executive dashboard, the `/admin/audit` log viewer, the
   `/admin/system/crons` cron-health panel, and the `cron_invocations` log
   (`0070`) all exist. **What does NOT exist:** a single place that *collects*
   errors with a *visible lifecycle status*, a *unified* internal event log
   across all four surfaces, KPI views *scoped per audience*, a *marketing-funnel
   rollup*, a *status page*, and *formal alert rules*. The owner is asking for
   the **system that sits on top of the rails** — and that system is genuinely
   net-new.
2. **The owner's hardest requirement — "no submit button, show me the status"
   — has a precedent in this very repo.** Owner system 1 (the internal-chat doc)
   already designs a job that *carries its own machine-readable status the user
   sees*. This system applies the **same pattern to errors**: an incident row
   with an `open → acknowledged → in_progress → resolved/ignored` lifecycle,
   auto-captured (no button), visible to the person who hit it. The error
   becomes a tracked object, exactly like a `work_item` becomes a tracked job.
3. **Build-vs-buy verdict (เดฟ's locked principle):** **CONNECT/keep** the three
   free capture rails Pacred cannot cheaply rebuild — Sentry (cross-browser
   crash capture), GA4 (public web analytics), Clarity (session replay). They
   are *rails*, not the system. **BUILD in-house** everything that holds Pacred's
   data: the incident-triage table + status lifecycle + triage UI, the unified
   internal event log, every KPI dashboard/view, the marketing-analytics rollup,
   the status page, the alert rules. Full table in §4.
4. **No new top-level architecture is needed.** The system is **additive**: new
   tables (`platform_incidents`, `platform_events`, rollup views), new
   capture rails (a React error boundary — *which does not exist today, a real
   gap* — a Server-Action error wrapper, a Sentry-webhook ingest route), a new
   `/admin/observability/*` route group, and **audience-scoped RLS** on the KPI
   views so customers + partners + overseas staff each see their own slice. It
   **reuses** `is_admin()` + the `admins` role model, the `sendNotification()`
   pipeline, `logAdminAction`, the cron harness, and the `audit-kpi-dashboard`
   skill's name→classify→source→query→render method.
5. **Staged, MVP-first.** Stage 1 (**MVP — IO-1**) = auto-incident capture +
   the visible status lifecycle + an `/admin/incidents` triage queue. That alone
   answers the owner's sharpest ask ("no submit button + show me the status").
   Stage 2 = the unified event log + per-department KPI panels. Stage 3 =
   audience-scoped views for partners/customers/overseas + the marketing rollup.
   Stage 4 = always-on monitoring + a status page + formal alert rules. §5–§9.
6. **Identity-clean.** This system collects **operational telemetry** — errors,
   events, page-views, funnel steps, uptime. It does **not** widen PII exposure:
   every capture rail strips cookies/auth headers (the existing
   `sentry.*.config.ts` `beforeSend` pattern), incident context stores a
   *role + a redacted user id*, never raw PII, and the audience-scoped RLS is
   *narrowing* — a customer sees fewer rows, never more. No marketing surface
   exports a customer's personal data; the "พิชิตการตลาด" rollup is aggregate
   funnel counts, not a contact list.

---

## 1. Why this matters — the strategic frame

Pacred **launched 2026-05-17**. The launch-day record itself is the argument
for this system. From [`../learnings/ci-and-deploy-gotchas.md`](../learnings/ci-and-deploy-gotchas.md)
(cross-referenced by [AGENTS.md](../../AGENTS.md) §11): a route-smoke gate
passed *against a deleted Supabase project* — public pages degraded to `200`
and protected pages `307`-redirected *before any DB query*, so "every route →
200/307" looked green while the database was gone. The team had **no
always-on signal** that would have screamed.

That is the shape of the gap. Pacred today can answer "did the build compile"
(`pnpm verify`) and "did a route 500 at deploy time" (the smoke gate) — but it
**cannot answer, at 3 a.m. on a Tuesday**:

- *Is a customer hitting a JavaScript error on the wallet page right now?*
- *Did the signup funnel's conversion rate just halve?*
- *Is the MOMO partner sync silently failing?*
- *Which department is the bottleneck this week — and can that department
  see its own number without asking accounting?*

The owner's request names the cure precisely. Break it into its parts:

| Owner's words (Thai) | What it means as a system requirement |
|---|---|
| "เก็บ log ทุกส่วน — เว็บหน้าบ้าน, หลังบ้าน, แอดมิน, พาร์ทเนอร์" | a telemetry pipeline that ingests events from **all four surfaces** + partners |
| "ให้ทุกคนเห็น KPI — ทุกแผนก ทุกคน ไทยและเทศ พาร์ทเนอร์ ลูกค้า" | **audience-scoped KPI views** — each role/partner/customer sees their slice |
| "เอาไปวิเคราะห์ออกแผนการพิชิตการตลาด" | a **marketing-analytics rollup** (funnel + CAC/CPC) feeding a conquest plan |
| "วิเคราะห์ + monitor ตลอด 24 ชม." | an **always-on monitoring** loop, not a manual check |
| "เจอบั๊กส่งเลย ไม่มีปุ่มส่ง — เห็นสถานะว่าส่งเรื่องแล้ว / กำลังดำเนินการ" | **auto-incident capture** (no submit button) + a **visible status lifecycle** |
| "ใช้ที่ไหนเมื่อไหร่ก็ได้ รู้สึกดี" | mobile-first, fast, low-friction surfaces |

The first three sibling owner-systems each cured a *flow* gap (work-comms,
disbursement, China-ops). This one cures the **observability** gap — the org's
inability to *see itself*. It is the supervisory nervous system: the other
three systems *generate* events; this one *collects, exposes, and alerts on*
them. It is also the system that makes the [`capability-tools-strategy`](capability-tools-strategy-2026-05-18.md)
synthesis's "every tool kept must be **monitored + producing measurable
results**" principle actually enforceable — because it builds the place those
measurements live.

---

## 2. Survey — what Pacred already HAS

This section reads the actual files. Every claim cites a path.

### 2.1 The three external capture rails — wired, env-gated to no-ops

[`gap-integrations-tools.md`](gap-integrations-tools.md) §2 is the authoritative
finding and this survey **confirms it file-by-file**. All three are real SDK
installs, correctly code-wired, and **switched off** by a missing env var.

#### Sentry — cross-browser + server crash capture

| Fact | Evidence |
|---|---|
| SDK installed + build-integrated | `@sentry/nextjs`; `instrumentation.ts` calls `register()` → imports `sentry.server.config.ts` / `sentry.edge.config.ts`; `instrumentation-client.ts` inits the browser SDK |
| Server errors auto-forwarded | `instrumentation.ts` exports `onRequestError = Sentry.captureRequestError` — "captures errors thrown in Server Components, Route Handlers, and Server Actions even when `logger.error()` is not called explicitly" |
| Router breadcrumbs | `instrumentation-client.ts` exports `onRouterTransitionStart = Sentry.captureRouterTransitionStart` |
| `logger.error()` bridges to Sentry | `lib/logger.ts` header: "prod + `SENTRY_DSN` set: `error()` calls also forwarded to Sentry" |
| PII guard already present | both `sentry.*.config.ts` `beforeSend` strips `request.cookies` + `authorization`/`cookie` headers |
| Performance traces | `tracesSampleRate` = 0.1 prod / 1.0 dev |
| **Switched off** | `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` unset → `Sentry.init` never runs → **no-op** |
| Session replay off | `instrumentation-client.ts`: `replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 0` |

→ **Sentry is the cross-browser crash-capture rail.** It captures uncaught JS
errors, unhandled promise rejections, and server exceptions across every
browser a customer uses — the one thing in this list Pacred genuinely *cannot*
cheaply rebuild (it would mean writing a cross-browser error serialiser, a
source-map symbolicator, and an ingestion backend). One env var activates it.

#### GTM + GA4 — public web analytics + conversion funnel

| Fact | Evidence |
|---|---|
| Container loader wired | `components/analytics/gtm-script.tsx` — `GtmScript` injects the GTM bootstrap, `GtmNoscript` the `<iframe>` fallback; both mounted in `app/layout.tsx` (`<head>` + `<body>`) |
| Typed event vocabulary | `lib/analytics.ts` — 9 GA4-recommended event helpers: `trackSignUp`, `trackLogin`, `trackSignOut`, `trackGenerateLead`, `trackPlaceOrder`, `trackWalletDeposit`, `trackWalletWithdrawRequest`, `trackCtaClick`, `trackExperimentExposure` |
| Events already called in app code | per [ADR-0007](../decisions/0007-analytics-and-ab-testing.md) — fired from register/login/contact/3 order forms/wallet forms/CTA banners |
| **Switched off** | `NEXT_PUBLIC_GTM_ID` unset → `GtmScript` returns `null`, `track()` early-returns (dev: `console.log("[analytics:no-gtm]")`) |

→ **GA4 is the public-web-analytics rail** — page-views, traffic sources,
the find→convert funnel for anonymous visitors. The funnel-event *vocabulary*
is already designed and called; only the pipe is unplugged.

#### Microsoft Clarity — session replay + heatmaps

| Fact | Evidence |
|---|---|
| Tag loader wired | `components/analytics/clarity-script.tsx` — `ClarityScript` injects the Clarity tag; mounted in `app/layout.tsx` `<head>` |
| Helpers | `lib/analytics.ts` — `clarityTag`, `clarityEvent`, `clarityIdentify` (the last takes a `profileId`, "never PII") |
| **Switched off** | `NEXT_PUBLIC_CLARITY_ID` unset → `ClarityScript` returns `null` |

→ **Clarity is the session-replay rail** — heatmaps + recordings of where
customers stall/abandon. Free at any scale, auto-masks form inputs (ADR-0007).

> **Two other "installed-and-forgotten" tools** ([`gap-integrations-tools.md`](gap-integrations-tools.md)
> §2) — **Upstash Redis** (rate-limit; `lib/rate-limit.ts`, falls back to an
> in-memory `Map`) and **hCaptcha** (`lib/hcaptcha.ts`). These are *security*
> rails, out of scope for this *observability* doc — but the design notes that
> **rate-limit hits and captcha failures are exactly the kind of event the
> unified event log (Stage 2) should ingest**, since the gap-doc flags "no
> admin visibility of rate-limit hits / captcha fails" for both.

### 2.2 `admin_audit_log` — the admin action trail (migration `0015`)

The one telemetry stream Pacred **does** own end-to-end today.

| Fact | Evidence |
|---|---|
| Table | `0015_admin_rbac.sql` — `admin_audit_log(id, admin_id, action, target_type, target_id, payload jsonb, created_at)` |
| Written by | `lib/auth/require-admin.ts::logAdminAction` (called by every admin Server Action — `actions/admin/*`) |
| Indexes | `admin_audit_log_admin_idx (admin_id, created_at desc)`, `admin_audit_log_target_idx (target_type, target_id)` |
| RLS | `admin_audit_log_select` — `using (public.is_admin())` — any admin reads; writes via service-role |
| Search UI | `app/[locale]/(admin)/admin/audit/page.tsx` — filter by admin member_code / action prefix / target_type / target_id / date range |
| CSV export | `app/api/admin/audit/export/route.tsx` — `≤10k` rows |
| Hardened by | `0062_rls_role_pin_money_pii.sql` — every `wallet_transactions` write logs here |

→ `admin_audit_log` answers **"who did what to which admin target, when."** It
is a *deliberate-action* log — it does **not** capture *errors*, *page-views*,
*customer events*, or *partner activity*. It is one input to the unified event
log (Stage 2), not a replacement for it. **A separate `hr/audit` page also
exists** (`app/[locale]/(admin)/admin/hr/audit/page.tsx`) — HR-scoped, same
table family.

### 2.3 `/admin/kpi` — the executive dashboard (Tier 1, shipped)

| Fact | Evidence |
|---|---|
| Page | `app/[locale]/(admin)/admin/kpi/page.tsx` — header comment: "Executive KPI dashboard (Tier-1 / G-A-1)" |
| Built per | the `audit-kpi-dashboard` skill — "name → classify → source → query → render" |
| Data | live from existing Supabase tables via `createAdminClient()` (RLS bypass) — **no migration, no SQL view**; `export const dynamic = "force-dynamic"` refreshes on every visit |
| KPIs shown | revenue (month/today/vs-prev-month) by 3 channels · orders by status · containers in-transit/arrived · signups · wallet top-up volume + total held |
| RBAC | `requireAdmin(["ops", "accounting", "sales_admin"])` — office roles only; "floor-ops roles (driver/warehouse) shouldn't see company-wide revenue" |
| Nav | `components/sections/admin-sidebar.tsx` line 26 — `/admin/kpi`, gated `roles: ["ops","accounting","sales_admin"]` |

→ `/admin/kpi` is **one dashboard, one audience (office staff), recomputed
live on each load.** It proves the pattern works — but it is *not*
per-department, *not* visible to partners/customers/overseas staff, and its
live-recompute (8 parallel `Promise.all` queries per visit) will not scale to
"everyone sees a dashboard 24/7." Stage 2/3 generalise it; Stage 2 adds rollup
views so dashboards stay fast.

### 2.4 The `audit-kpi-dashboard` skill — the dashboard-building method

`.claude/skills/audit-kpi-dashboard/SKILL.md` codifies the repeatable pattern:
**name** the metric → **classify** it (count / rate / duration / inventory /
composition) → **identify** source (Supabase tables · GA4/Clarity · admin
module tables) → **write** the query (define a `CREATE VIEW kpi_<name>` if
reused) → **render** (admin page · markdown · CSV) → **capture** refresh
cadence → **cross-link** from `STRATEGY.md`. Its "recommended starter
dashboard" table even lists *"Sentry error count (last 24h) — Source: Sentry
API — Production stability"* as a KPI — i.e. the skill already anticipates this
system. **The KPI work in Stages 2-3 should be executed *through* this skill**,
not freehand.

### 2.5 The notifications system (`lib/notifications/*`)

| Fact | Evidence |
|---|---|
| Tables | `0014_notifications.sql` — `notifications` (append-only per-user event log) + `notification_reads`; `0070` added `delivery_status` + `delivery_error` columns |
| Sender | `lib/notifications/index.ts::sendNotification(profileId, payload)` — inserts the row, then LINE Messaging API push → email fallback; `LINE_PUSH_BYPASS` (default `true`) console-logs in dev |
| Categories | `lib/notifications/types.ts::NotifyCategory` — `order · payment · forwarder · yuan_payment · wallet · sales · system · promo · sales_digest` |
| Reference types | `NotifyReferenceType` — `service_order · forwarder · yuan_payment · wallet_transaction · sales_commission · sales_payout · contact_message` |
| Admin can target | `0015` added `notifications_admin_all` — an admin *is* a `profiles` row, so `sendNotification(adminProfileId, …)` already works mechanically (the internal-chat doc §4.2 verified this) |
| Admin UI | `app/[locale]/(admin)/admin/system/notifications/page.tsx` |

→ The notifications system is the **alert-delivery rail** this design reuses.
A new high-severity incident → `sendNotification(devProfileId, { category:
'observability', … })` rides the *exact* shipped pipeline (LINE push + email),
needing only **one new `NotifyCategory`** (`'observability'`) + **one new
`NotifyReferenceType`** (`'platform_incident'`). Zero new delivery code.

### 2.6 `/admin/system/crons` — the cron-health panel (U4-1, shipped)

| Fact | Evidence |
|---|---|
| Page | `app/[locale]/(admin)/admin/system/crons/page.tsx` |
| Log table | `cron_invocations` (migration `0070_supervisory_layer.sql`) — append-only, one row per cron run: `cron_path, fired_at, finished_at, duration_ms, status (success/failure/partial), result_summary jsonb, error_message` |
| Registry | `lib/cron/registry.ts::CRON_REGISTRY` — hand-maintained mirror of `vercel.json` crons, each with a label + Thai description |
| Instrument | `lib/cron/instrument.ts` writes the `cron_invocations` row |
| Shows | per cron: last fire · 7-day success rate · last error · duration; flags orphan paths |
| RLS | `cron_invocations` SELECT = super + ops |

→ The cron-health panel is **a working precedent for exactly this system, at
one-domain scale.** It already does append-only telemetry capture
(`cron_invocations`) + a status enum (`success/failure/partial`) + a
health-rollup UI + orphan detection. **Stage 4's always-on monitoring
generalises this** — `cron_invocations` becomes one of several monitored
signals, the cron panel one tab of the status page. The design **reuses its
shape deliberately**: append-only log + status enum + 7-day rollup is the
proven Pacred pattern.

### 2.7 The `work_items` work-board (Tier 2 — migration `0080`)

| Fact | Evidence |
|---|---|
| Table | `0080_work_items.sql` — a thin **additive overlay**: `(entity_type, entity_ref)` polymorphic pointer to a domain row + assignment (`assigned_role`, `assigned_to`) + lifecycle (`status: open/in_progress/blocked/done/cancelled`, `priority`, `due_at`, `note`) |
| Surfaces | `/admin/board` (cross-department board) + `/admin/board/inbox` (per-role inbox) |
| Actions | `actions/admin/work-items.ts` — `withAdmin(["super","ops"])`, optimistic `.eq("status", expectedFrom)` race-guard |
| Find-or-create | `ensure_work_item()` SECURITY DEFINER — idempotent, called best-effort by domain actions |
| Nav | `admin-sidebar.tsx` lines 31-35 — `/admin/board` + `/admin/board/inbox`, **no `roles` restriction** ("every department needs the shared board") |

**Design decision — incidents are a SEPARATE table (`platform_incidents`), NOT
a `work_item` kind.** Justification:

| Criterion | A `work_item` is… | A `platform_incident` is… | Verdict |
|---|---|---|---|
| Origin | created by a human / a domain status-change | **auto-created by a capture rail** (error boundary fires) — no human, no domain row | different |
| Dedupe | one row per real job; no fingerprinting | needs a **`fingerprint` + `occurrence_count`** — the *same* error fires 500×, that is **one** incident | different |
| Shape | `(entity_type, entity_ref)` points at a domain row | carries `message`, `stack`, `route`, `source` — **no domain row to point at** | different |
| Volume | tens-to-hundreds of live jobs | potentially **thousands of raw error hits/day** — would swamp `/admin/board` |  separate |
| Lifecycle | `open→in_progress→done` (work) | `open→acknowledged→in_progress→resolved/ignored` (triage — note the **`ignored`** + **`acknowledged`** states work doesn't have) | different |
| Audience | internal staff only | the **status is visible to the customer who hit it** (the owner's core ask) — work_items has *no customer policy* | different |

Forcing incidents into `work_items` would mean a `fingerprint` column unused by
9 of 10 work types, an `occurrence_count` likewise, a polymorphic
`(entity_type, entity_ref)` that is always null for an error, and a board that
drowns. **`platform_incidents` is its own table — but it borrows the
*lifecycle-status-the-user-sees* pattern the internal-chat doc designed for
`work_items`.** Where they *do* meet: a triaged incident that needs a code fix
**MAY** spawn a `work_item` (a `doc_issue` / `general` kind) via the existing
`ensure_work_item()` — the link is `platform_incidents.work_item_id` (optional
FK). Incident = "something broke + its triage status"; work_item = "a human
must now do the fix." One bridges to the other; neither is the other.

### 2.8 Error boundaries — the genuine gap

```
$ find app -name "error.tsx" -o -name "global-error.tsx"
(no results)
```

**There is no React error boundary anywhere in `app/`.** Next.js App Router
supports `error.tsx` (per-segment) and `global-error.tsx` (root) — Pacred
defines neither. Today, a client-side render error shows the **default Next.js
error screen** (an un-branded "Application error"), and — critically — **nothing
captures it into a Pacred-owned store** (Sentry *would*, if its DSN were set,
but Sentry's data lives in Sentry, not in Pacred's ecosystem).

→ This is the **single most important new capture rail** the system must build,
and it is the literal mechanism behind the owner's "no submit button": a
`global-error.tsx` (+ optionally per-group `error.tsx`) that, on mount,
**auto-`POST`s the error to a Pacred ingest route** — the customer never clicks
"report," the boundary reports for them. Stage 1 builds it.

### 2.9 Survey verdict — the gap in one table

| Owner requirement | Today | Gap |
|---|---|---|
| Collect log/telemetry across public · portal · admin · **partner** | Sentry/GA4/Clarity wired but **off**; `admin_audit_log` covers admin actions only; `cron_invocations` covers crons only | **NEW: a unified `platform_events` log + capture rails on all 4 surfaces** (Stage 2) |
| Auto-capture bugs with **no submit button** | no React error boundary at all (§2.8); Sentry off | **NEW: `global-error.tsx` + Server-Action error wrapper + Sentry-webhook ingest → `platform_incidents`** (Stage 1) |
| Each error has a **visible lifecycle status** | nothing — errors are invisible | **NEW: `platform_incidents.status` (open→acknowledged→in_progress→resolved/ignored) surfaced to the user** (Stage 1) |
| KPIs visible to **everyone** — every dept, Thai+overseas staff, partners, customers | `/admin/kpi` = one dashboard, office roles only | **NEW: audience-scoped KPI views + RLS** (Stage 3) |
| Analysable for a **marketing-conquest plan** | GA4 events defined but unplugged; no funnel rollup | **NEW: marketing-analytics rollup (find→convert→buy funnel, CAC/CPC)** (Stage 3) |
| **Analyze + monitor 24/7** always-on | manual `/admin/kpi` visit; `pnpm verify` is manual | **NEW: uptime/health checks + scheduled rollup crons + a status page** (Stage 4) |
| Formal **alerting** (error spike → war-room) | none — `sms-balance-check` cron is the *only* monitoring loop with an alert | **NEW: alert-rule engine on top of the event log, reusing `sendNotification()`** (Stage 4) |
| Smooth, mobile-first, anywhere/anytime | `/admin/kpi` is mobile-readable; no public status page | **NEW: mobile-first observability surfaces + a public/internal status page** (Stage 1 incidents widget + Stage 4 status page) |

---

## 3. The reference model — what good observability looks like

Pacred is assembling a pattern many platforms run. The decoded sources +
industry-standard shape give the template; the design adapts it to Pacred's
existing structure rather than importing a SaaS wholesale.

### 3.1 The four planes of an observability system

```
┌─ CAPTURE ─────────────────────────────────────────────────────────┐
│  rails that emit events:  error boundary · action wrapper ·       │
│  webhook ingest · analytics tags · uptime probe · cron instrument │
├─ STORE ───────────────────────────────────────────────────────────┤
│  Pacred-owned tables:  platform_incidents (triaged errors) +      │
│  platform_events (the unified append-only log) + rollup views     │
├─ EXPOSE ──────────────────────────────────────────────────────────┤
│  audience-scoped surfaces:  /admin/observability/* dashboards ·   │
│  per-department KPI panels · partner slice · customer's own view  │
│  · the incident-status widget · the status page                  │
├─ ALERT ───────────────────────────────────────────────────────────┤
│  rules over the store:  new high-sev incident → notify dev ·      │
│  error spike → war-room · uptime fail → page on-call              │
└───────────────────────────────────────────────────────────────────┘
```

Pacred has **fragments of CAPTURE** (3 rails off, 2 narrow logs on), **a
fragment of STORE** (`admin_audit_log`, `cron_invocations`), **a fragment of
EXPOSE** (`/admin/kpi`, `/admin/audit`, `/admin/system/crons`), and **a single
ALERT loop** (`sms-balance-check`). This system completes all four planes.

### 3.2 The "tool keeps its own status" pattern — borrowed from owner system 1

The internal-chat doc ([`internal-chat-system-2026-05-18.md`](internal-chat-system-2026-05-18.md)
§3) designs a job that *carries a machine-readable `waiting_for` block the user
sees* — "every job surfaces owner · blocked-on · waiting-for." The owner's
error-lifecycle ask is the **same idea applied to an error**:

| internal-chat `work_item` | `platform_incident` |
|---|---|
| `current_stage` — what step | `kind` — `js_error` / `server_error` / `failed_action` / `api_error` |
| `assigned_role` / `assigned_to` — whose desk | `assignee` — which dev owns the triage |
| `waiting_reason` — *why* it is stuck | `status` — `open` / `acknowledged` / `in_progress` / `resolved` / `ignored` |
| the customer sees the shipment timeline | **the user who hit the error sees its triage status** |

The owner said it in plain Thai: the user should see *"ส่งเรื่องแล้ว"* (the
incident was captured + reported) and *"กำลังดำเนินการ"* (a dev is on it). That
maps **directly** onto `status`: `open` = captured ("ส่งเรื่องแล้ว — the system
already filed it"), `acknowledged`/`in_progress` = "กำลังดำเนินการ",
`resolved` = "แก้แล้ว". The pattern is proven in this repo — this system
reuses it, it does not invent it.

### 3.3 The "no submit button" mechanic

"ถ้าเจอก็ส่งเลย" — the system, not the user, files the report. Three capture
rails make this literal, none with a button:

1. **A React error boundary** (`global-error.tsx`) — when a client render
   throws, the boundary component **`POST`s the error to an ingest route on
   mount** (in a `useEffect`). The customer sees a friendly branded screen +
   *"ระบบบันทึกปัญหานี้แล้ว"* ("we've logged this") — and the incident is
   already in `platform_incidents` before they could have found a button.
2. **A Server-Action error wrapper** — a thin `withObservability()` wrapper (or
   an extension of the existing `actions/admin/common.ts::withAdmin`) that
   `catch`es a thrown Server Action error, files a `platform_incidents` row
   (`kind='failed_action'`), and re-throws. The staff member sees the action
   fail normally; the incident is filed automatically.
3. **A Sentry-webhook ingest route** — Sentry (once its DSN is set) already
   captures cross-browser crashes; a Sentry *alert webhook* `POST`s new issues
   to `app/api/webhooks/sentry/route.ts`, which **upserts a `platform_incidents`
   row**. This pulls Sentry's superior cross-browser capture *into Pacred's
   own store* — so the triage status lives in Pacred, queryable by Pacred RLS,
   visible on Pacred surfaces. (Sentry stays the *rail*; Pacred owns the
   *system* — the build-vs-buy line, §4.)

No surface anywhere has a "Report a bug" button. Every rail is automatic.

### 3.4 Identity boundary — what this design refuses to do

Observability is a PII-sensitive area; the design is explicit about its limits:

- ✅ **Operational telemetry** — error messages, stack traces, route paths,
  event names, page-view counts, funnel-step counts, uptime, latency. Captured.
- ✅ **A *role* + a *redacted user id*** on an incident — so triage knows
  "a `warehouse`-role user on `/admin/...` hit this" without storing who.
  Mirrors `lib/logger.ts::redactId`.
- ✅ **Aggregate marketing funnel counts** — "1,240 visitors → 88 signups → 12
  orders this week, channel = google_ads." Counts, not people.
- ❌ **NOT** raw cookies / auth headers in any captured payload — the capture
  rails strip them, copying the `sentry.*.config.ts` `beforeSend` pattern.
- ❌ **NOT** a customer contact list in the "พิชิตการตลาด" rollup — the
  conquest plan is driven by *funnel shape + channel attribution*, never by
  exporting personal data. A marketing list is a CRM concern, out of scope.
- ❌ **NOT** widening any customer's data view — the audience-scoped RLS (§8) is
  *narrowing*: a customer sees **their own** order/shipment KPIs and **their
  own** incident statuses, never another customer's, never company aggregates.

Every number this system shows a non-admin is either *their own* or an
*aggregate* — never another individual's personal data.

---

## 4. Build-vs-buy — the verdict

เดฟ's locked principle ([`capability-tools-strategy`](capability-tools-strategy-2026-05-18.md)):
**"anything that costs money and Pacred CAN build → build it. Every tool kept
must be genuinely used + monitored + producing measurable results."**

The line for *observability* is clean: **buy/connect the capture rails Pacred
cannot cheaply reproduce; build everything that stores, exposes, or alerts on
the data — so the data stays in Pacred's ecosystem.**

| Concern | Verdict | Why |
|---|---|---|
| **Cross-browser crash capture** (uncaught JS errors across every browser, source-map symbolication) | **CONNECT — Sentry** (already wired; set `SENTRY_DSN`) | Rebuilding a cross-browser error serialiser + symbolicator is weeks of work for a worse result. Free tier (5k err/mo). It is a **rail**. |
| **Public web analytics** (page-views, traffic sources, anonymous funnel) | **CONNECT — GA4 via GTM** (already wired; set `NEXT_PUBLIC_GTM_ID`) | Pacred cannot rebuild Google's analytics backend; GTM also carries future Meta/TikTok pixels (ADR-0007). Free. A **rail**. |
| **Session replay + heatmaps** (where customers stall/abandon) | **CONNECT — Microsoft Clarity** (already wired; set `NEXT_PUBLIC_CLARITY_ID`) | Free at any scale, PDPA-friendly auto-masking (ADR-0007). Rebuilding session-replay is absurd. A **rail**. |
| **Uptime / health probing** (is the site + DB up, 24/7) | **BUILD — a Vercel-cron health probe** | Trivial to build (a cron hitting health endpoints); a paid uptime SaaS (Pingdom/Betterstack) costs monthly for what one cron + the existing `cron_invocations` pattern does. §9. |
| **The incident-triage table + status lifecycle** (`platform_incidents`) | **BUILD** | The owner's core ask — a *visible* lifecycle status — needs the data *in Pacred's DB*, queryable by Pacred RLS, surfaced on Pacred pages. A SaaS issue-tracker keeps it in the SaaS. |
| **The triage UI** (`/admin/incidents`) | **BUILD** | An admin page over `platform_incidents` — same shape as the shipped `/admin/audit` + `/admin/system/crons`. |
| **The unified internal event log** (`platform_events`) | **BUILD** | Cross-surface event taxonomy owned by Pacred; extends the `admin_audit_log` posture. Keeps the data in the ecosystem. |
| **All KPI dashboards + views** | **BUILD** — via the `audit-kpi-dashboard` skill | `/admin/kpi` already proves it; per-department + audience-scoped panels are more of the same. A BI SaaS (Metabase/Looker) costs money + splits data out. |
| **The marketing-analytics rollup** (CAC/CPC funnel) | **BUILD** — fed by *free* GA4 + Meta ad data | The synthesis already says "a CPC/CAC panel fed by free Google/Meta ad data" → build. The conquest plan is a Pacred artifact. |
| **The status page** (internal + public) | **BUILD** | A page over the health + incident data. A status-page SaaS (Statuspage.io) costs monthly for a page Pacred can render. |
| **The alert-rule engine** | **BUILD** — on top of `sendNotification()` | Alerting = a query over `platform_events`/`platform_incidents` + a `sendNotification()` call. The delivery rail (LINE + email) is already shipped. No SaaS. |

**Summary line:** **3 rails connected** (Sentry · GA4 · Clarity — free, not
rebuildable, one env var each). **Everything else built in-house** — incident
triage + status lifecycle, the unified event log, every dashboard, the
marketing rollup, the status page, the alert rules. The owner's "keep it inside
Pacred's ecosystem" instinct is satisfied: the *rails* may emit to Google/Sentry,
but the **system of record — every incident, its triage status, every KPI — is
a set of Pacred Postgres tables under Pacred RLS.**

> **Pre-requisite, not part of this build:** setting the 3 (really 6) env vars
> is `gap-integrations-tools.md` G-2 + the [`launch-monitoring-golive-2026-05-17.md`](../runbook/launch-monitoring-golive-2026-05-17.md)
> runbook — a ก๊อต/เดฟ dashboard action, ~15 min. This system *consumes* the
> rails; it does not own flipping them on. Stage 1's Sentry-webhook ingest is
> moot until `SENTRY_DSN` is set — so the env-var flip is Stage 1's one
> external dependency.

---

## 5. Design overview — the observability system

Four planes (§3.1), all additive on the existing structure. No new top-level
architecture.

```
┌─────────────────────────────────────────────────────────────────────┐
│ CAPTURE — rails that emit (Stage 1 + Stage 2)                        │
│   global-error.tsx + per-group error.tsx  → auto-POST client errors  │
│   withObservability() Server-Action wrapper → failed_action          │
│   app/api/webhooks/sentry/route.ts        → Sentry issues ingest     │
│   app/api/observability/ingest/route.ts   → the client-error sink    │
│   GA4 / Clarity tags (existing) + event emit helpers → events        │
│   Vercel-cron health probe (Stage 4)      → uptime/latency           │
├─────────────────────────────────────────────────────────────────────┤
│ STORE — Pacred-owned tables (Stage 1 + Stage 2)                      │
│   platform_incidents   — triaged errors + the visible status         │
│   platform_events      — the unified append-only cross-surface log   │
│   v_kpi_* rollup views — fast aggregates for dashboards              │
├─────────────────────────────────────────────────────────────────────┤
│ EXPOSE — audience-scoped surfaces (Stage 1 → Stage 4)                │
│   /admin/incidents              — the triage queue (Stage 1)         │
│   incident-status widget        — what the USER sees (Stage 1)       │
│   /admin/observability/*        — per-dept + exec KPI panels (St. 2) │
│   partner / customer / overseas scoped KPI views (Stage 3)           │
│   /status (+ /admin/status)     — the status page (Stage 4)          │
├─────────────────────────────────────────────────────────────────────┤
│ ALERT — rules over the store (Stage 1 seed → Stage 4 engine)         │
│   new high-sev incident → sendNotification(dev/ก๊อต)  (Stage 1)      │
│   error spike · uptime fail · funnel drop → alert rules (Stage 4)    │
└─────────────────────────────────────────────────────────────────────┘
        ▼ reuses ▼
   is_admin() + admins roles · sendNotification() · logAdminAction ·
   the cron harness (cron_invocations / registry / instrument) ·
   the audit-kpi-dashboard skill · the Sentry/GA4/Clarity rails.
```

**The design principle:** every surface that *generates* activity (a customer
page-view, an admin action, a partner sync, a thrown error) gets a **rail** that
emits a row into a **Pacred-owned table**; every audience that needs to *see*
gets a **scoped view**; every condition that needs a *human* gets an **alert
rule**. The system is the connective tissue — it adds no domain logic, it
*observes* the domain that already exists.

### 5.1 Migration numbering — TBD, must be coordinated

The highest migration on `dave` today is **`0080_work_items.sql`** (with
`0073`-`0079` an active **ภูม-owned** sequence and `0081`+ also **ภูม-owned** —
per [`capability-tools-strategy`](capability-tools-strategy-2026-05-18.md) Work
Split). **`0080` was a deliberate เดฟ-reserved block clear of ภูม's range.**

→ **This system's migrations are TBD and MUST be coordinated with ภูม** —
do **not** hard-pick a number in this doc. The internal-chat doc (owner system
1) provisionally claimed `0081`; the disbursement + china-ops docs both
provisionally claimed `0073`-`0075`. Those overlap, and all three predate this
doc. **The build that schedules first claims its numbers; this doc names its
migrations by *content* — `<NNNN>_platform_incidents.sql`,
`<NNNN>_platform_events.sql`, `<NNNN>_observability_rollups.sql` — and the
implementer fixes `NNNN` against the live `supabase/migrations/` + a check-in
with ภูม.** All migrations are additive + idempotent (`if not exists` /
`drop … if exists`), zero data migration, safe on prod live — the house style.

---

## 6. Stage 1 (MVP — IO-1) — auto-incident capture + the visible status lifecycle

> **The MVP. This stage alone answers the owner's sharpest ask** — "no submit
> button + show me the status." Sibling docs use an "MVP IC-1 / D1 / CN-1"
> first-phase; this is **IO-1** (Incident Observability, phase 1).

### 6.1 What IO-1 delivers

An error anywhere on the platform is **auto-captured** (no button), **deduped**
into a `platform_incidents` row with an **occurrence count**, given a
**triage lifecycle status**, surfaced on an **`/admin/incidents` triage queue**,
**auto-notifies a dev** on a new high-severity incident, and — the owner's
headline — **shows the person who hit it a friendly, honest status** (filed →
being worked on → resolved).

### 6.2 Schema — `platform_incidents`

Migration `<NNNN>_platform_incidents.sql` (§5.1 — number TBD/coordinated).

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid PK | |
| `fingerprint` | text not null | **dedupe key** — a stable hash of `(kind, normalised message, route)`. The *same* error fires N times → **one** incident, `occurrence_count` increments. Computed by the ingest route. A partial-unique index `(fingerprint) where status not in ('resolved','ignored')` keeps one *live* incident per fingerprint. |
| `source` | text CHECK | which surface — `public` (marketing site) · `portal` (customer) · `admin` (back-office) · `partner` · `server` |
| `kind` | text CHECK | `js_error` · `server_error` · `failed_action` · `api_error` |
| `severity` | text CHECK | `low` · `medium` · `high` · `critical` — set by an ingest-time rule (e.g. a money-path route → `high`; a server 500 → `high`) |
| `status` | text CHECK | **the lifecycle the owner asked for** — `open` → `acknowledged` → `in_progress` → `resolved` / `ignored`. §6.4 |
| `title` | text not null | short human label — derived from the error message, truncated |
| `message` | text not null | the error message |
| `stack` | text | the stack trace (PII-stripped) — nullable |
| `route` | text | the path the error happened on — e.g. `/wallet/deposit` |
| `surface_meta` | jsonb | small bag — browser/OS for `js_error`, action-name for `failed_action`, HTTP status for `api_error`. **No cookies, no auth headers, no PII.** |
| `actor_role` | text | the role of whoever hit it — `customer` / an `admins.role` / `partner` / `anon`. **A role, not an identity.** |
| `actor_ref` | text | a **redacted** user id (via `redactId`) — nullable; lets triage correlate "same user, 3 incidents" without storing who |
| `occurrence_count` | int not null default 1 | how many times this fingerprint has fired |
| `first_seen_at` | timestamptz not null default now() | first occurrence |
| `last_seen_at` | timestamptz not null default now() | most recent occurrence — bumped on every re-fire |
| `assignee_admin_id` | uuid → profiles | the dev who owns the triage — nullable until acknowledged |
| `acknowledged_at` / `resolved_at` | timestamptz | lifecycle stamps |
| `resolution_note` | text | what was done — required when `status='resolved'` (CHECK) |
| `work_item_id` | uuid → work_items(id) | **optional** — set if the triage spawned a fix job (§2.7 bridge) |
| `sentry_issue_url` | text | deep-link to the Sentry issue, when the row came via the Sentry webhook |
| `created_at` / `updated_at` | timestamptz | `updated_at` via the existing `set_updated_at()` trigger |

**Consistency CHECKs (fail-closed, copying the `work_items` / `refund_requests`
posture):**
- `status='resolved'` ⇒ `resolved_at` NOT NULL AND `resolution_note` NOT NULL.
- `status IN ('acknowledged','in_progress','resolved')` ⇒ `acknowledged_at`
  NOT NULL AND `assignee_admin_id` NOT NULL.
- `occurrence_count >= 1`; `last_seen_at >= first_seen_at`.

**Indexes:** `(status, last_seen_at desc)` (the triage queue's primary query),
`(fingerprint)` partial-unique on live statuses (dedupe), `(source, kind)`
(filtering), `(actor_ref) where actor_ref is not null` (per-user correlation),
`(severity, status) where status='open'` (the alert scan).

### 6.3 The capture rails — IO-1 builds three, all button-less

| Rail | What it is | What it does |
|---|---|---|
| **`app/global-error.tsx`** (+ optional per-group `app/[locale]/(protected)/error.tsx`, `(admin)/error.tsx`, `(public)/error.tsx`) | the React error boundary §2.8 — *does not exist today* | a `"use client"` boundary; on mount (`useEffect`) it `POST`s `{ message, stack, route, kind:'js_error' }` to the ingest route; renders a **branded, friendly** fallback ("ขออภัย เกิดข้อผิดพลาด — ระบบบันทึกปัญหานี้แล้ว ทีมงานกำลังตรวจสอบ") + a "ลองใหม่" / "กลับหน้าหลัก" CTA |
| **`withObservability()` Server-Action wrapper** | a thin wrapper — or an extension of `actions/admin/common.ts::withAdmin` | `try`/`catch` around the action body; on a thrown error, files a `platform_incidents` row (`kind='failed_action'`, `surface_meta.action=<name>`) then re-throws so the caller still sees the failure |
| **`app/api/webhooks/sentry/route.ts`** | a webhook ingest route — note `app/api/webhooks/` *does not exist yet* ([`gap-integrations-tools.md`](gap-integrations-tools.md) G-5), so IO-1 also creates the directory **with signature verification baked in** | receives Sentry's "new issue" alert webhook → upserts a `platform_incidents` row (`source` per Sentry tags, `sentry_issue_url` set). **Verifies the Sentry webhook signature** — closing the "open partner webhook" leak class by construction |
| **`app/api/observability/ingest/route.ts`** | the sink the error boundary `POST`s to | computes the `fingerprint`, **upserts**: if a live incident with that fingerprint exists → `occurrence_count++` + bump `last_seen_at`; else insert a new `open` row. Rate-limited (reuse `lib/rate-limit.ts`) so a hostile client cannot flood it. Strips any PII before insert. |

> **Why an *own* ingest route when Sentry exists?** Sentry captures the JS
> error too — but Sentry's data lives *in Sentry*. The owner wants the
> *status* visible *to the user, on a Pacred page*. That needs the incident in
> *Pacred's* DB. The own ingest route + the Sentry webhook are **complementary**:
> the boundary's direct `POST` gives Pacred the row *immediately* (even if
> `SENTRY_DSN` is unset); the Sentry webhook *enriches* it with Sentry's
> superior cross-browser grouping when the DSN is set. The Pacred row is always
> the system of record.

### 6.4 The lifecycle — `open → acknowledged → in_progress → resolved / ignored`

The five states, and the Thai the user sees (the owner's explicit vocabulary):

| `status` | What it means | What the **user who hit it** sees |
|---|---|---|
| `open` | auto-captured, not yet triaged | **"ส่งเรื่องแล้ว"** — *"ระบบบันทึกและส่งเรื่องให้ทีมงานแล้ว"* (the system already filed + sent it — this is the "no submit button" promise made visible) |
| `acknowledged` | a dev has seen it + owns it | **"กำลังดำเนินการ"** — *"ทีมงานรับเรื่องแล้ว กำลังตรวจสอบ"* |
| `in_progress` | a fix is actively being worked | **"กำลังดำเนินการ"** — *"ทีมงานกำลังแก้ไข"* (optionally links the `work_item`) |
| `resolved` | fixed; `resolution_note` recorded | **"แก้ไขแล้ว"** — *"ปัญหานี้ได้รับการแก้ไขแล้ว ขอบคุณที่แจ้ง"* |
| `ignored` | not a real bug (extension noise, a one-off, won't-fix) | not surfaced to the user — silently closed |

**Transitions are a whitelist** (the `work_items` / disbursement pattern):
`open→acknowledged|ignored`, `acknowledged→in_progress|resolved|ignored`,
`in_progress→resolved|ignored`, and a `resolved→open` re-open. `acknowledged`
and beyond require an `assignee_admin_id` (the CHECK). The triage action carries
an optimistic `.eq("status", expectedFrom)` race-guard so two devs cannot
clobber each other — copied from `actions/admin/work-items.ts`.

### 6.5 The triage UI — `/admin/incidents`

A new admin page, **same shape as the shipped `/admin/audit` + `/admin/system/crons`**
(IO-1 deliberately reuses their layout grammar — filter form + card/row list +
status badges):

- **Default view** — live incidents (`status NOT IN ('resolved','ignored')`),
  newest `last_seen_at` first, each card showing: title · `source`/`kind`
  badge · `severity` badge · `occurrence_count` ("เกิด 47 ครั้ง") ·
  first/last-seen · `route` · the `status` pill.
- **Filters** — by `source` / `kind` / `severity` / `status` / date range (the
  `/admin/audit` filter-form pattern).
- **A row → the incident detail** — full message + stack, `surface_meta`, the
  occurrence timeline, and the **triage actions**: "รับเรื่อง" (→ acknowledged,
  assigns self), "กำลังแก้" (→ in_progress), "สร้าง work item" (→
  `ensure_work_item()`, links `work_item_id`), "ปิด — แก้แล้ว" (→ resolved,
  requires `resolution_note`), "ปิด — ไม่ใช่บั๊ก" (→ ignored).
- **RBAC** — `requireAdmin(["super","ops"])` for triage actions (ops is the
  operations-coordinator role that already owns `work_items` writes); **read**
  is broader — `super, ops` + (so the owner/ก๊อต see it) any office role. The
  *write* surface stays tight, the 0062/0080 posture.
- **Nav** — a new `admin-sidebar.tsx` entry under a new "Observability" /
  "สถานะระบบ" group.

### 6.6 The user-facing incident-status widget

The owner's "the user sees the status" — IO-1 ships the **minimal** version:

- **On the branded `error.tsx` fallback** the user already sees *"ระบบบันทึก
  ปัญหานี้แล้ว"* (status `open` — "ส่งเรื่องแล้ว"). That is the *capture*
  acknowledgement, shown immediately.
- **For a signed-in user**, a lightweight **"ปัญหาที่ฉันแจ้ง" (issues I hit)**
  panel — a small list on the customer portal (and the admin's own profile
  area) showing incidents where `actor_ref` = the redacted-id of the current
  user, with each incident's *current* `status` in plain Thai (§6.4 column 3).
  This is the "เห็นสถานะว่าส่งเรื่องแล้ว / กำลังดำเนินการ / แก้แล้ว" the owner
  wants — a **pure RLS-scoped query** (the user reads only rows whose
  `actor_ref` matches theirs — §8). No realtime needed for IO-1; the panel
  refreshes on visit.
- **Deliberately minimal for IO-1** — no per-incident customer comment thread,
  no email-on-resolve. Those are Stage-2+ polish (§7.4). IO-1's job is the
  *capture + the visible status*, which this delivers.

### 6.7 The seed alert — new high-severity incident → notify a dev

IO-1 ships **one** alert rule (the full engine is Stage 4): on a *new*
`platform_incidents` row with `severity IN ('high','critical')`, fire
`sendNotification(devProfileId, { category:'observability', severity:'error',
title:'🔴 New incident', body:<title>, link_href:'/admin/incidents/<id>',
reference_type:'platform_incident', reference_id:<id> })`. This rides the
**shipped** `sendNotification()` pipeline (LINE push + email — §2.5). The dev /
ก๊อต get the *same* delivery customers get. **Two tiny additive ALTERs**:
`+'observability'` to the `notifications.category` CHECK + `lib/notifications/types.ts`,
`+'platform_incident'` to `NotifyReferenceType`. The notify target is a small
config — for IO-1, the `super`-role admins (or a named dev) — promotable to a
proper on-call rota in Stage 4.

### 6.8 IO-1 deliverables + effort

| # | Deliverable | Reuses |
|---|---|---|
| IO-1.1 | Migration `<NNNN>_platform_incidents.sql` — the table + CHECKs + indexes + RLS (admin triage + user-sees-own — §8) | `is_admin()`, `set_updated_at()`, the `work_items` constraint posture |
| IO-1.2 | Migration ALTER — `+'observability'` category, `+'platform_incident'` reference type; mirror into `lib/notifications/types.ts` | the `0014` notifications schema |
| IO-1.3 | `app/global-error.tsx` + per-group `error.tsx` (public/portal/admin) — branded fallback + auto-`POST` | net-new (the §2.8 gap) |
| IO-1.4 | `app/api/observability/ingest/route.ts` — fingerprint + upsert + dedupe + rate-limit + PII-strip | `lib/rate-limit.ts`, `lib/logger.ts::redactId` |
| IO-1.5 | `app/api/webhooks/sentry/route.ts` + the `app/api/webhooks/` dir with signature verification | net-new (the G-5 gap — built once, reused per provider) |
| IO-1.6 | `withObservability()` Server-Action error wrapper (or extend `withAdmin`) | `actions/admin/common.ts` |
| IO-1.7 | `actions/admin/incidents.ts` — `acknowledgeIncident` · `markInProgress` · `resolveIncident` · `ignoreIncident` · `spawnFixWorkItem`; whitelist transitions + race-guard; `logAdminAction` | `work-items.ts` patterns, `logAdminAction` |
| IO-1.8 | `/admin/incidents` triage queue + detail page | `/admin/audit` + `/admin/system/crons` layout grammar |
| IO-1.9 | The user-facing "ปัญหาที่ฉันแจ้ง" panel (portal + admin profile) | RLS-scoped query |
| IO-1.10 | The seed alert (new high-sev → `sendNotification`) | the shipped `sendNotification()` pipeline |
| IO-1.11 | i18n th/en for all new strings (the lifecycle labels, the error fallback copy) | `pnpm audit:i18n` gate |

**Effort: M** — one migration + one ALTER, one ingest route, one webhook route,
one wrapper, one action file, one admin page (two views), one small user panel.
Small because it **rides** the notification rails, the `work_items`
constraint/race-guard patterns, the `/admin/audit` UI grammar, and the cron-log
posture — it builds the *incident-specific* parts, not new infrastructure.

**Dependency:** the Sentry-webhook ingest (IO-1.5) is inert until `SENTRY_DSN`
is set in Vercel ([`launch-monitoring-golive`](../runbook/launch-monitoring-golive-2026-05-17.md)).
IO-1.3/IO-1.4 (the boundary + own ingest) do **not** depend on Sentry — they
give Pacred incident capture even with every external rail off. So IO-1 is
shippable independent of the env-var flip; the flip only *enriches* it.

---

## 7. Stage 2 (IO-2) — unified event log + KPI expansion

> Once IO-1 makes *errors* visible, Stage 2 makes *everything else* visible — a
> unified event log + per-department KPIs. Effort: **L**.

### 7.1 `platform_events` — the unified append-only log

Migration `<NNNN>_platform_events.sql` (number TBD/coordinated). One
append-only row per *notable event* across **all four surfaces** — the owner's
"เก็บ log ทุกส่วน." It is **not** a replacement for `admin_audit_log`
(deliberate admin actions) or `cron_invocations` (cron runs) — it is the
**broad, low-detail stream** they do not cover: customer events, partner-sync
events, page-milestone events, security events (rate-limit hit, captcha fail —
the §2.1 gap).

| Column | Purpose |
|---|---|
| `id` uuid PK | |
| `surface` text CHECK | `public` · `portal` · `admin` · `partner` · `server` |
| `event_type` text | from a controlled taxonomy (§7.2) |
| `category` text CHECK | `funnel` · `ops` · `security` · `partner` · `system` |
| `actor_role` text | role, not identity (the §3.4 boundary) |
| `actor_ref` text | redacted id — nullable |
| `entity_type` / `entity_ref` text | optional polymorphic link (the `work_items` `0080` pattern — reuse the same idea) |
| `meta` jsonb | small event-specific bag — no PII |
| `created_at` timestamptz | |

Indexes: `(surface, event_type, created_at desc)`, `(category, created_at desc)`,
`(created_at desc)`. RLS: admin read by role; service-role write. **Partner
events** arrive via the webhook harness (IO-1.5) — a MOMO sync run, a future
payment-webhook hit — each writes a `surface='partner'` event, so the
owner's "พาร์ทเนอร์" log requirement is satisfied by *routing partner activity
through the same table*.

### 7.2 The event taxonomy

A fixed, small `event_type` vocabulary (free-text defeats aggregation — the
internal-chat doc's `waiting_reason` lesson). Starter set:

| `category` | example `event_type`s |
|---|---|
| `funnel` | `page_view` (high-value pages only) · `signup_started` · `signup_completed` · `lead_submitted` · `order_placed` · `wallet_deposit` |
| `ops` | `container_status_changed` · `shipment_scanned` · `work_item_opened` · `work_item_closed` |
| `security` | `rate_limit_hit` · `captcha_failed` · `auth_failed` · `otp_rate_limited` |
| `partner` | `momo_sync_run` · `momo_sync_error` · `payment_webhook_received` |
| `system` | `cron_run` (mirror of `cron_invocations`) · `incident_opened` (mirror of a `platform_incidents` insert) |

The `funnel` events **deliberately mirror the GA4 event names** in
`lib/analytics.ts` (`sign_up`, `generate_lead`, `place_order`, …) — so the
in-house log and GA4 tell the *same story* with the *same vocabulary*. GA4
remains the anonymous-visitor analytics rail; `platform_events` is the
*signed-in + server-side + partner* log GA4 cannot see.

### 7.3 KPI expansion — per-department panels + rollup views

- **Rollup views.** `/admin/kpi` recomputes 8 queries live per visit (§2.3) —
  fine for one office dashboard, *not* fine for "everyone, 24/7." Stage 2 adds
  **`v_kpi_*` SQL views** (the `audit-kpi-dashboard` skill's "`CREATE VIEW
  kpi_<name>`" step) — pre-aggregated rollups so a dashboard is a cheap
  `SELECT` from a view, not 8 table scans. For heavy aggregates, a
  **materialised view refreshed by a Vercel cron** (the cron harness already
  exists) keeps them fast.
- **Per-department panels.** `/admin/observability/` gets a tab per
  department — `ops` (orders in each stage, work-board throughput), `accounting`
  (revenue, disbursements pending, WHT certs due), `warehouse` (containers by
  status, sacks open), `sales_admin` (signups by rep, conversion), `cs` (contact
  messages open, response time). Each panel is **built via the
  `audit-kpi-dashboard` skill** and gated to that department's role — extending
  `/admin/kpi`'s `requireAdmin([...])` pattern. This is the owner's "ทุกแผนก
  เห็น KPI ของตัวเอง" for *staff*.
- The exec roll-up (`/admin/kpi`) stays as the company-wide view; Stage 2 just
  re-points it at the rollup views so it stays fast.

### 7.4 Stage 2 incident-system polish

- Realtime on `/admin/incidents` (Supabase Realtime — new incidents appear
  without refresh).
- A per-incident **internal note thread** (could reuse the `work_item_messages`
  thread the internal-chat doc designs, *if* the incident has a `work_item_id`).
- **Email/LINE the user on `resolved`** — when an incident the customer hit is
  resolved, a courteous `sendNotification()` ("ปัญหาที่คุณพบได้รับการแก้ไข
  แล้ว"). Closes the loop the owner described.

### 7.5 Stage 2 deliverables + effort

Migration `<NNNN>_platform_events.sql` + the event-emit helper
(`lib/observability/emit.ts` — a server-side `emitEvent()` sibling of
`sendNotification()`) + event-emit calls wired into the key domain actions +
the `v_kpi_*` rollup views + a refresh cron + the per-department
`/admin/observability/*` panels + the Stage-2 incident polish. **Effort: L** —
the event-emit wiring touches many call-sites (additive, best-effort, like the
`ensure_work_item()` hook), and the per-department panels are ~6 dashboards.

---

## 8. Audience-scoped visibility — the RLS design (Stage 3 core)

The owner's hardest *access* requirement: KPIs visible to **everyone** — but
*not the same KPIs*. A customer must not see company revenue; a partner must
not see another partner's slice; an overseas staffer sees their region. This is
an **RLS** problem, and Pacred's `is_admin()` + `admins.role` model
([ADR-0002](../decisions/0002-admin-architecture.md)) already has the bones.

### 8.1 The audience matrix

| Audience | Sees | RLS predicate (conceptual) |
|---|---|---|
| **`super` / ก๊อต / owner** | everything — all incidents, all events, all KPIs, the marketing rollup | `is_admin(array['super'])` |
| **Office staff** (`ops`, `accounting`, `sales_admin`) | company-wide ops/finance KPIs + incidents (the `/admin/kpi` audience today) | `is_admin(array['ops','accounting','sales_admin'])` |
| **Department head** | **their department's** KPI panel | `is_admin(array['<their role>'])` — the per-panel role gate (§7.3) |
| **Floor staff** (`warehouse`, `driver`) | their *operational* numbers only — **never** company revenue (the existing `/admin/kpi` exclusion) | `is_admin(array['warehouse','driver'])` on the *ops* views only |
| **Overseas staff** ("เทศ") | their **region's** KPIs | needs a region/warehouse scope — see §8.3 |
| **Partner** | **their own** slice — their sync health, their volume; never another partner's, never Pacred internals | a `partner_id` scope — see §8.3 |
| **Customer** | **their own** order/shipment/wallet KPIs + **their own** incident statuses; never aggregates, never another customer | `actor_ref` / `profile_id` = the current user |

### 8.2 What the existing model already gives

- **Admin audiences** (super / office / department / floor) are **fully
  expressible today** — `is_admin(array[...])` with the right role array, per
  view / per page. The per-department panels (§7.3) and the incident triage
  (§6.5) use exactly this. No new role needed for the *staff* audiences.
- **The customer audience** is straightforward — `platform_incidents` gets a
  customer-read RLS policy `using (actor_ref = <redacted current uid>)` so the
  "ปัญหาที่ฉันแจ้ง" panel (§6.6) shows a customer *only their own* incidents.
  Customer KPIs (their orders/shipments) are read from the *existing* domain
  tables under their *existing* owner-RLS — the observability layer just
  *presents* them, it does not need new customer access.

### 8.3 What needs coordination — the partner + overseas scopes

Two audiences need a scope dimension the current model lacks:

- **Partner scope.** There is **no `partners` table** today (the brand-split
  context — PCS/TTP/MOMO references are interim, [`pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md)).
  A partner-facing KPI view needs a `partner_id` to scope on. Stage 3 must
  either introduce a minimal `partners` table (id, name, scope) **or** scope by
  the existing `carriers` table (`0036`) if partners == carriers is acceptable.
  **This is a decision for ก๊อต/เดฟ — flagged, not pre-decided** (it ties to
  the brand-split + the partner-API switchover).
- **Overseas / region scope.** "ไทยและเทศ" — an overseas staffer sees their
  region. The china-ops doc ([`china-ops-container-closing-2026-05-18.md`](china-ops-container-closing-2026-05-18.md)
  G1) **already designs a `warehouses` table + an `admin_warehouses` join +
  a `cn_warehouse` role** for exactly the China-staff case. **The overseas-KPI
  scope should reuse that** — region = warehouse country/location, the
  `admin_warehouses` join scopes a staffer to their warehouse(s). So the
  overseas audience is **not new work** if china-ops ships first; if it does
  not, Stage 3 carries a minimal region column. **Dependency on owner system 3,
  noted.**

### 8.4 The Stage-3 marketing-analytics rollup — "พิชิตการตลาด"

The owner wants the data *analysable into a conquest plan*. Stage 3 builds the
**marketing-analytics rollup** — and the [`growth-acquisition-strategy-2026-05-18.md`](growth-acquisition-strategy-2026-05-18.md)
doc is its strategic companion (the find→convert→buy chain). Concretely:

- **The funnel rollup** — a `v_marketing_funnel` view over `platform_events`
  (the `funnel`-category events §7.2) + GA4 data: `visitors → signups →
  first-order → repeat-order`, sliced by `channel` (the GA4 traffic source) and
  by week. This is the **find→convert→buy funnel** the synthesis names.
- **CAC / CPC attribution** — fed by **free** Google Ads + Meta Ads data
  (the [`capability-tools-strategy`](capability-tools-strategy-2026-05-18.md)
  build-vs-buy line: "a CPC/CAC panel fed by free Google/Meta ad data"). Cost
  per click, cost per lead, cost per acquired customer, by channel. A `cost`
  input (ad spend, manually entered or API-pulled) ÷ the funnel counts.
- **The "conquest plan" surface** — `/admin/observability/marketing`: the
  funnel + the CAC/CPC table + a trend, so เดฟ/the owner can *see* which
  channel converts cheapest and *decide* where to push spend. The plan is a
  human decision; this system gives it the numbers.
- **Identity-clean** (§3.4) — every number here is an *aggregate count* or a
  *cost ratio*. No customer contact list. The conquest plan attacks *channels*,
  not *individuals*.

### 8.5 Stage 3 deliverables + effort

Audience-scoped RLS policies on the incident + event + KPI views · the
partner-scope decision + (if chosen) a minimal `partners` table · the
overseas/region scope (reusing china-ops `warehouses` if available) · the
partner-facing KPI view + a partner surface · the customer KPI presentation ·
the `v_marketing_funnel` rollup + the CAC/CPC panel + `/admin/observability/marketing`.
**Effort: L–XL** — the marketing rollup + the multi-audience RLS are the bulk;
XL if a `partners` table + a partner portal surface are in scope.

**Dependencies:** the partner scope (a ก๊อต/เดฟ decision); the overseas scope
(ideally rides owner-system-3's `warehouses`); the GA4 + Google/Meta ad data
(the env-var flip + ad-account API access).

---

## 9. Stage 4 (IO-4) — always-on monitoring + status page + alerting

> The owner's "monitor 24/7" + "feel-good, anywhere." Stage 4 closes the ALERT
> plane and adds the status page. Effort: **M–L**.

### 9.1 Uptime / health monitoring

- **A Vercel-cron health probe** — a new cron (the `vercel.json` + `lib/cron/registry.ts`
  pattern — §2.6) that, every few minutes, hits the platform's health surfaces:
  the site root, a `/api/health` route, **and the Supabase auth health
  endpoint** (`https://<ref>.supabase.co/auth/v1/health` — the exact probe
  [AGENTS.md](../../AGENTS.md) §11 + [`../learnings/ci-and-deploy-gotchas.md`](../learnings/ci-and-deploy-gotchas.md)
  prescribe — *live → `401 no apikey`, deleted → NXDOMAIN*). Each run writes a
  `platform_events` row (`event_type='health_probe'`) + a result. **This is the
  signal that would have caught launch day's deleted-database** — the gap §1
  opens with.
- **SLA tracking** — uptime % over 24h / 7d / 30d, p50/p90 latency — computed
  as `v_kpi_*` views over the probe events.
- The probe **reuses the `cron_invocations` + cron-health-panel infrastructure
  wholesale** (§2.6) — it is one more cron, surfaced on one more card.

### 9.2 The status page — `/status` (public) + `/admin/status` (internal)

- **`/status`** — a **public**, no-auth, mobile-first page: a green/amber/red
  per-surface health summary ("เว็บไซต์ · พอร์ทัลลูกค้า · ระบบหลังบ้าน") + any
  ongoing declared incident. The owner's "feel-good, usable anywhere" — a
  customer who wonders "is it me or is it down" gets an honest answer without
  logging in. **`export const dynamic = "force-dynamic"`** (a public page that
  reads live state — the [AGENTS.md](../../AGENTS.md) §11 / nextjs-16-quirks
  rule for dynamic-data pages, even though `/status` has no `[param]`).
- **`/admin/status`** — the internal deep version: every monitored signal, the
  cron-health panel (folded in), the incident summary, SLA numbers — one
  "is everything OK" screen for the owner/ก๊อต. The cron-health panel §2.6
  becomes a *tab* of this.
- The status page reads the **rollup views** (§7.3) — it does not recompute,
  so it is cheap to load 24/7.

### 9.3 The alert-rule engine

IO-1 shipped *one* hard-coded alert (§6.7). Stage 4 generalises it into a
small **alert-rule engine**:

- **An `alert_rules` table** (or a typed config) — each rule = a condition over
  `platform_events` / `platform_incidents` + a severity + a target audience.
  Starter rules: *new `high`/`critical` incident* → notify dev (the IO-1 rule,
  now config); *error spike* (`> N` incidents of one fingerprint in `M` minutes)
  → **war-room** notify (super + ก๊อต); *uptime probe fails twice running* →
  page on-call; *funnel drop* (signups this hour `< X%` of the trailing
  average) → notify เดฟ; *partner sync failing* (`momo_sync_error` events) →
  notify ops.
- **Evaluated by a cron** — a scheduled job scans the event/incident tables
  against the rules and fires `sendNotification()` for any match. Reuses the
  cron harness + the shipped notification pipeline — **no new delivery code**.
- **De-dupe / cooldown** — a rule that just fired does not re-fire for a
  cooldown window (so an error spike does not send 500 LINE pushes). A
  `last_fired_at` per rule + a cooldown — the same discipline as the disbursement
  doc's idempotency guards.
- The "error spike → war-room" rule is the owner's implied escalation: when
  something is badly wrong, the right people are pulled in *automatically*.

### 9.4 Stage 4 deliverables + effort

The health-probe cron + `/api/health` route · the `v_kpi_*` SLA/uptime views ·
`/status` (public) + `/admin/status` (internal, folding in the cron panel) ·
the `alert_rules` table/config + the alert-evaluation cron + cooldown logic.
**Effort: M–L** — most pieces reuse the cron harness + the notification
pipeline + the rollup views; the status page is a fresh (but simple) surface.

---

## 10. The end-to-end picture (the headline)

How an error flows through the finished system — every step mapped to a rail +
the table it writes:

```
 ┌── 1. AN ERROR HAPPENS ─────────────────────────────────────────────┐
 │  a customer's wallet page throws a client render error             │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 2. AUTO-CAPTURE — no submit button (Stage 1) ────────────────────┐
 │  global-error.tsx boundary catches it → useEffect auto-POSTs to    │
 │  /api/observability/ingest  · the customer sees a branded screen:  │
 │  "ขออภัย — ระบบบันทึกปัญหานี้แล้ว ทีมงานกำลังตรวจสอบ"               │
 │  (Sentry, if DSN set, also captures it → its webhook enriches)     │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 3. STORE + DEDUPE (Stage 1) ─────────────────────────────────────┐
 │  ingest route fingerprints (kind+message+route) → upsert           │
 │  platform_incidents:  new fingerprint → one 'open' row;            │
 │  seen before → occurrence_count++ , last_seen_at bumped            │
 │  + a platform_events 'incident_opened' row (Stage 2)               │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 4. ALERT (Stage 1 seed → Stage 4 engine) ────────────────────────┐
 │  severity = 'high' (money-path route) → sendNotification(dev):     │
 │  LINE push + email · "🔴 New incident on /wallet/deposit"          │
 │  Stage 4: if the same fingerprint spikes → war-room notify         │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 5. TRIAGE — the visible lifecycle (Stage 1) ─────────────────────┐
 │  dev opens /admin/incidents → "รับเรื่อง" (→ acknowledged) →       │
 │  "สร้าง work item" (→ ensure_work_item, links work_item_id) →      │
 │  "กำลังแก้" (→ in_progress) → fixes it → "ปิด — แก้แล้ว"           │
 │  (→ resolved + resolution_note)                                    │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 6. THE USER SEES THE STATUS — the owner's core ask (Stage 1) ────┐
 │  the customer's "ปัญหาที่ฉันแจ้ง" panel shows, in plain Thai:      │
 │    open        → "ส่งเรื่องแล้ว"                                   │
 │    in_progress → "กำลังดำเนินการ"                                  │
 │    resolved    → "แก้ไขแล้ว — ขอบคุณที่แจ้ง"                       │
 │  (Stage 2: a courteous notification on resolve)                    │
 └────────────────────────────────────────────────────────────────────┘
              ▼
 ┌── 7. IT FEEDS THE BIGGER PICTURE (Stages 2–4) ─────────────────────┐
 │  the incident + event roll into v_kpi_* views → the per-dept       │
 │  panels, /admin/status, /status all reflect it · uptime + funnel   │
 │  KPIs sit beside it · the marketing rollup drives "พิชิตการตลาด"   │
 │  · everyone — staff, partner, customer, ไทยและเทศ — sees their     │
 │    own RLS-scoped slice, 24/7                                      │
 └────────────────────────────────────────────────────────────────────┘
```

One error, captured with no button, deduped, alerted on, triaged through a
visible lifecycle, shown back to the user honestly — and rolled into the
always-on KPI picture every audience can see. That is the system the owner
asked for.

---

## 11. Build phases — summary

| Stage | Scope | Headline deliverable | Tables | Reuses | Effort | Dependencies |
|---|---|---|---|---|---|---|
| **IO-1 (MVP)** | auto-incident capture + the visible status lifecycle + triage | the owner's "no submit button + show me the status" | `platform_incidents` (+ a notifications ALTER) | `is_admin()`, `sendNotification()`, `work_items` constraint/race-guard patterns, `/admin/audit` UI grammar, `lib/rate-limit.ts` | **M** | Sentry-webhook part needs `SENTRY_DSN` set (env-var flip); the boundary + own ingest do not |
| **IO-2** | unified event log + per-department KPI panels + rollup views + incident polish | "เก็บ log ทุกส่วน" + every dept sees its KPI | `platform_events` + `v_kpi_*` views | the `audit-kpi-dashboard` skill, the cron harness, `/admin/kpi`, GA4 event vocabulary | **L** | IO-1 (the event log mirrors incident inserts) |
| **IO-3** | audience-scoped views (RLS) + partner/customer/overseas surfaces + the marketing rollup | KPIs for **everyone** + the "พิชิตการตลาด" plan | (audience RLS; maybe a `partners` table) + `v_marketing_funnel` | the `admins` role model, china-ops `warehouses` (overseas scope), free GA4 + Google/Meta ad data | **L–XL** | IO-2; a partner-scope decision (ก๊อต/เดฟ); ideally owner-system-3's `warehouses` for the overseas scope; the env-var flip for GA4 |
| **IO-4** | always-on health monitoring + the status page + the alert-rule engine | "monitor 24/7" + a feel-good public status page | `alert_rules` (+ health-probe `platform_events`) | the cron harness (`cron_invocations` / registry / instrument), `sendNotification()`, the rollup views | **M–L** | IO-2 (the rollup views the status page reads) |

**Total** ≈ a substantial multi-phase build, but each stage is **independently
shippable** and **rides existing infrastructure** — IO-1 alone delivers the
owner's sharpest ask and is **M-effort**. Sequence by the post-launch lens
([AGENTS.md](../../AGENTS.md) §2): IO-1 first (it makes production failures
*visible* — directly "more *true*, more *measurable*"); IO-2 next (every dept
sees its work); IO-3 (the revenue-aimed marketing rollup); IO-4 last (the
always-on layer that hardens it all).

---

## 12. Risks & guard-rails

| Risk | Guard |
|---|---|
| **Incident-log floods** — the same error fires thousands of times, the table explodes | The `fingerprint` + `occurrence_count` dedupe (§6.2) — N hits = **one** row. The ingest route is rate-limited (`lib/rate-limit.ts`). A retention cron prunes old `resolved`/`ignored` rows. |
| **Alert fatigue** — every incident pings, the team mutes it all | IO-1 alerts only `high`/`critical` (§6.7). Stage 4 adds per-rule **cooldown** (§9.3) so a spike sends *one* alert, not 500. Low-severity rolls into a digest, not a push. |
| **The capture rail leaks PII** — a stack trace / `meta` carries a token or an email | Every rail strips cookies/auth headers (the shipped `sentry.*.config.ts` `beforeSend` pattern); the ingest route runs a PII-strip pass; incidents store a *role* + a *redacted* id, never raw PII (§3.4, `lib/logger.ts::redactId`). |
| **An audience sees data it must not** — a customer sees company revenue, a partner sees another partner | Audience-scoped RLS (§8) — every view is `is_admin(array[...])` for staff, `actor_ref = self` for customers, `partner_id = self` for partners. RLS is *narrowing*; default-deny. The `/admin/kpi` floor-role exclusion is the precedent. |
| **The error boundary itself errors / the ingest route is down** — capture silently fails | The boundary's `POST` is best-effort in a `try/catch` — a failed report never breaks the fallback UI. Sentry (when on) is the independent backstop. The boundary *always* renders the friendly screen regardless. |
| **Migration-number collision with ภูม / the sibling owner-systems** | §5.1 — this doc **does not hard-pick numbers**; migrations are named by content; the implementer fixes `NNNN` against the live `supabase/migrations/` **after a check-in with ภูม** (who owns `0073-0079` + `0081`+). |
| **Live-recompute KPIs don't scale to "everyone 24/7"** | Stage 2 adds `v_kpi_*` rollup views + cron-refreshed materialised views (§7.3) — dashboards become cheap `SELECT`s. `/admin/kpi`'s 8-query live recompute is re-pointed at the views. |
| **Scope creep — this becomes a CRM / a marketing-automation tool** | Hard boundary §3.4: this system handles *aggregate operational telemetry*. A contact list, a campaign sender, lead scoring — **out of scope**. The "พิชิตการตลาด" output is funnel shape + channel cost, a *decision input*, not a CRM. |
| **The owner expects it all at once** | The doc is explicit: **IO-1 is the MVP** and alone answers the sharpest ask. Stage it; ship IO-1; show the owner a working incident lifecycle; then IO-2-4. (AGENTS.md §2 — "plan work properly; don't ship half-built.") |
| **Partner / overseas scope blocked on undecided structure** | §8.3 flags both as **ก๊อต/เดฟ decisions** (partner table; region scope) — IO-1 + IO-2 do **not** need them, so the block does not stall the MVP; IO-3 carries the dependency openly. |

---

## 13. Open questions for ก๊อต / เดฟ

1. **Migration numbers.** §5.1 — this system needs ~3 migrations. ภูม owns
   `0073-0079` + `0081`+; `0080` is taken. The internal-chat / disbursement /
   china-ops docs each provisionally claimed overlapping numbers. **Confirm the
   block this system gets** — and reconcile the four owner-system docs' numbers
   in one pass (a เดฟ-reserved range, like `0080` was, would be cleanest).
2. **Partner scope.** §8.3 — IO-3's partner-facing KPI view needs a `partner_id`
   to scope on. Introduce a minimal `partners` table, or scope by the existing
   `carriers` table (`0036`)? Ties to the brand-split + partner-API switchover.
3. **Overseas / region scope.** §8.3 — should IO-3's overseas-KPI scope **reuse
   owner-system-3's `warehouses` + `admin_warehouses`** (china-ops doc G1)?
   That makes the overseas audience nearly-free *if china-ops ships first* —
   confirm the dependency direction.
4. **The IO-1 alert target.** §6.7 — for the MVP, who gets the new-high-sev
   incident notification? The `super`-role admins, or a named dev (เดฟ)? Stage 4
   promotes it to an on-call rota — confirm the IO-1 default.
5. **`error.tsx` granularity.** §6.3 — ship a single root `global-error.tsx`
   only, or per-route-group `error.tsx` (public / portal / admin) too? Per-group
   gives a friendlier, context-appropriate fallback per surface — recommend
   **root + the 3 group boundaries**; confirm.
6. **Public status page in IO-4 — how much to expose.** §9.2 — a public `/status`
   builds trust, but a public page also tells a competitor when Pacred is down.
   Recommend a **coarse** public page (green/amber/red per surface, no detail)
   + the full detail on `/admin/status`. Confirm the public granularity.
7. **Retention.** How long to keep `platform_events` + resolved
   `platform_incidents`? Recommend a pruning cron — events 90d, resolved
   incidents 1y (the analytics value decays; the cost does not). Confirm with
   the owner's audit/record-keeping preference.
8. **Sentry session replay.** §2.1 — `instrumentation-client.ts` has replay
   *off* (`replaysOnErrorSampleRate: 0`). Turning `replaysOnErrorSampleRate` up
   would give a *recording* of the session that hit each incident — very high
   triage value. Worth enabling (a one-line change) once `SENTRY_DSN` is set?

---

## 14. Cross-references

- 🧭 The synthesis this is the 4th owner-system of → [`capability-tools-strategy-2026-05-18.md`](capability-tools-strategy-2026-05-18.md)
- 💬 Owner system 1 — the `work_items` thread + the "tool keeps its own visible status" pattern this borrows → [`internal-chat-system-2026-05-18.md`](internal-chat-system-2026-05-18.md)
- 💸 Owner system 2 — the เบิก/จ่าย system (fail-closed money posture, idempotency patterns echoed here) → [`disbursement-system-2026-05-18.md`](disbursement-system-2026-05-18.md)
- 🇨🇳 Owner system 3 — China-ops; its `warehouses` + `admin_warehouses` is the **overseas-scope dependency** (§8.3) → [`china-ops-container-closing-2026-05-18.md`](china-ops-container-closing-2026-05-18.md)
- 🔌 The "5 tools installed-and-forgotten" finding — the env-gated capture rails this system sits on → [`gap-integrations-tools.md`](gap-integrations-tools.md) §2 (G-2 env vars · G-5 webhook harness)
- 🧰 The build-vs-buy decision matrix → [`tools-strategy-build-vs-buy-2026-05-18.md`](tools-strategy-build-vs-buy-2026-05-18.md)
- 📈 The find→convert→buy chain — the strategic companion to §8.4's marketing rollup → [`growth-acquisition-strategy-2026-05-18.md`](growth-acquisition-strategy-2026-05-18.md)
- 🏢 The 8-department operating-system gap (the `work_items` board this incident system sits beside) → [`operating-system-analysis-2026-05-18.md`](operating-system-analysis-2026-05-18.md)
- 🔍 Admin/back-office gap-hunt — "no audit-log search" was here; this extends the audit-log posture → [`gap-admin.md`](gap-admin.md)
- 📊 ADR-0007 — the GTM/GA4/Clarity analytics decision this system extends → [`../decisions/0007-analytics-and-ab-testing.md`](../decisions/0007-analytics-and-ab-testing.md)
- 🔐 ADR-0002 — `is_admin()` + the `admins` role model the audience-scoped RLS builds on → [`../decisions/0002-admin-architecture.md`](../decisions/0002-admin-architecture.md)
- 🔔 ADR-0001 — the notification delivery rails (LINE + email) the alerting reuses → [`../decisions/0001-line-notify-replacement.md`](../decisions/0001-line-notify-replacement.md)
- 🛠 The `audit-kpi-dashboard` skill — the dashboard-building method Stages 2-3 execute through → [`../../.claude/skills/audit-kpi-dashboard/SKILL.md`](../../.claude/skills/audit-kpi-dashboard/SKILL.md)
- 📋 The env-var flip that activates the rails (Stage 1's one external dependency) → [`../runbook/launch-monitoring-golive-2026-05-17.md`](../runbook/launch-monitoring-golive-2026-05-17.md)
- 📚 The launch-day "deleted database passed the smoke gate" learning — §1's opening argument → [`../learnings/ci-and-deploy-gotchas.md`](../learnings/ci-and-deploy-gotchas.md) · [AGENTS.md](../../AGENTS.md) §11
- 🗄 Migration runbook → [`../../supabase/migrations/README.md`](../../supabase/migrations/README.md)
- 🛑 Don't scrub PCS/TTP/MOMO partner refs early — relevant to the §8.3 partner-scope decision → [`../runbook/pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md)

**End of design.** The capture rails (Sentry · GA4 · Clarity) are wired but
switched off; `admin_audit_log`, `/admin/kpi`, the cron-health panel are real
but narrow — what is missing is the **system that collects errors with a
visible lifecycle status, unifies the cross-surface event log, exposes KPIs
per audience, rolls up the marketing funnel, and alerts always-on.** This doc
designs that system as four additive stages on Pacred's existing structure.
**MVP IO-1** — auto-incident capture with **no submit button**, a `platform_incidents`
table with the **`open→acknowledged→in_progress→resolved/ignored` lifecycle the
user sees**, an `/admin/incidents` triage queue, and a seed dev-alert — answers
the owner's sharpest ask and is **M-effort** because it rides the shipped
notification pipeline, the `work_items` patterns, and the `/admin/audit` UI
grammar. **Build-vs-buy: connect the 3 free rails Pacred cannot rebuild; build
everything that stores, exposes, or alerts — so every incident and every KPI
lives inside Pacred's own ecosystem.**
