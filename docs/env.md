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

### Social login toggle ⚪

| Var | Dev | Prod |
|---|---|---|
| `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED` | `false` | `false` |

One flag gating **all** social sign-in (Google · Facebook · LINE) on `/login`. Default (unset, or any value ≠ `"true"`) → the three provider buttons render greyed-out under a **COMING SOON** badge and the `signInWithOAuth` server action refuses (`oauth_disabled`). Set `"true"` to enable.

Off by default because legacy PCS had password-only login — the D1 faithful port ([ADR-0017](decisions/0017-pacred-faithful-pcs-port.md)) defers social login to Phase C. `NEXT_PUBLIC_`-prefixed → inlined at build time; flipping it requires a redeploy.

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
| `SMS_LOW_THRESHOLD` | integer, default `100` | If remaining credit < this value, cron `/api/cron/sms-balance-check` alerts admins. Lower for prod (e.g. `50`) when you want earlier warning. |

**Code:** `lib/sms/gateway.ts` (`sendSms` + `checkSmsBalance`). If `OTP_BYPASS=true` (dev), SMS not actually sent — logged to console; balance returns fake healthy value.

**Cron registry:** see [`runbook/cron-registry.md`](runbook/cron-registry.md) for all SMS-related crons.

---

## 5. China Product Search 🟡 (P-50 audit 2026-05-14)

⚠️ **Pacred lib/china-search/index.ts is currently MISWIRED to RCGroup-TH (dead code in PHP).** See `docs/audit/php-pcscargo-integrations.md` §17 for full rewire spec. Tracked as **P-50 (CRITICAL)** in `PORT_PLAN.md` Sprint 7+ Track G.

**The ACTIVE PHP integrations** (verbatim from legacy production):

| Var | Value | Powers | Auth |
|---|---|---|---|
| `PACRED_TAMIT_DETAIL_URL` | `https://tamit-cloud.com/api-product` | Product detail (1688/Taobao/Tmall — pasted URL → SKU axes + price ranges + images). Endpoint shape: `{base}/get/{1688\|taobao}/?id={productID}` | None |
| `PACRED_TAMIT_CACHE_URL` | `https://tam-i-t.com/api/convert-link-china` | Short-URL cache (1688 `qr.1688.com/s/{tk}` + Taobao `m.tb.cn/{tk}` → productID). Endpoint shape: `{base}/get[/taobao]/?tk={tk}` + `/save/?tk=...&provider={1\|2}&productID=...` | None |
| `PACRED_AKUCARGO_API_URL` | `https://akucargo.com/api3/api-2022` | Keyword search (1688 + Taobao). Endpoint shape: `{base}/search/v1[/taobao]/?q={words}&page={N}&page_size=15&lang=zh-CN` | None (UA spoof to desktop Firefox) |
| `PACRED_LAONET_API_URL` | `https://laonet.online` | Image search (reverse-image) + product detail fallback. Endpoint shape: `{base}/index.php?route=api_tester/call&api_name={item_search_img\|item_get\|upload_img}&...&key={key}` | Email-as-key (`PACRED_LAONET_KEY`) |
| `PACRED_LAONET_KEY` | `tam011plus@gmail.com` (legacy) | API key for Laonet — literally an email | — |

**Degraded mode (any unset):** URL paste returns demo product (price ¥0, generic shop name) — `lib/china-search/index.ts` `convertProductUrlDetail` falls back to `buildDemoDetail()` so flow still works.

**DEAD code (kept commented for reference):**
- `PACRED_RCGROUP_API_URL=https://rcgroup-th.com/api-china/api-search` — RCGroup branch in PHP `convertURL.php` is gated by `$APIKEY` flag that's never assigned anywhere → never executes in production. Pacred port should drop this entirely after P-50 lands

**Why "API blocked" symptom:**
1. Pacred's `lib/china-search/index.ts:104,127,277` use `PACRED_RCGROUP_API_URL` for product detail + image — but RCGroup is dead
2. Vercel function egress IP differs from legacy XAMPP/cPanel — TAMIT/AkuCargo/Laonet may need vendor IP allowlist
3. PHP disables `CURLOPT_SSL_VERIFYPEER` — Vercel/Node fetch defaults to verify; some vendor certs have issues, may need explicit https.Agent

See `docs/audit/php-pcscargo-integrations.md` §17 for the 6-step fix path.

---

## 6. PromptPay 🟢 (set 2026-05-17)

| Var | Value | Powers |
|---|---|---|
| `PROMPTPAY_ID` | `0105564077716` — Pacred tax-ID 13 digit (ผูกบัญชี กสิกร `225-2-91144-0`) | `/wallet/deposit` QR generation |

✅ Set by ลูกพี่ in Vercel dashboard 2026-05-17. Tax-ID is the canonical PromptPay binding for Pacred biz account.

⚠️ ถ้าไม่ตั้ง = wallet deposit form throw error ตอน generate QR (hard fail, not silent).

**Code:** [`lib/promptpay.ts`](../lib/promptpay.ts) line 21-25.

---

## 7. LINE Messaging API + LIFF 🟡 ✅ creds set 2026-05-14 / scaffold D-1-LIFF

| Var | Value | Powers |
|---|---|---|
| `LINE_PUSH_BYPASS` | `true` (dev, default) / `false` (prod) | If true, push skipped — only console.log |
| `LINE_CHANNEL_ID` | `2009931373` (Pacred OA) | Used for webhook signature verification (future LINE OA bot) |
| `LINE_CHANNEL_SECRET` | (set in `.env.local` 2026-05-14) | Same — webhook signature |
| `LINE_CHANNEL_ACCESS_TOKEN` | (long-lived token set in `.env.local` 2026-05-14) | Push to LINE users who linked account via `api.line.me/v2/bot/message/push` |
| `NEXT_PUBLIC_LIFF_ID` | ✅ `2010105778-SaSkkGza` (set 2026-05-16 night) | LIFF link page at `/liff/link` populates `profiles.line_user_id`. Public — inlined into client bundle. **LIFF lives on the NEW "Pacred Login" LINE Login channel** (not the Messaging API channel `2009931373`) per LINE policy change 2024-2025: LIFF apps can only be created on LINE Login channels. The two channels coexist; bot_link feature links LIFF auto-friend to the Messaging API OA. |

**🚨 CRITICAL CHAIN — without LIFF, customers get NO push:**
1. Pacred LINE creds set ✅
2. `lib/notifications/index.ts` reads `profiles.line_user_id` to push
3. `profiles.line_user_id` IS NULL for every customer until they link
4. LIFF flow at `/liff/link` (D-1-LIFF, scaffolded) is the ONLY populator → without `NEXT_PUBLIC_LIFF_ID` set, page errors out

**LIFF activation order (✅ steps 1-2 done 2026-05-16 night):**
1. ✅ LINE Console → **NEW "Pacred Login" LINE Login channel** (Channel ID `2010105778`) → LIFF tab → "Add" — Endpoint URL = `https://pacred.co.th/liff/link`, Size = Compact, Scopes = openid + profile, BOT link = On (Aggressive) (auto-add Pacred OA when user opens LIFF). **NOTE policy change:** LIFF moved from Messaging API channel to LINE Login channel per LINE 2024-2025 rule.
2. ✅ Copy LIFF ID `2010105778-SaSkkGza` → set `NEXT_PUBLIC_LIFF_ID` in Vercel env (Production + Preview + Dev)
3. ⏳ ปอน wires "เพิ่ม LINE OA + เชื่อมบัญชี" CTAs at `/profile` + landing pages (uses `https://liff.line.me/<liff_id>` URL)
4. ⏳ Customer opens link → LINE auth → LIFF mounts at our page → posts `lineUserId` to `linkLineAccount` server action → saved
5. ⏳ Notification system starts pushing to that customer

⚠️ **Default in dev is bypass=true** (safe — no spam to test users). To activate dev push: edit `.env.local` set `LINE_PUSH_BYPASS=false` then restart `pnpm dev`.

**Code:** `lib/notifications/index.ts:24,100` (push) · `actions/profile.ts:linkLineAccount` (link server action) · `app/[locale]/liff/link/page.tsx` (LIFF mount page)

✅ **Pacred credentials landed** 2026-05-14 evening (เดฟ provided via chat). All 3 LINE vars set in `.env.local` (gitignored). For production, set the same 3 vars in Vercel env + flip `LINE_PUSH_BYPASS=false`.

⚠️ **Default in dev is bypass=true** (safe — no spam to test users). To activate dev push: edit `.env.local` set `LINE_PUSH_BYPASS=false` then restart `pnpm dev`.

LINE Notify EOL April 2025 — ADR-0001 documents migration to LINE Messaging API push + email fallback. Pacred uses Messaging API push (NOT Notify) — see `lib/notifications/index.ts:104-132`.

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

⚠️ ไม่ตั้ง = `/api/cron/*` endpoints unprotected (malicious actor can trigger auto-cancel / sms-balance-check / etc. manually)

**Registry:** see [`runbook/cron-registry.md`](runbook/cron-registry.md) for all 6 cron routes + schedules + Pacred Vercel plan analysis.

---

## 9.5 Vercel Auto-Provided 🟢 (no manual set)

Vercel injects these at build/runtime — listed for env-audit script + docs:

| Var | Source | Used by |
|---|---|---|
| `VERCEL_GIT_COMMIT_SHA` | Vercel build context | `/status` page (shows short SHA as build identifier) |

You don't set these locally; in `.env.example` they have empty values + a comment.

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
| `LINE_LOGIN_CLIENT_ID` | ✅ `2010105778` (set 2026-05-16 night) — same Channel ID as the "Pacred Login" LINE Login channel that hosts LIFF |
| `LINE_LOGIN_CLIENT_SECRET` | ✅ set 2026-05-16 night — Production env ONLY (Sensitive flag on Vercel). Channel secret leaked via chat during setup → ก๊อต should rotate within 30d via LINE Console |

Currently the LINE login button is a stub ("coming soon"). Either remove or wire up via Supabase custom OIDC.

---

## 12. hCaptcha — invisible bot protection 🟡 (D-13)

| Var | Required? | Where to get | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` | optional | https://www.hcaptcha.com → Sites → New (Type: **invisible**) | Public — inlined into client bundle. `NEXT_PUBLIC_` prefix required |
| `HCAPTCHA_SECRET_KEY` | optional | same dashboard → site detail | Server-only. Sent in body of `siteverify` POST |

**Behaviour by env:**
- **Both unset, dev** — `lib/hcaptcha.ts` `verifyHcaptcha()` returns `{success:true}`; client component renders nothing; flows pass with no captcha
- **Both unset, prod** — `verifyHcaptcha()` DEGRADES OPEN (`{success:true}`) + `logger.warn`; signup stays gated by phone OTP + IP rate-limit. *(Changed 2026-05-16 from fail-closed — fail-closed was hard-blocking 100% of real signups while the keys were unconfigured.)* Set the keys to restore full bot protection — zero code change.
- **Both set, any env** — full invisible CAPTCHA flow active. CSP in `next.config.ts` allows `hcaptcha.com` in `script-src` + `frame-src`.

**Usage pattern (combine client + server):**
```tsx
// Client (form)
"use client";
import { useRef } from "react";
import HCaptchaInvisible, { type HCaptchaHandle } from "@/components/hcaptcha-invisible";

const captchaRef = useRef<HCaptchaHandle>(null);

async function handleSubmit() {
  const token = await captchaRef.current?.execute();
  const res = await signupAction({ ...formData, captchaToken: token ?? "" });
  if (!res.ok) captchaRef.current?.reset();
}

return <form>… <HCaptchaInvisible ref={captchaRef} /></form>;
```

```ts
// Server action
"use server";
import { verifyHcaptcha } from "@/lib/hcaptcha";
import { getClientIp } from "@/lib/rate-limit";

export async function signupAction(input: { ...; captchaToken: string }) {
  // (read request via headers() helper for IP)
  const captcha = await verifyHcaptcha(input.captchaToken, ip);
  if (!captcha.success) {
    return { ok: false, error: "captcha_failed" };
  }
  // ... rest of signup
}
```

**Activation order (when ready):**
1. Pacred owner creates hCaptcha account → New Site → choose "Invisible"
2. Copy site key + secret key
3. เดฟ sets `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` + `HCAPTCHA_SECRET_KEY` in Vercel env
4. ภูม wires `verifyHcaptcha` into target server actions: `signupAction`, contact form, password reset (D-13-wire follow-up)
5. Redeploy → invisible challenge runs only on suspicious traffic; UX silent for normal users

**Why "invisible":** challenges only suspect bots, otherwise passes silently — no UX friction for real users. hCaptcha free tier covers ~1M requests/month — enough for Pacred pre-launch + early growth.

---

## 13. Rate limiting — Upstash Redis 🟡 (D-12)

| Var | Required? | Where to get | Notes |
|---|---|---|---|
| `UPSTASH_REDIS_REST_URL` | optional | https://console.upstash.com → create Redis DB → REST API tab | `https://<region>.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | optional | same page | REST token with read+write |

**Behaviour when unset:** `lib/rate-limit.ts` falls back to an in-memory `Map` per server process. **Dev-only fallback** — in prod Vercel may run multiple function instances concurrently, each with its own memory, so attackers can multiply allowed volume by hammering different cold starts. Set Upstash creds before customer launch.

**Pre-configured limits** (in `lib/rate-limit.ts`):
- `signup` — 5/hour/IP — pre-account creation
- `login` — 10/hour/IP — defend credential stuffing
- `passwordReset` — 5/hour/IP — anti-enumeration
- `contact` — 5/hour/IP — anti-spam on `/contact` form
- `generic` — 30/min/key — default for endpoints without their own bucket

**Usage pattern (Server Action / Route Handler):**
```ts
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const ip = getClientIp(request);
const blocked = await checkRateLimit("signup", ip);
if (blocked) return blocked;  // { ok: false, error: "rate_limit", retryAfterSeconds }
```

**Note:** This is for IP-based + generic time-window limits. For OTP-specific limits see `actions/otp.ts` — that uses DB-backed counting (3/hour/phone via `otp_codes` table) which doubles as audit trail.

**Activation order (when ready):**
1. Pacred owner creates Upstash account → create Redis DB (free tier OK pre-launch)
2. เดฟ sets `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in Vercel env
3. Redeploy → no code change needed; abstraction switches from memory to Redis on next request

**Activation:** zero downtime. The lib reads env once at module load — server functions cold-start with Redis when env present.

---

## 14. Sentry — error tracking 🟡 (D-11)

| Var | Required? | Where to get | Notes |
|---|---|---|---|
| `SENTRY_DSN` | optional | https://sentry.io → Settings → Projects → Client Keys (DSN) | Server-side. Unset = SDK no-op (no errors sent). |
| `NEXT_PUBLIC_SENTRY_DSN` | optional | same DSN value as server | Browser. Same value, but Next 16 needs `NEXT_PUBLIC_` prefix to inline into client bundle |
| `SENTRY_ENV` / `NEXT_PUBLIC_SENTRY_ENV` | optional | `production` / `staging` / `dev` | Overrides `NODE_ENV` for the env tag in Sentry events |
| `SENTRY_AUTH_TOKEN` | optional (prod) | Sentry → Settings → Auth Tokens (org-level, `project:write` scope) | Required for source map upload at build (`withSentryConfig` reads this); without it, prod stack traces point at minified output |
| `SENTRY_ORG` | optional (prod) | Sentry org slug | e.g. `pacred` |
| `SENTRY_PROJECT` | optional (prod) | Sentry project slug | e.g. `pacred-web` |

**How it integrates:**
- Server: `instrumentation.ts` registers `sentry.{server,edge}.config.ts` based on `NEXT_RUNTIME` + Next 16's `onRequestError` hook auto-captures Server Component / Route Handler / Server Action errors
- Client: `instrumentation-client.ts` initialises Sentry before React hydrates + `onRouterTransitionStart` adds navigation breadcrumbs
- Logger: `lib/logger.ts` `logger.error()` ALSO calls `Sentry.captureException` — every structured error is also a Sentry event
- Build: `next.config.ts` is wrapped in `withSentryConfig` — handles source map upload when auth token is set; otherwise passthrough
- CSP: `connect-src 'self' https: wss:` already covers `*.ingest.sentry.io` (no change needed)
- Tunnel: events route through `/api/monitoring` to bypass ad-blockers that block `*.sentry.io` directly

**Activation order (when ready):**
1. Create Sentry project → copy DSN
2. Set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` in Vercel env
3. (Optional, for prod) create auth token → set `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT`
4. Redeploy → next error → check Sentry dashboard
5. Smoke: throw a test error from `/admin` → confirm landing in Sentry within ~30s

**Sample rates (current defaults):**
- Traces: 10% in prod, 100% in dev
- Replays: 0% (off — privacy + bundle size)

Adjust in `sentry.{client,server,edge}.config.ts` once traffic shape is known.

---

## 15. Pre-launch checklist (production-readiness)

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
- [ ] `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` set (D-11) — verify test error reaches Sentry
- [ ] `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` set (D-12) — without these the rate-limit memory fallback leaks quota across Vercel function instances
- [ ] `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` + `HCAPTCHA_SECRET_KEY` set (D-13) — without them prod degrades open (signup works, no bot protection); set to restore full verification
- [ ] `NEXT_PUBLIC_LIFF_ID` set (D-1-LIFF) — without it `/liff/link` shows error + customers can't link → no LINE push reaches customers
- [ ] `NEXT_PUBLIC_GTM_ID` set (L-22) — without it conversion tracking silently disabled; landing pivot acquisition metrics missing
- [ ] `NEXT_PUBLIC_CLARITY_ID` set (L-23) — without it heatmap + session recording missing; behavioural debug data unavailable
- [ ] Supabase OAuth providers (Google/Facebook) enabled in dashboard
- [ ] Vercel env vars synced (use `vercel env pull` to verify locally)

---

## 16. Migrate dev → staging → prod

| Env | File location | Set by |
|---|---|---|
| Local dev | `.env.local` (gitignored) | each dev manually |
| Staging | Vercel Dashboard → Settings → Env Vars (Preview env) | เดฟ/ก๊อต |
| Production | Vercel Dashboard → Settings → Env Vars (Production env) | เดฟ/ก๊อต |

ห้าม commit `.env.local` หรือ `.env.production` — gitignored. ใช้ `.env.example` (committed) เป็น template.

---

---

## 17. Analytics — Google Tag Manager 🟡 (L-22)

| Var | Required? | Where to get | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_GTM_ID` | optional (recommended for prod) | https://tagmanager.google.com → New Container → Web → copy `GTM-XXXXXXX` | Public — inlined into client bundle. `NEXT_PUBLIC_` prefix required. |

**Behaviour by env:**
- **Unset, dev** — `lib/analytics.ts` `track()` calls `console.log("[analytics:no-gtm]", ...)` so wiring is verifiable without an account. `<GtmScript />` renders nothing.
- **Unset, prod** — silent no-op (no console noise for end users). Acquisition metrics missing.
- **Set, any env** — `<GtmScript />` injects the container loader in `<head>` + `<GtmNoscript />` iframe near top of `<body>`. `track()` pushes to `window.dataLayer` for GTM to consume.

**Code:** `lib/analytics.ts` (helpers) · `components/analytics/gtm-script.tsx` (loader) · `app/layout.tsx` (injection).

**Helpers exported** (GA4 recommended event names — map cleanly inside GTM):

```ts
import {
  track,                  // generic — for one-offs
  trackSignUp,            // registration completed
  trackLogin,             // successful sign-in
  trackGenerateLead,      // contact / lead form submitted
  trackPlaceOrder,        // service order / forwarder / yuan payment placed
  trackWalletDeposit,     // admin approved a deposit slip
} from "@/lib/analytics";
```

**Activation order (when ready):**
1. Pacred owner creates GTM container (free) → copy `GTM-XXXXXXX` ID
2. Inside GTM container: connect GA4 property (also free) → publish container
3. เดฟ sets `NEXT_PUBLIC_GTM_ID` in Vercel env (Production + Preview if desired)
4. Redeploy → GTM tag starts firing on all client navigations
5. Smoke: open https://pacred.co with GTM Preview mode → confirm dataLayer events emit on sign_up / login / lead / place_order

**Why GTM (vs gtag.js direct):**
- Marketing/ภูม can add/edit tags via GTM UI without redeploys
- One container supports future Meta Pixel, TikTok Pixel, hotjar, conversion goals, etc.
- Same conversion events power both GA4 reporting and ad-platform attribution

---

## 18. Heatmap & Session Replay — Microsoft Clarity 🟡 (L-23)

| Var | Required? | Where to get | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_CLARITY_ID` | optional (recommended for landing pivot) | https://clarity.microsoft.com → Sign in (free Microsoft account) → New Project → copy 10-char project ID | Public — inlined into client bundle. `NEXT_PUBLIC_` prefix required. |

**Behaviour by env:**
- **Unset, any env** — `<ClarityScript />` renders nothing; `clarityTag()` / `clarityEvent()` / `clarityIdentify()` are no-ops.
- **Set, any env** — tag loaded; Clarity dashboard receives heatmap + session recordings within ~15 min of first traffic.

**Code:** `lib/analytics.ts` (helpers) · `components/analytics/clarity-script.tsx` (loader) · `app/layout.tsx` (injection).

**Helpers exported:**

```ts
import {
  clarityTag,        // tag session with key/value (e.g., "plan", "juristic")
  clarityEvent,      // fire timeline marker (e.g., "cart_abandoned")
  clarityIdentify,   // attach profileId to recordings (post-login only)
} from "@/lib/analytics";
```

**Activation order (when ready):**
1. Pacred owner signs in to clarity.microsoft.com with a Microsoft account
2. New Project → name "Pacred" → site URL `https://pacred.co` → copy 10-char ID
3. เดฟ sets `NEXT_PUBLIC_CLARITY_ID` in Vercel env (Production + Preview)
4. Redeploy → recordings start flowing within minutes; heatmap available after ~50 sessions

**Why Clarity (vs Hotjar / FullStory):**
- Free, no session quota (Hotjar free tier caps at 35 sessions/day)
- No PII concern (Clarity masks form inputs by default)
- Lightweight script (~50 KB, async, no Core Web Vitals impact)
- Complementary to GTM/GA4 — GA4 tells you *what* converted; Clarity shows *why* others didn't

**Privacy / consent (for production):**
- Clarity respects DoNotTrack header by default — no extra config needed
- Form inputs are auto-masked (passwords, credit cards, free-text fields) — see Clarity console → Settings → Masking
- For Thai PDPA compliance: add a cookie banner once `NEXT_PUBLIC_CLARITY_ID` is set + consider calling `clarity("consent")` only after user opts in

---

---

## 19. MOMO JMF — Thailand warehouse cargo partner 🟡

| Var | Required? | Where to get | Notes |
|---|---|---|---|
| `MOMO_JMF_TOKEN` | required for cargo container sync | MOMO dev — JWT issued 2026-05-16 (in `.env.local`) | Request rotation via LINE/partner channel when needed |
| `MOMO_JMF_BASE_URL` | required | Confirm with MOMO dev — currently commented out in `.env.example` | Endpoint root for sync + webhook |
| `MOMO_JMF_WEBHOOK_SECRET` | optional (recommended) | Request from MOMO if they sign webhooks | For inbound `/api/webhooks/momo-jmf/status` verification |

**Behaviour by env:**
- **Unset, any env** — MOMO sync paused; warehouse staff input container status manually in admin UI (planned banner: "MOMO sync paused — using manual entry"). Customer-side container view still works using whatever's in DB.
- **Set, any env** — `lib/integrations/momo-jmf/*.ts` consumes container-status API + webhooks. Sync cron runs every 15 min per `vercel.json`.

**Code (when implemented per [`docs/integrations/momo-jmf.md`](integrations/momo-jmf.md)):**
- `lib/integrations/momo-jmf/client.ts` — typed REST client
- `app/api/cron/momo-jmf-sync/route.ts` — periodic sync
- `app/api/webhooks/momo-jmf/route.ts` — webhook receiver

**See also:**
- [`docs/integrations/momo-jmf.md`](integrations/momo-jmf.md) — full integration spec + endpoint inventory + implementation roadmap
- [`docs/architecture/container-centric-model.md`](architecture/container-centric-model.md) — DB schema MOMO writes into

---

**End of env.md** — ถามเดฟถ้าได้ค่า credential แล้วจะตั้งที่ไหน
