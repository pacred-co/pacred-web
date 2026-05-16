# R1-pick — China-search replacement options matrix

> **Status:** ✅ **DECIDED 2026-05-16 night — DEFER T+30d post-launch + SaaS RFP** picked by ก๊อต + เดฟ + ลูกพี่ (Option F now, Option C at T+30d eval gate). ADR-0003 Option E demo-mode continues. ก๊อต re-opens this matrix at T+30d (≈ 2026-06-17) for vendor RFP decision per §6.
> **Date:** 2026-05-16 night (matrix + decision)
> **Source:** [ADR-0003 china-search-vendor-cutoff](0003-china-search-vendor-cutoff.md) + [checklist](0003-china-search-vendor-cutoff-checklist.md).
>
> **Read with:**
> [ADR-0003](0003-china-search-vendor-cutoff.md) (locked: Option E hybrid — TAMIT code in repo, prod = demo mode) ·
> [`docs/audit/php-pcscargo-integrations.md`](../audit/php-pcscargo-integrations.md) §3-§4 (decoded legacy integrations).

---

## 1. Current state (per ADR-0003 Option E hybrid)

**Code:** `lib/china-search/` shipped with TAMIT-cloud + AkuCargo + Laonet wrappers (Track G — P-50..P-53 by ภูม)
**Production:** `PACRED_TAMIT_*` / `PACRED_AKUCARGO_*` / `PACRED_LAONET_*` env vars NOT set → `/api/china-search/*` returns demo data → customer-facing URL→cart converter shows demo product (price 0)
**Workaround:** sales rep manually adds items via admin UI when customer asks. **Acceptable for soft-launch.**

**The eventual question:** when to switch from demo mode → real vendor? And which vendor?

---

## 2. Why R1 matters

PHP `pcs-cargo` heavily relied on China product search to convert URLs into orderable items. Pacred's customer flow:

1. Customer pastes 1688 / Taobao / Tmall URL into `/service-order/add`
2. Pacred fetches product detail (title / price / SKUs / images)
3. Customer customizes quantity + SKU + adds to cart
4. Cart → checkout → order placed

Without this, customer must manually retype everything OR sales rep does it. **Friction = lost conversions** = revenue impact post-launch as customer base grows.

Forensics on PHP (per audit §3-§4):
- TAMIT-cloud (`tamit-cloud.com/api-product/get/{1688|taobao}`) — actual canonical product API used in production
- AkuCargo (`akucargo.com/api3/api-2022/search/v1/`) — keyword search fallback
- Laonet (`laonet.online`) — image search (reverse-image lookup)
- RCGroup-TH — dead code (never used in production despite being in `convertURL.php`)

All 3 active providers are operated by ไอแต้ม (= legacy single-point-of-failure per forensics §2). Cutover from ไอแต้ม is V-F1 territory.

---

## 3. Decision criteria

| Criterion | Weight | Why it matters |
|---|---|---|
| **1688 / Taobao / Tmall coverage** | High | TH cargo customers source ~90% from these 3 |
| **Price** | High | Vendor lock-in vs Pacred's own infra; long-term cost |
| **Reliability (uptime + rate limit)** | High | Customer adds item → must work in <2s for good UX |
| **Anti-detection / anti-block** | High | 1688 + Taobao actively block scrapers; vendor's stealth matters |
| **Cross-border data** | Medium | Currency conversion, shipping eligibility, product translations TH |
| **Image search** | Medium | Customer uploads photo → find similar products. Niche but high-value UX. |
| **Migration cost** | Medium | If switching vendor, how much rewrite? |
| **Vendor independence** | Medium | Not ไอแต้ม — must be independently sustainable |
| **Pacred infra dependence** | Low | Self-host vs SaaS trade-off |

---

## 4. Vendor options

### 4.1 **Option A — Build Pacred's own scraper** (DIY)

**Approach:** Pacred maintains own scraper infra (Playwright/Puppeteer cluster + proxy rotation + headless Chrome).

**Pros:**
- ✅ Full control; no vendor dependency
- ✅ Cheapest long-term (~$50-100/mo for proxy infra at Pacred volume)
- ✅ Can tune for Pacred-specific use cases (TH locale, product variants, etc.)

**Cons:**
- ❌ HIGH engineering cost: ~80-120h to build robust scraper + anti-block + proxy rotation
- ❌ Ongoing maintenance: 1688/Taobao change DOM monthly; scraper breaks; engineering interrupt
- ❌ Legal grey area (1688 ToS prohibits scraping — risk of legal threat letter, low but non-zero)
- ❌ IP banning if proxies leak
- ❌ Slower than vendor (vendors have warm proxy pools)

**Cost estimate:** 80-120h dev + ~$50-100/mo proxy infra + 4-8h/mo maintenance

### 4.2 **Option B — Direct Taobao / Alibaba official API**

**Approach:** Pacred registers as Alibaba International developer, gets official API access to Taobao Open Platform / 1688 OpenAPI.

**Pros:**
- ✅ Official + legal
- ✅ Stable contract (vs scrape-and-pray)
- ✅ Better rate limits + reliability

**Cons:**
- ❌ Onboarding 2-6 months (Chinese partner application + ID verification)
- ❌ Often Chinese-only docs + Chinese customer support
- ❌ Some APIs restricted to mainland-China-based companies (Pacred is TH-based)
- ❌ Per-API call costs can add up at scale (paid per call after free tier)
- ❌ 1688 OpenAPI more limited than scraping (some product fields not exposed)
- ❌ Currency: paid in CNY

**Cost estimate:** 40-80h dev + onboarding 2-6mo + ~$200-500/mo at Pacred volume

### 4.3 **Option C — SaaS aggregator (e.g. RCGroup-TH / OneSearch.cn / similar)**

**Approach:** Subscribe to a 3rd-party SaaS that wraps multiple sources (1688/Taobao/Tmall + Alipay product info + cross-border shipping eligibility).

**Pros:**
- ✅ Fastest onboarding (days)
- ✅ Vendor manages anti-block + DOM changes + proxy rotation
- ✅ Often includes translation + currency conversion
- ✅ Predictable pricing

**Cons:**
- ❌ Vendor lock-in (switching vendor later = re-integrate)
- ❌ Per-API call cost (typically ฿0.05-0.20 per product lookup)
- ❌ Limited customization — depends on vendor's API
- ❌ Risk of vendor going out of business (RCGroup is small)

**Cost estimate:** 8-16h dev + ฿5k-30k/mo at Pacred volume (10k-50k product lookups/mo)

### 4.4 **Option D — TAMIT-cloud (legacy, controlled by ไอแต้ม)**

**Approach:** Continue using TAMIT-cloud / AkuCargo / Laonet (Pacred has the code wired; just set env vars).

**Pros:**
- ✅ ZERO migration cost — code already wired
- ✅ Battle-tested (legacy PHP used this for years)
- ✅ Known to work with 1688 + Taobao + Tmall

**Cons:**
- ❌ **Defeats the cutover purpose** (V-F1 risk = ไอแต้ม single-point-of-failure; using TAMIT keeps Pacred dependent)
- ❌ Pay-or-die contract (per forensics §2)
- ❌ No SLA, no formal vendor relationship
- ❌ Currently ADR-0003 LOCKED OUT of production env (per Option E hybrid)

**Cost estimate:** ~฿15k/mo per current ไอแต้ม retainer + variable per-API fee

### 4.5 **Option E — Hybrid: Pacred scraper + SaaS fallback** (V2 long-phase)

**Approach:** Pacred builds simple scraper for common cases (~80% of customer URLs); fall back to SaaS for niche / edge cases / image search.

**Pros:**
- ✅ Cost-optimized (scraper handles common; SaaS handles edge)
- ✅ Resilience (scraper down → SaaS picks up)
- ✅ Long-term scalable

**Cons:**
- ❌ Most complex to maintain (2 systems)
- ❌ Doubles development cost (option A + option C combined)

### 4.6 **Option F — Pause + see** (defer)

**Approach:** Keep ADR-0003 Option E demo-mode active for V2; revisit in 6-12 months post-launch when customer volume reveals actual need.

**Pros:**
- ✅ Zero cost
- ✅ Reveals which features customers ACTUALLY ask for (vs. assumed)
- ✅ Lets V2 + V3 stabilize first

**Cons:**
- ❌ Customer experience inferior to PHP era (some customers switch to competitor)
- ❌ Sales rep workload higher (manual product entry)

---

## 5. Recommendation

### 5.1 Phased recommendation

| Phase | Recommendation |
|---|---|
| **T-0 (Mon launch)** | Stick with **Option F (defer)** — Pacred runs demo mode per ADR-0003 |
| **T+30 days** | Evaluate: how many "I can't add my URL" tickets? Sales rep workload? |
| **T+60 days IF demand confirmed** | Adopt **Option C (SaaS aggregator)** for fastest unblock. Recommend evaluating 2-3 vendors (RCGroup if still operational; OneSearch.cn; ChinaScraper.cc; or similar). Pick lowest-friction vendor matching Pacred's product types. |
| **T+12 months IF Pacred volume > 50k lookups/mo** | Evaluate **Option B (Official Taobao Open API)** — by then onboarding completed; lower per-call cost than SaaS at scale |
| **Year 3+** | **Option E (hybrid)** if revenue justifies engineering complexity |

### 5.2 NEVER recommend Option D (TAMIT)

**Hard no on TAMIT** — defeats V-F1 cutover. Even if it works, the strategic risk of ไอแต้ม dependency is unacceptable.

### 5.3 Quick win at T+30 days

If even SaaS is too much friction:
- Build "Quick paste URL → admin gets notification → admin manually fills it within 5 min" workflow
- Customer expectation set: "5-min response" beats "broken page"
- Internal tool, no vendor dependency, ~8h dev

---

## 6. Vendor research for Option C (SaaS — when Phase T+60 fires)

Pacred can short-list these:

| Vendor | URL | Coverage | Approx pricing |
|---|---|---|---|
| **RCGroup-TH** (if still alive) | rcgroup-th.com | 1688 + Taobao (PHP legacy used but never reached prod) | Unknown |
| **OneSearch.cn** | onesearch.cn | 1688 + Taobao + Tmall + image search | ~฿0.10/call |
| **AkuCargo** | akucargo.com | 1688 + Taobao + cross-border | Same as TAMIT pricing — caveat: controlled by ไอแต้ม partner |
| **Laonet** | laonet.online | Image search specifically | Same caveat |
| **Aliyun OpenAPI Marketplace** | alibabacloud.com | Many providers; varies | Per-call, ~$0.001-0.01 |
| **ZenRows** | zenrows.com | Generic scraping API (1688 + Taobao OK) | ~$50-200/mo |
| **ScraperAPI** | scraperapi.com | Generic | ~$50-300/mo |

**ก๊อต action when T+60 fires:** RFP 3 vendors with Pacred's specific use cases (URL → product detail; keyword search; image search). Pick fastest+cheapest verified working.

---

## 7. Resolved decisions (locked 2026-05-16 night by ก๊อต + เดฟ + ลูกพี่)

1. **Defer-vs-act trigger:** ✅ **T+30-day evaluation gate** (count "can't add URL" tickets via Sentry + support inbox + sales-rep workload self-report). If >10 tickets/wk → trigger Option C SaaS RFP. If <10/wk → continue Option E demo mode.
2. **Budget for Option C** when triggered — ✅ **~฿5-30k/mo acceptable** for SaaS aggregator (avoids 80-120h Option A engineering cost; cash spend << engineering opportunity cost at Pacred's launch volume).
3. **Anti-RCGroup risk** — ✅ **INCLUDE RCGroup-TH in RFP** (they're in scope — historical "never reached prod" status doesn't mean untrusted; let RFP responses decide). EXCLUDE TAMIT/AkuCargo/Laonet (ไอแต้ม-controlled, defeats V-F1).
4. **Image search priority** — ✅ **Defer to V2.1.** Customer URL-paste covers 95% of use cases; image search is a niche delight feature. Revisit if Sentry shows "image search" demand emerging.
5. **Compliance / legality** — ✅ **Acknowledged low-but-nonzero risk.** Pacred uses SaaS vendor (transfers ToS-violation risk to vendor) when picked. No direct scraping by Pacred infra in V2.

**Next action:** ก๊อต re-opens this matrix at T+30d eval gate (~2026-06-17). Until then, Option E demo mode continues per ADR-0003 lock.

---

## 8. Acceptance — R1-pick done when

- [ ] ก๊อต locks: defer vs SaaS at T+30 days
- [ ] If SaaS picked: RFP to 3 vendors, choose 1, integrate, demo mode replaced with real vendor in prod
- [ ] If defer: explicit "no action" decision committed (so the question stops resurfacing)
- [ ] ADR-0003 updated with current state + V2 long-phase decision

---

## 9. Cross-references

- Locked ADR → [ADR-0003 china-search-vendor-cutoff](0003-china-search-vendor-cutoff.md)
- Checklist for Option E hybrid → [`0003-china-search-vendor-cutoff-checklist.md`](0003-china-search-vendor-cutoff-checklist.md)
- Legacy PHP integration forensics → [`docs/audit/php-pcscargo-integrations.md`](../audit/php-pcscargo-integrations.md) §3-§4
- F1-1 cutover status → [`docs/runbook/legacy-cutover-tracker.md`](../runbook/legacy-cutover-tracker.md)
- Current code → `lib/china-search/`

**End of R1-pick matrix.** ก๊อต: review at T+30 days post-launch; pick defer or SaaS RFP. Until then, ADR-0003 Option E (demo-mode prod) continues per existing lock.
