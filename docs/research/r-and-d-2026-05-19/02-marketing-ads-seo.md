# Dr. Growth — R&D · Marketing / Ads / SEO / Growth Tooling

> **Captured 2026-05-19 · branch `dave`.** Deep audit of Pacred's customer-acquisition surface — get-found · convert · measure · retarget. Audience: เดฟ + ก๊อต + ปอน. Read order: §1 current state → §2 gaps → §3 tool-by-tool recommendations → §4 deeper research questions → §5 references. Sibling docs in [`docs/research/`](../) — esp. [`growth-acquisition-strategy-2026-05-18.md`](../growth-acquisition-strategy-2026-05-18.md), [`capability-tools-strategy-2026-05-18.md`](../capability-tools-strategy-2026-05-18.md), [`frontend-tooling-2026-05-18.md`](../frontend-tooling-2026-05-18.md), [`customer-intelligence-system-2026-05-18.md`](../customer-intelligence-system-2026-05-18.md). This R&D doc is the **deep tool-recommendation lens** they cross-link out to.

---

## 1. Current state — what is in `dave` today

### 1.1 SEO infrastructure — strong technical bones

| Surface | File | State |
|---|---|---|
| **XML sitemap** | [`app/sitemap.ts`](../../../app/sitemap.ts) | ✅ 27 static routes + dynamic knowledge / customs-port / news entries · per-route `priority` + `changeFrequency` · `hreflang` alternates (`th`/`en`) |
| **robots.txt** | [`app/robots.ts`](../../../app/robots.ts) | ✅ Allow `/`, disallows admin/auth/wallet/orders/etc; names the sitemap; **explicitly allows AI crawlers** (GPTBot, ChatGPT-User, CCBot, Google-Extended, anthropic-ai, Claude-Web) — useful for the AI-discoverability era |
| **JSON-LD** | [`components/seo/schemas.ts`](../../../components/seo/schemas.ts) + [`json-ld.tsx`](../../../components/seo/json-ld.tsx) | ✅ Organization · WebSite · LocalBusiness · BreadcrumbList · FAQPage · Article · Service — fed by `components/seo/site.ts` constants (single SoT). 🟡 No `slogan`/`taxID` populated yet — tracked in `pacred-info.md` migration tracker. 🟡 No `aggregateRating` (no review pipeline → JSON-LD bridge) |
| **Per-page metadata** | [`components/seo/page-meta.ts`](../../../components/seo/page-meta.ts) | ✅ title/description/canonical/`hreflang`/OG/Twitter — i18n-driven from `messages/*` |
| **RSS feed** | [`app/feed.xml/route.ts`](../../../app/feed.xml/route.ts) | ✅ Knowledge-base feed (14 articles) |
| **OG image** | [`app/opengraph-image.tsx`](../../../app/opengraph-image.tsx) | ✅ 1200×630 dynamic SVG-style render with brand red gradient + Sarabun fonts — solid. 🟡 Only **root** OG image exists; per-route OG images would be richer for social shares (each service in its own card) |
| **Service landings** | `app/[locale]/(public)/services/*` | ✅ 6 full content pages: `import-china` (819 lines), `import-china-fcl` (567), `import-china-lcl` (482), `china-shopping` (649), `export-worldwide` (561), customs ad-landing `customs-clearance-shipping-suvarnabhumi` (835) — intent-keyword H1, FAQ schema, trust strip, phone+LINE CTAs |
| **Catalogue index** | `app/[locale]/(public)/services/page.tsx` | ✅ 12 service tiles · 5 "live" · 7 "เร็วๆ นี้" — grouped (cargo / customs / shopping / freight). The 7 "soon" tiles route to `/services` (dead-end) — see §2 |
| **Knowledge / News / Ports** | `lib/knowledge-articles.ts`, `pacred-news-data.ts`, `customs-port-data.ts` (632 lines) | 🟡 **14** knowledge articles · **3** news items · **9** customs ports — enough to seed, **far short** of the long-tail required for 13 services × buyer questions. Customs-port data is rich; news + knowledge thin |

### 1.2 Analytics / measurement — code-wired, env-gated OFF

| Tool | Code surface | Activation status |
|---|---|---|
| **GTM container** | [`components/analytics/gtm-script.tsx`](../../../components/analytics/gtm-script.tsx) (head + `<noscript>` fallback) | 🔴 `NEXT_PUBLIC_GTM_ID` UNSET → script returns `null`. ad-conversion blind |
| **GA4 events (typed)** | [`lib/analytics.ts`](../../../lib/analytics.ts) — 9 helpers (`sign_up`, `login`, `logout`, `generate_lead`, `place_order`, `wallet_deposit`, `wallet_withdraw_request`, `cta_click`, `experiment_exposure`) | 🟡 Helpers called from forms / nav / buttons — but they write into `window.dataLayer` which has no consumer until GTM is on |
| **Microsoft Clarity** | [`components/analytics/clarity-script.tsx`](../../../components/analytics/clarity-script.tsx) | 🔴 `NEXT_PUBLIC_CLARITY_ID` UNSET → no heatmaps, no replays |
| **Sentry** | `lib/logger.ts` (`forwardToSentry`) + `sentry.*.config.ts` + `instrumentation*.ts` | 🔴 `SENTRY_DSN` UNSET → no error tracking — but `IO-1` admin incident triage queue **is** shipped (see [`platform-observability-system-2026-05-18.md`](../platform-observability-system-2026-05-18.md)) |
| **TrackedLink / TrackedExternalLink / TrackedPhoneLink** | [`components/analytics/tracked-link.tsx`](../../../components/analytics/tracked-link.tsx) | ✅ Used on every public-page CTA; wraps `cta_click` automatically — drop-in pattern is good |
| **A/B substrate** | [`lib/experiments.ts`](../../../lib/experiments.ts) + `lib/experiments-server.ts` + [`ExperimentBeacon`](../../../components/analytics/experiment-beacon.tsx) | ✅ Cookie-based FNV-1a bucketing wired; `pacred_vid` cookie set in `proxy.ts`. One live experiment (`home_hero_cta`) — telemetry-only (no UI fork yet) |
| **ContactForm → `trackGenerateLead`** | [`components/contact-form.tsx`](../../../components/contact-form.tsx):62 | ✅ Fires on success — `/contact` renders it live (`b90806b` 2026-05-18 — was a `StubPage` until then) |
| **/start-order + QuoteCTA bridge** | [`app/[locale]/(public)/start-order/page.tsx`](../../../app/[locale]/(public)/start-order/page.tsx) + [`components/booking/QuoteCTA.tsx`](../../../components/booking/QuoteCTA.tsx) | ✅ Tier-1 "เปิดออเดอร์ราคานี้" bridge shipped — calculator quote → `start-order` → login(`?next=`) → `/service-import/add` with params pre-filled. Fires `cta_click(open_order, home_booking_result)` |

### 1.3 Channels — registered, mostly silent

| Channel | In repo | Status |
|---|---|---|
| **LINE OA** `@pacred` (premium) / `@683wolja` (fallback) | ✅ `LINE_OA` const + `/line` short-link route + add-friend URLs · LINE_CHANNEL_ID `2009931373` | ✅ **Outbound push** wired (`lib/notifications/index.ts::sendLinePush`) · 🔴 **Inbound webhook = none** (`find app/api -type d` shows no `webhooks/`, no `app/api/line/`) — the front door of Pacred is invisible to Pacred itself. CI-1 design exists in [`customer-intelligence-system-2026-05-18.md`](../customer-intelligence-system-2026-05-18.md) but **not built** |
| **LIFF** | ✅ `2010105778-SaSkkGza` env-set (`pacred-info.md` 2026-05-16 DV-2) | 🟡 Channel set; LIFF customer-link page (`/liff/link`) referenced in code path but not verified in this audit |
| **Facebook page** | ✅ `SOCIAL.facebook` (PacredShippingCustomsClearanceImportExport) | 🟡 Linked in footer + JSON-LD `sameAs` — **no Pixel · no CAPI · no retargeting** |
| **TikTok** | ✅ `SOCIAL.tiktok` (@pacred.co) | 🟡 Linked — **no TikTok Pixel**; no UTM convention |
| **Instagram** | ✅ `SOCIAL.instagram` (@pacred.co) | 🟡 Linked — no Meta-business connection auditable from repo |
| **YouTube** | ✅ `SOCIAL.youtube` (@PacredShipping) | 🟡 Linked — no embedded videos on landings, no channel-trailer attribution |
| **Google Business Profile** | ❌ **Not referenced anywhere** | 🔴 Free, high-trust, the FIRST thing a Thai customer sees for "ชิปปิ้ง ใกล้ฉัน" — **un-built**. `LocalBusiness` JSON-LD is NOT a GBP listing |
| **Google Search Console** | ❌ No `google-site-verification` meta in `app/layout.tsx` | 🔴 Likely unverified — playbook still lists "add property + submit sitemap" as TODO |
| **Microsoft Bing Webmaster** | ❌ Not referenced | 🔴 Niche but free; useful for BingBot/ChatGPT-Search visibility |

### 1.4 Outbound marketing infrastructure

| Channel | Wired? | What exists | What is missing |
|---|---|---|---|
| **Email (transactional)** | 🟡 Code path | `lib/notifications/index.ts::sendEmail()` uses **Resend** (`api.resend.com/emails`) — `RESEND_API_KEY` unset → no-op | No domain verification confirmed; no DKIM/SPF/DMARC audit trail in repo; no welcome series; no drip; no broadcast email tool |
| **SMS (transactional)** | ✅ | `lib/sms/gateway.ts` — ThaiBulkSMS for OTP | OTP only — no marketing SMS, no notification SMS |
| **LINE push (transactional)** | ✅ | `sendLinePush()` via Messaging API — wired since 2026-05-18 (keys from ก๊อต) | Requires `line_user_id` linkage (LIFF flow); no broadcast LINE fan-out yet (V-G3.1 deferred) |
| **LINE broadcast (admin)** | 🟡 Half | `/admin/broadcasts` + `/admin/broadcasts/new` shipped — `broadcasts` table, status lifecycle (draft → scheduled → sending → sent) ✅. Fan-out writes `notifications` rows only — **LINE push fan-out deferred to V-G3.1** | LINE push fan-out · per-second rate limit · scheduled cron worker · audience filters (registered customer cohorts only — not LINE-only leads, who don't exist as `profiles` yet) |
| **Drip / welcome series** | ❌ | — | No `email_campaigns` / `customer_journey` table; signup confirmation is a one-off, not a sequence |

### 1.5 Performance / page-speed surface

| Concern | State |
|---|---|
| **Image format** | 🔴 **Zero WebP / AVIF in `public/`** — `find … -name "*.webp" -o -name "*.avif"` returns empty. **118 MB of PNG/JPG**; **47 files > 1 MB**, **91 files > 500 KB**. Worst offenders: `companyofficethai.png`, `aboutus/samakom.png`, `knowledge/8.png`, etc. — all PNG, all delivered raw |
| **`next/image` usage** | ✅ Used on most landings — but `next/image` for a PNG still ships ~3-5× the bytes WebP would. `BookingHero.tsx` paints hero art via CSS `background: url(...)` — **bypasses the optimizer entirely** (per [`frontend-tooling-2026-05-18.md`](../frontend-tooling-2026-05-18.md)) |
| **Font loading** | 🟡 `Prompt` Google Font via `next/font/google` with 5 weights (300-700) — good (self-hosted, no FOUT) but Prompt with 5 weights × 2 subsets (latin + thai) is **~120 KB+ shipped per page**. No `display: swap` override (next/font default is `swap` — fine) |
| **JS bundle on landings** | 🟡 Home page is `Server Component` with `'use client'` islands for `BookingCalculator` (heavy: i18n + 8 tab modes + dropdowns + result panels), `Reviews` (carousel), `Sales` (carousel). Not measured here but **a >300 KB JS payload on `/` would hurt LCP on the 3G/4G phone traffic Pacred targets** |
| **LCP-blocking GTM** | 🟢 `Script strategy="afterInteractive"` for GTM + Clarity — won't block FCP/LCP. `<link rel=preconnect>` to `googletagmanager.com` + `google-analytics.com` + `clarity.ms` is in place — solid pattern |
| **OG image** | ✅ Static-rendered (uses node `readFile` for fonts) — Vercel caches it; cheap |
| **Webmanifest** | ❌ No `manifest.webmanifest` referenced in `<head>` → no installable PWA, no Android Add-to-Home-Screen branding |

### 1.6 Conversion event taxonomy — what IS being captured (once GTM is on)

Per [`lib/analytics.ts`](../../../lib/analytics.ts) + ADR-0007 — 9 GA4-recommended events fire from:

| Event | Source location |
|---|---|
| `sign_up` | `actions/auth.ts` paths (personal / juristic / oauth) |
| `login` | login page success |
| `logout` | navbar sign-out form |
| `generate_lead` | `ContactForm` submit (`source: contact_form`) — **only source** |
| `place_order` | 3 customer order forms (service-order, service-import, service-payment) |
| `wallet_deposit` | wallet deposit form success |
| `wallet_withdraw_request` | wallet withdraw form success |
| `cta_click` | `TrackedExternalLink` / `TrackedPhoneLink` / `TrackedLink` wraps (every public CTA) + `QuoteCTA` (`open_order`, `home_booking_result`) |
| `experiment_exposure` | `ExperimentBeacon` per active experiment |

**The data is good — but it has nobody listening yet.**

---

## 2. Gaps (priority-tagged)

> 🔴 = revenue-blocking · 🟠 = high-value · 🟢 = quality / compounding

### 🔴 G-M-1 — Analytics env vars still unset (the keystone)

The single highest-leverage fix in this entire R&D pass. GTM + Clarity + Sentry are wired in code but `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_CLARITY_ID`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` are all unset in Vercel. Consequence:

- **No GA4** → no conversion events ever reach Google Ads → Smart Bidding has nothing to optimise → CPC stays high, spend unattributed
- **No Meta Pixel** (would ride GTM container — also unfireable) → FB ads cannot optimise for "lead" → cargo inquiries from FB are un-retargetable
- **No Clarity** → no heatmaps, no session replay → where customers abandon is invisible
- **No Sentry** → 500s on landing routes go silent; an ad-clicker hitting an error is doubly lost (paid for click + got broken page)
- **No A/B exposure flow** → the wired `home_hero_cta` experiment buckets visitors but the exposure events go nowhere

This is `R-M1/R-M2` and `G-T-1` in prior docs — restated as a **hard launch-week gate**.

### 🔴 G-M-2 — No Google Search Console verification

No `google-site-verification` meta tag in `app/layout.tsx`. New domain (`pacred.co`) without GSC = Google crawls on its own slow schedule. Until GSC verifies + sitemap is submitted + manual indexation requested for home + 5 cargo pages, "หา pacred.co ไม่เจอ" stays true regardless of how good `JSON-LD` is.

**Fix:** add `verification.google` field to `app/layout.tsx` `metadata` OR add DNS-TXT record via Vercel DNS. Then GSC → "Add property" → submit `pacred.co/sitemap.xml`. ~15 minutes.

### 🔴 G-M-3 — No Google Business Profile claim

`LocalBusiness` JSON-LD is shipped — but GBP is a **separate Google product**, the surface that wins "ชิปปิ้ง ใกล้ฉัน" / brand searches, shows the map card, accepts reviews. **Cannot be substituted by markup.** Claim with the HQ address from `ADDRESSES.office` (28/40 หมู่บ้าน สิริ อเวนิว เพชรเกษม 81, หนองแขม 10160). Free; high trust; surfaces in the Google search SERP.

### 🔴 G-M-4 — No paid-channel pixels / no UTM convention

- **No Meta (Facebook) Pixel.** Pacred is running ads (per task context). Without the Pixel, FB cannot optimise for `Lead` event, cannot retarget visitors, cannot build LAL audiences from converters
- **No TikTok Pixel.** TikTok ads have not been confirmed running, but if they ever are: same blindness
- **No Google Ads conversion tag.** Even with GTM on, Google Ads needs a `Conversion Tracking ID + Conversion Label` GTM tag to attribute `place_order` / `generate_lead` back to specific ad clicks
- **No UTM convention.** Source/medium/campaign tagging is undocumented — meaning even after GA4 lights up, a click from `lin.ee/Yg3fU0I` looks identical to a click from a Facebook ad: "direct/none." All paid + social effort cannibalises into one undifferentiated bucket

### 🔴 G-M-5 — Lead funnel has Stage-2 holes the contact form can't cover

`ContactForm` is live on `/contact` (good), but a hot lead landing on a **service page** with a question STILL has no embedded form — only `phoneCs` + LINE links. Empirically, a non-trivial share of cold ad traffic prefers async ("send me details") over sync ("phone me"). **Service-page-embedded lightweight contact forms** would catch the missing slice.

The 7 "เร็วๆ นี้" service tiles (`tax-invoice`, `customs-broker-matching`, `tax-refund`, `fumigation`, `export`, `consignment`, `bill-payment`, `logistics`) **dead-end at `/services`** — high-intent visitors searching for those specific services bounce silently. Each needs at minimum a "ติดต่อทีม + ใส่ความต้องการ" landing — per AGENTS.md §6.

### 🔴 G-M-6 — No LINE webhook = invisible front door

The single most important channel for Thai cargo customers (LINE OA `@pacred`) ingests **zero data into Pacred's system**. Every "สนใจสั่งจีนค่ะ" lands in the LINE app inbox and dies there. No customer-360, no `who answered`, no `close rate`, no `response time`, no attribution. Designed in [`customer-intelligence-system-2026-05-18.md`](../customer-intelligence-system-2026-05-18.md) (CI-1) — **not yet built**. The marketing implication: even after GTM lights up, the "convert" metric will report only web-form leads — the *majority* of real leads (LINE inbound) stay invisible.

### 🟠 G-M-7 — Image weight kills LCP + Ads Quality Score

47 PNG/JPG files over 1 MB, 91 over 500 KB, 118 MB total in `public/images/`. Zero WebP/AVIF. `BookingHero` paints hero art via CSS `background-image` (bypasses Next.js optimisation). On a 4G Bangkok phone, the home page LCP will suffer — Google's Ads Quality Score penalises slow landing pages with **higher CPC**. Direct revenue cost.

**Fix:** batch-convert PNG → WebP (lossy, q=85) — typical 60-80% byte reduction. The `next/image` pipeline auto-serves AVIF/WebP given a source PNG, but it pays the disk cost twice (original PNG + cached WebP); converting at-rest in `public/` is cheaper. Pair with a `pnpm convert-images` script + a check in CI. Estimated reduction: 118 MB → ~25 MB. Tooling: `sharp` (CLI) or `@squoosh/cli`.

### 🟠 G-M-8 — Content long-tail is dangerously thin (14 articles for 13 services)

`lib/knowledge-articles.ts` carries 14 entries. The Thai cargo/customs/freight long-tail is hundreds of HS-codes × service combinations: "ภาษีนำเข้าสินค้าจีนคิดยังไง", "Form E คืออะไร", "นำเข้าเครื่องสำอางจากจีน", "ขอคืนภาษีนำเข้าทำยังไง", per-port articles, per-incoterm articles, per-product-category articles. Each ranks for **dozens** of long-tail queries → leads.

A 14-article base cannot defend the 13-service catalogue. Need a **content engine** — see §3.7.

### 🟠 G-M-9 — `aggregateRating` JSON-LD is empty

Pacred renders `Reviews` carousel on the home page but no `aggregateRating` is published to `Organization`/`LocalBusiness` JSON-LD — Google SERP review-stars are unavailable. Even synthetic-but-attributed reviews from the existing carousel could surface stars in search. Pipeline missing.

### 🟠 G-M-10 — No CRM / lead-management surface

`contact_messages` table + `/admin/contact-messages` exists (good, per `growth-acquisition-strategy-2026-05-18.md`). Broadcasts admin shipped. But:

- No lead-status pipeline (new / contacted / quoted / closed-won / closed-lost)
- No lead-assignment to specific sales rep (วิน / แนท / พลอย)
- No "who is following this lead" lock — duplicate-follow-up risk
- No lead → customer (`profiles`) graduation event when the lead registers
- No SLA timer (first-reply-by-X)
- No commission / close-attribution per rep

This compounds with G-M-6: even when both surfaces ingest leads, there is no system telling sales who-owns-what.

### 🟠 G-M-11 — No conversion KPI dashboard / cost-per-lead view

`/admin/kpi` (Tier-1 shipped) is an executive dashboard but does not surface **acquisition** metrics tied to **ad spend**. The team cannot see CPL (cost-per-lead), CAC (cost-per-customer), per-channel cost-per-lead, or per-keyword CAC from inside Pacred. They will have to bounce between Google Ads UI, Meta Ads Manager, GA4, and the admin to build the picture by hand.

### 🟢 G-M-12 — Per-route OG images missing

Only `app/opengraph-image.tsx` (root) exists. Every service page falls back to the generic Pacred-red OG card. Service-specific OG cards (e.g., FCL vs LCL vs China-shopping cards) would lift social-share CTR.

### 🟢 G-M-13 — No A/B test running real UI fork yet

Substrate exists (`lib/experiments.ts`, `ExperimentBeacon`). `home_hero_cta` is registered but telemetry-only. Once GTM lights up, the FIRST real fork should ship within 1-2 weeks — copy tests on hero, calculator CTA copy, sales-rep card order. Without this, the CRO motor never spins up.

### 🟢 G-M-14 — No internal SEO audit / Lighthouse CI

No `lighthouserc` / Pagespeed budget enforcement / `unlighthouse` CI step. Regressions in LCP / CLS / TBT will land silently. Bundle-size regressions same.

### 🟢 G-M-15 — No reviews / testimonials capture flow

Hardcoded `Reviews` section on home page. No "submit a review" path; no email-after-purchase asking for one; no Google-Business-Profile review request flow; no aggregated rating → JSON-LD bridge. Reviews are a compounding asset — Pacred is leaving them on the table.

### 🟢 G-M-16 — No referral / loyalty surface

Pacred is a relationship business (`legacy-chat-sale-pricing-people.md` documents commission/referral disputes). The `profiles.referral_channel` + `recommended_by` fields exist (migration `0003`) — but no /refer → reward flow, no commission landing, no "your referral converted!" notification. Loyalty + referrals would be the cheapest acquisition channel Pacred has.

---

## 3. Recommendations — tool-by-tool

> Format: **what + why this tool + cost + integration effort + alternatives considered + verdict**. Each ranked by effort/leverage.

### 3.1 GTM + GA4 + Microsoft Clarity — flip the keystone env vars (P0, ~15 min, FREE)

**Already chosen + already wired** — ADR-0007. Action: set in Vercel Production + Preview:
- `NEXT_PUBLIC_GTM_ID = GTM-XXXXXX`
- `NEXT_PUBLIC_CLARITY_ID = abcd1234`
- `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` (already discussed in observability lane)

**Why these specifically:** GTM is the container that will later load Meta Pixel + TikTok Pixel + Google Ads conversion tags without redeploys. GA4 is the free industry-standard funnel + reporting tool. Clarity is free-at-any-quota (Hotjar caps free tier at 35 sessions/day — useless), auto-redacts form inputs (PDPA-safe), session replay for 30 days. **Sequencing rule:** GTM first. Pixels can't fire without a container. ~15 min total for ก๊อต/เดฟ in Vercel UI; do this Monday.

### 3.2 Meta Pixel + Meta Conversions API (CAPI) (P0, 1 day, FREE)

**Pros:**
- Optimise FB ads for `Lead` / `Purchase` events
- Build LAL (look-alike) audiences from converters (LAL-1% of Pacred buyers is the most powerful FB ad audience available)
- Retarget site visitors who didn't convert
- CAPI = server-side event reporting (better post-iOS-14 attribution, harder to ad-block)

**Cons:**
- Pixel-only mode loses ~30% of events to iOS ATT + ad-blockers — CAPI is required for full attribution
- CAPI server route needs the **Meta Access Token** (stored as secret) + event-hashing of email/phone

**Integration cost:**
- Pixel: 1 GTM tag (no code) — fires on `cta_click`, `generate_lead`, `place_order`. ~30 min.
- CAPI: `app/api/meta/conversion/route.ts` — POST hashed `em`/`ph` + event name + event_id (deduplicates against Pixel). Server-side. ~3-4 hours. Pacred can copy the pattern from the existing `app/api/observability/sentry-webhook/route.ts` shape.

**Alternatives considered:**
- **Meta Pixel-only (no CAPI)** — simpler but bleeds ~30% conversion data. Bad bet given Pacred is paying for ads.

**Verdict:** Pixel via GTM ASAP (cheap). CAPI server route as a 1-week follow-up. Owner: ปอน (Pixel/GTM tag), เดฟ (CAPI route).

### 3.3 Google Ads Conversion Tracking (P0, 1 hour, FREE)

GTM tag firing on `place_order` (and optionally `generate_lead`) → Google Ads `Conversion Tracking ID`. Without this, Google Ads' Smart Bidding (`Maximize Conversions`, `Target ROAS`) cannot optimise. With it, CPC drops within ~2 weeks as Google identifies converting traffic shapes.

**Integration:**
1. In Google Ads → Tools → Conversions → New conversion → Website → "Use Google Tag Manager"
2. Copy `Conversion ID` + `Conversion Label`
3. In GTM → new tag `Google Ads Conversion Tracking` → trigger on `Custom Event = place_order` → pass `value` and `currency`
4. Verify via Google Tag Assistant Companion

### 3.4 TikTok Pixel + Events API (P1, 1 day, FREE)

Same pattern as Meta. If/when Pacred runs TikTok ads — and the brief suggests TikTok is in the social catalogue — install the Pixel via GTM. TikTok Events API is the server-side analogue of CAPI. Skip until TikTok ad spend > 5,000 THB/mo to keep focus.

### 3.5 Google Search Console + sitemap submission + Bing Webmaster (P0, 30 min, FREE)

**Action:**
1. In `app/layout.tsx` add `metadata.verification = { google: "<token>" }` (the token Google provides after "Add property")
2. Submit `https://pacred.co/sitemap.xml`
3. Manual indexing request for: `/`, `/services`, `/services/import-china`, `/services/import-china-fcl`, `/services/china-shopping`, `/customs-clearance-shipping-suvarnabhumi`, `/contact`
4. Repeat with Bing Webmaster (`/bing.xml` is auto-supported via the same Google sitemap)

Add **IndexNow** support (a free open standard Bing + Yandex use): `app/indexnow/route.ts` returns the key file; ping `https://www.bing.com/IndexNow?url=…&key=…` on sitemap rebuild. Saves days vs waiting for crawl.

### 3.6 Google Business Profile (P0, 1 hour, FREE)

Claim, verify (postcard or phone), populate with:
- Address: `ADDRESSES.office` (28/40 หมู่บ้าน สิริ อเวนิว เพชรเกษม 81, หนองแขม 10160)
- Phone: `CONTACT.phoneCompany` (02-421-3325)
- Categories: "Freight forwarding service" + "Customs broker" + "Shipping service"
- Hours, photos (use existing office/warehouse images), services list, LINE OA URL as appointment link
- Initial 5-10 reviews from existing customers (the legacy chat-analysis identifies 2026-05-16 the ~8,898-customer base — a tiny outreach yields stars)

**Recurring:** weekly photo upload, monthly Q&A, respond to every review within 24h. Owner: sales-admin role + ก๊อต.

### 3.7 Content engine — programmatic SEO via Sanity / Payload OR keep in-repo (P1, M effort)

The 14-article base must grow to 50-100 articles × per-port pages × per-HS-code pages × per-Incoterm pages over 3-6 months. Three integration options:

**Option A — Stay in-repo (`lib/knowledge-articles.ts` pattern).** Article = TypeScript object + MDX content. **Pros:** zero new infra, Git-tracked, ปอน works in the same editor. **Cons:** every article = a commit + deploy → ปอน becomes the bottleneck; non-devs (sales / sales-admin) can't add content.

**Option B — [Sanity CMS](https://www.sanity.io/) (headless).** **Pros:** real-time editor, image pipeline, content versioning, role-based access, free Community plan (3 users, 10K docs, 1M API requests/mo — plenty for Pacred), exposes a GROQ query API the Next 16 RSCs consume natively. Studio is a hosted React app (`/studio` route in Pacred). **Cons:** schema needs design upfront (~1 day); vendor lock-in (mitigated by exportable JSON). **Integration cost:** ~2 days — schema + GROQ queries + replace `knowledge-articles.ts` with Sanity reads.

**Option C — [Payload CMS](https://payloadcms.com/) (self-host, Postgres-backed).** **Pros:** open-source, MIT, ships with its own Postgres tables next to Pacred's Supabase, full TypeScript types generated, admin UI built-in. **Cons:** another server to host (Vercel + Postgres adapter works) — operational overhead Pacred doesn't have headroom for right now.

**Verdict:** **Sanity** is the right choice **post Phase B** (per D1 — pause new builds until faithful PCS port is done). For now, keep `knowledge-articles.ts` and have ปอน batch-write 20 more articles into it during normal landing-page work. Re-evaluate Sanity in Phase C.

### 3.8 Resend for transactional + lifecycle email (P1, 1 day to harden, $20/mo at scale)

Already half-wired in `lib/notifications/index.ts::sendEmail()` (env-gated off — `RESEND_API_KEY` unset).

**Why Resend specifically:**
- **Pros:** Dev-grade API (1-line per send), React Email template support (compose emails as `tsx` files), $0/mo for 3K emails (plenty for Pacred at current volume), $20/mo for 50K (still cheap), strong deliverability via Postmark-like reputation, native DKIM/SPF/DMARC setup wizard, modern dashboard, free domain verification, well-documented webhook for bounce/complaint events
- **Cons:** No drip / journey builder (Pacred would need to schedule via cron) · No SMS in same product (Pacred uses ThaiBulkSMS for that — fine, separation is OK)

**Alternatives:**
- **SendGrid:** ✅ established, big sender reputation. ❌ enterprise-heavy UI, more expensive at scale ($19.95/mo for 50K), worse DX
- **Postmark:** ✅ best-in-class for transactional. ❌ no marketing/broadcast at all — Pacred eventually wants drip
- **Mailgun:** ✅ cheap. ❌ DX is dated; deliverability suspect for new senders
- **AWS SES:** ✅ cheapest ($0.10 / 1K emails). ❌ no UI, no React Email, deliverability requires reputation-building

**Verdict:** Resend wins for Pacred's DX + cost + React Email synergy. **Action:**
1. `pnpm add resend @react-email/components @react-email/render`
2. Verify `pacred.co` domain in Resend dashboard (DKIM, SPF, DMARC, return-path)
3. Set `RESEND_API_KEY` + `RESEND_FROM=Pacred <noreply@pacred.co>` in Vercel
4. Template the existing notification flows as `emails/*.tsx` React Email components
5. Add a `welcome-series` cron — `email_campaigns` table tracks state (Day 0 = signup, Day 1 = "นี่คือวิธี" how-to, Day 3 = "เปิดออเดอร์แรก" CTA, Day 7 = "มีคำถามไหม" check-in). Owner: เดฟ for the schedule logic, ปอน for the templates.

### 3.9 LINE Messaging API webhook + customer-intelligence (P0/P1, see CI-1 design, M effort)

**Designed in [`customer-intelligence-system-2026-05-18.md`](../customer-intelligence-system-2026-05-18.md)** — not yet built. **Build it.** This is the second-highest leverage item after analytics env vars: every LINE inbound today is invisible. Phase B's customer-portal rework runs in parallel; CI-1 is a *backend-only* build (table + webhook route + admin chat preview) that does not collide with Phase B's frontend work.

**No vendor — fully in-house** per the build-vs-buy verdict. LINE provides the webhook spec; Pacred ingests into Supabase. ภูม can build CI-1 once ภูม clears the migration backlog gate.

### 3.10 A/B testing — keep the in-house substrate, **DO NOT** adopt GrowthBook/PostHog (P1, S effort, $0)

[`lib/experiments.ts`](../../../lib/experiments.ts) — cookie-based, FNV-1a hashing, deterministic, SSR-pure, zero external dep — is already a smart BUILD that avoids a $20-60/mo SaaS. **Keep it.**

**Why not GrowthBook?** ✅ UI for non-devs to create experiments, feature flag system. ❌ Adds ~30KB to client bundle, requires hosting (self-host or pay $0-149/mo), still needs GA4-style integration for stats — and Pacred's exp count is in single-digits. Premature.

**Why not PostHog?** ✅ All-in-one (analytics + A/B + feature flags + session replay). ❌ Replaces GA4 (Pacred already chose GA4 + Clarity). Heavy SaaS lock-in. Bundle hit. Cost scales fast post free tier (1M events/mo free, $0.000248/event after — ~$248 per additional 1M).

**Why not Optimizely?** ❌ Enterprise pricing ($50K+/yr). Skip entirely.

**Verdict:** Pacred's substrate is correct for current scale. Re-evaluate ONLY if Pacred ever runs >5 concurrent experiments AND a non-dev (sales / marketing) needs to author one. Until then, ปอน adds new experiment entries to `EXPERIMENTS` and the typed registry catches errors at compile time. **Action:** flip `home_hero_cta` to a real UI fork within 2 weeks of GTM going live (validates the pipeline end-to-end).

### 3.11 Vercel Speed Insights + Web Vitals reporting (P1, 15 min, FREE / $10/mo at scale)

Vercel's built-in `@vercel/speed-insights` package reports CWV (LCP, INP, CLS) from real-user devices. **Free up to 25K data points/mo**, $10/mo per 100K after. Pacred's traffic at launch fits free tier comfortably. Drop-in: `<SpeedInsights />` in `app/layout.tsx`.

**Why this in addition to Clarity?** Clarity reports session-level; Speed Insights reports Vitals per-page over time → identifies *which page* is regressing LCP. Direct link to Ads Quality Score: a regressed `/services/import-china` LCP = higher CPC.

**Alternative:** Cloudflare Web Analytics (free, similar). Pacred is on Vercel infra → Speed Insights is a 1-line install. Pick Vercel.

### 3.12 Lighthouse CI / Unlighthouse — page-speed budget enforcement (P1, S effort, FREE)

`.github/workflows/lighthouse.yml` runs Lighthouse against PR preview URLs, asserts LCP < 2.5s / CLS < 0.1 / TBT < 200ms. **Tool: [`unlighthouse`](https://unlighthouse.dev/)** — site-wide Lighthouse, cheap, opensource. CI build fails if a regression lands.

**Alternative:** [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) — official, slightly heavier setup; same outcome. Unlighthouse is the developer-friendlier pick.

### 3.13 Image optimisation pipeline — Sharp + a CI gate (P1, S effort, FREE)

**Action:**
1. `pnpm add -D sharp` (already in tree via `next/image` deps)
2. `scripts/convert-images.ts` — walks `public/images/`, converts PNG → WebP (q=82) + AVIF (q=72) preserving filename, leaves PNG as fallback
3. Replace `<Image src="/images/foo.png" />` with `<Image src="/images/foo.webp" />` (next/image auto-fallback chain is good)
4. CI step: fail if any `public/**/*.{png,jpg}` exceeds 300 KB (forces conversion discipline)

**Alternative tool — [Squoosh CLI](https://github.com/GoogleChromeLabs/squoosh):** good but slower; same outcome. Sharp wins for npm-native + speed.

**Expected impact:** 118 MB → ~25-30 MB. LCP on phone improves 0.5-1.5s. Direct Ads Quality Score lift.

### 3.14 CRM / lead-management — BUILD in `/admin/leads` (P1, M effort, FREE)

Build, do not buy. Pacred has `contact_messages` (web form leads), `profiles` (registered customers), and (post CI-1) LINE chat leads. The CRM = a **unified table view** + status pipeline:

**Schema sketch (provisional `0085_leads.sql`):**
```sql
create table leads (
  id uuid primary key,
  source text not null,  -- contact_form | line_oa | facebook_dm | sales_inbound | referral
  channel text,           -- google_ads | fb_ads | organic | direct | line_share
  first_contact_at timestamptz not null,
  display_name text,
  contact_phone text,
  contact_email text,
  line_user_id text,
  profile_id uuid references profiles(id),  -- set when lead graduates to customer
  assigned_to_admin_id uuid references admins(id),
  status text not null,   -- new | contacted | quoted | won | lost
  status_reason text,
  estimated_value_thb numeric,
  notes text,
  created_at timestamptz default now()
);
```

UI: `/admin/leads` — kanban-style status columns, click to detail. Sales rep assignment + reassignment audit-logged. Hooks: contact-form submit → row; LINE webhook (CI-1) → row; profile-create graduates the row.

**Alternatives considered:**
- **HubSpot CRM** (free tier) — ✅ all-in-one. ❌ data leaves Pacred ecosystem; per-rep license costs scale; Thai customer support modest; integration cost high
- **Pipedrive** — ✅ Thai-friendly. ❌ $14-$80/user/mo, same lock-out concern
- **Salesforce** — overkill; enterprise pricing
- **Zoho CRM** — cheap, but again external

**Verdict: BUILD.** Per [`capability-tools-strategy-2026-05-18.md`](../capability-tools-strategy-2026-05-18.md) build-vs-buy verdict: anything that holds Pacred customer data → build. The CRM is exactly that.

### 3.15 Acquisition / conversion KPI dashboard — `/admin/kpi/acquisition` (P1, M effort, FREE)

Extends the shipped `/admin/kpi` exec dashboard with an acquisition tab:
- **Funnel:** Visitors (GA4) → Leads (`contact_messages` + LINE-CI-1 + booking-quote events) → Signups (`profiles`) → Orders (3 order tables) → Paid
- **CPL by channel:** ad spend pulled via Google Ads API + Meta Marketing API (both free for API access) ÷ leads tagged with `utm_source`
- **CAC by channel:** ad spend ÷ paid customers
- **Reply-time per rep:** first `admin_message` timestamp − `customer_message` timestamp (post CI-1)
- **Close-rate per rep:** won leads / assigned leads

This is the panel where the team will see "Google Ads is 3× the CPL of LINE inbound — kill the campaign / scale the LINE outreach."

Use the `audit-kpi-dashboard` skill to scaffold. Schedule a weekly digest email via Resend → ก๊อต/เดฟ/ปอน.

### 3.16 Plausible / Fathom / Umami — **explicitly REJECT** (P3, no action)

Privacy-first analytics alternatives. ❌ Pacred is on free GA4 already; switching loses ad-platform integrations (Google Ads conversion import, Meta CAPI), which is the whole point. Plausible's privacy story is nice but Pacred is a B2B with PDPA-disclosed cookie use; not a privacy-first persona. Skip.

### 3.17 Webmanifest + PWA basics (P2, 30 min, FREE)

`public/manifest.webmanifest` + `app/manifest.ts` declaring icons, theme color (`#B30000`), display: `standalone`. Lets Android Chrome offer "Add to Home Screen" with the Pacred logo. Cheap. Mobile-first surface.

### 3.18 Referral / loyalty surface (P2, M effort, FREE — BUILD)

`profiles.referral_channel` + `recommended_by` columns already exist. Wire:
- `/refer` member page — unique referral URL + share-via-LINE button
- Reward flow — credit `wallet_balance` on referred customer's first paid order
- Notification to referrer

Direct fit with Pacred's relationship-business identity and the legacy commission/referral pain (per `legacy-chat-sale-pricing-people.md`).

### 3.19 Review capture flow — Google Business Profile + on-site (P2, S effort)

**Action:**
1. Post-order completion email (via Resend) — "เซลล์รีวิวเราหน่อย" → Google Business Profile review URL
2. `/admin/reviews` — admin moderates submitted on-site reviews → publish to home `Reviews` carousel + accumulate `aggregateRating` for JSON-LD
3. Hook: every published review → `Organization` JSON-LD `aggregateRating` updates; auto-flows into Google SERP review stars

### 3.20 LINE OA rich-menu + segment broadcasts (P2, M effort, FREE)

LINE OA Manager (free) supports rich menus + broadcast segmentation. Build:
- Greeting message → "What service are you looking for?" rich menu (6 buttons: import-FCL / import-LCL / china-shopping / customs-clearance / export / talk-to-sales)
- Each routes to `lin.ee/Yg3fU0I?utm_source=line_oa&utm_medium=rich_menu&utm_campaign=fcl_funnel` → tracked in GA4
- Segment broadcast: non-converters > 7d → "ติดอะไรไหม" check-in
- Owner: sales-admin can edit rich menu in LINE OA Manager UI (no code)

### 3.21 Per-route OG images (P3, S effort, FREE)

Add `app/[locale]/(public)/services/[slug]/opengraph-image.tsx` (Next 16 native pattern) — generates per-service OG card with title from i18n. Reuses the `app/opengraph-image.tsx` style. ~2 hours.

---

## 4. Deeper research — questions worth chasing

These don't have a one-paragraph answer; each merits its own short investigation (1-3 hours each):

### 4.1 Real LCP measurement on home / cargo landings (mobile + Bangkok 4G)

Run [WebPageTest](https://www.webpagetest.org/) from Bangkok ISP node, throttle to 4G, test `/`, `/services/import-china`, `/services/import-china-fcl`, `/customs-clearance-shipping-suvarnabhumi`. Document LCP, TBT, JS bytes, image bytes per page. Establish baseline. Then commit to a Lighthouse CI budget per page. The Pacred team is flying without numbers on this; the Ads Quality Score depends on it.

### 4.2 Google Ads keyword theme audit — what is Pacred actually bidding on?

Check Google Ads keyword themes against the actual landing-page H1 / FAQ schema. **Hypothesis:** ads run on broad cargo terms ("นำเข้าจีน", "ชิปปิ้ง") but the landing page leads with FCL/LCL details — keyword↔intent mismatch hurts Quality Score. Pull the ad copy from Google Ads, walk it to the landing, score relevance. Pair with ก๊อต / sales-admin.

### 4.3 LINE OA add-channel attribution

LINE OA shows where each new friend came from (`Search` / `URL` / `QR` / `Profile`). Cross-reference with the UTM-tagged `/line` short-link routes — are FB-ad-sourced LINE friends actually being tagged? If `app/line/route.ts` doesn't propagate UTM into the LINE add-friend flow, every social-sourced LINE lead looks identical. Worth a 2-hour audit.

### 4.4 Competitor positioning study — top 5 TH cargo/freight competitors

Pull SERP for "นำเข้าจีน FCL", "ชิปปิ้งเคลียร์ภาษี", "ฝากสั่งซื้อ Taobao" — for each top-5 organic result + top-3 ads, document: H1, slug, JSON-LD presence, OG card, mobile LCP, primary CTA, LINE OA presence, GBP card, content depth. Output: positioning matrix that drives content gap-fill priority. Owner: ปอน per podeng.md.

### 4.5 PDPA / Cookie consent — when does Pacred legally need a consent banner?

`ADR-0007` decided no consent banner — but PDPA (Thailand's GDPR analogue) requires consent for certain cookie categories. Validate: does GA4 + Meta Pixel + Clarity require explicit opt-in under PDPA, or does the existing `/privacy` page + first-party data flow exempt? Likely requires a thin "manage preferences" surface and a `pacred_consent` cookie that gates Pixel + Clarity loads. ~2-hour legal-engineering pass; cross-references the K-sec PDPA registration pending in `pacred-info.md`.

### 4.6 SEO content engine ROI model

Before committing ปอน's time to 50+ articles, model expected impact: assume 50 articles × average 50 organic sessions/month/article × 1% lead conversion = 25 leads/mo at ~no marginal CPL. Compare to running an additional 25,000 THB Google Ads campaign for the same lead count. The content asset compounds; the ad spend doesn't. This is the financial justification for the long-tail content engine.

### 4.7 Channel attribution & multi-touch

A Pacred customer typically: sees a FB ad → searches Google for brand → adds LINE → asks → signs up → pays. Multi-touch attribution (last-click vs. linear vs. time-decay) gives wildly different per-channel CAC. Once GA4 + Meta CAPI are live, run side-by-side attribution windows; pick a model the team trusts; commit to it for budget decisions.

### 4.8 Repeat-purchase / LTV per customer

Pacred's revenue is shipment-rate × customers × per-customer-shipments/year. Currently no LTV view. Once `orders` + `service_import` tables flow through `/admin/kpi/acquisition`, calculate LTV per acquisition channel — likely shows organic LINE/referral has 3-5× the LTV of paid ad customers. Direct input to budget allocation.

### 4.9 Should Pacred adopt server components for the `/admin/kpi/acquisition` panels?

Heavy charting libraries (Recharts, ApexCharts) ship 100-200KB to client. Pacred's `/admin/kpi` exec dash already uses one — verify which, see if it can be replaced with server-rendered SVG (using `@nivo/*` SSR mode or hand-rolled SVG). Bundle size on admin pages matters less than on landings but still compounds.

### 4.10 Schema-org Product / Offer / FAQPage richness audit

Test each landing in [Google Rich Results Test](https://search.google.com/test/rich-results). Pacred has FAQ + Service + Breadcrumb. Could add: `Offer` (price ranges from the booking calculator), `Course` (knowledge articles), `HowTo` (existing `how-to-use` page). Each unlocks a SERP feature.

---

## 5. References

### Within this repo

- 🌱 SEO + ad-landing playbook (when found) → search `docs/briefs/podeng-seo-and-ad-landing-playbook.md` (referenced in `podeng.md` cross-links)
- 🎯 ปอน's brief (D1 pivot) → [`docs/briefs/podeng.md`](../../briefs/podeng.md)
- 📊 Growth + acquisition prior synthesis → [`docs/research/growth-acquisition-strategy-2026-05-18.md`](../growth-acquisition-strategy-2026-05-18.md)
- 🛠 Tools build-vs-buy → [`docs/research/tools-strategy-build-vs-buy-2026-05-18.md`](../tools-strategy-build-vs-buy-2026-05-18.md)
- 🌐 Capability synthesis (Tier 0/1/2/3) → [`docs/research/capability-tools-strategy-2026-05-18.md`](../capability-tools-strategy-2026-05-18.md)
- 🔭 Customer-intelligence (LINE webhook + customer-360) → [`docs/research/customer-intelligence-system-2026-05-18.md`](../customer-intelligence-system-2026-05-18.md)
- 🚨 Platform observability (Sentry / GA4 / Clarity rails sibling) → [`docs/research/platform-observability-system-2026-05-18.md`](../platform-observability-system-2026-05-18.md)
- 🎨 Frontend tooling research → [`docs/research/frontend-tooling-2026-05-18.md`](../frontend-tooling-2026-05-18.md)
- 📐 Analytics + A/B decision → [`docs/decisions/0007-analytics-and-ab-testing.md`](../../decisions/0007-analytics-and-ab-testing.md)
- 🏢 Brand / contact SoT → [`docs/pacred-info.md`](../../pacred-info.md) · constants → [`components/seo/site.ts`](../../../components/seo/site.ts)
- 🚀 D1 roadmap → [`docs/UPGRADE_PLAN.md`](../../UPGRADE_PLAN.md)

### Code surface inventory referenced in this doc

| Area | File |
|---|---|
| GTM loader | [`components/analytics/gtm-script.tsx`](../../../components/analytics/gtm-script.tsx) |
| Clarity loader | [`components/analytics/clarity-script.tsx`](../../../components/analytics/clarity-script.tsx) |
| Analytics helpers (typed events) | [`lib/analytics.ts`](../../../lib/analytics.ts) |
| A/B substrate | [`lib/experiments.ts`](../../../lib/experiments.ts) + [`lib/experiments-server.ts`](../../../lib/experiments-server.ts) |
| Experiment beacon | [`components/analytics/experiment-beacon.tsx`](../../../components/analytics/experiment-beacon.tsx) |
| Tracked link wraps | [`components/analytics/tracked-link.tsx`](../../../components/analytics/tracked-link.tsx) |
| Root layout (GTM/Clarity mount) | [`app/layout.tsx`](../../../app/layout.tsx) |
| Sitemap | [`app/sitemap.ts`](../../../app/sitemap.ts) |
| Robots | [`app/robots.ts`](../../../app/robots.ts) |
| RSS feed | [`app/feed.xml/route.ts`](../../../app/feed.xml/route.ts) |
| OG image | [`app/opengraph-image.tsx`](../../../app/opengraph-image.tsx) |
| JSON-LD schemas | [`components/seo/schemas.ts`](../../../components/seo/schemas.ts) + [`components/seo/json-ld.tsx`](../../../components/seo/json-ld.tsx) |
| Per-page metadata | [`components/seo/page-meta.ts`](../../../components/seo/page-meta.ts) |
| Site constants | [`components/seo/site.ts`](../../../components/seo/site.ts) |
| Contact form (P-6) | [`components/contact-form.tsx`](../../../components/contact-form.tsx) |
| Contact form action | [`actions/contact.ts`](../../../actions/contact.ts) |
| Start-order bridge | [`app/[locale]/(public)/start-order/page.tsx`](../../../app/[locale]/(public)/start-order/page.tsx) |
| Quote CTA | [`components/booking/QuoteCTA.tsx`](../../../components/booking/QuoteCTA.tsx) |
| Booking calculator | [`components/booking/BookingCalculator.tsx`](../../../components/booking/BookingCalculator.tsx) |
| Notifications (LINE push + Resend email) | [`lib/notifications/index.ts`](../../../lib/notifications/index.ts) |
| Broadcasts admin | [`actions/admin/broadcasts.ts`](../../../actions/admin/broadcasts.ts) + [`app/[locale]/(admin)/admin/broadcasts/page.tsx`](../../../app/[locale]/(admin)/admin/broadcasts/page.tsx) |
| SMS gateway | [`lib/sms/gateway.ts`](../../../lib/sms/gateway.ts) |
| Logger / Sentry forward | [`lib/logger.ts`](../../../lib/logger.ts) |

### External / tool homepages

- [Google Tag Manager](https://tagmanager.google.com/) — container UI
- [Google Analytics 4](https://analytics.google.com/) — reporting
- [Microsoft Clarity](https://clarity.microsoft.com/) — heatmap + replay
- [Sentry](https://sentry.io/) — error tracking
- [Resend](https://resend.com/) — transactional + lifecycle email
- [React Email](https://react.email/) — email templating
- [Meta Conversions API docs](https://developers.facebook.com/docs/marketing-api/conversions-api/)
- [TikTok Events API docs](https://business-api.tiktok.com/portal/docs?id=1739585702922241)
- [Google Search Console](https://search.google.com/search-console/)
- [Bing Webmaster](https://www.bing.com/webmasters/)
- [Google Business Profile](https://business.google.com/)
- [Vercel Speed Insights](https://vercel.com/docs/speed-insights)
- [Unlighthouse](https://unlighthouse.dev/) — site-wide Lighthouse CI
- [Sharp](https://sharp.pixelplumbing.com/) — image conversion
- [Sanity](https://www.sanity.io/) — headless CMS (Phase-C candidate)
- [IndexNow](https://www.indexnow.org/) — open indexing standard

---

**End — `02-marketing-ads-seo.md`.** Three things to remember: **(1)** the keystone is the env-var flip — every other tool either feeds GA4 or reads GA4, and Pacred is *paying for ads with no conversion tracking*, so the 15-minute Vercel UI fix outranks every build below it. **(2)** Build the in-house CRM + LINE webhook ingestion before adopting any external CRM — Pacred's identity is "ทุกอย่างในระบบเรา"; HubSpot/Pipedrive split that. **(3)** Image weight is a silent revenue tax — 118 MB of PNG raises CPC via Quality Score; a `sharp` script and a CI gate are a one-day fix.
