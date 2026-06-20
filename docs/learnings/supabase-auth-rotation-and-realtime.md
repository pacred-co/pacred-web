# Supabase random-logout (refresh-token rotation) + stale-data (revalidateTag)

> Captured 2026-06-06 (เดฟ) — two owner-reported RED bugs ("หลุด login กลางคัน" +
> "กดบันทึกแล้วข้อมูลไม่ขยับ realtime"). Both root-caused from SDK/framework
> source. One is an infra fix (NOT code), one is a code fix. Read before
> re-attempting either — the obvious code "fix" for the logout is a **no-op**.

---

## 1. Random mid-session logout = Supabase refresh-token ROTATION race (infra fix, NOT code)

**Symptom:** signed-in users (member + admin) randomly get bounced to /login
mid-session, roughly once their access token nears expiry (~hourly).

**Root cause (verified in `@supabase/auth-js@2.105.4` source `GoTrueClient.js`):**
- `getSession()` and `getClaims()` (no-arg) BOTH funnel through `__loadSession()`.
- `__loadSession()` computes `hasExpired = expires_at*1000 - Date.now() < EXPIRY_MARGIN_MS` (90 s).
- When within that 90 s margin it calls `_callRefreshToken(refresh_token)` **UNCONDITIONALLY** — there is **no `autoRefreshToken` gate** on that branch (the `autoRefreshToken` option only controls the background timer, not the on-demand refresh).
- Refresh tokens are **one-time-use** (rotation). Next.js App Router fires **many concurrent requests** (link prefetch renders the page RSC). Each is a separate per-request server client → no shared lock → each tries to refresh the SAME refresh token. One wins (gets the new token), the rest present the now-consumed token → fail → the browser can end up holding a consumed token → logout.
- RSC/Server-Component clients **cannot persist cookie writes** (`cookies().set()` throws in an RSC and is swallowed by `server.ts`'s `setAll` catch), so any refresh they trigger is **lost** even when it "succeeds".

**Why the obvious code fix is a NO-OP (don't re-do it):**
Reading the access token via `getSession()` and passing it to `getClaims(token)`
(to "avoid the internal getSession") still calls `getSession()` → still rotates.
`getClaims(token)` with an explicit token skips the internal getSession, but you
had to call getSession yourself to GET the token. Net change to rotation: zero.
It also adds a noisy "Using the user object from getSession() could be insecure"
warning on every render. We shipped this, proved it was a no-op from source, and
reverted it (commits 98541459 → e58e34b8).

**The only safe code path that avoids RSC refresh** = read the token straight
from the `sb-<ref>-auth-token` cookie (chunked + `base64-` prefixed) WITHOUT
getSession, then `getClaims(token)`. But `@supabase/ssr` does **not** export its
cookie-decode helpers and the storageKey/format is version-coupled — hand-rolling
it in `lib/auth/get-user.ts` (the highest-blast-radius file) risks locking out
everyone. Not worth it. And note: middleware (`proxy.ts`) already refreshes +
persists on every matched request, so the RSC almost never refreshes anyway — the
dominant race is **concurrent middleware refreshes under prefetch**, which a
get-user change can't fix.

**THE DURABLE FIX (infra, owner/ก๊อต — NOT code):**
Supabase Dashboard → **Authentication → Sessions → "Refresh token reuse interval"**
→ raise to ~10 s. That interval lets concurrent requests that present the same
just-rotated token within the window receive the SAME new session instead of
failing — exactly the prefetch race. Optionally lengthen the access-token TTL to
refresh less often. Both are project settings, not code.

**Rule:** refresh is owned SOLELY by `proxy.ts` (the one place that can persist the
rotated cookie). Never add another refresh path in RSC/actions. `get-user.ts`
stays on `getClaims()` (no-arg) local-verify + `getUser()` fallback.

---

## 2. Stale data after save = unstable_cache needs `revalidateTag`, not `revalidatePath`

**Symptom:** after a save/approve/pay, sidebar + header BADGE counts and wallet/
cashback totals don't update for up to 60 s — "กดบันทึกแล้วข้อมูลไม่ขยับ, ต้อง
reset/restart".

**Root cause:** the chrome badge/total surfaces are served from `unstable_cache`
with a 60 s TTL keyed on a **NON-path key**:
- `"pcs-chrome"` → `lib/legacy/pcs-chrome.ts` (customer wallet/cart/forwarder/order counts)
- `"admin-sidebar-counts"` → `actions/admin/sidebar-counts.ts` (admin queues)
- `"wallet-system-totals"` → `lib/admin/wallet-totals.ts` (admin wallet/cashback cards)

A non-path `unstable_cache` entry is invalidated **ONLY by a matching
`revalidateTag`** — `revalidatePath` does NOT reach it. The codebase had **744
`revalidatePath` calls and ZERO `revalidateTag` calls**, so every mutation left
these caches stale until the 60 s TTL lapsed.

**Fix:** `lib/cache/revalidate-chrome.ts` exposes `bustCustomerChrome()` /
`bustAdminChrome()`; every mutation action calls the matching one alongside its
existing `revalidatePath`. Wired into 29 actions (71 calls).

**Next-16 gotcha:** `revalidateTag` is now a **2-arg** call —
`revalidateTag(tag, profile)` — the 2nd arg is REQUIRED (TS2554 without it). Pass
`{ expire: 0 }` (a CacheLifeConfig) to purge immediately, the old 1-arg behaviour.

**Rule:** if a value is read through `unstable_cache` with `tags: [...]`, a
Server Action that changes it MUST `revalidateTag(tag, { expire: 0 })`.
`revalidatePath` is necessary for the page body but NOT sufficient for tagged
caches.

---

## 3. Bonus: emoji as `next/image` src

`<Image src="🚢">` throws "Failed to parse src on next/image". If a data field
is an emoji (e.g. `customs-port-data.ts` `icon: "🚢"`), render it as text in a
`<span>`, not `<Image>`. (incident on /customs-clearance-shipping-suvarnabhumi.)

## 4. Bonus: platform_incidents triage

`/admin/incidents` auto-captures runtime errors (Sentry-lite, table
`platform_incidents`, dedup by fingerprint). Most "`X is not defined`" client
errors are **old captures of since-fixed code** — verify by grepping the symbol
at HEAD (defined/imported now, or the offending code removed). Bulk-closing the
historical backlog is safe because the store **re-captures** anything that still
fires. Close path: `resolved` needs `acknowledged_at` + `assigned_to` (0077
CHECK); `ignored` is terminal (transient/external — network, Google-Translate DOM
`removeChild`/`insertBefore`, chunk-load).

---

## [2026-06-20] A new auth GATE with no fallback locks out accounts provisioned under the OLD convention

**Symptom (owner):** "login ไม่ได้ · admin_dev / admin_poom / admin_got / admin_pop · คนอื่นไม่มีปัญหา."

**Root cause:** ปอน's new dedicated admin entrance `/admin/login` (`signInAdmin`, actions/auth.ts) accepts ONLY an `admin_*` username → maps it to `admin_<name>@pacred.co.th` → `signInWithPassword({email})`. Unlike the normal `/login` (`signIn`), it has **no employee_code / phone / member-code fallback**. The 18 office admins all have a real `admin_<name>@pacred.co.th` auth email (provisioned via /admin/admins/new), so they work. But the 4 TEAM accounts predate that convention and authenticate other ways — 2 by phone (email NULL · PR112 admin_dev · PR038 admin_got), 1 by personal gmail (PR009 admin_poom), 1 by the legacy bridge (`…@users.pacred.invalid` · PR321 admin_pop). The new gate's email path can't resolve any of them → "invalid_credentials" → locked out of /admin.

**The trap:** a brand-new auth gate that's stricter than the old one (no fallback) silently breaks exactly the accounts that relied on the old flexibility — and they're often the dev/owner accounts, so it surfaces as "WE can't log in" right after a deploy. The leak-hunt validated the gate's SECURITY (HMAC, 2-stage, role agreement) but a static review can't catch "these specific real accounts lack the email the gate now requires" — that needs a DB probe of the actual account rows.

**Fix (data, owner "ใช้รหัสเดียวกับ PR เหมือนทุกคน"):** set `admin_<name>@pacred.co.th` + `email_confirm:true` on each EXISTING auth user via the GoTrue admin API (`updateUserById` — keeps auth.users + auth.identities consistent; direct `auth.users` SQL would desync the identities table). **KEEP each account's existing password** (= their PR password) — only a legacy-bridge account (no usable native `encrypted_password`) needs a password set. Script: `scripts/fix-team-admin-logins-2026-06-20.mjs` (dry-run default · refuses unless .env.local is prod). Verified with a real `signInWithPassword` against prod (not just "the row looks right").

**Rule:** when you add an auth gate that REQUIRES a specific identifier shape, first probe the real accounts that must pass it — confirmed-working peers prove the happy path, but the accounts provisioned before the convention are the ones that break. And a credential write isn't "done" until a real `signInWithPassword` succeeds — a correct-looking `auth.users` row can still fail login (placeholder password / unconfirmed email / identities desync). Cross-links: [[verify-deep-flow]] · `lib/auth/admin-session.ts` · `actions/auth.ts::signInAdmin`.
