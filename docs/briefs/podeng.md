# ปอน — Frontend / Landing / SEO / Marketing

Last reviewed: 2026-05-18 (post-launch — production live since 2026-05-17)
Branch: `podeng` (working) — push to own branch only; เดฟ merges into `dave`

## 🎯 Current state — POST-LAUNCH (production live since 2026-05-17)

🟢 Pacred launched. The canonical forward roadmap is [`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) — read it first; the post-launch capability synthesis [`research/capability-tools-strategy-2026-05-18.md`](../research/capability-tools-strategy-2026-05-18.md) seeded it and its §"Work split" table is ปอน's pickup list.

**ปอน now — pickup list (priority order):**

1. **Frontend tooling** — implement the recommendations in [`research/frontend-tooling-2026-05-18.md`](../research/frontend-tooling-2026-05-18.md): the data-driven landing template (one source-of-truth template that scales the per-service landings — fits the `copyist-unlimited` pattern).
2. **Mobile-first hardening** — most Pacred customers arrive on phones. Harden the customer surfaces at the 360/390px viewport per [`docs/conventions.md`](../conventions.md) §11 + [`docs/mobile-first-playbook.md`](../mobile-first-playbook.md) + the `mobile-first-verify` skill.
3. **Polish the new surfaces** — `/contact` (now rendering `ContactForm` live), `/start-order`, and the `QuoteCTA` calculator→buy component. These are freshly shipped on `dave`; make them on-voice + mobile-first.
4. **SEO audit** — per [`podeng-seo-and-ad-landing-playbook.md`](podeng-seo-and-ad-landing-playbook.md): cut Google Ads waste (~3h).

**Ongoing (self-directed, fit around the pickup list):**
- **i18n polish** — namespace-normalize (`page.section.element`) + EN translation review; watch `pnpm audit:i18n` for new untranslated keys.
- **Marketing + SEO research** — competitor analysis (top-5 Thai cargo/shipping), keyword research, customer-painpoint synthesis; once the Tier-0 analytics dashboard is live, the GA4 funnel report + Clarity heatmaps feed the conversion read.
- **A/B experiments** — the cookie-based substrate (`lib/experiments.ts` + `ExperimentBeacon`) is shipped; flip an experiment `active` and read `experiment_exposure` × conversion once GA4 is on.

**Deferred:** Phase I ecosystem-service landings (services #1, #5-13 — `customs-broker-matching`, `tax-refund`, `tax-invoice`, `shipping-document`, `export`, `fumigation`, `consignment`, `bill-payment`, `logistics`) — build after revenue is stable; block on the Pacred-owner copy direction per service.

---

## 🚀 Post-launch focus (read FIRST)

Pacred launched 2026-05-17 — the emergency "เผาเงิน" framing is over. **ปอน is still the visibility lever** — landing rank + quality score decide whether ad budget converts. The lens stays: more **true** / **billable** / **measurable**. Plan work properly; don't ship half-built.

**Voice (every customer surface):** Slogan **"เร็ว ไว ไม่มีคำว่าทำไม่ได้"**. Mobile-first. Copy ตรงเป้า ไม่อ้อมค้อม. CTA visible.

---

## 🔒 Force-read before any work

1. **[`docs/UPGRADE_PLAN.md`](../UPGRADE_PLAN.md)** — THE canonical forward roadmap (post-launch phase/stage plan)
2. [`docs/research/capability-tools-strategy-2026-05-18.md`](../research/capability-tools-strategy-2026-05-18.md) — the post-launch roadmap synthesis + work-split · [`research/frontend-tooling-2026-05-18.md`](../research/frontend-tooling-2026-05-18.md) — your tooling spec
3. [`docs/team.md`](../team.md) §1 (your scope) + §3 (daily flow)
4. [`docs/conventions.md`](../conventions.md) §7 (i18n) + §11 (UI/style — mobile-first) + §12 (Performance/SEO)
5. [`docs/decisions/0007-analytics-and-ab-testing.md`](../decisions/0007-analytics-and-ab-testing.md) — GTM + Clarity + A/B substrate
6. [`docs/pacred-info.md`](../pacred-info.md) — company DNA SOT — every contact UI element imports from `components/seo/site.ts`

---

## Who you are

**100% หน้าบ้าน + SEO + Marketing.** You operate from `podeng`. You:

- Build landing pages, public marketing, FAQ, knowledge articles
- Acquisition funnel — get the customer in, hold their attention, push them to sign up
- SEO — Pacred must appear **#1 in Google for every targeted keyword** in every channel
- Mobile UX — most Thai cargo buyers browse on phones; mobile-first is non-negotiable
- Market research, competitor analysis, customer data analysis
- i18n complete (TH + EN) for every shipped key
- Work-from-home 3 days (per request 2026-05-16) — high-focus periods

Per เดฟ brief 2026-05-16: "**ปอนจะโดนลูกพี่บีฟบ่อยสุด เพราะเขาเห็นงานตรงๆ บนหน้าจอว่าหน้าบ้าน เดฟเลยต้องช่วยปอนวางโครงสร้าง**"

Translation: owner critiques landing the most → เดฟ helps with structural decisions → you execute the design + copy + SEO + research.

---

## Scope boundaries (per `team.md` §1.3)

✋ **You don't touch:** `actions/`, `lib/`, `app/[locale]/(auth|protected|admin)/`, `supabase/migrations/`, `app/api/` (ภูม owns)

✋ **You don't touch (lead-only):** `CLAUDE.md`, `docs/team.md`, `docs/conventions.md`, `docs/env.md`, `docs/PORT_PLAN.md`, `package.json`, `.github/`, `next.config.ts`, `eslint.config.mjs`, `proxy.ts`, `vercel.json`

✅ **You own:** `app/[locale]/(public)/`, `components/sections/`, `components/booking/`, `components/knowledge/`, `components/ui/` (primitives), `messages/*.json`, `public/` (assets), `components/seo/*` (site constants + JSON-LD schemas)

---

## Current state of your domain

### 🟢 Shipped + in production

- **Home page** (15+ sections — BookingCalculator, StatsBar, Promotion, OurService, ProductCategories, PurchaseBanner, PricingSection, ClearanceBanner+Cards, WhyPacred, ContactSales, ImportExportBanner, Reviews, Sales, Blog, HomeArticle, Partner)
- **SEO bundle** — sitemap, robots, JSON-LD on every page, OG/Twitter meta, RSS, FAQ, i18n audit script · `/line` short-link + LINE_OA constants · red-cloud body background · footer i18n
- **Service landings** — the cargo-revenue pages (`import-china`, `-fcl`, `-lcl`, `china-shopping`, `customs-clearance-shipping-suvarnabhumi`) are **full content pages** — intent-keyword H1, FAQ schema, trust strip, phone+LINE CTAs (no longer stubs)
- **Tier-0/Tier-1 surfaces** (shipped on `dave`) — `/contact` renders `ContactForm` live · `/start-order` + the `QuoteCTA` calculator→buy bridge

### 🟡 Pending / ongoing

- Frontend-tooling landing template — pickup #1
- Mobile-first hardening of the customer surfaces — pickup #2
- Polish of `/contact` + `/start-order` + `QuoteCTA` — pickup #3
- SEO audit (Ads-waste cut) — pickup #4
- i18n namespace normalize + EN polish · marketing/SEO research · A/B experiments — see the "Ongoing" list in §"Current state"
- Phase I ecosystem-service landings — deferred (post-revenue-stable; block on owner copy direction)

---

## Theme + design discipline

Theme tokens are defined in [`app/globals.css`](../../app/globals.css) `@theme inline`:
- `primary-50` → `primary-950` — red brand palette (600 = `#B30000`)
- `--color-foreground / --color-background / --color-surface / --color-border / --color-muted` — semantic
- Dark mode via `.dark` class (next-themes)

**Use Tailwind utilities** — avoid hex hardcoding except for social-brand colors (Google blue, LINE green, etc.).

Font: `var(--font-prompt)` (Prompt from Google Fonts). Icons: `lucide-react` outline only.

**Mobile-first** — every landing change must look good on a 360/390px-wide viewport AND a 1440px desktop.

---

## Blockers + alternatives

When you're blocked:

| Blocked on | Alternative work |
|---|---|
| เดฟ hasn't confirmed a structural decision | Do i18n polish (self-directed) OR marketing/SEO research |
| Pacred owner hasn't given copy direction for Phase I landings | Build the page shell with placeholder copy + flag to เดฟ |
| Tier-0 analytics dashboard not yet live → no GA4/Clarity data | Spend time on competitor analysis or keyword research |
| Owner critique comes in mid-task | Park current → handle owner critique → resume |

**Note back to เดฟ when:** you need design-system changes (new theme tokens, new typography scale), backend support (admin endpoint exposure for landing data), or you've hit a structural decision you can't make alone.

---

## Work-from-home period

Per request 2026-05-16: ปอน takes 3 days WFH for high-focus periods. Push at the end of the WFH stretch (per memory `push_frequency_strict`). Commit local freely during the stretch.

---

## Hand-offs IN

- **Pacred owner (พี่ป๊อป)** brief → เดฟ structural → you design + ship
- **เดฟ** landing scaffolds + structural skeletons → you execute design + copy
- **ภูม** new data endpoints (when relevant for landing) → you reuse if SEO benefits

## Hand-offs OUT

- Public landing pages → all visitors hit these — SEO impact is direct
- i18n keys → both TH + EN
- Marketing intelligence (competitor analysis, keyword research) → เดฟ + ก๊อต strategic input
- Conversion data interpretation → เดฟ + Pacred owner

---

## Push discipline (STRICTER per memory `push_frequency_strict`)

- Commit local freely during landing iterations
- **Push to `origin/podeng` only at save-points** — end of WFH stretch / before sleep / before owner review
- During the WFH 3-day focus block: usually 1 push at the end of the stretch
- เดฟ pulls from `origin/podeng` periodically to consolidate

## Cross-links

- [`docs/team.md`](../team.md) §1.3 — your scope boundaries
- [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part O3 — sprint plan + L-* backlog
- [`docs/conventions.md`](../conventions.md) §7/§11/§12 — i18n + UI + Perf-SEO rules
- [`docs/decisions/0007-analytics-and-ab-testing.md`](../decisions/0007-analytics-and-ab-testing.md) — analytics substrate
- [`docs/pacred-info.md`](../pacred-info.md) — company info SOT
- `app/[locale]/(public)/` — your routes
- `components/seo/site.ts` — `CONTACT`, `ADDRESSES`, `SOCIAL`, `LINE_OA` constants you import
