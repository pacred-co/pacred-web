# ADR-0010 — V2 vs V3 version strategy

**Status:** Accepted (per เดฟ brief 2026-05-16)
**Date:** 2026-05-16
**Phase:** Pre-cutover from PHP — V2 active; V3 future repo
**Owner:** เดฟ + ก๊อต (V2 stewards); Pacred owner (พี่ป๊อป) (V2 scope authority); all staff (V3 design)

---

## Context

Pacred ships under two version tracks:

- **V2** = the current `github.com/pacred-co/pacred-web` repo. Active. **Owner-pleaser version.**
- **V3** = the future `github.com/pacred-co/pacred-DPX` repo. Not started. **Employee-paradise version.**

The split is **organisational**, not technical. Same Next.js + Supabase stack expected.

## V2 — `pacred-web` (current, all branches)

**Audience:** Pacred owner (พี่ป๊อป). Optimised for **owner satisfaction**.

**Scope (deliberately broad):**

- Port every function / env / API / feature from legacy PHP `pcs-cargo` — leave nothing behind
- Add every ecosystem expansion in `/CLAUDE.md` Pacred Ecosystem catalogue (services #1, #5-13)
- Accept every owner adjustment / addition / restructure pi่ป๊อป asks for — "we'll do it until he's happy then close V2"
- Goal-state for closing V2 + opening V3:
  - 🎯 สวย (beautiful)
  - 🎯 น่าใช้ (delightful to use)
  - 🎯 ใช้งานง่าย / เข้าถึงง่าย (easy + accessible — works for both pros and beginners)
  - 🎯 SEO #1 across every targeted keyword in every channel + word
  - 🎯 Bug-free end-to-end on every flow: booking → quote → promo → bill → ship → receipt

**Where owner adjustments land:** anywhere. The codebase is mutable. Any feature owner asks for goes in.

**Branch policy:** unchanged from `docs/team.md` (ก๊อต-approves main; dave/podeng/Poom personal).

## V3 — `pacred-DPX` (future, separate repo)

**Audience:** Pacred staff. Owner doesn't intervene. Master piece in the team's own style.

**Scope:** V2-perfected. Build on V2 → fix everything we wish was different. Goals:

- Onboarding-friendly first-class — new dev opens repo + reads docs → ships meaningful change in week 1
- Architecture aesthetic that the team agrees on (not the owner's preferences)
- "ทุกคนอยากทำงาน" — every team member proud to work in it
- Drop V2's anyOwnerWants opportunism — be deliberate

**When V3 starts:** owner gives explicit "พอใจแล้ว / ตัดจบ V2" signal. Until then, all work stays in `pacred-web`.

**What V3 inherits vs reimplements:** TBD — design call after V2 closes. Pessimistic estimate: ~30% reused, ~70% rewritten. Optimistic: ~70% reused. Will know after V2.

## Decision rules during V2

These rules govern decisions made while V2 is active:

1. **Owner ask → goes in V2.** No deferring "this is more of a V3 thing." Capture-in-V2; refactor-in-V3.
2. **Team-driven idea → log to V3 wishlist if it conflicts with owner intent.** Don't ship under-the-radar.
3. **Technical debt → fix in V2 if it blocks owner-asked features; defer to V3 otherwise.**
4. **"Should I do this clean way or fast way?" → fast way + log refactor wishlist item.** V3 reimagines from learning.
5. **Architectural mistakes** discovered mid-V2 — patch the symptom + log root-cause item for V3.

## Where the V3 wishlist lives

`docs/v3-wishlist.md` — created when first item is logged (not yet, as of 2026-05-16). Append-only. One-line bullets. Sort by domain (frontend / backend / infra / docs). Periodic review during V2 stand-ups: "anything that ought to be in V2 now after all?"

## Re-evaluation triggers

This ADR re-opens when:

- Owner signals V2 is done → start V3 cutover discussion
- Codebase becomes unworkable mid-V2 (rare; would need agreement among all 4 of เดฟ + ก๊อต + ภูม + ปอน)
- A breaking dependency upgrade (Next.js 17, React 20, Supabase major) prompts a "do we just start V3 here?" discussion

## References

- `docs/team.md` §1 Phase mapping — earlier rough split
- Memory: `owner_pop_v2_v3_strategy.md` — short-form rules
- `/CLAUDE.md` Pacred Ecosystem — service catalogue that defines V2 scope edges
- ADRs 0001-0009 — all written for V2; portable to V3 with edits
