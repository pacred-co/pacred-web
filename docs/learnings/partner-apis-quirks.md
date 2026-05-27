# Learnings — partner API quirks

Topics: MOMO JMF (TH warehouse partner) · TAM (china-search interim) · ThaiBulkSMS (OTP) · LINE Messaging API + LIFF · PromptPay · DBD juristic lookup · RCGroup-TH.

> Append-only. Newest entry on top. Each entry: date · symptom · root cause · what to do.

---

## 2026-05-27 · TAMIT-cloud product-detail endpoint bumped `/api-product` → `/api-product-2026`

**Symptom:** `/admin/service-orders/cart/add` link-paste search (and the customer `/service-order/add` URL tab) silently degraded to `buildDemoDetail()` — no product card with image/title/price ever appeared, the user saw a generic "สินค้าจาก TAOBAO (รหัส ...)" placeholder. The `PACRED_TAMIT_DETAIL_URL=https://tamit-cloud.com/api-product` env var (and the matching default in `lib/china-search/index.ts`) was returning **404** from every `GET .../get/{1688|taobao}/?id=<id>`.

**Root cause:** Upstream rotated the API path to `/api-product-2026` (with the `-2026` suffix). The old `/api-product` namespace was retired. Our env value + library default were both still on the dead path because the rename happened upstream sometime in 2026 after we last verified.

**Confirmation against legacy PHP:** The authoritative file is `pcs-admin/include/functions.php` — lines 100 / 174 / 191 all use `https://tamit-cloud.com/api-product-2026/get/{1688|taobao}/?id=...`. The older `pcs-admin/search.php` still references the dead `/api-product` path because it predates the upstream rename. **Rule:** when a TAMIT call returns 404, always check `include/functions.php` first — it's the file the team keeps current.

**Fix:**
```env
# .env.local
PACRED_TAMIT_DETAIL_URL=https://tamit-cloud.com/api-product-2026   # was /api-product
```
And in `lib/china-search/index.ts`:
```ts
const DEFAULT_TAMIT_DETAIL_URL = "https://tamit-cloud.com/api-product-2026";
```

**Verified working responses** (after the bump):
- `GET /api-product-2026/get/1688/?id=808456582517` → `200 · {status:200, data:{id, title, mainImage, sku[], skuMap[], priceRanges, ...}}`
- `GET /api-product-2026/get/taobao/?id=<id>` → may return `{status:204, ...}` for items not yet in cache. Our `convertProductUrlDetail` already handles status≠200 by falling through to `buildDemoDetail()` — no further change needed; the customer can fill price + qty manually as the legacy posture intended.

**The OTHER TAMIT host is fine:** `https://tam-i-t.com/api/convert-link-china/...` (the short-URL cache for `m.tb.cn` / `qr.1688.com`) was NOT bumped — `PACRED_TAMIT_CACHE_URL` value is still correct. Only the product-detail host (`tamit-cloud.com`) had the path change.

**Why this matters next time:** The TAMIT vendor (พี่แต้ม IT) bumps endpoints between versions without giving us a deprecation notice. If a TAMIT-backed flow degrades to demo mode and you can't reproduce a 200, **probe both legacy paths** (`api-product` vs `api-product-2026`) before assuming the host is dead. The host `tamit-cloud.com` is live — only the path moved.

**Diagnostic one-liner to re-check next time:**
```bash
# Expect HTTP 200 + a `status:200` JSON payload
curl -sI 'https://tamit-cloud.com/api-product-2026/get/1688/?id=808456582517' | head -1
curl -s   'https://tamit-cloud.com/api-product-2026/get/1688/?id=808456582517' | head -c 200
# If 404 → vendor bumped the path again. Grep `pcs-admin/include/functions.php` for the new one.
```

**Why this matters for the immortal scholar:** I spent ~45 min trying alternate URL variants (`tam-i-t.com/api-product`, scraping Taobao directly, hunting through dave-pacred for a different integration) before grepping the legacy PHP for "tam-i-t\|tamit" and discovering the `-2026` suffix in `include/functions.php`. **Next agent that hits this:** grep legacy PHP FIRST, before any probing.

**Cross-links:**
- `.env.local` line 59 — `PACRED_TAMIT_DETAIL_URL=https://tamit-cloud.com/api-product-2026`
- [`lib/china-search/index.ts`](../../lib/china-search/index.ts) — `DEFAULT_TAMIT_DETAIL_URL` + the `convertProductUrlDetail` flow
- Legacy authoritative file: `D:/REALSHITDATAPCS/pcsc/public_html/member/pcs-admin/include/functions.php` lines 100 / 174 / 191
- [`docs/audit/php-pcscargo-integrations.md`](../audit/php-pcscargo-integrations.md) §3a — the audit that originally wired this
- ภูม's quote that pointed me at the right answer (2026-05-27): *"แกมีไฟล์ทั้งหมดแล้วนะเว้ย ... ลองไปอ่านดูก่อน"* — the working files were already in our repo + on the Poom branch; the env var was the only thing stale

---

## 2026-05-17 · DBD juristic-person lookup — both API paths dead/blocked

**Symptom:** Juristic registration's "auto-fill company name + address from tax ID" doesn't populate. T-D1 smoke gate found `/api/dbd/[taxId]` returns 502.

**Root cause — two separate DBD failures:**

1. **`opendata.dbd.go.th/api/v1/*` (used by the register page client-side)** — DBD **retired the entire `api/v1/` namespace**. `api/v1/nameAndAddress` + `api/v1/juristicNameAll` now return **404** for every request. From a browser they fail as `TypeError: Failed to fetch` (no CORS headers on the dead endpoint).

2. **`opendata.dbd.go.th/api/3/action/datastore_search` (CKAN — used by the `/api/dbd/[taxId]` server route)** — the CKAN base is *up* (a bare `?resource_id=...&limit=1` returns 200), but adding a `filters={...}` query param with the Thai field name (`เลขที่ประจำตัวเสียภาษีอากร`) trips an **Incapsula (Imperva) WAF**. The response is HTTP 200 with an HTML `"Request Rejected"` body (`_Incapsula_Resource` script). Our route does `res.json()` on the HTML → throws → catch → returns 502. The WAF will block Vercel's server IPs in production too.

**Net:** server-side DBD juristic lookup is **not reliably possible** right now. `api/v1` is gone; CKAN is WAF-walled against programmatic calls.

**What to do:**
- **Register flow already degrades gracefully** — juristic customers fill company name/address **manually**. Registration completes. Not a launch blocker.
- `app/[locale]/(auth)/register/page.tsx::fetchCompany` — any non-OK / thrown fetch → `sawApiError = true` → shows the honest **"⚠️ ระบบค้นหาข้อมูลบริษัทไม่พร้อมใช้งาน กรุณากรอกด้วยตนเอง"** (`unavailable`) state, NOT the misleading "❌ ไม่พบข้อมูล" (`notfound`, which implies the tax ID is invalid). Fixed 2026-05-17 — `notfound` is now reserved for a genuine 200-with-empty-record.
- **`app/api/dbd/[taxId]/route.ts` is orphan code** — grep found ZERO consumers (the register page calls DBD client-side directly, not via this route). It's also WAF-blocked. Flag for post-launch cleanup (delete the route, or rebuild it against a working data source).
- **Post-launch:** if DBD auto-fill is worth restoring — options: (a) a paid TH juristic-data provider, (b) a headless-browser proxy that solves the Incapsula JS challenge (fragile), (c) check whether DBD published a new official API namespace. Track as a V2.1 nice-to-have, not revenue-critical.

**Test command to re-check DBD status later:**
```bash
# 404 = api/v1 still retired
curl -s -o /dev/null -w "%{http_code}\n" "https://opendata.dbd.go.th/api/v1/nameAndAddress?JuristicID=0105564077716"
# body containing _Incapsula = CKAN still WAF-blocked for programmatic calls
curl -s "https://opendata.dbd.go.th/api/3/action/datastore_search?resource_id=f092da60-5f9a-4ef4-813c-0b1395778a76&limit=1" | head -c 200
```

---
