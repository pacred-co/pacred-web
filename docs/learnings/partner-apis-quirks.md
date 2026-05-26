# Learnings — partner API quirks

Topics: MOMO JMF (TH warehouse partner) · TAM (china-search interim) · ThaiBulkSMS (OTP) · LINE Messaging API + LIFF · PromptPay · DBD juristic lookup · RCGroup-TH · LINE Notify (EOL Mar 2025).

> Append-only. Newest entry on top. Each entry: date · symptom · root cause · what to do.

---

## 2026-05-26 · LINE Notify dead since 2025-03-31 — `notify-bot.line.me` is end-of-life

**Symptom:** Spawned a parallel agent to "port LINE Notify per-user OAuth" per the d1-deep-audit Gap #3. Agent built the UI page + callback route + actions. All gates green. **Then a screenshot from `notify-bot.line.me` showed "End of service for LINE Notify"** — the service ended March 31, 2025. The whole feature was built on top of a dead API. Reverted as commit `2e099721`.

**Root cause — TWO compounding failures:**

1. **The brief mentioned EOL but framed it as a question:** the role brief literally said *"LINE Notify EOL April 2025 — port per-user OAuth OR migrate to LINE Messaging API model?"*. The agent (and I, as integrator) scoped the work as "port" without verifying the OAuth endpoint was still alive. Treating "EOL by X" as a routine question rather than a hard gate cost a full agent run + integration cycle + a revert commit.

2. **No upstream alive-check before building integration code.** Pacred's other partner-API learnings (DBD, CKAN, MOMO JMF) all begin with a curl test or a manual probe. LINE Notify wasn't tested before the agent started — the OAuth flow was inferred from the legacy PHP source, which is from before the EOL announcement.

**What to do — for any external-API integration, run a 30-second alive-check FIRST:**

```bash
# Smoke the OAuth-issuance endpoint
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://notify-bot.line.me/oauth/authorize?scope=notify"
# Expected: 200/302 from a live service.
# Got 410 / a "service ended" HTML page → DEAD. Don't build.
```

If the brief contains any of these phrases, treat them as **hard gates** until the upstream is verified alive:
- "EOL by &lt;date&gt;"
- "deprecated"
- "sunset"
- "no longer supported"
- "we are regrettably discontinuing"

**Replacement path (LIFF + Messaging API):**
LINE itself directs developers to its **Messaging API** with a LINE Login channel + LIFF. Pacred already has both:
- Messaging API channel `2009931373` (`@pacred` OA)
- LINE Login channel `2010105778` + LIFF ID `2010105778-SaSkkGza`
- `profiles.line_user_id` + `line_linked_at` columns ready (migration `0003_profiles_extended.sql`)
- Unique index on `line_user_id` already in place
- `LINE_PUSH_BYPASS=true` env flag for dev safety

The replacement flow:
1. Customer adds Pacred LINE OA as friend (QR / `https://lin.ee/Yg3fU0I`)
2. Customer authenticates via LIFF — `/liff/link` page captures their `line_user_id`
3. Pacred sends notifications via `Messaging API pushMessage(to=line_user_id, ...)`

The Track 3 page + form code was a UI shell that could be adapted, but reverting was cleaner than salvaging — the OAuth half is fundamentally different.

**Cleanup left for the L pickup (next session):**
- `lib/notifications/line-notify.ts` — still talks to `notify-bot.line.me` (dead). Replace with `messaging-api.ts` or repurpose for Messaging API pushMessage.
- `app/api/linenotify/callback/route.ts` — leftover from earlier work, also dead. Delete or replace with `/liff/link` flow.
- Build `/liff/link` page that uses the LINE LIFF SDK.

**Cross-links:**
- Revert commit `2e099721` — Track 3 backed out
- Original Track 3 commit `350bf9be` — the dead-API integration (now reverted)
- [`docs/env.md`](../env.md) §7 — LIFF + Messaging API credentials already set
- [Migration `0003_profiles_extended.sql`](../../supabase/migrations/0003_profiles_extended.sql) — `line_user_id` column ready

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
