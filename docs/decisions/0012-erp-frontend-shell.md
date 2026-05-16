# ADR-0012 — ERP frontend shell: same Next.js app vs `erp.pacred.co` (V3 prep)

**Status:** 🟡 **DRAFT** — เดฟ scaffold 2026-05-16 night. ก๊อต to review + lock.
**Date:** 2026-05-16 night
**Phase:** V3 prep · Sprint 7+ Track D
**Owner:** เดฟ (scaffold) · ก๊อต (review + lock) · ภูม (implements when V3 starts)

> **Reservation slot:** ADR-0012 follows ADR-0011 (RBAC granular). Pairs with ADR-0013 (V2→V3 migration).

---

## Context

Pacred V2 lives in one Next.js codebase (this repo) with two route groups:

```
app/[locale]/
├── (public)/    — marketing site, landing pages, knowledge base — ปอน's domain
├── (auth)/      — login / register / forgot — ภูม's domain
├── (protected)/ — customer portal (orders, wallet, shipments, etc.) — ภูม's domain
└── (admin)/admin/ — admin back-office (current ~60 routes) — ภูม's domain
```

V3 (`pacred-dpx`, per [ADR-0010](0010-v2-v3-version-strategy.md)) replaces the admin/back-office side with a full ERP for ~50+ staff across 14 roles ([`docs/briefs/ops-roles.md`](../briefs/ops-roles.md)). The question this ADR locks:

**Where does the V3 ERP frontend live?**
- Option A: same Next.js app, expanded `/admin/*` route tree
- Option B: separate Next.js app at `erp.pacred.co` subdomain
- Option C: separate sub-app deployed on `/erp/*` path of `pacred.co`
- Option D: completely separate stack (e.g. Refine.dev / Tremor / Ant Design Pro)

---

## Decision criteria (Pacred-specific)

| Criterion | Why it matters |
|---|---|
| **Auth/session continuity** | Customer support staff need to view a customer's portal as them (impersonation). Same session = trivial; cross-domain = OAuth dance. |
| **Code reuse** | Pacred has `lib/forwarder/calc-price.ts`, `components/pdf/`, `lib/notifications/` — V3 ERP needs the same business logic. |
| **Deploy independence** | Customer site downtime ≠ ERP downtime. If ERP CI breaks, marketing should still serve. |
| **Bundle size** | Customer-facing landing must be <100kb JS (Google Ads quality score). Bloating with ERP libs hurts revenue. |
| **Team scaling** | When ERP team grows (3 engineers vs 1), do they conflict on PRs? Repo-level isolation > route-level. |
| **RBAC + RLS** | V3 RBAC is granular ([ADR-0011](0011-erp-rbac-granular.md)). Easier to enforce when admin and customer surfaces are clearly separated. |
| **Cost** | Separate Vercel project = ~$20/mo Pro per project. Worth it if (1) is solved by other means. |

---

## Options considered

### Option A — Same app, expanded `/admin/*` (status quo extended) ✅ recommended
Continue Pacred V2's route-group pattern. V3 ERP = `/admin/v3/*` (or rename current `/admin` to `/admin/legacy` + new `/admin` for V3) within this codebase.

- ➕ **Auth/session sharing trivial** — same Supabase session works for both customer + admin. Impersonation = `setCookie('impersonate_user', uuid)` + admin can view.
- ➕ **Code reuse 100%** — `lib/`, `components/`, `actions/` shared. No copy/paste.
- ➕ **One Vercel project, one deploy pipeline** — no infra cost, one CI workflow.
- ➕ **i18n shared** — `messages/th.json` already structured by namespace; ERP adds new namespaces.
- ➖ **Bundle size leak** — if ERP imports a heavy admin lib (e.g. data-grid), it could end up in customer chunks. Mitigation: Next.js route-level code-splitting + verify with `pnpm build` bundle analyzer per release.
- ➖ **Deploy coupling** — admin breakage = revert affects customer too. Mitigation: feature flags + smaller PRs (already practiced).
- ➖ **Repo-level conflicts at scale** — 3+ engineers on ERP could collide with 1+ on customer. Mitigation: clear CODEOWNERS + frequent rebases.

### Option B — `erp.pacred.co` subdomain (separate Next.js app)
New repo `pacred-dpx` per [ADR-0010](0010-v2-v3-version-strategy.md), separate Vercel project. Shared Supabase + shared `npm` package (`@pacred/shared`) for business logic.

- ➕ **Deploy independence** — customer site updates separately from ERP.
- ➕ **Bundle size isolated** — heavy admin libs (data-grid / chart libs / PDF builders) stay in ERP bundle only.
- ➕ **Team scaling** — 3 engineers in ERP repo don't collide with 1 in customer repo.
- ➕ **Cross-domain auth solvable** — Supabase session cookies on `*.pacred.co` (set `cookie.domain` to `.pacred.co`). One sign-in works on both.
- ➖ **Shared business logic via package** — `@pacred/shared` npm package OR git submodule OR monorepo turborepo. Each option has migration cost.
- ➖ **Two Vercel projects** = ~$40-50/mo Pro tier.
- ➖ **i18n duplication** — two `messages/th.json` files unless extracted to package.
- ➖ **DNS + SSL setup** for subdomain.

### Option C — Sub-app at `/erp/*` (path-based separation)
Single domain (`pacred.co`), but `/erp/*` routes deploy from a SEPARATE Next.js app via Vercel route rewrites or middleware.

- ➕ **Single domain** — no cross-domain cookie dance.
- ➕ **Deploy independence (kinda)** — Vercel route rewrites point to different deployments.
- ➖ **Complex routing setup** — Vercel edge config + per-path deployments + cache invalidation gotchas.
- ➖ **Same Vercel project still** — no team-scaling win.
- ❌ Rare in industry. Risky for limited gain. **Rejected.**

### Option D — Completely different stack (Refine.dev / Tremor / Ant Design Pro)
Drop Next.js for the ERP side. Use a dedicated admin framework.

- ➕ Faster for CRUD-heavy ERP screens (Refine generates 80% boilerplate).
- ➖ Different code paradigm — no shared `lib/` or `components/`.
- ➖ ภูม + เดฟ + ก๊อต all know Next.js; new stack = learning cost.
- ➖ V3 wants "employees love it" — Refine's default UX is generic, not Pacred-branded.
- ❌ **Rejected for V3.** Could revisit if ERP team grows to 5+ engineers and CRUD volume justifies it.

---

## Decision

**Adopt Option A (same app, expanded `/admin/*`) for V3 phase 1-2** AND **plan migration to Option B (`erp.pacred.co`) at V3 phase 3+** if these triggers fire:

### Triggers to split to Option B (when to start the move)

1. **Bundle size:** customer-side `_app` JS chunk crosses 200kb (currently ~120kb). Bundle analyzer in CI catches this.
2. **Deploy frequency split:** ERP needs deploys > 3×/day while customer side wants stable weekly. Code reviews + merge queue contention surface this.
3. **Team size:** ERP team grows to 3+ dedicated engineers (vs current 1 = ภูม). Repo PR queue contention.
4. **Performance:** customer-side LCP regresses below 2.5s due to admin code bloat. Vercel Analytics catches.

Until then: Option A's simplicity + reuse outweighs the eventual deploy/team-scaling cost.

### Phase 1 (V3 launch on same app)

- New ERP routes go under `app/[locale]/(admin)/admin/v3/*` (or rename current `/admin` to `/admin/legacy`)
- `(admin)` route group keeps middleware-enforced auth + admin gate
- Shared `lib/`, `components/`, `messages/` — no duplication
- New ERP-specific components live under `components/erp/` (clear namespace)
- New ERP server actions live under `actions/erp/` (clear namespace, mirror `actions/admin/`)

### Phase 2 (incremental V3 features)

- ERP team ships features incrementally into the same repo
- Customer-side gets minor releases independently (no shared PR queue if changes are namespaced)
- Bundle analyzer in CI fails build if customer-side LCP-critical chunks exceed budget

### Phase 3 (split to `erp.pacred.co` IF triggers fire)

- `pacred-dpx` repo activates with shared logic extracted as `@pacred/shared` package
- Subdomain DNS + Vercel project setup
- Shared Supabase session via `cookie.domain = .pacred.co`
- Migration is GRADUAL: copy ERP routes to new repo + start serving them from new deploy + retire from V2 repo per-page

---

## Consequences

**Positive**
- Lowest migration risk in phase 1 (no infra change from V2).
- Customer + admin sessions interop naturally (impersonation feature, support tooling).
- Shared business logic = zero "is this calc the same?" risk.
- Cost-optimised — one Vercel project until proven need.

**Negative**
- Bundle size discipline required (CI gate). Without it, customer-side bloats.
- ERP downtime affects customer if both deploy together — feature flags + small PRs mitigate but don't eliminate.

**Neutral**
- Option B is reversible: can always split later. Option C/D = irreversible.
- ADR is revisitable at any V3-phase milestone.

---

## Phase 1 directory layout (proposed)

```
app/[locale]/(admin)/admin/
├── v3/                    — NEW V3 ERP routes
│   ├── customers/         — CRM module
│   ├── invoicing/         — billing module
│   ├── operations/        — cargo/freight ops module
│   ├── accounting/        — financial module
│   ├── hr/                — already exists; absorb into v3
│   └── settings/          — RBAC mgmt + org config
├── (legacy)/              — V2 routes; keep until V3 reaches feature parity
│   └── ... (current /admin/* routes here)
└── page.tsx               — landing → role-pivot to v3 or legacy depending on user

components/
├── (existing shared) ...
└── erp/                   — NEW V3-only components
    ├── data-grid/
    ├── form-builder/
    ├── kanban-board/
    └── ...

actions/
├── (existing shared) ...
└── erp/                   — NEW V3-only server actions
    ├── customers/
    ├── invoicing/
    └── ...

lib/
├── (existing shared) ...
└── erp/                   — NEW V3-only utilities (mostly business logic)
    ├── permissions.ts     — has_permission() wrapper from ADR-0011
    └── ...
```

Or alternatively: rename `(admin)` → `(admin-v2)` and create new `(admin)` for v3, with legacy routes redirecting. ภูม picks the cleaner approach.

---

## Open questions for ก๊อต (lock these)

1. **Phase 1 directory:** `/admin/v3/*` sub-tree vs renamed `/admin/legacy` + new `/admin`? Recommend the sub-tree approach (less risky; existing URLs in admin bookmarks keep working).
2. **Trigger thresholds:** confirm the 4 split triggers (bundle / deploy-freq / team-size / LCP). Add any others?
3. **Shared logic package** (Phase 3) — `@pacred/shared` npm package vs git submodule vs Turborepo monorepo? Recommend Turborepo (proven in Vercel ecosystem) if/when split happens.
4. **Customer-side impact during Phase 2** — should ERP routes be pre-rendered (SSG/ISR) or always dynamic? Recommend dynamic (admin data is per-user, no SSG win).
5. **Bundle budget** — concrete numbers? Recommend: customer-side initial JS chunk ≤ 150kb gzipped (current ~120kb), LCP ≤ 2.5s (current ~2.1s on customer pages).

---

## Cross-references

- V2/V3 strategy → [ADR-0010](0010-v2-v3-version-strategy.md)
- RBAC granular (the V3 access-control story) → [ADR-0011](0011-erp-rbac-granular.md)
- V2→V3 migration roadmap → [ADR-0013](0013-erp-v2-v3-migration-strategy.md) (sibling DRAFT)
- DPX ERP phase 2 → [ADR-0008](0008-dpx-erp-phase-2.md)
- ERP schema sketch → [ADR-0009](0009-erp-schema-sketch.md)
- Ops roles workspaces → [`docs/briefs/ops-roles.md`](../briefs/ops-roles.md)
- Current admin routes → `app/[locale]/(admin)/admin/`

**End of ADR-0012 (DRAFT).** ก๊อต: review, answer 5 open Qs, flip Status → Accepted. ภูม: V3 development hasn't started; this is direction-setting only.
