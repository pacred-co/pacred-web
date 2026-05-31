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
| `MOMO_TOKEN` | none found in app/actions/lib | 🟡 **HELD** — grep found no runtime read (MOMO cron may use a different name/mechanism · ภูม lane). Verify before adding. |
| `SUPABASE_S3_ACCESS_KEY_ID` | scripts only | ⚪ not a gap (one-time image-upload migration; runtime reads storage via supabase client) |
| `SUPABASE_S3_SECRET_ACCESS_KEY` | scripts only | ⚪ not a gap |
| `SUPABASE_S3_ENDPOINT` | scripts only | ⚪ not a gap |
| `SUPABASE_S3_REGION` | scripts only | ⚪ not a gap |
| `SUPABASE_DB_PASSWORD` | scripts only (migrations) | ⚪ not a gap |
| `LINE_WEBHOOK_URL` | none (push is direct) | ⚪ not a gap (ปอน's Worker URL; prod app doesn't need it) |

**Action taken:** added the 5 ✅ china-search vendor vars to Vercel prod (Production target, type `encrypted`)
— they were missing, so **reverse-image search / china product search / TAMIT tracking were broken in prod**.
Take effect on next redeploy.

**Owner to confirm (2 held):**
1. `NEXT_PUBLIC_YUAN_RATE` — what's the correct prod value? (then add + rebuild; `NEXT_PUBLIC` needs a build)
2. `MOMO_TOKEN` — is it used in prod? (grep found no runtime reader — verify with ภูม)

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
