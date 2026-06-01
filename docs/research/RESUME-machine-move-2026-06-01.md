# 🧳 RESUME on the work computer — read FIRST after `git pull` (2026-06-01 close)

> เดฟ พิมพ์แค่: **`sync main / pull dave-pacred มาทำงานต่อ`** → Claude reads CLAUDE.md (§PM-4 top) + this doc + does the session-start handshake (AGENTS.md §1). Everything below is here BECAUSE memory / tokens / .env / local paths **do NOT travel with git** — this doc carries them so nothing has to be re-explained.

## 0. State (one glance)
- **`main` = `dave-pacred` = `55e247be`+ · all pushed · prod (Vercel auto-deploys `pacred.co.th`) LIVE.** Build EXIT 0. Resume: `git fetch origin && git pull origin main` → on work computer just continue on dave-pacred.
- **Today (2026-06-01) shipped 5 waves, all live + verified:** PM-3 CRM + 3 money ADRs (credit/config/cashback) + BI cockpit/AR-aging + pricing-guard · PM-4 CEO "6-core-systems" deep-audit + mark-paid-symmetry fix (fstatus 5→6 on every approve path + receipt) + dead-button/dead-write sweep · brand sweep (admin receipt → Pacred) · member `/service-import` UX (floating declutter + pay-button z-index fix + multi-promo manager `/admin/settings/promos` w/ image upload · 0135 applied via REST) · **PM-5 ภูม sitting-I INTEGRATED** (commission Potemkin repoint 4,104 earns + PEAK + AR-aging + tran-th · merged clean · 5 cast-fixes). Detail = CLAUDE.md §PM-3/4/5. 🟠 follow-up: dedupe the 2 AR-aging routes (`/admin/reports/ar-aging` vs `/admin/accounting/ar-aging`).

## 1. Machine-LOCAL things (on the HOME machine `/Users/dev/…` — NOT on the work computer · re-provide/locate as needed)
| Thing | Home-machine location | On work computer |
|---|---|---|
| Repo | `/Users/dev/pacred-web` | wherever the owner's clone is — `git pull origin main` |
| Legacy PHP source (audit reference) | `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/` (pcs-admin = 180 php) | the work computer has its OWN extract (per CLAUDE.md history, e.g. `D:\REALSHITDATAPCS\…` on the old Windows box) — point the legacy-fidelity/audit work at whatever path exists there |
| Freight/AXELRA old data | `/Users/dev/Desktop/olddata dev/` | re-point if present |
| `.env.local` (all secrets) | `/Users/dev/pacred-web/.env.local` (gitignored) | the work computer needs its own `.env.local` — inventory + every var explained in **`docs/runbook/env-inventory.md`** + `docs/env.md`. Prod Supabase = `yzljakczhwrpbxflnmco`. If missing, owner copies it from the home machine / Vercel. |
| Owner API tokens | `/tmp/.cf-tok` (Cloudflare) · `/tmp/.vc-tok` (Vercel) · `/tmp/.momo-tok` (MOMO JWT) | **session-local, NOT committed, gone on reboot.** Re-provide ONLY if doing CF/Vercel/MOMO infra work (most done). Owner can revoke anytime. |
| Claude memory | `/Users/dev/.claude/projects/-Users-dev-pacred-web/memory/` | **machine-local — does NOT follow.** The essential facts are mirrored into §3 below + CLAUDE.md so the work computer needs nothing extra. |
| Dev server / worktrees | `:3000` + `.claude/worktrees/*` | local-only, ignore — `git pull` is all you need |

## 2. Access / permissions the owner granted (carry into the new session)
- **Login protocol (HARD safety rule — does NOT change):** Claude **cannot type passwords / log in** (prohibited even with authorization). When a login is needed: Claude fills the **username**, pauses, asks; **owner types the password + clicks login**, then Claude continues. Test accounts (usernames only — passwords entered live by owner): **member `PR321`** (tel 0948782006) · **admin `0991921177`** (Tadsakorn). One browser = one session (member OR admin, not both).
- **Owner-authorized for QA:** create test/demo orders on PR321, click through pay/bill/receipt, "bypass ได้หมด" for testcase/learning — EXCEPT the password-typing rule above and **OTP env (`OTP_BYPASS`/`OTP_PEPPER`/`EMERGENCY_OTP_BYPASS`) must stay UNTOUCHED until owner confirms.**
- **DB migrations when IPv6 direct-DB times out** (happened on the home machine this session): seed/DML migrations can be applied via **PostgREST** `POST /rest/v1/<table>` with the service-role key + `Prefer: resolution=ignore-duplicates` (HTTPS/IPv4 · bypasses the IPv6 direct-DB). DDL (CREATE TABLE) still needs direct-DB OR the Supabase SQL editor. (This is how migration 0135 got applied.)

## 3. How the owner works (the memory that won't follow — internalise)
- **Run long, parallel, ask-once-at-end.** "แยกร่างรุมทำ / run long / ลุยเลย" → use **flat `Agent` + `isolation:worktree` + disjoint files + tsc/tsx-only + merge serial + verify once** (the proven pattern · NOT `Workflow{schema}` = the "119-agent bonfire" that failed). Don't stop to ask mid-run unless genuinely blocked; bundle questions at the end.
- **ห้ามเดา ห้ามข้าม** — never guess; verify against legacy PHP source / prod DB / the actual code. This session that discipline caught real money bugs (credit `type='3'` collision, the NOT-NULL INSERT-fail, the dead vs live approve function). When unsure and can't resolve from data → ask once at the end, don't flail (don't waste tokens).
- **Save-points only** for push (end of session / machine change / big batch). **Prod deploys from branch `main`** → always `git push origin dave-pacred && git push origin dave-pacred:main`.
- **Always `pnpm build` before push** (typecheck misses `"use server"` non-async-export + Turbopack errors). ⚠️ Running `pnpm build` while the owner's `next dev` runs corrupts `.next` → dev serves HTTP 000; restart dev after (or build in a separate worktree).
- **§0c/§0d/§0e** (AGENTS.md): verify-deep-flow (click the row, don't claim "clean" off a 200) · reachability (every fn ≤3 clicks) · dead-write traps (check the CONSUMER's table). **Casing landmine:** `tb_users`/`tb_admin`/`tb_co` columns are camelCase (`userID`,`adminIDSale`,`userCreditValue`); all other `tb_*` lowercase.
- Identity: **เดฟ = integrator** on `dave-pacred`. Kids get full design/UX freedom; เดฟ gates base-function-works-on-prod (no Potemkin/death-gap).

## 4. Pickup options (next session)
1. **QA full-loop** (the CEO ask) — `docs/research/qa-6systems-2026-06-01.md`: walk all 8 flows × member+admin with a test order on PR321 (member-first, then switch login to admin). Environment + login-protocol proven ready.
2. **ภูม integration** — see the Poom-pacred review summary in CLAUDE.md §PM-5 (this close).
3. **Owner to provide (noted 2026-06-01):** Pacred **ตราปั๊ม + ลายเซ็น images** for the receipt (still legacy PCS scans) · the **self-pickup warehouse address** (ก๊อต confirm · no China warehouse address in code) · approve **2-3 real test-slip payments on prod** to confirm the mark-paid fix decrements AR.
4. **Standing blockers (owner/team):** 13-admin recreate (ADR-0022 · gates CRM rep-routing + commission visibility) · FB omni-inbox (ปอน's FB webhook) · partner-API GOGO/JMF/TTP (ก๊อต).
5. **Long:** freight ERP (Theme 8 · PJ-BOOK schema) · CargoThai `/track` (Theme 7) · shop per-line pricing engine. Plan = `docs/research/big-audit-2026-06-01/_MASTER-PLAN.md` + `docs/research/freight-knowledge-2026-06-01/_MASTER-FREIGHT-PLAN.md`.
