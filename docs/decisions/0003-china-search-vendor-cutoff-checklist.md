# 🔪 China-search vendor cutoff — actionable checklist for ก๊อต

> **Companion to:** [`0003-china-search-vendor-cutoff.md`](./0003-china-search-vendor-cutoff.md) (the canonical ADR locked Option E hybrid)
> **Why this file exists:** ภูม + เดฟ + ก๊อต locked 2026-05-16: prod runs **demo mode** (env vars unset) while ก๊อต picks replacement (Option A scraper / B Alibaba API / C SaaS). This file makes the swap-out **actionable** — not vague "we'll do it later".
> **Status:** Pending — waiting on Phase H+ (post-launch) start signal from ก๊อต.
> **Owner:** ก๊อต (per K-1 in `docs/PORT_PLAN.md` Part S2)

---

## Why we have to do this (don't lose the thread)

The four endpoints currently powering Pacred's `/service-order/add` belong to a single vendor (`tam011plus@gmail.com`) who is also the supplier for PCS Cargo (the previous business). Continuing indefinitely means:

1. Vendor has visibility into Pacred's customer search volume + patterns (could share with PCS legacy or a future competitor).
2. Vendor controls a critical user flow with no SLA, no support contract, no terms of service.
3. If vendor goes down / rate-limits us / changes terms, Pacred's URL paste / search / image search degrades to demo mode (acceptable interim, not acceptable forever).

ภูม flag (2026-05-15 ค่ำ): **"ตัดทั้งไอแต้ม (TAM/TAMAI/TAMTISO/tam-i-t/tamit-cloud/akucargo/laonet) ทั้ง PCS Cargo legacy ออกให้หมด — ไม่อยากให้ vendor เก่ารู้ว่า Pacred ทำเว็บใหม่"**.

---

## Phase 0 — Decide replacement (~1-2h)

- [ ] **K-cutoff-decide-strategy** — Choose between:
  - [ ] **Option A** Pacred-owned scraper (Cheerio + Puppeteer or Playwright) — ~30-50h
  - [ ] **Option B** Official Taobao Open API via Alibaba Open Platform — ~10h apply + 5-10h integrate, weeks for approval
  - [ ] **Option C** 3rd-party SaaS — ~5-10h (RapidAPI Taobao Scraper / Apify Taobao Scraper / Bright Data / similar)

  Decision criteria:
  - Cost (per-call vs flat monthly vs scraper infra)
  - Reliability (vendor SLA vs scraper maintenance burden)
  - Pacred-control (Option A only)
  - Scaling (Option C handles spikes; A needs us to scale Vercel functions)

- [ ] **K-cutoff-spec** — Write spec for chosen option:
  - URL conventions (will keep `lib/china-search/types.ts` ChinaSearchHit / ChinaProductDetail shapes — adapter only changes)
  - Auth / API keys / per-request signing
  - Failure modes + fallback (must preserve P-50 demo fallback posture — never break customer flow)
  - Cost ceiling alarm (alert if call volume exceeds budget)

## Phase 1 — Replace adapters one by one (~10-50h depending on option)

The four files all follow the same pattern: `<adapter>.ts` (server-only fetch) + `<adapter>-helpers.ts` (testable parsers). Replace incrementally — each adapter swap is independent.

### URL → product detail (P-50 originally, ~5-15h to swap)

- [ ] **K-cutoff-tamit-replace** — Replace `lib/china-search/index.ts::convertProductUrlDetail` TAMIT call:
  - Current: `GET https://tamit-cloud.com/api-product/get/{1688|taobao}/?id=<id>`
  - New: per chosen Option (A/B/C)
  - Keep `extractProductId(url)` helper (vendor-agnostic — based on URL parsing)
  - Keep `normaliseTamitDetail` parser if Option B/C return TAMIT-compatible shape; rewrite with new `normaliseFooDetail` if shape differs
  - Update unit tests in `lib/china-search/extract-product-id.test.ts` (likely no-op — pure URL parsing) — add new adapter tests if shape differs
  - Update env vars: rename `PACRED_TAMIT_DETAIL_URL` → `PACRED_PRODUCT_API_URL` etc.
  - Update `.env.example` + `.env.local` + `.env.local` notes in `pending_state_*.md`

- [ ] **K-cutoff-tamit-verify** — Smoke test: paste 5 real URLs from each platform (1688, Taobao, Tmall) → all return real data, no TAMIT calls in network tab

### Short-URL cache (P-51 originally, ~3-8h to swap)

- [ ] **K-cutoff-shorturl-replace** — Replace `lib/china-search/short-url-cache.ts::resolveShortUrl`:
  - Current: tam-i-t.com cache → if miss, scrape with desktop UA spoof → write back to tam-i-t cache
  - New options:
    - **A.1**: Pacred-hosted Redis or Postgres table caching tk → productID; scraper still does the dance but writes to OUR cache
    - **B.1**: If Option B (official API), maybe Alibaba can resolve short URLs natively
    - **C.1**: Most 3rd-party scrapers handle short URLs internally (no separate cache layer needed)
  - Keep `detectShortUrl` + `scrapeProductId` helpers (vendor-agnostic)
  - Update unit tests in `lib/china-search/short-url-cache.test.ts`

### Keyword search (P-52 originally, ~3-8h to swap)

- [ ] **K-cutoff-keyword-replace** — Replace `lib/china-search/akucargo.ts::akucargoSearch`:
  - Current: `GET https://akucargo.com/api3/api-2022/search/v1[/taobao]/?q=&page=&page_size=15&lang=zh-CN`
  - New: per chosen Option
  - Keep `buildAkucargoUrl` (rename to `buildSearchUrl` or per-vendor) + `parseAkucargoResponse` if shape compatible
  - Update unit tests in `lib/china-search/akucargo-helpers.test.ts` → rename file

### Image search (P-53 originally, ~3-8h to swap)

- [ ] **K-cutoff-image-replace** — Replace `lib/china-search/laonet.ts::laonetImageSearch`:
  - Current: 2-step (base64 upload → returns imgid → search by imgid) at `laonet.online`
  - New options:
    - **A.2**: Use a generic reverse-image library + 1688 product DB scrape
    - **B.2**: Alibaba Image Search API (separate Alibaba product line)
    - **C.2**: 3rd-party reverse-image SaaS (TinEye, SerpAPI Lens, etc.)
  - Keep `parseLaonetUploadResponse` + `parseLaonetSearchResponse` if shape compatible (most won't be — image search shapes differ a lot)
  - Update unit tests in `lib/china-search/laonet-helpers.test.ts` → rename file
  - **Critical:** image search API keys are costly per-request; add per-customer rate limit before this lands

## Phase 2 — Cleanup + verification (~3-5h)

- [ ] **K-cutoff-env-purge** — Remove from `.env.example` + Vercel:
  ```
  PACRED_TAMIT_DETAIL_URL
  PACRED_TAMIT_API_URL  (legacy, may already be removed)
  PACRED_TAMIT_CACHE_URL
  PACRED_AKUCARGO_API_URL
  PACRED_LAONET_API_URL
  PACRED_LAONET_KEY
  PACRED_RCGROUP_API_URL  (legacy, may already be removed)
  ```
  Replace with new vendor's env var names.

- [ ] **K-cutoff-grep-final** — `grep -ri "tamit\|tam-i-t\|akucargo\|laonet\|tam011plus@gmail" --include="*.ts" --include="*.tsx" --include="*.md" --include="*.sql" --include="*.json"` — should return zero matches (in source files; the audit doc is fine to keep as historical reference).

- [ ] **K-cutoff-unit-tests** — Run `pnpm test` — all assertions still green (new adapter tests should match the count from before, or higher).

- [ ] **K-cutoff-typecheck-lint** — `pnpm exec tsc --noEmit` + `pnpm exec eslint lib/china-search/` clean.

- [ ] **K-cutoff-prod-smoke** — Production smoke test:
  - Paste 5 real Taobao URLs → real product detail
  - Paste 5 real 1688 URLs → real product detail
  - Paste 5 short URLs (m.tb.cn/, qr.1688.com/s/) → resolve correctly
  - Search 5 keywords → real results
  - Upload 5 product photos → real reverse-image hits
  - Monitor `/api/china-search` route logs for 24h: error rate < 1%, p95 latency < 3s

- [ ] **K-cutoff-monitor-cost** — Set up cost alarm (Vercel Function invocation count + new vendor's per-request cost) → alert if spend exceeds budget × 1.5.

## Phase 3 — Doc closure (~1h)

- [ ] **K-cutoff-adr-update** — Update `docs/decisions/0003-china-search-vendor.md` Status: `Accepted` → `Superseded by Phase 1 cutoff completion (YYYY-MM-DD)`. Note new vendor + new env var names.

- [ ] **K-cutoff-port-plan-update** — Update `docs/PORT_PLAN.md` Part R §R1 — mark closed.

- [ ] **K-cutoff-checklist-archive** — Move this file to `docs/decisions/archive/` once all boxes checked.

- [ ] **K-cutoff-runbook-add** — Add new vendor to `docs/runbook/vendor-allowlist.md` (if API has IP allowlist requirements) and `docs/runbook/oncall.md` (escalation contact for vendor downtime).

---

## Cost expectation if we delay too long

- TAM is freemium (no auth, no contract). If they add auth or rate limit aggressively, Pacred is forced into emergency cutoff with Option D (cut feature) UX during transition — bad customer experience.
- Vendor visibility cost grows as Pacred ships customer growth — at 1000 daily orders, vendor knows our exact customer search patterns. Worth ~1-2 weeks of engineering effort to swap before that volume.

**Recommended cutoff trigger:** when Pacred hits 100 daily orders OR 8 weeks post-launch, whichever is sooner.

---

## ก๊อต — first step when you pick this up

1. Read this file end-to-end (you wrote half of it ;))
2. Read `docs/decisions/0003-china-search-vendor.md` (the parent ADR)
3. Read `docs/audit/php-pcscargo-integrations.md` §2-§4 to refresh context
4. Read `lib/china-search/index.ts` + the 4 adapter files to see what's there now
5. Pick A vs B vs C → fill in Phase 0 checkbox + open thread for ภูม + เดฟ
6. Spec the chosen option → file that ภูม can implement (or take it yourself)
7. Execute Phase 1 → 2 → 3 in order
