# 🏢 RESUME on the company computer — read FIRST after `git pull` (2026-06-02 close)

> Owner moved home → company computer. Resume: `git fetch origin && git pull origin main` → read CLAUDE.md §PM-6 (top) + this doc. This carries what does NOT travel with git: machine-local paths, the **pending login-verify + 5 phone-collisions**, the FB-token checklist, working-style.

## 0. State (one glance)
- **`main = dave-pacred = origin/main = 37078633`+ · all pushed · typecheck EXIT 0 · prod LIVE.** Vercel auto-deploys `main`.
- This session shipped (CLAUDE.md §PM-6 lists all): **the ADMIN OVERHAUL** (15-admin roster provisioned on prod + admin_center + 8,900 customers reset + 10 old deleted + round-robin + register popup + sales-rep death killed) · AR-aging dedup · A+D receipt+tax-invoice (ADR-0027) · forwarder warehouse→Pacred · /search fix · margin-monitor use-server fix · ภูม sitting-I v4+v5 merged · FB integration guide.

## 1. Machine-LOCAL (re-locate on the company computer)
| Thing | Home path (this Mac) | On company computer |
|---|---|---|
| Repo | `/Users/dev/pacred-web` | owner's clone — `git pull origin main` |
| `.env.local` (all secrets) | `/Users/dev/pacred-web/.env.local` (gitignored) | needs its own — inventory in `docs/runbook/env-inventory.md` + `docs/env.md`. Prod Supabase = `yzljakczhwrpbxflnmco`. Owner copies from home/Vercel. |
| **adminIDSale reset backup** | `scripts/backup-adminIDSale-2026-06-01T22-40-17-051Z.json` (committed → travels) | in repo — restore snippet at the end of `scripts/reset-clear-admins-2026-06-02.mjs` if the customer→center reset must be reversed |
| Legacy PHP source | `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/` | company box has its own extract — point legacy/audit work there |
| Claude memory | `/Users/dev/.claude/projects/-Users-dev-pacred-web/memory/` | machine-local — essentials mirrored into CLAUDE.md + memory files (committed? no — memory is machine-local; the FACTS are in CLAUDE.md §PM-6 + this doc) |

## 2. Login protocol (UNCHANGED — hard safety rule)
Claude **cannot type passwords / log in** (prohibited even with authorization). Claude fills the username, pauses, **owner types the password + clicks login**. One browser = one session. Admin login flexible: **เบอร์ / email / PR-code + password**. New 15 admins pw = `123456` (users change later). OTP env (`OTP_BYPASS`/`OTP_PEPPER`/`EMERGENCY_OTP_BYPASS`) **untouched** until owner confirms.

## 3. 🔴 PENDING — must do on the company computer
### 3.1 VERIFY admin login (FIRST)
The 15 admins were provisioned (auth+profiles+admins+tb_admin) but **login NOT click-tested**. Owner: log in as `admin_pee` (เบอร์ `0617799299` or `admin_pee@pacred.co.th`) / `123456` → confirm session + `/admin/admins` shows the clean 15. If login fails → check the auth.users phone/email + the `admins.is_active` row.

### 3.2 The 5 phone-collisions (free phones → phone login)
5 roster staff phones are held by EXISTING (empty · 0-order) customer auth.users → those 5 admins are **email-only login** now. Owner sign-off per row, then free the phone (clear the customer's `auth.users` phone + `profiles.phone` via GoTrue admin API + PostgREST · service-role) so the staffer gets phone login:
| staff (legacy_admin_id) | phone | colliding account | safe? |
|---|---|---|---|
| admin_poom (ภูม) | +66921313786 | PR10901 "TEST PASSOTP" · 0 orders · not in tb_users | ✅ test — clear |
| admin_got (กอต) | +66944798231 | PR130 "จิรายุส" (กอต's own) · 0 orders · not in tb_users | กอต's own — owner OK |
| admin_nat (พี่แนท) | +66941178515 | PR147 "Pop Visit" · 0 orders · not in tb_users | owner clarify |
| admin_ploy (พลอย) | +66626034456 | PR114 "ขวัญเรือน บัวหลวง" · inactive · 0 orders · in tb_users | owner clarify |
| admin_gring (กริ้ง) | +66800588746 | orphan auth (no profiles row) | ✅ orphan — delete |
ALL 5 are 0-order (no active customer loses login). Investigate read-only first; fix with owner sign-off.

### 3.3 Build backlog
- **CRUD: partner** — no table/role/page exists (build new: a `partners` table + `partner` role + routes + actions). + **admin-create-customer** (none — customers self-register) + **admin hard-delete** (only soft is_active toggle today).
- **QA full-loop (CEO):** member-side ฝากนำเข้า/สั่งซื้อ/โอน verified; **admin-side approve/bill/receipt + the 🔴 tax-invoice issuance + slip-approve mark-paid** still need the owner's prod spot-check (mutate money/RD docs).
- **register popup** browser-verify (สมัคร test customer → see popup + round-robin sales).

### 3.4 FB/IG — owner provides 8 env, then เดฟ scaffolds
Guide: `docs/setup/facebook-integration-guide-2026-06-02.md`. Owner gets: `FACEBOOK_APP_SECRET` · `FACEBOOK_PAGE_ACCESS_TOKEN` (System User = never-expire) · `FACEBOOK_PAGE_ID` (100690994769905) · `INSTAGRAM_ACCOUNT_ID` · `FACEBOOK_WEBHOOK_VERIFY_TOKEN` (self-set) · `FACEBOOK_CAPI_TOKEN` (optional) · **`NEXT_PUBLIC_FB_PIXEL_ID`** (real Dataset id — current code fires the App ID `27209891118650099` → Events Manager empty → ads untracked). Then build `/api/webhooks/facebook` + `fb_*` tables (migration 0136) + CRM FB/IG inbox (mirror `app/api/webhooks/line` + the Podeng_* pattern).

## 4. How the owner works (internalise)
Run long · parallel · ask-once-at-end · ห้ามเดา ห้ามข้าม (หาไม่เจอ → ถาม). Proven pattern: flat Agent + isolation:worktree + disjoint files + tsc/tsx-only + merge serial + verify once. **Always `pnpm build` (or a worktree build) before push** — tsc misses `"use server"` non-async value exports + Turbopack errors (bit margin-monitor this session; caught via browser). ⚠️ `pnpm build` while owner's `next dev` runs corrupts `.next` → build in a worktree or stop dev. **Dry-run destructive prod scripts FIRST** (this session a dry-run caught a bug that would have deleted the 12 freshly-provisioned admins). Prod deploys from `main` → `git push origin dave-pacred && git push origin dave-pacred:main`. §0c verify-deep-flow · §0d reachability · §0e dead-write traps. Casing: `tb_users`/`tb_admin`/`tb_co` camelCase; other `tb_*` lowercase; the 3 sales-ref tables (`tb_sales_report.sradminidsale`, `tb_user_sales_admin_pay.admincreate`, `tb_org_tell_ships.adminid`) lowercase.

## 5. Admin architecture (the unification — internalise)
- **`admins`** (RBAC · profile_id→auth) = LOGIN SOT. **`tb_admin`** (adminID string · camelCase) = sales-attribution + name + HR SOT. Bridged by **`admin_contact_extras.legacy_admin_id`** (= the tb_admin.adminID). `tb_users.adminIDSale` (varchar, no FK) → `tb_admin.adminID` = the customer's rep.
- Sales pool (round-robin) = `tb_admin WHERE adminStatusA='1' AND adminStatusSale='1'` → currently พี (`admin_pee`) + เมย์ (`admin_may`). `admin_center` = adminStatusSale='' (valid assign target, excluded from pool).
- The 16,625 historical rows referencing departed reps in the 3 ref tables = pre-existing dangling (no live impact · the live rep path is `tb_users.adminIDSale`, reset to admin_center).
