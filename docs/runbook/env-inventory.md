# 🔐 ENV inventory — Vercel prod ↔ .env.local reconciliation

**Recorded:** 2026-06-01 (เดฟ · via Vercel API token, owner-provided) · **NO secret VALUES in this file**
(values live only in `.env.local` (gitignored) + Vercel). This is the cross-machine review artifact
the owner asked for ("จดไฟล์ env ทั้งหมด … tag ไฟล์ให้เราดู").

**Counts:** Vercel prod = **43** · `.env.local` (pre-session) = **32** · in both = **19**.

---

## ✅ Done to `.env.local` this session (this machine · gitignored)
Appended a tagged `📋 ENV INVENTORY` section:
- **[V-pulled] 9 non-sensitive** Vercel-only vars pulled in with real values:
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY · NEXT_SERVER_ACTIONS_ENCRYPTION_KEY · POSTGRES_DATABASE ·
  POSTGRES_HOST · POSTGRES_USER · SUPABASE_ANON_KEY · SUPABASE_PUBLISHABLE_KEY · SUPABASE_URL · THAIBULKSMS_FORCE`
- **[V-sensitive] 15** Vercel-only vars recorded as **commented placeholders** (Vercel API never returns
  `sensitive`-type values — fill from Vercel UI / password manager if a fresh machine needs them):
  `HCAPTCHA_SECRET_KEY · NEXT_PUBLIC_CLARITY_ID · NEXT_PUBLIC_GTM_ID · NEXT_PUBLIC_HCAPTCHA_SITE_KEY ·
  POSTGRES_PASSWORD · POSTGRES_PRISMA_URL · POSTGRES_URL · POSTGRES_URL_NON_POOLING · PROMPTPAY_ID ·
  SENTRY_DSN · SMS_LOW_THRESHOLD · SUPABASE_JWT_SECRET · SUPABASE_SECRET_KEY · UPSTASH_REDIS_REST_TOKEN ·
  UPSTASH_REDIS_REST_URL`

> ⚠️ **`.env.local` is gitignored → does NOT follow to the work computer.** On a fresh machine the owner
> pastes `.env.local`; the [V-sensitive] values must come from Vercel UI / password manager.

---

## 🔴 PROD GAP analysis — 13 vars in `.env.local` but NOT in Vercel prod

Classified by whether the code reads them at **runtime** (→ real prod gap) or only in **`scripts/`** (dev-only):

| var | runtime use | verdict |
|---|---|---|
| `NEXT_PUBLIC_YUAN_RATE` | `actions/payment.ts` | 🟠 **HELD for owner** — price-sensitive + `NEXT_PUBLIC` (build-time). Confirm the correct prod rate before adding (wrong value = wrong customer prices). |
| `PACRED_LAONET_API_URL` | `lib/china-search/laonet.ts` | ✅ **ADDED to Vercel prod** (reverse-image search) |
| `PACRED_LAONET_KEY` | `lib/china-search/laonet.ts` | ✅ **ADDED** |
| `PACRED_AKUCARGO_API_URL` | `lib/china-search/akucargo.ts` | ✅ **ADDED** (china product search) |
| `PACRED_TAMIT_CACHE_URL` | `lib/china-search/short-url-cache.ts` | ✅ **ADDED** (TAMIT tracking) |
| `PACRED_TAMIT_DETAIL_URL` | `lib/china-search/index.ts` | ✅ **ADDED** |
| `MOMO_TOKEN` | none (wrong name) | ✅ **RESOLVED** — code reads `MOMO_API_TOKEN` (not `MOMO_TOKEN`). Owner provided real creds 2026-06-01 → **set in Vercel prod + local**: `MOMO_API_BASE_URL=https://api.momocargo.com:8080` · `MOMO_API_TOKEN` (JWT) · `MOMO_CARGO_SACK_TOKEN` (same JWT). Live-tested: import/track + container/closed + sack/info all `auth:true` (sack `CBX251111-EK04` returned full data). Cron `/api/cron/momo-sync` (every 10min, vercel.json) + admin api-forwarder-momo pages now work. The old misnamed `MOMO_TOKEN` in local is dead (unread) — left as a harmless note. |
| `SUPABASE_S3_ACCESS_KEY_ID` | scripts only | ⚪ not a gap (one-time image-upload migration; runtime reads storage via supabase client) |
| `SUPABASE_S3_SECRET_ACCESS_KEY` | scripts only | ⚪ not a gap |
| `SUPABASE_S3_ENDPOINT` | scripts only | ⚪ not a gap |
| `SUPABASE_S3_REGION` | scripts only | ⚪ not a gap |
| `SUPABASE_DB_PASSWORD` | scripts only (migrations) | ⚪ not a gap |
| `LINE_WEBHOOK_URL` | none (push is direct) | ⚪ not a gap (ปอน's Worker URL; prod app doesn't need it) |

**Action taken:** added the 5 ✅ china-search vendor vars to Vercel prod (Production target, type `encrypted`)
— they were missing, so **reverse-image search / china product search / TAMIT tracking were broken in prod**.
Take effect on next redeploy.

**Resolved since:**
1. `NEXT_PUBLIC_YUAN_RATE` — ✅ NOT needed. The daily yuan rate is set in admin at `/admin/settings/legacy-rates` → legacy `tb_settings` (rpdefault 4.93 / rsdefault 4.97 / hratecostdefault 4.84), read by `payment.ts` + `/cart`. The env var is only a logged-warn fallback. The dead-write `settings.yuan_rate` field on `/admin/settings` was removed.
2. `MOMO_API_TOKEN` (+ `MOMO_API_BASE_URL` + `MOMO_CARGO_SACK_TOKEN`) — ✅ set in Vercel prod + local 2026-06-01 (owner creds, live-tested). MOMO cron + sync now functional.

---

## 📋 Full key list (43 Vercel prod · type · target)
`sensitive` = value not API-returnable · `encrypted`/`plain` = returnable to an authorized token.

CRON_SECRET(enc,prod+prev) · HCAPTCHA_SECRET_KEY(sens) · LINE_CHANNEL_ACCESS_TOKEN(sens) ·
LINE_CHANNEL_ID(sens) · LINE_CHANNEL_SECRET(sens) · LINE_LOGIN_CLIENT_ID(sens) · LINE_LOGIN_CLIENT_SECRET(sens) ·
LINE_PUSH_BYPASS(enc) · LINE_STAFF_GROUP_ID(enc,prev+prod) · NEXT_PUBLIC_CLARITY_ID(sens) · NEXT_PUBLIC_GTM_ID(sens) ·
NEXT_PUBLIC_HCAPTCHA_SITE_KEY(sens) · NEXT_PUBLIC_SITE_URL(enc) · NEXT_PUBLIC_SUPABASE_ANON_KEY(sens) ·
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY(enc) · NEXT_PUBLIC_SUPABASE_URL(sens) · NEXT_SERVER_ACTIONS_ENCRYPTION_KEY(enc,prod+prev) ·
OTP_BYPASS(enc) · OTP_PEPPER(enc) · POSTGRES_DATABASE/HOST/USER(enc) · POSTGRES_PASSWORD/PRISMA_URL/URL/URL_NON_POOLING(sens) ·
PROMPTPAY_ID(sens) · SENTRY_DSN(sens) · SMS_LOW_THRESHOLD(sens) · SMS_PROVIDER(enc) · SUPABASE_ANON_KEY(enc) ·
SUPABASE_JWT_SECRET(sens) · SUPABASE_PUBLISHABLE_KEY(enc) · SUPABASE_SECRET_KEY(sens) · SUPABASE_SERVICE_ROLE_KEY(sens) ·
SUPABASE_URL(enc) · THAIBULKSMS_API_KEY/API_SECRET(sens) · THAIBULKSMS_FORCE(enc,prev+prod) · THAIBULKSMS_SENDER(enc) ·
UPSTASH_REDIS_REST_TOKEN/URL(sens)

**+ 5 added this session:** PACRED_LAONET_API_URL · PACRED_LAONET_KEY · PACRED_AKUCARGO_API_URL ·
PACRED_TAMIT_CACHE_URL · PACRED_TAMIT_DETAIL_URL (all encrypted, production).

> **OTP_BYPASS / OTP_PEPPER — NOT touched** (owner: ห้ามแตะ OTP จนคอนเฟิมเด็ดขาด).
> CF + Vercel API tokens = owner-provided this session · stored machine-local (`/tmp/.cf-tok`, `/tmp/.vc-tok`) ·
> never committed · owner can revoke anytime.

## 2026-06-02 — Facebook/IG integration (PENDING · owner provides → เดฟ scaffolds webhook)
8 env to add — full guide: [`docs/setup/facebook-integration-guide-2026-06-02.md`](../setup/facebook-integration-guide-2026-06-02.md) §A:
`FACEBOOK_APP_ID`=27209891118650099 (known) · `FACEBOOK_APP_SECRET`(sens · webhook sig) · `FACEBOOK_PAGE_ACCESS_TOKEN`(sens · System User = never-expire) · `FACEBOOK_PAGE_ID`=100690994769905 · `INSTAGRAM_ACCOUNT_ID` · `FACEBOOK_WEBHOOK_VERIFY_TOKEN`(self-set) · `FACEBOOK_CAPI_TOKEN`(optional) · **`NEXT_PUBLIC_FB_PIXEL_ID`** = a REAL Events-Manager Dataset id (⚠️ code now fires the App ID `27209891118650099` which is NOT a pixel → Events Manager empty → ads untracked; this fixes it).

> **2026-06-02 admin provisioning** created 15 staff auth.users (pw `123456`) — NOT an env change. 5 staff phones collide with empty customer accounts → those admins are **email-only login** until reconciled (RESUME-machine-move-2026-06-02 §3.2).
