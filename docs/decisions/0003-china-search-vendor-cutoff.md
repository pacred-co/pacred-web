# ADR-0003 — China-search vendor cutoff (Track G / R1)

**Status:** Accepted (interim — Option E hybrid)
**Date:** 2026-05-16 (decision locked by เดฟ); ADR written 2026-05-16
**Phase:** Sprint 6.5 / Part R1
**Owner:** เดฟ + ก๊อต (per `docs/team.md` §6 "เดฟ + ก๊อต = second-tier owners")

---

## Context

Pacred's `/service-order/add` flow uses three external services that were
inherited from the legacy PHP `pcs-cargo` codebase:

| Endpoint | Purpose |
|---|---|
| `tamit-cloud.com/api-product` | Product detail (URL → SKU + price + images) |
| `tam-i-t.com/api/convert-link-china` | Short-URL → productID cache |
| `akucargo.com/api3/api-2022` | Keyword search (1688 / Taobao) |
| `laonet.online` | Image search (reverse-image upload) |

All four are owned by the same vendor (`tam011plus@gmail.com`, known to
the team as **"ไอแต้ม" (Aitam) / TAM / TAMIT**), which is the PHP system's
former service provider.

2026-05-15 evening, ภูม shipped P-50..P-53 (commits in `origin/Poom`,
~1,300 LOC + 96 test assertions) rewiring `lib/china-search/` to those
endpoints per the audit. The code is correct. But:

> **ภูม flag (2026-05-15 ค่ำ):** "Pacred owner = ก๊อต + เดฟ — ตัดสินได้
> เลย ไม่ต้องคุยใคร. ตัดทั้งไอแต้ม (TAM/TAMAI/TAMTISO/tam-i-t/tamit-cloud/
> akucargo/laonet) ทั้ง PCS Cargo legacy ออกให้หมด — ไม่อยากให้ vendor
> เก่ารู้ว่า Pacred ทำเว็บใหม่"

So the code is correct but the **vendor strategy is wrong**. We need a
decision on what to do about the search feature in production while we
sort out a replacement.

## Options considered

| # | Option | Effort | Risk | Notes |
|---|---|---|---|---|
| **A** | Build Pacred-owned scraper (Cheerio + Puppeteer + Vercel function) | ~30-50h | Med — 1688 / Taobao rotate anti-scraper rules | Full independence. Matches what TAM / AkuCargo do internally. |
| **B** | Apply for official Taobao Open API (Alibaba Open Platform) | ~10h apply + 5-10h integrate | Low (official) | Needs Pacred company verification documents to Alibaba; approval timeline = weeks. |
| **C** | Pay 3rd-party SaaS (RapidAPI / Apify Taobao Scraper / similar) | ~5h | Low | Monthly recurring cost; not under our control but cleanly contracted. |
| **D** | Cut the feature short-term — customer pastes URL/title/price/qty manual | 0h (revert wiring) | Low | UI already supports demo mode (P-50 demo fallback). Just don't enable Track G in production. Add notice "ใส่ข้อมูลสินค้าเอง — ระบบ search กำลังพัฒนา". |
| **E** | **Hybrid (recommended interim) — keep code, leave env unset** | 0h decision + 1 h label change + 1-3 days implement when A/B/C ready | Low | Track G code sits as-is in repo (it's correct). **Don't set the env vars in Vercel** for production. Production runs in demo mode (D-style). When A/B/C ready, just set the env vars and traffic flows. **Zero throwaway work.** |

## Decision

**Option E (hybrid).**

In practice this means:

1. The Track G code (`lib/china-search/index.ts`, `lib/china-search/akucargo.ts`,
   `lib/china-search/laonet.ts`, `lib/china-search/short-url-cache.ts`)
   stays as-is in the repo. The unit tests (96 assertions) continue to
   verify the adapters' correctness against their documented response
   shapes.
2. `PACRED_TAMIT_DETAIL_URL`, `PACRED_TAMIT_CACHE_URL`, `PACRED_AKUCARGO_API_URL`,
   `PACRED_LAONET_API_URL`, `PACRED_LAONET_KEY` are **NOT set in Vercel
   production** until the team has chosen a replacement.
3. With those env vars unset, `lib/china-search/` exports return
   `{ available: false }` or fall through to `buildDemoDetail()` — the UI
   shows a clear "ใส่ข้อมูลสินค้าเอง" banner (Part S5 rank-2; landed
   2026-05-16 in `b6aa1a7`) and the customer can still proceed.
4. The team picks **one** of A / B / C as a follow-up to this ADR — most
   likely after Phase H launches and we have real customer traffic to
   inform the cost/benefit math. When the replacement ships, the same
   adapter pattern in `lib/china-search/` can wrap it without UI changes.

### Why E over D (cut entirely)

Option D would mean reverting ภูม's work (~1,300 LOC) plus rewriting the
adapters again when we get a replacement vendor. Option E preserves the
shape of the code so a future replacement is a wiring change, not a
rebuild. **Zero throwaway, marginal risk** (the only risk is that an
engineer accidentally sets the env vars in Vercel — see "Guardrails"
below).

### Why E over B (official Alibaba API)

Application timeline is unknowable. We can apply in parallel, but we
can't block production launch on it. E lets us launch with demo mode and
upgrade asynchronously.

## Guardrails (so production stays in demo mode unintentionally)

- The Track G env vars are documented as **🟡 (optional)** in
  `docs/env.md` §5 — explicitly noting that leaving them unset is the
  current intended behaviour.
- `docs/HANDBOOK.md` "Things that bite" #4 has a standing warning:
  > **China-search vendor cutoff (Track G)** — Pacred lib/china-search
  > wired to TAMIT-cloud per audit, BUT vendor = ไอแต้ม which Pacred
  > wants to cut. DON'T set `PACRED_TAMIT_*` in Vercel prod until
  > ก๊อต picks replacement (Option A-E in PORT_PLAN Part R1).
- `docs/PORT_PLAN.md` Part R1 captures the decision tree + activation
  conditions.

## Re-evaluation triggers

Reopen this ADR when **any** of the following lands:

- Pacred owner ships a contract / approval from option A / B / C
- Customer complaints about manual data entry exceed a threshold the team
  finds acceptable (estimate: 5% of /service-order/add submissions in a
  given week)
- Track G code rots — adapter response shapes change and tests start
  failing — at which point we either fix or formally cut (Option D)

## References

- `docs/PORT_PLAN.md` Part R — vendor cutoff context + options table source
- `docs/PORT_PLAN.md` Part S1 — decision locked 2026-05-16
- `docs/audit/php-pcscargo-integrations.md` §17 — audit that surfaced the
  TAM endpoints + revealed RCGroup was dead code
- ภูม's Track G implementation: `origin/Poom` commits — currently merged
  into `dave` + `main` as of 2026-05-15 evening
- Tests: `lib/china-search/{extract-product-id,short-url-cache,akucargo-helpers,laonet-helpers}.test.ts`
- Label change implementing demo-mode messaging: commit `b6aa1a7`
  (2026-05-16) — `apiUnavailable` i18n key rewritten + banner colour
  switched from yellow/warning to blue/info
