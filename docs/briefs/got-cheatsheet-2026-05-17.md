# ก๊อต Cheat Sheet — Sunday-night cleanup (2026-05-17)

> **กอตหวัดดี — ของพร้อมหมดแล้ว เหลือมือกอตเท่านั้น.**
> **เดฟ + ภูม + ปอน เคลียร์งานเตรียมไว้หมดแล้ว** (~6,700 บรรทัด doc + code · 12 commits ใน `dave` ตั้งแต่เดฟ session นี้). ที่เหลือคือสิ่งที่ **ทำแทนกอตไม่ได้** เพราะต้องใช้ account ของกอต หรือ ตัดสินใจของกอต.
>
> **Pull `dave` ก่อนอ่าน:** `git fetch && git checkout main && git pull && git merge origin/dave` (เดฟใส่ของเข้ามาเยอะใน `dave` — ต้อง merge เข้า `main` หลังกอต ✅ ของในนี้)
>
> **Time budget:** ~6-8 ชม. รวม (3-3.5h browser/calls + 1-1.5h reviews). ลูกพี่ + เดฟ ทำงานต่อตามนี้ — กอตไม่ต้องเร่ง แต่ทำให้เร็วก็ดี.
>
> **เดดไลน์ใช้งานจริง:** จันทร์เช้า 2026-05-18.

---

## 🚦 Status ปัจจุบัน

| Blocker | Owner | Status |
|---|---|---|
| **B1** OTP UI prod | เดฟ | ✅ shipped (73cbf0d) |
| **B2** Migrations apply prod Supabase | ลูกพี่/กอต | ✅ **DONE** (ลูกพี่ apply วันนี้) |
| **B3** ก๊อต lock ADR-0015/0016 | **ก๊อต + เดฟ** | ✅ **DONE** 2026-05-16 night (ก๊อต ack fastlane → เดฟ flip Status. Both ADRs ✅ Accepted. ภูม Mon morning ลุย V-A6) |
| **B4** DV-3 ThaiBulkSMS signup | เดฟ | ⏳ ~30m (เดฟ ทำเอง) |
| **B5** ก๊อต signups K-12/K-13/DV-1a/b/c | ก๊อต | ✅ **DONE** 2026-05-16 night — all 5 signups + Vercel env set + redeployed |

---

## 1. 🖥️ Browser signups (กอต-only · ~2.5-3h) — ✅ ALL DONE 2026-05-16 night

ก๊อต completed all 5 signups + Vercel env set + redeploy triggered. **Section preserved below for the env-var inventory** (in case rotation/audit needed later).

### 1.1 K-12 — Google Tag Manager (GTM) (~30-45m) — ✅ done
- ไป https://tagmanager.google.com → Create Account
  - Account name: `Pacred`
  - Container name: `pacred.co` · platform: **Web**
- หลัง create → ได้ Container ID format `GTM-XXXXXXX`
- Vercel → Pacred project → Settings → Environment Variables → Add:
  - Name: `NEXT_PUBLIC_GTM_ID`
  - Value: `GTM-XXXXXXX`
  - Environments: ✅ Production ✅ Preview ✅ Development
- Save → Redeploy
- **Unblocks:** 9 conversion events + 13 CTA surfaces ทำงานทันที (code wired ใน `lib/analytics.ts` รอ env)

### 1.2 K-13 — Microsoft Clarity (~15-30m) — ✅ done
- ไป https://clarity.microsoft.com → Sign in (Microsoft/Google/FB)
- Create new project: `Pacred` · website `pacred.co`
- หลัง create → ได้ Project ID
- Vercel env:
  - `NEXT_PUBLIC_CLARITY_ID` = `<project-id>`
- Save + Redeploy
- **Unblocks:** heatmaps + session recordings (ก๊อต/ปอน อ่าน analytics)

### 1.3 DV-1a — Sentry (~30m) — ✅ done
- ไป https://sentry.io → Sign up (free tier OK เริ่ม)
- Create new project: Platform = **Next.js**
- หลัง create → ได้ DSN (URL format `https://xxx@sentry.io/yyy`)
- Vercel env:
  - `SENTRY_DSN` = `<dsn-url>`
  - `SENTRY_AUTH_TOKEN` = `<from Settings → Auth Tokens>` (ใช้สำหรับ upload sourcemaps ตอน build)
- Save + Redeploy
- **Unblocks:** production error tracking active (SDK already wired in `instrumentation.ts`)

### 1.4 DV-1b — Upstash Redis (~30m) — ✅ done
- ไป https://console.upstash.com → Sign up (free tier OK)
- Create Database: Type = **Redis** · region = `Singapore` (ใกล้สุดสำหรับ TH)
- หลัง create → REST URL + REST Token
- Vercel env:
  - `UPSTASH_REDIS_REST_URL` = `https://<id>.upstash.io`
  - `UPSTASH_REDIS_REST_TOKEN` = `<token>`
- Save + Redeploy
- **Unblocks:** rate-limit active (wired into 6 server actions; currently soft-degrade)

### 1.5 DV-1c — hCaptcha (~30m) — ✅ done
- ไป https://www.hcaptcha.com → Sign up · choose **Invisible**
- Create site → domain `pacred.co` · pacred.co.th · localhost (สำหรับ dev)
- หลัง create → Site Key + Secret Key
- Vercel env:
  - `NEXT_PUBLIC_HCAPTCHA_SITE_KEY` = `<site-key>`
  - `HCAPTCHA_SECRET_KEY` = `<secret-key>`
- Save + Redeploy
- **Unblocks:** bot filter active (wired into 3 forms + 5 actions; currently degrade-open per recent prod fix)

---

## 2. 📞 Partner / owner calls (กอต-only · ~3h)

### 2.1 MOMO-1 — call MOMO dev (BBOY) — ⏳ **ลูกพี่ takes** 2026-05-16 night
- **Owner changed:** ก๊อต → ลูกพี่ (per ลูกพี่ "เอามาทำเอง" 2026-05-16 night)
- เดฟ wrote ลูกพี่-friendly call script: [`docs/runbook/momo-1-bboy-call-script.md`](../runbook/momo-1-bboy-call-script.md) (6 topics, 30-45m, plain-Thai questions wrapped over the 24-Q technical reference)
- Full technical reference (for เดฟ post-call parse) → [`docs/integrations/momo-1-call-prep.md`](../integrations/momo-1-call-prep.md)
- หลังคุยเสร็จ → ลูกพี่ ส่ง audio + notes ให้ เดฟ → เดฟ กรอก [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md)
- **Unblocks:** CT-5 (MOMO sync cron) + CT-6 (webhook receiver) ภูม จะ implement ทันที post-call

### 2.2 T-G3 — call พี่ป๊อป Bundle 1 — ⏳ **PARTIAL DONE 2026-05-17 (ลูกพี่ takes)**

| # | Item | Status |
|---|---|---|
| 1 | PromptPay number | ⏳ STILL NEEDS (tax-ID 13 หลัก or เบอร์ 10 หลัก ผูกบัญชี?) |
| 2 | Bank account | ✅ DONE — กสิกรไทย `225-2-91144-0` บจก. แพคเรด (ประเทศไทย) → `BANK` constant + pacred-info.md |
| 3 | Pacred legal info | 🟡 PARTIAL — tax-ID `0105564077716` confirmed; remaining 6 fields ใน pacred-info.md ตรงอยู่แล้ว (ลูกพี่ confirm กับ พี่ป๊อป) |
| 4 | Omise approval | ⏳ STILL NEEDS (cash sign-off · onboarding docs) |
| 5 | PDPA registration | ⏳ STILL NEEDS (required ก่อน K-sec-4 pen test) |
| (LIFF) | LINE Login channel + LIFF ID | ✅ DV-2 DONE 2026-05-16 night (ไม่ต้องถามแล้ว) |

Full script: [`docs/runbook/t-g3-popop-call-script.md`](../runbook/t-g3-popop-call-script.md)

หลังได้ → Vercel env:
- `PROMPTPAY_ID` = `<10-digit phone หรือ 13-digit tax-id, no dash>`
- (legal info → update `components/seo/site.ts` constants — เดฟ ทำหลัง confirm)

**Unblocks (after all 5):** entire payment path live + tax invoice complete

---

## 3. 📋 Review-only — read + sign (กอต-only · ~1-1.5h)

ของพร้อม ทุกอันมี recommendation + open questions ตอบไว้แล้ว. กอต แค่อ่าน + เห็นด้วย หรือ ปฏิเสธ (พร้อม reason).

### 3.1 ✅ ADR locks — DONE 2026-05-16 night
- **ADR-0015** WHT — ✅ Accepted (4 Qs resolved · ภูม Mon morning ลุย V-A6)
- **ADR-0016** freight value — ✅ Accepted (5 Qs resolved · V-E2 unblocked Phase I2)

ก๊อต ack fastlane → เดฟ flip status + resolved-questions section + commit.

### 3.2 docs-dedup decision (~5 นาที — Option A/B/C)
ใน [`docs/briefs/got.md`](got.md) "docs-dedup decision". เดฟ recommend **Option A** = agent dedup CLAUDE.md ตอนนี้ (pointers, no info loss). **เดฟ ทำไปแล้วเอง** (CLAUDE.md 552→359 lines, commit 6764944) — ตอนนี้แค่กอต อ่าน + เห็นด้วย → mark ✅.

### 3.3 ✅ K-sec audits — ack DONE 2026-05-16 night
- [`docs/audit/rls-and-audit-log-2026-05-16.md`](../audit/rls-and-audit-log-2026-05-16.md) — **verdict 🟢 strong, no blockers** (ack by ก๊อต+เดฟ+ลูกพี่)
- [`docs/audit/v-f3-legacy-infra-resilience-2026-05-16.md`](../audit/v-f3-legacy-infra-resilience-2026-05-16.md) — retirement = **week 10 (Mon 2026-07-27)** locked in [tracker](../runbook/legacy-cutover-tracker.md)

### 3.4 ✅ K-sec-4 pen test — DECIDED DONE 2026-05-16 night
- **Aiwen Tech Tier-1 ฿150-200k + T+8-13wk window + RFP fan-out T+5wk (Aiwen + Stelia + MFEC) + HackerOne month-9.** Pen-test plan [§7](../audit/pen-test-plan-2026-05-16.md#7-resolved-decisions-locked-2026-05-16-night-by-กอต--เดฟ--ลูกพี่) resolved.
- เดฟ tickle calendar **2026-06-22** to send RFP.

### 3.5 ✅ D-7 payment gateway — DECIDED Omise 2026-05-16 night
- **Omise (Opn Payments) 92/100.** Wallet-first UX · admin-only refunds V1 · THB charge + Omise auto-FX. Matrix [§6](../decisions/d7-payment-gateway-decision-matrix.md#6-resolved-decisions-locked-2026-05-16-night-by-กอต--เดฟ--ลูกพี่) resolved.
- ⏳ T-G3 พี่ป๊อป call still needed for owner cash sign-off.

### 3.6 ✅ R1-pick china-search — DECIDED defer T+30d 2026-05-16 night
- **Continue ADR-0003 Option E demo mode** until T+30d eval gate. If >10 "can't add URL" tickets/wk → trigger SaaS RFP (RCGroup + OneSearch + ZenRows). Matrix [§7](../decisions/r1-pick-china-search-options-matrix.md#7-resolved-decisions-locked-2026-05-16-night-by-กอต--เดฟ--ลูกพี่) resolved.

### 3.7 ✅ CSP-1 nonce migration — DECIDED 2026-05-16 night
- **Ship week-2 post-launch (≈ Mon 2026-06-01) + 48h Report-Only + Sentry CSP Reports endpoint + zero-violations enforce gate.** Plan [§6](../decisions/csp-nonce-migration-plan.md#6-resolved-decisions-locked-2026-05-16-night-by-กอต--เดฟ--ลูกพี่) resolved.
- Pre-req: DV-1a Sentry live + CSP Reports endpoint URL captured (after ก๊อต Sentry signup).

### 3.8 ✅ Renovate config — DEFERRED 2026-05-16 night (ก๊อต call)
**ก๊อต บอกข้ามเลย ยังไม่จำเป็น** — V2 launch focus ก่อน. Config `.github/renovate.json5` ยังอยู่ ready-to-activate เมื่อ ก๊อต พร้อม install GitHub App ในอนาคต (no harm — config inert without App install).

Future trigger: เมื่อ V2 stable + dependency drift เริ่มสะสม (recommend revisit T+30d post-launch ตอนเดียวกับ V3 ADRs review). Re-open this section + Install App + merge onboarding PR.

### 3.9 ✅ V3 ADRs (0011/0012/0013) — DECIDED defer T+30d 2026-05-16 night
**ทั้ง 3 DRAFTs → DEFERRED to T+30d post-launch** (V2 launch focus). ภูม ไม่ implement จนกว่า ก๊อต กลับมา flip Status → Accepted หลังจาก V2 stable + ops-staff feedback มา.
- 🟡 [`decisions/0011-erp-rbac-granular.md`](../decisions/0011-erp-rbac-granular.md) — DEFERRED
- 🟡 [`decisions/0012-erp-frontend-shell.md`](../decisions/0012-erp-frontend-shell.md) — DEFERRED
- 🟡 [`decisions/0013-erp-v2-v3-migration-strategy.md`](../decisions/0013-erp-v2-v3-migration-strategy.md) — DEFERRED

---

## 4. 📊 อันที่ ลูกพี่/เดฟ จะทำต่อ (กอตไม่ต้องดูแล)

- ⏳ DV-2 LIFF setup (เดฟ ~25m, guide ใน [`docs/setup/line-liff-create-guide.md`](../setup/line-liff-create-guide.md))
- ⏳ DV-3 ThaiBulkSMS signup (เดฟ ~30m + paid decision)
- ⏳ T-D1 smoke test dev + prod (เดฟ ~2-3h ต่อ env)
- ⏳ T-D4 soft-launch — 5 friendly customers (พี่ป๊อป + เดฟ + ภูม Monday)
- ⏳ ภูม implement V-A6 WHT (Monday morning, หลัง ADR-0015 lock)
- ⏳ ภูม implement V-G items à la carte (post-launch)

---

## 5. 🏁 Launch Monday morning (~9am BKK 2026-05-18)

Per [`docs/runbook/pre-launch-checklist-2026-05-18.md`](../runbook/pre-launch-checklist-2026-05-18.md):
- ก๊อต + เดฟ standby (LINE + workstation)
- ภูม standby for backend hotfix
- ปอน standby for landing tweaks
- Final smoke + last migration check
- T-D4 soft launch 10am (5 friendly customers)
- Public launch 2pm if T-D4 green

---

## 6. 📋 Quick reference — everything in one place

| Category | Files |
|---|---|
| **Cargo loop port** | [`PORT_PLAN.md`](../PORT_PLAN.md) Part V (V-A1..V-F3 + V-E6..V-E12 + V-G1..V-G7 + V-H1/H2) |
| **Spec library (10 specs)** | [`docs/port-specs/`](../port-specs/) — V-D / V-E1/3/4/6/7/8/9/10/11/12 + V-G + V-H + commission |
| **Master gap audit** | [`audit/php-deep-sweep-2026-05-16.md`](../audit/php-deep-sweep-2026-05-16.md) — 20k PHP file sweep |
| **Pre-launch checklist (single source of truth)** | [`runbook/pre-launch-checklist-2026-05-18.md`](../runbook/pre-launch-checklist-2026-05-18.md) |
| **T-D1 smoke runbook** | [`runbook/cargo-smoke-test-T-D1.md`](../runbook/cargo-smoke-test-T-D1.md) — 9-step |
| **All ADRs (16)** | [`docs/decisions/`](../decisions/) |
| **All audits (8)** | [`docs/audit/`](../audit/) |
| **กอต full brief (where this cheat-sheet was condensed from)** | [`briefs/got.md`](got.md) — สำหรับ context ลึก |

---

## 7. 🎯 Status (updated 2026-05-16 night)

**ก๊อต cleared (DONE คืนนี้):**
1. ~~ADR-0015 + ADR-0016 fastlane sign (5m)~~ ✅
2. ~~K-sec audits + V-F3 + K-sec-4 + D-7 + R1 + CSP-1 reads (45m)~~ ✅ (เดฟ + ลูกพี่ ack per §3.3-3.7)
3. ~~V3 ADRs (~15-20m)~~ ✅ all 3 DEFERRED to T+30d
4. ~~K-12 GTM + K-13 Clarity + DV-1a Sentry + DV-1b Upstash + DV-1c hCaptcha signups (~2.5h)~~ ✅
5. ~~Set Vercel env vars + redeploy~~ ✅
6. ~~Renovate GitHub App install~~ ✅ DEFERRED ("ก๊อต บอกข้ามเลย ยังไม่จำเป็น")

**Ownership transferred → ลูกพี่ + เดฟ:**
7. ~~MOMO-1 call BBOY~~ — ⏳ ลูกพี่ takes call ([script](../runbook/momo-1-bboy-call-script.md)) → เดฟ parse
8. ~~T-G3 พี่ป๊อป call~~ — ⏳ ลูกพี่ takes call ([script](../runbook/t-g3-popop-call-script.md))

**Mon morning before launch:**
- Final review of dave state + ✅ tick พร้อม launch (เดฟ runs T-D1 smoke + soft-launch coord)

**ก๊อต queue เหลือ:** **NONE** — handed everything off or completed. Standby Mon morning launch only.

**ทุก step ทำเสร็จ commit:** `chore(launch): ✅ <item>` แล้ว push ไป main เพื่อ trigger Vercel redeploy

---

**ขอบคุณกอต** — เดฟ + ภูม + ปอน เคลียร์ไว้ครบทุกอย่างที่เคลียร์ได้แล้ว. แค่ ~6-8h ของกอตคือเส้นสุดท้ายก่อน launch.

ถ้าติดอะไร โทรเดฟทันที. ✊
