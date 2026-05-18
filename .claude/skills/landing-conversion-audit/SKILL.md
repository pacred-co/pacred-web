---
name: landing-conversion-audit
description: Audit a landing / ad-destination page for conversion readiness BEFORE paid traffic hits it. Fires on "is this landing ready for ads", "conversion audit", "check the ad landing", "พร้อมยิงแอดยัง", "ตรวจหน้า landing ก่อนยิงแอด", "CRO check", or before any ad campaign points traffic at a page. Checks the conversion path (CTA, LINE-add, lead form), the tracking (dataLayer events fire + GTM present), and the ad Quality-Score levers (LCP, keyword-in-H1, mobile) — asserts paid traffic will both convert AND be measured.
---

# Landing Conversion Audit

> **Why this exists.** Every click on a paid ad costs money. A landing page can
> fail paid traffic two ways — both burn the budget:
> 1. **Converts but isn't measured** — the visitor signs up, but no event
>    reaches GA4 / Google Ads / Meta. Cost-per-lead is uncomputable, Smart
>    Bidding has no signal, retargeting audiences never fill. You spend real
>    money blind.
> 2. **Measured but doesn't convert** — tracking fires, but a slow page, a weak
>    or buried CTA, or a hidden lead path means the click bounces. For Pacred a
>    slow page is doubly costly: poor LCP lowers the Google Ads **Quality
>    Score**, which *raises* cost-per-click — you pay more for the same traffic.
>
> This skill is the pre-flight check that proves a page will convert AND be
> measured before an ad points at it.

## When to fire

- Before any ad campaign (Google / YouTube / Meta / LINE) points traffic at a page.
- After building or reworking a landing / service / ad-destination page.
- When the user says "พร้อมยิงแอดยัง", "is this landing ready for ads",
  "conversion audit", "CRO check", "ตรวจหน้า landing".

## The three gates — a page passes only if all three are green

```
CONVERT        — the visitor can and will take the action.
TRACK          — that action fires a measurable conversion event.
QUALITY-SCORE  — the page is fast + relevant enough to keep CPC low.
```

## The loop

```
1. IDENTIFY  — the page + which ad/keyword/channel sends traffic to it.
2. CONVERT   — walk the checklist; can a real customer convert easily?
3. TRACK     — grep the source: does the conversion action fire a dataLayer
               event? Is GTM live? Are UTM params preserved?
4. QUALITY   — measure LCP (mobile), check images, check the 360/390 layout.
5. ANALYZE   — list every failure + the offending element + the fix.
6. FIX       — apply the fix in the source.
7. RE-VERIFY — back to step 2 until all three gates are green.
```

## Checklist — CONVERT

- [ ] **Primary CTA above the fold**, on-screen without scrolling, in the thumb zone.
- [ ] **LINE-add CTA present + prominent** — for Thai cargo customers the LINE
  add converts highest (familiar, instant, staff close in-chat). A first-class
  action, not buried.
- [ ] **Lead form is short** — ≤ 4 fields (name, phone, what to import). Long
  forms kill conversion.
- [ ] **Tappable phone** — a real `tel:` link for high-intent callers.
- [ ] **Headline echoes the ad** — the H1 repeats the keyword/promise the ad
  made (message match — also a Quality-Score lever).
- [ ] **Trust proof on-screen** — customs licence, years, customer count,
  reviews, the slogan. A cargo buyer must trust before handing over a shipment.
- [ ] **One page, one job** — the page sells one service; no competing CTAs.

## Checklist — TRACK

- [ ] **GTM is live** — `NEXT_PUBLIC_GTM_ID` is set (run `pnpm check:connections`).
  Without it every `dataLayer` push is dead.
- [ ] **The conversion action fires a real event** — a form submit fires
  `trackGenerateLead`, a signup `trackSignUp`, an order `trackPlaceOrder`. A
  `cta_click` alone is NOT a conversion — a button that opens LINE or requests a
  quote must fire a `generate_lead`, not just `cta_click`.
- [ ] **Each capture path is its own conversion** — web form, LINE-add, and
  phone-click tracked distinctly, so you learn which the budget should chase.
- [ ] **UTM params survive** — campaign/source/medium are not stripped by a
  redirect before GA4 reads them.
- [ ] **Value passed where known** — order/quote events carry the THB value so
  bidding optimises to money, not raw count.

## Checklist — QUALITY-SCORE

- [ ] **LCP < 2.5s on mobile** — measure, do not guess. This feeds the Google
  Ads landing-page-experience score → Quality Score → CPC.
- [ ] **No oversized images** — no hero/banner image over ~300 KB; run
  `pnpm audit:images`. No CSS `background:url()` art (it bypasses the Next image
  optimizer — use `<Image>`).
- [ ] **Mobile-clean** — no horizontal scroll at 360/390px, tap targets ≥ 44px,
  text ≥ 16px (defer to [`mobile-first-verify`](../mobile-first-verify/SKILL.md)).
- [ ] **Third-party scripts trimmed** — only GTM + what is needed; heavy embeds
  delay LCP.

## Tools

- `pnpm check:connections` — is GTM / the tracking spine wired.
- `pnpm audit:images` — find oversized landing images.
- preview tooling (`preview_start` / `preview_screenshot`) — render + eyeball + LCP.
- grep the page source for `track*(` calls to confirm the conversion event fires.
- [`performance-hunter`](../performance-hunter/SKILL.md) if LCP fails.

## Report

Report: the page + its ad source · each of the 3 gates pass/fail · every failure
with the offending element + the applied/recommended fix · final verdict —
**ad-ready** or **not ad-ready (must-fix list)**.

## Anti-patterns

- **"The CTA is there."** Below the fold, or only a web form when LINE converts
  better — that is a CONVERT fail.
- **"It tracks — there's a cta_click."** `cta_click` is a click, not a
  conversion. Ads optimising for leads will under-count and misbid.
- **"LCP is fine on my machine."** Desktop on office wifi ≠ a phone on 4G. Ad
  traffic is mobile — measure mobile.
- **Pointing an ad at the homepage.** A generic homepage never message-matches a
  keyword — Quality Score suffers, CPC rises. Use a dedicated page.
- **Shipping before GTM is set.** A perfectly-converting page that tracks
  nothing wastes the whole campaign's learning.

## Cross-links

- `docs/research/ads-launch-action-plan-2026-05-20.md` — the launch plan this supports
- [`mobile-first-verify`](../mobile-first-verify/SKILL.md) — the mobile gate (ad traffic is mobile)
- [`performance-hunter`](../performance-hunter/SKILL.md) — when LCP fails
- [`legacy-fidelity-check`](../legacy-fidelity-check/SKILL.md) — the D1 fidelity gate (sibling pre-ship check)
- `lib/analytics.ts` — the `track*` event helpers · `docs/conventions.md` §11/§12 — mobile + perf/SEO
