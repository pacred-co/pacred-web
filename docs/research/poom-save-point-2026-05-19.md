# 🏠 ภูม — Save-point 2026-05-19 (B-auth shipped · Wave 1 merged + verified · → company machine)

> **Save snapshot.** ภูม resuming on the company computer next session.
> Full Phase-B plan + Wave-1 analysis + resume guide + handoff to เดฟ.
> Previous: [`poom-save-point-2026-05-18-evening.md`](poom-save-point-2026-05-18-evening.md).

---

## 📨 สรุปส่งเดฟ — read this first

**`Poom` now = `dave` (incl. Wave 1) + B-auth — merged + verified.** This session:

- **B-auth shipped** (`ade9ed0`) — the legacy PCS password bridge is wired into
  `signIn`; verified against the live `tb_users` (8,898 rows) — every assumption
  holds, **no code fix needed**.
- **Wave 1 merged + verified** — เดฟ+Claude's 4 Phase-B slices (9-icon launchpad ·
  customer order-flow · admin RBAC sidebar+badges · `tb_cnt` payment ledger)
  merged `dave`→`Poom`. The merged tree (Wave 1 + B-auth) passes **`pnpm verify`
  + `pnpm build`** clean.
- Save-point doc + this analysis pushed to `origin/Poom`.

**🔴 The finding เดฟ needs to see — `B-0` is the missing layer.** Wave 1 delivered
the legacy **UI / structure** fidelity (the icon grid, per-role sidebar, badge
mechanism, the `tb_cnt` ledger) — but most slices still **read the rebuilt-era
schema, not the ported `tb_*`**:

- `tb_cnt` payment ledger → ✅ uses the legacy `tb_cnt*` tables faithfully.
- admin sidebar badge counts (`actions/admin/sidebar-counts.ts`) → counts
  `service_orders` / `forwarders` / … (rebuilt-era) — **0 `tb_*`**.
- 9-icon launchpad (`dashboard/page.tsx`) → **0 `tb_*`** refs.

→ A migrated customer logs in (B-auth ✅) but the 9-icon home reads
`profiles` / `service_orders`, where their data **isn't** — Phase A loaded it
into `tb_*`. **`B-0` (re-point reads at `tb_*`) is the connective layer that
makes Wave 1 show the real legacy data.** Recommend `B-0` as the next wave — it
also resolves the B-auth ↔ `profiles` question (§5).

Q2 auth posture still provisional pending ก๊อต ratification.

---

## 1. TL;DR — where we are (2026-05-19)

🟢 **Phase A — DONE.** Legacy `pcsc_main` loaded into Supabase dev + prod — 117
`tb_*` tables, 114 with data (8,898 customers · orders · wallets · ตู้ ·
forwarders · receipts · the `userpass` login hashes), `PCS→PR` rebrand, RLS on.
Migrations `0081`-`0083` + `0087`. (3 oversized log tables wait for the Pro upgrade.)

🟢 **B-auth — DONE + verified** (§3).

🟢 **Wave 1 — landed on `dave`, merged into `Poom`, verified** (§4) — the first 4
Phase-B fidelity slices.

🟡 **`B-0` (data foundation — re-point reads at `tb_*`) — NOT done** — and it is
the gap that makes Wave 1's UI actually show the real legacy data (§4, §5).

🔱 Phase-B is เดฟ+Claude agent-wave-driven. ภูม: pull `dave`, review/verify each
landed slice; the auth-bridge stays ภูม's; ping เดฟ before taking a fresh slice.

---

## 2. The Phase-B plan (D1 · ADR-0017)

**D1 = Pacred becomes a faithful port of the legacy PCS Cargo system, `PCS`→`PR`.**

- **Phase A — data migration.** ✅ Done.
- **Phase B — workflow fidelity.** Rework the app so menus / job statuses /
  container (ตู้) flow / the end-to-end logic-loop match legacy PCS **exactly** —
  zero retraining. Stages (`B-0`..`B-9`) in [`poom-phase-b-prep.md`](poom-phase-b-prep.md):
  - **B-0** data foundation — re-point `lib/supabase` + actions at `tb_*` — 🟡 **next**
  - **B-auth** legacy-password login — ✅ **DONE** (§3)
  - **B-2** status-vocab reconcile · **B-3** customer logic-loop · **B-4** per-role
    admin sidebars + badges · **B-5** ship→arrive→pay forwarder · **B-6** `tb_cnt`
    ledger · **B-7** barcode scan family · **B-8** accounting · **B-9** QA / notes /
    Learning / Extension / segmentation
  - Wave 1 (§4) delivered the UI for B-1/B-3/B-4/B-6; `B-0` is the data layer.
- **Phase C — Pacred enhancements.** *Only after* the faithful port works. Tier
  0-3, booking flow, freight expansion, internal systems — deferred; append to
  docs, don't build.

**The lens (owner directive, 2026-05-19):** copy the legacy system 100% — every
button, every function — FIRST; exact legacy reproduction over "the better way"
every time; enhancements only after. Don't chase far-from-the-customer work;
consult before deciding scope.

---

## 3. B-auth — DONE + verified

**Commit `ade9ed0`** (`origin/Poom`) — `feat(b-auth): legacy PCS password bridge
wired into sign-in`.

**Files:**
- `lib/auth/pcs-legacy-bridge.ts` (new · server-only) — `bridgeLegacyLogin()`:
  look up `tb_users` by phone / member code / email → `verifyLegacyPassword`
  against the `passTam` hash → provision the Supabase user with the password just
  typed → sign in. Safe no-op when `tb_users` is absent.
- `lib/auth/pcs-legacy-password.ts` — added `legacyPhoneCandidates` +
  `legacySyntheticEmail` (+ 12 unit tests).
- `actions/auth.ts:signIn` — native Supabase auth first; on failure →
  `bridgeLegacyLogin` fallback.

**Verified:** static gate (`tsc` · `lint` · `test:unit` 34/34 · `build`) green ·
real-data inspection vs dev `tb_users` (8,898 rows): `usertel` = 10-digit
`0xxxxxxxxx` · `userid` = `PR<n>` + the 4 no-prefix handles `PW`/`JET`/`FCL`/`AIGA`
· `userstatus` 1/0 · `useremail` null ~94% — all assumptions hold, **no code fix
needed** · `/login` → HTTP 200 on the merged build.

**Provisional:** Q2 auth posture needs ก๊อต ratification — ping ก๊อต on LINE.

**Doc fix for later:** [`poom-phase-b-prep.md`](poom-phase-b-prep.md) writes
`tb_user`; the real ported table is **`tb_users`** (plural, lowercase columns).

---

## 4. Wave 1 — landed on `dave` (analysis + review notes)

เดฟ+Claude's agent-wave delivered 4 Phase-B slices (8 commits · 4,052 insertions /
21 files), merged `dave`→`Poom` this session:

| Slice | Commit | Delivered | Data source |
|---|---|---|---|
| Customer 9-icon launchpad | `4ac5d9d` | `pcs-icon-grid` / `-launchpad-header` / `-sales-rep-card` / `-wallet-card` + `dashboard/page.tsx` — restores the legacy `member/menu.php` icon grid | rebuilt-era (0 `tb_*`) |
| Customer order-flow fidelity | `8dfd5f3` | `service-order-list` (tab-per-status) + `add-form` + receipt | rebuilt-era |
| Admin per-role RBAC sidebar + badges | `8a23823` | `admin-sidebar.tsx` + `lib/admin/sidebar-menu.ts` (701) + `actions/admin/sidebar-counts.ts` — per-role menu + live-count pills | counts rebuilt-era |
| Admin `tb_cnt` payment ledger | `8f6054c` | `actions/admin/pcs-container-payments.ts` (474) + `accounting/container-payments/*` (6 files) | ✅ legacy `tb_cnt*` |

**Verified:** the merged tree (Wave 1 + B-auth) passes `pnpm verify` (lint · tsc ·
test:unit · audit) + `pnpm build`. i18n parity holds (2327/2327; 10 new keys
flagged "same value" — all legitimate proper nouns / codes — soft warning only).

**Review finding (for เดฟ + next session):** Wave 1 reproduces the legacy **UI /
structure** faithfully — but only the `tb_cnt` ledger reads the ported `tb_*`
data. The 9-icon home, the sidebar badge counts and the order-flow still read the
**rebuilt-era** tables (`profiles` / `service_orders` / `forwarders` / …), which
do **not** hold the 8,898 migrated customers' data (Phase A loaded that into
`tb_*`). **Net: Wave 1 is the faithful skin; `B-0` (re-point reads at `tb_*`) is
the faithful data underneath.** Until `B-0` lands, a migrated customer logs in via
B-auth ✅ but the 9-icon home renders empty, and admin badge counts read the
near-empty rebuilt tables. **Deeper per-slice fidelity QC against the legacy PHP
is the next-session review task.**

---

## 5. 🔴 Open for เดฟ

1. **`B-0` next.** Re-point `lib/supabase` + the customer/admin actions at `tb_*`
   ([`poom-phase-b-prep.md`](poom-phase-b-prep.md) §B-0). Without it Wave 1's UI
   shows rebuilt-era (near-empty) data, not the live 8,898-customer legacy data.
   Highest-leverage unblocker — recommend it as the next wave.
2. **The B-auth ↔ `profiles` boundary (folds into `B-0`).** B-auth provisions the
   Supabase `auth.users` row but not a `profiles` row, so
   `getCurrentUserWithProfile()` returns null for a bridged customer. `B-0` owns
   the `tb_*`↔`profiles` identity bridge — whoever does `B-0` creates/maps the
   profile. ภูม holds the auth-bridge and will wire whatever `B-0` decides.

---

## 6. Resume on the company computer

### 6.1 Sync the code
```bash
cd <pacred-web on the company machine>
git fetch origin
git checkout Poom
git pull --ff-only origin Poom
pnpm install
```
If using a Claude worktree there: `git fetch origin && git merge origin/dave`.

### 6.2 `.env.local` — get it onto the company machine

`.env.local` is **gitignored** (real secrets — never in git). Recreate it,
fastest path first:

1. **Copy the file directly (recommended)** — send `.env.local` to yourself via
   the Pacred LINE OA self-chat (or USB / drive); paste it to the project root.
2. **`vercel env pull .env.local`** — pulls what is set in Vercel (note: Vercel
   carries prod/preview values; the **dev** Supabase keys below still need the
   manual copy).

**Template** — non-secret values filled; `🔑` = copy the value from a machine
that already has `.env.local`:

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
"where to get it" → [`../env.md`](../env.md) (§1 names the D1 dev/prod projects).

### 6.3 Verify it runs
```bash
pnpm dev          # → http://localhost:3000
pnpm verify       # lint + tsc + test:unit + audit — all exit 0
```

---

## 7. Branch + migration state

- `Poom` = `dave` (`2b800fb` — incl. Wave 1) + B-auth (`ade9ed0`) + the save-point
  docs. Pushed to `origin/Poom`. `origin/main` is unchanged (held production).
  เดฟ pulls `origin/Poom` to consolidate.
- Migrations: `0001`-`0087` exist (`0065` is an intentional gap). `0081`-`0083` =
  Phase-A legacy schema · `0084`-`0086` = ภูม's frozen Phase-C batch · `0087` =
  เดฟ's `v_pcs_migration_status` security-invoker fix. Wave 1 added no migrations.
  **Next free for new Phase-B work = `0088`.**

---

## 8. Cross-links

- 🧭 D1 ADR → [`../decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
- 🚚 Phase-A runbook → [`../runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md)
- 🛠 Phase-B per-stage prep → [`poom-phase-b-prep.md`](poom-phase-b-prep.md)
- 🗺 Phase-B gap map → [`d1-phase-b-gap-map.md`](d1-phase-b-gap-map.md)
- ❓ 6 open questions + เดฟ answers → [`poom-d1-open-questions.md`](poom-d1-open-questions.md)
- 👷 ภูม brief → [`../briefs/poom.md`](../briefs/poom.md)
- 🔐 Env catalog → [`../env.md`](../env.md)

---

**ลุยต่อนะ ภูม 💪** — B-auth + Wave 1 อยู่บน `Poom` หมดแล้ว verify ผ่าน · งานต่อไป
= `B-0` (re-point `tb_*`) ให้ Wave 1 โชว์ data จริง · พรุ่งนี้ที่บริษัท sync + ตั้ง
`.env.local` ตาม §6 แล้วลุย review Wave 1 เชิงลึกเทียบ PHP เดิม
