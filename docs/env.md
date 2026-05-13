# 🔐 Pacred — Environment Variables Catalog

> **CANONICAL** — single source of truth for every env var Pacred reads.
> Template file: [`/.env.example`](/.env.example) · Copy to `.env.local` (gitignored)

Last updated: 2026-05-13 · See also: [`team.md`](team.md) · [`PORT_PLAN.md`](PORT_PLAN.md) Part N4

---

## Severity legend

- 🟢 **Required for app to boot** — without these, Pacred crashes
- 🟡 **Required for production** — silently degrades (demo/bypass mode) without these
- ⚪ **Optional / future** — not blocking

---

## 1. Supabase 🟢

| Var | Where | Why |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL | All DB/auth/storage calls |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page → anon/public key | Client-side queries (RLS enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → service_role key | **Server-only**, RLS-bypass for admin operations |

**Critical:** `SUPABASE_SERVICE_ROLE_KEY` must never end up in client bundle. Only used inside `lib/supabase/admin.ts` (`createAdminClient()` is `import "server-only"`).

---

## 2. Site URL 🟢

| Var | Dev | Prod |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | `https://pacred.co` |

Used by: OAuth callbacks (Supabase needs absolute URL), notification deep-links (Resend email body), schema.org structured data.

---

## 3. OTP (phone verification) 🟢

| Var | Dev | Prod |
|---|---|---|
| `OTP_BYPASS` | `true` (skip SMS, accept any code) | **`false`** |
| `OTP_PEPPER` | random 32-char | random 32-char (different per env) |

⚠️ **Production blocker:** `OTP_BYPASS=true` ใน production = ใครก็สมัครได้ ไม่ verify เบอร์ — ทำให้ลูกค้าปลอมเข้าระบบ

---

## 4. SMS Gateway — ThaiBulkSMS 🟡 (required if `OTP_BYPASS=false`)

| Var | Where | Notes |
|---|---|---|
| `SMS_PROVIDER` | `thaibulksms` (fixed for now) | Other providers TBD |
| `THAIBULKSMS_API_KEY` | thaibulksms.com Dashboard → API | Server-only |
| `THAIBULKSMS_API_SECRET` | Same | Server-only |
| `THAIBULKSMS_SENDER` | `Pacred` (default) | Sender name shown in SMS |

**Code:** `lib/sms/gateway.ts`. If `OTP_BYPASS=true` (dev), SMS not actually sent — logged to console.

---

## 5. China Product Search 🟡

| Var | Value | Powers |
|---|---|---|
| `PACRED_RCGROUP_API_URL` | `https://rcgroup-th.com/api-china/api-search` (legacy — verify alive) | `/service-order/add` URL-paste converter + image search |
| `PACRED_TAMIT_API_URL` | `https://tamit-cloud.com/api-product/api-search` (legacy — verify alive) | `/service-order/add` keyword search |

⚠️ **Degraded mode:** ไม่ตั้ง = URL paste returns demo product (price ¥0, "Taobao Shop") — ลูกค้าสับสน ไม่รู้ว่า API broken

**Code:** `lib/china-search/index.ts`. Legacy PHP `member/include/pages/search/dataAPI.php` ใช้ endpoint เดียวกัน — verify pattern (current code expects `?q=` but legacy uses `?id=`).

---

## 6. PromptPay 🟡

| Var | Value | Powers |
|---|---|---|
| `PROMPTPAY_ID` | Pacred company phone (10 digit) OR tax-ID (13 digit), no dashes | `/wallet/deposit` QR generation |

⚠️ ไม่ตั้ง = wallet deposit form throw error ตอน generate QR (hard fail, not silent)

**Code:** `lib/promptpay.ts` line 21-25.

---

## 7. LINE Messaging API (push notifications) 🟡

| Var | Value | Powers |
|---|---|---|
| `LINE_PUSH_BYPASS` | `true` (dev, default) / `false` (prod) | If true, push skipped — only console.log |
| `LINE_CHANNEL_ACCESS_TOKEN` | https://developers.line.biz → Pacred OA → Messaging API → Channel access token | Push to LINE users who linked account |

⚠️ **Default is bypass=true** (safe for dev). Production needs `LINE_PUSH_BYPASS=false` + valid token.

LINE Notify EOL April 2025 — ADR-0001 documents migration to LINE Messaging API push + email fallback.

**Code:** `lib/notifications/index.ts:24,100`.

---

## 8. Email Fallback — Resend 🟡

| Var | Value | Powers |
|---|---|---|
| `RESEND_API_KEY` | `re_xxx` from resend.com | Email when LINE push fails or user prefers email |
| `RESEND_FROM` | `Pacred <noreply@pacred.co>` | Email "from" header (must match verified domain) |

**Code:** `lib/notifications/index.ts:133-157`.

---

## 9. Cron Security 🟡

| Var | Value |
|---|---|
| `CRON_SECRET` | random hex (`openssl rand -hex 32`) |

Vercel cron sends `x-vercel-cron` header; app verifies + checks `Authorization: Bearer ${CRON_SECRET}` if set.

⚠️ ไม่ตั้ง = `/api/cron/auto-cancel-orders` endpoint unprotected (malicious actor can trigger auto-cancel manually)

---

## 10. Yuan Rate Fallback ⚪

| Var | Default |
|---|---|
| `NEXT_PUBLIC_YUAN_RATE` | `5.00` |

Hardcoded fallback if `settings.yuan_rate` row missing in DB. Production should always populate DB.

---

## 11. LINE Login (OAuth) ⚪ — not yet implemented

| Var | Value |
|---|---|
| `LINE_LOGIN_CLIENT_ID` | TBD (LINE Developer Console) |
| `LINE_LOGIN_CLIENT_SECRET` | TBD |

Currently the LINE login button is a stub ("coming soon"). Either remove or wire up via Supabase custom OIDC.

---

## 12. Pre-launch checklist (production-readiness)

ตรวจครบทุกข้อก่อน `OTP_BYPASS=false` + open ลูกค้า:

- [ ] All 🟢 vars set with real values
- [ ] All 🟡 vars set OR feature gracefully disabled
- [ ] `OTP_BYPASS=false`
- [ ] `LINE_PUSH_BYPASS=false`
- [ ] `NEXT_PUBLIC_SITE_URL` = production domain (https://pacred.co)
- [ ] `OTP_PEPPER` = NEW random string (different from dev)
- [ ] `CRON_SECRET` set
- [ ] `THAIBULKSMS_API_KEY` + `_SECRET` = real keys (not placeholders)
- [ ] `LINE_CHANNEL_ACCESS_TOKEN` = real token + Pacred OA verified
- [ ] `PROMPTPAY_ID` = Pacred company actual ID
- [ ] Supabase OAuth providers (Google/Facebook) enabled in dashboard
- [ ] Vercel env vars synced (use `vercel env pull` to verify locally)

---

## 13. Migrate dev → staging → prod

| Env | File location | Set by |
|---|---|---|
| Local dev | `.env.local` (gitignored) | each dev manually |
| Staging | Vercel Dashboard → Settings → Env Vars (Preview env) | เดฟ/ก๊อต |
| Production | Vercel Dashboard → Settings → Env Vars (Production env) | เดฟ/ก๊อต |

ห้าม commit `.env.local` หรือ `.env.production` — gitignored. ใช้ `.env.example` (committed) เป็น template.

---

**End of env.md** — ถามเดฟถ้าได้ค่า credential แล้วจะตั้งที่ไหน
