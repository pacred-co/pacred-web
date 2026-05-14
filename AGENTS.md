<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Pacred — agent behavior rules

> AGENTS.md is loaded into every Claude Code session via `@AGENTS.md` at the top of `CLAUDE.md`. Keep this file narrow: rules that change *how* agents behave, not project facts (facts live in CLAUDE.md / docs/).

## 1. Read your role brief FIRST

Every session opens **[`docs/briefs/<your-name>.md`](docs/briefs/)** before any other work. Routing in [`docs/briefs/INDEX.md`](docs/briefs/INDEX.md). Skipping = wandering session.

## 2. Revenue-first lens (emergency mode active)

The company is burning runway (per `cash_burning_p0_emergency` memory). Default to the question: **"งานนี้ส่งผลให้รับลูกค้า cargo ได้เร็วขึ้นไหม?"**

- Yes → do it now (P0)
- No → defer or hand off (don't do mid-emergency)

Cargo system getting customers > everything else (V3 prep, refactors, "nice-to-have" features, broad cleanup).

## 3. Don't preempt brand cleanup

Pacred is splitting from **PCS CARGO + TTP + ไอแต้ม**. References to these survive in code because some APIs are still "borrowed" interim. **Do not scrub these references** until ก๊อต confirms the matching API switchover. The rule lives in [`docs/runbook/pcs-scrub-plan.md`](docs/runbook/pcs-scrub-plan.md).

## 4. V2 ≠ V3 — don't refactor mid-flight

This repo (`pacred-web`) is **V2 owner-pleaser**. V3 lives in a separate future repo (`pacred-DPX`) per [ADR-0010](docs/decisions/0010-v2-v3-version-strategy.md). When tempted to refactor toward your ideal architecture, append to `docs/v3-wishlist.md` instead. Don't ship V3 redesigns into V2.

## 5. Push at save-points only

Commit local freely. Push only when: end of session · before sleep · machine change · location change · big batch done. Per [memory: push_frequency_strict] + [`docs/team.md`](docs/team.md) §3.0. Vercel build cost + push churn distracts the team.

## 6. Customer-visible surfaces have a voice

Slogan: **"เร็ว ไว ไม่มีคำว่าทำไม่ได้"**. Mobile-first. Copy ตรงเป้า ไม่อ้อม. Every service has a landing page (even if backend not ready → use "ติดต่อทีม" CTA fallback). Don't ship dry copy.

## 7. Constants live in `components/seo/site.ts`

Company info (phone / email / address / legal name / tax ID / slogan / LINE OA / social) **must be imported** from this single source. Never hardcode. If you spot hardcoded values, flag them via `L-contact-refactor` tracker in PORT_PLAN.

## 8. Never break the autonomous run

When the user says "จัดมาเลย / รันยาวๆ / ลุยเลย" → pick recommended defaults, don't ask mid-run, save-points-only pushes (per `autonomous_long_runs` memory). The check-in pattern is `AskUserQuestion` only when there's a load-bearing branch you can't infer.

---

For project facts (architecture, schema, env, branches, decisions): see [CLAUDE.md](CLAUDE.md) and the linked docs.
