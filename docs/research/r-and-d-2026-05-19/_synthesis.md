# 🧬 Pacred R&D Synthesis — 2026-05-19

> **What this is.** A consolidation of 8 specialist R&D reports — one per domain — into a single read for the owner. Each specialist did a deep audit of the `dave` integration branch + the docs and proposed concrete tools, libraries, and patterns to ship. This doc collapses them into cross-cutting themes, owner-ask status, and a sequenced execution plan.
>
> **Source files** (in `docs/research/r-and-d-2026-05-19/`):
>
> | # | Domain | Lines | Specialist |
> |---|---|---|---|
> | [01](01-mobile-scanning.md) | Mobile UX + scanning | 489 | Dr. Mobile-UX |
> | [02](02-marketing-ads-seo.md) | Marketing / Ads / SEO / Growth | 533 | Dr. Growth |
> | [03](03-customer-portal.md) | Customer portal (tracking + self-service) | 440 | Dr. Customer |
> | [04](04-admin-employee.md) | Admin / Employee (14 roles) | 807 | Dr. Admin |
> | [05](05-devops-observability.md) | DevOps / Observability / Monitoring | 688 | Dr. DevOps |
> | [06](06-backend-architecture.md) | Backend / Architecture / RLS / Integrations | 1087 | Dr. Backend |
> | [07](07-billing-payments-subs.md) | Billing / Payments / Subscriptions | 1101 | Dr. Billing |
> | [08](08-tracking-logistics.md) | Tracking / Logistics / Documents | 718 | Dr. Tracking |
> | | **Total** | **5,863** | |

---

## 🎯 Executive summary — the 5 things that matter

The eight specialists arrived independently at the same headline: **Pacred has built far more than it has switched on.** The codebase is post-launch healthy; the docs lag where the code actually is; many flagship features sit one Vercel env-var flip or one missing tile away from being live to customers.

The five must-read takeaways:

1. **THE ENV-VAR FLIP (≤30 minutes, ก๊อต/เดฟ)** — Sentry · GA4 · GTM · Clarity · Upstash · hCaptcha · Resend · LINE push are 100% code-wired but their env vars are unset (or `LINE_PUSH_BYPASS=true`). One Vercel session activates 6 features. Until this happens every other observability/marketing/billing recommendation compounds against a darker baseline.
2. **THE OWNER'S 5 BILLING ASKS** — 4 of 5 are partially built; #5 is misread by every prior doc. See §4 for status per ask + the smallest correct shipping order (cheapest = the one-button notify, biggest = the dunning engine).
3. **MOBILE IS DOCUMENTED BUT NOT EXECUTED** — playbook + customer shipment page are good; Buttons fail tap-targets in every size variant, no PWA, scanner has no iOS Safari fallback, container-rebind admin UI asks for raw UUID paste (impossible on phone). Single-file fixes unlock most of it.
4. **BACKEND P0 SECURITY IS ALREADY CLOSED** — every prior research doc still reads as if the master-strategy P0 holes are open. They are NOT — migrations 0062/0063/0064 + `lib/auth/owned-write.ts` already landed. The doc lag itself is a process risk.
5. **MOST CUSTOMER PAIN IS DISCOVERABILITY, NOT BUILD** — `/shipments/[code]` is the most polished page in the app and has no tile on the dashboard launchpad. The `/my-issues` IO-1 lifecycle pattern is one factor-out from being the missing customer-claim loop. The unified tracking view is partially wired — the missing piece is a 30-minute tile addition + a public `/track/[code]` page (4h).

The fastest week of actual value the team can ship right now is **a "flip + discoverability" sprint**, not a feature sprint.

---

## 📌 1 · Cross-cutting findings — patterns the specialists saw together

### 1.1 The Dark-Rails Pattern (env vars unset in Vercel)

Five specialists independently found this exact failure mode:

| Specialist | Unset env var | What it would unlock |
|---|---|---|
| Dr. DevOps | `SENTRY_DSN`, `SENTRY_WEBHOOK_SECRET` | Error tracking + IO-1 Sentry-webhook ingest |
| Dr. Growth | `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_CLARITY_ID` | GA4 + Meta Pixel + Clarity heatmaps + Ads conversion tracking |
| Dr. Customer | `LINE_PUSH_BYPASS=true` (set to skip!) | Every status change → LINE push to customer phone |
| Dr. Billing | `RESEND_API_KEY` | Transactional emails + invoice notifications |
| Dr. DevOps | `UPSTASH_REDIS_REST_URL/_TOKEN` | Cross-instance rate limiting |
| Dr. DevOps | `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` + `HCAPTCHA_SECRET_KEY` | Anti-bot on signup + contact forms |

**Resolution:** The runbook for this exists — [`docs/runbook/launch-monitoring-golive-2026-05-17.md`](../../runbook/launch-monitoring-golive-2026-05-17.md). 30 minutes of Vercel work.

### 1.2 The Built-But-Invisible Pattern

Code that's deployed but customers/staff can't reach it:

| Surface | Built? | Reachable? | Fix |
|---|---|---|---|
| `/shipments/[code]` (excellent tracking page — freshness pill, QA panel, timeline) | ✅ | ❌ no dashboard tile | Add tile to 9-icon launchpad (30 min) |
| `withObservability()` wrapper | ✅ | ❌ wraps 0 Server Actions | Wrap top 30 revenue actions (1 day) |
| `/my-issues` IO-1 lifecycle pattern | ✅ | ⚠️ exists for incidents, but customers think it's developer-only | Factor into a generic claim/issue UI (2 days) |
| `/admin/accounting/container-payments` (new — agent-a7f8) | ✅ | ❌ no entry in `lib/admin/sidebar-menu.ts` | Add menu row (10 min) |
| MOMO JMF sync skeleton (`lib/integrations/momo-jmf/sync.ts`) | ✅ | ❌ no cron + needs Inngest for per-row error isolation | Wire via Inngest (~12h) |
| LINE Messaging API push | ✅ | ❌ env-gated off | One env var (see §1.1) |
| Email path (Resend SDK in `package.json`) | ⚠️ partial | ❌ no API key | One env var + ~2h adapter (see §1.1) |

Pattern lesson: **before specing the next feature, walk the dashboard with fresh eyes** — half of what feels "missing" is "buried."

### 1.3 The Mobile Reality Gap

Pacred's customer + staff overwhelmingly use phones. The codebase has the documentation but not the discipline:

| Layer | Documented | Executed |
|---|---|---|
| Mobile-first playbook | ✅ `docs/mobile-first-playbook.md` | ✅ for top-level pages |
| Mobile bottom-nav | ✅ | ✅ customer-side |
| 44px tap-target rule | ✅ in conventions §11 | ❌ `components/ui/button.tsx:25-29` all variants under 44px |
| PWA / manifest | — | ❌ no `app/manifest.ts`, no theme-color, no installable shortcut |
| Camera scanner | ✅ `BarcodeDetector` API | ❌ no iOS Safari fallback (`@zxing/browser` chosen but never integrated) |
| Admin shell mobile-first | — | ❌ `lg:ml-64` desktop-first; drawer not implemented at `<lg` |
| POD photo on delivery | ✅ designed | ❌ unbuilt |
| Container rebind UX | ✅ feature exists | ❌ asks for raw UUID paste — physically impossible on a phone |
| Pacred-printed box barcodes | — | ❌ relies on partner labels that may not exist |

This is **the #1 surprise** of the R&D pass: the team wrote the right rules, then shipped at desktop density. The fix is mostly mechanical (Button.tsx + viewport export + manifest.ts).

### 1.4 The Doc-Lag Process Risk

Dr. Backend's most striking finding: master-strategy §1 (security keystone) and §2 (wallet leaks) are **actually closed**. Migration `0062` role-pinned RLS shipped + `0063` freight-invoice reference type + `0064` wallet overdraw guard with the correct `SELECT FOR UPDATE` (not the naive `CHECK`). `lib/auth/owned-write.ts` is in place.

But none of the research synthesis docs say so plainly. A Phase B agent who reads the older research → audits → tries to re-fix already-solved problems. The team has been **quietly executing on the master strategy and shipping the right migrations** while the doc set still reads as if the holes are open.

**Resolution:** A "what's actually shipped 2026-05-19" marker doc + a pass over each research doc to mark resolved items.

### 1.5 The Job-Queue Ceiling

Three specialists (Backend, DevOps, Billing, Tracking) converged on: **`vercel.json` crons cannot scale to where Pacred is going.**

- 7 crons today, all best-effort
- A failed run = a missed sync (no retry, no dead-letter)
- MOMO JMF sync needs per-container error isolation that cron cannot give
- The dunning engine needs scheduled per-customer touch points across days
- No backoff, no replay UI, no per-step observability

**Convergent recommendation:** **Inngest** (free up to 50k steps/mo, then $50). TS-native `step.run` checkpoints, dead-letter queue, replay UI. Beats Trigger.dev (less TS-first) and QStash (no checkpointing).

Migrate: MOMO sync first → dunning steps → email/LINE broadcasts.

---

## 🎯 2 · Owner's explicit asks — answer per ask

The owner laid out 7+ specific things in the brief. Here's where each stands and the smallest correct ship-path. Source = Dr. Billing + Dr. Tracking + Dr. Mobile-UX.

### Ask #1 — "ติ๊กรวดเดียววางบิล" (bulk invoice generation)
- **Status:** ~25% built. Tax invoice + freight invoice infrastructure complete (serial generator, WHT gate, PDF, RLS, audit). Missing: multi-select UI on `/admin/tax-invoices` + bulk server action.
- **Smallest correct ship:**
  1. **BG-1a** (~6-8h): Multi-select on existing pending tax invoices + one server action `bulkIssueTaxInvoices(ids[])` + outcome modal.
  2. **BG-1b** (~12-16h): Multi-select on shipments + `freight_invoice_templates` table (staff-curated line patterns: "Standard FCL 20'", "LCL air China-BKK") + bulk create-and-issue action. **This is the biggest single revenue-velocity feature the owner asked for.**
- **Source:** [07-billing-payments-subs.md §3.1.1-2](07-billing-payments-subs.md)

### Ask #2 — "ตั้งทุนรวมทีเดียว" (bulk cost-setting)
- **Status:** ~20% built. Per-row cost setting works on `/admin/warehouse/containers`. Missing: multi-select + rate-card library.
- **Smallest correct ship:**
  1. **BC-1a** (~3-4h): Bulk `cargo_container_costs` upsert action.
  2. **BC-1b** (~6h): `cost_rate_cards` table (per-route per-mode unit prices) + admin UI to pick a card before applying.
- **Source:** [07-billing-payments-subs.md §3.2](07-billing-payments-subs.md)

### Ask #3 — "ปุ่มเดียวแจ้งลูกค้า SMS+email+LINE" (one-button multi-channel notify)
- **Status:** ~55% built. Notifications system fans out to in-app + email + LINE already. Missing: a "Notify customer now" button on the admin invoice/shipment row + email path is dormant (RESEND_API_KEY unset).
- **Smallest correct ship:**
  1. Flip `RESEND_API_KEY` (5 min).
  2. Flip `LINE_PUSH_BYPASS=false` (5 min).
  3. Add `adminNotifyCustomer(targetType, targetId, channels[])` action + a button per invoice/shipment (~3-4h).
- **Source:** [07-billing-payments-subs.md §3.3](07-billing-payments-subs.md) + [03-customer-portal.md §G2](03-customer-portal.md)

### Ask #4 — "ระบบเตือนจ่ายบิลรายเดือน" (monthly dunning)
- **Status:** ~10% built. Crons + work_items + notification fan-out exist. Missing: dunning policy table + scheduler + escalation ladder.
- **Smallest correct ship:** Three-table engine (`dunning_policies` + `dunning_schedules` + `dunning_events`) + `/api/cron/dunning-sweep` (run via Inngest after Inngest lands) + admin queue UI.
  - Ladder: T+0 LINE → T+3 LINE+email → T+7 +SMS final notice → T+14 work-item escalation
- **Effort:** ~25-35h phased.
- **Source:** [07-billing-payments-subs.md §3.4](07-billing-payments-subs.md)

### Ask #5 — "บันทึก subscribe program หน่วยงานละ ทีมละ คนละ กี่บาท หมดอายุเมื่อไหร่ ใครรับผิดชอบ"
- **Status:** 0% built — **and Dr. Billing's surprise finding flags that this is being misread by every prior doc.**
- **Critical re-read:** *"subscribe program หน่วยงานละ ทีมละ คนละ"* = subscription tracking **per department / per team / per person — INSIDE Pacred**. This is the **internal SaaS spend registry** (who owns the Vercel renewal · who owns the Resend account · who owns the Notion seat · expiry date · responsible person), NOT customer-facing recurring billing.
- **Smallest correct ship:** Simple `internal_subscriptions` table (name · vendor · cost_thb_month · renews_at · owner_admin_id · department) + admin page `/admin/subscriptions` + cron that emails/LINE-pings the owner 7 days before each renewal.
- **Effort:** 15-20h. CFO-grade visibility tool, not a billing engine.
- **Source:** [07-billing-payments-subs.md §SURPRISE](07-billing-payments-subs.md)
- **Caveat:** If the owner later clarifies "VIP-tier monthly memberships" or "premium warehousing subscriptions" for customers, the build expands ~5x. Build the internal interpretation first; generalise if asked.

### Ask #6 — Mobile-first scanning workflow (warehouse + driver)
- **Status:** ~50% — `/admin/barcode/scan-form.tsx` exists + uses `BarcodeDetector`; warehouse history page exists.
- **Critical gap:** iOS Safari doesn't ship `BarcodeDetector` natively. Today iPhone staff see "browser ไม่รองรับ" and **cannot scan**. The team locked `@zxing/browser` as the polyfill in `archive-a-to-n.md D-3` and never delivered the integration.
- **Smallest correct ship:**
  1. Add `@zxing/browser` polyfill (~half day).
  2. Add Pacred-printed barcode labels for legacy boxes that arrive without partner barcodes.
  3. Build `/admin/scan` PWA shell with offline buffer (queue scans → flush on reconnect) for the warehouse-with-bad-wifi case.
  4. POD photo capture on delivery completion (driver workflow).
- **Source:** [01-mobile-scanning.md R-1, R-6](01-mobile-scanning.md)

### Ask #7 — Tracking ตู้/ชิปเม้น/เอกสาร in one customer screen
- **Status:** ~60%. Container-centric model + atomic cascade RPC + `/shipments/[code]` page are excellent. Missing: dashboard tile + public link + document tab.
- **Smallest correct ship:**
  1. **T-1** (~30 min): Add "ติดตาม" tile to 9-icon dashboard launchpad pointing to `/shipments?status=active`.
  2. **T-2** (~4h): Public `/track/[code]` (no login required, share-by-URL — every freight company has this).
  3. **T-3** (~3h): Documents tab on `/shipments/[code]` listing invoice/tax-invoice/customs-decl/D-O/photos with download links.
  4. **T-6** (~12h): Wire MOMO JMF sync via Inngest — without this, the freshness pill (already built in U1-7) always reads "stale" because no automated source updates it.
- **Source:** [08-tracking-logistics.md T-1..T-6](08-tracking-logistics.md)

---

## 🏗 3 · The cross-cutting recommendations matrix

### 3.1 Tier 0 — flip switches + quick wins (this week, 1-3 day items)

| # | Action | Owner | Effort | Source | Impact |
|---|---|---|---|---|---|
| F-1 | Vercel env-var flip session (Sentry+GTM+GA4+Clarity+Resend+Upstash+hCaptcha) | ก๊อต/เดฟ | 30 min | DevOps 3.A + Growth G-M-1 | Unlocks 6 features at once |
| F-2 | Flip `LINE_PUSH_BYPASS=false` | ก๊อต/เดฟ | 5 min | Customer G2 | Customers get real-time LINE updates |
| F-3 | `sharp` script to convert `public/images/*` PNG/JPG → WebP/AVIF (118 MB → ~25 MB) | ปอน | 1 day | Growth G-M-? | LCP -0.5–1.5s → Ads Quality Score → CPC drop |
| Q-1 | Add "ติดตาม" tile to dashboard 9-icon launchpad | ปอน | 30 min | Tracking T-1 | Customers discover the polished tracking page |
| Q-2 | Public `/track/[code]` (no login) | ภูม | 4 h | Tracking T-2 | LINE-pasteable share + SEO + acquisition |
| Q-3 | Fix `components/ui/button.tsx` size variants (≥44px) | ปอน | 1 day | Mobile R-2 | Every button on Pacred passes the iOS tap test |
| Q-4 | `app/manifest.ts` + viewport export + theme-color | ปอน | 1 day | Mobile R-3 | Installable PWA, iOS notch-safe, Android theme tint |
| Q-5 | Add `container-payments` entry to `lib/admin/sidebar-menu.ts` | เดฟ | 10 min | (this session's review) | New admin page reachable |
| Q-6 | Wrap top-30 revenue Server Actions with `withObservability()` | เดฟ | 1 day | DevOps 3.D | IO-1 captures real errors |
| Q-7 | Add `web-vitals` capture → GA4 + `platform_events` | เดฟ/ปอน | 1 day | DevOps 3.C | LCP/INP/CLS data → IO-3 dashboard |
| Q-8 | Add `/api/health` lightweight route + Better Stack monitor (free) | เดฟ | 30 min | DevOps 3.E-2 | External uptime alert when prod dies |
| Q-9 | One-button "Notify customer" action + button on invoice row | ภูม | 3-4 h | Billing #3 | Owner ask #3 V1 |
| Q-10 | Document POD-photo upload on delivery flow | ภูม | 3 h | Mobile R-6 | Closes legacy "delivery dispute" leak |

**Total ≈ 1 week of effort spread across ก๊อต+เดฟ+ภูม+ปอน. Estimated revenue impact:** higher than any new feature build.

### 3.2 Tier 1 — next 2-4 weeks

| # | Action | Owner | Effort | Source |
|---|---|---|---|---|
| T1-1 | **Inngest adoption** as the queue substrate | เดฟ | 1 day setup + ongoing migrations | Backend G-1 |
| T1-2 | MOMO JMF sync wired (via Inngest) | เดฟ+ก๊อต | 12 h | Backend G-1 + Tracking T-6 |
| T1-3 | `supabase gen types typescript` + adopt `<Database>` | เดฟ | 1 day | Backend G-3 |
| T1-4 | Hand-rolled `partnerFetch(name, url, init)` wrapper (timeout + retry + breaker) | เดฟ | half day | Backend G-4 |
| T1-5 | BG-1b bulk-invoice + freight_invoice_templates | ภูม | 12-16 h | Billing #1 |
| T1-6 | BC-1a + BC-1b bulk cost + rate-card library | ภูม | 9-10 h | Billing #2 |
| T1-7 | DN-1 dunning engine + cron sweep + admin queue | ภูม | 25-35 h | Billing #4 |
| T1-8 | Internal SaaS subscription registry (owner ask #5) | เดฟ | 15-20 h | Billing #5 |
| T1-9 | Add Meta Pixel + CAPI route + Google Ads conversion tag (after F-1) | ก๊อต/ปอน | 1 day | Growth G-M-4 |
| T1-10 | LINE multicast via `@line/bot-sdk` (vs current per-message billing) | เดฟ | 5-10 h | Billing F-3 |
| T1-11 | AP-1 RBAC hygiene (extend `admins.role` CHECK + sweep 31 ungated pages) | ภูม | 1 day | Admin AP-1 |
| T1-12 | Customer claim/issue loop (factor IO-1 lifecycle pattern) | ภูม+ปอน | 2 days | Customer G3 |

### 3.3 Tier 2 — month 2 (foundation builds)

| # | Action | Owner | Effort | Source |
|---|---|---|---|---|
| T2-1 | AP-2 mobile-first admin shell + `/admin/scan` PWA + offline buffer | ปอน+เดฟ | 1.5 wk | Admin AP-2 |
| T2-2 | AP-5 unified disbursement system (เบิก/จ่าย + WHT certs) | ภูม | 3 wk | Admin AP-5 |
| T2-3 | LINE Messaging API webhook + CI-1 customer-intelligence inbound | เดฟ+ก๊อต | 1 wk | Growth G-M-6 |
| T2-4 | 6 missing STAFF workspaces (marketing/CS/docs/AP/messenger/sub-driver) | ภูม | 2 wk phased | Admin AP-4 |
| T2-5 | Build CRM/lead-management at `/admin/leads` | ภูม | 1.5 wk | Growth |
| T2-6 | Synthetic uptime probe + alert-rule engine (IO-4) | เดฟ | 1 wk | DevOps 3.E + 3.F |
| T2-7 | RLS integration test harness (free Supabase project) | ภูม+เดฟ | 1 wk | Backend |
| T2-8 | `unstable_cache` + Upstash Redis cache layer | เดฟ | 3-5 days | Backend |

### 3.4 Tier 3 — strategic (Q2+)

- AP-7 admin polish · 14-role workspace completion
- IO-5 cost monitoring (Vercel + Supabase usage)
- Preview/staging Supabase project (currently no isolation)
- PITR + RPO/RTO posture documented + tested
- Sanity CMS for landing-content (deferred from D1)
- ERP integration (Xero/Odoo if requested)
- Map UI on tracking timeline (Mapbox-style)
- ETA estimation from container schedule + customs cycle data

---

## 🧭 4 · Sequencing — week-by-week plan

This is the **recommended order** for executing the Tier-0/1 list. It optimises for: (a) flip-the-switches first (compound effect), (b) discoverability before features, (c) revenue-velocity before nice-to-have, (d) the owner's explicit asks early.

### Week 1 — Lights On
- **Day 1 (ก๊อต/เดฟ)**: F-1 env-var flip session (Sentry+GTM+GA4+Clarity+Resend+Upstash+hCaptcha) + F-2 LINE_PUSH_BYPASS off. Verify each from runbook.
- **Day 2 (ปอน)**: Q-1 dashboard tile + Q-2 public `/track/[code]` page.
- **Day 3 (ปอน)**: Q-3 button tap-targets + Q-4 manifest/viewport.
- **Day 4 (เดฟ)**: Q-6 wrap revenue Server Actions in `withObservability()` + Q-8 `/api/health` + Better Stack monitor.
- **Day 5 (ก๊อต+เดฟ)**: T1-9 Meta Pixel + Google Ads conversion tag (now that GTM is live).
- **Throughout (ภูม)**: Q-5 sidebar menu entry + Q-9 one-button notify + Q-10 POD photo upload.

**End-of-week outcome**: Pacred is now MEASURED (GA4 + Sentry + Clarity firing), QUALITY-SCORED (Web Vitals + image fix coming), CONVERSION-TRACKING (Pixel + Ads tag), MORE-DISCOVERABLE (dashboard tile + public track link), and DELIVERS PHOTO PROOF on delivery.

### Week 2 — Substrate
- **(เดฟ)** T1-1 Inngest setup + T1-3 Supabase generated types + T1-4 `partnerFetch()` wrapper.
- **(ภูม)** T1-11 AP-1 RBAC hygiene (31 ungated pages → `requireAdmin([…])`).
- **(ก๊อต+เดฟ)** T1-2 MOMO JMF sync wired via Inngest — closes the freshness-pill stale loop.

### Week 3 — Revenue Velocity
- **(ภูม)** T1-5 BG-1b bulk-invoice + `freight_invoice_templates`. **The owner ask #1 ships here.**
- **(ภูม)** T1-6 BC-1a + BC-1b bulk cost + rate cards. **Owner ask #2.**

### Week 4 — Customer Pulse
- **(ภูม)** T1-12 Customer claim/issue loop (factor IO-1 pattern).
- **(เดฟ)** T1-10 LINE multicast (cuts broadcast cost 500×; unlocks Flex Messages with pay-now buttons).
- **(เดฟ)** T1-8 Internal subscription registry. **Owner ask #5.**

### Month 2 — Building Out
- T1-7 Dunning engine (~3 wk phased) — **Owner ask #4** lands at the end.
- T2-1 Mobile admin shell + warehouse PWA (parallel, ~1.5 wk).
- T2-2 Disbursement system (3 wk).
- T2-4 6 missing STAFF workspaces — phased.

---

## 🛠 5 · Specific tool picks (the build-vs-buy decisions, consolidated)

Each specialist had tool recommendations. Consolidated picks (with the dissents marked):

| Need | PICK | Rejected alternatives + reason |
|---|---|---|
| Email transactional + lifecycle | **Resend** | SendGrid (worse DX, expensive at scale), Postmark (expensive), SES (devops overhead) |
| SMS in Thailand | **ThaiBulkSMS (keep)** | Already wired, OTP-tested |
| LINE messaging | **`@line/bot-sdk` + Flex Messages** | Current per-message billing is too costly; multicast cuts 500× |
| Background jobs / queues | **Inngest** | Trigger.dev (less TS-first), QStash (no checkpoints), Supabase Edge Fn (no replay) |
| Error tracking | **Sentry (DSN flip — runbook exists)** | Datadog (overkill cost), Highlight (newer) |
| Web Analytics | **GA4 (already coded)** | Plausible (less Ads integration), Fathom (less feature) |
| Product analytics + heatmaps | **Clarity (already coded)** | Hotjar (paid), PostHog (overkill for current size) |
| A/B testing | **Keep in-house cookie substrate** | GrowthBook/Optimizely (premature for current state) |
| Anti-bot | **hCaptcha (already coded)** | Cloudflare Turnstile (lock-in), reCAPTCHA (UX heavy) |
| Rate limiting | **Upstash Redis (already coded)** | Vercel KV (more expensive), local in-memory (per-instance only) |
| Uptime probe | **Better Stack free tier (now) + internal cron (later)** | UptimeRobot (cheaper but ad-supported notify), Pingdom (paid) |
| CMS for landing | **Defer (D1 pause) — re-evaluate Phase C** | Sanity vs Payload — when revisited |
| ORM / type safety | **`supabase gen types typescript`** | Drizzle (would require massive rewrite), Prisma (heavy) |
| Cache layer | **`unstable_cache` (built-in) + Upstash for hot keys** | Redis (heavy), Memcached (overkill) |
| CRM / leads | **Build in-house at `/admin/leads`** | HubSpot (data leaves Pacred — เดฟ-locked principle), Pipedrive (same) |
| Barcode scanning fallback | **`@zxing/browser`** (already locked in archive-a-to-n D-3) | QuaggaJS (older), camera-only (iOS Safari blocked) |
| QR/barcode generation | **`qrcode.react` + server-side label PDF** | Native canvas (more code) |
| Documents (existing PDF) | **Keep server-side React-PDF (current pattern)** | mPDF (legacy PHP only) |
| Internal SaaS subs tracking | **Simple Postgres table + cron** | Vendr/Sastrify (overkill) |

---

## ⚠️ 6 · Risks + dependencies

1. **Migration deploy gate (from this session's earlier review)** — 0084-0086 NOT on prod (frozen per `pcs-data-migration.md` §9). Many Tier-1 recommendations depend on dave→main being deployable. **ภูม owns** un-freezing these before any of:
   - BG-1b uses tax_invoices.credit_note_for_id (0085)
   - T1-7 dunning uses work_items + work_item_messages (0086)
   - Booking-flow features depend on 0084
2. **Inngest free-tier ceiling (50k steps/mo)** — at Pacred's current volume safely fits. Re-evaluate at 10× growth.
3. **The doc-lag risk** is itself something to fix: any agent reading `PACRED-MASTER-STRATEGY.md` without seeing this synthesis will re-derive solved problems. Suggest pinning this doc as canonical in `STRATEGY.md` §X and adding a "shipped 2026-05-19" marker pass.
4. **Owner ask #5 re-read risk** — if the misread happens (customer-facing recurring billing instead of internal SaaS) the build expands 5×. **Recommend explicit owner confirmation** before BG-5 work begins.
5. **Mobile shell rebuild (T2-1) breaks admin habits** — every admin staff has built muscle memory for the current desktop sidebar. Phased rollout + per-role beta opt-in.

---

## 📚 7 · How to use this document

- **Day-to-day:** This synthesis is the single read. Drill into the per-specialist doc only when you need the exact file references / line numbers / migration names for the recommendation you're shipping.
- **Owner review:** §0 (executive summary) + §2 (owner-asks) are the two sections the owner is asked about. The rest is for the implementer.
- **New agent onboarding:** Read this AFTER `STRATEGY.md` but BEFORE `UPGRADE_PLAN.md`. The Tier-0/1 list here supersedes the older Tier-2/3 list in `capability-tools-strategy-2026-05-18.md`.
- **Sprint planning:** §4 sequencing is the recommended pull order. ภูม/เดฟ/ปอน/ก๊อต ownership tags are explicit.

---

## 🔚 Appendix — token cost of this R&D pass

| Specialist | Tokens | Tool calls | Duration |
|---|---|---|---|
| Dr. Mobile-UX | 240,861 | 87 | 11.3 min |
| Dr. Growth | 205,120 | 81 | 10.6 min |
| Dr. Customer | 246,299 | 94 | 13.2 min |
| Dr. Admin | 253,239 | 46 | 8.9 min |
| Dr. DevOps | 203,279 | 70 | 11.3 min |
| Dr. Backend | 217,690 | 40 | 9.0 min |
| Dr. Billing | 190,055 | 53 | 11.5 min |
| Dr. Tracking | 206,472 | 70 | 11.0 min |
| **Total** | **~1.76 M tokens** | **541** | **~87 min wall (parallel)** |

Output: 5,863 lines of specialist findings + this 600-line synthesis. ~10,000 actionable words in <90 min wall.
