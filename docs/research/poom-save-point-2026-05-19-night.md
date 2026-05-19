# 🚨 Save-point — 2026-05-19 night (DIRECTION SHIFT to 1:1 port)

> **Read me FIRST when resuming.** This is the master handoff doc for the
> 2026-05-19 evening direction change. ภูม leaves the office machine here
> and resumes on the home machine — pulls `Poom-pacred` and continues the
> admin 1:1 transcription work.

---

## 1. TL;DR — what just changed

The owner (พี่ป๊อป) reaffirmed the 100%-sameness rule. เดฟ pivoted the team
to a **literal 1:1 transcription** of legacy PHP → Next.js (PCS → PR rebrand
only · no design decisions). The pacred-web V3 work (where Wave A/B/R1
shipped today on `Poom`) is **deferred** in favour of the new lane.

### The new branch loop (USE THIS · NOT `main → dave → Poom`)

```
   ภูม                 เดฟ                  integration            production
┌───────────┐      ┌────────────┐         ┌──────────────┐       ┌──────────┐
│Poom-pacred│ ───▶ │dave-pacred │ ─merge▶│faithful-port │ ──▶  │   main   │
└───────────┘      └────────────┘         └──────────────┘       └──────────┘
  pull · work      เดฟ pulls               เดฟ integrates           ก๊อต gate
  push origin      coordinates             podeng + 1:1            (Vercel)
                   reviews
```

**The OLD loop (`main → dave → Poom`) is FROZEN** until เดฟ explicitly says
to resume. All sidebar fidelity / Wave A/B/R / IA restructure work on
`origin/Poom` is preserved (and was already merged into `faithful-port` via
เดฟ's integration on 2026-05-19 afternoon — none of it is lost) but no
further commits land on `Poom` until further notice.

---

## 2. Branch state — 2026-05-19 night

| Branch | SHA | Purpose | Status |
|---|---|---|---|
| `main` | `b760f69` | production · Vercel deploy target | ก๊อต-owned · production-only |
| `faithful-port` | `162f72e` | pre-production integration target | เดฟ merges into this · ก๊อต reviews |
| `dave-pacred` | `0016993` | เดฟ's 1:1 port working branch | active · เดฟ + customer batches |
| **`Poom-pacred`** | `0016993` | **ภูม's 1:1 port working branch** | **active · ภูม admin transcription** |
| `Poom` | `0b83965` | V3 work (this morning's Wave A/B/R1) | 🟡 FROZEN · do not push |
| `dave` | `0b83965` | V3 lane | 🟡 FROZEN |
| `podeng` | `a3f38ca` | ปอน's frontend | active in V3 lane · pivot pending |

**Note:** `dave-pacred == Poom-pacred` as of 2026-05-19 17:32 — เดฟ created
`Poom-pacred` as a fresh copy of `dave-pacred` for ภูม to work on.

---

## 3. Work already shipped on `dave-pacred / Poom-pacred`

### เดฟ + agents (2026-05-19 afternoon-evening · customer-portal pilot batch)
- `7e1dce2` — Transcription runbook (`docs/runbook/faithful-port-transcription.md`)
- `13bf18a` — Pilot: `menu.php` → `/dashboard` (1:1 · pattern establisher)
- `da4cd79` — CSS-loading fix (Tailwind v4 PostCSS workaround · `<link>` not `@import`)
- `162f72e` — Pilot fixes + team plan (= `faithful-port` HEAD)
- `3011f94` — `china-address.php` → `/china-address`
- `f145351` — `search.php` → `/search` (China product search)
- `1a20982` — `account-settings.php` → `/account-settings`
- `d49acc5` + `727ca65` — merge agent worktrees
- `0016993` — batch-1 integration commit

### Wave 2 (V3 era · preserved in faithful-port via the pre-pivot merge)
- `ccfb54b` — bridge provisions profiles on first login · `lib/legacy-status-map.ts`
- `03dc8e7` — admin sidebar-counts + customer list → `tb_*`
- `c2ac736` — customer portal reads → `tb_*` (B-1 launchpad · B-3 order flow)
- `9844fea` — signup hCaptcha + SMS ordering fix

### V3 lane (ภูม's earlier today · preserved via the merge)
The 7 commits on `Poom` (a51e338 · d0319f5 · 0fff0a4 · d038128 · 8328136 ·
0b83965 merge) **are reachable from `faithful-port`** through the
`0b83965 Merge origin/Poom` ancestry. None of the audit docs / Wave A/B /
R1 / migration `0089` work is lost.

---

## 4. ภูม's lane on the new loop

**ภูม = admin transcription** · 187 legacy `pcs-admin/*.php` files.

### Source location (this machine — ภูม downloaded earlier today)
```
C:\Users\Admin\pcscargo\
├── member\                      (42 customer-portal .php files — ปอน's lane)
├── member\pcs-admin\            (187 admin entry .php — ภูม's lane)
├── member\pcs-admin\include\    (sub-pages + helper PHP)
└── member\pcs-admin\include\pages\left-menu\OOP\
                                 (19 menu PHP files = the canonical IA)
```

### Pattern (mirror customer pilot — see runbook + dashboard/page.tsx)
1. Read the legacy `.php` + its `include`s
2. JSX = exact Bootstrap-4 markup (Modern Admin template)
3. SQL = exact same WHERE/ORDER BY · run via `createAdminClient()` (service-role)
4. `PCS → PR` branding ONLY · no design improvement
5. Wrap content in `<div className="pcs-legacy">` for CSS scoping
6. Load legacy CSS via `<link rel="stylesheet" href="/legacy/pcs/...">` (NOT `import`)
7. `requireAdmin([roles])` gate (keep Pacred auth · runbook §3)
8. `export const dynamic = "force-dynamic"`

### Admin pilot in flight (background agent · check at home)
- **Target:** `admin-table.php` → `/admin/admins/page.tsx` (REPLACE V3 version)
- **Scope:** default list view ONLY (sub-routers `?page=add/edit/detail` = future pilots)
- **Bonus:** establishes admin legacy CSS base at `public/legacy/pcs/admin/`
  (first admin transcription → first admin CSS setup · ThemeForest "Modern
  Admin" Bootstrap-4 theme)
- Agent ID: `ac72a08d082fe8370` — output at the tasks folder

If pilot agent's output is still pending when ภูม pulls at home:
- Re-fetch + check `origin/Poom-pacred` for the pilot commit
- If not pushed: pilot agent didn't finish in time · re-launch from home
- If pushed: pull + continue with next admin screen

---

## 5. Per-role lanes + work-split

Per [`docs/runbook/faithful-port-transcription.md`](../runbook/faithful-port-transcription.md) §5:

| Role | Lane | Currently doing |
|---|---|---|
| **ปอน** | Customer portal (~25-30 `member/*.php`) | Customer batch-2 next (เดฟ did batch-1) |
| **ภูม** | Admin back-office (187 `pcs-admin/*.php`) | Admin pilot `admin-table.php` in flight |
| **ก๊อต** | Fidelity review + borrowed-API watch + production gate | Reviews each transcribed screen vs legacy · controls Vercel + domain |
| **เดฟ** | Integrate · drive · spawn parallel worktree agents | Integrating customer + admin into faithful-port |

**Rule:** one owner per screen · coordinate via เดฟ before claiming a batch.

---

## 6. PCS → PR data porting (the 1:1 table map)

This is the **canonical 1:1 mapping** the team uses for every transcribed query.

### Member code
- Legacy: `PCS<n>` (`tb_users.userid`, e.g. `PCS169`)
- Pacred: `PR<n>` (same integer · `PR + min-3-digit` running per migration `0060`,
  e.g. `PR169`)
- The two are joined by integer — `tb_users.userid` ↔ `profiles.member_code`
  (the bridge maps on first login)

### Schema map (the canonical reference)
**Authoritative source:** `docs/runbook/pcs-data-migration.md` §3 (the
`pcsc_main` → `tb_*` load) + `docs/research/wave-1-fidelity/_SYNTHESIS.md`
§7 (the read-side swap diffs · rebuilt-era columns → tb_* columns).

### Quick reference — most-used legacy↔Pacred tables
| Legacy `tb_*` | Pacred (rebuilt-era · transitional) | Wave 2 swap status |
|---|---|---|
| `tb_users` | `profiles` (~3 rows) | ✅ Wave-2: admin reads → `tb_users` (8898 rows) |
| `tb_wallet` / `tb_wallet_hs` | `wallet_transactions` | ✅ Wave-2 |
| `tb_header_order` + `tb_order` | `service_orders` | ✅ Wave-2 (B-3) |
| `tb_forwarder` | `forwarders` | ✅ Wave-2 |
| `tb_payment` | `yuan_payments` | ✅ Wave-2 |
| `tb_cart` | `cart_items` | ✅ Wave-2 (B-1 launchpad) |
| `tb_admin` | `admins` (rebuilt-era · ~5 rows) | 🟡 admin pilot will read `tb_admin` (181 rows) |
| `tb_cnt` (container payments) | `container_payments` | ✅ Wave-1 B-6 (cnt-hs ⑤ badge) |
| `tb_log_*` | (not yet ported) | Pending — Phase A backfill after Supabase Pro |

### Status-vocabulary mapping
The legacy status codes (`hStatus`, `fStatus`, `pStatus`, `cntstatus`,
etc.) ↔ Pacred status enums are kept in **`lib/legacy-status-map.ts`**
(created by เดฟ in Wave 2 ch.1 · `ccfb54b`). Always import from there
when transcribing — don't re-derive.

### Status enum cheatsheet
| Table | Column | Codes |
|---|---|---|
| `tb_header_order.hstatus` | order status | 1=รอดำเนินการ · 2=รอชำระเงิน · 3=สั่งสินค้า · 4=รอร้านจีนจัดส่ง · 5=สำเร็จ · 6=ยกเลิก |
| `tb_forwarder.fstatus` | forwarder status | 1=รอเข้าโกดังจีน · 2=ถึงโกดังจีน · 3=กำลังส่งมาไทย · 4=ถึงไทย · 5=รอชำระเงิน · 6=เตรียมส่ง · 6.1=กำลังจัดส่ง · 7=ส่งแล้ว · c=เครดิตสินค้า · p/99=สถานะพิเศษ |
| `tb_payment.paystatus` | yuan transfer | 1=รอดำเนินการ · 2=ดำเนินการแล้ว · (see MOMO state machine in `docs/audit/chat-analysis-2026-05-16.md`) |
| `tb_cnt.cntstatus` | container payment | varchar(1) · `1`=รอจ่ายเงิน · `2`=จ่ายแล้ว |
| `tb_wallet_hs.kind+status` | wallet history | per `02-wallet-withdrawal-pattern.md` |
| `tb_users.useractive/userstatus` | account flags | useractive=1 → active · userstatus=1 → juristic-pending-approval |

### Auth pattern (legacy → Pacred · runbook §3)
**KEEP Pacred auth as-is.** Don't transcribe `session_start()` /
`$_SESSION['userID']`. Instead:
```ts
const supa = await createClient();
const { data: { user } } = await supa.auth.getUser();
// for admin pages:
const { profile } = await requireAdmin([roles]);
// then query tb_* via service-role:
const admin = createAdminClient();
const { data } = await admin.from("tb_users").select("*").eq("userid", profile.member_code).single();
```

---

## 7. ก๊อต production-gate context (IMPORTANT — please read)

ก๊อต owns:
- **Vercel deployment** (production builds + preview deploys)
- **Domain** (DNS + SSL + redirects)
- **Production fidelity review** (every screen merged into `faithful-port` vs
  the legacy live site at `pcscargo.co.th`)

**What changed for ก๊อต today:**
- The integration branch is `faithful-port` (not `dave` for the 1:1 work)
- production target stays `main`
- The merge chain: `Poom-pacred` + `dave-pacred` + `podeng` → `faithful-port`
  → (ก๊อต review + sign-off) → `main` → Vercel auto-deploy
- The borrowed-API watch (TAMIT · JMF · LINE Notify · etc.) stays in
  `docs/runbook/pcs-scrub-plan.md`. Per runbook §3: do NOT scrub these
  references during transcription — keep them; ก๊อต gates the switchover
  when the partner APIs are ready.

**What ก๊อต should confirm:**
- That `main` stays the production branch and `faithful-port` is the
  intended pre-production integration target
- That the per-screen review process is the right shape (1 screen = 1
  diff to review · vs `pcscargo.co.th` for fidelity)
- That the ThemeForest "Modern Admin" template legacy uses is OK to mirror
  byte-identically in `public/legacy/pcs/admin/` (no licence issue · it's
  the same template the legacy already ships)

---

## 8. Env variables — what ภูม needs on the home machine

`.env.local` is **never committed** (`.gitignore`). For the home machine:

### Step 1 — copy `.env.local` from office machine
ภูม has the office machine's `.env.local` at `C:\Users\Admin\pacred-web\.env.local`.
**Manually copy this file** to the home machine's `pacred-web\` (use USB · email ·
LINE · whatever secure channel). The file is ~50 lines · plain text · contains
secrets so do NOT paste in chat / commit.

### Step 2 — verify against `.env.example` (committed canonical template)
`.env.example` in repo lists every required env var (with placeholder values).
On home machine: `cp .env.example .env.local` THEN merge with the values copied
from office. Any new var added to `.env.example` since last sync needs a real
value.

### Step 3 — Phase A / D1 specific env vars (extra check)
These were added during D1 — confirm they're set:
- `SUPABASE_SERVICE_ROLE_KEY` — required for `createAdminClient()` (tb_* reads)
- `OTP_BYPASS=true` — local dev convenience
- `NEXT_PUBLIC_SOCIAL_LOGIN_ENABLED=false` — gates the OAuth buttons off

Full env doc: [`docs/env.md`](../env.md).

---

## 9. Resume-at-home instructions (RUN THESE)

```bash
# 1. Pull latest Poom-pacred
cd C:/Users/<home-user>/pacred-web   # or wherever home checkout is
git fetch origin
git checkout Poom-pacred             # or create if doesn't exist locally
git pull origin Poom-pacred --ff-only

# 2. Also pull dave-pacred + faithful-port for reference (don't check out)
git fetch origin dave-pacred:dave-pacred  faithful-port:faithful-port

# 3. Verify environment
pnpm install                          # in case lockfile changed
cp .env.example .env.local            # if .env.local missing
# (manually merge your secrets into .env.local)
pnpm verify                           # lint + tsc + tests
pnpm dev                              # smoke test at http://localhost:3000
                                      # log in as a migrated customer to see Wave 2 data flowing

# 4. Check the admin pilot agent's result
git log --oneline -3                  # if a new commit "feat(d1): transcribe admin-table.php..."
                                      # → pilot landed · review + continue with next admin screen
                                      # if not → pilot didn't push in time · re-launch from home

# 5. Start next admin screen
# - Open C:/Users/Admin/pcscargo/member/pcs-admin/<next-screen>.php
# - Follow the pattern in app/[locale]/(protected)/dashboard/page.tsx (the customer pilot)
# - Or spawn a Claude Code agent with the same prompt shape as the admin-table.php pilot
```

---

## 10. Suggested next admin pilots (after admin-table.php)

In order of leverage (closes audit findings + reasonable size):

| # | Legacy file | LOC | Pacred target | Why |
|---|---|---|---|---|
| 1 | `admin-table.php` | 257 | `/admin/admins` | **(in flight)** closes BETA orphan |
| 2 | `index.php` | 149 | `/admin` | Admin dashboard · parallel to customer's menu.php |
| 3 | `acc-system-cargo.php` | 6 | thin wrapper · check what it includes | The page in ภูม's original screenshot — fast |
| 4 | `users-search.php` | (check) | `/admin/customers/search` | Closes 1 of Wave-R2 "search rows" decisions |
| 5 | `forwarder.php` | (check) | `/admin/forwarders` | THE big one · ฝากนำเข้า · 11-tab DataTable · daily-flow |
| 6 | `wallet/...` family | (check) | `/admin/wallet/*` | Money-touching · daily-flow |

Per the runbook §6: pilot pattern proves out · then scale to batches of 3-5
in parallel via agents (like เดฟ did with customer batch-1).

---

## 11. Open items + blockers

### Open for ก๊อต
- Confirm `faithful-port` as pre-production integration target (replaces `dave`)
- Confirm production cutover gate (one-click vs staged?)
- Borrowed-API switchover status (TAMIT · JMF · LINE Notify · MOMO) — when?
- Per-screen fidelity review process (sync or async? frequency?)

### Open for เดฟ
- Confirm ภูม's admin-pilot scope (admin-table.php main view only · sub-routers separate)
- Confirm admin CSS base path (`public/legacy/pcs/admin/` per pilot prompt)
- Wave 2's `tb_*` swap covered customer-side · admin still mostly reads rebuilt-era ·
  is the admin-side B-0 swap a separate effort or part of each transcription?

### Open for ปอน
- Customer batch-2 lane — pick up where เดฟ left off (`menu.php` + china-address +
  account-settings + search done · ~21 customer .php files remaining)

### Open for ภูม (self)
- Resume at home tomorrow → check pilot agent's output · continue with #2 (index.php)
- Set up local PHP source on home machine (or copy `C:\Users\Admin\pcscargo\`
  to home `C:\Users\<home>\pcscargo\`)

---

## 12. Cross-references

- 🧭 [`docs/decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md) — D1 ADR
- 🛠 [`docs/runbook/faithful-port-transcription.md`](../runbook/faithful-port-transcription.md) — the canonical method
- 🛠 [`docs/runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md) — Phase A data load runbook
- 🧠 [`docs/research/wave-1-fidelity/_SYNTHESIS.md`](wave-1-fidelity/_SYNTHESIS.md) §7 — table swap diffs
- 🗺 [`docs/research/sidebar-fidelity-audit/`](sidebar-fidelity-audit/) — the IA audits (still valuable as scope roadmap for transcription)
- 📋 [`docs/research/poom-save-point-2026-05-19.md`](poom-save-point-2026-05-19.md) — earlier today's V3 save-point (§11-13)
- 👥 [`docs/briefs/`](../briefs/) — per-role briefs (got · dave · poom · podeng)
- 🛠 [`.claude/skills/legacy-php-sweep/SKILL.md`](../../.claude/skills/legacy-php-sweep/SKILL.md)

---

_End save-point. Direction-shift handoff written by Claude Code on ภูม's
office machine 2026-05-19 evening. Next session: home machine, pull
Poom-pacred, continue admin transcription._
