# D1 Deep Audit — Legacy PHP vs Pacred Next.js (2026-05-24)

> **Author:** เดฟ (post strategy-reset audit)
> **Inputs:**
> - `/Users/dev/Desktop/pcscargo/` (May 21 snapshot — main pcscargo.co.th)
> - `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/` (freshly extracted 2026-05-24 from REALSHITDATAPCS.rar — adds backoffice.pcscargo.co.th + pcs-seafreight.com + sms/)
> - `/Users/dev/pacred-web` HEAD = `d7b1758` on `dave-pacred` (= main + podeng integrated)
> - 3 parallel-agent catalogs (see internal notes for raw output)
>
> **Purpose:** Identify every legacy workflow, loop, cron job, and API integration we have NOT yet ported. Each gap is rated by severity (revenue impact) + porting effort (S/M/L).

---

## TL;DR — 10 critical gaps

| # | Gap | Severity | Effort | Owner | Status |
|---|---|---|---|---|---|
| 1 | **Google Sheets sync** (CTT/MX/MK/Sang shipping data) — legacy syncs daily | 🔴 HIGH | M | ก๊อต/ภูม | ❌ NONE |
| 2 | **JMF / TTP / CN forwarder partner APIs** | 🔴 HIGH | L | ก๊อต | 🔴 only MOMO JMF stubbed |
| 3 | **LINE Notify per-user OAuth + cron push** (customer notifications) | 🟡 MED | M | เดฟ | ❌ admin-side LINE Messaging only |
| 4 | **CargoThai (api.newcargothai.net) PO sync** | 🟡 MED | M | ก๊อต | ❌ NONE |
| 5 | **TAMIT (Thai ID) identity verification** | 🟡 MED | S | เดฟ | ❌ NONE (DBD/RD stubbed but not equivalent) |
| 6 | **MOMO LCL sack tracking lookup** (newly discovered) | 🟡 MED | S | ภูม | ❌ NONE |
| 7 | **Barcode + Excel bulk import** (admin) | 🟡 MED | M | ก๊อต | 🟡 partial admin barcode |
| 8 | **40+ admin reports** | 🟡 MED | L | ก๊อต | 🟡 framework partial |
| 9 | **Customer image files migration** (37GB rar pending) | 🟡 MED | (infra) | ก๊อต | ⏳ waiting on disk/Pro |
| 10 | **WordPress blog/news CMS** for public site | ⚪ LOW | M | ปอน | ❌ static-only (acceptable) |

🔴 HIGH = blocks revenue / customer trust · 🟡 MED = degraded experience · ⚪ LOW = cosmetic / acceptable
S = ≤1 day · M = 2–5 days · L = ≥1 week

---

## 1. Inventory deltas

### What's in legacy that pacred-web doesn't have

**External integrations missing (most critical):**
- **Google Sheets sync** — `member/pcs-admin/api-sheets-{ctt,mx,mk,sang-2023}.php` + cron at `run-time/cttupdate/index.php`. Pulls shipping data from 4 different Google Sheets, dedupes against `tb_notify_sheet_*`, posts LINE Notify on new rows. Used daily by ops team.
- **JMF / TTP / CN forwarder APIs** — `api-forwarder-{jmf,ttp,cn}.php`. Pulls partner forwarder quotes/availability/status. Pacred has only MOMO JMF wrapper (stubbed, API surface mismatch).
- **LINE Notify (per-user OAuth)** — `member/line-notify.php` + `member/api/linenotify/callback/` + cron in `run-time/line/index.php`. Customer connects their personal LINE → receives notifications about their orders. Different from admin-side LINE Messaging API push (which we have).
- **CargoThai (api.newcargothai.net) PO sync** — `test-api/api-new.php` + `test-api/update-data-cargothai/index.php`. Two-way sync of Pacred POs with CargoThai partner system.
- **TAMIT (Thai ID) verification** — `member/regis-tam.php`. Real-time Thai ID validation during signup/KYC.
- **PHPMailer SMTP** — covered (we use Resend). No port needed.

**Newly-discovered subdomains (REALSHITDATAPCS.rar 2026-05-24):**
- **`backoffice.pcscargo.co.th`** — separate MVC admin sub-system. Only one real endpoint: `Api/Routes/import-lcl-momo/check-tracks.php` (MOMO LCL sack tracking lookup, hits `https://api.momocargo.com:8080/api/sack/get/info/{sack}`, correlates with `tb_tmp_forwarder_item_momo`). Tiny scope, low effort.
- **`pcs-seafreight.com`** — separate WordPress freight marketing site. No business logic (Elementor pages only). Not a port candidate.
- **9 subdomains total** in production (pcscargo.co.th main, backoffice., jet., pcsfreight.co/.th, pcsgo.co, pcs-seafreight.com, horenzo.com, leymo.co) — most are marketing/redirects.

**Admin features missing:**
- **40+ report types** — `member/pcs-admin/report-*.php` (sales, profit, user activity, OTP success/fail, drivers, payments-profit, shops-profit). We have a framework but only a few report types built out.
- **Barcode + Excel bulk import** — `barcode-c-*.php` + `import-excel.php`. Admin bulk-loads forwarder items via barcode scan or Excel upload. We have `/admin/barcode` partial.
- **Salary / time-attendance system** — `salary-hs.php` + `time-attendance-system.php`. Internal HR features. We have `/admin/hr/*` rebuilt-era equivalents.

**Cron coverage gap:**
- Legacy `run-time/` has 2+ scripts (CTT update + LINE notify) — externally cron-triggered.
- Pacred has 7 Vercel crons (auto-cancel-orders, sales-daily-digest, refresh-active-customers, expire-probation, expire-driver-assignments, sms-balance-check, send-scheduled-broadcasts).
- **Missing:** Google Sheets sync cron, LINE Notify dispatcher cron.

**Customer image storage:**
- The 37GB `REALSHITDATAPCS.rar` likely contains all customer-uploaded images (avatars, payment slips, document scans, forwarder photos). Not extracted yet (disk constraint — need ~50–80GB after extract).

### What pacred-web has that legacy doesn't (kept-or-expanded)

- **Modern auth** — Supabase Auth (vs PHP session + custom OTP), social-login plumbing (gated off pending Phase C)
- **Wallet credit-line + RLS** — customer self-service credit line (`tb_wallet_credit`) doesn't exist in legacy
- **Container-centric ledger** — `tb_cnt` 8-state machine + payment ledger (vs legacy ad-hoc tracking)
- **Tax invoice RD Code 86 + credit notes** — proper Thai tax-invoice law compliance (migration 0085)
- **Bookings module** (`tb_bookings`) — new logistics-booking flow not in legacy
- **Work items / internal chat** (`tb_work_items` + `tb_work_item_messages`, migration 0080) — internal ticketing not in legacy
- **Audit log + incident store** — `tb_audit_log` + `tb_incidents` + observability instrumentation
- **Vercel cron with 7 scheduled jobs** — proper cron infra (vs externally-triggered legacy scripts)
- **40+ Zod validators + ~1,037 tests** — type-safety + test coverage discipline
- **i18n (TH/EN) + dark mode** — multi-locale + theme support

---

## 2. Death-flow checklist (where the 1:1 port will fail integration with real ops)

These are flows the team uses daily but pacred-web can't currently service:

- ❌ **Daily Google Sheets sync** — when ops imports shipping data from CTT/MX/MK/Sang sheets, our system has no entry point.
- ❌ **JMF forwarder partner quote refresh** — partner sends new rates → we have nowhere to ingest.
- ❌ **Customer connects personal LINE Notify** — UI link missing; customer-side notification chain dead.
- ❌ **TAMIT ID verification on signup** — currently we accept Thai IDs without validating with the legacy verifier.
- ❌ **MOMO LCL sack tracking lookup** — admin can't query MOMO API to verify sack contents.

These are flows that work but degraded (rebuilt-era differs from legacy):
- 🟡 **Wallet** — rebuilt-era logic vs legacy `tb_wallet_normal`/`tb_wallet_credit`. Both paths exist; coexistence works but is duplicated.
- 🟡 **Forwarder management** — partial; legacy has more admin forms (driver assignment, multi-search, cost-adjust).
- 🟡 **Reports** — framework ready, many report types missing.

---

## 3. Per-domain status (post-strategy-reset 2026-05-24)

### Customer portal (`(protected)/*`) — เดฟ owns

**1:1 transcribed (15/24 screens):**
- ✅ `menu` → `/dashboard` · china-address · account-settings · search · wallet · addresses · cart · shops → service-order · forwarder → service-import · payment → service-payment · profile → /profile · receipt-f-hs → service-import/receipts · pay · invoiceF · sales-report · printReceiptF/printShop · map · forwarder-table

**Remaining (~9 screens):**
- 🟡 `register.php` (rebuilt + polished by ปอน, not 1:1 legacy) — needs faith check
- 🟡 `login.php` (rebuilt + EMERGENCY bypasses on captcha + OTP) — needs faith check post-emergency
- 🟡 `forgot-password.php` — not done
- ⚪ `regis-tam.php` — needs TAMIT integration (gap #5)
- ⚪ `register-id.php` — needs ID verification stub
- ⚪ `line-notify.php` — needs LINE Notify OAuth (gap #3)
- ⚪ `fb-callback.php` (Facebook OAuth) — gated COMING SOON, not a 1:1 priority
- ⚪ `wallet-normal.php` / `wallet-credit.php` (legacy split-view) — may already cover via `/wallet`
- ⚪ `20260311wallet.php` — legacy versioning, dead code

### Admin back-office — ก๊อต owns (NEW assignment 2026-05-24)

**1:1 transcribed (admin-table pilot done, rest pending):**
- ✅ `admin-table.php` → `/admin/admins` (pilot)
- 🟡 ~120 admin routes EXIST in pacred-web from rebuilt-era + Wave 10-13 work (forwarders, accounting, freight, customs, KPI, work-board, etc.) — but these are NOT verified 1:1 to legacy
- ⚪ ~186 admin screens still need fidelity transcription (priority list in `poom-save-point-2026-05-19-night.md` §10: index, acc-system-cargo, users-search, forwarder, wallet family)

**Migration concern:** ก๊อต admin lane and ภูม V3 lane both touch admin code paths. Need coordination so they don't collide.

### Frontend — ปอน owns

**Public:**
- ✅ Marketing pages live (home, services, services/[slug], about, faq, how-to-use, contact, news, knowledge, line, book, delivery-areas, etc.)
- 🟢 Recent (just merged): `5097a2b` home — related-tags + bottom banner + FCL single-price + mobile polish
- 🟢 Recent (just merged): `fbb63fe` (protected) chrome rebuild in Tailwind + dropped legacy CSS leak

**Brand asset swap:**
- ✅ Pass 1 done — wallet-card logo swapped to PR
- 🔴 16-icon launchpad set missing (owner needs to commission)
- 🔴 Horizontal PR logo lockup missing
- 🟡 Default avatar + theme art still legacy placeholders

### V3 backend — ภูม owns (UNLOCKED 2026-05-24, was frozen)

**Current state on `Poom-pacred`:** 121 commits ahead of main · last commit 2026-05-23 18:39 `99013cf fix(wave-17 ux-fix²): show checkbox on BOTH report-cnt tabs`. ภูม has been continuing throughout. Now officially unlocked to ship.

**What's on Poom-pacred:**
- Wave 16–17 work — MOMO + CN manual entry forms, barcode/driver/import AJAX wiring, report-cnt UX, accounting period close
- Already-merged Wave 10–13 (admin forwarders fidelity port, slip uploads, VIP tier + per-customer HS rates, audit fidelity-gap audit)
- Should merge into main *after* 1:1 customer + 1:1 admin ship

---

## 4. Priority sequence (next 2 weeks)

### Sprint 1 (this week)
1. **Verify the merged podeng work** — เดฟ runs `pnpm verify` + smoke `/dashboard`, `/wallet`, `/service-order` on `dave-pacred` after the chrome rebuild
2. **ก๊อต takes admin 1:1 lane** — pick 5 highest-impact admin screens from `poom-save-point-2026-05-19-night.md` §10 (start with `index.php` admin dashboard + `users-search` + `forwarder.php`)
3. **Gap #6 — MOMO LCL tracking** — ก๊อต or ภูม does this (1 day, single endpoint)
4. **Gap #5 — TAMIT integration stub** — เดฟ adds the API client + 1-screen integration

### Sprint 2 (next week)
5. **Gap #1 — Google Sheets sync cron** — Vercel cron + Sheets API client + dedupe logic + LINE Notify dispatcher
6. **Gap #3 — LINE Notify per-user OAuth** — Next.js OAuth Route Handler + customer-portal connect button + dispatcher cron
7. **Gap #2 (start) — JMF partner API** — fully wire the MOMO JMF client (currently stubbed)

### Sprint 3+ (ongoing)
8. Sprint 1 of `Poom-pacred` V3 merges — ภูม picks which V3 features land first on main after 1:1 stable
9. **Customer image migration** — ก๊อต provisions disk space, extracts `pcsc/img/` from REALSHITDATAPCS.rar, uploads to Supabase Storage
10. **Gap #4 — CargoThai PO sync** — when partner relationship confirmed (lower priority — verify if still used)

---

## 5. Branch cleanup completed 2026-05-24

| Action | Branch | Status |
|---|---|---|
| Deleted | `faithful-port` (remote) | ✅ |
| Deleted | `hotfix/auth-unblock` (remote) | ✅ (was already in main as `5c6bb8a`) |
| Deleted | `claude/ecstatic-bhabha-8c289a` (remote) | ✅ stale |
| Deleted | `claude/jolly-taussig-7132d7` (remote) | ✅ stale |
| Deleted | `claude/adoring-chandrasekhar-0f8ad7` (remote) | ✅ 84 commits, all already in Poom-pacred |
| Deleted | `claude/frosty-bhaskara-a38ced` (remote) | ✅ worktree-bound, 0 commits ahead |
| Deleted | `claude/nervous-montalcini-fa9819` (remote) | ✅ worktree-bound, 0 commits ahead |
| Deleted | `claude/nervous-nightingale-d7d84d` (remote) | ✅ wallet fix obsolete given 1:1 direction |
| Deleted | `claude/optimistic-hypatia / vibrant-faraday / youthful-shamir / goofy-panini` (local) | ✅ stale |
| Merged | `podeng` → `dave-pacred` (no conflicts) | ✅ commit `d7b1758` |
| Kept | `main` `dave-pacred` `podeng` `Poom-pacred` `dave` `Poom` (remote) | ✅ the user-specified final 6 |
| Kept | `claude/<worktree-name>` (local only) | ⚪ tied to active worktrees, internal-only |

---

## 6. Open questions for owner / team

1. **ก๊อต admin lane vs ภูม V3 admin work** — both touch `app/[locale]/(admin)/`. Should ก๊อต coordinate with ภูม or work on separate sub-routes? Suggest: ก๊อต owns `admin-*.php` 1:1 transcription paths; ภูม keeps V3 enhancements on routes that aren't being 1:1-ported.
2. **TAMIT integration urgency** — is real-time Thai ID validation still required by the owner, or is delayed verification acceptable? (DBD/RD planned but stubbed.)
3. **LINE Notify EOL** — LINE Notify was EOL April 2025 in the legacy notes. Are we porting per-user OAuth + push, or migrating to LINE Messaging API per-user model?
4. **CargoThai partner relationship** — is `api.newcargothai.net` still active, or has the partnership ended? If ended, skip gap #4.
5. **Customer image migration** — when can ก๊อต provision external disk for the REALSHITDATAPCS.rar 37GB extraction? Blocks Phase A "100% data parity" closure.

---

## Cross-links

- [`docs/runbook/faithful-port-plan.md`](../runbook/faithful-port-plan.md) — branch model + work-split (updated 2026-05-24)
- [`docs/runbook/faithful-port-transcription.md`](../runbook/faithful-port-transcription.md) — 1:1 method
- [`docs/decisions/0017-pacred-faithful-pcs-port.md`](../decisions/0017-pacred-faithful-pcs-port.md) — D1 ADR
- [`docs/runbook/pcs-data-migration.md`](../runbook/pcs-data-migration.md) — Phase A
- [`docs/runbook/otp-emergency-2026-05-23.md`](../runbook/otp-emergency-2026-05-23.md) — yesterday's emergency context
