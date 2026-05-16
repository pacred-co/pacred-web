# 🔐 Auth + Admin launch-readiness fixes — 2026-05-17

> Findings from ลูกพี่ testing the live site + เดฟ follow-up audit. Code fixes
> shipped this session; OAuth items below need **dashboard config** (เดฟ/ก๊อต/
> ลูกพี่ — cannot be fixed from code).
>
> Read with: [`docs/setup/facebook-oauth.md`](../setup/facebook-oauth.md) ·
> [`docs/setup/google-oauth.md`](../setup/google-oauth.md) ·
> [`docs/setup/supabase.md`](../setup/supabase.md) ·
> [`docs/env.md`](../env.md).

---

## ✅ Code fixes shipped this session (deploy with the next `main` push)

| # | Issue (ลูกพี่ reported) | Fix |
|---|---|---|
| 1 | OTP code field "หลุด theme" | `components/auth/otp-input.tsx` was on old hardcoded hex — converted to theme tokens (light + dark verified) |
| 2 | No visible "ขอ OTP" button on register | Form submit relabelled "สมัครสมาชิก" → **"ขอรหัส OTP"** + hint line (personal + juristic step 1) |
| 3 | Login placeholder showed `PC001` (old PCS prefix) | `messages/{th,en}.json` → **`PR001`** (the new Pacred member-code pattern — see §"Member code pattern" below). |
| 4 | Facebook + Google icons missing on login | Social SVG icons collapsed to width 0 — flex-shrink in the narrow 3-col grid. Added `shrink-0`. |
| 5 | Pacred logo too small | Enlarged to 76px on login + register (PNG is 140×140 square). Wrapper height pinned + `items-end` → logo grows UPWARD into card padding, **form below does not move**. |
| 6 | Admin dashboard counts a fresh signup as "ลูกค้าที่ใช้งานแล้ว" | **Logic bug — fixed.** See §"Admin dashboard" below. |

---

## 🐛 Admin dashboard — "ใช้งานแล้ว / ยังไม่ได้ใช้งาน" logic bug (FIXED)

**ลูกพี่ reported:** "เราเพิ่งสมัครเข้ามา ทำไมมันไปขึ้นฝั่งลูกค้าที่ใช้งานแล้ว … มันต้องอยู่ใน ลูกค้าที่ยังไม่ได้ใช้งานสิ"

**Root cause:** `app/[locale]/(admin)/admin/page.tsx` computed the two customer KPI cards from **`profiles.status`**:
- "ลูกค้าที่ใช้งานแล้ว" ← `status = 'active'`
- "ลูกค้าที่ยังไม่ใช้งาน" ← `status = 'incomplete'`

But `profiles.status` is the **account-registration state** (`active` = signup finished · `incomplete` = juristic mid-flow). Every personal customer who finishes signup gets `status='active'` — so a brand-new registrant who has never placed an order was counted as "ใช้งานแล้ว". Wrong.

**The correct field is `profiles.is_active`** (boolean) — the port of legacy `tb_users.userActive`. The cron [`/api/cron/refresh-active-customers`](../../app/api/cron/refresh-active-customers/route.ts) flips it `false→true` only when the profile has real activity (a paid service-order / forwarder past pending / completed yuan-payment). That is the true "has used a service" signal.

**Fix (5 spots in `admin/page.tsx`, shipped this session):**
- Active count → `.eq("is_active", true)`
- Inactive count → `.eq("is_active", false)`
- "inactiveCustomers" tab query → `.eq("is_active", false)` (was `status='incomplete'`)
- Active card link → `/admin/customers/recently-active`
- Inactive card link → `/admin?tab=inactiveCustomers`

After deploy: a freshly-registered customer with zero orders correctly shows under **"ลูกค้าที่ยังไม่ได้ใช้งาน"**. They move to "ใช้งานแล้ว" only after the daily cron sees real activity.

> ภูม owns `app/[locale]/(admin)/` — เดฟ made this fix at ลูกพี่'s direct request during launch-week. ภูม: heads-up, low-risk (5 query/link swaps, no schema change).
>
> **Minor follow-up (not urgent):** the customer counts include any admin's own `profiles` row. If "ลูกค้าทั้งหมด" should exclude staff, join/except the `admins` table — V2.1 polish, flag only.

---

## 🔢 Member code pattern — `PR00001` → `PR001` (whole system)

**ลูกพี่ 2026-05-17:** รหัสลูกค้าต้องเป็นแพทเทิน **`PR001`** — `PR` + **ขั้นต่ำ 3 หลัก** zero-padded, รันต่อไปเรื่อย ๆ; เกินหลักร้อย (`PR1000`, `PR12345`) รันได้ปกติ ห้ามเออเร่อ.

**Implementation — `lpad(n, 3, '0')`.** `lpad` pads to a *minimum* of 3 and **never truncates**, so the counter is unbounded + overflow-safe:

| seq n | member_code |
|---|---|
| 1 | `PR001` |
| 42 | `PR042` |
| 999 | `PR999` |
| 1000 | `PR1000` |
| 12345 | `PR12345` |

**Changed across the whole system (this session):**
- **Migration `0060_member_code_3digit.sql`** (NEW) — `create or replace generate_member_code()` with `lpad(…,3,…)` + backfills existing rows (`PR00001`→`PR001`; number preserved, only padding changes; `member_code` is not FK'd anywhere → safe). `member_code_seq` untouched → next signup continues cleanly. Numbered `0060` — deliberately clear of ภูม's fast-moving Phase-I2 freight block (`0044`-`005x`) so the two devs never collide on a migration number. The migration is independent (generator function + a `profiles` backfill), so apply-order vs ภูม's batch does not matter; migrations apply in sorted version order, so the `0049`-`0059` gap is harmless.
- `supabase/schema.sql` — generator + comment synced to the 3-digit pattern.
- **3 validators** (the load-bearing bit): `lib/utils/phone.ts` (`detectIdentifier`) · `actions/admin/forwarder-drivers.ts` (Zod) · `app/[locale]/(admin)/admin/forwarders/[fNo]/driver-assign-form.tsx` (HTML5 `pattern`) — all `^PR\d{5}$` → **`^PR\d{3,}$`** (accepts the new 3-digit codes AND any legacy 5-digit). `0044` is WHT not member_code (see numbering note below).
- 8 UI placeholders / labels / comments → `PR001`. `messages/{th,en}.json` login placeholder → `PR001`.
- 4 test files (`signup` / `phone` / `analytics` / `pdf`) — assertions + fixtures updated; `phone.test.ts` gained `PR001`/`PR1000` cases (the old "PR123 → phone fallback" assertion was inverted by the new regex and is now `→ memberCode`).
- All docs (`CLAUDE.md`, `PACRED-SECOND-BRAIN.md`, setup guides, architecture, legacy-schema, momo-1-call-prep) — `PR00001` example → `PR001`.

**Migration numbering:** ภูม shipped `0044`-`0049` (WHT / qa / org_contacts / tos_versions / freight_quotes / wallet_order_payment_unique) autonomously 2026-05-17; member_code took **`0060`** — numbered clear of ภูม's `0044`-`005x` freight block so the two devs never collide. Full map → [`poom-phase-i2-prep.md`](poom-phase-i2-prep.md) "Migration numbering map".

---

## 🔴 OAuth login broken — needs DASHBOARD config (NOT a code bug)

ลูกพี่ tested Google / Facebook / LINE login on the live site:

### Problem 1 — Google/Facebook redirect → `v2.pacred.co` → **404 DEPLOYMENT_NOT_FOUND**

**Root cause:** `signInWithOAuth` builds the post-login redirect from `process.env.NEXT_PUBLIC_SITE_URL` (`actions/auth.ts` — `redirectTo: ${siteUrl}/auth/callback`). The code is correct; **the env value is a dead domain.** `NEXT_PUBLIC_SITE_URL` in Vercel is set to `https://v2.pacred.co`, which has no deployment → after the customer approves on Google/Facebook, Supabase sends them to `v2.pacred.co/auth/callback` → 404.

There is **no hardcoded `v2.pacred.co` anywhere in the code** — verified by grep. 100% an env/dashboard issue.

**Fix:**
1. **Vercel** → Pacred project → Settings → Environment Variables → `NEXT_PUBLIC_SITE_URL` → set to the ONE canonical live domain (the domain the customer actually uses — `https://pacred.co.th` per ลูกพี่'s browser, OR `https://pacred.co` per `pacred-info.md`; pick the one that genuinely serves the app + decide the 301 between them). Apply to Production + Preview + Development → Redeploy.
2. **Supabase** → Authentication → URL Configuration:
   - **Site URL** = the same canonical domain
   - **Redirect URLs** allowlist must include `https://<canonical>/auth/callback` (+ `http://localhost:3000/auth/callback` for dev)
3. Re-test Google login → should land back on the live site, signed in.

### Problem 2 — Facebook → **"แอพไม่ทำงาน · แอพนี้เข้าถึงไม่ได้ในขณะนี้"**

**Root cause:** the Facebook app is in **Development Mode** (or missing domain/redirect config). Facebook blocks logins from anyone who isn't a listed app tester until the app is switched to **Live**.

**Fix** (per [`docs/setup/facebook-oauth.md`](../setup/facebook-oauth.md)): Meta for Developers → the Pacred app →
- **App Mode → Live** (toggle top of dashboard) — requires a Privacy Policy URL + the app icon/category filled in
- Facebook Login → Settings → **Valid OAuth Redirect URIs** = the Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback`
- App Domains = the canonical Pacred domain

### Problem 3 — Google

Likely the same redirect-URI gap. **Google Cloud Console** → Credentials → the OAuth client → **Authorized redirect URIs** must include the Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback`. Per [`docs/setup/google-oauth.md`](../setup/google-oauth.md). Then enable the Google provider in Supabase → Authentication → Providers with the client ID + secret.

### Problem 4 — LINE login = still a stub (by design)

The LINE button shows "LINE Login กำลังจะมาเร็วๆ นี้" — it is **not wired**. Supabase Auth has no native LINE provider. The DV-2 LINE Login channel (`2010105778`) powers **LIFF account-linking** (`/liff/link`), which is a different flow from website "Sign in with LINE".

Real "Sign in with LINE" needs a custom OAuth/OIDC flow (LINE authorize → callback → exchange token → find-or-create Supabase user → sign in) — a ~4-8h build. **NOT launch-week work.** Customers can register/login via phone+OTP (the main path) or Google/Facebook once the above is fixed. Track LINE web-login as a post-launch task.

---

## Launch-day priority

| Item | Blocker for launch? | Owner |
|---|---|---|
| Code fixes §1-6 | — (ship with next deploy) | ✅ done by เดฟ |
| `NEXT_PUBLIC_SITE_URL` + Supabase URLs | **Yes, if OAuth login is wanted day-1.** Phone+OTP login works regardless. | เดฟ / ก๊อต (Vercel + Supabase dashboards) |
| Facebook app → Live | Only blocks Facebook login | ก๊อต / ลูกพี่ (Meta dashboard) |
| Google redirect URI | Only blocks Google login | ก๊อต (Google Cloud) |
| LINE web-login | No — post-launch build | deferred |

**Bottom line:** the **phone + OTP** register/login path (the primary flow) is unaffected and works. OAuth (Google/Facebook) is a dashboard-config fix; LINE is a deferred build. None of this blocks the core launch — but fix `NEXT_PUBLIC_SITE_URL` before advertising "login with Google/Facebook".

---

## Cross-references

- OAuth setup guides → [`docs/setup/facebook-oauth.md`](../setup/facebook-oauth.md) · [`google-oauth.md`](../setup/google-oauth.md) · [`supabase.md`](../setup/supabase.md)
- Env vars → [`docs/env.md`](../env.md) (`NEXT_PUBLIC_SITE_URL`)
- OAuth action → `actions/auth.ts::signInWithOAuth` · callback `app/auth/callback/route.ts`
- Pre-launch checklist → [`pre-launch-checklist-2026-05-18.md`](pre-launch-checklist-2026-05-18.md)
