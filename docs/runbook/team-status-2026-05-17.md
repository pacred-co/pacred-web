# 📋 Team Status — 2026-05-17 (T-1 day before launch)

> **Snapshot date:** 2026-05-17 evening (Sun) · **Launch:** Mon 2026-05-18 9am BKK
> **Maintainer:** เดฟ · **Audience:** ก๊อต · ภูม · ปอน · ลูกพี่
> **Previous checkpoint:** [`team-status-2026-05-16.md`](team-status-2026-05-16.md) (Sat night)
>
> This doc = single source of truth for "what's done · what's left · who does what" before Monday launch.

---

## 🆕 Session update — 2026-05-17 late-evening (เดฟ + ลูกพี่)

Latest batch on top of everything below:

1. **🔢 member_code pattern `PR00001` → `PR001`** — per ลูกพี่. PR + **minimum 3 digits**, overflow-safe (`lpad(n,3,'0')` — never truncates → PR001 … PR999 → PR1000 → PR12345 with no cap, no error). Whole-system sweep: migration `0060_member_code_3digit.sql` (generator + backfill) · `supabase/schema.sql` · 3 validators (`detectIdentifier`, forwarder-driver Zod, HTML5 `pattern`) `^PR\d{5}$`→`^PR\d{3,}$` · 8 UI placeholders · 4 test files · all docs. Browser-verified login placeholder.
2. **🔀 ภูม Phase-I2 autonomous batch merged** — ภูม shipped WHT (V-A6) · QA/QC inspection (V-E10) · org_contacts (V-G5) · TOS version mgmt (V-G4) · freight quotation V-E6 (`0048_freight_quotes`) · V-G6 4 admin reports · F-11 wallet double-debit DB guard (`0049_wallet_order_payment_unique`) — migrations `0044`-`0049` + validators + admin UI + 5000+ LOC. Merged into dave; migration-numbering reconciled (member_code moved out to `0060` so เดฟ never collides with ภูม's `0044`-`005x` freight block — see [`poom-phase-i2-prep.md`](poom-phase-i2-prep.md) map).
3. **🐛 admin dashboard `is_active` bug fixed** — "ลูกค้าที่ใช้งานแล้ว" now keyed on real activity (`profiles.is_active`) not account-status. A fresh signup correctly shows "ยังไม่ได้ใช้งาน".
4. **🔐 auth fixes** — OTP UI in-theme + explicit "ขอรหัส OTP" button · login Facebook/Google icons (shrink-0) · logo enlarged 76px · DBD lookup honest degradation.
5. **OAuth login (Google/Facebook) → ก๊อต** — broken because `NEXT_PUBLIC_SITE_URL`=dead `v2.pacred.co` + Facebook app in Dev Mode. **ก๊อต takes the dashboard config 2026-05-18 morning** (Vercel env + Supabase URLs + FB/Google apps). Full steps → [`auth-launch-fixes-2026-05-17.md`](auth-launch-fixes-2026-05-17.md). Phone+OTP login unaffected.

⚠️ **7 migrations `0044`-`0049` + `0060` are in git but NOT yet applied to Supabase** — เดฟ reviewed all 7 SQL files 2026-05-17 (sound · idempotent · no bugs). **ภูม owns applying them to dev + prod** — exact steps + one-paste combined file + verify queries in [`poom-apply-migrations-2026-05-17.md`](poom-apply-migrations-2026-05-17.md).

---

## 🎉 Overall — **READY for soft launch Monday**

**Status:** 🟢 GO

All 5 Sunday-night blockers (B1-B5) closed or ✅ cleared. 3/5 T-G3 owner items done. ภูม Phase-I2 batch (WHT/QA/org-contacts/TOS/freight-quotes/reports + F-11 wallet guard) already shipped. Remaining = 2 partner calls (ลูกพี่) + ก๊อต OAuth dashboard config + apply migrations `0044`-`0049` + `0060`. Nothing blocks soft-launch 10am Mon → public-launch 2pm Mon path (phone+OTP is the primary auth flow + works).

50+ commits since previous main checkpoint (`d9bc2c2`, Sat night). Merged: dave + Poom (night-6 V-G7 audits + Phase-I2 batch) + podeng (mobile UX polish). Build green. md links resolve. lint 0 problems · tsc 0 errors.

---

## 🔴 Sunday-night blockers — all closed

| # | Owner | Item | Status |
|---|---|---|---|
| **B1** | เดฟ | OTP UI for prod (2-step register + OtpInput) | ✅ shipped 73cbf0d |
| **B2** | เดฟ + ลูกพี่ | Migrations 0023..0043 apply prod Supabase | ✅ DONE 2026-05-16 (10/10 rows verify) |
| **B3** | ก๊อต + เดฟ | Lock ADR-0015 + ADR-0016 | ✅ DONE 2026-05-16 night (both ✅ Accepted, 9/9 Qs resolved) |
| **B4** | เดฟ | DV-3 ThaiBulkSMS signup + `OTP_BYPASS=false` | ⏳ pending — เดฟ tomorrow morning |
| **B5** | ก๊อต | Sign up GTM + Clarity + Sentry + Upstash + hCaptcha + Vercel env | ✅ DONE 2026-05-16 night (all 5 + env + redeploy) |

---

## 🟡 Soft blockers — degrade gracefully if not done

| Item | Owner | Degradation |
|---|---|---|
| **DV-2 LIFF app + `NEXT_PUBLIC_LIFF_ID`** | เดฟ + ลูกพี่ | ✅ DONE 2026-05-16 night — new LINE Login channel `2010105778` + LIFF `2010105778-SaSkkGza` |
| **T-G3 Bundle 1 (PromptPay + Bank + Pacred legal + Gateway + PDPA)** | ลูกพี่ call พี่ป๊อป | ✅ 3/5 DONE 2026-05-17 — PromptPay `0105564077716` + Bank กสิกร 225-2-91144-0 (กระแสรายวัน) + Gateway change Omise→Xendit+K-Biz+K-Shop. ⏳ Legal info confirm (defaults likely OK) + PDPA reg cert (defer T+30d) |
| **MOMO-1 endpoint inventory call** | ลูกพี่ call BBOY | ⏳ scheduled — script [`runbook/momo-1-bboy-call-script.md`](momo-1-bboy-call-script.md). Demo data fallback active until called |
| **Resend API key** | Pacred owner | Email notifications silently skip (log only); LINE push still works |
| **Renovate GitHub App install** | ก๊อต | ✅ DEFERRED ("ก๊อต บอกข้ามเลย"). Config inert until install. Re-open T+30d |
| **OAuth login (Google/Facebook)** | เดฟ/ก๊อต — dashboard config | ⚠️ broken — `NEXT_PUBLIC_SITE_URL` in Vercel points at dead `v2.pacred.co` → OAuth redirect 404s; Facebook app in Dev Mode. **Phone+OTP login unaffected.** Full fix steps → [`auth-launch-fixes-2026-05-17.md`](auth-launch-fixes-2026-05-17.md) |
| **LINE web-login** | deferred | Stub ("เร็วๆ นี้"). Needs custom OIDC build (~4-8h) — post-launch task, not launch-week |

> 🔐 **Auth + admin launch fixes (2026-05-17)** — OTP UI theme + "ขอรหัส OTP" button · login social icons · logo enlarge · **member_code pattern `PR00001→PR001`** (PR + min-3-digit, migration `0060`) · **admin dashboard `is_active` logic bug** — all in [`auth-launch-fixes-2026-05-17.md`](auth-launch-fixes-2026-05-17.md). Code fixes shipped; OAuth = dashboard config still needed (ก๊อต 2026-05-18 morning).

---

## 🎯 Decisions locked tonight (with full trace in matching ADRs)

### ADR + decision matrix locks

| ID | Status | Decision |
|---|---|---|
| **ADR-0015 WHT** | ✅ Accepted | rate set `{1,1.5,2,3,5}` · admin-only V1 · single approver (super/accounting) · dedicated `wht-certs` bucket. Unblocks 🔴 V-A6 (#1 chat complaint) Monday morning |
| **ADR-0016 freight value** | ✅ Accepted | staff-entered FX V1 · Option A (committed plan only) · super+accounting can edit · snapshot duty rate · no new ADR for V-E3/V-E4. Unblocks V-E2 Phase I2 |
| **D-7 payment gateway** | ⚠️ CHANGED Omise → **Xendit + K-Biz + K-Shop** | Kasikorn-centric stack per พี่ป๊อป — same-bank T+0 settlement + owner familiarity. T+30d wire by ภูม (~16-22h). [§9 change log](../decisions/d7-payment-gateway-decision-matrix.md#9-decision-change-log) preserves Omise reasoning |
| **R1 china-search** | ✅ Defer T+30d + SaaS RFP | Continue ADR-0003 demo mode through T+30d eval. Trigger: >10 "can't add URL" tickets/wk → RFP (RCGroup + OneSearch + ZenRows). Exclude TAMIT/AkuCargo/Laonet (ไอแต้ม-controlled) |
| **K-sec-4 pen test** | ✅ Aiwen Tech ฿150-200k Tier-1 | RFP fan-out T+5wk (≈2026-06-22) to Aiwen + Stelia + MFEC. Active testing T+8-13wk + HackerOne month-9. PDPA reg check added to T-G3 |
| **CSP-1 nonce migration** | ✅ Ship week 2 post-launch | ≈ Mon 2026-06-01 · Sentry CSP Reports endpoint (DV-1a now live) · 48h Report-Only + zero-violations enforce gate |
| **V-F3 retirement date** | ✅ Week 10 = Mon 2026-07-27 | T-7 (week 9): announce on LINE OA + email. T-0: 410 Gone or 301 redirects. T+30: scrub legacy code + revoke creds |
| **V3 ADRs (0011/0012/0013)** | ⏳ DEFERRED T+30d | V2 launch focus overrides V3 prep. Revisit when V2 stable + real ops-staff feedback |

### Owner Bundle 1 (T-G3 — ลูกพี่ ↔ พี่ป๊อป)

- ✅ `PROMPTPAY_ID=0105564077716` set in Vercel (tax-ID ผูกบัญชี กสิกร 225-2-91144-0)
- ✅ `BANK` constant ใน [`components/seo/site.ts`](../../components/seo/site.ts) — กสิกร 225-2-91144-0 บจก. แพคเรด (ประเทศไทย) **กระแสรายวัน**
- ⏳ savings account — พี่ป๊อป จะส่งให้ทีหลัง (เพิ่ม `BANK.savings`)
- ⏳ PDPA registration cert (defer T+30d, before K-sec-4 pen test starts)

---

## 🟢 Shipped today (since 2026-05-16 morning) — 39 commits

### Code (เดฟ + ภูม)
- **B1 OTP UI** (เดฟ 73cbf0d) — 2-step register + OtpInput + 60s resend + paste fan-out + iOS/Android SMS autofill
- **B2 migrations 0023-0043 prod apply** (เดฟ + ลูกพี่)
- **OTP_PEPPER rotation** (เดฟ + ลูกพี่)
- **register page restyle** (เดฟ a2dfe99) — theme tokens + dark-mode + lucide icons + 1173→692 LOC
- **CT-7 driver "งานของฉัน"** (ภูม fe05c3a) — driver self-serve assignment view
- **CT-8 container lifecycle integration test** (ภูม 58509f4) — 23 asserts, DB-backed
- **LP-6 PDF spot-check** (ภูม 92fdb29) — ShopOrderReceipt 3 cases
- **/admin/learning vs HR training** (ภูม b115b95) — decision shipped
- **`/customs-clearance-shipping-suvarnabhumi` redesign** (ปอน 56d16b0)
- **BANK constant** (เดฟ 9ee8135) — for receipt/invoice PDFs (ภูม wire in CONTACT.* refactor batch)

### Config / infra (ก๊อต)
- 5 browser signups + Vercel env vars set + redeploy: GTM · Clarity · Sentry · Upstash Redis · hCaptcha
- DV-2 LIFF channel created + Vercel env set (with ลูกพี่)

### Docs (เดฟ + ภูม)
- **CLAUDE.md dedup** 552→359 lines (เดฟ 6764944)
- **Cheat-sheet for ก๊อต** (เดฟ 33f0324) — Sunday-night cleanup forwardable
- **2 V3 ADRs + 6 P1 audits/configs/plans preempted** (เดฟ e08b09d / 703ebf8)
- **PHP deep-sweep gap audit** (เดฟ cfdf7d2) — 20k file sweep
- **Combined migrations paste-and-run** (เดฟ 9496942) — for ลูกพี่ B2 apply
- **6 port specs** (เดฟ d69e993 + 72d5916) — V-E6/E7/E8/E9/E10/E11/E12 + V-G admin polish
- **Pre-launch checklist** (เดฟ) — single source of truth
- **Phase I2 readiness prep** (ภูม 33b31ef) — for post-launch quick-start
- **2 Next 16 learnings** (ภูม f273ecf) — ?? || parens · React Compiler Date.now purity
- **6 V-G7 parity audits** (ภูม 2048c52 + 6965663 + fad6662 + 5c3882f + d3a3690) — 5/6 covered
- **ADRs 0015 + 0016 locked + resolved-Qs sections** (ก๊อต ack via เดฟ a0ca08c)
- **8 ก๊อต queue items closed** (เดฟ ec327cf) — V-F3 + 5 reviews + 3 V3 ADRs deferred
- **MOMO-1 + T-G3 call scripts** (เดฟ fffb2c7 + ec327cf) — ลูกพี่-friendly wrappers
- **Renovate deferred + B5 done** (เดฟ 257f668)
- **D-7 Omise → Xendit override + PromptPay live** (เดฟ 5e3a194)

---

## ⏳ What's left before Monday launch

### ✅ T-D1 production smoke gate — done 2026-05-17 evening (เดฟ)

`pnpm build && pnpm start` + curl every route → **🟢 PASS, zero 500s** on all customer routes (public · auth · 7 customs `[port]` dynamic · knowledge `[slug]` · en-locale · protected/admin guest-307). Re-traced register+OTP (no B1 regression), G7 corporate row (held), wallet deposit/withdraw (clean) against current HEAD. Details: [`cargo-smoke-test-T-D1.md`](cargo-smoke-test-T-D1.md) §"Re-audit 2026-05-17".

**1 finding — G9 (low-med, NOT a launch blocker):** `payServiceOrderFromWallet` idempotency is check-then-act → edge-case double-debit race (2-tab / back-button). Pay button `disabled={pending}` blocks the common case. → ภูม week-1 fix F-11 (partial unique index — exact SQL in [`poom-handoff-2026-05-16.md`](poom-handoff-2026-05-16.md)).

### Tomorrow morning (Mon ~6-8am BKK)

| # | Owner | Item | Effort |
|---|---|---|---|
| 1 | เดฟ | DV-3 ThaiBulkSMS signup + flip `OTP_BYPASS=false` in Vercel | ~30m |
| 2 | เดฟ | Re-run T-D1 smoke on the **post-DV-3 prod deploy** (OTP_BYPASS=false changes the register path) | ~30m |
| 3 | ลูกพี่ + เดฟ + ก๊อต | LINE + workstation standby starting ~9am | — |
| 4 | All | T-D4 soft launch 10am — 5 friendly customers per pre-launch-checklist | ~2-3h coordination |
| 5 | All | Public launch 2pm if T-D4 green | — |

### Pending partner calls (any time before public launch)

| Call | Owner | Status | Script |
|---|---|---|---|
| **T-G3 พี่ป๊อป remaining (PDPA + legal-info confirm + savings acct)** | ลูกพี่ | ⏳ schedule | [`t-g3-popop-call-script.md`](t-g3-popop-call-script.md) |
| **MOMO-1 BBOY** | ลูกพี่ | ⏳ schedule | [`momo-1-bboy-call-script.md`](momo-1-bboy-call-script.md) |

ทั้ง 2 calls = soft blocker (post-launch acceptable). Demo data fallback works for MOMO; PDPA reg only blocks pen-test T+8wk; savings acct can be added as `BANK.savings` when received.

---

## 🚀 Day-1 post-launch (Mon afternoon / Tue)

| Owner | Pickup | Effort |
|---|---|---|
| **ภูม** | F-11 pay-from-wallet double-debit fix (G9 — partial unique index + catch 23505 in 2 actions) — week-1, before ad-driven concurrency | ~30-45m |
| **ภูม** | V-A6 WHT impl per ADR-0015 (migration `0044_withholding_tax.sql` + bucket `wht-certs` + admin UI + receipt-gate) | ~8-12h |
| **ภูม** | V-E10 QA/QC intake inspection (no blocker, prereq for V-E7) | ~4-6h |
| **ภูม** | V-E6 quotation workflow (opens freight sales funnel) | ~6-8h |
| **ปอน** | T-N1/T-N2 SEO + ad landing playbook per [`briefs/podeng-seo-and-ad-landing-playbook.md`](../briefs/podeng-seo-and-ad-landing-playbook.md) | ongoing |
| **เดฟ** | Monitor Sentry + admin_audit_log + Clarity for first-customer issues | ongoing |
| **เดฟ + ภูม** | CSP-1 nonce migration ship (week 2 = ≈ Mon 2026-06-01) | ~5-6h |

---

## 🗓 Week-to-month roadmap

| Week | Event |
|---|---|
| **Week 0 — Mon 2026-05-18** | Soft launch 10am + Public launch 2pm |
| **Week 1** | Monitor + hotfix; ภูม V-A6 WHT lands |
| **Week 2 — Mon 2026-06-01** | CSP-1 nonce migration ship |
| **Week 4-6** | F1-1 china-search retire — ก๊อต re-opens R1 matrix if >10 tickets/wk |
| **Week 4 — ≈2026-06-15** | T+30d: Xendit + K-Biz + K-Shop sandbox signup (ลูกพี่ + พี่ป๊อป) + ภูม Phase I2 wire-up |
| **Week 5 — ≈2026-06-22** | K-sec-4 RFP fan-out (Aiwen + Stelia + MFEC) |
| **Week 8-13** | K-sec-4 active pen-test window |
| **Week 9 — ≈2026-07-20** | T-7 legacy retirement announce (LINE OA + email) |
| **Week 10 — Mon 2026-07-27** | 🎯 **F1-4 + F1-3 legacy PHP retire** — `pcscargo.co.th` → 410 Gone or 301 redirects |
| **Week 14 — ≈2026-08-26** | T+30 post-retire: scrub legacy code + revoke creds + archive DB snapshot |
| **Month 9** | HackerOne bug-bounty program live |
| **T+30d** | V3 ADRs (0011/0012/0013) revisit after V2 stable + ops-staff feedback |

---

## 📊 Per-role cheat sheet

### ก๊อต (Senior Advisor — queue NEARLY EMPTY)
- ✅ All P0 + P1 cleared (signups + ADR locks + reviews + Renovate deferred)
- ⏳ Standby Monday morning launch + Sentry alert watch first 48h
- ⏳ Re-open at T+30d: R1 china-search eval + V3 ADRs revisit
- Brief: [`briefs/got.md`](../briefs/got.md) · Cheat-sheet: [`briefs/got-cheatsheet-2026-05-17.md`](../briefs/got-cheatsheet-2026-05-17.md)

### เดฟ (Project Lead / Integrator)
- ⏳ DV-3 ThaiBulkSMS signup + OTP_BYPASS flip (Mon ~6am)
- ⏳ T-D1 smoke test prod (Mon ~7am)
- ⏳ MOMO-1 post-call parse + กรอก [`integrations/momo-jmf.md`](../integrations/momo-jmf.md) + ping ภูม
- ⏳ Monitor Sentry + customer-facing surfaces 48h post-launch
- ⏳ CSP-1 execute week 2 (or hand to ภูม if backend-heavy)
- Brief: [`briefs/dave.md`](../briefs/dave.md)

### ภูม (Backend / Customer Portal / Admin / Cargo Port)
- ⏳ Standby Mon morning for backend hotfix
- 🚀 Mon afternoon ลุย **V-A6 WHT** per ADR-0015 unblocked (migration `0044_withholding_tax.sql` + bucket `wht-certs` + admin UI + receipt-gate) (~8-12h)
- 🚀 Tue: V-E10 QA/QC (~4-6h, prereq for V-E7) → V-E6 quotation (~6-8h, super-only approval per RBAC ack)
- T+30d: wire Xendit + K-Biz + K-Shop per updated D-7 §5.3 (~16-22h, 3 channels)
- All open Qs in handoff resolved this session — incl. **E-5 interpreter role ack-approved 2026-05-17 evening** (bundle inline in `0053_commissions.sql`): [`runbook/poom-handoff-2026-05-16.md`](poom-handoff-2026-05-16.md)
- Migration ownership clarified — ALL 0044-0051 = ภูม owns: [`runbook/poom-phase-i2-prep.md`](poom-phase-i2-prep.md) §"Migration numbering map"
- Brief: [`briefs/poom.md`](../briefs/poom.md) · Phase I2 prep: [`runbook/poom-phase-i2-prep.md`](poom-phase-i2-prep.md)

### ปอน (Frontend / Landing / SEO / Marketing)
- ⏳ Standby Mon morning for landing tweaks
- 🚀 Post-launch: T-N1/T-N2 SEO + ad landing playbook
- 🚀 Apply theme-token fix to remaining hardcoded surfaces per [`pacred-info.md`](../pacred-info.md) §"Migration tracker"
- Brief: [`briefs/podeng.md`](../briefs/podeng.md) · SEO playbook: [`briefs/podeng-seo-and-ad-landing-playbook.md`](../briefs/podeng-seo-and-ad-landing-playbook.md)

### ลูกพี่ (Owner-facing / decision relay)
- ⏳ Schedule + take T-G3 พี่ป๊อป follow-up call (PDPA + legal info confirm + savings acct + Xendit/K-Biz/K-Shop signup coord)
- ⏳ Schedule + take MOMO-1 BBOY call ([script](momo-1-bboy-call-script.md))
- ⏳ Set Vercel env vars that need owner data when received
- ⏳ Monitor T-D4 soft launch + relay customer feedback to team

---

## 📥 Sync the weekend big-batch — ภูม + ปอน, do this FIRST next session

A large batch landed in `main` over 2026-05-16/17 (B1 OTP UI · register restyle · OTP-UX polish · DBD fix · ADR-0015/0016 locks · D-7 Xendit · ESLint cleanup · T-D1 re-audit · BANK constant · E-5 interpreter role · all the merges). Before any new work, pull it:

```bash
# ภูม (on Poom)
git fetch origin
git checkout Poom
git merge origin/main          # pull the weekend batch into your branch
pnpm install                   # (only if package.json moved — it didn't, but safe)
pnpm verify                    # confirm green on your branch after the merge

# ปอน (on podeng)
git fetch origin
git checkout podeng
git merge origin/main
pnpm verify
```

**What changed that touches your files — conflict-watch:**

| Branch | Files to watch | Note |
|---|---|---|
| **ภูม** (Poom) | `actions/*` revenue-path files — เดฟ only READ them in the T-D1 re-audit, **no edits**. Your night-3..6 batches are already merged into dave/main. | Low conflict risk. The only auth-area code change = `components/auth/otp-input.tsx` (theme tokens) + `app/[locale]/(auth)/register/page.tsx` (OTP-UX) — if you have local edits there, resolve in favour of the new theme-token version. |
| **ปอน** (podeng) | `app/[locale]/(public)/services/*` — เดฟ removed dead lucide imports (ESLint cleanup). `messages/th.json` + `en.json` — `login.emailPlaceholder` now `PR001` (member_code pattern change). `components/booking/BookingHero.tsx` + `floating-tabs.tsx` — your own commits, already merged. | Low conflict risk — all your own pushed work is already in. Take the merged version. |

**After sync — your next pickup:**
- **ภูม:** F-11 pay-from-wallet double-debit fix (G9, ~30-45m, week-1) → then V-A6 WHT (ADR-0015 unblocked). Open Qs all resolved — see [`poom-handoff-2026-05-16.md`](poom-handoff-2026-05-16.md) + [`poom-phase-i2-prep.md`](poom-phase-i2-prep.md).
- **ปอน:** Standby Mon AM for landing tweaks → post-launch T-N1/T-N2 SEO playbook → theme-token migration of remaining hardcoded surfaces ([`pacred-info.md`](../pacred-info.md) §"Migration tracker").

**Push discipline:** still save-points-only (per `push_frequency_strict`). 1 push per session.

---

## 🚨 Crisis playbook (if something breaks Mon morning)

Per [`pre-launch-checklist-2026-05-18.md`](pre-launch-checklist-2026-05-18.md) §8.2:

| Scenario | Response |
|---|---|
| Mass error spike (Sentry >5/hr) | ก๊อต + เดฟ war-room; identify common cause; emergency hotfix or rollback |
| Single customer can't sign up | เดฟ check Sentry + ThaiBulkSMS balance + OTP_BYPASS flag |
| MOMO API down | Already degrades to admin-manual entry (ภูม night-3 ManualShipmentForm shipped) |
| Database overload | ลูกพี่ scale Supabase tier in dashboard (verified upgrade path; <2 min impact) |
| Vercel deploy fails | `git revert` last commit → push to main → Vercel auto-redeploys previous-good |
| LINE OA rate-limited | Push falls back to email if Resend key set (currently absent — silently logs only) |

---

## 📚 Single-source-of-truth docs (read these, not stale duplicates)

- 🏁 **Pre-launch checklist** → [`runbook/pre-launch-checklist-2026-05-18.md`](pre-launch-checklist-2026-05-18.md)
- 🎯 **Master strategy** → [`STRATEGY.md`](../STRATEGY.md)
- 🧠 **Pacred company info** → [`pacred-info.md`](../pacred-info.md)
- 🔐 **Env vars** → [`env.md`](../env.md)
- 🏗 **Architecture** → [`architecture.md`](../architecture.md) + [`architecture/container-centric-model.md`](../architecture/container-centric-model.md)
- 📋 **Sprint plans** → [`PORT_PLAN.md`](../PORT_PLAN.md) Part T (emergency) + Part V (cargo loop)
- 👥 **Team workflow** → [`team.md`](../team.md)
- 📐 **Conventions** → [`conventions.md`](../conventions.md)
- 📚 **Learnings** → [`learnings/_index.md`](../learnings/_index.md)

---

**End of team-status 2026-05-17.** Next checkpoint: `team-status-2026-05-18.md` (post-launch Monday evening — เดฟ writes after T-D4 result, file doesn't exist yet).

ลุยกันจันทร์เช้า ✊
