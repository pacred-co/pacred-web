# Ads-Launch Action Plan — going live 2026-05-20

> **Purpose.** Pacred starts paid ads on **Google Search · YouTube · Meta (FB/IG)
> · LINE** tomorrow (2026-05-20). This is the **consolidated, sequenced,
> do-it-now plan** — the rank-#1 marketing strategy, the pre-launch connection
> checklist, and the in-system monitoring plan, in one read for เดฟ.
>
> **Author:** ปอน-lane (Claude) · **Date:** 2026-05-19 · **Branch:** `podeng`
>
> **This doc is a synthesis, not new research.** It consolidates five prior
> docs so they don't have to be re-read separately, reconciles them with the
> 2026-05-18 **D1** pivot, and adds the launch-tomorrow sequencing:
> - [`growth-acquisition-strategy-2026-05-18.md`](growth-acquisition-strategy-2026-05-18.md) — the funnel gaps
> - [`capability-tools-strategy-2026-05-18.md`](capability-tools-strategy-2026-05-18.md) — "connection, not capability"
> - [`tools-strategy-build-vs-buy-2026-05-18.md`](tools-strategy-build-vs-buy-2026-05-18.md) — "tools off, not absent"
> - [`platform-observability-system-2026-05-18.md`](platform-observability-system-2026-05-18.md) — the in-system monitoring design
> - [`gap-integrations-tools.md`](gap-integrations-tools.md) — the integrations gap-hunt
> - env-var flip mechanics → [`../runbook/launch-monitoring-golive-2026-05-17.md`](../runbook/launch-monitoring-golive-2026-05-17.md) (don't duplicate — §2 links to it)
>
> **D1 / owner-mandate guardrail.** The owner's rule (2026-05-19): copy the
> legacy PCS system 100% faithfully FIRST, then improve. **Everything in this
> plan is marketing infrastructure + configuration — it touches ZERO customer
> product code.** The landing pages ads point at are *already shipped and live*
> (ปอน's pre-D1 work, not under D1 rework). Marketing infra ≠ the product.

---

## 0. TL;DR — the launch-tomorrow verdict

The funnel **ad → landing → convert → measure** is built. The last connector is
**unplugged**:

| Stage | State | Note |
|---|---|---|
| **Get found** | 🟡 partial | SEO infra (sitemap, robots, JSON-LD) shipped; Search Console likely unverified; no Google Business Profile |
| **Land** | 🟢 ready | Service landing pages are full content pages, live in production |
| **Convert** | 🟢 ready | `ContactForm` live on `/contact`; `/start-order` + `QuoteCTA` shipped; event helpers fire |
| **Measure** | 🔴 **OFF** | All tracking code is built and pushes to `dataLayer` — but `NEXT_PUBLIC_GTM_ID` is unset, so **every event dead-ends** |

**The blocker is not code — it is configuration.** The fix is a ~30–60 min
env-var + dashboard task (§2). No code change blocks the launch.

⚠️ **If ads launch with measurement off:** no cost-per-lead, no Smart Bidding
signal, no Meta retargeting pixel, no keyword/ad attribution. **Every baht spent
tomorrow is spent blind** — and blind spend is how a small budget loses to a big
one. The single highest-ROI hour before launch is wiring §2.1.

---

## 1. The funnel — where Pacred stands

```
   ┌─── GET FOUND ───┐   ┌── LAND ──┐   ┌─ CONVERT ─┐   ┌── MEASURE ──┐
   │ SEO · Google    │   │ landing  │   │ LINE-add  │   │ GA4 · Ads   │
   │ Ads · YouTube   │──▶│ page     │──▶│ form ·    │──▶│ Meta · LINE │
   │ Meta · LINE     │   │ (live)   │   │ /start-   │   │ conversions │
   │ 🟡              │   │ 🟢       │   │ order 🟢  │   │ 🔴 OFF      │
   └─────────────────┘   └──────────┘   └───────────┘   └─────────────┘
```

The machine exists end-to-end. `lib/analytics.ts` fires typed events
(`sign_up`, `login`, `generate_lead`, `place_order`, `wallet_deposit`,
`cta_click`) at real call sites in register / login / contact-form / cart /
forwarder / payment / wallet forms — each with the THB value where relevant.
But every one pushes into `window.dataLayer`, which **GTM is supposed to drain —
and GTM is not configured.** Plug GTM in and the whole funnel lights up at once.

---

## 2. Pre-launch readiness — the MUST-DO checklist

Sequenced. The **Owner** column says who acts — most of this is dashboard
clicks only เดฟ / ก๊อต can do (account access), not code.

### 2.1 🔴 Connect the tracking spine — THE launch blocker

**Step A — set the env vars in Vercel.** Follow the existing runbook verbatim:
[`../runbook/launch-monitoring-golive-2026-05-17.md`](../runbook/launch-monitoring-golive-2026-05-17.md)
§"Flip checklist". The launch-critical subset:

| Env var | Why it's launch-critical | Owner |
|---|---|---|
| `NEXT_PUBLIC_GTM_ID` | **The keystone.** Unset → every conversion event dead-ends → ads run blind | เดฟ |
| `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` | Catch launch-day errors before customers do; powers the shipped IO-1 incident triage | เดฟ |
| `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` + `HCAPTCHA_SECRET_KEY` | Lead form **fails OPEN** without them — paid traffic = a spam-bot magnet on the form | เดฟ |
| `UPSTASH_REDIS_REST_URL` + `_TOKEN` | Rate-limit degrades to per-instance memory — multipliable abuse under ad traffic | เดฟ |
| `NEXT_PUBLIC_CLARITY_ID` | Heatmap / session replay — see WHERE landing visitors drop | เดฟ (can trail by a day) |

Redeploy after — `NEXT_PUBLIC_*` vars inline at build time.

**Step B — configure the GTM container (NEW — the runbook stops at Step A).**
Setting `NEXT_PUBLIC_GTM_ID` only loads the *container*; the container is empty
until tags are added inside the GTM dashboard. This is the real work, and it
needs **no code deploy** — that is the whole point of routing through GTM:

| Inside GTM, add | Purpose |
|---|---|
| **GA4 Configuration tag** + GA4 property | The analytics base; get a GA4 Measurement ID first |
| **GA4 event tags** mapping the dataLayer events | `sign_up` `login` `generate_lead` `place_order` `wallet_deposit` `wallet_withdraw_request` `cta_click` — they already fire (§4); GTM forwards them to GA4 |
| **Google Ads** — Conversion Linker + conversion actions | So Search/YouTube ads can attribute & bid; link GA4 ⇄ Google Ads, import conversions |
| **Meta Pixel** base + Lead / CompleteRegistration / Purchase | FB/IG ads cannot optimise-for-lead or retarget without it |
| **TikTok Pixel** (if TikTok ads run) | Same, for TikTok |
| **LINE Tag** base + conversion | LINE Ads optimisation + LINE audiences |

**Step C — verify.** GTM Preview / Tag Assistant on `pacred.co`: trigger a
signup + a contact-form submit, confirm each event reaches GA4 and the Ads/Meta
tags fire. Run `pnpm check:connections` (§8) to confirm the env side.

> **Architecture note — one lever, all platforms.** There is intentionally **no
> env var** for Meta / TikTok / Google-Ads / LINE pixels. They all live *inside*
> the GTM container. `NEXT_PUBLIC_GTM_ID` is the only code-side switch; every
> ad-platform tag is added/changed in the GTM UI with no redeploy. Keep it that
> way — it's what lets marketing move without waiting on a deploy.

### 2.2 🟡 Get found

| Task | Owner | Note |
|---|---|---|
| Google Search Console — verify `pacred.co`, submit `pacred.co/sitemap.xml`, request indexing for home + the 5 cargo service pages | ก๊อต / เดฟ | `app/sitemap.ts` + `app/robots.ts` already exist; this is dashboard-only |
| Google Business Profile — claim & complete the listing (categories, service area, photos, hours) | ก๊อต / เดฟ | Strongest free local-search signal; ask the 8,898-customer base for reviews |

### 2.3 🟡 Protect the funnel — paid traffic attracts bots

Covered by the env vars in §2.1 (hCaptcha, Upstash). Flagged separately because
it is easy to treat as "monitoring" and skip — but the signup/contact forms are
the **ad conversion endpoints**. An unprotected form under paid traffic fills
your lead list with spam and poisons the conversion data you just turned on.

### 2.4 🟡 Define the UTM convention — before the first ad link

Attribution is impossible to add retroactively. Lock this scheme **before any
ad goes live** and use it on every ad URL:

| Param | Values | Example |
|---|---|---|
| `utm_source` | `google` `youtube` `facebook` `instagram` `line` `tiktok` | `utm_source=google` |
| `utm_medium` | `cpc` `display` `video` `social` | `utm_medium=cpc` |
| `utm_campaign` | `<service>-<objective>-<yyyymm>` | `utm_campaign=cargo-lead-202605` |
| `utm_content` | ad / creative variant | `utm_content=hero-a` |
| `utm_term` | keyword (Search only) | `utm_term=ชิปปิ้งจีน` |

---

## 3. Rank-#1 marketing strategy — capability over cash

Pacred's ad budget cannot match the big logistics players. The strategy is to
**not fight them on spend** — win on SEO, content, conversion efficiency, and
the one asset competitors don't have: **~8,898 existing customers**.

### 3.1 SEO — the budget-free moat

**Keyword architecture — three tiers:**

| Tier | Character | Examples | Play |
|---|---|---|---|
| **Head** | High volume, incumbent-dominated, slow | `นำเข้าสินค้าจากจีน` · `ชิปปิ้งจีน` · `เคลียร์ภาษีศุลกากร` | Pillar pages; don't expect month-1 wins |
| **Buyer-intent long-tail** | Mid-decision, converts | `นำเข้าจีน ราคา` · `ชิปปิ้งจีน เจ้าไหนดี` · `ค่าเคลียร์ภาษี คิดยังไง` · `นำเข้า 1688 ไม่มีบริษัท` | **The real leverage** — cluster pages per service slug |
| **Problem-phrased** | High intent, low competition | `สินค้าติดด่าน ทำยังไง` · `โดนภาษีนำเข้า อุทธรณ์` | Knowledge articles → link to the service page |

- **Buyer-intent clusters** — Pacred's 13-service catalogue maps ~1:1 to topic
  clusters (cargo, customs clearance, tax refund, FCL/LCL, …). One pillar +
  several long-tail/problem articles per cluster, all internally linked
  pillar → article → service landing → `/start-order`.
- **Topical authority** is the moat money can't buy: a deep guide hub
  ("นำเข้าจีนฉบับมือใหม่", HS-code explainer, an interactive duty calculator —
  tools earn links + dwell time, Form E / D-O explainers). Show real expertise
  (E-E-A-T): staff, the customs-broker registration, licence numbers, cases.
- **Technical SEO** is largely in place — crawlable routes, per-service
  metadata, Organization/LocalBusiness/Service/FAQ JSON-LD (`components/seo/`).
  The gap is the FAQ schema not being on *every* service page yet, and Core Web
  Vitals (§3.4).
- **Local SEO** — the Google Business Profile (§2.2) + actively soliciting
  reviews from the 8,898-customer base. Reviews are the strongest local-pack
  signal and cost nothing.

### 3.2 Paid channels — weighted for a small budget

| Priority | Channel | Best for | Lean-budget tactic |
|---|---|---|---|
| **1** | **Google Search** | Capturing existing demand — a `ชิปปิ้งจีน ราคา` searcher is a buyer *now* | Tight single-theme ad groups; **exact + phrase match only** at launch; aggressive negative keywords day 1 (`สมัครงาน` `ฟรี` `ราคาส่ง`); concentrate budget on 2-3 money keywords |
| **2** | **Meta (FB/IG)** | Retargeting + a **lookalike from the 8,898-customer list** — Pacred's unfair advantage | Upload the customer list as a Custom Audience → 1-3% lookalike; a few thumb-stopping vertical-video creatives; judge on cost-per-lead |
| **3** | **LINE Ads** | Driving LINE OA friends — then nurture in-channel free forever | Thai benefit-led creatives; the conversion endpoint is a low-friction OA add; retarget with LINE Tag audiences |
| **4** | **YouTube** | Brand / education — weakest direct-response on a tiny budget | Defer, or run minimally: 6-sec bumpers retargeting site visitors only |

**Quality Score is the cost lever.** On Google, a higher Quality Score means a
lower CPC for the same position — moving 5→8 can cut CPC ~30-40%. Its three
inputs: expected CTR, ad relevance, landing-page experience. Win all three by
**putting the keyword in the ad headline AND the landing-page H1**, and pointing
each ad group at a *dedicated* fast page — never the generic homepage. This is
the cheapest CPC reduction available; it is relevance discipline, not spend.

### 3.3 The conversion edge — landing + lead capture

- **LCP < 2.5s on mobile.** The chain is direct: fast LCP → better landing-page
  experience score → higher Quality Score → lower CPC. Most Thai cargo buyers
  arrive on phones — design + verify at 360/390px (the `mobile-first-verify` +
  `landing-conversion-audit` skills).
- **LINE-add CTA converts highest** for Thai cargo customers (familiar, instant,
  staff close conversationally). Make it the prominent primary action; pair with
  a **short** web form (≤4 fields) and a tappable phone — track all three as
  distinct conversions so the budget learns which to chase.
- **Dedicated per-ad-group landing pages**, headline echoing the ad keyword.

---

## 4. Conversion tracking spec — the events

The event-firing code is already in good shape (audited on `dave` tip
`803a93d`). Map these in GTM:

| Event | Fires at | Map to |
|---|---|---|
| `sign_up` | `register/page.tsx` (personal + juristic) | Google Ads conversion · Meta `CompleteRegistration` |
| `generate_lead` | `contact-form.tsx` on submit success | Google Ads "Lead" · Meta `Lead` |
| `place_order` | cart-manager · forwarder-form · yuan-payment-form (carries THB value) | Google Ads "Purchase" · Meta `Purchase` (with value) |
| `wallet_deposit` | wallet deposit form | Google Ads conversion (strong buyer signal) |
| `login` | `login/page.tsx` | GA4 engagement (not a conversion) |
| `cta_click` | ~20 sites incl. `QuoteCTA` | GA4 micro-conversion |

**Setup specifics (2025-2026):** GA4 with **enhanced conversions** (hashed
first-party email/phone — restores accuracy lost to cookie limits); Meta
**Pixel + Conversions API** in parallel with a shared `event_id` for dedup;
LINE Tag; a **server-side GTM container** is worth it (better accuracy, longer
cookie life, lighter client JS → helps LCP). Assign a **conversion value** to
each event so Smart Bidding optimises to money, not raw count.

> **⚠️ Known tracking gap to close.** `generate_lead` currently fires **only on
> `/contact`**. `QuoteCTA` (the calculator→buy bridge) fires `cta_click`, not a
> lead event — so ads optimising for leads will under-count quote requests.
> **Recommendation:** either add a `trackGenerateLead("quote_request")` at the
> `QuoteCTA` / booking-calculator submit, or map `cta_click` with
> `cta_id=open_order` as a GTM conversion. This is a small `lib/`-side change —
> hand to ภูม (owns `lib/analytics.ts` call sites) post-review; it is **not** a
> launch blocker but should land in launch week.

---

## 5. In-system monitoring — "monitor เองได้ในระบบ Pacred"

เดฟ wants to monitor and control everything **inside** Pacred — not log into
five external dashboards. The [`platform-observability-system`](platform-observability-system-2026-05-18.md)
design answers exactly this. Its principle:

- **CONNECT** the 3 capture rails Pacred cannot cheaply rebuild — **Sentry**
  (errors), **GA4 via GTM** (traffic/conversions), **Clarity** (heatmap). These
  are the §2.1 env vars.
- **BUILD** in-house everything that *holds* Pacred's own data — the incident
  table + triage UI, the unified event log, the KPI views, the marketing-funnel
  rollup, the status page.

Staged IO-1 → IO-4:

| Stage | What | State |
|---|---|---|
| **IO-1** | Auto-incident capture + `open→acknowledged→in_progress→resolved` lifecycle + `/admin/incidents` triage queue | ✅ **shipped** (commit `50729cf`) — its Sentry-webhook ingest needs `SENTRY_DSN` set to be fully live |
| **IO-2** | Unified `platform_events` log + per-department KPI panels | ⏸️ Phase C |
| **IO-3** | Audience-scoped KPI views + the **find→convert→buy marketing funnel rollup** (CAC / CPC in-system) | ⏸️ Phase C |
| **IO-4** | Uptime/health monitoring + a public status page + alert-rule engine | ⏸️ Phase C |

**Honest call for tomorrow:** a full in-Pacred Google-Ads/GA4 dashboard is
**IO-3 — a Phase-C build, deferred under D1.** For the launch, monitor via:
the platform consoles (GA4, Google Ads, GTM Preview, Meta Events Manager) +
Pacred's already-shipped **`/admin/incidents`** (errors) and **`/admin/kpi`**
(exec dashboard). The "control every step inside Pacred" vision is real and
designed — it lands as **IO-3 after the D1 faithful port**, not before.

---

## 6. D1 reconciliation — what is in scope now

The five source docs predate the 2026-05-18 **D1** pivot (Pacred → a faithful
port of legacy PCS Cargo; the Tier 0/1/2/3 roadmap deferred to "Phase C").
Re-read through the D1 lens:

| Now (launch-relevant — pure config/infra, D1-safe) | Phase-C deferred (BUILD work) |
|---|---|
| Set the monitoring env vars (§2.1) | The in-system marketing/KPI dashboard (IO-3) |
| Configure the GTM container (§2.1 Step B) | SEO content engine / article automation |
| Verify Search Console + submit sitemap (§2.2) | A/B experiment framework (`ExperimentBeacon`) |
| Claim Google Business Profile (§2.2) | IO-2 / IO-3 / IO-4 observability stages |
| Define the UTM convention (§2.4) | MOMO sync engine, exec-KPI build-out |

None of the "Now" column touches customer product code — it is config + the
already-shipped landing pages. **It does not conflict with the owner's "copy
legacy 100% first" mandate.** The forward *product* work stays D1 Phase B.

---

## 7. Open decisions / blockers for เดฟ + ก๊อต

1. **Account IDs.** The real GTM container ID, GA4 Measurement ID, Google Ads
   ID, Meta Pixel ID, LINE Tag ID — only เดฟ/ก๊อต have the account access.
   This plan says *where* they go; the values must be created/pasted by them.
2. **hCaptcha fail-mode.** `lib/hcaptcha.ts` degrades **OPEN** (intentional —
   `docs/env.md` §12). Under ad traffic, decide: accept it, or set the keys to
   close the gap (recommended — §2.3).
3. **⚠️ `hotfix/auth-unblock` is NOT merged into `dave`.** It carries
   `fix(auth): unblock production signup — hCaptcha degrade-open + CSP allows
   hcaptcha.com`. **Signup is the ad conversion endpoint.** Confirm this fix is
   live in production AND back-merge it to `dave`, or the next `dave→main`
   deploy could regress signup mid-campaign.
4. **Budget split** across the 4 channels — §3.2 recommends Search-first.
5. **GTM container ownership** — who administers tags (recommend ก๊อต, per the
   partner/tools-pick role).
6. **Web search was blocked** when the marketing tactics were researched — have
   ก๊อต spot-check 3 fast-moving items against live help docs before launch:
   Google Ads conversion-tag format, Meta CAPI event-quality requirements,
   LINE Tag / LINE Ads audience minimums.

---

## 8. The connection-check tool

`pnpm check:connections` (added this batch — [`scripts/check-connections.mjs`](../../scripts/check-connections.mjs))
reads `.env.local` and reports, as a PASS / WARN / MISSING table, whether every
analytics / ads / monitoring / payment env var is set — grouped by
launch-criticality. Run it before launch and any time after a deploy. It is the
fast "check การเชื่อมต่อ" answer; the per-tool *verify* steps (does data
actually arrive) live in the [launch-monitoring runbook](../runbook/launch-monitoring-golive-2026-05-17.md).

---

## 9. Cross-links

- [ADR-0017](../decisions/0017-pacred-faithful-pcs-port.md) — D1, the faithful-port direction
- [`../runbook/launch-monitoring-golive-2026-05-17.md`](../runbook/launch-monitoring-golive-2026-05-17.md) — the env-var flip mechanics + per-tool verify
- [`platform-observability-system-2026-05-18.md`](platform-observability-system-2026-05-18.md) — the in-system monitoring design (IO-1..IO-4)
- [`growth-acquisition-strategy-2026-05-18.md`](growth-acquisition-strategy-2026-05-18.md) · [`capability-tools-strategy-2026-05-18.md`](capability-tools-strategy-2026-05-18.md) · [`tools-strategy-build-vs-buy-2026-05-18.md`](tools-strategy-build-vs-buy-2026-05-18.md) — the source analyses
- [`podeng-tooling-2026-05-20.md`](podeng-tooling-2026-05-20.md) — the companion ปอน dev-tooling plan
- Skills: `landing-conversion-audit` (pre-ads page check) · `performance-hunter` (LCP) · `mobile-first-verify`
- [`decisions/0007-analytics-and-ab-testing.md`](../decisions/0007-analytics-and-ab-testing.md) — the GTM/Clarity/A-B ADR

---

*This plan covers marketing infrastructure + configuration only. The customer
product is D1 Phase-B territory — faithful port first, per the owner mandate.*
