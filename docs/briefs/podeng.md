# ปอน — Frontend / Landing / SEO / Marketing

Last reviewed: 2026-05-18 (post-launch — production live since 2026-05-17)
Branch: `podeng` (working) — push to own branch only; เดฟ merges into `dave`

## 🎯 Current state — POST-LAUNCH (production live since 2026-05-17)

🟢 Pacred launched. The post-launch roadmap is [`research/capability-tools-strategy-2026-05-18.md`](../research/capability-tools-strategy-2026-05-18.md) — read it first; the §"Work split" table is ปอน's pickup list.

**ปอน now (per the capability-strategy work-split — in priority order):**
1. **Frontend tooling** — implement the recommendations in [`research/frontend-tooling-2026-05-18.md`](../research/frontend-tooling-2026-05-18.md): the data-driven landing template (one source-of-truth template that scales the per-service landings — fits the `copyist-unlimited` pattern).
2. **Polish the new Tier-0/Tier-1 surfaces** — the `/contact` page (now rendering `ContactForm` live), `/start-order`, and the `QuoteCTA` calculator→buy component. These are freshly shipped on `dave`; make them on-voice + mobile-first.
3. **SEO audit** per [`podeng-seo-and-ad-landing-playbook.md`](podeng-seo-and-ad-landing-playbook.md) — Google Ads waste cut (~3h).
4. **L-5 deep polish** order: home → import-china → china-shopping → customs-clearance (เดฟ confirmed priority).

---

## 🚀 TEAM-WIDE RUN-LONG MODE ACTIVE (2026-05-16 evening → เดฟ check-in)

ทั้งทีม autonomous mode. ดู [`../runbook/team-status-2026-05-16.md`](../runbook/team-status-2026-05-16.md) — มี cross-dep map + ปอน's full run-long queue + escape hatch. **เริ่ม T-N1 SEO audit ก่อนเลย** (P0, ~3h, ปลด Ads waste). L-5 priority order = home → import-china → china-shopping → customs-clearance (เดฟ confirmed; ไม่ต้องรอ).

---

## 🚀 Post-launch focus (read FIRST)

Pacred launched 2026-05-17 — the emergency "เผาเงิน" framing is over. **ปอน is still the visibility lever** — landing rank + quality score decide whether ad budget converts. The lens stays: more **true** / **billable** / **measurable**. Plan work properly; don't ship half-built.

**ปอน post-launch priorities** — see the §"Current state" block above: the frontend-tooling landing template, then polish the new `/contact` + `/start-order` + `QuoteCTA` surfaces, then SEO + L-5.

**Voice (every customer surface):** Slogan **"เร็ว ไว ไม่มีคำว่าทำไม่ได้"**. Mobile-first. Copy ตรงเป้า ไม่อ้อมค้อม. CTA visible.

---

## 🔒 Force-read before any work

1. **[`docs/research/capability-tools-strategy-2026-05-18.md`](../research/capability-tools-strategy-2026-05-18.md)** — the post-launch roadmap + work-split · [`research/frontend-tooling-2026-05-18.md`](../research/frontend-tooling-2026-05-18.md) — your tooling spec
2. [`docs/team.md`](../team.md) §1 (your scope) + §3 (daily flow)
3. [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part S3 (ปอน hand-off triggers) + Part O3 (normal pipeline)
4. [`docs/conventions.md`](../conventions.md) §7 (i18n) + §11 (UI/style) + §12 (Performance/SEO)
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

### 🟢 Done — Phase A SEO bundle + customs polish

- Home page (15+ sections — BookingCalculator, StatsBar, Promotion, OurService, ProductCategories, PurchaseBanner, PricingSection, ClearanceBanner+Cards, WhyPacred, ContactSales, ImportExportBanner, Reviews, Sales, Blog, HomeArticle, Partner)
- L-1..L-9 SEO bundle (sitemap, robots, JSON-LD on every page, OG/Twitter meta, RSS, FAQ, i18n audit script)
- 7 bonus polish: `/line` redirect + LINE_OA constants + HomeArticle + red-cloud bg + page-mover + Bonus 6/7 + footer i18n
- Customs landing rebuild (`/customs-clearance-shipping-suvarnabhumi`) — new banner, copy, price emphasis, h1 rewrite, breadcrumb (latest commit `e9b5564`)
- `pacred.co/line` short-link (Bonus 6) + booking-tabs mobile fix + LCL/FCL pricing split + drop MobileTrustRibbon (Bonus 7)

### 🟡 Pending — your pickup list (priority order)

#### P0 — Owner critiques (highest churn)

Whenever Pacred owner (พี่ป๊อป) gives a brief that targets landing, that becomes P0. Examples landed already:
- Customs h1 rewrite (just shipped)
- LCL/FCL pricing reorganisation (Bonus 7)
- Mobile trust ribbon drop

When new ones come in: เดฟ helps with structure → you execute.

#### P0 — L-5 service landing polish (waiting on เดฟ priority confirmation)

ปอน's suggested order: home → import-china → china-shopping → customs-clearance

| # | Page | Status |
|---|---|---|
| L-5a | `/services/import-china` | StubPage — needs full content |
| L-5b | `/services/import-china-fcl` | StubPage |
| L-5c | `/services/import-china-lcl` | StubPage |
| L-5d | `/services/export-worldwide` | StubPage |
| L-5e | `/services/china-shopping` | StubPage |
| L-5f | `/customs-clearance-shipping-suvarnabhumi` | ✅ Done |

#### P1 — Mobile responsive QA (blocked on real device test)

L-8 — top 10 pages, mobile devtools + real-device check. Blocker: needs BrowserStack or real device. Workaround: use Chrome devtools mobile emulation + spot-check on your phone.

#### P1 — i18n polish (self-directed)

- L-9b — namespace normalize (`page.section.element` convention)
- L-9c — EN translation polish — review `pnpm audit:i18n` same-value list (currently 0 needs-review per allowlist, but watch for new keys that should be translated)

#### P1 — Phase I ecosystem landings (NEW services — no PHP analog)

Per `/CLAUDE.md` Pacred Ecosystem, need landing pages for:
- `/services/customs-broker-matching` (Service #1)
- `/services/tax-refund` (Service #5)
- `/services/customs-clearance` (Service #6 — already partly landed?)
- `/services/tax-invoice` (Service #7) + `/services/shipping-document` (Service #8) — content related
- `/services/export` (Service #9) — outbound shipping
- `/services/fumigation` (Service #10)
- `/services/consignment` (Service #11)
- `/services/bill-payment` (Service #12)
- `/services/logistics` (Service #13)

Block on Pacred owner copy direction per service (escalate to เดฟ when ready).

#### P2 — Marketing data + SEO research

- **Competitor analysis** — top 5 Thai cargo/shipping competitors → keyword gaps + content gaps
- **Keyword research** — Ahrefs / SE Ranking / free tools → target keyword ranking → priority pages
- **Customer interview synthesis** — sales team intake → top-3 customer painpoints → landing copy that addresses them
- **Conversion funnel monitoring** — once K-12 GTM activates (ก๊อต task) → GA4 funnel report → identify drop-off points
- **Heatmap reading** — once K-13 Clarity activates → top 5 abandoned interaction patterns → fix the worst

#### P2 — A/B experiments (when ready)

The L-24 cookie-based A/B substrate is shipped. To run an experiment:
1. Pick a hypothesis (e.g., "LCL-first booking tab converts higher than FCL-first")
2. Update [`lib/experiments.ts`](../../lib/experiments.ts) `EXPERIMENTS` registry — add `active: true`
3. Wire variant rendering in target component
4. Drop `<ExperimentBeacon experimentKey="..." />` in the page
5. Wait 1-2 weeks for traffic
6. Check GA4 `experiment_exposure` events → conversion rate per variant

---

## Theme + design discipline

Theme tokens are defined in [`app/globals.css`](../../app/globals.css) `@theme inline`:
- `primary-50` → `primary-950` — red brand palette (600 = `#B30000`)
- `--color-foreground / --color-background / --color-surface / --color-border / --color-muted` — semantic
- Dark mode via `.dark` class (next-themes)

**Use Tailwind utilities** — avoid hex hardcoding except for social-brand colors (Google blue, LINE green, etc.).

Font: `var(--font-prompt)` (Prompt from Google Fonts).

Icons: `lucide-react` outline only.

**Mobile-first** — every landing change must look good on a 390px-wide viewport AND a 1440px desktop.

---

## Blockers + alternatives

When you're blocked:

| Blocked on | Alternative work |
|---|---|
| เดฟ hasn't confirmed L-5 priority page | Do L-9b/c i18n polish (self-directed) OR market research |
| Pacred owner hasn't given copy direction for Phase I | Build the page shell with placeholder copy + flag to เดฟ |
| K-12/K-13 not activated → no analytics data | Spend time on competitor analysis or keyword research |
| Owner critique comes in mid-task | Park current → handle owner critique → resume |

**Note back to เดฟ when:** you need design system changes (new theme tokens, new typography scale), backend support (admin endpoint exposure for landing data), or you've hit a structural decision you can't make alone.

---

## Work-from-home period

Per request 2026-05-16: ปอน takes 3 days WFH for high-focus periods. Push at end of WFH stretch (per memory `push_frequency_strict`). Commit local freely during the stretch.

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
- During WFH 3-day focus block: usually 1 push at the end of the stretch
- เดฟ pulls from `origin/podeng` periodically to consolidate

## Cross-links

- [`docs/team.md`](../team.md) §1.3 — your scope boundaries
- [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part O3 — sprint plan + L-* backlog
- [`docs/conventions.md`](../conventions.md) §7/§11/§12 — i18n + UI + Perf-SEO rules
- [`docs/decisions/0007-analytics-and-ab-testing.md`](../decisions/0007-analytics-and-ab-testing.md) — analytics substrate
- [`docs/pacred-info.md`](../pacred-info.md) — company info SOT
- `app/[locale]/(public)/` — your routes
- `components/seo/site.ts` — `CONTACT`, `ADDRESSES`, `SOCIAL`, `LINE_OA` constants you import
