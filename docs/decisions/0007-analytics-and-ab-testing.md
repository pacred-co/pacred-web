# ADR-0007 — Analytics + A/B testing stack

**Status:** Accepted
**Date:** 2026-05-16
**Phase:** Landing pivot (per Part P4 strategic shift 2026-05-14 evening)
**Owner:** เดฟ (implemented); ก๊อต (pending review)

---

## Context

The strategic pivot (Part P4 line 2128) moved Pacred from "ship more backend
features" to "drive landing + acquisition". That demanded an observability
substrate that could:

1. Measure conversion at every step of the customer funnel — registration,
   login, contact, place-order across 3 order types, wallet deposit, wallet
   withdraw, sign-out.
2. Show behavioural recordings — where customers stall, what they hover, what
   they abandon — so design changes target real friction, not assumed friction.
3. Run controlled A/B experiments to validate copy / layout / pricing changes
   instead of shipping into the dark.
4. Cost ~zero pre-launch and degrade gracefully when env vars are unset
   (because we're shipping these stacks before Pacred owner has set up the
   external accounts).

The team is small (เดฟ + ปอน + ภูม + ก๊อต) and engineering bandwidth is
finite. Whatever we pick must be drop-in, no SaaS provisioning, no schema
migrations needed for the basic case.

## Decisions

### Tag manager — **Google Tag Manager** (L-22)

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **GTM container loading GA4** | Marketing / ภูม / ปอน can add tags via GTM UI without redeploys. One container also carries future Meta Pixel, TikTok Pixel, conversion goals. Free at any scale. | Slight extra script weight (~30 KB) vs `gtag.js` direct | ✅ Chosen |
| `gtag.js` direct | One less indirection | Any new tag requires a code deploy. No room to grow into multi-network attribution. | ❌ |
| Vercel Analytics + Speed Insights only | One-line install | No custom event tracking; no conversion attribution; doesn't replace GA4 | ❌ (kept option for the future as a complement) |
| Plausible / Fathom | Privacy-first, simple | Costs money pre-launch; doesn't integrate with ad-platform pixels we'll need | ❌ |

**Code:** `lib/analytics.ts` + `components/analytics/gtm-script.tsx`.
**Env:** `NEXT_PUBLIC_GTM_ID` — unset = silent no-op everywhere.

### Heatmap / session replay — **Microsoft Clarity** (L-23)

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Microsoft Clarity** | Free at any scale (no quota), auto-masks form inputs by PDPA-compatible default, lightweight (~50 KB async), respects DNT | Microsoft account required | ✅ Chosen |
| Hotjar | More polished UI | Free tier caps 35 sessions/day — useless for production | ❌ |
| FullStory | Best-in-class | Enterprise pricing | ❌ |
| LogRocket | Good for error replay | Same pricing concern as FullStory | ❌ |

**Code:** `components/analytics/clarity-script.tsx` + `clarity*` helpers in `lib/analytics.ts`.
**Env:** `NEXT_PUBLIC_CLARITY_ID` — unset = silent no-op.

### A/B testing — **cookie-based deterministic bucketing** (L-24)

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Cookie + FNV-1a hash** | Zero external dep, zero monthly cost, SSR-pure (no flicker), deterministic per-visitor + per-experiment, fully owned by us | Engineer creates new experiments via code change instead of UI | ✅ Chosen |
| GrowthBook | UI for non-engineers to create experiments, feature flags | Requires account / self-host; SDK adds bundle weight; free tier limited | ❌ at this scale |
| PostHog | Combined analytics + A/B + feature flags | Heavy SaaS; would replace GA4 (we already chose GA4) | ❌ |
| Vercel Edge Config + middleware | Tightly integrated | Vercel-locked; writes cost money on the production tier; same engineer-creates-experiments dynamic as ours | ❌ |
| Rolled-own without persistence | Simpler | Variant flips between page loads = noisy data | ❌ |

**Code:**
- `lib/experiments.ts` — pure primitives (registry, FNV-1a, `pickVariant`, `bucketIndex`, `getVariantClient`, `newVisitorId`, `VISITOR_COOKIE`). Safe to import in middleware (no `next/headers`).
- `lib/experiments-server.ts` — `getVariantServer` (uses async `cookies()`). Kept separate so middleware bundle stays clean.
- `proxy.ts` — assigns `pacred_vid` UUID cookie on first visit (1-year TTL, `SameSite=Lax`, `httpOnly: false` so client analytics can read).
- `components/analytics/experiment-beacon.tsx` — drop-in `<ExperimentBeacon experimentKey="..." />` fires exposure event once per mount.

**Env:** none — bucketing is fully local.

### Conversion event vocabulary

GA4 recommended names chosen so GA4 reports use the events natively without rename mappings:

| Event | Where fired |
|---|---|
| `sign_up` (method ∈ personal / juristic / oauth_google / oauth_facebook) | register page on `registerPersonal` / `completeJuristicRegistration` success |
| `login` (method ∈ phone / email / member_code / oauth_*) | login page on `signIn` / `signInWithOAuth` success |
| `logout` | navbar sign-out form on submit |
| `generate_lead` (source) | contact form on `submitContactMessage` success |
| `place_order` (order_type ∈ service_order / service_import / service_payment, value, currency THB) | 3 customer order forms on success |
| `wallet_deposit` (value, currency THB) | wallet deposit form on `createDeposit` success |
| `wallet_withdraw_request` (value, currency THB) | wallet withdraw form on `createWithdraw` success |
| `cta_click` (label, location, ...extra) | top home banners + Booking + ContactSales + Promotion |
| `experiment_exposure` (experiment_id, variant) | `<ExperimentBeacon />` mount per active experiment |

## Why telemetry-only first (the `home_hero_cta` experiment)

The first live experiment is **telemetry-only** — `active: true` in the registry,
visitors get bucketed, but no UI forks yet. Reasons:

1. **Validate end-to-end before risking UX divergence.** We need to see
   `experiment_exposure` events flow to GA4 dashboards at ~50/50 before
   trusting variant assignment for anything customer-visible.
2. **Decouple credential timing.** Activation depends on K-12 (ก๊อต sets
   `NEXT_PUBLIC_GTM_ID` in Vercel). The substrate ships first; the bucketing
   becomes meaningful when the pipe is connected.
3. **Build dev habit.** Future experiment authors can copy the pattern:
   add to registry → drop a `<ExperimentBeacon>` → wait one ship cycle →
   read the dashboard → only then fork UI.

## Activation order

```
1. K-12 ก๊อต — sign up tagmanager.google.com → create container → connect GA4 → publish
   → vercel env add NEXT_PUBLIC_GTM_ID for Production + Preview → redeploy
   → smoke via GTM Preview Mode → confirm dataLayer events arrive
2. K-13 ก๊อต — sign up clarity.microsoft.com → new project → copy ID
   → vercel env add NEXT_PUBLIC_CLARITY_ID for Production + Preview → redeploy
   → wait ~15 min → check Clarity dashboard for first recordings
3. Watch home_hero_cta experiment_exposure events split ~50/50 in GA4
4. Once split confirmed: open a new experiment registry entry with a UI fork,
   make `active: true`, drop a beacon, and let the variant ride.
```

## Costs

- GTM + GA4 + Clarity: $0 forever at any traffic Pacred will realistically hit
- Cookie-based A/B: $0 (no SaaS)
- Total monthly run-rate: $0
- One-time engineering: ~12-15 h tonight (this commit chain `632e028 → f1f1856`)

## Out of scope (revisit later)

- **Multi-armed bandit / Bayesian split** — overkill until we have >10 K MAU
  and run multiple experiments per quarter. Stay with uniform bucketing.
- **Server-side experiment assignment via Edge Config** — adds Vercel lock-in;
  reconsider if we ever ship variants whose initial render must NOT have a
  client roundtrip (e.g., LCP-affecting hero variants).
- **Holdout groups** — when MAU and experiment cadence justify the lost
  exposure budget.
- **Anonymous-to-logged-in identity merge** — `clarityIdentify(profileId)`
  helper exists; wire after login completes once we have UX surface (e.g.,
  "Welcome back, $name" needs the identifier anyway).

## References

- [`lib/analytics.ts`](../../lib/analytics.ts)
- [`lib/experiments.ts`](../../lib/experiments.ts)
- [`lib/experiments-server.ts`](../../lib/experiments-server.ts)
- [`components/analytics/`](../../components/analytics/)
- [`docs/env.md`](../env.md) §17 (GTM) + §18 (Clarity)
- [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part S2 K-12 + K-13 activation hand-offs to ก๊อต
- Implementation commits: `632e028 → f1f1856` (2026-05-16 night batch)
