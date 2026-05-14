# ADR 0003 — China product search vendor strategy

**Status:** Accepted (2026-05-15)
**Deciders:** ก๊อต + เดฟ
**Owner of cleanup work:** ก๊อต (Track K — see PORT_PLAN §O5 K-ADR-vendor-cutoff)
**Implementer of code (already shipped):** ภูม (Track G P-50..P-53 on Poom branch, commits `01f0cc1`..`f8e1a20`)

---

## Context

`lib/china-search/*` powers three flows on `/service-order/add`:

1. **URL → product detail** (paste a 1688 / Taobao / Tmall link → see title, price, SKU axes)
2. **Keyword search** (search by Thai/Chinese keyword)
3. **Image search** (upload a product photo → reverse-image lookup)

Per the deep audit `docs/audit/php-pcscargo-integrations.md`, the legacy PHP system (PCS Cargo) used four endpoints owned by the same vendor (`tam011plus@gmail.com`):

| Surface | Endpoint |
|---|---|
| Product detail | `https://tamit-cloud.com/api-product/get/{1688\|taobao}/?id=<id>` |
| Short-URL cache | `https://tam-i-t.com/api/convert-link-china/{get,save}/...` |
| Keyword search | `https://akucargo.com/api3/api-2022/search/v1[/taobao]/?q=...` |
| Image search | `https://laonet.online/index.php?route=api_tester/call&api_name=...&key=tam011plus@gmail.com` |

Pacred is a NEW company (separate from PCS Cargo). Continuing to use the same vendor means **the vendor knows Pacred is operating** — strategic concern (vendor could be a future competitor, change terms, raise prices, or share signals with PCS Cargo legacy).

Three-week shipping pressure rules out a clean rewrite right now.

## Options considered

| # | Option | Effort | Pacred-owned? | Vendor visibility | Time-to-ship |
|---|---|---|---|---|---|
| **A** | Build Pacred-owned scraper (Cheerio + Puppeteer + Vercel functions) | ~30-50h | Yes | None | 4-6 weeks |
| **B** | Apply for official Taobao Open API (Alibaba Open Platform) | ~10h apply + 5-10h integrate | Yes (after Alibaba approval) | Alibaba only (acceptable) | unknown — Alibaba weeks-to-months approval |
| **C** | Pay 3rd-party SaaS (RapidAPI / Apify Taobao Scraper / similar) | ~5-10h | No | Vendor only (different vendor) | 1-2 weeks |
| **D** | Cut feature short-term (UI labels "ใส่ข้อมูลเอง — ระบบ search กำลังพัฒนา"); customers paste URL/title/price/qty manually | ~1-2h | n/a | None | 0 days |
| **E** | Hybrid demo mode (Track G code stays in repo, env vars NOT set in Vercel → demo fallback) | 0h | n/a | None | 0 days, but degraded UX same as D |
| **F** | **Use TAM interim** (set env vars in Vercel → real product data; planned cutoff later) | 0h activation; ~30-50h cutoff later | Yes (after cutoff) | Vendor sees us until cutoff | 0 days for activation |

## Decision

**Chosen: Option F — Use TAM API interim, ก๊อต-led cutoff to A/B/C planned post-launch.**

Rationale (per ก๊อต+เดฟ 2026-05-15):
- **User value first**: real product titles + images + price tiers make `/service-order/add` actually usable by customers vs. demo placeholder. Three-week launch window does not allow waiting for Option A/B/C.
- **Vendor visibility cost is acceptable short-term**: Pacred's customer flow uses TAM endpoints exactly as PCS Cargo did. Vendor cannot distinguish Pacred-flavoured calls from legacy traffic for the first month or two unless they correlate Vercel egress IPs.
- **Cutoff is locked-in commitment**: this ADR creates the cleanup checklist (below) so the swap-out work cannot be silently dropped.
- **Risk hedged**: Track G code already has demo fallback at every failure path (P-50 commit). If TAM goes down or starts blocking us, customers see "ใส่ข้อมูลเอง" mode automatically — no outage.

Options A/B/C deferred to **Phase H+** (post-launch). ก๊อต owns selection between them after observing real Pacred volume.

## Consequences

### Positive

- `/service-order/add` URL paste / keyword search / image search all work in production from launch day.
- Zero throwaway code — Track G already implemented + tested (96 assertions across 4 helper files).
- ก๊อต gets calibration data (real Pacred query volume + shape) before committing to A/B/C effort.

### Negative / risks

- **Vendor visibility** until cutoff (~6-12 weeks expected). Mitigated by (a) using the same key/UA the legacy PHP did so we don't stand out, (b) ก๊อต cutoff is a hard requirement not a "nice to have".
- **Vendor downtime / Vendor blocks Vercel egress IPs**: Track G code falls back to demo mode automatically (no customer-facing error), but admin should monitor for high `network_error` rates in `/api/china-search` route logs.
- **Vendor terms change / pricing pressure**: TAM endpoints are unauthenticated freemium today; if vendor adds auth or rate limits aggressively, cutoff timeline accelerates.

### Action items

**Immediate (production launch):**

- [ ] **เดฟ:** set Vercel env vars (all defaults are TAM URLs, but explicit setting protects against `process.env` quirks):
  ```
  PACRED_TAMIT_DETAIL_URL=https://tamit-cloud.com/api-product
  PACRED_TAMIT_CACHE_URL=https://tam-i-t.com/api/convert-link-china
  PACRED_AKUCARGO_API_URL=https://akucargo.com/api3/api-2022
  PACRED_LAONET_API_URL=https://laonet.online
  PACRED_LAONET_KEY=tam011plus@gmail.com
  ```
- [ ] **เดฟ:** verify Vercel egress IPs are not blocked by TAM (likely fine — vendor blocks rarely target stable Vercel ranges). Quick test: paste a real Taobao URL in production /service-order/add; expect real product title + image. If 403 / timeout → contact vendor to allowlist (P-55, ~1h) OR accept demo fallback as interim.

**Cutoff (ก๊อต Track K, post-launch — see PORT_PLAN §O5 K-ADR-vendor-cutoff):**

- See `docs/decisions/0003-china-search-vendor-cutoff-checklist.md` (companion file) for the per-step swap plan.

## References

- Deep audit: `docs/audit/php-pcscargo-integrations.md` §2-§4 (vendor endpoint inventory + Pacred wire spec)
- Implementation: ภูม Track G P-50..P-53, ~1,300 LOC, 96 test assertions
  - `lib/china-search/index.ts` (URL→detail dispatcher)
  - `lib/china-search/short-url-cache.ts` + `short-url-helpers.ts` (P-51)
  - `lib/china-search/akucargo.ts` + `akucargo-helpers.ts` (P-52)
  - `lib/china-search/laonet.ts` + `laonet-helpers.ts` (P-53)
  - `lib/china-search/extract-product-id.ts` + `types.ts` (shared)
- Sprint 7+ Track G spec: `docs/PORT_PLAN.md` §O2 Track G (P-50..P-57)
- Original blocker flag: `docs/PORT_PLAN.md` Part R §R1 (this ADR resolves it)
- Companion cleanup checklist: `docs/decisions/0003-china-search-vendor-cutoff-checklist.md`
