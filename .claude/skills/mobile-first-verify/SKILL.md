---
name: mobile-first-verify
description: Verify a page or component renders correctly on mobile BEFORE shipping a customer-facing surface. Fires on "check this on mobile", "is this responsive", "verify the phone layout", "mobile QA", "ดูบนมือถือ", or before pushing any customer-visible page. Resizes to the Pacred reference viewports (360/390px), screenshots, and asserts no horizontal scroll, tap targets ≥ 44px, text ≥ 16px, and a thumb-reachable CTA.
---

# Mobile-First Verify

> **Why this exists.** Most Pacred customers arrive on phones. A landing page
> that looks perfect on a 1440px dev monitor can be unusable at 360px —
> horizontal scroll, tap targets too small to hit, a CTA pushed below the fold,
> input text that triggers iOS zoom. *"It looks fine on my screen"* is not *"it
> works for the customer."* This skill is the gate between the two. The
> canonical rules live in [`docs/conventions.md` §11](../../../docs/conventions.md)
> + [`docs/mobile-first-playbook.md`](../../../docs/mobile-first-playbook.md);
> this skill **executes** the check.

## When to fire

- Before pushing ANY customer-facing page or component (landing, form, portal screen).
- After a layout change on an existing customer surface.
- When the user says "check mobile", "is this responsive", "phone QA", "ดูบนมือถือ ตรงไหนเพี้ยน".

## The reference viewports (Pacred standard)

| Width | Device class | What it catches |
|---|---|---|
| **360px** | common Android — the floor | the tightest real layout; most overflow bugs surface here |
| **390px** | iPhone (12-15) | the most common single width in Thailand |
| **1280px+** | desktop | confirms the layout still scales UP cleanly |

Verify **360 + 390 first.** Desktop last — it is the easy case.

## The loop

```
1. SERVE   — get the page running (pnpm dev, or a deployed URL).
2. For each of 360px then 390px:
   a. RESIZE   the viewport to that width.
   b. SCREENSHOT the full page.
   c. INSPECT  against the checklist below.
3. ANALYZE — list every failure with the offending element + the fix.
4. FIX     — apply the mobile-first Tailwind pattern (playbook "checklist").
5. RE-VERIFY — back to step 2 until clean at BOTH widths.
6. DESKTOP sanity — resize to 1280px; confirm it scaled up, nothing stretched/broken.
```

## The checklist — assert each, at 360 AND 390

- [ ] **No horizontal scroll.** The page does not scroll sideways. Check
  `document.documentElement.scrollWidth <= clientWidth`, or visually. The cause
  is almost always a fixed-width child or an un-wrapped flex row.
- [ ] **Tap targets ≥ 44px.** Every button / link / nav item / icon-button is
  at least 44×44px. Tailwind: `min-h-11 min-w-11` + real padding.
- [ ] **Body text ≥ 16px.** No customer-readable text below 16px — inputs
  especially (smaller text triggers iOS zoom-on-focus). Tailwind: `text-base`+.
- [ ] **Primary CTA visible + thumb-reachable.** The main action is on-screen
  without hunting, in the lower ⅔ (the thumb zone).
- [ ] **Nothing clipped or overflowing.** Cards, modals, tables fit the width;
  long text wraps — it does not truncate to nothing.
- [ ] **Images fluid.** Every image has `max-w-full` / `w-full` — none forces
  the page wider than the viewport.
- [ ] **Tap, not hover.** No interaction depends on `:hover` alone — touch has
  no hover state.

## Tools

Drive this with the preview tooling — `preview_start` / `preview_resize` /
`preview_screenshot` (or the Chrome browser tools): resize, screenshot, read.
If preview tooling is unavailable, fall back to a manual check at the documented
widths and **say so in the report** — a skipped screenshot step is a known gap,
not a pass.

## Report

After the loop, report: each viewport checked · each checklist item pass/fail ·
every failure with the offending element + the applied (or recommended) fix ·
and a final verdict — **mobile-clean** or **not**.

## Anti-patterns

- **"Looks fine on my monitor."** Dev monitors are 1440px+. The customer is on 360.
- **Desktop-first Tailwind.** Base classes = mobile; `sm:`/`md:`/`lg:` scale UP.
  Writing `lg:` as the base and overriding down is backwards.
- **Checking 390 only.** 360px is the floor and catches more — always check it.
- **Skipping the screenshot.** "I read the JSX, it looks responsive" misses real overflow.

## Cross-links

- [`docs/conventions.md` §11](../../../docs/conventions.md) — the canonical mobile-first rules
- [`docs/mobile-first-playbook.md`](../../../docs/mobile-first-playbook.md) — the full playbook: pitfalls + Tailwind patterns
- [`phase-verify-loop`](../phase-verify-loop/SKILL.md) — the general assume→check→verify→fix loop this mirrors
