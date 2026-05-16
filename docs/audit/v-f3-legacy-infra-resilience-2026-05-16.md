# V-F3 — Legacy-infra resilience review

> **Status:** ✅ Review by เดฟ (preempting ก๊อต V-F3 from PORT_PLAN Part V). Findings + hardening recommendations only.
> **Date:** 2026-05-16 night · **Scope:** Pacred's exposure to legacy PHP infrastructure during the cutover transition (until ก๊อต confirms each F1-* row ✅).
>
> **Read with:**
> [`docs/runbook/legacy-cutover-tracker.md`](../runbook/legacy-cutover-tracker.md) (F1-1..F1-8 burn-down table) ·
> [`docs/audit/cargo-ops-forensics-2026-05-16.md`](cargo-ops-forensics-2026-05-16.md) §2 (the ไอแต้ม single-point-of-failure analysis) ·
> [`docs/audit/php-pcscargo-integrations.md`](php-pcscargo-integrations.md) (legacy integrations inventory).

---

## 0. Context: why V-F3 exists

The legacy PHP system (`pcscargo`) runs on **fragile 3rd-party infrastructure** with pay-or-die terms (per forensics §2: "จ่ายวันนี้ ไม่งั้นระบบฝากสั่งซื้อใช้งานไม่ได้" — pay today or shop-order system dies). Until Pacred fully cuts over, any one of these dependencies failing takes down customer-facing flows.

V-F3's job: **identify which dependencies put Pacred customers at risk RIGHT NOW** and **propose hardening before launch / before contract lapses**.

---

## 1. F1-* dependencies — risk × Pacred exposure matrix

Cross-referenced with [`legacy-cutover-tracker.md`](../runbook/legacy-cutover-tracker.md):

| # | Dependency | Status | Pacred exposure (now) | Risk if it fails today |
|---|---|---|---|---|
| F1-1 | China product API (1688/Taobao search) | 🟡 demo mode (ADR-0003 Option E) | **None** — Pacred runs in demo mode; customers can't paste URLs but sales rep enters items manually | 🟢 zero blast |
| F1-2 | OTP SMS gateway | 🟡 `OTP_BYPASS=true` in dev; prod awaits DV-3 | **None** — Pacred has own ThaiBulkSMS account ready; not using legacy | 🟢 zero blast |
| F1-3 | Server / hosting | 🟢 Pacred on Vercel + Supabase (own infra) | None | 🟢 |
| F1-4 | Legacy PHP cargo system itself | 🟡 95% ported; Pacred running parallel | **High during transition** — if customers still hit legacy URLs (`https://pcscargo.co.th/member/*`), they see legacy state | 🟠 customer confusion if legacy goes down + Pacred not yet "the" URL |
| F1-5 | MOMO JMF container API | 🟡 endpoint inventory pending (ก๊อต MOMO-1) | **Medium** — Pacred customer tracking depends on MOMO; demo-mode works for now but no real status updates | 🟠 "where is my container?" view becomes static |
| F1-6 | Payment / bank account | 🔴 pending Pacred owner Bundle 1 | **High** — no PromptPay → wallet deposit shows soft-degrade notice → customer can't pay → no revenue | 🔴 revenue blocker |
| F1-7 | OAuth (Google / Facebook) | 🟢 Pacred-own | none | 🟢 |
| F1-8 | LINE OA + notifications | 🟢 Pacred-own; LIFF pending DV-2 | **Low** — Pacred has new LINE channel; push works without LIFF (just no auto-link) | 🟡 customer linkage manual |

**Critical-path risk summary:**
- **F1-4** (legacy PHP) — biggest active risk during the parallel-run window. If legacy goes down + customers haven't yet switched to Pacred, they see "เว็ปล่ม" again.
- **F1-6** (bank/PromptPay) — biggest revenue risk. Pre-launch blocker until Pacred owner provides.
- **F1-5** (MOMO) — biggest customer-trust risk post-launch. ก๊อต MOMO-1 call is the unlock.

---

## 2. Hardening recommendations (this session — defer-able)

### 2.1 Pacred-side resilience (defensive — assume legacy fails)

| # | Recommendation | Cost | Status | Owner |
|---|---|---|---|---|
| **R1** | Public `/status` page links to BOTH Pacred + legacy status badges separately | 30m | ✅ already in `/status` design (per ภูม U1-1 batch — verify "PHP legacy" section exists or add) | ภูม spot-check |
| **R2** | LINE OA welcome message + pinned post tells customers "Pacred is now `https://pacred.co` — use this site" (cuts F1-4 confusion) | external (LINE OA admin) | ⬜ | ปอน / Pacred owner |
| **R3** | DNS for `pcscargo.co.th` — when legacy retires, set up 301 redirects from `https://pcscargo.co.th/member/*` to `https://pacred.co/{equivalent}` so old bookmarks/QR codes continue working | 2h (after legacy retire date set) | ⬜ defer | เดฟ + ก๊อต |
| **R4** | MOMO sync — when MOMO down, Pacred admin can MANUALLY enter container status via `/admin/warehouse/containers/[code]` (ภูม night-3 ManualShipmentForm + status set actions already cover this) | ✅ shipped | already-in-place fallback | n/a |
| **R5** | OTP SMS — `OTP_BYPASS=true` is the dev fallback; in production after DV-3, monitor ThaiBulkSMS balance (cron exists per ภูม U1-2 evening-10) — alert when < 1000 credits | ✅ scaffolded | needs Vercel Pro + add to vercel.json | ก๊อต Vercel Pro confirm |
| **R6** | LINE push — `LINE_PUSH_BYPASS=true` in dev; in production if LINE OA gets rate-limited, push falls back to email (Resend) per `lib/notifications/index.ts` | partial | Resend API key pending Pacred owner | ก๊อต / Pacred owner |
| **R7** | Sentry alert on every cron failure → ก๊อต/เดฟ Slack/LINE | 1h (after DV-1a) | ⬜ post-DV-1a | ก๊อต |

### 2.2 Legacy-side hardening (until legacy retires)

While legacy PHP is still serving SOME customers (during parallel-run), 6 critical security findings from `legacy-cleanup-2026-05-16.md` §5 remain exploitable. **Pacred decision: do NOT patch legacy PHP** (per CLAUDE.md "Don't preempt brand cleanup" — anything we touch on legacy risks breaking the revenue path). Instead:

| # | Legacy issue | Mitigation strategy |
|---|---|---|
| S-1 | Plaintext password in 10-year cookie | Acceptable risk during parallel run — most customers cookie-expired by now; new customers go to Pacred (no cookie) |
| S-2 | Weak `pass_tam()` MD5 hash | Force password reset on first Pacred login (per CLAUDE.md A-1 plan) — Pacred uses bcrypt natively |
| S-3 | SQL injection in `header.php` (highest impact) | **If legacy stays online**, this is exploitable. **Recommend:** retire legacy ASAP after Monday launch. Until then, accept risk + monitor for anomalies |
| S-4 | Hardcoded LINE Notify OAuth secret | Revoke at LINE dev console (per legacy-cleanup §8 step 7) when LINE Notify EOL (Apr 2025) hits final shutoff |
| S-5 | Unprotected `api/autorun/` cron endpoints | XAMPP local-only mitigates dev; in prod (if still online) needs `.htaccess` IP allowlist or quick `<?php exit; ?>` patch |
| S-6 | Unsafe file upload + open redirects | Same as S-3 — accept risk, retire ASAP |

**ก๊อต question:** what's the planned **legacy retirement date** (when `pcscargo.co.th` goes 404)? Once decided, work backward:
- T-7 days: announce on LINE OA + email to all customers
- T-0: legacy site returns 410 Gone (or 301 to Pacred equivalents)
- T+30 days: revoke all legacy creds + delete legacy code + archive DB snapshot

### 2.3 Pacred-side fallback drills (recommend before launch)

Practice these scenarios in production (or staging) before launch:

| Scenario | Drill | Pass criteria |
|---|---|---|
| MOMO down for 2h | Manually mark container status via /admin/warehouse — confirm customer sees update | < 5 min from manual entry → customer notification |
| ThaiBulkSMS down | Verify `OTP_BYPASS=true` toggle works in prod env (temp emergency) + customer can still signup | < 1 min OTP_BYPASS toggle + customer signup works |
| Supabase down (region outage) | Pacred shows status page + customer can read cached pages | `/status` shows red + landing still loads (revalidated cache) |
| Vercel deploy fails | Roll back to previous deploy in Vercel dashboard | < 2 min rollback + zero downtime |
| LINE OA rate-limited | Push falls back to email (when Resend key set) | Customer receives email within 1 min of LINE failure |

**ก๊อต / เดฟ run these drills in week 2 post-launch.** Document in `docs/runbook/incident-drills.md` (new doc).

---

## 3. Cutover gate — Pacred can RETIRE legacy when

Per `legacy-cutover-tracker.md` "Critical path to ไอแต้ม-free": F1-1, F1-2, F1-4 all cut over. After Monday launch, expect this timeline:

| Milestone | When | Trigger |
|---|---|---|
| F1-2 (OTP) | Day 0 (Monday) | DV-3 ThaiBulkSMS keys set + OTP_BYPASS=false |
| F1-1 (china-search) | week 4-6 post-launch | ก๊อต picks vendor + sets PACRED_TAMIT_* env vars (ADR-0003 Option E → Option A/B/D) |
| F1-4 (legacy PHP cargo) | week 8-12 post-launch | All customers migrated + 30-day "legacy URL still works" grace period elapses |
| F1-5 (MOMO partner) | ongoing (partner contract) | Pacred owns warehouse eventually — partner-relationship change, not cutover |
| F1-6 (bank account) | Day 0 | Pacred owner Bundle 1 provided |

**After F1-4 cuts over**, Pacred is **fully self-sufficient** — no legacy PHP dependency, no ไอแต้ม payment burn-or-die risk, no fragile 3rd-party hosting. **THIS is the V-F1 finish line.**

---

## 4. ก๊อต confirms each F1-* row in tracker

Per CLAUDE.md AGENTS.md §3, the rule is: **only ก๊อต flips `legacy-cutover-tracker.md` row to ✅** (= green light to scrub PCS/ไอแต้ม references). Suggest workflow:

1. Weekly check-in: ก๊อต reviews `/admin/dashboard` + `/status` page state + `legacy-cutover-tracker.md` rows
2. For each row that meets the "✅ definition" (3 criteria in tracker §"What 'cut over' means"):
   - flip status emoji to ✅
   - commit `docs(cutover): F1-X cut over confirmed — <commit ref>`
   - notify ภูม / ปอน — "you can now scrub `legacy_name` references in <component-area>"
3. ภูม / ปอน update `docs/runbook/pcs-scrub-plan.md` + scrub batch

---

## 5. Acceptance — V-F3 done when

- [ ] `legacy-cutover-tracker.md` reviewed + this resilience doc cross-linked
- [ ] R1-R7 hardening items assigned in PORT_PLAN
- [ ] Pacred owner aware of legacy retirement date (per §3 timeline)
- [ ] ก๊อต commits to weekly F1-* check-in cadence

---

## 6. Cross-references

- ก๊อต task → PORT_PLAN Part V `V-F3`
- Cutover tracker → [`docs/runbook/legacy-cutover-tracker.md`](../runbook/legacy-cutover-tracker.md) F1-1..F1-8
- The "ไอแต้ม single-point-of-failure" forensics → [`docs/audit/cargo-ops-forensics-2026-05-16.md`](cargo-ops-forensics-2026-05-16.md) §2
- Legacy security findings → [`docs/audit/legacy-cleanup-2026-05-16.md`](legacy-cleanup-2026-05-16.md) §5 (S-1..S-6)
- Integration inventory → [`docs/audit/php-pcscargo-integrations.md`](php-pcscargo-integrations.md)
- PCS scrub plan (= what to scrub when ก๊อต confirms each F1) → [`docs/runbook/pcs-scrub-plan.md`](../runbook/pcs-scrub-plan.md)
- Status page → `app/[locale]/(public)/status/page.tsx` (per ภูม U1-1)

**End of V-F3 review. ก๊อต: confirm legacy retirement target date (recommend week 8-12 post-launch).**
