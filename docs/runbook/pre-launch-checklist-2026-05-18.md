# Pre-launch checklist — Monday 2026-05-18 (BKK GMT+7)

> **Status:** ✅ living checklist by เดฟ — consolidates blockers + tasks from all sources into ONE place. Used by ก๊อต + เดฟ + ภูม + ปอน on Saturday + Sunday + Monday morning to confirm "GO" state.
> **Date:** 2026-05-16 night · **Deadline:** Sunday 2026-05-17 night BKK · **Live:** Monday 2026-05-18 morning.
>
> Sources (consolidated here): [`briefs/got.md`](../briefs/got.md) · [`briefs/dave.md`](../briefs/dave.md) · [`briefs/poom.md`](../briefs/poom.md) · [`briefs/podeng.md`](../briefs/podeng.md) · [`PORT_PLAN.md`](../PORT_PLAN.md) Part T DoD · [`STRATEGY.md`](../STRATEGY.md) §10 · [`audit/php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md) §3 B1-B5

---

## 🔴 Sunday-night blockers (must close before Monday)

| # | Owner | Item | Status |
|---|---|---|---|
| **B1** | เดฟ | OTP UI for prod (2-step register + OtpInput component) | ✅ shipped 73cbf0d |
| **B2** | เดฟ | Migrations 0023..0043 apply prod Supabase | ⏳ Sat-Sun |
| **B3** | ก๊อต | Lock ADR-0015 + ADR-0016 (fastlane pre-answered in briefs/got.md) | ⏳ tonight |
| **B4** | เดฟ | DV-3 ThaiBulkSMS signup + `OTP_BYPASS=false` flip in Vercel | ⏳ Sat-Sun |
| **B5** | ก๊อต | Sign up K-12 GTM + K-13 Clarity + DV-1a Sentry + DV-1b Upstash + DV-1c hCaptcha | ⏳ Sat-Sun (~2.5h browser) |

---

## 🟡 Soft blockers (degrade gracefully — OK to launch without)

| Item | Owner | Degradation if not done |
|---|---|---|
| LIFF app create + `NEXT_PUBLIC_LIFF_ID` (DV-2) | เดฟ | LINE push works without LIFF; `/liff/link` page non-functional. Guide: [`setup/line-liff-create-guide.md`](../setup/line-liff-create-guide.md) |
| Pacred owner Bundle 1 (PromptPay number + bank acct + tax ID + legal name + LIFF ID) | ก๊อต call พี่ป๊อป | PromptPay QR shows soft-degrade notice ("ค่า PromptPay ยังไม่เปิด — ติดต่อทีม"); receipts missing legal name |
| Resend API key (`RESEND_API_KEY`) | Pacred owner | Email notifications silently skip (log only); LINE push still works |
| ก๊อต MOMO-1 endpoint inventory call | ก๊อต call MOMO | Container tracking shows demo data only; admin manual entry works as fallback. Prep doc: [`integrations/momo-1-call-prep.md`](../integrations/momo-1-call-prep.md) |

---

## ✅ Pre-launch verify (Sunday afternoon — `pnpm` gates)

Before pushing `dave → main`:

```bash
# 1. Sync
git fetch origin
git checkout main && git pull
git checkout dave && git merge origin/main

# 2. Verify
pnpm verify  # lint + tsc + test:unit + audit:all
# Expected: all green

# 3. Production smoke (per AGENTS.md §11 — required!)
pnpm build && pnpm start &
# Test every NEW or CHANGED route:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/register
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/dashboard  # 307 redirect to login expected
# ... repeat for any [param] route changed since last deploy
# 500 here = 500 in production. Fix before merge.

# 4. Pacred db migration verify (manual via Supabase Dashboard SQL Editor)
select name from supabase_migrations.schema_migrations order by name desc limit 5;
# Expected: 0043_slip_transferred_at as latest
```

---

## 🧪 T-D1 smoke test (Sunday — dev + prod)

Use runbook [`docs/runbook/cargo-smoke-test-T-D1.md`](cargo-smoke-test-T-D1.md). Estimated 2-3h per environment.

### 7.1 Dev environment (Sunday morning)

- [ ] Customer signup → Personal (OTP_BYPASS=true → enter "000000" → land /dashboard)
- [ ] Customer signup → Juristic 3-step + doc upload
- [ ] Wallet deposit (PromptPay or soft-degrade) → admin approves
- [ ] Service-order add (paste demo URL, fill manually since Track G disabled)
- [ ] Customer pay-from-wallet → status flips
- [ ] Admin status chain through fulfillment
- [ ] Receipt PDF downloads
- [ ] Juristic customer requests tax invoice → admin issues → PDF downloads

### 7.2 Production environment (Sunday afternoon)

- [ ] Migrations applied (verify with sql query)
- [ ] OTP_BYPASS=false in prod (real SMS arrives)
- [ ] hCaptcha works (no false rejection on signup)
- [ ] LINE Messaging push reaches a test customer (post-LIFF setup)
- [ ] PromptPay QR renders (if Bundle 1 done) OR soft-degrade message (if not)
- [ ] All `*_BYPASS` flags = false (`OTP_BYPASS=false`, `LINE_PUSH_BYPASS=false`)
- [ ] Sentry receives a test error (verify alerting works)
- [ ] Vercel deploy "Ready" status
- [ ] DNS resolves: `pacred.co` + `pacred.co.th` (both pointed to same project per legacy-cutover-tracker DNS step)

---

## 🚀 Launch day Monday (2026-05-18)

### 8.1 Morning (~9am BKK)

- [ ] ก๊อต / เดฟ on standby (LINE + workstation ready)
- [ ] ภูม on standby for backend hotfix
- [ ] ปอน on standby for frontend tweaks if owner pushback
- [ ] Final `pnpm verify` + production smoke (re-run §6) — confirm overnight didn't break anything
- [ ] Last migration check on prod Supabase

### 8.2 Soft launch (~10am — T-D4)

- [ ] พี่ป๊อป contacts first 5 friendly customers (from his network) → invite to register
- [ ] Each customer walks through: signup → topup → place order → pay → receive receipt
- [ ] เดฟ + ก๊อต watch in real-time:
  - `admin_audit_log` table for each customer's events
  - Sentry for error spikes
  - `/admin/dashboard` for KPI updates
  - LINE OA inbox for "I can't do X" support requests
- [ ] Document any gaps → hotfix queue

### 8.3 Public launch (~2pm — if T-D4 green)

- [ ] Announce on LINE OA + Facebook + Instagram
- [ ] Update `/status` page banner: "We're live!"
- [ ] Notify ก๊อต / เดฟ / ภูม / ปอน — official launch
- [ ] Sentry alert thresholds: error spike >5/hour → notify ก๊อต immediately

### 8.4 Watchpoints

| Symptom | Likely cause | Quick action |
|---|---|---|
| OTP "ส่ง SMS ไม่สำเร็จ" repeatedly | ThaiBulkSMS balance low | Top up + verify SMS cron alert |
| Customer can't login | Supabase rate limit hit | Check Vercel logs; bump auth tier if needed |
| Wallet deposit pending forever | Admin not approving | Admin staff alert; remind via LINE |
| Container tracking shows demo | MOMO sync not wired (still demo mode) | OK — admin enters manually until MOMO-1 lands |
| `/admin/*` 500 error | Migration not applied / new code | Re-check `pnpm build` smoke + Sentry for stack |
| LINE push silently fails | LINE_PUSH_BYPASS=true OR token expired | Verify env in Vercel + LINE Console |

---

## 📋 Post-launch first 7 days

| Day | Activity |
|---|---|
| **Mon T+0** | Live; monitor errors + customer feedback |
| **Tue T+1** | Daily standup; review prev-day metrics; hotfix queue |
| **Wed T+2** | Push V-A6 WHT (ภูม) if ADR-0015 locked |
| **Thu T+3** | T-G3 owner call (Bundle 1) if not done — locks PromptPay live |
| **Fri T+4** | Week-1 retro: what broke? what works? what's next? |
| **Sat T+5** | Quiet day — only critical hotfixes |
| **Sun T+6** | Plan Week-2: pick from V-A6 / V-E* / V-G* backlog |

---

## 🎯 Definition of "Launched Successfully" — T+7 review

- ✅ ≥ 1 customer paid full price + received receipt PDF
- ✅ Sentry error rate < 5/hour sustained
- ✅ No P0 hotfix in last 48h
- ✅ Owner pleased (พี่ป๊อป confirms "ok continue")
- ✅ /status page green (Supabase + LINE + SMS all OK)
- ✅ Admin staff (≥1 of วิน / พลอย / ภูม) trained on full Pacred admin
- ✅ At least 1 LINE push received by a customer (LIFF wired + working)
- ✅ Customer NPS / informal feedback: positive

If all 8 → Week 2 starts V2 long-phase work (Phase I2 freight / V-G admin polish per spec library).

If not → rollback / pause / fix → re-launch in coordinated retry.

---

## 📞 Crisis playbook (if launch goes wrong)

| Scenario | Action |
|---|---|
| Critical bug breaks customer signup | Vercel rollback to previous deploy (< 2 min); investigate; re-deploy when fixed |
| Supabase outage | Show `/status` red banner; LINE OA pin message "ระบบกำลังจะกลับมา"; wait for vendor |
| OTP gateway down | Toggle `OTP_BYPASS=true` in Vercel as emergency (allows signup w/o SMS); communicate to customers |
| PromptPay misconfig (wrong account) | Disable wallet deposit (set env feature flag) until fixed; communicate to customers; refund as needed |
| Mass error spike (Sentry alerts) | ก๊อต + เดฟ war-room; identify common cause; emergency hotfix or rollback |

---

## 🔗 Cross-references (everything needed)

**Sunday-night work:**
- เดฟ work — [`briefs/dave.md`](../briefs/dave.md) "P0 EMERGENCY" section
- ก๊อต work — [`briefs/got.md`](../briefs/got.md) (5 signups + 2 ADR locks + reviews)
- LIFF setup → [`setup/line-liff-create-guide.md`](../setup/line-liff-create-guide.md)

**Smoke testing:**
- T-D1 runbook → [`runbook/cargo-smoke-test-T-D1.md`](cargo-smoke-test-T-D1.md)

**Spec library (Monday morning ภูม pickup):**
- All V-E specs → `docs/port-specs/freight-*.md` + `commission-withdrawal.md` + `cargo-and-freight-dashboards.md`
- V-G admin polish → `docs/port-specs/admin-polish-bundle.md`
- WHT (V-A6) → ADR-0015 (lock first via fastlane in `briefs/got.md`)

**Audit + security:**
- RLS + audit log → [`audit/rls-and-audit-log-2026-05-16.md`](../audit/rls-and-audit-log-2026-05-16.md)
- V-F3 resilience → [`audit/v-f3-legacy-infra-resilience-2026-05-16.md`](../audit/v-f3-legacy-infra-resilience-2026-05-16.md)
- Pen test plan → [`audit/pen-test-plan-2026-05-16.md`](../audit/pen-test-plan-2026-05-16.md) (post-launch T+30d)
- CSP plan → [`decisions/csp-nonce-migration-plan.md`](../decisions/csp-nonce-migration-plan.md) (week-2 post-launch)
- MOMO call prep → [`integrations/momo-1-call-prep.md`](../integrations/momo-1-call-prep.md)

**V3 prep (when V2 stable):**
- ADR-0011 RBAC → [`decisions/0011-erp-rbac-granular.md`](../decisions/0011-erp-rbac-granular.md)
- ADR-0012 shell → [`decisions/0012-erp-frontend-shell.md`](../decisions/0012-erp-frontend-shell.md)
- ADR-0013 migration → [`decisions/0013-erp-v2-v3-migration-strategy.md`](../decisions/0013-erp-v2-v3-migration-strategy.md)

**Strategic post-launch:**
- D-7 payment gateway matrix → [`decisions/d7-payment-gateway-decision-matrix.md`](../decisions/d7-payment-gateway-decision-matrix.md)
- R1 china-search matrix → [`decisions/r1-pick-china-search-options-matrix.md`](../decisions/r1-pick-china-search-options-matrix.md)

---

**End of checklist. ก๊อต + เดฟ: track this file as the SINGLE source of truth for launch readiness. Tick items off + commit `chore(launch): tick <item>` as you complete.**
