# ปอน — Frontend / Landing / SEO / Marketing

Last reviewed: 2026-05-18 (post-launch — production live since 2026-05-17)
Branch: `podeng` (working) — push to own branch only; เดฟ merges into `dave`

## 🎯 Current state — DIRECTION PIVOT "D1" (2026-05-18) — PIVOT YOUR WORK

🔴 **The owner rejected the rebuilt Pacred app** — its UI *and* its workflow look nothing like the legacy **PCS Cargo** system that staff + ~8,898 customers run on daily. **New direction (D1):** Pacred *becomes* the legacy PCS Cargo system, faithfully — rebranded `PCS` → `PR`. Read [`decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md) in full — it is the canonical D1 source of truth and supersedes the capability-roadmap framing of [`UPGRADE_PLAN.md`](../UPGRADE_PLAN.md).

> ⚠️ **PIVOT — pause the pre-D1 backlog.** The booking-flow detail page (**BK-1**), the customer-intel behavior-tracking, the frontend-tooling landing template are all **Phase C now** — deferred, *not cancelled*, re-sequenced after the faithful port. Your new work is **Phase B frontend**: rework the customer-facing UI to match the legacy PCS Cargo look + flow.

> ✅ **Phase-A data load — DONE (2026-05-19 · เดฟ + Claude).** The legacy data — ~8,898 customers + their orders / wallets / shipments — is migrated into Supabase **dev + prod** behind the 117-table `tb_*` schema (`PCS`→`PR` rebranded). **Phase-B frontend is fully GO** — your pickup below stands. ภูม reworks the customer-portal *backend* onto `tb_*` in parallel — coordinate the data contract (the legacy `tb_*` status values are the canonical vocabulary for pickup #2).

**ปอน now — pickup list (Phase-B frontend, priority order):**

1. **Rework the customer-facing UI to match the legacy PCS Cargo look + flow — TOP priority (Phase B).** The rebuilt Pacred portal navigation diverged from the legacy system — e.g. the legacy customer home is a **9-icon launcher** (a grid of service tiles), the rebuilt app uses a nested sidebar. Rework the customer surfaces (`/dashboard`, `/service-order`, `/service-import`, `/service-payment`, `/wallet`, `/shipments` etc.) so the layout, navigation, and screen-to-screen flow **match what the ~8,898 existing customers already know** — goal: zero retraining.
2. **Reconcile the divergent status vocabularies** — the rebuilt app's job/order statuses don't line up with the legacy PCS status words customers recognise. Map the rebuilt status labels onto the legacy PCS vocabulary across every customer-visible surface. Coordinate with ภูม — the legacy `tb_*` schema carries the canonical status values.
3. **Match the legacy PCS visual language** — work through [`docs/research/d1-fidelity-customer.md`](../research/d1-fidelity-customer.md) (the rigorous 11-screen customer-portal fidelity gap map — your Phase-B rework spec) + the [`d1-phase-b-gap-map.md`](../research/d1-phase-b-gap-map.md) overview, and bring every customer screen in line with the legacy look so it reads as the same system, rebranded.

**Ongoing (self-directed, fit around the pickup list):**
- **i18n parity** — keep TH + EN in sync as you rework screens; watch `pnpm audit:i18n` for new untranslated keys.
- **Mobile-first** — every reworked customer surface must still be checked at 360/390px per [`docs/conventions.md`](../conventions.md) §11 + the `mobile-first-verify` skill (most Pacred customers arrive on phones — fidelity to legacy must not break mobile).

**Deferred to Phase C:** the booking-flow detail page, the customer-intel behavior-tracking instrumentation, the frontend-tooling landing template, the public-marketing/SEO push, A/B experiments, and the Phase I ecosystem-service landings — all re-sequenced after the faithful port. Public marketing landing pages already shipped stay live; the *new* marketing/SEO build work waits.

---

## 🚀 D1 focus (read FIRST)

The owner rejected the rebuild on 2026-05-18 — Pacred pivots to a **faithful port** of the legacy PCS Cargo system (`PCS` → `PR`). **ปอน owns Phase-B frontend** — the customer-facing UI must look and flow like the legacy PCS system so the ~8,898 existing customers need *zero* retraining.

**The lens for D1:** fidelity to the legacy PCS system, not your design instinct. When the legacy UI does something you'd design differently — reproduce the legacy way; Phase C is when Pacred's own polish layers on top. The voice still holds (slogan **"เร็ว ไว ไม่มีคำว่าทำไม่ได้"**, mobile-first, CTA visible) — but the *layout + flow* now follow the legacy system.

---

## 🔒 Force-read before any work

1. **[`docs/decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)** — ADR-0017, the canonical D1 source of truth (faithful PCS port, Phase A/B/C)
2. **[`docs/research/d1-fidelity-customer.md`](../research/d1-fidelity-customer.md)** — the rigorous customer-portal fidelity gap map (11 screens, per-element), your **Phase-B rework spec** · overview [`d1-phase-b-gap-map.md`](../research/d1-phase-b-gap-map.md)
3. [`docs/runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md) — the Phase-A migration runbook (context for the `tb_*` schema behind the reworked screens)
4. [`docs/team.md`](../team.md) §1 (your scope) + §3 (daily flow)
5. [`docs/conventions.md`](../conventions.md) §7 (i18n) + §11 (UI/style — mobile-first) + §12 (Performance/SEO)
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

### 🟡 Pending / ongoing (D1 Phase B)

- Rework the customer-facing UI to match the legacy PCS Cargo look + flow (9-icon launcher home, etc.) — pickup #1
- Reconcile the divergent status vocabularies onto the legacy PCS words — pickup #2
- Match the legacy PCS visual language across the customer screens — pickup #3
- i18n parity + mobile-first checks as you rework — see the "Ongoing" list in §"Current state"
- ⚠️ The Phase-1-5 rebuilt customer surfaces below shipped against the rejected rebuild — under D1 they are reworked to the legacy PCS look + flow (kept here as a reference inventory of what exists)

### Deferred to Phase C (was pending pre-D1)

- Frontend-tooling landing template · booking-flow detail page · customer-intel behavior-tracking · SEO audit · A/B experiments · Phase I ecosystem-service landings — all re-sequenced after the faithful port

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
| The legacy PCS look for a screen is unclear from the gap docs | Move to a different customer surface's rework; flag the gap to เดฟ |
| ภูม hasn't confirmed the legacy `tb_*` status values for a surface | Rework the layout/navigation of another screen; reconcile statuses once ภูม posts the values |
| เดฟ hasn't broken out the Phase-B frontend work-split | Work the gap map directly — inventory which customer screens diverge from the legacy system |
| Owner critique comes in mid-task | Park current → handle owner critique → resume |

**Note back to เดฟ when:** the legacy PCS look/flow for a screen is ambiguous, you need a structural call on reconciling the rebuilt UI with the legacy layout, or you need ภูม's `tb_*` data contract.

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
