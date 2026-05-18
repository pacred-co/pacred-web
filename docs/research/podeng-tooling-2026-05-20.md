# Frontend tooling for ปอน — D1 + ads-launch update (2026-05-20)

> **Purpose.** Make ปอน faster. This **extends + re-prioritises**
> [`frontend-tooling-2026-05-18.md`](frontend-tooling-2026-05-18.md) — that doc's
> workflow analysis still holds, but two things changed under it:
> 1. **D1 pivot (2026-05-18)** — ปอน's work moved from *building new landing
>    pages* to *reworking the existing customer-portal screens* to faithfully
>    match legacy PCS ([ADR-0017](../decisions/0017-pacred-faithful-pcs-port.md);
>    the 11-screen spec is [`d1-fidelity-customer.md`](d1-fidelity-customer.md)).
> 2. **Ads launch 2026-05-20** — landing-page LCP now directly costs money
>    (LCP → Google Ads Quality Score → cost-per-click).
>
> So the priority order from the 2026-05-18 doc is re-sequenced here, and four
> concrete tools are **delivered in this batch** (not just recommended).
>
> **Author:** ปอน-lane (Claude) · **Date:** 2026-05-19 · **Branch:** `podeng`

---

## 1. ปอน's workflow — the recurring costs

The 2026-05-18 doc scanned ~40 `podeng` commits and found five expensive,
repeating patterns. They still hold — here is each, with its D1 update:

| # | Recurring cost | Still true under D1? |
|---|---|---|
| 1 | **Visual tweak → commit → look → revert loop.** `certs-slideshow.tsx` touched 5+ times in 3 days; iterating by `pnpm dev` reload + eyeball | **Yes — and worse.** Reworking 11 portal screens to match legacy is *more* visual iteration, not less |
| 2 | **N near-identical files drifting.** 13 service landings, 459–835 lines each; the customs page even has its LINE banner pasted twice | **Shifted.** Landings are now stable; the *portal-screen rework* is the new N-variant job |
| 3 | **Mobile-crop tweaks by hand-resizing the browser.** Multiple commits exist only to rebalance a phone layout | **Yes.** Every reworked portal screen still needs the 360/390px check |
| 4 | **Heavy unoptimised images.** `visit01.png` 1.48 MB rendered at ≤180px; hero art painted via CSS `background:url()` (bypasses `next/image`) | **Yes — and now urgent.** Ads launch tomorrow; image weight → LCP → Quality Score → CPC |
| 5 | **i18n parity by hand.** TH/EN keys added per page; `audit:i18n` only catches gaps after the fact | **Yes.** Every reworked screen still needs TH+EN parity |

**ปอน's working style** (the lens for picking tools): fast, visual, iterates in
the browser, owns SEO + i18n + mobile, works WFH in focus blocks. The slogan is
**"เร็ว ไว"** — the tooling has to make the *see-it → fix-it → verify-it* loop
fast, and now also make *fidelity to legacy* and *ad-readiness* fast to check.

---

## 2. What changed — the D1 re-prioritisation

The 2026-05-18 doc's #1 pick was a **data-driven landing-page template**. Under
D1 that is no longer #1:

- New landing pages are **not** the current work — landings are shipped + stable.
- ปอน's current work is the **D1 Phase-B portal rework** — 11 customer screens
  to match legacy PCS, element by element.
- Ads launch **tomorrow** makes image weight (LCP) the most time-sensitive item.

So the new top priorities are **image optimisation** (ads-launch LCP) and a
**fast fidelity-checking workflow** (D1 Phase B). The landing-template refactor
drops to "useful pattern, defer" — and note it touches product files, so under
the owner's "copy legacy 100% first" mandate it is Phase-C scope anyway.

---

## 3. Delivered in this batch — tooling ปอน can use today

Four concrete tools, shipped on `podeng` this batch — no `pnpm install` needed:

| Tool | Invoke | Solves |
|---|---|---|
| **`legacy-fidelity-check`** skill | "fidelity check" / "เหมือนของเดิมไหม" / before pushing a D1 rework | Habit #1/#2 — turns "did I match legacy?" into a structured per-element audit → no silent divergence ships (the owner's mandate, as a gate) |
| **`landing-conversion-audit`** skill | "พร้อมยิงแอดยัง" / before an ad points at a page | Habits #3/#4 — one pre-flight check for CONVERT + TRACK + Quality-Score on an ad landing |
| **`pnpm audit:images`** | run it anytime | Habit #4 — lists every `public/` image over 300 KB, sorted, with the WebP/AVIF hint. The diagnostic for the ads-launch LCP fix |
| **`pnpm check:connections`** | run it before launch / after a deploy | Reports which analytics/ads/monitoring env vars are wired — the "check การเชื่อมต่อ" answer |

> **Use them now:** before pushing any D1 portal screen → `legacy-fidelity-check`.
> Before tomorrow's ad campaigns → `pnpm audit:images` on the ad-destination
> pages, then `landing-conversion-audit` on each.

---

## 4. Recommended next — needs เดฟ greenlight

These are bigger than a skill/script and touch shared config or product files —
ปอน should raise them with เดฟ rather than land them solo:

| Item | What | Why it waits for เดฟ |
|---|---|---|
| **In-repo `/preview` route** | A `app/[locale]/(dev)/preview` route rendering marketing/portal components in a prop+viewport grid — kills the tweak→reload→revert loop (habit #1) | New route in `app/` — eng-side; quick to add, but เดฟ owns route structure. **Recommended — small, high-leverage.** |
| **`audit:i18n` on save** | A watch task / git hook so a missing EN key surfaces instantly, not at `pnpm verify` (habit #5) | A hook = `.claude/settings.json` — เดฟ's call (use the `update-config` skill) |
| **Data-driven section template** | Extract shared section components + per-page config so the portal rework (and landings) stop copy-pasting JSX (habit #2) | A refactor of product files → **Phase C** under the owner's "faithful copy first" mandate; do the faithful rework first, factor the template after |

---

## 5. The re-prioritised tooling roadmap

| Rank | Item | Status | Why this rank |
|---|---|---|---|
| 1 | Image optimisation (audit + convert PNGs, stop CSS-bg art) | 🟢 `pnpm audit:images` delivered — the *fixes* are ปอน's task | Ads launch tomorrow; LCP → Quality Score → CPC. Measurable revenue lever |
| 2 | D1 fidelity workflow | 🟢 `legacy-fidelity-check` delivered | The core of ปอน's Phase-B work — every portal screen passes through it |
| 3 | Pre-ads landing audit | 🟢 `landing-conversion-audit` delivered | Gate every ad-destination page before paid traffic |
| 4 | In-repo `/preview` workbench | 🟡 recommended — เดฟ greenlight | Cuts the visual-iteration loop on the 11-screen rework |
| 5 | `audit:i18n` on save | 🟡 recommended — เดฟ (hook) | Removes the i18n round-trip |
| 6 | Data-driven section template | ⏸️ Phase C | A refactor — after the faithful port, not during |

---

## 6. Cross-links

- [`frontend-tooling-2026-05-18.md`](frontend-tooling-2026-05-18.md) — the original workflow analysis (full detail on each habit)
- [`ads-launch-action-plan-2026-05-20.md`](ads-launch-action-plan-2026-05-20.md) — the companion ads-launch plan
- [`d1-fidelity-customer.md`](d1-fidelity-customer.md) — the 11-screen Phase-B rework spec ปอน works from
- Skills: [`legacy-fidelity-check`](../../.claude/skills/legacy-fidelity-check/SKILL.md) · [`landing-conversion-audit`](../../.claude/skills/landing-conversion-audit/SKILL.md) · [`mobile-first-verify`](../../.claude/skills/mobile-first-verify/SKILL.md) · [`copyist-unlimited`](../../.claude/skills/copyist-unlimited/SKILL.md)
- Scripts: `scripts/audit-images.mjs` · `scripts/check-connections.mjs`
- [`docs/conventions.md`](../conventions.md) §11/§12 — mobile-first + perf/SEO rules
