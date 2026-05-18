# 🏠 ภูม — Save-point 2026-05-19 (B-auth shipped + verified · moving to the office machine)

> **Save snapshot.** ภูม resuming on the office computer tomorrow (2026-05-20).
> This doc = the full Phase-B plan + the resume guide + the handoff to เดฟ.
> Previous save-point: [`poom-save-point-2026-05-18-evening.md`](poom-save-point-2026-05-18-evening.md).

---

## 📨 สรุปส่งเดฟ — read this first

**Landed this session (on `Poom`, commit `ade9ed0`, pushed to `origin/Poom`):**

- **B-auth — the legacy PCS password bridge — is wired into sign-in.** A migrated
  PCS customer signs in with their **existing** password (no reset): `signIn()`
  tries native Supabase auth, then falls back to `bridgeLegacyLogin()` — it
  verifies the legacy `passTam` hash against `tb_users`, provisions the Supabase
  user with the password just typed (Q2-(a) refined — no shared secret), and
  sets the session. Runs once per customer; later logins are native.
- **Verified against the live Phase-A data** — dev Supabase (`pprrlabgebrnocthwdmg`),
  `tb_users` = 8,898 rows. Every bridge assumption confirmed (§3) — **no code fix
  needed**. `/login` serves HTTP 200 on the merged build. Static gate green
  (tsc · lint · test:unit 34/34 · build).
- Synced `dave` into `Poom` (Phase-A loaded + `0087`).

**🔴 One decision needed from เดฟ — the B-auth ↔ customer-portal boundary (§4):**
the bridge provisions the Supabase **`auth.users`** row but deliberately does
**not** create a Pacred **`profiles`** row. So a bridged customer has a session
but `getCurrentUserWithProfile()` returns `null` until the customer-portal
rework lands. **Who owns creating the `profiles` row — the auth-bridge or the
customer-portal Wave-1 slice?** They collide if both do it. Please rule.

**Also:** Q2 auth posture is still provisional pending ก๊อต ratification.

---

## 1. TL;DR — where we are (2026-05-19)

🟢 **Phase A — DONE.** เดฟ + Claude loaded the legacy `pcsc_main` into Supabase
**dev + prod** — 117 `tb_*` tables, 114 with data (8,898 customers · orders ·
wallets · ตู้ · forwarders · receipts · the `userpass` login hashes), `PCS→PR`
rebrand applied, RLS on. Migrations `0081`-`0083` + `0087` on `dave`. (3 oversized
log tables wait for the Supabase Pro upgrade.)

🟢 **B-auth — DONE + verified** (this session — §3).

🔱 **Phase-B rework is now เดฟ+Claude agent-wave-driven.** Wave 1 in flight:
customer 9-icon launchpad · customer order flow · admin per-role RBAC sidebar +
live-count badges · admin container `tb_cnt` payment ledger. **ภูม's role:** pull
`dave` often → **review/verify** each landed slice against the legacy PCS system;
**the auth-bridge stays ภูม's to drive directly**; **ping เดฟ before taking a
fresh slice** (one owner each). As of this save-point Wave 1 has not landed code
yet — nothing to review.

---

## 2. The full Phase-B plan (D1 · ADR-0017)

**D1 = Pacred becomes a faithful port of the legacy PCS Cargo system, `PCS`→`PR`.**
Three phases:

- **Phase A — data migration.** ✅ Done (above).
- **Phase B — workflow fidelity.** Rework the app so menus / job statuses /
  container (ตู้) flow / the end-to-end logic-loop match legacy PCS **exactly** —
  zero retraining for staff + ~8,898 customers. Stage breakdown (`B-0`..`B-9`) in
  [`poom-phase-b-prep.md`](poom-phase-b-prep.md):
  - **B-0** data foundation — re-point `lib/supabase` + actions at `tb_*`
  - **B-auth** legacy-password login — ✅ **DONE** (§3)
  - **B-2** status-vocab reconcile (3 → legacy 1) · **B-3** customer logic-loop
    (shop-order / forwarder / payment / wallet) · **B-4** per-role admin sidebars
    + live-count badges · **B-5** ship→arrive→pay forwarder order · **B-6**
    `tb_cnt` container payment ledger · **B-7** barcode scan family · **B-8**
    accounting (รวมบิล / container-pay / รับรู้รายได้) · **B-9** QA queue / notes
    / Learning / Extension / member segmentation
  - Execution: เดฟ+Claude run these as agent-waves landing on `dave`; ภูม reviews
    + owns the auth-bridge.
- **Phase C — Pacred enhancements.** *Only after* the faithful port works. The
  Tier-0/1/2/3 roadmap, booking flow, freight expansion, internal systems — all
  deferred here. Append ideas to docs, don't build.

**The lens (owner directive, 2026-05-19):** copy the legacy system 100% — every
button, every function — FIRST. Choose exact legacy reproduction over "the better
way" every time. Enhancements only after the copy is exact. Do not chase
far-from-the-customer work; consult before deciding scope.

---

## 3. B-auth — DONE + verified

**Commit `ade9ed0`** (`origin/Poom`) — `feat(b-auth): legacy PCS password bridge
wired into sign-in`.

**Files:**
- `lib/auth/pcs-legacy-bridge.ts` (new · server-only) — `bridgeLegacyLogin()`:
  look up `tb_users` by phone / member code / email → `verifyLegacyPassword`
  against the `passTam` hash → provision the Supabase user with the password just
  typed → sign in. Safe no-op (`ok:false`) when `tb_users` is absent.
- `lib/auth/pcs-legacy-password.ts` — added `legacyPhoneCandidates` +
  `legacySyntheticEmail` (+ 12 unit tests in its `.test.ts`).
- `actions/auth.ts:signIn` — native Supabase auth first; on failure →
  `bridgeLegacyLogin` fallback.

**Verified:**
- Static gate — `tsc` · `lint` · `test:unit` (34/34) · `pnpm build` all green.
- Real-data inspection vs dev `tb_users` (8,898 rows): `usertel` = 10-digit
  `0xxxxxxxxx` (`legacyPhoneCandidates` covers it) · `userid` = `PR<n>` + the 4
  no-prefix handles `PW`/`JET`/`FCL`/`AIGA` (handled by the userid fallback) ·
  `userstatus` 1/0 (active-only check correct) · `useremail` null in ~94%
  (provision-by-phone is the right default). **No code fix needed.**
- `/login` → HTTP 200 with the form on the merged build against live data.

**Provisional:** Q2 auth posture needs ก๊อต ratification — ping ก๊อต on LINE.

**Note — doc fix for later:** [`poom-phase-b-prep.md`](poom-phase-b-prep.md)
writes the table as `tb_user`; the real ported table is **`tb_users`** (plural,
lowercase columns `userid`/`usertel`/`userpass`/`userstatus`).

---

## 4. 🔴 Open question for เดฟ — the B-auth ↔ customer-portal boundary

B-auth provisions the Supabase **`auth.users`** row for a migrated customer on
first login. It deliberately does **not** create a Pacred **`profiles`** row —
Q2 scoped B-auth to authentication only, and creating a `profiles` row would
overlap the customer-portal-backend rework (B-0 / a Wave-1 slice). Guessing
`account_type` or fighting the `member_code` trigger would also risk a wrong row.

**Consequence:** a bridged customer has a valid session, but
`getCurrentUserWithProfile()` returns `profile: null`, so a protected page that
reads the profile breaks until the customer-portal rework lands on `tb_*`.

**Decision needed:** does the **auth-bridge** create a minimal `profiles` row on
first login, or does the **customer-portal Wave-1 slice** own profile-on-`tb_*`?
If both do it they collide. Per the brief — "ping เดฟ before a fresh slice; note
back when you need an architectural call on the `tb_*` ↔ rebuilt-schema
coexistence" — this is exactly that call. ภูม holds the auth-bridge and is ready
to implement whichever side เดฟ assigns.

---

## 5. Resume on the office computer (2026-05-20)

### 5.1 Sync the code
```bash
cd <pacred-web on the office machine>
git fetch origin
git checkout Poom
git pull --ff-only origin Poom
pnpm install
```
If using a Claude worktree there: `git fetch origin && git merge origin/dave`.

### 5.2 `.env.local` — get it onto the office machine

`.env.local` is **gitignored** (real secrets — never in git). Recreate it on the
office machine, fastest path first:

1. **Copy the file directly (recommended)** — before leaving this machine, send
   `.env.local` to yourself via the Pacred LINE OA self-chat (or USB / drive); on
   the office machine paste it to the project root.
2. **`vercel env pull .env.local`** — pulls what is set in Vercel (note: Vercel
   carries the prod/preview values; the **dev** Supabase keys below still need
   the manual copy).

**Template** — every var; non-secret values filled, `🔑` = copy the value from
this machine's `.env.local`:

```
# Supabase — D1 DEV project (pprrlabgebrnocthwdmg) — Phase-A tb_* data loaded
NEXT_PUBLIC_SUPABASE_URL=https://pprrlabgebrnocthwdmg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=        # 🔑 public anon key (Supabase → Settings → API)
SUPABASE_SERVICE_ROLE_KEY=            # 🔑 SECRET — never commit

NEXT_PUBLIC_SITE_URL=http://localhost:3000

OTP_BYPASS=true
OTP_PEPPER=change-this-random-string-in-prod   # dev: any string is fine

SMS_PROVIDER=thaibulksms
THAIBULKSMS_API_KEY=YOUR_API_KEY      # dev placeholder (OTP_BYPASS=true → SMS unused)
THAIBULKSMS_API_SECRET=YOUR_API_SECRET
THAIBULKSMS_SENDER=Pacred

LINE_PUSH_BYPASS=true
LINE_CHANNEL_ID=2009931373
LINE_CHANNEL_SECRET=                  # 🔑 SECRET
LINE_CHANNEL_ACCESS_TOKEN=            # 🔑 SECRET
LINE_LOGIN_CLIENT_ID=2010105778
LINE_LOGIN_CLIENT_SECRET=             # 🔑 SECRET
NEXT_PUBLIC_LIFF_ID=2010105778-SaSkkGza

PACRED_TAMIT_DETAIL_URL=https://tamit-cloud.com/api-product
PACRED_TAMIT_CACHE_URL=https://tam-i-t.com/api/convert-link-china
PACRED_AKUCARGO_API_URL=https://akucargo.com/api3/api-2022
PACRED_LAONET_API_URL=https://laonet.online
PACRED_LAONET_KEY=                    # value documented in env.md §5

NEXT_PUBLIC_YUAN_RATE=5.00
```
The remaining catalog vars (`PROMPTPAY_ID` · `RESEND_*` · `CRON_SECRET` ·
`UPSTASH_*` · `HCAPTCHA_*` · `SENTRY_*` · `GTM`/`Clarity` · `MOMO_JMF_TOKEN`) are
not in the dev `.env.local` yet — optional for Phase-B dev work. Full catalog +
"where to get it" → [`../env.md`](../env.md).

### 5.3 Verify it runs
```bash
pnpm dev          # → http://localhost:3000
pnpm verify       # lint + tsc + test:unit + audit — all exit 0
```

---

## 6. Branch + migration state

- `Poom` = `dave` (`080b79e` + เดฟ's `0087` batch) + the B-auth commit `ade9ed0`.
  Pushed to `origin/Poom`. เดฟ pulls `origin/Poom` to consolidate.
- Migrations: `0001`-`0087` exist (`0065` is an intentional gap). `0081`-`0083` =
  Phase-A legacy schema · `0084`-`0086` = ภูม's frozen Phase-C batch · `0087` =
  เดฟ's `v_pcs_migration_status` security-invoker fix. **Next free for new
  Phase-B work = `0088`.**

---

## 7. Cross-links

- 🧭 D1 ADR → [`../decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
- 🚚 Phase-A runbook → [`../runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md)
- 🛠 Phase-B per-stage prep → [`poom-phase-b-prep.md`](poom-phase-b-prep.md)
- 🗺 Phase-B gap map → [`d1-phase-b-gap-map.md`](d1-phase-b-gap-map.md)
- ❓ 6 open questions + เดฟ answers → [`poom-d1-open-questions.md`](poom-d1-open-questions.md)
- 👷 ภูม brief → [`../briefs/poom.md`](../briefs/poom.md)
- 🔐 Env catalog → [`../env.md`](../env.md)

---

**ลุยต่อนะ ภูม 💪** — B-auth ส่งแล้ว + verify กับ data จริงผ่าน · รอเดฟเคลียร์เรื่อง `profiles` row · พรุ่งนี้ที่ออฟฟิศ sync + ตั้ง `.env.local` ตาม §5 แล้วลุย Phase-B review ต่อ
