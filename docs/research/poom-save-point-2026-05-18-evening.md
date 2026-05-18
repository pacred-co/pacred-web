# 🏠 ภูม — Save-point 2026-05-18 evening (going home · resume at home machine)

> **Save snapshot.** ภูม heading home, resuming on a different machine.
> This doc = everything you need to pick up where you left off.
>
> **Last commit on Poom:** check `git log -1` (see "When you land at home" §3).
> **Direction:** D1 — Pacred = faithful PCS Cargo port (per [ADR-0017](../decisions/0017-pacred-faithful-pcs-port.md)).

---

## 1. TL;DR — where we are right now

🟢 **Today (2026-05-18) at the work machine — DONE:**
- Synced dave → Poom (D1 pivot, ADR-0017, new brief, Phase-A runbook, auth bridge code)
- Renumbered Phase-C migrations `0081-0083` → `0084-0086` (freed `0081-0083` for เดฟ Phase A)
- Drafted `docs/research/poom-phase-b-prep.md` (per-stage Phase-B spec)
- Posted `docs/research/poom-d1-open-questions.md` (6 blocker questions)
- **เดฟ answered Q1·Q3·Q4·Q5·Q6 in commit `9611c24`** — Q2 still needs ก๊อต ratification

🔴 **Now P0 priority (per [team-status-2026-05-18.md](../runbook/team-status-2026-05-18.md) §"Per-role pickup"):**
- **DB-1 — apply migration backlog `0058-0080` to PROD Supabase** (22 idempotent additive migrations including the launch-integrity money/security guards `0060-0064`). **Do this BEFORE Phase B starts.**
- Then Phase B B-0 → B-auth → B-4..B-9 per the prep doc.

⏸ **Phase C paused** (BK-1 booking · IC-1 chat · V-E1.1 freight · R3 credit-note · all my 13 commits today). Code is BANKED in dave — reactivates after Phase B done.

---

## 2. The 6 questions เดฟ answered (read inline at `docs/research/poom-d1-open-questions.md`)

| Q | Decision (✅ = locked · 🟡 = needs ก๊อต) |
|---|---|
| **Q1** Phase-A migration split | ✅ **3 files** `0081_pcs_legacy_schema.sql` + `0082_pcs_legacy_indexes.sql` + `0083_pcs_legacy_member_seq.sql` · ภูม next-free for Phase-B = `0087` |
| **Q2** Auth-bridge session pattern | 🟡 **(a) refined** — provision-on-first-login using the customer's own plaintext password (no shared secret) · **needs ก๊อต ratification** before B-auth ships |
| **Q3** 8 special userIDs | ✅ **(c)** Rewrite `PCS<letters>→PR<letters>` (PCSTT/PCSCARGO/PCSARNON/PCSFAM) · keep no-prefix verbatim (PW/JET/FCL/AIGA) |
| **Q4** New-customer numbering | ✅ **Lowest-vacant `PR<n>`** |
| **Q5** Phase-C migrations `0084-0086` apply | ✅ **Freeze until Phase B done** · DB-1 backlog = `0058-0080` only |
| **Q6** `tb_user.userType` segmentation | ✅ **1:1 carry for Phase B** · normalised view = Phase C |

→ ภูม **unblocked for B-0 + B-auth**. Treat B-auth as provisional until ก๊อต ratifies Q2.

---

## 3. When you land at home — exact resume sequence

### 3.1 Sync the code

```bash
# at home machine — pacred-web main directory
cd ~/pacred-web    # or wherever your home checkout is

git fetch origin
git checkout Poom
git pull --ff-only origin Poom

pnpm install       # in case package.json drifted
```

If you also use the Claude worktree at home:

```bash
cd ~/pacred-web/.claude/worktrees/<your-worktree>
git fetch origin
git merge origin/Poom --ff-only
```

### 3.2 Get the `.env.local` (gitignored — won't come via pull)

`.env.local` is gitignored on purpose (contains real secrets). At home, choose ONE of:

- **Option A — LINE-self chat (recommended fast path):**
  At work machine, open the Pacred LINE OA (`@683wolja`) → chat-to-self → paste content of `.env.local` (the whole file). At home, open the same chat → copy → save as `.env.local` in the project root.

- **Option B — Vercel env vars (canonical truth):**
  https://vercel.com → Pacred project → Settings → Environment Variables. Many are already set there (incl. LIFF + LINE creds from ก๊อต). Pull via `vercel env pull .env.local`.

- **Option C — Copy via USB / OneDrive / Google Drive temporary share** (delete after).

**At minimum the home `.env.local` must contain** (see [`docs/env.md`](../env.md) for source / acquisition for each):

```
# Supabase (current dev project = pprrlabgebrnocthwdmg)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Site URL (dev)
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# OTP — dev bypass + pepper
OTP_BYPASS=true
OTP_PEPPER=

# SMS (ThaiBulkSMS) — placeholders fine for dev
SMS_PROVIDER=thaibulksms
THAIBULKSMS_API_KEY=YOUR_API_KEY
THAIBULKSMS_API_SECRET=YOUR_API_SECRET
THAIBULKSMS_SENDER=Pacred

# LINE — set by ก๊อต 2026-05-18 (Pacred Shipping OA @683wolja)
LINE_PUSH_BYPASS=true                          # DO NOT flip to false in dev unless testing against own LINE user
LINE_CHANNEL_ID=2009931373                     # Messaging API channel
LINE_CHANNEL_SECRET=                           # secret (from LINE Console)
LINE_CHANNEL_ACCESS_TOKEN=                     # long-lived (from LINE Console)
LINE_LOGIN_CLIENT_ID=2010105778                # LINE Login channel (powers LIFF)
LINE_LOGIN_CLIENT_SECRET=                      # secret (from LINE Console)
NEXT_PUBLIC_LIFF_ID=2010105778-SaSkkGza        # LIFF app ID

# 3rd-party APIs
PACRED_TAMIT_DETAIL_URL=https://tamit-cloud.com/api-product
PACRED_TAMIT_CACHE_URL=https://tam-i-t.com/api/convert-link-china
PACRED_AKUCARGO_API_URL=https://akucargo.com/api3/api-2022
PACRED_LAONET_API_URL=https://laonet.online
PACRED_LAONET_KEY=tam011plus@gmail.com

# Yuan rate fallback
NEXT_PUBLIC_YUAN_RATE=5.00
```

**Still missing — ask ก๊อต** (per the earlier env-audit chat we had today):
- `PROMPTPAY_ID` · `RESEND_API_KEY` + `RESEND_FROM` · `CRON_SECRET` · `UPSTASH_REDIS_REST_URL`/`_TOKEN` · `HCAPTCHA_SECRET_KEY` + `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` · `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_WEBHOOK_SECRET` · `NEXT_PUBLIC_GTM_ID` · `NEXT_PUBLIC_CLARITY_ID` · `MOMO_JMF_TOKEN`

### 3.3 Verify everything works

```bash
pnpm dev                         # should start on :3000 with no env errors
# open http://localhost:3000/status → all rows you have keys for should be green
```

---

## 4. What to work on first at home

**P0 — DB-1 (apply migration backlog to PROD Supabase)** — per team-status-2026-05-18 §"Per-role pickup · ภูม":

1. Verify DB-0 (eเดฟ's check) — confirm which migrations are currently on prod. The launch (2026-05-17) shipped on migrations up to ~`0057`; everything `0058-0080` has accumulated unapplied.
2. Apply `0058-0080` to prod Supabase in **ascending order**, skipping the 3 Phase-C ones (`0084-0086` are frozen per Q5).
3. Includes the **launch-integrity guards** `0060-0064` (S-1 RLS keystone · wallet-overdraw floor · money-idempotency guards). **P0 regardless of D1** — if DB-0 shows these are not on prod, applying them is critical.
4. Apply via Supabase Dashboard → SQL Editor → paste content of each file → Run.
5. Each migration is idempotent (drop+add pattern, `if not exists` everywhere).
6. Update [`docs/runbook/team-status-2026-05-18.md`](../runbook/team-status-2026-05-18.md) §"Prod-Supabase DB work" with what was applied.

**P1 — Phase B B-0 (data foundation) + B-auth wire** — per [`poom-phase-b-prep.md`](poom-phase-b-prep.md):

- B-0 = re-point `lib/supabase/*` + actions at the `tb_*` schema (gated on Phase A loading to dev Supabase first — เดฟ does that)
- B-auth = wire `verifyLegacyPassword` into `actions/auth.ts:signInWithPassword` using the **Q2 (a) refined** pattern (provision on first login with customer's own plaintext password) — mark as **provisional pending ก๊อต ratification**

**P2 — draft Phase-B migrations** while Phase A still loading:

- `0087_status_vocab_reconcile.sql` — extend orders/forwarders/shipments status CHECK to accept legacy integer codes
- `0088_admin_role_triple.sql` — extend `admins.role` to legacy company/department/section triple shape

---

## 5. Branch state at save-point

```
main           = dave = origin/Poom (= my latest commit before push of this doc)
Poom (mine)    = N commits ahead of dave (this save-point doc + …)
Phase C work   = 13 commits ALREADY in dave (BK-1 · IC-1 · V-E1.1 · R3 · LINE wire · …)
                 → paused per Q5, code is banked + ready to reactivate post-Phase-B
Migrations     = main applied: 0001-0057 (per team-status §DB-0 hypothesis)
                 backlog to apply: 0058-0080 (P0)
                 frozen until Phase B: 0084-0086 (my Phase-C)
                 reserved for เดฟ Phase A: 0081-0083
                 next free for ภูม Phase B: 0087+
```

---

## 6. ก๊อต must do (NOT ภูม's job — track only)

- 🔴 **Ratify [ADR-0017](../decisions/0017-pacred-faithful-pcs-port.md)** (D1 = "Accepted — pending ก๊อต ratification")
- 🔴 **Ratify Q2 auth-bridge posture** (in [`poom-d1-open-questions.md`](poom-d1-open-questions.md) — เดฟ's lean is provision-on-first-login with customer's own password; ก๊อต confirms before B-auth ships)
- 🔴 **แต้ม hand-over** — final `pcsc_main` dump · customer upload files (`images/users` · `images/shops` · `storage/file` · `storage/slip`) · JMF API spec
- ⏳ **A-5 production load gate** — when เดฟ readies it
- 🟡 **LINE_CHANNEL_SECRET rotation** within 30d (was shared via chat during setup — see [env.md §11](../env.md))

---

## 7. Open questions still hanging (low priority — not blocking)

- The 8 still-missing env vars (PROMPTPAY_ID / RESEND_* / CRON_SECRET / UPSTASH_* / HCAPTCHA_* / SENTRY_* / GTM / Clarity / MOMO_JMF) — ask ก๊อต when you have a chance; not blocking Phase B work but blocks specific surfaces (wallet QR · email fallback · cron auth · analytics · etc.)
- ก๊อต to clear the JMF API spec with แต้ม (blocks MOMO container tracking — Phase C anyway)

---

## 8. If you need to verify the current Poom branch state at home

```bash
git log --oneline -15           # see the latest commits
git status                      # should be clean (only .env.local + .claude/settings.local.json dirty)
pnpm verify                     # lint + tsc + tests + audit — should all exit 0
```

If `pnpm verify` fails on `audit:env`, you're missing an env var listed in `.env.example` — see §3.2 above for the full list.

---

## 9. Quick reference — recently-shipped Poom commits (today)

```
52ad151  ⚠️ ภูม → เดฟ + ก๊อต — 6 Phase-B open questions
a248696  D1 pivot: renumber 0081-0083 → 0084-0086 + Phase-B prep spec
8e9e276  IC-1 internal per-job chat (foundation + 3 agents)
ffa81b1  R3 G2e-2 ใบลดหนี้ (credit note)
07f90c8  R1 V-E1.2.1 customer self-accept on quotes + cleanup
776efbf  LINE keys live + comment cleanup
dd7500c  V-G5.1.1 org_contacts → /contact wire
f30dd62  V-E1.1 G3 value-block editor + cleanup
e9107c2  BK-1 G1+G2 doc-attach + admin transitions
dd3d9b0  V-E1.1 CustomerPicker (replace paste-UUID input)
9566e85  BK-1 booking-flow MVP (4 shadow-clone agents)
8d4b751  U1/U2 launch-week review fixes
```

After this save-point doc is committed → `dave` will receive these once เดฟ merges (some already merged in `f9e5759` + `2fdd416` per the team-status).

---

## 10. Cross-references

- 🧭 D1 ADR → [`../decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md)
- 📋 Team-status 2026-05-18 → [`../runbook/team-status-2026-05-18.md`](../runbook/team-status-2026-05-18.md) **(read this first at home)**
- 🚀 Phase plan → [`../UPGRADE_PLAN.md`](../UPGRADE_PLAN.md) (Phase A/B/C structure)
- 🚚 Phase-A migration runbook → [`../runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md)
- 🎯 Phase-B gap map → [`d1-phase-b-gap-map.md`](d1-phase-b-gap-map.md)
- 🛠 ภูม Phase-B per-stage prep → [`poom-phase-b-prep.md`](poom-phase-b-prep.md)
- ❓ ภูม 6 open questions + เดฟ answers → [`poom-d1-open-questions.md`](poom-d1-open-questions.md)
- 👷 ภูม brief → [`../briefs/poom.md`](../briefs/poom.md)
- 🔐 Env catalog → [`../env.md`](../env.md)
- 🗄 Migration runbook → [`../../supabase/migrations/README.md`](../../supabase/migrations/README.md)

---

**ลุยต่อนะ ภูม 💪** — สรุปคือ pivot ใหญ่ + DB-1 P0 ก่อนทุกอย่าง · save-point ปิด · main tree + Poom synced
