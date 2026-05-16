# ปอน Playbook — T-N1 SEO emergency audit + T-N2 Ad landing quality

> **Status:** 📋 playbook by เดฟ (preempting ปอน T-N1 + T-N2 from Part T2 emergency sprint).
> **Date:** 2026-05-16 night · **Source:** PORT_PLAN Part T2 ปอน emergency items · [`docs/briefs/podeng.md`](podeng.md).
>
> **Read with:**
> [`docs/briefs/podeng.md`](podeng.md) (ปอน's full role brief) ·
> [`docs/audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md) §"Customer pain themes" (SEO ranking issues hinted) ·
> [`docs/decisions/0007-analytics-and-ab-testing.md`](../decisions/0007-analytics-and-ab-testing.md) (GTM + Clarity locked).
>
> **Use this when:** ปอน sits down to start T-N1 / T-N2. Follow steps 1→N; tick each off; report findings as `docs/audit/seo-audit-2026-05-NN.md` + per-page Lighthouse reports.

---

## 🔥 Context (why these tasks now)

Per [`docs/PORT_PLAN.md`](../PORT_PLAN.md) Part T2:

> **บริษัทเผาเงิน.** Google Ads ยิงไม่ติด — landing rank ต่ำ · Google Search หา pacred.co ไม่เจอ · Facebook Ads มี inquiry คาร์โก้เข้าแต่ระบบยังไม่พร้อมรับ → drop + เสียชื่อ. พี่ป๊อปเครียดมาก.

**T-N1** = "SEO emergency audit — why pacred.co not in Google search results?"
**T-N2** = "Ad landing quality — every `/services/*` must: h1 with intent keyword · CTA above fold · LCP <3s on 4G · phone+LINE visible."

These directly affect revenue:
- Site invisible to Google → Ads wasted (people search "ชิปปิ้งจีน" → Pacred doesn't show)
- Bad LCP = lower Google Ads Quality Score = higher CPC = same budget reaches fewer customers
- Missing CTA above fold = visitor bounces before seeing how to buy

---

## Part 1 — T-N1: SEO Emergency Audit (3-4h)

### 1.1 Why aren't we ranking? — 6 likely causes (rank by check ease)

| # | Cause | How to check (5-min each) |
|---|---|---|
| 1 | Site not indexed by Google | `site:pacred.co` query → if zero results, site never crawled |
| 2 | `robots.txt` blocking crawlers | Visit `pacred.co/robots.txt` — should NOT have `Disallow: /` |
| 3 | `sitemap.xml` missing or broken | Visit `pacred.co/sitemap.xml` — should list all public pages |
| 4 | Missing structured data (JSON-LD) | View page source on `/` → search `application/ld+json` |
| 5 | Slow LCP / poor Core Web Vitals | PageSpeed Insights → LCP > 2.5s = ranking penalty |
| 6 | New domain (no backlinks / no authority) | DNS WHOIS — domain age < 1 year + zero referring sites = slow Google trust |
| 7 | Thai language target mismatch | Verify `<html lang="th">` + `og:locale` set to Thailand |

**Run all 7 checks in order. Most likely culprits for Pacred (new domain, just launched):** #1, #3, #6.

### 1.2 Step-by-step audit checklist

#### Step A — Google indexation status (5 min)

```
Search Google: site:pacred.co
```

- **0 results** → site never crawled. Submit to Google Search Console (next step).
- **1-5 results** → partially indexed. Check which pages are missing.
- **>20 results** → indexed but ranking poorly. Skip to PageSpeed audit (Step F).

#### Step B — Google Search Console setup (15-30 min)

If not already done:

1. Go to [search.google.com/search-console](https://search.google.com/search-console)
2. **Add property** → `pacred.co` (use Domain property — covers all subdomains)
3. Verify ownership:
   - **Option 1:** DNS TXT record (Vercel DNS) → recommended (auto-verifies in <1 min)
   - **Option 2:** HTML meta tag in `<head>` of homepage → add to `app/layout.tsx`
4. After verification:
   - **Sitemaps** tab → submit `https://pacred.co/sitemap.xml`
   - **URL Inspection** → enter homepage URL → "Request Indexing"
   - Repeat URL Inspection for top-5 service pages (`/services/import-china`, `/services/customs-clearance`, etc.)
5. Wait 24-72h → Google starts crawling

**Output:** screenshot of Search Console "Coverage" status to `docs/audit/seo-audit-2026-05-NN.md`.

#### Step C — Verify `sitemap.xml` deploys correctly (10 min)

```bash
curl -s https://pacred.co/sitemap.xml | head -30
# Expected: <?xml version="1.0"?><urlset ...><url><loc>...</loc>...</url>...
```

If sitemap is missing or broken:
- Check `app/sitemap.ts` exists and returns array of `{ url, lastModified, changeFrequency, priority }`
- Verify all 30+ public routes listed (especially `/services/[slug]` dynamic pages)
- Fix any 404s in sitemap (Google penalizes sitemaps with dead URLs)

#### Step D — Verify `robots.txt` (5 min)

```bash
curl -s https://pacred.co/robots.txt
# Expected (good):
#   User-agent: *
#   Allow: /
#   Disallow: /admin
#   Disallow: /api
#   Sitemap: https://pacred.co/sitemap.xml
```

**Red flags:**
- `Disallow: /` (blocks everything — disaster)
- `noindex` meta tag in `<head>` (also blocks)
- Missing `Sitemap:` directive

If broken, fix in `app/robots.ts` (App Router auto-generates).

#### Step E — JSON-LD structured data audit (15 min)

```bash
# Check homepage source
curl -s https://pacred.co | grep -o 'application/ld+json[^>]*>[^<]*' | head -5
```

Pacred should have JSON-LD for:
- **Organization** (Pacred company info — from `components/seo/site.ts`)
- **WebSite** (with SearchAction sitelinks)
- **LocalBusiness** (Thai business hours + address)
- **Service** per `/services/[slug]` page (with `provider` linked to Organization)

Existing component: `components/seo/json-ld.tsx`. Audit current coverage:
- Visit each public page → view source → find ld+json block
- Pages without JSON-LD: add via `<JsonLd type="..." />` in page server component

**Tools to validate:**
- [Schema.org Validator](https://validator.schema.org/) — paste URL, get errors
- [Google Rich Results Test](https://search.google.com/test/rich-results) — checks if Google can parse it

#### Step F — Core Web Vitals + Lighthouse (20-30 min per critical page)

Test these 5 critical pages (in order — they drive most traffic):

| Page | Why critical |
|---|---|
| `/` (home) | Brand search landing |
| `/services/import-china` | "นำเข้าจากจีน" keyword |
| `/services/customs-clearance` | "เคลียร์ศุลกากร" keyword |
| `/services/import-china-fcl` | "FCL จากจีน" keyword |
| `/services/customs-clearance` | secondary check (mobile) |

For each:
1. Visit [PageSpeed Insights](https://pagespeed.web.dev/)
2. Enter URL
3. Get scores: Performance / Accessibility / Best Practices / SEO
4. Note LCP / FCP / CLS / INP numbers
5. Read "Opportunities" + "Diagnostics" sections

**Target scores:**
- Performance: ≥ 80 (mobile) / ≥ 90 (desktop)
- LCP: ≤ 2.5s
- CLS: ≤ 0.1
- INP: ≤ 200ms
- SEO score: ≥ 95

Common Pacred issues (predict based on Tailwind v4 + Next 16 + image-heavy landing):
- **Large LCP image** → optimize hero images (use Next `<Image>` with `priority` prop)
- **Unused JS** → check bundle analyzer (`pnpm build` + bundle size)
- **Render-blocking CSS** → Tailwind v4 inlines critical CSS; if still flagged, check `next.config.ts`
- **No image alt text** (Accessibility) → audit `components/sections/*` for missing alt
- **Missing meta description** (SEO) → check `generateMetadata()` per page

#### Step G — Mobile usability (10 min)

Use Chrome DevTools → Device toolbar → "Pixel 7" + throttle to "Slow 3G":

For each of the 5 pages:
- Touch targets ≥ 48px tall
- No horizontal scroll
- Text readable without zooming
- LINE OA button + phone CTA visible above fold
- Forms thumbtag-friendly (large input fields, no tiny dropdowns)

### 1.3 Output: SEO Audit Report

After running steps A-G, write `docs/audit/seo-audit-2026-05-NN.md`:

```markdown
# Pacred SEO Audit — 2026-05-NN

## Executive Summary
- Indexation: X / Y pages indexed by Google
- Avg LCP (mobile, 5 critical pages): X.Xs (target ≤ 2.5s)
- Avg PageSpeed Score: XX (target ≥ 80 mobile)
- SEO score: XX (target ≥ 95)
- Critical blockers: N items

## Findings

### Indexation
- ...

### Sitemap + robots
- ...

### Core Web Vitals (per page)
| Page | LCP | FCP | CLS | INP | Perf score | SEO score |
|---|---|---|---|---|---|---|
| / | 2.1s | 1.4s | 0.05 | 120ms | 87 | 95 |
| ... | ... | ... | ... | ... | ... | ... |

### Structured Data
- ...

### Issues Found (P0 / P1 / P2)
P0:
- [page] [issue] → [fix]
P1:
- ...
P2:
- ...

## Recommendations + Sprint Plan
- ...
```

Commit + push to dave: `git commit -m "docs(audit): SEO audit 2026-05-NN — ปอน"`.

---

## Part 2 — T-N2: Ad Landing Quality (per critical service page) (3-4h total)

### 2.1 Target acceptance per landing page

Every `/services/*` page MUST hit:

| Criterion | Target | Why |
|---|---|---|
| **H1 with intent keyword** | "นำเข้าสินค้าจากจีน FCL" (not just "Pacred") | Google ranks for keyword match |
| **CTA above fold** | "ติดต่อทีม" / LINE button visible without scroll | Conversion rate — 60% of leads don't scroll |
| **LCP ≤ 3s on 4G** | Lighthouse mobile LCP ≤ 3s | Google Ads Quality Score gate |
| **Phone + LINE visible** | `<a href="tel:..">` + LINE button in hero | Trust + immediate-action options |
| **Trust signals** | Reviews carousel · "X ลูกค้า / Y ออเดอร์" stats | Social proof |
| **Mobile-first** | Touch targets ≥ 48px · readable at 16px · no horizontal scroll | 70%+ Pacred traffic mobile |

### 2.2 Per-page audit checklist (top 5 pages × ~30min each)

For each of these 5 pages, run through this checklist:

**Page 1: `/` (home)**
- [ ] H1 reads: "ขนส่งคาร์โก้มาตรฐาน" or similar — does it contain "ชิปปิ้ง / นำเข้า / ส่งออก"?
- [ ] Above-fold CTA: visible without scroll on 360x640 viewport?
- [ ] Hero image: optimized? `priority` prop set?
- [ ] LCP: PageSpeed mobile run
- [ ] Phone + LINE OA links: present + clickable
- [ ] Stats card: customer count / order count / rate visible

**Page 2: `/services/import-china`**
- [ ] H1: "นำเข้าสินค้าจากจีน [type]" (rate cards or FCL/LCL/Cargo)
- [ ] Above-fold CTA: contact form / LINE
- [ ] Service tabs (รถ/เรือ/แอร์) — quick navigation
- [ ] Rate card visible
- [ ] Trust badges (PACRED 14 ปี / ลูกค้า 10,600 คน)

**Page 3: `/services/import-china-fcl`** + **Page 4: `/services/import-china-lcl`**
- [ ] H1: "FCL ปิดตู้/เหมาตู้" or "LCL แชร์ตู้/รวมตู้"
- [ ] Diagram or visual explainer
- [ ] CTA: "คำนวณราคา" / "เริ่มสั่งซื้อ"

**Page 5: `/services/customs-clearance`** (high-volume + recently polished)
- [ ] H1: "เคลียร์สินค้าติดด่านศุลกากร"
- [ ] "1 ชม. เคลียร์ออกเร็ว" stamp visible
- [ ] Phone + LINE OA in hero
- [ ] Breadcrumb shows depth

### 2.3 Fix priorities (work order)

After auditing all 5 pages, group fixes by impact:

**🔴 P0 — Quality Score blockers (fix this week):**
- LCP > 3s on any of top 5 pages → optimize hero image / reduce JS bundle
- Missing H1 with keyword → rename + add to metadata
- Missing CTA above fold → reorder hero section

**🟡 P1 — Conversion (fix this sprint):**
- Trust signals missing or hidden
- Mobile touch targets too small
- Slow form load (PromptPay QR / contact form lazy load)

**🟢 P2 — Polish (post-launch):**
- A/B test hero copy variants (per ADR-0007 cookie A/B)
- Add review carousel with real customer quotes
- Optimize images to AVIF/WebP via Next Image

### 2.4 Output: per-page quality cards

For each of 5 pages, write a 1-pager: `docs/audit/landing-quality-{page}-2026-05-NN.md`:

```markdown
# Landing Quality Audit — /services/import-china — 2026-05-NN

## Lighthouse scores (mobile)
- Performance: 78 (target 80)
- LCP: 3.1s (target ≤ 3.0s)
- SEO: 92

## Checklist
- ✅ H1 with keyword: "นำเข้าสินค้าจากจีน FCL/LCL ครบวงจร"
- 🟡 CTA above fold: LINE button visible but small on 360w
- ❌ Mobile: phone link missing in hero
- ...

## Action items
1. P0: [item]
2. P1: [item]
3. P2: [item]
```

---

## Part 3 — Coordinated launch (T-N1 + T-N2 + GTM)

Both audits feed into the **Google Ads quality score** which controls cost per click. The combined effect:

- **T-N1 indexation fixed** → Pacred appears in organic search
- **T-N2 LCP < 3s + CTA above fold** → Quality Score 7+/10 → CPC drops 30-50%
- **K-12 GTM live** (ก๊อต task) → conversion tracking → optimization data flows
- **K-13 Microsoft Clarity** (ก๊อต task) → heatmaps reveal actual user behavior

**Order of operations:**
1. ก๊อต K-12 + K-13 signups → activates analytics
2. ปอน T-N1 audit → fix critical SEO blockers
3. ปอน T-N2 audit → fix critical landing quality issues
4. Wait 7-14 days for Google to re-crawl + score
5. Re-run audits → measure improvement

---

## Part 4 — Tools + references

### Free + paid tools to install (or bookmark)

| Tool | Free/Paid | Purpose |
|---|---|---|
| [Google Search Console](https://search.google.com/search-console) | Free | Indexation + search queries |
| [PageSpeed Insights](https://pagespeed.web.dev/) | Free | Core Web Vitals per page |
| [Schema.org Validator](https://validator.schema.org/) | Free | JSON-LD validation |
| [Google Rich Results Test](https://search.google.com/test/rich-results) | Free | Google-specific JSON-LD test |
| [Ahrefs Free Tools](https://ahrefs.com/free-seo-tools) | Free | Backlink + keyword research basic |
| [Ubersuggest](https://neilpatel.com/ubersuggest/) | Free / $29/mo | Keyword research + competitor analysis |
| [GTmetrix](https://gtmetrix.com/) | Free / $14/mo | Alternative to PageSpeed Insights |
| [Screaming Frog](https://www.screamingfrog.co.uk/seo-spider/) | Free ≤500 pages / £149/yr | Full-site crawl + audit |
| [Microsoft Clarity](https://clarity.microsoft.com/) | Free forever | Heatmaps + session recordings (ก๊อต K-13 will activate) |

### Pacred-specific resources

- **Existing SEO components:** `components/seo/json-ld.tsx`, `components/seo/site.ts` (CONTACT, LINE_OA constants)
- **Sitemap source:** `app/sitemap.ts`
- **Robots source:** `app/robots.ts`
- **Meta + OG tags:** per-page `generateMetadata()` in `app/[locale]/(public)/**/page.tsx`
- **Analytics:** [`lib/analytics.ts`](../../lib/analytics.ts) (GTM events) + [`lib/experiments.ts`](../../lib/experiments.ts) (cookie A/B)
- **Current ADR-0007 analytics decision:** [`docs/decisions/0007-analytics-and-ab-testing.md`](../decisions/0007-analytics-and-ab-testing.md)
- **L-22 GTM events list:** Search "trackSignUp / trackContactClick / trackQuoteRequest / etc." in `lib/analytics.ts`

### Thai SEO domain expertise

- Pacred customers Google in **Thai**, so keyword research must use Thai keywords (not English)
- Top intent keywords (rough estimate):
  - "ชิปปิ้งจีน" (~50k searches/mo)
  - "นำเข้าจากจีน" (~30k/mo)
  - "ฝากสั่งซื้อจีน" (~20k/mo)
  - "เคลียร์ศุลกากร" (~15k/mo)
  - "FCL จากจีน" / "LCL จากจีน" (~5-10k/mo each)
- Use [Google Trends Thailand](https://trends.google.com/trends/?geo=TH) to validate

---

## Part 5 — Open questions for ปอน

1. **Tool budget** — ok with free tools only, or budget for Ahrefs / Ubersuggest paid? Recommend free Pro until volume justifies.
2. **Lighthouse target** — confirm Performance ≥ 80 mobile / ≥ 90 desktop?
3. **Re-audit cadence** — monthly? After each major content push?
4. **Competitor list** — which 3-5 Thai cargo competitors to benchmark against? (For backlink + ranking comparison.)
5. **JSON-LD priority** — should ปอน push JSON-LD coverage to ALL public pages, or focus on the 5 critical pages first?

---

## Part 6 — Acceptance — T-N1 + T-N2 done when

T-N1 SEO audit:
- [ ] Google Search Console verified + sitemap submitted
- [ ] All 7 SEO health checks (steps A-G) executed + documented
- [ ] `docs/audit/seo-audit-2026-05-NN.md` committed with findings
- [ ] At least 1 P0 issue fixed + Google re-indexed (proven via Search Console)

T-N2 Ad landing quality:
- [ ] All 5 critical pages audited via Lighthouse
- [ ] Per-page 1-pagers committed (`docs/audit/landing-quality-*.md`)
- [ ] All P0 issues (LCP > 3s / missing H1 / missing CTA) fixed
- [ ] PageSpeed mobile score ≥ 80 across 5 pages
- [ ] Mobile usability confirmed via DevTools throttle

**Combined acceptance:** Google Ads Quality Score ≥ 7/10 on top campaigns within 14 days post-fix-cycle. (Verify via Google Ads dashboard once K-12 GTM is live.)

---

## Part 7 — Cross-references

- ปอน brief → [`docs/briefs/podeng.md`](podeng.md)
- ก๊อต K-12 + K-13 (analytics setup — prerequisite for measurement) → [`docs/briefs/got.md`](got.md)
- Existing analytics infrastructure → [ADR-0007](../decisions/0007-analytics-and-ab-testing.md)
- L-22 GTM events → `lib/analytics.ts`
- L-23 Clarity → `components/analytics/clarity-script.tsx`
- Site constants (CONTACT, LINE_OA, SOCIAL) → `components/seo/site.ts`
- Existing SEO components → `components/seo/json-ld.tsx`
- Pacred customer pain themes (chat audit) → [`docs/audit/chat-analysis-2026-05-16.md`](../audit/chat-analysis-2026-05-16.md) §"Customer pain themes"

**End of T-N1 + T-N2 playbook.** ปอน: run through Part 1 + 2 in order; commit findings; report back to เดฟ + ก๊อต when P0 fixes deployed.
