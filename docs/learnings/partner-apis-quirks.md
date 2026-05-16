# Learnings — partner API quirks

Topics: MOMO JMF (TH warehouse partner) · TAM (china-search interim) · ThaiBulkSMS (OTP) · LINE Messaging API + LIFF · PromptPay · DBD juristic lookup · RCGroup-TH.

> Append-only. Newest entry on top. Each entry: date · symptom · root cause · what to do.

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
