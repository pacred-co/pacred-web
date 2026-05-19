# R&D 06 — Backend / Architecture / Schema / Integrations / RLS

> **Produced 2026-05-19** by Dr. Backend (specialist R&D agent).
> **Scope:** read-only audit of `dave` integration branch + the 8 R&D / audit
> docs the team has already produced. Findings target the V2 long-phase
> (Phase B + C of [ADR-0017](../../decisions/0017-pacred-faithful-pcs-port.md))
> and the platform-observability + cost-control work the owner is paying for.
>
> **Pacred context (2026-05-19):** post-launch (`main` live 2026-05-17); the
> team has just been re-tasked by ADR-0017 onto a *faithful PCS-Cargo port*
> (Phase A migration → Phase B workflow fidelity → Phase C enhancements).
> Backend recommendations must therefore be **port-friendly** — anything that
> destabilises the legacy schema is rejected, even if technically attractive.
>
> **Read order:** §1 → §2 → §3 (the only one with new propositions) → §4
> (deeper digs for the next R&D round) → §5 (refs).

---

## 0. TL;DR — three sentences

1. The data layer is in **better-than-its-reputation** shape — RLS keystone
   `0062` and overdraw-guard `0064` closed the two P0 escalation holes the
   master-strategy flagged, the audit-log DB trigger backstops the helper, and
   the wallet ledger now has FK-pinned reference types for every money family.
2. The **process layer is the next risk** — cron is the only background-job
   substrate (1 missed cron = lost data), 372 `createAdminClient()` call
   sites remain convention-only safety, partner APIs (MOMO / TAMIT / SMS) have
   no circuit-breaker or backoff, and the Supabase-Storage tier has neither
   lifecycle policy nor cost ceiling.
3. The biggest single win in the next ~4 weeks is to **replace the cron-only
   substrate with a typed-job queue** (Inngest preferred over Trigger.dev /
   QStash) — it solves the MOMO sync's silent-failure mode, webhook retries,
   batch SMS sends, and the daily reconciliation jobs in one move, and makes
   the cost-control story tractable.

---

## 1. Current state

### 1.1 Stack inventory

```
┌─────────── Vercel (Next.js 16.2.6 App Router, Node 24) ──────────┐
│  proxy.ts (middleware)  — i18n · pacred_vid cookie · session refresh
│  Server Components / Server Actions     — every mutation
│  Route Handlers (app/api/**)            — webhooks · PDFs · DBD · search
│  Cron entries (vercel.json)             — 7 jobs (incl. 1 reserved MOMO)
│  instrumentation.ts                     — Sentry init                  │
└──┬───────────────────────────────────────────────────────────────────┘
   │ (HTTPS · @supabase/ssr cookies)
   ▼
┌─────────── Supabase Cloud ───────────────────────────────────────┐
│  Auth (JWT in httpOnly cookies; password + OAuth — Google/FB)
│  Postgres                — 87 migrations · ~120 tables (Phase A loads 117 legacy)
│  RLS                     — every public table; 0062 role-pins money/PII
│  Storage (private)       — member-docs · slips · forwarder-covers · carts ·
│                            avatars · tax-invoices · qa-inspection-photos ·
│                            wht-certs · freight-payment-slips · resumes
│  Realtime                — wired only for /admin/incidents (IO-1) so far     │
│  Edge Functions          — not used                                          │
└──┬───────────────────────────────────────────────────────────────────────┘
   │ outbound (server-only fetches; SSRF allowlist verified by OWASP audit)
   ▼
┌─────── External integrations ────────────────────────────────────┐
│ ThaiBulkSMS (OTP send + balance probe)
│ LINE Messaging API (push) + LINE OAuth (Login)
│ MOMO JMF (container partner — REST GET, 3 endpoints, Bearer JWT)
│ TAMIT-cloud / AkuCargo / Laonet (China-search)
│ DBD/MOC (juristic-person lookup — WAF-blocked from server, see audit)
│ hCaptcha (signup / reset)
│ Upstash Redis (rate-limit backend — optional, in-memory fallback)
│ Sentry (DSN env-gated; webhook for IO-1 ingest)                          │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 Architectural decisions already locked

- **Server Actions everywhere** — every mutation goes through an `actions/`
  file; client never holds the service-role key (`lib/supabase/admin.ts`
  carries an `import "server-only"` sentinel that webpack enforces). 35
  files import "server-only".
- **Three-client model** — `lib/supabase/{client,server,admin}.ts`:
  - `client.ts` (browser anon key) — for `"use client"` components only.
  - `server.ts` (anon key + cookies) — RSC + Server Actions + Route
    Handlers. RLS applies.
  - `admin.ts` (service-role key, no auto-refresh, no persistence) — server-
    only RLS bypass; **372 call sites** across `actions/` + `lib/` (counted
    via `grep`).
- **Admin RBAC** — `admins` table (0015) + `is_admin(text[])` SECURITY
  DEFINER. Roles: `super | ops | accounting | sales_admin | warehouse |
  driver | pricing | interpreter`.
- **Audit log** — `admin_audit_log` (0015) + helper `logAdminAction()` in
  `actions/admin/common.ts`. **PLUS** a DB-level trigger on
  `wallet_transactions` (0062 §3) that fires regardless of code path — the
  G-6 backstop the master strategy specced.
- **Idempotency / money correctness** — partial-unique indexes
  (`0049_wallet_order_payment_unique`, `0061_money_idempotency_guards`)
  prevent double-debit on the three payment paths; **`0064_wallet_overdraw_guard`**
  enforces a `SELECT ... FOR UPDATE` row-lock + non-negative aggregate
  pending balance (correct mechanism per S-5).
- **Cron substrate** — `vercel.json` cron entries hit `app/api/cron/<name>/`
  route handlers, each wrapped in `instrumentCron()` (`lib/cron/instrument.ts`),
  which logs to `cron_invocations` for `/admin/system/crons` visibility.
- **Observability** — Sentry SDK scaffolded; **IO-1 platform_incidents**
  (migration 0077) gives a DB-backed incident triage queue at
  `/admin/incidents`, with fingerprint-dedup + occurrence count + LINE/email
  alert via the shipped `sendNotification()` pipeline.
- **Rate limiting** — `lib/rate-limit.ts` — Upstash + in-memory fallback.
  Buckets named: `signup`, `login`, `passwordReset`, `otpVerify`,
  `otpRequest`, `contact`, `generic`.

### 1.3 Migrations — 87 files (0001-0087)

The migration directory is the source of truth for schema. Recent
production-impacting milestones (chronological, picked from
`supabase/migrations/README.md`):

| File | What it does | Why it matters here |
|---|---|---|
| 0033 | `cargo_containers` + `cargo_shipments` + tracking + history | The container spine MOMO sync writes into |
| 0044 | Withholding tax entries + WHT certs bucket | Code-50 (3%) cert flow for juristic customers |
| 0049 | Partial-unique on `wallet_transactions(order_h_no)` | Closes the "pay-from-wallet twice on the same order" race |
| 0050-0053 | Freight stack (shipments / invoices / payments / WHT) | Phase I2 freight billing closed |
| 0061 | wallet_transactions `kind+='cost_adjustment'` + 3 more partial-unique guards | Money-audit P0-1 / P1-2 / P1-4 fix |
| **0062** | **W-1 keystone — role-pin every money/PII/order RLS policy + wallet_tx DB-trigger audit** | **THE security keystone — closes S-1 + G-6** |
| 0063 | `wallet_transactions.reference_type += 'freight_invoice'` + partial-unique | Closes G-3 (the "free freight shipment" bug) |
| **0064** | `wallet_assert_no_overdraw()` BEFORE-trigger w/ FOR UPDATE | Closes S-5 (concurrent overdraw) — uses correct mechanism |
| 0067 | `pcs_legacy_member_seq` (superseded by D1 full-data port) | — |
| 0068 | `cargo_sacks` | The MOMO outside-measurement reconciliation table |
| 0069 | `container_costs` + `disbursements` | **Closes G-1/R-7 — per-container cost basis + AP ledger** |
| 0070 | `cron_invocations` + delivery log | The supervisory layer the docs call for |
| 0071 | Customer credit line (`profiles.credit_limit` + `credit_charge` kind) | W-7 done |
| 0072 | wallet self-serve amount-sign guard | Closes the post-launch P1 audit-core flagged in `audit-core-2026-05-18.md` |
| 0075 | `impersonation_sessions` — view-as-customer with HARD write-block | Compliance-clean impersonation |
| 0076 | `business_config` (jsonb) — single SoT for editable magic constants | Removes hardcoded thresholds |
| 0077 | `platform_incidents` — IO-1 ingest + triage | The observability queue |
| 0078 | `cascade_container_status()` SECURITY DEFINER fn — atomic cascade | Closes P1-5 |
| 0079 | `bookings` + `booking_options` + `booking_rates` | BK-1 thin booking-intake (pre-D1; status: paused by ADR-0017) |
| 0080 | `work_items` — cross-department work-board spine | Tier-2 centrepiece |
| 0081-0083 | PCS legacy schema (117 tables `tb_*`) | **D1 Phase A — currently being applied** |
| 0084-0086 | booking_documents / credit-note link / work_item_messages | Frozen pending Phase C |

### 1.4 Quantitative posture

- **Server Actions:** ~75 customer-side `.ts` + ~80 admin `.ts` in
  `actions/admin/`; **699 `.from(` calls** total → ~4.6 DB queries per
  action on average (rough).
- **`createAdminClient()` call sites:** **372** — the latent-IDOR surface
  master-strategy S-2 flagged.
- **`requireAdmin(...)` call sites in `actions/`:** 12 — but every admin
  action wraps via `withAdmin(roles, ...)` (`actions/admin/common.ts`), so
  the role check is enforced **inside** the wrapper, not at the call site.
- **Validators (`lib/validators/`):** 56 Zod modules with co-located
  `.test.ts` files; every mutation type-narrows through one.
- **Type safety:** **none from the database side** — the codebase does NOT
  use `supabase gen types`; queries are stringly-typed with explicit
  `.single<{...}>()` casts. This is the single biggest type-safety hole.
- **No ORM** — direct PostgREST through `@supabase/supabase-js`.
- **Caching layer:** none. No `next/cache` `unstable_cache` use detected.
  Every page reads fresh from Supabase.
- **Cron jobs (vercel.json):** 7 — `auto-cancel-orders` (*/15) ·
  `sales-daily-digest` (17:05 daily) · `refresh-active-customers` (01:00) ·
  `expire-probation` (02:00) · `expire-driver-assignments` (hourly) ·
  `sms-balance-check` (23:00) · `send-scheduled-broadcasts` (*/5). MOMO
  sync is **not yet wired** (sync.ts is a skeleton).
- **Storage buckets:** 10 — `member-docs · slips · forwarder-covers · carts ·
  avatars (public) · tax-invoices · qa-inspection-photos · wht-certs ·
  freight-payment-slips · resumes`. No lifecycle policy on any of them.

### 1.5 The W-1 + W-3 + W-5 status (the master-strategy chains)

The master strategy ([§1](../PACRED-MASTER-STRATEGY.md#1--p0-security--the-money-is-reachable-and-movable-chain-do-now))
ranked three chains. Their state today:

| Chain | Status | Evidence |
|---|---|---|
| **§1 — money-reachable-and-movable** | ✅ Fixed | `0062` role-pins all money/PII policies + DB trigger backstop; `lib/auth/owned-write.ts` un-skippable helper landed (per `audit-core-2026-05-18.md` §4) |
| **§2 — wallet-leaks-money** | ✅ Fixed | `0063` adds the freight-invoice reference type + debit; `0064` adds the overdraw guard with `FOR UPDATE` lock (the master strategy explicitly warned NOT to use a naive `CHECK` — the migration uses the correct mechanism) |
| **§3 — islands-with-no-bridges** | 🟡 Partial | `0078` adds atomic cascade fn; `0059` unified the legacy `containers` ↔ `cargo_containers` tables; W-2w/3w/4w/5w (status propagation · billing gate · freight wiring · auto-close) are paused by ADR-0017's Phase-B re-task |

Backend posture is therefore **stronger than the prior research wave
indicates** — the keystone landed, the overdraw mechanism is right, the
audit log is now DB-trigger-backed. The remaining risk shifts from "the data
is unsafe" to **"the process around the data is fragile"** — §2.

---

## 2. Gaps

The gaps below are ranked by **risk × leverage** in the Phase-B / Phase-C
window. Severity tiers:

- 🔴 **P0** — exploitable today / live revenue leak / data-loss risk
- 🟠 **P1** — measurable burden in ops or future cost
- 🟡 **P2** — polish, hygiene, or audit-trail completeness

### G-1 🟠 P1 — No typed-job queue (cron-only fragility)

**What.** Every background task is a cron-on-Vercel: `auto-cancel-orders`,
`sales-daily-digest`, `refresh-active-customers`, `expire-probation`,
`expire-driver-assignments`, `sms-balance-check`,
`send-scheduled-broadcasts`. The cron is the *only* substrate. There is no
job-queue, no retry, no fan-out, no backpressure.

**Why it matters.** Three concrete failure modes:

1. **One missed cron = data drift.** If `auto-cancel-orders` (`*/15 * * * *`)
   misses two fires (Vercel cron isn't a hard SLA), an order's 24-hour
   payment window stretches by 30 minutes — usually fine, but a missed
   `expire-driver-assignments` (hourly) means a driver run stays "active"
   past its 17-hour deadline and the next assignment refuses to attach.
   We log `cron_invocations` (0070) but there's no auto-retry.

2. **MOMO sync cannot live here.** The MOMO sync (spec'd in
   `momo-jmf-api-spec.md`, scaffolded in `lib/integrations/momo-jmf/sync.ts`,
   skeleton only) needs **per-container error isolation**, **rate-limit
   awareness**, and **exponential backoff on 429/5xx** — none of which the
   cron substrate provides. Today's sync.ts skeleton would crash the whole
   `*/15 * * * *` fire if one container's manifest fetch 500s.

3. **No fan-out for SMS / LINE batch sends.** `send-scheduled-broadcasts`
   could need to push 5,000 LINE messages. Today: serial loop inside a
   single cron handler. LINE Messaging API push has a ~5 req/s rate limit;
   serially that's a 17-minute cron run, which exceeds Vercel's default
   function timeout. The team has not hit this because the broadcast feature
   isn't actively used yet, but Phase C plans direct-to-customer
   announcements.

4. **Webhook retries.** Sentry webhook (`/api/observability/sentry-webhook`)
   has no retry on DB-insert failure. If `platform_incidents` insert fails
   (e.g. Supabase brief outage), the Sentry alert is silently dropped.

**Effort.** M (1-2 weeks). **Recommendation:** §3.1.

### G-2 🟠 P1 — `createAdminClient()` ownership pattern is convention-only at 372 sites

**What.** Master-strategy S-2 — 11 files were the *example*. The repo-wide
count is **372** call sites. Each one is either:
- (a) a legitimate elevation (e.g. OTP row insert, member-code lookup
  pre-auth), where the helper is the correct tool;
- (b) a customer mutation done via admin client because the customer's own
  RLS policy can't express the write (e.g. `kind='yuan_payment'` insert);
- (c) a missing/sloppy refactor that should drop back to `createClient()`
  now that the W-3 RLS family is fixed.

**Why it matters.** The W-1 keystone made the *exfiltration* path safe (a
driver JWT no longer reaches money tables via PostgREST), but it did NOT
make the *cross-customer write* path safe. An IDOR on any of the 372
remaining call sites — `createAdminClient()`/then-trust-an-input-id —
writes a money row for another customer regardless of role gates. The
`lib/auth/owned-write.ts` helper exists (per `audit-core-2026-05-18.md`) but
**adoption is partial**.

**Effort.** L (4-6 weeks if scrubbed exhaustively). **Recommendation:**
§3.3.

### G-3 🟠 P1 — No DB type-generation (stringly-typed queries everywhere)

**What.** No `supabase gen types`, no Drizzle, no PgTyped. Every Supabase
call casts the response shape inline:

```ts
const { data } = await supabase
  .from("wallet_transactions")
  .select("id, kind, amount, status")
  .eq("profile_id", profileId)
  .maybeSingle<{
    id: string; kind: string; amount: number; status: string;
  }>();
```

The cast is **manually written and never checked against the schema**. A
column rename in a migration (e.g. `wallet_transactions.bucket` →
`wallet_transactions.bucket_kind` if we ever did it) compiles cleanly —
the `.maybeSingle<{...}>()` cast lies, and the runtime read returns
`undefined`. The 87-migration shape change has gone smoothly only because
nobody has *renamed* a column yet (only added / extended CHECK).

**Why it matters.**
- Phase A loads 117 legacy tables (`tb_*`). Phase B then **reads from
  both** schemas during the transition. The probability of a typo or a
  shape-drift bug rises sharply.
- The W-3 RLS change broke nothing because nothing was statically typed.
  When the next change DOES break something, the failure mode is silent.
- Adoption is cheap — a single `pnpm gen:db` script + a generated
  `types/database.ts` + drop-in `Database` generic on every client. The
  Server Actions don't have to change.

**Effort.** S (1 day to wire + 2 days to migrate hot paths). **Recommendation:**
§3.2.

### G-4 🟠 P1 — Partner-API hygiene (TAMIT / MOMO / SMS) — no circuit-breaker, no backoff, no timeout consistency

**What.** Audit the partner-fetch surface:

| Caller | Endpoint | Timeout | Retry | Backoff | Circuit-breaker |
|---|---|---|---|---|---|
| `lib/sms/gateway.ts::sendThaiBulkSms` | `api-v2.thaibulksms.com/sms` | None set | None | None | None |
| `lib/sms/gateway.ts::checkThaiBulkSmsBalance` | (TBD) | None set | None | None | None |
| `lib/integrations/momo-jmf/client.ts` | `api.momocargo.com:8080` | Unknown (skel) | None | None | None |
| `lib/notifications/index.ts::sendLinePush` | `api.line.me/v2/bot/message/push` | None set | None | None | None |
| `lib/notifications/index.ts::sendEmail` (Resend) | `api.resend.com/emails` | None set | None | None | None |
| China-search (TAMIT / AkuCargo / Laonet) | various | None set | None | None | None |
| `app/api/dbd/[taxId]/route.ts` | `opendata.dbd.go.th` | 7s (deferred) | 2 | Linear | None (known WAF block) |

`fetch()` without a `signal: AbortSignal.timeout(ms)` has the Node-default
no-timeout — a partner hang ties up the Vercel function until the function
timeout kicks in (10s/60s/...). One slow LINE push call blocks the
notification chain. One MOMO 502 storm stalls the whole `*/15` cron run.

**Why it matters.**
- We have **no observability into outbound latency** today — Sentry is
  scaffolded but DSN is set and only client errors flow.
- The legacy PHP system disabled SSL verify (`CURLOPT_SSL_VERIFYPEER=false`)
  and retried 3× with `sleep(5)`. Pacred's Node `fetch` defaults to verify
  ON, so some upstream cert issues that legacy ignored will surface as
  errors here (good — but means timeouts matter more).
- A circuit-breaker is cheap (Cockatiel / opossum, or hand-rolled) and
  makes partner outages **visible** instead of **silent**.

**Effort.** S (a `partnerFetch()` wrapper with timeout + retry + breaker; 1
day to write, 1 week to migrate every call site). **Recommendation:** §3.4.

### G-5 🟠 P1 — Storage buckets have no lifecycle policy + no cost ceiling

**What.** 10 buckets, all private except `avatars`. None have a Supabase
Storage lifecycle policy. No periodic cleanup. No monitoring on the
aggregate bucket size (Supabase Free / Pro tier has 1-100GB depending on
plan; the Pacred project is on Pro).

**Concretely:**
- `slips/` — every deposit slip, every yuan refund slip, every freight
  payment slip. Customers re-upload after admin rejects. Will grow ~5GB/yr
  at current volume.
- `tax-invoices/` — generated PDF cached per invoice. Currently we
  regenerate on demand (no cache hit since storage is single-write); de-dup
  + lifecycle saves space + serves faster.
- `forwarder-covers/` — per-forwarder cover images. Some customers upload
  10+ images per shipment. No max-count limit.
- `qa-inspection-photos/` — freight QA inspection bucket. Per-shipment
  multiple high-res photos. Will be the fastest grower.
- `resumes/` — HR job applicant CVs. Should be retained 90 days after
  rejection, not forever.

**Why it matters.**
- Supabase Storage pricing scales linearly with size + egress. A bucket we
  forgot we had can quietly accumulate cost.
- D1 Phase A imports **customer images + slips from the legacy PCS
  system** (per ก๊อต's task in ADR-0017: "fetch the customer image/file
  storage from แต้ม"). This will roughly double total Storage size
  overnight when the import runs.
- Compliance — PII (slips contain bank account numbers, IDs) sitting in a
  bucket forever is a GDPR/PDPA risk even if Pacred is TH-only.

**Effort.** S (per-bucket policy + a `cleanup-storage` cron + a Sentry
metric for total bucket bytes). **Recommendation:** §3.5.

### G-6 🟠 P1 — No caching layer (every page reads fresh from Postgres)

**What.** Zero use of `next/cache`'s `unstable_cache`, no Upstash KV, no
Vercel KV. The home page (`/`) currently does several Supabase reads on
every render. Public landing pages re-query for SEO content per request.

**Why it matters.**
- LCP — public landing pages share a Supabase round-trip even for content
  that changes once a week. Per the performance-hunter brief, this is a
  Google-Ads quality-score input.
- Cost — each PostgREST query bills against the Supabase compute pool.
  Pacred today is well within the Pro tier compute, but the Phase A 117-
  table load + Phase B / C heavy admin queries will push it.
- Reliability — a Supabase brief outage takes the marketing site down.
  With cache, public pages survive a 30s database hiccup.

**Effort.** S (per-route `unstable_cache` wrap + Upstash for cross-instance
cache). **Recommendation:** §3.6.

### G-7 🟡 P2 — `lib/sms/gateway.ts` provider-switch is shallow (single-provider only)

**What.** `SMS_PROVIDER` switch supports only `thaibulksms`. The legacy
PHP audit found four active gateways (ThaiBulkSMS-legacy, ThaiBulkSMS-OTPv2,
Tiso AI, TechSol-th) — the consolidation to one is good, but **there's no
failover**. If ThaiBulkSMS has a 30-minute outage, OTP is dead and customers
can't sign up (the L-3 leak from the chat audit).

**Why it matters.** The legacy chat showed silent SMS-credit depletion was
the single P0 revenue blocker pre-launch. We have the balance-check cron
(0070 + `sms-balance-check`) but no **failover** to a second provider.

**Effort.** M (wire a second provider — recommend SMS-MKT or a regional
Twilio relay — and a "use primary if last 30s saw <X failures" failover
rule). **Recommendation:** §3.7.

### G-8 🟡 P2 — No DB connection pooling considered for the Phase A load

**What.** Supabase Cloud uses **PgBouncer in transaction mode** by default
(via the `:6543` pooler port) for serverless workloads, and **session mode**
on `:5432` for long-lived connections. Pacred's `@supabase/ssr` uses the
PostgREST layer, not direct Postgres — so PgBouncer is mostly invisible to
us. **But** the Phase A migration loads 117 tables / 3.7M rows; if the
loader (whatever ก๊อต / เดฟ use for it) connects through the session pool
on `:5432`, the loader can exhaust Supabase's connection cap and block app
traffic during the load.

**Why it matters.** The launch already had a "deleted Supabase project"
incident (per `docs/learnings/ci-and-deploy-gotchas.md`). A pool-exhaustion
during the Phase A migration window would mimic that failure.

**Effort.** S (a runbook entry; the Phase A migration runbook already exists
at `docs/runbook/pcs-data-migration.md` — add a "use the transaction pool +
batch sizes ≤500 rows" line). **Recommendation:** §3.8.

### G-9 🟡 P2 — No webhook signature verification framework

**What.** Pacred has 1 inbound webhook today (`/api/observability/sentry-webhook`)
and 1 planned (`/api/webhooks/momo-jmf` per the MOMO docs). The Sentry
webhook doesn't verify the `Sentry-Hook-Signature` header. MOMO doesn't
have a webhook spec yet but the partner may add one.

**Why it matters.** Any HTTP client can POST to the unauthenticated Sentry
webhook and inject `platform_incidents` rows — flooding the admin queue or
muddying triage signals. Low blast-radius (it's the alerting plane, not
money), but trivial to attack.

**Effort.** S (a `verifyWebhookSignature(provider, secret, body, headers)`
helper + a `signedRoute(handler, provider)` wrapper). **Recommendation:** §3.9.

### G-10 🟡 P2 — `logAdminAction` is best-effort (loses money audit rows)

**What.** Already flagged in `gap-schema-security.md` S-8. The DB-trigger
audit (0062 §3) **closes this for `wallet_transactions`**, but not for
`freight_invoice_payments`, `tax_invoices`, or any future money family.

**Why it matters.** The fix pattern is now established (the 0062 trigger).
Replicating it for the other money tables is mechanical and removes the
"best-effort" caveat.

**Effort.** S (3-4 more triggers). **Recommendation:** §3.10.

### G-11 🟡 P2 — No DB index review since launch (no slow-query log enabled)

**What.** Supabase's `pg_stat_statements` extension is available but
nobody has reviewed it. Migrations add indexes opportunistically, but no
holistic "what queries take >100ms in prod?" pass. Phase A doubles table
count overnight — the time to look is now.

**Effort.** S (enable `pg_stat_statements`, dump weekly via a cron-into-a-
table, add the slow-query view to `/admin/system`). **Recommendation:** §3.11.

### G-12 🟡 P2 — Tests don't exercise RLS

**What.** 56 Zod validators have `.test.ts` siblings; the lib tests run on
`tsx`. But there is **no integration test** that asserts "a `driver`-role
JWT cannot INSERT a row into `wallet_transactions`". The W-1 fix is therefore
**unverified in CI** — a future bad migration could re-introduce the bare
`is_admin()` policy and nothing would catch it.

**Why it matters.** This is exactly the meta-lesson the master strategy
called out — the prior audits checked "is RLS enabled" instead of "does the
RLS predicate match the role model". An RLS integration test that mints a
short-lived JWT per role and asserts allow/deny matrix is the only way to
prevent regression.

**Effort.** M (a `pnpm test:rls` harness using `pg-mem` or a Supabase test
project; ~3-4 days). **Recommendation:** §3.12.

### G-13 🟡 P3 — Sentry config has 2 deprecation warnings

**What.** `disableLogger` and `automaticVercelMonitors` are deprecated; the
audit-system doc has flagged it. Not blocking, but a hygiene tick.

**Effort.** S (5 minutes). **Recommendation:** §3.13.

---

## 3. Recommendations

Each item below has: **(a)** the fix · **(b)** the specific tool we'd pick
+ why we picked it over its peers · **(c)** ballpark cost (when the recipe
involves a paid service) · **(d)** effort + ownership.

### 3.1 [G-1] Adopt a typed-job queue — **Inngest** > Trigger.dev > QStash

**Why a queue, not "more crons."** Cron is the *trigger*; the queue is the
*reliability primitive*. With a queue you get: at-least-once delivery,
exponential backoff, dead-letter handling, per-job concurrency caps,
fan-out, step-level retry inside a multi-step job (`step.run` checkpoints).
None of those come from `vercel.json crons`.

**Pick Inngest over its peers:**

| Tool | Why we picked / didn't |
|---|---|
| **Inngest** ✅ | Free up to 50k steps/mo · TS-native SDK · multi-step `step.run` checkpoints (critical for "fetch container → upsert N shipments → log audit"; if step 2 fails step 1 doesn't re-run) · `Inngest.send()` from anywhere in a server action · UI shows every run, replay button · works on Vercel without infra · cron-style triggers built in. Used in production at thousands of TS shops. |
| Trigger.dev | Strong product, also TS-native, but pricing is more aggressive at scale (charges per "run" not per "step") · the v3 rewrite has had churn · their hosted free tier was 250 runs/mo at last check — too tight for our 7+ crons × 4-fire/hour. |
| QStash (Upstash) | Lightweight, HTTP-based, perfectly fine for "fire this URL with this body in X seconds". But no multi-step semantics, no replay UI. We'd build them ourselves. Reasonable second-place; we'd still pick Inngest unless cost forced us. |
| Supabase Edge Functions + DB-queue | Roll-your-own (write a `jobs` table, poll from a Deno function). Sounds cheap but **the team doesn't have Deno expertise** and Postgres-as-a-queue is a well-known anti-pattern at scale (LISTEN/NOTIFY plus row-locking works but you reinvent the world). Skip. |
| Vercel Queues (preview) | Vercel's own product is in preview; pricing unclear; lock-in to Vercel for ALL jobs (some of our jobs we want to be able to run from a non-Vercel agent). Skip until GA. |

**Cost (Inngest):** Free up to 50k steps/mo (our current usage is ~20k
steps/mo extrapolating from cron counts), then **$50/mo** for 200k steps.
Realistic post-Phase-C: $50-100/mo.

**Plan.**
- Step 1 (1 day): install `inngest` SDK; mount `/api/inngest` route handler;
  set up `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY` env.
- Step 2 (3 days): migrate **MOMO sync** first (highest-leverage). Wrap the
  per-container upsert in `step.run`, use `step.sleep` between rate-limited
  calls, dead-letter the failing containers to `cron_invocations`.
- Step 3 (1 week): migrate the broadcast send (`send-scheduled-broadcasts`)
  to a fan-out pattern — `inngest.send([5000 events])` then a 5/s
  concurrency-capped per-recipient handler.
- Step 4 (later): migrate the rest of the cron jobs — each gets a step-level
  retry + dead-letter.

**Owner.** ภูม + ก๊อต. **Effort.** M (~2 weeks elapsed). **Phase-B fit.** ✅
(MOMO sync is Phase-B critical-path; this is the right time).

### 3.2 [G-3] Generate Supabase types — **Supabase CLI codegen** > Drizzle

**Why.** Stringly-typed queries are a Phase-B trap. The Phase-A load brings
117 legacy tables; Phase B reads from both. A single `pnpm gen:db` script
makes every Supabase call type-checked end-to-end without changing the
runtime layer.

**Pick Supabase CLI codegen over Drizzle (now):**

| Tool | Why we picked / didn't |
|---|---|
| **`supabase gen types typescript`** ✅ | Native, free, 30-second setup. Generates a `Database` interface; pass it as the generic to `createClient<Database>(...)` and every `.from()` / `.select()` / `.insert()` becomes type-safe **without code changes**. Zero risk to existing queries — purely additive. Works against the live schema or local file. |
| Drizzle ORM | Excellent ORM with type-safe queries and migrations. But — we'd be **rewriting 699 query call sites** for the same end result (compile-time safety). Drizzle's killer feature is its query builder + migration kit; we already have a working PostgREST builder and a numbered-migration kit. Not Phase B work. Re-evaluate for V3. |
| Prisma | Heavier, ORM-flavoured, schema duplication (Prisma schema vs SQL). Same "not Phase B" answer. |
| Kysely | Type-safe SQL builder. Compelling for new projects. Same migration cost as Drizzle for an existing project — skip. |
| PgTyped | Generates types from raw SQL files. We don't have raw SQL files; our queries live inline in `actions/`. Wrong shape. |

**Cost.** $0 (CLI). **Effort.** S (1 day for codegen wiring + 2 days to
update the 50 hottest call sites; full migration is opportunistic — every
edited query gets typed). **Owner.** เดฟ (one-shot wiring), then the whole
team as they touch queries. **Phase-B fit.** ✅ (essential for the
dual-schema window).

```bash
# Wiring (one-time)
pnpm add -D supabase
echo 'gen:db = "supabase gen types typescript --linked > types/database.ts"' >> package.json scripts
# Then: import type { Database } from "@/types/database";
# and:  createServerClient<Database>(...)
```

### 3.3 [G-2] Reduce `createAdminClient()` to verified call sites — `lib/auth/owned-write.ts` adoption

**Why.** The helper already exists (per `audit-core-2026-05-18.md`). What's
missing is the **policy** of "any new `createAdminClient()` introduction
fails review unless paired with a `requireOwned(profileId, table)` call
**at the same call site**".

**Plan.**
1. Add a `pnpm lint:admin-client` check — a custom ESLint rule (we already
   have flat config) that scans for `createAdminClient()` and warns if
   neither of the next 20 lines includes `requireOwned`, `requireAdmin`, or
   `// admin-bypass: <reason>` magic comment.
2. Triage the 372 call sites in 3 buckets (manual, 1 day): legitimate
   elevation (OTP / member-code lookup) · customer self-serve via admin
   client (target for RLS-policy fix) · the cleanup tail.
3. For each "customer self-serve via admin client" → add a self-serve RLS
   policy + drop back to `createClient()`. ~30-40 sites estimated based on
   master-strategy S-2's 11 file list.

**Cost.** $0. **Effort.** M (~2 weeks elapsed for the triage + ESLint rule;
the RLS-policy migrations are 1 file per site = ~5 minutes each). **Owner.**
ภูม. **Phase-B fit.** 🟡 (do parallel; not on the critical path but
foundational for Phase C IDOR safety).

### 3.4 [G-4] Partner-API hygiene — a shared `partnerFetch()` wrapper

**Why.** Every outbound call needs the same five things: explicit timeout,
exponential backoff retry on 5xx/429, circuit-breaker open/close, request
ID, Sentry breadcrumb. Implementing them per-caller is how we got here
(zero of any of them).

**Plan.** A single `lib/integrations/partner-fetch.ts`:

```ts
export async function partnerFetch(
  partnerName: "thaibulksms" | "momo" | "line" | "tamit" | "akucargo" | "laonet" | "resend",
  url: string,
  init: RequestInit & { timeoutMs?: number; maxRetries?: number } = {},
): Promise<Response> {
  const breaker = getBreaker(partnerName); // shared per-partner state
  if (breaker.isOpen()) throw new PartnerCircuitOpenError(partnerName);

  const timeout = init.timeoutMs ?? PARTNER_TIMEOUTS[partnerName] ?? 10_000;
  const maxRetries = init.maxRetries ?? 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ac = new AbortController();
    const t  = setTimeout(() => ac.abort(), timeout);
    try {
      const res = await fetch(url, { ...init, signal: ac.signal });
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        breaker.recordSuccess();
        return res;
      }
      // 5xx / 429 → retry
    } catch (e) {
      // abort or network — counts as failure
    } finally {
      clearTimeout(t);
    }
    if (attempt < maxRetries) await sleep(2 ** attempt * 500 + Math.random() * 500);
  }
  breaker.recordFailure();
  throw new PartnerFetchFailedError(partnerName, url);
}
```

**Tool picks for the implementation:**
- **No library** — hand-roll the breaker (≤30 LOC: success-count, fail-count,
  half-open after N seconds). Cockatiel or opossum work but add a dep we
  don't need.
- **Sentry breadcrumb** — already wired via the SDK; add
  `Sentry.addBreadcrumb({category:"partner", level:"info", data:{partner,url,attempt}})`
  inside the wrapper.

**Cost.** $0. **Effort.** S (3 days). **Owner.** ภูม. **Phase-B fit.** ✅
(MOMO sync needs this on day 1).

### 3.5 [G-5] Storage lifecycle + cost ceiling

**Plan.**
- **Per-bucket lifecycle** (write into the `0088_storage_lifecycle.sql`
  migration). For now we use a daily cron rather than Supabase's native
  lifecycle (Supabase Storage doesn't have S3-style lifecycle policies as of
  this writing — we do it ourselves):
  ```sql
  -- pseudo, lives in actions/admin/storage-cleanup.ts driven by a cron
  delete-from-storage: slips where uploaded_at < now() - interval '2 years' and tx.status in ('completed','cancelled')
  delete-from-storage: resumes where applicant.rejected_at < now() - interval '90 days'
  archive-to-cold: tax-invoices where issued_at < now() - interval '5 years'  -- TH RD requires 5y retention
  ```
- **Cost cron**: a new `/api/cron/storage-cost-check` daily — calls
  `supabase.storage.from(b).list()` with no prefix to estimate bucket size,
  writes to `business_config` (or a new `storage_audit` table), alerts via
  `sendNotification('observability', 'high')` when any bucket exceeds a
  threshold.
- **Phase A image import readiness**: `forwarder-covers` and `slips` will
  approximately double in size when ก๊อต fetches the legacy image store.
  Pre-provision space; pre-warn ภูม.

**Cost.** $0 (Supabase). **Effort.** S (3 days). **Owner.** ภูม. **Phase-B
fit.** ✅ (do before D1 Phase A image fetch).

### 3.6 [G-6] Add a thin caching layer — `next/cache unstable_cache` + Upstash KV (when needed)

**Why.** Most Pacred pages are dynamic (auth-aware), but a meaningful slice
is **read-mostly + auth-agnostic**:
- `/services/*` landing pages (`carriers` table, `rate_general` lookups)
- `/knowledge/*` articles
- `/news/*` posts
- `/customs-clearance-shipping-suvarnabhumi/[port]` per-port content
- `/status` page Supabase ping

**Plan.**
1. **Wrap read-only Supabase calls** in `unstable_cache` with a `revalidate`
   matching the staleness budget (knowledge: 1h; carriers: 24h; status
   ping: 60s). Native Next 16, no new dep.
2. For cross-instance cache (e.g. user-specific computations that we
   want to share across Vercel functions), **Upstash KV** — the same
   Upstash instance we use for rate limiting.

**Pick `unstable_cache` over Vercel KV / Redis-only:**

| Tool | Why we picked / didn't |
|---|---|
| **next/cache `unstable_cache`** ✅ | Already in Next 16. Per-cache-tag invalidation via `revalidateTag()`. Free. |
| Upstash Redis (we already use for rate-limit) | Use for cross-instance shared state only — the URL/token is already in env. |
| Vercel KV | Same product family as Upstash via Vercel marketplace; pay-per-use. We already have Upstash. |
| Memcached | Don't. |

**Cost.** $0 marginal (Upstash free tier covers our rate-limit, the
caching pressure is well under it). **Effort.** S (2 days). **Owner.** ปอน
(frontend perf is her brief) + ภูม (server actions where appropriate).
**Phase-B fit.** 🟡 (do after the queue + types are in).

### 3.7 [G-7] SMS provider failover

**Plan.** Extend `lib/sms/gateway.ts`:

```ts
const PROVIDERS = ["thaibulksms", "sms-mkt"] as const; // primary first

export async function sendSms(phone, msg): Promise<SmsResult> {
  for (const p of getActiveProviders()) {
    const r = await sendWith(p, phone, msg);
    if (r.ok) return r;
    recordProviderFailure(p);
  }
  return { ok: false, error: "all_providers_failed" };
}
```

**Tool pick.** SMS-MKT (Thai vendor) or 1moby — both have OTP plans cheaper
than ThaiBulkSMS at low volume. ก๊อต has the partner contacts.
**Cost.** ~฿0.30-0.50 per SMS at second provider (≈ฺsame as primary).
**Effort.** M (1 week incl. contract). **Owner.** ก๊อต (contract) + ภูม
(impl). **Phase-B fit.** 🟡 (do during Phase B but not blocking).

### 3.8 [G-8] Phase A migration pooling runbook

**Plan.** Update `docs/runbook/pcs-data-migration.md` with:
- Use the `:6543` pooler (transaction mode) for the loader connection
- Batch inserts in chunks of ≤500 rows (PgBouncer transaction-mode limit
  is per-transaction; one giant `INSERT ... VALUES (...), (...)...` runs as
  one transaction)
- Issue a `SET statement_timeout = '60s'` per batch
- Avoid `SET search_path` (transaction-pool kills session-level SETs)
- During the load window, scale up Supabase compute (Pro tier can scale on
  demand) and scale back after

**Effort.** S (1 hour). **Owner.** เดฟ. **Phase-A fit.** ✅ (do before Phase A
production load).

### 3.9 [G-9] Webhook signature verification framework

**Plan.** A `lib/integrations/webhook-verify.ts`:

```ts
export async function verifyWebhookSignature(
  provider: "sentry" | "momo" | "line",
  request: Request,
  rawBody: string,
): Promise<boolean> {
  const sig = request.headers.get(VERIFY_HEADER[provider]);
  if (!sig) return false;
  const secret = process.env[`WEBHOOK_${provider.toUpperCase()}_SECRET`];
  if (!secret) return false;
  const expected = await hmacSha256(secret, rawBody);
  return timingSafeEqual(sig, expected);
}
```

Then a `signedRoute()` wrapper:

```ts
export function signedRoute(provider, handler) {
  return async (request: Request) => {
    const body = await request.text();
    if (!(await verifyWebhookSignature(provider, request, body))) {
      return NextResponse.json({error:"bad_signature"}, {status:401});
    }
    return handler(request, body);
  };
}
```

**Cost.** $0. **Effort.** S (1 day). **Owner.** ภูม. **Phase-B fit.** 🟡
(wire when MOMO webhook spec lands).

### 3.10 [G-10] DB-trigger audit for the rest of the money tables

**Plan.** Replicate the 0062 §3 trigger pattern for `freight_invoice_payments`,
`tax_invoices`, `disbursements` (0069), `commissions` (0054),
`refund_requests` (0058). Each is a 30-LOC migration.

**Effort.** S (1 day). **Owner.** ภูม. **Phase-B fit.** ✅ (do during the
faithful-port pass; the legacy `tb_history` table logs every mutation — we
can match that fidelity).

### 3.11 [G-11] Slow-query observability

**Plan.**
1. Enable `pg_stat_statements` via Supabase Dashboard → Database →
   Extensions.
2. Add `lib/observability/slow-queries.ts` — a daily cron that runs
   `select * from pg_stat_statements order by mean_exec_time desc limit 50`
   into a `slow_query_log` table.
3. Surface it on `/admin/system/slow-queries` (extend the existing
   `/admin/system/crons` page) — top-50 by mean time + p95.

**Tool pick.**
- `pg_stat_statements` is the boring right answer.
- pganalyze / Datadog APM / etc. — overkill at our scale and Pro-tier
  cost.

**Cost.** $0. **Effort.** S (2 days). **Owner.** ภูม. **Phase-B fit.** ✅
(important during the dual-schema window).

### 3.12 [G-12] RLS integration test harness

**Plan.** A `tests/rls/` directory:

```ts
// tests/rls/wallet.spec.ts
test("driver-role cannot INSERT wallet_transactions", async () => {
  const client = createClientWithRole("driver");
  const { error } = await client.from("wallet_transactions").insert({
    profile_id: SOME_VICTIM, kind: "adjustment",
    status: "completed", amount: 500_000,
  });
  expect(error?.code).toBe("42501"); // RLS denial
});
```

**Tool pick.**
- **A dedicated Supabase test project** (not pg-mem) — RLS depends on
  Supabase's `auth.uid()` JWT plumbing that pg-mem doesn't emulate.
- Set up a `pacred-rls-test` project; CI provisions a fresh DB per run
  (`supabase db reset`).

**Cost.** ~$0 (Supabase free tier, separate project). **Effort.** M (1
week — harness + 20 baseline tests covering every money/PII table × every
admin role). **Owner.** เดฟ (harness) + ภูม (tests). **Phase-B fit.** ✅
(prevents Phase B regressions in the policies the W-1 keystone fixed).

### 3.13 [G-13] Sentry deprecation cleanup

**Effort.** Trivial. **Owner.** anyone touching `next.config.ts` next.

---

### 3.x Cross-cutting picks — when the question comes up

These will be asked in Phase B / C; preemptive answers:

| Question | Pick | Why |
|---|---|---|
| **Email sender?** | **Resend** (already wired in `lib/notifications/index.ts`) | TS-native, simple API, Thai-friendly. Already coded. Just set `RESEND_API_KEY`. |
| **ORM if/when we leave PostgREST?** | **Drizzle** | TS-native, no codegen complexity, migration kit aligns with our existing numbered-SQL approach. Skip Prisma. |
| **CDN for images?** | **Vercel built-in `<Image>`** | Already in use; Supabase Storage public buckets serve via Vercel's image optimisation. Don't add Cloudflare unless we need geo replication (we don't — TH-only). |
| **Search?** | **Postgres full-text first** (`tsvector`) | Tax-ID + tracking-no + member-code searches are exact lookups (already indexed). If we ever need fuzzy across `forwarders.note` etc., add a `tsvector` generated column. Skip Algolia / Typesense at our scale. |
| **Realtime?** | **Supabase Realtime** (already used in `/admin/incidents`) | No reason to add Pusher / Ably. |
| **Feature flags?** | **`business_config` (0076)** — extend with a `flags` jsonb category | We have the SoT table; no reason to pay for LaunchDarkly. |
| **Vector DB / embeddings?** | **pgvector in Supabase** | Already available as a Supabase extension; activate when we get to "smart customer support". Skip Pinecone. |
| **API for partners (future)?** | **Pure REST via Route Handlers + a signed JWT per partner** | We already have the auth plumbing. Skip GraphQL / tRPC for partners. |
| **GraphQL for internal?** | **No** — PostgREST does the job. TRPC is tempting but server actions cover the same need. |

---

### 3.y Sequencing (the 4-week sketch — Phase B compatible)

Aligning to ADR-0017 Phase B (workflow fidelity) — these must not block
the port:

```
Week 1 (D1 Phase-A production load):
  • G-8 pooling runbook (1h)
  • G-3 supabase gen types (1 day)
  • G-13 Sentry cleanup (trivial)

Week 2 (post-load, port work begins):
  • G-1 Inngest install + migrate MOMO sync (3 days)
  • G-4 partnerFetch wrapper (3 days)
  • G-10 DB-trigger audit on remaining money tables (1 day)

Week 3:
  • G-12 RLS integration test harness + 20 baseline tests (5 days)
  • G-5 storage lifecycle + cost cron (3 days)

Week 4:
  • G-2 createAdminClient triage + ESLint rule (5 days)
  • G-11 slow-query observability (2 days)

Backlog (Phase C window):
  • G-6 caching layer (when LCP shows it matters)
  • G-7 SMS failover (when SMS budget approaches the ceiling)
  • G-9 webhook signature framework (when MOMO webhook lands)
```

---

## 4. Deeper research (next R&D round questions)

Below are questions whose answer requires more time/data than this drill
provided. Captured for the next research wave so the team doesn't re-derive.

### Q1 — When (if ever) do we move off Vercel for the server?

**Why ask.** Vercel function timeouts (default 10s, max 60s on Pro, max
300s on Enterprise) constrain long-running operations. The Phase A 117-
table loader is *currently* run manually by เดฟ (not Vercel) — fine. But
the Phase C bigger jobs (yearly tax-summary export, full-DB report
generation, mass LINE broadcast to 8,898 customers) start to bump the cap.

**Hypothesis to test.** Inngest's per-step model (each step is a separate
Vercel invocation) removes most of this pain — a job can run hours,
distributed across many short steps. We probably don't need to leave
Vercel. Confirm by running a 5,000-recipient broadcast in a staging
project and watching the elapsed wall time.

**Alternative if Inngest doesn't cut it.** Move long jobs to **Fly.io**
(simplest) or **Railway** (also simple), keeping Next.js on Vercel for
serving. Both bill ~$10-25/mo for a small worker. **No need to consider
self-host until 3x revenue from today.**

### Q2 — When do we add ORM / leave PostgREST?

**Why ask.** PostgREST is fine until queries need joins-with-typing-help or
multi-statement transactions. We *do* have multi-statement transactions
today, hidden inside SECURITY DEFINER PL/pgSQL functions (`cascade_container_status`,
`wallet_assert_no_overdraw`). That pattern works; it's just locked away
from TypeScript.

**Hypothesis.** Drizzle becomes attractive **when** we want type-safe
multi-table joins **and** we'd have written ≥10 new SECURITY DEFINER
functions to avoid round-trips. Today we have ~5. Re-evaluate at 15.

### Q3 — Should we move RLS-bypass writes to **typed SECURITY DEFINER RPCs** instead of `createAdminClient()`?

**Why ask.** The S-2 surface (372 admin-client call sites) and the
G-10 audit-completeness story both improve if customer-self-serve money
writes go through **named DB functions** instead of admin-client INSERTs:

```sql
create function self_serve_wallet_topup(...)
  returns wallet_transactions
  language plpgsql
  security definer
  set search_path = public
  as $$ begin
    -- verify caller is the row owner
    -- write the row
    -- audit
    -- return the row
  end; $$;
```

Then the TS side is:

```ts
const { data } = await supabase.rpc("self_serve_wallet_topup", { amount });
```

**Wins.** (a) The verification lives next to the write — un-skippable.
(b) The audit log fires from the same TX as the write. (c) Types come
from the RPC return signature (supabase gen types includes RPCs).
**Cost.** Logic moves from TS to PL/pgSQL — harder to test, harder to grep.

**Hypothesis.** This is the right Phase-C move; not Phase-B. Capture in
a follow-up ADR.

### Q4 — Do we expose any partner / customer API publicly?

**Why ask.** The legacy PCS audit's JMF integration is bidirectional —
JMF POSTs forwarders into PCS. The MOMO partner equally **might** push.
The Phase C disbursement system might be called by accounting tools.

**Open questions.**
- API key issuance model (one-per-partner, rotatable, scoped).
- Rate-limit per-partner separately from rate-limit-per-IP.
- Versioning approach (`/api/v1/...` vs header-based).

**Hypothesis.** Hold until a real partner asks. Don't pre-build.

### Q5 — Cost shape — how does Pacred scale on Supabase Pro?

**Why ask.** Pro tier today covers the launch volumes. Phase A's 117 legacy
tables × 3.7M rows roughly doubles DB size. Phase B port doesn't add rows
but adds query traffic. Phase C does both.

**Sub-questions.**
- DB CPU bucket usage at peak (the per-month compute cap on Pro is
  generous but not infinite; need to know the headroom).
- Egress — public landing pages serve at low cost (Vercel CDN does most).
  Tax-invoice PDFs and slip downloads are the largest egress.
- Storage growth — we modelled it qualitatively in §G-5; need a real
  monthly delta over the next 3 months.

**Action.** A monthly cost dashboard in `/admin/system` reading Supabase
billing data via API. ~3 days work.

### Q6 — What's the right pattern for multi-tenant ever?

**Why ask.** Pacred is single-tenant today. If the ecosystem expands to
"Pacred operates this shipping system for partner X", we need RLS by
tenant_id everywhere. The W-1 keystone is already per-role; adding a
`tenant_id` predicate to every policy is mechanical but expensive.

**Hypothesis.** Don't pre-build. The legacy PCS Cargo system is single-
tenant; the faithful port should be too. Capture in the V3 (`pacred-DPX`)
wishlist.

### Q7 — Real-time delivery — should /admin/incidents and the work-board be Realtime-backed?

**Why ask.** `/admin/incidents` (IO-1) already opts into Realtime via
Supabase. The `work_items` board (0080) does not. Customers polling
`/shipments/[code]` for status changes would benefit from Realtime.

**Hypothesis.** Yes — but the deciding factor is *concurrency limit*
on Supabase Realtime (200 channels on Pro). With 8,898 customers, a
"every customer subscribes to their own shipments channel" model exceeds
that immediately. We'd want a *fan-out* pattern: one channel per
container, every customer in the container subscribes.

**Action.** A small spike: 50 simulated customers on Realtime channels,
measure CPU + latency.

### Q8 — What goes in V3 that doesn't go here?

**Why ask.** ADR-0010 + ADR-0017 say V3 is a separate repo. Things we
*know* belong there: granular RBAC (per-action permissions), a proper
ERP shell (`pacred-DPX`), the rebuild that gets rejected as soon as we
diverge from PCS for the wrong reason. Backend candidates:
- Drizzle ORM
- Event-sourcing for the order lifecycle
- A proper API layer (versioned, partner-scoped)
- Multi-tenant
- Async job queue (Temporal? — but we just picked Inngest for V2)

**Action.** Don't speculate further. Capture in `docs/v3-wishlist.md`.

---

## 5. References

### Required reading (from this drill)

- `docs/architecture.md` — the blueprint diagrams
- `docs/architecture/container-centric-model.md` — container/shipment spine
- `docs/decisions/0001` through `0017` — 17 ADRs
- `docs/audit/owasp-2026-05.md` — pre-launch security posture
- `docs/audit/chat-analysis-2026-05-16.md` — leak holes (L-1..L-10) +
  workflows (W-1..W-9) + MOMO canonical status enum
- `docs/research/PACRED-MASTER-STRATEGY.md` §1-§3 — the four chains
- `docs/research/gap-schema-security.md` — S-1..S-8 + G-1..G-7
- `docs/research/audit-core-2026-05-18.md` — confirms W-1/W-3/W-5 fixes
  landed
- `docs/research/audit-system-2026-05-17.md` — full route smoke (0 P0)
- `docs/audit/php-pcscargo-integrations.md` — legacy partner inventory
  (the source of truth for Phase A integration porting)
- `docs/integrations/momo-jmf.md` + `docs/integrations/momo-jmf-api-spec.md`
  — MOMO API spec (3 GET endpoints, REST, Bearer JWT)
- `supabase/migrations/README.md` + the 87 migration files

### Code touched (read for this drill)

- `lib/supabase/{client.ts, server.ts, admin.ts}`
- `lib/integrations/momo-jmf/{client,sync,types,index}.ts`
- `lib/cron/instrument.ts`
- `lib/observability/incident-store.ts`
- `lib/notifications/index.ts`
- `lib/sms/gateway.ts`
- `lib/rate-limit.ts`
- `actions/admin/common.ts`
- `vercel.json`
- `supabase/migrations/0062_rls_role_pin_money_pii.sql`
- `.env.example`

### Cross-links to companion R&D docs (same wave, 2026-05-19)

- `r-and-d-2026-05-19/01-mobile-ux-scanning.md` (Dr. Mobile)
- `r-and-d-2026-05-19/02-marketing-ads-seo.md` (Dr. Growth)
- `r-and-d-2026-05-19/03-customer-portal.md` (Dr. Customer)
- `r-and-d-2026-05-19/04-admin-employee-portal.md` (Dr. Admin)
- `r-and-d-2026-05-19/05-devops-observability.md` (Dr. DevOps) —
  **overlap with §3.1, §3.11, §3.12** (queue + slow-query + tests are
  shared concerns; coordinate with the DevOps doc on which side owns
  Inngest setup)
- `r-and-d-2026-05-19/07-billing-payments.md` (Dr. Money) —
  **overlap with §G-10** (audit-trigger on `freight_invoice_payments` is
  on both lists)
- `r-and-d-2026-05-19/08-tracking-logistics-docs.md` (Dr. Logistics) —
  **overlap with G-1/G-4** (MOMO sync is the headline use case; align on
  who owns the migration to Inngest)

### Memory entries to capture (immortal scholar candidates)

- "Server Action grew an admin client — check that an explicit
  `requireOwned()` is paired with it; otherwise refactor through
  `lib/auth/owned-write.ts` (see G-2)."
- "Outbound `fetch(...)` to a partner needs `partnerFetch()` not raw
  `fetch()` — timeout, retry, breaker baked in (see §3.4)."
- "Don't add a `CHECK (balance >= 0)` to `wallet` — the correct mechanism
  is `SELECT ... FOR UPDATE` inside a DB function or a deferred-
  constraint trigger, both already shipped in 0064 (gap-schema-security
  S-5)."
- "RLS predicate must match the role model — every time a migration adds
  an admin role, audit every `is_admin(...)` policy call (the W-1 lesson
  from master-strategy §1)."

---

**End — `06-backend-architecture.md`.** 13 gaps identified (3 P1 leading,
the rest P2/P3); 13 numbered recommendations with specific tool picks +
cost estimates + Phase-B-compatible sequencing; 8 deeper questions for the
next R&D round. The platform's data-safety story is genuinely good now;
the next leverage is in the *process layer* — queue, types, partner
hygiene, storage lifecycle.
