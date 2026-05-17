# 📈 Pacred — Growth & Customer-Acquisition Strategy (find → convert → buy)

> **Produced 2026-05-18** for เดฟ. **What this is:** an end-to-end audit of
> Pacred's ability to (1) **get found**, (2) **convert** a visitor, and (3) let
> the customer **actually buy ("กดซื้อ")** — plus a prioritized **build-vs-buy
> tooling roadmap**.
>
> **The mandate (เดฟ, verbatim intent):** *"ต่อให้ระบบจะดีแค่ไหน ถ้าหาลูกค้าไม่ได้
> หรือปิดดีลให้ลูกค้ากดซื้อไม่ได้ ก็จบเห่."* — no matter how good the system is,
> if you cannot FIND customers or CLOSE the deal, it is all over. And:
> *"ค้นหาช่องทางสื่อไหนก็เจอเราก่อนเสมอ"* — Pacred must be found FIRST on every
> search + social channel.
>
> **This builds ON, does not redo:** the SEO/landing playbook
> ([`../briefs/podeng-seo-and-ad-landing-playbook.md`](../briefs/podeng-seo-and-ad-landing-playbook.md)),
> ปอน's brief ([`../briefs/podeng.md`](../briefs/podeng.md)), the customer +
> integrations gap-hunts ([`gap-customer.md`](gap-customer.md),
> [`gap-integrations-tools.md`](gap-integrations-tools.md)), and the master
> strategy ([`PACRED-MASTER-STRATEGY.md`](PACRED-MASTER-STRATEGY.md)). It adds
> the **tooling + funnel lens** those docs lacked. Every "what we have" claim
> below is grounded in the live repo (verified 2026-05-18, branch `dave`).
>
> **Read order:** §1 TL;DR → §2 get-found → §3 conversion funnel walk →
> §4 measurement → §5 the build-vs-buy roadmap (the schedule) → §6 phasing.

---

## 1. TL;DR

Pacred launched to production 2026-05-17. The **SEO foundation is genuinely
strong** — sitemap, robots, JSON-LD on every page, OG/Twitter meta, RSS, rich
per-service landings (`/services/import-china` is a 5-section content page, not
a stub). On the get-found axis Pacred is *technically* ready to rank.

But the **find → convert → buy** chain has **three structural breaks**, and —
exactly as §6 of the master strategy warned about the revenue flow — they look
like small separate tickets and are actually one theme: **the acquisition
machinery is built but unplugged.**

1. **🔴 Measurement is OFF.** Every analytics tool (GTM/GA4, Clarity, Sentry)
   is `npm`-installed, code-wired, mounted in `app/layout.tsx` — and **env-gated
   to a no-op** (`NEXT_PUBLIC_GTM_ID` etc. all unset). The company is spending
   on Google + FB ads *right now* with **zero conversion tracking** → it cannot
   see cost-per-lead, cannot see which keyword/ad converts, cannot optimize.
   This is the single highest-leverage fix in this doc and it costs **10
   minutes** (set env vars), not a sprint.

2. **✅ RESOLVED (`b90806b`) — the lead-capture form is now live on `/contact`.**
   `ContactForm` (`components/contact-form.tsx`) + `submitContactMessage`
   (`actions/contact.ts`) + the `contact_messages` table + admin fan-out
   notifications were already all built; the missing wire — rendering
   `ContactForm` on `/contact` (previously a `StubPage`) — has shipped. An
   ad-clicker who is not ready to phone/LINE can now leave their details, and
   `trackGenerateLead` (the `generate_lead` GA4 event) fires from a live page —
   so once GTM is switched on, the lead funnel reports real leads. *(Original
   finding, now closed, kept for the audit trail.)*

3. **🔴 No self-serve "ad-click → กดซื้อ" path.** The conversion funnel has a
   hard wall between the *public* site and the *act of buying*. The home
   `BookingCalculator` computes a real price — then `ResultBox` shows the number
   and the **only** next step is `SalesModal` (phone/LINE a sales rep). There is
   **no "สมัคร + เปิดออเดอร์ราคานี้เลย" button**. A motivated visitor who wants
   to self-serve must: guess that `register` is the path → complete a multi-step
   signup → find `/service-order/add` on their own. The legacy-style "talk to
   sales" close is the *only* close on every public surface. For a vision that
   is explicitly *"ทุกคนนำเข้าได้ ง่ายๆแค่ปลายนิ้ว"* (full self-serve), the
   public→buy bridge is missing.

**The pattern:** get-found is ~80% there; **convert + buy + measure are built
but not wired to each other**. Three of the top-5 moves below are *connect what
exists*, not *build new* — which is why they are fast and cheap.

**Do-now (launch-week, all small, all BUY-or-tiny-BUILD):** set the 3 analytics
env vars · verify Google Search Console + submit sitemap · register Google
Business Profile · render `ContactForm` on `/contact` + service pages · add a
"เปิดออเดอร์ราคานี้" CTA to `ResultBox`.

---

## 2. Get found — can a Thai customer searching with intent find Pacred first?

### 2.1 Organic SEO — what the repo actually has (audited)

| Surface | File | State |
|---|---|---|
| **XML sitemap** | [`app/sitemap.ts`](../../app/sitemap.ts) | ✅ Strong — 26 static routes + dynamic knowledge / customs-port / news entries, per-route `priority` + `changeFrequency`, `hreflang` alternates (th/en). |
| **robots.txt** | [`app/robots.ts`](../../app/robots.ts) | ✅ Good — `allow: /`, disallows admin/auth/protected, names the sitemap, explicitly allows AI crawlers (GPTBot, CCBot, anthropic-ai…). |
| **JSON-LD** | [`components/seo/schemas.ts`](../../components/seo/schemas.ts) + [`json-ld.tsx`](../../components/seo/json-ld.tsx) | ✅ Strong — Organization, WebSite, LocalBusiness on every page (locale layout); per-service `Service` schema; `BreadcrumbList`; `FAQPage`; `Article`. |
| **Per-page metadata** | [`components/seo/page-meta.ts`](../../components/seo/page-meta.ts) | ✅ Good — title/description/canonical/`hreflang`/OG/Twitter, i18n-driven from `messages/*`. |
| **RSS feed** | [`app/feed.xml/route.ts`](../../app/feed.xml/route.ts) | ✅ Knowledge-base feed. |
| **Service landings** | `app/[locale]/(public)/services/*` | ✅ The 4 cargo-revenue pages (`import-china`, `-fcl`, `-lcl`, `china-shopping`, `customs-clearance-shipping-suvarnabhumi`) are **full content pages** — intent-keyword H1, FAQ schema, trust strip, phone+LINE CTAs. ปอน's brief still calls these "StubPage" — **stale; they are done.** |
| **Content depth** | `lib/knowledge-articles.ts` etc. | 🟡 Thin — **15** knowledge articles, **3** news items, **9** customs-port pages. Enough to seed; not enough to own the long tail. |

**Verdict on get-found-organic:** the *technical* SEO is in good shape — better
than most launch-stage Thai sites. Two real gaps remain:

- **🔴 G-SEO-1 — Search Console almost certainly not verified.** The playbook
  ([`podeng-seo-and-ad-landing-playbook.md`](../briefs/podeng-seo-and-ad-landing-playbook.md)
  §1.2) lists "add GSC property + submit sitemap + request indexing" as a
  *to-do*. There is **no `google-site-verification` meta tag** in
  `app/layout.tsx` (verified — only `icon` tags), so DNS-TXT verification is the
  assumption but unconfirmed. **A new domain with no GSC = Google crawls on its
  own slow schedule.** Until GSC is verified and the sitemap submitted, "หา
  pacred.co ไม่เจอ" stays true no matter how good the markup is.
- **🟡 G-SEO-2 — content long-tail is thin.** High-intent Thai queries
  ("ภาษีนำเข้าสินค้าจีนคิดยังไง", "Form E คืออะไร", "นำเข้าเครื่องสำอางจากจีน",
  per-HS-code, per-port) are won by *articles*, not service pages. 15 articles
  cannot cover the catalogue of 13 services × buyer questions.

### 2.2 Paid — is ad spend measurable?

**🔴 No — and this is the most expensive single fact in this doc.** GTM is the
container that would load GA4 + the Meta Pixel + the TikTok Pixel.
`components/analytics/gtm-script.tsx` returns `null` when `NEXT_PUBLIC_GTM_ID`
is unset (verified) — and it **is** unset (`.env.example` ships it blank;
`gap-integrations-tools.md` §2 confirms no Vercel value). Consequence chain:

- No GA4 → **no conversion events reach Google Ads** → Google's Smart Bidding
  has nothing to optimize toward → CPC stays high, spend is unattributed.
- No Meta Pixel → **Facebook ads cannot be optimized for "lead"** and cannot
  retarget site visitors → the FB cargo inquiries the company already gets are
  un-tracked and un-retargetable.
- No GA4/GTM → **cost-per-lead and cost-per-customer are literally
  uncomputable.** The company is, today, flying the ad budget blind.

The fix is **not** a build — GTM is fully wired. It is *one env var* (`G-T-1`
below). This is the cheapest, highest-leverage item in the entire roadmap.

### 2.3 Channels — LINE OA, Google Business, Meta, TikTok, YouTube, IG

Channel constants are centralized in
[`components/seo/site.ts`](../../components/seo/site.ts) (`SOCIAL`, `LINE_OA`) —
clean, single-source, fed into JSON-LD `sameAs`. Audit:

| Channel | In repo | Routes to a converting page? | Gap |
|---|---|---|---|
| **LINE OA** (`@pacred`) | ✅ `LINE_OA` const, `/line` short-link, CTAs site-wide | ✅ — every service page has a LINE CTA; LINE is the *de facto* primary close | The OA itself is a human inbox; fine for now. No greeting-message → rich-menu → catalogue flow audited here. |
| **Google Business Profile** | ❌ **Not referenced anywhere** | — | 🔴 **G-CH-1.** For "ชิปปิ้ง ใกล้ฉัน" / brand searches, the GBP card *is* the first thing a Thai customer sees. `LocalBusiness` JSON-LD is shipped but **JSON-LD ≠ a GBP listing.** Free, high-trust, un-built. |
| **Facebook / Meta** | ✅ link in `SOCIAL` | 🟡 — links to the FB page, not a landing | No Meta Pixel (see §2.2). |
| **TikTok / YouTube / IG** | ✅ links in `SOCIAL` | 🟡 — brand links only | No TikTok Pixel; no UTM convention so social traffic is unattributed even once GA4 is on. |

**Channel verdict:** consistency is good (one source of truth). The gaps are
(a) **no Google Business Profile** — a free first-impression surface left on the
table, and (b) **no pixels / no UTM discipline** so paid + social traffic is
invisible to analytics.

---

## 3. The conversion funnel — walked in the code

Tracing the real path from ad-click to a completed purchase:

```
[ad / search] → public landing → ??? → register (multi-step) → /service-order/add → cart → pay → กดซื้อ
                      │              │           │                                                  │
                  ✅ strong      🔴 WALL     🔴 friction                                      ✅ exists, gated
```

### Stage 1 — Landing (ad-click arrives). ✅ Strong.
The service pages are well-built: intent H1, trust strip, FAQ, phone+LINE CTAs
above the fold, `TrackedExternalLink`/`TrackedPhoneLink` wrap the CTAs (so
`cta_click` *will* fire — once GTM is on). The home `BookingCalculator` is a
genuinely good acquisition asset: a real LCL/FCL/truck/air price calculator.

### Stage 2 — Landing → inquiry/lead. 🔴 The wall.
This is the worst break in the funnel. Two of the three obvious "I'm
interested" actions are missing or dead-ended:

- **Lead form: built, unplugged.** `ContactForm` + `submitContactMessage` +
  `contact_messages` + admin notify-fan-out **all exist and work**
  (`actions/contact.ts` verified). But `ContactForm` is rendered on **no public
  page** — `grep` for it across `app/` returns only `admin/admins` (an
  unrelated screen). `/contact` is a bare `StubPage`. **An ad-clicker who is
  not ready to phone has no way to convert.** This is a complete,
  ready-to-use lead pipeline with the last wire unconnected.
- **`generate_lead` will report zero.** `trackGenerateLead` has exactly **one
  caller** — the unused `ContactForm`. So even after GTM is switched on, the GA4
  lead funnel shows nothing, because the only thing that fires the event is on
  no page. Booking-calculator usage fires `cta_click` (`booking_calculate`) but
  **never `generate_lead`** — so a calculated quote is not counted as a lead.
- **Booking calculator dead-ends at a price.** `ResultBox` shows the number and
  stops. `PanelFooter`'s only escalation is `SalesModal` (sales-rep cards). A
  customer who just saw "your shipment ≈ ฿X" is given **no path to act on it
  themselves** — no "เปิดออเดอร์นี้", no "สมัครเพื่อจอง". The highest-intent
  moment on the whole site (a visitor who typed in real cargo numbers) leaks
  straight to a phone call.

### Stage 3 — Inquiry → register. 🔴 Friction.
Registration ([`app/[locale]/(auth)/register/page.tsx`](../../app/%5Blocale%5D/%28auth%29/register/page.tsx))
is well-engineered (OTP, hCaptcha, juristic DBD lookup, captures
`services`/`howKnow` — a useful attribution signal). But it is a **destination
the visitor must find**, not a step they are *led to*. There is no
"continue as guest → we'll create your account with this order" flow; no
landing CTA says "สมัครฟรี เปิดออเดอร์แรกใน 2 นาที". The signup is good once
you are *on* it — the gap is everything *before* it. (Note: register is
correctly `Disallow`ed in robots — fine, it should not rank.)

### Stage 4 — กดซื้อ (the actual purchase). ✅ Exists, auth-gated.
Once inside, the buy machinery is real and rich: `/service-order/add` (China
shop-order with URL→cart), `/service-import/add`, the cart, `/wallet/deposit`
(PromptPay QR), pay-from-wallet. `gap-customer.md` already catalogues the
*post*-purchase holes (credit line, claims). For *this* doc the point is
narrower: **the buy step works — it is just walled off behind an
unsignposted signup, reachable only by a customer determined enough to find
it.** The frictionless "ปลายนิ้ว" promise breaks at Stage 2–3, not Stage 4.

### Stage 5 — Drop-off summary

| Drop-off point | Why customers leak | Fixed by |
|---|---|---|
| Landing → (nothing) | No lead form on any public page | `G-F-1` |
| Booking quote → (nothing) | `ResultBox` has no "act on this" CTA | `G-F-2` |
| Interested → register | Signup is unsignposted; no guided "start here" | `G-F-2` / `G-F-3` |
| Whole funnel | No GTM → drop-off is **invisible**; cannot even *find* the leak | `G-T-1` |

---

## 4. Measurement — can Pacred SEE acquisition working?

**Today: almost nothing is measurable.** A tool that is not monitored is not a
tool. Current state of every measurement surface (verified against the repo):

| Tool | Wired in repo | Live? | What Pacred loses while it's off |
|---|---|---|---|
| **GTM + GA4** | ✅ `gtm-script.tsx`, `lib/analytics.ts` (9 typed events) | ❌ env unset | Conversion tracking, funnel, cost-per-lead, ad optimization signal. |
| **Microsoft Clarity** | ✅ `clarity-script.tsx`, `clarityTag/Event` helpers | ❌ env unset | Heatmaps + session replays — *where* on the page customers abandon. |
| **Sentry** | ✅ `sentry.*.config.ts`, `instrumentation*.ts` | ❌ env unset | Launch-day error visibility — a 500 on a landing = silent lost customers. |
| **Search Console** | n/a (external) | ❌ likely unverified | Which queries show Pacred, indexation coverage, crawl errors. |
| **A/B substrate** | ✅ `lib/experiments.ts` (cookie bucketing, `home_hero_cta` registered) | 🟡 telemetry-only | Real CRO testing — but A/B is pointless until GA4 receives the exposure events. |

The A/B substrate is notable: Pacred **already built** a zero-dependency
cookie-based experiment framework (`lib/experiments.ts` + `ExperimentBeacon`) —
a smart BUILD that avoids a GrowthBook/PostHog subscription. But it emits
`experiment_exposure` into `dataLayer`, which goes nowhere until GTM is on.
**Every measurement tool in the repo is one env var away from working** — the
failure is operational (nobody set the vars), not technical.

---

## 5. The build-vs-buy tooling roadmap

> **เดฟ's rule:** prefer **free** external tools (Search Console, Keyword
> Planner, Google Business Profile); but *if a capability would cost money and
> Pacred can build it, build it and keep it inside the Pacred ecosystem.* No
> vanity tools — only things that will be **used**, **monitored**, and produce a
> **measurable** result. Each item below states all three.

Effort: **S** ≤1d · **M** 2–5d · **L** 1–2wk. Tag: **BUY** (adopt external) ·
**BUILD** (in-house) · **WIRE** (connect something already built — near-zero).

### Tier 0 — Launch-week. Get measurement + lead-capture ON. (All S.)

#### G-T-1 — Switch on GTM + GA4 + Clarity + Sentry · **BUY (free) / WIRE** · S 🔴
- **Capability:** conversion tracking, heatmaps, error visibility.
- **Build-vs-buy:** **BUY** — GA4, Clarity, Sentry free tiers are best/cheapest;
  Pacred already wired all three. This is purely **set 5–7 Vercel env vars**
  (`NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_CLARITY_ID`, `SENTRY_DSN` +
  `NEXT_PUBLIC_SENTRY_DSN`). No code change.
- **How used:** GTM container loads GA4 + (later) Meta/TikTok pixels with no
  redeploy; the 9 `lib/analytics.ts` events (`sign_up`, `generate_lead`,
  `place_order`, `cta_click`, `wallet_deposit`…) start flowing.
- **How monitored:** GA4 Realtime confirms events within minutes; ปอน owns the
  weekly funnel report (per `podeng.md` P2).
- **How measured:** cost-per-lead and signup→order conversion become computable
  for the first time. **Without this, every item below is unmeasurable** —
  do it first. (Already roadmapped as `R-M1/R-M2`; restated as a hard gate.)

#### G-T-2 — Verify Google Search Console + submit sitemap · **BUY (free)** · S 🔴
- **Capability:** get indexed; see search queries + crawl errors.
- **Build-vs-buy:** **BUY** — GSC is free and the only authoritative indexation
  source; nothing to build.
- **How used:** add the property (DNS-TXT via Vercel DNS, or a
  `google-site-verification` meta in `app/layout.tsx`), submit
  `pacred.co/sitemap.xml`, request indexing for home + 5 cargo pages.
- **How monitored:** GSC Coverage + Performance tabs, weekly.
- **How measured:** indexed-page count (target: all 26 static + dynamic),
  impressions/clicks per query — the direct answer to "หา pacred.co ไม่เจอ".
- **Procedure already written:** playbook §1.2.

#### G-F-1 — Render `ContactForm` on `/contact` + every service page · **WIRE** · S 🔴
- **Capability:** capture leads who won't phone/LINE (a large slice of cold ad
  traffic).
- **Build-vs-buy:** **WIRE** — the form, the `submitContactMessage` action, the
  `contact_messages` table, the admin notify fan-out **all already exist and
  work**. Pure wiring: replace `/contact`'s `StubPage` with `<ContactForm/>` in
  a styled section, and embed it (or a compact variant) low on each
  `/services/*` page.
- **How used:** anon visitor leaves name + contact + message → row in
  `contact_messages` → ops/super admins notified → CRM-style follow-up
  (`/admin/contact-messages` already exists).
- **How monitored:** `/admin/contact-messages` inbox + the `generate_lead` GA4
  event (which the form already fires — see G-F-2).
- **How measured:** leads/day, lead→customer rate. **This single wire turns a
  dead pipeline into the funnel's missing Stage 2.**

#### G-CH-1 — Register & populate Google Business Profile · **BUY (free)** · S 🔴
- **Capability:** own the brand/near-me search card (map, hours, photos,
  reviews, click-to-LINE/call).
- **Build-vs-buy:** **BUY** — GBP is free; cannot be built (it *is* Google's
  surface). `LocalBusiness` JSON-LD is shipped but is not a substitute.
- **How used:** claim the listing with the HQ address already in
  `ADDRESSES.office`, add services, hours, photos, link `pacred.co`.
- **How monitored:** GBP Insights (searches, calls, direction requests), monthly.
- **How measured:** profile views + actions; first-party reviews feed the
  `Reviews` section and JSON-LD `aggregateRating` later.

### Tier 1 — First post-launch weeks. Build the self-serve close + measurement depth.

#### G-F-2 — "เปิดออเดอร์ราคานี้" CTA — bridge calculator/landing → buy · **BUILD** · M 🔴
- **Capability:** the missing public→กดซื้อ bridge — turn a quote into a started
  order.
- **Build-vs-buy:** **BUILD** — this is core funnel UX, must live inside Pacred;
  nothing external applies. Small build on top of existing pieces.
- **How used:** add a primary CTA to `ResultBox` (and service-page heroes) →
  "สมัคร + เปิดออเดอร์ราคานี้". For a guest: route to `register` carrying the
  quote params, land them straight on `/service-order/add` (or `service-import`)
  with the calculator values pre-filled. Fire `trackGenerateLead("booking_calc")`
  on calculate so quotes count as leads.
- **How monitored:** GA4 funnel `cta_click(open_order)` → `sign_up` →
  `place_order`; Clarity replays of calculator sessions.
- **How measured:** calculator→signup and signup→order conversion — the metric
  that proves the deal can be *closed*, not just quoted.

#### G-T-3 — UTM convention + Meta/TikTok Pixels via GTM · **BUY (free) / WIRE** · S 🟠
- **Capability:** attribute every paid + social click to a channel/campaign;
  enable retargeting + "optimize for lead".
- **Build-vs-buy:** **BUY** — pixels are free, load through the already-wired
  GTM container (no redeploy). Pacred just defines a UTM scheme and adds the
  tags in the GTM UI.
- **How used:** standard `utm_source/medium/campaign` on every ad + social link;
  Meta Pixel + TikTok Pixel as GTM tags firing on `cta_click`/`generate_lead`.
- **How monitored:** GA4 Acquisition report by source/campaign; Meta/TikTok ad
  managers.
- **How measured:** per-channel cost-per-lead → kill losing campaigns, scale
  winners. (Depends on G-T-1.)

#### G-C-1 — SEO content engine for the long tail · **BUILD** · L 🟠
- **Capability:** rank for the hundreds of high-intent informational Thai
  queries service pages can't cover.
- **Build-vs-buy:** **BUILD the publishing** (the `/knowledge` system already
  exists — `lib/knowledge-articles.ts`, `Article` JSON-LD, RSS); **BUY the
  research** with **free** tools (Google Keyword Planner, Search Console "queries
  Pacred already shows for but ranks low", Google Trends TH). No paid Ahrefs
  until volume justifies it.
- **How used:** a steady cadence of articles answering one buyer question each
  ("ภาษีนำเข้าจากจีนคิดยังไง", per-HS-code, per-port, "นำเข้า X จากจีน"), each
  internally linking the matching service page and ending in a `ContactForm` /
  "เปิดออเดอร์" CTA.
- **How monitored:** GSC Performance — impressions/position per article, monthly.
- **How measured:** organic sessions and organic-sourced leads/orders. Owner:
  ปอน (`podeng.md` P2 "content gaps").

#### G-A-1 — Conversion KPI dashboard (acquisition funnel) · **BUILD** · M 🟠
- **Capability:** a single Pacred-owned view of the funnel — visitors →
  leads → signups → orders → paid, with cost-per-lead/customer.
- **Build-vs-buy:** **BUILD** — Pacred already has the `audit-kpi-dashboard`
  skill and an `/admin` shell; reads `contact_messages` + `profiles` (with the
  `howKnow` field) + orders + GA4 export. Keeps acquisition visibility inside
  the ecosystem; no external BI subscription.
- **How used:** an `/admin/dashboard` panel (or the skill's markdown report) the
  team reads at standup.
- **How monitored:** it *is* the monitor — refreshed from live tables + GA4.
- **How measured:** week-over-week conversion-rate and CPL trend; ties the ad
  spend to actual paid customers — the literal "can we see acquisition working"
  answer. Depends on G-T-1 (needs GA4 data).

### Tier 2 — Ongoing optimization.

#### G-O-1 — Run real A/B experiments on the live substrate · **WIRE** · S 🟢
- **Build-vs-buy:** **WIRE** — `lib/experiments.ts` + `ExperimentBeacon` already
  exist (a smart prior BUILD that dodged a GrowthBook cost). Once G-T-1 lands,
  flip an experiment `active`, fork the UI, read `experiment_exposure` ×
  conversion in GA4.
- **How used / monitored / measured:** test hero copy, CTA colour, LCL-vs-FCL
  default tab; GA4 segments conversion by variant; ship the winner. Owner: ปอน
  (`podeng.md` P2 A/B section).

#### G-O-2 — LINE OA rich-menu → service catalogue + retargeting · **BUILD** · M 🟢
- **Build-vs-buy:** **BUILD** inside the LINE OA — LINE is Pacred's strongest
  owned channel and broadcast/retargeting via LINE OA is free vs paid re-ads.
- **How used:** greeting message + rich menu routing to the 4 cargo services +
  the booking calculator + "เปิดออเดอร์"; segment-broadcast to non-converters.
  (`/admin/broadcasts` already exists — extend it.)
- **How monitored / measured:** LINE OA console (friends, broadcast CTR);
  tag LINE-sourced sessions via UTM → GA4.

### Roadmap at a glance

| # | Item | Tag | Effort | Tier | Owner |
|---|---|---|---|---|---|
| G-T-1 | GTM/GA4 + Clarity + Sentry env vars | BUY/WIRE | S | 0 🔴 | ก๊อต/เดฟ |
| G-T-2 | Verify Search Console + submit sitemap | BUY | S | 0 🔴 | ปอน |
| G-F-1 | Render `ContactForm` on public pages | WIRE | S | 0 🔴 | ปอน |
| G-CH-1 | Google Business Profile listing | BUY | S | 0 🔴 | ก๊อต/sales |
| G-F-2 | "เปิดออเดอร์ราคานี้" calculator→buy CTA | BUILD | M | 1 🔴 | เดฟ+ปอน |
| G-T-3 | UTM convention + Meta/TikTok pixels | BUY/WIRE | S | 1 🟠 | ปอน |
| G-C-1 | SEO content engine (long tail) | BUILD | L | 1 🟠 | ปอน |
| G-A-1 | Conversion KPI dashboard | BUILD | M | 1 🟠 | เดฟ |
| G-O-1 | A/B experiments on live substrate | WIRE | S | 2 🟢 | ปอน |
| G-O-2 | LINE OA rich-menu + retargeting | BUILD | M | 2 🟢 | ภูม/sales |

---

## 6. Phasing

### 6.1 Launch-week (do NOW) — make the machine measurable + plugged in
All Tier 0, all S effort, mostly free BUY or WIRE:
**G-T-1** (analytics env vars — *first*, everything else is blind without it) ·
**G-T-2** (Search Console) · **G-F-1** (wire the lead form) · **G-CH-1** (Google
Business Profile). Net effect: Pacred becomes *findable* (GSC), *measurable*
(GA4), and stops leaking the lead funnel — for roughly **one day of work**.

### 6.2 First post-launch weeks — build the self-serve close
**G-F-2** (the calculator→กดซื้อ bridge — the single most important *build*
here: it directly answers "ปิดดีลให้ลูกค้ากดซื้อ") · **G-T-3** (pixels + UTM so
paid spend is attributable) · **G-A-1** (the KPI dashboard so the team can *see*
it working). Start **G-C-1** (content) in parallel — it compounds slowly, so
begin early.

### 6.3 Ongoing
**G-O-1** (A/B once data flows) · **G-O-2** (LINE retargeting) · sustained
**G-C-1** content cadence.

### 6.4 Sequencing rule
**G-T-1 before everything.** Search Console, pixels, the KPI dashboard, A/B
testing — every other item either feeds GA4 or reads GA4. With analytics off,
the team optimizes blind; with it on, every subsequent move becomes measurable.
One env-var change is the keystone of the entire acquisition strategy.

---

## 7. Cross-references
- 🧭 SEO + ad-landing execution playbook → [`../briefs/podeng-seo-and-ad-landing-playbook.md`](../briefs/podeng-seo-and-ad-landing-playbook.md)
- 👤 ปอน's role brief (SEO/marketing owner) → [`../briefs/podeng.md`](../briefs/podeng.md)
- 🔌 Monitoring-tools usability matrix (env-gated no-ops) → [`gap-integrations-tools.md`](gap-integrations-tools.md) §2
- 🔎 Customer-side gaps (post-purchase holes) → [`gap-customer.md`](gap-customer.md)
- 🎯 Master strategy (chains, phasing, "islands" theme) → [`PACRED-MASTER-STRATEGY.md`](PACRED-MASTER-STRATEGY.md)
- 📐 Analytics + A/B decision → [`../decisions/0007-analytics-and-ab-testing.md`](../decisions/0007-analytics-and-ab-testing.md)
- 🏢 Channel + contact single-source → [`../../components/seo/site.ts`](../../components/seo/site.ts)
- 📈 Analytics event helpers → [`../../lib/analytics.ts`](../../lib/analytics.ts) · A/B substrate → [`../../lib/experiments.ts`](../../lib/experiments.ts)
- 🗺 SEO infra → [`../../app/sitemap.ts`](../../app/sitemap.ts) · [`../../app/robots.ts`](../../app/robots.ts)

**End — `growth-acquisition-strategy-2026-05-18.md`.** Get-found is ~80% there
(strong SEO infra; gaps = Search Console + Google Business Profile + content
depth). Convert + buy + measure are **built but unplugged** — the lead form is
on no page, the calculator dead-ends at a price, and all analytics are env-gated
off. Top-5 moves (§5, all Tier 0–1): switch on analytics, verify Search Console,
wire the lead form, claim Google Business Profile, build the calculator→กดซื้อ
CTA. Three of the five are *connect what exists*, not *build new*.
