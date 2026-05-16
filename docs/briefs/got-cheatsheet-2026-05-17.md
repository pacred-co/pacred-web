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
| **B5** ก๊อต signups K-12/K-13/DV-1a/b/c | **ก๊อต ⬇️** | ⏳ ~2.5h browser |

---

## 1. 🖥️ Browser signups (กอต-only · ~2.5-3h)

ทำได้ทุกเมื่อ. ครั้งเดียวจบ. เสร็จแล้วเอา key/ID มา set ใน Vercel.

### 1.1 K-12 — Google Tag Manager (GTM) (~30-45m)
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

### 1.2 K-13 — Microsoft Clarity (~15-30m)
- ไป https://clarity.microsoft.com → Sign in (Microsoft/Google/FB)
- Create new project: `Pacred` · website `pacred.co`
- หลัง create → ได้ Project ID
- Vercel env:
  - `NEXT_PUBLIC_CLARITY_ID` = `<project-id>`
- Save + Redeploy
- **Unblocks:** heatmaps + session recordings (ก๊อต/ปอน อ่าน analytics)

### 1.3 DV-1a — Sentry (~30m)
- ไป https://sentry.io → Sign up (free tier OK เริ่ม)
- Create new project: Platform = **Next.js**
- หลัง create → ได้ DSN (URL format `https://xxx@sentry.io/yyy`)
- Vercel env:
  - `SENTRY_DSN` = `<dsn-url>`
  - `SENTRY_AUTH_TOKEN` = `<from Settings → Auth Tokens>` (ใช้สำหรับ upload sourcemaps ตอน build)
- Save + Redeploy
- **Unblocks:** production error tracking active (SDK already wired in `instrumentation.ts`)

### 1.4 DV-1b — Upstash Redis (~30m)
- ไป https://console.upstash.com → Sign up (free tier OK)
- Create Database: Type = **Redis** · region = `Singapore` (ใกล้สุดสำหรับ TH)
- หลัง create → REST URL + REST Token
- Vercel env:
  - `UPSTASH_REDIS_REST_URL` = `https://<id>.upstash.io`
  - `UPSTASH_REDIS_REST_TOKEN` = `<token>`
- Save + Redeploy
- **Unblocks:** rate-limit active (wired into 6 server actions; currently soft-degrade)

### 1.5 DV-1c — hCaptcha (~30m)
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

### 2.1 MOMO-1 — call MOMO dev (BBOY) (~2-3h call + doc)
- ผม prep question list ครบ 24 ข้อใน [`docs/integrations/momo-1-call-prep.md`](../integrations/momo-1-call-prep.md) §3
- มี JMF (PHP analog) reverse-engineered ใน §2 — เพื่อ ก๊อต ใช้อ้างอิงระหว่างคุย
- หลังคุยเสร็จ → กรอกข้อมูลที่ได้ใน [`docs/integrations/momo-jmf.md`](../integrations/momo-jmf.md)
- **Unblocks:** CT-5 (MOMO sync cron) + CT-6 (webhook receiver) ภูม จะ implement ทันที post-call

### 2.2 T-G3 — call พี่ป๊อป Bundle 1 (~30m + รอ)
4 อย่างที่ต้องขอ:
1. **PromptPay number** (เบอร์โทร 10 หลัก หรือ tax-ID 13 หลัก) → unlocks wallet deposit live
2. **Bank account** number + ชื่อธนาคาร + ชื่อบัญชี → printed ใน receipt PDFs
3. **Pacred legal info** — legal name TH/EN + tax ID 13 หลัก + ที่อยู่จดทะเบียน + เบอร์กลาง + email → tax invoice + footer
4. **LIFF ID** จาก LINE Console (ถ้า เดฟ ยังไม่ได้ทำ DV-2 — ขอ confirm พี่ป๊อปเข้า LINE Premium account ของ Pacred)

หลังได้ → Vercel env:
- `PROMPTPAY_ID` = `<10-digit phone หรือ 13-digit tax-id, no dash>`
- (legal info → update `components/seo/site.ts` constants — ภูม or เดฟ ทำ)

**Unblocks:** entire payment path live + tax invoice complete

---

## 3. 📋 Review-only — read + sign (กอต-only · ~1-1.5h)

ของพร้อม ทุกอันมี recommendation + open questions ตอบไว้แล้ว. กอต แค่อ่าน + เห็นด้วย หรือ ปฏิเสธ (พร้อม reason).

### 3.1 ✅ ADR locks — DONE 2026-05-16 night
- **ADR-0015** WHT — ✅ Accepted (4 Qs resolved · ภูม Mon morning ลุย V-A6)
- **ADR-0016** freight value — ✅ Accepted (5 Qs resolved · V-E2 unblocked Phase I2)

ก๊อต ack fastlane → เดฟ flip status + resolved-questions section + commit.

### 3.2 docs-dedup decision (~5 นาที — Option A/B/C)
ใน [`docs/briefs/got.md`](got.md) "docs-dedup decision". เดฟ recommend **Option A** = agent dedup CLAUDE.md ตอนนี้ (pointers, no info loss). **เดฟ ทำไปแล้วเอง** (CLAUDE.md 552→359 lines, commit 6764944) — ตอนนี้แค่กอต อ่าน + เห็นด้วย → mark ✅.

### 3.3 K-sec audits (~15 นาที — read + agree)
- 🆕 [`docs/audit/rls-and-audit-log-2026-05-16.md`](../audit/rls-and-audit-log-2026-05-16.md) — เดฟ ทำ K-sec-2 + K-sec-3 combined
  - **Verdict 🟢 strong:** 58/58 tables RLS-enabled · 4 permissive patterns all justified · 96 admin actions logged · `is_admin()` correct
  - **ไม่มี blocker** — มี polish items 5 ตัว flag ไว้สำหรับ V2 long-phase
- 🆕 [`docs/audit/v-f3-legacy-infra-resilience-2026-05-16.md`](../audit/v-f3-legacy-infra-resilience-2026-05-16.md) — V-F3 review
  - F1-* dependency risk matrix + 7 hardening recommendations
  - **Need from กอต:** confirm legacy retirement target date (recommend week 8-12 post-launch)

### 3.4 K-sec-4 pen test plan (~10 นาที)
- 🆕 [`docs/audit/pen-test-plan-2026-05-16.md`](../audit/pen-test-plan-2026-05-16.md)
- Scope · 5 Thai vendor candidates · timeline 17 weeks · budget ฿150-250k
- **Recommend Aiwen Tech** (~฿150-200k mid-tier) เริ่ม T+30d post-launch
- **Need from กอต:** confirm vendor pick + budget tier

### 3.5 D-7 payment gateway matrix (~10 นาที)
- 🆕 [`docs/decisions/d7-payment-gateway-decision-matrix.md`](../decisions/d7-payment-gateway-decision-matrix.md)
- 5 vendors × 13 criteria scored
- **Recommend Omise** (92/100 — best TH market coverage + DX)
- **Need from กอต:** confirm Omise + queue พี่ป๊อป call สำหรับ owner approval

### 3.6 R1-pick china-search matrix (~5 นาที)
- 🆕 [`docs/decisions/r1-pick-china-search-options-matrix.md`](../decisions/r1-pick-china-search-options-matrix.md)
- 6 options compared
- **Recommend defer to T+30d** + SaaS RFP if demand confirms
- **Need from กอต:** confirm defer (or push for earlier action)

### 3.7 CSP-1 nonce migration plan (~5 นาที)
- 🆕 [`docs/decisions/csp-nonce-migration-plan.md`](../decisions/csp-nonce-migration-plan.md)
- Full 4-phase execution plan + 7-risk register
- **Recommend ship week-2 post-launch** + Report-Only soft-launch first
- **Need from กอต:** confirm ship-week + report-uri choice (Sentry CSP Reports works once DV-1a live)

### 3.8 Renovate config (~10 นาที)
- 🆕 [`.github/renovate.json5`](../../.github/renovate.json5) — เดฟ wrote Pacred-specific config
- **Need from กอต:**
  1. ไป https://github.com/apps/renovate → Install (or "Configure")
  2. Grant access to `pacred-co/pacred-web` repo
  3. Merge the onboarding PR Renovate opens automatically
  4. หลังจากนั้น Renovate รัน Mon-morning weekly batch

### 3.9 V3 ADRs (~15-20 นาที — defer if not prioritising V3)
ผม wrote 3 DRAFTs ลำดับ V3 plan. **ถ้ากอตยังไม่อยากตัดสินใจ V3 ตอนนี้ → DEFER ไม่เป็นไร** (V2 launch สำคัญกว่า). ถ้าจะลุย:
- [`decisions/0011-erp-rbac-granular.md`](../decisions/0011-erp-rbac-granular.md) — RBAC granular (5 open Qs)
- [`decisions/0012-erp-frontend-shell.md`](../decisions/0012-erp-frontend-shell.md) — Same app vs `erp.pacred.co` (5 open Qs)
- [`decisions/0013-erp-v2-v3-migration-strategy.md`](../decisions/0013-erp-v2-v3-migration-strategy.md) — Strangler-fig migration (6 open Qs)

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

## 7. 🎯 Recommended order ทำงาน (ถ้ากอตอยากเรียง)

**คืนนี้ (Sat night → Sun morning):**
1. ~~ADR-0015 + ADR-0016 fastlane sign (5m)~~ ✅ DONE
2. Renovate GitHub App install (10m)
3. K-sec audits + V-F3 + K-sec-4 + D-7 + R1 + CSP-1 reads (45m)

**Sun afternoon:**
4. K-12 GTM signup (45m)
5. K-13 Clarity signup (30m)
6. DV-1a Sentry signup (30m)

**Sun evening:**
7. DV-1b Upstash + DV-1c hCaptcha signups (60m)
8. MOMO-1 call BBOY (if can schedule) — else Monday
9. T-G3 พี่ป๊อป call

**Mon morning before launch:**
10. Final review of dave state + ✅ tick พร้อม launch

**ทุก step ทำเสร็จ commit:** `chore(launch): ✅ <item>` แล้ว push ไป main เพื่อ trigger Vercel redeploy

---

**ขอบคุณกอต** — เดฟ + ภูม + ปอน เคลียร์ไว้ครบทุกอย่างที่เคลียร์ได้แล้ว. แค่ ~6-8h ของกอตคือเส้นสุดท้ายก่อน launch.

ถ้าติดอะไร โทรเดฟทันที. ✊
