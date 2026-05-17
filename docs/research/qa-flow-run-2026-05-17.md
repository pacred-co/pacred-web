# QA Flow Run — 2026-05-17

> **Skill:** `qa-flow-simulator` · **Type:** first functional QA pass (post-launch-day) · **Agent:** worktree `agent-a8b0ab4da64721485`
> **Branch tested:** `dave` tip `6b23913` (worktree merged `origin/dave`; this is the live integration branch — `origin/main` `314a528` is the *held* prod branch and was stale).
> **Build:** `pnpm build` ✅ + `pnpm start` (prod artifact, port 3000) ✅ · **OTP_BYPASS=true** set in `.env.local`.

---

## TL;DR

**3 PASS · 0 FAIL · 8 BLOCKED.**

No code failures (🔴) found. The **public/marketing/route layer is healthy** — every public page renders real content, every protected/admin route correctly redirects unauthenticated visitors. **The 8 blocked cases are blocked by one single environmental cause, not by code:** the dev Supabase project (`gnortvyazfmocvcbvfbs.supabase.co`) is **unreachable — DNS `ENOTFOUND`**. The project is paused or deleted. Every flow that touches the database (register, login, wallet, orders, admin-approve, refund) cannot be exercised end-to-end until the dev Supabase is back online. Where a flow could not be executed live, the underlying code + DB-migration was **read and verified statically** — noted per case.

---

## Environment blocker (root cause for all 8 BLOCKED)

```
$ fetch https://gnortvyazfmocvcbvfbs.supabase.co  → ENOTFOUND getaddrinfo
$ fetch https://example.com / supabase.com / vercel.com  → 200 OK
```

General internet works; only the **project-specific Supabase subdomain does not resolve in DNS**. That is the signature of a **paused or deleted Supabase project** (free-tier projects auto-pause after inactivity; the subdomain stops resolving). Both `.env.local` files in the repo (worktree + main) point to the *same* project ref `gnortvyazfmocvcbvfbs` — there is no alternative dev project to fall back to.

Server-side effect observed: `@supabase/ssr`'s `auth.getUser()` **swallows the network failure and returns `{ user: null }`** — so auth-gated pages cleanly redirect to `/login` instead of 500ing (verified: `/api/settings-rate` returns its `401` fallback `{yuan_rate:5,service_fee:50}` cleanly; server log shows no error trace). This is graceful-degradation-correct for *read* paths, but any *write* path (createUser, insert) will fail at the Supabase call.

**Action for the team:** un-pause / restore the dev Supabase project, then re-run this pass. Until then the money/auth/order flows are untestable here.

---

## Result matrix

| # | Case | Result | Method | Evidence |
|---|---|---|---|---|
| 1 | **register** (2-step + OTP) | ⚠️ BLOCKED | route render + code read | `/en/register` → **200**, 176 KB real HTML, no error shell, no i18n key-leak (`th` too). Flow stops at `registerPersonal` → `admin.auth.admin.createUser()` → dead Supabase. `verifyOtp` short-circuits OK under `OTP_BYPASS`. Cannot assert a `profiles` row / `member_code`. |
| 2 | **login** (phone+OTP · email+pass) | ⚠️ BLOCKED | route render + code read | `/en/login` → **200**, 156 KB real HTML. `signIn` → `supabase.auth.signInWithPassword()` → dead Supabase. Cannot obtain a session. |
| 3 | **wallet deposit request** | ⚠️ BLOCKED | route render + code read | `/en/wallet/deposit` → **307 → /login** (no session — expected). `createDeposit` inserts a `pending` `wallet_transactions` row — needs an authenticated user + live DB. Code path read & correct (`actions/wallet.ts:101`). |
| 4 | **pay-order-from-wallet** (F-11 double-debit) | ⚠️ BLOCKED | code + migration read | Cannot fire the action twice without a live DB. **Guard verified statically:** migration `0049` adds partial-unique index `wallet_tx_order_payment_uniq` on `wallet_transactions(reference_id)` for the `order_header`/`order_payment`/`completed` slice; `actions/service-order.ts:588-606` catches Postgres `23505` and re-SELECTs idempotently. Defense is present in both code and schema — but **not executed**. |
| 5 | **place a shop order** | ⚠️ BLOCKED | route render + code read | `/en/service-order` → **307 → /login**. `placeServiceOrder` (`actions/service-order.ts:336`) inserts `service_orders` + items, `h_no` set by trigger. Needs auth + live DB + a non-empty cart. |
| 6 | **admin approve a wallet deposit** | ⚠️ BLOCKED | route render + code read | `/en/admin/wallet` → **307 → /login**. Needs a seeded admin account + a `pending` tx + live DB. |
| 7 | **RBAC (F-2)** | 🟡 PARTIAL PASS | live HTTP + code read | **Live-verified:** all 8 admin routes (`/admin`, `/admin/wallet`, `/admin/reports`, `/admin/driver-runs`, …) → **307 → /login** when unauthenticated — the `requireAdmin` first line of defense fires. **Code-verified:** `/admin/wallet` = `requireAdmin(["accounting"])`, `/admin` + `/admin/reports` = `requireAdmin(["ops","accounting","sales_admin"])` → `driver`/`warehouse` get `notFound()` (404). `/admin/driver-runs` = `requireAdmin()` (no role arg) → any active admin incl. `driver`/`warehouse` allowed. RBAC gating is wired per F-2 intent. **Not executed:** per-role refusal needs seeded `driver`/`warehouse` accounts + live DB. |
| 8 | **public pages render** (homepage · register · login · services × en/th) | 🟢 PASS | live HTTP body assert | All 200 with substantial real content + no error shell — homepage 1.0 MB, services index 285 KB, `import-china` 380 KB; `th` locale renders; **no i18n missing-key leak** on `th/register`. See "Public route results". |
| 9 | **auth-guard redirects** (13 protected routes unauth) | 🟢 PASS | live HTTP | All 13 protected routes → **307 → /login** when unauthenticated (`/dashboard`, `/wallet/*`, `/service-order`, `/service-import`, `/service-payment`, `/shipments`, `/notifications`, `/refunds`, `/profile`). Guard fires *before* the DB call → no 500 despite dead Supabase. |
| 10 | **route-level smoke** (no 500s on changed routes) | 🟢 PASS | live HTTP | 0 ERROR-PAGE / `DYNAMIC_SERVER_USAGE` across ~40 routes hit; server log clean (only the Node-20-vs-24 engine warning, cosmetic). `customs-clearance` correctly 308s to its SEO slug; `/reset-password` correctly 307s to `/forgot-password` with no recovery session. |
| 11 | **refund path (U1)** | ⚠️ BLOCKED | — | Migrations `0058`/`0059`/`0066` are present in the worktree tree, but whether they are **applied to the dev DB is unknowable** (dead DB) — and the flow needs auth + live DB anyway. `/en/admin/refunds` + `/en/refunds` render-redirect correctly (307 → /login). |

> Cases 8–10 are PASS findings folded out of the route sweep so the matrix records the *positive* signal explicitly — they are not in the launch-critical 7 but are real verified outcomes.

---

## Public route results (live, evidence)

```
200  /en                            homepage — 1,028,126 b real HTML, brand+Import present
307  /th                            -> /            (as-needed locale prefix, correct)
200  /en/register                   176,616 b, no error shell, no key-leak
200  /en/login                      156,272 b
200  /en/forgot-password            200
200  /en/services                   285,366 b
200  /en/services/import-china      379,743 b
200  /en/services/china-shopping    361,565 b
200  /en/services/import-china-fcl  200
200  /en/services/import-china-lcl  200
200  /en/services/export-worldwide  200
308  /en/services/customs-clearance -> /customs-clearance-shipping-suvarnabhumi  (intended SEO 308)
200  /en/contact / /en/about        200
```

*(Note: the CLAUDE.md "planned routing" service slugs `/services/import` and `/services/shop-order` 404 — but that is a stale-doc artifact: the real service pages are static per-slug dirs `import-china`, `china-shopping`, etc. Not a bug. CLAUDE.md's `Routing convention (planned)` block predates the built routes.)*

## Protected + admin routes (live, unauthenticated — evidence)

```
307  /en/dashboard /en/wallet/{deposit,withdraw,history}        -> /login   (×4)
307  /en/service-order /en/service-order/cart                   -> /login
307  /en/service-import /en/service-payment /en/shipments        -> /login
307  /en/notifications /en/refunds /en/profile                  -> /login
404  /en/wallet                                                  (no index page — only sub-routes; minor)
307  /en/admin /en/admin/{wallet,reports,driver-runs,...}        -> /login   (×8)
```

---

## Failures (🔴)

**None.** No code defect was found. The 8 blocked cases are blocked by the dev-Supabase outage, an environment problem, not a code problem — per the skill's anti-pattern rule *"a flow whose backing service is down is ⚠️ blocked (precondition), not 🔴 fail."*

One minor observation (not a fail, not blocking): `/en/wallet` has no index page (404) while `/en/wallet/deposit|withdraw|history` work — a customer typing `/wallet` lands on a 404 instead of a wallet home. Worth a redirect or an index page, but cosmetic.

---

## What a follow-up pass must cover (once dev Supabase is restored)

1. **Restore / un-pause the dev Supabase project** `gnortvyazfmocvcbvfbs` — hard prerequisite for everything below. Confirm migrations through `0066` are applied (esp. `0049` F-11 index, `0058`/`0059` refund + container-unify, `0064` overdraw guard).
2. **Seed test identities** — a personal customer, a juristic customer, and one admin per role (`super`, `accounting`, `ops`, `driver`, `warehouse`) — needed for cases 1-7.
3. **Re-run cases 1-7 end-to-end** with DB assertions: register → assert `profiles` row + `member_code = PR###`; pay-from-wallet → fire twice → assert `count(*) wallet_transactions where reference_id=h_no and kind=order_payment = 1`; admin approve → assert balance delta + `admin_audit_log` row.
4. **Drive server actions for real** — the actions use `useTransition` (not form `action=`), so they need either browser automation (Preview / Claude-in-Chrome MCP) or the `Next-Action` POST protocol. This pass used raw `fetch` for route + REST assertions; the action layer still needs a live driver.
5. **F-2 per-role RBAC** — log in as a `driver` admin, confirm `/admin/wallet` + `/admin/reports` return 404 and `/admin/driver-runs` returns 200.
6. **Overdraw guard (0064)** — stack pending withdraws beyond balance, assert the trigger blocks the row.

---

## Method notes (for the next agent)

- `curl` is **denied** in this environment — all HTTP was driven via `pnpm exec tsx` scripts using Node `fetch`.
- `@supabase/supabase-js` **crashes on Node 20** (`Node.js 20 detected without native WebSocket support` — Realtime init). Use the **raw Supabase REST / GoTrue Admin API over `fetch`** instead (no WebSocket dependency) — see the `qa-scratch/db.ts` helper pattern.
- QA scratch scripts were kept in `qa-scratch/` (git-excluded locally, not committed). Only this report is committed.

---

## Production Supabase — verified ALIVE (เดฟ/Claude follow-up, 2026-05-17)

The 8 BLOCKED cases above were blocked by the **dev** Supabase being gone. To rule out a launch emergency, the **production** Supabase was probed directly:

- Dev project `gnortvyazfmocvcbvfbs.supabase.co` → **NXDOMAIN — DELETED.** (A *paused* project keeps its DNS and serves a "project paused" page; NXDOMAIN means the project no longer exists.) Both local `.env.local` files point at this dead ref.
- Production runs a **separate** project. Extracted from the live prod JS bundle (`NEXT_PUBLIC_SUPABASE_URL` is a build-time public var): `https://yzljakczhwrpbxflnmco.supabase.co`.
- `yzljakczhwrpbxflnmco.supabase.co` → **DNS resolves** (Cloudflare `104.18.38.10`) · `/auth/v1/health` → `401 {"message":"No API key found"}` (GoTrue up, processing requests) · `/rest/v1/` → `401` (PostgREST up). **Production Supabase is healthy.**
- `pacred-web.vercel.app` → every route 200/307, no 500s.

**Verdict: the production launch (`main` `314a528`) is genuinely fine.** The deleted project is the *dev* one only — it blocks local dev + this QA pass + ภูม applying/testing migrations `0058`/`0059`/`0066`, but it does not affect customers or the deployed site.

**Action — เดฟ/ภูม:** recreate (or restore) the dev Supabase project, apply migrations `0044`-`0066`, update `.env.local` with the new ref. Until then local DB work + the follow-up QA pass are blocked.
